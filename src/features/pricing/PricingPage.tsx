import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useDbState } from '@/store/db';
import { useParam, useMediaQuery } from '@/lib/hooks';
import { formatPct, formatRM } from '@/lib/money';
import { fmtShort } from '@/lib/dates';
import { downloadText, cn } from '@/lib/utils';
import { toCsv } from '@/services/csv';
import { toast } from 'sonner';
import { Button, Select, Badge } from '@/components/ui/core';
import { Drawer, Tabs, TabPanel } from '@/components/ui/overlay';
import { PageHeader, Sparkline } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/status';
import { Download, Star, Tag, Zap, Upload, ClipboardCheck, SlidersHorizontal, History, Lock } from '@/components/ui/icons';
import { priceRows, type PriceRow } from './model';
import { PriceDetail } from './PriceDetail';
import { ShockSimulator } from './ShockSimulator';
import { BatchImport } from './BatchImport';
import { PriceApprovals } from './PriceApprovals';
import { RulesEditor } from './RulesEditor';
import { PriceHistoryLog } from './PriceHistoryLog';

export default function PricingPage() {
  const db = useDbState();
  const [tab, setTab] = useParam('tab');
  const [sku, setSku] = useParam('sku');
  const [catParam] = useParam('category');
  const [cat, setCat] = React.useState(catParam ?? '');
  const [status, setStatus] = React.useState('');
  const [watch, setWatch] = React.useState(false);
  const wide = useMediaQuery('(min-width: 1280px)');
  const rows = React.useMemo(() => priceRows(db), [db]);
  const filtered = React.useMemo(() => rows.filter((r) => (!cat || r.p.categoryId === cat) && (!status || r.status === status) && (!watch || r.p.watch)), [rows, cat, status, watch]);
  const pending = Object.values(db.priceChanges).filter((c) => c.status === 'pending').length;
  const current = tab ?? 'table';
  const selected = sku ? db.products[sku] : undefined;

  const columns = React.useMemo<ColumnDef<PriceRow, unknown>[]>(
    () => [
      { id: 'sku', header: 'SKU', accessorKey: 'sku', cell: (c) => <span className="flex items-center gap-1 whitespace-nowrap font-mono text-xs font-semibold">{c.row.original.p.watch && <Star className="size-3 fill-current text-warn" />}{c.row.original.sku}</span> },
      { id: 'name', header: 'Product', accessorKey: 'name', cell: (c) => <span className="line-clamp-1 max-w-[260px]">{c.row.original.name}</span> },
      { id: 'category', header: 'Category', accessorKey: 'category', cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'brand', header: 'Brand', accessorKey: 'brand', cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'cost', header: 'Supplier cost', accessorKey: 'cost', meta: { align: 'right', csv: (r) => (r.cost / 100).toFixed(2) }, cell: (c) => formatRM(c.row.original.cost) },
      { id: 'prev', header: 'Previous cost', accessorKey: 'prevCost', meta: { align: 'right', csv: (r) => (r.prevCost / 100).toFixed(2) }, cell: (c) => <span className="text-muted">{formatRM(c.row.original.prevCost)}</span> },
      {
        id: 'chg',
        header: 'Δ cost',
        accessorKey: 'costChangePct',
        meta: { align: 'right', csv: (r) => r.costChangePct.toFixed(2) },
        cell: (c) => {
          const v = c.row.original.costChangePct;
          return <span className={cn('font-semibold', v > 0.05 ? 'text-danger' : v < -0.05 ? 'text-info' : 'text-muted')}>{Math.abs(v) < 0.05 ? '—' : formatPct(v, 1, true)}</span>;
        },
      },
      { id: 'target', header: 'Target margin', accessorKey: 'target', meta: { align: 'right' }, cell: (c) => <span className="text-muted">{c.row.original.rule.method === 'margin' ? `${c.row.original.target}%` : `${c.row.original.target}% mk`}</span> },
      { id: 'suggested', header: 'Suggested', accessorKey: 'suggested', meta: { align: 'right', csv: (r) => (r.suggested / 100).toFixed(2) }, cell: (c) => <span className="font-medium text-brand">{formatRM(c.row.original.suggested)}</span> },
      { id: 'list', header: 'Approved list', accessorKey: 'list', meta: { align: 'right', csv: (r) => (r.list / 100).toFixed(2) }, cell: (c) => <span className="font-semibold">{formatRM(c.row.original.list)}</span> },
      {
        id: 'margin',
        header: 'Margin @ list',
        accessorKey: 'marginAtList',
        meta: { align: 'right', csv: (r) => r.marginAtList.toFixed(2) },
        cell: (c) => <span className={cn('font-semibold', c.row.original.marginAtList < c.row.original.rule.minMarginPct ? 'text-danger' : 'text-ink')}>{formatPct(c.row.original.marginAtList)}</span>,
      },
      { id: 'trend', header: 'Cost trend', enableSorting: false, cell: (c) => <Sparkline values={c.row.original.trend} width={72} height={22} stroke={c.row.original.costChangePct > 0 ? 'var(--danger)' : 'var(--chart-brand)'} /> },
      { id: 'effective', header: 'Effective', accessorKey: 'effective', cell: (c) => <span className="text-xs text-muted">{fmtShort(c.row.original.effective)}</span> },
      { id: 'tiers', header: 'Tiers', enableSorting: false, cell: (c) => (c.row.original.contracts ? <Badge tone="violet" icon={<Lock className="size-3" />}>{c.row.original.contracts} contract</Badge> : <span className="text-xs text-muted">5 tiers</span>) },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: (c) => <StatusBadge kind="price" status={c.row.original.status} /> },
      { id: 'action', header: 'Pending action', accessorKey: 'pendingAction', cell: (c) => <span className="text-xs text-muted">{c.row.original.pendingAction}</span> },
    ],
    [],
  );

  const exportList = () => {
    const out = filtered.map((r) => ({
      sku: r.sku,
      product: r.name,
      category: r.category,
      uom: r.p.baseUom,
      cost_rm: (r.cost / 100).toFixed(2),
      list_price_rm: (r.list / 100).toFixed(2),
      trade_rm: ((r.list * (1 - r.rule.tierDiscountPct.trade / 100)) / 100).toFixed(2),
      contractor_rm: ((r.list * (1 - r.rule.tierDiscountPct.contractor / 100)) / 100).toFixed(2),
      key_account_rm: ((r.list * (1 - r.rule.tierDiscountPct.key / 100)) / 100).toFixed(2),
      margin_pct: r.marginAtList.toFixed(1),
      status: r.status,
    }));
    downloadText(`CONFIDENTIAL-internal-price-list-${new Date().toISOString().slice(0, 10)}-DEMO.csv`, `# CONFIDENTIAL — internal use only. Fictional demo prices; never publish.\n${toCsv(out)}`, 'text/csv');
    toast.success(`Exported ${out.length} SKUs (internal, confidential)`);
  };

  return (
    <div>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Tag className="size-3.5" /> Hero module</span>}
        title="Dynamic Pricing Command Center"
        subtitle="Supplier costs change daily. Track every cost signal, see suggested prices by rule, protect margin floors and approve changes — issued quotations keep their snapshot."
        actions={
          <>
            <Button variant="outline" onClick={exportList}>
              <Download className="size-4" /> Price list <span className="text-[10px] font-bold uppercase text-danger">confidential</span>
            </Button>
            <Button onClick={() => setTab('shock')} className="bg-ember-500 text-forest-950 hover:brightness-105 dark:text-forest-950">
              <Zap className="size-4" /> Cost shock simulator
            </Button>
          </>
        }
      />
      <Tabs
        id="pricing"
        value={current}
        onValueChange={(v) => setTab(v === 'table' ? null : v)}
        tabs={[
          { value: 'table', label: 'Price table', icon: <Tag className="size-4" /> },
          { value: 'shock', label: 'Cost shock', icon: <Zap className="size-4" /> },
          { value: 'batch', label: 'Batch import', icon: <Upload className="size-4" /> },
          { value: 'approvals', label: 'Approvals', icon: <ClipboardCheck className="size-4" />, count: pending },
          { value: 'rules', label: 'Rules engine', icon: <SlidersHorizontal className="size-4" /> },
          { value: 'history', label: 'History', icon: <History className="size-4" /> },
        ]}
      >
        <TabPanel value="table" className="pt-4">
          <div className={cn('grid gap-4', selected && wide && 'xl:grid-cols-[minmax(0,1fr)_440px]')}>
            <DataTable
              id="pricing"
              data={filtered}
              columns={columns}
              getRowId={(r) => r.id}
              onRowClick={(r) => setSku(r.id)}
              rowClassName={(r) => (r.id === sku ? 'bg-accent-soft/60' : r.status === 'below_margin' ? 'bg-danger-soft/30' : undefined)}
              searchPlaceholder="Search SKU, product, brand…"
              initialSorting={[{ id: 'chg', desc: true }]}
              exportName="pricing-table"
              minWidth={selected && wide ? 560 : 1180}
              visibleColumns={selected && wide ? ['sku', 'name', 'cost', 'chg', 'list', 'margin', 'status'] : undefined}
              toolbar={
                <>
                  <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 w-auto min-w-[170px]" aria-label="Category">
                    <option value="">All categories</option>
                    {Object.values(db.categories).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto min-w-[160px]" aria-label="Price status">
                    <option value="">All statuses</option>
                    <option value="pending">Pending approval</option>
                    <option value="below_margin">Below margin floor</option>
                    <option value="needs_recheck">Needs recheck</option>
                    <option value="approved">Approved</option>
                  </Select>
                  <Button variant={watch ? 'secondary' : 'outline'} size="sm" className="h-9" onClick={() => setWatch(!watch)} aria-pressed={watch}>
                    <Star className={cn('size-4', watch && 'fill-current')} /> Watchlist
                  </Button>
                </>
              }
              mobileCard={(r) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-muted">{r.sku}</p>
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge kind="price" status={r.status} />
                      {Math.abs(r.costChangePct) >= 0.05 && <span className={cn('text-xs font-semibold', r.costChangePct > 0 ? 'text-danger' : 'text-info')}>{formatPct(r.costChangePct, 1, true)} cost</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold">{formatRM(r.list)}</p>
                    <p className={cn('tabular text-xs', r.marginAtList < r.rule.minMarginPct ? 'text-danger' : 'text-muted')}>{formatPct(r.marginAtList)} margin</p>
                  </div>
                </div>
              )}
            />
            {selected && wide && (
              <div className="xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto xl:rounded-2xl xl:border xl:border-line xl:bg-surface xl:p-5 scrollbar-thin">
                <PriceDetail product={selected} onClose={() => setSku(null)} />
              </div>
            )}
          </div>
          {!wide && (
            <Drawer open={!!selected} onOpenChange={(o) => !o && setSku(null)} title={selected?.sku ?? ''} subtitle={selected?.name} width="max-w-2xl">
              {selected && <PriceDetail product={selected} />}
            </Drawer>
          )}
        </TabPanel>
        <TabPanel value="shock" className="pt-4">
          <ShockSimulator initialProductId={sku ?? undefined} />
        </TabPanel>
        <TabPanel value="batch" className="pt-4">
          <BatchImport />
        </TabPanel>
        <TabPanel value="approvals" className="pt-4">
          <PriceApprovals />
        </TabPanel>
        <TabPanel value="rules" className="pt-4">
          <RulesEditor />
        </TabPanel>
        <TabPanel value="history" className="pt-4">
          <PriceHistoryLog />
        </TabPanel>
      </Tabs>
    </div>
  );
}
