import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import Papa from 'papaparse';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import type { Product, UomCode } from '@/domain/types';
import { useDbState } from '@/store/db';
import { useBoq } from '@/store/boq';
import { act } from '@/lib/act';
import { createProduct, duplicateVariant, setProductStatus, toggleWatch } from '@/domain/commands/catalog';
import { createQuote } from '@/domain/commands/sales';
import { createRequisition } from '@/domain/commands/procurement';
import { stockIndex } from '@/domain/inventory';
import { productUoms, toBase, UOM_LABELS } from '@/domain/uom';
import { TIER_LABELS } from '@/domain/pricing';
import { useParam } from '@/lib/hooks';
import { formatRM, toSen } from '@/lib/money';
import { fmtDate } from '@/lib/dates';
import { cn, downloadText } from '@/lib/utils';
import { toCsv } from '@/services/csv';
import { Badge, Button, Card, EmptyState, Field, Input, Select } from '@/components/ui/core';
import { Drawer, Modal, Segmented, Toggle, useConfirm } from '@/components/ui/overlay';
import { PageHeader, Gate, KV, DemoNote, useMotionOK } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { ProductArt } from '@/components/art/ProductArt';
import { searchProducts } from '@/components/ProductSearch';
import { Archive, ClipboardList, Copy, Download, FileText, FileUp, LayoutGrid, LayoutList, Package, Pencil, Plus, Search, ShoppingCart, Star, Trash, Eye, Store, RotateCcw } from '@/components/ui/icons';
import { ProductFormModal } from './ProductForm';

export default function CatalogPage() {
  const db = useDbState();
  const [id, setId] = useParam('id');
  const [view, setView] = React.useState<'cards' | 'table'>('cards');
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('');
  const [brand, setBrand] = React.useState('');
  const [stockF, setStockF] = React.useState('');
  const [vol, setVol] = React.useState('');
  const [uom, setUom] = React.useState('');
  const [vendor, setVendor] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [customerView, setCustomerView] = React.useState(false);
  const [add, setAdd] = React.useState(false);
  const [imp, setImp] = React.useState(false);
  const [boqOpen, setBoqOpen] = React.useState(false);
  const boq = useBoq((s) => s.lines);
  const stock = stockIndex(db);
  const all = React.useMemo(() => Object.values(db.products).sort((a, b) => a.sku.localeCompare(b.sku)), [db.products]);
  const filtered = React.useMemo(() => {
    const base = q.trim() ? searchProducts(all.filter((p) => showArchived || p.status === 'active'), q, db.brands, 500) : all;
    return base.filter((p) => {
      const s = stock[p.id];
      if (!showArchived && p.status !== 'active') return false;
      if (cat && p.categoryId !== cat) return false;
      if (brand && p.brandId !== brand) return false;
      if (vol && p.volatility !== vol) return false;
      if (uom && p.baseUom !== uom) return false;
      if (vendor && !Object.values(db.supplierProducts).some((sp) => sp.productId === p.id && sp.supplierId === vendor)) return false;
      if (stockF === 'in' && !((s?.available ?? 0) > 0)) return false;
      if (stockF === 'low' && !((s?.available ?? 0) + (s?.incoming ?? 0) < p.reorderPoint)) return false;
      if (stockF === 'out' && (s?.available ?? 0) > 0) return false;
      return true;
    });
  }, [all, q, cat, brand, vol, uom, vendor, stockF, showArchived, stock, db.brands, db.supplierProducts]);
  // group families into one card with variant chips
  const families = React.useMemo(() => {
    const seen = new Map<string, Product[]>();
    for (const p of filtered) {
      const k = p.familyId ?? p.id;
      seen.set(k, [...(seen.get(k) ?? []), p]);
    }
    return [...seen.values()];
  }, [filtered]);
  const sel = id ? db.products[id] : undefined;
  const exportCsv = () => {
    downloadText(
      `catalog-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(filtered.map((p) => ({ sku: p.sku, name: p.name, variant: p.variantLabel ?? '', category: db.categories[p.categoryId]?.name, brand: db.brands[p.brandId]?.name, base_uom: p.baseUom, packs: p.uoms.map((u) => `${u.uom}:${u.factor}`).join('|'), barcode: p.barcode, status: p.status, available: stock[p.id]?.available ?? 0 }))),
      'text/csv',
    );
    toast.success(`Exported ${filtered.length} products (no prices)`);
  };
  return (
    <div>
      <PageHeader
        title="Master Product Catalog"
        subtitle={`${all.filter((p) => p.status === 'active').length} active SKUs across ${Object.keys(db.categories).length} categories. Specs are illustrative — verify against manufacturer datasheets.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setBoqOpen(true)} className="relative">
              <ClipboardList className="size-4" /> BOQ basket
              {boq.length > 0 && <span className="tabular rounded-full bg-ember-500 px-1.5 text-[10px] font-bold text-forest-950">{boq.length}</span>}
            </Button>
            <Gate perm="catalog.edit" fallback={null}>
              <Button variant="outline" onClick={() => setImp(true)}>
                <FileUp className="size-4" /> Import CSV
              </Button>
              <Button onClick={() => setAdd(true)}>
                <Plus className="size-4" /> Add product
              </Button>
            </Gate>
          </>
        }
      />
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder='Instant search: SKU, brand, name, size (e.g. "2 elbow", "M12", "bosch grinder")' className="pl-9" aria-label="Search catalog" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented id="cat-view" value={view} onChange={setView} options={[{ value: 'cards', label: <LayoutGrid className="size-4" aria-label="Cards" /> }, { value: 'table', label: <LayoutList className="size-4" aria-label="Table" /> }]} />
            <Toggle checked={customerView} onCheckedChange={setCustomerView} label="Customer preview" />
            <Button variant="ghost" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9" aria-label="Category">
            <option value="">All categories</option>
            {Object.values(db.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9" aria-label="Brand">
            <option value="">All brands</option>
            {Object.values(db.brands).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select value={uom} onChange={(e) => setUom(e.target.value)} className="h-9" aria-label="Unit">
            <option value="">Any unit</option>
            {[...new Set(all.map((p) => p.baseUom))].map((u) => (
              <option key={u} value={u}>
                {u} — {UOM_LABELS[u]}
              </option>
            ))}
          </Select>
          <Select value={stockF} onChange={(e) => setStockF(e.target.value)} className="h-9" aria-label="Stock">
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Below reorder point</option>
            <option value="out">Out of stock</option>
          </Select>
          <Select value={vendor} onChange={(e) => setVendor(e.target.value)} className="h-9" aria-label="Vendor">
            <option value="">Any vendor</option>
            {Object.values(db.suppliers).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={vol} onChange={(e) => setVol(e.target.value)} className="h-9" aria-label="Price volatility">
            <option value="">Any volatility</option>
            <option value="high">High volatility</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Toggle checked={showArchived} onCheckedChange={setShowArchived} label="Discontinued" />
        </div>
      </Card>
      {customerView && (
        <DemoNote className="mb-4">
          <b>Customer-facing preview.</b> MK Hardware does not publish fixed prices online — a future public catalogue would show "Price on request" with a quotation button, as here.
        </DemoNote>
      )}
      {filtered.length === 0 ? (
        <EmptyState icon={<Package className="size-6" />} title="No products match" body="Clear a filter or try a different search." />
      ) : view === 'cards' ? (
        <CardsGrid families={families} customerView={customerView} onOpen={setId} />
      ) : (
        <CatalogTable rows={filtered} onOpen={setId} customerView={customerView} />
      )}
      <Drawer open={!!sel} onOpenChange={(o) => !o && setId(null)} title={sel?.name ?? ''} subtitle={sel ? `${sel.sku}${sel.variantLabel ? ` · ${sel.variantLabel}` : ''}` : ''} width="max-w-2xl">
        {sel && <ProductDetail p={sel} customerView={customerView} onSelect={setId} />}
      </Drawer>
      <ProductFormModal open={add} onOpenChange={setAdd} />
      <ImportModal open={imp} onOpenChange={setImp} />
      <BoqSheet open={boqOpen} onOpenChange={setBoqOpen} />
    </div>
  );
}

function CardsGrid({ families, customerView, onOpen }: { families: Product[][]; customerView: boolean; onOpen: (id: string) => void }) {
  const db = useDbState();
  const ok = useMotionOK();
  const stock = stockIndex(db);
  const add = useBoq((s) => s.add);
  const [pickedVariant, setPicked] = React.useState<Record<string, string>>({});
  const [limit, setLimit] = React.useState(36);
  return (
    <>
      <motion.div layout className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <AnimatePresence initial={false}>
          {families.slice(0, limit).map((fam, i) => {
            const key = fam[0].familyId ?? fam[0].id;
            const p = fam.find((x) => x.id === pickedVariant[key]) ?? fam[0];
            const s = stock[p.id];
            const low = (s?.available ?? 0) + (s?.incoming ?? 0) < p.reorderPoint;
            return (
              <motion.div key={key} layout initial={ok ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: ok ? Math.min(i, 12) * 0.02 : 0 }} whileHover={{ y: -3 }} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                <button onClick={() => onOpen(p.id)} className="relative aspect-[16/10] w-full overflow-hidden" aria-label={`Open ${p.sku}`}>
                  <ProductArt art={p.art} sku={p.sku} className="transition-transform duration-300 group-hover:scale-[1.04]" label={p.name} />
                  <span className="absolute left-2 top-2 rounded-md bg-surface/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-2 shadow-sm">{p.sku}</span>
                  {p.status !== 'active' && <Badge tone="neutral" className="absolute right-2 top-2">Discontinued</Badge>}
                  {p.watch && <Star className="absolute right-2 top-2 size-4 fill-current text-warn" />}
                </button>
                <div className="flex flex-1 flex-col p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{db.brands[p.brandId]?.name}</p>
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{p.familyName ?? p.name}</p>
                  {fam.length > 1 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fam.map((v) => (
                        <button key={v.id} onClick={() => setPicked({ ...pickedVariant, [key]: v.id })} className={cn('rounded-full border px-2 py-0.5 text-[11px]', v.id === p.id ? 'border-brand bg-brand text-white dark:text-forest-950' : 'border-line hover:border-brand')}>
                          {v.variantLabel}
                        </button>
                      ))}
                    </div>
                  ) : (
                    p.variantLabel && <p className="mt-1 text-xs text-muted">{p.variantLabel}</p>
                  )}
                  <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                    <div>
                      {customerView ? (
                        <p className="text-sm font-semibold text-brand">Price on request</p>
                      ) : (
                        <p className="tabular text-sm font-bold">
                          {formatRM(p.basePrice)} <span className="text-[10px] font-normal text-muted">/{p.baseUom} · internal list</span>
                        </p>
                      )}
                      <p className={cn('text-[11px]', (s?.available ?? 0) <= 0 ? 'text-danger' : low ? 'text-warn' : 'text-brand')}>{customerView ? ((s?.available ?? 0) > 0 ? 'In stock' : 'Enquire for lead time') : `${s?.available ?? 0} ${p.baseUom} available`}</p>
                    </div>
                    <Button size="sm" variant={customerView ? 'primary' : 'secondary'} onClick={() => { add({ productId: p.id, qty: 1, uom: p.baseUom }); toast.success(`${p.sku} added to BOQ basket`); }} aria-label={`Add ${p.sku} to BOQ basket`}>
                      {customerView ? 'Request quote' : <><Plus className="size-4" /> BOQ</>}
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
      {families.length > limit && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => setLimit(limit + 36)}>
            Show more ({families.length - limit})
          </Button>
        </div>
      )}
    </>
  );
}

function CatalogTable({ rows, onOpen, customerView }: { rows: Product[]; onOpen: (id: string) => void; customerView: boolean }) {
  const db = useDbState();
  const stock = stockIndex(db);
  const columns = React.useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      { id: 'img', header: '', enableSorting: false, cell: (c) => <div className="h-8 w-11 overflow-hidden rounded-md border border-line"><ProductArt art={c.row.original.art} sku={c.row.original.sku} /></div> },
      { id: 'sku', header: 'SKU', accessorKey: 'sku', cell: (c) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{c.row.original.sku}</span> },
      { id: 'name', header: 'Product', accessorFn: (p) => `${p.name} ${p.variantLabel ?? ''}`, cell: (c) => <span className="line-clamp-1 max-w-[280px]">{c.getValue() as string}</span> },
      { id: 'brand', header: 'Brand', accessorFn: (p) => db.brands[p.brandId]?.name ?? '' },
      { id: 'cat', header: 'Category', accessorFn: (p) => db.categories[p.categoryId]?.name ?? '', cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'uom', header: 'UOM', accessorFn: (p) => [p.baseUom, ...p.uoms.map((u) => `${u.uom}×${u.factor}`)].join(', '), cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'avail', header: 'Available', accessorFn: (p) => stock[p.id]?.available ?? 0, meta: { align: 'right' } },
      { id: 'price', header: customerView ? 'Price' : 'List (internal)', accessorFn: (p) => p.basePrice, meta: { align: 'right' }, cell: (c) => (customerView ? <span className="text-xs text-brand">On request</span> : formatRM(c.getValue() as number)) },
      { id: 'vol', header: 'Volatility', accessorKey: 'volatility', cell: (c) => <Badge tone={c.getValue() === 'high' ? 'red' : c.getValue() === 'medium' ? 'amber' : 'neutral'}>{c.getValue() as string}</Badge> },
      { id: 'status', header: 'Status', accessorKey: 'status', cell: (c) => <Badge tone={c.getValue() === 'active' ? 'green' : 'neutral'}>{c.getValue() as string}</Badge> },
    ],
    [db.brands, db.categories, stock, customerView],
  );
  return <DataTable id="catalog" data={rows} columns={columns} getRowId={(p) => p.id} onRowClick={(p) => onOpen(p.id)} hideSearch exportName="catalog" minWidth={980} />;
}

function ProductDetail({ p, customerView, onSelect }: { p: Product; customerView: boolean; onSelect: (id: string) => void }) {
  const db = useDbState();
  const nav = useNavigate();
  const confirm = useConfirm();
  const add = useBoq((s) => s.add);
  const [edit, setEdit] = React.useState(false);
  const [dup, setDup] = React.useState(false);
  const s = stockIndex(db)[p.id];
  const family = p.familyId ? Object.values(db.products).filter((x) => x.familyId === p.familyId) : [];
  const sources = Object.values(db.supplierProducts).filter((sp) => sp.productId === p.id);
  const quotes = Object.values(db.quotes).filter((q) => q.versions[q.currentVersion - 1].lines.some((l) => l.productId === p.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const rfqs = Object.values(db.rfqs).filter((r) => r.lines.some((l) => l.productId === p.id));
  return (
    <div className="space-y-5">
      <div className="aspect-[16/9] overflow-hidden rounded-2xl border border-line">
        <ProductArt art={p.art} sku={p.sku} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={p.status === 'active' ? 'green' : 'neutral'}>{p.status}</Badge>
        <Badge>{db.categories[p.categoryId]?.name}</Badge>
        <Badge>{db.brands[p.brandId]?.name}</Badge>
        <Badge tone="blue">ABC {p.abc}</Badge>
        <Badge tone={p.volatility === 'high' ? 'red' : p.volatility === 'medium' ? 'amber' : 'neutral'}>{p.volatility} price volatility</Badge>
      </div>
      {family.length > 1 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Variants</p>
          <div className="flex flex-wrap gap-1.5">
            {family.map((v) => (
              <button key={v.id} onClick={() => onSelect(v.id)} className={cn('rounded-full border px-2.5 py-1 text-xs', v.id === p.id ? 'border-brand bg-brand text-white dark:text-forest-950' : 'border-line hover:border-brand')}>
                {v.variantLabel}
              </button>
            ))}
          </div>
        </div>
      )}
      <div data-tour="product-stock" className="grid grid-cols-4 gap-2 text-center">
        {[
          ['On hand', s?.onHand ?? 0],
          ['Reserved', s?.reserved ?? 0],
          ['Available', s?.available ?? 0],
          ['Incoming', s?.incoming ?? 0],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 py-2">
            <p className="text-[10px] text-muted">{k}</p>
            <p className="tabular text-lg font-bold">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-x-6 text-sm sm:grid-cols-2">
        <KV k="List price" v={customerView ? <span className="text-brand">Price on request</span> : `${formatRM(p.basePrice)} / ${p.baseUom}`} />
        <KV k="Lead time" v={`${p.leadTimeDays} days`} />
        <KV k="Barcode" v={<span className="font-mono text-xs">{p.barcode}</span>} />
        <KV k="Weight" v={`${p.weightKg} kg / ${p.baseUom}`} />
        <KV k="Reorder point / qty" v={`${p.reorderPoint} / ${p.reorderQty}`} />
        <KV k="Price effective" v={fmtDate(p.priceEffectiveFrom)} />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Specifications (illustrative)</p>
        <dl className="overflow-hidden rounded-xl border border-line text-sm">
          {Object.entries(p.specs).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-line/70 px-3 py-1.5 last:border-0">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Unit conversions (product-specific)</p>
        <ul className="space-y-1 text-sm">
          {productUoms(p).map((u) => (
            <li key={u.uom} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5">
              <span>
                1 {u.uom} <span className="text-muted">({UOM_LABELS[u.uom]})</span>
              </span>
              <span className="tabular">
                = {u.factor} {p.baseUom}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {p.datasheets.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Technical datasheets</p>
          {p.datasheets.map((d) => (
            <button key={d.name} onClick={() => downloadText(d.name.replace('.pdf', '.txt'), `SAMPLE DATASHEET PLACEHOLDER\n${p.sku} — ${p.name} ${p.variantLabel ?? ''}\n\nThis demo does not include manufacturer documents. Replace with the official datasheet supplied by the manufacturer or distributor.\n`)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-surface-2">
              <FileText className="size-4 text-muted" /> {d.name} <span className="ml-auto text-xs text-muted">{d.sizeKb} KB · placeholder</span>
            </button>
          ))}
        </div>
      )}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Alternatives / substitutes</p>
        <div className="flex flex-wrap gap-1.5">
          {p.substitutes.map((id) => (
            <button key={id} onClick={() => onSelect(id)} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:border-brand">
              {db.products[id]?.sku} {db.products[id]?.variantLabel ?? ''}
            </button>
          ))}
          {!p.substitutes.length && <span className="text-sm text-muted">None recorded</span>}
        </div>
      </div>
      {!customerView && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Supplier sourcing (fictional suppliers)</p>
          <ul className="space-y-1 text-xs">
            {sources.map((sp) => (
              <li key={sp.id} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5">
                <span>
                  {db.suppliers[sp.supplierId]?.name} {sp.supplierId === p.preferredSupplierId && <Badge tone="green">preferred</Badge>}
                </span>
                <span className="tabular">
                  {formatRM(sp.cost)} · MOQ {sp.moq} · {sp.leadTimeDays}d
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Linked quotations & RFQs</p>
        <ul className="space-y-1 text-xs">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link to={`/quotes/${q.id}`} className="flex justify-between rounded-lg px-2 py-1 hover:bg-surface-2">
                <span className="font-mono">{q.number}</span>
                <span className="text-muted">
                  {db.customers[q.customerId]?.name} · {q.status}
                </span>
              </Link>
            </li>
          ))}
          {rfqs.map((r) => (
            <li key={r.id} className="flex justify-between px-2 py-1">
              <span className="font-mono">{r.number}</span>
              <span className="text-muted">{r.status}</span>
            </li>
          ))}
          {!quotes.length && !rfqs.length && <li className="text-muted">None</li>}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button onClick={() => { add({ productId: p.id, qty: 1, uom: p.baseUom }); toast.success('Added to BOQ basket'); }}>
          <ClipboardList className="size-4" /> Add to BOQ
        </Button>
        <Button variant="outline" onClick={() => nav(`/pricing?sku=${p.id}`)}>
          Pricing
        </Button>
        <Button variant="outline" onClick={() => nav(`/inventory?id=${p.id}`)}>
          Stock card
        </Button>
        <Gate perm="po.manage" fallback={null}>
          <Button variant="outline" onClick={() => { const r = act(createRequisition, { lines: [{ productId: p.id, qty: p.reorderQty }], reason: 'Raised from catalog', sourceType: 'manual' }, { success: (x) => `${x.number} created` }); if (r) nav('/procurement?tab=requisitions'); }}>
            Purchase requisition
          </Button>
        </Gate>
        <Button variant="ghost" onClick={() => act(toggleWatch, { productId: p.id }, { success: (w) => (w ? 'Watching' : 'Unwatched') })}>
          <Star className={cn('size-4', p.watch && 'fill-current text-warn')} /> Watch
        </Button>
        <Gate perm="catalog.edit" fallback={null}>
          <Button variant="ghost" onClick={() => setEdit(true)}>
            <Pencil className="size-4" /> Edit
          </Button>
          <Button variant="ghost" onClick={() => setDup(true)}>
            <Copy className="size-4" /> Duplicate variant
          </Button>
          {p.status === 'active' ? (
            <Button variant="ghost" className="text-danger" onClick={async () => { if (await confirm({ title: `Archive ${p.sku}?`, body: 'Discontinued products cannot be added to new quotes. History is kept and you can restore it later.', confirmLabel: 'Archive', danger: true })) act(setProductStatus, { productId: p.id, status: 'discontinued', reason: 'Archived from catalog' }, { success: `${p.sku} archived`, undo: `archive ${p.sku}` }); }}>
              <Archive className="size-4" /> Archive
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => act(setProductStatus, { productId: p.id, status: 'active' }, { success: `${p.sku} restored` })}>
              <RotateCcw className="size-4" /> Restore
            </Button>
          )}
        </Gate>
      </div>
      <ProductFormModal open={edit} onOpenChange={setEdit} product={p} />
      <DupModal open={dup} onOpenChange={setDup} p={p} onDone={onSelect} />
    </div>
  );
}

function DupModal({ open, onOpenChange, p, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; p: Product; onDone: (id: string) => void }) {
  const [sku, setSku] = React.useState(`${p.sku}-V2`);
  const [label, setLabel] = React.useState('');
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={`Duplicate variant of ${p.sku}`} footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!label.trim()} onClick={() => { const r = act(duplicateVariant, { productId: p.id, sku, variantLabel: label }, { success: (x) => `${x.sku} created in the same family` }); if (r) { onOpenChange(false); onDone(r.id); } }}>Create variant</Button></>}>
      <div className="space-y-3">
        <Field label="New SKU">
          <Input value={sku} onChange={(e) => setSku(e.target.value)} />
        </Field>
        <Field label="Variant label (size / thickness / colour)" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. 5" (125 mm)' autoFocus />
        </Field>
        <p className="text-xs text-muted">Copies UOM conversions, supplier, and the current cost/price as a starting point (review in Pricing).</p>
      </div>
    </Modal>
  );
}

const TARGETS = [
  ['sku', 'SKU', true],
  ['name', 'Product name', true],
  ['category', 'Category name', true],
  ['brand', 'Brand name', false],
  ['base_uom', 'Base UOM code', true],
  ['cost', 'Cost RM', true],
  ['price', 'List price RM', true],
  ['variant', 'Variant label', false],
] as const;

function ImportModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDbState();
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [map, setMap] = React.useState<Record<string, string>>({});
  const load = (text: string) => {
    const r = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
    setRows(r.data);
    setHeaders(r.meta.fields ?? []);
    const auto: Record<string, string> = {};
    for (const [k] of TARGETS) {
      const h = (r.meta.fields ?? []).find((f) => f.toLowerCase().replace(/[^a-z]/g, '').includes(k.replace('_', '')));
      if (h) auto[k] = h;
    }
    setMap(auto);
  };
  const sample = () => load('Item Code,Description,Group,Make,Unit,Unit Cost,Selling Price,Size\nPVE-080,PVC elbow 90°,Plumbing,BINA PLASTIC,PCS,6.20,8.40,"3"""\nGLV-PU,PU palm-coated gloves,Safety Products,Generic (unbranded),PAIR,2.30,3.50,\nBAD-ROW,,Unknown Group,,XYZ,abc,,\nPVE-050,Duplicate of existing SKU,Plumbing,BINA PLASTIC,PCS,3.20,4.20,2"');
  const cats = Object.values(db.categories);
  const brands = Object.values(db.brands);
  const preview = rows.map((r, i) => {
    const g = (k: string) => (map[k] ? (r[map[k]] ?? '').trim() : '');
    const errs: string[] = [];
    const cat = cats.find((c) => c.name.toLowerCase() === g('category').toLowerCase());
    const brand = brands.find((b) => b.name.toLowerCase() === g('brand').toLowerCase()) ?? brands.find((b) => b.id === 'b_gen');
    if (!g('sku')) errs.push('SKU missing');
    if (Object.values(db.products).some((p) => p.sku.toLowerCase() === g('sku').toLowerCase())) errs.push('SKU already exists');
    if (!g('name')) errs.push('Name missing');
    if (!cat) errs.push(`Unknown category "${g('category')}"`);
    if (!(g('base_uom') in UOM_LABELS)) errs.push(`Unknown UOM "${g('base_uom')}"`);
    if (!(Number(g('cost')) > 0)) errs.push('Cost invalid');
    if (!(Number(g('price')) > 0)) errs.push('Price invalid');
    return { line: i + 2, r, errs, data: { sku: g('sku'), name: g('name'), categoryId: cat?.id ?? '', brandId: brand?.id ?? 'b_gen', baseUom: g('base_uom') as UomCode, cost: toSen(Number(g('cost'))), basePrice: toSen(Number(g('price'))), variantLabel: g('variant') || undefined } };
  });
  const valid = preview.filter((x) => !x.errs.length);
  const doImport = () => {
    let n = 0;
    for (const v of valid) {
      const r = act(createProduct, { ...v.data, uoms: [], specs: v.data.variantLabel ? { Size: v.data.variantLabel } : {}, description: 'Imported via CSV', art: 'box', weightKg: 1, preferredSupplierId: 's1', leadTimeDays: 5, reorderPoint: 10, reorderQty: 30, volatility: 'low' }, { quiet: true });
      if (r) n++;
    }
    toast.success(`Imported ${n} product(s); ${preview.length - n} row(s) rejected`);
    onOpenChange(false);
    setRows([]);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" title="Batch import products (CSV)" description="Map your file's columns, preview validation, then import valid rows. Rejected rows are listed with reasons." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!valid.length} onClick={doImport}>Import {valid.length} valid row(s)</Button></>}>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 text-sm hover:bg-surface-2">
          <FileUp className="size-4" /> Choose CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); }} />
        </label>
        <Button variant="outline" size="sm" className="h-9" onClick={sample}>
          Load sample with errors
        </Button>
      </div>
      {headers.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Column mapping</p>
          <div className="grid gap-2 sm:grid-cols-4">
            {TARGETS.map(([k, label, req]) => (
              <Field key={k} label={`${label}${req ? ' *' : ''}`}>
                <Select value={map[k] ?? ''} onChange={(e) => setMap({ ...map, [k]: e.target.value })} className="h-9">
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Preview ({valid.length} valid / {preview.length})</p>
          <div className="max-h-56 overflow-auto rounded-xl border border-line text-xs">
            <table className="w-full">
              <tbody>
                {preview.map((x) => (
                  <tr key={x.line} className={cn('border-b border-line/60', x.errs.length && 'bg-danger-soft/40')}>
                    <td className="px-2 py-1.5 text-muted">{x.line}</td>
                    <td className="px-2 py-1.5 font-mono">{x.data.sku || '—'}</td>
                    <td className="px-2 py-1.5">{x.data.name}</td>
                    <td className="px-2 py-1.5">{x.errs.length ? <span className="text-danger">{x.errs.join('; ')}</span> : <span className="text-accent-ink">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

function BoqSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDbState();
  const nav = useNavigate();
  const { lines, project, set, setProject, clear } = useBoq();
  const [cust, setCust] = React.useState('');
  const c = db.customers[cust];
  const stock = stockIndex(db);
  const requestQuote = () => {
    const q = act(createQuote, { customerId: cust, lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, uom: l.uom })), projectRef: project || undefined, notes: project ? `BOQ for ${project}` : 'From BOQ basket' }, { success: (x) => `Quotation request ${x.number} created from BOQ (${lines.length} lines)` });
    if (q) {
      clear();
      onOpenChange(false);
      nav(`/quotes/${q.id}`);
    }
  };
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="BOQ basket" subtitle="Project material list — becomes a quotation request, never a checkout." footer={<><Button variant="ghost" onClick={clear} disabled={!lines.length}><Trash className="size-4" /> Clear</Button><Button disabled={!lines.length || !cust} onClick={requestQuote}><ShoppingCart className="size-4" /> Request quote</Button></>}>
      <div className="space-y-3">
        <Field label="Project / site reference">
          <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g. Taman Contoh shoplot renovation" />
        </Field>
        <Field label="Customer" required>
          <Select value={cust} onChange={(e) => setCust(e.target.value)}>
            <option value="">Select customer…</option>
            {Object.values(db.customers).sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {TIER_LABELS[x.tier]}
              </option>
            ))}
          </Select>
        </Field>
        {!lines.length && <EmptyState icon={<ClipboardList className="size-6" />} title="Basket is empty" body="Add 10–20 mixed SKUs from the catalog; choose any product-specific unit." />}
        <ul className="space-y-2">
          {lines.map((l, i) => {
            const p = db.products[l.productId];
            if (!p) return null;
            const base = toBase(p, l.qty, l.uom);
            return (
              <li key={`${l.productId}${l.uom}`} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name} {p.variantLabel ?? ''}
                  </p>
                  <Button variant="ghost" size="icon-sm" onClick={() => set(lines.filter((_, j) => j !== i))} aria-label="Remove">
                    <Trash className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input type="number" min={1} value={l.qty} onChange={(e) => set(lines.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Number(e.target.value)) } : x)))} className="h-9 w-24" aria-label="Quantity" />
                  <Select value={l.uom} onChange={(e) => set(lines.map((x, j) => (j === i ? { ...x, uom: e.target.value as UomCode } : x)))} className="h-9 w-32" aria-label="Unit">
                    {productUoms(p).map((u) => (
                      <option key={u.uom} value={u.uom}>
                        {u.uom}
                        {u.factor > 1 ? ` ×${u.factor}` : ''}
                      </option>
                    ))}
                  </Select>
                  <span className="text-xs text-muted">
                    = {base} {p.baseUom} · {stock[p.id]?.available ?? 0} avail.
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {c && <p className="text-xs text-muted">Prices will follow {c.name}'s {TIER_LABELS[c.tier]} tier and any contract agreements when the quote is drafted.</p>}
      </div>
    </Drawer>
  );
}
