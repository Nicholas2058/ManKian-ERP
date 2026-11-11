/**
 * Money helpers. All monetary values are stored as integer sen (1 RM = 100 sen)
 * to avoid floating-point accumulation. Only convert to RM for display.
 */
export type Sen = number;

export const toSen = (rm: number): Sen => Math.round(rm * 100);
export const fromSen = (sen: Sen): number => sen / 100;

/** Round a fractional sen value to an integer sen (half away from zero). */
export function roundSen(x: number): Sen {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** Round up to the next multiple of `step` sen (used for price endings, e.g. 5 sen). */
export function roundUpTo(sen: number, step: number): Sen {
  // Tolerance absorbs binary floating-point noise (e.g. 1000.0000001 sen) without hiding real fractions.
  if (step <= 1) return Math.ceil(sen - 1e-6);
  return Math.ceil(sen / step - 1e-6) * step;
}

/** Round to the nearest multiple of `step` sen. */
export function roundTo(sen: number, step: number): Sen {
  if (step <= 1) return Math.round(sen);
  return Math.round(sen / step) * step;
}

export function sumSen(values: Sen[]): Sen {
  let t = 0;
  for (const v of values) t += v;
  return t;
}

/** Line total = unit price x qty, less line discount, rounded once per line. */
export function lineTotal(unitPrice: Sen, qty: number, discountPct = 0): Sen {
  return roundSen(unitPrice * qty * (1 - discountPct / 100));
}

/** Gross margin % = (price - cost) / price x 100. */
export function marginPct(price: Sen, cost: Sen): number {
  if (price <= 0) return 0;
  return ((price - cost) / price) * 100;
}

/** Markup % = (price - cost) / cost x 100. Distinct from margin. */
export function markupPct(price: Sen, cost: Sen): number {
  if (cost <= 0) return 0;
  return ((price - cost) / cost) * 100;
}

/** Price required to achieve a target gross margin on a cost. */
export function priceForMargin(cost: Sen, targetMarginPct: number): number {
  const m = Math.min(targetMarginPct, 95) / 100;
  return cost / (1 - m);
}

/** Price from cost and markup. */
export function priceForMarkup(cost: Sen, mkPct: number): number {
  return cost * (1 + mkPct / 100);
}

/** Percentage change helper (returns 0 when base is 0). */
export function pctChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

const rmFmt = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rmFmt0 = new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** "RM 1,234.50" */
export function formatRM(sen: Sen, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const v = sen / 100;
  const s = (opts.decimals === false ? rmFmt0 : rmFmt).format(Math.abs(v)).replace(/^(?:MYR|RM)\s*/, 'RM ');
  if (v < 0) return `-${s}`;
  if (opts.sign && v > 0) return `+${s}`;
  return s;
}

/** Compact "RM 12.9K" / "RM 1.2M" */
export function compactRM(sen: Sen): string {
  const v = sen / 100;
  const a = Math.abs(v);
  let s: string;
  if (a >= 1_000_000) s = `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  else if (a >= 10_000) s = `${(a / 1000).toFixed(1)}K`;
  else if (a >= 1000) s = `${(a / 1000).toFixed(2)}K`;
  else s = a.toFixed(0);
  return `${v < 0 ? '-' : ''}RM ${s}`;
}

export function formatPct(v: number, digits = 1, sign = false): string {
  if (!isFinite(v)) return '—';
  const s = `${Math.abs(v).toFixed(digits)}%`;
  if (v < 0) return `-${s}`;
  if (sign && v > 0) return `+${s}`;
  return s;
}

export function formatNum(v: number, digits = 0): string {
  return new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
}
