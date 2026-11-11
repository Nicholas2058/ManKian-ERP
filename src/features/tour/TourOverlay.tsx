import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/store/session';
import { useDbState, resetDemo } from '@/store/db';
import { ROLES } from '@/domain/roles';
import { cn } from '@/lib/utils';
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

/** Highlight the step's target element (retries while the route renders). */
function useHighlight(target: string | undefined, key: string) {
  React.useEffect(() => {
    if (!target) return;
    let el: Element | null = null;
    let tries = 0;
    const iv = window.setInterval(() => {
      el = document.querySelector(`[data-tour="${target}"]`);
      tries++;
      if (el || tries > 25) {
        window.clearInterval(iv);
        if (el) {
          el.classList.add('tour-highlight');
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }, 120);
    return () => {
      window.clearInterval(iv);
      document.querySelectorAll('.tour-highlight').forEach((x) => x.classList.remove('tour-highlight'));
    };
  }, [target, key]);
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
  useHighlight(onRoute ? step?.target : undefined, `${tour.scenario}-${tour.step}-${loc.key}`);

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
  );
}
