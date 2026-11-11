import * as React from 'react';
import type { DbState } from '@/domain/state';
import type { ID } from '@/domain/types';
import { cn } from '@/lib/utils';
import { colorFor, SPECIAL, type BinView, type Mode } from './model';

/**
 * Accessible 2D floor plan — the no-WebGL / low-power fallback and the mini-map.
 * Each rack bay is a button; levels are aggregated (worst status / max fill).
 */
export function FloorPlan2D({
  db,
  views,
  mode,
  dark,
  highlight,
  route,
  selectedRack,
  onSelectRack,
  mini,
  pulseBin,
}: {
  db: DbState;
  views: BinView[];
  mode: Mode;
  dark: boolean;
  highlight: Set<ID>;
  route?: [number, number][];
  selectedRack?: ID | null;
  onSelectRack?: (rackId: ID, binId?: ID) => void;
  mini?: boolean;
  pulseBin?: ID;
}) {
  const wh = Object.values(db.warehouses)[0];
  const bays = React.useMemo(() => {
    const m = new Map<string, BinView[]>();
    for (const v of views) {
      const k = `${v.rack!.id}|${v.bin.bay}`;
      const arr = m.get(k) ?? [];
      arr.push(v);
      m.set(k, arr);
    }
    return [...m.entries()].map(([k, list]) => {
      const top = [...list].sort((a, b) => {
        const score = (x: BinView) => (highlight.has(x.bin.id) ? 3 : 0) + (x.low ? 2 : 0) + x.occupancy;
        return score(b) - score(a);
      })[0];
      return { k, list, top };
    });
  }, [views, highlight]);
  return (
    <svg viewBox={`-1 -1 ${(wh?.width ?? 60) + 2} ${(wh?.depth ?? 36) + 2}`} className={cn('w-full', !mini && 'rounded-2xl bg-surface-2')} role="group" aria-label="Warehouse floor plan (illustrative)">
      <rect x={0} y={0} width={wh?.width ?? 60} height={wh?.depth ?? 36} fill="none" stroke="var(--line-strong)" strokeWidth={0.25} />
      {Object.values(db.zones).map((z) => (
        <g key={z.id}>
          <rect x={z.x} y={z.z} width={z.w} height={z.d} rx={0.6} fill={z.kind === 'storage' ? 'var(--accent-soft)' : z.kind === 'quarantine' ? 'var(--danger-soft)' : 'var(--info-soft)'} opacity={0.6} />
          {!mini && (
            <text x={z.x + 0.6} y={z.z + 1.6} fontSize={1.2} fill="var(--muted)" fontWeight={700}>
              {z.name}
            </text>
          )}
        </g>
      ))}
      <rect x={0} y={16.8} width={60} height={2} fill="var(--surface-3)" opacity={0.8} />
      {!mini && (
        <text x={24} y={18.2} fontSize={0.9} fill="var(--muted)">
          Main aisle
        </text>
      )}
      {bays.map(({ k, list, top }) => {
        const r = top.rack!;
        const bw = r.w / r.bays;
        const x = r.x + (top.bin.bay - 1) * bw;
        const c = colorFor(top, mode, dark, highlight);
        const label = `${r.code} bay ${top.bin.bay}: ${list.map((b) => `${b.bin.code} ${b.items.map((i) => `${i.sku}×${i.qty}`).join(', ') || 'empty'}`).join('; ')}`;
        return (
          <g key={k}>
            <rect
              x={x + 0.08}
              y={r.z - r.d / 2}
              width={bw - 0.16}
              height={r.d}
              rx={0.2}
              fill={c}
              stroke={selectedRack === r.id ? 'var(--ink)' : 'transparent'}
              strokeWidth={0.18}
              className={cn(onSelectRack && 'cursor-pointer hover:opacity-80', list.some((b) => b.bin.id === pulseBin) && 'animate-pulse')}
              onClick={() => onSelectRack?.(r.id, list.find((b) => highlight.has(b.bin.id))?.bin.id ?? top.bin.id)}
              role={onSelectRack ? 'button' : undefined}
              tabIndex={onSelectRack ? 0 : undefined}
              aria-label={label}
              onKeyDown={(e) => e.key === 'Enter' && onSelectRack?.(r.id, top.bin.id)}
            >
              <title>{label}</title>
            </rect>
          </g>
        );
      })}
      {!mini &&
        Object.values(db.racks).map((r) => (
          <text key={r.id} x={r.x - 0.2} y={r.z + 0.35} fontSize={0.8} fill="var(--ink-2)" textAnchor="end" fontWeight={700}>
            {r.code}
          </text>
        ))}
      <circle cx={SPECIAL.dock[0]} cy={SPECIAL.dock[2]} r={0.9} fill="var(--info)" />
      <circle cx={SPECIAL.staging[0]} cy={SPECIAL.staging[2]} r={0.9} fill="var(--orange)" />
      {!mini && (
        <>
          <text x={SPECIAL.dock[0] + 1.3} y={SPECIAL.dock[2] + 0.35} fontSize={1} fill="var(--ink-2)">
            Receiving dock
          </text>
          <text x={SPECIAL.staging[0] - 1.3} y={SPECIAL.staging[2] + 0.35} fontSize={1} fill="var(--ink-2)" textAnchor="end">
            Dispatch staging
          </text>
        </>
      )}
      {route && route.length > 1 && (
        <polyline points={route.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--orange)" strokeWidth={0.35} strokeDasharray="0.9 0.5" strokeLinejoin="round">
          <animate attributeName="stroke-dashoffset" from="0" to="-2.8" dur="1.2s" repeatCount="indefinite" />
        </polyline>
      )}
    </svg>
  );
}
