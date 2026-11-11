/**
 * Deterministic demo seed. Generates ~90 days of interconnected, internally consistent
 * history by running the REAL domain commands (quotes → orders → reservations → picking →
 * delivery → invoices → payments; low stock → POs → GRN; supplier cost drift → approvals).
 * All values are fictional and illustrative.
 */
import type { BusinessConfig, Customer, CustomerPriceAgreement, CustomerTier, ID, PosLine, PriceRule, Product, RoleKey, UomCode } from '@/domain/types';
import { DATA_VERSION, DomainError, emptyState, type Ctx, type DbState } from '@/domain/state';
import { priceLine, suggestedPrice, floorPrice } from '@/domain/pricing';
import { homeBins, productStock } from '@/domain/inventory';
import { addBinStock, movement } from '@/domain/commands/helpers';
import * as S from '@/domain/commands/sales';
import * as F from '@/domain/commands/fulfilment';
import * as P from '@/domain/commands/procurement';
import { approvePriceChange, proposeCostChangeInternal } from '@/domain/commands/pricing';
import { recordPayment } from '@/domain/commands/finance';
import { completePosSale } from '@/domain/commands/pos';
import { adjustStock } from '@/domain/commands/inventory';
import { addDays, startOfDayKL } from '@/lib/dates';
import { roundTo, toSen } from '@/lib/money';
import { createRng } from '@/lib/utils';
import { BRANDS, CATEGORIES, CUSTOMERS, DRIVERS, PRODUCT_DEFS, STAFF, SUPPLIERS, VEHICLES, type ProductDef } from './reference';
import { buildWarehouse, storageArea } from './warehouseLayout';

export interface SeedOptions {
  anchor?: string;
  seed?: number;
}

export const pid = (sku: string) => `p_${sku.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

const POSTCODES: Record<string, string> = {
  Puchong: '47100 Puchong, Selangor', 'Subang Jaya': '47500 Subang Jaya, Selangor', 'Shah Alam': '40000 Shah Alam, Selangor',
  'Petaling Jaya': '46000 Petaling Jaya, Selangor', Cyberjaya: '63000 Cyberjaya, Selangor', 'Seri Kembangan': '43300 Seri Kembangan, Selangor',
  Klang: '41000 Klang, Selangor', Kajang: '43000 Kajang, Selangor', Bangi: '43650 Bandar Baru Bangi, Selangor', Putrajaya: '62000 W.P. Putrajaya',
  Semenyih: '43500 Semenyih, Selangor', Rawang: '48000 Rawang, Selangor', 'Kuala Lumpur': '50000 W.P. Kuala Lumpur', 'Port Klang': '42000 Port Klang, Selangor',
};

function ean13(n: number) {
  const base = `955${String(n).padStart(9, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 ? 3 : 1);
  return base + ((10 - (sum % 10)) % 10);
}

const SITE_AREAS = ['Bandar Puteri Puchong', 'Bukit Jelutong', 'Setia Alam', 'Kota Kemuning', 'Bandar Kinrara', 'Taman Equine', 'Cyber 10', 'Sungai Buloh', 'Bandar Saujana Putra', 'Denai Alam'];

export function buildSeed(opts: SeedOptions = {}): DbState {
  return buildSeedWithReport(opts).db;
}

export function buildSeedWithReport(opts: SeedOptions = {}) {
  const anchor = opts.anchor ?? new Date().toISOString();
  const rng = createRng(opts.seed ?? 20261111);
  const anchorMs = Date.parse(anchor);
  const day0 = Date.parse(startOfDayKL(anchor));
  const T = (d: number, h: number, m = 0) => new Date(day0 + d * 86_400_000 + h * 3_600_000 + m * 60_000).toISOString();
  const AGO = (mins: number) => new Date(anchorMs - mins * 60_000).toISOString();
  const weekday = (d: number) => new Date(day0 + d * 86_400_000 + 12 * 3_600_000 + 8 * 3_600_000).getUTCDay();
  const warnings: string[] = [];

  const config: BusinessConfig = {
    id: 'config',
    dataVersion: DATA_VERSION,
    seededAt: anchor,
    anchorDate: anchor,
    minMarginPct: 12,
    targetMarginPct: 25,
    quoteValidityOptions: [0, 3, 7, 14],
    defaultValidityDays: 7,
    discountApprovalPct: 5,
    invoiceOnDelivery: true,
    tax: {
      enabled: false,
      label: 'SST',
      ratePct: 0,
      note: 'Tax treatment is not configured. Confirm SST registration, taxable items and rates with the client and their tax adviser before enabling.',
    },
    reservationHoldDays: 5,
    overdueBlockDays: 60,
    creditWarnPct: 85,
    defaultTerms:
      'Prices are in Ringgit Malaysia and valid until the stated expiry. Stock is subject to availability at the time of order confirmation; acceptance of this quotation does not reserve stock until an order is confirmed. Delivery charges as stated. DEMO SAMPLE — not a binding offer.',
    seq: 0,
    sequences: {},
    fx: { usdMyr: 4.45, cnyMyr: 0.62, source: 'Synthetic reference rate (demo)', synthetic: true },
    scenario: {},
  };
  const db = emptyState(config);
  const ctx = (role: RoleKey, at: string, silent = true): Ctx => ({ now: at, actor: { name: STAFF[role], role }, silent });
  const start = T(-90, 7);

  // ─────────── reference tables
  for (const c of CATEGORIES) db.categories[c.id] = { ...c };
  for (const b of BRANDS) db.brands[b.id] = { ...b, publicBrand: b.id !== 'b_gen' };
  const ruleDefs: [string, number, number, [number, number, number, number, number], [number, number][]][] = [
    ['plb', 26, 12, [0, 5, 8, 10, 8], [[200, 2], [1000, 4]]],
    ['bld', 20, 10, [0, 4, 6, 8, 7], [[1000, 2], [4000, 4]]],
    ['ind', 21, 12, [0, 3, 5, 7, 6], [[100, 2], [500, 3]]],
    ['pwr', 22, 12, [0, 4, 6, 8, 6], [[10, 2]]],
    ['hnd', 32, 15, [0, 6, 10, 12, 10], [[24, 3]]],
    ['saf', 34, 15, [0, 6, 10, 12, 10], [[100, 3], [500, 5]]],
    ['elc', 28, 12, [0, 5, 8, 10, 8], [[100, 2], [1000, 4]]],
    ['chm', 30, 14, [0, 5, 8, 10, 8], [[48, 2], [240, 4]]],
    ['hse', 35, 15, [0, 6, 10, 12, 10], [[24, 3]]],
  ];
  const mkRule = (id: string, name: string, scope: PriceRule['scope'], scopeId: string | undefined, target: number, min: number, tiers: number[], bulk: [number, number][]): PriceRule => ({
    id, name, scope, scopeId, method: 'margin', targetMarginPct: target, markupPct: Math.round((target / (100 - target)) * 1000) / 10, minMarginPct: min,
    tierDiscountPct: { walkin: tiers[0], trade: tiers[1], contractor: tiers[2], key: tiers[3], project: tiers[4] },
    bulkBreaks: bulk.map(([minQty, discountPct]) => ({ minQty, discountPct })), freightPerUnit: 0, roundingSen: 5, approvalChangePct: 10, active: true, updatedAt: start, updatedBy: STAFF.owner,
  });
  db.priceRules.pr_global = mkRule('pr_global', 'Company default', 'global', undefined, 25, 12, [0, 5, 8, 10, 8], []);
  for (const [cat, t, m, tiers, bulk] of ruleDefs) {
    const name = CATEGORIES.find((c) => c.id === cat)!.name;
    db.priceRules[`pr_${cat}`] = mkRule(`pr_${cat}`, `${name} pricing`, 'category', cat, t, m, tiers, bulk);
  }
  for (const s of SUPPLIERS) {
    db.suppliers[s.id] = {
      id: s.id, code: s.code, name: s.name, contactName: s.contact, phone: `+60 3-0000 ${String(4100 + Number(s.id.slice(1))).padStart(4, '0')}`,
      email: `sales@${s.name.toLowerCase().split(' ')[0]}.example`, address: `Lot ${10 + Number(s.id.slice(1))}, Jalan Contoh Industri ${s.id.slice(1)}, ${POSTCODES[s.town] ?? s.town}`,
      currency: s.currency, paymentTermsDays: s.terms, leadTimeDays: s.lead, onTimePct: s.onTime, qualityScore: s.quality, categoryIds: s.cats, status: 'active', isImport: !!s.isImport,
      notes: s.isImport ? 'Import supplier — FX and freight exposure. Landed cost components are illustrative.' : undefined,
    };
  }
  for (const v of VEHICLES) db.vehicles[v.id] = { ...v };
  for (const d of DRIVERS) db.drivers[d.id] = { ...d };

  // ─────────── products with cost drift schedule
  const drift: Record<ID, [number, number][]> = {};
  const popularity: Record<ID, number> = {};
  const defs: Record<ID, ProductDef> = {};
  PRODUCT_DEFS.forEach((d, i) => {
    const id = pid(d.sku);
    defs[id] = d;
    const ev: [number, number][] =
      d.vol === 'h' ? [[-76, 2.5], [-55, 3.0], [-34, 2.5], [-14, 3.5]] : d.vol === 'm' ? [[-60, 2.0], [-25, rng.chance(0.3) ? -1.0 : 1.5]] : rng.chance(0.15) ? [[-45, 1.0]] : [];
    drift[id] = ev;
    const factor = ev.reduce((f, [, pct]) => f * (1 + pct / 100), 1);
    const initCost = Math.round(toSen(d.cost) / factor);
    const rule = db.priceRules[`pr_${d.cat}`];
    const base = Math.max(floorPrice(initCost, rule), roundTo(suggestedPrice(initCost, rule) * rng.float(0.99, 1.04), 5));
    const uoms = (d.uoms ?? '').split(',').filter(Boolean).map((u) => {
      const [uom, f] = u.split(':');
      return { uom: uom as UomCode, factor: Number(f) };
    });
    const famId = d.fam ? `fam_${d.fam.toLowerCase()}` : undefined;
    const p: Product = {
      id, sku: d.sku, name: d.name, familyId: famId, familyName: d.fam ? d.name : undefined, variantLabel: d.v,
      categoryId: d.cat, brandId: d.brand, baseUom: d.uom, uoms,
      specs: Object.fromEntries((d.specs ?? '').split('|').filter(Boolean).map((kv) => kv.split('=') as [string, string])),
      description: `${d.name}${d.v ? ` — ${d.v}` : ''}. Illustrative catalogue entry for the demo; verify specifications against the manufacturer datasheet.`,
      art: d.art, barcode: ean13(100001 + i), weightKg: d.kg, status: 'active', preferredSupplierId: d.sup, leadTimeDays: d.lead,
      reorderPoint: Math.max(1, Math.round(d.roq * 0.4)), reorderQty: d.roq, volatility: d.vol === 'h' ? 'high' : d.vol === 'm' ? 'medium' : 'low', abc: 'C',
      cost: initCost, previousCost: initCost, latestCost: initCost, latestCostAt: start, latestCostSupplierId: d.sup, basePrice: base, priceEffectiveFrom: start,
      watch: false, substitutes: [], datasheets: ['pwr', 'chm', 'ind', 'bld', 'elc'].includes(d.cat) ? [{ name: `${d.sku} datasheet (sample).pdf`, sizeKb: 180 + ((i * 37) % 700) }] : [],
      createdAt: T(-400, 9), updatedAt: start,
    };
    db.products[id] = p;
    popularity[id] = 0.25 + Math.pow(rng.next(), 2) * 2;
    const cv = `cv_seed_${i}`;
    db.costVersions[cv] = { id: cv, productId: id, supplierId: d.sup, supplierCost: initCost, freight: 0, handling: 0, fxPct: 0, landedCost: initCost, effectiveFrom: start, source: 'seed', status: 'active', createdAt: start, createdBy: STAFF.procurement, note: 'Opening cost (demo seed)' };
    const ph = `ph_seed_${i}`;
    db.priceHistory[ph] = { id: ph, productId: id, basePrice: base, cost: initCost, effectiveFrom: start, reason: 'Opening price list (demo seed)', by: STAFF.sales_manager, kind: 'seed' };
    // supplier sourcing
    [d.sup, ...(d.alt ?? [])].forEach((sid, k) => {
      const spId = `sp_${i}_${k}`;
      const s = db.suppliers[sid];
      db.supplierProducts[spId] = {
        id: spId, supplierId: sid, productId: id, supplierSku: `${s.code.slice(4)}-${d.sku}`, cost: Math.round(toSen(d.cost) * (k === 0 ? 1 : rng.float(1.02, 1.09))),
        moq: Math.max(1, Math.round(d.roq * (k === 0 ? 0.1 : rng.float(0.15, 0.4)))), leadTimeDays: s.leadTimeDays + (k === 0 ? 0 : rng.int(0, 3)),
        availableQty: Math.round(d.roq * rng.float(1, 6)), validUntil: addDays(anchor, 30),
      };
    });
  });
  // substitutes: family siblings, then same art in category
  const all = Object.values(db.products);
  for (const p of all) {
    const sib = all.filter((q) => q.id !== p.id && ((p.familyId && q.familyId === p.familyId) || (q.art === p.art && q.categoryId === p.categoryId)));
    p.substitutes = sib.slice(0, 3).map((q) => q.id);
  }
  const protectedSkus = new Set([pid('PVE-050'), pid('UBL-M12-4'), pid('PVP-D-050')]);

  // ─────────── customers
  const b2b: (typeof CUSTOMERS)[number][] = [];
  CUSTOMERS.forEach((c, i) => {
    const first = c.contact.split(' ')[0].toLowerCase();
    const slug = c.name.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '');
    const sites = c.type === 'walkin' || c.type === 'trade'
      ? []
      : [
          { id: `${c.id}_s1`, name: 'Main yard / office', address: `No. ${8 + i}, Jalan Contoh ${(i % 9) + 1}/${(i % 4) + 1}, Taman Contoh, ${POSTCODES[c.town] ?? c.town}` },
          ...(c.project || i % 3 === 0
            ? [{ id: `${c.id}_s2`, name: c.project ? `Project site — ${c.project}` : `Site — ${SITE_AREAS[i % SITE_AREAS.length]}`, address: `Site office, Jalan Contoh Tapak ${i}, ${SITE_AREAS[i % SITE_AREAS.length]}, Selangor`, project: c.project }]
            : []),
        ];
    const cust: Customer = {
      id: c.id, code: `C${String(1001 + i)}`, name: c.name, type: c.type, tier: c.tier,
      contacts: c.type === 'walkin' || c.type === 'trade' ? [] : [{ name: c.contact, role: c.role, phone: `+60 12-000 ${String(1200 + i * 7).padStart(4, '0')}`, email: `${first}@${slug}.example` }],
      billingAddress: sites[0]?.address ?? 'Counter sale — no billing address', sites, creditLimit: toSen(c.limit), paymentTermsDays: c.terms,
      contractValidUntil: c.tier === 'key' || c.tier === 'project' ? addDays(anchor, 120 + i * 3) : undefined, tags: c.tags ?? [], notes: [],
      createdAt: T(-700 + i * 9, 10), status: 'active', tin: c.limit ? `DEMO-TIN-${String(5000 + i)}` : undefined, brn: c.limit ? `DEMO-BRN-${String(202000 + i * 13)}` : undefined,
      phone: `+60 3-0000 ${String(2200 + i).padStart(4, '0')}`, email: c.limit ? `accounts@${slug}.example` : '',
    };
    db.customers[c.id] = cust;
    if (c.weight > 0) b2b.push(c);
  });
  const mkAg = (id: string, a: Omit<CustomerPriceAgreement, 'id'>) => (db.agreements[id] = { id, ...a });
  mkAg('ag1', { customerId: 'c03', productId: pid('ANG-5050'), kind: 'fixed', fixedPrice: roundTo(toSen(64) * 1.16, 5), validFrom: T(-60, 0), validTo: addDays(anchor, 120), locked: true, reference: 'Contract GLC-2026-01 (fictional)' });
  mkAg('ag2', { customerId: 'c03', productId: pid('HBM-150'), kind: 'fixed', fixedPrice: roundTo(toSen(268) * 1.15, 5), validFrom: T(-60, 0), validTo: addDays(anchor, 120), locked: true, reference: 'Contract GLC-2026-01 (fictional)' });
  mkAg('ag3', { customerId: 'c19', categoryId: 'plb', kind: 'discount', discountPct: 6, validFrom: T(-80, 0), validTo: addDays(anchor, 90), locked: true, reference: 'Drainage package rates (fictional)' });
  mkAg('ag4', { customerId: 'c07', productId: pid('CEM-50'), kind: 'fixed', fixedPrice: roundTo(toSen(19.2) * 1.12, 5), validFrom: T(-70, 0), validTo: addDays(anchor, 60), locked: true, reference: 'Seroja Phase 2 supply agreement (fictional)' });

  // ─────────── warehouse + opening stock
  const wh = buildWarehouse();
  db.warehouses[wh.warehouse.id] = wh.warehouse;
  for (const z of wh.zones) db.zones[z.id] = z;
  for (const r of wh.racks) db.racks[r.id] = r;
  for (const b of wh.bins) db.bins[b.id] = b;
  const areaBins: Record<string, string[]> = { A: [], B: [], BF: [], C: [] };
  for (const b of wh.bins) {
    if (b.kind !== 'rack' && b.kind !== 'floor') continue;
    const rack = wh.racks.find((r) => r.id === b.rackId)!;
    const area = rack.type === 'floor' ? 'BF' : rack.code[0];
    areaBins[area].push(b.id);
  }
  for (const k of Object.keys(areaBins)) areaBins[k] = rng.shuffle(areaBins[k]);
  const used: Record<string, number> = { A: 0, B: 0, BF: 0, C: 0 };
  const homeOf: Record<ID, ID[]> = {};
  const wctx = ctx('wh_supervisor', start);
  for (const p of all) {
    const area = storageArea(p.sku, p.categoryId, p.baseUom);
    const take = (n: number) => Array.from({ length: n }, () => areaBins[area][used[area]++ % areaBins[area].length]);
    homeOf[p.id] = take(p.reorderQty >= 1000 && area !== 'BF' ? 2 : 1);
    const qty = Math.round(p.reorderQty * rng.float(0.8, 1.8));
    const split = homeOf[p.id].length === 2 ? [Math.round(qty * 0.6), qty - Math.round(qty * 0.6)] : [qty];
    homeOf[p.id].forEach((binId, k) => addBinStock(db, { productId: p.id, binId, qty: split[k], at: start, lot: 'OPENING' }));
    movement(db, wctx, { productId: p.id, type: 'adjustment', qty, moved: qty, toBinId: homeOf[p.id][0], refType: 'opening', reason: 'Opening balance (demo seed)', at: start });
  }

  // ─────────── simulation machinery
  type Ev = { t: number; s: number; fn: () => void };
  const queue: Ev[] = [];
  let evs = 0;
  const at = (iso: string, fn: () => void) => queue.push({ t: Date.parse(iso), s: evs++, fn });
  const safe = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (e instanceof DomainError) warnings.push(`${label}: ${e.message}`);
      else throw e;
    }
  };
  const runUntil = (ms: number) => {
    for (;;) {
      let bi = -1;
      for (let i = 0; i < queue.length; i++) {
        const q = queue[i];
        if (q.t >= ms) continue;
        if (bi < 0 || q.t < queue[bi].t || (q.t === queue[bi].t && q.s < queue[bi].s)) bi = i;
      }
      if (bi < 0) break;
      const [e] = queue.splice(bi, 1);
      e.fn();
    }
  };
  const ensureAvailable = (productId: ID, qty: number, when: string) => {
    const st = productStock(db, productId);
    if (st.available >= qty) return;
    const bin = homeBins(db, productId)[0] ?? homeOf[productId][0];
    adjustStock(db, ctx('wh_supervisor', when), { productId, binId: bin, delta: Math.ceil(qty - st.available + 2), reason: 'Cycle count variance', note: 'Demo scenario preparation' });
  };
  const setAvailable = (productId: ID, qty: number, when: string) => {
    const st = productStock(db, productId);
    const delta = qty - st.available;
    if (!delta) return;
    const bin = homeBins(db, productId)[0] ?? homeOf[productId][0];
    if (delta < 0) {
      const inBin = Object.values(db.binStock).find((b) => b.productId === productId && b.binId === bin && b.status === 'ok')?.qty ?? 0;
      if (inBin < -delta) {
        // pull from the other bins first via transfer-free adjustments
        for (const b of Object.values(db.binStock).filter((x) => x.productId === productId && x.status === 'ok' && x.binId !== bin && db.bins[x.binId].kind !== 'staging')) {
          adjustStock(db, ctx('wh_supervisor', when), { productId, binId: b.binId, delta: -Math.min(b.qty, -delta), reason: 'Cycle count variance', note: 'Demo scenario preparation' });
        }
        const st2 = productStock(db, productId);
        const d2 = qty - st2.available;
        if (d2) adjustStock(db, ctx('wh_supervisor', when), { productId, binId: bin, delta: d2, reason: 'Cycle count variance', note: 'Demo scenario preparation' });
        return;
      }
    }
    adjustStock(db, ctx('wh_supervisor', when), { productId, binId: bin, delta, reason: 'Cycle count variance', note: 'Demo scenario preparation' });
  };

  const themes: Record<string, [string, number][]> = {
    contractor: [['plb', 2], ['bld', 2], ['ind', 1], ['saf', 2], ['hnd', 1], ['pwr', 1], ['chm', 1]],
    renovation: [['chm', 3], ['hnd', 2], ['plb', 2], ['elc', 2], ['hse', 1], ['pwr', 1]],
    industrial: [['ind', 3], ['saf', 2], ['pwr', 2], ['elc', 1], ['chm', 1], ['hse', 1]],
    project: [['bld', 3], ['ind', 2], ['plb', 2], ['chm', 1], ['saf', 1]],
  };
  const weighted = <T,>(items: T[], w: (t: T) => number): T => {
    const tot = items.reduce((s, x) => s + w(x), 0);
    let r = rng.next() * tot;
    for (const x of items) {
      r -= w(x);
      if (r <= 0) return x;
    }
    return items[items.length - 1];
  };
  const byCat: Record<string, Product[]> = {};
  for (const p of all) (byCat[p.categoryId] ||= []).push(p);

  const neverPay = new Set<ID>();
  const scheduledInv = new Set<ID>();
  const noReceive = new Set<ID>();
  const payerOf = (cid: ID) => CUSTOMERS.find((c) => c.id === cid)?.payer ?? 'good';

  function pickLines(custId: string, d: number, n: number) {
    const cdef = CUSTOMERS.find((c) => c.id === custId)!;
    let theme = themes[cdef.type] ?? themes.contractor;
    if (cdef.tags?.includes('plumbing')) theme = [['plb', 6], ['hnd', 1]];
    if (cdef.tags?.includes('steel')) theme = [['ind', 6], ['saf', 1], ['pwr', 1]];
    if (cdef.tags?.includes('roofing')) theme = [['bld', 5], ['saf', 1]];
    const chosen = new Map<ID, { productId: ID; qty: number; uom: UomCode }>();
    let weight = 0;
    for (let i = 0; i < n * 3 && chosen.size < n; i++) {
      const [cat] = weighted(theme, (t) => t[1]);
      const pool = byCat[cat].filter((p) => !(d > -26 && protectedSkus.has(p.id)) && !chosen.has(p.id));
      if (!pool.length) continue;
      const p = weighted(pool, (x) => popularity[x.id]);
      let qtyBase = Math.max(1, Math.round(p.reorderQty * rng.float(0.04, 0.28)));
      const maxByWeight = Math.max(1, Math.floor(2200 / Math.max(0.01, p.weightKg)));
      qtyBase = Math.min(qtyBase, maxByWeight);
      if (weight + qtyBase * p.weightKg > 4200) continue;
      weight += qtyBase * p.weightKg;
      const pack = p.uoms.filter((u) => u.factor > 1 && u.uom !== 'PALLET' && qtyBase >= u.factor * 2).sort((a, b) => a.factor - b.factor)[0];
      if (pack && rng.chance(0.5)) chosen.set(p.id, { productId: p.id, qty: Math.max(1, Math.round(qtyBase / pack.factor)), uom: pack.uom });
      else chosen.set(p.id, { productId: p.id, qty: qtyBase, uom: p.baseUom });
    }
    return [...chosen.values()];
  }

  function issueFlow(quoteId: ID, t0: string) {
    const r = S.submitQuote(db, ctx('sales_exec', t0), { quoteId });
    let t = new Date(Date.parse(t0) + 35 * 60_000).toISOString();
    if (r.status === 'pending_approval') {
      S.decideQuote(db, ctx('sales_manager', t), { quoteId, approve: true, note: 'Approved — strategic account (demo)' });
      t = new Date(Date.parse(t) + 20 * 60_000).toISOString();
    }
    S.issueQuote(db, ctx('sales_exec', t), { quoteId });
    return t;
  }

  function acceptAndOrder(quoteId: ID, t: string, fulfilment: 'delivery' | 'pickup', requiredDate: string, reserve = true) {
    S.markQuoteAccepted(db, ctx('sales_exec', t), { quoteId });
    const o = S.convertQuoteToOrder(db, ctx('sales_exec', t), { quoteId, requiredDate, fulfilment });
    if (o.creditStatus === 'pending_override') {
      S.decideCredit(db, ctx('finance', new Date(Date.parse(t) + 30 * 60_000).toISOString()), { orderId: o.id, approve: true, note: 'Payment plan agreed (demo)' });
    }
    if (reserve) S.reserveOrder(db, ctx('sales_exec', new Date(Date.parse(t) + 45 * 60_000).toISOString()), { orderId: o.id });
    return o;
  }

  function makeQuote(d: number, h: number, custId?: string, linesIn?: { productId: ID; qty: number; uom: UomCode; discountPct?: number }[], randomOutcome = true) {
    const c = custId ?? weighted(b2b, (x) => (x.id === 'c26' ? 0.6 : x.weight)).id;
    const lines: { productId: ID; qty: number; uom: UomCode; discountPct?: number }[] = linesIn ?? pickLines(c, d, rng.int(1, 5));
    if (!lines.length) return;
    const disc = rng.chance(0.3) ? rng.pick([2, 3, 5]) : 0;
    const t = T(d, h, rng.int(0, 50));
    const q = S.createQuote(db, ctx('sales_exec', t), {
      customerId: c,
      lines: lines.map((l) => ({ ...l, discountPct: l.discountPct ?? disc })),
      validityDays: rng.pick([3, 7, 7, 14]),
      fulfilment: rng.chance(0.75) ? 'delivery' : 'pickup',
      channel: rng.pick(['whatsapp', 'whatsapp', 'phone', 'email', 'website'] as const),
    });
    const tIssue = issueFlow(q.id, new Date(Date.parse(t) + 20 * 60_000).toISOString());
    const v = q.versions[q.currentVersion - 1];
    if (!randomOutcome) return q;
    const r = rng.next();
    if (r < 0.6) {
      const off = rng.int(0, Math.min(3, v.validityDays));
      const ta = T(d + off, rng.int(10, 16), rng.int(0, 59));
      if (Date.parse(ta) <= Date.parse(tIssue) || Date.parse(ta) >= anchorMs - 3_600_000) return q;
      at(ta, () => safe('accept', () => acceptAndOrder(q.id, ta, q.fulfilment, T(d + off + rng.int(1, 3), 17))));
    } else if (r < 0.76) {
      const tr = T(d + 2, 11);
      if (Date.parse(tr) < anchorMs - 3_600_000)
        at(tr, () => safe('reject', () => S.markQuoteRejected(db, ctx('sales_exec', tr), { quoteId: q.id, reason: rng.pick(['Price higher than competitor', 'Project postponed', 'Customer bought elsewhere', 'Specification changed']) })));
    }
    return q;
  }

  function vehicleFor(weight: number, day: string) {
    const list = Object.values(db.vehicles).sort((a, b) => a.capacityKg - b.capacityKg);
    for (const v of list) {
      const load = Object.values(db.deliveryOrders).filter((x) => x.vehicleId === v.id && x.scheduledDate.slice(0, 10) === day.slice(0, 10) && ['scheduled', 'out_for_delivery'].includes(x.status)).reduce((s, x) => s + x.weightKg, 0);
      if (load + weight <= v.capacityKg) return v;
    }
    return undefined;
  }

  function fulfilSweep(d: number) {
    let k = 0;
    // re-attempt failed deliveries first
    for (const dd of Object.values(db.deliveryOrders).filter((x) => x.status === 'failed')) {
      const v = vehicleFor(dd.weightKg, T(d, 11));
      if (!v) continue;
      const drv = Object.values(db.drivers).find((x) => x.vehicleId === v.id)!;
      safe('resched', () => {
        F.scheduleDelivery(db, ctx('dispatcher', T(d, 9, 5)), { doId: dd.id, vehicleId: v.id, driverId: drv.id, date: T(d, 11) });
        F.dispatchDelivery(db, ctx('dispatcher', T(d, 11, 10)), { doId: dd.id });
        F.confirmDelivery(db, ctx('dispatcher', T(d, 14, 30)), { doId: dd.id, signedName: db.customers[dd.customerId].contacts[0]?.name ?? 'Site receiver' });
      });
    }
    for (const o of Object.values(db.salesOrders)) {
      if (['cancelled', 'invoiced', 'delivered', 'dispatched', 'pending_credit'].includes(o.status)) continue;
      if (Date.parse(o.createdAt) >= Date.parse(T(d, 9))) continue;
      const m = (k++ % 20) * 3;
      const needPick = o.lines.some((l) => l.allocated - (l.picked - l.dispatched) > 1e-6);
      safe('pick', () => {
        if (needPick) {
          const pl = F.createPicklist(db, ctx('wh_supervisor', T(d, 9, 10 + m)), { orderId: o.id });
          F.pickAll(db, { ...ctx('wh_supervisor', T(d, 9, 20 + m)), actor: { name: STAFF.picker, role: 'wh_supervisor' } }, { picklistId: pl.id });
        }
      });
      if (!o.lines.some((l) => l.picked - l.dispatched > 1e-6)) continue;
      safe('deliver', () => {
        const dd = F.createDelivery(db, ctx('wh_supervisor', T(d, 10, 20 + (m % 30))), { orderId: o.id, type: o.fulfilment });
        if (dd.type === 'pickup') {
          F.collectPickup(db, ctx('wh_supervisor', T(d, 15, m % 50)), { doId: dd.id, token: dd.pickupToken!, signedName: db.customers[o.customerId].contacts[0]?.name ?? 'Customer' });
          return;
        }
        const v = vehicleFor(dd.weightKg, T(d, 11));
        if (!v) return;
        const drv = Object.values(db.drivers).find((x) => x.vehicleId === v.id)!;
        F.scheduleDelivery(db, ctx('dispatcher', T(d, 10, 40)), { doId: dd.id, vehicleId: v.id, driverId: drv.id, date: T(d, 11) });
        F.dispatchDelivery(db, ctx('dispatcher', T(d, 11, 15 + (m % 30))), { doId: dd.id });
        F.advanceRoute(db, ctx('dispatcher', T(d, 12, 30)), { doId: dd.id });
        if (rng.chance(0.03)) {
          F.failDelivery(db, ctx('dispatcher', T(d, 14)), { doId: dd.id, reason: rng.pick(['Site closed — no receiver on site', 'Access road blocked at site', 'Customer requested a later slot']) });
          return;
        }
        F.confirmDelivery(db, ctx('dispatcher', T(d, 14 + rng.int(0, 3), rng.int(0, 59))), { doId: dd.id, signedName: db.customers[o.customerId].contacts[0]?.name ?? 'Site receiver' });
      });
    }
  }

  function reorderSweep(d: number) {
    const needs: Record<ID, { productId: ID; qty: number; unitCost: number }[]> = {};
    for (const p of all) {
      if (p.status !== 'active') continue;
      if (d > -26 && protectedSkus.has(p.id)) continue;
      const st = productStock(db, p.id);
      if (st.available + st.incoming >= p.reorderPoint) continue;
      const bo = Object.values(db.backorders).filter((b) => b.status === 'open' && b.productId === p.id).reduce((s, b) => s + b.qty, 0);
      (needs[p.preferredSupplierId] ||= []).push({ productId: p.id, qty: p.reorderQty + Math.ceil(bo), unitCost: p.latestCost });
    }
    for (const [sid, lines] of Object.entries(needs)) {
      const s = db.suppliers[sid];
      safe('po', () => {
        const po = P.createPurchaseOrder(db, ctx('procurement', T(d, 16, 30)), { supplierId: sid, lines, expectedAt: T(d + s.leadTimeDays + rng.int(0, 2), 10), notes: 'Auto-suggested by reorder point (demo history)' });
        P.sendPO(db, ctx('procurement', T(d, 16, 45)), { poId: po.id });
        const tAck = T(d + 1, 9, 30);
        at(tAck, () => safe('ack', () => P.acknowledgePO(db, ctx('procurement', tAck), { poId: po.id })));
        const late = rng.chance(1 - s.onTimePct / 100) ? rng.int(1, 3) : 0;
        const tRec = new Date(Date.parse(po.expectedAt) + late * 86_400_000).toISOString();
        if (Date.parse(tRec) < anchorMs - 2 * 3_600_000) at(tRec, () => receivePo(po.id, tRec));
      });
    }
  }

  function receivePo(poId: ID, t: string) {
    if (noReceive.has(poId)) return;
    const po = db.purchaseOrders[poId];
    if (!po || !['sent', 'acknowledged', 'partial'].includes(po.status)) return;
    const partial = po.status !== 'partial' && rng.chance(0.12);
    safe('grn', () => {
      P.receiveGoods(db, ctx('wh_supervisor', t), {
        poId,
        proposeCost: false,
        allocateBackorders: true,
        lines: po.lines
          .filter((l) => l.qty - l.received - l.damaged > 0)
          .map((l) => {
            const out = l.qty - l.received - l.damaged;
            const q = partial ? Math.round(out * 0.6) : out;
            const dmg = !partial && rng.chance(0.03) ? Math.max(1, Math.round(q * 0.02)) : 0;
            return { poLineId: l.id, qty: q - dmg, damaged: dmg, binId: homeBins(db, l.productId)[0] ?? homeOf[l.productId][0] };
          }),
      });
    });
    if (partial) {
      const t2 = new Date(Date.parse(t) + 2 * 86_400_000).toISOString();
      if (Date.parse(t2) < anchorMs - 2 * 3_600_000) at(t2, () => receivePo(poId, t2));
    }
  }

  function paymentSweep() {
    for (const inv of Object.values(db.invoices)) {
      if (scheduledInv.has(inv.id) || inv.posSaleId) continue;
      scheduledInv.add(inv.id);
      if (neverPay.has(inv.orderId ?? '')) continue;
      const payer = payerOf(inv.customerId);
      const terms = Math.round((Date.parse(inv.dueDate) - Date.parse(inv.issueDate)) / 86_400_000);
      let off = payer === 'good' ? rng.int(-Math.min(12, Math.max(0, terms - 3)), 2) : payer === 'slow' ? rng.int(4, 32) : rng.int(22, 70);
      if (payer === 'late' && Date.parse(inv.issueDate) > anchorMs - 50 * 86_400_000) continue;
      const tp = new Date(Date.parse(inv.dueDate) + off * 86_400_000).toISOString();
      if (Date.parse(tp) >= anchorMs - 3_600_000) continue;
      const split = payer === 'slow' && rng.chance(0.3);
      const pay = (when: string, part: number) =>
        at(when, () =>
          safe('pay', () => {
            const cur = db.invoices[inv.id];
            const bal = cur.total - cur.paid - cur.credited;
            if (bal <= 0) return;
            const amt = part >= 1 ? bal : Math.round(bal * part);
            recordPayment(db, ctx('finance', when), { customerId: inv.customerId, amount: amt, method: rng.pick(['bank_transfer', 'bank_transfer', 'cheque', 'duitnow'] as const), reference: `IBG${String(db.config.seq).padStart(7, '0')}${inv.number.slice(-4)}`, allocations: [{ invoiceId: inv.id, amount: amt }] });
          }),
        );
      if (split) {
        pay(tp, 0.5);
        const tp2 = new Date(Date.parse(tp) + rng.int(10, 20) * 86_400_000).toISOString();
        if (Date.parse(tp2) < anchorMs - 3_600_000) pay(tp2, 1);
      } else pay(tp, 1);
      void off;
      off = 0;
    }
  }

  function posSale(d: number) {
    const pool = all.filter((p) => ['hnd', 'saf', 'plb', 'elc', 'hse', 'chm'].includes(p.categoryId) && p.basePrice < 15000 && !protectedSkus.has(p.id));
    const n = rng.int(1, 3);
    const lines: PosLine[] = [];
    const tier: CustomerTier = rng.chance(0.7) ? 'walkin' : 'trade';
    const t = T(d, rng.int(9, 17), rng.int(0, 59));
    for (let i = 0; i < n; i++) {
      const p = weighted(pool, (x) => popularity[x.id]);
      if (lines.some((l) => l.productId === p.id)) continue;
      const qty = rng.int(1, p.basePrice < 1000 ? 10 : 3);
      const pr = priceLine(db, p, { tier, qty, uom: p.baseUom, at: t });
      lines.push({ id: `${p.id}_${i}`, productId: p.id, qty, uom: p.baseUom, factor: 1, unitPrice: pr.unitPrice, listPrice: pr.listPrice, discountPct: 0, unitCost: pr.unitCost });
    }
    if (!lines.length) return;
    const total = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    safe('pos', () => completePosSale(db, ctx('cashier', t), { tier, customerId: tier === 'trade' ? 'c_trade' : undefined, lines, payMethod: rng.pick(['cash', 'card', 'duitnow'] as const), tendered: Math.ceil(total / 100) * 100 }));
  }

  // ─────────── scenario events embedded in history
  // E: Zamrud large unpaid invoice (overdue) and a recent unpaid one.
  at(T(-48, 10), () =>
    safe('scenarioE1', () => {
      const q = makeQuote(-48, 10, 'c26', [
        { productId: pid('CHM-TAD'), qty: 160, uom: 'BAG' },
        { productId: pid('CHM-SSW'), qty: 96, uom: 'PCS' },
        { productId: pid('HSE-LD6'), qty: 4, uom: 'PCS' },
        { productId: pid('ELC-FL100'), qty: 12, uom: 'PCS' },
      ], false);
      if (!q) return;
      const o = acceptAndOrder(q.id, T(-48, 15), 'delivery', T(-46, 17));
      neverPay.add(o.id);
    }),
  );
  at(T(-10, 10), () =>
    safe('scenarioE2', () => {
      const q = makeQuote(-10, 10, 'c26', [
        { productId: pid('CHM-NSG'), qty: 30, uom: 'BAG' },
        { productId: pid('HND-SL60'), qty: 6, uom: 'PCS' },
        { productId: pid('CHM-CAD'), qty: 48, uom: 'PCS' },
      ], false);
      if (!q) return;
      const o = acceptAndOrder(q.id, T(-10, 15), 'delivery', T(-8, 17));
      neverPay.add(o.id);
    }),
  );
  // C: U-bolt order partially fulfilled with a backorder.
  at(T(-3, 9), () =>
    safe('scenarioC', () => {
      const ub = pid('UBL-M12-4');
      setAvailable(ub, 100, T(-3, 8, 30));
      const q = S.createQuote(db, ctx('sales_exec', T(-3, 9)), {
        customerId: 'c05',
        lines: [
          { productId: ub, qty: 120, uom: 'PCS' },
          { productId: pid('HXB-M12'), qty: 200, uom: 'PCS' },
          { productId: pid('THR-M12'), qty: 20, uom: 'PCS' },
        ],
        validityDays: 7,
        fulfilment: 'delivery',
        channel: 'email',
      });
      issueFlow(q.id, T(-3, 9, 20));
      const o = acceptAndOrder(q.id, T(-3, 14), 'delivery', T(-2, 17));
      db.config.scenario.kristalOrder = o.id;
    }),
  );
  // Delayed import PO
  at(T(-9, 15), () =>
    safe('delayedPO', () => {
      const po = P.createPurchaseOrder(db, ctx('procurement', T(-9, 15)), {
        supplierId: 's12',
        lines: [
          { productId: pid('HND-PW18'), qty: 30, unitCost: db.products[pid('HND-PW18')].latestCost },
          { productId: pid('HSE-PDL50'), qty: 60, unitCost: db.products[pid('HSE-PDL50')].latestCost },
        ],
        expectedAt: T(-3, 10),
        notes: 'Import consignment (simulated). Supplier reported vessel delay at Port Klang; revised ETA not yet confirmed.',
      });
      P.sendPO(db, ctx('procurement', T(-9, 15, 20)), { poId: po.id });
      P.acknowledgePO(db, ctx('procurement', T(-8, 10)), { poId: po.id });
      noReceive.add(po.id);
      db.config.scenario.delayedPo = po.id;
    }),
  );

  // ─────────── run history
  for (let d = -89; d <= -1; d++) {
    const dow = weekday(d);
    for (const p of all) {
      for (const [dd, pct] of drift[p.id]) {
        if (dd !== d) continue;
        at(T(d, 8, 30), () =>
          safe('drift', () => {
            const newCost = Math.round(p.latestCost * (1 + pct / 100));
            const ch = proposeCostChangeInternal(db, ctx('procurement', T(d, 8, 30)), { productId: p.id, supplierCost: newCost, source: 'supplier_list', reason: `Supplier price list update (${db.suppliers[p.preferredSupplierId].name})` });
            const steel = p.categoryId === 'ind' && p.volatility === 'high';
            const pass = steel ? 0.5 : 1;
            const target = pct > 0 ? roundTo(p.basePrice * (1 + (pct / 100) * pass), 5) : p.basePrice;
            approvePriceChange(db, ctx('sales_manager', T(d, 11)), { changeId: ch.id, price: target, note: steel ? 'Partial pass-through to stay competitive on steel (demo)' : 'List price follows supplier update' });
          }),
        );
      }
    }
    if (dow !== 0) {
      const nq = dow === 6 ? rng.int(1, 2) : rng.int(3, 5);
      for (let i = 0; i < nq; i++) {
        const h = rng.int(9, 15);
        at(T(d, h), () => safe('quote', () => void makeQuote(d, h)));
      }
      const np = dow === 6 ? rng.int(1, 3) : rng.int(1, 2);
      for (let i = 0; i < np; i++) at(T(d, 10 + i * 3), () => posSale(d));
      at(T(d, 9, 5), () => fulfilSweep(d));
      at(T(d, 16, 30), () => reorderSweep(d));
    }
    at(T(d, 18), () => paymentSweep());
    runUntil(Date.parse(T(d + 1, 0)));
  }

  // ─────────── today: scenario state (all timestamps before "now")
  const sc = db.config.scenario;
  sc.shockProduct = pid('ANG-5050');
  sc.elbow = pid('PVE-050');
  sc.pipe = pid('PVP-D-050');
  sc.ubolt = pid('UBL-M12-4');
  sc.bayu = 'c13';
  sc.creditCustomer = 'c26';
  const y = (h: number, m = 0) => T(-1, h, m);

  // A — three quotes containing the steel SKU
  safe('A1', () => {
    const q = S.createQuote(db, ctx('sales_exec', y(15, 10)), {
      customerId: 'c11',
      lines: [
        { productId: pid('ANG-5050'), qty: 40, uom: 'LEN' },
        { productId: pid('FLB-506'), qty: 20, uom: 'LEN' },
      ],
      notes: 'Fabrication job — awaiting final quantities from customer',
      channel: 'phone',
    });
    sc.quoteA1 = q.id;
  });
  safe('A2', () => {
    const q = S.createQuote(db, ctx('sales_exec', y(16, 0)), {
      customerId: 'c03',
      siteId: 'c03_s2',
      lines: [
        { productId: pid('ANG-5050'), qty: 60, uom: 'LEN' },
        { productId: pid('HBM-150'), qty: 6, uom: 'LEN' },
        { productId: pid('HXB-M16'), qty: 4, uom: 'BOX' },
      ],
      notes: 'Call-off under contract GLC-2026-01',
      channel: 'email',
    });
    sc.quoteA2 = q.id;
  });
  safe('A3', () => {
    const q = S.createQuote(db, ctx('sales_exec', T(-2, 10)), {
      customerId: 'c06',
      lines: [
        { productId: pid('ANG-5050'), qty: 30, uom: 'LEN' },
        { productId: pid('SHS-5050'), qty: 20, uom: 'LEN' },
      ],
      validityDays: 7,
      channel: 'whatsapp',
    });
    issueFlow(q.id, T(-2, 10, 30));
    sc.quoteA3 = q.id;
  });

  // B — WhatsApp enquiry; elbow availability exactly 25
  safe('B-stock', () => {
    setAvailable(pid('PVE-050'), 25, AGO(200));
    ensureAvailable(pid('PVP-D-050'), 80, AGO(199));
  });
  safe('B', () => {
    const e = S.receiveEnquiry(db, ctx('sales_exec', AGO(25), false), {
      channel: 'whatsapp',
      customerId: 'c13',
      contactName: 'Rizal Hakim (Bayu Plumbing)',
      contactPhone: '+60 12-000 1291',
      subject: 'Quote for 2" PVC elbows and pipes — Bandar Puteri site',
      text: 'Hi MK team, boleh quote? Need 40 pcs 2" PVC elbow 90 and 20 lengths 2" PVC pipe class D. Deliver to our site at Bandar Puteri Puchong by Friday. Thanks!',
      siteName: 'Bandar Puteri Puchong',
      requiredBy: addDays(anchor, 3),
    });
    sc.enquiryB = e.id;
  });

  // D — orders ready to pick (delivery + pickup) and others in flight
  const quick = (cust: string, lines: { productId: ID; qty: number; uom: UomCode }[], mins: number, fulfilment: 'delivery' | 'pickup', reserve = true) => {
    for (const l of lines) ensureAvailable(l.productId, l.qty * (db.products[l.productId].uoms.find((u) => u.uom === l.uom)?.factor ?? 1), AGO(mins + 30));
    const q = S.createQuote(db, ctx('sales_exec', AGO(mins + 20)), { customerId: cust, lines, fulfilment, validityDays: 3 });
    issueFlow(q.id, AGO(mins + 15));
    return acceptAndOrder(q.id, AGO(mins), fulfilment, addDays(anchor, 1), reserve);
  };
  safe('D1', () => {
    sc.orderD1 = quick('c01', [{ productId: pid('SHM-YLW'), qty: 40, uom: 'PCS' }, { productId: pid('GLV-NIT'), qty: 10, uom: 'BOX' }, { productId: pid('SFC-28'), qty: 20, uom: 'PCS' }], 300, 'delivery').id;
  });
  safe('D2', () => {
    sc.orderD2 = quick('c04', [{ productId: pid('CHM-SSW'), qty: 1, uom: 'CTN' }, { productId: pid('HND-MT5'), qty: 6, uom: 'PCS' }], 280, 'pickup').id;
  });
  safe('D3', () => {
    const o = quick('c08', [{ productId: pid('CPV-80'), qty: 600, uom: 'PCS' }, { productId: pid('CEM-50'), qty: 30, uom: 'BAG' }], 420, 'delivery');
    const pl = F.createPicklist(db, ctx('wh_supervisor', AGO(380)), { orderId: o.id });
    F.pickAll(db, ctx('wh_supervisor', AGO(360)), { picklistId: pl.id });
    const dd = F.createDelivery(db, ctx('wh_supervisor', AGO(330)), { orderId: o.id, type: 'delivery' });
    F.scheduleDelivery(db, ctx('dispatcher', AGO(320)), { doId: dd.id, vehicleId: 'v3', driverId: 'd3', date: AGO(200) });
    F.dispatchDelivery(db, ctx('dispatcher', AGO(95), false), { doId: dd.id });
    F.advanceRoute(db, ctx('dispatcher', AGO(40)), { doId: dd.id });
    sc.orderD3 = o.id;
  });
  safe('D4', () => {
    const o = quick('c15', [{ productId: pid('BRC-A7'), qty: 20, uom: 'SHEET' }, { productId: pid('ANG-2525'), qty: 30, uom: 'LEN' }], 360, 'delivery');
    const pl = F.createPicklist(db, ctx('wh_supervisor', AGO(250)), { orderId: o.id });
    F.pickAll(db, ctx('wh_supervisor', AGO(230)), { picklistId: pl.id });
    F.createDelivery(db, ctx('wh_supervisor', AGO(210)), { orderId: o.id, type: 'delivery' });
  });
  safe('D5', () => {
    const o = quick('c14', [{ productId: pid('PVP-D-100'), qty: 40, uom: 'LEN' }, { productId: pid('UPD-110'), qty: 24, uom: 'LEN' }], 520, 'delivery');
    const pl = F.createPicklist(db, ctx('wh_supervisor', AGO(470)), { orderId: o.id });
    F.pickAll(db, ctx('wh_supervisor', AGO(450)), { picklistId: pl.id });
    const dd = F.createDelivery(db, ctx('wh_supervisor', AGO(430)), { orderId: o.id, type: 'delivery' });
    F.scheduleDelivery(db, ctx('dispatcher', AGO(400)), { doId: dd.id, vehicleId: 'v1', driverId: 'd1', date: T(1, 9) });
  });
  safe('D6', () => {
    const o = quick('c24', [{ productId: pid('ELC-FL50'), qty: 10, uom: 'PCS' }, { productId: pid('ELC-EXT4'), qty: 5, uom: 'PCS' }], 340, 'pickup');
    const pl = F.createPicklist(db, ctx('wh_supervisor', AGO(300)), { orderId: o.id });
    F.pickAll(db, ctx('wh_supervisor', AGO(290)), { picklistId: pl.id });
    F.createDelivery(db, ctx('wh_supervisor', AGO(270)), { orderId: o.id, type: 'pickup' });
  });
  safe('D8', () => {
    sc.orderD8 = quick('c19', [{ productId: pid('PVP-D-080'), qty: 30, uom: 'LEN' }, { productId: pid('SGW-150'), qty: 40, uom: 'LEN' }], 150, 'delivery', false).id;
  });

  // E — accepted quote for Zamrud ready to convert (credit hold expected)
  safe('E', () => {
    const q = S.createQuote(db, ctx('sales_exec', AGO(260)), {
      customerId: 'c26',
      lines: [
        { productId: pid('CHM-TAD'), qty: 40, uom: 'BAG' },
        { productId: pid('HND-SL60'), qty: 5, uom: 'PCS' },
        { productId: pid('CHM-SSC'), qty: 2, uom: 'CTN' },
      ],
      validityDays: 3,
      channel: 'whatsapp',
    });
    issueFlow(q.id, AGO(240));
    S.markQuoteAccepted(db, ctx('sales_exec', AGO(190)), { quoteId: q.id });
    sc.quoteE = q.id;
  });

  // Pending approvals: supplier list increase + margin approval on a project quote
  safe('pending-price', () => {
    const p = db.products[pid('GTX-200')];
    proposeCostChangeInternal(db, ctx('procurement', AGO(150), false), { productId: p.id, supplierCost: Math.round(p.latestCost * 1.06), supplierId: 's16', source: 'supplier_list', reason: 'Delta Geo-Synthetics price list effective this week' });
  });
  safe('pending-quote', () => {
    const q = S.createQuote(db, ctx('sales_exec', AGO(240)), {
      customerId: 'c07',
      siteId: 'c07_s2',
      lines: [
        { productId: pid('CEM-50'), qty: 200, uom: 'BAG' },
        { productId: pid('BRC-A10'), qty: 30, uom: 'SHEET', discountPct: 8 },
        { productId: pid('GTX-150'), qty: 4, uom: 'ROLL' },
      ],
      projectRef: 'Seroja Residences Phase 2',
      validityDays: 7,
      channel: 'email',
    });
    S.submitQuote(db, ctx('sales_exec', AGO(230), false), { quoteId: q.id });
  });
  // Drafts in progress
  safe('drafts', () => {
    S.createQuote(db, ctx('sales_exec', AGO(130)), { customerId: 'c02', lines: [{ productId: pid('CHM-TAD'), qty: 20, uom: 'BAG' }, { productId: pid('PVE-025'), qty: 2, uom: 'BOX' }, { productId: pid('BT-015'), qty: 6, uom: 'PCS' }], channel: 'whatsapp' });
  });

  // Enquiry inbox (synthetic conversations)
  const enq = (mins: number, a: Parameters<typeof S.receiveEnquiry>[2], after?: (id: ID) => void) =>
    safe('enquiry', () => {
      const e = S.receiveEnquiry(db, ctx('sales_exec', AGO(mins), mins > 120), a);
      after?.(e.id);
    });
  enq(70, { channel: 'website', customerId: 'c07', contactName: 'Nurul Aina (Seroja Project Builders)', contactPhone: '+60 12-000 1249', subject: 'Website RFQ — grout and curing compound', text: 'Request for quotation: 50 bags non-shrink grout 25kg and 6 pails concrete curing compound 20L for Seroja Phase 2 site. Please include delivery.', siteName: 'Seroja Residences Phase 2', requiredBy: addDays(anchor, 5) });
  enq(190, { channel: 'email', customerId: 'c20', contactName: 'Vincent Chua (Sinar Logistics)', contactPhone: '+60 12-000 1333', subject: 'Safety items for warehouse audit', text: 'Hello, please quote 30 pcs safety cone 28", 50 pcs reflective safety vest and 10 box nitrile gloves. Delivery to Klang warehouse.' }, (id) => {
    S.qualifyEnquiry(db, ctx('sales_exec', AGO(170)), { enquiryId: id, customerId: 'c20', siteName: 'Klang warehouse' });
  });
  enq(260, { channel: 'phone', contactName: 'Encik Hairul (new prospect)', contactPhone: '+60 12-000 1777', subject: 'Phone enquiry — water tank and valves', text: 'Caller asked price for 2 pcs 1000L water tank and 4 pcs brass ball valve 1". Wants self-pickup this weekend.' });
  enq(1500, { channel: 'whatsapp', customerId: 'c16', contactName: 'Zulkifli Hassan (Lestari Roofing)', contactPhone: '+60 12-000 1312', subject: 'Roofing materials — Shah Alam site', text: 'Boss, need 300 m metal deck roofing 0.4mm, 10 roll roofing felt and 4 box roofing screw. Site Shah Alam next Tuesday.', siteName: 'Shah Alam', requiredBy: addDays(anchor, 6) }, (id) => {
    S.qualifyEnquiry(db, ctx('sales_exec', T(-1, 11)), { enquiryId: id, customerId: 'c16' });
    S.convertEnquiryToRfq(db, ctx('sales_exec', T(-1, 11, 20)), { enquiryId: id });
    db.enquiries[id].unread = false;
  });
  enq(2900, { channel: 'email', customerId: 'c17', contactName: 'Arun Prakash (Arjuna Electrical)', contactPhone: '+60 12-000 1319', subject: 'Cable, MCB and floodlights', text: 'Please quote 5 roll 2.5mm cable, 20 pcs MCB 20A and 10 pcs LED floodlight 100W.' }, (id) => {
    S.qualifyEnquiry(db, ctx('sales_exec', T(-2, 11)), { enquiryId: id, customerId: 'c17' });
    const r = S.convertEnquiryToRfq(db, ctx('sales_exec', T(-2, 11, 10)), { enquiryId: id });
    const q = S.createQuoteFromRfq(db, ctx('sales_exec', T(-2, 11, 30)), { rfqId: r.id });
    issueFlow(q.id, T(-2, 12));
    db.enquiries[id].unread = false;
  });
  enq(400, { channel: 'whatsapp', customerId: 'c23', contactName: 'Hanis Rahman (Embun Aqua)', contactPhone: '+60 12-000 1361', subject: 'PVC fittings top-up', text: 'Hi, need 50 pcs 2" tee, 50 pcs 2" socket and 6 pcs PVC solvent cement 500g please.' }, (id) => {
    S.qualifyEnquiry(db, ctx('sales_exec', AGO(380)), { enquiryId: id, customerId: 'c23' });
    const r = S.convertEnquiryToRfq(db, ctx('sales_exec', AGO(375)), { enquiryId: id });
    S.createQuoteFromRfq(db, ctx('sales_exec', AGO(370)), { rfqId: r.id });
    db.enquiries[id].unread = false;
  });
  enq(5800, { channel: 'website', customerId: 'c24', contactName: 'Eric Teoh (Gemilang Shopfit)', contactPhone: '+60 12-000 1368', subject: 'Storage boxes for shopfit project', text: 'Looking for 40 pcs storage box 60L and 20 pcs stackable crate.' }, (id) => {
    S.qualifyEnquiry(db, ctx('sales_exec', T(-4, 11)), { enquiryId: id, customerId: 'c24' });
    S.markEnquiryLost(db, ctx('sales_exec', T(-3, 16)), { enquiryId: id, reason: 'Customer bought elsewhere (price)' });
    db.enquiries[id].unread = false;
  });

  // Quote expiry + ABC classification by 90-day revenue
  S.expireQuotes(db, ctx('sales_manager', anchor));
  const rev: Record<ID, number> = {};
  for (const inv of Object.values(db.invoices)) for (const l of inv.lines) rev[l.productId] = (rev[l.productId] ?? 0) + l.lineTotal;
  const ranked = Object.keys(db.products).sort((a, b) => (rev[b] ?? 0) - (rev[a] ?? 0));
  ranked.forEach((id, i) => (db.products[id].abc = i < ranked.length * 0.2 ? 'A' : i < ranked.length * 0.5 ? 'B' : 'C'));
  db.products[pid('ANG-5050')].watch = true;
  db.products[pid('PVP-D-050')].watch = true;

  // A few contextual notifications for "today"
  const note = (mins: number, n: Omit<DbState['notifications'][string], 'id' | 'at' | 'read'>) => {
    const id = `nt_seed_${mins}`;
    db.notifications[id] = { id, at: AGO(mins), read: false, ...n };
  };
  const overdueInv = Object.values(db.invoices).find((i) => i.customerId === 'c26' && i.total - i.paid > 0 && i.dueDate < anchor);
  if (overdueInv) note(55, { kind: 'finance', severity: 'warning', title: `Overdue · ${db.customers.c26.name}`, body: `${overdueInv.number} is past due. Credit exposure is near the limit.`, link: '/finance?tab=receivables' });
  const dpo = sc.delayedPo ? db.purchaseOrders[sc.delayedPo] : undefined;
  if (dpo) note(180, { kind: 'procurement', severity: 'warning', title: `PO overdue · ${dpo.number}`, body: `${db.suppliers[dpo.supplierId].name}: expected ${dpo.expectedAt.slice(0, 10)}, not yet received.`, link: `/procurement?tab=pos&id=${dpo.id}` });
  note(140, { kind: 'stock', severity: 'warning', title: 'Low stock · UBL-M12-4', body: 'U-bolt M12 for 4" pipe is below reorder point with an open backorder.', link: '/inventory?tab=reorder' });

  return { db, warnings };
}

export function scenarioIds(db: DbState) {
  return db.config.scenario;
}
