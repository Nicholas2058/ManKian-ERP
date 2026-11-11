import { cn } from '@/lib/utils';
import { BRAND_LOGO, BRAND_MARK } from '@/lib/brand';

/** Sidebar / top-bar brand: the MK mark on a white tile (keeps the logo's true colours on any background). */
export function BrandMark({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
        <img src={BRAND_MARK} alt="MK Hardware" width={259} height={211} className="h-auto w-full" draggable={false} />
      </div>
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

/** Full horizontal logo (dark wordmark) — placed on a white plate so it reads in dark mode too. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-white px-3 py-2 ring-1 ring-black/5', className)}>
      <img src={BRAND_LOGO} alt="Man Kian Hardware & Trading Sdn Bhd" width={600} height={140} className="h-9 w-auto" draggable={false} />
    </div>
  );
}
