import { cn } from '@/lib/utils';

/**
 * Temporary "MK Hardware / DEMO" wordmark. To use the official logo (only with the
 * client's permission), place it at public/brand/logo.svg and set VITE_BRAND_LOGO=/brand/logo.svg.
 */
export function BrandMark({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const logo = import.meta.env.VITE_BRAND_LOGO as string | undefined;
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {logo ? (
        <img src={logo} alt="MK Hardware" className="h-9 w-auto object-contain" />
      ) : (
        <div className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-jade-500 to-forest-700 font-display text-[15px] font-extrabold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
          MK
          <span className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-forest-900 bg-ember-500" aria-hidden />
        </div>
      )}
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="font-display text-[15px] font-extrabold tracking-tight text-white">MK Hardware</div>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-jade-400">
            Operations ERP <span className="rounded bg-ember-500/90 px-1 py-px text-[9px] tracking-wider text-forest-950">DEMO</span>
          </div>
        </div>
      )}
    </div>
  );
}
