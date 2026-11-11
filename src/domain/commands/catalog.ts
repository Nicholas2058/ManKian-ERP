import type { ID, Product, Sen } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { audit, must, requirePerm, uid } from './helpers';

export type ProductInput = Pick<
  Product,
  'sku' | 'name' | 'categoryId' | 'brandId' | 'baseUom' | 'uoms' | 'specs' | 'description' | 'art' | 'weightKg' | 'preferredSupplierId' | 'leadTimeDays' | 'reorderPoint' | 'reorderQty' | 'volatility'
> & { familyId?: ID; familyName?: string; variantLabel?: string; barcode?: string; cost: Sen; basePrice: Sen };

function validate(db: DbState, a: ProductInput, selfId?: ID) {
  if (!a.sku.trim()) throw new DomainError('SKU is required.', 'validation');
  if (!a.name.trim()) throw new DomainError('Name is required.', 'validation');
  const dup = Object.values(db.products).find((p) => p.sku.toLowerCase() === a.sku.trim().toLowerCase() && p.id !== selfId);
  if (dup) throw new DomainError(`SKU ${a.sku} already exists (${dup.name}).`, 'validation');
  if (!db.categories[a.categoryId]) throw new DomainError('Unknown category.', 'validation');
  if (!db.brands[a.brandId]) throw new DomainError('Unknown brand.', 'validation');
  for (const u of a.uoms) if (!(u.factor > 0)) throw new DomainError(`UOM ${u.uom} needs a positive conversion factor.`, 'validation');
  if (!(a.cost > 0) || !(a.basePrice > 0)) throw new DomainError('Cost and list price must be greater than zero.', 'validation');
}

export function createProduct(db: DbState, ctx: Ctx, a: ProductInput): Product {
  requirePerm(ctx, 'catalog.edit');
  validate(db, a);
  const id = uid(db, 'p');
  const p: Product = {
    ...a,
    id,
    sku: a.sku.trim().toUpperCase(),
    barcode: a.barcode || `955${String(db.config.seq).padStart(10, '0')}`,
    status: 'active',
    abc: 'C',
    previousCost: a.cost,
    latestCost: a.cost,
    latestCostAt: ctx.now,
    latestCostSupplierId: a.preferredSupplierId,
    priceEffectiveFrom: ctx.now,
    watch: false,
    substitutes: [],
    datasheets: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  db.products[id] = p;
  const cv = uid(db, 'cv');
  db.costVersions[cv] = { id: cv, productId: id, supplierId: a.preferredSupplierId, supplierCost: a.cost, freight: 0, handling: 0, fxPct: 0, landedCost: a.cost, effectiveFrom: ctx.now, source: 'manual', status: 'active', createdAt: ctx.now, createdBy: ctx.actor.name, note: 'Initial cost' };
  const ph = uid(db, 'ph');
  db.priceHistory[ph] = { id: ph, productId: id, basePrice: a.basePrice, cost: a.cost, effectiveFrom: ctx.now, reason: 'New product', by: ctx.actor.name, kind: 'manual' };
  audit(db, ctx, { action: 'product.created', entityType: 'product', entityId: id, entityRef: p.sku, summary: `Created ${p.sku} ${p.name}` });
  return p;
}

/** Edit descriptive fields. Cost/price changes must go through the pricing workflow. */
export function updateProduct(db: DbState, ctx: Ctx, a: { productId: ID; patch: Partial<Omit<ProductInput, 'cost' | 'basePrice'>> }) {
  requirePerm(ctx, 'catalog.edit');
  const p = must(db.products[a.productId], 'Product');
  const next = { ...p, ...a.patch } as unknown as ProductInput;
  validate(db, { ...next, cost: p.cost, basePrice: p.basePrice }, p.id);
  const changes = Object.entries(a.patch)
    .filter(([k, v]) => JSON.stringify((p as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v))
    .map(([k, v]) => ({ field: k, from: JSON.stringify((p as unknown as Record<string, unknown>)[k] ?? ''), to: JSON.stringify(v ?? '') }));
  Object.assign(p, a.patch, { updatedAt: ctx.now });
  audit(db, ctx, { action: 'product.updated', entityType: 'product', entityId: p.id, entityRef: p.sku, summary: `Updated ${p.sku} (${changes.map((c) => c.field).join(', ') || 'no changes'})`, changes });
  return p;
}

export function setProductStatus(db: DbState, ctx: Ctx, a: { productId: ID; status: Product['status']; reason?: string }) {
  requirePerm(ctx, 'catalog.edit');
  const p = must(db.products[a.productId], 'Product');
  p.status = a.status;
  p.updatedAt = ctx.now;
  audit(db, ctx, { action: a.status === 'active' ? 'product.restored' : 'product.archived', entityType: 'product', entityId: p.id, entityRef: p.sku, summary: `${p.sku} ${a.status === 'active' ? 'restored' : 'archived (discontinued)'}`, reason: a.reason });
}

export function duplicateVariant(db: DbState, ctx: Ctx, a: { productId: ID; sku: string; variantLabel: string }) {
  const p = must(db.products[a.productId], 'Product');
  const copy = createProduct(db, ctx, {
    sku: a.sku,
    name: p.familyName ?? p.name,
    familyId: p.familyId ?? p.id,
    familyName: p.familyName ?? p.name,
    variantLabel: a.variantLabel,
    categoryId: p.categoryId,
    brandId: p.brandId,
    baseUom: p.baseUom,
    uoms: p.uoms.map((u) => ({ ...u })),
    specs: { ...p.specs, Size: a.variantLabel },
    description: p.description,
    art: p.art,
    weightKg: p.weightKg,
    preferredSupplierId: p.preferredSupplierId,
    leadTimeDays: p.leadTimeDays,
    reorderPoint: p.reorderPoint,
    reorderQty: p.reorderQty,
    volatility: p.volatility,
    cost: p.cost,
    basePrice: p.basePrice,
  });
  if (!p.familyId) {
    p.familyId = p.id;
    p.familyName = p.name;
  }
  return copy;
}

export function toggleWatch(db: DbState, _ctx: Ctx, a: { productId: ID }) {
  const p = must(db.products[a.productId], 'Product');
  p.watch = !p.watch;
  return p.watch;
}
