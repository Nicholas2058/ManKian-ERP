import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { CustomerTier, PosLine, PosSale, Product } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { completePosSale, convertPosToQuote, discardHeldSale, holdPosSale, posTotal, requestPosApproval } from '@/domain/commands/pos';
import { lineIssues, priceLine, resolveRule, TIER_LABELS } from '@/domain/pricing';
import { productStock, stockIndex } from '@/domain/inventory';
import { productUoms } from '@/domain/uom';
import { formatRM, lineTotal, toSen } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { COMPANY } from '@/data/reference';
import { Badge, Button, Card, EmptyState, Field, Input, Select } from '@/components/ui/core';
import { Modal, Segmented } from '@/components/ui/overlay';
import { PageHeader, Gate, DemoNote } from '@/components/widgets';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductArt } from '@/components/art/ProductArt';
import { Minus, Plus, Pause, Play, Printer, ShoppingCart, Trash, FileText, Check, AlertTriangle, Hourglass, Banknote } from '@/components/ui/icons';

export default function PosPage() {
  const db = useDbState();
  const nav = useNavigate();
  const [tier, setTier] = React.useState<CustomerTier>('walkin');
  const [cust, setCust] = React.useState('');
  const [lines, setLines] = React.useState<PosLine[]>([]);
  const [saleId, setSaleId] = React.useState<string | undefined>();
  const [pay, setPay] = React.useState(false);
  const [receipt, setReceipt] = React.useState<PosSale | null>(null);
  const customer = cust ? db.customers[cust] : undefined;
  const effTier = customer?.tier ?? tier;
  const total = posTotal(lines);
  const issues = lines.flatMap((l) => {
    const p = db.products[l.productId];
    return p ? lineIssues({ ...l, priceSource: l.unitPrice !== l.listPrice ? 'manual' : 'tier' }, resolveRule(db, p), db.config).filter((i) => i.needsApproval) : [];
  });
  const sale = saleId ? db.posSales[saleId] : undefined;
  const approval = sale ? Object.values(db.approvals).filter((a) => a.refId === sale.id && a.type === 'pos_discount').sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0] : undefined;
  const approved = approval?.status === 'approved';
  const held = Object.values(db.posSales).filter((s) => s.status === 'held');
  const stock = stockIndex(db);
  const quick = React.useMemo(
    () =>
      Object.values(db.products)
        .filter((p) => p.status === 'active' && ['saf', 'hnd', 'plb', 'chm', 'elc'].includes(p.categoryId) && p.basePrice < 3000)
        .sort((a, b) => (a.abc + a.sku).localeCompare(b.abc + b.sku))
        .slice(0, 12),
    [db.products],
  );
  const add = (p: Product) => {
    const st = productStock(db, p.id);
    if (st.available <= 0) return toast.error(`${p.sku} has no available stock at the counter`);
    const ex = lines.find((l) => l.productId === p.id && l.uom === p.baseUom);
    if (ex) return setLines(lines.map((l) => (l === ex ? reprice({ ...l, qty: l.qty + 1 }) : l)));
    const pr = priceLine(db, p, { customer, tier: effTier, qty: 1, uom: p.baseUom, at: new Date().toISOString() });
    setLines([...lines, { id: `${p.id}_${Date.now()}`, productId: p.id, qty: 1, uom: p.baseUom, factor: 1, unitPrice: pr.unitPrice, listPrice: pr.listPrice, discountPct: 0, unitCost: pr.unitCost }]);
  };
  const reprice = (l: PosLine): PosLine => {
    const p = db.products[l.productId];
    const pr = priceLine(db, p, { customer, tier: effTier, qty: l.qty, uom: l.uom, at: new Date().toISOString() });
    const manual = l.unitPrice !== l.listPrice;
    return { ...l, factor: pr.factor, listPrice: pr.listPrice, unitCost: pr.unitCost, unitPrice: manual ? l.unitPrice : pr.unitPrice };
  };
  React.useEffect(() => {
    setLines((ls) => ls.map((l) => ({ ...reprice(l), unitPrice: priceLine(db, db.products[l.productId], { customer, tier: effTier, qty: l.qty, uom: l.uom, at: new Date().toISOString() }).unitPrice })));
  }, [effTier, cust]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => {
    setLines([]);
    setSaleId(undefined);
    setCust('');
    setTier('walkin');
  };
  const hold = () => {
    const s = act(holdPosSale, { saleId, tier: effTier, customerId: cust || undefined, lines }, { success: (x) => `${x.number} held` });
    if (s) reset();
  };
  const resume = (s: PosSale) => {
    setLines(s.lines);
    setTier(s.tier);
    setCust(s.customerId ?? '');
    setSaleId(s.id);
  };
  return (
    <div>
      <PageHeader
        title="Counter POS"
        subtitle="Internal point of sale for walk-in and trade counter customers. Payments are simulated — no card or QR acquiring."
        actions={
          <Segmented<CustomerTier>
            id="pos-tier"
            value={customer ? customer.tier : tier}
            onChange={(v) => { setTier(v); setCust(''); }}
            options={[
              { value: 'walkin', label: 'Walk-in' },
              { value: 'trade', label: 'Trade' },
              { value: 'contractor', label: 'Contractor' },
            ]}
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Card className="p-4">
            <ProductSearch onPick={add} tier={effTier} customer={customer} autoFocus placeholder="Scan barcode or search product…" />
            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Quick items</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
              {quick.map((p) => (
                <button key={p.id} onClick={() => add(p)} className="overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md">
                  <div className="aspect-[4/3]">
                    <ProductArt art={p.art} sku={p.sku} />
                  </div>
                  <div className="p-1.5">
                    <p className="line-clamp-1 text-[11px] font-medium">{p.variantLabel ?? p.name}</p>
                    <p className="tabular text-[11px] text-muted">
                      {formatRM(priceLine(db, p, { tier: effTier, customer, qty: 1, uom: p.baseUom, at: new Date().toISOString() }).unitPrice)} · {stock[p.id]?.available ?? 0}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Card>
          {held.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Pause className="size-4 text-warn" /> Held sales ({held.length})
              </p>
              <ul className="space-y-1.5">
                {held.map((s) => {
                  const ap = Object.values(db.approvals).find((a) => a.refId === s.id && a.type === 'pos_discount' && a.status !== 'cancelled');
                  return (
                    <li key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-xs">{s.number}</span> · {s.heldLabel} · {formatRM(s.total)}
                      </span>
                      {ap && <Badge tone={ap.status === 'approved' ? 'green' : ap.status === 'pending' ? 'amber' : 'red'}>{ap.status}</Badge>}
                      <Button size="xs" variant="outline" onClick={() => resume(s)}>
                        <Play className="size-3.5" /> Resume
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => act(discardHeldSale, { saleId: s.id }, { success: 'Held sale discarded' })} aria-label="Discard held sale">
                        <Trash className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
        <Card className="flex flex-col lg:col-span-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start">
          <div className="flex items-center justify-between border-b border-line p-4">
            <p className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="size-4" /> Cart {sale && <span className="font-mono text-xs text-muted">{sale.number}</span>}
            </p>
            <Select value={cust} onChange={(e) => setCust(e.target.value)} className="h-8 w-48 text-xs" aria-label="Customer account">
              <option value="">{TIER_LABELS[tier]} (cash)</option>
              {Object.values(db.customers)
                .filter((c) => c.creditLimit > 0)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="scrollbar-thin min-h-[200px] flex-1 space-y-2 overflow-y-auto p-4">
            {!lines.length && <EmptyState icon={<ShoppingCart className="size-6" />} title="Cart is empty" body="Scan or tap products to add them." />}
            <AnimatePresence initial={false}>
              {lines.map((l, i) => {
                const p = db.products[l.productId];
                const st = stock[p.id];
                const need = l.qty * l.factor;
                const li = lineIssues({ ...l, priceSource: l.unitPrice !== l.listPrice ? 'manual' : 'tier' }, resolveRule(db, p), db.config).filter((x) => x.needsApproval);
                return (
                  <motion.div key={l.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-xl border border-line p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">
                          {p.name} {p.variantLabel ?? ''}
                        </p>
                        <p className={cn('text-[11px]', (st?.available ?? 0) < need ? 'text-danger' : 'text-muted')}>
                          {p.sku} · {st?.available ?? 0} available
                        </p>
                      </div>
                      <p className="tabular font-semibold">{formatRM(lineTotal(l.unitPrice, l.qty, l.discountPct))}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-lg border border-line">
                        <button className="grid size-9 place-items-center" onClick={() => setLines(l.qty <= 1 ? lines.filter((_, j) => j !== i) : lines.map((x, j) => (j === i ? reprice({ ...x, qty: x.qty - 1 }) : x)))} aria-label="Decrease">
                          <Minus className="size-4" />
                        </button>
                        <span className="tabular w-8 text-center text-sm font-semibold">{l.qty}</span>
                        <button className="grid size-9 place-items-center" onClick={() => setLines(lines.map((x, j) => (j === i ? reprice({ ...x, qty: x.qty + 1 }) : x)))} aria-label="Increase">
                          <Plus className="size-4" />
                        </button>
                      </div>
                      <Select value={l.uom} onChange={(e) => setLines(lines.map((x, j) => (j === i ? reprice({ ...x, uom: e.target.value as PosLine['uom'], unitPrice: x.listPrice }) : x)))} className="h-9 w-24 text-xs" aria-label="Unit">
                        {productUoms(p).map((u) => (
                          <option key={u.uom} value={u.uom}>
                            {u.uom}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        Disc %
                        <Input type="number" min={0} max={50} value={l.discountPct} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, discountPct: Math.max(0, Number(e.target.value)) } : x)))} className="h-9 w-16" />
                      </label>
                      <span className="text-xs text-muted">@ {formatRM(l.unitPrice)}</span>
                    </div>
                    {li.map((x) => (
                      <p key={x.kind} className="mt-1 flex items-center gap-1 text-[11px] text-danger">
                        <AlertTriangle className="size-3" /> {x.message}
                      </p>
                    ))}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          <div className="border-t border-line p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Total {db.config.tax.enabled ? `(incl. ${db.config.tax.label})` : ''}</span>
              <span className="tabular font-display text-3xl font-extrabold">{formatRM(total + (db.config.tax.enabled ? Math.round((total * db.config.tax.ratePct) / 100) : 0))}</span>
            </div>
            {issues.length > 0 && (
              <div className={cn('mt-2 rounded-lg px-3 py-2 text-xs', approved ? 'bg-accent-soft text-accent-ink' : 'bg-warn-soft text-ink')}>
                {approved ? 'Manager approved this discount.' : approval?.status === 'pending' ? (
                  <span className="flex items-center gap-1">
                    <Hourglass className="size-3.5" /> Waiting for manager approval ({approval.number}) — switch role to Sales Manager and approve in Approvals.
                  </span>
                ) : (
                  'Discount exceeds counter policy: request manager approval or convert to a quotation.'
                )}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!lines.length} onClick={hold}>
                <Pause className="size-4" /> Hold
              </Button>
              {issues.length > 0 && !approved ? (
                <Button variant="outline" disabled={approval?.status === 'pending'} onClick={() => { const r = act(requestPosApproval, { saleId, tier: effTier, customerId: cust || undefined, lines }, { success: 'Approval requested — sale held' }); if (r) setSaleId(r.sale.id); }}>
                  Request approval
                </Button>
              ) : (
                <Button variant="ghost" disabled={!lines.length} onClick={reset}>
                  <Trash className="size-4" /> Clear
                </Button>
              )}
              {issues.length > 0 && !approved && (
                <Button
                  variant="ghost"
                  className="col-span-2"
                  disabled={!lines.length}
                  onClick={() => {
                    const customerId = cust || Object.values(db.customers).find((c) => c.type === (effTier === 'trade' ? 'trade' : 'walkin'))?.id;
                    if (!customerId) return;
                    const q = act(convertPosToQuote, { saleId, customerId, lines }, { success: (x) => `Converted to quotation ${x.number} for approval` });
                    if (q) {
                      reset();
                      nav(`/quotes/${q.id}`);
                    }
                  }}
                >
                  <FileText className="size-4" /> Convert to quotation
                </Button>
              )}
              <Gate perm="pos.sell">
                <Button size="lg" className="col-span-2" disabled={!lines.length || (issues.length > 0 && !approved)} onClick={() => setPay(true)}>
                  <Banknote className="size-5" /> Take payment
                </Button>
              </Gate>
            </div>
          </div>
        </Card>
      </div>
      <PayModal open={pay} onOpenChange={setPay} total={total} onPaid={(method, tendered) => { const s = act(completePosSale, { saleId, tier: effTier, customerId: cust || undefined, lines, payMethod: method, tendered }, { success: (x) => `${x.number} completed · stock updated` }); if (s) { setPay(false); setReceipt(s); reset(); } }} />
      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function PayModal({ open, onOpenChange, total, onPaid }: { open: boolean; onOpenChange: (o: boolean) => void; total: number; onPaid: (m: NonNullable<PosSale['payMethod']>, tendered: number) => void }) {
  const db = useDbState();
  const due = total + (db.config.tax.enabled ? Math.round((total * db.config.tax.ratePct) / 100) : 0);
  const [method, setMethod] = React.useState<NonNullable<PosSale['payMethod']>>('cash');
  const [tendered, setTendered] = React.useState('');
  React.useEffect(() => {
    if (open) setTendered((Math.ceil(due / 1000) * 10).toFixed(2));
  }, [open, due]);
  const t = toSen(Number(tendered) || 0);
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={`Payment · ${formatRM(due)}`} description="Simulated tender — no real card, QR or bank transaction." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={method === 'cash' && t < due} onClick={() => onPaid(method, method === 'cash' ? t : due)}><Check className="size-4" /> Complete sale</Button></>}>
      <Segmented id="pm" value={method} onChange={setMethod} className="w-full [&>button]:flex-1" options={[{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'duitnow', label: 'DuitNow' }, { value: 'bank_transfer', label: 'Transfer' }]} />
      {method === 'cash' ? (
        <div className="mt-4 space-y-3">
          <Field label="Cash tendered (RM)">
            <Input type="number" step="0.10" value={tendered} onChange={(e) => setTendered(e.target.value)} className="h-12 text-lg" />
          </Field>
          <div className="flex gap-2">
            {[due, Math.ceil(due / 1000) * 1000, Math.ceil(due / 5000) * 5000].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
              <Button key={v} size="sm" variant="outline" onClick={() => setTendered((v / 100).toFixed(2))}>
                {formatRM(v)}
              </Button>
            ))}
          </div>
          <p className="text-sm">
            Change: <b className="tabular">{formatRM(Math.max(0, t - due))}</b>
          </p>
        </div>
      ) : (
        <DemoNote className="mt-4">Simulated {method.replace('_', ' ')} approval. A real terminal or DuitNow QR integration would require an acquirer and is out of scope.</DemoNote>
      )}
    </Modal>
  );
}

function ReceiptModal({ sale, onClose }: { sale: PosSale | null; onClose: () => void }) {
  const db = useDbState();
  if (!sale) return null;
  const inv = sale.invoiceId ? db.invoices[sale.invoiceId] : undefined;
  return (
    <Modal open={!!sale} onOpenChange={(o) => !o && onClose()} size="sm" title="Receipt" footer={<><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button><Button onClick={onClose}>New sale</Button></>}>
      <div className="mx-auto max-w-xs rounded-xl border border-dashed border-line-strong bg-surface p-4 font-mono text-xs">
        <p className="text-center font-bold">{COMPANY.shortName} (DEMO)</p>
        <p className="text-center text-[10px] text-muted">{COMPANY.address}</p>
        <p className="mt-2 text-center">
          {sale.number} · {inv?.number}
        </p>
        <p className="text-center text-[10px]">{fmtDateTime(sale.at)} · {sale.cashier}</p>
        <div className="my-2 border-t border-dashed border-line-strong" />
        {sale.lines.map((l) => (
          <div key={l.id} className="flex justify-between gap-2">
            <span className="truncate">
              {l.qty} {l.uom} {db.products[l.productId]?.sku}
            </span>
            <span>{formatRM(lineTotal(l.unitPrice, l.qty, l.discountPct))}</span>
          </div>
        ))}
        <div className="my-2 border-t border-dashed border-line-strong" />
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>{formatRM(sale.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>{sale.payMethod?.replace('_', ' ')}</span>
          <span>{formatRM(sale.tendered ?? sale.total)}</span>
        </div>
        {sale.payMethod === 'cash' && (
          <div className="flex justify-between">
            <span>Change</span>
            <span>{formatRM(Math.max(0, (sale.tendered ?? 0) - sale.total))}</span>
          </div>
        )}
        <p className="mt-3 text-center text-[10px] text-muted">DEMO SAMPLE — not a tax receipt. Fictional prices.</p>
      </div>
    </Modal>
  );
}
