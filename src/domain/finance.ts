import type { ID, ISO, Invoice, SalesOrder, Sen } from './types';
import type { DbState } from './state';
import { daysOverdue } from '@/lib/dates';
import { lineTotal, roundSen } from '@/lib/money';

export function invoiceBalance(inv: Pick<Invoice, 'total' | 'paid' | 'credited' | 'status'>): Sen {
  if (inv.status === 'void') return 0;
  return Math.max(0, inv.total - inv.paid - inv.credited);
}

export type InvoiceState = 'paid' | 'partial' | 'overdue' | 'open' | 'void';

export function invoiceState(inv: Invoice, asOf: ISO): InvoiceState {
  if (inv.status === 'void') return 'void';
  const bal = invoiceBalance(inv);
  if (bal <= 0) return 'paid';
  if (daysOverdue(inv.dueDate, asOf) > 0) return 'overdue';
  return inv.paid > 0 ? 'partial' : 'open';
}

export interface AgeingBuckets {
  current: Sen;
  d1_30: Sen;
  d31_60: Sen;
  d61_90: Sen;
  d90p: Sen;
  total: Sen;
}

export function ageing(invoices: Invoice[], asOf: ISO): AgeingBuckets {
  const b: AgeingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0, total: 0 };
  for (const inv of invoices) {
    const bal = invoiceBalance(inv);
    if (bal <= 0) continue;
    const od = daysOverdue(inv.dueDate, asOf);
    if (od <= 0) b.current += bal;
    else if (od <= 30) b.d1_30 += bal;
    else if (od <= 60) b.d31_60 += bal;
    else if (od <= 90) b.d61_90 += bal;
    else b.d90p += bal;
    b.total += bal;
  }
  return b;
}

/** Value of order lines not yet invoiced (committed but unbilled exposure). */
export function orderUninvoicedValue(o: SalesOrder): Sen {
  if (o.status === 'cancelled') return 0;
  let v = 0;
  for (const l of o.lines) {
    const remainingBase = Math.max(0, l.qtyBase - l.invoiced);
    v += lineTotal(l.unitPrice, remainingBase / l.factor, l.discountPct);
  }
  return v;
}

export interface CreditPosition {
  limit: Sen;
  outstanding: Sen;
  overdue: Sen;
  openOrders: Sen;
  exposure: Sen;
  headroom: Sen;
  utilisationPct: number;
  oldestOverdueDays: number;
  status: 'ok' | 'near' | 'over' | 'blocked';
}

export function creditPosition(
  db: Pick<DbState, 'customers' | 'invoices' | 'salesOrders' | 'config'>,
  customerId: ID,
  asOf: ISO,
  extra: Sen = 0,
  excludeOrderId?: ID,
): CreditPosition {
  const c = db.customers[customerId];
  const limit = c?.creditLimit ?? 0;
  let outstanding = 0;
  let overdue = 0;
  let oldest = 0;
  for (const inv of Object.values(db.invoices)) {
    if (inv.customerId !== customerId) continue;
    const bal = invoiceBalance(inv);
    if (bal <= 0) continue;
    outstanding += bal;
    const od = daysOverdue(inv.dueDate, asOf);
    if (od > 0) {
      overdue += bal;
      oldest = Math.max(oldest, od);
    }
  }
  let openOrders = 0;
  for (const o of Object.values(db.salesOrders)) {
    if (o.customerId !== customerId || o.id === excludeOrderId) continue;
    openOrders += orderUninvoicedValue(o);
  }
  const exposure = outstanding + openOrders + extra;
  const utilisationPct = limit > 0 ? (exposure / limit) * 100 : exposure > 0 ? 999 : 0;
  let status: CreditPosition['status'] = 'ok';
  if (limit === 0) status = 'ok'; // cash customer: credit not extended, handled by payment at counter
  else if (oldest > db.config.overdueBlockDays) status = 'blocked';
  else if (exposure > limit) status = 'over';
  else if (utilisationPct >= db.config.creditWarnPct) status = 'near';
  return { limit, outstanding, overdue, openOrders, exposure, headroom: limit - exposure, utilisationPct, oldestOverdueDays: oldest, status };
}

/** Allocate an amount across open invoices, oldest due date first. */
export function allocateFifo(openInvoices: Invoice[], amount: Sen): { invoiceId: ID; amount: Sen }[] {
  const sorted = [...openInvoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const out: { invoiceId: ID; amount: Sen }[] = [];
  let left = amount;
  for (const inv of sorted) {
    if (left <= 0) break;
    const bal = invoiceBalance(inv);
    if (bal <= 0) continue;
    const a = Math.min(bal, left);
    out.push({ invoiceId: inv.id, amount: a });
    left -= a;
  }
  return out;
}

export function invoiceMargin(inv: Invoice): number {
  const net = inv.subtotal;
  return net > 0 ? ((net - inv.cost) / net) * 100 : 0;
}

export function taxFor(amount: Sen, tax: { enabled: boolean; ratePct: number }) {
  return tax.enabled ? roundSen((amount * tax.ratePct) / 100) : 0;
}
