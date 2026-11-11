import type {
  BusinessConfig, Customer, CustomerPriceAgreement, CustomerTier, ID, ISO, PriceRule, Product, QuoteLine, QuoteTotals, Sen, UomCode,
} from './types';
import type { DbState } from './state';
import { factorOf } from './uom';
import { lineTotal, marginPct, priceForMargin, priceForMarkup, roundSen, roundTo, roundUpTo } from '@/lib/money';

export const TIER_LABELS: Record<CustomerTier, string> = {
  walkin: 'Walk-in',
  trade: 'Trade',
  contractor: 'Contractor',
  key: 'Key account',
  project: 'Project',
};
export const TIERS: CustomerTier[] = ['walkin', 'trade', 'contractor', 'key', 'project'];

/** Product rule > category rule > global rule. */
export function resolveRule(db: Pick<DbState, 'priceRules'>, p: Pick<Product, 'id' | 'categoryId'>): PriceRule {
  let cat: PriceRule | undefined;
  let glob: PriceRule | undefined;
  for (const r of Object.values(db.priceRules)) {
    if (!r.active) continue;
    if (r.scope === 'product' && r.scopeId === p.id) return r;
    if (r.scope === 'category' && r.scopeId === p.categoryId) cat = r;
    if (r.scope === 'global') glob = r;
  }
  const out = cat ?? glob;
  if (!out) throw new Error('No active global price rule configured');
  return out;
}

/** Suggested list price per base unit from cost and rule (rounded up to the price ending). */
export function suggestedPrice(cost: Sen, rule: PriceRule): Sen {
  let raw: number;
  if (rule.method === 'markup') raw = priceForMarkup(cost, rule.markupPct);
  else if (rule.method === 'fixed' && rule.fixedPrice) raw = rule.fixedPrice;
  else raw = priceForMargin(cost, rule.targetMarginPct);
  return roundUpTo(raw, rule.roundingSen);
}

/** Lowest price that still meets the minimum margin floor. */
export function floorPrice(cost: Sen, rule: Pick<PriceRule, 'minMarginPct' | 'roundingSen'>): Sen {
  return roundUpTo(priceForMargin(cost, rule.minMarginPct), rule.roundingSen);
}

/** Tier list price per base unit. */
export function tierPrice(basePrice: Sen, tier: CustomerTier, rule: PriceRule): Sen {
  const d = rule.tierDiscountPct[tier] ?? 0;
  return roundTo(basePrice * (1 - d / 100), rule.roundingSen);
}

export function bulkDiscount(qtyBase: number, rule: PriceRule): number {
  let best = 0;
  for (const b of rule.bulkBreaks) if (qtyBase >= b.minQty && b.discountPct > best) best = b.discountPct;
  return best;
}

export function activeAgreement(
  db: Pick<DbState, 'agreements'>,
  customerId: ID | undefined,
  p: Pick<Product, 'id' | 'categoryId'>,
  at: ISO,
): CustomerPriceAgreement | undefined {
  if (!customerId) return undefined;
  let catMatch: CustomerPriceAgreement | undefined;
  for (const a of Object.values(db.agreements)) {
    if (a.customerId !== customerId) continue;
    if (a.validFrom > at || a.validTo < at) continue;
    if (a.productId === p.id) return a;
    if (!a.productId && a.categoryId === p.categoryId) catMatch = a;
  }
  return catMatch;
}

export interface PricedLine {
  unitPrice: Sen;
  listPrice: Sen;
  unitCost: Sen;
  factor: number;
  priceSource: QuoteLine['priceSource'];
  agreement?: CustomerPriceAgreement;
  bulkPct: number;
  marginPct: number;
  floorUnitPrice: Sen;
  rule: PriceRule;
}

/**
 * Price a line for a customer/tier at a quantity and UOM.
 * Cost uses the latest supplier cost signal so margin insight reflects replacement cost.
 */
export function priceLine(
  db: Pick<DbState, 'priceRules' | 'agreements'>,
  p: Product,
  opts: { customer?: Pick<Customer, 'id' | 'tier'>; tier?: CustomerTier; qty: number; uom: UomCode; at: ISO },
): PricedLine {
  const rule = resolveRule(db, p);
  const factor = factorOf(p, opts.uom);
  const tier = opts.customer?.tier ?? opts.tier ?? 'walkin';
  const qtyBase = opts.qty * factor;
  const ag = activeAgreement(db, opts.customer?.id, p, opts.at);
  const unitCost = roundSen(p.latestCost * factor);
  const floorUnitPrice = roundUpTo(priceForMargin(p.latestCost, rule.minMarginPct) * factor, rule.roundingSen);
  let base: Sen;
  let source: QuoteLine['priceSource'] = 'tier';
  let bulkPct = 0;
  if (ag) {
    base = ag.kind === 'fixed' && ag.fixedPrice ? ag.fixedPrice : roundTo(p.basePrice * (1 - (ag.discountPct ?? 0) / 100), rule.roundingSen);
    source = 'contract';
  } else {
    base = tierPrice(p.basePrice, tier, rule);
    bulkPct = bulkDiscount(qtyBase, rule);
    if (bulkPct > 0) {
      base = roundTo(base * (1 - bulkPct / 100), rule.roundingSen);
      source = 'bulk';
    }
  }
  const unitPrice = roundSen(base * factor);
  return {
    unitPrice,
    listPrice: unitPrice,
    unitCost,
    factor,
    priceSource: source,
    agreement: ag,
    bulkPct,
    marginPct: marginPct(unitPrice, unitCost),
    floorUnitPrice,
    rule,
  };
}

export function netUnitPrice(l: Pick<QuoteLine, 'unitPrice' | 'discountPct'>): number {
  return l.unitPrice * (1 - l.discountPct / 100);
}

export function lineMarginPct(l: Pick<QuoteLine, 'unitPrice' | 'discountPct' | 'unitCost'>): number {
  return marginPct(netUnitPrice(l), l.unitCost);
}

export type LineIssueKind = 'margin_floor' | 'discount' | 'price_override' | 'contract_margin';

export interface LineIssue {
  lineId: ID;
  productId: ID;
  kind: LineIssueKind;
  message: string;
  /** Whether this issue blocks issuing the quote until approved. */
  needsApproval: boolean;
}

/** Evaluate approval rules for a quote/POS line. */
export function lineIssues(
  line: Pick<QuoteLine, 'id' | 'productId' | 'unitPrice' | 'listPrice' | 'unitCost' | 'discountPct' | 'priceSource'>,
  rule: Pick<PriceRule, 'minMarginPct'>,
  cfg: Pick<BusinessConfig, 'discountApprovalPct'>,
): LineIssue[] {
  const issues: LineIssue[] = [];
  const m = lineMarginPct(line);
  if (m < rule.minMarginPct) {
    if (line.priceSource === 'contract') {
      issues.push({ lineId: line.id, productId: line.productId, kind: 'contract_margin', needsApproval: false, message: `Contract-locked price: margin ${m.toFixed(1)}% is below the ${rule.minMarginPct}% floor (contract honoured).` });
    } else {
      issues.push({ lineId: line.id, productId: line.productId, kind: 'margin_floor', needsApproval: true, message: `Margin ${m.toFixed(1)}% is below the ${rule.minMarginPct}% floor.` });
    }
  }
  if (line.discountPct > cfg.discountApprovalPct) {
    issues.push({ lineId: line.id, productId: line.productId, kind: 'discount', needsApproval: true, message: `Line discount ${line.discountPct}% exceeds the ${cfg.discountApprovalPct}% self-approval limit.` });
  }
  if (line.priceSource === 'manual' && line.listPrice > 0 && line.unitPrice < line.listPrice * (1 - cfg.discountApprovalPct / 100)) {
    const off = ((line.listPrice - line.unitPrice) / line.listPrice) * 100;
    issues.push({ lineId: line.id, productId: line.productId, kind: 'price_override', needsApproval: true, message: `Manual price is ${off.toFixed(1)}% below the list price.` });
  }
  return issues;
}

export function quoteIssues(
  db: Pick<DbState, 'priceRules' | 'products' | 'config'>,
  lines: QuoteLine[],
): LineIssue[] {
  const out: LineIssue[] = [];
  for (const l of lines) {
    const p = db.products[l.productId];
    if (!p) continue;
    out.push(...lineIssues(l, resolveRule(db, p), db.config));
  }
  return out;
}

export function computeTotals(
  lines: Pick<QuoteLine, 'unitPrice' | 'qty' | 'discountPct' | 'unitCost'>[],
  freight: Sen,
  tax: BusinessConfig['tax'],
): QuoteTotals {
  let subtotal = 0;
  let net = 0;
  let cost = 0;
  for (const l of lines) {
    subtotal += lineTotal(l.unitPrice, l.qty, 0);
    net += lineTotal(l.unitPrice, l.qty, l.discountPct);
    cost += roundSen(l.unitCost * l.qty);
  }
  const discount = subtotal - net;
  const taxAmt = tax.enabled ? roundSen(((net + freight) * tax.ratePct) / 100) : 0;
  return {
    subtotal,
    discount,
    freight,
    tax: taxAmt,
    total: net + freight + taxAmt,
    cost,
    marginPct: marginPct(net, cost),
  };
}

/** Landed cost per base unit from supplier cost + freight + handling + FX buffer. */
export function landedCost(supplierCost: Sen, freight: Sen, handling: Sen, fxPct: number): Sen {
  return roundSen((supplierCost + freight + handling) * (1 + fxPct / 100));
}

export type PriceStatus = 'approved' | 'pending' | 'needs_recheck' | 'below_margin' | 'contract_locked' | 'expired';

/** Status for the pricing table. */
export function productPriceStatus(db: Pick<DbState, 'priceRules'>, p: Product): PriceStatus {
  if (p.pendingChangeId) return 'pending';
  const rule = resolveRule(db, p);
  if (marginPct(p.basePrice, p.latestCost) < rule.minMarginPct) return 'below_margin';
  if (p.latestCost !== p.cost) return 'needs_recheck';
  return 'approved';
}

export const PRICE_STATUS_LABEL: Record<PriceStatus, string> = {
  approved: 'Approved',
  pending: 'Pending approval',
  needs_recheck: 'Needs recheck',
  below_margin: 'Below margin floor',
  contract_locked: 'Contract locked',
  expired: 'Expired',
};

/** Displayed "previous cost" for change % in the pricing table. */
export function previousCostFor(p: Product): Sen {
  return p.latestCost !== p.cost ? p.cost : p.previousCost;
}
