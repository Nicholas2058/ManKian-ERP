import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { useNow, useParam } from '@/lib/hooks';
import { categoryMix, categoryMarginTrend, computeKpis, issuedAt, rangeFor, salesSeries, type RangeKey } from '@/domain/kpis';
import { computeInsights, INSIGHT_RULES } from '@/domain/insights';
import { ageing } from '@/domain/finance';
import { stockIndex } from '@/domain/inventory';
import { receiveEnquiry } from '@/domain/commands/sales';
import { proposeCostChange } from '@/domain/commands/pricing';
import { compactRM, formatPct, formatRM, pctChange, roundSen } from '@/lib/money';
import { addDays, dayKey, fmtShort, relTime } from '@/lib/dates';
import { cn, createRng, downloadText } from '@/lib/utils';
import { toCsv } from '@/services/csv';
import { kpiPdf } from '@/services/pdf';
import { ENQUIRY_TEMPLATES } from '@/data/enquiryTemplates';
import { Badge, Button, Card, Select } from '@/components/ui/core';
import { Segmented, Tabs, TabPanel } from '@/components/ui/overlay';
import { PageHeader, SectionCard, KpiTile, fmtCompact, fmtPct1, DemoNote, Gate } from '@/components/widgets';
import { BarList, Columns, TrendArea, TrendLine } from '@/components/charts/Charts';
import { Download, FileText, Lightbulb, Play, Activity, ArrowRight, AlertTriangle, Info } from '@/components/ui/icons';

export default function AnalyticsPage() {
  const db = useDbState();
  const nav = useNavigate();
  const now = useNow(60_000);
  const [tab, setTab] = useParam('tab');
  const [cat, setCat] = useParam('category');
  const [rk, setRk] = React.useState<RangeKey>('90d');
  const range = React.useMemo(() => rangeFor(rk, now), [rk, now]);
  const k = React.useMemo(() => computeKpis(db, range, now), [db, range, now]);
  const series = React.useMemo(() => salesSeries(db, range), [db, range]);
  const mix = React.useMemo(() => categoryMix(db, range), [db, range]);
  const mt = React.useMemo(() => categoryMarginTrend(db, now), [db, now]);
  const insights = React.useMemo(() => computeInsights(db, now), [db, now]);

  // margin % by week for a category (or all)
  const marginWeekly = React.useMemo(() => {
    const weeks: Record<string, { sales: number; cost: number }> = {};
    for (const inv of Object.values(db.invoices)) {
      if (inv.issueDate < range.from) continue;
      const d = new Date(dayKey(inv.issueDate));
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const key = d.toISOString().slice(0, 10);
      for (const l of inv.lines) {
        if (cat && db.products[l.productId]?.categoryId !== cat) continue;
        const w = (weeks[key] ||= { sales: 0, cost: 0 });
        w.sales += l.lineTotal;
        w.cost += roundSen(l.unitCost * l.qty);
      }
    }
    const firstFull = dayKey(range.from);
    return Object.entries(weeks)
      .filter(([key]) => key >= firstFull)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ label: fmtShort(key), margin: v.sales ? ((v.sales - v.cost) / v.sales) * 100 : 0, sales: v.sales }));
  }, [db.invoices, db.products, range.from, cat]);

  // cost change vs approved price change by category (pass-through)
  const passThrough = React.useMemo(() => {
    const acc: Record<string, { c: number; p: number; n: number }> = {};
    for (const ch of Object.values(db.priceChanges)) {
      if (ch.status !== 'approved' || ch.createdAt < range.from || ch.oldCost === ch.newCost) continue;
      const c = db.products[ch.productId]?.categoryId;
      if (!c) continue;
      const a = (acc[c] ||= { c: 0, p: 0, n: 0 });
      a.c += pctChange(ch.oldCost, ch.newCost);
      a.p += pctChange(ch.oldPrice, ch.proposedPrice);
      a.n++;
    }
    return Object.entries(acc).map(([c, a]) => ({ key: c, name: db.categories[c]?.name ?? c, cost: a.c / a.n, price: a.p / a.n, pass: a.c ? (a.p / a.c) * 100 : 0, n: a.n }));
  }, [db.priceChanges, db.products, db.categories, range.from]);

  // inventory turnover proxy: COGS (range, annualised) / current stock value
  const idx = stockIndex(db);
  const turnover = React.useMemo(() => {
    const days = Math.max(1, (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000);
    return Object.values(db.categories).map((c) => {
      const cogs = mix.find((m) => m.categoryId === c.id) ? mix.find((m) => m.categoryId === c.id)!.sales - mix.find((m) => m.categoryId === c.id)!.margin : 0;
      const stockVal = Object.values(db.products).filter((p) => p.categoryId === c.id).reduce((s, p) => s + roundSen((idx[p.id]?.onHand ?? 0) * p.cost), 0);
      return { key: c.id, label: c.name, value: stockVal ? (cogs / stockVal) * (365 / days) : 0 };
    });
  }, [db.categories, db.products, mix, idx, range]);

  const supplierOnTime = React.useMemo(() => {
    const acc: Record<string, { on: number; n: number }> = {};
    for (const g of Object.values(db.goodsReceipts)) {
      if (g.receivedAt < range.from) continue;
      const po = db.purchaseOrders[g.poId];
      if (!po) continue;
      const a = (acc[po.supplierId] ||= { on: 0, n: 0 });
      a.n++;
      if (dayKey(g.receivedAt) <= dayKey(po.expectedAt)) a.on++;
    }
    return Object.entries(acc).map(([s, a]) => ({ key: s, label: db.suppliers[s]?.name ?? s, value: (a.on / a.n) * 100, n: a.n })).sort((a, b) => b.value - a.value);
  }, [db.goodsReceipts, db.purchaseOrders, db.suppliers, range.from]);

  const conversionWeekly = React.useMemo(() => {
    const w: Record<string, { won: number; dec: number }> = {};
    for (const q of Object.values(db.quotes)) {
      const ia = issuedAt(q);
      if (!ia || ia < range.from) continue;
      const d = new Date(dayKey(ia));
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const key = d.toISOString().slice(0, 10);
      const x = (w[key] ||= { won: 0, dec: 0 });
      if (['accepted', 'converted'].includes(q.status)) {
        x.won++;
        x.dec++;
      } else if (['rejected', 'expired'].includes(q.status)) x.dec++;
    }
    return Object.entries(w)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([, v]) => v.dec > 0)
      .map(([key, v]) => ({ label: fmtShort(key), rate: (v.won / v.dec) * 100 }));
  }, [db.quotes, range.from]);

  const fillRate = React.useMemo(() => {
    let lines = 0;
    let firstFull = 0;
    for (const o of Object.values(db.salesOrders)) {
      if (o.createdAt < range.from || o.status === 'cancelled') continue;
      for (const l of o.lines) {
        lines++;
        const bo = Object.values(db.backorders).some((b) => b.lineId === l.id);
        if (!bo) firstFull++;
      }
    }
    return lines ? (firstFull / lines) * 100 : 0;
  }, [db.salesOrders, db.backorders, range.from]);
  const ag = ageing(Object.values(db.invoices), now);

  const productDrill = React.useMemo(() => {
    if (!cat) return [];
    const acc: Record<string, { sales: number; cost: number; qty: number }> = {};
    for (const inv of Object.values(db.invoices)) {
      if (inv.issueDate < range.from) continue;
      for (const l of inv.lines) {
        if (db.products[l.productId]?.categoryId !== cat) continue;
        const a = (acc[l.productId] ||= { sales: 0, cost: 0, qty: 0 });
        a.sales += l.lineTotal;
        a.cost += roundSen(l.unitCost * l.qty);
        a.qty += l.qty;
      }
    }
    return Object.entries(acc)
      .map(([pid, a]) => ({ p: db.products[pid], ...a, margin: a.sales ? ((a.sales - a.cost) / a.sales) * 100 : 0 }))
      .sort((a, b) => a.margin - b.margin);
  }, [cat, db.invoices, db.products, range.from]);

  const exportCsv = () => {
    const rows = [
      { metric: 'Net sales (RM)', value: (k.netSales / 100).toFixed(2) },
      { metric: 'Gross margin %', value: k.grossMarginPct.toFixed(2) },
      { metric: 'Quote conversion %', value: k.quoteConversionPct.toFixed(2) },
      { metric: 'Open receivables (RM)', value: (k.openReceivables / 100).toFixed(2) },
      { metric: 'Overdue receivables (RM)', value: (k.overdueReceivables / 100).toFixed(2) },
      { metric: 'Purchase commitments (RM)', value: (k.purchaseCommitments / 100).toFixed(2) },
      { metric: 'On-time fulfilment %', value: k.onTimePct.toFixed(2) },
      { metric: 'First-shipment fill rate %', value: fillRate.toFixed(2) },
      ...mix.map((m) => ({ metric: `Category sales — ${m.name} (RM)`, value: (m.sales / 100).toFixed(2) })),
      ...mt.map((m) => ({ metric: `Margin trend — ${m.name} (pts, 30d vs prior 60d)`, value: m.delta.toFixed(2) })),
    ];
    downloadText(`kpi-export-${rk}-${new Date().toISOString().slice(0, 10)}-DEMO.csv`, toCsv(rows), 'text/csv');
    const quotes = Object.values(db.quotes).filter((q) => q.createdAt >= range.from).map((q) => ({ quote: q.number, customer: db.customers[q.customerId]?.name, status: q.status, version: q.currentVersion, total_rm: (q.versions[q.currentVersion - 1].totals.total / 100).toFixed(2), margin_pct: q.versions[q.currentVersion - 1].totals.marginPct.toFixed(1) }));
    downloadText(`quotes-export-${rk}-DEMO.csv`, toCsv(quotes), 'text/csv');
    toast.success('KPI and quotation CSVs downloaded');
  };
  const exportPdf = () =>
    void kpiPdf(
      `${rk.toUpperCase()} review`,
      [
        ['Net sales', compactRM(k.netSales)],
        ['Gross margin', formatPct(k.grossMarginPct)],
        ['Quote conversion', formatPct(k.quoteConversionPct)],
        ['Open receivables', compactRM(k.openReceivables)],
        ['Overdue receivables', compactRM(k.overdueReceivables)],
        ['On-time fulfilment', formatPct(k.onTimePct)],
        ['First-shipment fill rate', formatPct(fillRate)],
        ...mt.map((m) => [`${m.name} margin (30d vs prior)`, `${formatPct(m.recentPct)} vs ${formatPct(m.priorPct)}`] as [string, string]),
      ],
      insights.slice(0, 8).map((i) => `${i.title} — ${i.detail} [rule: ${i.rule}]`),
    );

  return (
    <div>
      <PageHeader
        title="Analytics & Operations Insights"
        subtitle="Interactive analysis of revenue, margin, cost shocks, stock turns, supplier reliability and collections. Insights are deterministic rules — not AI."
        actions={
          <div className="flex flex-wrap items-center gap-2" data-tour="export">
            <Segmented id="an-range" value={rk} onChange={setRk} options={[{ value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: '90d', label: '90d' }]} />
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> CSV
            </Button>
            <Button variant="outline" onClick={exportPdf}>
              <FileText className="size-4" /> PDF summary
            </Button>
          </div>
        }
      />
      <Tabs id="an" value={tab ?? 'overview'} onValueChange={(v) => setTab(v === 'overview' ? null : v)} tabs={[{ value: 'overview', label: 'Analysis' }, { value: 'insights', label: 'Operations insights', count: insights.length }, { value: 'live', label: 'Activity feed' }]}>
        <TabPanel value="overview" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiTile label="Net sales" value={k.netSales} format={fmtCompact} definition="Invoice subtotals in the selected range." />
            <KpiTile label="Gross margin %" value={k.grossMarginPct} format={fmtPct1} definition="(Sales − cost) ÷ sales. Not markup." />
            <KpiTile label="Quote conversion %" value={k.quoteConversionPct} format={fmtPct1} definition="Won ÷ decided quotes issued in range." />
            <KpiTile label="Fill rate %" value={fillRate} format={fmtPct1} definition="Order lines that did not need a backorder (first shipment complete)." />
            <KpiTile label="Overdue debt" value={k.overdueReceivables} format={fmtCompact} definition="Invoice balances past due date." tone={k.overdueReceivables ? 'warn' : 'default'} />
          </div>
          <div className="grid gap-4 xl:grid-cols-2" data-tour="margin-trend">
            <SectionCard title="Revenue trend" subtitle="Net sales per period">
              <TrendArea data={series} x="label" y="sales" name="Net sales" format={(v) => formatRM(v, { decimals: false })} axisFormat={(v) => compactRM(v).replace('RM ', '')} height={220} />
            </SectionCard>
            <SectionCard title={<span>Gross margin % by week {cat ? `· ${db.categories[cat]?.name}` : '· all categories'}</span>} subtitle="Click a category below to filter" actions={cat ? <Button size="xs" variant="ghost" onClick={() => setCat(null)}>Clear filter</Button> : undefined}>
              <TrendLine data={marginWeekly} x="label" y="margin" name="Gross margin %" format={(v) => `${v.toFixed(1)}%`} refY={db.config.minMarginPct} refLabel="floor" height={220} />
            </SectionCard>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard title="Category share & margin" subtitle="Click to drill into products">
              <BarList activeKey={cat ?? undefined} onClick={(c) => setCat(c === cat ? null : c)} format={(v) => compactRM(v)} rows={mix.filter((m) => m.sales).sort((a, b) => b.sales - a.sales).map((m) => ({ key: m.categoryId, label: m.name, value: m.sales, sub: `· ${formatPct(m.marginPct)}` }))} />
            </SectionCard>
            <SectionCard title="Cost shock pass-through" subtitle="Avg approved price change ÷ avg supplier cost change">
              <ul className="space-y-2 text-sm">
                {passThrough.map((x) => (
                  <li key={x.key} className="rounded-lg bg-surface-2 px-3 py-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{x.name}</span>
                      <Badge tone={x.pass < 70 ? 'red' : x.pass < 95 ? 'amber' : 'green'}>{x.pass.toFixed(0)}% passed on</Badge>
                    </div>
                    <p className="text-xs text-muted">
                      cost {formatPct(x.cost, 1, true)} vs price {formatPct(x.price, 1, true)} · {x.n} changes
                    </p>
                  </li>
                ))}
                {!passThrough.length && <li className="text-muted">No approved cost changes in range.</li>}
              </ul>
            </SectionCard>
            <SectionCard title="Margin change by category" subtitle="Last 30 days vs prior 60 days (points)">
              <BarList format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} pts`} onClick={(c) => setCat(c)} rows={mt.filter((m) => m.recentSales).sort((a, b) => a.delta - b.delta).map((m) => ({ key: m.categoryId, label: m.name, value: m.delta, tone: m.delta < -1.5 ? 'danger' : m.delta < 0 ? 'warn' : 'brand' }))} />
            </SectionCard>
          </div>
          {cat && (
            <SectionCard title={`Products · ${db.categories[cat]?.name}`} subtitle="Lowest margin first — explains the category trend">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead className="text-[10px] uppercase tracking-wide text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 text-left">SKU</th>
                      <th className="py-2 text-left">Product</th>
                      <th className="py-2 text-right">Sales</th>
                      <th className="py-2 text-right">Margin</th>
                      <th className="py-2 text-right">Cost Δ (approved basis)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {productDrill.map((r) => (
                      <tr key={r.p.id} className="border-b border-line/60">
                        <td className="py-2 font-mono text-xs">{r.p.sku}</td>
                        <td className="py-2">{r.p.name} {r.p.variantLabel ?? ''}</td>
                        <td className="tabular py-2 text-right">{compactRM(r.sales)}</td>
                        <td className={cn('tabular py-2 text-right font-semibold', r.margin < db.config.minMarginPct ? 'text-danger' : '')}>{formatPct(r.margin)}</td>
                        <td className="tabular py-2 text-right text-xs text-muted">{formatPct(pctChange(Object.values(db.priceHistory).filter((h) => h.productId === r.p.id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0]?.cost ?? r.p.cost, r.p.latestCost), 1, true)}</td>
                        <td className="py-2 text-right">
                          <Link to={`/pricing?sku=${r.p.id}`} className="text-xs font-semibold text-brand hover:underline">
                            Price history →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard title="Inventory turnover (proxy)" subtitle="Annualised COGS ÷ current stock value">
              <BarList format={(v) => `${v.toFixed(1)}×`} rows={turnover.filter((t) => t.value).sort((a, b) => b.value - a.value)} />
            </SectionCard>
            <SectionCard title="Supplier on-time score" subtitle="Goods receipts on/before expected date, in range">
              <BarList format={(v) => `${v.toFixed(0)}%`} rows={supplierOnTime.map((s) => ({ ...s, sub: `· ${s.n} GRN`, tone: s.value < 80 ? 'warn' : 'brand' }))} />
            </SectionCard>
            <SectionCard title="Quote conversion by week" subtitle="Won ÷ decided, by issue week">
              <TrendLine data={conversionWeekly} x="label" y="rate" name="Conversion %" format={(v) => `${v.toFixed(0)}%`} height={200} />
            </SectionCard>
          </div>
          <SectionCard title="Overdue debt ageing" subtitle="All open invoices now">
            <Columns
              data={[
                { b: 'Current', v: ag.current },
                { b: '1–30 d', v: ag.d1_30 },
                { b: '31–60 d', v: ag.d31_60 },
                { b: '61–90 d', v: ag.d61_90 },
                { b: '90+ d', v: ag.d90p },
              ]}
              x="b"
              y="v"
              name="Balance"
              format={(v) => compactRM(v)}
              height={200}
              onBarClick={() => nav('/finance?tab=receivables')}
            />
          </SectionCard>
        </TabPanel>
        <TabPanel value="insights" className="pt-4">
          <Insights insights={insights} />
        </TabPanel>
        <TabPanel value="live" className="pt-4">
          <LiveFeed now={now} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

function Insights({ insights }: { insights: ReturnType<typeof computeInsights> }) {
  const [area, setArea] = React.useState('');
  const list = insights.filter((i) => !area || i.area === area);
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="space-y-2 xl:col-span-8">
        <div className="flex items-center gap-2">
          <Select value={area} onChange={(e) => setArea(e.target.value)} className="h-9 w-auto" aria-label="Area">
            <option value="">All areas</option>
            {['pricing', 'sales', 'stock', 'procurement', 'finance', 'delivery'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <span className="text-xs text-muted">{list.length} insight(s)</span>
        </div>
        {list.map((i) => (
          <Card key={i.id} className={cn('flex items-start gap-3 p-4', i.severity === 'critical' && 'border-danger/40')}>
            <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', i.severity === 'critical' ? 'bg-danger-soft text-danger' : i.severity === 'warning' ? 'bg-warn-soft text-warn' : 'bg-info-soft text-info')}>
              {i.severity === 'info' ? <Info className="size-4" /> : <AlertTriangle className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{i.title}</p>
              <p className="text-sm text-muted">{i.detail}</p>
              <p className="mt-1 text-[11px] text-muted">
                Rule: <span className="font-mono">{i.rule}</span> · {i.area}
              </p>
            </div>
            <Link to={i.link}>
              <Button size="sm" variant="outline">
                {i.action} <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </Card>
        ))}
      </div>
      <SectionCard className="self-start xl:col-span-4" title="Rules in use" subtitle="Transparent and editable thresholds — not machine learning" icon={<Lightbulb className="size-4 text-brand" />}>
        <ul className="space-y-2 text-xs">
          {INSIGHT_RULES.map((r) => (
            <li key={r.key} className="rounded-lg bg-surface-2 px-3 py-2">
              <span className="font-mono font-semibold">{r.key}</span>
              <p className="text-muted">{r.text}</p>
            </li>
          ))}
        </ul>
        <DemoNote className="mt-3">These insights would only be called "AI" if connected to an actual model and clearly labelled. Today they are deterministic rules.</DemoNote>
      </SectionCard>
    </div>
  );
}

function LiveFeed({ now }: { now: string }) {
  const db = useDbState();
  const events = Object.values(db.audit).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
  const play = (kind: 'enquiry' | 'cost') => {
    const rng = createRng(Date.now() % 99991);
    if (kind === 'enquiry') {
      const t = rng.pick(ENQUIRY_TEMPLATES);
      act(receiveEnquiry, { channel: t.channel, customerId: t.customerId, contactName: t.contactName, contactPhone: t.contactPhone, subject: t.subject, text: t.text, siteName: t.siteName, requiredBy: addDays(now, 3) }, { success: 'Demo event: simulated enquiry received' });
    } else {
      const ps = Object.values(db.products).filter((p) => p.volatility !== 'low' && !p.pendingChangeId);
      const p = rng.pick(ps);
      const pct = rng.pick([3, 4.5, 6, -2]);
      act(proposeCostChange, { productId: p.id, supplierCost: Math.round(p.latestCost * (1 + pct / 100)), source: 'supplier_list', reason: `Demo event: supplier notice ${pct > 0 ? '+' : ''}${pct}%` }, { success: `Demo event: ${p.sku} cost ${pct > 0 ? '+' : ''}${pct}% proposed` });
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="self-start p-4 xl:col-span-4">
        <p className="flex items-center gap-2 font-semibold">
          <Activity className="size-4 text-brand" /> Controlled demo events
        </p>
        <p className="mt-1 text-sm text-muted">Nothing changes by itself. Use these buttons to inject a realistic event and watch the modules react.</p>
        <div className="mt-3 flex flex-col gap-2">
          <Button variant="outline" onClick={() => play('enquiry')}>
            <Play className="size-4" /> Play: inbound enquiry
          </Button>
          <Gate perm="price.propose">
            <Button variant="outline" onClick={() => play('cost')}>
              <Play className="size-4" /> Play: supplier cost notice
            </Button>
          </Gate>
        </div>
      </Card>
      <SectionCard className="xl:col-span-8" title="Recent activity (audit trail)" subtitle="Real records — newest first">
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <motion.li key={e.id} layout initial={{ opacity: 0, y: -6, backgroundColor: 'var(--accent-soft)' }} animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 0.6 }} className="rounded-lg px-2 py-1.5 text-sm">
                <span className="text-ink">{e.summary}</span>
                <span className="block text-[11px] text-muted">
                  {relTime(e.at, now)} · {e.actor} · {e.action}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </SectionCard>
    </div>
  );
}
