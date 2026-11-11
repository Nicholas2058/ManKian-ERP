import * as React from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { compactRM, formatPct, formatRM } from '@/lib/money';
import { Card } from './ui/core';
import { Tip } from './ui/overlay';
import { ArrowDownRight, ArrowUpRight, HelpCircle, Lock } from './ui/icons';
import { useSession } from '@/store/session';
import { can, PERM_LABEL, ROLES, rolesWith, type Permission } from '@/domain/roles';

export function useMotionOK() {
  const pref = useSession((s) => s.motion);
  const os = useReducedMotion();
  return pref === 'full' ? true : pref === 'reduce' ? false : !os;
}

/** Animated number that eases between values (respects reduced motion). */
export function AnimatedNumber({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const prev = React.useRef(value);
  const ok = useMotionOK();
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!ok) {
      el.textContent = format(value);
      prev.current = value;
      return;
    }
    const ctrl = animate(prev.current, value, {
      duration: 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    prev.current = value;
    return () => ctrl.stop();
  }, [value, ok, format]);
  return (
    <span ref={ref} className={cn('tabular', className)}>
      {format(value)}
    </span>
  );
}

export const fmtRM = (v: number) => formatRM(Math.round(v));
export const fmtRM0 = (v: number) => formatRM(Math.round(v), { decimals: false });
export const fmtCompact = (v: number) => compactRM(Math.round(v));
export const fmtPct1 = (v: number) => formatPct(v, 1);
export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-MY');

export function Money({ sen, className, compact }: { sen: number; className?: string; compact?: boolean }) {
  return <span className={cn('tabular', className)}>{compact ? compactRM(sen) : formatRM(sen)}</span>;
}

export function Delta({ value, goodWhenUp = true, suffix = '%', className }: { value: number; goodWhenUp?: boolean; suffix?: string; className?: string }) {
  if (!isFinite(value) || Math.abs(value) < 0.05) return <span className={cn('text-xs font-medium text-muted', className)}>no change</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', good ? 'text-brand' : 'text-danger', className)}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

/** Tiny dependency-free sparkline (2px line, end dot). */
export function Sparkline({ values, className, height = 28, width = 96, stroke = 'var(--chart-brand)', area = true, label }: { values: number[]; className?: string; height?: number; width?: number; stroke?: string; area?: boolean; label?: string }) {
  if (values.length < 2) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 6) + 3, height - 4 - ((v - min) / span) * (height - 8)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={label ?? `Trend from ${values[0]} to ${values[values.length - 1]}`}>
      {area && <path d={`${d} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill={stroke} opacity={0.1} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={stroke} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

function useElementWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Sparkline that takes only the space left in its row (never overflows the tile). */
function FluidSparkline({ values }: { values: number[] }) {
  const [ref, w] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="ml-auto hidden h-[30px] min-w-0 max-w-[96px] flex-1 justify-end sm:flex" aria-hidden={w < 40}>
      {w >= 40 && <Sparkline values={values} width={w} height={30} />}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  format,
  delta,
  goodWhenUp = true,
  sub,
  trend,
  definition,
  onClick,
  icon,
  tone,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  delta?: number;
  goodWhenUp?: boolean;
  sub?: React.ReactNode;
  trend?: number[];
  definition?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  tone?: 'default' | 'warn' | 'danger';
}) {
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      onClick={onClick}
      whileHover={onClick ? { y: -2 } : undefined}
      transition={{ duration: 0.15 }}
      className={cn('group relative w-full min-w-0 rounded-2xl border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-shadow', onClick && 'cursor-pointer hover:shadow-[var(--shadow-lift)]')}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        {icon}
        <span className="truncate">{label}</span>
        {definition && (
          <Tip content={definition}>
            <span tabIndex={0} className="shrink-0 text-muted/70 hover:text-ink" aria-label={`Definition: ${definition}`}>
              <HelpCircle className="size-3.5" />
            </span>
          </Tip>
        )}
      </p>
      <div className="mt-2 flex items-end gap-2">
        <AnimatedNumber value={value} format={format} className={cn('shrink-0 whitespace-nowrap font-display text-xl font-bold text-ink sm:text-[26px]', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')} />
        {trend && trend.length > 1 && <FluidSparkline values={trend} />}
      </div>
      {(sub || delta !== undefined) && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="min-w-0 truncate">{sub}</span>
          {delta !== undefined && <Delta className="shrink-0" value={delta} goodWhenUp={goodWhenUp} suffix={label.includes('%') || label.toLowerCase().includes('margin') || label.toLowerCase().includes('conversion') || label.toLowerCase().includes('time') ? ' pts' : '%'} />}
        </div>
      )}
    </Comp>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Shows children when the current demo role has the permission; otherwise a lock hint with a quick role switch. */
export function Gate({ perm, children, fallback, compact }: { perm: Permission; children: React.ReactNode; fallback?: React.ReactNode; compact?: boolean }) {
  const role = useSession((s) => s.role);
  const set = useSession((s) => s.set);
  if (can(role, perm)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  const suggest = rolesWith(perm).find((r) => r !== 'owner') ?? 'owner';
  return (
    <Tip content={`Demo role ${ROLES[role].label} cannot ${PERM_LABEL[perm]}. Click to switch to ${ROLES[suggest].label}.`}>
      <button onClick={() => set({ role: suggest })} className={cn('inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-3 text-xs font-medium text-muted hover:border-brand hover:text-brand', compact ? 'h-8' : 'h-10')}>
        <Lock className="size-3.5" /> {compact ? ROLES[suggest].label : `Switch to ${ROLES[suggest].label}`}
      </button>
    </Tip>
  );
}

export function SectionCard({ title, subtitle, actions, children, className, bodyClassName, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; icon?: React.ReactNode }) {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            {icon}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

export function KV({ k, v, className }: { k: React.ReactNode; v: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5 text-sm', className)}>
      <span className="shrink-0 text-muted">{k}</span>
      <span className="min-w-0 text-right font-medium text-ink">{v}</span>
    </div>
  );
}

export function DemoNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-dashed border-warn/50 bg-warn-soft/60 px-3 py-2 text-xs text-ink-2', className)}>{children}</div>;
}
