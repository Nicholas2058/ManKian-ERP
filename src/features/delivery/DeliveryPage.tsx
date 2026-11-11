import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import type { DeliveryOrder, ID } from '@/domain/types';
import { useDbState, getDb } from '@/store/db';
import { act } from '@/lib/act';
import * as F from '@/domain/commands/fulfilment';
import { useNow, useParam } from '@/lib/hooks';
import { addDays, dayKey, fmtDate, fmtDateTime, fmtTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { deliveryPdf } from '@/services/pdf';
import { Badge, Button, Card, EmptyState, Field, Input, Progress, Select, Textarea } from '@/components/ui/core';
import { Drawer, Modal, Segmented } from '@/components/ui/overlay';
import { PageHeader, Gate, KV, DemoNote, useMotionOK } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { Camera, Check, Download, MapPin, Navigation, PackageCheck, Route, Signature, Store, Truck, X, AlertTriangle, Phone, Clock } from '@/components/ui/icons';

const LANES: { key: string; label: string; match: (d: DeliveryOrder, today: string) => boolean }[] = [
  { key: 'packed', label: 'Packed', match: (d) => d.type === 'delivery' && d.status === 'packed' },
  { key: 'scheduled', label: 'Load scheduled', match: (d) => d.type === 'delivery' && d.status === 'scheduled' },
  { key: 'out', label: 'Out for delivery', match: (d) => d.status === 'out_for_delivery' },
  { key: 'exception', label: 'Exceptions', match: (d) => d.status === 'failed' },
  { key: 'done', label: 'Delivered today', match: (d, t) => d.status === 'delivered' && !!d.completedAt && dayKey(d.completedAt) === t },
];
const PICKUP: { key: string; label: string; match: (d: DeliveryOrder, today: string) => boolean }[] = [
  { key: 'ready', label: 'Ready for collection', match: (d) => d.type === 'pickup' && d.status === 'ready_for_collection' },
  { key: 'collected', label: 'Collected today', match: (d, t) => d.status === 'collected' && !!d.completedAt && dayKey(d.completedAt) === t },
];

export default function DeliveryPage() {
  const db = useDbState();
  const now = useNow();
  const today = dayKey(now);
  const [id, setId] = useParam('id');
  const [orderParam, setOrderParam] = useParam('order');
  const [newP, setNewP] = useParam('new');
  const [pack, setPack] = React.useState<string | null>(null);
  const [driver, setDriver] = React.useState(false);
  React.useEffect(() => {
    if (orderParam) {
      setPack(orderParam);
      setOrderParam(null);
    }
    if (newP) {
      setPack('');
      setNewP(null);
    }
  }, [orderParam, newP, setOrderParam, setNewP]);
  const dos = Object.values(db.deliveryOrders);
  const staged = Object.values(db.salesOrders).filter((o) => o.status !== 'cancelled' && o.lines.some((l) => l.picked - l.dispatched > 1e-6) && !dos.some((d) => d.orderId === o.id && ['packed', 'scheduled', 'ready_for_collection', 'failed'].includes(d.status)));
  const sel = id ? db.deliveryOrders[id] : undefined;
  return (
    <div>
      <PageHeader
        title="Delivery & Self-Pickup Center"
        subtitle="Dispatch board, vehicle loads, simulated route progress and proof of delivery. Vehicles and drivers are fictional; no GPS tracking."
        actions={
          <>
            <Segmented id="drv" value={driver ? 'driver' : 'board'} onChange={(v) => setDriver(v === 'driver')} options={[{ value: 'board', label: 'Dispatcher' }, { value: 'driver', label: 'Driver (mobile)' }]} />
          </>
        }
      />
      {driver ? (
        <DriverView onOpen={setId} />
      ) : (
        <div className="space-y-5" data-tour="delivery-page">
          {staged.length > 0 && (
            <Card className="flex flex-wrap items-center gap-3 border-brand/30 bg-accent-soft/40 p-4">
              <PackageCheck className="size-5 text-brand" />
              <p className="flex-1 text-sm">
                <b>{staged.length}</b> order(s) have picked goods waiting in staging: {staged.slice(0, 4).map((o) => o.number).join(', ')}
              </p>
              <Gate perm="dispatch">
                <Button size="sm" onClick={() => setPack(staged[0].id)}>
                  Pack next
                </Button>
              </Gate>
            </Card>
          )}
          <div data-tour="dispatch-board" className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0">
            {LANES.map((lane) => (
              <Lane key={lane.key} label={lane.label} list={dos.filter((d) => lane.match(d, today))} onOpen={setId} tone={lane.key === 'exception' ? 'red' : undefined} />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Store className="size-4 text-info" /> Self-pickup
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {PICKUP.map((lane) => (
                  <Lane key={lane.key} fluid label={lane.label} list={dos.filter((d) => lane.match(d, today))} onOpen={setId} />
                ))}
              </div>
            </div>
            <div className="space-y-4 lg:col-span-7">
              <Loads now={now} />
              <RegionDiagram />
            </div>
          </div>
        </div>
      )}
      <Drawer open={!!sel} onOpenChange={(o) => !o && setId(null)} title={sel?.number ?? ''} subtitle={sel ? `${db.customers[sel.customerId]?.name} · ${db.salesOrders[sel.orderId]?.number}` : ''} headerExtra={sel && <div className="mt-2"><StatusBadge kind="delivery" status={sel.status} /></div>}>
        {sel && <DODetail d={sel} now={now} />}
      </Drawer>
      <PackModal orderId={pack} onClose={() => setPack(null)} onDone={(did) => setId(did)} />
    </div>
  );
}

function Lane({ label, list, onOpen, tone, fluid }: { label: string; list: DeliveryOrder[]; onOpen: (id: string) => void; tone?: 'red'; fluid?: boolean }) {
  const db = useDbState();
  const ok = useMotionOK();
  return (
    <div className={cn('min-w-0 rounded-2xl border bg-surface-2 p-2', fluid ? 'w-auto' : 'w-[78vw] max-w-[280px] shrink-0 snap-start lg:w-auto lg:max-w-none', tone === 'red' && list.length ? 'border-danger/40' : 'border-line')}>
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <p className="text-xs font-semibold">{label}</p>
        <span className="tabular rounded-full bg-surface px-2 text-[11px] font-semibold text-muted ring-1 ring-line">{list.length}</span>
      </div>
      <div className="scrollbar-thin max-h-[48vh] space-y-2 overflow-y-auto">
        {list.map((d, i) => (
          <motion.button key={d.id} layout initial={ok ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: ok ? i * 0.03 : 0 }} onClick={() => onOpen(d.id)} className="w-full rounded-xl border border-line bg-surface p-3 text-left shadow-sm hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold">{d.number}</span>
              {d.type === 'pickup' ? <Store className="size-3.5 text-info" /> : <Truck className="size-3.5 text-brand" />}
            </div>
            <p className="mt-1 line-clamp-1 text-sm font-medium">{db.customers[d.customerId]?.name}</p>
            <p className="text-xs text-muted">
              {d.lines.length} lines · {d.weightKg} kg
              {d.vehicleId ? ` · ${db.vehicles[d.vehicleId]?.type}` : ''}
            </p>
            {d.status === 'out_for_delivery' && <Progress className="mt-2" value={(d.progress.filter((p) => p.label.includes('simulated')).length / 3) * 100} tone="amber" />}
            {d.failReason && <p className="mt-1 text-[11px] text-danger">{d.failReason}</p>}
            {d.pickupToken && d.status === 'ready_for_collection' && <p className="mt-1 font-mono text-[11px] text-info">Token {d.pickupToken}</p>}
          </motion.button>
        ))}
        {!list.length && <p className="px-2 py-5 text-center text-xs text-muted">None</p>}
      </div>
    </div>
  );
}

function Loads({ now }: { now: string }) {
  const db = useDbState();
  const day = dayKey(now);
  return (
    <Card className="p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Truck className="size-4 text-brand" /> Vehicle loads today (recorded weights)
      </p>
      <div className="space-y-3">
        {Object.values(db.vehicles).map((v) => {
          const list = Object.values(db.deliveryOrders).filter((d) => d.vehicleId === v.id && dayKey(d.scheduledDate) === day && ['scheduled', 'out_for_delivery', 'delivered'].includes(d.status));
          const kg = list.reduce((s, d) => s + d.weightKg, 0);
          const pct = (kg / v.capacityKg) * 100;
          const drv = Object.values(db.drivers).find((x) => x.vehicleId === v.id);
          return (
            <div key={v.id}>
              <div className="flex justify-between text-xs">
                <span className="font-medium">
                  {v.plate} <span className="text-muted">· {drv?.name}</span>
                </span>
                <span className="tabular text-muted">
                  {kg} / {v.capacityKg} kg · {list.length} drop(s)
                </span>
              </div>
              <Progress value={pct} className="mt-1" tone={pct > 90 ? 'red' : pct > 70 ? 'amber' : 'green'} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Self-contained schematic of the service area — no third-party map tiles. */
function RegionDiagram() {
  const db = useDbState();
  const towns: Record<string, [number, number]> = {
    Puchong: [50, 55], 'Subang Jaya': [38, 40], 'Shah Alam': [22, 38], 'Petaling Jaya': [48, 30], Cyberjaya: [56, 75], 'Seri Kembangan': [62, 52], Klang: [10, 48], Kajang: [78, 58], Bangi: [74, 78], Putrajaya: [60, 86], Semenyih: [88, 70], 'Kuala Lumpur': [60, 22],
  };
  const out = Object.values(db.deliveryOrders).filter((d) => d.status === 'out_for_delivery' || d.status === 'scheduled');
  const stops = out.map((d) => {
    const c = db.customers[d.customerId];
    const town = Object.keys(towns).find((t) => (c?.sites.find((s) => s.id === d.siteId)?.address ?? c?.billingAddress ?? '').includes(t)) ?? 'Puchong';
    return { d, town, xy: towns[town] };
  });
  const wh = towns.Puchong;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Route className="size-4 text-brand" /> Service area schematic
        </p>
        <Badge tone="amber">Simulated · not to scale</Badge>
      </div>
      <svg viewBox="0 0 100 100" className="mt-2 aspect-[16/9] w-full rounded-xl bg-surface-2" role="img" aria-label="Schematic of delivery stops around Puchong">
        <path d="M5 60 Q30 45 50 55 T95 62" stroke="var(--line-strong)" strokeWidth="1.2" fill="none" />
        <path d="M48 10 Q52 50 58 95" stroke="var(--line-strong)" strokeWidth="1.2" fill="none" />
        {Object.entries(towns).map(([t, [x, y]]) => (
          <g key={t}>
            <circle cx={x} cy={y} r={1.1} fill="var(--muted)" />
            <text x={x + 1.8} y={y + 1} fontSize={2.6} fill="var(--muted)">
              {t}
            </text>
          </g>
        ))}
        {stops.map(({ d, xy }) => (
          <g key={d.id}>
            <line x1={wh[0]} y1={wh[1]} x2={xy[0]} y2={xy[1]} stroke={d.status === 'out_for_delivery' ? 'var(--orange)' : 'var(--info)'} strokeWidth={0.7} strokeDasharray="1.5 1" />
            <circle cx={xy[0]} cy={xy[1]} r={2} fill={d.status === 'out_for_delivery' ? 'var(--orange)' : 'var(--info)'}>
              <title>{`${d.number} · ${db.customers[d.customerId]?.name}`}</title>
            </circle>
          </g>
        ))}
        <rect x={wh[0] - 2.5} y={wh[1] - 2.5} width={5} height={5} rx={1} fill="var(--brand)" />
      </svg>
      <p className="mt-2 text-[11px] text-muted">Orange = out for delivery, blue = scheduled. Optional MapLibre maps need a licensed tile provider (see DEPLOYMENT.md).</p>
    </Card>
  );
}

function DODetail({ d, now }: { d: DeliveryOrder; now: string }) {
  const db = useDbState();
  const [sched, setSched] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [fail, setFail] = React.useState(false);
  const [collect, setCollect] = React.useState(false);
  const c = db.customers[d.customerId];
  const site = c?.sites.find((s) => s.id === d.siteId);
  const o = db.salesOrders[d.orderId];
  return (
    <div className="space-y-5">
      <div className="grid gap-x-6 text-sm sm:grid-cols-2">
        <KV k="Customer" v={c?.name} />
        <KV k="Order" v={<Link to={`/orders?id=${o?.id}`} className="hover:text-brand">{o?.number}</Link>} />
        <KV k={d.type === 'pickup' ? 'Collection' : 'Deliver to'} v={d.type === 'pickup' ? 'Counter / pickup bay' : site?.name ?? c?.billingAddress} />
        <KV k="Scheduled" v={fmtDateTime(d.scheduledDate)} />
        <KV k="Vehicle" v={d.vehicleId ? db.vehicles[d.vehicleId]?.plate : '—'} />
        <KV k="Driver" v={d.driverId ? db.drivers[d.driverId]?.name : '—'} />
        <KV k="Weight" v={`${d.weightKg} kg`} />
        <KV k="Promised" v={fmtDate(d.promisedDate)} />
        {d.pickupToken && <KV k="Pickup token" v={<span className="font-mono">{d.pickupToken}</span>} />}
      </div>
      {site && d.type === 'delivery' && <p className="flex items-start gap-1.5 text-xs text-muted"><MapPin className="mt-0.5 size-3.5" /> {site.address} (fictional)</p>}
      <div className="flex flex-wrap gap-2">
        {(d.status === 'packed' || d.status === 'failed') && d.type === 'delivery' && (
          <Gate perm="dispatch">
            <Button onClick={() => setSched(true)}>
              <Truck className="size-4" /> {d.status === 'failed' ? 'Reschedule' : 'Schedule load'}
            </Button>
          </Gate>
        )}
        {d.status === 'scheduled' && (
          <Gate perm="dispatch">
            <Button onClick={() => act(F.dispatchDelivery, { doId: d.id }, { success: `${d.number} dispatched — stock issued from staging` })}>
              <Navigation className="size-4" /> Dispatch
            </Button>
          </Gate>
        )}
        {d.status === 'out_for_delivery' && (
          <>
            <Button variant="outline" onClick={() => act(F.advanceRoute, { doId: d.id }, { success: 'Route progress updated (simulated)' })}>
              <Route className="size-4" /> Advance route (simulated)
            </Button>
            <Gate perm="delivery.confirm">
              <Button onClick={() => setConfirm(true)}>
                <Signature className="size-4" /> Confirm delivery
              </Button>
              <Button variant="ghost" className="text-danger" onClick={() => setFail(true)}>
                <AlertTriangle className="size-4" /> Report exception
              </Button>
            </Gate>
          </>
        )}
        {d.status === 'ready_for_collection' && (
          <Gate perm="dispatch">
            <Button onClick={() => setCollect(true)}>
              <Check className="size-4" /> Verify token & hand over
            </Button>
          </Gate>
        )}
        <Button variant="outline" onClick={() => void deliveryPdf(getDb(), d)}>
          <Download className="size-4" /> {d.type === 'pickup' ? 'Collection note' : 'DO'} PDF
        </Button>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Items</p>
        <ul className="space-y-1 text-sm">
          {d.lines.map((l) => {
            const p = db.products[l.productId];
            return (
              <li key={l.lineId} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5">
                <span>
                  <span className="font-mono text-xs text-muted">{p?.sku}</span> {p?.name} {p?.variantLabel ?? ''}
                </span>
                <span className="tabular font-semibold">
                  {l.qty} {p?.baseUom}
                </span>
              </li>
            );
          })}
        </ul>
        {o && o.lines.some((l) => l.qtyBase > l.dispatched + (d.status === 'out_for_delivery' || d.status === 'delivered' ? 0 : l.picked - l.dispatched)) && <p className="mt-1 text-xs text-warn">Partial shipment — the order has more to follow.</p>}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Progress</p>
        <ol className="space-y-2">
          {d.progress.map((p, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', i === d.progress.length - 1 ? 'bg-accent ring-4 ring-accent/20' : 'bg-line-strong')} />
              <span className="flex-1">{p.label}</span>
              <span className="text-xs text-muted">{fmtTime(p.at)}</span>
            </li>
          ))}
        </ol>
      </div>
      {d.pod && (
        <div className="rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-sm">
          <p className="font-semibold text-accent-ink">Proof of {d.type === 'pickup' ? 'collection' : 'delivery'}</p>
          <p>
            Received by <b>{d.pod.signedName}</b> at {fmtDateTime(d.pod.at)}
          </p>
          {d.pod.note && <p className="text-xs text-muted">{d.pod.note}</p>}
          {d.pod.photo && <img src={d.pod.photo} alt="Proof of delivery" className="mt-2 max-h-40 rounded-lg border border-line" />}
        </div>
      )}
      {d.invoiceId && (
        <p className="text-xs text-muted">
          Invoice <Link className="text-brand hover:underline" to={`/finance?tab=invoices&id=${d.invoiceId}`}>{db.invoices[d.invoiceId]?.number}</Link> issued automatically (configured workflow).
        </p>
      )}
      <ScheduleModal open={sched} onOpenChange={setSched} d={d} now={now} />
      <ConfirmModal open={confirm} onOpenChange={setConfirm} d={d} />
      <FailModal open={fail} onOpenChange={setFail} d={d} />
      <CollectModal open={collect} onOpenChange={setCollect} d={d} />
    </div>
  );
}

function ScheduleModal({ open, onOpenChange, d, now }: { open: boolean; onOpenChange: (o: boolean) => void; d: DeliveryOrder; now: string }) {
  const db = useDbState();
  const vehicles = Object.values(db.vehicles);
  const [veh, setVeh] = React.useState(vehicles.find((v) => v.capacityKg >= d.weightKg)?.id ?? vehicles[0].id);
  const [date, setDate] = React.useState(dayKey(now));
  const drv = Object.values(db.drivers).find((x) => x.vehicleId === veh);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={`Schedule ${d.number}`} description={`${d.weightKg} kg recorded weight. Capacity is checked against loads already on the vehicle that day.`} footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => act(F.scheduleDelivery, { doId: d.id, vehicleId: veh, driverId: drv!.id, date: new Date(`${date}T10:00:00+08:00`).toISOString() }, { success: 'Load scheduled' }) !== undefined && onOpenChange(false)}>Schedule</Button></>}>
      <div className="space-y-3">
        <Field label="Vehicle">
          <Select value={veh} onChange={(e) => setVeh(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.capacityKg} kg
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Driver" hint="Assigned to the vehicle (fictional)">
          <Input value={drv?.name ?? ''} disabled />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} min={dayKey(now)} max={dayKey(addDays(now, 14))} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r, j) => {
    img.onload = r;
    img.onerror = j;
    img.src = url;
  });
  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.7);
}

function ConfirmModal({ open, onOpenChange, d }: { open: boolean; onOpenChange: (o: boolean) => void; d: DeliveryOrder }) {
  const db = useDbState();
  const [name, setName] = React.useState(db.customers[d.customerId]?.contacts[0]?.name ?? '');
  const [note, setNote] = React.useState('');
  const [photo, setPhoto] = React.useState<string>();
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Confirm delivery (proof of delivery)" description="Typed signature, timestamp and an optional photo are stored with the DO." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={name.trim().length < 2} onClick={() => act(F.confirmDelivery, { doId: d.id, signedName: name, note: note || undefined, photo }, { success: 'Delivered — POD recorded and invoice issued' }) !== undefined && onOpenChange(false)}><Check className="size-4" /> Confirm</Button></>}>
      <div className="space-y-3">
        <Field label="Received by (typed signature)" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="font-[cursive] text-lg" />
        </Field>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Left at site store; 1 bundle checked" className="min-h-[60px]" />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong p-3 text-sm hover:bg-surface-2">
          <Camera className="size-5 text-muted" /> {photo ? 'Photo attached — tap to replace' : 'Attach photo (optional)'}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await compressImage(f)); } catch { toast.error('Could not read that image'); } } }} />
        </label>
        {photo && <img src={photo} alt="Attached proof" className="max-h-40 rounded-lg" />}
      </div>
    </Modal>
  );
}

function FailModal({ open, onOpenChange, d }: { open: boolean; onOpenChange: (o: boolean) => void; d: DeliveryOrder }) {
  const [reason, setReason] = React.useState('Site closed — no receiver on site');
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title="Report delivery exception" description="Goods return to dispatch staging and stay reserved for this order." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="danger" onClick={() => act(F.failDelivery, { doId: d.id, reason }, { success: 'Exception recorded — reschedule from the board' }) !== undefined && onOpenChange(false)}>Record failed delivery</Button></>}>
      <Field label="Reason">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {['Site closed — no receiver on site', 'Access road blocked at site', 'Customer requested a later slot', 'Wrong delivery address', 'Goods refused — specification query'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

function CollectModal({ open, onOpenChange, d }: { open: boolean; onOpenChange: (o: boolean) => void; d: DeliveryOrder }) {
  const [token, setToken] = React.useState('');
  const [name, setName] = React.useState('');
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title="Self-pickup verification" description="Ask the customer for the collection token on their order confirmation." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!token || name.trim().length < 2} onClick={() => act(F.collectPickup, { doId: d.id, token, signedName: name }, { success: 'Collected — stock issued and invoice created' }) !== undefined && onOpenChange(false)}>Hand over goods</Button></>}>
      <div className="space-y-3">
        <Field label="Collection token" hint={`Demo hint: ${d.pickupToken}`}>
          <Input value={token} onChange={(e) => setToken(e.target.value)} className="font-mono uppercase" autoFocus />
        </Field>
        <Field label="Collected by (name)">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function PackModal({ orderId, onClose, onDone }: { orderId: string | null; onClose: () => void; onDone: (id: ID) => void }) {
  const db = useDbState();
  const candidates = Object.values(db.salesOrders).filter((o) => o.lines.some((l) => l.picked - l.dispatched > 1e-6));
  const [sel, setSel] = React.useState('');
  React.useEffect(() => setSel(orderId || candidates[0]?.id || ''), [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  const o = db.salesOrders[sel];
  const [type, setType] = React.useState<'delivery' | 'pickup'>('delivery');
  React.useEffect(() => {
    if (o) setType(o.fulfilment);
  }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={orderId !== null} onOpenChange={(v) => !v && onClose()} title="Create delivery order / collection" description="Packs whatever is picked and staged. Remaining quantities ship later as a separate partial delivery." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!o} onClick={() => { const d = act(F.createDelivery, { orderId: sel, type }, { success: (x) => `${x.number} ${x.type === 'pickup' ? `ready — token ${x.pickupToken}` : 'packed'}` }); if (d) { onClose(); onDone(d.id); } }}>Create</Button></>}>
      {candidates.length === 0 ? (
        <EmptyState title="Nothing staged" body="Pick an order first (Inventory → Picking)." />
      ) : (
        <div className="space-y-3">
          <Field label="Order with staged goods">
            <Select value={sel} onChange={(e) => setSel(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {db.customers[c.customerId]?.name}
                </option>
              ))}
            </Select>
          </Field>
          <Segmented id="pk-type" value={type} onChange={setType} options={[{ value: 'delivery', label: 'Delivery' }, { value: 'pickup', label: 'Self-pickup' }]} />
          {o && (
            <ul className="space-y-1 text-xs">
              {o.lines.filter((l) => l.picked - l.dispatched > 0).map((l) => (
                <li key={l.id} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5">
                  <span>{l.description}</span>
                  <span className="tabular">{l.picked - l.dispatched} staged</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function DriverView({ onOpen }: { onOpen: (id: string) => void }) {
  const db = useDbState();
  const [drv, setDrv] = React.useState('d1');
  const stops = Object.values(db.deliveryOrders).filter((d) => d.driverId === drv && ['scheduled', 'out_for_delivery'].includes(d.status)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return (
    <div className="mx-auto max-w-md space-y-3">
      <DemoNote>Driver view — designed for a phone. Route progress is simulated; there is no GPS tracking.</DemoNote>
      <Select value={drv} onChange={(e) => setDrv(e.target.value)} aria-label="Driver">
        {Object.values(db.drivers).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} · {db.vehicles[d.vehicleId]?.plate}
          </option>
        ))}
      </Select>
      {stops.length === 0 && <EmptyState icon={<Truck className="size-6" />} title="No stops assigned" body="Schedule a packed DO on this driver's vehicle from the dispatcher board." />}
      {stops.map((d, i) => {
        const c = db.customers[d.customerId];
        const site = c?.sites.find((s) => s.id === d.siteId);
        return (
          <Card key={d.id} className="p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-brand font-bold text-white dark:text-forest-950">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c?.name}</p>
                <p className="truncate text-xs text-muted">{site?.address ?? c?.billingAddress}</p>
              </div>
              <StatusBadge kind="delivery" status={d.status} />
            </div>
            <div className="mt-3 flex gap-2 text-xs text-muted">
              <span className="flex items-center gap-1"><PackageCheck className="size-3.5" /> {d.lines.length} items · {d.weightKg} kg</span>
              <span className="flex items-center gap-1"><Phone className="size-3.5" /> {c?.contacts[0]?.phone} (fictional)</span>
              <span className="flex items-center gap-1"><Clock className="size-3.5" /> {fmtTime(d.scheduledDate)}</span>
            </div>
            <Button size="lg" className="mt-3 w-full" onClick={() => onOpen(d.id)}>
              Stop details & confirm
            </Button>
          </Card>
        );
      })}
    </div>
  );
}
