import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// ───────── Button
type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'subtle' | 'dark';
type BtnSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const btnBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background,color,box-shadow,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-px';
const btnVariants: Record<BtnVariant, string> = {
  primary: 'bg-brand text-white shadow-sm hover:bg-brand-strong dark:text-forest-950 dark:hover:bg-brand-strong',
  secondary: 'bg-accent-soft text-accent-ink hover:bg-mint-100 dark:hover:bg-surface-3',
  outline: 'border border-line-strong bg-surface text-ink hover:bg-surface-2 hover:border-brand/40',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-95',
  subtle: 'bg-surface-3 text-ink hover:bg-line',
  dark: 'bg-forest-900 text-white hover:bg-forest-800',
};
const btnSizes: Record<BtnSize, string> = {
  xs: 'h-7 px-2 text-xs',
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-10 w-10',
  'icon-sm': 'h-8 w-8',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

// ───────── Card
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]', className)} {...p} />;
}
export function CardHeader({ title, subtitle, actions, className, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          {icon}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...p} />;
}

// ───────── Badge
export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'orange' | 'dark';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2 ring-line',
  green: 'bg-accent-soft text-accent-ink ring-accent/25',
  amber: 'bg-warn-soft text-warn ring-warn/25',
  red: 'bg-danger-soft text-danger ring-danger/25',
  blue: 'bg-info-soft text-info ring-info/25',
  violet: 'bg-violet-soft text-violet ring-violet/25',
  orange: 'bg-orange-soft text-orange ring-orange/25',
  dark: 'bg-forest-900 text-white ring-forest-900',
};
export function Badge({ tone = 'neutral', className, children, icon }: { tone?: Tone; className?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', toneCls[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

// ───────── Form controls
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...p }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/80 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60',
        invalid && 'border-danger focus:border-danger focus:ring-danger/20',
        className,
      )}
      {...p}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn('min-h-[84px] w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25', className)}
      {...p}
    />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full appearance-none rounded-lg border border-line-strong bg-surface bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-8 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236D8077' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...p}
    >
      {children}
    </select>
  );
});

const LABELLABLE = new Set(['input', 'select', 'textarea']);

/** Form field with an associated label, hint and error (wired via id / aria-describedby). */
export function Field({ label, hint, error, children, className, required, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string; required?: boolean; htmlFor?: string }) {
  const auto = React.useId();
  const msgId = `${auto}-msg`;
  let id = htmlFor;
  let child = children;
  if (React.isValidElement<{ id?: string; 'aria-describedby'?: string }>(children)) {
    const t = children.type;
    const isControl = typeof t === 'string' ? LABELLABLE.has(t) : t === Input || t === Select || t === Textarea;
    if (isControl) {
      id = children.props.id ?? htmlFor ?? auto;
      child = React.cloneElement(children, { id, 'aria-describedby': error || hint ? msgId : undefined });
    }
  }
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-semibold text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {child}
      {error ? (
        <p id={msgId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted">{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />;
}

export function EmptyState({ icon, title, body, action, className }: { icon?: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-brand">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {body && <div className="mt-1 max-w-sm text-sm text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />;
}

export function Stat({ label, value, sub, className, tone }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string; tone?: 'danger' | 'warn' | 'good' }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('tabular mt-0.5 truncate text-lg font-semibold text-ink', tone === 'danger' && 'text-danger', tone === 'warn' && 'text-warn', tone === 'good' && 'text-brand')}>{value}</p>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Progress({ value, className, tone = 'green' }: { value: number; className?: string; tone?: 'green' | 'amber' | 'red' | 'blue' }) {
  const c = tone === 'green' ? 'bg-accent' : tone === 'amber' ? 'bg-warn' : tone === 'red' ? 'bg-danger' : 'bg-info';
  const track = tone === 'green' ? 'bg-accent-soft' : tone === 'amber' ? 'bg-warn-soft' : tone === 'red' ? 'bg-danger-soft' : 'bg-info-soft';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full', track, className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
