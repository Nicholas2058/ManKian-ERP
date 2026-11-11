import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { SalesOrder } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import * as S from '@/domain/commands/sales';
import { createPicklist } from '@/domain/commands/fulfilment';
import { ORDER_GROUPS } from '@/domain/kpis';
import { orderUninvoicedValue, creditPosition } from '@/domain/finance';
import { productStock } from '@/domain/inventory';
import { useNow, useParam } from '@/lib/hooks';
import { formatRM, lineTotal, compactRM } from '@/lib/money';
import { fmtDate, fmtDateTime, relTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Field, Input, Progress } from '@/components/ui/core';
import { Drawer, Modal, Segmented, useConfirm } from '@/components/ui/overlay';
import { PageHeader, Gate, KV, useMotionOK } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/status';
import { Boxes, Lock, PackageCheck, ShoppingCart, Truck, X, LayoutGrid, LayoutList, ClipboardList, Store, Clock, FileText, Receipt, AlertTriangle } from '@/components/ui/icons';

export default function OrdersPage() {
  const db = useDbState();
  const nav = useNavigate();
  const now = useNow();
  const [id, setId] = useParam('id');
  const [stage, setStage] = useParam('stage');
  const [view, setView] = React.useState<'board' | 'table'>('board');
  const [showClosed, setShowClosed] = React.useState(false);
  const all = React.useMemo(() => Object.values(db.salesOrders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.salesOrders]);
  const group = stage ? ORDER_GROUPS.find((g) => g.key === stage) : undefined;
  const rows = all.filter((o) => (group ? group.statuses.includes(o.status) : showClosed || !['invoiced', 'closed', 'cancelled'].includes(o.status)));
  const sel = id ? db.salesOrders[id] : undefined;
  const columns = React.useMemo<ColumnDef<SalesOrder, unknown>[]>(
    () => [
      { id: 'number', header: 'Order', accessorKey: 'number', cell: (c) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{c.row.original.number}</span> },
      { id: 'customer', header: 'Customer', accessorFn: (o) => db.customers[o.customerId]?.name ?? '', cell: (c) => <span className="line-clamp-1">{c.getValue() as string}</span> },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: (c) => <StatusBadge kind="order" status={c.row.original.status} /> },
      { id: 'ful', header: 'Fulfilment', accessorKey: 'fulfilment', cell: (c) => <span className="flex items-center gap-1 text-xs capitalize">{c.row.original.fulfilment === 'pickup' ? <Store className="size-3.5" /> : <Truck className="size-3.5" />}{c.row.original.fulfilment}</span> },
      { id: 'value', header: 'Open value', accessorFn: (o) => orderUninvoicedValue(o), meta: { align: 'right' }, cell: (c) => formatRM(c.getValue() as number) },
      { id: 'bo', header: 'Backorder', accessorFn: (o) => o.lines.reduce((s, l) => s + l.backorderQty, 0), meta: { align: 'right' }, cell: (c) => ((c.getValue() as number) > 0 ? <Badge tone="amber">{c.getValue() as number} units</Badge> : <span className="text-muted">—</span>) },
      { id: 'req', header: 'Required', accessorKey: 'requiredDate', cell: (c) => <span className={cn('text-xs', c.row.original.requiredDate < now && !['delivered', 'invoiced', 'cancelled', 'dispatched'].includes(c.row.original.status) ? 'font-semibold text-danger' : 'text-muted')}>{fmtDate(c.row.original.requiredDate)}</span> },
      { id: 'created', header: 'Created', accessorKey: 'createdAt', cell: (c) => <span className="text-xs text-muted">{relTime(c.row.original.createdAt, now)}</span> },
    ],
    [db.customers, now],
  );
  return (
    <div>
      <PageHeader
        title="Sales Orders & Allocation"
        subtitle="Accepted quotes become orders with preserved prices. Reservation is an explicit step; shortages become backorders with promised dates — never negative stock."
        actions={
          <>
            <Segmented
              id="ord-view"
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: <span className="flex items-center gap-1"><LayoutGrid className="size-4" /> Board</span> },
                { value: 'table', label: <span className="flex items-center gap-1"><LayoutList className="size-4" /> Table</span> },
              ]}
            />
            <Button variant="outline" onClick={() => nav('/quotes?filter=won')}>
              Accepted quotes →
            </Button>
          </>
        }
      />
      {group && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          Filtered: <Badge tone="blue">{group.label}</Badge>
          <button className="text-xs font-semibold text-brand hover:underline" onClick={() => setStage(null)}>
            Clear
          </button>
        </div>
      )}
      {view === 'board' ? <Board orders={rows} onOpen={setId} /> : (
        <DataTable
          id="orders"
          data={rows}
          columns={columns}
          getRowId={(o) => o.id}
          onRowClick={(o) => setId(o.id)}
          exportName="sales-orders"
          minWidth={900}
          toolbar={
            <Button size="sm" variant={showClosed ? 'secondary' : 'outline'} onClick={() => setShowClosed(!showClosed)}>
              {showClosed ? 'Hide' : 'Show'} invoiced & closed
            </Button>
          }
          mobileCard={(o) => (
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">{o.number}</span>
                <StatusBadge kind="order" status={o.status} />
              </div>
              <p className="mt-1 truncate text-sm">{db.customers[o.customerId]?.name}</p>
              <p className="text-xs text-muted">
                {o.lines.length} lines · {formatRM(orderUninvoicedValue(o))} open · required {fmtDate(o.requiredDate)}
              </p>
            </div>
          )}
        />
      )}
      <Drawer open={!!sel} onOpenChange={(o) => !o && setId(null)} title={sel?.number ?? ''} subtitle={sel ? `${db.customers[sel.customerId]?.name} · ${sel.quoteNumber ? `from ${sel.quoteNumber} v${sel.quoteVersion}` : ''}` : ''} width="max-w-3xl" headerExtra={sel && <div className="mt-2"><StatusBadge kind="order" status={sel.status} /></div>}>
        {sel && <OrderDetail o={sel} now={now} />}
      </Drawer>
    </div>
  );
}

function Board({ orders, onOpen }: { orders: SalesOrder[]; onOpen: (id: string) => void }) {
  const db = useDbState();
  const ok = useMotionOK();
  const cols = ORDER_GROUPS;
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
      {cols.map((g) => {
        const list = orders.filter((o) => g.statuses.includes(o.status));
        return (
          <div key={g.key} className="w-[78vw] max-w-[300px] shrink-0 snap-start rounded-2xl border border-line bg-surface-2 p-2 lg:w-auto lg:max-w-none">
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <p className="text-xs font-semibold text-ink">{g.label}</p>
              <span className="tabular rounded-full bg-surface px-2 text-[11px] font-semibold text-muted ring-1 ring-line">{list.length}</span>
            </div>
            <div className="scrollbar-thin max-h-[62vh] space-y-2 overflow-y-auto">
              {list.map((o, i) => {
                const tot = o.lines.reduce((s, l) => s + l.qtyBase, 0);
                const done = o.lines.reduce((s, l) => s + l.delivered, 0);
                const res = o.lines.reduce((s, l) => s + l.allocated + l.dispatched, 0);
                return (
                  <motion.button
                    key={o.id}
                    layout
                    initial={ok ? { opacity: 0, y: 6 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: ok ? Math.min(i, 8) * 0.02 : 0 }}
                    onClick={() => onOpen(o.id)}
                    className="w-full rounded-xl border border-line bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold">{o.number}</span>
                      {o.fulfilment === 'pickup' ? <Store className="size-3.5 text-muted" /> : <Truck className="size-3.5 text-muted" />}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm font-medium">{db.customers[o.customerId]?.name}</p>
                    <p className="tabular text-xs text-muted">{compactRM(orderUninvoicedValue(o))} · {o.lines.length} lines</p>
                    <Progress value={tot ? ((g.key === 'confirmed' || g.key === 'allocated' ? res : done) / tot) * 100 : 0} className="mt-2" tone={o.lines.some((l) => l.backorderQty > 0) ? 'amber' : 'green'} />
                    {o.lines.some((l) => l.backorderQty > 0) && <p className="mt-1 text-[10px] font-semibold text-warn">Backorder</p>}
                    {o.creditStatus === 'pending_override' && <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-danger"><Lock className="size-3" /> Credit hold</p>}
                  </motion.button>
                );
              })}
              {list.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted">Empty</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderDetail({ o, now }: { o: SalesOrder; now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [cancel, setCancel] = React.useState(false);
  const c = db.customers[o.customerId];
  const site = c?.sites.find((s) => s.id === o.siteId);
  const picklists = Object.values(db.picklists).filter((p) => p.orderId === o.id);
  const dos = Object.values(db.deliveryOrders).filter((d) => d.orderId === o.id);
  const invs = Object.values(db.invoices).filter((i) => i.orderId === o.id);
  const bos = Object.values(db.backorders).filter((b) => b.orderId === o.id);
  const res = Object.values(db.reservations).filter((r) => r.orderId === o.id && r.status === 'active');
  const canReserve = o.lines.some((l) => l.qtyBase - l.allocated - l.dispatched > 1e-6) && o.status !== 'cancelled' && o.creditStatus !== 'pending_override';
  const canPick = o.lines.some((l) => l.allocated - (l.picked - l.dispatched) > 1e-6);
  const staged = o.lines.some((l) => l.picked - l.dispatched > 1e-6);
  const cp = creditPosition(db, o.customerId, now);
  return (
    <div className="space-y-5">
      {o.creditStatus === 'pending_override' && (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/50 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <Lock className="size-4" /> Credit hold — override required
          </p>
          <p className="mt-1 text-xs text-ink-2">
            Exposure {formatRM(cp.exposure)} vs limit {formatRM(cp.limit)}{cp.oldestOverdueDays ? `; oldest overdue invoice ${cp.oldestOverdueDays} days` : ''}. Finance or the Owner must approve before stock can be reserved.
          </p>
          <Gate perm="credit.override">
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => act(S.decideCredit, { orderId: o.id, approve: true, note: 'Override approved in order view' }, { success: 'Credit override approved — reserve stock next' })}>
                Approve override
              </Button>
              <Button size="sm" variant="outline" onClick={() => act(S.decideCredit, { orderId: o.id, approve: false, note: 'Override rejected' }, { success: 'Override rejected; order cancelled' })}>
                Reject
              </Button>
            </div>
          </Gate>
        </div>
      )}
      <div className="grid gap-x-6 text-sm sm:grid-cols-2">
        <KV k="Customer" v={<Link className="hover:text-brand" to={`/customers?id=${c?.id}`}>{c?.name}</Link>} />
        <KV k="Site" v={site?.name ?? (o.fulfilment === 'pickup' ? 'Self-pickup' : '—')} />
        <KV k="Required" v={fmtDate(o.requiredDate)} />
        <KV k="Payment terms" v={o.paymentTermsDays ? `${o.paymentTermsDays} days` : 'Cash'} />
        <KV k="Quote" v={o.quoteId ? <Link className="hover:text-brand" to={`/quotes/${o.quoteId}`}>{o.quoteNumber} v{o.quoteVersion}</Link> : '—'} />
        <KV k="Open value" v={formatRM(orderUninvoicedValue(o))} />
        {o.projectRef && <KV k="Project" v={o.projectRef} />}
        <KV k="Fulfilment" v={<span className="capitalize">{o.fulfilment}</span>} />
      </div>

      <div className="space-y-2" data-tour="order-actions">
        <div className="flex flex-wrap gap-2">
          {canReserve && (
            <Gate perm="order.reserve">
              <Button onClick={() => act(S.reserveOrder, { orderId: o.id }, { success: (r) => { const bo = r.reduce((s, x) => s + x.backordered, 0); return bo ? `Reserved available stock; ${bo} units backordered` : 'All lines reserved'; } })}>
                <Boxes className="size-4" /> Reserve stock
              </Button>
            </Gate>
          )}
          {canPick && (
            <Gate perm="pick">
              <Button variant="outline" onClick={() => { const pl = act(createPicklist, { orderId: o.id }, { success: (p) => `Picklist ${p.number} ready` }); if (pl) nav(`/inventory?tab=picking&pl=${pl.id}`); }}>
                <ClipboardList className="size-4" /> Generate picklist
              </Button>
            </Gate>
          )}
          {staged && (
            <Button variant="outline" onClick={() => nav(`/delivery?order=${o.id}`)}>
              <Truck className="size-4" /> {o.fulfilment === 'pickup' ? 'Prepare collection' : 'Pack & dispatch'}
            </Button>
          )}
          {res.length > 0 && !staged && (
            <Gate perm="order.reserve" fallback={null}>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (await confirm({ title: 'Release reservations?', body: 'Unpicked reserved stock returns to available. Picked goods stay staged.', confirmLabel: 'Release' })) act(S.releaseReservations, { orderId: o.id, reason: 'Released by user' }, { success: (n) => `Released ${n} reserved units` });
                }}
              >
                Release reservations
              </Button>
            </Gate>
          )}
          {!['cancelled', 'invoiced', 'delivered', 'dispatched', 'partially_dispatched'].includes(o.status) && (
            <Gate perm="order.cancel" fallback={null}>
              <Button variant="ghost" className="text-danger" onClick={() => setCancel(true)}>
                <X className="size-4" /> Cancel order
              </Button>
            </Gate>
          )}
        </div>
        {res.length > 0 && <p className="text-xs text-muted">Reservation hold until {fmtDate(res[0].expiresAt)} (policy: required date + {db.config.reservationHoldDays} days).</p>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Line</th>
              <th className="px-2 py-2 text-right">Ordered</th>
              <th className="px-2 py-2 text-right">Reserved</th>
              <th className="px-2 py-2 text-right">Picked</th>
              <th className="px-2 py-2 text-right">Dispatched</th>
              <th className="px-2 py-2 text-right">Delivered</th>
              <th className="px-2 py-2 text-right">Invoiced</th>
              <th className="px-2 py-2 text-right">Backorder</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => {
              const p = db.products[l.productId];
              const st = productStock(db, l.productId);
              return (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <p className="font-mono text-[10px] text-muted">{p?.sku}</p>
                    <p className="font-medium text-ink">{l.description}</p>
                    <p className="text-[10px] text-muted">
                      {l.qty} {l.uom}
                      {l.factor > 1 ? ` = ${l.qtyBase} ${p?.baseUom}` : ''} · avail now {st.available}
                    </p>
                  </td>
                  <td className="tabular px-2 py-2 text-right">{l.qtyBase}</td>
                  <td className="tabular px-2 py-2 text-right">{l.allocated}</td>
                  <td className="tabular px-2 py-2 text-right">{l.picked}</td>
                  <td className="tabular px-2 py-2 text-right">{l.dispatched}</td>
                  <td className="tabular px-2 py-2 text-right">{l.delivered}</td>
                  <td className="tabular px-2 py-2 text-right">{l.invoiced}</td>
                  <td className="tabular px-2 py-2 text-right">
                    {l.backorderQty > 0 ? (
                      <span className="font-semibold text-warn">
                        {l.backorderQty}
                        <span className="block text-[10px] font-normal">by {fmtDate(l.backorderPromisedDate)}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-right font-semibold">{formatRM(lineTotal(l.unitPrice, l.qty, l.discountPct))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">All fulfilment quantities are in base units. Picked goods sit in dispatch staging: still on hand, still reserved, until dispatched.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Linked documents</p>
          <ul className="space-y-1.5 text-xs">
            {bos.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <Clock className="size-3.5 text-warn" />
                <span className="flex-1">
                  Backorder {b.qty} × {db.products[b.productId]?.sku} {b.poId ? `· on ${db.purchaseOrders[b.poId]?.number}` : ''}
                </span>
                <Badge tone={b.status === 'open' ? 'amber' : b.status === 'allocated' ? 'green' : 'neutral'}>{b.status}</Badge>
              </li>
            ))}
            {picklists.map((p) => (
              <li key={p.id}>
                <Link to={`/inventory?tab=picking&pl=${p.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-surface-2">
                  <ClipboardList className="size-3.5 text-muted" /> <span className="flex-1">{p.number}</span> <StatusBadge kind="picklist" status={p.status} />
                </Link>
              </li>
            ))}
            {dos.map((d) => (
              <li key={d.id}>
                <Link to={`/delivery?id=${d.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-surface-2">
                  <Truck className="size-3.5 text-muted" /> <span className="flex-1">{d.number}</span> <StatusBadge kind="delivery" status={d.status} />
                </Link>
              </li>
            ))}
            {invs.map((i) => (
              <li key={i.id}>
                <Link to={`/finance?tab=invoices&id=${i.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-surface-2">
                  <Receipt className="size-3.5 text-muted" /> <span className="flex-1">{i.number}</span> <span className="tabular">{formatRM(i.total)}</span>
                </Link>
              </li>
            ))}
            {!bos.length && !picklists.length && !dos.length && !invs.length && <li className="text-muted">None yet</li>}
          </ul>
        </div>
        <div data-tour="order-timeline">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Timeline</p>
          <ol className="relative space-y-2.5 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-line">
            {[...o.timeline].reverse().map((t, i) => (
              <li key={i} className="relative pl-5 text-xs">
                <span className={cn('absolute left-0 top-1 size-[11px] rounded-full border-2 border-surface', i === 0 ? 'bg-accent' : 'bg-line-strong')} />
                <p className="text-ink">{t.label}</p>
                <p className="text-[10px] text-muted">
                  {fmtDateTime(t.at)} · {t.by}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <CancelModal open={cancel} onOpenChange={setCancel} o={o} />
    </div>
  );
}

function CancelModal({ open, onOpenChange, o }: { open: boolean; onOpenChange: (v: boolean) => void; o: SalesOrder }) {
  const [reason, setReason] = React.useState('');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Cancel ${o.number}?`}
      description="Reservations are released and backorders cancelled. This cannot be undone."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep order
          </Button>
          <Button variant="danger" disabled={reason.trim().length < 3} onClick={() => act(S.cancelOrder, { orderId: o.id, reason }, { success: `${o.number} cancelled — stock released` }) !== undefined && onOpenChange(false)}>
            Cancel order
          </Button>
        </>
      }
    >
      <Field label="Reason" required>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed specification" autoFocus />
      </Field>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
        <AlertTriangle className="mt-0.5 size-3.5" /> Orders with dispatched goods must be handled as returns instead.
      </p>
    </Modal>
  );
}
