import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { approvePriceChange, rejectPriceChange } from '@/domain/commands/pricing';
import { resolveRule } from '@/domain/pricing';
import { formatPct, formatRM, marginPct, pctChange, toSen } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Badge, Button, EmptyState, Input } from '@/components/ui/core';
import { Gate, SectionCard } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { Check, ClipboardCheck, X } from '@/components/ui/icons';

export function PriceApprovals() {
  const db = useDbState();
  const pending = Object.values(db.priceChanges).filter((c) => c.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const decided = Object.values(db.priceChanges).filter((c) => c.status !== 'pending').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')).slice(0, 12);
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <SectionCard className="xl:col-span-8" title="Price changes awaiting approval" subtitle="Adjust the final price if needed, then approve or reject. Every decision is audited.">
        {pending.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="size-6" />} title="Nothing to approve" body="New supplier costs, imports and manual proposals will appear here." />
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {pending.map((c) => (
                <motion.li key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}>
                  <PendingCard id={c.id} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </SectionCard>
      <SectionCard className="xl:col-span-4" title="Recently decided">
        <ul className="space-y-2 text-sm">
          {decided.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{db.products[c.productId]?.sku}</span>
                <span className="block text-[11px] text-muted">
                  {formatRM(c.oldPrice)} → {formatRM(c.proposedPrice)} · {c.decidedBy ?? '—'}
                </span>
              </span>
              <StatusBadge kind="change" status={c.status} />
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function PendingCard({ id }: { id: string }) {
  const db = useDbState();
  const c = db.priceChanges[id];
  const p = db.products[c.productId];
  const [price, setPrice] = React.useState((c.proposedPrice / 100).toFixed(2));
  const [note, setNote] = React.useState('');
  const rule = resolveRule(db, p);
  const sen = toSen(Number(price));
  const m = marginPct(sen, c.newCost);
  const changePct = pctChange(c.oldPrice, sen);
  const affected = Object.values(db.quotes).filter((q) => ['draft', 'pending_approval', 'approved'].includes(q.status) && q.versions[q.currentVersion - 1].lines.some((l) => l.productId === p.id)).length;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/pricing?sku=${p.id}`} className="font-mono text-xs font-semibold text-muted hover:text-brand">
            {p.sku} · {c.number}
          </Link>
          <p className="font-medium text-ink">
            {p.name}
            {p.variantLabel ? ` — ${p.variantLabel}` : ''}
          </p>
          <p className="text-xs text-muted">
            {c.source.replace('_', ' ')} · {db.suppliers[c.supplierId ?? '']?.name ?? '—'} · {fmtDateTime(c.createdAt)} · by {c.createdBy}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Math.abs(changePct) > rule.approvalChangePct && <Badge tone="amber">&gt;{rule.approvalChangePct}% price change</Badge>}
          {marginPct(c.oldPrice, c.newCost) < rule.minMarginPct && <Badge tone="red">Below floor at current price</Badge>}
          {affected > 0 && <Badge tone="blue">{affected} open quote(s)</Badge>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-muted">Cost</p>
          <p className="tabular">
            {formatRM(c.oldCost)} → <b className={c.newCost > c.oldCost ? 'text-danger' : 'text-info'}>{formatRM(c.newCost)}</b>
          </p>
          <p className="text-[11px] text-muted">{formatPct(pctChange(c.oldCost, c.newCost), 1, true)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Current list</p>
          <p className="tabular">{formatRM(c.oldPrice)}</p>
          <p className="text-[11px] text-muted">margin now {formatPct(marginPct(c.oldPrice, c.newCost))}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Rule suggestion</p>
          <p className="tabular text-brand">{formatRM(c.suggestedPrice)}</p>
          <p className="text-[11px] text-muted">target {rule.targetMarginPct}%</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Final price</p>
          <Input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} className="h-8 text-sm" aria-label="Final price" />
          <p className={cn('text-[11px]', m < rule.minMarginPct ? 'text-danger' : 'text-muted')}>
            margin {formatPct(m)} · {formatPct(changePct, 1, true)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-2">{c.reason}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision note (optional)" className="h-9 min-w-0 flex-1" />
        <Gate perm="price.approve">
          <Button size="sm" className="h-9" disabled={!(Number(price) > 0)} onClick={() => act(approvePriceChange, { changeId: c.id, price: sen, note: note || undefined }, { success: `${p.sku} approved at ${formatRM(sen)}` })}>
            <Check className="size-4" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-9" onClick={() => act(rejectPriceChange, { changeId: c.id, note: note || undefined }, { success: `${p.sku} change rejected` })}>
            <X className="size-4" /> Reject
          </Button>
        </Gate>
      </div>
    </div>
  );
}
