import type { ID } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { productStock, quarantineBinId } from '../inventory';
import { round4 } from '../uom';
import { addBinStock, audit, movement, must, nextNumber, notify, requirePerm, takeBinStock, uid } from './helpers';

export const ADJUST_REASONS = ['Cycle count variance', 'Damaged in warehouse', 'Lost / missing', 'Found stock', 'Data correction', 'Sample / internal use'] as const;

/** Stock adjustment with reason. Cannot push available stock below reserved quantities. */
export function adjustStock(db: DbState, ctx: Ctx, a: { productId: ID; binId: ID; delta: number; reason: string; note?: string }) {
  requirePerm(ctx, 'stock.adjust');
  const p = must(db.products[a.productId], 'Product');
  const bin = must(db.bins[a.binId], 'Bin');
  if (!a.delta) throw new DomainError('Adjustment quantity cannot be zero.', 'validation');
  if (!a.reason) throw new DomainError('A reason is required for every stock adjustment.', 'validation');
  if (a.delta < 0) {
    const st = productStock(db, p.id);
    if (st.available < -a.delta - 1e-9) {
      throw new DomainError(`Removing ${-a.delta} would make reserved stock unbacked (available ${st.available}). Release reservations or backorder first.`, 'stock');
    }
    takeBinStock(db, { productId: p.id, binId: bin.id, qty: -a.delta });
  } else {
    addBinStock(db, { productId: p.id, binId: bin.id, qty: a.delta, at: ctx.now });
  }
  const number = nextNumber(db, 'ADJ', ctx.now);
  movement(db, ctx, { productId: p.id, type: 'adjustment', qty: a.delta, moved: Math.abs(a.delta), fromBinId: a.delta < 0 ? bin.id : undefined, toBinId: a.delta > 0 ? bin.id : undefined, refType: 'adjustment', refNumber: number, reason: `${a.reason}${a.note ? ` — ${a.note}` : ''}` });
  audit(db, ctx, { action: 'stock.adjusted', entityType: 'product', entityId: p.id, entityRef: p.sku, summary: `${number}: ${a.delta > 0 ? '+' : ''}${a.delta} ${p.baseUom} ${p.sku} at ${bin.code}`, reason: a.reason });
  return number;
}

export function transferStock(db: DbState, ctx: Ctx, a: { productId: ID; fromBinId: ID; toBinId: ID; qty: number; note?: string }) {
  requirePerm(ctx, 'stock.adjust');
  const p = must(db.products[a.productId], 'Product');
  if (a.fromBinId === a.toBinId) throw new DomainError('Choose a different destination bin.', 'validation');
  if (!(a.qty > 0)) throw new DomainError('Transfer quantity must be greater than zero.', 'validation');
  const to = must(db.bins[a.toBinId], 'Bin');
  if (to.kind === 'staging' || to.kind === 'quarantine') throw new DomainError('Use picking or quarantine actions for staging/quarantine bins.', 'validation');
  takeBinStock(db, { productId: p.id, binId: a.fromBinId, qty: a.qty });
  addBinStock(db, { productId: p.id, binId: a.toBinId, qty: a.qty, at: ctx.now });
  const number = nextNumber(db, 'TRF', ctx.now);
  movement(db, ctx, { productId: p.id, type: 'transfer', qty: 0, moved: a.qty, fromBinId: a.fromBinId, toBinId: a.toBinId, refType: 'transfer', refNumber: number, reason: a.note });
  audit(db, ctx, { action: 'stock.transferred', entityType: 'product', entityId: p.id, entityRef: p.sku, summary: `${number}: ${a.qty} ${p.baseUom} ${p.sku} ${db.bins[a.fromBinId]?.code} → ${to.code}` });
}

export function quarantineStock(db: DbState, ctx: Ctx, a: { productId: ID; binId: ID; qty: number; reason: string }) {
  requirePerm(ctx, 'stock.adjust');
  const p = must(db.products[a.productId], 'Product');
  const st = productStock(db, p.id);
  if (st.available < a.qty - 1e-9) throw new DomainError(`Only ${st.available} available — reserved stock cannot be quarantined without releasing it.`, 'stock');
  takeBinStock(db, { productId: p.id, binId: a.binId, qty: a.qty });
  const q = quarantineBinId(db);
  addBinStock(db, { productId: p.id, binId: q, qty: a.qty, status: 'quarantine', at: ctx.now });
  movement(db, ctx, { productId: p.id, type: 'quarantine', qty: 0, moved: a.qty, fromBinId: a.binId, toBinId: q, refType: 'quarantine', reason: a.reason });
  audit(db, ctx, { action: 'stock.quarantined', entityType: 'product', entityId: p.id, entityRef: p.sku, summary: `${a.qty} ${p.baseUom} ${p.sku} quarantined`, reason: a.reason });
}

export function releaseQuarantine(db: DbState, ctx: Ctx, a: { binStockId: ID; toBinId: ID; qty: number; writeOff?: boolean; reason: string }) {
  requirePerm(ctx, 'stock.adjust');
  const rec = must(db.binStock[a.binStockId], 'Quarantine stock');
  if (rec.status === 'ok') throw new DomainError('Stock is not quarantined.', 'state');
  if (a.qty > rec.qty + 1e-9 || a.qty <= 0) throw new DomainError(`Quantity must be between 1 and ${rec.qty}.`, 'validation');
  const p = must(db.products[rec.productId], 'Product');
  takeBinStock(db, { productId: rec.productId, binId: rec.binId, qty: a.qty, status: rec.status });
  if (a.writeOff) {
    movement(db, ctx, { productId: p.id, type: 'adjustment', qty: -a.qty, moved: a.qty, fromBinId: rec.binId, refType: 'write_off', reason: a.reason });
    audit(db, ctx, { action: 'stock.written_off', entityType: 'product', entityId: p.id, entityRef: p.sku, summary: `Wrote off ${a.qty} ${p.baseUom} ${p.sku}`, reason: a.reason });
  } else {
    addBinStock(db, { productId: p.id, binId: a.toBinId, qty: a.qty, at: ctx.now });
    movement(db, ctx, { productId: p.id, type: 'release', qty: 0, moved: a.qty, fromBinId: rec.binId, toBinId: a.toBinId, refType: 'quarantine', reason: a.reason });
    audit(db, ctx, { action: 'stock.released', entityType: 'product', entityId: p.id, entityRef: p.sku, summary: `Released ${a.qty} ${p.baseUom} ${p.sku} from quarantine to ${db.bins[a.toBinId]?.code}`, reason: a.reason });
  }
}

export function receiveReturn(
  db: DbState,
  ctx: Ctx,
  a: { productId: ID; qty: number; condition: 'resaleable' | 'damaged'; binId: ID; reason: string; orderId?: ID },
) {
  requirePerm(ctx, 'stock.adjust');
  const p = must(db.products[a.productId], 'Product');
  if (!(a.qty > 0)) throw new DomainError('Return quantity must be greater than zero.', 'validation');
  const bin = a.condition === 'damaged' ? quarantineBinId(db) : a.binId;
  addBinStock(db, { productId: p.id, binId: bin, qty: a.qty, status: a.condition === 'damaged' ? 'damaged' : 'ok', at: ctx.now });
  const id = uid(db, 'rt');
  const number = nextNumber(db, 'RT', ctx.now);
  db.returns[id] = { id, number, orderId: a.orderId, productId: p.id, qty: round4(a.qty), reason: a.reason, status: 'received', at: ctx.now, binId: bin, condition: a.condition };
  movement(db, ctx, { productId: p.id, type: 'return', qty: a.qty, moved: a.qty, toBinId: bin, refType: 'return', refId: id, refNumber: number, reason: a.reason });
  audit(db, ctx, { action: 'return.received', entityType: 'return', entityId: id, entityRef: number, summary: `${number}: ${a.qty} ${p.baseUom} ${p.sku} returned (${a.condition})`, reason: a.reason });
  if (a.condition === 'damaged') notify(db, ctx, { kind: 'stock', severity: 'info', title: `Damaged return quarantined`, body: `${p.sku} × ${a.qty}`, link: '/inventory' });
  return db.returns[id];
}
