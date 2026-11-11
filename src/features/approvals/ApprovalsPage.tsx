import * as React from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { Approval, ApprovalType } from '@/domain/types';
import { useDbState } from '@/store/db';
import { useSession } from '@/store/session';
import { act } from '@/lib/act';
import { decideApproval } from '@/domain/commands/approvals';
import { can, ROLES, type Permission } from '@/domain/roles';
import { useNow, useParam } from '@/lib/hooks';
import { formatRM, formatPct, marginPct, toSen } from '@/lib/money';
import { fmtDateTime, relTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui/core';
import { Segmented } from '@/components/ui/overlay';
import { PageHeader, Gate } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { Check, ClipboardCheck, X, Tag, FileText, Lock, Store, AlertTriangle } from '@/components/ui/icons';

const TYPE_LABEL: Record<ApprovalType, string> = {
  price_change: 'Price change',
  margin_floor: 'Margin below floor',
  discount: 'Exceptional discount',
  price_override: 'Manual price override',
  quote_reissue: 'Expired quote re-issue',
  credit_override: 'Credit limit override',
  pos_discount: 'Counter discount',
};
const PERM_FOR: Record<ApprovalType, Permission> = {
  price_change: 'price.approve',
  margin_floor: 'quote.approve',
  discount: 'quote.approve',
  price_override: 'quote.approve',
  quote_reissue: 'quote.approve',
  credit_override: 'credit.override',
  pos_discount: 'pos.discount.approve',
};
const LINK = (a: Approval) => (a.refType === 'price_change' ? `/pricing?tab=approvals` : a.refType === 'quote' ? `/quotes/${a.refId}` : a.refType === 'order' ? `/orders?id=${a.refId}` : '/pos');

export default function ApprovalsPage() {
  const db = useDbState();
  const now = useNow();
  const role = useSession((s) => s.role);
  const [focus] = useParam('focus');
  const [f, setF] = React.useState<'pending' | 'mine' | 'decided'>('pending');
  const all = Object.values(db.approvals).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const list = all.filter((a) => (f === 'decided' ? a.status !== 'pending' && a.status !== 'cancelled' : a.status === 'pending' && (f === 'pending' || can(role, PERM_FOR[a.type]))));
  const pendingCount = all.filter((a) => a.status === 'pending').length;
  return (
    <div>
      <PageHeader
        title="Approval Inbox"
        subtitle="Margin floor breaches, exceptional discounts, price overrides, price changes, expired quote re-issues and credit overrides — each routed to the roles allowed to decide."
        actions={
          <Segmented
            id="ap-f"
            value={f}
            onChange={setF}
            options={[
              { value: 'pending', label: `Pending (${pendingCount})` },
              { value: 'mine', label: `For ${ROLES[role].label.split(' ')[0]}` },
              { value: 'decided', label: 'Decided' },
            ]}
          />
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {(Object.keys(TYPE_LABEL) as ApprovalType[]).map((t) => {
          const n = all.filter((a) => a.type === t && a.status === 'pending').length;
          return (
            <Badge key={t} tone={n ? 'amber' : 'neutral'}>
              {TYPE_LABEL[t]} · {n}
            </Badge>
          );
        })}
      </div>
      <div data-tour="approval-inbox" className="space-y-2.5">
        {list.length === 0 && <EmptyState icon={<ClipboardCheck className="size-6" />} title={f === 'decided' ? 'No decisions yet' : 'Inbox zero'} body="Approvals appear when pricing rules, discounts or credit limits require a manager." />}
        <AnimatePresence initial={false}>
          {list.slice(0, 60).map((a) => (
            <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 60 }}>
              <ApprovalCard a={a} now={now} highlight={a.id === focus} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ApprovalCard({ a, now, highlight }: { a: Approval; now: string; highlight: boolean }) {
  const db = useDbState();
  const [note, setNote] = React.useState('');
  const ch = a.type === 'price_change' ? db.priceChanges[a.refId] : undefined;
  const [price, setPrice] = React.useState(ch ? (ch.proposedPrice / 100).toFixed(2) : '');
  const icon = a.type === 'price_change' ? <Tag className="size-4" /> : a.type === 'credit_override' ? <Lock className="size-4" /> : a.type === 'pos_discount' ? <Store className="size-4" /> : <FileText className="size-4" />;
  const pending = a.status === 'pending';
  return (
    <Card className={cn('p-4', highlight && 'ring-2 ring-accent', a.severity === 'critical' && pending && 'border-danger/40')}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', a.severity === 'critical' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{TYPE_LABEL[a.type]}</Badge>
            <span className="font-mono text-[11px] text-muted">{a.number}</span>
            <StatusBadge kind="approval" status={a.status} />
            {a.severity === 'critical' && pending && <Badge tone="red" icon={<AlertTriangle className="size-3" />}>critical</Badge>}
          </div>
          <Link to={LINK(a)} className="mt-1 block font-semibold hover:text-brand">
            {a.title}
          </Link>
          <p className="text-sm text-muted">{a.detail}</p>
          <p className="mt-1 text-[11px] text-muted">
            Requested by {a.requestedBy} · {relTime(a.requestedAt, now)} · decided by {a.requiredRoles.map((r) => ROLES[r].label).join(' / ')}
            {a.decidedBy && ` · ${a.status} by ${a.decidedBy} ${fmtDateTime(a.decidedAt)}`}
            {a.note && ` · “${a.note}”`}
          </p>
        </div>
        {a.amount !== undefined && <p className="tabular font-display text-lg font-bold">{formatRM(a.amount)}</p>}
      </div>
      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {ch && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Final price RM
              <Input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9 w-28" aria-label="Final price" />
              <span className={cn(marginPct(toSen(Number(price)), ch.newCost) < 12 ? 'text-danger' : '')}>margin {formatPct(marginPct(toSen(Number(price)), ch.newCost))}</span>
            </label>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Decision note (optional)" className="h-9 min-w-[160px] flex-1" />
          <Gate perm={PERM_FOR[a.type]}>
            <Button size="sm" className="h-9" onClick={() => act(decideApproval, { approvalId: a.id, approve: true, note: note || undefined, price: ch ? toSen(Number(price)) : undefined }, { success: `${a.number} approved` })}>
              <Check className="size-4" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={() => act(decideApproval, { approvalId: a.id, approve: false, note: note || 'Rejected' }, { success: `${a.number} rejected` })}>
              <X className="size-4" /> Reject
            </Button>
          </Gate>
        </div>
      )}
    </Card>
  );
}
