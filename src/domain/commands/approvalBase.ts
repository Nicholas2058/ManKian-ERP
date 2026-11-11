import type { Approval } from '../types';
import type { Ctx, DbState } from '../state';
import { nextNumber, notify, uid } from './helpers';

export function createApproval(
  db: DbState,
  ctx: Ctx,
  a: Omit<Approval, 'id' | 'number' | 'status' | 'requestedBy' | 'requestedAt'>,
): Approval {
  const id = uid(db, 'ap');
  const rec: Approval = {
    id,
    number: nextNumber(db, 'APR', ctx.now),
    status: 'pending',
    requestedBy: ctx.actor.name,
    requestedAt: ctx.now,
    ...a,
  };
  db.approvals[id] = rec;
  notify(db, ctx, {
    kind: a.refType === 'price_change' ? 'pricing' : a.refType === 'order' ? 'finance' : 'quote',
    severity: a.severity === 'critical' ? 'critical' : 'warning',
    title: `Approval needed: ${a.title}`,
    body: a.detail,
    link: `/approvals?focus=${id}`,
  });
  return rec;
}

export function closeApproval(db: DbState, ctx: Ctx, id: string | undefined, status: Approval['status'], note?: string) {
  if (!id) return;
  const a = db.approvals[id];
  if (!a || a.status !== 'pending') return;
  a.status = status;
  a.decidedAt = ctx.now;
  a.decidedBy = ctx.actor.name;
  if (note) a.note = note;
}
