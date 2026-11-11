import type { ExtractedLine, Product, UomCode } from './types';
import { hasUom } from './uom';

/**
 * Rule-based (NOT AI) enquiry line extraction. Finds "quantity + unit + description"
 * patterns, then scores catalog products by keyword overlap (65%) and size/spec token
 * overlap (35%), e.g. 2", 100W, 2.5mm, M12, 25kg. Every suggestion is confirmed by staff.
 */
const UOM_WORDS: [RegExp, UomCode][] = [
  [/^(pcs|pc|pieces?|units?|nos?|biji|ea|pails?|tins?|cans?|tubes?)$/i, 'PCS'],
  [/^(lengths?|len|batang|lgth)$/i, 'LEN'],
  [/^(m|meters?|metres?|mtrs?)$/i, 'M'],
  [/^(rolls?)$/i, 'ROLL'],
  [/^(box|boxes|kotak)$/i, 'BOX'],
  [/^(ctn|cartons?)$/i, 'CTN'],
  [/^(bags?|beg|sacks?)$/i, 'BAG'],
  [/^(kg|kgs|kilos?)$/i, 'KG'],
  [/^(drums?)$/i, 'DRUM'],
  [/^(pairs?|prs?|pasang)$/i, 'PAIR'],
  [/^(sheets?|keping)$/i, 'SHEET'],
  [/^(sets?)$/i, 'SET'],
  [/^(l|ltrs?|litres?|liters?)$/i, 'L'],
  [/^(pallets?)$/i, 'PALLET'],
  [/^(tonnes?|tons?|mt)$/i, 'TONNE'],
];

const STOP = new Set(
  'hi hello boss need needs please pls quote quotation rfq request price prices for the and our to at by of with in on site deliver delivery mk team can want require required also plus dan lagi untuk ya ok tq thanks thank you boleh nak ada pcs pc units unit lengths length roll rolls box boxes bag bags nos caller asked looking some few this next week tuesday friday monday wednesday thursday saturday sunday weekend top up topup is are we us me my your from send'.split(
    ' ',
  ),
);

function uomFromWord(w: string): UomCode | undefined {
  for (const [re, u] of UOM_WORDS) if (re.test(w)) return u;
  return undefined;
}

/** Normalise sizes so 2", 2 inch, 2in all become 2" ; 1/2 inch → 1/2". */
export function normaliseText(s: string) {
  return s
    .replace(/[“”″]/g, '"')
    .replace(/(\d+(?:\/\d+)?(?:-\d\/\d)?)\s*(?:inch(?:es)?|in\b|'')/gi, '$1"')
    .replace(/\s+x\s+/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitSegments(text: string): string[] {
  return normaliseText(text)
    .split(/\n|;|•|(?:,\s*(?=\d))|(?:\band\b\s*(?=\d))|(?:\bplus\b\s*(?=\d))|(?:\bdan\b\s*(?=\d))/i)
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s) && s.length > 3);
}

export interface ParsedSegment {
  raw: string;
  qty: number;
  uom?: UomCode;
  description: string;
}

export function parseSegment(seg: string): ParsedSegment | null {
  // Find the first "<number> <word>" whose word is a unit, else the first plain number not followed by a size unit.
  const re = /(\d+(?:\.\d+)?)(")?\s*(?:x\s*)?([a-zA-Z]+)?/g;
  let m: RegExpExecArray | null;
  let fallback: { qty: number; text: string } | null = null;
  while ((m = re.exec(seg))) {
    if (m[2]) continue; // a size like 2"
    const word = m[3];
    if (word && uomFromWord(word)) {
      const qty = parseFloat(m[1]);
      return { raw: seg, qty, uom: uomFromWord(word), description: (seg.slice(0, m.index) + ' ' + seg.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
    }
    const isSize = word && /^(mm|w|a|l|kg|g|v|gsm|ml|ft|m\d*)$/i.test(word);
    if (!fallback && !isSize && !(m.index > 0 && /[a-z]$/i.test(seg[m.index - 1]))) fallback = { qty: parseFloat(m[1]), text: m[1] };
  }
  if (!fallback || !(fallback.qty > 0)) return null;
  return { raw: seg, qty: fallback.qty, uom: undefined, description: seg.replace(fallback.text, ' ').replace(/\s+/g, ' ').trim() };
}

function normNum(n: string) {
  const v = Number(n.replace(/,/g, ''));
  return isFinite(v) ? String(v) : n;
}

/** Extract size/spec tokens: 2", 1-1/2", 2.5mm, 100w, 20a, m12, 25kg, 1000l, 500g, 50x50x5. */
export function sizeTokens(s: string): string[] {
  const t = normaliseText(s)
    .toLowerCase()
    .replace(/²/g, '')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/(\d)\s+(mm|w|a|l|kg|g|v|gsm|ml)\b/g, '$1$2')
    .replace(/(\d)\s*x\s*(\d)/g, '$1x$2');
  const out = new Set<string>();
  for (const m of t.matchAll(/\d+(?:-\d+\/\d+|\/\d+)?"/g)) out.add(m[0]);
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)(mm|w|a|l|kg|g|v|gsm|ml)\b/g)) out.add(normNum(m[1]) + m[2]);
  for (const m of t.matchAll(/\bm(\d{1,2})\b/g)) out.add(`m${m[1]}`);
  for (const m of t.matchAll(/\b\d+x\d+(?:x\d+)?\b/g)) out.add(m[0]);
  return [...out];
}

export function wordTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d/.test(w) && !/^m\d+$/.test(w));
}

interface Indexed {
  p: Product;
  words: string[];
  sizes: Set<string>;
}

let cache: { key: string; idx: Indexed[] } | null = null;
function index(products: Product[]): Indexed[] {
  const key = products.map((p) => p.id + p.updatedAt).join('|');
  if (cache && cache.key === key) return cache.idx;
  const idx = products.map((p) => {
    const hay = `${p.name} ${p.familyName ?? ''} ${p.variantLabel ?? ''} ${Object.values(p.specs).join(' ')}`;
    return { p, words: wordTokens(hay), sizes: new Set(sizeTokens(hay)) };
  });
  cache = { key, idx };
  return idx;
}

function wordMatch(q: string, words: string[]) {
  const stem = q.length >= 5 ? q.slice(0, Math.max(4, q.length - 2)) : q;
  return words.some((w) => w === q || (q.length >= 4 && w.startsWith(stem)) || (w.length >= 4 && q.startsWith(w)));
}

export interface MatchResult {
  product: Product;
  score: number;
}

export function rankProducts(description: string, products: Product[]): MatchResult[] {
  const qWords = [...new Set(wordTokens(description))];
  const qSizes = sizeTokens(description);
  const out: MatchResult[] = [];
  for (const it of index(products)) {
    const hits = qWords.filter((w) => wordMatch(w, it.words)).length;
    if (!hits) continue;
    const wordScore = hits / Math.max(1, qWords.length);
    let sizeScore = 0.5;
    if (qSizes.length) sizeScore = qSizes.filter((s) => it.sizes.has(s)).length / qSizes.length;
    out.push({ product: it.p, score: wordScore * 0.65 + sizeScore * 0.35 });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function extractLines(text: string, products: Product[], makeId: () => string): ExtractedLine[] {
  const active = products.filter((p) => p.status === 'active');
  const out: ExtractedLine[] = [];
  for (const seg of splitSegments(text)) {
    const ps = parseSegment(seg);
    if (!ps) continue;
    const ranked = rankProducts(ps.description, active);
    const best = ranked[0];
    if (!best || best.score < 0.3) {
      out.push({ id: makeId(), raw: seg, qty: ps.qty, uom: ps.uom ?? 'PCS', confidence: 'low', note: 'No confident catalog match — select a SKU' });
      continue;
    }
    const alt = ranked.find((r) => r.product.id !== best.product.id && (r.product.familyId === best.product.familyId || r.product.categoryId === best.product.categoryId));
    const p = best.product;
    const uom: UomCode = ps.uom && hasUom(p, ps.uom) ? ps.uom : p.baseUom;
    const confidence: ExtractedLine['confidence'] = best.score >= 0.8 ? 'high' : best.score >= 0.55 ? 'medium' : 'low';
    out.push({
      id: makeId(),
      raw: seg,
      productId: p.id,
      alternativeId: alt?.product.id,
      qty: ps.qty,
      uom,
      confidence,
      note: ps.uom && !hasUom(p, ps.uom) ? `Customer asked in ${ps.uom}; ${p.sku} sells in ${[p.baseUom, ...p.uoms.map((u) => u.uom)].join('/')} — confirm conversion` : undefined,
    });
  }
  return out;
}
