import { describe, expect, it } from 'vitest';
import { buildSeedWithReport, pid } from '@/data/seed';
import { productStock } from '@/domain/inventory';
import { invoiceBalance } from '@/domain/finance';

const ANCHOR = '2026-11-11T06:30:00.000Z'; // 14:30 Malaysia time

describe('seed data integrity', () => {
  const { db, warnings } = buildSeedWithReport({ anchor: ANCHOR, seed: 20261111 });

  it('generates realistic volumes', () => {
    const count = (t: keyof typeof db) => Object.keys(db[t] as object).length;
    const stats = {
      products: count('products'),
      customers: count('customers'),
      suppliers: count('suppliers'),
      quotes: count('quotes'),
      orders: count('salesOrders'),
      pos: count('purchaseOrders'),
      invoices: count('invoices'),
      payments: count('payments'),
      movements: count('movements'),
      audit: count('audit'),
      enquiries: count('enquiries'),
      deliveries: count('deliveryOrders'),
      priceChanges: count('priceChanges'),
    };
    console.log('SEED STATS', stats, 'warnings', warnings.length, warnings.slice(0, 15));
    expect(stats.products).toBeGreaterThanOrEqual(120);
    expect(stats.products).toBeLessThanOrEqual(160);
    expect(stats.suppliers).toBeGreaterThanOrEqual(12);
    expect(stats.customers).toBeGreaterThanOrEqual(20);
    expect(stats.quotes).toBeGreaterThan(40);
    expect(stats.orders).toBeGreaterThan(20);
    expect(stats.pos).toBeGreaterThanOrEqual(15);
  });

  it('is deterministic for the same anchor and seed', () => {
    const again = buildSeedWithReport({ anchor: ANCHOR, seed: 20261111 }).db;
    expect(Object.keys(again.quotes).length).toBe(Object.keys(db.quotes).length);
    expect(again.config.seq).toBe(db.config.seq);
  });

  it('keeps stock non-negative and reservations backed by stock', () => {
    for (const b of Object.values(db.binStock)) expect(b.qty).toBeGreaterThan(0);
    for (const p of Object.values(db.products)) {
      const s = productStock(db, p.id);
      expect(s.reserved).toBeLessThanOrEqual(s.onHand - s.blocked + 1e-6);
      expect(s.available).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps order line quantities consistent', () => {
    for (const o of Object.values(db.salesOrders)) {
      for (const l of o.lines) {
        expect(l.allocated + l.dispatched).toBeLessThanOrEqual(l.qtyBase + 1e-6);
        expect(l.picked).toBeGreaterThanOrEqual(l.dispatched - 1e-6);
        expect(l.delivered).toBeLessThanOrEqual(l.dispatched + 1e-6);
        expect(l.invoiced).toBeLessThanOrEqual(l.delivered + 1e-6);
      }
    }
  });

  it('never over-pays invoices', () => {
    for (const inv of Object.values(db.invoices)) {
      expect(inv.paid).toBeLessThanOrEqual(inv.total);
      expect(invoiceBalance(inv)).toBeGreaterThanOrEqual(0);
    }
  });

  it('sets up the guided scenarios', () => {
    const sc = db.config.scenario;
    expect(productStock(db, pid('PVE-050')).available).toBe(25);
    expect(sc.enquiryB && db.enquiries[sc.enquiryB].lines.length).toBeGreaterThanOrEqual(2);
    const ub = Object.values(db.backorders).filter((b) => b.productId === pid('UBL-M12-4') && b.status === 'open');
    expect(ub.length).toBeGreaterThan(0);
    expect(db.quotes[sc.quoteA1].status).toBe('draft');
    expect(db.quotes[sc.quoteA2].contractLocked).toBe(true);
    expect(db.quotes[sc.quoteA3].status).toBe('issued');
    expect(db.quotes[sc.quoteE].status).toBe('accepted');
    expect(db.purchaseOrders[sc.delayedPo].status).toBe('acknowledged');
    expect(db.salesOrders[sc.orderD1].status).toBe('allocated');
    expect(db.salesOrders[sc.orderD2].fulfilment).toBe('pickup');
    const overdue = Object.values(db.invoices).filter((i) => i.customerId === 'c26' && invoiceBalance(i) > 0 && i.dueDate < ANCHOR);
    expect(overdue.length).toBeGreaterThan(0);
  });

  it('generates no unexpected domain warnings', () => {
    // Some simulated events are expected to be skipped (e.g. counter stock-outs).
    const unexpected = warnings.filter((w) => !w.startsWith('pos:') && !w.startsWith('pick:') && !w.startsWith('deliver:'));
    expect(unexpected).toEqual([]);
  });
});
