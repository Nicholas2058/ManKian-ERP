import type { DbState } from '@/domain/state';
import type { Product, PriceRule } from '@/domain/types';
import { previousCostFor, productPriceStatus, resolveRule, suggestedPrice, type PriceStatus } from '@/domain/pricing';
import { marginPct, markupPct, pctChange } from '@/lib/money';

export interface PriceRow {
  p: Product;
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  rule: PriceRule;
  cost: number;
  prevCost: number;
  costChangePct: number;
  target: number;
  suggested: number;
  list: number;
  marginAtList: number;
  markupAtList: number;
  status: PriceStatus;
  contracts: number;
  trend: number[];
  effective: string;
  pendingAction: string;
}

let cache: { db: DbState | null; rows: PriceRow[] } = { db: null, rows: [] };

export function priceRows(db: DbState): PriceRow[] {
  if (cache.db === db) return cache.rows;
  const cvBy: Record<string, { t: string; v: number }[]> = {};
  for (const cv of Object.values(db.costVersions)) {
    if (cv.status === 'rejected') continue;
    (cvBy[cv.productId] ||= []).push({ t: cv.createdAt, v: cv.landedCost });
  }
  const agBy: Record<string, number> = {};
  for (const a of Object.values(db.agreements)) if (a.productId) agBy[a.productId] = (agBy[a.productId] ?? 0) + 1;
  const rows = Object.values(db.products)
    .filter((p) => p.status === 'active')
    .map((p) => {
      const rule = resolveRule(db, p);
      const prev = previousCostFor(p);
      const pending = p.pendingChangeId ? db.priceChanges[p.pendingChangeId] : undefined;
      const status = productPriceStatus(db, p);
      return {
        p,
        id: p.id,
        sku: p.sku,
        name: `${p.name}${p.variantLabel ? ` — ${p.variantLabel}` : ''}`,
        category: db.categories[p.categoryId]?.name ?? '',
        brand: db.brands[p.brandId]?.name ?? '',
        rule,
        cost: p.latestCost,
        prevCost: prev,
        costChangePct: pctChange(prev, p.latestCost),
        target: rule.method === 'margin' ? rule.targetMarginPct : rule.markupPct,
        suggested: suggestedPrice(p.latestCost, rule),
        list: p.basePrice,
        marginAtList: marginPct(p.basePrice, p.latestCost),
        markupAtList: markupPct(p.basePrice, p.latestCost),
        status,
        contracts: agBy[p.id] ?? 0,
        trend: (cvBy[p.id] ?? []).sort((a, b) => a.t.localeCompare(b.t)).map((x) => x.v),
        effective: p.priceEffectiveFrom,
        pendingAction: pending ? `Approve ${pending.number}` : status === 'below_margin' ? 'Propose new price' : status === 'needs_recheck' ? 'Review cost' : '—',
      };
    });
  cache = { db, rows };
  return rows;
}
