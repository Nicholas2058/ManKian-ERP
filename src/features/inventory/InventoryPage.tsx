import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import type { InventoryMovement, Product } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { createRequisition } from '@/domain/commands/procurement';
import { stockIndex, type StockSummary } from '@/domain/inventory';
import { breakdown } from '@/domain/uom';
import { useNow, useParam } from '@/lib/hooks';
import { formatRM, compactRM, roundSen } from '@/lib/money';
import { fmtDateTime, daysBetween, relTime, addDays } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Input, Select } from '@/components/ui/core';
import { Drawer, Tabs, TabPanel } from '@/components/ui/overlay';
import { PageHeader, Gate, KpiTile, KV, SectionCard, fmtCompact, fmtInt, DemoNote } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { ProductArt } from '@/components/art/ProductArt';
import { Boxes, ClipboardList, Logs, ScanBarcode, SlidersHorizontal, AlertTriangle, PackageOpen, Camera, ArrowLeftRight, Shield, Undo2, Plus, Warehouse, Search } from '@/components/ui/icons';
import { Picking } from './Picking';
import { AdjustModal, QuarantineModal, ReturnModal, TransferModal } from './StockDialogs';

interface Row {
  p: Product;
  s: StockSummary;
  value: number;
  ageDays: number;
  sold60: number;
  status: 'out' | 'low' | 'ok' | 'slow';
}

export default function InventoryPage() {
  const db = useDbState();
  const now = useNow();
  const [tab, setTab] = useParam('tab');
  const [newP, setNewP] = useParam('new');
  const [id, setId] = useParam('id');
  const [adj, setAdj] = React.useState(false);
  const [ret, setRet] = React.useState(false);
  React.useEffect(() => {
    if (newP === 'adjust') setAdj(true);
    if (newP) setNewP(null);
  }, [newP, setNewP]);
  const rows = React.useMemo<Row[]>(() => {
    const idx = stockIndex(db);
    const sold: Record<string, number> = {};
    const cutoff = addDays(now, -60);
    for (const m of Object.values(db.movements)) if ((m.type === 'dispatch' || m.type === 'pos_sale') && m.at >= cutoff) sold[m.productId] = (sold[m.productId] ?? 0) + m.moved;
    const oldest: Record<string, string> = {};
    for (const b of Object.values(db.binStock)) if (!oldest[b.productId] || b.receivedAt < oldest[b.productId]) oldest[b.productId] = b.receivedAt;
    return Object.values(db.products)
      .filter((p) => p.status === 'active')
      .map((p) => {
        const s = idx[p.id] ?? { onHand: 0, blocked: 0, reserved: 0, available: 0, incoming: 0, staged: 0 };
        const status: Row['status'] = s.available <= 0 ? 'out' : s.available + s.incoming < p.reorderPoint ? 'low' : !sold[p.id] && s.onHand > 0 ? 'slow' : 'ok';
        return { p, s, value: roundSen(s.onHand * p.cost), ageDays: oldest[p.id] ? daysBetween(oldest[p.id], now) : 0, sold60: sold[p.id] ?? 0, status };
      });
  }, [db, now]);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const low = rows.filter((r) => r.status === 'low' || r.status === 'out');
  const blocked = rows.reduce((s, r) => s + r.s.blocked, 0);
  const sel = id ? rows.find((r) => r.p.id === id) : undefined;
  return (
    <div>
      <PageHeader
        title="Inventory & Warehouse"
        subtitle="On hand, reserved, available and incoming — per product and per bin. Every movement is in the ledger."
        actions={
          <>
            <Button variant="outline" onClick={() => setRet(true)}>
              <Undo2 className="size-4" /> Customer return
            </Button>
            <Gate perm="stock.adjust">
              <Button onClick={() => setAdj(true)}>
                <SlidersHorizontal className="size-4" /> Adjust stock
              </Button>
            </Gate>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Stock value (at cost)" value={totalValue} format={fmtCompact} definition="On-hand quantity × approved cost basis (illustrative estimate)." icon={<Boxes className="size-3.5" />} />
        <KpiTile label="Below reorder point" value={low.length} format={fmtInt} tone={low.length ? 'warn' : 'default'} onClick={() => setTab('reorder')} icon={<PackageOpen className="size-3.5" />} />
        <KpiTile label="Quarantined / damaged units" value={blocked} format={fmtInt} icon={<Shield className="size-3.5" />} />
        <KpiTile label="Slow-moving SKUs (60d)" value={rows.filter((r) => r.status === 'slow').length} format={fmtInt} definition="Stock on hand but no dispatches or counter sales in 60 days." icon={<AlertTriangle className="size-3.5" />} onClick={() => setTab('reorder')} />
      </div>
      <Tabs
        id="inv"
        value={tab ?? 'stock'}
        onValueChange={(v) => setTab(v === 'stock' ? null : v)}
        tabs={[
          { value: 'stock', label: 'Stock status', icon: <Boxes className="size-4" /> },
          { value: 'picking', label: 'Picking', icon: <ClipboardList className="size-4" />, count: Object.values(db.picklists).filter((p) => ['open', 'in_progress'].includes(p.status)).length },
          { value: 'scanner', label: 'Scanner', icon: <ScanBarcode className="size-4" /> },
          { value: 'reorder', label: 'Reorder & ABC', icon: <PackageOpen className="size-4" />, count: low.length },
          { value: 'ledger', label: 'Ledger', icon: <Logs className="size-4" /> },
        ]}
      >
        <TabPanel value="stock" className="pt-4">
          <StockTable rows={rows} onOpen={setId} />
        </TabPanel>
        <TabPanel value="picking" className="pt-4">
          <Picking />
        </TabPanel>
        <TabPanel value="scanner" className="pt-4">
          <Scanner onOpen={setId} />
        </TabPanel>
        <TabPanel value="reorder" className="pt-4">
          <Reorder rows={rows} />
        </TabPanel>
        <TabPanel value="ledger" className="pt-4">
          <Ledger />
        </TabPanel>
      </Tabs>
      <Drawer open={!!sel} onOpenChange={(o) => !o && setId(null)} title={sel?.p.sku ?? ''} subtitle={sel ? `${sel.p.name} ${sel.p.variantLabel ?? ''}` : ''}>
        {sel && <StockDetail r={sel} />}
      </Drawer>
      <AdjustModal open={adj} onOpenChange={setAdj} />
      <ReturnModal open={ret} onOpenChange={setRet} />
    </div>
  );
}

function StockTable({ rows, onOpen }: { rows: Row[]; onOpen: (id: string) => void }) {
  const db = useDbState();
  const [cat, setCat] = React.useState('');
  const [st, setSt] = React.useState('');
  const data = rows.filter((r) => (!cat || r.p.categoryId === cat) && (!st || r.status === st));
  const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: 'sku', header: 'SKU', accessorFn: (r) => r.p.sku, cell: (c) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{c.getValue() as string}</span> },
      { id: 'name', header: 'Product', accessorFn: (r) => `${r.p.name} ${r.p.variantLabel ?? ''}`, cell: (c) => <span className="line-clamp-1 max-w-[240px]">{c.getValue() as string}</span> },
      { id: 'abc', header: 'ABC', accessorFn: (r) => r.p.abc, cell: (c) => <Badge tone={c.getValue() === 'A' ? 'green' : c.getValue() === 'B' ? 'blue' : 'neutral'}>{c.getValue() as string}</Badge> },
      { id: 'onhand', header: 'On hand', accessorFn: (r) => r.s.onHand, meta: { align: 'right' } },
      { id: 'res', header: 'Reserved', accessorFn: (r) => r.s.reserved, meta: { align: 'right' }, cell: (c) => <span className={(c.getValue() as number) ? 'text-info' : 'text-muted'}>{c.getValue() as number}</span> },
      { id: 'blk', header: 'Blocked', accessorFn: (r) => r.s.blocked, meta: { align: 'right' }, cell: (c) => <span className={(c.getValue() as number) ? 'text-danger' : 'text-muted'}>{c.getValue() as number}</span> },
      { id: 'avail', header: 'Available', accessorFn: (r) => r.s.available, meta: { align: 'right' }, cell: (c) => <b className={c.row.original.status === 'out' ? 'text-danger' : c.row.original.status === 'low' ? 'text-warn' : 'text-ink'}>{c.getValue() as number}</b> },
      { id: 'inc', header: 'Incoming', accessorFn: (r) => r.s.incoming, meta: { align: 'right' }, cell: (c) => <span className="text-muted">{c.getValue() as number}</span> },
      { id: 'uom', header: 'UOM', accessorFn: (r) => r.p.baseUom, cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'rop', header: 'ROP', accessorFn: (r) => r.p.reorderPoint, meta: { align: 'right' }, cell: (c) => <span className="text-muted">{c.getValue() as number}</span> },
      { id: 'val', header: 'Value', accessorFn: (r) => r.value, meta: { align: 'right' }, cell: (c) => compactRM(c.getValue() as number) },
      { id: 'age', header: 'Oldest lot', accessorFn: (r) => r.ageDays, meta: { align: 'right' }, cell: (c) => <span className="text-xs text-muted">{c.getValue() as number}d</span> },
      { id: 'st', header: 'Status', accessorFn: (r) => r.status, cell: (c) => <Badge tone={{ out: 'red', low: 'amber', slow: 'violet', ok: 'green' }[c.getValue() as Row['status']] as 'red'}>{{ out: 'Out of stock', low: 'Below ROP', slow: 'Slow-moving', ok: 'OK' }[c.getValue() as Row['status']]}</Badge> },
    ],
    [],
  );
  return (
    <DataTable
      id="stock"
      data={data}
      columns={columns}
      getRowId={(r) => r.p.id}
      onRowClick={(r) => onOpen(r.p.id)}
      initialSorting={[{ id: 'avail', desc: false }]}
      exportName="stock-status"
      minWidth={1060}
      toolbar={
        <>
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 w-auto min-w-[160px]" aria-label="Category">
            <option value="">All categories</option>
            {Object.values(db.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={st} onChange={(e) => setSt(e.target.value)} className="h-9 w-auto" aria-label="Stock status">
            <option value="">All statuses</option>
            <option value="out">Out of stock</option>
            <option value="low">Below ROP</option>
            <option value="slow">Slow-moving</option>
            <option value="ok">OK</option>
          </Select>
        </>
      }
      mobileCard={(r) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-muted">{r.p.sku}</p>
            <p className="truncate text-sm font-medium">
              {r.p.name} {r.p.variantLabel ?? ''}
            </p>
            <p className="text-xs text-muted">
              on hand {r.s.onHand} · reserved {r.s.reserved} · incoming {r.s.incoming}
            </p>
          </div>
          <div className="text-right">
            <p className={cn('tabular text-lg font-bold', r.status === 'out' ? 'text-danger' : r.status === 'low' ? 'text-warn' : '')}>{r.s.available}</p>
            <p className="text-[10px] text-muted">available {r.p.baseUom}</p>
          </div>
        </div>
      )}
    />
  );
}

function StockDetail({ r }: { r: Row }) {
  const db = useDbState();
  const nav = useNavigate();
  const now = useNow();
  const [tr, setTr] = React.useState(false);
  const [qm, setQm] = React.useState(false);
  const [adj, setAdj] = React.useState(false);
  const bins = Object.values(db.binStock).filter((b) => b.productId === r.p.id);
  const moves = Object.values(db.movements).filter((m) => m.productId === r.p.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
  const res = Object.values(db.reservations).filter((x) => x.productId === r.p.id && x.status === 'active');
  return (
    <div className="space-y-5" data-tour="product-stock">
      <div className="flex gap-3">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-line">
          <ProductArt art={r.p.art} sku={r.p.sku} />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          {[
            ['On hand', r.s.onHand],
            ['Reserved', r.s.reserved],
            ['Available', r.s.available],
            ['Incoming', r.s.incoming],
            ['Blocked', r.s.blocked],
            ['Staged', r.s.staged],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-2 py-1.5">
              <p className="text-[10px] text-muted">{k}</p>
              <p className="tabular font-bold">{v}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        Available = on hand − blocked − reserved. Incoming is never counted as available. In packs: {breakdown(r.p, r.s.onHand)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Gate perm="stock.adjust">
          <Button size="sm" variant="outline" onClick={() => setAdj(true)}>
            <SlidersHorizontal className="size-4" /> Adjust
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTr(true)}>
            <ArrowLeftRight className="size-4" /> Transfer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setQm(true)}>
            <Shield className="size-4" /> Quarantine
          </Button>
        </Gate>
        <Button size="sm" variant="ghost" onClick={() => nav(`/warehouse?product=${r.p.id}`)}>
          <Warehouse className="size-4" /> Locate in 3D
        </Button>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Bins</p>
        <ul className="space-y-1.5 text-sm">
          {bins.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span className="font-mono text-xs font-semibold">{db.bins[b.binId]?.code}</span>
              <span className="text-xs text-muted">
                {db.bins[b.binId]?.kind} · lot {b.lot ?? '—'} · {relTime(b.receivedAt, now)}
              </span>
              <Badge tone={b.status === 'ok' ? 'green' : 'red'}>
                {b.qty} {b.status !== 'ok' ? b.status : ''}
              </Badge>
            </li>
          ))}
          {!bins.length && <li className="text-muted">No stock in any bin.</li>}
        </ul>
      </div>
      {res.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Reservations</p>
          <ul className="space-y-1 text-xs">
            {res.map((x) => (
              <li key={x.id}>
                <Link to={`/orders?id=${x.orderId}`} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5 hover:text-brand">
                  <span>{db.salesOrders[x.orderId]?.number} · {db.customers[db.salesOrders[x.orderId]?.customerId ?? '']?.name}</span>
                  <span className="tabular">{x.qty}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recent movements</p>
        <ul className="space-y-1 text-xs">
          {moves.map((m) => (
            <li key={m.id} className="flex items-center gap-2 border-b border-line/60 py-1.5">
              <span className="w-24 text-muted">{fmtDateTime(m.at)}</span>
              <Badge>{m.type}</Badge>
              <span className="flex-1 truncate text-muted">{m.refNumber ?? ''} {m.reason ?? ''}</span>
              <span className={cn('tabular font-semibold', m.qty > 0 ? 'text-brand' : m.qty < 0 ? 'text-danger' : 'text-muted')}>{m.qty > 0 ? `+${m.qty}` : m.qty || `↔${m.moved}`}</span>
              <span className="tabular w-10 text-right text-muted">{m.onHandAfter}</span>
            </li>
          ))}
        </ul>
      </div>
      <KV k="Reorder point / qty" v={`${r.p.reorderPoint} / ${r.p.reorderQty} ${r.p.baseUom}`} />
      <KV k="Sold (60 days)" v={`${r.sold60} ${r.p.baseUom}`} />
      <TransferModal open={tr} onOpenChange={setTr} productId={r.p.id} />
      <QuarantineModal open={qm} onOpenChange={setQm} productId={r.p.id} />
      <AdjustModal open={adj} onOpenChange={setAdj} productId={r.p.id} />
    </div>
  );
}

function Scanner({ onOpen }: { onOpen: (id: string) => void }) {
  const db = useDbState();
  const [code, setCode] = React.useState('');
  const [found, setFound] = React.useState<Product | null | undefined>(undefined);
  const [camOn, setCamOn] = React.useState(false);
  const [camMsg, setCamMsg] = React.useState('');
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const lookup = (raw: string) => {
    const v = raw.trim();
    if (!v) {
      toast.error('No barcode captured. Scan with a keyboard-wedge scanner or type the code.');
      return;
    }
    const p = Object.values(db.products).find((x) => x.barcode === v || x.sku.toLowerCase() === v.toLowerCase());
    setFound(p ?? null);
    if (!p) toast.error(`No product with barcode/SKU "${v}"`);
  };
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  };
  React.useEffect(() => stop, []);
  const startCam = async () => {
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) {
      setCamMsg('This browser has no BarcodeDetector support. Use the typed / keyboard-wedge input instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCamOn(true);
      setCamMsg('Point the camera at an EAN-13 barcode…');
      await new Promise((r) => setTimeout(r, 50));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const det = new BD({ formats: ['ean_13', 'code_128', 'qr_code'] });
      const loop = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const res = await det.detect(videoRef.current);
          if (res[0]?.rawValue) {
            setCode(res[0].rawValue);
            lookup(res[0].rawValue);
            stop();
            setCamMsg(`Captured ${res[0].rawValue}`);
            return;
          }
        } catch {
          /* keep trying */
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setCamMsg('Camera permission was denied or no camera is available. Typed input still works.');
      stop();
    }
  };
  const samples = Object.values(db.products).slice(0, 4);
  return (
    <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
      <Card className="p-4">
        <p className="mb-3 flex items-center gap-2 font-semibold">
          <ScanBarcode className="size-4 text-brand" /> Scan or type
        </p>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup(code)} placeholder="EAN-13 barcode or SKU" className="h-12 text-base" autoFocus aria-label="Barcode" />
          <Button size="lg" onClick={() => lookup(code)}>
            <Search className="size-4" />
          </Button>
        </div>
        <div className="mt-3">
          {camOn ? (
            <div>
              <video ref={videoRef} className="aspect-video w-full rounded-xl bg-black object-cover" muted playsInline />
              <Button variant="outline" size="sm" className="mt-2" onClick={stop}>
                Stop camera
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={startCam}>
              <Camera className="size-4" /> Use camera (asks permission)
            </Button>
          )}
          {camMsg && <p className="mt-2 text-xs text-muted">{camMsg}</p>}
        </div>
        <DemoNote className="mt-4">
          Try a demo barcode:{' '}
          {samples.map((p) => (
            <button key={p.id} className="mr-2 font-mono underline" onClick={() => { setCode(p.barcode); lookup(p.barcode); }}>
              {p.barcode}
            </button>
          ))}
        </DemoNote>
      </Card>
      <Card className="p-4">
        {found === undefined ? (
          <EmptyState icon={<ScanBarcode className="size-6" />} title="Waiting for a scan" body="Results show stock and bin locations. Nothing is assumed until a code is captured." />
        ) : found === null ? (
          <EmptyState title="Not found" body="Check the code and try again." />
        ) : (
          <ScanResult p={found} onOpen={onOpen} />
        )}
      </Card>
    </div>
  );
}

function ScanResult({ p, onOpen }: { p: Product; onOpen: (id: string) => void }) {
  const db = useDbState();
  const s = stockIndex(db)[p.id];
  const bins = Object.values(db.binStock).filter((b) => b.productId === p.id);
  return (
    <div>
      <div className="h-28 overflow-hidden rounded-xl border border-line">
        <ProductArt art={p.art} sku={p.sku} />
      </div>
      <p className="mt-3 font-mono text-xs text-muted">{p.sku}</p>
      <p className="font-semibold">
        {p.name} {p.variantLabel ?? ''}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['On hand', s?.onHand ?? 0],
          ['Reserved', s?.reserved ?? 0],
          ['Available', s?.available ?? 0],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-2 py-2">
            <p className="text-[10px] text-muted">{k}</p>
            <p className="tabular text-lg font-bold">{v}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Bins: {bins.map((b) => `${db.bins[b.binId]?.code} (${b.qty})`).join(', ') || 'none'}</p>
      <Button className="mt-3 w-full" variant="outline" onClick={() => onOpen(p.id)}>
        Open stock card
      </Button>
    </div>
  );
}

function Reorder({ rows }: { rows: Row[] }) {
  const db = useDbState();
  const nav = useNavigate();
  const low = rows.filter((r) => r.status === 'low' || r.status === 'out').sort((a, b) => a.s.available - b.s.available);
  const abc = (['A', 'B', 'C'] as const).map((k) => {
    const rs = rows.filter((r) => r.p.abc === k);
    return { k, n: rs.length, value: rs.reduce((s, r) => s + r.value, 0) };
  });
  const slow = rows.filter((r) => r.status === 'slow').sort((a, b) => b.value - a.value).slice(0, 10);
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <SectionCard className="xl:col-span-7" title="Reorder suggestions" subtitle="Available + incoming below reorder point · suggested qty = reorder qty + open backorders">
        <ul className="space-y-2" data-tour="reorder-list">
          {low.map((r) => {
            const bo = Object.values(db.backorders).filter((b) => b.status === 'open' && b.productId === r.p.id).reduce((s, b) => s + b.qty, 0);
            const sug = r.p.reorderQty + Math.ceil(bo);
            return (
              <li key={r.p.id} className={cn('flex flex-wrap items-center gap-3 rounded-xl border p-3', bo ? 'border-danger/40 bg-danger-soft/30' : 'border-line')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    <span className="font-mono text-xs">{r.p.sku}</span> {r.p.name} {r.p.variantLabel ?? ''}
                  </p>
                  <p className="text-xs text-muted">
                    available {r.s.available} · incoming {r.s.incoming} · ROP {r.p.reorderPoint} {r.p.baseUom}
                    {bo ? <b className="text-danger"> · {bo} on backorder</b> : ''} · supplier {db.suppliers[r.p.preferredSupplierId]?.name}
                  </p>
                </div>
                <Gate perm="po.manage" compact>
                  <Button
                    size="sm"
                    onClick={() => {
                      const pr = act(createRequisition, { lines: [{ productId: r.p.id, qty: sug }], reason: bo ? `Low stock with ${bo} on backorder` : 'Below reorder point', sourceType: bo ? 'backorder' : 'low_stock' }, { success: (x) => `${x.number} created — compare suppliers next` });
                      if (pr) nav(`/procurement?tab=requisitions&product=${r.p.id}`);
                    }}
                  >
                    <Plus className="size-4" /> Requisition {sug}
                  </Button>
                </Gate>
              </li>
            );
          })}
          {!low.length && <p className="text-sm text-muted">Nothing below reorder point.</p>}
        </ul>
      </SectionCard>
      <div className="space-y-4 xl:col-span-5">
        <SectionCard title="ABC classification" subtitle="By 90-day revenue: A = top 20% of SKUs">
          <div className="grid grid-cols-3 gap-2 text-center">
            {abc.map((x) => (
              <div key={x.k} className="rounded-xl bg-surface-2 p-3">
                <p className="font-display text-2xl font-bold">{x.k}</p>
                <p className="text-xs text-muted">{x.n} SKUs</p>
                <p className="tabular text-xs font-semibold">{compactRM(x.value)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Slow-moving stock" subtitle="On hand, no sales in 60 days — highest value first">
          <ul className="space-y-1.5 text-xs">
            {slow.map((r) => (
              <li key={r.p.id} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5">
                <span>
                  <span className="font-mono">{r.p.sku}</span> · {r.s.onHand} {r.p.baseUom} · oldest {r.ageDays}d
                </span>
                <span className="tabular font-semibold">{formatRM(r.value)}</span>
              </li>
            ))}
            {!slow.length && <li className="text-muted">None.</li>}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function Ledger() {
  const db = useDbState();
  const [type, setType] = React.useState('');
  const rows = React.useMemo(() => Object.values(db.movements).filter((m) => !type || m.type === type).sort((a, b) => b.at.localeCompare(a.at)), [db.movements, type]);
  const columns = React.useMemo<ColumnDef<InventoryMovement, unknown>[]>(
    () => [
      { id: 'at', header: 'Time', accessorKey: 'at', cell: (c) => <span className="whitespace-nowrap text-xs">{fmtDateTime(c.row.original.at)}</span> },
      { id: 'type', header: 'Type', accessorKey: 'type', cell: (c) => <Badge tone={['receipt', 'return', 'delivery_return'].includes(c.row.original.type) ? 'green' : ['dispatch', 'pos_sale'].includes(c.row.original.type) ? 'blue' : c.row.original.type === 'adjustment' ? 'amber' : 'neutral'}>{c.row.original.type.replace('_', ' ')}</Badge> },
      { id: 'sku', header: 'SKU', accessorFn: (m) => db.products[m.productId]?.sku ?? '', cell: (c) => <span className="font-mono text-xs">{c.getValue() as string}</span> },
      { id: 'qty', header: 'Δ on hand', accessorKey: 'qty', meta: { align: 'right' }, cell: (c) => <span className={cn('font-semibold', c.row.original.qty > 0 ? 'text-brand' : c.row.original.qty < 0 ? 'text-danger' : 'text-muted')}>{c.row.original.qty > 0 ? `+${c.row.original.qty}` : c.row.original.qty}</span> },
      { id: 'moved', header: 'Moved', accessorKey: 'moved', meta: { align: 'right' } },
      { id: 'bins', header: 'From → to', accessorFn: (m) => `${m.fromBinId ? db.bins[m.fromBinId]?.code : ''} → ${m.toBinId ? db.bins[m.toBinId]?.code : ''}`, cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'ref', header: 'Reference', accessorFn: (m) => m.refNumber ?? '', cell: (c) => <span className="font-mono text-xs">{c.getValue() as string}</span> },
      { id: 'reason', header: 'Reason', accessorFn: (m) => m.reason ?? '', cell: (c) => <span className="line-clamp-1 max-w-[200px] text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'by', header: 'By', accessorKey: 'by', cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'after', header: 'On hand after', accessorKey: 'onHandAfter', meta: { align: 'right' } },
    ],
    [db.products, db.bins],
  );
  return (
    <DataTable
      id="ledger"
      data={rows}
      columns={columns}
      getRowId={(m) => m.id}
      exportName="inventory-ledger"
      minWidth={1000}
      pageSize={25}
      toolbar={
        <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-auto" aria-label="Movement type">
          <option value="">All movement types</option>
          {['receipt', 'pick', 'unpick', 'dispatch', 'return', 'adjustment', 'transfer', 'pos_sale', 'quarantine', 'release', 'delivery_return'].map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </Select>
      }
    />
  );
}
