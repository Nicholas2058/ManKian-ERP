import type { Product, UomCode } from './types';
import { DomainError } from './state';
import { formatNum } from '@/lib/money';

export const UOM_LABELS: Record<UomCode, string> = {
  PCS: 'Piece', BOX: 'Box', CTN: 'Carton', BAG: 'Bag', LEN: 'Length', M: 'Metre', ROLL: 'Roll', DRUM: 'Drum',
  L: 'Litre', KG: 'Kilogram', TONNE: 'Tonne', PALLET: 'Pallet', SET: 'Set', PAIR: 'Pair', SHEET: 'Sheet',
};

/** Base units in one `uom` of this product. Throws if the product does not define the UOM — never guessed. */
export function factorOf(p: Pick<Product, 'uoms' | 'sku' | 'baseUom'>, uom: UomCode): number {
  if (uom === p.baseUom) return 1;
  const c = p.uoms.find((u) => u.uom === uom);
  if (!c) throw new DomainError(`${p.sku} has no conversion defined for ${uom}. Add a product-specific UOM conversion first.`, 'uom');
  return c.factor;
}

export function hasUom(p: Pick<Product, 'uoms' | 'baseUom'>, uom: UomCode) {
  return uom === p.baseUom || p.uoms.some((u) => u.uom === uom);
}

export function toBase(p: Pick<Product, 'uoms' | 'sku' | 'baseUom'>, qty: number, uom: UomCode): number {
  return round4(qty * factorOf(p, uom));
}

export function fromBase(p: Pick<Product, 'uoms' | 'sku' | 'baseUom'>, qtyBase: number, uom: UomCode): number {
  return round4(qtyBase / factorOf(p, uom));
}

export function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

/** "1,250 PCS" */
export function fmtQty(qty: number, uom: UomCode) {
  return `${formatNum(qty, 2)} ${uom}`;
}

/** Break a base quantity into the largest whole selling units, e.g. "12 BOX + 50 PCS". */
export function breakdown(p: Pick<Product, 'uoms' | 'baseUom'>, qtyBase: number): string {
  const units = [...p.uoms].filter((u) => u.factor > 1).sort((a, b) => b.factor - a.factor);
  let rest = qtyBase;
  const parts: string[] = [];
  for (const u of units) {
    const n = Math.floor(rest / u.factor + 1e-9);
    if (n > 0) {
      parts.push(`${formatNum(n)} ${u.uom}`);
      rest = round4(rest - n * u.factor);
    }
  }
  if (rest > 0 || parts.length === 0) parts.push(`${formatNum(rest, 2)} ${p.baseUom}`);
  return parts.join(' + ');
}

/** All UOMs a product can be sold/bought in, base first. */
export function productUoms(p: Pick<Product, 'uoms' | 'baseUom'>): { uom: UomCode; factor: number }[] {
  const list = [{ uom: p.baseUom, factor: 1 }, ...p.uoms.filter((u) => u.uom !== p.baseUom)];
  return list;
}
