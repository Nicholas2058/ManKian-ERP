import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useDbState } from '@/store/db';
import type { PriceChange } from '@/domain/types';
import { formatPct, formatRM, pctChange } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { DataTable } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/status';
import { useNavigate } from 'react-router-dom';

export function PriceHistoryLog() {
  const db = useDbState();
  const nav = useNavigate();
  const rows = React.useMemo(() => Object.values(db.priceChanges).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.priceChanges]);
  const columns = React.useMemo<ColumnDef<PriceChange, unknown>[]>(
    () => [
      { id: 'date', header: 'Created', accessorKey: 'createdAt', cell: (c) => <span className="text-xs">{fmtDateTime(c.row.original.createdAt)}</span> },
      { id: 'num', header: 'Change', accessorKey: 'number', cell: (c) => <span className="font-mono text-xs">{c.row.original.number}</span> },
      { id: 'sku', header: 'SKU', accessorFn: (r) => db.products[r.productId]?.sku ?? '', cell: (c) => <span className="font-mono text-xs font-semibold">{c.getValue() as string}</span> },
      { id: 'src', header: 'Source', accessorKey: 'source', cell: (c) => <span className="text-xs capitalize">{(c.getValue() as string).replace('_', ' ')}</span> },
      { id: 'cost', header: 'Cost change', accessorFn: (r) => pctChange(r.oldCost, r.newCost), meta: { align: 'right' }, cell: (c) => <span className="text-xs">{formatRM(c.row.original.oldCost)} → {formatRM(c.row.original.newCost)} <b className={(c.getValue() as number) > 0 ? 'text-danger' : 'text-info'}>{formatPct(c.getValue() as number, 1, true)}</b></span> },
      { id: 'price', header: 'Price', accessorFn: (r) => r.proposedPrice, meta: { align: 'right' }, cell: (c) => <span className="text-xs">{formatRM(c.row.original.oldPrice)} → <b>{formatRM(c.row.original.proposedPrice)}</b></span> },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: (c) => <StatusBadge kind="change" status={c.row.original.status} /> },
      { id: 'by', header: 'Decided by', accessorFn: (r) => r.decidedBy ?? '', cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'reason', header: 'Reason', accessorKey: 'reason', cell: (c) => <span className="line-clamp-1 max-w-[260px] text-xs text-muted">{c.getValue() as string}</span> },
    ],
    [db.products],
  );
  return <DataTable id="price-history" data={rows} columns={columns} getRowId={(r) => r.id} onRowClick={(r) => nav(`/pricing?sku=${r.productId}`)} searchPlaceholder="Search SKU, source, reason…" exportName="price-change-history" />;
}
