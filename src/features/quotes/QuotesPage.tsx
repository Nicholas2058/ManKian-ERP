import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { Quote } from '@/domain/types';
import { useDbState } from '@/store/db';
import { useT } from '@/i18n';
import { useNow, useParam } from '@/lib/hooks';
import { formatPct, formatRM, compactRM } from '@/lib/money';
import { fmtDate, relTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button, Badge } from '@/components/ui/core';
import { Segmented } from '@/components/ui/overlay';
import { PageHeader, KpiTile, fmtCompact, fmtInt } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/status';
import { Plus, RefreshCw, Lock, Clock, FileText, Hourglass } from '@/components/ui/icons';

type F = 'all' | 'open' | 'pending' | 'issued' | 'won' | 'lost' | 'recheck' | 'expiring';

export default function QuotesPage() {
  const db = useDbState();
  const t = useT();
  const nav = useNavigate();
  const now = useNow();
  const [fp, setFp] = useParam('filter');
  const f = (fp as F) ?? 'open';
  const rows = React.useMemo(() => Object.values(db.quotes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [db.quotes]);
  const cur = (q: Quote) => q.versions[q.currentVersion - 1];
  const filtered = rows.filter((q) => {
    switch (f) {
      case 'open':
        return ['draft', 'pending_approval', 'approved', 'issued', 'accepted'].includes(q.status);
      case 'pending':
        return q.status === 'pending_approval';
      case 'issued':
        return q.status === 'issued';
      case 'won':
        return ['accepted', 'converted'].includes(q.status);
      case 'lost':
        return ['rejected', 'expired', 'cancelled'].includes(q.status);
      case 'recheck':
        return !!q.recheck && ['draft', 'pending_approval', 'approved'].includes(q.status);
      case 'expiring': {
        const e = cur(q).expiresAt;
        return q.status === 'issued' && !!e && (Date.parse(e) - Date.parse(now)) / 3_600_000 <= 24;
      }
      default:
        return true;
    }
  });
  const open = rows.filter((q) => ['draft', 'pending_approval', 'approved', 'issued'].includes(q.status));
  const openValue = open.reduce((s, q) => s + cur(q).totals.total, 0);
  const columns = React.useMemo<ColumnDef<Quote, unknown>[]>(
    () => [
      { id: 'number', header: 'Quote', accessorKey: 'number', cell: (c) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{c.row.original.number}<span className="text-muted"> v{c.row.original.currentVersion}</span></span> },
      { id: 'customer', header: 'Customer', accessorFn: (q) => db.customers[q.customerId]?.name ?? '', cell: (c) => <span className="line-clamp-1 max-w-[220px]">{c.getValue() as string}</span> },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        cell: (c) => (
          <span className="flex flex-wrap items-center gap-1">
            <StatusBadge kind="quote" status={c.row.original.status} />
            {c.row.original.recheck && ['draft', 'pending_approval', 'approved'].includes(c.row.original.status) && <Badge tone="orange" icon={<RefreshCw className="size-3" />}>recheck</Badge>}
            {c.row.original.contractLocked && <Lock className="size-3.5 text-violet" aria-label="Contract pricing" />}
          </span>
        ),
      },
      { id: 'lines', header: 'Lines', accessorFn: (q) => cur(q).lines.length, meta: { align: 'right' } },
      { id: 'total', header: 'Total', accessorFn: (q) => cur(q).totals.total, meta: { align: 'right', csv: (q) => (cur(q).totals.total / 100).toFixed(2) }, cell: (c) => <span className="font-semibold">{formatRM(c.getValue() as number)}</span> },
      { id: 'margin', header: 'Margin', accessorFn: (q) => cur(q).totals.marginPct, meta: { align: 'right' }, cell: (c) => <span className={cn((c.getValue() as number) < db.config.minMarginPct ? 'text-danger' : 'text-muted')}>{formatPct(c.getValue() as number)}</span> },
      {
        id: 'validity',
        header: 'Valid until',
        accessorFn: (q) => cur(q).expiresAt ?? '',
        cell: (c) => {
          const e = c.getValue() as string;
          if (!e) return <span className="text-xs text-muted">{cur(c.row.original).validityDays === 0 ? 'same day' : `${cur(c.row.original).validityDays}d on issue`}</span>;
          const hrs = (Date.parse(e) - Date.parse(now)) / 3_600_000;
          return <span className={cn('text-xs', c.row.original.status === 'issued' && hrs < 24 ? 'font-semibold text-warn' : 'text-muted')}>{fmtDate(e)}{c.row.original.status === 'issued' && hrs > 0 ? ` · ${relTime(e, now).replace('in ', '')} left` : ''}</span>;
        },
      },
      { id: 'channel', header: 'Channel', accessorFn: (q) => q.channel ?? '', cell: (c) => <span className="text-xs capitalize text-muted">{c.getValue() as string}</span> },
      { id: 'owner', header: 'Owner', accessorKey: 'owner', cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'updated', header: 'Updated', accessorKey: 'updatedAt', cell: (c) => <span className="text-xs text-muted">{relTime(c.row.original.updatedAt, now)}</span> },
    ],
    [db.customers, db.config.minMarginPct, now],
  );
  return (
    <div>
      <PageHeader
        title={t('quote.title')}
        subtitle="Versioned quotations with tier/contract pricing, margin controls and immutable issued snapshots."
        actions={
          <Button onClick={() => nav('/quotes/new')}>
            <Plus className="size-4" /> {t('quote.new')}
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Open quotations" value={open.length} format={fmtInt} sub={`${compactRM(openValue)} total value`} icon={<FileText className="size-3.5" />} />
        <KpiTile label="Awaiting approval" value={rows.filter((q) => q.status === 'pending_approval').length} format={fmtInt} onClick={() => setFp('pending')} icon={<Hourglass className="size-3.5" />} />
        <KpiTile label="Need recheck" value={rows.filter((q) => q.recheck && ['draft', 'pending_approval', 'approved'].includes(q.status)).length} format={fmtInt} onClick={() => setFp('recheck')} icon={<RefreshCw className="size-3.5" />} tone="warn" />
        <KpiTile label="Issued, value" value={rows.filter((q) => q.status === 'issued').reduce((s, q) => s + cur(q).totals.total, 0)} format={fmtCompact} onClick={() => setFp('issued')} icon={<Clock className="size-3.5" />} />
      </div>
      <DataTable
        id="quotes"
        data={filtered}
        columns={columns}
        getRowId={(q) => q.id}
        onRowClick={(q) => nav(`/quotes/${q.id}`)}
        searchPlaceholder="Search quote no., customer…"
        exportName="quotations"
        minWidth={980}
        toolbar={
          <Segmented<F>
            id="qf"
            size="sm"
            value={f}
            onChange={(v) => setFp(v)}
            className="no-scrollbar max-w-full overflow-x-auto"
            options={[
              { value: 'open', label: 'Open' },
              { value: 'pending', label: 'Pending' },
              { value: 'issued', label: 'Issued' },
              { value: 'recheck', label: 'Recheck' },
              { value: 'expiring', label: 'Expiring' },
              { value: 'won', label: 'Won' },
              { value: 'lost', label: 'Lost' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
        mobileCard={(q) => (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold">{q.number}</span>
              <StatusBadge kind="quote" status={q.status} />
            </div>
            <p className="mt-1 truncate text-sm font-medium">{db.customers[q.customerId]?.name}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>
                {cur(q).lines.length} lines · margin {formatPct(cur(q).totals.marginPct)}
                {q.recheck && ['draft', 'pending_approval', 'approved'].includes(q.status) ? ' · recheck' : ''}
              </span>
              <span className="tabular text-sm font-semibold text-ink">{formatRM(cur(q).totals.total)}</span>
            </div>
          </div>
        )}
      />
    </div>
  );
}
