import * as React from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { Quote, QuoteLine, UomCode } from '@/domain/types';
import { useDbState, getDb } from '@/store/db';
import { act } from '@/lib/act';
import * as S from '@/domain/commands/sales';
import { logActivity } from '@/domain/commands/system';
import { lineIssues, lineMarginPct, priceLine, resolveRule, TIER_LABELS } from '@/domain/pricing';
import { productStock } from '@/domain/inventory';
import { creditPosition } from '@/domain/finance';
import { productUoms } from '@/domain/uom';
import { formatPct, formatRM, lineTotal, marginPct, toSen } from '@/lib/money';
import { addDays, fmtDate, fmtDateTime, relTime } from '@/lib/dates';
import { cn, copyText } from '@/lib/utils';
import { useNow, useMediaQuery } from '@/lib/hooks';
import { quotePdf, previewWindow, withMode } from '@/services/pdf';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/core';
import { Modal, Segmented, Tip, useConfirm } from '@/components/ui/overlay';
import { DemoNote, Gate, KV, useMotionOK } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { ProductSearch } from '@/components/ProductSearch';
import { ProductArt } from '@/components/art/ProductArt';
import {
  AlertTriangle, ArrowLeft, Check, Copy, Download, FileText, Lock, Printer, RefreshCw, Send, Trash, X, Truck, Store, PackageCheck, Clock, ShoppingCart, MessageCircle, Plus, Info,
} from '@/components/ui/icons';

export default function QuoteStudio() {
  const { id } = useParams();
  if (id === 'new') return <NewQuote />;
  return <Studio id={id!} />;
}

function NewQuote() {
  const db = useDbState();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const customers = Object.values(db.customers).filter((c) => c.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const [cust, setCust] = React.useState(sp.get('customer') ?? '');
  const [fulfil, setFulfil] = React.useState<'delivery' | 'pickup'>('delivery');
  const c = db.customers[cust];
  const create = () => {
    const q = act(S.createQuote, { customerId: cust, fulfilment: fulfil, siteId: c?.sites[0]?.id }, { success: (x) => `Draft ${x.number} created` });
    if (q) nav(`/quotes/${q.id}`, { replace: true });
  };
  return (
    <div className="mx-auto max-w-xl">
      <Link to="/quotes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Quotations
      </Link>
      <Card className="p-5 sm:p-6">
        <h1 className="font-display text-2xl font-extrabold">New quotation</h1>
        <p className="mt-1 text-sm text-muted">Choose the customer first — tier and contract prices are applied automatically.</p>
        <div className="mt-5 space-y-4">
          <Field label="Customer" required>
            <Select value={cust} onChange={(e) => setCust(e.target.value)} autoFocus>
              <option value="">Select a customer…</option>
              {customers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {TIER_LABELS[x.tier]}
                </option>
              ))}
            </Select>
          </Field>
          {c && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <KV k="Price tier" v={TIER_LABELS[c.tier]} />
              <KV k="Payment terms" v={c.paymentTermsDays ? `${c.paymentTermsDays} days` : 'Cash'} />
              <KV k="Credit limit" v={c.creditLimit ? formatRM(c.creditLimit) : 'Cash customer'} />
            </div>
          )}
          <Field label="Fulfilment">
            <Segmented
              id="nq-ful"
              value={fulfil}
              onChange={setFulfil}
              options={[
                { value: 'delivery', label: 'Delivery' },
                { value: 'pickup', label: 'Self-pickup' },
              ]}
            />
          </Field>
          <Gate perm="quote.create">
            <Button className="w-full" size="lg" disabled={!cust} onClick={create}>
              Create draft quotation
            </Button>
          </Gate>
        </div>
      </Card>
    </div>
  );
}

function Studio({ id }: { id: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const now = useNow();
  const lg = useMediaQuery('(min-width: 1024px)');
  const [mobileTab, setMobileTab] = React.useState<'items' | 'summary'>('items');
  const q = db.quotes[id];
  const [viewVersion, setViewVersion] = React.useState<number | null>(null);
  if (!q)
    return (
      <EmptyState
        icon={<FileText className="size-6" />}
        title="Quotation not found"
        body="It may have been removed by a demo reset."
        action={
          <Button onClick={() => nav('/quotes')}>
            <ArrowLeft className="size-4" /> Back to quotations
          </Button>
        }
      />
    );
  const vNo = viewVersion ?? q.currentVersion;
  const v = q.versions[vNo - 1];
  const editable = vNo === q.currentVersion && !v.frozen && ['draft', 'pending_approval', 'approved'].includes(q.status);
  const c = db.customers[q.customerId];

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/quotes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Quotations
        </Link>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <h1 className="whitespace-nowrap font-display text-xl font-extrabold sm:text-2xl">{q.number}</h1>
          <StatusBadge kind="quote" status={q.status} />
          {q.contractLocked && (
            <Badge tone="violet" icon={<Lock className="size-3" />}>
              Contract-priced lines
            </Badge>
          )}
          {q.channel && <Badge>via {q.channel}</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">Version</span>
          <Select value={vNo} onChange={(e) => setViewVersion(Number(e.target.value) === q.currentVersion ? null : Number(e.target.value))} className="h-8 w-auto text-xs" aria-label="Quote version">
            {q.versions.map((x) => (
              <option key={x.version} value={x.version}>
                v{x.version} {x.frozen ? '(issued, locked)' : x.version === q.currentVersion ? '(current)' : ''}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {vNo !== q.currentVersion && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-info-soft px-4 py-2.5 text-sm text-ink">
          <Lock className="size-4 text-info" /> Viewing historical version v{vNo} ({v.reason}). It is read-only.
          <button className="ml-auto text-xs font-semibold text-info hover:underline" onClick={() => setViewVersion(null)}>
            Back to current
          </button>
        </div>
      )}
      {!lg && (
        <Segmented
          id="qs-mobile"
          className="mb-3 w-full [&>button]:flex-1"
          value={mobileTab}
          onChange={setMobileTab}
          options={[
            { value: 'items', label: `1 · Items (${v.lines.length})` },
            { value: 'summary', label: '2 · Review & actions' },
          ]}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-12">
        {(lg || mobileTab === 'items') && (
          <div className="space-y-4 lg:col-span-7">
            {editable && (
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Add product</p>
                <LineAdder q={q} />
              </Card>
            )}
            <Lines q={q} vNo={vNo} editable={editable} now={now} />
          </div>
        )}
        {(lg || mobileTab === 'summary') && (
          <div className="space-y-4 lg:col-span-5">
            <div className="space-y-4 lg:sticky lg:top-20">
              <Summary q={q} vNo={vNo} editable={editable} now={now} />
            </div>
          </div>
        )}
      </div>
      {!lg && (
        <div className="fixed inset-x-0 bottom-14 z-20 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur">
          <div>
            <p className="text-[11px] text-muted">{c?.name}</p>
            <p className="tabular font-display text-lg font-bold">{formatRM(v.totals.total)}</p>
          </div>
          <Button onClick={() => setMobileTab(mobileTab === 'items' ? 'summary' : 'items')}>{mobileTab === 'items' ? 'Review & actions' : 'Edit items'}</Button>
        </div>
      )}
    </div>
  );
}

function LineAdder({ q }: { q: Quote }) {
  const db = useDbState();
  const c = db.customers[q.customerId];
  const [picked, setPicked] = React.useState<string | null>(null);
  const p = picked ? db.products[picked] : undefined;
  const [qty, setQty] = React.useState('1');
  const [uom, setUom] = React.useState<UomCode>('PCS');
  const family = p?.familyId ? Object.values(db.products).filter((x) => x.familyId === p.familyId && x.status === 'active') : [];
  React.useEffect(() => {
    if (p) {
      setUom(p.baseUom);
      setQty('1');
    }
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const priced = p && Number(qty) > 0 ? priceLine(db, p, { customer: c, qty: Number(qty), uom, at: new Date().toISOString() }) : undefined;
  const st = p ? productStock(db, p.id) : undefined;
  const add = () => {
    if (!p) return;
    const r = act(S.addQuoteLine, { quoteId: q.id, productId: p.id, qty: Number(qty), uom }, { success: `Added ${p.sku}`, undo: `add ${p.sku}` });
    if (r !== undefined) setPicked(null);
  };
  return (
    <div className="space-y-3">
      <ProductSearch onPick={(x) => setPicked(x.id)} customer={c} />
      <AnimatePresence>
        {p && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
              <div className="flex items-start gap-3">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-line">
                  <ProductArt art={p.art} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] text-muted">{p.sku}</p>
                  <p className="text-sm font-medium">
                    {p.name}
                    {p.variantLabel ? ` — ${p.variantLabel}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    {st?.available ?? 0} {p.baseUom} available · {st?.incoming ?? 0} incoming · lead time {p.leadTimeDays}d
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setPicked(null)} aria-label="Clear selection">
                  <X className="size-4" />
                </Button>
              </div>
              {family.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {family.map((f) => (
                    <button key={f.id} onClick={() => setPicked(f.id)} className={cn('rounded-full border px-2.5 py-0.5 text-xs', f.id === p.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface hover:border-brand')}>
                      {f.variantLabel}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Qty" className="w-24">
                  <Input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} invalid={!(Number(qty) > 0)} />
                </Field>
                <Field label="UOM" className="w-36">
                  <Select value={uom} onChange={(e) => setUom(e.target.value as UomCode)}>
                    {productUoms(p).map((u) => (
                      <option key={u.uom} value={u.uom}>
                        {u.uom}
                        {u.factor > 1 ? ` (${u.factor} ${p.baseUom})` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="min-w-0 flex-1 text-xs">
                  {priced && (
                    <>
                      <p className="tabular text-sm font-semibold">
                        {formatRM(priced.unitPrice)} / {uom} {priced.priceSource !== 'tier' && <Badge tone={priced.priceSource === 'contract' ? 'violet' : 'blue'}>{priced.priceSource}</Badge>}
                      </p>
                      <p className={cn(priced.marginPct < priced.rule.minMarginPct ? 'text-danger' : 'text-muted')}>Margin {formatPct(priced.marginPct)}</p>
                    </>
                  )}
                </div>
                <Button onClick={add} disabled={!(Number(qty) > 0)}>
                  <Plus className="size-4" /> Add line
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Lines({ q, vNo, editable, now }: { q: Quote; vNo: number; editable: boolean; now: string }) {
  const db = useDbState();
  const ok = useMotionOK();
  const v = q.versions[vNo - 1];
  if (!v.lines.length)
    return <EmptyState icon={<ShoppingCart className="size-6" />} title="No lines yet" body="Search the catalog above to add products. Prices follow the customer's tier or contract." />;
  return (
    <Card className="divide-y divide-line">
      <AnimatePresence initial={false}>
        {v.lines.map((l, i) => (
          <motion.div key={l.id} layout initial={ok ? { opacity: 0, backgroundColor: 'var(--accent-soft)' } : false} animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35 }}>
            <LineRow q={q} l={l} idx={i} editable={editable} now={now} />
          </motion.div>
        ))}
      </AnimatePresence>
    </Card>
  );
}

function LineRow({ q, l, idx, editable, now }: { q: Quote; l: QuoteLine; idx: number; editable: boolean; now: string }) {
  const db = useDbState();
  const p = db.products[l.productId];
  const rule = resolveRule(db, p);
  const issues = lineIssues(l, rule, db.config);
  const st = productStock(db, l.productId);
  const needBase = l.qty * l.factor;
  const short = Math.max(0, needBase - st.available);
  const m = lineMarginPct(l);
  const latestCostNow = p.latestCost * l.factor;
  const costMoved = Math.abs(latestCostNow - l.unitCost) > 0.5;
  const [price, setPrice] = React.useState((l.unitPrice / 100).toFixed(2));
  const [qty, setQty] = React.useState(String(l.qty));
  const [disc, setDisc] = React.useState(String(l.discountPct));
  React.useEffect(() => {
    setPrice((l.unitPrice / 100).toFixed(2));
    setQty(String(l.qty));
    setDisc(String(l.discountPct));
  }, [l.unitPrice, l.qty, l.discountPct]);
  const commit = (patch: Parameters<typeof S.updateQuoteLine>[2]['patch']) => act(S.updateQuoteLine, { quoteId: q.id, lineId: l.id, patch });
  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span className="tabular mt-1 w-5 text-xs text-muted">{idx + 1}</span>
        <div className="hidden h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-line sm:block">
          <ProductArt art={p.art} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to={`/catalog?id=${p.id}`} className="font-mono text-[11px] text-muted hover:text-brand">
              {p.sku}
            </Link>
            {l.priceSource !== 'tier' && <Badge tone={l.priceSource === 'contract' ? 'violet' : l.priceSource === 'manual' ? 'orange' : 'blue'} icon={l.priceSource === 'contract' ? <Lock className="size-3" /> : undefined}>{l.priceSource === 'bulk' ? 'volume break' : l.priceSource}</Badge>}
          </div>
          <p className="text-sm font-medium leading-snug">{l.description}</p>
        </div>
        <div className="text-right">
          <p className="tabular font-semibold">{formatRM(lineTotal(l.unitPrice, l.qty, l.discountPct))}</p>
          <Tip content={`Internal: unit cost snapshot ${formatRM(l.unitCost)} / ${l.uom}${costMoved ? ` · latest cost now ${formatRM(Math.round(latestCostNow))}` : ''}`}>
            <p className={cn('tabular cursor-help text-xs', m < rule.minMarginPct ? 'font-semibold text-danger' : 'text-muted')}>margin {formatPct(m)}</p>
          </Tip>
        </div>
        {editable && (
          <Button variant="ghost" size="icon-sm" onClick={() => act(S.removeQuoteLine, { quoteId: q.id, lineId: l.id }, { success: `Removed ${p.sku}`, undo: `remove ${p.sku}` })} aria-label={`Remove ${p.sku}`}>
            <Trash className="size-4" />
          </Button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 items-end gap-2 pl-8 sm:grid-cols-4">
        <Field label="Qty">
          {editable ? <Input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} onBlur={() => Number(qty) !== l.qty && commit({ qty: Number(qty) })} className="h-9" /> : <p className="tabular text-sm">{l.qty}</p>}
        </Field>
        <Field label="UOM">
          {editable ? (
            <Select value={l.uom} onChange={(e) => commit({ uom: e.target.value as UomCode })} className="h-9">
              {productUoms(p).map((u) => (
                <option key={u.uom} value={u.uom}>
                  {u.uom}
                  {u.factor > 1 ? ` ×${u.factor}` : ''}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm">{l.uom}</p>
          )}
        </Field>
        <Field label={<span title={`List price ${formatRM(l.listPrice)}`}>Price <span className="font-normal text-muted">· list {formatRM(l.listPrice).replace('RM ', '')}</span></span>}>
          {editable ? <Input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => toSen(Number(price)) !== l.unitPrice && Number(price) > 0 && commit({ unitPrice: toSen(Number(price)) })} className="h-9" /> : <p className="tabular text-sm">{formatRM(l.unitPrice)}</p>}
        </Field>
        <Field label="Discount %">
          {editable ? <Input type="number" min={0} max={60} step="0.5" value={disc} onChange={(e) => setDisc(e.target.value)} onBlur={() => Number(disc) !== l.discountPct && commit({ discountPct: Number(disc) })} className="h-9" /> : <p className="tabular text-sm">{l.discountPct}%</p>}
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-8 text-xs">
        {short > 0 ? (
          <span className="flex items-center gap-1 text-warn">
            <Clock className="size-3.5" /> {st.available} {p.baseUom} available now — {short} on backorder (est. {fmtDate(addDays(now, p.leadTimeDays))})
          </span>
        ) : (
          <span className="flex items-center gap-1 text-brand">
            <PackageCheck className="size-3.5" /> In stock ({st.available} {p.baseUom} available)
          </span>
        )}
        {l.factor > 1 && (
          <span className="text-muted">
            = {needBase} {p.baseUom} ({l.factor} per {l.uom})
          </span>
        )}
        {costMoved && !q.versions[q.currentVersion - 1].frozen && <span className="text-orange">Cost moved since priced</span>}
      </div>
      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 pl-8">
          {issues.map((i) => (
            <li key={i.kind} className={cn('flex items-center gap-1.5 text-xs', i.needsApproval ? 'text-danger' : 'text-violet')}>
              {i.needsApproval ? <AlertTriangle className="size-3.5" /> : <Lock className="size-3.5" />} {i.message} {i.needsApproval && '— manager approval required'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function waText(db: ReturnType<typeof getDb>, q: Quote) {
  const v = q.versions[q.currentVersion - 1];
  const c = db.customers[q.customerId];
  const lines = v.lines.map((l, i) => `${i + 1}. ${l.description} — ${l.qty} ${l.uom} @ ${formatRM(l.unitPrice)}${l.discountPct ? ` (−${l.discountPct}%)` : ''} = ${formatRM(lineTotal(l.unitPrice, l.qty, l.discountPct))}`);
  return [
    `*Quotation ${q.number} (v${v.version})* — MK Hardware (DEMO)`,
    `To: ${c?.name}`,
    '',
    ...lines,
    v.totals.freight ? `Delivery: ${formatRM(v.totals.freight)}` : '',
    `*Total: ${formatRM(v.totals.total)}*`,
    v.expiresAt ? `Valid until ${fmtDate(v.expiresAt)}.` : `Valid ${v.validityDays} day(s) from issue.`,
    'Stock is confirmed when the order is placed.',
    '_Demo sample — fictional prices._',
  ]
    .filter((x) => x !== '')
    .join('\n');
}

function Summary({ q, vNo, editable, now }: { q: Quote; vNo: number; editable: boolean; now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const confirm = useConfirm();
  const v = q.versions[vNo - 1];
  const c = db.customers[q.customerId];
  const cp = creditPosition(db, q.customerId, now, q.status === 'accepted' ? v.totals.total : 0);
  const issues = v.lines.flatMap((l) => lineIssues(l, resolveRule(db, db.products[l.productId]), db.config)).filter((i) => i.needsApproval);
  const backorders = v.lines.filter((l) => productStock(db, l.productId).available < l.qty * l.factor);
  const pendingAp = q.approvalIds.map((id) => db.approvals[id]).filter((a) => a?.status === 'pending');
  const [freight, setFreight] = React.useState((v.freight / 100).toFixed(2));
  const [notes, setNotes] = React.useState(v.notes);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [convertOpen, setConvertOpen] = React.useState(false);
  React.useEffect(() => {
    setFreight((v.freight / 100).toFixed(2));
    setNotes(v.notes);
  }, [v.freight, v.notes]);
  const current = q.versions[q.currentVersion - 1];
  const snapshotDiff = current.frozen
    ? current.lines.reduce((s, l) => {
        const p = db.products[l.productId];
        const now2 = priceLine(db, p, { customer: c, qty: l.qty, uom: l.uom, at: new Date().toISOString() });
        return s + (now2.unitPrice - l.unitPrice) * l.qty;
      }, 0)
    : 0;
  const expired = current.expiresAt && current.expiresAt < now && q.status === 'issued';

  const pdf = (preview: boolean) => {
    const mode = preview ? previewWindow() : 'download';
    void withMode(mode, () => quotePdf(getDb(), q, vNo)).then(() => act(logActivity, { entityType: 'quote', entityId: q.id, entityRef: q.number, action: 'quote.pdf', summary: `${q.number} v${vNo} PDF ${preview ? 'previewed' : 'downloaded'} (DEMO SAMPLE)` }, { quiet: true }));
  };
  const copyWa = async () => {
    const okc = await copyText(waText(db, q));
    if (okc) {
      toast.success('Quotation copied — paste into WhatsApp (nothing was sent)');
      act(logActivity, { entityType: 'quote', entityId: q.id, entityRef: q.number, action: 'quote.copied', summary: `${q.number} copied as message text` }, { quiet: true });
    } else toast.error('Clipboard unavailable in this browser');
  };

  return (
    <>
      {q.recheck && vNo === q.currentVersion && (
        <div data-tour="quote-recheck" className={cn('rounded-2xl border p-4', q.recheck.kind === 'cost_increase' ? 'border-orange/40 bg-orange-soft/60' : 'border-info/40 bg-info-soft/60')}>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <RefreshCw className="size-4" /> {q.recheck.kind === 'cost_increase' ? 'Needs recheck — supplier cost increased' : 'Price updated — reprice available'}
          </p>
          <p className="mt-1 text-xs text-ink-2">{q.recheck.reason}</p>
          <p className="mt-1 text-[11px] text-muted">Flagged {relTime(q.recheck.at, now)} · affected: {q.recheck.productIds.map((id) => db.products[id]?.sku).join(', ')}</p>
          <Gate perm="quote.create">
            <Button size="sm" className="mt-3" onClick={() => act(S.repriceQuote, { quoteId: q.id }, { success: (x) => `Repriced as v${x.version} — previous version kept in history` })}>
              <RefreshCw className="size-4" /> Reprice (creates v{q.versions.length + 1})
            </Button>
          </Gate>
        </div>
      )}
      {q.status === 'issued' && vNo === q.currentVersion && (
        <div className="rounded-2xl border border-info/30 bg-info-soft/50 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Lock className="size-4 text-info" /> Issued snapshot is immutable
          </p>
          <p className="mt-1 text-xs text-ink-2">
            Issued {fmtDateTime(current.issuedAt)} · valid until {fmtDateTime(current.expiresAt)}. {Math.abs(snapshotDiff) > 50 ? `Today's prices would differ by ${formatRM(snapshotDiff, { sign: true })} — the customer keeps the quoted price.` : 'Current prices match the snapshot.'}
          </p>
          {expired && <p className="mt-1 text-xs font-semibold text-danger">Validity has lapsed — revise and re-issue.</p>}
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/customers?id=${c?.id}`} className="font-semibold hover:text-brand">
              {c?.name}
            </Link>
            <p className="text-xs text-muted">
              {TIER_LABELS[c?.tier ?? 'walkin']} tier · {c?.paymentTermsDays ? `${c.paymentTermsDays}-day terms` : 'cash'} · {c?.contacts[0]?.name}
            </p>
          </div>
          <Badge tone={cp.status === 'ok' ? 'green' : cp.status === 'near' ? 'amber' : 'red'}>{cp.status === 'ok' ? 'Credit OK' : cp.status === 'near' ? 'Near limit' : cp.status === 'over' ? 'Over limit' : 'Blocked (overdue)'}</Badge>
        </div>
        {c?.creditLimit ? (
          <p className="mt-2 text-xs text-muted">
            Exposure {formatRM(cp.exposure)} of {formatRM(cp.limit)} limit{cp.overdue ? ` · ${formatRM(cp.overdue)} overdue` : ''}
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Site">
            <Select value={q.siteId ?? ''} disabled={!editable} onChange={(e) => act(S.updateQuoteHeader, { quoteId: q.id, patch: { siteId: e.target.value } })} className="h-9">
              {c?.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {!c?.sites.length && <option value="">Counter</option>}
            </Select>
          </Field>
          <Field label="Validity">
            <Select value={v.validityDays} disabled={!editable} onChange={(e) => act(S.updateQuoteHeader, { quoteId: q.id, patch: { validityDays: Number(e.target.value) } })} className="h-9">
              {db.config.quoteValidityOptions.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? 'Same day' : `${d} days`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fulfilment">
            <Select value={q.fulfilment} disabled={!editable} onChange={(e) => act(S.updateQuoteHeader, { quoteId: q.id, patch: { fulfilment: e.target.value as 'delivery' | 'pickup' } })} className="h-9">
              <option value="delivery">Delivery</option>
              <option value="pickup">Self-pickup</option>
            </Select>
          </Field>
          <Field label="Freight (RM)">
            <Input type="number" step="1" min={0} value={freight} disabled={!editable} onChange={(e) => setFreight(e.target.value)} onBlur={() => toSen(Number(freight)) !== v.freight && act(S.updateQuoteHeader, { quoteId: q.id, patch: { freight: toSen(Number(freight) || 0) } })} className="h-9" />
          </Field>
        </div>
        <Field label="Notes on quotation" className="mt-2">
          <Textarea value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== v.notes && act(S.updateQuoteHeader, { quoteId: q.id, patch: { notes } })} className="min-h-[60px]" />
        </Field>
      </Card>

      <Card className="p-4">
        <KV k="Subtotal" v={formatRM(v.totals.subtotal)} />
        {v.totals.discount > 0 && <KV k="Line discounts" v={`−${formatRM(v.totals.discount)}`} />}
        <KV k="Freight" v={formatRM(v.totals.freight)} />
        <KV k={db.config.tax.enabled ? `${db.config.tax.label} ${db.config.tax.ratePct}%` : `${db.config.tax.label} (not configured)`} v={formatRM(v.totals.tax)} />
        <div className="my-2 h-px bg-line" />
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Total</span>
          <span className="tabular font-display text-2xl font-extrabold">{formatRM(v.totals.total)}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3 text-center text-xs">
          <div>
            <p className="text-muted">Cost (internal)</p>
            <p className="tabular font-semibold">{formatRM(v.totals.cost)}</p>
          </div>
          <div>
            <p className="text-muted">Gross profit</p>
            <p className="tabular font-semibold">{formatRM(v.totals.subtotal - v.totals.discount - v.totals.cost)}</p>
          </div>
          <div>
            <p className="text-muted">Margin</p>
            <p className={cn('tabular font-semibold', v.totals.marginPct < db.config.minMarginPct ? 'text-danger' : 'text-brand')}>{formatPct(v.totals.marginPct)}</p>
          </div>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <Truck className="size-3.5 shrink-0" />
          {backorders.length ? `${backorders.length} line(s) not fully in stock — estimated full fulfilment ${fmtDate(addDays(now, Math.max(...backorders.map((l) => db.products[l.productId].leadTimeDays))))}. Quoting does not reserve stock.` : 'All lines available now. Quoting does not reserve stock — reservation happens on the sales order.'}
        </p>
      </Card>

      {issues.length > 0 && ['draft', 'pending_approval'].includes(q.status) && (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/50 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <AlertTriangle className="size-4" /> Approval required before issue
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-2">
            {issues.map((i, k) => (
              <li key={k}>
                {db.products[i.productId]?.sku}: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {q.reissue && q.status === 'draft' && <DemoNote>Re-issuing an expired quotation requires Sales Manager approval.</DemoNote>}

      <Card className="p-4" data-tour="quote-actions">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Actions</p>
        <div className="flex flex-wrap gap-2">
          {q.status === 'draft' && vNo === q.currentVersion && (
            <Gate perm="quote.create">
              <Button disabled={!v.lines.length} onClick={() => act(S.submitQuote, { quoteId: q.id }, { success: (r) => (r.status === 'approved' ? 'Within policy — auto-approved. Ready to issue.' : 'Submitted to Sales Manager for approval') })}>
                <Send className="size-4" /> Submit for approval
              </Button>
            </Gate>
          )}
          {q.status === 'pending_approval' && (
            <Gate perm="quote.approve">
              <Button onClick={() => act(S.decideQuote, { quoteId: q.id, approve: true, note: 'Approved in Quotation Studio' }, { success: `${q.number} approved` })}>
                <Check className="size-4" /> Approve
              </Button>
              <Button variant="outline" onClick={() => act(S.decideQuote, { quoteId: q.id, approve: false, note: 'Returned for pricing changes' }, { success: 'Returned to draft' })}>
                <X className="size-4" /> Return to draft
              </Button>
            </Gate>
          )}
          {q.status === 'approved' && (
            <Gate perm="quote.issue">
              <Button onClick={() => act(S.issueQuote, { quoteId: q.id }, { success: (x) => `Issued — valid until ${fmtDate(x.expiresAt)}` })}>
                <Lock className="size-4" /> Issue quotation
              </Button>
            </Gate>
          )}
          {['approved', 'issued', 'accepted', 'converted', 'expired', 'rejected'].includes(q.status) && (
            <>
              <Button variant="outline" onClick={() => pdf(false)}>
                <Download className="size-4" /> PDF
              </Button>
              <Button variant="outline" onClick={() => pdf(true)}>
                <Printer className="size-4" /> Print preview
              </Button>
            </>
          )}
          {q.status === 'issued' && (
            <>
              <Button variant="outline" onClick={copyWa}>
                <Copy className="size-4" /> Copy as message
              </Button>
              <Button variant="outline" onClick={() => setSendOpen(true)}>
                <Send className="size-4" /> Send (simulated)
              </Button>
              <Button onClick={() => act(S.markQuoteAccepted, { quoteId: q.id }, { success: 'Marked accepted — convert it to a sales order' })}>
                <Check className="size-4" /> Mark accepted
              </Button>
              <Button variant="ghost" onClick={() => setRejectOpen(true)}>
                Mark rejected
              </Button>
            </>
          )}
          {q.status === 'accepted' && (
            <Gate perm="order.create">
              <Button onClick={() => setConvertOpen(true)}>
                <ShoppingCart className="size-4" /> Convert to sales order
              </Button>
            </Gate>
          )}
          {q.status === 'converted' && q.orderId && (
            <Button onClick={() => nav(`/orders?id=${q.orderId}`)}>
              <ShoppingCart className="size-4" /> Open {db.salesOrders[q.orderId]?.number}
            </Button>
          )}
          {['issued', 'expired', 'rejected', 'approved'].includes(q.status) && (
            <Gate perm="quote.create" fallback={null}>
              <Button
                variant="outline"
                onClick={async () => {
                  const okr = await confirm({ title: `Revise ${q.number}?`, body: `Creates editable v${q.versions.length + 1}. v${q.currentVersion} stays in history${q.status === 'issued' ? ' and remains the customer-facing snapshot until re-issued' : ''}.`, confirmLabel: 'Create revision' });
                  if (okr) act(S.reviseQuote, { quoteId: q.id, reason: q.status === 'expired' ? 'Re-issue after expiry' : 'Customer requested changes' }, { success: (x) => `Revision v${x.version} created` });
                }}
              >
                <RefreshCw className="size-4" /> Revise
              </Button>
            </Gate>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              const d = act(S.duplicateQuote, { quoteId: q.id }, { success: (x) => `Duplicated as ${x.number} at current prices` });
              if (d) nav(`/quotes/${d.id}`);
            }}
          >
            <Copy className="size-4" /> Duplicate
          </Button>
        </div>
        {pendingAp.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warn">
            <Clock className="size-3.5" /> Waiting for {pendingAp[0].requiredRoles.join(' / ').replace('_', ' ')} · {pendingAp[0].number}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Version history</p>
        <ol className="space-y-2 text-xs">
          {[...q.versions].reverse().map((x) => (
            <li key={x.version} className="flex items-start gap-2">
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', x.frozen ? 'bg-info-soft text-info' : 'bg-surface-3 text-muted')}>{x.version}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{x.reason}</span>
                <span className="block text-muted">
                  {fmtDateTime(x.createdAt)} · {x.createdBy} · {formatRM(x.totals.total)} · margin {formatPct(x.totals.marginPct)}
                  {x.issuedAt && ` · issued ${fmtDate(x.issuedAt)}, expiry ${fmtDate(x.expiresAt)}`}
                </span>
              </span>
              {x.frozen && <Lock className="size-3.5 text-info" />}
            </li>
          ))}
        </ol>
      </Card>

      <RejectModal open={rejectOpen} onOpenChange={setRejectOpen} q={q} />
      <SendModal open={sendOpen} onOpenChange={setSendOpen} q={q} text={waText(db, q)} />
      <ConvertModal open={convertOpen} onOpenChange={setConvertOpen} q={q} />
    </>
  );
}

function RejectModal({ open, onOpenChange, q }: { open: boolean; onOpenChange: (o: boolean) => void; q: Quote }) {
  const [reason, setReason] = React.useState('Price higher than competitor');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Mark ${q.number} rejected`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => act(S.markQuoteRejected, { quoteId: q.id, reason }, { success: 'Quotation marked rejected' }) !== undefined && onOpenChange(false)}>
            Mark rejected
          </Button>
        </>
      }
    >
      <Field label="Reason (for win/loss analysis)">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {['Price higher than competitor', 'Lead time too long', 'Project postponed', 'Customer bought elsewhere', 'Specification changed'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

function SendModal({ open, onOpenChange, q, text }: { open: boolean; onOpenChange: (o: boolean) => void; q: Quote; text: string }) {
  const db = useDbState();
  const c = db.customers[q.customerId];
  const [channel, setChannel] = React.useState<'email' | 'whatsapp'>('email');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Send quotation (simulation)"
      description="No email or WhatsApp message is sent from this demo. A real integration would require the client's approved accounts."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {channel === 'whatsapp' && (
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium hover:bg-surface-2">
              <MessageCircle className="size-4" /> Open WhatsApp (you choose the chat)
            </a>
          )}
          <Button
            onClick={() => {
              act(logActivity, { entityType: 'quote', entityId: q.id, entityRef: q.number, action: 'quote.send_simulated', summary: `${q.number} send simulated via ${channel} to ${c?.contacts[0]?.name ?? c?.name} (nothing sent)` }, { success: 'Logged as sent (simulation — nothing left this browser)' });
              onOpenChange(false);
            }}
          >
            <Send className="size-4" /> Log simulated send
          </Button>
        </>
      }
    >
      <Segmented
        id="send-ch"
        value={channel}
        onChange={setChannel}
        options={[
          { value: 'email', label: 'Email' },
          { value: 'whatsapp', label: 'WhatsApp' },
        ]}
      />
      <p className="mt-3 text-xs text-muted">To: {channel === 'email' ? c?.contacts[0]?.email ?? c?.email : `${c?.contacts[0]?.name} (${c?.contacts[0]?.phone}) — fictional`}</p>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-xs text-ink-2">{text}</pre>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Info className="size-3.5" /> The PDF would be attached in a real integration.
      </p>
    </Modal>
  );
}

function ConvertModal({ open, onOpenChange, q }: { open: boolean; onOpenChange: (o: boolean) => void; q: Quote }) {
  const nav = useNavigate();
  const [date, setDate] = React.useState(addDays(new Date().toISOString(), 2).slice(0, 10));
  const [fulfil, setFulfil] = React.useState<'delivery' | 'pickup'>(q.fulfilment);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Convert ${q.number} to a sales order`}
      description="Prices and line IDs are copied from the accepted version. Stock is reserved as a separate, explicit step."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const o = act(S.convertQuoteToOrder, { quoteId: q.id, requiredDate: new Date(`${date}T17:00:00+08:00`).toISOString(), fulfilment: fulfil }, { success: (x) => (x.creditStatus === 'pending_override' ? `${x.number} created — ON CREDIT HOLD, override required` : `${x.number} created — now reserve stock`) });
              if (o) {
                onOpenChange(false);
                nav(`/orders?id=${o.id}`);
              }
            }}
          >
            <ShoppingCart className="size-4" /> Create sales order
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Required date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Fulfilment">
          <Segmented
            id="cv-ful"
            value={fulfil}
            onChange={setFulfil}
            options={[
              { value: 'delivery', label: <span className="flex items-center gap-1"><Truck className="size-3.5" /> Delivery</span> },
              { value: 'pickup', label: <span className="flex items-center gap-1"><Store className="size-3.5" /> Pickup</span> },
            ]}
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">A credit check runs on conversion. If the customer exceeds their limit or has invoices overdue beyond {getDb().config.overdueBlockDays} days, the order is held for a Finance/Owner override.</p>
    </Modal>
  );
}
