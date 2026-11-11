import Papa from 'papaparse';
import { z } from 'zod';
import type { DbState } from '@/domain/state';
import type { ID } from '@/domain/types';
import { toSen, pctChange } from '@/lib/money';

/** Supplier cost import template (one row per SKU). */
export const COST_TEMPLATE = 'sku,supplier_code,supplier_cost_rm,effective_date,note\nANG-5050,SUP-ARD,71.50,2026-11-12,Mill price notice\nPVP-D-050,SUP-BLR,29.40,,Weekly list\n';

const costRow = z.object({
  sku: z.string().trim().min(1, 'SKU is required'),
  supplier_code: z.string().trim().optional().default(''),
  supplier_cost_rm: z
    .string()
    .trim()
    .min(1, 'Cost is required')
    .refine((v) => /^\d+(\.\d{1,4})?$/.test(v), 'Cost must be a positive number (e.g. 12.50)'),
  effective_date: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Date must be YYYY-MM-DD'),
  note: z.string().trim().optional().default(''),
});

export interface CostPreviewRow {
  line: number;
  raw: Record<string, string>;
  ok: boolean;
  errors: string[];
  warnings: string[];
  productId?: ID;
  supplierId?: ID;
  supplierCost?: number;
  effectiveFrom?: string;
  note?: string;
  changePct?: number;
}

export function parseCostCsv(text: string, db: DbState): { rows: CostPreviewRow[]; headerError?: string } {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_') });
  const required = ['sku', 'supplier_cost_rm'];
  const missing = required.filter((h) => !res.meta.fields?.includes(h));
  if (missing.length) return { rows: [], headerError: `Missing required column(s): ${missing.join(', ')}. Download the template for the expected format.` };
  const bySku = new Map(Object.values(db.products).map((p) => [p.sku.toUpperCase(), p]));
  const byCode = new Map(Object.values(db.suppliers).map((s) => [s.code.toUpperCase(), s]));
  const seen = new Set<string>();
  const rows = res.data.map((raw, i): CostPreviewRow => {
    const r: CostPreviewRow = { line: i + 2, raw, ok: false, errors: [], warnings: [] };
    const parsed = costRow.safeParse(raw);
    if (!parsed.success) {
      r.errors.push(...parsed.error.issues.map((x) => x.message));
      return r;
    }
    const d = parsed.data;
    const p = bySku.get(d.sku.toUpperCase());
    if (!p) r.errors.push(`Unknown SKU "${d.sku}"`);
    else if (p.status !== 'active') r.errors.push(`${d.sku} is discontinued`);
    if (seen.has(d.sku.toUpperCase())) r.errors.push('Duplicate SKU in file');
    seen.add(d.sku.toUpperCase());
    const s = d.supplier_code ? byCode.get(d.supplier_code.toUpperCase()) : undefined;
    if (d.supplier_code && !s) r.errors.push(`Unknown supplier code "${d.supplier_code}"`);
    const cost = toSen(Number(d.supplier_cost_rm));
    if (!(cost > 0)) r.errors.push('Cost must be greater than zero');
    if (p && cost > 0) {
      r.changePct = pctChange(p.latestCost, cost);
      if (Math.abs(r.changePct) > 40) r.errors.push(`Change of ${r.changePct.toFixed(1)}% looks like a data error (limit ±40%)`);
      else if (Math.abs(r.changePct) > 15) r.warnings.push(`Large change ${r.changePct.toFixed(1)}%`);
      if (cost === p.latestCost) r.warnings.push('Same as current cost — no change');
    }
    r.ok = r.errors.length === 0;
    r.productId = p?.id;
    r.supplierId = s?.id;
    r.supplierCost = cost;
    r.effectiveFrom = d.effective_date ? new Date(`${d.effective_date}T00:00:00+08:00`).toISOString() : undefined;
    r.note = d.note;
    return r;
  });
  return { rows };
}

export function toCsv(rows: Record<string, unknown>[]) {
  return Papa.unparse(rows);
}
