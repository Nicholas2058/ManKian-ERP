import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { Picklist } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { createPicklist, pickTask, unpickTask, createDelivery } from '@/domain/commands/fulfilment';
import { useParam } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';
import { Badge, Button, Card, EmptyState, Input, Progress } from '@/components/ui/core';
import { Modal } from '@/components/ui/overlay';
import { Gate } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { ProductArt } from '@/components/art/ProductArt';
import { Check, ClipboardList, MapPin, PackageCheck, RotateCcw, ScanBarcode, Truck, Store, AlertTriangle, ArrowLeft } from '@/components/ui/icons';

export function Picking() {
  const db = useDbState();
  const nav = useNavigate();
  const [plId, setPl] = useParam('pl');
  const ready = Object.values(db.salesOrders).filter((o) => o.status !== 'cancelled' && o.creditStatus !== 'pending_override' && o.lines.some((l) => l.allocated - (l.picked - l.dispatched) > 1e-6) && !Object.values(db.picklists).some((p) => p.orderId === o.id && ['open', 'in_progress'].includes(p.status)));
  const lists = Object.values(db.picklists).filter((p) => ['open', 'in_progress'].includes(p.status) || (p.status === 'completed' && Object.values(db.salesOrders).some((o) => o.id === p.orderId && o.lines.some((l) => l.picked - l.dispatched > 1e-6)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sel = plId ? db.picklists[plId] : undefined;
  if (sel) return <PickRun pl={sel} onBack={() => setPl(null)} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-tour="picking">
      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 font-semibold">
          <ClipboardList className="size-4 text-brand" /> Orders ready to pick ({ready.length})
        </p>
        <ul className="space-y-2">
          {ready.map((o) => (
            <li key={o.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              {o.fulfilment === 'pickup' ? <Store className="size-5 text-info" /> : <Truck className="size-5 text-brand" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {o.number} <span className="font-normal text-muted">· {db.customers[o.customerId]?.name}</span>
                </p>
                <p className="text-xs text-muted">
                  {o.lines.length} lines · {o.fulfilment} · required {fmtDate(o.requiredDate)}
                </p>
              </div>
              <Gate perm="pick" compact>
                <Button size="sm" onClick={() => { const pl = act(createPicklist, { orderId: o.id }, { success: (p) => `${p.number} generated` }); if (pl) setPl(pl.id); }}>
                  Start picking
                </Button>
              </Gate>
            </li>
          ))}
          {!ready.length && <EmptyState title="Nothing waiting" body="Reserve stock on a sales order to make it pickable." />}
        </ul>
      </Card>
      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 font-semibold">
          <PackageCheck className="size-4 text-brand" /> Active picklists
        </p>
        <ul className="space-y-2">
          {lists.map((p) => {
            const o = db.salesOrders[p.orderId];
            const tot = p.tasks.reduce((s, t) => s + t.qty, 0);
            const done = p.tasks.reduce((s, t) => s + t.picked, 0);
            return (
              <li key={p.id}>
                <button onClick={() => setPl(p.id)} className="w-full rounded-xl border border-line p-3 text-left hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {p.number} <span className="font-normal text-muted">· {o?.number} · {db.customers[o?.customerId ?? '']?.name}</span>
                    </span>
                    <StatusBadge kind="picklist" status={p.status} />
                  </div>
                  <Progress value={tot ? (done / tot) * 100 : 0} className="mt-2" />
                  <p className="mt-1 text-[11px] text-muted">
                    {p.tasks.length} bin tasks · {done}/{tot} units · assignee {p.assignee}
                  </p>
                </button>
              </li>
            );
          })}
          {!lists.length && <p className="text-sm text-muted">No active picklists.</p>}
        </ul>
      </Card>
      <p className="text-xs text-muted lg:col-span-2">
        Picking moves goods from the bin to dispatch staging. They remain on hand and reserved until dispatched; reversing a pick restores them to the original bin.
      </p>
    </div>
  );
}

function PickRun({ pl, onBack }: { pl: Picklist; onBack: () => void }) {
  const db = useDbState();
  const nav = useNavigate();
  const o = db.salesOrders[pl.orderId];
  const [scan, setScan] = React.useState('');
  const [short, setShort] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);
  const tot = pl.tasks.reduce((s, t) => s + t.qty, 0);
  const done = pl.tasks.reduce((s, t) => s + t.picked, 0);
  const staged = o.lines.some((l) => l.picked - l.dispatched > 1e-6);
  const committed = Object.values(db.deliveryOrders).some((d) => d.orderId === o.id && ['packed', 'scheduled', 'ready_for_collection'].includes(d.status));
  const onScan = () => {
    const v = scan.trim();
    if (!v) return toast.error('No barcode captured — scan or type a barcode/SKU first');
    const task = pl.tasks.find((t) => t.status === 'open' && (db.products[t.productId]?.barcode === v || db.products[t.productId]?.sku.toLowerCase() === v.toLowerCase() || db.bins[t.binId]?.code.toLowerCase() === v.toLowerCase()));
    if (!task) {
      setScan('');
      return toast.error(`"${v}" does not match any open task on ${pl.number}`);
    }
    act(pickTask, { picklistId: pl.id, taskId: task.id, qty: task.qty - task.picked }, { success: `Picked ${task.qty - task.picked} × ${db.products[task.productId].sku} from ${db.bins[task.binId].code}` });
    setFlash(task.id);
    setScan('');
  };
  return (
    <div className="mx-auto max-w-2xl space-y-3" data-tour="picking">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Picklists
        </Button>
        <span className="flex-1" />
        <StatusBadge kind="picklist" status={pl.status} />
      </div>
      <Card className="p-4">
        <p className="font-display text-lg font-bold">{pl.number}</p>
        <p className="text-sm text-muted">
          {o.number} · {db.customers[o.customerId]?.name} · {o.fulfilment === 'pickup' ? 'Self-pickup' : 'Delivery'}
        </p>
        <Progress value={tot ? (done / tot) * 100 : 0} className="mt-3 h-2.5" />
        <p className="tabular mt-1 text-xs text-muted">
          {done} of {tot} units picked
        </p>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
            <Input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onScan()} placeholder="Scan / type barcode, SKU or bin code" className="h-12 pl-10 text-base" aria-label="Scan input" />
          </div>
          <Button size="lg" onClick={onScan}>
            Confirm
          </Button>
        </div>
      </Card>
      <AnimatePresence initial={false}>
        {pl.tasks.map((t) => {
          const p = db.products[t.productId];
          const b = db.bins[t.binId];
          const remaining = t.qty - t.picked;
          return (
            <motion.div key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-2xl border p-4 transition-colors', t.status === 'picked' ? 'border-accent/40 bg-accent-soft/40' : t.status === 'short' ? 'border-warn/50 bg-warn-soft/40' : 'border-line bg-surface', flash === t.id && 'flash')}>
              <div className="flex items-start gap-3">
                <div className="h-14 w-16 shrink-0 overflow-hidden rounded-xl border border-line">
                  <ProductArt art={p.art} sku={p.sku} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-display text-xl font-extrabold text-brand">
                    <MapPin className="size-5" /> {b.code}
                  </p>
                  <p className="text-sm font-medium">
                    {p.name} {p.variantLabel ?? ''}
                  </p>
                  <p className="text-xs text-muted">
                    <span className="font-mono">{p.sku}</span> · barcode {p.barcode}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular font-display text-2xl font-bold">
                    {t.picked}/{t.qty}
                  </p>
                  <p className="text-xs text-muted">{p.baseUom}</p>
                </div>
              </div>
              {t.discrepancy && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
                  <AlertTriangle className="size-3.5" /> {t.discrepancy}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {t.status === 'open' && (
                  <Gate perm="pick">
                    <Button size="lg" className="flex-1" onClick={() => { act(pickTask, { picklistId: pl.id, taskId: t.id, qty: remaining }, { success: `Picked ${remaining} × ${p.sku}` }); setFlash(t.id); }}>
                      <Check className="size-5" /> Pick {remaining}
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => setShort(t.id)}>
                      Short / partial
                    </Button>
                  </Gate>
                )}
                {t.picked > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => act(unpickTask, { picklistId: pl.id, taskId: t.id, qty: t.picked, reason: 'Pick reversed by user' }, { success: `Returned ${t.picked} to ${b.code}` })}>
                    <RotateCcw className="size-4" /> Reverse pick
                  </Button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {staged && !committed && (
        <Card className="sticky bottom-20 border-brand/40 p-4 shadow-[var(--shadow-lift)] lg:bottom-4">
          <p className="text-sm font-semibold">Picked goods are in dispatch staging</p>
          <p className="text-xs text-muted">Pack them into a {o.fulfilment === 'pickup' ? 'collection with a pickup token' : 'delivery order'} (partial shipments allowed).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Gate perm="dispatch">
              <Button onClick={() => { const d = act(createDelivery, { orderId: o.id, type: 'delivery' }, { success: (x) => `${x.number} packed` }); if (d) nav(`/delivery?id=${d.id}`); }}>
                <Truck className="size-4" /> Pack as delivery
              </Button>
              <Button variant="outline" onClick={() => { const d = act(createDelivery, { orderId: o.id, type: 'pickup' }, { success: (x) => `${x.number} ready — token ${x.pickupToken}` }); if (d) nav(`/delivery?id=${d.id}`); }}>
                <Store className="size-4" /> Ready for self-pickup
              </Button>
            </Gate>
          </div>
          {o.fulfilment === 'pickup' && <Badge tone="blue" className="mt-2">Customer chose self-pickup</Badge>}
        </Card>
      )}
      <ShortModal pl={pl} taskId={short} onClose={() => setShort(null)} />
    </div>
  );
}

function ShortModal({ pl, taskId, onClose }: { pl: Picklist; taskId: string | null; onClose: () => void }) {
  const db = useDbState();
  const t = pl.tasks.find((x) => x.id === taskId);
  const [qty, setQty] = React.useState('0');
  const [reason, setReason] = React.useState('Bin count lower than system');
  React.useEffect(() => {
    setQty('0');
  }, [taskId]);
  if (!t) return null;
  return (
    <Modal
      open={!!taskId}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={`Short pick · ${db.bins[t.binId].code}`}
      description="Record what was actually found. A discrepancy alert is raised for the supervisor — stock is not silently adjusted."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => act(pickTask, { picklistId: pl.id, taskId: t.id, qty: Number(qty), shortReason: reason }, { success: 'Short pick recorded' }) !== undefined && onClose()}>Record</Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-xs font-semibold">
          Quantity actually picked (max {t.qty - t.picked})
          <Input type="number" min={0} max={t.qty - t.picked} value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-xs font-semibold">
          Reason
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
        </label>
      </div>
    </Modal>
  );
}
