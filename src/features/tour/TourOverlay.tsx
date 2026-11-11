import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/store/session';
import { useDbState, resetDemo } from '@/store/db';
import { ROLES } from '@/domain/roles';
import { cn } from '@/lib/utils';
import { useMotionOK } from '@/components/widgets';
import { Button } from '@/components/ui/core';
import { useConfirm } from '@/components/ui/overlay';
import { Check, ChevronLeft, ChevronRight, CircleCheck, Minus, RotateCcw, UserCog, X, CirclePlay, ArrowRight } from '@/components/ui/icons';
import { scenarioByKey } from './scenarios';

export function startScenario(key: string, nav: (p: string) => void, db: Parameters<NonNullable<ReturnType<typeof scenarioByKey>>['steps'][number]['route']>[0]) {
  const s = scenarioByKey(key);
  if (!s) return;
  useSession.getState().set({ tour: { scenario: key, step: 0, minimized: false, startedAt: new Date(Date.now() - 1000).toISOString() } });
  nav(s.steps[0].route(db));
}

/**
 * Spotlight: dims and blocks everything except the step's target (like the welcome tour).
 * The cut-out follows the target while it scrolls/resizes. Dialogs, menus and toasts opened
 * from the target sit above the dimmer, so the guided action stays fully usable.
 */
function Spotlight({ targets, stepKey, smooth }: { targets: string[]; stepKey: string; smooth: boolean }) {
  const [rect, setRect] = React.useState<{ x: number; y: number; w: number; h: number; minY: number; maxY: number } | null>(null);
  const [nudge, setNudge] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    let last = '';
    let scrolled = false;
    const find = () => {
      for (const t of targets) {
        const el = document.querySelector(`[data-tour="${t}"]`);
        if (el && el.getClientRects().length) return el;
      }
      return null;
    };
    const tick = () => {
      const el = find();
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const r0 = el.getBoundingClientRect();
          if (r0.top < 72 || r0.bottom > window.innerHeight - 24) el.scrollIntoView({ block: r0.height > window.innerHeight * 0.7 ? 'start' : 'center', behavior: smooth ? 'smooth' : 'auto' });
        }
        const r = el.getBoundingClientRect();
        // Keep the cut-out inside the visible content area (between the sticky top bar and the
        // mobile tab bar) so shell chrome stays dimmed and blocked when a tall target scrolls under it.
        const inLayer = !!el.closest('[role="dialog"]'); // sheets/dialogs sit above the shell chrome
        const top = inLayer ? null : document.querySelector('[data-shell="topbar"]');
        const bottom = inLayer ? null : document.querySelector('[data-shell="bottom-nav"]');
        const minY = top && !top.contains(el) ? top.getBoundingClientRect().bottom : 0;
        const bRect = bottom?.getClientRects().length ? bottom.getBoundingClientRect() : null;
        const maxY = bRect && !bottom!.contains(el) ? bRect.top : window.innerHeight;
        const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)},${Math.round(minY)},${Math.round(maxY)}`;
        if (key !== last) {
          last = key;
          setRect({ x: r.left, y: r.top, w: r.width, h: r.height, minY, maxY });
        }
      } else if (last) {
        last = '';
        setRect(null);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [targets.join(','), stepKey, smooth]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rect) return null;
  const pad = 8;
  const x = Math.max(4, rect.x - pad);
  const y = Math.max(rect.minY + 4, rect.y - pad);
  const w = Math.min(window.innerWidth - 4, rect.x + rect.w + pad) - x;
  const h = Math.min(rect.maxY - 4, rect.y + rect.h + pad) - y;
  const hole = { left: x, top: y, width: Math.max(0, w), height: Math.max(0, h) };
  const block = (style: React.CSSProperties) => <div className="fixed z-[44] cursor-not-allowed" style={style} onClick={() => setNudge((n) => n + 1)} />;
  return createPortal(
    <div className="no-print">
      <div
        aria-hidden
        data-testid="tour-spotlight"
        className={cn('pointer-events-none fixed z-[44] rounded-2xl', smooth && 'transition-[left,top,width,height] duration-200')}
        style={{ ...hole, boxShadow: '0 0 0 9999px rgba(6, 24, 19, 0.62)', outline: '3px solid var(--color-jade-400)' }}
      />
      {nudge > 0 && <div key={nudge} aria-hidden className="pointer-events-none fixed z-[44] animate-[pulse-ring_0.8s_ease-out_2] rounded-2xl" style={hole} />}
      {block({ left: 0, top: 0, right: 0, height: Math.max(0, y) })}
      {block({ left: 0, top: y + h, right: 0, bottom: 0 })}
      {block({ left: 0, top: y, width: Math.max(0, x), height: Math.max(0, h) })}
      {block({ left: x + w, top: y, right: 0, height: Math.max(0, h) })}
    </div>,
    document.body,
  );
}

export function TourOverlay() {
  const tour = useSession((s) => s.tour);
  const role = useSession((s) => s.role);
  const set = useSession((s) => s.set);
  const db = useDbState();
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const s = scenarioByKey(tour.scenario);
  const step = s?.steps[tour.step];
  const startedAt = tour.startedAt ?? new Date(0).toISOString();
  const done = step?.done ? step.done(db, startedAt) : false;
  const onRoute = step ? loc.pathname + loc.search === step.route(db) || loc.pathname === step.route(db).split('?')[0] : false;
  const ok = useMotionOK();
  React.useEffect(() => {
    if (!s || tour.minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][data-state="open"]')) set({ tour: { ...tour, minimized: true } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, tour, set]);

  const prevDone = React.useRef(done);
  React.useEffect(() => {
    if (done && !prevDone.current) toast.success(`Step complete: ${step?.title}`);
    prevDone.current = done;
  }, [done, step?.title]);

  if (!s || !step) return null;
  const goStep = (i: number) => {
    const ns = s.steps[i];
    set({ tour: { ...tour, step: i, minimized: false } });
    nav(ns.route(db));
  };
  const exit = () => set({ tour: { scenario: null, step: 0, minimized: false } });
  const restart = async () => {
    const ok = await confirm({ title: `Restart scenario ${s.letter}?`, body: 'This resets ALL demo data to the original seed so the scenario starts from a clean, predictable state.', confirmLabel: 'Reset & restart', danger: true });
    if (!ok) return;
    await resetDemo();
    toast.success('Demo data reset');
    const fresh = (await import('@/store/db')).getDb();
    startScenario(s.key, nav, fresh);
  };
  const last = tour.step === s.steps.length - 1;

  return (
    <>
    {!tour.minimized && onRoute && step.target && <Spotlight targets={step.target.split(',')} stepKey={`${tour.scenario}-${tour.step}`} smooth={ok} />}
    <AnimatePresence>
      {tour.minimized ? (
        <motion.button
          key="mini"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => set({ tour: { ...tour, minimized: false } })}
          className="no-print fixed bottom-20 right-4 z-[46] flex items-center gap-2 rounded-full bg-forest-900 px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-lift)] lg:bottom-6"
        >
          <CirclePlay className="size-4 text-jade-400" /> Scenario {s.letter} · step {tour.step + 1}/{s.steps.length}
        </motion.button>
      ) : (
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="no-print fixed inset-x-3 bottom-[4.5rem] z-[46] rounded-2xl border border-forest-700 bg-forest-900 p-4 text-white shadow-[var(--shadow-lift)] sm:left-auto sm:right-5 sm:w-[380px] lg:bottom-5"
          role="dialog"
          aria-label={`Guided scenario ${s.letter}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-jade-400">
                Scenario {s.letter} · {s.title}
              </p>
              <p className="mt-1 font-display text-base font-bold leading-snug">
                {tour.step + 1}. {step.title}
              </p>
            </div>
            <div className="flex shrink-0">
              <button className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" onClick={() => set({ tour: { ...tour, minimized: true } })} aria-label="Minimise tour">
                <Minus className="size-4" />
              </button>
              <button className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" onClick={exit} aria-label="Exit tour">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/80">{step.body}</p>
          {onRoute && step.target && <p className="mt-1.5 text-[11px] text-white/50">Only the highlighted area is active · Esc or – to explore freely</p>}
          {step.role && role !== step.role && (
            <button onClick={() => set({ role: step.role! })} className="mt-3 flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-left text-xs font-medium hover:bg-white/15">
              <UserCog className="size-4 text-jade-400" /> Suggested role: {ROLES[step.role].label} — click to switch
            </button>
          )}
          <div className="mt-3 flex items-center gap-1.5">
            {s.steps.map((st, i) => (
              <button key={i} onClick={() => goStep(i)} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < tour.step ? 'bg-jade-500' : i === tour.step ? 'bg-white' : 'bg-white/20')} aria-label={`Go to step ${i + 1}: ${st.title}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!onRoute && (
              <Button size="sm" variant="secondary" onClick={() => nav(step.route(db))}>
                Go to screen <ArrowRight className="size-3.5" />
              </Button>
            )}
            {step.done && (
              <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', done ? 'text-jade-400' : 'text-white/50')}>
                {done ? <CircleCheck className="size-4" /> : <span className="size-2 animate-pulse rounded-full bg-ember-500" />}
                {done ? 'Done' : 'Waiting for action'}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button onClick={restart} className="rounded-lg p-2 text-white/60 hover:bg-white/10" aria-label="Restart scenario" title="Restart scenario">
                <RotateCcw className="size-4" />
              </button>
              <Button size="sm" variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" disabled={tour.step === 0} onClick={() => goStep(tour.step - 1)} aria-label="Previous step">
                <ChevronLeft className="size-4" />
              </Button>
              {last ? (
                <Button
                  size="sm"
                  className="bg-jade-500 text-forest-950 hover:bg-jade-400"
                  onClick={() => {
                    exit();
                    toast.success(`Scenario ${s.letter} complete`);
                    nav('/tour');
                  }}
                >
                  <Check className="size-4" /> Finish
                </Button>
              ) : (
                <Button size="sm" className="bg-jade-500 text-forest-950 hover:bg-jade-400" onClick={() => goStep(tour.step + 1)}>
                  Next <ChevronRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
