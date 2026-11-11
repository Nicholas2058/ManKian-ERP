import type { ID, ISO } from './types';
import type { DbState } from './state';
import { invoiceBalance } from './finance';
import { OPEN_PO, poOutstanding, stockIndex } from './inventory';
import { productPriceStatus, resolveRule } from './pricing';
import { categoryMarginTrend } from './kpis';
import { daysOverdue } from '@/lib/dates';
import { formatPct, formatRM, marginPct, pctChange } from '@/lib/money';

/**
 * Operations Insights — deterministic, transparent business rules (NOT AI).
 * Each insight carries the rule that produced it so users can audit the logic.
 */
export interface Insight {
  id: string;
  rule: string;
  severity: 'critical' | 'warning' | 'info';
  area: 'pricing' | 'sales' | 'stock' | 'procurement' | 'finance' | 'delivery';
  title: string;
  detail: string;
  link: string;
  action: string;
  refId?: ID;
}

export const INSIGHT_RULES = [
  { key: 'cost_jump', text: 'Supplier cost increased more than 8% and a price proposal is pending' },
  { key: 'below_floor', text: 'Approved list price margin is below the category minimum margin at the latest supplier cost' },
  { key: 'quote_expiring', text: 'Issued quotation expires within 24 hours and is not yet accepted' },
  { key: 'recheck', text: 'Draft/pending quotation contains a SKU whose cost or price changed after it was priced' },
  { key: 'reorder', text: 'Available + incoming stock is below the reorder point' },
  { key: 'order_late', text: 'Sales order is past its required date and not fully dispatched' },
  { key: 'reservation_expired', text: 'Active stock reservation is past its hold expiry date' },
  { key: 'po_late', text: 'Purchase order is past its expected date with quantity still outstanding' },
  { key: 'overdue', text: 'Invoice is more than 30 days overdue' },
  { key: 'category_margin', text: 'Category gross margin in the last 30 days fell more than 1.5 points versus the prior 60 days' },
  { key: 'credit_hold', text: 'Sales order is waiting for a credit-limit override' },
] as const;

export function computeInsights(db: DbState, now: ISO): Insight[] {
  const out: Insight[] = [];
  const stock = stockIndex(db);

  for (const ch of Object.values(db.priceChanges)) {
    if (ch.status !== 'pending') continue;
    const pct = pctChange(ch.oldCost, ch.newCost);
    if (pct <= 8) continue;
    const p = db.products[ch.productId];
    out.push({
      id: `cost_jump_${ch.id}`, rule: 'cost_jump', severity: 'critical', area: 'pricing',
      title: `${p?.sku} supplier cost ${formatPct(pct, 1, true)}`,
      detail: `${p?.name}: ${formatRM(ch.oldCost)} → ${formatRM(ch.newCost)}. Proposed list price ${formatRM(ch.proposedPrice)} awaits approval.`,
      link: `/pricing?sku=${ch.productId}`, action: 'Review price', refId: ch.id,
    });
  }
  for (const p of Object.values(db.products)) {
    if (p.status !== 'active') continue;
    if (productPriceStatus(db, p) !== 'below_margin') continue;
    const rule = resolveRule(db, p);
    out.push({
      id: `below_floor_${p.id}`, rule: 'below_floor', severity: 'warning', area: 'pricing',
      title: `${p.sku} list margin below ${rule.minMarginPct}% floor`,
      detail: `List ${formatRM(p.basePrice)} vs latest cost ${formatRM(p.latestCost)} → margin ${formatPct(marginPct(p.basePrice, p.latestCost))}.`,
      link: `/pricing?sku=${p.id}`, action: 'Adjust price', refId: p.id,
    });
  }
  for (const q of Object.values(db.quotes)) {
    const v = q.versions[q.currentVersion - 1];
    if (q.status === 'issued' && v.expiresAt) {
      const hrs = (Date.parse(v.expiresAt) - Date.parse(now)) / 3_600_000;
      if (hrs >= 0 && hrs <= 24)
        out.push({
          id: `quote_expiring_${q.id}`, rule: 'quote_expiring', severity: 'warning', area: 'sales',
          title: `${q.number} expires in ${Math.max(1, Math.round(hrs))}h`,
          detail: `${db.customers[q.customerId]?.name} · ${formatRM(v.totals.total)}. Follow up before validity lapses.`,
          link: `/quotes/${q.id}`, action: 'Follow up', refId: q.id,
        });
    }
    if (q.recheck && ['draft', 'pending_approval', 'approved'].includes(q.status))
      out.push({
        id: `recheck_${q.id}`, rule: 'recheck', severity: q.recheck.kind === 'cost_increase' ? 'warning' : 'info', area: 'sales',
        title: `${q.number} needs recheck`,
        detail: q.recheck.reason,
        link: `/quotes/${q.id}`, action: 'Reprice', refId: q.id,
      });
  }
  for (const p of Object.values(db.products)) {
    const s = stock[p.id];
    if (!s || p.status !== 'active') continue;
    if (s.available + s.incoming < p.reorderPoint) {
      const bo = Object.values(db.backorders).filter((b) => b.productId === p.id && b.status === 'open').reduce((t, b) => t + b.qty, 0);
      out.push({
        id: `reorder_${p.id}`, rule: 'reorder', severity: bo > 0 || s.available <= 0 ? 'critical' : 'warning', area: 'stock',
        title: `${p.sku} below reorder point`,
        detail: `Available ${s.available} + incoming ${s.incoming} < ROP ${p.reorderPoint} ${p.baseUom}${bo ? ` · ${bo} on backorder` : ''}.`,
        link: `/procurement?tab=requisitions&product=${p.id}`, action: 'Create requisition', refId: p.id,
      });
    }
  }
  for (const o of Object.values(db.salesOrders)) {
    if (['cancelled', 'invoiced', 'delivered', 'dispatched', 'closed'].includes(o.status)) continue;
    if (o.status === 'pending_credit') {
      out.push({ id: `credit_${o.id}`, rule: 'credit_hold', severity: 'critical', area: 'finance', title: `${o.number} on credit hold`, detail: `${db.customers[o.customerId]?.name}: needs Finance/Owner override before reservation.`, link: '/approvals', action: 'Review', refId: o.id });
      continue;
    }
    if (o.requiredDate < now) {
      out.push({ id: `order_late_${o.id}`, rule: 'order_late', severity: 'warning', area: 'delivery', title: `${o.number} past required date`, detail: `${db.customers[o.customerId]?.name} · required ${o.requiredDate.slice(0, 10)} · status ${o.status.replace('_', ' ')}.`, link: `/orders?id=${o.id}`, action: 'Open order', refId: o.id });
    }
  }
  for (const r of Object.values(db.reservations)) {
    if (r.status !== 'active' || !r.expiresAt || r.expiresAt >= now) continue;
    const o = db.salesOrders[r.orderId];
    out.push({ id: `res_exp_${r.id}`, rule: 'reservation_expired', severity: 'info', area: 'stock', title: `Reservation hold expired · ${o?.number}`, detail: `${r.qty} ${db.products[r.productId]?.baseUom} of ${db.products[r.productId]?.sku} held since ${r.createdAt.slice(0, 10)}.`, link: `/orders?id=${r.orderId}`, action: 'Release or extend', refId: r.id });
  }
  for (const po of Object.values(db.purchaseOrders)) {
    if (!OPEN_PO.includes(po.status) || po.expectedAt >= now) continue;
    const out2 = po.lines.reduce((s, l) => s + poOutstanding(l), 0);
    if (!out2) continue;
    out.push({ id: `po_late_${po.id}`, rule: 'po_late', severity: 'warning', area: 'procurement', title: `${po.number} overdue by ${daysOverdue(po.expectedAt, now)}d`, detail: `${db.suppliers[po.supplierId]?.name}: ${out2} units outstanding. ${po.notes ?? ''}`, link: `/procurement?tab=pos&id=${po.id}`, action: 'Chase supplier', refId: po.id });
  }
  for (const inv of Object.values(db.invoices)) {
    const bal = invoiceBalance(inv);
    if (bal <= 0) continue;
    const od = daysOverdue(inv.dueDate, now);
    if (od <= 30) continue;
    out.push({ id: `overdue_${inv.id}`, rule: 'overdue', severity: od > 60 ? 'critical' : 'warning', area: 'finance', title: `${inv.number} ${od} days overdue`, detail: `${db.customers[inv.customerId]?.name} · balance ${formatRM(bal)}.`, link: `/finance?tab=receivables&customer=${inv.customerId}`, action: 'Draft reminder', refId: inv.id });
  }
  for (const c of categoryMarginTrend(db, now)) {
    if (c.recentSales <= 0 || c.delta > -1.5) continue;
    out.push({ id: `cat_margin_${c.categoryId}`, rule: 'category_margin', severity: 'warning', area: 'pricing', title: `${c.name} margin down ${Math.abs(c.delta).toFixed(1)} pts`, detail: `Last 30 days ${formatPct(c.recentPct)} vs prior 60 days ${formatPct(c.priorPct)}. Check cost pass-through and discounts.`, link: `/analytics?category=${c.categoryId}`, action: 'Analyse', refId: c.categoryId });
  }
  const sev = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => sev[a.severity] - sev[b.severity]);
}
