import type {
  Channel, Customer, Enquiry, ExtractedLine, ID, ISO, Quote, QuoteLine, QuoteVersion, SalesOrder, SalesOrderLine, Sen, UomCode,
} from '../types';
import { DomainError, type Ctx, type DbState } from '../state';
import { computeTotals, priceLine, quoteIssues } from '../pricing';
import { factorOf, round4 } from '../uom';
import { productStock } from '../inventory';
import { creditPosition, orderUninvoicedValue } from '../finance';
import { extractLines } from '../parse';
import { addDays, startOfDayKL } from '@/lib/dates';
import { formatRM } from '@/lib/money';
import { audit, deriveOrderStatus, must, nextNumber, notify, orderEvent, refreshOrder, requirePerm, uid } from './helpers';
import { closeApproval, createApproval } from './approvalBase';

// ═════════════════════════ Customers ═════════════════════════

export function createCustomer(db: DbState, ctx: Ctx, a: Omit<Customer, 'id' | 'code' | 'createdAt' | 'notes' | 'status'> & { status?: Customer['status'] }) {
  requirePerm(ctx, 'customer.edit');
  if (!a.name.trim()) throw new DomainError('Customer name is required.', 'validation');
  const id = uid(db, 'cu');
  const code = nextNumber(db, 'C', ctx.now).replace(/^C-\d\d-/, 'C');
  db.customers[id] = { ...a, id, code, createdAt: ctx.now, notes: [], status: a.status ?? 'active' };
  audit(db, ctx, { action: 'customer.created', entityType: 'customer', entityId: id, entityRef: code, summary: `Created customer ${a.name} (${a.tier} tier)` });
  return db.customers[id];
}

export function updateCustomer(db: DbState, ctx: Ctx, a: { customerId: ID; patch: Partial<Customer> }) {
  requirePerm(ctx, 'customer.edit');
  const c = must(db.customers[a.customerId], 'Customer');
  const changes = Object.entries(a.patch)
    .filter(([k, v]) => JSON.stringify((c as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v))
    .map(([k, v]) => ({ field: k, from: String((c as unknown as Record<string, unknown>)[k] ?? ''), to: String(v ?? '') }));
  Object.assign(c, a.patch);
  audit(db, ctx, { action: 'customer.updated', entityType: 'customer', entityId: c.id, entityRef: c.code, summary: `Updated ${c.name}`, changes });
  return c;
}

export function addCustomerNote(db: DbState, ctx: Ctx, a: { customerId: ID; text: string }) {
  const c = must(db.customers[a.customerId], 'Customer');
  if (!a.text.trim()) throw new DomainError('Note is empty.', 'validation');
  c.notes.unshift({ id: uid(db, 'cn'), at: ctx.now, by: ctx.actor.name, text: a.text.trim() });
  audit(db, ctx, { action: 'customer.note', entityType: 'customer', entityId: c.id, entityRef: c.code, summary: `Note added to ${c.name}` });
}

// ═════════════════════════ Enquiries / RFQ ═════════════════════════

export function receiveEnquiry(
  db: DbState,
  ctx: Ctx,
  a: { channel: Channel; customerId?: ID; contactName: string; contactPhone: string; subject: string; text: string; siteName?: string; requiredBy?: ISO; assignedTo?: string },
): Enquiry {
  const id = uid(db, 'en');
  const number = nextNumber(db, 'ENQ', ctx.now);
  const lines = extractLines(a.text, Object.values(db.products), () => uid(db, 'el'));
  const e: Enquiry = {
    id,
    number,
    channel: a.channel,
    customerId: a.customerId,
    contactName: a.contactName,
    contactPhone: a.contactPhone,
    subject: a.subject,
    status: 'new',
    messages: [{ id: uid(db, 'em'), from: 'customer', text: a.text, at: ctx.now }],
    lines,
    siteName: a.siteName,
    requiredBy: a.requiredBy,
    assignedTo: a.assignedTo ?? 'Kevin Tan',
    activity: [{ at: ctx.now, by: 'System', text: `Received via ${a.channel} (simulated channel). ${lines.length} line(s) suggested by rule-based extraction.` }],
    createdAt: ctx.now,
    updatedAt: ctx.now,
    unread: true,
  };
  db.enquiries[id] = e;
  notify(db, ctx, { kind: 'quote', severity: 'info', title: `New ${a.channel} enquiry · ${a.contactName}`, body: a.subject, link: `/enquiries?id=${id}` });
  audit(db, ctx, { action: 'enquiry.received', entityType: 'enquiry', entityId: id, entityRef: number, summary: `Enquiry ${number} from ${a.contactName} via ${a.channel}` });
  return e;
}

export function addEnquiryMessage(db: DbState, ctx: Ctx, a: { enquiryId: ID; text: string; from: 'customer' | 'staff'; reparse?: boolean }) {
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  if (!a.text.trim()) throw new DomainError('Message is empty.', 'validation');
  e.messages.push({ id: uid(db, 'em'), from: a.from, text: a.text.trim(), at: ctx.now });
  e.updatedAt = ctx.now;
  if (a.from === 'customer') e.unread = true;
  if (a.from === 'customer' && a.reparse) {
    const more = extractLines(a.text, Object.values(db.products), () => uid(db, 'el'));
    e.lines.push(...more);
  }
}

export function markEnquiryRead(db: DbState, _ctx: Ctx, a: { enquiryId: ID }) {
  const e = db.enquiries[a.enquiryId];
  if (e) e.unread = false;
}

export function setEnquiryLines(db: DbState, ctx: Ctx, a: { enquiryId: ID; lines: ExtractedLine[] }) {
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  e.lines = a.lines;
  e.updatedAt = ctx.now;
}

export function reparseEnquiry(db: DbState, ctx: Ctx, a: { enquiryId: ID }) {
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  const text = e.messages.filter((m) => m.from === 'customer').map((m) => m.text).join('\n');
  e.lines = extractLines(text, Object.values(db.products), () => uid(db, 'el'));
  e.activity.push({ at: ctx.now, by: ctx.actor.name, text: `Re-ran rule-based extraction (${e.lines.length} lines).` });
}

export function qualifyEnquiry(db: DbState, ctx: Ctx, a: { enquiryId: ID; customerId: ID; siteName?: string; requiredBy?: ISO }) {
  requirePerm(ctx, 'quote.create');
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  must(db.customers[a.customerId], 'Customer');
  e.customerId = a.customerId;
  if (a.siteName !== undefined) e.siteName = a.siteName;
  if (a.requiredBy) e.requiredBy = a.requiredBy;
  if (e.status === 'new') e.status = 'qualified';
  e.updatedAt = ctx.now;
  e.activity.push({ at: ctx.now, by: ctx.actor.name, text: `Qualified and linked to ${db.customers[a.customerId].name}.` });
  audit(db, ctx, { action: 'enquiry.qualified', entityType: 'enquiry', entityId: e.id, entityRef: e.number, summary: `Qualified ${e.number}` });
}

export function setFollowUp(db: DbState, ctx: Ctx, a: { enquiryId: ID; at: ISO; note?: string }) {
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  e.followUpAt = a.at;
  e.activity.push({ at: ctx.now, by: ctx.actor.name, text: `Follow-up reminder set${a.note ? `: ${a.note}` : ''}.` });
}

export function addEnquiryNote(db: DbState, ctx: Ctx, a: { enquiryId: ID; text: string }) {
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  e.activity.push({ at: ctx.now, by: ctx.actor.name, text: a.text });
}

export function markEnquiryLost(db: DbState, ctx: Ctx, a: { enquiryId: ID; reason: string }) {
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  e.status = 'lost';
  e.lostReason = a.reason;
  e.activity.push({ at: ctx.now, by: ctx.actor.name, text: `Marked lost: ${a.reason}` });
  audit(db, ctx, { action: 'enquiry.lost', entityType: 'enquiry', entityId: e.id, entityRef: e.number, summary: `${e.number} lost`, reason: a.reason });
}

export function convertEnquiryToRfq(db: DbState, ctx: Ctx, a: { enquiryId: ID; siteId?: ID }) {
  requirePerm(ctx, 'quote.create');
  const e = must(db.enquiries[a.enquiryId], 'Enquiry');
  if (!e.customerId) throw new DomainError('Link the enquiry to a customer (qualify it) before creating an RFQ.', 'validation');
  if (e.rfqId) return db.rfqs[e.rfqId];
  const unresolved = e.lines.filter((l) => !l.productId);
  if (!e.lines.length) throw new DomainError('Add at least one line before creating an RFQ.', 'validation');
  if (unresolved.length) throw new DomainError(`${unresolved.length} line(s) have no SKU selected. Resolve them first.`, 'validation');
  for (const l of e.lines) factorOf(db.products[l.productId!], l.uom);
  const id = uid(db, 'rq');
  const number = nextNumber(db, 'RFQ', ctx.now);
  const c = db.customers[e.customerId];
  const site = a.siteId ?? c.sites.find((s) => e.siteName && s.name.toLowerCase().includes(e.siteName.toLowerCase().split(' ')[0]))?.id ?? c.sites[0]?.id;
  db.rfqs[id] = {
    id,
    number,
    enquiryId: e.id,
    customerId: e.customerId,
    siteId: site,
    lines: e.lines.map((l) => ({ id: uid(db, 'rl'), productId: l.productId!, qty: l.qty, uom: l.uom, specs: l.note })),
    requiredBy: e.requiredBy ?? addDays(ctx.now, 3),
    status: 'open',
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
  };
  e.rfqId = id;
  e.status = 'rfq';
  e.updatedAt = ctx.now;
  e.activity.push({ at: ctx.now, by: ctx.actor.name, text: `Structured RFQ ${number} created with ${e.lines.length} lines.` });
  audit(db, ctx, { action: 'rfq.created', entityType: 'rfq', entityId: id, entityRef: number, summary: `RFQ ${number} from ${e.number}` });
  return db.rfqs[id];
}

// ═════════════════════════ Quotes ═════════════════════════

function buildLine(db: DbState, ctx: Ctx, customerId: ID, productId: ID, qty: number, uom: UomCode): QuoteLine {
  const p = must(db.products[productId], 'Product');
  if (p.status !== 'active') throw new DomainError(`${p.sku} is discontinued.`, 'validation');
  if (!(qty > 0)) throw new DomainError('Quantity must be greater than zero.', 'validation');
  const c = db.customers[customerId];
  const pr = priceLine(db, p, { customer: c, qty, uom, at: ctx.now });
  return {
    id: uid(db, 'ql'),
    productId,
    description: p.name + (p.variantLabel ? ` — ${p.variantLabel}` : ''),
    qty,
    uom,
    factor: pr.factor,
    unitPrice: pr.unitPrice,
    listPrice: pr.listPrice,
    unitCost: pr.unitCost,
    discountPct: 0,
    priceSource: pr.priceSource,
    leadTimeDays: productStock(db, productId).available >= qty * pr.factor ? 0 : p.leadTimeDays,
  };
}

function curVersion(q: Quote): QuoteVersion {
  return q.versions[q.currentVersion - 1];
}

function recalc(db: DbState, q: Quote) {
  const v = curVersion(q);
  v.totals = computeTotals(v.lines, v.freight, db.config.tax);
  q.contractLocked = v.lines.some((l) => l.priceSource === 'contract');
}

function editableVersion(db: DbState, ctx: Ctx, q: Quote): QuoteVersion {
  const v = curVersion(q);
  if (v.frozen) throw new DomainError(`${q.number} v${v.version} has been issued and is locked. Use "Revise" to create a new version.`, 'state');
  if (q.status === 'pending_approval' || q.status === 'approved') {
    for (const id of q.approvalIds) closeApproval(db, ctx, id, 'cancelled', 'Quote edited after submission');
    q.status = 'draft';
  }
  if (q.status !== 'draft') throw new DomainError(`${q.number} is ${q.status} and cannot be edited.`, 'state');
  return v;
}

export function createQuote(
  db: DbState,
  ctx: Ctx,
  a: {
    customerId: ID;
    siteId?: ID;
    lines?: { productId: ID; qty: number; uom: UomCode; discountPct?: number; unitPrice?: Sen }[];
    rfqId?: ID;
    enquiryId?: ID;
    fulfilment?: 'delivery' | 'pickup';
    validityDays?: number;
    notes?: string;
    freight?: Sen;
    projectRef?: string;
    channel?: Channel;
  },
): Quote {
  requirePerm(ctx, 'quote.create');
  const c = must(db.customers[a.customerId], 'Customer');
  const id = uid(db, 'qt');
  const number = nextNumber(db, 'QT', ctx.now);
  const lines = (a.lines ?? []).map((l) => {
    const ql = buildLine(db, ctx, c.id, l.productId, l.qty, l.uom);
    if (l.discountPct) ql.discountPct = l.discountPct;
    if (l.unitPrice !== undefined && l.unitPrice !== ql.unitPrice) {
      ql.unitPrice = l.unitPrice;
      ql.priceSource = 'manual';
    }
    return ql;
  });
  const v: QuoteVersion = {
    version: 1,
    lines,
    freight: a.freight ?? 0,
    validityDays: a.validityDays ?? db.config.defaultValidityDays,
    notes: a.notes ?? '',
    terms: db.config.defaultTerms,
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
    reason: a.rfqId ? 'Created from RFQ' : 'New quotation',
    frozen: false,
    totals: computeTotals(lines, a.freight ?? 0, db.config.tax),
  };
  const q: Quote = {
    id,
    number,
    customerId: c.id,
    siteId: a.siteId ?? c.sites[0]?.id,
    rfqId: a.rfqId,
    enquiryId: a.enquiryId,
    status: 'draft',
    versions: [v],
    currentVersion: 1,
    fulfilment: a.fulfilment ?? 'delivery',
    createdAt: ctx.now,
    updatedAt: ctx.now,
    createdBy: ctx.actor.name,
    owner: ctx.actor.name,
    contractLocked: lines.some((l) => l.priceSource === 'contract'),
    approvalIds: [],
    projectRef: a.projectRef,
    channel: a.channel,
  };
  db.quotes[id] = q;
  audit(db, ctx, { action: 'quote.created', entityType: 'quote', entityId: id, entityRef: number, summary: `Draft ${number} for ${c.name} (${lines.length} lines)` });
  return q;
}

export function createQuoteFromRfq(db: DbState, ctx: Ctx, a: { rfqId: ID }) {
  const r = must(db.rfqs[a.rfqId], 'RFQ');
  if (r.quoteId && db.quotes[r.quoteId]) return db.quotes[r.quoteId];
  const e = r.enquiryId ? db.enquiries[r.enquiryId] : undefined;
  const q = createQuote(db, ctx, {
    customerId: r.customerId,
    siteId: r.siteId,
    rfqId: r.id,
    enquiryId: r.enquiryId,
    lines: r.lines.map((l) => ({ productId: l.productId, qty: l.qty, uom: l.uom })),
    channel: e?.channel,
    notes: e ? `Ref enquiry ${e.number}${e.siteName ? ` · site ${e.siteName}` : ''}${e.requiredBy ? ` · required by ${e.requiredBy.slice(0, 10)}` : ''}` : '',
  });
  r.quoteId = q.id;
  r.status = 'quoted';
  if (e) {
    e.quoteId = q.id;
    e.status = 'quoted';
    e.activity.push({ at: ctx.now, by: ctx.actor.name, text: `Draft quotation ${q.number} created.` });
  }
  return q;
}

export function addQuoteLine(db: DbState, ctx: Ctx, a: { quoteId: ID; productId: ID; qty: number; uom: UomCode }) {
  requirePerm(ctx, 'quote.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  const v = editableVersion(db, ctx, q);
  const existing = v.lines.find((l) => l.productId === a.productId && l.uom === a.uom && l.priceSource !== 'manual');
  if (existing) {
    existing.qty = round4(existing.qty + a.qty);
    const fresh = buildLine(db, ctx, q.customerId, a.productId, existing.qty, a.uom);
    Object.assign(existing, { unitPrice: fresh.unitPrice, listPrice: fresh.listPrice, unitCost: fresh.unitCost, priceSource: fresh.priceSource, leadTimeDays: fresh.leadTimeDays });
  } else {
    v.lines.push(buildLine(db, ctx, q.customerId, a.productId, a.qty, a.uom));
  }
  q.updatedAt = ctx.now;
  recalc(db, q);
}

export function updateQuoteLine(
  db: DbState,
  ctx: Ctx,
  a: { quoteId: ID; lineId: ID; patch: Partial<Pick<QuoteLine, 'qty' | 'uom' | 'unitPrice' | 'discountPct' | 'note' | 'leadTimeDays'>> },
) {
  requirePerm(ctx, 'quote.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  const v = editableVersion(db, ctx, q);
  const l = must(v.lines.find((x) => x.id === a.lineId), 'Quote line');
  const { patch } = a;
  if (patch.discountPct !== undefined && (patch.discountPct < 0 || patch.discountPct > 60)) throw new DomainError('Discount must be between 0 and 60%.', 'validation');
  if (patch.qty !== undefined && !(patch.qty > 0)) throw new DomainError('Quantity must be greater than zero.', 'validation');
  if (patch.unitPrice !== undefined && !(patch.unitPrice > 0)) throw new DomainError('Unit price must be greater than zero.', 'validation');
  const repriceNeeded = (patch.qty !== undefined && patch.qty !== l.qty) || (patch.uom !== undefined && patch.uom !== l.uom);
  Object.assign(l, patch);
  if (repriceNeeded) {
    const fresh = buildLine(db, ctx, q.customerId, l.productId, l.qty, l.uom);
    l.factor = fresh.factor;
    l.unitCost = fresh.unitCost;
    l.listPrice = fresh.listPrice;
    l.leadTimeDays = patch.leadTimeDays ?? fresh.leadTimeDays;
    if (l.priceSource !== 'manual' || patch.uom) {
      l.unitPrice = fresh.unitPrice;
      l.priceSource = fresh.priceSource;
    }
  }
  if (patch.unitPrice !== undefined && patch.unitPrice !== l.listPrice) l.priceSource = 'manual';
  if (patch.unitPrice !== undefined && patch.unitPrice === l.listPrice && l.priceSource === 'manual') l.priceSource = 'tier';
  q.updatedAt = ctx.now;
  recalc(db, q);
}

export function removeQuoteLine(db: DbState, ctx: Ctx, a: { quoteId: ID; lineId: ID }) {
  requirePerm(ctx, 'quote.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  const v = editableVersion(db, ctx, q);
  v.lines = v.lines.filter((l) => l.id !== a.lineId);
  q.updatedAt = ctx.now;
  recalc(db, q);
}

export function updateQuoteHeader(
  db: DbState,
  ctx: Ctx,
  a: { quoteId: ID; patch: { freight?: Sen; validityDays?: number; notes?: string; terms?: string; siteId?: ID; fulfilment?: 'delivery' | 'pickup'; projectRef?: string } },
) {
  requirePerm(ctx, 'quote.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  const v = editableVersion(db, ctx, q);
  const { freight, validityDays, notes, terms, siteId, fulfilment, projectRef } = a.patch;
  if (freight !== undefined) {
    if (freight < 0) throw new DomainError('Freight cannot be negative.', 'validation');
    v.freight = freight;
  }
  if (validityDays !== undefined) v.validityDays = validityDays;
  if (notes !== undefined) v.notes = notes;
  if (terms !== undefined) v.terms = terms;
  if (siteId !== undefined) q.siteId = siteId;
  if (fulfilment !== undefined) q.fulfilment = fulfilment;
  if (projectRef !== undefined) q.projectRef = projectRef;
  q.updatedAt = ctx.now;
  recalc(db, q);
}

function newVersion(db: DbState, ctx: Ctx, q: Quote, reason: string, reprice: boolean): QuoteVersion {
  const base = curVersion(q);
  const lines: QuoteLine[] = base.lines.map((l) => {
    if (!reprice) return { ...l, id: uid(db, 'ql') };
    const fresh = buildLine(db, ctx, q.customerId, l.productId, l.qty, l.uom);
    const keepManual = l.priceSource === 'manual';
    return {
      ...l,
      id: uid(db, 'ql'),
      unitCost: fresh.unitCost,
      listPrice: fresh.listPrice,
      unitPrice: keepManual ? l.unitPrice : fresh.unitPrice,
      priceSource: keepManual ? 'manual' : fresh.priceSource,
      leadTimeDays: fresh.leadTimeDays,
      factor: fresh.factor,
    };
  });
  const v: QuoteVersion = {
    version: q.versions.length + 1,
    lines,
    freight: base.freight,
    validityDays: base.validityDays,
    notes: base.notes,
    terms: base.terms,
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
    reason,
    frozen: false,
    totals: computeTotals(lines, base.freight, db.config.tax),
  };
  q.versions.push(v);
  q.currentVersion = v.version;
  q.status = 'draft';
  q.updatedAt = ctx.now;
  q.contractLocked = lines.some((l) => l.priceSource === 'contract');
  return v;
}

/** Reprice with current list prices and costs — always creates a new version; history is preserved. */
export function repriceQuote(db: DbState, ctx: Ctx, a: { quoteId: ID }) {
  requirePerm(ctx, 'quote.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (!['draft', 'pending_approval', 'approved', 'expired'].includes(q.status)) throw new DomainError(`${q.number} is ${q.status}; issued quotes keep their snapshot. Use Revise.`, 'state');
  for (const id of q.approvalIds) closeApproval(db, ctx, id, 'cancelled', 'Quote repriced');
  const prevTotal = curVersion(q).totals.total;
  if (q.status === 'expired') q.reissue = true;
  const v = newVersion(db, ctx, q, q.recheck ? `Repriced after ${q.recheck.kind === 'cost_increase' ? 'cost increase' : 'price update'}` : 'Repriced with current prices', true);
  q.recheck = undefined;
  audit(db, ctx, { action: 'quote.repriced', entityType: 'quote', entityId: q.id, entityRef: q.number, summary: `${q.number} repriced as v${v.version}: ${formatRM(prevTotal)} → ${formatRM(v.totals.total)}` });
  return v;
}

/** Revise an issued/expired/rejected quote: creates a new editable version (prices kept). */
export function reviseQuote(db: DbState, ctx: Ctx, a: { quoteId: ID; reason: string }) {
  requirePerm(ctx, 'quote.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (['converted', 'cancelled', 'accepted'].includes(q.status)) throw new DomainError(`${q.number} is ${q.status} and cannot be revised.`, 'state');
  if (q.status === 'expired') q.reissue = true;
  const v = newVersion(db, ctx, q, a.reason || 'Revision', false);
  audit(db, ctx, { action: 'quote.revised', entityType: 'quote', entityId: q.id, entityRef: q.number, summary: `${q.number} revised to v${v.version}`, reason: a.reason });
  return v;
}

export function submitQuote(db: DbState, ctx: Ctx, a: { quoteId: ID }) {
  requirePerm(ctx, 'quote.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (q.status !== 'draft') throw new DomainError(`${q.number} is ${q.status}; only drafts can be submitted.`, 'state');
  const v = curVersion(q);
  if (!v.lines.length) throw new DomainError('Add at least one line before submitting.', 'validation');
  recalc(db, q);
  const issues = quoteIssues(db, v.lines).filter((i) => i.needsApproval);
  const reissue = !!q.reissue;
  if (!issues.length && !reissue) {
    q.status = 'approved';
    q.updatedAt = ctx.now;
    audit(db, ctx, { action: 'quote.auto_approved', entityType: 'quote', entityId: q.id, entityRef: q.number, summary: `${q.number} v${v.version} within pricing policy — auto-approved` });
    return { status: q.status, issues };
  }
  const kind = reissue ? 'quote_reissue' : issues.some((i) => i.kind === 'margin_floor') ? 'margin_floor' : issues.some((i) => i.kind === 'price_override') ? 'price_override' : 'discount';
  const c = db.customers[q.customerId];
  const ap = createApproval(db, ctx, {
    type: kind,
    refType: 'quote',
    refId: q.id,
    refNumber: q.number,
    title: `${q.number} v${v.version} · ${c?.name ?? ''}`,
    detail: [reissue ? 'Re-issue of an expired quotation.' : '', ...issues.map((i) => `${db.products[i.productId]?.sku}: ${i.message}`)].filter(Boolean).join(' '),
    amount: v.totals.total,
    requiredRoles: ['sales_manager', 'owner'],
    severity: kind === 'margin_floor' ? 'critical' : 'warning',
  });
  q.approvalIds.push(ap.id);
  q.status = 'pending_approval';
  q.updatedAt = ctx.now;
  audit(db, ctx, { action: 'quote.submitted', entityType: 'quote', entityId: q.id, entityRef: q.number, summary: `${q.number} v${v.version} submitted for approval (${kind.replace('_', ' ')})` });
  return { status: q.status, issues };
}

export function decideQuote(db: DbState, ctx: Ctx, a: { quoteId: ID; approve: boolean; note?: string; approvalId?: ID }) {
  requirePerm(ctx, 'quote.approve');
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (q.status !== 'pending_approval') throw new DomainError(`${q.number} is not awaiting approval.`, 'state');
  for (const id of q.approvalIds) closeApproval(db, ctx, id, a.approve ? 'approved' : 'rejected', a.note);
  q.status = a.approve ? 'approved' : 'draft';
  if (a.approve) q.reissue = false;
  q.updatedAt = ctx.now;
  audit(db, ctx, {
    action: a.approve ? 'quote.approved' : 'quote.approval_rejected',
    entityType: 'quote',
    entityId: q.id,
    entityRef: q.number,
    summary: `${q.number} v${q.currentVersion} ${a.approve ? 'approved' : 'returned to draft'} by ${ctx.actor.name}`,
    reason: a.note,
  });
  notify(db, ctx, { kind: 'quote', severity: a.approve ? 'success' : 'warning', title: `${q.number} ${a.approve ? 'approved' : 'returned'}`, body: a.note ?? (a.approve ? 'Ready to issue to the customer.' : 'Adjust pricing and resubmit.'), link: `/quotes/${q.id}` });
}

export function issueQuote(db: DbState, ctx: Ctx, a: { quoteId: ID }) {
  requirePerm(ctx, 'quote.issue');
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (q.status === 'draft') throw new DomainError('Submit the quotation for approval first.', 'state');
  if (q.status !== 'approved') throw new DomainError(`${q.number} is ${q.status}; only approved quotes can be issued.`, 'state');
  const v = curVersion(q);
  v.issuedAt = ctx.now;
  // Valid until the end of the Nth day (Malaysia time). Same-day = 0.
  v.expiresAt = new Date(new Date(startOfDayKL(addDays(ctx.now, v.validityDays))).getTime() + 86_400_000 - 1000).toISOString();
  v.frozen = true;
  q.status = 'issued';
  q.updatedAt = ctx.now;
  q.recheck = undefined;
  audit(db, ctx, { action: 'quote.issued', entityType: 'quote', entityId: q.id, entityRef: q.number, summary: `${q.number} v${v.version} issued (${formatRM(v.totals.total)}), valid ${v.validityDays === 0 ? 'same day' : `${v.validityDays} days`}` });
  return v;
}

export function markQuoteAccepted(db: DbState, ctx: Ctx, a: { quoteId: ID }) {
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (q.status !== 'issued') throw new DomainError(`${q.number} must be issued before it can be accepted.`, 'state');
  const v = curVersion(q);
  if (v.expiresAt && v.expiresAt < ctx.now) {
    q.status = 'expired';
    throw new DomainError(`${q.number} expired on ${v.expiresAt.slice(0, 10)}. Revise and re-issue it.`, 'state');
  }
  q.status = 'accepted';
  q.acceptedAt = ctx.now;
  q.updatedAt = ctx.now;
  if (q.enquiryId && db.enquiries[q.enquiryId]) db.enquiries[q.enquiryId].status = 'won';
  audit(db, ctx, { action: 'quote.accepted', entityType: 'quote', entityId: q.id, entityRef: q.number, summary: `${q.number} accepted by customer` });
}

export function markQuoteRejected(db: DbState, ctx: Ctx, a: { quoteId: ID; reason: string }) {
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (!['issued', 'approved', 'draft', 'pending_approval'].includes(q.status)) throw new DomainError(`${q.number} is ${q.status}.`, 'state');
  for (const id of q.approvalIds) closeApproval(db, ctx, id, 'cancelled', 'Quote rejected by customer');
  q.status = 'rejected';
  q.closedReason = a.reason;
  q.updatedAt = ctx.now;
  if (q.enquiryId && db.enquiries[q.enquiryId]) {
    db.enquiries[q.enquiryId].status = 'lost';
    db.enquiries[q.enquiryId].lostReason = a.reason;
  }
  audit(db, ctx, { action: 'quote.rejected', entityType: 'quote', entityId: q.id, entityRef: q.number, summary: `${q.number} rejected`, reason: a.reason });
}

export function duplicateQuote(db: DbState, ctx: Ctx, a: { quoteId: ID; customerId?: ID }) {
  const q = must(db.quotes[a.quoteId], 'Quote');
  const v = curVersion(q);
  const copy = createQuote(db, ctx, {
    customerId: a.customerId ?? q.customerId,
    fulfilment: q.fulfilment,
    lines: v.lines.map((l) => ({ productId: l.productId, qty: l.qty, uom: l.uom, discountPct: l.discountPct })),
    freight: v.freight,
    validityDays: v.validityDays,
    notes: v.notes,
    projectRef: q.projectRef,
  });
  copy.versions[0].reason = `Duplicated from ${q.number} v${v.version} at current prices`;
  return copy;
}

/** Expire issued quotes past their validity. Returns the number expired. */
export function expireQuotes(db: DbState, ctx: Ctx) {
  let n = 0;
  for (const q of Object.values(db.quotes)) {
    if (q.status !== 'issued') continue;
    const v = curVersion(q);
    if (v.expiresAt && v.expiresAt < ctx.now) {
      q.status = 'expired';
      q.updatedAt = ctx.now;
      n++;
    }
  }
  return n;
}

// ═════════════════════════ Sales orders ═════════════════════════

export function convertQuoteToOrder(db: DbState, ctx: Ctx, a: { quoteId: ID; requiredDate?: ISO; fulfilment?: 'delivery' | 'pickup' }): SalesOrder {
  requirePerm(ctx, 'order.create');
  const q = must(db.quotes[a.quoteId], 'Quote');
  if (q.status === 'converted' && q.orderId) return db.salesOrders[q.orderId];
  if (q.status !== 'accepted') throw new DomainError(`${q.number} must be accepted by the customer before converting to an order.`, 'state');
  const v = curVersion(q);
  const c = must(db.customers[q.customerId], 'Customer');
  const id = uid(db, 'so');
  const number = nextNumber(db, 'SO', ctx.now);
  const requiredDate = a.requiredDate ?? addDays(ctx.now, 2);
  const lines: SalesOrderLine[] = v.lines.map((l) => ({
    id: uid(db, 'sl'),
    quoteLineId: l.id,
    productId: l.productId,
    description: l.description,
    qty: l.qty,
    uom: l.uom,
    factor: l.factor,
    qtyBase: round4(l.qty * l.factor),
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    unitCost: l.unitCost,
    allocated: 0,
    picked: 0,
    dispatched: 0,
    delivered: 0,
    invoiced: 0,
    promisedDate: addDays(requiredDate, l.leadTimeDays),
    backorderQty: 0,
  }));
  const o: SalesOrder = {
    id,
    number,
    quoteId: q.id,
    quoteNumber: q.number,
    quoteVersion: v.version,
    customerId: c.id,
    siteId: q.siteId,
    fulfilment: a.fulfilment ?? q.fulfilment,
    status: 'confirmed',
    lines,
    freight: v.freight,
    requiredDate,
    paymentTermsDays: c.paymentTermsDays,
    projectRef: q.projectRef,
    createdAt: ctx.now,
    createdBy: ctx.actor.name,
    timeline: [{ at: ctx.now, label: `Order received from ${q.number} v${v.version} (prices preserved)`, by: ctx.actor.name }],
    creditStatus: 'ok',
  };
  db.salesOrders[id] = o;
  q.status = 'converted';
  q.orderId = id;
  q.updatedAt = ctx.now;
  if (q.rfqId && db.rfqs[q.rfqId]) db.rfqs[q.rfqId].status = 'closed';

  // Credit control
  const value = orderUninvoicedValue(o) + o.freight;
  const cp = creditPosition(db, c.id, ctx.now, 0, undefined);
  if (c.creditLimit > 0 && (cp.status === 'over' || cp.status === 'blocked')) {
    o.creditStatus = 'pending_override';
    const ap = createApproval(db, ctx, {
      type: 'credit_override',
      refType: 'order',
      refId: id,
      refNumber: number,
      title: `${number} · ${c.name} credit ${cp.status === 'blocked' ? 'blocked (overdue)' : 'limit exceeded'}`,
      detail: `Exposure ${formatRM(cp.exposure)} vs limit ${formatRM(cp.limit)} (incl. this order ${formatRM(value)}). Overdue ${formatRM(cp.overdue)}${cp.oldestOverdueDays ? `, oldest ${cp.oldestOverdueDays} days` : ''}.`,
      amount: value,
      requiredRoles: ['finance', 'owner'],
      severity: 'critical',
    });
    o.creditApprovalId = ap.id;
    orderEvent(o, ctx, 'Credit hold — manager override required');
  }
  refreshOrder(o);
  audit(db, ctx, { action: 'order.created', entityType: 'order', entityId: id, entityRef: number, summary: `${number} created from ${q.number} (${formatRM(value)})${o.creditStatus === 'pending_override' ? ' — on credit hold' : ''}` });
  notify(db, ctx, { kind: 'order', severity: o.creditStatus === 'pending_override' ? 'warning' : 'success', title: `Order ${number} created`, body: `${c.name} · ${formatRM(value)}${o.creditStatus === 'pending_override' ? ' · credit override needed' : ''}`, link: `/orders?id=${id}` });
  return o;
}

export function decideCredit(db: DbState, ctx: Ctx, a: { orderId: ID; approve: boolean; note?: string }) {
  requirePerm(ctx, 'credit.override');
  const o = must(db.salesOrders[a.orderId], 'Order');
  if (o.creditStatus !== 'pending_override') throw new DomainError(`${o.number} is not on credit hold.`, 'state');
  closeApproval(db, ctx, o.creditApprovalId, a.approve ? 'approved' : 'rejected', a.note);
  if (a.approve) {
    o.creditStatus = 'overridden';
    orderEvent(o, ctx, `Credit override approved${a.note ? `: ${a.note}` : ''}`);
  } else {
    o.status = 'cancelled';
    o.cancelledReason = `Credit override rejected${a.note ? `: ${a.note}` : ''}`;
    orderEvent(o, ctx, o.cancelledReason);
  }
  refreshOrder(o);
  audit(db, ctx, { action: a.approve ? 'credit.override_approved' : 'credit.override_rejected', entityType: 'order', entityId: o.id, entityRef: o.number, summary: `Credit override ${a.approve ? 'approved' : 'rejected'} for ${o.number}`, reason: a.note });
}

/**
 * Explicitly reserve available stock for an order. Reserves what is available and
 * creates backorders (with promised dates) for the balance — never negative stock.
 */
export function reserveOrder(db: DbState, ctx: Ctx, a: { orderId: ID }) {
  requirePerm(ctx, 'order.reserve');
  const o = must(db.salesOrders[a.orderId], 'Order');
  if (o.status === 'cancelled') throw new DomainError(`${o.number} is cancelled.`, 'state');
  if (o.creditStatus === 'pending_override') throw new DomainError(`${o.number} is on credit hold. A Finance manager must approve the override before stock can be reserved.`, 'credit');
  const result: { lineId: ID; reserved: number; backordered: number }[] = [];
  const holdUntil = addDays(o.requiredDate > ctx.now ? o.requiredDate : ctx.now, db.config.reservationHoldDays);
  for (const l of o.lines) {
    const open = round4(l.qtyBase - l.allocated - l.dispatched);
    if (open <= 0) continue;
    const st = productStock(db, l.productId);
    const take = round4(Math.min(open, st.available));
    if (take > 0) {
      const existing = Object.values(db.reservations).find((r) => r.lineId === l.id && r.status === 'active');
      if (existing) {
        existing.qty = round4(existing.qty + take);
        existing.expiresAt = holdUntil;
      } else {
        const rid = uid(db, 'rs');
        db.reservations[rid] = { id: rid, productId: l.productId, orderId: o.id, lineId: l.id, qty: take, createdAt: ctx.now, expiresAt: holdUntil, status: 'active' };
      }
      l.allocated = round4(l.allocated + take);
    }
    const short = round4(open - take);
    // One open backorder per line: update it in place (no churn on repeated clicks).
    const existingBo = Object.values(db.backorders).find((b) => b.lineId === l.id && b.status === 'open');
    l.backorderQty = short > 0 ? short : 0;
    if (short > 0) {
      const p = db.products[l.productId];
      const incomingPo = Object.values(db.purchaseOrders)
        .filter((po) => ['sent', 'acknowledged', 'partial'].includes(po.status) && po.lines.some((pl) => pl.productId === l.productId && pl.qty - pl.received - pl.damaged > 0))
        .sort((x, y) => x.expectedAt.localeCompare(y.expectedAt))[0];
      const promised = incomingPo ? addDays(incomingPo.expectedAt, 1) : addDays(ctx.now, p?.leadTimeDays ?? 7);
      l.backorderPromisedDate = promised;
      if (existingBo) {
        existingBo.qty = short;
        existingBo.promisedDate = promised;
        existingBo.poId = incomingPo?.id ?? existingBo.poId;
      } else {
        const bid = uid(db, 'bo');
        db.backorders[bid] = { id: bid, orderId: o.id, lineId: l.id, productId: l.productId, qty: short, promisedDate: promised, status: 'open', createdAt: ctx.now, poId: incomingPo?.id };
      }
    } else if (existingBo) {
      existingBo.status = 'allocated';
      existingBo.qty = 0;
    }
    result.push({ lineId: l.id, reserved: take, backordered: short });
  }
  const totRes = result.reduce((s, r) => s + r.reserved, 0);
  const totBo = result.reduce((s, r) => s + r.backordered, 0);
  orderEvent(o, ctx, totBo > 0 ? `Stock reserved (partial): ${result.filter((r) => r.reserved > 0).length} line(s); ${result.filter((r) => r.backordered > 0).length} line(s) backordered` : 'Stock reserved for all lines');
  refreshOrder(o);
  audit(db, ctx, { action: 'order.reserved', entityType: 'order', entityId: o.id, entityRef: o.number, summary: `Reserved ${totRes} base units for ${o.number}${totBo ? `; backordered ${totBo}` : ''} (hold until ${holdUntil.slice(0, 10)})` });
  if (totBo > 0) {
    notify(db, ctx, { kind: 'stock', severity: 'warning', title: `Backorder created · ${o.number}`, body: `${totBo} units short. Promised dates set from incoming POs / lead time.`, link: `/orders?id=${o.id}` });
  }
  return result;
}

/** Release unpicked reservations of an order. */
export function releaseReservations(db: DbState, ctx: Ctx, a: { orderId: ID; reason: string }) {
  requirePerm(ctx, 'order.reserve');
  const o = must(db.salesOrders[a.orderId], 'Order');
  let released = 0;
  for (const l of o.lines) {
    const staged = Math.max(0, l.picked - l.dispatched);
    const releasable = round4(l.allocated - staged);
    if (releasable <= 0) continue;
    for (const r of Object.values(db.reservations)) {
      if (r.lineId !== l.id || r.status !== 'active') continue;
      r.qty = round4(r.qty - releasable);
      if (r.qty <= 0) {
        r.qty = 0;
        r.status = 'released';
      }
    }
    l.allocated = staged;
    released += releasable;
  }
  orderEvent(o, ctx, `Reservations released (${released} units): ${a.reason}`);
  refreshOrder(o);
  audit(db, ctx, { action: 'order.reservation_released', entityType: 'order', entityId: o.id, entityRef: o.number, summary: `Released ${released} reserved units on ${o.number}`, reason: a.reason });
  return released;
}

export function cancelOrder(db: DbState, ctx: Ctx, a: { orderId: ID; reason: string }) {
  requirePerm(ctx, 'order.cancel');
  const o = must(db.salesOrders[a.orderId], 'Order');
  if (o.status === 'cancelled') return o;
  if (o.lines.some((l) => l.dispatched > 0)) throw new DomainError(`${o.number} has dispatched goods. Process a return instead of cancelling.`, 'state');
  if (o.lines.some((l) => l.picked > l.dispatched)) throw new DomainError(`${o.number} has picked goods in staging. Reverse the picks first so stock returns to its bins.`, 'state');
  for (const r of Object.values(db.reservations)) if (r.orderId === o.id && r.status === 'active') r.status = 'released';
  for (const b of Object.values(db.backorders)) if (b.orderId === o.id && b.status === 'open') b.status = 'cancelled';
  for (const pl of Object.values(db.picklists)) if (pl.orderId === o.id && pl.status !== 'completed') pl.status = 'cancelled';
  for (const l of o.lines) {
    l.allocated = 0;
    l.backorderQty = 0;
  }
  closeApproval(db, ctx, o.creditApprovalId, 'cancelled', 'Order cancelled');
  o.status = 'cancelled';
  o.cancelledReason = a.reason;
  orderEvent(o, ctx, `Cancelled: ${a.reason}. Reservations released.`);
  audit(db, ctx, { action: 'order.cancelled', entityType: 'order', entityId: o.id, entityRef: o.number, summary: `${o.number} cancelled; reservations released`, reason: a.reason });
  return o;
}

/** Allocate newly available stock to open backorders (FIFO by order date). */
export function allocateBackorders(db: DbState, ctx: Ctx, a: { productId?: ID; orderId?: ID }) {
  const open = Object.values(db.backorders)
    .filter((b) => b.status === 'open' && (!a.productId || b.productId === a.productId) && (!a.orderId || b.orderId === a.orderId))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const allocations: { orderId: ID; lineId: ID; qty: number }[] = [];
  for (const b of open) {
    const o = db.salesOrders[b.orderId];
    if (!o || o.status === 'cancelled' || o.creditStatus === 'pending_override') continue;
    const l = o.lines.find((x) => x.id === b.lineId);
    if (!l) continue;
    const st = productStock(db, b.productId);
    const take = round4(Math.min(b.qty, st.available));
    if (take <= 0) continue;
    const existing = Object.values(db.reservations).find((r) => r.lineId === l.id && r.status === 'active');
    if (existing) existing.qty = round4(existing.qty + take);
    else {
      const rid = uid(db, 'rs');
      db.reservations[rid] = { id: rid, productId: l.productId, orderId: o.id, lineId: l.id, qty: take, createdAt: ctx.now, expiresAt: addDays(ctx.now, db.config.reservationHoldDays + 2), status: 'active' };
    }
    l.allocated = round4(l.allocated + take);
    b.qty = round4(b.qty - take);
    l.backorderQty = b.qty;
    if (b.qty <= 0) {
      b.status = 'allocated';
      l.backorderPromisedDate = undefined;
    }
    orderEvent(o, ctx, `Backorder allocated: ${take} ${db.products[l.productId]?.baseUom ?? ''} of ${db.products[l.productId]?.sku}`);
    refreshOrder(o);
    allocations.push({ orderId: o.id, lineId: l.id, qty: take });
    audit(db, ctx, { action: 'backorder.allocated', entityType: 'order', entityId: o.id, entityRef: o.number, summary: `Allocated ${take} to backorder on ${o.number}` });
  }
  return allocations;
}

export { deriveOrderStatus };
