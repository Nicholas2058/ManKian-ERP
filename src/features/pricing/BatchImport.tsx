import * as React from 'react';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { importCostBatch, decideBatch } from '@/domain/commands/pricing';
import { COST_TEMPLATE, parseCostCsv, type CostPreviewRow } from '@/services/csv';
import { downloadText, cn } from '@/lib/utils';
import { formatPct, formatRM } from '@/lib/money';
import { fmtDateTime } from '@/lib/dates';
import { Badge, Button, Card, EmptyState, Field, Input, Textarea, Stat } from '@/components/ui/core';
import { Gate, SectionCard } from '@/components/widgets';
import { Download, FileUp, Upload, Check, X, AlertTriangle, FileSpreadsheet } from '@/components/ui/icons';

export function BatchImport() {
  const db = useDbState();
  const [text, setText] = React.useState('');
  const [fileName, setFileName] = React.useState('pasted-price-list.csv');
  const [eff, setEff] = React.useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const parsed = React.useMemo(() => (text.trim() ? parseCostCsv(text, db) : null), [text, db]);
  const valid = parsed?.rows.filter((r) => r.ok && r.changePct !== 0) ?? [];
  const errors = parsed?.rows.filter((r) => !r.ok) ?? [];
  const ups = valid.filter((r) => (r.changePct ?? 0) > 0).length;
  const downs = valid.filter((r) => (r.changePct ?? 0) < 0).length;
  const avg = valid.length ? valid.reduce((s, r) => s + (r.changePct ?? 0), 0) / valid.length : 0;
  const batches = Object.values(db.priceBatches).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) return alert('File too large for the demo (max 1 MB).');
    setFileName(f.name);
    setText(await f.text());
  };
  const sample = () => {
    const rows = Object.values(db.products)
      .filter((p) => ['plb', 'ind'].includes(p.categoryId))
      .slice(0, 8)
      .map((p, i) => `${p.sku},${db.suppliers[p.preferredSupplierId].code},${((p.latestCost * (1 + (i % 3 === 0 ? 0.06 : i % 3 === 1 ? 0.025 : -0.02))) / 100).toFixed(2)},,Weekly supplier list`);
    setText(`sku,supplier_code,supplier_cost_rm,effective_date,note\n${rows.join('\n')}\nUNKNOWN-SKU,SUP-ARD,10.00,,bad row example\nPVE-050,SUP-SPP,abc,,non-numeric cost example\n`);
    setFileName('sample-supplier-list.csv');
  };
  const submit = () => {
    const r = act(
      importCostBatch,
      { fileName, rowCount: parsed?.rows.length ?? 0, errorCount: errors.length, effectiveFrom: new Date(`${eff}T00:00:00+08:00`).toISOString(), rows: valid.map((v) => ({ productId: v.productId!, supplierCost: v.supplierCost!, supplierId: v.supplierId, effectiveFrom: v.effectiveFrom, note: v.note })) },
      { success: (b) => `Batch ${b.number} created with ${b.validCount} proposed changes` },
    );
    if (r) setText('');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="space-y-4 p-4 sm:p-5 xl:col-span-5">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FileSpreadsheet className="size-4 text-brand" /> Import supplier price list
          </h3>
          <p className="mt-1 text-xs text-muted">CSV with columns sku, supplier_code, supplier_cost_rm, effective_date (YYYY-MM-DD), note. Each valid row becomes a proposed cost version; nothing changes until approved.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadText('supplier-cost-template.csv', COST_TEMPLATE, 'text/csv')}>
            <Download className="size-4" /> Template
          </Button>
          <Button variant="outline" size="sm" onClick={sample}>
            <FileSpreadsheet className="size-4" /> Load sample (with bad rows)
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-surface-2">
            <FileUp className="size-4" /> Choose CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </div>
        <Field label="Or paste CSV">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[160px] font-mono text-xs" placeholder={COST_TEMPLATE} />
        </Field>
        <Field label="Default effective date" hint="Used when a row has no date">
          <Input type="date" value={eff} onChange={(e) => setEff(e.target.value)} />
        </Field>
        {parsed?.headerError && (
          <p className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-xs text-danger">
            <AlertTriangle className="size-4 shrink-0" />
            {parsed.headerError}
          </p>
        )}
      </Card>

      <div className="space-y-4 xl:col-span-7">
        <SectionCard title="Preview & validation" subtitle={parsed ? `${parsed.rows.length} rows · ${fileName}` : 'Load a file to preview'}>
          {!parsed || parsed.rows.length === 0 ? (
            <EmptyState icon={<Upload className="size-6" />} title="No rows yet" body="Import or paste a supplier price list. Bad rows are shown with reasons and never imported." />
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Valid changes" value={valid.length} tone="good" />
                <Stat label="Rejected rows" value={errors.length} tone={errors.length ? 'danger' : undefined} />
                <Stat label="Up / down" value={`${ups} / ${downs}`} />
                <Stat label="Avg change" value={formatPct(avg, 1, true)} />
              </div>
              <div className="scrollbar-thin max-h-[360px] overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">Line</th>
                      <th className="px-2 py-2 text-left">SKU</th>
                      <th className="px-2 py-2 text-right">Current</th>
                      <th className="px-2 py-2 text-right">New</th>
                      <th className="px-2 py-2 text-right">Δ</th>
                      <th className="px-2 py-2 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((r) => (
                      <PreviewRow key={r.line} r={r} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <Gate perm="price.propose">
                  <Button onClick={submit} disabled={!valid.length}>
                    <Upload className="size-4" /> Submit {valid.length} change(s) for approval
                  </Button>
                </Gate>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard title="Import batches" subtitle="Approve or reject a whole batch; individual changes can also be decided in the approval inbox">
          {batches.length === 0 ? (
            <p className="text-sm text-muted">No batches yet.</p>
          ) : (
            <ul className="space-y-2">
              {batches.map((b) => {
                const pend = b.changeIds.filter((id) => db.priceChanges[id]?.status === 'pending').length;
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {b.number} <span className="font-normal text-muted">· {b.fileName}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {fmtDateTime(b.createdAt)} · {b.createdBy} · {b.validCount} valid, {b.errorCount} rejected · {pend} pending
                      </p>
                    </div>
                    <Badge tone={b.status === 'approved' ? 'green' : b.status === 'rejected' ? 'red' : b.status === 'pending' ? 'amber' : 'blue'}>{b.status.replace('_', ' ')}</Badge>
                    {pend > 0 && (
                      <Gate perm="price.approve" compact>
                        <Button size="sm" onClick={() => act(decideBatch, { batchId: b.id, approve: true }, { success: `Batch ${b.number} approved` })}>
                          <Check className="size-4" /> Approve all
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => act(decideBatch, { batchId: b.id, approve: false }, { success: `Batch ${b.number} rejected` })}>
                          <X className="size-4" /> Reject
                        </Button>
                      </Gate>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function PreviewRow({ r }: { r: CostPreviewRow }) {
  const db = useDbState();
  const p = r.productId ? db.products[r.productId] : undefined;
  return (
    <tr className={cn('border-t border-line', !r.ok && 'bg-danger-soft/40')}>
      <td className="px-2 py-1.5 text-muted">{r.line}</td>
      <td className="px-2 py-1.5 font-mono">{r.raw.sku}</td>
      <td className="tabular px-2 py-1.5 text-right">{p ? formatRM(p.latestCost) : '—'}</td>
      <td className="tabular px-2 py-1.5 text-right font-semibold">{r.supplierCost ? formatRM(r.supplierCost) : r.raw.supplier_cost_rm}</td>
      <td className={cn('tabular px-2 py-1.5 text-right', (r.changePct ?? 0) > 0 ? 'text-danger' : 'text-info')}>{r.changePct !== undefined ? formatPct(r.changePct, 1, true) : ''}</td>
      <td className="px-2 py-1.5">
        {r.ok ? (
          <span className="flex items-center gap-1 text-accent-ink">
            <Check className="size-3.5" /> {r.warnings.length ? r.warnings.join('; ') : 'OK'}
          </span>
        ) : (
          <span className="text-danger">{r.errors.join('; ')}</span>
        )}
      </td>
    </tr>
  );
}
