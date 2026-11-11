import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { NAV } from '@/app/nav';
import { useT } from '@/i18n';
import { useSession } from '@/store/session';
import { useDbState } from '@/store/db';
import { BrandMark } from './Brand';
import { Tip } from '@/components/ui/overlay';
import { PanelLeftClose, PanelLeftOpen } from '@/components/ui/icons';

export function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const t = useT();
  const db = useDbState();
  const badges = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of NAV) for (const it of g.items) if (it.badge) out[it.path] = it.badge(db);
    return out;
  }, [db]);
  return (
    <nav className="space-y-5" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.key}>
          {!collapsed && <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{t(g.key)}</div>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const b = badges[it.path] ?? 0;
              const link = (
                <NavLink
                  to={it.path}
                  end={it.path === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
                      isActive ? 'text-white' : 'text-white/65 hover:bg-white/5 hover:text-white',
                      collapsed && 'justify-center px-0',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-white/10 ring-1 ring-white/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-x-[3px] -translate-y-1/2 rounded-full bg-jade-400" />
                        </motion.span>
                      )}
                      <it.icon className={cn('relative size-[18px] shrink-0', isActive ? 'text-jade-400' : 'text-white/55 group-hover:text-white/80')} />
                      {!collapsed && <span className="relative flex-1 truncate">{t(it.key)}</span>}
                      {b > 0 && (
                        <span
                          className={cn(
                            'tabular relative rounded-full px-1.5 text-[10px] font-bold leading-[18px]',
                            it.badgeTone === 'red' ? 'bg-danger text-white' : it.badgeTone === 'green' ? 'bg-jade-500 text-forest-950' : 'bg-ember-500 text-forest-950',
                            collapsed && 'absolute right-1 top-0.5 px-1 leading-4',
                          )}
                        >
                          {b > 99 ? '99+' : b}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
              return <li key={it.path}>{collapsed ? <Tip content={t(it.key)} side="right">{link}</Tip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useSession((s) => s.sidebarCollapsed);
  const set = useSession((s) => s.set);
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden flex-col bg-forest-900 bg-[radial-gradient(120%_60%_at_0%_0%,rgb(41_180_127/0.18),transparent_60%)] transition-[width] duration-300 lg:flex',
        collapsed ? 'w-[76px]' : 'w-[248px]',
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
        <BrandMark collapsed={collapsed} />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4 [scrollbar-color:rgb(255_255_255/0.15)_transparent]">
        <NavList collapsed={collapsed} />
      </div>
      <div className="border-t border-white/10 p-3">
        {!collapsed && (
          <p className="mb-2 px-1 text-[10.5px] leading-relaxed text-white/45">
            Illustrative demo. Fictional customers, suppliers and prices. Browser-local data only.
          </p>
        )}
        <button
          onClick={() => set({ sidebarCollapsed: !collapsed })}
          className={cn('flex h-9 w-full items-center gap-2 rounded-lg px-3 text-xs font-medium text-white/60 hover:bg-white/5 hover:text-white', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
