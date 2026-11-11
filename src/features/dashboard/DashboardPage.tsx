import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useDbState } from '@/store/db';
import { useT } from '@/i18n';
import { useNow } from '@/lib/hooks';
import { computeKpis, salesSeries, categoryMix, quoteFunnel, ordersByStage, costHeatmap, pricingExposure, previousRange, rangeFor, type RangeKey, categoryMarginTrend } from '@/domain/kpis';
import { computeInsights } from '@/domain/insights';
import { binOccupancy } from '@/domain/inventory';
import { invoiceBalance } from '@/domain/finance';
import { daysOverdue, dayKey, fmtShort, fmtTime, relTime } from '@/lib/dates';
import { compactRM, formatPct, formatRM, pctChange } from '@/lib/money';
import { entityLink } from '@/lib/links';
import { cn } from '@/lib/utils';
import { Button, Card, Badge } from '@/components/ui/core';
import { Segmented } from '@/components/ui/overlay';
import { KpiTile, PageHeader, SectionCard, fmtCompact, fmtPct1, useMotionOK } from '@/components/widgets';
import { BarList, Columns, Funnel, Heatmap, TrendArea } from '@/components/charts/Charts';
import {
  Zap, Wallet, TrendingUp, Percent, ShoppingCart, Building2, Truck, AlertTriangle, ArrowRight, Clock, Boxes, PackageOpen, Receipt, Warehouse, Activity, Hourglass, Sparkles, FileText,
} from '@/components/ui/icons';
import { startScenario } from '@/features/tour/TourOverlay';
import { useSession } from '@/store/session';
import { ROLES } from '@/domain/roles';
import { workspaceFor } from '@/features/workspace/queues';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export default function DashboardPage() {
  const db = useDbState();
  const t = useT();
  const nav = useNavigate();
  const now = useNow(60_000);
  const [rk, setRk] = React.useState<RangeKey>('30d');
  const range = React.useMemo(() => rangeFor(rk, now), [rk, now]);
  const k = React.useMemo(() => computeKpis(db, range, now), [db, range, now]);
  const kp = React.useMemo(() => computeKpis(db, previousRange(range), now), [db, range, now]);
  const trendRange = React.useMemo(() => (rk === 'today' ? rangeFor('7d', now) : range), [rk, range, now]);
  const series = React.useMemo(() => salesSeries(db, trendRange), [db, trendRange]);
  const mix = React.useMemo(() => categoryMix(db, range), [db, range]);
  const marginTrend = React.useMemo(() => categoryMarginTrend(db, now), [db, now]);
  const funnel = React.useMemo(() => quoteFunnel(db, rk === 'today' ? rangeFor('7d', now) : range), [db, range, rk, now]);
  const stages = React.useMemo(() => ordersByStage(db), [db]);
  const heat = React.useMemo(() => costHeatmap(db, now, 10), [db, now]);
  const exposure = React.useMemo(() => pricingExposure(db, now), [db, now]);
  const insights = React.useMemo(() => computeInsights(db, now), [db, now]);
  const spark = series.map((s) => s.sales);

  const startShock = () => startScenario('A', nav, db);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Activity className="size-3.5" /> Owner / Director view</span>}
        title={t('dash.title')}
        subtitle={t('dash.subtitle')}
        actions={
          <>
            <Segmented id="dash-range" value={rk} onChange={setRk} options={RANGES} />
            <Button onClick={startShock} className="bg-gradient-to-r from-ember-500 to-[#e0702a] text-forest-950 hover:brightness-105 dark:text-forest-950">
              <Zap className="size-4" /> {t('dash.priceShock')}
            </Button>
          </>
        }
      />

      <RoleQueue now={now} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 min-[112.5rem]:grid-cols-7" data-tour="kpis">
        <KpiTile label={t('dash.netSales')} value={k.netSales} format={fmtCompact} delta={pctChange(kp.netSales, k.netSales)} trend={spark} sub={`${k.invoiceCount} invoices`} definition="Sum of invoice subtotals (excl. tax & freight) issued in the period, including counter sales." onClick={() => nav('/analytics')} icon={<TrendingUp className="size-3.5" />} />
        <KpiTile label={t('dash.pipeline')} value={k.pipelineValue} format={fmtCompact} sub={`${k.pipelineCount} open orders`} definition="Value of sales-order lines not yet invoiced (excluding cancelled)." onClick={() => nav('/orders')} icon={<ShoppingCart className="size-3.5" />} />
        <KpiTile label={t('dash.margin')} value={k.grossMarginPct} format={fmtPct1} delta={k.grossMarginPct - kp.grossMarginPct} sub={`COGS ${compactRM(k.cogs)}`} definition="(Net sales − cost of goods sold) ÷ net sales × 100. Cost uses the snapshot on each order line." onClick={() => nav('/analytics')} icon={<Percent className="size-3.5" />} />
        <KpiTile label={t('dash.conversion')} value={k.quoteConversionPct} format={fmtPct1} delta={k.quoteConversionPct - kp.quoteConversionPct} sub={`${k.quotesWon} won of ${k.quotesIssued} issued`} definition="Quotes accepted or converted ÷ quotes decided (won + rejected + expired), for quotes issued in the period." onClick={() => nav('/quotes')} icon={<FileText className="size-3.5" />} />
        <KpiTile label={t('dash.receivables')} value={k.openReceivables} format={fmtCompact} sub={<span className={k.overdueReceivables ? 'text-danger' : ''}>{compactRM(k.overdueReceivables)} overdue</span>} definition="Outstanding balances on all issued invoices (now)." onClick={() => nav('/finance?tab=receivables')} icon={<Wallet className="size-3.5" />} tone={k.overdueReceivables > k.openReceivables * 0.25 ? 'warn' : 'default'} />
        <KpiTile label={t('dash.commitments')} value={k.purchaseCommitments} format={fmtCompact} sub="Open PO balance" definition="Outstanding quantity × unit cost on sent, acknowledged and partially received POs." onClick={() => nav('/procurement?tab=pos')} icon={<Building2 className="size-3.5" />} />
        <KpiTile label={t('dash.fulfilment')} value={k.onTimePct} format={fmtPct1} delta={k.onTimePct - kp.onTimePct} sub={`${k.deliveriesCompleted} deliveries / pickups`} definition="Deliveries and collections completed on or before the promised date, in the period." onClick={() => nav('/delivery')} icon={<Truck className="size-3.5" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <SectionCard className="xl:col-span-8" title="Sales trend" subtitle={`${rk === 'today' ? 'Last 7 days (today selected)' : RANGES.find((r) => r.value === rk)?.label} · net sales by ${series.length > 31 ? 'week' : 'day'} · click a point to drill down`} actions={<Link to="/analytics" className="text-xs font-semibold text-brand hover:underline">Analytics →</Link>}>
          {series.length > 31 ? (
            <TrendArea data={series} x="label" y="sales" name="Net sales" format={(v) => formatRM(v, { decimals: false })} axisFormat={(v) => compactRM(v).replace('RM ', '')} height={250} onPointClick={(r) => nav(`/finance?tab=invoices&week=${r.key}`)} extraRows={(p) => [{ k: 'Gross margin', v: formatPct(Number(p.marginPct)) }, { k: 'Invoices', v: String(p.orders) }]} />
          ) : (
            <Columns data={series} x="label" y="sales" name="Net sales" format={(v) => compactRM(v)} axisFormat={(v) => compactRM(v).replace('RM ', '')} height={250} onBarClick={(r) => nav(`/finance?tab=invoices&day=${r.key}`)} />
          )}
        </SectionCard>
        <PricingExposure exposure={exposure} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <SectionCard className="xl:col-span-4" title="Category mix" subtitle="Net sales share · margin % · click to analyse" icon={<Boxes className="size-4 text-brand" />}>
          <div data-tour="category-mix">
            <BarList
              format={(v) => compactRM(v)}
              onClick={(key) => nav(`/analytics?category=${key}`)}
              rows={mix
                .filter((m) => m.sales > 0)
                .sort((a, b) => b.sales - a.sales)
                .map((m) => {
                  const tr = marginTrend.find((x) => x.categoryId === m.categoryId);
                  return { key: m.categoryId, label: m.name, value: m.sales, sub: `· ${formatPct(m.marginPct)}${tr && tr.delta < -1.5 ? ' ▼' : ''}`, tone: tr && tr.delta < -1.5 ? 'warn' : 'brand' };
                })}
            />
          </div>
          {marginTrend.some((x) => x.delta < -1.5 && x.recentSales > 0) && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-warn">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {marginTrend.filter((x) => x.delta < -1.5 && x.recentSales > 0).map((x) => `${x.name} margin ${x.delta.toFixed(1)} pts vs prior 60 days`).join(' · ')}
            </p>
          )}
        </SectionCard>
        <SectionCard className="xl:col-span-4" title="Quote funnel" subtitle={`Quotes created in ${rk === 'today' ? 'the last 7 days' : 'the period'} · stage conversion`} actions={<Link to="/quotes" className="text-xs font-semibold text-brand hover:underline">Quotes →</Link>}>
          <Funnel stages={funnel} />
        </SectionCard>
        <SectionCard className="lg:col-span-2 xl:col-span-4" title="Orders by fulfilment stage" subtitle="Open orders now · click to filter" actions={<Link to="/orders" className="text-xs font-semibold text-brand hover:underline">Orders →</Link>}>
          <BarList format={(v) => String(v)} onClick={(key) => nav(`/orders?stage=${key}`)} rows={stages.map((s) => ({ key: s.key, label: s.label, value: s.count, sub: s.value ? `· ${compactRM(s.value)}` : '', tone: s.key === 'credit' && s.count ? 'danger' : 'brand' }))} />
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <SectionCard className="xl:col-span-8" title="Supplier cost-change heatmap" subtitle="Average supplier cost change per category per week (last 10 weeks) · click a cell to open pricing">
          <Heatmap
            rows={heat.cats.map((c) => ({ key: c.id, label: c.name }))}
            cols={heat.cols.map((c, i) => ({ key: String(i), label: fmtShort(c) }))}
            value={(r, c) => {
              const cell = heat.cells.find((x) => x.categoryId === r && x.week === Number(c));
              return { v: cell?.avgPct ?? 0, n: cell?.count ?? 0 };
            }}
            cellTitle={(r, c, v, n) => `${db.categories[r]?.name}, week of ${fmtShort(heat.cols[Number(c)])}: ${n ? `${n} cost update(s), average ${v > 0 ? '+' : ''}${v.toFixed(1)}%` : 'no cost updates'}`}
            onCell={(r) => nav(`/pricing?category=${r}`)}
            rowLabel="Category"
            colLabel="Week starting"
          />
        </SectionCard>
        <WarehouseMini />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Alerts insights={insights} now={now} />
        <Timeline now={now} />
      </div>
    </div>
  );
}

/** Personal queue for Sales Manager / Finance on top of the shared dashboard. */
function RoleQueue({ now }: { now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const role = useSession((s) => s.role);
  if (role === 'owner') return null;
  const ws = workspaceFor(role, db, now);
  if (!ws.stats.length) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 border-brand/30 bg-accent-soft/40 p-3 sm:p-4">
      <p className="text-sm font-semibold">
        Your queue · <span className="text-brand">{ROLES[role].label}</span>
      </p>
      <div className="flex flex-1 flex-wrap gap-2">
        {ws.stats.map((st) => (
          <button key={st.key} onClick={() => nav(st.link)} className={cn('inline-flex items-center gap-2 rounded-xl border bg-surface px-3 py-1.5 text-sm hover:border-brand', st.tone === 'danger' ? 'border-danger/40' : st.tone === 'warn' ? 'border-warn/50' : 'border-line')}>
            <b className="tabular">{st.display ?? st.value}</b> {st.label}
            <ArrowRight className="size-3.5 text-muted" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function PricingExposure({ exposure }: { exposure: ReturnType<typeof pricingExposure> }) {
  const t = useT();
  const nav = useNavigate();
  const items = [
    { label: 'Cost updates today', value: String(exposure.costUpdatesToday), icon: <Zap className="size-4" />, link: '/pricing?tab=history', tone: exposure.costUpdatesToday ? 'text-orange' : 'text-ink' },
    { label: 'Price changes pending approval', value: String(exposure.pendingPriceChanges), icon: <Hourglass className="size-4" />, link: '/pricing?tab=approvals', tone: exposure.pendingPriceChanges ? 'text-warn' : 'text-ink' },
    { label: 'Quotes requiring review', value: String(exposure.quotesNeedingReview), icon: <FileText className="size-4" />, link: '/quotes?filter=recheck', tone: exposure.quotesNeedingReview ? 'text-warn' : 'text-ink' },
    { label: 'Margin at risk on open quotes', value: compactRM(exposure.marginAtRisk), icon: <AlertTriangle className="size-4" />, link: '/pricing?tab=shock', tone: exposure.marginAtRisk ? 'text-danger' : 'text-ink' },
  ];
  return (
    <Card className="relative overflow-hidden xl:col-span-4">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent-soft/80 to-transparent" aria-hidden />
      <div className="relative p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Sparkles className="size-4 text-brand" /> {t('dash.exposure')}
        </h3>
        <p className="mt-0.5 text-xs text-muted">Daily price volatility, measured against open quotations</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {items.map((it) => (
            <button key={it.label} onClick={() => nav(it.link)} className="rounded-xl border border-line bg-surface p-3 text-left transition hover:border-brand/40 hover:shadow-sm">
              <span className="text-muted">{it.icon}</span>
              <p className={cn('tabular mt-1.5 font-display text-xl font-bold', it.tone)}>{it.value}</p>
              <p className="text-[11px] leading-tight text-muted">{it.label}</p>
            </button>
          ))}
        </div>
        <Button variant="secondary" className="mt-3 w-full" onClick={() => nav('/approvals')}>
          Open approval inbox <ArrowRight className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

function WarehouseMini() {
  const db = useDbState();
  const nav = useNavigate();
  const wh = Object.values(db.warehouses)[0];
  const racks = React.useMemo(
    () =>
      Object.values(db.racks).map((r) => {
        const bins = Object.values(db.bins).filter((b) => b.rackId === r.id);
        const occ = bins.reduce((s, b) => s + Math.min(1.2, binOccupancy(db, b.id)), 0) / Math.max(1, bins.length);
        return { r, occ };
      }),
    [db],
  );
  const color = (o: number) => (o > 0.85 ? 'var(--orange)' : o > 0.45 ? 'var(--accent)' : o > 0.1 ? 'var(--seq-2)' : 'var(--line-strong)');
  return (
    <Card className="flex flex-col overflow-hidden xl:col-span-4">
      <div className="flex items-start justify-between px-4 pt-4 sm:px-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Warehouse className="size-4 text-brand" /> Warehouse mini-map
          </h3>
          <p className="mt-0.5 text-xs text-muted">Average rack occupancy · illustrative layout</p>
        </div>
        <Badge tone="amber">Illustrative</Badge>
      </div>
      <div className="flex-1 px-4 py-3 sm:px-5">
        <svg viewBox={`-1 -1 ${(wh?.width ?? 60) + 2} ${(wh?.depth ?? 36) + 2}`} className="w-full rounded-xl bg-surface-2" role="img" aria-label="Top-down warehouse map with rack occupancy">
          <rect x="0" y="0" width={wh?.width ?? 60} height={wh?.depth ?? 36} fill="none" stroke="var(--line-strong)" strokeWidth="0.3" />
          {Object.values(db.zones).map((z) => (
            <g key={z.id}>
              <rect x={z.x} y={z.z} width={z.w} height={z.d} rx="0.8" fill={z.kind === 'storage' ? 'var(--accent-soft)' : z.kind === 'quarantine' ? 'var(--danger-soft)' : 'var(--info-soft)'} opacity="0.7" />
              <text x={z.x + 0.8} y={z.z + 2.2} fontSize="1.7" fill="var(--muted)" fontWeight="600">
                {z.code}
              </text>
            </g>
          ))}
          {racks.map(({ r, occ }) => (
            <rect key={r.id} x={r.x} y={r.z - r.d / 2} width={r.w} height={Math.max(r.d, 0.9)} rx="0.3" fill={color(occ)}>
              <title>{`${r.code}: ${(occ * 100).toFixed(0)}% average occupancy`}</title>
            </rect>
          ))}
        </svg>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
          {[
            ['var(--line-strong)', '<10%'],
            ['var(--seq-2)', '10–45%'],
            ['var(--accent)', '45–85%'],
            ['var(--orange)', '>85%'],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm" style={{ background: c }} /> {l}
            </span>
          ))}
        </div>
      </div>
      <div className="border-t border-line p-3">
        <Button className="w-full" variant="dark" onClick={() => nav('/warehouse')}>
          Open 3D Warehouse Explorer <ArrowRight className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

function Alerts({ insights, now }: { insights: ReturnType<typeof computeInsights>; now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const ok = useMotionOK();
  const t = useT();
  const expiring = insights.filter((i) => i.rule === 'quote_expiring');
  const unallocated = Object.values(db.salesOrders).filter((o) => ['confirmed', 'partially_allocated', 'pending_credit'].includes(o.status));
  const lowStock = insights.filter((i) => i.rule === 'reorder');
  const grnIssues = Object.values(db.goodsReceipts).filter((g) => g.lines.some((l) => l.damaged > 0) && Date.parse(g.receivedAt) > Date.parse(now) - 14 * 86_400_000);
  const shortPicks = Object.values(db.picklists).flatMap((p) => p.tasks.filter((t2) => t2.status === 'short'));
  const overdue = Object.values(db.invoices).filter((i) => invoiceBalance(i) > 0 && daysOverdue(i.dueDate, now) > 0);
  const latePo = insights.filter((i) => i.rule === 'po_late');
  const cards = [
    { key: 'exp', title: 'Quotes expiring within 24h', count: expiring.length, detail: expiring[0]?.title, icon: <Clock className="size-4" />, link: '/quotes?filter=expiring', tone: 'amber' as const },
    { key: 'unalloc', title: 'Orders awaiting reservation', count: unallocated.length, detail: unallocated[0] ? `${unallocated[0].number} · ${db.customers[unallocated[0].customerId]?.name}` : undefined, icon: <ShoppingCart className="size-4" />, link: '/orders?stage=confirmed', tone: 'blue' as const },
    { key: 'low', title: 'Low-stock SKUs', count: lowStock.length, detail: lowStock[0]?.title, icon: <PackageOpen className="size-4" />, link: '/inventory?tab=reorder', tone: 'red' as const },
    { key: 'grn', title: 'GRN / pick discrepancies (14d)', count: grnIssues.length + shortPicks.length, detail: grnIssues[0] ? `${grnIssues[0].number}: damaged on arrival` : shortPicks[0]?.discrepancy, icon: <AlertTriangle className="size-4" />, link: '/inventory?tab=ledger', tone: 'orange' as const },
    { key: 'pay', title: 'Overdue invoices', count: overdue.length, detail: overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ? `${overdue[0].number} · ${formatRM(invoiceBalance(overdue[0]))}` : undefined, icon: <Receipt className="size-4" />, link: '/finance?tab=receivables', tone: 'red' as const },
    { key: 'po', title: 'Late purchase orders', count: latePo.length, detail: latePo[0]?.title, icon: <Building2 className="size-4" />, link: '/procurement?tab=pos', tone: 'amber' as const },
  ];
  return (
    <SectionCard className="xl:col-span-7" title={t('dash.alerts')} subtitle="Actionable queues, from transparent business rules" actions={<Link to="/analytics?tab=insights" className="text-xs font-semibold text-brand hover:underline">All insights →</Link>}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {cards.map((c, i) => (
          <motion.button
            key={c.key}
            initial={ok ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ok ? i * 0.04 : 0 }}
            onClick={() => nav(c.link)}
            className={cn('group flex items-start gap-3 rounded-xl border p-3 text-left transition hover:shadow-sm', c.count ? 'border-line bg-surface hover:border-brand/40' : 'border-dashed border-line bg-surface-2/60')}
          >
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', c.count ? { amber: 'bg-warn-soft text-warn', blue: 'bg-info-soft text-info', red: 'bg-danger-soft text-danger', orange: 'bg-orange-soft text-orange' }[c.tone] : 'bg-surface-3 text-muted')}>{c.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{c.title}</span>
                <span className="tabular font-display text-lg font-bold text-ink">{c.count}</span>
              </span>
              <span className="block truncate text-xs text-muted">{c.count ? c.detail : 'Nothing to action'}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </SectionCard>
  );
}

function Timeline({ now }: { now: string }) {
  const db = useDbState();
  const t = useT();
  const today = dayKey(now);
  const events = React.useMemo(() => {
    const all = Object.values(db.audit).sort((a, b) => b.at.localeCompare(a.at));
    const todays = all.filter((e) => dayKey(e.at) === today);
    return (todays.length >= 4 ? todays : all).slice(0, 14);
  }, [db.audit, today]);
  return (
    <SectionCard className="xl:col-span-5" title={t('dash.timeline')} subtitle="Recent activity linked to records (audit trail)" actions={<Link to="/settings?tab=audit" className="text-xs font-semibold text-brand hover:underline">Audit log →</Link>}>
      <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-line">
        {events.map((e) => {
          const link = entityLink(e.entityType, e.entityId);
          return (
            <li key={e.id} className="relative flex gap-3 pl-5">
              <span className="absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-surface bg-accent ring-1 ring-accent/30" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ink">
                  {link ? (
                    <Link to={link} className="hover:text-brand hover:underline">
                      {e.summary}
                    </Link>
                  ) : (
                    e.summary
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {dayKey(e.at) === today ? fmtTime(e.at) : relTime(e.at, now)} · {e.actor}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
