import type { AppNotification, AuditEvent, BinStock, ID, InventoryMovement, SalesOrder, OrderStatus } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { can, PERM_LABEL, ROLES, rolesWith, type Permission } from '../roles';

/** Deterministic, collision-free id within one database. */
export function uid(db: DbState, prefix: string): ID {
  db.config.seq += 1;
  return `${prefix}_${db.config.seq.toString(36)}`;
}

/** Human document number, e.g. QT-26-0142. */
export function nextNumber(db: DbState, prefix: string, at: string): string {
  const n = (db.config.sequences[prefix] ?? 0) + 1;
  db.config.sequences[prefix] = n;
  const yy = new Date(at).getUTCFullYear().toString().slice(2);
  return `${prefix}-${yy}-${String(n).padStart(4, '0')}`;
}

export function requirePerm(ctx: Ctx, perm: Permission) {
  if (!can(ctx.actor.role, perm)) {
    const who = rolesWith(perm)
      .filter((r) => r !== 'owner')
      .slice(0, 2)
      .map((r) => ROLES[r].label);
    throw new DomainError(
      `Your demo role (${ROLES[ctx.actor.role].label}) cannot ${PERM_LABEL[perm]}. Switch role to ${[...who, 'Owner'].join(' or ')} to continue.`,
      'permission',
      { perm, suggestRole: rolesWith(perm).find((r) => r !== 'owner') ?? 'owner' },
    );
  }
}

export function audit(
  db: DbState,
  ctx: Ctx,
  e: Omit<AuditEvent, 'id' | 'at' | 'actor' | 'role'> & { at?: string },
) {
  const id = uid(db, 'au');
  db.audit[id] = { id, at: e.at ?? ctx.now, actor: ctx.actor.name, role: ctx.actor.role, ...e };
}

export function notify(db: DbState, ctx: Ctx, n: Omit<AppNotification, 'id' | 'at' | 'read'>) {
  if (ctx.silent) return;
  const id = uid(db, 'nt');
  db.notifications[id] = { id, at: ctx.now, read: false, ...n };
}

export function must<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new DomainError(`${what} not found`, 'not_found');
  return v;
}

// ───────────── stock primitives ─────────────

export function onHandOf(db: DbState, productId: ID): number {
  let t = 0;
  for (const b of Object.values(db.binStock)) if (b.productId === productId) t += b.qty;
  return Math.round(t * 10000) / 10000;
}

export function addBinStock(
  db: DbState,
  args: { productId: ID; binId: ID; qty: number; status?: BinStock['status']; at: string; lot?: string },
) {
  if (args.qty <= 0) return;
  const status = args.status ?? 'ok';
  const existing = Object.values(db.binStock).find((b) => b.productId === args.productId && b.binId === args.binId && b.status === status);
  if (existing) {
    existing.qty = Math.round((existing.qty + args.qty) * 10000) / 10000;
    return existing.id;
  }
  const id = uid(db, 'bs');
  db.binStock[id] = { id, productId: args.productId, binId: args.binId, qty: args.qty, status, receivedAt: args.at, lot: args.lot };
  return id;
}

export function takeBinStock(db: DbState, args: { productId: ID; binId: ID; qty: number; status?: BinStock['status'] }) {
  if (args.qty <= 0) return;
  const status = args.status ?? 'ok';
  const rec = Object.values(db.binStock).find((b) => b.productId === args.productId && b.binId === args.binId && b.status === status);
  if (!rec || rec.qty + 1e-9 < args.qty) {
    const bin = db.bins[args.binId];
    throw new DomainError(`Not enough stock in bin ${bin?.code ?? args.binId} (has ${rec?.qty ?? 0}, needs ${args.qty}).`, 'stock');
  }
  rec.qty = Math.round((rec.qty - args.qty) * 10000) / 10000;
  if (rec.qty <= 0) delete db.binStock[rec.id];
}

export function movement(db: DbState, ctx: Ctx, m: Omit<InventoryMovement, 'id' | 'at' | 'by' | 'onHandAfter'> & { at?: string }) {
  const id = uid(db, 'mv');
  db.movements[id] = { id, at: m.at ?? ctx.now, by: ctx.actor.name, onHandAfter: onHandOf(db, m.productId), ...m };
}

// ───────────── sales order status ─────────────

export function deriveOrderStatus(o: SalesOrder): OrderStatus {
  if (o.status === 'cancelled') return 'cancelled';
  if (o.creditStatus === 'pending_override') return 'pending_credit';
  let tot = 0, alloc = 0, staged = 0, disp = 0, deliv = 0, inv = 0;
  for (const l of o.lines) {
    tot += l.qtyBase;
    alloc += l.allocated;
    staged += Math.max(0, l.picked - l.dispatched);
    disp += l.dispatched;
    deliv += l.delivered;
    inv += l.invoiced;
  }
  const eps = 1e-6;
  if (tot > 0 && inv >= tot - eps) return 'invoiced';
  if (tot > 0 && deliv >= tot - eps) return 'delivered';
  if (tot > 0 && disp >= tot - eps) return 'dispatched';
  if (disp > eps) return 'partially_dispatched';
  if (staged > eps && staged >= alloc - eps) return 'ready';
  if (staged > eps) return 'picking';
  if (alloc > eps && alloc + disp >= tot - eps) return 'allocated';
  if (alloc > eps) return 'partially_allocated';
  return 'confirmed';
}

export function refreshOrder(o: SalesOrder) {
  o.status = deriveOrderStatus(o);
}

export function orderEvent(o: SalesOrder, ctx: Ctx, label: string) {
  o.timeline.push({ at: ctx.now, label, by: ctx.actor.name });
}
