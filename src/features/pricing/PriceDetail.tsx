import * as React from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import type { Product, Sen } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { floorPrice, landedCost, resolveRule, suggestedPrice, tierPrice, TIERS, TIER_LABELS, productPriceStatus } from '@/domain/pricing';
import { approvePriceChange, proposeCostChange, proposeManualPrice, rejectPriceChange } from '@/domain/commands/pricing';
import { toggleWatch } from '@/domain/commands/catalog';
import { formatPct, formatRM, marginPct, markupPct, pctChange, toSen } from '@/lib/money';
import { fmtDate, fmtShort } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Badge, Button, Field, Input, Textarea } from '@/components/ui/core';
import { Modal, Tip } from '@/components/ui/overlay';
import { Gate, KV, useMotionOK } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { ChartTip, Waterfall } from '@/components/charts/Charts';
import { ProductArt } from '@/components/art/ProductArt';
import { Check, Info, Lock, RotateCcw, Star, X, Calculator, Pencil } from '@/components/ui/icons';

export function PriceDetail({ product: p, onClose }: { product: Product; onClose?: () => void }) {
  const db = useDbState();
  const ok = useMotionOK();
  const rule = resolveRule(db, p);
  const status = productPriceStatus(db, p);
  const pending = p.pendingChangeId ? db.priceChanges[p.pendingChangeId] : undefined;
  const suggested = suggestedPrice(p.latestCost, rule);
  const floor = floorPrice(p.latestCost, rule);
  const [propose, setPropose] = React.useState(false);
  const [landed, setLanded] = React.useState(false);
  const [finalPrice, setFinalPrice] = React.useState('');
  React.useEffect(() => {
    setFinalPrice(pending ? (pending.proposedPrice / 100).toFixed(2) : '');
  }, [pending]);
  const history = React.useMemo(() => Object.values(db.priceHistory).filter((h) => h.productId === p.id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)), [db.priceHistory, p.id]);
  const versions = React.useMemo(() => Object.values(db.costVersions).filter((c) => c.productId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.costVersions, p.id]);
  const agreements = Object.values(db.agreements).filter((a) => a.productId === p.id || (!a.productId && a.categoryId === p.categoryId));
  const chart = history.map((h) => ({ label: fmtShort(h.effectiveFrom), price: h.basePrice / 100, cost: h.cost / 100 }));
  if (pending) chart.push({ label: 'Proposed', price: pending.proposedPrice / 100, cost: pending.newCost / 100 });
  const contractorPrice = tierPrice(p.basePrice, 'contractor', rule);

  return (
    <div className="space-y-5" data-tour="pricing-detail">
      <div className="flex items-start gap-3">
        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl border border-line">
          <ProductArt art={p.art} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold text-muted">{p.sku}</p>
          <p className="font-semibold leading-snug text-ink">
            {p.name}
            {p.variantLabel ? ` — ${p.variantLabel}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge kind="price" status={status} />
            <Badge>{db.categories[p.categoryId]?.name}</Badge>
            <Badge tone={p.volatility === 'high' ? 'red' : p.volatility === 'medium' ? 'amber' : 'neutral'}>{p.volatility} volatility</Badge>
          </div>
        </div>
        <div className="flex shrink-0">
          <Tip content={p.watch ? 'Remove from watchlist' : 'Add to watchlist'}>
            <Button variant="ghost" size="icon-sm" onClick={() => act(toggleWatch, { productId: p.id }, { success: (w) => (w ? 'Added to watchlist' : 'Removed from watchlist') })} aria-label="Toggle watchlist">
              <Star className={cn('size-4', p.watch && 'fill-current text-warn')} />
            </Button>
          </Tip>
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close detail">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Metric label="Latest supplier cost" value={formatRM(p.latestCost)} sub={p.latestCost !== p.cost ? `approved basis ${formatRM(p.cost)}` : `per ${p.baseUom}`} tone={p.latestCost > p.cost ? 'danger' : undefined} />
        <Metric label="Approved list price" value={formatRM(p.basePrice)} sub={`effective ${fmtDate(p.priceEffectiveFrom)}`} />
        <Metric label="Gross margin @ list" value={formatPct(marginPct(p.basePrice, p.latestCost))} sub={`floor ${rule.minMarginPct}% · target ${rule.targetMarginPct}%`} tone={marginPct(p.basePrice, p.latestCost) < rule.minMarginPct ? 'danger' : undefined} />
        <Metric label="Markup @ list" value={formatPct(markupPct(p.basePrice, p.latestCost))} sub="(price − cost) ÷ cost" />
      </div>

      <div className="rounded-xl border border-line bg-surface-2 p-3.5 text-xs leading-relaxed text-ink-2">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <Info className="size-3.5 text-brand" /> How the suggested price is calculated ({rule.name})
        </p>
        {rule.method === 'margin' ? (
          <p>
            Suggested = latest landed cost ÷ (1 − target margin) = {formatRM(p.latestCost)} ÷ (1 − {rule.targetMarginPct}%) ={' '}
            <b className="text-brand">{formatRM(suggested)}</b>, rounded up to the next {rule.roundingSen} sen.
          </p>
        ) : (
          <p>
            Suggested = cost × (1 + markup) = {formatRM(p.latestCost)} × (1 + {rule.markupPct}%) = <b className="text-brand">{formatRM(suggested)}</b>.
          </p>
        )}
        <p className="mt-1">
          Margin floor price ({rule.minMarginPct}% margin) = <b>{formatRM(floor)}</b>. Margin % = (price − cost) ÷ price; markup % = (price − cost) ÷ cost — they are different numbers.
        </p>
      </div>

      {pending && (
        <div className="rounded-2xl border border-warn/40 bg-warn-soft/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Pending {pending.number}</p>
            <StatusBadge kind="change" status="pending" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 text-sm">
            <KV k="Cost" v={<span>{formatRM(pending.oldCost)} → <b className="text-danger">{formatRM(pending.newCost)}</b> <span className="text-xs">({formatPct(pctChange(pending.oldCost, pending.newCost), 1, true)})</span></span>} />
            <KV k="Price" v={<span>{formatRM(pending.oldPrice)} → <b>{formatRM(pending.proposedPrice)}</b></span>} />
            <KV k="Source" v={pending.source.replace('_', ' ')} />
            <KV k="Margin at proposed" v={formatPct(marginPct(pending.proposedPrice, pending.newCost))} />
          </div>
          <p className="mt-1 text-xs text-muted">{pending.reason}</p>
          <Gate perm="price.approve">
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Final approved price (RM)" className="w-40">
                <Input type="number" step="0.05" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} />
              </Field>
              <Button onClick={() => act(approvePriceChange, { changeId: pending.id, price: toSen(Number(finalPrice)) }, { success: `Approved — ${p.sku} now ${formatRM(toSen(Number(finalPrice)))}` })} disabled={!(Number(finalPrice) > 0)}>
                <Check className="size-4" /> Approve
              </Button>
              <Button variant="outline" onClick={() => act(rejectPriceChange, { changeId: pending.id, note: 'Rejected from pricing detail' }, { success: 'Price change rejected' })}>
                Reject
              </Button>
            </div>
          </Gate>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Customer tier prices (per {p.baseUom})</p>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody>
              {TIERS.map((t) => {
                const price = tierPrice(p.basePrice, t, rule);
                const m = marginPct(price, p.latestCost);
                return (
                  <tr key={t} className="border-b border-line/70 last:border-0">
                    <td className="px-3 py-2 text-ink-2">
                      {TIER_LABELS[t]} <span className="text-xs text-muted">(−{rule.tierDiscountPct[t]}%)</span>
                    </td>
                    <td className="tabular px-3 py-2 text-right font-semibold">{formatRM(price)}</td>
                    <td className={cn('tabular px-3 py-2 text-right text-xs', m < rule.minMarginPct ? 'font-semibold text-danger' : 'text-muted')}>
                      {formatPct(m)} {m < rule.minMarginPct && '· needs approval'}
                    </td>
                  </tr>
                );
              })}
              {agreements.map((a) => {
                const price = a.kind === 'fixed' ? a.fixedPrice ?? 0 : Math.round(p.basePrice * (1 - (a.discountPct ?? 0) / 100));
                return (
                  <tr key={a.id} className="border-b border-line/70 bg-violet-soft/40 last:border-0">
                    <td className="px-3 py-2 text-ink-2">
                      <span className="flex items-center gap-1">
                        <Lock className="size-3 text-violet" /> {db.customers[a.customerId]?.name}
                      </span>
                      <span className="text-[11px] text-muted">{a.reference} · to {fmtDate(a.validTo)}</span>
                    </td>
                    <td className="tabular px-3 py-2 text-right font-semibold">{formatRM(price)}</td>
                    <td className={cn('tabular px-3 py-2 text-right text-xs', marginPct(price, p.latestCost) < rule.minMarginPct ? 'text-danger' : 'text-muted')}>{formatPct(marginPct(price, p.latestCost))} · contract</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rule.bulkBreaks.length > 0 && <p className="mt-1.5 text-[11px] text-muted">Volume breaks: {rule.bulkBreaks.map((b) => `≥${b.minQty} ${p.baseUom} −${b.discountPct}%`).join(' · ')}</p>}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Profitability waterfall · contractor tier, per {p.baseUom}</p>
        <Waterfall
          format={(v) => formatRM(v)}
          steps={[
            { label: 'List price', value: p.basePrice, kind: 'total' },
            { label: 'Tier discount', value: contractorPrice - p.basePrice, kind: 'delta' },
            { label: 'Cost', value: -p.latestCost, kind: 'delta' },
            { label: 'Gross margin', value: contractorPrice - p.latestCost, kind: 'total' },
          ]}
        />
      </div>

      <div data-tour="price-history">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Price & cost history (RM per {p.baseUom})</p>
        <div className="h-48">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--chart-axis)" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--chart-axis)" fontSize={10} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
              <Tooltip content={<ChartTip format={(v) => `RM ${v.toFixed(2)}`} />} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
              <Line type="stepAfter" dataKey="price" name="List price" stroke="var(--chart-brand)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={ok} />
              <Line type="stepAfter" dataKey="cost" name="Cost" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={ok} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cost versions</p>
          <span className="text-[11px] text-muted">Supplier: {db.suppliers[p.latestCostSupplierId]?.name}</span>
        </div>
        <ul className="space-y-1.5">
          {versions.slice(0, 8).map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs">
              <span className="tabular w-16 text-muted">{fmtShort(v.createdAt)}</span>
              <span className="tabular font-semibold">{formatRM(v.landedCost)}</span>
              {(v.freight > 0 || v.fxPct > 0 || v.handling > 0) && <span className="text-muted">(sup {formatRM(v.supplierCost)} + frt {formatRM(v.freight)} + FX {v.fxPct}%)</span>}
              <span className="flex-1 truncate text-muted">{v.source.replace('_', ' ')} · {db.suppliers[v.supplierId]?.name}</span>
              <Badge tone={v.status === 'active' ? 'green' : v.status === 'proposed' ? 'amber' : v.status === 'rejected' ? 'red' : 'neutral'}>{v.status}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Approved price versions</p>
        <ul className="space-y-1.5">
          {[...history].reverse().slice(0, 6).map((h, i) => (
            <li key={h.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs">
              <span className="tabular w-16 text-muted">{fmtShort(h.effectiveFrom)}</span>
              <span className="tabular font-semibold">{formatRM(h.basePrice)}</span>
              <span className="flex-1 truncate text-muted">
                {h.kind.replace('_', ' ')} · {h.by}
              </span>
              {i > 0 && (
                <Gate perm="price.propose" fallback={null}>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => act(proposeManualPrice, { productId: p.id, price: h.basePrice, reason: `Rollback to ${formatRM(h.basePrice)} (version of ${fmtDate(h.effectiveFrom)})`, rollbackOf: h.id }, { success: 'Rollback proposed as a new version — approve it to apply' })}
                  >
                    <RotateCcw className="size-3" /> Roll back
                  </Button>
                </Gate>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-muted">Rollback creates a new proposed version; history is never overwritten.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Gate perm="price.propose">
          <Button variant="outline" onClick={() => setPropose(true)}>
            <Pencil className="size-4" /> Propose new price
          </Button>
          <Button variant="outline" onClick={() => setLanded(true)}>
            <Calculator className="size-4" /> Landed cost update
          </Button>
        </Gate>
        <Link to={`/catalog?id=${p.id}`}>
          <Button variant="ghost">Product details →</Button>
        </Link>
      </div>

      <ProposePriceModal open={propose} onOpenChange={setPropose} product={p} suggested={suggested} floor={floor} />
      <LandedCostModal open={landed} onOpenChange={setLanded} product={p} />
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-[11px] font-semibold text-muted">{label}</p>
      <p className={cn('tabular mt-0.5 font-display text-lg font-bold text-ink', tone === 'danger' && 'text-danger')}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function ProposePriceModal({ open, onOpenChange, product: p, suggested, floor }: { open: boolean; onOpenChange: (o: boolean) => void; product: Product; suggested: Sen; floor: Sen }) {
  const [price, setPrice] = React.useState((suggested / 100).toFixed(2));
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (open) {
      setPrice((suggested / 100).toFixed(2));
      setReason('');
    }
  }, [open, suggested]);
  const sen = toSen(Number(price));
  const m = marginPct(sen, p.latestCost);
  const err = !(Number(price) > 0) ? 'Enter a positive price' : reason.trim().length < 4 ? 'Give a short reason for the audit trail' : undefined;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Propose new list price · ${p.sku}`}
      description="Creates a new price version for manager approval. Issued quotes are not affected."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!!err}
            onClick={() => {
              const r = act(proposeManualPrice, { productId: p.id, price: sen, reason }, { success: 'Price proposal sent for approval' });
              if (r) onOpenChange(false);
            }}
          >
            Submit for approval
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="New list price (RM)" hint={`Suggested ${formatRM(suggested)} · margin floor ${formatRM(floor)}`} required>
          <Input type="number" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)} invalid={!(Number(price) > 0)} />
        </Field>
        <div className={cn('rounded-lg px-3 py-2 text-sm', m < 0 ? 'bg-danger-soft text-danger' : sen < floor ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent-ink')}>
          Margin at this price: <b>{formatPct(m)}</b> · markup {formatPct(markupPct(sen, p.latestCost))} {sen < floor && '— below the margin floor'}
        </div>
        <Field label="Reason" required error={reason && reason.trim().length < 4 ? 'Too short' : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Competitor price check, project tender support…" />
        </Field>
      </div>
    </Modal>
  );
}

function LandedCostModal({ open, onOpenChange, product: p }: { open: boolean; onOpenChange: (o: boolean) => void; product: Product }) {
  const db = useDbState();
  const [sup, setSup] = React.useState((p.latestCost / 100).toFixed(2));
  const [freight, setFreight] = React.useState('0');
  const [handling, setHandling] = React.useState('0');
  const [fx, setFx] = React.useState('0');
  const [supplierId, setSupplierId] = React.useState(p.latestCostSupplierId);
  const [reason, setReason] = React.useState('Supplier price notice');
  React.useEffect(() => {
    if (open) setSup((p.latestCost / 100).toFixed(2));
  }, [open, p.latestCost]);
  const total = landedCost(toSen(Number(sup)), toSen(Number(freight)), toSen(Number(handling)), Number(fx));
  const sources = Object.values(db.supplierProducts).filter((sp) => sp.productId === p.id);
  const s = db.suppliers[supplierId];
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Supplier cost update · ${p.sku}`}
      description="Records a new cost version and raises a price proposal. FX and freight components are illustrative."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!(Number(sup) > 0)}
            onClick={() => {
              const r = act(proposeCostChange, { productId: p.id, supplierCost: toSen(Number(sup)), freight: toSen(Number(freight)), handling: toSen(Number(handling)), fxPct: Number(fx), supplierId, source: 'manual', reason }, { success: 'Cost recorded — price proposal created' });
              if (r) onOpenChange(false);
            }}
          >
            Record cost & propose price
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier">
          <select className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {sources.map((sp) => (
              <option key={sp.id} value={sp.supplierId}>
                {db.suppliers[sp.supplierId]?.name} ({db.suppliers[sp.supplierId]?.currency})
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Supplier cost per ${p.baseUom} (RM)`} required>
          <Input type="number" step="0.01" value={sup} onChange={(e) => setSup(e.target.value)} />
        </Field>
        <Field label="Freight per unit (RM)">
          <Input type="number" step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} />
        </Field>
        <Field label="Handling per unit (RM)">
          <Input type="number" step="0.01" value={handling} onChange={(e) => setHandling(e.target.value)} />
        </Field>
        <Field label="FX / exchange buffer %" hint={s?.isImport ? `Reference USD/MYR ${db.config.fx.usdMyr.toFixed(3)} (${db.config.fx.synthetic ? 'synthetic' : db.config.fx.source}) — never auto-applied` : 'Local supplier — usually 0%'}>
          <Input type="number" step="0.1" value={fx} onChange={(e) => setFx(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">
        Landed cost = ({formatRM(toSen(Number(sup)))} + {formatRM(toSen(Number(freight)))} + {formatRM(toSen(Number(handling)))}) × (1 + {fx}%) = <b className="text-brand">{formatRM(total)}</b>
        <span className="text-muted"> ({formatPct(pctChange(p.latestCost, total), 1, true)} vs latest)</span>
      </div>
    </Modal>
  );
}
