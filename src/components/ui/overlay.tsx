import * as React from 'react';
import { Dialog as D, DropdownMenu as DM, Tabs as T, Tooltip as TT, Switch as SW, Popover as PO } from 'radix-ui';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { X, AlertTriangle } from './icons';
import { Button } from './core';

// ───────── Dialog: centred modal on desktop, bottom sheet on phones
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const w = size === 'sm' ? 'sm:max-w-md' : size === 'md' ? 'sm:max-w-lg' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-4xl';
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-forest-950/40 backdrop-blur-[2px] data-[state=closed]:animate-[overlay-out_.15s] data-[state=open]:animate-[overlay-in_.2s]" />
        <D.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] flex-col border border-line bg-surface shadow-[var(--shadow-lift)] focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-3xl max-sm:data-[state=closed]:animate-[sheet-down_.2s] max-sm:data-[state=open]:animate-[sheet-up_.28s_cubic-bezier(.2,.8,.2,1)]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=closed]:animate-[dialog-out_.15s] sm:data-[state=open]:animate-[dialog-in_.22s_cubic-bezier(.2,.8,.2,1)]',
            w,
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
            <div>
              <D.Title className="font-display text-lg font-bold text-ink">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">Dialog</D.Description>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </D.Close>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3 max-sm:pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-b-2xl">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ───────── Drawer: right panel on desktop, bottom sheet on phones
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-xl',
  headerExtra,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  headerExtra?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-forest-950/30 data-[state=closed]:animate-[overlay-out_.15s] data-[state=open]:animate-[overlay-in_.2s]" />
        <D.Content
          className={cn(
            'fixed z-50 flex flex-col border-line bg-surface shadow-[var(--shadow-lift)] focus:outline-none',
            'inset-x-0 bottom-0 max-h-[94dvh] rounded-t-3xl border-t max-sm:data-[state=closed]:animate-[sheet-down_.2s] max-sm:data-[state=open]:animate-[sheet-up_.3s_cubic-bezier(.2,.8,.2,1)]',
            'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:rounded-none sm:border-l sm:border-t-0 sm:data-[state=closed]:animate-[drawer-out_.2s] sm:data-[state=open]:animate-[drawer-in_.3s_cubic-bezier(.2,.8,.2,1)]',
            width,
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <D.Title className="truncate font-display text-lg font-bold text-ink">{title}</D.Title>
              {subtitle ? <D.Description asChild><div className="mt-0.5 text-sm text-muted">{subtitle}</div></D.Description> : <D.Description className="sr-only">Details panel</D.Description>}
              {headerExtra}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </D.Close>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3 max-sm:pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

// ───────── Tabs with animated indicator
export function Tabs({
  value,
  onValueChange,
  tabs,
  children,
  className,
  listClassName,
  id = 'tabs',
}: {
  value: string;
  onValueChange: (v: string) => void;
  tabs: { value: string; label: React.ReactNode; count?: number; icon?: React.ReactNode }[];
  children?: React.ReactNode;
  className?: string;
  listClassName?: string;
  id?: string;
}) {
  return (
    <T.Root value={value} onValueChange={onValueChange} className={className}>
      <T.List className={cn('no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1', listClassName)} aria-label="Sections">
        {tabs.map((t) => (
          <T.Trigger
            key={t.value}
            value={t.value}
            className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:text-ink"
          >
            {value === t.value && <motion.span layoutId={`${id}-ind`} className="absolute inset-0 rounded-lg bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative flex items-center gap-1.5">
              {t.icon}
              {t.label}
              {t.count !== undefined && t.count > 0 && <span className="tabular rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent-ink">{t.count}</span>}
            </span>
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}
export const TabPanel = ({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) => (
  <T.Content value={value} className={cn('focus:outline-none', className)}>
    {children}
  </T.Content>
);

// ───────── Segmented control (filters, ranges)
export function Segmented<V extends string>({ value, onChange, options, className, size = 'md', id = 'seg' }: { value: V; onChange: (v: V) => void; options: { value: V; label: React.ReactNode }[]; className?: string; size?: 'sm' | 'md'; id?: string }) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-xl border border-line bg-surface-3 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('relative rounded-[10px] font-medium text-muted transition-colors hover:text-ink aria-checked:text-ink', size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm')}
        >
          {value === o.value && <motion.span layoutId={`${id}-seg`} className="absolute inset-0 rounded-[10px] bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ───────── Tooltip
export function Tip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>;
  return (
    <TT.Root delayDuration={250}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-[70] max-w-xs rounded-lg bg-forest-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg data-[state=delayed-open]:animate-[pop-in_.15s]">
          {content}
          <TT.Arrow className="fill-forest-950" />
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}
export const TipProvider = TT.Provider;

// ───────── Menu
export function Menu({ trigger, children, align = 'end', className }: { trigger: React.ReactNode; children: React.ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={6} className={cn('z-[60] min-w-[200px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lift)] data-[state=open]:animate-[pop-in_.15s]', className)}>
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
export function MenuItem({ children, onSelect, icon, danger, disabled, hint }: { children: React.ReactNode; onSelect?: () => void; icon?: React.ReactNode; danger?: boolean; disabled?: boolean; hint?: React.ReactNode }) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn('flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-surface-3 data-[disabled]:opacity-50', danger && 'text-danger')}
    >
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </DM.Item>
  );
}
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</DM.Label>;
export const MenuSep = () => <DM.Separator className="my-1 h-px bg-line" />;

// ───────── Popover
export function Pop({ trigger, children, align = 'end', className }: { trigger: React.ReactNode; children: React.ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <PO.Root>
      <PO.Trigger asChild>{trigger}</PO.Trigger>
      <PO.Portal>
        <PO.Content align={align} sideOffset={8} className={cn('z-[60] rounded-2xl border border-line bg-surface shadow-[var(--shadow-lift)] focus:outline-none data-[state=open]:animate-[pop-in_.15s]', className)}>
          {children}
        </PO.Content>
      </PO.Portal>
    </PO.Root>
  );
}

// ───────── Switch
export function Toggle({ checked, onCheckedChange, label, id, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: React.ReactNode; id?: string; disabled?: boolean }) {
  const sid = React.useId();
  return (
    <div className="flex items-center gap-2.5">
      <SW.Root
        id={id ?? sid}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50"
      >
        <SW.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SW.Root>
      {label && (
        <label htmlFor={id ?? sid} className="text-sm text-ink">
          {label}
        </label>
      )}
    </div>
  );
}

// ───────── Confirm dialog (promise-based)
interface ConfirmOpts {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
}
const ConfirmCtx = React.createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => React.useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = React.useState('');
  const confirm = React.useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => { setTyped(''); setState({ ...o, resolve }); }), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const blocked = !!state?.requireText && typed.trim().toUpperCase() !== state.requireText.toUpperCase();
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onOpenChange={(o) => !o && close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {state?.danger && <AlertTriangle className="size-5 text-danger" />}
            {state?.title}
          </span>
        }
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          {state?.body}
          {state?.requireText && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted">
                Type <b className="text-ink">{state.requireText}</b> to confirm.
              </p>
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none" aria-label="Confirmation text" />
            </div>
          )}
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
