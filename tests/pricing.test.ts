import { describe, expect, it } from 'vitest';
import { marginPct, markupPct, priceForMargin, roundUpTo, lineTotal, formatRM, toSen } from '@/lib/money';
import { bulkDiscount, computeTotals, floorPrice, lineIssues, priceLine, resolveRule, suggestedPrice, tierPrice } from '@/domain/pricing';
import { applyCostShock, approvePriceChange, rejectPriceChange, proposeManualPrice } from '@/domain/commands/pricing';
import { decideApproval } from '@/domain/commands/approvals';
import { DomainError } from '@/domain/state';
import { ctx, exec, pid, seed } from './helpers';

describe('margin vs markup', () => {
  it('computes gross margin on price and markup on cost', () => {
    expect(marginPct(10000, 7500)).toBeCloseTo(25);
    expect(markupPct(10000, 7500)).toBeCloseTo(33.333, 2);
    expect(marginPct(0, 100)).toBe(0);
    expect(markupPct(100, 0)).toBe(0);
  });
  it('price for a target margin is cost ÷ (1 − margin), not cost × (1 + margin)', () => {
    expect(priceForMargin(7500, 25)).toBeCloseTo(10000);
    expect(priceForMargin(7500, 25)).not.toBeCloseTo(7500 * 1.25);
  });
  it('rounds price endings up to the configured sen step without float drift', () => {
    expect(roundUpTo(1001, 5)).toBe(1005);
    expect(roundUpTo(1005, 5)).toBe(1005);
    expect(roundUpTo(10.000000001 * 100, 5)).toBe(1000);
    // 0.1 + 0.2 style accumulation: totals are integer sen
    const lines = Array.from({ length: 10 }, () => lineTotal(10, 3, 0));
    expect(lines.reduce((a, b) => a + b, 0)).toBe(300);
    expect(formatRM(toSen(0.1) + toSen(0.2))).toBe('RM 0.30');
  });
  it('rounds each line once and keeps totals consistent', () => {
    const t = computeTotals(
      [
        { unitPrice: 333, qty: 3, discountPct: 5, unitCost: 200 },
        { unitPrice: 1999, qty: 1.5, discountPct: 0, unitCost: 1500 },
      ],
      1000,
      { enabled: true, label: 'SST', ratePct: 8, note: '' },
    );
    expect(t.subtotal).toBe(999 + 2999);
    expect(t.discount).toBe(999 - 949);
    expect(t.total).toBe(t.subtotal - t.discount + t.freight + t.tax);
    expect(Number.isInteger(t.total)).toBe(true);
  });
});

describe('rules, tiers and approvals', () => {
  const db = seed();
  const p = db.products[pid('ANG-5050')];
  const rule = resolveRule(db, p);

  it('resolves the category rule and suggests a price at target margin', () => {
    expect(rule.scope).toBe('category');
    const s = suggestedPrice(p.latestCost, rule);
    expect(marginPct(s, p.latestCost)).toBeGreaterThanOrEqual(rule.targetMarginPct - 0.01);
    expect(s % rule.roundingSen).toBe(0);
    expect(marginPct(floorPrice(p.latestCost, rule), p.latestCost)).toBeGreaterThanOrEqual(rule.minMarginPct - 0.01);
  });
  it('applies tier discounts and volume breaks', () => {
    expect(tierPrice(p.basePrice, 'walkin', rule)).toBe(p.basePrice);
    expect(tierPrice(p.basePrice, 'key', rule)).toBeLessThan(tierPrice(p.basePrice, 'trade', rule));
    expect(bulkDiscount(1, rule)).toBe(0);
    expect(bulkDiscount(600, rule)).toBe(3);
  });
  it('honours a locked customer contract price', () => {
    const pl = priceLine(db, p, { customer: db.customers.c03, qty: 10, uom: 'LEN', at: db.config.anchorDate });
    expect(pl.priceSource).toBe('contract');
    expect(pl.unitPrice).toBe(db.agreements.ag1.fixedPrice);
  });
  it('requires approval below the margin floor and for large discounts, but not for contract lines', () => {
    const base = { id: 'l1', productId: p.id, listPrice: 10000, unitCost: 9500, priceSource: 'tier' as const };
    expect(lineIssues({ ...base, unitPrice: 10000, discountPct: 0 }, rule, db.config).some((i) => i.kind === 'margin_floor' && i.needsApproval)).toBe(true);
    expect(lineIssues({ ...base, unitCost: 5000, unitPrice: 10000, discountPct: 10 }, rule, db.config).some((i) => i.kind === 'discount')).toBe(true);
    const contract = lineIssues({ ...base, unitPrice: 10000, discountPct: 0, priceSource: 'contract' }, rule, db.config);
    expect(contract.every((i) => !i.needsApproval)).toBe(true);
  });
});

describe('cost shock workflow', () => {
  it('proposes prices, flags drafts, leaves issued quotes untouched, and applies only after approval', () => {
    let db = seed();
    const id = pid('ANG-5050');
    const before = db.products[id];
    const sc = db.config.scenario;
    const issuedBefore = JSON.stringify(db.quotes[sc.quoteA3].versions);
    ({ db } = exec(db, applyCostShock, { productIds: [id], pct: 14, reason: 'test shock' }, ctx('procurement')));
    const p = db.products[id];
    expect(p.latestCost).toBe(Math.round(before.latestCost * 1.14));
    expect(p.cost).toBe(before.cost);
    expect(p.basePrice).toBe(before.basePrice);
    const ch = db.priceChanges[p.pendingChangeId!];
    expect(ch.status).toBe('pending');
    expect(db.quotes[sc.quoteA1].recheck?.kind).toBe('cost_increase');
    expect(db.quotes[sc.quoteA2].recheck?.kind).toBe('cost_increase');
    expect(JSON.stringify(db.quotes[sc.quoteA3].versions)).toBe(issuedBefore);
    expect(db.quotes[sc.quoteA3].recheck).toBeUndefined();

    // Sales executive cannot approve
    expect(() => exec(db, approvePriceChange, { changeId: ch.id }, ctx('sales_exec'))).toThrow(DomainError);
    ({ db } = exec(db, decideApproval, { approvalId: ch.approvalId!, approve: true }, ctx('sales_manager')));
    const after = db.products[id];
    expect(after.basePrice).toBe(ch.proposedPrice);
    expect(after.cost).toBe(ch.newCost);
    expect(after.pendingChangeId).toBeUndefined();
    expect(db.quotes[sc.quoteA1].recheck?.kind).toBe('price_updated');
    expect(JSON.stringify(db.quotes[sc.quoteA3].versions)).toBe(issuedBefore);
    expect(Object.values(db.priceHistory).some((h) => h.changeId === ch.id)).toBe(true);
    expect(Object.values(db.audit).some((a) => a.action === 'price.approved' && a.entityId === id)).toBe(true);
  });

  it('rejecting restores the approved cost signal; rollback creates a new version', () => {
    let db = seed();
    const id = pid('PVP-D-050');
    const p0 = db.products[id];
    let r: { id: string };
    ({ db } = exec(db, applyCostShock, { productIds: [id], pct: 10, reason: 'x' }, ctx()));
    const pending = db.products[id].pendingChangeId!;
    ({ db } = exec(db, rejectPriceChange, { changeId: pending, note: 'wrong list' }, ctx('sales_manager')));
    expect(db.products[id].latestCost).toBe(p0.cost);
    const versionsBefore = Object.values(db.priceHistory).filter((h) => h.productId === id).length;
    ({ db, r } = exec(db, proposeManualPrice, { productId: id, price: p0.basePrice + 50, reason: 'rollback test', rollbackOf: 'x' }, ctx()));
    ({ db } = exec(db, approvePriceChange, { changeId: r.id }, ctx()));
    expect(Object.values(db.priceHistory).filter((h) => h.productId === id).length).toBe(versionsBefore + 1);
  });

  it('rejects shocks outside the -10%..+35% range', () => {
    expect(() => exec(seed(), applyCostShock, { productIds: [pid('ANG-5050')], pct: 50, reason: 'x' })).toThrow(DomainError);
  });
});
