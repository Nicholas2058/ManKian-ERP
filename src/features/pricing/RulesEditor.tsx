import * as React from 'react';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { updatePriceRule } from '@/domain/commands/pricing';
import type { CustomerTier, PriceRule } from '@/domain/types';
import { TIERS, TIER_LABELS } from '@/domain/pricing';
import { fmtDateTime } from '@/lib/dates';
import { Badge, Button, Field, Input, Select } from '@/components/ui/core';
import { Gate, SectionCard, DemoNote } from '@/components/widgets';
import { Save, SlidersHorizontal, Plus, Trash } from '@/components/ui/icons';
import { formatRM } from '@/lib/money';

export function RulesEditor() {
  const db = useDbState();
  const rules = Object.values(db.priceRules).sort((a, b) => (a.scope === 'global' ? -1 : b.scope === 'global' ? 1 : a.name.localeCompare(b.name)));
  const [sel, setSel] = React.useState(rules[0]?.id);
  const rule = sel ? db.priceRules[sel] : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <SectionCard className="xl:col-span-4" title="Pricing rules" subtitle="Product rule › category rule › company default">
        <ul className="space-y-1">
          {rules.map((r) => (
            <li key={r.id}>
              <button onClick={() => setSel(r.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${sel === r.id ? 'bg-accent-soft text-ink' : 'hover:bg-surface-2'}`}>
                <span>
                  <span className="block font-medium">{r.name}</span>
                  <span className="text-[11px] text-muted">
                    {r.method} · target {r.targetMarginPct}% · floor {r.minMarginPct}%
                  </span>
                </span>
                <Badge tone={r.scope === 'global' ? 'dark' : 'neutral'}>{r.scope}</Badge>
              </button>
            </li>
          ))}
        </ul>
        <DemoNote className="mt-4">Rules are illustrative. The client's real pricing policy (fixed margin, markup, tiers, contract rates, tenders) must be confirmed — see the discovery questions in the documentation.</DemoNote>
      </SectionCard>
      {rule && <RuleForm key={rule.id + rule.updatedAt} rule={rule} />}
    </div>
  );
}

function RuleForm({ rule }: { rule: PriceRule }) {
  const [r, setR] = React.useState<PriceRule>(rule);
  const set = <K extends keyof PriceRule>(k: K, v: PriceRule[K]) => setR({ ...r, [k]: v });
  const errors: string[] = [];
  if (r.targetMarginPct <= r.minMarginPct) errors.push('Target margin must be above the minimum margin floor.');
  if (r.targetMarginPct >= 90 || r.minMarginPct < 0) errors.push('Margins must be between 0% and 90%.');
  if (Object.values(r.tierDiscountPct).some((d) => d < 0 || d > 40)) errors.push('Tier discounts must be 0–40%.');
  const save = () => act(updatePriceRule, { ruleId: rule.id, patch: r }, { success: `Saved "${r.name}" — suggestions recalculate immediately` });
  return (
    <SectionCard
      className="xl:col-span-8"
      title={<span className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-brand" /> {rule.name}</span>}
      subtitle={`Last updated ${fmtDateTime(rule.updatedAt)} by ${rule.updatedBy}`}
      actions={
        <Gate perm="price.rules">
          <Button onClick={save} disabled={errors.length > 0}>
            <Save className="size-4" /> Save rule
          </Button>
        </Gate>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Method">
          <Select value={r.method} onChange={(e) => set('method', e.target.value as PriceRule['method'])}>
            <option value="margin">Cost-plus by target margin</option>
            <option value="markup">Cost-plus by markup</option>
            <option value="fixed">Manual fixed price</option>
          </Select>
        </Field>
        <Field label="Target gross margin %" hint="price = cost ÷ (1 − margin)">
          <Input type="number" step="0.5" value={r.targetMarginPct} onChange={(e) => set('targetMarginPct', Number(e.target.value))} />
        </Field>
        <Field label="Markup %" hint="price = cost × (1 + markup)">
          <Input type="number" step="0.5" value={r.markupPct} onChange={(e) => set('markupPct', Number(e.target.value))} />
        </Field>
        <Field label="Minimum margin floor %" hint="Below this needs manager approval">
          <Input type="number" step="0.5" value={r.minMarginPct} onChange={(e) => set('minMarginPct', Number(e.target.value))} />
        </Field>
        <Field label="Approval if list price changes by more than %">
          <Input type="number" step="1" value={r.approvalChangePct} onChange={(e) => set('approvalChangePct', Number(e.target.value))} />
        </Field>
        <Field label="Price ending (round up to sen)">
          <Select value={r.roundingSen} onChange={(e) => set('roundingSen', Number(e.target.value))}>
            {[1, 5, 10, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} sen
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Freight add-on per unit (RM)" hint="Optional, for delivered pricing">
          <Input type="number" step="0.01" value={r.freightPerUnit / 100} onChange={(e) => set('freightPerUnit', Math.round(Number(e.target.value) * 100))} />
        </Field>
        {r.method === 'fixed' && (
          <Field label="Fixed price (RM)">
            <Input type="number" step="0.05" value={(r.fixedPrice ?? 0) / 100} onChange={(e) => set('fixedPrice', Math.round(Number(e.target.value) * 100))} />
          </Field>
        )}
      </div>
      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Customer tier discounts off list</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {TIERS.map((t) => (
          <Field key={t} label={TIER_LABELS[t]}>
            <Input type="number" step="0.5" value={r.tierDiscountPct[t]} onChange={(e) => set('tierDiscountPct', { ...r.tierDiscountPct, [t as CustomerTier]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      <div className="mb-2 mt-5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Volume (bulk) discount breaks</p>
        <Button size="xs" variant="ghost" onClick={() => set('bulkBreaks', [...r.bulkBreaks, { minQty: 100, discountPct: 2 }])}>
          <Plus className="size-3.5" /> Add break
        </Button>
      </div>
      {r.bulkBreaks.length === 0 && <p className="text-sm text-muted">No volume breaks.</p>}
      <div className="space-y-2">
        {r.bulkBreaks.map((b, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label="From qty (base units)" className="flex-1">
              <Input type="number" value={b.minQty} onChange={(e) => set('bulkBreaks', r.bulkBreaks.map((x, j) => (j === i ? { ...x, minQty: Number(e.target.value) } : x)))} />
            </Field>
            <Field label="Discount %" className="flex-1">
              <Input type="number" step="0.5" value={b.discountPct} onChange={(e) => set('bulkBreaks', r.bulkBreaks.map((x, j) => (j === i ? { ...x, discountPct: Number(e.target.value) } : x)))} />
            </Field>
            <Button variant="ghost" size="icon" onClick={() => set('bulkBreaks', r.bulkBreaks.filter((_, j) => j !== i))} aria-label="Remove break">
              <Trash className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      {errors.length > 0 && <div className="mt-4 rounded-lg bg-danger-soft p-3 text-xs text-danger">{errors.join(' ')}</div>}
      <p className="mt-4 text-xs text-muted">
        Example: cost RM 10.00 → suggested {r.method === 'markup' ? formatRM(Math.ceil((1000 * (1 + r.markupPct / 100)) / r.roundingSen) * r.roundingSen) : formatRM(Math.ceil(1000 / (1 - r.targetMarginPct / 100) / r.roundingSen) * r.roundingSen)}; floor {formatRM(Math.ceil(1000 / (1 - r.minMarginPct / 100) / r.roundingSen) * r.roundingSen)}. Contract prices and issued quotes are not changed by rule edits.
      </p>
    </SectionCard>
  );
}
