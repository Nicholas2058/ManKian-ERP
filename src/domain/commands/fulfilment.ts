import type { DeliveryOrder, ID, ISO, Invoice, PickTask, Picklist } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { pickableBins, stagingBinId } from '../inventory';
import { round4 } from '../uom';
import { addDays, addMinutes } from '@/lib/dates';
import { formatRM, lineTotal, roundSen } from '@/lib/money';
import { addBinStock, audit, movement, must, nextNumber, notify, orderEvent, refreshOrder, requirePerm, takeBinStock, uid } from './helpers';

// ═════════════════════════ Picking ═════════════════════════

export function createPicklist(db: DbState, ctx: Ctx, a: { orderId: ID; assignee?: string }): Picklist {
  requirePerm(ctx, 'pick');
  const o = must(db.salesOrders[a.orderId], 'Order');
  if (o.status === 'cancelled') throw new DomainError(`${o.number} is cancelled.`, 'state');
  const existing = Object.values(db.picklists).find((p) => p.orderId === o.id && (p.status === 'open' || p.status === 'in_progress'));
  if (existing) return existing; // idempotent — no duplicate picklists on repeated clicks
  const tasks: PickTask[] = [];
  for (const l of o.lines) {
    let toPick = round4(l.allocated - Math.max(0, l.picked - l.dispatched));
    if (toPick <= 0) continue;
    // Bin stock already earmarked by other open pick tasks
    const claimed: Record<ID, number> = {};
    for (const pl of Object.values(db.picklists)) {
      if (pl.status !== 'open' && pl.status !== 'in_progress') continue;
      for (const t of pl.tasks) if (t.productId === l.productId) claimed[t.binId] = (claimed[t.binId] ?? 0) + (t.qty - t.picked);
    }
    for (const b of pickableBins(db, l.productId)) {
      const free = round4(b.qty - (claimed[b.binId] ?? 0));
      if (free <= 0) continue;
      const q = round4(Math.min(free, toPick));
      tasks.push({ id: uid(db, 'pt'), lineId: l.id, productId: l.productId, binId: b.binId, qty: q, picked: 0, status: 'open' });
      toPick = round4(toPick - q);
      if (toPick <= 0) break;
    }
  }
  if (!tasks.length) throw new DomainError(`Nothing to pick on ${o.number}. Reserve stock first.`, 'state');
  const id = uid(db, 'pl');
  const pl: Picklist = { id, number: nextNumber(db, 'PL', ctx.now), orderId: o.id, tasks, status: 'open', createdAt: ctx.now, assignee: a.assignee ?? 'Jason Wong' };
  db.picklists[id] = pl;
  orderEvent(o, ctx, `Picklist ${pl.number} generated (${tasks.length} bin task${tasks.length > 1 ? 's' : ''})`);
  audit(db, ctx, { action: 'picklist.created', entityType: 'picklist', entityId: id, entityRef: pl.number, summary: `${pl.number} for ${o.number}` });
  return pl;
}

/** Confirm a pick. Moves stock from the bin to dispatch staging (still reserved, still on hand). */
export function pickTask(db: DbState, ctx: Ctx, a: { picklistId: ID; taskId: ID; qty: number; shortReason?: string }) {
  requirePerm(ctx, 'pick');
  const pl = must(db.picklists[a.picklistId], 'Picklist');
  if (pl.status === 'completed' || pl.status === 'cancelled') throw new DomainError(`${pl.number} is ${pl.status}.`, 'state');
  const t = must(pl.tasks.find((x) => x.id === a.taskId), 'Pick task');
  const remaining = round4(t.qty - t.picked);
  if (t.status !== 'open' || remaining <= 0) throw new DomainError('This task is already completed.', 'state');
  const q = round4(a.qty);
  if (q < 0 || q > remaining + 1e-9) throw new DomainError(`Pick quantity must be between 0 and ${remaining}.`, 'validation');
  const o = must(db.salesOrders[pl.orderId], 'Order');
  const l = must(o.lines.find((x) => x.id === t.lineId), 'Order line');
  if (q > 0) {
    takeBinStock(db, { productId: t.productId, binId: t.binId, qty: q });
    const stg = stagingBinId(db);
    addBinStock(db, { productId: t.productId, binId: stg, qty: q, at: ctx.now });
    t.picked = round4(t.picked + q);
    l.picked = round4(l.picked + q);
    movement(db, ctx, { productId: t.productId, type: 'pick', qty: 0, moved: q, fromBinId: t.binId, toBinId: stg, refType: 'picklist', refId: pl.id, refNumber: pl.number });
  }
  if (t.picked >= t.qty - 1e-9) t.status = 'picked';
  else if (a.shortReason) {
    t.status = 'short';
    t.discrepancy = `${a.shortReason} (expected ${t.qty}, picked ${t.picked})`;
    const bin = db.bins[t.binId];
    notify(db, ctx, { kind: 'stock', severity: 'warning', title: `Pick discrepancy · ${bin?.code}`, body: `${db.products[t.productId]?.sku}: ${t.discrepancy}. Supervisor count required.`, link: '/inventory?tab=ledger' });
    audit(db, ctx, { action: 'pick.short', entityType: 'picklist', entityId: pl.id, entityRef: pl.number, summary: `Short pick at ${bin?.code}: ${t.discrepancy}`, reason: a.shortReason });
  }
  pl.status = pl.tasks.every((x) => x.status !== 'open') ? 'completed' : 'in_progress';
  if (pl.status === 'completed') {
    pl.completedAt = ctx.now;
    orderEvent(o, ctx, `Picklist ${pl.number} completed`);
  }
  refreshOrder(o);
  return t;
}

/** Reverse a pick: staging → original bin. Logged and fully restores state. */
export function unpickTask(db: DbState, ctx: Ctx, a: { picklistId: ID; taskId: ID; qty: number; reason: string }) {
  requirePerm(ctx, 'pick');
  const pl = must(db.picklists[a.picklistId], 'Picklist');
  const t = must(pl.tasks.find((x) => x.id === a.taskId), 'Pick task');
  const o = must(db.salesOrders[pl.orderId], 'Order');
  const l = must(o.lines.find((x) => x.id === t.lineId), 'Order line');
  const staged = round4(l.picked - l.dispatched);
  const q = round4(Math.min(a.qty, t.picked, staged));
  if (q <= 0) throw new DomainError('Nothing to reverse — goods may already be dispatched.', 'state');
  const stg = stagingBinId(db);
  takeBinStock(db, { productId: t.productId, binId: stg, qty: q });
  addBinStock(db, { productId: t.productId, binId: t.binId, qty: q, at: ctx.now });
  t.picked = round4(t.picked - q);
  t.status = 'open';
  t.discrepancy = undefined;
  l.picked = round4(l.picked - q);
  pl.status = 'in_progress';
  pl.completedAt = undefined;
  movement(db, ctx, { productId: t.productId, type: 'unpick', qty: 0, moved: q, fromBinId: stg, toBinId: t.binId, refType: 'picklist', refId: pl.id, refNumber: pl.number, reason: a.reason });
  orderEvent(o, ctx, `Pick reversed: ${q} × ${db.products[t.productId]?.sku} returned to ${db.bins[t.binId]?.code}`);
  refreshOrder(o);
  audit(db, ctx, { action: 'pick.reversed', entityType: 'picklist', entityId: pl.id, entityRef: pl.number, summary: `Reversed ${q} picked units`, reason: a.reason });
}

// ═════════════════════════ Delivery / pickup ═════════════════════════

function committedOnDOs(db: DbState, lineId: ID) {
  let q = 0;
  for (const d of Object.values(db.deliveryOrders)) {
    if (!['packed', 'scheduled', 'ready_for_collection', 'failed'].includes(d.status)) continue;
    for (const l of d.lines) if (l.lineId === lineId) q += l.qty;
  }
  return q;
}

function token(db: DbState) {
  const n = (db.config.seq * 7919) % 900000 + 100000;
  return `MK-${n}`;
}

/** Pack staged goods into a delivery order (delivery) or a self-pickup collection. */
export function createDelivery(db: DbState, ctx: Ctx, a: { orderId: ID; type?: 'delivery' | 'pickup'; scheduledDate?: ISO; lines?: { lineId: ID; qty: number }[] }): DeliveryOrder {
  requirePerm(ctx, 'dispatch');
  const o = must(db.salesOrders[a.orderId], 'Order');
  if (o.status === 'cancelled') throw new DomainError(`${o.number} is cancelled.`, 'state');
  const type = a.type ?? o.fulfilment;
  const lines: DeliveryOrder['lines'] = [];
  for (const l of o.lines) {
    const ready = round4(l.picked - l.dispatched - committedOnDOs(db, l.id));
    const wanted = a.lines ? a.lines.find((x) => x.lineId === l.id)?.qty ?? 0 : ready;
    const q = round4(Math.min(ready, wanted));
    if (q > 0) lines.push({ lineId: l.id, productId: l.productId, qty: q });
  }
  if (!lines.length) throw new DomainError(`No picked goods waiting in staging for ${o.number}. Complete picking first.`, 'state');
  const id = uid(db, 'do');
  const weightKg = Math.round(lines.reduce((s, x) => s + x.qty * (db.products[x.productId]?.weightKg ?? 1), 0));
  const d: DeliveryOrder = {
    id,
    number: nextNumber(db, type === 'pickup' ? 'PU' : 'DO', ctx.now),
    orderId: o.id,
    customerId: o.customerId,
    siteId: o.siteId,
    type,
    status: type === 'pickup' ? 'ready_for_collection' : 'packed',
    lines,
    scheduledDate: a.scheduledDate ?? (type === 'pickup' ? ctx.now : addDays(ctx.now, 1)),
    createdAt: ctx.now,
    weightKg,
    progress: [{ at: ctx.now, label: type === 'pickup' ? 'Packed — ready for customer collection' : 'Packed at dispatch staging' }],
    pickupToken: type === 'pickup' ? token(db) : undefined,
    promisedDate: o.requiredDate,
  };
  db.deliveryOrders[id] = d;
  orderEvent(o, ctx, `${d.number} ${type === 'pickup' ? 'ready for self-pickup' : 'packed for delivery'} (${lines.length} line${lines.length > 1 ? 's' : ''}${o.lines.some((l) => l.qtyBase > l.picked) ? ', partial' : ''})`);
  audit(db, ctx, { action: 'delivery.created', entityType: 'delivery', entityId: id, entityRef: d.number, summary: `${d.number} (${type}) for ${o.number}, ${weightKg} kg` });
  return d;
}

export function scheduleDelivery(db: DbState, ctx: Ctx, a: { doId: ID; vehicleId: ID; driverId: ID; date: ISO }) {
  requirePerm(ctx, 'dispatch');
  const d = must(db.deliveryOrders[a.doId], 'Delivery order');
  if (d.type !== 'delivery') throw new DomainError('Self-pickup orders are not scheduled on vehicles.', 'state');
  if (!['packed', 'scheduled', 'failed'].includes(d.status)) throw new DomainError(`${d.number} is ${d.status}.`, 'state');
  const v = must(db.vehicles[a.vehicleId], 'Vehicle');
  must(db.drivers[a.driverId], 'Driver');
  const day = a.date.slice(0, 10);
  const load = Object.values(db.deliveryOrders)
    .filter((x) => x.id !== d.id && x.vehicleId === v.id && x.scheduledDate.slice(0, 10) === day && ['scheduled', 'out_for_delivery'].includes(x.status))
    .reduce((s, x) => s + x.weightKg, 0);
  if (load + d.weightKg > v.capacityKg) throw new DomainError(`${v.plate} would carry ${load + d.weightKg} kg on ${day} — over its ${v.capacityKg} kg recorded capacity. Choose another vehicle or date.`, 'validation');
  if (d.status === 'failed') {
    // Goods are back in staging after a failed attempt; re-commit them.
    d.failReason = undefined;
  }
  d.vehicleId = v.id;
  d.driverId = a.driverId;
  d.scheduledDate = a.date;
  d.status = 'scheduled';
  d.progress.push({ at: ctx.now, label: `Load scheduled on ${v.plate} with ${db.drivers[a.driverId].name}` });
  audit(db, ctx, { action: 'delivery.scheduled', entityType: 'delivery', entityId: d.id, entityRef: d.number, summary: `${d.number} scheduled on ${v.plate} for ${day}` });
}

function shipLines(db: DbState, ctx: Ctx, d: DeliveryOrder, label: string) {
  const o = must(db.salesOrders[d.orderId], 'Order');
  const stg = stagingBinId(db);
  for (const x of d.lines) {
    const l = must(o.lines.find((y) => y.id === x.lineId), 'Order line');
    takeBinStock(db, { productId: x.productId, binId: stg, qty: x.qty });
    l.dispatched = round4(l.dispatched + x.qty);
    l.allocated = round4(Math.max(0, l.allocated - x.qty));
    let left = x.qty;
    for (const r of Object.values(db.reservations)) {
      if (r.lineId !== l.id || r.status !== 'active' || left <= 0) continue;
      const t = Math.min(r.qty, left);
      r.qty = round4(r.qty - t);
      left = round4(left - t);
      if (r.qty <= 0) r.status = 'fulfilled';
    }
    movement(db, ctx, { productId: x.productId, type: 'dispatch', qty: -x.qty, moved: x.qty, fromBinId: stg, refType: 'delivery', refId: d.id, refNumber: d.number, reason: label });
  }
  return o;
}

export function dispatchDelivery(db: DbState, ctx: Ctx, a: { doId: ID }) {
  requirePerm(ctx, 'dispatch');
  const d = must(db.deliveryOrders[a.doId], 'Delivery order');
  if (d.status === 'out_for_delivery') return d; // idempotent
  if (d.status !== 'scheduled') throw new DomainError(`${d.number} must be scheduled on a vehicle before dispatch.`, 'state');
  const o = shipLines(db, ctx, d, 'Loaded for delivery');
  d.status = 'out_for_delivery';
  d.dispatchedAt = ctx.now;
  d.progress.push({ at: ctx.now, label: 'Departed warehouse (simulated)' });
  orderEvent(o, ctx, `${d.number} out for delivery`);
  refreshOrder(o);
  audit(db, ctx, { action: 'delivery.dispatched', entityType: 'delivery', entityId: d.id, entityRef: d.number, summary: `${d.number} dispatched; stock issued from staging` });
  return d;
}

const ROUTE_STEPS = ['In transit (simulated)', 'Arriving at site (simulated)'];

/** Advance the simulated route timeline. No real GPS tracking. */
export function advanceRoute(db: DbState, ctx: Ctx, a: { doId: ID }) {
  const d = must(db.deliveryOrders[a.doId], 'Delivery order');
  if (d.status !== 'out_for_delivery') throw new DomainError('Route progress only applies to deliveries on the road.', 'state');
  const done = d.progress.filter((p) => ROUTE_STEPS.includes(p.label)).length;
  if (done < ROUTE_STEPS.length) d.progress.push({ at: ctx.now, label: ROUTE_STEPS[done] });
}

function finishOrderLines(db: DbState, ctx: Ctx, d: DeliveryOrder) {
  const o = must(db.salesOrders[d.orderId], 'Order');
  for (const x of d.lines) {
    const l = o.lines.find((y) => y.id === x.lineId);
    if (l) l.delivered = round4(l.delivered + x.qty);
  }
  return o;
}

export function confirmDelivery(db: DbState, ctx: Ctx, a: { doId: ID; signedName: string; photo?: string; note?: string }) {
  requirePerm(ctx, 'delivery.confirm');
  const d = must(db.deliveryOrders[a.doId], 'Delivery order');
  if (d.status === 'delivered') return d;
  if (d.status !== 'out_for_delivery') throw new DomainError(`${d.number} is not out for delivery.`, 'state');
  if (a.signedName.trim().length < 2) throw new DomainError('Receiver name is required for proof of delivery.', 'validation');
  d.status = 'delivered';
  d.completedAt = ctx.now;
  d.pod = { signedName: a.signedName.trim(), at: ctx.now, photo: a.photo, note: a.note };
  d.progress.push({ at: ctx.now, label: `Delivered — received by ${a.signedName.trim()}` });
  const o = finishOrderLines(db, ctx, d);
  orderEvent(o, ctx, `${d.number} delivered (POD signed by ${a.signedName.trim()})`);
  refreshOrder(o);
  audit(db, ctx, { action: 'delivery.confirmed', entityType: 'delivery', entityId: d.id, entityRef: d.number, summary: `POD recorded for ${d.number}` });
  if (db.config.invoiceOnDelivery) invoiceDelivery(db, ctx, { doId: d.id });
  return d;
}

export function failDelivery(db: DbState, ctx: Ctx, a: { doId: ID; reason: string }) {
  requirePerm(ctx, 'delivery.confirm');
  const d = must(db.deliveryOrders[a.doId], 'Delivery order');
  if (d.status !== 'out_for_delivery') throw new DomainError(`${d.number} is not out for delivery.`, 'state');
  if (!a.reason.trim()) throw new DomainError('A failure reason is required.', 'validation');
  const o = must(db.salesOrders[d.orderId], 'Order');
  const stg = stagingBinId(db);
  for (const x of d.lines) {
    const l = must(o.lines.find((y) => y.id === x.lineId), 'Order line');
    addBinStock(db, { productId: x.productId, binId: stg, qty: x.qty, at: ctx.now });
    l.dispatched = round4(l.dispatched - x.qty);
    l.allocated = round4(l.allocated + x.qty);
    const rid = uid(db, 'rs');
    db.reservations[rid] = { id: rid, productId: x.productId, orderId: o.id, lineId: l.id, qty: x.qty, createdAt: ctx.now, expiresAt: addDays(ctx.now, db.config.reservationHoldDays), status: 'active' };
    movement(db, ctx, { productId: x.productId, type: 'delivery_return', qty: x.qty, moved: x.qty, toBinId: stg, refType: 'delivery', refId: d.id, refNumber: d.number, reason: a.reason });
  }
  d.status = 'failed';
  d.failReason = a.reason;
  d.progress.push({ at: ctx.now, label: `Delivery failed: ${a.reason}. Goods returned to staging.` });
  orderEvent(o, ctx, `${d.number} failed: ${a.reason}`);
  refreshOrder(o);
  notify(db, ctx, { kind: 'delivery', severity: 'warning', title: `Delivery failed · ${d.number}`, body: a.reason, link: '/delivery' });
  audit(db, ctx, { action: 'delivery.failed', entityType: 'delivery', entityId: d.id, entityRef: d.number, summary: `${d.number} failed and returned to staging`, reason: a.reason });
}

export function collectPickup(db: DbState, ctx: Ctx, a: { doId: ID; token: string; signedName: string }) {
  requirePerm(ctx, 'dispatch');
  const d = must(db.deliveryOrders[a.doId], 'Collection');
  if (d.status === 'collected') return d;
  if (d.status !== 'ready_for_collection') throw new DomainError(`${d.number} is ${d.status}.`, 'state');
  if (a.token.trim().toUpperCase() !== (d.pickupToken ?? '').toUpperCase()) throw new DomainError('Collection token does not match. Ask the customer for the token on their order confirmation.', 'validation');
  if (a.signedName.trim().length < 2) throw new DomainError('Collector name is required.', 'validation');
  shipLines(db, ctx, d, 'Collected by customer');
  d.status = 'collected';
  d.dispatchedAt = ctx.now;
  d.completedAt = ctx.now;
  d.pod = { signedName: a.signedName.trim(), at: ctx.now, note: 'Self-pickup — token verified' };
  d.progress.push({ at: ctx.now, label: `Collected by ${a.signedName.trim()} (token verified)` });
  const o = finishOrderLines(db, ctx, d);
  orderEvent(o, ctx, `${d.number} collected by ${a.signedName.trim()}`);
  refreshOrder(o);
  audit(db, ctx, { action: 'pickup.collected', entityType: 'delivery', entityId: d.id, entityRef: d.number, summary: `${d.number} collected; token verified` });
  if (db.config.invoiceOnDelivery) invoiceDelivery(db, ctx, { doId: d.id });
  return d;
}

// ═════════════════════════ Invoicing ═════════════════════════

export function invoiceDelivery(db: DbState, ctx: Ctx, a: { doId: ID }): Invoice {
  const d = must(db.deliveryOrders[a.doId], 'Delivery order');
  if (d.invoiceId && db.invoices[d.invoiceId]) return db.invoices[d.invoiceId];
  if (!['delivered', 'collected'].includes(d.status)) throw new DomainError(`${d.number} must be delivered or collected before invoicing.`, 'state');
  const o = must(db.salesOrders[d.orderId], 'Order');
  const firstInvoice = !Object.values(db.invoices).some((i) => i.orderId === o.id);
  const id = uid(db, 'iv');
  const lines = d.lines.map((x) => {
    const l = must(o.lines.find((y) => y.id === x.lineId), 'Order line');
    const qtyUom = round4(x.qty / l.factor);
    l.invoiced = round4(l.invoiced + x.qty);
    return {
      id: uid(db, 'il'),
      productId: l.productId,
      description: l.description,
      qty: qtyUom,
      uom: l.uom,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      unitCost: l.unitCost,
      lineTotal: lineTotal(l.unitPrice, qtyUom, l.discountPct),
      orderLineId: l.id,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const freight = firstInvoice ? o.freight : 0;
  const tax = db.config.tax.enabled ? roundSen(((subtotal + freight) * db.config.tax.ratePct) / 100) : 0;
  const cost = lines.reduce((s, l) => s + roundSen(l.unitCost * l.qty), 0);
  const issueDate = ctx.now;
  const inv: Invoice = {
    id,
    number: nextNumber(db, 'INV', ctx.now),
    customerId: o.customerId,
    orderId: o.id,
    deliveryOrderId: d.id,
    issueDate,
    dueDate: addDays(issueDate, o.paymentTermsDays),
    lines,
    subtotal,
    freight,
    taxLabel: db.config.tax.label,
    taxRatePct: db.config.tax.enabled ? db.config.tax.ratePct : 0,
    tax,
    total: subtotal + freight + tax,
    cost,
    paid: 0,
    credited: 0,
    status: 'issued',
    reminders: [],
  };
  db.invoices[id] = inv;
  d.invoiceId = id;
  orderEvent(o, ctx, `Invoice ${inv.number} issued (${formatRM(inv.total)})`);
  refreshOrder(o);
  audit(db, ctx, { action: 'invoice.issued', entityType: 'invoice', entityId: id, entityRef: inv.number, summary: `${inv.number} for ${d.number}: ${formatRM(inv.total)} due ${inv.dueDate.slice(0, 10)}` });
  return inv;
}

/** Convenience used by tests and the seed: pick everything available on a picklist. */
export function pickAll(db: DbState, ctx: Ctx, a: { picklistId: ID }) {
  const pl = must(db.picklists[a.picklistId], 'Picklist');
  let t = ctx.now;
  for (const task of pl.tasks) {
    if (task.status !== 'open') continue;
    t = addMinutes(t, 2);
    pickTask(db, { ...ctx, now: t }, { picklistId: pl.id, taskId: task.id, qty: round4(task.qty - task.picked) });
  }
  return pl;
}
