import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import type { PurchaseOrder, Supplier, ID } from '@/domain/types';
import { useDbState, getDb } from '@/store/db';
import { act } from '@/lib/act';
import * as P from '@/domain/commands/procurement';
import { homeBins, OPEN_PO, poOutstanding, stockIndex } from '@/domain/inventory';
import { useNow, useParam } from '@/lib/hooks';
import { formatRM, formatPct, roundSen, toSen, compactRM } from '@/lib/money';
import { addDays, daysOverdue, fmtDate, fmtDateTime, relTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { poPdf } from '@/services/pdf';
import { Badge, Button, Card, EmptyState, Field, Input, Progress, Select, Textarea } from '@/components/ui/core';
import { Drawer, Modal, Tabs, TabPanel } from '@/components/ui/overlay';
import { PageHeader, Gate, KV, SectionCard, DemoNote, KpiTile, fmtCompact, fmtInt } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/status';
import { ProductSearch } from '@/components/ProductSearch';
import { Building2, Check, ClipboardList, Download, GitCompare, PackageCheck, Plus, Send, Star, Trash, Truck, Warehouse, X, Clock, AlertTriangle, ArrowRight } from '@/components/ui/icons';

export default function ProcurementPage() {
  const db = useDbState();
  const [tab, setTab] = useParam('tab');
  const [newP, setNewP] = useParam('new');
  const [poOpen, setPoOpen] = React.useState(false);
  const [prOpen, setPrOpen] = React.useState(false);
  React.useEffect(() => {
    if (newP === 'po') setPoOpen(true);
    if (newP === 'pr') setPrOpen(true);
    if (newP) setNewP(null);
  }, [newP, setNewP]);
  const open = Object.values(db.purchaseOrders).filter((p) => OPEN_PO.includes(p.status));
  const now = new Date().toISOString();
  const late = open.filter((p) => p.expectedAt < now && p.lines.some((l) => poOutstanding(l) > 0));
  const commit = open.reduce((s, p) => s + p.lines.reduce((t, l) => t + roundSen(poOutstanding(l) * l.unitCost), 0), 0);
  return (
    <div>
      <PageHeader
        title="Procurement & Supplier Intelligence"
        subtitle="Requisition → supplier quotations → comparison → PO → acknowledgement → goods receipt → bill matching. Supplier names and terms are fictional."
        actions={
          <Gate perm="po.manage">
            <Button variant="outline" onClick={() => setPrOpen(true)}>
              <ClipboardList className="size-4" /> New requisition
            </Button>
            <Button onClick={() => setPoOpen(true)}>
              <Plus className="size-4" /> New PO
            </Button>
          </Gate>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Open POs" value={open.length} format={fmtInt} icon={<Building2 className="size-3.5" />} onClick={() => setTab('pos')} />
        <KpiTile label="Purchase commitments" value={commit} format={fmtCompact} icon={<Building2 className="size-3.5" />} />
        <KpiTile label="Late POs" value={late.length} format={fmtInt} tone={late.length ? 'warn' : 'default'} icon={<Clock className="size-3.5" />} onClick={() => setTab('pos')} />
        <KpiTile label="Open requisitions" value={Object.values(db.requisitions).filter((r) => ['open', 'quoting'].includes(r.status)).length} format={fmtInt} icon={<ClipboardList className="size-3.5" />} onClick={() => setTab('requisitions')} />
      </div>
      <Tabs
        id="proc"
        value={tab ?? 'requisitions'}
        onValueChange={(v) => setTab(v)}
        tabs={[
          { value: 'requisitions', label: 'Requisitions & compare', icon: <GitCompare className="size-4" /> },
          { value: 'pos', label: 'Purchase orders', icon: <Building2 className="size-4" />, count: open.length },
          { value: 'grn', label: 'Goods receipts', icon: <PackageCheck className="size-4" /> },
          { value: 'suppliers', label: 'Suppliers', icon: <Star className="size-4" /> },
        ]}
      >
        <TabPanel value="requisitions" className="pt-4">
          <Requisitions onNew={() => setPrOpen(true)} />
        </TabPanel>
        <TabPanel value="pos" className="pt-4">
          <PurchaseOrders />
        </TabPanel>
        <TabPanel value="grn" className="pt-4">
          <Receipts />
        </TabPanel>
        <TabPanel value="suppliers" className="pt-4">
          <Suppliers />
        </TabPanel>
      </Tabs>
      <NewPOModal open={poOpen} onOpenChange={setPoOpen} />
      <NewReqModal open={prOpen} onOpenChange={setPrOpen} />
    </div>
  );
}

// ───────────────────────── Requisitions & comparison
function Requisitions({ onNew }: { onNew: () => void }) {
  const db = useDbState();
  const nav = useNavigate();
  const [product] = useParam('product');
  const [sel, setSel] = React.useState<string | null>(null);
  const reqs = Object.values(db.requisitions).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const stock = stockIndex(db);
  const suggestions = Object.values(db.products)
    .filter((p) => p.status === 'active' && (stock[p.id]?.available ?? 0) + (stock[p.id]?.incoming ?? 0) < p.reorderPoint)
    .filter((p) => !reqs.some((r) => ['open', 'quoting'].includes(r.status) && r.lines.some((l) => l.productId === p.id)));
  React.useEffect(() => {
    if (!sel && reqs[0] && ['open', 'quoting'].includes(reqs[0].status)) setSel(reqs[0].id);
  }, [reqs, sel]);
  const quickReq = (pid: string) => {
    const p = db.products[pid];
    const bo = Object.values(db.backorders).filter((b) => b.status === 'open' && b.productId === pid).reduce((s, b) => s + b.qty, 0);
    const r = act(P.createRequisition, { lines: [{ productId: pid, qty: p.reorderQty + Math.ceil(bo) }], reason: bo ? `Low stock with ${bo} on backorder` : 'Below reorder point', sourceType: bo ? 'backorder' : 'low_stock', neededBy: addDays(new Date().toISOString(), p.leadTimeDays) }, { success: (x) => `${x.number} created` });
    if (r) setSel(r.id);
  };
  const r = sel ? db.requisitions[sel] : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-12" data-tour="requisitions">
      <div className="space-y-4 xl:col-span-4">
        <SectionCard title="Reorder suggestions" subtitle="Available + incoming below reorder point" actions={<Badge tone="amber">{suggestions.length}</Badge>}>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted">All SKUs above reorder point.</p>
          ) : (
            <ul className="space-y-1.5">
              {suggestions.slice(0, 8).map((p) => {
                const st = stock[p.id];
                const bo = Object.values(db.backorders).filter((b) => b.status === 'open' && b.productId === p.id).reduce((s, b) => s + b.qty, 0);
                return (
                  <li key={p.id} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', product === p.id ? 'border-brand bg-accent-soft/50' : 'border-line')}>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] font-semibold">{p.sku}</p>
                      <p className="truncate text-xs text-muted">
                        avail {st?.available ?? 0} · in {st?.incoming ?? 0} · ROP {p.reorderPoint}
                        {bo ? ` · BO ${bo}` : ''}
                      </p>
                    </div>
                    <Gate perm="po.manage" compact>
                      <Button size="xs" onClick={() => quickReq(p.id)}>
                        <Plus className="size-3.5" /> PR
                      </Button>
                    </Gate>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Requisitions" actions={<Button size="xs" variant="ghost" onClick={onNew}><Plus className="size-3.5" /> New</Button>}>
          <ul className="space-y-1.5">
            {reqs.slice(0, 12).map((x) => (
              <li key={x.id}>
                <button onClick={() => setSel(x.id)} className={cn('flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left', sel === x.id ? 'border-brand bg-accent-soft/50' : 'border-line hover:bg-surface-2')}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs font-semibold">{x.number}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {x.lines.map((l) => db.products[l.productId]?.sku).join(', ')} · {x.reason}
                    </span>
                  </span>
                  <StatusBadge kind="requisition" status={x.status} />
                </button>
              </li>
            ))}
            {!reqs.length && <li className="text-sm text-muted">No requisitions yet — start from a reorder suggestion.</li>}
          </ul>
        </SectionCard>
      </div>
      <div className="xl:col-span-8" data-tour="compare">
        {!r ? (
          <EmptyState icon={<GitCompare className="size-6" />} title="Select or create a requisition" body="Request simulated quotations from up to three suppliers and compare price, MOQ, lead time and performance." />
        ) : (
          <Compare reqId={r.id} onPo={(id) => nav(`/procurement?tab=pos&id=${id}`)} />
        )}
      </div>
    </div>
  );
}

function Compare({ reqId, onPo }: { reqId: ID; onPo: (id: string) => void }) {
  const db = useDbState();
  const r = db.requisitions[reqId];
  const quotes = r.supplierQuoteIds.map((id) => db.supplierQuotes[id]).filter(Boolean);
  const scored = quotes.map((q) => {
    const s = db.suppliers[q.supplierId];
    const total = r.lines.reduce((t, l) => {
      const ql = q.lines.find((x) => x.productId === l.productId)!;
      return t + roundSen(Math.max(l.qty, ql.moq) * ql.unitCost);
    }, 0);
    const lead = Math.max(...q.lines.map((l) => l.leadTimeDays));
    const compliant = q.lines.every((l) => l.specCompliant);
    const enough = r.lines.every((l) => (q.lines.find((x) => x.productId === l.productId)?.availableQty ?? 0) >= l.qty);
    return { q, s, total, lead, compliant, enough };
  });
  const minTotal = Math.min(...scored.map((x) => x.total));
  const minLead = Math.min(...scored.map((x) => x.lead));
  const rec = [...scored].sort((a, b) => {
    const sa = (a.total / minTotal) * 0.55 + (a.lead / minLead) * 0.25 + (1 - a.s.onTimePct / 100) * 0.2 + (a.compliant ? 0 : 1) + (a.enough ? 0 : 0.3);
    const sb = (b.total / minTotal) * 0.55 + (b.lead / minLead) * 0.25 + (1 - b.s.onTimePct / 100) * 0.2 + (b.compliant ? 0 : 1) + (b.enough ? 0 : 0.3);
    return sa - sb;
  })[0];
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">{r.number}</p>
          <p className="text-xs text-muted">
            {r.reason} · needed by {fmtDate(r.neededBy)} · {r.createdBy}
          </p>
        </div>
        <StatusBadge kind="requisition" status={r.status} />
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {r.lines.map((l) => {
          const p = db.products[l.productId];
          return (
            <li key={l.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
              <span>
                <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name} {p.variantLabel ?? ''}
              </span>
              <span className="tabular font-semibold">
                {l.qty} {p.baseUom}
              </span>
            </li>
          );
        })}
      </ul>
      {quotes.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-line-strong p-5 text-center">
          <p className="text-sm text-muted">No supplier quotations yet.</p>
          <Gate perm="po.manage">
            <Button className="mt-3" onClick={() => act(P.requestSupplierQuotes, { requisitionId: r.id }, { success: (q) => `${q.length} simulated supplier quotations received` })}>
              <Send className="size-4" /> Request quotations from suppliers (simulated)
            </Button>
          </Gate>
        </div>
      ) : (
        <>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Supplier comparison</p>
          <div className="grid gap-3 md:grid-cols-3">
            {scored.map((x, i) => {
              const best = rec?.q.id === x.q.id;
              return (
                <motion.div key={x.q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className={cn('relative rounded-2xl border p-4', x.q.status === 'selected' ? 'border-brand bg-accent-soft/50' : best && r.status === 'quoting' ? 'border-brand/60' : 'border-line')}>
                  {best && r.status === 'quoting' && <Badge tone="green" className="absolute -top-2.5 left-3">Recommended</Badge>}
                  <p className="font-semibold leading-tight">{x.s.name}</p>
                  <p className="text-[11px] text-muted">
                    {x.q.number} · {x.s.currency}
                    {x.s.isImport ? ' import' : ''} · valid {fmtDate(x.q.validUntil)}
                  </p>
                  <p className={cn('tabular mt-3 font-display text-2xl font-bold', x.total === minTotal && 'text-brand')}>{formatRM(x.total)}</p>
                  <div className="mt-2 space-y-1 text-xs">
                    {x.q.lines.map((l) => (
                      <p key={l.productId} className="text-muted">
                        {db.products[l.productId]?.sku}: <b className="text-ink">{formatRM(l.unitCost)}</b> · MOQ {l.moq} · avail {l.availableQty}
                      </p>
                    ))}
                    <KV k="Lead time" v={<span className={x.lead === minLead ? 'text-brand' : ''}>{x.lead} days</span>} />
                    <KV k="On-time (12 mo)" v={`${x.s.onTimePct}%`} />
                    <KV k="Quality score" v={`${x.s.qualityScore.toFixed(1)} / 5`} />
                    <KV k="Spec compliance" v={x.compliant ? <span className="text-brand">Compliant</span> : <span className="text-danger">Alternative offered</span>} />
                    <KV k="Quantity" v={x.enough ? 'Full qty' : <span className="text-warn">Partial availability</span>} />
                  </div>
                  {r.status === 'quoting' && (
                    <Gate perm="po.manage" compact>
                      <Button size="sm" className="mt-3 w-full" variant={best ? 'primary' : 'outline'} onClick={() => { const po = act(P.selectSupplierQuote, { requisitionId: r.id, supplierQuoteId: x.q.id }, { success: (p) => `${p.number} drafted for ${x.s.name}` }); if (po) onPo(po.id); }}>
                        <Check className="size-4" /> Select & draft PO
                      </Button>
                    </Gate>
                  )}
                  {x.q.status === 'selected' && <p className="mt-3 text-xs font-semibold text-brand">Selected</p>}
                </motion.div>
              );
            })}
          </div>
          <DemoNote className="mt-3">Supplier quotations are simulated deterministically from fictional supplier price lists. Recommendation weighs price 55%, lead time 25% and on-time performance 20%.</DemoNote>
          {r.poId && (
            <Button className="mt-3" variant="outline" onClick={() => onPo(r.poId!)}>
              Open {db.purchaseOrders[r.poId]?.number} <ArrowRight className="size-4" />
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// ───────────────────────── POs
function PurchaseOrders() {
  const db = useDbState();
  const now = useNow();
  const [id, setId] = useParam('id');
  const rows = React.useMemo(() => Object.values(db.purchaseOrders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.purchaseOrders]);
  const value = (p: PurchaseOrder) => P.poValue(p);
  const pct = (p: PurchaseOrder) => {
    const t = p.lines.reduce((s, l) => s + l.qty, 0);
    return t ? (p.lines.reduce((s, l) => s + l.received + l.damaged, 0) / t) * 100 : 0;
  };
  const columns = React.useMemo<ColumnDef<PurchaseOrder, unknown>[]>(
    () => [
      { id: 'n', header: 'PO', accessorKey: 'number', cell: (c) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{c.row.original.number}</span> },
      { id: 's', header: 'Supplier', accessorFn: (p) => db.suppliers[p.supplierId]?.name ?? '', cell: (c) => <span className="line-clamp-1">{c.getValue() as string}</span> },
      { id: 'st', header: 'Status', accessorKey: 'status', cell: (c) => <span className="flex items-center gap-1"><StatusBadge kind="po" status={c.row.original.status} />{OPEN_PO.includes(c.row.original.status) && c.row.original.expectedAt < now && <Badge tone="red">late {daysOverdue(c.row.original.expectedAt, now)}d</Badge>}</span> },
      { id: 'lines', header: 'Lines', accessorFn: (p) => p.lines.map((l) => db.products[l.productId]?.sku).join(', '), cell: (c) => <span className="line-clamp-1 max-w-[220px] text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'v', header: 'Value', accessorFn: value, meta: { align: 'right' }, cell: (c) => formatRM(c.getValue() as number) },
      { id: 'rec', header: 'Received', accessorFn: pct, cell: (c) => <div className="w-24"><Progress value={c.getValue() as number} /><span className="text-[10px] text-muted">{(c.getValue() as number).toFixed(0)}%</span></div> },
      { id: 'eta', header: 'Expected', accessorKey: 'expectedAt', cell: (c) => <span className="text-xs">{fmtDate(c.row.original.expectedAt)}</span> },
    ],
    [db.suppliers, db.products, now],
  );
  const sel = id ? db.purchaseOrders[id] : undefined;
  return (
    <div data-tour="po-list">
      <DataTable id="pos" data={rows} columns={columns} getRowId={(p) => p.id} onRowClick={(p) => setId(p.id)} exportName="purchase-orders" minWidth={860} rowClassName={(p) => (p.id === id ? 'bg-accent-soft/50' : undefined)}
        mobileCard={(p) => (
          <div>
            <div className="flex items-center justify-between"><span className="font-mono text-xs font-semibold">{p.number}</span><StatusBadge kind="po" status={p.status} /></div>
            <p className="mt-1 truncate text-sm">{db.suppliers[p.supplierId]?.name}</p>
            <p className="text-xs text-muted">{formatRM(value(p))} · ETA {fmtDate(p.expectedAt)} · {pct(p).toFixed(0)}% received</p>
          </div>
        )}
      />
      <Drawer open={!!sel} onOpenChange={(o) => !o && setId(null)} title={sel?.number ?? ''} subtitle={sel ? db.suppliers[sel.supplierId]?.name : ''} width="max-w-2xl" headerExtra={sel && <div className="mt-2"><StatusBadge kind="po" status={sel.status} /></div>}>
        {sel && <PODetail po={sel} now={now} />}
      </Drawer>
    </div>
  );
}

function PODetail({ po, now }: { po: PurchaseOrder; now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const [grn, setGrn] = React.useState(false);
  const [delay, setDelay] = React.useState(false);
  const s = db.suppliers[po.supplierId];
  const late = OPEN_PO.includes(po.status) && po.expectedAt < now;
  return (
    <div className="space-y-5">
      {late && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft/60 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            Overdue by {daysOverdue(po.expectedAt, now)} days. {po.delayReason ?? po.notes ?? ''}
          </span>
        </div>
      )}
      <div className="grid gap-x-6 text-sm sm:grid-cols-2">
        <KV k="Supplier" v={s?.name} />
        <KV k="Terms" v={`${s?.paymentTermsDays} days · ${s?.currency}`} />
        <KV k="Ordered" v={po.orderedAt ? fmtDate(po.orderedAt) : 'Not sent'} />
        <KV k="Expected" v={fmtDate(po.expectedAt)} />
        <KV k="Value" v={formatRM(P.poValue(po))} />
        <KV k="Created by" v={po.createdBy} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Gate perm="po.manage">
          {po.status === 'draft' && (
            <Button onClick={() => act(P.sendPO, { poId: po.id }, { success: `${po.number} sent (simulated — no email)` })}>
              <Send className="size-4" /> Send to supplier
            </Button>
          )}
          {po.status === 'sent' && (
            <Button variant="outline" onClick={() => act(P.acknowledgePO, { poId: po.id }, { success: 'Supplier acknowledgement recorded' })}>
              <Check className="size-4" /> Record acknowledgement
            </Button>
          )}
          {OPEN_PO.includes(po.status) && (
            <Button variant="outline" onClick={() => setDelay(true)}>
              <Clock className="size-4" /> Update ETA
            </Button>
          )}
        </Gate>
        {OPEN_PO.includes(po.status) && (
          <Gate perm="grn.receive">
            <Button onClick={() => setGrn(true)}>
              <PackageCheck className="size-4" /> Receive goods (GRN)
            </Button>
          </Gate>
        )}
        <Button variant="ghost" onClick={() => void poPdf(getDb(), po)}>
          <Download className="size-4" /> PDF
        </Button>
        <Gate perm="po.manage" fallback={null}>
          {po.status === 'partial' && (
            <Button variant="ghost" onClick={() => act(P.closePO, { poId: po.id, reason: 'Balance short-closed by procurement' }, { success: 'PO short-closed' })}>
              Short-close
            </Button>
          )}
          {['draft', 'sent', 'acknowledged'].includes(po.status) && !po.lines.some((l) => l.received) && (
            <Button variant="ghost" className="text-danger" onClick={() => act(P.cancelPO, { poId: po.id, reason: 'Cancelled by procurement' }, { success: 'PO cancelled' })}>
              <X className="size-4" /> Cancel
            </Button>
          )}
        </Gate>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-2 py-2 text-right">Ordered</th>
              <th className="px-2 py-2 text-right">Received</th>
              <th className="px-2 py-2 text-right">Damaged</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
              <th className="px-3 py-2 text-right">Unit cost</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => {
              const p = db.products[l.productId];
              return (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <span className="font-mono text-[10px] text-muted">{p?.sku}</span>
                    <p>{p?.name} {p?.variantLabel ?? ''}</p>
                  </td>
                  <td className="tabular px-2 py-2 text-right">{l.qty}</td>
                  <td className="tabular px-2 py-2 text-right">{l.received}</td>
                  <td className={cn('tabular px-2 py-2 text-right', l.damaged && 'text-danger')}>{l.damaged}</td>
                  <td className="tabular px-2 py-2 text-right font-semibold">{poOutstanding(l)}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {formatRM(l.unitCost)}
                    {p && l.unitCost !== p.cost && <span className="block text-[10px] text-warn">list basis {formatRM(p.cost)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Goods receipts</p>
        {po.grnIds.length === 0 ? (
          <p className="text-sm text-muted">Nothing received yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {po.grnIds.map((gid) => {
              const g = db.goodsReceipts[gid];
              return (
                <li key={gid} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                  <PackageCheck className="size-4 text-brand" />
                  <span className="flex-1">
                    {g.number} · {fmtDateTime(g.receivedAt)} · {g.lines.reduce((s, l) => s + l.qty, 0)} received{g.lines.some((l) => l.damaged) ? `, ${g.lines.reduce((s, l) => s + l.damaged, 0)} damaged` : ''}
                    {g.costChangeIds.length ? ` · ${g.costChangeIds.length} cost proposal(s)` : ''}
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => nav(`/warehouse?grn=${gid}`)}>
                    <Warehouse className="size-3.5" /> 3D
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {po.notes && <p className="text-xs text-muted">Notes: {po.notes}</p>}
      <GRNModal open={grn} onOpenChange={setGrn} po={po} />
      <DelayModal open={delay} onOpenChange={setDelay} po={po} />
    </div>
  );
}

function GRNModal({ open, onOpenChange, po }: { open: boolean; onOpenChange: (o: boolean) => void; po: PurchaseOrder }) {
  const db = useDbState();
  const nav = useNavigate();
  const bins = Object.values(db.bins).filter((b) => b.kind === 'rack' || b.kind === 'floor');
  const init = () => po.lines.map((l) => ({ poLineId: l.id, qty: String(poOutstanding(l)), damaged: '0', binId: homeBins(db, l.productId)[0] ?? bins[0].id }));
  const [lines, setLines] = React.useState(init);
  const [alloc, setAlloc] = React.useState(true);
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (open) setLines(init());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => {
    const g = act(P.receiveGoods, { poId: po.id, note, allocateBackorders: alloc, lines: lines.map((l) => ({ poLineId: l.poLineId, qty: Number(l.qty) || 0, damaged: Number(l.damaged) || 0, binId: l.binId })) }, { success: (x) => `${x.number} posted${x.allocations.length ? ` · ${x.allocations.length} backorder(s) allocated` : ''}${x.costChangeIds.length ? ` · ${x.costChangeIds.length} cost change(s) proposed` : ''}` });
    if (g) {
      onOpenChange(false);
      toast.message('See the receipt arrive in the 3D warehouse', { action: { label: 'Open 3D', onClick: () => nav(`/warehouse?grn=${g.id}`) } });
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={`Goods receipt · ${po.number}`}
      description="Enter quantities actually received. Partial receipts are fine; damaged units go to quarantine. Cost differences become PROPOSED cost versions for approval."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <PackageCheck className="size-4" /> Post GRN
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {po.lines.map((l, i) => {
          const p = db.products[l.productId];
          const out = poOutstanding(l);
          return (
            <div key={l.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_90px_90px_170px] sm:items-end">
              <div>
                <p className="font-mono text-[11px] text-muted">{p.sku}</p>
                <p className="text-sm font-medium">
                  {p.name} {p.variantLabel ?? ''}
                </p>
                <p className="text-xs text-muted">
                  Outstanding {out} {p.baseUom} · ordered {l.qty}
                </p>
              </div>
              <Field label="Received">
                <Input type="number" min={0} max={out} value={lines[i]?.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="h-9" disabled={out <= 0} />
              </Field>
              <Field label="Damaged">
                <Input type="number" min={0} value={lines[i]?.damaged} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, damaged: e.target.value } : x)))} className="h-9" disabled={out <= 0} />
              </Field>
              <Field label="Put-away bin">
                <Select value={lines[i]?.binId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, binId: e.target.value } : x)))} className="h-9">
                  {homeBins(db, l.productId).map((b) => (
                    <option key={b} value={b}>
                      {db.bins[b].code} (home)
                    </option>
                  ))}
                  {bins
                    .filter((b) => !homeBins(db, l.productId).includes(b.id))
                    .slice(0, 80)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          );
        })}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-[var(--accent)]" checked={alloc} onChange={(e) => setAlloc(e.target.checked)} /> Allocate received stock to open backorders (oldest first)
      </label>
      <Field label="Receiving note" className="mt-3">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Partial delivery — balance next week; 2 bundles scratched" className="min-h-[60px]" />
      </Field>
    </Modal>
  );
}

function DelayModal({ open, onOpenChange, po }: { open: boolean; onOpenChange: (o: boolean) => void; po: PurchaseOrder }) {
  const [date, setDate] = React.useState(addDays(new Date().toISOString(), 4).slice(0, 10));
  const [reason, setReason] = React.useState('Supplier advised revised ETA');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Update ETA · ${po.number}`}
      description="Linked backorders get their promised dates updated."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => act(P.delayPO, { poId: po.id, expectedAt: new Date(`${date}T10:00:00+08:00`).toISOString(), reason }, { success: 'ETA updated' }) !== undefined && onOpenChange(false)}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="New expected date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function NewReqModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDbState();
  const [lines, setLines] = React.useState<{ productId: string; qty: string }[]>([]);
  const [reason, setReason] = React.useState('Stock replenishment');
  React.useEffect(() => {
    if (open) setLines([]);
  }, [open]);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New purchase requisition"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!lines.length} onClick={() => act(P.createRequisition, { lines: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })), reason, sourceType: 'manual' }, { success: (r) => `${r.number} created — request supplier quotes next` }) !== undefined && onOpenChange(false)}>
            Create requisition
          </Button>
        </>
      }
    >
      <ProductSearch onPick={(p) => !lines.some((l) => l.productId === p.id) && setLines([...lines, { productId: p.id, qty: String(p.reorderQty) }])} />
      <div className="mt-3 space-y-2">
        {lines.map((l, i) => {
          const p = db.products[l.productId];
          return (
            <div key={l.productId} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name} {p.variantLabel ?? ''}
              </span>
              <Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="h-9 w-24" aria-label="Quantity" />
              <span className="text-xs text-muted">{p.baseUom}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove">
                <Trash className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
      <Field label="Reason" className="mt-3">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

function NewPOModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDbState();
  const nav = useNavigate();
  const [sup, setSup] = React.useState('s1');
  const [lines, setLines] = React.useState<{ productId: string; qty: string; cost: string }[]>([]);
  React.useEffect(() => {
    if (open) setLines([]);
  }, [open]);
  const s = db.suppliers[sup];
  const total = lines.reduce((t, l) => t + toSen(Number(l.cost)) * (Number(l.qty) || 0), 0);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New purchase order"
      description="Draft POs can be edited by cancelling and recreating; sending is simulated."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!lines.length}
            onClick={() => {
              const po = act(P.createPurchaseOrder, { supplierId: sup, lines: lines.map((l) => ({ productId: l.productId, qty: Number(l.qty), unitCost: toSen(Number(l.cost)) })) }, { success: (p) => `${p.number} drafted` });
              if (po) {
                onOpenChange(false);
                nav(`/procurement?tab=pos&id=${po.id}`);
              }
            }}
          >
            Create draft PO · {formatRM(total)}
          </Button>
        </>
      }
    >
      <Field label="Supplier">
        <Select value={sup} onChange={(e) => setSup(e.target.value)}>
          {Object.values(db.suppliers).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.currency}, {x.leadTimeDays}d lead)
            </option>
          ))}
        </Select>
      </Field>
      <ProductSearch
        className="mt-3"
        filter={(p) => Object.values(db.supplierProducts).some((sp) => sp.supplierId === sup && sp.productId === p.id)}
        placeholder={`Search products supplied by ${s?.name}…`}
        onPick={(p) => {
          const sp = Object.values(db.supplierProducts).find((x) => x.supplierId === sup && x.productId === p.id);
          if (!lines.some((l) => l.productId === p.id)) setLines([...lines, { productId: p.id, qty: String(p.reorderQty), cost: ((sp?.cost ?? p.latestCost) / 100).toFixed(2) }]);
        }}
      />
      <div className="mt-3 space-y-2">
        {lines.map((l, i) => {
          const p = db.products[l.productId];
          return (
            <div key={l.productId} className="grid grid-cols-[minmax(0,1fr)_80px_96px_32px] items-center gap-2 rounded-xl border border-line p-2.5">
              <span className="truncate text-sm">
                <span className="font-mono text-xs text-muted">{p.sku}</span> {p.variantLabel ?? p.name}
              </span>
              <Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="h-9" aria-label="Quantity" />
              <Input type="number" step="0.01" value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} className="h-9" aria-label="Unit cost RM" />
              <Button variant="ghost" size="icon-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove">
                <Trash className="size-4" />
              </Button>
            </div>
          );
        })}
        {lines.length === 0 && <p className="text-sm text-muted">Add products from this supplier's price list.</p>}
      </div>
    </Modal>
  );
}

// ───────────────────────── Receipts
function Receipts() {
  const db = useDbState();
  const nav = useNavigate();
  const now = useNow();
  const rows = Object.values(db.goodsReceipts).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return (
    <Card className="divide-y divide-line">
      {rows.slice(0, 40).map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-3 p-4">
          <PackageCheck className="size-5 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {g.number} <span className="font-normal text-muted">· {db.purchaseOrders[g.poId]?.number} · {db.suppliers[g.supplierId]?.name}</span>
            </p>
            <p className="text-xs text-muted">
              {relTime(g.receivedAt, now)} by {g.receivedBy} · {g.lines.map((l) => `${db.products[l.productId]?.sku} ×${l.qty}${l.damaged ? ` (+${l.damaged} damaged)` : ''} → ${db.bins[l.binId]?.code}`).join(' · ')}
            </p>
          </div>
          {g.lines.some((l) => l.damaged) && <Badge tone="red">Damage quarantined</Badge>}
          {g.allocations.length > 0 && <Badge tone="green">{g.allocations.length} backorder alloc.</Badge>}
          <Button size="sm" variant="outline" onClick={() => nav(`/warehouse?grn=${g.id}`)}>
            <Warehouse className="size-4" /> View in 3D
          </Button>
        </div>
      ))}
      {!rows.length && <EmptyState title="No goods received yet" />}
    </Card>
  );
}

// ───────────────────────── Suppliers
function Suppliers() {
  const db = useDbState();
  const [id, setId] = React.useState<string | null>(null);
  const rows = Object.values(db.suppliers);
  const openValue = (s: Supplier) => Object.values(db.purchaseOrders).filter((p) => p.supplierId === s.id && OPEN_PO.includes(p.status)).reduce((t, p) => t + p.lines.reduce((x, l) => x + roundSen(poOutstanding(l) * l.unitCost), 0), 0);
  const columns = React.useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      { id: 'n', header: 'Supplier', accessorKey: 'name', cell: (c) => <span className="font-medium">{c.row.original.name}</span> },
      { id: 'c', header: 'Code', accessorKey: 'code', cell: (c) => <span className="font-mono text-xs">{c.getValue() as string}</span> },
      { id: 'cats', header: 'Categories', accessorFn: (s) => s.categoryIds.map((x) => db.categories[x]?.name).join(', '), cell: (c) => <span className="line-clamp-1 text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'cur', header: 'Currency', accessorKey: 'currency', cell: (c) => <Badge tone={c.row.original.isImport ? 'orange' : 'neutral'}>{c.row.original.currency}{c.row.original.isImport ? ' import' : ''}</Badge> },
      { id: 'lead', header: 'Lead time', accessorKey: 'leadTimeDays', meta: { align: 'right' }, cell: (c) => `${c.getValue()}d` },
      { id: 'ot', header: 'On-time %', accessorKey: 'onTimePct', meta: { align: 'right' }, cell: (c) => <span className={(c.getValue() as number) < 85 ? 'text-warn' : ''}>{c.getValue() as number}%</span> },
      { id: 'q', header: 'Quality', accessorKey: 'qualityScore', meta: { align: 'right' }, cell: (c) => (c.getValue() as number).toFixed(1) },
      { id: 'open', header: 'Open PO value', accessorFn: openValue, meta: { align: 'right' }, cell: (c) => compactRM(c.getValue() as number) },
    ],
    [db.categories, db.purchaseOrders], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const s = id ? db.suppliers[id] : undefined;
  return (
    <>
      <DataTable id="suppliers" data={rows} columns={columns} getRowId={(r) => r.id} onRowClick={(r) => setId(r.id)} exportName="suppliers" minWidth={860} />
      <Drawer open={!!s} onOpenChange={(o) => !o && setId(null)} title={s?.name ?? ''} subtitle={`${s?.code} · fictional supplier`}>
        {s && (
          <div className="space-y-4 text-sm">
            <div>
              <KV k="Contact" v={s.contactName} />
              <KV k="Phone" v={`${s.phone} (fictional)`} />
              <KV k="Email" v={s.email} />
              <KV k="Address" v={s.address} />
              <KV k="Payment terms" v={`${s.paymentTermsDays} days`} />
              <KV k="Currency" v={s.currency} />
              <KV k="On-time delivery" v={formatPct(s.onTimePct, 0)} />
              <KV k="Quality score" v={`${s.qualityScore} / 5`} />
            </div>
            {s.notes && <DemoNote>{s.notes}</DemoNote>}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Products supplied</p>
              <ul className="space-y-1">
                {Object.values(db.supplierProducts)
                  .filter((sp) => sp.supplierId === s.id)
                  .map((sp) => (
                    <li key={sp.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs">
                      <Link to={`/pricing?sku=${sp.productId}`} className="hover:text-brand">
                        {db.products[sp.productId]?.sku} {db.products[sp.productId]?.variantLabel ?? ''}
                      </Link>
                      <span className="tabular">
                        {formatRM(sp.cost)} · MOQ {sp.moq} · {sp.leadTimeDays}d
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
