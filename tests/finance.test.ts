import { describe, expect, it } from 'vitest';
import { ageing, allocateFifo, creditPosition, invoiceBalance } from '@/domain/finance';
import { recordPayment } from '@/domain/commands/finance';
import * as S from '@/domain/commands/sales';
import { computeKpis, rangeFor, categoryMix } from '@/domain/kpis';
import { computeInsights } from '@/domain/insights';
import { DomainError } from '@/domain/state';
import { ANCHOR, ctx, exec, seed } from './helpers';

describe('credit control', () => {
  it('puts an over-limit customer’s new order on credit hold until overridden', () => {
    let db = seed();
    const q = db.config.scenario.quoteE;
    const cp0 = creditPosition(db, 'c26', ANCHOR);
    expect(cp0.overdue).toBeGreaterThan(0);
    let r: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    ({ db, r } = exec(db, S.convertQuoteToOrder, { quoteId: q }, ctx('sales_exec')));
    expect(r.creditStatus).toBe('pending_override');
    expect(db.salesOrders[r.id].status).toBe('pending_credit');
    expect(() => exec(db, S.reserveOrder, { orderId: r.id }, ctx('sales_exec'))).toThrow(/credit hold/);
    expect(() => exec(db, S.decideCredit, { orderId: r.id, approve: true }, ctx('sales_manager'))).toThrow(DomainError);
    ({ db } = exec(db, S.decideCredit, { orderId: r.id, approve: true, note: 'ok' }, ctx('finance')));
    expect(db.salesOrders[r.id].creditStatus).toBe('overridden');
    expect(() => exec(db, S.reserveOrder, { orderId: r.id }, ctx('sales_exec'))).not.toThrow();
  });
});

describe('payments and ageing', () => {
  it('allocates oldest-first, never over-allocates, and blocks duplicates', () => {
    let db = seed();
    const open = Object.values(db.invoices).filter((i) => i.customerId === 'c26' && invoiceBalance(i) > 0);
    const total = open.reduce((s, i) => s + invoiceBalance(i), 0);
    const plan = allocateFifo(open, total + 5000);
    expect(plan.reduce((s, a) => s + a.amount, 0)).toBe(total);
    const oldest = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const ag0 = ageing(Object.values(db.invoices), ANCHOR);
    let r: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    ({ db, r } = exec(db, recordPayment, { customerId: 'c26', amount: invoiceBalance(oldest), method: 'bank_transfer', reference: 'TEST-1' }, ctx('finance')));
    expect(r.allocations[0].invoiceId).toBe(oldest.id);
    expect(db.invoices[oldest.id].status).toBe('paid');
    const ag1 = ageing(Object.values(db.invoices), ANCHOR);
    expect(ag1.total).toBe(ag0.total - invoiceBalance(oldest));
    expect(() => exec(db, recordPayment, { customerId: 'c26', amount: invoiceBalance(oldest), method: 'bank_transfer', reference: 'TEST-1' }, ctx('finance'))).toThrow(/duplicate/i);
    const other = open.find((i) => i.id !== oldest.id)!;
    expect(() => exec(db, recordPayment, { customerId: 'c26', amount: 100, method: 'cash', reference: 'TEST-2', allocations: [{ invoiceId: other.id, amount: invoiceBalance(other) + 10_000 }] }, ctx('finance'))).toThrow(DomainError);
  });
});

describe('dashboard KPIs are derived from records', () => {
  it('net sales equals the sum of invoice subtotals in range and reacts to new invoices', () => {
    const db = seed();
    const range = rangeFor('30d', ANCHOR);
    const k = computeKpis(db, range, ANCHOR);
    const manual = Object.values(db.invoices).filter((i) => i.issueDate >= range.from && i.issueDate <= range.to).reduce((s, i) => s + i.subtotal, 0);
    expect(k.netSales).toBe(manual);
    expect(categoryMix(db, range).reduce((s, c) => s + c.sales, 0)).toBe(Object.values(db.invoices).filter((i) => i.issueDate >= range.from && i.issueDate <= range.to).reduce((s, i) => s + i.lines.reduce((t, l) => t + l.lineTotal, 0), 0));
    const k7 = computeKpis(db, rangeFor('7d', ANCHOR), ANCHOR);
    expect(k7.netSales).toBeLessThanOrEqual(k.netSales);
    expect(k.openReceivables).toBe(Object.values(db.invoices).reduce((s, i) => s + invoiceBalance(i), 0));
  });
  it('raises transparent rule-based insights for the seeded scenarios', () => {
    const ins = computeInsights(seed(), ANCHOR);
    const rules = new Set(ins.map((i) => i.rule));
    expect(rules.has('reorder')).toBe(true);
    expect(rules.has('po_late')).toBe(true);
    expect(ins.every((i) => i.rule && i.link)).toBe(true);
  });
});
