import type { DbState } from '@/domain/state';
import type { Bin, ID, Rack } from '@/domain/types';
import { stockIndex } from '@/domain/inventory';

export type Mode = 'occupancy' | 'low' | 'route' | 'receiving';

export interface BinView {
  bin: Bin;
  rack?: Rack;
  zoneCode: string;
  pos: [number, number, number];
  size: [number, number, number];
  occupancy: number;
  items: { productId: ID; sku: string; qty: number; status: string; low: boolean }[];
  low: boolean;
  recent: boolean;
}

/** World-space geometry for every rack/floor bin (metres). Racks run along X; rack.z is the centre line. */
export function binViews(db: DbState, now: string): BinView[] {
  const idx = stockIndex(db);
  const byBin: Record<ID, BinView['items']> = {};
  for (const s of Object.values(db.binStock)) {
    const p = db.products[s.productId];
    if (!p) continue;
    const st = idx[p.id];
    const low = !!st && st.available + st.incoming < p.reorderPoint;
    (byBin[s.binId] ||= []).push({ productId: p.id, sku: p.sku, qty: s.qty, status: s.status, low });
  }
  const recentCut = new Date(Date.parse(now) - 7 * 86_400_000).toISOString();
  const recentBins = new Set<ID>();
  for (const g of Object.values(db.goodsReceipts)) if (g.receivedAt >= recentCut) for (const l of g.lines) recentBins.add(l.binId);
  const out: BinView[] = [];
  for (const b of Object.values(db.bins)) {
    if (!b.rackId) continue;
    const r = db.racks[b.rackId];
    if (!r) continue;
    const bayW = r.w / r.bays;
    const levelH = r.h / r.levels;
    const items = byBin[b.id] ?? [];
    let occ = 0;
    for (const it of items) {
      const p = db.products[it.productId];
      occ += it.qty / Math.max(1, (p?.reorderQty ?? 100) * 2.5);
    }
    out.push({
      bin: b,
      rack: r,
      zoneCode: db.zones[r.zoneId]?.code ?? '',
      pos: [r.x + (b.bay - 0.5) * bayW, r.type === 'floor' ? 0.35 : (b.level - 1) * levelH + levelH * 0.42, r.z],
      size: [bayW * 0.82, r.type === 'floor' ? 0.7 : levelH * 0.62, r.d * (r.type === 'floor' ? 0.8 : 0.82)],
      occupancy: Math.min(1.25, occ),
      items,
      low: items.some((i) => i.low && i.status === 'ok'),
      recent: recentBins.has(b.id),
    });
  }
  return out;
}

export const SPECIAL = {
  dock: [5, 0.5, 6] as [number, number, number],
  staging: [55, 0.5, 6] as [number, number, number],
  quarantine: [4, 0.5, 31] as [number, number, number],
};

const MAIN_Z = 17.8;
const VERT: Record<string, number[]> = { A: [11, 33], B: [33, 52.3], C: [12.6, 30, 47], BF: [52.3] };

export function aisleZ(r: Rack, zoneCode: string) {
  if (r.type === 'floor') return r.z;
  return zoneCode === 'C' ? r.z + 2.25 : r.z - 2;
}

/** Diagrammatic Manhattan path through the main corridor and cross-aisles (not route-optimised). */
export function pathTo(from: [number, number], v: BinView): [number, number][] {
  const r = v.rack!;
  const vx = (VERT[r.type === 'floor' ? 'BF' : v.zoneCode] ?? [30]).reduce((best, x) => (Math.abs(x - v.pos[0]) < Math.abs(best - v.pos[0]) ? x : best));
  const az = aisleZ(r, v.zoneCode);
  const directFront = (v.zoneCode === 'A' || v.zoneCode === 'B') && Math.abs(az - (MAIN_Z + 2.7)) < 0.6;
  const pts: [number, number][] = [from, [from[0], MAIN_Z]];
  if (r.type === 'floor') pts.push([vx, MAIN_Z], [vx, az], [v.pos[0], az]);
  else if (directFront) pts.push([v.pos[0], MAIN_Z], [v.pos[0], az]);
  else pts.push([vx, MAIN_Z], [vx, az], [v.pos[0], az]);
  return pts;
}

export function pickRoute(views: BinView[], binIds: ID[]): { points: [number, number][]; stops: BinView[] } {
  const stops = binIds.map((id) => views.find((v) => v.bin.id === id)).filter(Boolean) as BinView[];
  stops.sort((a, b) => a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2]);
  let cur: [number, number] = [SPECIAL.staging[0], SPECIAL.staging[2]];
  const pts: [number, number][] = [];
  for (const s of stops) {
    const p = pathTo(cur, s);
    pts.push(...p);
    cur = p[p.length - 1];
    // back to the corridor via the same cross-aisle
    const back = [...p].reverse().slice(1, -1);
    pts.push(...back);
    cur = back.length ? back[back.length - 1] : cur;
  }
  pts.push([SPECIAL.staging[0], MAIN_Z], [SPECIAL.staging[0], SPECIAL.staging[2]]);
  // remove consecutive duplicates
  const clean = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  return { points: clean, stops };
}

/** Colour per mode (hex, theme-aware). Every colour is paired with a text status in tooltips/legend. */
export function colorFor(v: BinView, mode: Mode, dark: boolean, highlight: Set<ID>): string {
  const empty = dark ? '#2b4a40' : '#d5e2da';
  if (mode === 'route') return highlight.has(v.bin.id) ? '#F08B46' : dark ? '#24413a' : '#e3ebe6';
  if (mode === 'receiving') return highlight.has(v.bin.id) ? '#2a78d6' : v.recent ? (dark ? '#3a6fb3' : '#86b6ef') : v.items.length ? (dark ? '#335549' : '#c8d8cd') : empty;
  if (!v.items.length) return empty;
  if (mode === 'low') return v.low ? '#D95752' : v.items.some((i) => i.status !== 'ok') ? '#E0A43A' : dark ? '#1f8a63' : '#9fdcbf';
  const o = v.occupancy;
  if (o > 0.85) return '#F08B46';
  if (o > 0.45) return dark ? '#3fc08d' : '#29B47F';
  if (o > 0.15) return dark ? '#1f8a63' : '#52c898';
  return dark ? '#1d5c47' : '#9fdcbf';
}

export function occupancyLabel(o: number) {
  return o > 0.85 ? 'Near full' : o > 0.45 ? 'Healthy' : o > 0.15 ? 'Low fill' : o > 0 ? 'Nearly empty' : 'Empty';
}
