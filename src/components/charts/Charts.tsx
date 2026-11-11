import * as React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useMotionOK } from '@/components/widgets';

const axis = { stroke: 'var(--chart-axis)', fontSize: 11, tickLine: false, axisLine: false } as const;

export function ChartTip({ active, payload, label, format, rows }: { active?: boolean; payload?: { value: number; name?: string; dataKey?: string; color?: string; payload?: Record<string, unknown> }[]; label?: string; format: (v: number) => string; rows?: (p: Record<string, unknown>) => { k: string; v: string }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload ?? {};
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-lift)]">
      <p className="mb-1 font-semibold text-ink">{label ?? (p.label as string)}</p>
      {payload.map((x, i) => (
        <p key={i} className="tabular flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: x.color }} />
          {x.name}: <b className="text-ink">{format(Number(x.value))}</b>
        </p>
      ))}
      {rows?.(p).map((r) => (
        <p key={r.k} className="tabular text-muted">
          {r.k}: <span className="text-ink-2">{r.v}</span>
        </p>
      ))}
    </div>
  );
}

/** Single-series area trend with crosshair tooltip. */
export function TrendArea<T extends object>({
  data,
  x,
  y,
  name,
  format,
  axisFormat,
  height = 240,
  onPointClick,
  extraRows,
  color = 'var(--chart-brand)',
}: {
  data: T[];
  x: Extract<keyof T, string>;
  y: Extract<keyof T, string>;
  name: string;
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  onPointClick?: (row: T) => void;
  extraRows?: (p: Record<string, unknown>) => { k: string; v: string }[];
  color?: string;
}) {
  const ok = useMotionOK();
  const gid = React.useId().replace(/:/g, '');
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={(e: unknown) => {
            const idx = (e as { activeTooltipIndex?: number } | null)?.activeTooltipIndex;
            if (onPointClick && typeof idx === 'number' && data[idx]) onPointClick(data[idx]);
          }}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.18} />
              <stop offset="1" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={x as never} {...axis} minTickGap={24} />
          <YAxis {...axis} width={56} tickFormatter={(v) => (axisFormat ?? format)(Number(v))} />
          <Tooltip cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1, strokeDasharray: '0' }} content={<ChartTip format={format} rows={extraRows} />} />
          <Area type="monotone" dataKey={y as never} name={name} stroke={color} strokeWidth={2} fill={`url(#${gid})`} activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={ok} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Line chart with optional reference (floor) line. */
export function TrendLine<T extends object>({ data, x, y, name, format, height = 200, refY, refLabel, color = 'var(--chart-brand)', stepped }: { data: T[]; x: Extract<keyof T, string>; y: Extract<keyof T, string>; name: string; format: (v: number) => string; height?: number; refY?: number; refLabel?: string; color?: string; stepped?: boolean }) {
  const ok = useMotionOK();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={x as never} {...axis} minTickGap={24} />
          <YAxis {...axis} width={56} tickFormatter={(v) => format(Number(v))} domain={['auto', 'auto']} />
          <Tooltip cursor={{ stroke: 'var(--chart-axis)', strokeWidth: 1 }} content={<ChartTip format={format} />} />
          {refY !== undefined && <ReferenceLine y={refY} stroke="var(--danger)" strokeWidth={1} label={{ value: refLabel, fill: 'var(--danger)', fontSize: 10, position: 'insideTopRight' }} />}
          <Line type={stepped ? 'stepAfter' : 'monotone'} dataKey={y as never} name={name} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, stroke: 'var(--surface)', strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={ok} animationDuration={600} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical bar chart (single series), click-to-drill. */
export function Columns<T extends object>({ data, x, y, name, format, axisFormat, height = 220, onBarClick, highlight, color = 'var(--chart-brand)' }: { data: T[]; x: Extract<keyof T, string>; y: Extract<keyof T, string>; name: string; format: (v: number) => string; axisFormat?: (v: number) => string; height?: number; onBarClick?: (r: T) => void; highlight?: (r: T) => boolean; color?: string }) {
  const ok = useMotionOK();
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={x as never} {...axis} minTickGap={8} tick={{ fontSize: 10 }} />
          <YAxis {...axis} width={48} tickFormatter={(v) => (axisFormat ?? format)(Number(v))} />
          <Tooltip cursor={{ fill: 'var(--surface-3)' }} content={<ChartTip format={format} />} />
          <Bar dataKey={y as never} name={name} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={ok} onClick={(d: unknown) => onBarClick?.((d as { payload: T }).payload)} className={onBarClick ? 'cursor-pointer' : undefined}>
            {data.map((r, i) => (
              <Cell key={i} fill={color} fillOpacity={highlight ? (highlight(r) ? 1 : 0.35) : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal labelled bars (HTML) — good for category mix and rankings. */
export function BarList({ rows, format, className, onClick, activeKey }: { rows: { key: string; label: React.ReactNode; value: number; sub?: React.ReactNode; tone?: 'brand' | 'warn' | 'danger' | 'muted' }[]; format: (v: number) => string; className?: string; onClick?: (key: string) => void; activeKey?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const ok = useMotionOK();
  const tone = { brand: 'bg-[var(--chart-brand)]', warn: 'bg-warn', danger: 'bg-danger', muted: 'bg-line-strong' };
  return (
    <ul className={cn('space-y-2.5', className)}>
      {rows.map((r, i) => (
        <li key={r.key}>
          <button
            disabled={!onClick}
            onClick={() => onClick?.(r.key)}
            className={cn('group w-full text-left', onClick && 'cursor-pointer', activeKey && activeKey !== r.key && 'opacity-50')}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium text-ink group-hover:text-brand">{r.label}</span>
              <span className="tabular shrink-0 font-semibold text-ink">
                {format(r.value)} {r.sub && <span className="font-normal text-muted">{r.sub}</span>}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-3">
              <motion.div
                className={cn('h-full rounded-full', tone[r.tone ?? 'brand'])}
                initial={ok ? { width: 0 } : false}
                animate={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
                transition={{ duration: 0.6, delay: ok ? i * 0.04 : 0, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Diverging heatmap: blue (cost down) ↔ grey (no change) ↔ red (cost up). */
export function divergingColor(pct: number) {
  if (Math.abs(pct) < 0.05) return 'var(--div-mid)';
  if (pct > 0) return pct >= 6 ? 'var(--div-pos-3)' : pct >= 2.5 ? 'var(--div-pos-2)' : 'var(--div-pos-1)';
  return pct <= -4 ? 'var(--div-neg-3)' : pct <= -1.5 ? 'var(--div-neg-2)' : 'var(--div-neg-1)';
}

export function Heatmap({ rows, cols, value, onCell, rowLabel, colLabel, cellTitle }: { rows: { key: string; label: string }[]; cols: { key: string; label: string }[]; value: (r: string, c: string) => { v: number; n: number }; onCell?: (r: string, c: string) => void; rowLabel?: string; colLabel?: string; cellTitle: (r: string, c: string, v: number, n: number) => string }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-[3px] text-[11px]">
        <thead>
          <tr>
            <th className="w-36 text-left font-semibold text-muted">{rowLabel}</th>
            {cols.map((c) => (
              <th key={c.key} className="font-medium text-muted">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="truncate pr-2 font-medium text-ink-2">{r.label}</td>
              {cols.map((c) => {
                const { v, n } = value(r.key, c.key);
                return (
                  <td key={c.key} className="p-0">
                    <button
                      title={cellTitle(r.key, c.key, v, n)}
                      aria-label={cellTitle(r.key, c.key, v, n)}
                      onClick={() => onCell?.(r.key, c.key)}
                      className="tabular block h-7 w-full rounded-md text-[10px] font-semibold transition-transform hover:scale-110 hover:shadow-md"
                      style={{ background: divergingColor(v), color: Math.abs(v) >= 2.5 ? '#fff' : 'var(--ink-2)' }}
                    >
                      {n ? `${v > 0 ? '+' : ''}${v.toFixed(1)}` : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted">
        <span>{colLabel}</span>
        <span className="ml-3">Cost down</span>
        {['var(--div-neg-3)', 'var(--div-neg-2)', 'var(--div-neg-1)', 'var(--div-mid)', 'var(--div-pos-1)', 'var(--div-pos-2)', 'var(--div-pos-3)'].map((c) => (
          <span key={c} className="h-2.5 w-5 rounded-sm" style={{ background: c }} />
        ))}
        <span>Cost up</span>
      </div>
    </div>
  );
}

export function Funnel({ stages, format }: { stages: { stage: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  const ok = useMotionOK();
  const ramp = ['var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)'];
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const conv = i > 0 && stages[i - 1].value ? (s.value / stages[i - 1].value) * 100 : null;
        return (
          <div key={s.stage} className="flex items-center gap-3">
            <div className="w-28 shrink-0 text-xs font-medium text-ink-2">{s.stage}</div>
            <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-surface-3">
              <motion.div className="h-full rounded-lg" style={{ background: ramp[i % ramp.length] }} initial={ok ? { width: 0 } : false} animate={{ width: `${(s.value / max) * 100}%` }} transition={{ duration: 0.6, delay: ok ? i * 0.08 : 0 }} />
              <span className={cn('tabular absolute inset-y-0 left-2 flex items-center text-xs font-bold', i >= 2 ? 'text-white' : 'text-forest-950')}>{format ? format(s.value) : s.value}</span>
            </div>
            <div className="tabular w-14 shrink-0 text-right text-xs text-muted">{conv !== null ? `${conv.toFixed(0)}%` : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Profitability waterfall: list price → discount → cost → freight → margin (SVG). */
export function Waterfall({ steps, format, height = 180 }: { steps: { label: string; value: number; kind: 'total' | 'delta' }[]; format: (v: number) => string; height?: number }) {
  const ok = useMotionOK();
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind === 'total') {
      const b = { ...s, from: 0, to: s.value };
      run = s.value;
      return b;
    }
    const b = { ...s, from: run, to: run + s.value };
    run += s.value;
    return b;
  });
  const max = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
  const w = 100 / bars.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Profitability waterfall">
        {bars.map((b, i) => {
          const h = height / 3;
          const top = h - (Math.max(b.from, b.to) / max) * (h - 4);
          const bh = Math.max(0.6, (Math.abs(b.to - b.from) / max) * (h - 4));
          const fill = b.kind === 'total' ? (i === bars.length - 1 ? 'var(--chart-brand)' : 'var(--seq-4)') : b.value < 0 ? 'var(--div-pos-2)' : 'var(--seq-3)';
          return (
            <motion.rect key={b.label} x={i * w + w * 0.18} width={w * 0.64} y={top} height={bh} rx={0.8} fill={fill} initial={ok ? { opacity: 0, scaleY: 0 } : false} animate={{ opacity: 1, scaleY: 1 }} style={{ transformOrigin: `0 ${top + bh}px` }} transition={{ delay: ok ? i * 0.08 : 0, duration: 0.4 }} />
          );
        })}
      </svg>
      <div className="grid text-center text-[10px]" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0,1fr))` }}>
        {bars.map((b) => (
          <div key={b.label} className="px-0.5">
            <div className="tabular font-semibold text-ink">{format(b.value)}</div>
            <div className="truncate text-muted">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 7, label, tone = 'brand' }: { value: number; size?: number; stroke?: number; label?: React.ReactNode; tone?: 'brand' | 'warn' | 'danger' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = tone === 'brand' ? 'var(--chart-brand)' : tone === 'warn' ? 'var(--warn)' : 'var(--danger)';
  const track = tone === 'brand' ? 'var(--accent-soft)' : tone === 'warn' ? 'var(--warn-soft)' : 'var(--danger-soft)';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${Math.round(value)}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(100, value) / 100) }} transition={{ duration: 0.8 }} />
      </svg>
      <div className="tabular absolute inset-0 grid place-items-center text-xs font-bold text-ink">{label ?? `${Math.round(value)}%`}</div>
    </div>
  );
}
