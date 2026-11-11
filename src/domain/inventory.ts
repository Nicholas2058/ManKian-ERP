import type { BinStock, ID, PurchaseOrder } from './types';
import type { DbState } from './state';

/**
 * Stock definitions (all in base units):
 *  - On hand   = everything physically held (rack bins + staging + quarantine).
 *  - Blocked   = quarantined/damaged stock (cannot be sold).
 *  - Reserved  = active reservations for sales orders.
 *  - Available = On hand − blocked − reserved. Never includes incoming.
 *  - Incoming  = outstanding quantities on sent/acknowledged/partial POs.
 *  - Staged    = picked and waiting in dispatch staging (still on hand and still reserved).
 */
export interface StockSummary {
  onHand: number;
  blocked: number;
  reserved: number;
  available: number;
  incoming: number;
  staged: number;
}

export const OPEN_PO: PurchaseOrder['status'][] = ['sent', 'acknowledged', 'partial'];

export function poOutstanding(l: { qty: number; received: number; damaged: number }) {
  return Math.max(0, l.qty - l.received - l.damaged);
}

function emptySummary(): StockSummary {
  return { onHand: 0, blocked: 0, reserved: 0, available: 0, incoming: 0, staged: 0 };
}

type StockTables = Pick<DbState, 'binStock' | 'reservations' | 'purchaseOrders' | 'bins'>;

/** Compute the summary for one product by scanning the ledger tables (works on drafts). */
export function productStock(db: StockTables, productId: ID): StockSummary {
  const s = emptySummary();
  for (const b of Object.values(db.binStock)) {
    if (b.productId !== productId) continue;
    s.onHand += b.qty;
    if (b.status !== 'ok') s.blocked += b.qty;
    else if (db.bins[b.binId]?.kind === 'staging') s.staged += b.qty;
  }
  for (const r of Object.values(db.reservations)) {
    if (r.productId === productId && r.status === 'active') s.reserved += r.qty;
  }
  for (const po of Object.values(db.purchaseOrders)) {
    if (!OPEN_PO.includes(po.status)) continue;
    for (const l of po.lines) if (l.productId === productId) s.incoming += poOutstanding(l);
  }
  s.available = Math.max(0, round(s.onHand - s.blocked - s.reserved));
  s.onHand = round(s.onHand);
  return s;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

let cacheKey: unknown[] = [];
let cacheVal: Record<ID, StockSummary> = {};

/** Stock index for all products. Memoised on table identity (immutable state). */
export function stockIndex(db: StockTables): Record<ID, StockSummary> {
  const key = [db.binStock, db.reservations, db.purchaseOrders, db.bins];
  if (key.every((k, i) => k === cacheKey[i])) return cacheVal;
  const idx: Record<ID, StockSummary> = {};
  const get = (id: ID) => (idx[id] ||= emptySummary());
  for (const b of Object.values(db.binStock)) {
    const s = get(b.productId);
    s.onHand += b.qty;
    if (b.status !== 'ok') s.blocked += b.qty;
    else if (db.bins[b.binId]?.kind === 'staging') s.staged += b.qty;
  }
  for (const r of Object.values(db.reservations)) if (r.status === 'active') get(r.productId).reserved += r.qty;
  for (const po of Object.values(db.purchaseOrders)) {
    if (!OPEN_PO.includes(po.status)) continue;
    for (const l of po.lines) get(l.productId).incoming += poOutstanding(l);
  }
  for (const s of Object.values(idx)) {
    s.onHand = round(s.onHand);
    s.available = Math.max(0, round(s.onHand - s.blocked - s.reserved));
  }
  cacheKey = key;
  cacheVal = idx;
  return idx;
}

export function stockFor(db: StockTables, productId: ID): StockSummary {
  return stockIndex(db)[productId] ?? emptySummary();
}

/** Pickable bin stock for a product (rack/floor bins, status ok), largest first. */
export function pickableBins(db: Pick<DbState, 'binStock' | 'bins'>, productId: ID): BinStock[] {
  return Object.values(db.binStock)
    .filter((b) => b.productId === productId && b.status === 'ok' && b.qty > 0 && ['rack', 'floor'].includes(db.bins[b.binId]?.kind ?? ''))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || b.qty - a.qty);
}

export function stagingBinId(db: Pick<DbState, 'bins'>): ID {
  const b = Object.values(db.bins).find((x) => x.kind === 'staging');
  if (!b) throw new Error('No staging bin configured');
  return b.id;
}

export function quarantineBinId(db: Pick<DbState, 'bins'>): ID {
  const b = Object.values(db.bins).find((x) => x.kind === 'quarantine');
  if (!b) throw new Error('No quarantine bin configured');
  return b.id;
}

/** Bins in which a product currently sits (for put-away suggestions). */
export function homeBins(db: Pick<DbState, 'binStock' | 'bins'>, productId: ID): ID[] {
  return Object.values(db.binStock)
    .filter((b) => b.productId === productId && ['rack', 'floor'].includes(db.bins[b.binId]?.kind ?? ''))
    .map((b) => b.binId);
}

/** Occupancy ratio of a bin (0..1+) using abstract slot capacity and per-product footprint. */
export function binOccupancy(db: Pick<DbState, 'binStock' | 'products' | 'bins'>, binId: ID): number {
  const bin = db.bins[binId];
  if (!bin) return 0;
  let used = 0;
  for (const s of Object.values(db.binStock)) {
    if (s.binId !== binId) continue;
    const p = db.products[s.productId];
    used += s.qty * slotFootprint(p?.reorderQty ?? 100);
  }
  return used / Math.max(1, bin.capacity);
}

/** Abstract footprint: a product's reorder quantity roughly fills ~40% of a bin. */
export function slotFootprint(reorderQty: number) {
  return 40 / Math.max(1, reorderQty * 1.0);
}

export type ABC = 'A' | 'B' | 'C';
