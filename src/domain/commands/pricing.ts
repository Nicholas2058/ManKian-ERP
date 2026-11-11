import type { CostSource, ID, ISO, PriceChange, PriceRule, Product, Sen } from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { landedCost, resolveRule, suggestedPrice } from '../pricing';
import { formatPct, formatRM, marginPct, pctChange, roundSen } from '@/lib/money';
import { audit, must, nextNumber, notify, requirePerm, uid } from './helpers';
import { closeApproval, createApproval } from './approvalBase';

const OPEN_QUOTE = ['draft', 'pending_approval', 'approved'] as const;

export interface ProposeCostArgs {
  productId: ID;
  /** New supplier cost per base unit (before landed components). */
  supplierCost: Sen;
  supplierId?: ID;
  source: CostSource;
  freight?: Sen;
  handling?: Sen;
  fxPct?: number;
  effectiveFrom?: ISO;
  reason: string;
  proposedPrice?: Sen;
  batchId?: ID;
}

/**
 * Record a new supplier cost signal and raise a selling-price proposal for approval.
 * Never modifies issued quotations; open drafts are flagged for recheck instead.
 */
export function proposeCostChangeInternal(db: DbState, ctx: Ctx, a: ProposeCostArgs): PriceChange {
  const p = must(db.products[a.productId], 'Product');
  if (a.supplierCost <= 0) throw new DomainError(`Cost for ${p.sku} must be greater than zero.`, 'validation');
  const rule = resolveRule(db, p);
  const landed = landedCost(a.supplierCost, a.freight ?? 0, a.handling ?? 0, a.fxPct ?? 0);
  const supplierId = a.supplierId ?? p.latestCostSupplierId ?? p.preferredSupplierId;

  // Supersede any existing pending proposal for this product.
  if (p.pendingChangeId) {
    const prev = db.priceChanges[p.pendingChangeId];
    if (prev && prev.status === 'pending') {
      prev.status = 'superseded';
      prev.decidedAt = ctx.now;
      prev.decisionNote = 'Superseded by a newer cost update';
      if (prev.costVersionId && db.costVersions[prev.costVersionId]) db.costVersions[prev.costVersionId].status = 'superseded';
      closeApproval(db, ctx, prev.approvalId, 'cancelled', 'Superseded by a newer cost update');
    }
  }

  const cvId = uid(db, 'cv');
  db.costVersions[cvId] = {
    id: cvId,
    productId: p.id,
    supplierId,
    supplierCost: a.supplierCost,
    freight: a.freight ?? 0,
    handling: a.handling ?? 0,
    fxPct: a.fxPct ?? 0,
    landedCost: landed,
    effectiveFrom: a.effectiveFrom ?? ctx.now,
    source: a.source,
    status: 'proposed',
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
    note: a.reason,
  };

  const suggested = suggestedPrice(landed, rule);
  const proposed = a.proposedPrice ?? suggested;
  const id = uid(db, 'pc');
  const change: PriceChange = {
    id,
    number: nextNumber(db, 'PC', ctx.now),
    productId: p.id,
    batchId: a.batchId,
    source: a.source,
    supplierId,
    oldCost: p.cost,
    newCost: landed,
    oldPrice: p.basePrice,
    suggestedPrice: suggested,
    proposedPrice: proposed,
    costVersionId: cvId,
    effectiveFrom: a.effectiveFrom ?? ctx.now,
    reason: a.reason,
    status: 'pending',
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
  };
  db.priceChanges[id] = change;
  db.costVersions[cvId].changeId = id;

  p.latestCost = landed;
  p.latestCostAt = ctx.now;
  p.latestCostSupplierId = supplierId;
  p.pendingChangeId = id;
  p.updatedAt = ctx.now;

  const costPct = pctChange(p.cost, landed);
  const marginNow = marginPct(p.basePrice, landed);
  const severity = marginNow < rule.minMarginPct ? 'critical' : Math.abs(costPct) >= 8 ? 'warning' : 'info';
  const ap = createApproval(db, ctx, {
    type: 'price_change',
    refType: 'price_change',
    refId: id,
    refNumber: change.number,
    title: `${p.sku} price ${formatRM(p.basePrice)} → ${formatRM(proposed)}`,
    detail: `${p.name}: cost ${formatPct(costPct, 1, true)} (${formatRM(p.cost)} → ${formatRM(landed)}). Margin at current price ${formatPct(marginNow)}; floor ${rule.minMarginPct}%.`,
    amount: proposed,
    requiredRoles: ['sales_manager', 'owner'],
    severity,
  });
  change.approvalId = ap.id;

  flagQuotesForRecheck(db, ctx, p, 'cost_increase', `Supplier cost ${formatPct(costPct, 1, true)} on ${p.sku} (${formatRM(p.cost)} → ${formatRM(landed)}). Recheck margin before issuing.`);

  audit(db, ctx, {
    action: 'cost.proposed',
    entityType: 'product',
    entityId: p.id,
    entityRef: p.sku,
    summary: `New ${a.source.replace('_', ' ')} cost for ${p.sku}: ${formatRM(p.cost)} → ${formatRM(landed)} (${formatPct(costPct, 1, true)}); proposed price ${formatRM(proposed)}`,
    reason: a.reason,
    changes: [
      { field: 'latestCost', from: formatRM(p.cost), to: formatRM(landed) },
      { field: 'proposedPrice', from: formatRM(p.basePrice), to: formatRM(proposed) },
    ],
  });
  return change;
}

export function proposeCostChange(db: DbState, ctx: Ctx, a: ProposeCostArgs) {
  requirePerm(ctx, 'price.propose');
  return proposeCostChangeInternal(db, ctx, a);
}

/** Flag open (not yet issued) quotes that contain a product. Issued snapshots are never touched. */
export function flagQuotesForRecheck(db: DbState, ctx: Ctx, p: Product, kind: 'cost_increase' | 'price_updated', reason: string) {
  for (const q of Object.values(db.quotes)) {
    if (!(OPEN_QUOTE as readonly string[]).includes(q.status)) continue;
    const v = q.versions[q.currentVersion - 1];
    if (!v || !v.lines.some((l) => l.productId === p.id)) continue;
    const ids = new Set([...(q.recheck?.productIds ?? []), p.id]);
    q.recheck = { kind, reason, at: ctx.now, productIds: [...ids] };
    q.updatedAt = ctx.now;
  }
}

/** Shock: adjust latest supplier cost of several products by a percentage. */
export function applyCostShock(db: DbState, ctx: Ctx, a: { productIds: ID[]; pct: number; reason: string; supplierId?: ID }) {
  requirePerm(ctx, 'price.propose');
  if (a.pct < -10 || a.pct > 35) throw new DomainError('Shock must be between -10% and +35%.', 'validation');
  const out: PriceChange[] = [];
  for (const id of a.productIds) {
    const p = db.products[id];
    if (!p || p.status !== 'active') continue;
    const supplierCost = roundSen(p.latestCost * (1 + a.pct / 100));
    out.push(proposeCostChangeInternal(db, ctx, { productId: id, supplierCost, source: 'shock', reason: a.reason, supplierId: a.supplierId }));
  }
  if (out.length) {
    notify(db, ctx, {
      kind: 'pricing',
      severity: 'warning',
      title: `Cost update: ${out.length} SKU${out.length > 1 ? 's' : ''} ${formatPct(a.pct, 1, true)}`,
      body: `${a.reason}. Proposed prices are waiting in the approval inbox; draft quotes have been flagged for recheck.`,
      link: '/pricing?tab=approvals',
    });
  }
  return out;
}

export function approvePriceChange(db: DbState, ctx: Ctx, a: { changeId: ID; price?: Sen; note?: string }) {
  requirePerm(ctx, 'price.approve');
  const ch = must(db.priceChanges[a.changeId], 'Price change');
  if (ch.status !== 'pending') throw new DomainError(`${ch.number} is already ${ch.status}.`, 'state');
  const p = must(db.products[ch.productId], 'Product');
  const finalPrice = a.price ?? ch.proposedPrice;
  if (finalPrice <= 0) throw new DomainError('Approved price must be greater than zero.', 'validation');

  for (const cv of Object.values(db.costVersions)) {
    if (cv.productId === p.id && cv.status === 'active') cv.status = 'superseded';
  }
  if (ch.costVersionId && db.costVersions[ch.costVersionId]) db.costVersions[ch.costVersionId].status = 'active';

  ch.status = 'approved';
  ch.decidedAt = ctx.now;
  ch.decidedBy = ctx.actor.name;
  ch.decisionNote = a.note;
  ch.proposedPrice = finalPrice;

  const oldPrice = p.basePrice;
  p.previousCost = p.cost;
  p.cost = ch.newCost;
  p.latestCost = ch.newCost;
  p.basePrice = finalPrice;
  p.priceEffectiveFrom = ch.effectiveFrom > ctx.now ? ch.effectiveFrom : ctx.now;
  p.pendingChangeId = undefined;
  p.updatedAt = ctx.now;

  const hid = uid(db, 'ph');
  db.priceHistory[hid] = {
    id: hid,
    productId: p.id,
    basePrice: finalPrice,
    cost: ch.newCost,
    effectiveFrom: p.priceEffectiveFrom,
    changeId: ch.id,
    reason: ch.reason,
    by: ctx.actor.name,
    kind: ch.source === 'rollback' ? 'rollback' : 'approved_change',
  };
  closeApproval(db, ctx, ch.approvalId, 'approved', a.note);

  flagQuotesForRecheck(db, ctx, p, 'price_updated', `New list price ${formatRM(finalPrice)} approved for ${p.sku}. Reprice to create a new quote version; issued quotes keep their snapshot.`);

  audit(db, ctx, {
    action: 'price.approved',
    entityType: 'product',
    entityId: p.id,
    entityRef: p.sku,
    summary: `Approved ${ch.number}: ${p.sku} list price ${formatRM(oldPrice)} → ${formatRM(finalPrice)}, cost ${formatRM(ch.oldCost)} → ${formatRM(ch.newCost)}`,
    reason: a.note ?? ch.reason,
    changes: [
      { field: 'basePrice', from: formatRM(oldPrice), to: formatRM(finalPrice) },
      { field: 'cost', from: formatRM(ch.oldCost), to: formatRM(ch.newCost) },
    ],
  });
  notify(db, ctx, {
    kind: 'pricing',
    severity: 'success',
    title: `Price approved · ${p.sku}`,
    body: `${p.name} now ${formatRM(finalPrice)} / ${p.baseUom}. Draft quotes flagged to reprice.`,
    link: `/pricing?sku=${p.id}`,
  });
  maybeCloseBatch(db, ch.batchId);
  return ch;
}

export function rejectPriceChange(db: DbState, ctx: Ctx, a: { changeId: ID; note?: string }) {
  requirePerm(ctx, 'price.approve');
  const ch = must(db.priceChanges[a.changeId], 'Price change');
  if (ch.status !== 'pending') throw new DomainError(`${ch.number} is already ${ch.status}.`, 'state');
  const p = must(db.products[ch.productId], 'Product');
  ch.status = 'rejected';
  ch.decidedAt = ctx.now;
  ch.decidedBy = ctx.actor.name;
  ch.decisionNote = a.note;
  if (ch.costVersionId && db.costVersions[ch.costVersionId]) db.costVersions[ch.costVersionId].status = 'rejected';
  p.pendingChangeId = undefined;
  p.latestCost = p.cost;
  p.updatedAt = ctx.now;
  closeApproval(db, ctx, ch.approvalId, 'rejected', a.note);
  // Clear recheck flags caused only by this product.
  for (const q of Object.values(db.quotes)) {
    if (!q.recheck) continue;
    const rest = q.recheck.productIds.filter((id) => id !== p.id);
    if (rest.length === q.recheck.productIds.length) continue;
    q.recheck = rest.length ? { ...q.recheck, productIds: rest } : undefined;
  }
  audit(db, ctx, {
    action: 'price.rejected',
    entityType: 'product',
    entityId: p.id,
    entityRef: p.sku,
    summary: `Rejected ${ch.number} for ${p.sku}; current price ${formatRM(p.basePrice)} and cost ${formatRM(p.cost)} retained`,
    reason: a.note,
  });
  maybeCloseBatch(db, ch.batchId);
  return ch;
}

function maybeCloseBatch(db: DbState, batchId?: ID) {
  if (!batchId) return;
  const b = db.priceBatches[batchId];
  if (!b) return;
  const st = b.changeIds.map((id) => db.priceChanges[id]?.status);
  if (st.some((s) => s === 'pending')) return;
  const approved = st.filter((s) => s === 'approved').length;
  b.status = approved === st.length ? 'approved' : approved === 0 ? 'rejected' : 'partially_approved';
}

/** Propose a manual list price (or a rollback to a historical price) — creates a new version, never overwrites history. */
export function proposeManualPrice(db: DbState, ctx: Ctx, a: { productId: ID; price: Sen; reason: string; rollbackOf?: ID }) {
  requirePerm(ctx, 'price.propose');
  const p = must(db.products[a.productId], 'Product');
  if (a.price <= 0) throw new DomainError('Price must be greater than zero.', 'validation');
  const cost = p.latestCost;
  return proposeCostChangeInternal(db, ctx, {
    productId: p.id,
    supplierCost: cost,
    source: a.rollbackOf ? 'rollback' : 'manual',
    proposedPrice: a.price,
    reason: a.reason,
    supplierId: p.latestCostSupplierId,
  });
}

export interface CostImportRow {
  productId: ID;
  supplierCost: Sen;
  supplierId?: ID;
  effectiveFrom?: ISO;
  note?: string;
}

export function importCostBatch(
  db: DbState,
  ctx: Ctx,
  a: { fileName: string; rows: CostImportRow[]; rowCount: number; errorCount: number; effectiveFrom: ISO },
) {
  requirePerm(ctx, 'price.propose');
  if (!a.rows.length) throw new DomainError('No valid rows to import.', 'validation');
  const id = uid(db, 'pb');
  const number = nextNumber(db, 'PB', ctx.now);
  const changes = a.rows.map((r) =>
    proposeCostChangeInternal(db, ctx, {
      productId: r.productId,
      supplierCost: r.supplierCost,
      supplierId: r.supplierId,
      source: 'csv',
      effectiveFrom: r.effectiveFrom ?? a.effectiveFrom,
      reason: r.note || `Supplier price list ${a.fileName}`,
      batchId: id,
    }),
  );
  db.priceBatches[id] = {
    id,
    number,
    fileName: a.fileName,
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
    rowCount: a.rowCount,
    validCount: a.rows.length,
    errorCount: a.errorCount,
    changeIds: changes.map((c) => c.id),
    effectiveFrom: a.effectiveFrom,
    status: 'pending',
  };
  audit(db, ctx, {
    action: 'pricing.batch_imported',
    entityType: 'price_batch',
    entityId: id,
    entityRef: number,
    summary: `Imported ${a.rows.length} cost rows from ${a.fileName} (${a.errorCount} rejected rows)`,
  });
  notify(db, ctx, { kind: 'pricing', severity: 'info', title: `Batch ${number} ready for approval`, body: `${a.rows.length} proposed price changes from ${a.fileName}.`, link: '/pricing?tab=batch' });
  return db.priceBatches[id];
}

export function decideBatch(db: DbState, ctx: Ctx, a: { batchId: ID; approve: boolean; note?: string }) {
  requirePerm(ctx, 'price.approve');
  const b = must(db.priceBatches[a.batchId], 'Batch');
  for (const cid of b.changeIds) {
    const ch = db.priceChanges[cid];
    if (!ch || ch.status !== 'pending') continue;
    if (a.approve) approvePriceChange(db, ctx, { changeId: cid, note: a.note ?? `Batch ${b.number} approved` });
    else rejectPriceChange(db, ctx, { changeId: cid, note: a.note ?? `Batch ${b.number} rejected` });
  }
  maybeCloseBatch(db, b.id);
  return b;
}

export function updatePriceRule(db: DbState, ctx: Ctx, a: { ruleId: ID; patch: Partial<PriceRule> }) {
  requirePerm(ctx, 'price.rules');
  const r = must(db.priceRules[a.ruleId], 'Price rule');
  const changes: { field: string; from: string; to: string }[] = [];
  for (const [k, v] of Object.entries(a.patch)) {
    const before = (r as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(before) !== JSON.stringify(v)) changes.push({ field: k, from: JSON.stringify(before), to: JSON.stringify(v) });
  }
  Object.assign(r, a.patch, { updatedAt: ctx.now, updatedBy: ctx.actor.name });
  audit(db, ctx, { action: 'pricing.rule_updated', entityType: 'price_rule', entityId: r.id, entityRef: r.name, summary: `Updated pricing rule "${r.name}"`, changes });
  return r;
}

export function createCategoryRule(db: DbState, ctx: Ctx, a: { categoryId: ID }) {
  requirePerm(ctx, 'price.rules');
  const existing = Object.values(db.priceRules).find((r) => r.scope === 'category' && r.scopeId === a.categoryId);
  if (existing) return existing;
  const g = Object.values(db.priceRules).find((r) => r.scope === 'global');
  if (!g) throw new DomainError('No global rule');
  const cat = must(db.categories[a.categoryId], 'Category');
  const id = uid(db, 'pr');
  db.priceRules[id] = { ...g, id, name: `${cat.name} rule`, scope: 'category', scopeId: a.categoryId, updatedAt: ctx.now, updatedBy: ctx.actor.name };
  audit(db, ctx, { action: 'pricing.rule_created', entityType: 'price_rule', entityId: id, entityRef: cat.name, summary: `Created category rule for ${cat.name}` });
  return db.priceRules[id];
}
