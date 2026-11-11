import type { ID, ISO, Invoice, OrderStatus, Quote } from './types';
import type { DbState } from './state';
import { invoiceBalance, orderUninvoicedValue } from './finance';
import { OPEN_PO, poOutstanding, stockIndex } from './inventory';
import { addDays, dayKey, startOfDayKL } from '@/lib/dates';
import { marginPct, roundSen } from '@/lib/money';

export interface Range {
  from: ISO;
  to: ISO;
}

export type RangeKey = 'today' | '7d' | '30d' | '90d';

export function rangeFor(key: RangeKey, now: ISO): Range {
  const days = key === 'today' ? 0 : key === '7d' ? 6 : key === '30d' ? 29 : 89;
  return { from: startOfDayKL(addDays(now, -days)), to: now };
}

export function previousRange(r: Range): Range {
  const len = Date.parse(r.to) - Date.parse(r.from);
  return { from: new Date(Date.parse(r.from) - len - 1).toISOString(), to: new Date(Date.parse(r.from) - 1).toISOString() };
}

const inRange = (iso: ISO | undefined, r: Range) => !!iso && iso >= r.from && iso <= r.to;

export function invoicesIn(db: Pick<DbState, 'invoices'>, r: Range): Invoice[] {
  return Object.values(db.invoices).filter((i) => i.status !== 'void' && inRange(i.issueDate, r));
}

export function issuedAt(q: Quote): ISO | undefined {
  return q.versions.find((v) => v.issuedAt)?.issuedAt;
}

export interface Kpis {
  netSales: number;
  cogs: number;
  grossMarginPct: number;
  invoiceCount: number;
  pipelineValue: number;
  pipelineCount: number;
  quoteConversionPct: number;
  quotesIssued: number;
  quotesWon: number;
  openReceivables: number;
  overdueReceivables: number;
  purchaseCommitments: number;
  onTimePct: number;
  deliveriesCompleted: number;
}

export function computeKpis(db: DbState, r: Range, now: ISO): Kpis {
  const inv = invoicesIn(db, r);
  const netSales = inv.reduce((s, i) => s + i.subtotal, 0);
  const cogs = inv.reduce((s, i) => s + i.cost, 0);
  let pipelineValue = 0;
  let pipelineCount = 0;
  for (const o of Object.values(db.salesOrders)) {
    if (['cancelled', 'invoiced', 'closed'].includes(o.status)) continue;
    const v = orderUninvoicedValue(o);
    if (v <= 0) continue;
    pipelineValue += v;
    pipelineCount++;
  }
  let issued = 0;
  let won = 0;
  let decided = 0;
  for (const q of Object.values(db.quotes)) {
    const ia = issuedAt(q);
    if (!inRange(ia, r)) continue;
    issued++;
    if (q.status === 'accepted' || q.status === 'converted') {
      won++;
      decided++;
    } else if (q.status === 'rejected' || q.status === 'expired') decided++;
  }
  let openAR = 0;
  let overdue = 0;
  for (const i of Object.values(db.invoices)) {
    const b = invoiceBalance(i);
    if (b <= 0) continue;
    openAR += b;
    if (i.dueDate < now) overdue += b;
  }
  let commitments = 0;
  for (const po of Object.values(db.purchaseOrders)) {
    if (!OPEN_PO.includes(po.status)) continue;
    for (const l of po.lines) commitments += roundSen(poOutstanding(l) * l.unitCost);
  }
  let onTime = 0;
  let done = 0;
  for (const d of Object.values(db.deliveryOrders)) {
    if (!['delivered', 'collected'].includes(d.status) || !inRange(d.completedAt, r)) continue;
    done++;
    if (dayKey(d.completedAt!) <= dayKey(d.promisedDate)) onTime++;
  }
  return {
    netSales,
    cogs,
    grossMarginPct: marginPct(netSales, cogs),
    invoiceCount: inv.length,
    pipelineValue,
    pipelineCount,
    quoteConversionPct: decided ? (won / decided) * 100 : 0,
    quotesIssued: issued,
    quotesWon: won,
    openReceivables: openAR,
    overdueReceivables: overdue,
    purchaseCommitments: commitments,
    onTimePct: done ? (onTime / done) * 100 : 0,
    deliveriesCompleted: done,
  };
}

export interface SeriesPoint {
  key: string;
  label: string;
  sales: number;
  margin: number;
  marginPct: number;
  orders: number;
}

/** Daily series for ≤31 days, weekly otherwise. */
export function salesSeries(db: DbState, r: Range): SeriesPoint[] {
  const days = Math.max(1, Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000));
  const weekly = days > 31;
  const buckets = new Map<string, SeriesPoint>();
  const keyOf = (iso: ISO) => {
    if (!weekly) return dayKey(iso);
    const d = new Date(dayKey(iso));
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  };
  // pre-fill
  for (let t = Date.parse(r.from); t <= Date.parse(r.to); t += 86_400_000) {
    const k = keyOf(new Date(t).toISOString());
    if (!buckets.has(k)) buckets.set(k, { key: k, label: k, sales: 0, margin: 0, marginPct: 0, orders: 0 });
  }
  for (const i of invoicesIn(db, r)) {
    const k = keyOf(i.issueDate);
    const b = buckets.get(k);
    if (!b) continue;
    b.sales += i.subtotal;
    b.margin += i.subtotal - i.cost;
    b.orders += 1;
  }
  const fmt = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const firstFull = dayKey(r.from);
  return [...buckets.values()]
    .filter((b) => !weekly || b.key >= firstFull)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({ ...b, label: (weekly ? 'Wk ' : '') + fmt.format(new Date(b.key)), marginPct: marginPct(b.sales, b.sales - b.margin) }));
}

export interface CategoryMix {
  categoryId: ID;
  name: string;
  sales: number;
  margin: number;
  marginPct: number;
  share: number;
}

export function categoryMix(db: DbState, r: Range): CategoryMix[] {
  const acc: Record<ID, { sales: number; cost: number }> = {};
  for (const i of invoicesIn(db, r)) {
    for (const l of i.lines) {
      const cat = db.products[l.productId]?.categoryId ?? 'other';
      const a = (acc[cat] ||= { sales: 0, cost: 0 });
      a.sales += l.lineTotal;
      a.cost += roundSen(l.unitCost * l.qty);
    }
  }
  const total = Object.values(acc).reduce((s, a) => s + a.sales, 0) || 1;
  return Object.values(db.categories)
    .sort((a, b) => a.sort - b.sort)
    .map((c) => {
      const a = acc[c.id] ?? { sales: 0, cost: 0 };
      return { categoryId: c.id, name: c.name, sales: a.sales, margin: a.sales - a.cost, marginPct: marginPct(a.sales, a.cost), share: (a.sales / total) * 100 };
    });
}

/** Category margin trend: margin % per category for the last 30 days vs the 60 days before. */
export function categoryMarginTrend(db: DbState, now: ISO) {
  const recent = categoryMix(db, { from: addDays(now, -30), to: now });
  const prior = categoryMix(db, { from: addDays(now, -90), to: addDays(now, -30) });
  return recent.map((c) => {
    const p = prior.find((x) => x.categoryId === c.categoryId)!;
    return { categoryId: c.categoryId, name: c.name, recentPct: c.marginPct, priorPct: p.marginPct, delta: c.marginPct - p.marginPct, recentSales: c.sales };
  });
}

export function quoteFunnel(db: DbState, r: Range) {
  let created = 0, issued = 0, accepted = 0, converted = 0;
  for (const q of Object.values(db.quotes)) {
    if (!inRange(q.createdAt, r)) continue;
    created++;
    if (issuedAt(q)) issued++;
    if (q.status === 'accepted' || q.status === 'converted') accepted++;
    if (q.status === 'converted') converted++;
  }
  return [
    { stage: 'Created', value: created },
    { stage: 'Issued', value: issued },
    { stage: 'Accepted', value: accepted },
    { stage: 'Converted to order', value: converted },
  ];
}

export const ORDER_GROUPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: 'credit', label: 'Credit hold', statuses: ['pending_credit'] },
  { key: 'confirmed', label: 'To reserve', statuses: ['confirmed', 'partially_allocated'] },
  { key: 'allocated', label: 'To pick', statuses: ['allocated', 'picking'] },
  { key: 'ready', label: 'Packed / staged', statuses: ['ready'] },
  { key: 'transit', label: 'Dispatched', statuses: ['partially_dispatched', 'dispatched'] },
  { key: 'delivered', label: 'Delivered (to invoice)', statuses: ['delivered'] },
];

export function ordersByStage(db: DbState) {
  return ORDER_GROUPS.map((g) => {
    const list = Object.values(db.salesOrders).filter((o) => g.statuses.includes(o.status));
    return { ...g, count: list.length, value: list.reduce((s, o) => s + orderUninvoicedValue(o), 0) };
  });
}

/** Category × week average supplier cost change (%) from cost proposals. */
export function costHeatmap(db: DbState, now: ISO, weeks = 10) {
  const start = startOfDayKL(addDays(now, -weeks * 7 + 1));
  const cols = Array.from({ length: weeks }, (_, i) => addDays(start, i * 7));
  const cats = Object.values(db.categories).sort((a, b) => a.sort - b.sort);
  const cells: { categoryId: ID; category: string; week: number; weekStart: ISO; avgPct: number; count: number }[] = [];
  const acc = new Map<string, { sum: number; n: number }>();
  for (const ch of Object.values(db.priceChanges)) {
    if (ch.createdAt < start || ch.source === 'manual' || ch.source === 'rollback' || ch.oldCost === ch.newCost) continue;
    const w = Math.floor((Date.parse(ch.createdAt) - Date.parse(start)) / (7 * 86_400_000));
    if (w < 0 || w >= weeks) continue;
    const cat = db.products[ch.productId]?.categoryId;
    if (!cat) continue;
    const k = `${cat}|${w}`;
    const a = acc.get(k) ?? { sum: 0, n: 0 };
    a.sum += ((ch.newCost - ch.oldCost) / ch.oldCost) * 100;
    a.n++;
    acc.set(k, a);
  }
  for (const c of cats) {
    cols.forEach((ws, w) => {
      const a = acc.get(`${c.id}|${w}`);
      cells.push({ categoryId: c.id, category: c.name, week: w, weekStart: ws, avgPct: a ? a.sum / a.n : 0, count: a?.n ?? 0 });
    });
  }
  return { cats, cols, cells };
}

export function pricingExposure(db: DbState, now: ISO) {
  const today = dayKey(now);
  let costUpdatesToday = 0;
  for (const cv of Object.values(db.costVersions)) if (cv.source !== 'seed' && dayKey(cv.createdAt) === today) costUpdatesToday++;
  const pending = Object.values(db.priceChanges).filter((c) => c.status === 'pending');
  let quotesNeedingReview = 0;
  let marginAtRisk = 0;
  for (const q of Object.values(db.quotes)) {
    if (!['draft', 'pending_approval', 'approved', 'issued'].includes(q.status)) continue;
    if (q.recheck && q.status !== 'issued') quotesNeedingReview++;
    const v = q.versions[q.currentVersion - 1];
    for (const l of v.lines) {
      const p = db.products[l.productId];
      if (!p) continue;
      const nowCost = p.latestCost * l.factor;
      if (nowCost > l.unitCost) marginAtRisk += roundSen((nowCost - l.unitCost) * l.qty);
    }
  }
  return { costUpdatesToday, pendingPriceChanges: pending.length, quotesNeedingReview, marginAtRisk };
}

export function lowStock(db: DbState) {
  const idx = stockIndex(db);
  return Object.values(db.products)
    .filter((p) => p.status === 'active')
    .map((p) => ({ p, s: idx[p.id] ?? { onHand: 0, available: 0, incoming: 0, reserved: 0, blocked: 0, staged: 0 } }))
    .filter(({ p, s }) => s.available + s.incoming < p.reorderPoint || s.available <= 0)
    .sort((a, b) => a.s.available / Math.max(1, a.p.reorderPoint) - b.s.available / Math.max(1, b.p.reorderPoint));
}
