import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { ID } from '@/domain/types';
import { useDbState } from '@/store/db';
import { useSession } from '@/store/session';
import { stockIndex } from '@/domain/inventory';
import { useNow, useParam, useMediaQuery } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Select } from '@/components/ui/core';
import { Segmented, Tip } from '@/components/ui/overlay';
import { PageHeader, Gate, useMotionOK, KV } from '@/components/widgets';
import { AlertTriangle, Box, Crosshair, Forklift, Grid3x3, Layers, Map, PackageCheck, RotateCcw, Route, Warehouse, X, Info } from '@/components/ui/icons';
import { binViews, colorFor, occupancyLabel, pickRoute, type BinView, type Mode } from './model';
import { FloorPlan2D } from './FloorPlan2D';
import type { Overlay, SceneHandle } from './Scene3D';
import { AdjustModal } from '@/features/inventory/StockDialogs';

const Scene3D = React.lazy(() => import('./Scene3D'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

class GLBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('3D view failed, falling back to 2D', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useDark() {
  const theme = useSession((s) => s.theme);
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  React.useEffect(() => {
    const ob = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => ob.disconnect();
  }, [theme]);
  return dark;
}

export default function WarehousePage() {
  const db = useDbState();
  const nav = useNavigate();
  const now = useNow(60_000);
  const dark = useDark();
  const motionOK = useMotionOK();
  const lowPower = useSession((s) => s.lowPower3d);
  const setSession = useSession((s) => s.set);
  const small = useMediaQuery('(max-width: 767px)');
  const [grnId, setGrn] = useParam('grn');
  const [productParam, setProductParam] = useParam('product');
  const webgl = React.useMemo(hasWebGL, []);
  const [view, setView] = React.useState<'3d' | '2d'>(() => (!webgl || small ? '2d' : '3d'));
  const [mode, setMode] = React.useState<Mode>(grnId ? 'receiving' : 'occupancy');
  const [selBin, setSelBin] = React.useState<ID | null>(null);
  const [plId, setPlId] = React.useState<string>('');
  const [forklift, setForklift] = React.useState(0);
  const [recvRun, setRecvRun] = React.useState(grnId ? 1 : 0);
  const [mini, setMini] = React.useState(true);
  const [adjust, setAdjust] = React.useState(false);
  const sceneRef = React.useRef<SceneHandle>(null);
  const overlayEls = React.useRef<Record<string, HTMLElement | null>>({});
  const [hoverBin, setHoverBin] = React.useState<BinView | null>(null);
  const views = React.useMemo(() => binViews(db, now), [db, now]);
  const grn = grnId ? db.goodsReceipts[grnId] : undefined;
  const openLists = Object.values(db.picklists).filter((p) => ['open', 'in_progress'].includes(p.status));
  const pickBins = React.useMemo(() => {
    const pl = db.picklists[plId] ?? openLists[0];
    return pl ? pl.tasks.filter((t) => t.status === 'open').map((t) => t.binId) : [];
  }, [db.picklists, plId, openLists]);
  const route = React.useMemo(() => (mode === 'route' && pickBins.length ? pickRoute(views, pickBins) : undefined), [mode, pickBins, views]);
  const highlight = React.useMemo(() => {
    if (mode === 'route') return new Set(pickBins);
    if (mode === 'receiving' && grn) return new Set(grn.lines.map((l) => l.binId));
    if (productParam) return new Set(views.filter((v) => v.items.some((i) => i.productId === productParam)).map((v) => v.bin.id));
    return new Set<ID>();
  }, [mode, pickBins, grn, productParam, views]);
  React.useEffect(() => {
    if (grn) {
      setMode('receiving');
      setSelBin(grn.lines[0]?.binId ?? null);
    }
  }, [grnId]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (productParam) {
      const v = views.find((x) => x.items.some((i) => i.productId === productParam));
      if (v) {
        setSelBin(v.bin.id);
        setTimeout(() => sceneRef.current?.focus(v.pos[0], v.pos[2]), 600);
      }
    }
  }, [productParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = selBin ? views.find((v) => v.bin.id === selBin) : undefined;
  const recvTarget = grn ? views.find((v) => v.bin.id === grn.lines[0]?.binId) : undefined;
  const show3d = view === '3d' && webgl;
  const overlays = React.useMemo<Overlay[]>(() => {
    const o: Overlay[] = Object.values(db.zones).map((z) => ({ id: `z_${z.id}`, pos: [z.x + z.w / 2, 0.2, z.z + 1.2] as [number, number, number] }));
    if (route && mode === 'route') route.stops.forEach((st, i) => o.push({ id: `stop_${i}`, pos: [st.pos[0], 2.75, st.pos[2] + (st.zoneCode === 'C' ? 1.4 : -1.4)] }));
    if (hoverBin) o.push({ id: 'hover', pos: [hoverBin.pos[0], hoverBin.pos[1] + hoverBin.size[1] / 2 + 0.4, hoverBin.pos[2]] });
    return o;
  }, [db.zones, route, mode, hoverBin]);
  const animate = motionOK && !lowPower;

  const fallback2d = (
    <FloorPlan2D db={db} views={views} mode={mode} dark={dark} highlight={highlight} route={route?.points} selectedRack={sel?.rack?.id} onSelectRack={(_, b) => b && setSelBin(b)} pulseBin={grn?.lines[0]?.binId} />
  );

  return (
    <div>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Warehouse className="size-3.5" /> Signature view</span>}
        title="3D Warehouse Explorer"
        subtitle="Click a rack bin to see the SKUs, stock and reservations behind it — the same records the inventory module uses."
        actions={
          <Segmented
            id="wh-view"
            value={show3d ? '3d' : '2d'}
            onChange={(v) => {
              if (v === '3d' && !webgl) return toast.error('WebGL is not available in this browser — showing the 2D plan.');
              setView(v);
            }}
            options={[
              { value: '3d', label: <span className="flex items-center gap-1"><Box className="size-4" /> 3D</span> },
              { value: '2d', label: <span className="flex items-center gap-1"><Grid3x3 className="size-4" /> 2D plan</span> },
            ]}
          />
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-warn/60 bg-warn-soft/50 px-3 py-2 text-xs font-semibold text-ink">
        <AlertTriangle className="size-4 text-warn" /> Illustrative warehouse layout — not an actual survey of any MK Hardware facility.
        {!webgl && <Badge tone="amber">WebGL unavailable — 2D plan shown</Badge>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="relative overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <Segmented
              id="wh-mode"
              size="sm"
              value={mode}
              onChange={setMode}
              className="no-scrollbar max-w-full overflow-x-auto"
              options={[
                { value: 'occupancy', label: 'Occupancy' },
                { value: 'low', label: 'Low stock' },
                { value: 'route', label: 'Picking route' },
                { value: 'receiving', label: 'Receiving' },
              ]}
            />
            {mode === 'route' && (
              <Select value={plId} onChange={(e) => setPlId(e.target.value)} className="h-8 w-auto text-xs" aria-label="Picklist">
                {openLists.length === 0 && <option value="">No open picklists</option>}
                {openLists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} · {db.salesOrders[p.orderId]?.number}
                  </option>
                ))}
              </Select>
            )}
            {mode === 'receiving' && (
              <Select value={grnId ?? ''} onChange={(e) => { setGrn(e.target.value || null); setRecvRun((r) => r + 1); }} className="h-8 w-auto text-xs" aria-label="Goods receipt">
                <option value="">Recent receipts (7 days)</option>
                {Object.values(db.goodsReceipts)
                  .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
                  .slice(0, 15)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.number} · {g.lines.map((l) => db.products[l.productId]?.sku).join(', ')}
                    </option>
                  ))}
              </Select>
            )}
            <div className="ml-auto flex items-center gap-1">
              {show3d && (
                <>
                  <Tip content="Reset to isometric view">
                    <Button size="icon-sm" variant="outline" onClick={() => sceneRef.current?.reset()} aria-label="Reset view">
                      <RotateCcw className="size-4" />
                    </Button>
                  </Tip>
                  <Tip content="Fit to selection">
                    <Button size="icon-sm" variant="outline" disabled={!sel} onClick={() => sel && sceneRef.current?.focus(sel.pos[0], sel.pos[2])} aria-label="Fit to selection">
                      <Crosshair className="size-4" />
                    </Button>
                  </Tip>
                  <Tip content="Demo forklift run (animation only — not live tracking)">
                    <Button size="icon-sm" variant="outline" onClick={() => setForklift((f) => f + 1)} aria-label="Run demo forklift">
                      <Forklift className="size-4" />
                    </Button>
                  </Tip>
                  {grn && (
                    <Tip content="Replay receiving animation">
                      <Button size="icon-sm" variant="outline" onClick={() => { setMode('receiving'); setRecvRun((r) => r + 1); }} aria-label="Replay receiving">
                        <PackageCheck className="size-4" />
                      </Button>
                    </Tip>
                  )}
                  <Tip content="Toggle mini-map">
                    <Button size="icon-sm" variant={mini ? 'secondary' : 'outline'} onClick={() => setMini(!mini)} aria-label="Toggle mini-map">
                      <Map className="size-4" />
                    </Button>
                  </Tip>
                </>
              )}
              <Tip content="Low-power mode: simpler geometry, no continuous animation">
                <Button size="icon-sm" variant={lowPower ? 'secondary' : 'outline'} onClick={() => setSession({ lowPower3d: !lowPower })} aria-label="Toggle low-power mode">
                  <Layers className="size-4" />
                </Button>
              </Tip>
            </div>
          </div>
          <div className="relative" data-tour="warehouse-canvas">
            {show3d ? (
              <div className="h-[56vh] min-h-[380px] w-full touch-none">
                <GLBoundary fallback={<div className="p-3">{fallback2d}</div>}>
                  <React.Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted">Loading 3D scene…</div>}>
                    <Scene3D
                      ref={sceneRef}
                      db={db}
                      views={views}
                      mode={mode}
                      dark={dark}
                      highlight={highlight}
                      route={route}
                      selectedBin={selBin}
                      onSelect={(v) => setSelBin(v.bin.id)}
                      lowPower={lowPower}
                      animate={animate}
                      forkliftRun={forklift}
                      receiving={mode === 'receiving' && recvTarget && recvRun > 0 && animate ? { target: recvTarget, run: recvRun } : undefined}
                      onReceivingDone={() => toast.success(`${grn?.number}: stock put away at ${recvTarget?.bin.code}`)}
                      onHover={setHoverBin}
                      overlays={overlays}
                      overlayEls={overlayEls}
                    />
                  </React.Suspense>
                </GLBoundary>
              </div>
            ) : (
              <div className="p-3">{fallback2d}</div>
            )}
            {show3d && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                {Object.values(db.zones).map((z) => (
                  <div key={z.id} ref={(el) => { overlayEls.current[`z_${z.id}`] = el; }} className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold text-ink-2 opacity-0 shadow-sm ring-1 ring-line">
                    {z.name}
                  </div>
                ))}
                {mode === 'route' &&
                  route?.stops.map((st, i) => (
                    <div key={st.bin.id} ref={(el) => { overlayEls.current[`stop_${i}`] = el; }} className="absolute left-0 top-0 grid size-6 place-items-center rounded-full bg-ember-500 text-[11px] font-bold text-forest-950 opacity-0 shadow">
                      {i + 1}
                    </div>
                  ))}
                {hoverBin && (
                  <div ref={(el) => { overlayEls.current.hover = el; }} className="absolute left-0 top-0 w-max max-w-[220px] rounded-lg bg-forest-950/95 px-2.5 py-1.5 text-[11px] leading-snug text-white opacity-0 shadow-lg">
                    <p className="font-bold">{hoverBin.bin.code}</p>
                    {hoverBin.items.length ? hoverBin.items.map((i) => <p key={i.productId + i.status}>{i.sku} × {i.qty}{i.status !== 'ok' ? ` (${i.status})` : ''}{i.low ? ' · low stock' : ''}</p>) : <p>Empty</p>}
                    <p className="text-white/70">{occupancyLabel(hoverBin.occupancy)} · {Math.round(hoverBin.occupancy * 100)}%</p>
                  </div>
                )}
              </div>
            )}
            {show3d && mini && (
              <div className="absolute bottom-3 left-3 hidden w-48 rounded-xl border border-line bg-surface/90 p-1.5 shadow-lg backdrop-blur sm:block">
                <FloorPlan2D db={db} views={views} mode={mode} dark={dark} highlight={highlight} route={route?.points} mini selectedRack={sel?.rack?.id} />
              </div>
            )}
            <Legend mode={mode} dark={dark} />
          </div>
          <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
            Drag to orbit · right-drag / two fingers to pan · scroll / pinch to zoom. {mode === 'route' && 'The route is diagrammatic along aisles — not a route optimisation.'} Forklift is a demo animation, not location tracking.
          </p>
        </Card>
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {sel ? (
              <motion.div key={sel.bin.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                <BinPanel v={sel} onClose={() => setSelBin(null)} onAdjust={() => setAdjust(true)} highlight={highlight} />
              </motion.div>
            ) : (
              <Card className="p-4 text-sm text-muted">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <Info className="size-4 text-brand" /> Select a bin
                </p>
                <p className="mt-1">Click any coloured bin in the 3D view or the 2D plan to see its SKUs, quantities, reservations and pick tasks.</p>
              </Card>
            )}
          </AnimatePresence>
          {grn && mode === 'receiving' && (
            <Card className="p-4">
              <p className="flex items-center gap-2 font-semibold">
                <PackageCheck className="size-4 text-info" /> {grn.number}
              </p>
              <p className="text-xs text-muted">
                {db.purchaseOrders[grn.poId]?.number} · {db.suppliers[grn.supplierId]?.name} · {fmtDateTime(grn.receivedAt)}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {grn.lines.map((l) => (
                  <li key={l.poLineId} className="flex justify-between">
                    <button className="hover:text-brand" onClick={() => setSelBin(l.binId)}>
                      {db.products[l.productId]?.sku} → {db.bins[l.binId]?.code}
                    </button>
                    <span className="tabular">
                      +{l.qty}
                      {l.damaged ? ` (${l.damaged} quarantined)` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {grn.allocations.length > 0 && <p className="mt-2 text-xs text-brand">{grn.allocations.length} backorder allocation(s) made from this receipt.</p>}
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setGrn(null)}>
                <X className="size-3.5" /> Clear
              </Button>
            </Card>
          )}
          {productParam && (
            <Card className="flex items-center justify-between gap-2 p-3 text-sm">
              <span>
                Locating <b>{db.products[productParam]?.sku}</b> ({highlight.size} bin{highlight.size === 1 ? '' : 's'})
              </span>
              <Button size="xs" variant="ghost" onClick={() => setProductParam(null)}>
                Clear
              </Button>
            </Card>
          )}
          <RackList views={views} onPick={(b) => setSelBin(b)} />
        </div>
      </div>
      {sel?.items[0] && <AdjustModal open={adjust} onOpenChange={setAdjust} productId={sel.items[0].productId} />}
    </div>
  );
}

function Legend({ mode, dark }: { mode: Mode; dark: boolean }) {
  const items: [string, string][] =
    mode === 'occupancy'
      ? [
          [dark ? '#2b4a40' : '#d5e2da', 'Empty'],
          [dark ? '#1d5c47' : '#9fdcbf', 'Nearly empty'],
          [dark ? '#1f8a63' : '#52c898', 'Low fill'],
          [dark ? '#3fc08d' : '#29B47F', 'Healthy'],
          ['#F08B46', 'Near full'],
        ]
      : mode === 'low'
        ? [
            ['#D95752', 'Below reorder point'],
            ['#E0A43A', 'Quarantined / damaged'],
            [dark ? '#1f8a63' : '#9fdcbf', 'OK'],
          ]
        : mode === 'route'
          ? [
              ['#F08B46', 'Bin to pick (numbered stop)'],
              [dark ? '#24413a' : '#e3ebe6', 'Other bins'],
            ]
          : [
              ['#2a78d6', 'Selected receipt bin'],
              [dark ? '#3a6fb3' : '#86b6ef', 'Received in last 7 days'],
            ];
  return (
    <div className="absolute right-3 top-3 rounded-xl border border-line bg-surface/90 p-2.5 text-[11px] shadow-sm backdrop-blur">
      <p className="mb-1 font-semibold text-ink">Legend</p>
      {items.map(([c, l]) => (
        <p key={l} className="flex items-center gap-1.5 text-ink-2">
          <span className="size-2.5 rounded-sm ring-1 ring-black/10" style={{ background: c }} /> {l}
        </p>
      ))}
    </div>
  );
}

function BinPanel({ v, onClose, onAdjust, highlight }: { v: BinView; onClose: () => void; onAdjust: () => void; highlight: Set<ID> }) {
  const db = useDbState();
  const nav = useNavigate();
  const idx = stockIndex(db);
  const tasks = Object.values(db.picklists)
    .filter((p) => ['open', 'in_progress'].includes(p.status))
    .flatMap((p) => p.tasks.filter((t) => t.binId === v.bin.id && t.status === 'open').map((t) => ({ p, t })));
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-xl font-extrabold">{v.bin.code}</p>
          <p className="text-xs text-muted">
            {db.zones[v.bin.zoneId]?.name} · rack {v.rack?.code} ({v.rack?.type}) · bay {v.bin.bay}
            {v.rack?.type !== 'floor' ? `, level ${v.bin.level}` : ''}
          </p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close bin panel">
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={v.occupancy > 0.85 ? 'orange' : v.items.length ? 'green' : 'neutral'}>
          {occupancyLabel(v.occupancy)} · {Math.round(v.occupancy * 100)}%
        </Badge>
        {v.low && <Badge tone="red">Contains low-stock SKU</Badge>}
        {v.recent && <Badge tone="blue">Received recently</Badge>}
        {highlight.has(v.bin.id) && <Badge tone="orange">Highlighted</Badge>}
      </div>
      <ul className="mt-3 space-y-2">
        {v.items.map((i) => {
          const p = db.products[i.productId];
          const s = idx[i.productId];
          return (
            <li key={i.productId + i.status} className="rounded-xl border border-line p-3">
              <p className="font-mono text-[11px] text-muted">{p.sku}</p>
              <p className="text-sm font-medium">
                {p.name} {p.variantLabel ?? ''}
              </p>
              <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs">
                <KV k="In this bin" v={`${i.qty} ${p.baseUom}${i.status !== 'ok' ? ` (${i.status})` : ''}`} />
                <KV k="Available (all bins)" v={s?.available ?? 0} />
                <KV k="Reserved (all bins)" v={s?.reserved ?? 0} />
                <KV k="Incoming" v={s?.incoming ?? 0} />
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button size="xs" variant="outline" onClick={() => nav(`/inventory?id=${p.id}`)}>
                  Stock card
                </Button>
                <Button size="xs" variant="ghost" onClick={() => nav(`/catalog?id=${p.id}`)}>
                  Product
                </Button>
              </div>
            </li>
          );
        })}
        {!v.items.length && <li className="text-sm text-muted">Empty bin — available for put-away.</li>}
      </ul>
      {tasks.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Open pick tasks here</p>
          {tasks.map(({ p, t }) => (
            <button key={t.id} onClick={() => nav(`/inventory?tab=picking&pl=${p.id}`)} className="flex w-full justify-between rounded-lg bg-orange-soft px-3 py-1.5 text-xs hover:brightness-95">
              <span>
                {p.number} · {db.products[t.productId]?.sku}
              </span>
              <span className="tabular">{t.qty - t.picked} to pick</span>
            </button>
          ))}
        </div>
      )}
      {v.items.length > 0 && (
        <Gate perm="stock.adjust" fallback={null}>
          <Button size="sm" variant="outline" className="mt-3" onClick={onAdjust}>
            Adjust stock in this bin
          </Button>
        </Gate>
      )}
    </Card>
  );
}

function RackList({ views, onPick }: { views: BinView[]; onPick: (b: ID) => void }) {
  const db = useDbState();
  const racks = Object.values(db.racks).map((r) => {
    const bins = views.filter((v) => v.rack?.id === r.id);
    const occ = bins.reduce((s, b) => s + Math.min(1, b.occupancy), 0) / Math.max(1, bins.length);
    return { r, bins, occ, low: bins.filter((b) => b.low).length };
  });
  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Route className="size-3.5" /> Rack list (accessible companion)
      </p>
      <ul className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto text-xs">
        {racks.map(({ r, bins, occ, low }) => (
          <li key={r.id}>
            <button onClick={() => onPick((bins.find((b) => b.items.length) ?? bins[0]).bin.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
              <span className="w-10 font-mono font-semibold">{r.code}</span>
              <span className="flex-1 text-muted">
                {db.zones[r.zoneId]?.code} · {r.type} · {bins.length} bins
              </span>
              <span className={cn('tabular', occ > 0.85 && 'text-orange')}>{Math.round(occ * 100)}%</span>
              {low > 0 && <Badge tone="red">{low} low</Badge>}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
