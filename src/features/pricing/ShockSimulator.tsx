import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate, Link } from 'react-router-dom';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { applyCostShock } from '@/domain/commands/pricing';
import { resolveRule, suggestedPrice, tierPrice } from '@/domain/pricing';
import { formatPct, formatRM, marginPct, roundSen } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Select } from '@/components/ui/core';
import { AnimatedNumber, DemoNote, Gate, SectionCard, useMotionOK } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { AlertTriangle, Check, FileText, Lock, RotateCcw, Zap, ArrowRight, Inbox } from '@/components/ui/icons';

const PRESETS = [
  { label: 'Steel mill increase', pct: 14, cat: 'ind', filter: (sku: string) => /^(ANG|HBM|CCH|SHS|FLB)/.test(sku) },
  { label: 'PVC resin surcharge', pct: 6, cat: 'plb', filter: (sku: string) => /^(PVP|PVE|PVT|PVS|UPD)/.test(sku) },
  { label: 'Copper cable rise', pct: 9, cat: 'elc', filter: (sku: string) => /^ELC-CBL/.test(sku) },
  { label: 'Freight surcharge', pct: 3, cat: 'bld', filter: () => true },
  { label: 'Supplier promotion', pct: -5, cat: 'saf', filter: (sku: string) => /^(SHM|GLV)/.test(sku) },
];

export function ShockSimulator({ initialProductId }: { initialProductId?: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const ok = useMotionOK();
  const init = initialProductId ? db.products[initialProductId] : undefined;
  const [cat, setCat] = React.useState(init?.categoryId ?? 'ind');
  const [pct, setPct] = React.useState(14);
  const [sel, setSel] = React.useState<string[]>(init ? [init.id] : Object.values(db.products).filter((p) => p.categoryId === 'ind' && /^(ANG|HBM)/.test(p.sku)).map((p) => p.id));
  const [applied, setApplied] = React.useState<number | null>(null);
  const catProducts = React.useMemo(() => Object.values(db.products).filter((p) => p.categoryId === cat && p.status === 'active').sort((a, b) => a.sku.localeCompare(b.sku)), [db.products, cat]);

  const rows = sel
    .map((id) => db.products[id])
    .filter(Boolean)
    .map((p) => {
      const rule = resolveRule(db, p);
      const newCost = roundSen(p.latestCost * (1 + pct / 100));
      return {
        p,
        rule,
        newCost,
        suggestedNew: suggestedPrice(newCost, rule),
        marginBefore: marginPct(p.basePrice, p.latestCost),
        marginAfter: marginPct(p.basePrice, newCost),
        contractorAfter: marginPct(tierPrice(p.basePrice, 'contractor', rule), newCost),
      };
    });

  const impact = React.useMemo(() => {
    const ids = new Set(sel);
    const out: { id: string; number: string; customer: string; status: string; kind: 'issued' | 'contract' | 'below' | 'reduced'; before: number; after: number; detail: string }[] = [];
    for (const q of Object.values(db.quotes)) {
      if (!['draft', 'pending_approval', 'approved', 'issued'].includes(q.status)) continue;
      const v = q.versions[q.currentVersion - 1];
      const affected = v.lines.filter((l) => ids.has(l.productId));
      if (!affected.length) continue;
      let net = 0, cost = 0, costAfter = 0;
      let below = false;
      let contract = false;
      for (const l of v.lines) {
        const n = l.unitPrice * l.qty * (1 - l.discountPct / 100);
        net += n;
        cost += l.unitCost * l.qty;
        if (ids.has(l.productId)) {
          const p = db.products[l.productId];
          const nc = roundSen(p.latestCost * (1 + pct / 100)) * l.factor;
          costAfter += nc * l.qty;
          const lm = marginPct(l.unitPrice * (1 - l.discountPct / 100), nc);
          if (l.priceSource === 'contract') contract = true;
          else if (lm < resolveRule(db, p).minMarginPct) below = true;
        } else costAfter += l.unitCost * l.qty;
      }
      const before = marginPct(net, cost);
      const after = marginPct(net, costAfter);
      const kind = q.status === 'issued' ? 'issued' : contract ? 'contract' : below ? 'below' : 'reduced';
      out.push({
        id: q.id,
        number: q.number,
        customer: db.customers[q.customerId]?.name ?? '',
        status: q.status,
        kind,
        before,
        after,
        detail:
          kind === 'issued'
            ? `Issued snapshot retained — the customer keeps the quoted price${v.expiresAt ? ` until ${v.expiresAt.slice(0, 10)}` : ''}.`
            : kind === 'contract'
              ? 'Contract-locked line: price honoured, margin absorbed. Flagged for management visibility.'
              : kind === 'below'
                ? 'At least one line would fall below the margin floor → recheck and approval before issue.'
                : 'Margin reduces but stays above the floor.',
      });
    }
    const order = { below: 0, contract: 1, issued: 2, reduced: 3 };
    return out.sort((a, b) => order[a.kind] - order[b.kind]);
  }, [db, sel, pct]);
  const rfqs = Object.values(db.rfqs).filter((r) => r.status === 'open' && r.lines.some((l) => sel.includes(l.productId)));

  const apply = () => {
    const r = act(applyCostShock, { productIds: sel, pct, reason: `Supplier cost update ${pct > 0 ? '+' : ''}${pct}% (cost shock simulator)` }, { success: (x) => `${x.length} cost update(s) recorded · price proposals sent for approval` });
    if (r) setApplied(r.length);
  };
  const preset = (i: number) => {
    const pr = PRESETS[i];
    setCat(pr.cat);
    setPct(pr.pct);
    setSel(Object.values(db.products).filter((p) => p.categoryId === pr.cat && p.status === 'active' && pr.filter(p.sku)).map((p) => p.id));
    setApplied(null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="p-4 sm:p-5 xl:col-span-4" data-tour="shock-panel">
        <h3 className="flex items-center gap-2 font-semibold">
          <Zap className="size-4 text-orange" /> Cost Shock Simulator
        </h3>
        <p className="mt-1 text-xs text-muted">Model a supplier cost change before it happens. Nothing is saved until you apply it.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {PRESETS.map((p, i) => (
            <button key={p.label} onClick={() => preset(i)} className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2 hover:border-brand hover:text-brand">
              {p.label} {p.pct > 0 ? '+' : ''}
              {p.pct}%
            </button>
          ))}
        </div>
        <label className="mt-4 block text-xs font-semibold text-ink-2" htmlFor="shock-cat">
          Category
        </label>
        <Select
          id="shock-cat"
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            setSel([]);
            setApplied(null);
          }}
          className="mt-1.5"
        >
          {Object.values(db.categories).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-2">SKUs ({sel.length} selected)</p>
          <div className="flex gap-1">
            <button className="text-[11px] font-semibold text-brand hover:underline" onClick={() => setSel(catProducts.map((p) => p.id))}>
              All
            </button>
            <span className="text-muted">·</span>
            <button className="text-[11px] font-semibold text-brand hover:underline" onClick={() => setSel([])}>
              None
            </button>
          </div>
        </div>
        <div className="scrollbar-thin mt-1.5 max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-line p-1.5">
          {catProducts.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface-2">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={sel.includes(p.id)}
                onChange={(e) => {
                  setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id));
                  setApplied(null);
                }}
              />
              <span className="font-mono text-[10px] text-muted">{p.sku}</span>
              <span className="truncate">{p.variantLabel ?? p.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label htmlFor="shock-pct" className="text-xs font-semibold text-ink-2">
              Supplier cost change
            </label>
            <span className={cn('tabular rounded-lg px-2 py-0.5 font-display text-lg font-bold', pct > 0 ? 'bg-danger-soft text-danger' : pct < 0 ? 'bg-info-soft text-info' : 'bg-surface-3 text-muted')}>
              {pct > 0 ? '+' : ''}
              {pct}%
            </span>
          </div>
          <input id="shock-pct" type="range" min={-10} max={35} step={1} value={pct} onChange={(e) => { setPct(Number(e.target.value)); setApplied(null); }} className="mt-2 w-full accent-[var(--orange)]" aria-valuetext={`${pct} percent`} />
          <div className="flex justify-between text-[10px] text-muted">
            <span>−10%</span>
            <span>0</span>
            <span>+35%</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Gate perm="price.propose">
            <Button onClick={apply} disabled={!sel.length || pct === 0} className="flex-1">
              <Zap className="size-4" /> Apply as supplier cost update
            </Button>
          </Gate>
          <Button variant="outline" onClick={() => { setPct(0); setApplied(null); }} aria-label="Reset simulation">
            <RotateCcw className="size-4" /> Reset
          </Button>
        </div>
        <AnimatePresence>
          {applied !== null && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl bg-accent-soft p-3 text-xs text-accent-ink">
              <p className="flex items-center gap-1.5 font-semibold">
                <Check className="size-4" /> {applied} cost update(s) recorded
              </p>
              <p className="mt-0.5">Draft quotes are flagged for recheck; issued quotes are unchanged. Approve the proposed prices to update the list.</p>
              <Button size="sm" className="mt-2" onClick={() => nav('/approvals')}>
                Open approvals <ArrowRight className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        <DemoNote className="mt-4">Scenario values are illustrative. In production, cost updates would come from supplier notices, price-list files or GRNs — and be approved by authorised users.</DemoNote>
      </Card>

      <div className="space-y-4 xl:col-span-8">
        <SectionCard title="Suggested prices & margins" subtitle={`At current approved list prices · ${rows.length} SKU(s)`}>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Select at least one SKU to simulate.</p>
          ) : (
            <motion.div layout className="grid gap-2.5 sm:grid-cols-2">
              <AnimatePresence>
                {rows.map((r) => (
                  <motion.div key={r.p.id} layout initial={ok ? { opacity: 0, scale: 0.97 } : false} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className={cn('rounded-xl border p-3', r.marginAfter < r.rule.minMarginPct ? 'border-danger/40 bg-danger-soft/30' : 'border-line bg-surface')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] text-muted">{r.p.sku}</p>
                        <p className="truncate text-sm font-medium">{r.p.variantLabel ?? r.p.name}</p>
                      </div>
                      {r.marginAfter < r.rule.minMarginPct ? <Badge tone="red" icon={<AlertTriangle className="size-3" />}>Below {r.rule.minMarginPct}% floor</Badge> : <Badge tone="green">OK</Badge>}
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted">Cost</p>
                        <p className="tabular text-[11px] text-muted line-through">{formatRM(r.p.latestCost)}</p>
                        <AnimatedNumber value={r.newCost} format={(v) => formatRM(Math.round(v))} className={cn('font-semibold', pct > 0 ? 'text-danger' : 'text-info')} />
                      </div>
                      <div>
                        <p className="text-muted">List → suggested</p>
                        <p className="tabular text-[11px] text-muted">{formatRM(r.p.basePrice)}</p>
                        <AnimatedNumber value={r.suggestedNew} format={(v) => formatRM(Math.round(v))} className="font-semibold text-brand" />
                      </div>
                      <div>
                        <p className="text-muted">Margin @ list</p>
                        <p className="tabular text-[11px] text-muted">{formatPct(r.marginBefore)}</p>
                        <AnimatedNumber value={r.marginAfter} format={(v) => formatPct(v)} className={cn('font-semibold', r.marginAfter < r.rule.minMarginPct ? 'text-danger' : 'text-ink')} />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      Contractor tier margin after: <b className={r.contractorAfter < r.rule.minMarginPct ? 'text-danger' : 'text-ink'}>{formatPct(r.contractorAfter)}</b> · price change to restore target {formatPct(((r.suggestedNew - r.p.basePrice) / r.p.basePrice) * 100, 1, true)}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </SectionCard>

        <SectionCard title="Impact on open quotations & RFQs" subtitle="Issued quotes keep their snapshot · drafts are flagged for recheck when applied" icon={<FileText className="size-4 text-brand" />}>
          <div data-tour="shock-impact" className="space-y-2">
            {impact.length === 0 && rfqs.length === 0 && <p className="py-6 text-center text-sm text-muted">No open quotations or RFQs contain the selected SKUs.</p>}
            {impact.map((q) => (
              <Link key={q.id} to={`/quotes/${q.id}`} className="flex items-start gap-3 rounded-xl border border-line p-3 transition hover:border-brand/40 hover:bg-surface-2">
                <span
                  className={cn(
                    'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                    q.kind === 'below' ? 'bg-danger-soft text-danger' : q.kind === 'contract' ? 'bg-violet-soft text-violet' : q.kind === 'issued' ? 'bg-info-soft text-info' : 'bg-accent-soft text-brand',
                  )}
                >
                  {q.kind === 'below' ? <AlertTriangle className="size-4" /> : q.kind === 'contract' || q.kind === 'issued' ? <Lock className="size-4" /> : <Check className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{q.number}</span>
                    <span className="truncate text-sm">{q.customer}</span>
                    <StatusBadge kind="quote" status={q.status} />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{q.detail}</span>
                </span>
                <span className="tabular shrink-0 text-right text-xs">
                  <span className="block text-muted">margin</span>
                  <span className="text-muted">{formatPct(q.before)}</span> → <b className={q.kind === 'issued' ? 'text-muted line-through' : q.after < 12 ? 'text-danger' : 'text-ink'}>{formatPct(q.after)}</b>
                  {q.kind === 'issued' && <span className="block text-[10px] text-info">price unchanged</span>}
                </span>
              </Link>
            ))}
            {rfqs.map((r) => (
              <Link key={r.id} to="/enquiries" className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3 text-sm hover:bg-surface-2">
                <Inbox className="size-4 text-muted" />
                <span className="font-mono text-xs">{r.number}</span>
                <span className="flex-1 truncate">{db.customers[r.customerId]?.name}</span>
                <span className="text-xs text-muted">Unpriced RFQ — will price at the new cost</span>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
