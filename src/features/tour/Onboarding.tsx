import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useSession } from '@/store/session';
import { Modal } from '@/components/ui/overlay';
import { Button } from '@/components/ui/core';
import { CirclePlay, ShieldCheck, Tag, UserCog, Warehouse } from '@/components/ui/icons';
import { BrandLogo } from '@/components/layout/Brand';

const SLIDES = [
  {
    icon: <Tag className="size-6" />,
    title: 'Daily price changes, under control',
    body: 'Supplier costs move every day. This demo shows how cost updates flow into suggested prices, approvals and quotations — without silently changing quotes already issued to customers.',
  },
  {
    icon: <Warehouse className="size-6" />,
    title: 'One connected operation',
    body: 'Enquiries, quotations, stock reservations, purchasing, the 3D warehouse, delivery and receivables all share one dataset. Change something in one module and every other module reflects it.',
  },
  {
    icon: <UserCog className="size-6" />,
    title: 'Try it as different people',
    body: 'Use the role switcher (top-right) to act as Owner, Sales Manager, Procurement, Warehouse, Driver or Finance. This is a visual simulation — not real security.',
  },
  {
    icon: <ShieldCheck className="size-6" />,
    title: 'Demo data, stored in this browser',
    body: 'All customers, suppliers, people and prices are fictional. Data is saved only in this browser on this device and can be reset at any time from Settings.',
  },
];

export function OnboardingSpotlight() {
  const done = useSession((s) => s.onboardingDone);
  const set = useSession((s) => s.set);
  const nav = useNavigate();
  const [i, setI] = React.useState(0);
  const finish = (tour: boolean) => {
    set({ onboardingDone: true });
    if (tour) nav('/tour');
  };
  const s = SLIDES[i];
  return (
    <Modal
      open={!done}
      onOpenChange={(o) => !o && finish(false)}
      size="md"
      title="Welcome to the MK Hardware ERP demo"
      description="A 30-second orientation"
      footer={
        <>
          <Button variant="ghost" onClick={() => finish(false)}>
            Explore on my own
          </Button>
          {i < SLIDES.length - 1 ? (
            <Button onClick={() => setI(i + 1)}>Next</Button>
          ) : (
            <Button onClick={() => finish(true)}>
              <CirclePlay className="size-4" /> Start a guided scenario
            </Button>
          )}
        </>
      }
    >
      <BrandLogo className="mb-3" />
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="flex gap-4 py-2">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-brand">{s.icon}</div>
          <div>
            <p className="font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-4 flex justify-center gap-1.5">
        {SLIDES.map((_, k) => (
          <button key={k} onClick={() => setI(k)} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-brand' : 'w-1.5 bg-line-strong'}`} aria-label={`Slide ${k + 1}`} />
        ))}
      </div>
    </Modal>
  );
}
