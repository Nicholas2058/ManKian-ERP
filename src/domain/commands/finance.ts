import type { ID, Payment, Sen } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { allocateFifo, invoiceBalance } from '../finance';
import { formatRM } from '@/lib/money';
import { audit, must, nextNumber, notify, requirePerm, uid } from './helpers';

export function recordPayment(
  db: DbState,
  ctx: Ctx,
  a: { customerId: ID; amount: Sen; method: Payment['method']; reference: string; allocations?: { invoiceId: ID; amount: Sen }[]; skipPerm?: boolean },
): Payment {
  if (!a.skipPerm) requirePerm(ctx, 'finance.manage');
  const c = must(db.customers[a.customerId], 'Customer');
  if (!(a.amount > 0)) throw new DomainError('Payment amount must be greater than zero.', 'validation');
  if (!a.reference.trim()) throw new DomainError('Payment reference is required.', 'validation');
  const dup = Object.values(db.payments).find((p) => p.customerId === c.id && p.reference.trim().toLowerCase() === a.reference.trim().toLowerCase() && p.amount === a.amount);
  if (dup) throw new DomainError(`Possible duplicate: ${dup.number} already recorded with reference "${a.reference}" for ${formatRM(a.amount)}.`, 'duplicate');
  const open = Object.values(db.invoices).filter((i) => i.customerId === c.id && invoiceBalance(i) > 0);
  let allocations = a.allocations?.filter((x) => x.amount > 0);
  if (!allocations || !allocations.length) allocations = allocateFifo(open, a.amount);
  let allocated = 0;
  for (const al of allocations) {
    const inv = must(db.invoices[al.invoiceId], 'Invoice');
    if (inv.customerId !== c.id) throw new DomainError(`${inv.number} belongs to another customer.`, 'validation');
    const bal = invoiceBalance(inv);
    if (al.amount > bal + 0.5) throw new DomainError(`Allocation ${formatRM(al.amount)} exceeds ${inv.number} balance ${formatRM(bal)}.`, 'validation');
    allocated += al.amount;
  }
  if (allocated > a.amount) throw new DomainError('Allocations exceed the payment amount.', 'validation');
  for (const al of allocations) {
    const inv = db.invoices[al.invoiceId];
    inv.paid += al.amount;
    inv.status = invoiceBalance(inv) <= 0 ? 'paid' : 'partial';
  }
  const id = uid(db, 'pay');
  const p: Payment = {
    id,
    number: nextNumber(db, 'PAY', ctx.now),
    customerId: c.id,
    amount: a.amount,
    method: a.method,
    reference: a.reference.trim(),
    receivedAt: ctx.now,
    allocations,
    unallocated: a.amount - allocated,
    recordedBy: ctx.actor.name,
  };
  db.payments[id] = p;
  audit(db, ctx, {
    action: 'payment.recorded',
    entityType: 'payment',
    entityId: id,
    entityRef: p.number,
    summary: `${p.number} ${formatRM(a.amount)} from ${c.name} allocated to ${allocations.map((x) => db.invoices[x.invoiceId]?.number).join(', ') || '—'}${p.unallocated ? ` (unallocated ${formatRM(p.unallocated)})` : ''}`,
  });
  notify(db, ctx, { kind: 'finance', severity: 'success', title: `Payment received · ${c.name}`, body: `${formatRM(a.amount)} via ${a.method.replace('_', ' ')} (simulated)`, link: `/finance?customer=${c.id}` });
  return p;
}

export function logReminder(db: DbState, ctx: Ctx, a: { invoiceId: ID }) {
  requirePerm(ctx, 'finance.manage');
  const inv = must(db.invoices[a.invoiceId], 'Invoice');
  inv.reminders.push({ at: ctx.now, by: ctx.actor.name });
  audit(db, ctx, { action: 'invoice.reminder_drafted', entityType: 'invoice', entityId: inv.id, entityRef: inv.number, summary: `Reminder drafted for ${inv.number} (copied — not sent)` });
}

export function issueCreditNote(db: DbState, ctx: Ctx, a: { invoiceId: ID; amount: Sen; reason: string }) {
  requirePerm(ctx, 'finance.manage');
  const inv = must(db.invoices[a.invoiceId], 'Invoice');
  const bal = invoiceBalance(inv);
  if (!(a.amount > 0) || a.amount > bal) throw new DomainError(`Credit must be between RM 0.01 and the balance ${formatRM(bal)}.`, 'validation');
  if (!a.reason.trim()) throw new DomainError('Reason is required.', 'validation');
  inv.credited += a.amount;
  if (invoiceBalance(inv) <= 0) inv.status = 'paid';
  const id = uid(db, 'cnn');
  db.creditNotes[id] = { id, number: nextNumber(db, 'CN', ctx.now), invoiceId: inv.id, customerId: inv.customerId, amount: a.amount, reason: a.reason, at: ctx.now };
  audit(db, ctx, { action: 'credit_note.issued', entityType: 'invoice', entityId: inv.id, entityRef: inv.number, summary: `Credit note ${db.creditNotes[id].number} ${formatRM(a.amount)} on ${inv.number}`, reason: a.reason });
  return db.creditNotes[id];
}
