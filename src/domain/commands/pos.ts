import type { CustomerTier, ID, PosLine, PosSale, Sen } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { lineIssues, resolveRule } from '../pricing';
import { pickableBins, productStock } from '../inventory';
import { round4 } from '../uom';
import { addDays } from '@/lib/dates';
import { formatRM, lineTotal, roundSen } from '@/lib/money';
import { audit, movement, must, nextNumber, requirePerm, takeBinStock, uid } from './helpers';
import { closeApproval, createApproval } from './approvalBase';
import { createQuote } from './sales';
import { recordPayment } from './finance';

export function posTotal(lines: PosLine[]): Sen {
  return lines.reduce((s, l) => s + lineTotal(l.unitPrice, l.qty, l.discountPct), 0);
}

function issuesFor(db: DbState, lines: PosLine[]) {
  return lines.flatMap((l) => {
    const p = db.products[l.productId];
    return p ? lineIssues({ ...l, priceSource: l.unitPrice !== l.listPrice ? 'manual' : 'tier' }, resolveRule(db, p), db.config) : [];
  }).filter((i) => i.needsApproval);
}

export function holdPosSale(db: DbState, ctx: Ctx, a: { saleId?: ID; tier: CustomerTier; customerId?: ID; lines: PosLine[]; label?: string }) {
  requirePerm(ctx, 'pos.sell');
  if (!a.lines.length) throw new DomainError('Cart is empty.', 'validation');
  const id = a.saleId && db.posSales[a.saleId] ? a.saleId : uid(db, 'ps');
  const prev = db.posSales[id];
  db.posSales[id] = {
    id,
    number: prev?.number ?? nextNumber(db, 'POS', ctx.now),
    status: 'held',
    tier: a.tier,
    customerId: a.customerId,
    lines: a.lines,
    total: posTotal(a.lines),
    at: ctx.now,
    heldLabel: a.label ?? prev?.heldLabel ?? `Held ${ctx.now.slice(11, 16)}`,
    cashier: ctx.actor.name,
  };
  return db.posSales[id];
}

/** Ask a manager to approve a counter discount. Returns the held sale + approval. */
export function requestPosApproval(db: DbState, ctx: Ctx, a: { saleId?: ID; tier: CustomerTier; customerId?: ID; lines: PosLine[] }) {
  const sale = holdPosSale(db, ctx, { ...a, label: 'Awaiting discount approval' });
  const issues = issuesFor(db, a.lines);
  if (!issues.length) throw new DomainError('No approval needed — discounts are within policy.', 'state');
  const ap = createApproval(db, ctx, {
    type: 'pos_discount',
    refType: 'pos',
    refId: sale.id,
    refNumber: sale.number,
    title: `Counter discount · ${sale.number}`,
    detail: issues.map((i) => `${db.products[i.productId]?.sku}: ${i.message}`).join(' '),
    amount: sale.total,
    requiredRoles: ['sales_manager', 'owner'],
    severity: 'warning',
  });
  return { sale, approval: ap };
}

export function decidePosDiscount(db: DbState, ctx: Ctx, a: { approvalId: ID; approve: boolean; note?: string }) {
  requirePerm(ctx, 'pos.discount.approve');
  const ap = must(db.approvals[a.approvalId], 'Approval');
  closeApproval(db, ctx, ap.id, a.approve ? 'approved' : 'rejected', a.note);
  const sale = db.posSales[ap.refId];
  if (sale) sale.heldLabel = a.approve ? 'Discount approved — ready to complete' : 'Discount rejected — adjust prices';
  audit(db, ctx, { action: a.approve ? 'pos.discount_approved' : 'pos.discount_rejected', entityType: 'pos', entityId: ap.refId, entityRef: ap.refNumber, summary: `Counter discount ${a.approve ? 'approved' : 'rejected'} on ${ap.refNumber}`, reason: a.note });
}

export function completePosSale(
  db: DbState,
  ctx: Ctx,
  a: { saleId?: ID; tier: CustomerTier; customerId?: ID; lines: PosLine[]; payMethod: NonNullable<PosSale['payMethod']>; tendered: Sen },
): PosSale {
  requirePerm(ctx, 'pos.sell');
  if (!a.lines.length) throw new DomainError('Cart is empty.', 'validation');
  const existing = a.saleId ? db.posSales[a.saleId] : undefined;
  if (existing?.status === 'completed') return existing; // idempotent — no double sale on repeated clicks
  const issues = issuesFor(db, a.lines);
  if (issues.length) {
    const approved = existing && Object.values(db.approvals).some((x) => x.refId === existing.id && x.type === 'pos_discount' && x.status === 'approved');
    if (!approved) throw new DomainError(`Manager approval required: ${issues[0].message}`, 'approval');
  }
  const total = posTotal(a.lines);
  if (a.payMethod === 'cash' && a.tendered < total) throw new DomainError(`Cash tendered ${formatRM(a.tendered)} is less than total ${formatRM(total)}.`, 'validation');
  // Stock check across all lines before mutating anything.
  for (const l of a.lines) {
    const st = productStock(db, l.productId);
    const need = round4(l.qty * l.factor);
    if (st.available < need - 1e-9) throw new DomainError(`${db.products[l.productId]?.sku}: only ${st.available} ${db.products[l.productId]?.baseUom} available at the counter.`, 'stock');
  }
  const id = existing?.id ?? uid(db, 'ps');
  const number = existing?.number ?? nextNumber(db, 'POS', ctx.now);
  for (const l of a.lines) {
    let need = round4(l.qty * l.factor);
    for (const b of pickableBins(db, l.productId)) {
      if (need <= 0) break;
      const t = round4(Math.min(b.qty, need));
      takeBinStock(db, { productId: l.productId, binId: b.binId, qty: t });
      movement(db, ctx, { productId: l.productId, type: 'pos_sale', qty: -t, moved: t, fromBinId: b.binId, refType: 'pos', refId: id, refNumber: number });
      need = round4(need - t);
    }
  }
  // Counter sale invoice (cash sale), paid immediately.
  const walkIn = a.customerId ?? Object.values(db.customers).find((c) => c.type === 'walkin')?.id;
  if (!walkIn) throw new DomainError('No walk-in customer account configured.', 'config');
  const ivId = uid(db, 'iv');
  const lines = a.lines.map((l) => ({
    id: uid(db, 'il'),
    productId: l.productId,
    description: db.products[l.productId]?.name ?? '',
    qty: l.qty,
    uom: l.uom,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    unitCost: l.unitCost,
    lineTotal: lineTotal(l.unitPrice, l.qty, l.discountPct),
  }));
  const tax = db.config.tax.enabled ? roundSen((total * db.config.tax.ratePct) / 100) : 0;
  db.invoices[ivId] = {
    id: ivId,
    number: nextNumber(db, 'CS', ctx.now),
    customerId: walkIn,
    posSaleId: id,
    issueDate: ctx.now,
    dueDate: ctx.now,
    lines,
    subtotal: total,
    freight: 0,
    taxLabel: db.config.tax.label,
    taxRatePct: db.config.tax.enabled ? db.config.tax.ratePct : 0,
    tax,
    total: total + tax,
    cost: lines.reduce((s, l) => s + roundSen(l.unitCost * l.qty), 0),
    paid: 0,
    credited: 0,
    status: 'issued',
    reminders: [],
  };
  recordPayment(db, ctx, { customerId: walkIn, amount: total + tax, method: a.payMethod, reference: `${number} counter`, allocations: [{ invoiceId: ivId, amount: total + tax }], skipPerm: true });
  db.posSales[id] = {
    id,
    number,
    status: 'completed',
    tier: a.tier,
    customerId: a.customerId,
    lines: a.lines,
    payMethod: a.payMethod,
    tendered: a.tendered,
    total: total + tax,
    at: ctx.now,
    cashier: ctx.actor.name,
    invoiceId: ivId,
  };
  audit(db, ctx, { action: 'pos.completed', entityType: 'pos', entityId: id, entityRef: number, summary: `Counter sale ${number} ${formatRM(total + tax)} (${a.payMethod}, simulated payment)` });
  return db.posSales[id];
}

export function convertPosToQuote(db: DbState, ctx: Ctx, a: { saleId?: ID; customerId: ID; lines: PosLine[] }) {
  const q = createQuote(db, ctx, {
    customerId: a.customerId,
    fulfilment: 'pickup',
    validityDays: 0,
    lines: a.lines.map((l) => ({ productId: l.productId, qty: l.qty, uom: l.uom, discountPct: l.discountPct, unitPrice: l.unitPrice !== l.listPrice ? l.unitPrice : undefined })),
    notes: 'Converted from counter sale for price approval',
  });
  if (a.saleId && db.posSales[a.saleId]) {
    db.posSales[a.saleId].status = 'converted';
    db.posSales[a.saleId].quoteId = q.id;
  }
  return q;
}

export function discardHeldSale(db: DbState, _ctx: Ctx, a: { saleId: ID }) {
  const s = db.posSales[a.saleId];
  if (s && s.status === 'held') delete db.posSales[a.saleId];
}

export { addDays };
