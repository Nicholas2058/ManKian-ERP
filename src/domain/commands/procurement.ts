import type { GoodsReceipt, ID, ISO, POLine, PurchaseOrder, PurchaseRequisition, Sen, SupplierQuote } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { quarantineBinId } from '../inventory';
import { round4 } from '../uom';
import { addDays } from '@/lib/dates';
import { formatRM, pctChange, roundSen } from '@/lib/money';
import { addBinStock, audit, movement, must, nextNumber, notify, requirePerm, uid } from './helpers';
import { proposeCostChangeInternal } from './pricing';
import { allocateBackorders } from './sales';

export function createRequisition(
  db: DbState,
  ctx: Ctx,
  a: { lines: { productId: ID; qty: number }[]; reason: string; sourceType: PurchaseRequisition['sourceType']; sourceRef?: ID; neededBy?: ISO },
) {
  requirePerm(ctx, 'po.manage');
  const lines = a.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new DomainError('Requisition needs at least one line with quantity.', 'validation');
  const id = uid(db, 'pq');
  const r: PurchaseRequisition = {
    id,
    number: nextNumber(db, 'PR', ctx.now),
    lines: lines.map((l) => ({ id: uid(db, 'pql'), productId: l.productId, qty: round4(l.qty) })),
    reason: a.reason,
    sourceType: a.sourceType,
    sourceRef: a.sourceRef,
    status: 'open',
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
    neededBy: a.neededBy ?? addDays(ctx.now, 5),
    supplierQuoteIds: [],
  };
  db.requisitions[id] = r;
  audit(db, ctx, { action: 'requisition.created', entityType: 'requisition', entityId: id, entityRef: r.number, summary: `${r.number}: ${lines.length} line(s) — ${a.reason}` });
  return r;
}

/** Deterministic pseudo-random in [0,1) from a string, for simulated supplier responses. */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Simulate RFQs to up to 3 suppliers who list these products. Clearly labelled simulated. */
export function requestSupplierQuotes(db: DbState, ctx: Ctx, a: { requisitionId: ID }) {
  requirePerm(ctx, 'po.manage');
  const r = must(db.requisitions[a.requisitionId], 'Requisition');
  if (r.status === 'ordered' || r.status === 'cancelled') throw new DomainError(`${r.number} is ${r.status}.`, 'state');
  if (r.supplierQuoteIds.length) return r.supplierQuoteIds.map((id) => db.supplierQuotes[id]);
  const supplierIds = new Set<ID>();
  for (const l of r.lines) {
    for (const sp of Object.values(db.supplierProducts)) if (sp.productId === l.productId) supplierIds.add(sp.supplierId);
  }
  const ranked = [...supplierIds].sort((x, y) => (db.suppliers[y]?.onTimePct ?? 0) - (db.suppliers[x]?.onTimePct ?? 0)).slice(0, 3);
  if (!ranked.length) throw new DomainError('No supplier is linked to these products. Add supplier sourcing in the catalog.', 'validation');
  const quotes: SupplierQuote[] = [];
  for (const sid of ranked) {
    const s = db.suppliers[sid];
    const lines = r.lines.map((l) => {
      const sp = Object.values(db.supplierProducts).find((x) => x.supplierId === sid && x.productId === l.productId);
      const p = db.products[l.productId];
      const h = hash01(`${r.id}${sid}${l.productId}`);
      const base = sp?.cost ?? p.latestCost;
      const unitCost = roundSen(base * (0.96 + h * 0.1));
      return {
        productId: l.productId,
        unitCost,
        moq: sp?.moq ?? Math.max(1, Math.round(l.qty / 2)),
        leadTimeDays: Math.max(1, (sp?.leadTimeDays ?? s.leadTimeDays) + Math.round(h * 4) - 1),
        availableQty: sp ? Math.round(sp.availableQty * (0.5 + h)) : Math.round(l.qty * (0.6 + h)),
        specCompliant: h > 0.12,
        note: h <= 0.12 ? 'Offered alternative grade — check spec' : undefined,
      };
    });
    const id = uid(db, 'sq');
    const q: SupplierQuote = { id, number: nextNumber(db, 'SQ', ctx.now), requisitionId: r.id, supplierId: sid, lines, validUntil: addDays(ctx.now, 7), receivedAt: ctx.now, status: 'received', simulated: true };
    db.supplierQuotes[id] = q;
    quotes.push(q);
  }
  r.supplierQuoteIds = quotes.map((q) => q.id);
  r.status = 'quoting';
  audit(db, ctx, { action: 'requisition.quotes_requested', entityType: 'requisition', entityId: r.id, entityRef: r.number, summary: `${quotes.length} simulated supplier quotations received for ${r.number}` });
  return quotes;
}

export function createPurchaseOrder(
  db: DbState,
  ctx: Ctx,
  a: { supplierId: ID; lines: { productId: ID; qty: number; unitCost: Sen }[]; expectedAt?: ISO; notes?: string; requisitionId?: ID; freight?: Sen },
): PurchaseOrder {
  requirePerm(ctx, 'po.manage');
  const s = must(db.suppliers[a.supplierId], 'Supplier');
  if (!a.lines.length) throw new DomainError('PO needs at least one line.', 'validation');
  for (const l of a.lines) {
    if (!(l.qty > 0)) throw new DomainError('PO quantities must be greater than zero.', 'validation');
    if (!(l.unitCost > 0)) throw new DomainError('PO unit costs must be greater than zero.', 'validation');
  }
  const id = uid(db, 'po');
  const lines: POLine[] = a.lines.map((l) => ({ id: uid(db, 'pol'), productId: l.productId, qty: round4(l.qty), unitCost: l.unitCost, received: 0, damaged: 0 }));
  const po: PurchaseOrder = {
    id,
    number: nextNumber(db, 'PO', ctx.now),
    supplierId: s.id,
    requisitionId: a.requisitionId,
    status: 'draft',
    lines,
    createdAt: ctx.now,
    expectedAt: a.expectedAt ?? addDays(ctx.now, s.leadTimeDays),
    freight: a.freight ?? 0,
    notes: a.notes,
    createdBy: ctx.actor.name,
    grnIds: [],
  };
  db.purchaseOrders[id] = po;
  audit(db, ctx, { action: 'po.created', entityType: 'po', entityId: id, entityRef: po.number, summary: `Draft ${po.number} to ${s.name}: ${formatRM(poValue(po))}` });
  return po;
}

export function poValue(po: Pick<PurchaseOrder, 'lines' | 'freight'>): Sen {
  return po.lines.reduce((s, l) => s + roundSen(l.qty * l.unitCost), 0) + po.freight;
}

export function selectSupplierQuote(db: DbState, ctx: Ctx, a: { requisitionId: ID; supplierQuoteId: ID }) {
  requirePerm(ctx, 'po.manage');
  const r = must(db.requisitions[a.requisitionId], 'Requisition');
  if (r.poId && db.purchaseOrders[r.poId]) return db.purchaseOrders[r.poId];
  const q = must(db.supplierQuotes[a.supplierQuoteId], 'Supplier quotation');
  const s = must(db.suppliers[q.supplierId], 'Supplier');
  for (const id of r.supplierQuoteIds) {
    const x = db.supplierQuotes[id];
    if (x) x.status = id === q.id ? 'selected' : 'declined';
  }
  const lead = Math.max(...q.lines.map((l) => l.leadTimeDays));
  const po = createPurchaseOrder(db, ctx, {
    supplierId: s.id,
    requisitionId: r.id,
    expectedAt: addDays(ctx.now, lead),
    notes: `From ${r.number} / ${q.number} (simulated supplier quotation)`,
    lines: r.lines.map((l) => {
      const ql = q.lines.find((x) => x.productId === l.productId)!;
      return { productId: l.productId, qty: Math.max(l.qty, ql.moq), unitCost: ql.unitCost };
    }),
  });
  r.selectedQuoteId = q.id;
  r.poId = po.id;
  r.status = 'ordered';
  for (const b of Object.values(db.backorders)) if (b.status === 'open' && r.lines.some((l) => l.productId === b.productId) && !b.poId) b.poId = po.id;
  audit(db, ctx, { action: 'requisition.supplier_selected', entityType: 'requisition', entityId: r.id, entityRef: r.number, summary: `${s.name} selected (${q.number}); ${po.number} drafted` });
  return po;
}

export function sendPO(db: DbState, ctx: Ctx, a: { poId: ID }) {
  requirePerm(ctx, 'po.manage');
  const po = must(db.purchaseOrders[a.poId], 'PO');
  if (po.status !== 'draft') throw new DomainError(`${po.number} is already ${po.status}.`, 'state');
  po.status = 'sent';
  po.orderedAt = ctx.now;
  audit(db, ctx, { action: 'po.sent', entityType: 'po', entityId: po.id, entityRef: po.number, summary: `${po.number} sent to ${db.suppliers[po.supplierId]?.name} (simulated — no email sent)` });
}

export function acknowledgePO(db: DbState, ctx: Ctx, a: { poId: ID; expectedAt?: ISO }) {
  requirePerm(ctx, 'po.manage');
  const po = must(db.purchaseOrders[a.poId], 'PO');
  if (po.status !== 'sent') throw new DomainError(`${po.number} is ${po.status}.`, 'state');
  po.status = 'acknowledged';
  po.acknowledgedAt = ctx.now;
  if (a.expectedAt) po.expectedAt = a.expectedAt;
  audit(db, ctx, { action: 'po.acknowledged', entityType: 'po', entityId: po.id, entityRef: po.number, summary: `${po.number} acknowledged; ETA ${po.expectedAt.slice(0, 10)}` });
}

export function delayPO(db: DbState, ctx: Ctx, a: { poId: ID; expectedAt: ISO; reason: string }) {
  requirePerm(ctx, 'po.manage');
  const po = must(db.purchaseOrders[a.poId], 'PO');
  const prev = po.expectedAt;
  po.expectedAt = a.expectedAt;
  po.delayReason = a.reason;
  for (const b of Object.values(db.backorders)) if (b.poId === po.id && b.status === 'open') b.promisedDate = addDays(a.expectedAt, 1);
  audit(db, ctx, { action: 'po.delayed', entityType: 'po', entityId: po.id, entityRef: po.number, summary: `${po.number} ETA ${prev.slice(0, 10)} → ${a.expectedAt.slice(0, 10)}`, reason: a.reason });
  notify(db, ctx, { kind: 'procurement', severity: 'warning', title: `PO delayed · ${po.number}`, body: a.reason, link: `/procurement?tab=pos&id=${po.id}` });
}

export function cancelPO(db: DbState, ctx: Ctx, a: { poId: ID; reason: string }) {
  requirePerm(ctx, 'po.manage');
  const po = must(db.purchaseOrders[a.poId], 'PO');
  if (po.lines.some((l) => l.received > 0 || l.damaged > 0)) throw new DomainError(`${po.number} has receipts. Short-close it instead.`, 'state');
  po.status = 'cancelled';
  po.closedAt = ctx.now;
  for (const b of Object.values(db.backorders)) if (b.poId === po.id) b.poId = undefined;
  audit(db, ctx, { action: 'po.cancelled', entityType: 'po', entityId: po.id, entityRef: po.number, summary: `${po.number} cancelled`, reason: a.reason });
}

export function closePO(db: DbState, ctx: Ctx, a: { poId: ID; reason: string }) {
  requirePerm(ctx, 'po.manage');
  const po = must(db.purchaseOrders[a.poId], 'PO');
  if (!['partial', 'received', 'acknowledged', 'sent'].includes(po.status)) throw new DomainError(`${po.number} is ${po.status}.`, 'state');
  po.status = 'closed';
  po.closedAt = ctx.now;
  audit(db, ctx, { action: 'po.closed', entityType: 'po', entityId: po.id, entityRef: po.number, summary: `${po.number} closed (balance short-closed)`, reason: a.reason });
}

/**
 * Goods receipt (GRN). Increases on-hand stock into bins (damaged → quarantine),
 * proposes cost versions when PO cost differs (never overwrites approved prices or
 * issued quotes) and optionally allocates open backorders FIFO.
 */
export function receiveGoods(
  db: DbState,
  ctx: Ctx,
  a: { poId: ID; lines: { poLineId: ID; qty: number; damaged?: number; binId: ID }[]; note?: string; allocateBackorders?: boolean; proposeCost?: boolean },
): GoodsReceipt {
  requirePerm(ctx, 'grn.receive');
  const po = must(db.purchaseOrders[a.poId], 'PO');
  if (!['sent', 'acknowledged', 'partial'].includes(po.status)) throw new DomainError(`${po.number} is ${po.status}; only sent/acknowledged POs can be received.`, 'state');
  const recLines = a.lines.filter((l) => l.qty > 0 || (l.damaged ?? 0) > 0);
  if (!recLines.length) throw new DomainError('Enter a received quantity for at least one line.', 'validation');
  const id = uid(db, 'gr');
  const number = nextNumber(db, 'GRN', ctx.now);
  const qBin = quarantineBinId(db);
  const grn: GoodsReceipt = { id, number, poId: po.id, supplierId: po.supplierId, receivedAt: ctx.now, receivedBy: ctx.actor.name, lines: [], note: a.note, costChangeIds: [], allocations: [] };
  for (const rl of recLines) {
    const pl = must(po.lines.find((l) => l.id === rl.poLineId), 'PO line');
    const dmg = rl.damaged ?? 0;
    const outstanding = round4(pl.qty - pl.received - pl.damaged);
    if (rl.qty + dmg > outstanding + 1e-9) throw new DomainError(`${db.products[pl.productId]?.sku}: receiving ${rl.qty + dmg} exceeds outstanding ${outstanding}. Over-receipts need a PO amendment.`, 'validation');
    const bin = must(db.bins[rl.binId], 'Bin');
    if (rl.qty > 0) {
      addBinStock(db, { productId: pl.productId, binId: bin.id, qty: rl.qty, at: ctx.now, lot: number });
      pl.received = round4(pl.received + rl.qty);
      movement(db, ctx, { productId: pl.productId, type: 'receipt', qty: rl.qty, moved: rl.qty, toBinId: bin.id, refType: 'grn', refId: id, refNumber: number, reason: `${po.number}` });
    }
    if (dmg > 0) {
      addBinStock(db, { productId: pl.productId, binId: qBin, qty: dmg, status: 'damaged', at: ctx.now, lot: number });
      pl.damaged = round4(pl.damaged + dmg);
      movement(db, ctx, { productId: pl.productId, type: 'quarantine', qty: dmg, moved: dmg, toBinId: qBin, refType: 'grn', refId: id, refNumber: number, reason: 'Damaged on arrival — quarantined' });
    }
    grn.lines.push({ poLineId: pl.id, productId: pl.productId, qty: rl.qty, damaged: dmg, binId: bin.id, unitCost: pl.unitCost });

    // Cost variance → proposed cost version (approval required).
    const p = db.products[pl.productId];
    if (p && a.proposeCost !== false && Math.abs(pctChange(p.cost, pl.unitCost)) >= 0.5) {
      const pending = p.pendingChangeId ? db.priceChanges[p.pendingChangeId] : undefined;
      if (!pending || pending.newCost !== pl.unitCost) {
        const ch = proposeCostChangeInternal(db, ctx, { productId: p.id, supplierCost: pl.unitCost, supplierId: po.supplierId, source: 'grn', reason: `GRN ${number} at PO cost ${formatRM(pl.unitCost)} (${po.number})` });
        grn.costChangeIds.push(ch.id);
      }
    }
  }
  const allDone = po.lines.every((l) => l.received + l.damaged >= l.qty - 1e-9);
  po.status = allDone ? 'received' : 'partial';
  po.grnIds.push(id);
  db.goodsReceipts[id] = grn;
  if (a.allocateBackorders) {
    for (const l of grn.lines) grn.allocations.push(...allocateBackorders(db, ctx, { productId: l.productId }));
  }
  audit(db, ctx, {
    action: 'grn.posted',
    entityType: 'grn',
    entityId: id,
    entityRef: number,
    summary: `${number} for ${po.number}: ${grn.lines.length} line(s) received${grn.lines.some((l) => l.damaged) ? ' (damage quarantined)' : ''}${grn.allocations.length ? `; ${grn.allocations.length} backorder allocation(s)` : ''}`,
    reason: a.note,
  });
  notify(db, ctx, { kind: 'procurement', severity: 'success', title: `Goods received · ${number}`, body: `${po.number} ${po.status === 'partial' ? 'partially received' : 'fully received'}${grn.costChangeIds.length ? ` · ${grn.costChangeIds.length} cost change(s) proposed` : ''}`, link: `/warehouse?grn=${id}` });
  return grn;
}

export function recordSupplierBill(db: DbState, ctx: Ctx, a: { poId: ID; billRef: string; amount: Sen }) {
  requirePerm(ctx, 'finance.manage');
  const po = must(db.purchaseOrders[a.poId], 'PO');
  if (po.billId) throw new DomainError(`${po.number} already has a supplier bill recorded.`, 'state');
  const receivedValue = po.lines.reduce((s, l) => s + roundSen((l.received + l.damaged) * l.unitCost), 0) + po.freight;
  const variance = a.amount - receivedValue;
  const id = uid(db, 'pbl');
  db.purchaseBills[id] = {
    id,
    number: nextNumber(db, 'BILL', ctx.now),
    poId: po.id,
    supplierId: po.supplierId,
    billRef: a.billRef,
    amount: a.amount,
    receivedValue,
    variance,
    status: Math.abs(variance) <= Math.max(100, receivedValue * 0.01) ? 'matched' : 'variance',
    date: ctx.now,
  };
  po.billId = id;
  audit(db, ctx, { action: 'bill.recorded', entityType: 'bill', entityId: id, entityRef: a.billRef, summary: `Supplier bill ${a.billRef} for ${po.number}: ${formatRM(a.amount)} vs received ${formatRM(receivedValue)} (${db.purchaseBills[id].status})` });
  return db.purchaseBills[id];
}
