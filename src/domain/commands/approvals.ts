import type { ID } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { must } from './helpers';
import { approvePriceChange, rejectPriceChange } from './pricing';
import { decideCredit, decideQuote } from './sales';
import { decidePosDiscount } from './pos';

/** Single entry point for the approval inbox; routes to the owning module. */
export function decideApproval(db: DbState, ctx: Ctx, a: { approvalId: ID; approve: boolean; note?: string; price?: number }) {
  const ap = must(db.approvals[a.approvalId], 'Approval');
  if (ap.status !== 'pending') throw new DomainError(`${ap.number} is already ${ap.status}.`, 'state');
  switch (ap.type) {
    case 'price_change':
      return a.approve
        ? approvePriceChange(db, ctx, { changeId: ap.refId, note: a.note, price: a.price })
        : rejectPriceChange(db, ctx, { changeId: ap.refId, note: a.note });
    case 'margin_floor':
    case 'discount':
    case 'price_override':
    case 'quote_reissue':
      return decideQuote(db, ctx, { quoteId: ap.refId, approve: a.approve, note: a.note, approvalId: ap.id });
    case 'credit_override':
      return decideCredit(db, ctx, { orderId: ap.refId, approve: a.approve, note: a.note });
    case 'pos_discount':
      return decidePosDiscount(db, ctx, { approvalId: ap.id, approve: a.approve, note: a.note });
  }
}
