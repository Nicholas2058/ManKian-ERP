import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useDbState } from '@/store/db';
import { useSession } from '@/store/session';
import { ROLES, ROLE_TONE, canAccess } from '@/domain/roles';
import { NAV } from '@/app/nav';
import { useT } from '@/i18n';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Card, EmptyState } from '@/components/ui/core';
import { KpiTile, useMotionOK, DemoNote } from '@/components/widgets';
import { ArrowRight, CircleCheck, Lock } from '@/components/ui/icons';
import { workspaceFor } from './queues';

function greeting(now: string) {
  const h = (new Date(now).getUTCHours() + 8) % 24;
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Role home for operational roles: their own queues, tasks and shortcuts. */
export default function WorkspacePage() {
  const db = useDbState();
  const nav = useNavigate();
  const t = useT();
  const ok = useMotionOK();
  const now = useNow(60_000);
  const role = useSession((s) => s.role);
  const r = ROLES[role];
  const ws = React.useMemo(() => workspaceFor(role, db, now), [role, db, now]);
  const modules = NAV.flatMap((g) => g.items).filter((it) => it.path !== '/' && canAccess(role, it.path));
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl bg-forest-900 bg-[radial-gradient(120%_120%_at_100%_0%,rgb(41_180_127/0.25),transparent_55%)] p-5 text-white sm:flex-row sm:items-center sm:p-6">
        <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br font-display text-lg font-extrabold shadow-lg', ROLE_TONE[role])}>
          {r.persona.split(' ').map((p) => p[0]).join('')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-jade-400">{t('nav.workspace')} · {r.label}</p>
          <h1 className="mt-0.5 font-display text-2xl font-extrabold sm:text-[28px]">
            {greeting(now)}, {r.persona.split(' ')[0]}
          </h1>
          <p className="mt-0.5 text-sm text-white/70">Focus: {r.focus}. You see only the modules this role works in.</p>
        </div>
      </div>

      {ws.stats.length > 0 && (
        <div className={cn('grid grid-cols-2 gap-3', ws.stats.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
          {ws.stats.map((s) => (
            <KpiTile key={s.key} label={s.label} value={s.value} format={(v) => s.display ?? Math.round(v).toLocaleString('en-MY')} onClick={() => nav(s.link)} tone={s.tone} />
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className={cn('grid gap-4', ws.tasks.length > 1 ? 'md:grid-cols-2 xl:col-span-8' : 'xl:col-span-8')}>
          {ws.tasks.map((group, gi) => (
            <Card key={group.title} className={cn('p-4', ws.tasks.length === 3 && gi === 0 && 'md:col-span-2')}>
              <p className="mb-3 text-sm font-semibold">{group.title}</p>
              {group.items.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <CircleCheck className="size-4 text-brand" /> {group.empty}
                </p>
              ) : (
                <ul className="space-y-2">
                  {group.items.map((it, i) => (
                    <motion.li key={it.id} initial={ok ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: ok ? i * 0.04 : 0 }}>
                      <button
                        onClick={() => nav(it.link)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-brand/40 hover:bg-surface-2',
                          it.tone === 'danger' ? 'border-danger/30' : it.tone === 'warn' ? 'border-warn/40' : 'border-line',
                        )}
                      >
                        <span className={cn('size-2 shrink-0 rounded-full', it.tone === 'danger' ? 'bg-danger' : it.tone === 'warn' ? 'bg-warn' : it.tone === 'info' ? 'bg-info' : 'bg-accent')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{it.title}</span>
                          <span className="block truncate text-xs text-muted">{it.detail}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand">
                          {it.action} <ArrowRight className="size-3.5" />
                        </span>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          {ws.tasks.length === 0 && <EmptyState title="No queues for this role" />}
        </div>
        <div className="space-y-4 xl:col-span-4">
          {ws.actions.length > 0 && (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">Quick actions</p>
              <div className="grid gap-2">
                {ws.actions.map((a) => (
                  <button key={a.label} onClick={() => nav(a.link)} className="flex items-center justify-between rounded-xl bg-accent-soft px-3 py-2.5 text-left text-sm font-medium text-accent-ink transition hover:brightness-95">
                    {a.label} <ArrowRight className="size-4" />
                  </button>
                ))}
              </div>
            </Card>
          )}
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">Your modules</p>
            <div className="flex flex-wrap gap-1.5">
              {modules.map((m) => (
                <Link key={m.path} to={m.path} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium hover:border-brand hover:text-brand">
                  <m.icon className="size-3.5" /> {t(m.key)}
                </Link>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted">
              <Lock className="mt-0.5 size-3" /> Other modules (pricing, finance, approvals…) are hidden for this role. Switch role from the top-right to explore them.
            </p>
          </Card>
          <DemoNote>Role switching is a visual simulation for the demo — not real security.</DemoNote>
        </div>
      </div>
    </div>
  );
}
