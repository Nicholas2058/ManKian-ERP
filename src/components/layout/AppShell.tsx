import * as React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { useSession } from '@/store/session';
import { useDbStore } from '@/store/db';
import { useT } from '@/i18n';
import { MOBILE_TABS } from '@/app/nav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { TourOverlay } from '@/features/tour/TourOverlay';
import { OnboardingSpotlight } from '@/features/tour/Onboarding';
import { AlertTriangle, CirclePlay, Info } from '@/components/ui/icons';
import { useMotionOK } from '@/components/widgets';
import { Skeleton } from '@/components/ui/core';

function DemoBanner() {
  const t = useT();
  const persistError = useDbStore((s) => s.persistError);
  const repoKind = useDbStore((s) => s.repoKind);
  const needsReset = useDbStore((s) => s.needsReset);
  return (
    <>
      <div className="flex items-center justify-center gap-2 bg-forest-900 px-3 py-1.5 text-center text-[11px] font-medium text-white/80 lg:bg-transparent lg:text-muted">
        <Info className="size-3.5 shrink-0 text-jade-400 lg:text-brand" />
        <span>{t('common.demoBanner')}</span>
      </div>
      {(persistError || repoKind === 'memory') && (
        <div className="flex items-center justify-center gap-2 bg-warn-soft px-3 py-1.5 text-center text-xs text-ink">
          <AlertTriangle className="size-4 text-warn" />
          {persistError ? `Changes could not be saved to this browser: ${persistError}` : 'Browser storage is unavailable (private mode?). Demo data will reset when you close this tab.'}
        </div>
      )}
      {needsReset && (
        <div className="flex items-center justify-center gap-2 bg-info-soft px-3 py-1.5 text-center text-xs text-ink">
          <Info className="size-4 text-info" /> Your saved demo data is from an older version. Reset it in Settings for the best experience.
        </div>
      )}
    </>
  );
}

function MobileTabs() {
  const t = useT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick navigation">
      <ul className="grid grid-cols-5">
        {MOBILE_TABS.map((it) => (
          <li key={it.path}>
            <NavLink to={it.path} end={it.path === '/'} className={({ isActive }) => cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium', isActive ? 'text-brand' : 'text-muted')}>
              <it.icon className="size-5" />
              <span className="max-w-full truncate px-1">{t(it.key).split(' ')[0]}</span>
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink to="/tour" className={({ isActive }) => cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium', isActive ? 'text-brand' : 'text-muted')}>
            <CirclePlay className="size-5" />
            Tour
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

export function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function AppShell() {
  const collapsed = useSession((s) => s.sidebarCollapsed);
  const loc = useLocation();
  const ok = useMotionOK();
  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className={cn('transition-[padding] duration-300', collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        <DemoBanner />
        <Topbar />
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-5 sm:px-5 lg:px-8 lg:pb-12" id="main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={loc.pathname} initial={ok ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} exit={ok ? { opacity: 0 } : undefined} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
              <React.Suspense fallback={<PageFallback />}>
                <Outlet />
              </React.Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileTabs />
      <CommandPalette />
      <TourOverlay />
      <OnboardingSpotlight />
    </div>
  );
}
