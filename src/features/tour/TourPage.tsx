import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useDbState, resetDemo, getDb } from '@/store/db';
import { useSession } from '@/store/session';
import { Badge, Button, Card } from '@/components/ui/core';
import { useConfirm } from '@/components/ui/overlay';
import { PageHeader, DemoNote, useMotionOK } from '@/components/widgets';
import { CirclePlay, Clock, RotateCcw, Check } from '@/components/ui/icons';
import { SCENARIOS } from './scenarios';
import { startScenario } from './TourOverlay';

const SCRIPT = [
  ['1 min', 'Brand & dashboard', 'Mission Control: KPIs recompute by period; alerts and the timeline link to real records.'],
  ['2 min', 'Daily price shock', 'Scenario A — +14% steel cost, approval by role switch, issued quote untouched.'],
  ['2 min', 'WhatsApp RFQ → quote', 'Scenario B — rule-based extraction, quotation PDF, order with partial reservation and backorder.'],
  ['2 min', '3D warehouse', 'Occupancy and low-stock modes, picking route, click a bin to see the same stock figures.'],
  ['2 min', 'Procurement & delivery', 'Scenarios C and D — compare suppliers, partial GRN, pick, dispatch, proof of delivery.'],
  ['1 min', 'Executive insights', 'Scenario F — category margin decline explained by price history, export the evidence.'],
];

export default function TourPage() {
  const db = useDbState();
  const nav = useNavigate();
  const confirm = useConfirm();
  const ok = useMotionOK();
  const tour = useSession((s) => s.tour);
  const restart = async (key: string) => {
    if (!(await confirm({ title: `Restart scenario ${key} from clean data?`, body: 'This resets ALL demo data to the original seed (your changes will be lost) and starts the guided walkthrough.', confirmLabel: 'Reset & start', danger: true }))) return;
    await resetDemo();
    toast.success('Demo data reset');
    startScenario(key, nav, getDb());
  };
  return (
    <div>
      <PageHeader title="Demo Tour" subtitle="Six guided, stateful scenarios. Each step updates real records; the panel ticks off when the action is done. Restart any scenario on clean data." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SCENARIOS.map((s, i) => (
          <motion.div key={s.key} initial={ok ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: ok ? i * 0.05 : 0 }}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-jade-500 to-forest-700 font-display text-lg font-extrabold text-white">{s.letter}</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Clock className="size-3.5" /> ~{s.minutes} min
                </span>
              </div>
              <p className="mt-3 font-display text-lg font-bold leading-snug">{s.title}</p>
              <p className="mt-1 text-sm text-muted">{s.summary}</p>
              <ol className="mt-3 space-y-1 text-xs text-ink-2">
                {s.steps.map((st, k) => {
                  const done = st.done && tour.scenario === s.key ? st.done(db, tour.startedAt ?? '') : false;
                  return (
                    <li key={k} className="flex gap-2">
                      <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${done ? 'bg-accent text-white' : 'bg-surface-3 text-muted'}`}>{done ? <Check className="size-3" /> : k + 1}</span>
                      {st.title}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Button onClick={() => startScenario(s.key, nav, db)}>
                  <CirclePlay className="size-4" /> {tour.scenario === s.key ? 'Resume' : 'Start'}
                </Button>
                <Button variant="outline" onClick={() => restart(s.key)}>
                  <RotateCcw className="size-4" /> Restart on clean data
                </Button>
                {tour.scenario === s.key && <Badge tone="green">In progress</Badge>}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <p className="font-display text-lg font-bold">10-minute meeting script</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {SCRIPT.map(([t, h, d]) => (
            <div key={h} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-semibold text-brand">{t}</p>
              <p className="font-medium">{h}</p>
              <p className="text-xs text-muted">{d}</p>
            </div>
          ))}
        </div>
        <DemoNote className="mt-4">Tip: switch roles from the top-right to show permissions (e.g. Sales Executive cannot approve prices). Role switching is a demo simulation — not security. The full script is in DEMO_WALKTHROUGH.md.</DemoNote>
      </Card>
    </div>
  );
}
