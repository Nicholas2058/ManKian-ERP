import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import type { AuditEvent, BusinessConfig } from '@/domain/types';
import { useDbState, useDbStore, resetDemo, exportSnapshot, importSnapshot, getDb } from '@/store/db';
import { useSession, type Lang } from '@/store/session';
import { act } from '@/lib/act';
import { updateConfig, setFxRates } from '@/domain/commands/system';
import { ROLES, ROLE_ORDER, PERM_LABEL, can, canAccess, DASHBOARD_ROLES, type Permission } from '@/domain/roles';
import { NAV } from '@/app/nav';
import { useT } from '@/i18n';
import { UOM_LABELS } from '@/domain/uom';
import { LANG_LABEL } from '@/i18n';
import { useParam } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/dates';
import { formatRM } from '@/lib/money';
import { downloadText } from '@/lib/utils';
import { toCsv } from '@/services/csv';
import { fetchUsdMyr } from '@/services/fx';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui/core';
import { Tabs, TabPanel, Toggle, useConfirm, Segmented } from '@/components/ui/overlay';
import { PageHeader, Gate, SectionCard, DemoNote, KV } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { Check, Database, Download, Globe, Landmark, Lock, Logs, RotateCcw, Settings2, ShieldCheck, Upload, UserCog, X, Info, MessageCircle, Server, Ruler } from '@/components/ui/icons';

export default function SettingsPage() {
  const [tab, setTab] = useParam('tab');
  return (
    <div>
      <PageHeader title="Settings, Permissions & Audit" subtitle="Preferences, configurable business rules, the role simulator, integrations status, demo data controls and the full audit trail." />
      <Tabs
        id="set"
        value={tab ?? 'general'}
        onValueChange={(v) => setTab(v === 'general' ? null : v)}
        tabs={[
          { value: 'general', label: 'Preferences', icon: <Settings2 className="size-4" /> },
          { value: 'rules', label: 'Business rules', icon: <ShieldCheck className="size-4" /> },
          { value: 'tax', label: 'Tax', icon: <Landmark className="size-4" /> },
          { value: 'uom', label: 'UOM', icon: <Ruler className="size-4" /> },
          { value: 'roles', label: 'Roles', icon: <UserCog className="size-4" /> },
          { value: 'integrations', label: 'Integrations', icon: <Globe className="size-4" /> },
          { value: 'data', label: 'Demo data', icon: <Database className="size-4" /> },
          { value: 'audit', label: 'Audit log', icon: <Logs className="size-4" /> },
        ]}
      >
        <TabPanel value="general" className="pt-4">
          <Prefs />
        </TabPanel>
        <TabPanel value="rules" className="pt-4">
          <Rules />
        </TabPanel>
        <TabPanel value="tax" className="pt-4">
          <Tax />
        </TabPanel>
        <TabPanel value="uom" className="pt-4">
          <Uom />
        </TabPanel>
        <TabPanel value="roles" className="pt-4">
          <Roles />
        </TabPanel>
        <TabPanel value="integrations" className="pt-4">
          <Integrations />
        </TabPanel>
        <TabPanel value="data" className="pt-4">
          <Data />
        </TabPanel>
        <TabPanel value="audit" className="pt-4">
          <Audit />
        </TabPanel>
      </Tabs>
    </div>
  );
}

function Prefs() {
  const s = useSession();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Appearance & accessibility">
        <div className="space-y-4">
          <Field label="Theme">
            <Segmented id="pf-theme" value={s.theme} onChange={(v) => s.set({ theme: v })} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
          </Field>
          <Field label="Table density">
            <Segmented id="pf-dens" value={s.density} onChange={(v) => s.set({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
          </Field>
          <Field label="Motion" hint="System follows your OS 'reduce motion' setting">
            <Segmented id="pf-mo" value={s.motion} onChange={(v) => s.set({ motion: v })} options={[{ value: 'system', label: 'System' }, { value: 'reduce', label: 'Reduced' }, { value: 'full', label: 'Full' }]} />
          </Field>
          <Toggle checked={s.lowPower3d} onCheckedChange={(v) => s.set({ lowPower3d: v })} label="Low-power 3D (simpler geometry, no continuous animation)" />
          <Field label="Language" hint="English is complete; BM and 中文 cover navigation, dashboard and quotations (missing strings fall back to English).">
            <Select value={s.lang} onChange={(e) => s.set({ lang: e.target.value as Lang })}>
              {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="outline" onClick={() => { s.set({ onboardingDone: false }); toast.info('Onboarding will show again'); }}>
            Replay welcome tour
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="Notifications" subtitle="Which categories appear in the bell menu">
        <div className="space-y-3">
          {Object.keys(s.notifyPrefs).map((k) => (
            <Toggle key={k} checked={s.notifyPrefs[k]} onCheckedChange={(v) => s.set({ notifyPrefs: { ...s.notifyPrefs, [k]: v } })} label={<span className="capitalize">{k}</span>} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function Rules() {
  const db = useDbState();
  const [c, setC] = React.useState<BusinessConfig>(db.config);
  React.useEffect(() => setC(db.config), [db.config]);
  const [validity, setValidity] = React.useState(db.config.quoteValidityOptions.join(', '));
  const errs: string[] = [];
  if (c.minMarginPct >= c.targetMarginPct) errs.push('Minimum margin must be below target margin.');
  if (c.discountApprovalPct < 0 || c.discountApprovalPct > 50) errs.push('Discount approval threshold must be 0–50%.');
  const opts = validity.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  if (!opts.length) errs.push('Provide at least one validity option.');
  const save = () =>
    act(updateConfig, { patch: { minMarginPct: c.minMarginPct, targetMarginPct: c.targetMarginPct, discountApprovalPct: c.discountApprovalPct, quoteValidityOptions: opts, defaultValidityDays: opts.includes(c.defaultValidityDays) ? c.defaultValidityDays : opts[0], reservationHoldDays: c.reservationHoldDays, overdueBlockDays: c.overdueBlockDays, creditWarnPct: c.creditWarnPct, invoiceOnDelivery: c.invoiceOnDelivery, defaultTerms: c.defaultTerms } }, { success: 'Business rules saved' });
  const num = (k: keyof BusinessConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: Number(e.target.value) });
  return (
    <SectionCard title="Configurable business rules" subtitle="Illustrative defaults — confirm the client's real policies (see discovery questions)" actions={<Gate perm="settings.edit"><Button onClick={save} disabled={errs.length > 0}><Check className="size-4" /> Save</Button></Gate>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Company default target margin %">
          <Input type="number" value={c.targetMarginPct} onChange={num('targetMarginPct')} />
        </Field>
        <Field label="Company minimum margin floor %" hint="Category rules in Pricing can override">
          <Input type="number" value={c.minMarginPct} onChange={num('minMarginPct')} />
        </Field>
        <Field label="Line discount self-approval limit %">
          <Input type="number" value={c.discountApprovalPct} onChange={num('discountApprovalPct')} />
        </Field>
        <Field label="Quote validity options (days)" hint="0 = same day, e.g. 0, 3, 7, 14">
          <Input value={validity} onChange={(e) => setValidity(e.target.value)} />
        </Field>
        <Field label="Default validity (days)">
          <Select value={c.defaultValidityDays} onChange={num('defaultValidityDays') as never}>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o === 0 ? 'Same day' : `${o} days`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reservation hold (days after required date)">
          <Input type="number" value={c.reservationHoldDays} onChange={num('reservationHoldDays')} />
        </Field>
        <Field label="Block credit when invoice overdue > (days)">
          <Input type="number" value={c.overdueBlockDays} onChange={num('overdueBlockDays')} />
        </Field>
        <Field label="Credit warning at % of limit">
          <Input type="number" value={c.creditWarnPct} onChange={num('creditWarnPct')} />
        </Field>
        <div className="flex items-end">
          <Toggle checked={c.invoiceOnDelivery} onCheckedChange={(v) => setC({ ...c, invoiceOnDelivery: v })} label="Auto-invoice on delivery / collection" />
        </div>
        <Field label="Default quotation terms" className="sm:col-span-2 xl:col-span-3">
          <Textarea value={c.defaultTerms} onChange={(e) => setC({ ...c, defaultTerms: e.target.value })} />
        </Field>
      </div>
      {errs.length > 0 && <p className="mt-3 text-sm text-danger">{errs.join(' ')}</p>}
    </SectionCard>
  );
}

function Tax() {
  const db = useDbState();
  const [t, setT] = React.useState(db.config.tax);
  React.useEffect(() => setT(db.config.tax), [db.config.tax]);
  return (
    <SectionCard title="Sales tax (SST) configuration" subtitle="Not hard-coded. Applies to new quotes and invoices only." actions={<Gate perm="settings.edit"><Button onClick={() => act(updateConfig, { patch: { tax: t } }, { success: 'Tax configuration saved' })}><Check className="size-4" /> Save</Button></Gate>}>
      <DemoNote className="mb-4">{db.config.tax.note} Issued quotations and existing invoices keep the tax they were created with.</DemoNote>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-end">
          <Toggle checked={t.enabled} onCheckedChange={(v) => setT({ ...t, enabled: v })} label="Charge tax on sales" />
        </div>
        <Field label="Label">
          <Input value={t.label} onChange={(e) => setT({ ...t, label: e.target.value })} />
        </Field>
        <Field label="Rate %" hint="Confirm the applicable rate and taxable items">
          <Input type="number" step="0.1" value={t.ratePct} onChange={(e) => setT({ ...t, ratePct: Number(e.target.value) })} />
        </Field>
      </div>
    </SectionCard>
  );
}

function Uom() {
  const db = useDbState();
  const used = Object.entries(UOM_LABELS).map(([k, l]) => ({ k, l, n: Object.values(db.products).filter((p) => p.baseUom === k || p.uoms.some((u) => u.uom === k)).length }));
  const examples = Object.values(db.products).filter((p) => p.uoms.length).slice(0, 12);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Units of measure" subtitle="Codes available to products">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {used.map((u) => (
            <div key={u.k} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="font-mono font-semibold">{u.k}</span> <span className="text-muted">{u.l}</span>
              <span className="block text-[11px] text-muted">{u.n} products</span>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Product-specific conversions" subtitle="Never guessed globally — e.g. a BOX of elbows differs by size">
        <ul className="space-y-1 text-sm">
          {examples.map((p) => (
            <li key={p.id} className="flex justify-between rounded-lg bg-surface-2 px-3 py-1.5">
              <span>
                <span className="font-mono text-xs">{p.sku}</span> {p.variantLabel ?? ''}
              </span>
              <span className="tabular text-xs">{p.uoms.map((u) => `1 ${u.uom} = ${u.factor} ${p.baseUom}`).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function Roles() {
  const role = useSession((s) => s.role);
  const set = useSession((s) => s.set);
  const t = useT();
  const perms = Object.keys(PERM_LABEL) as Permission[];
  const modules = NAV.flatMap((g) => g.items).filter((m) => m.path !== '/');
  return (
    <div className="space-y-4">
    <SectionCard title="Module access by role" subtitle="Each role gets its own menu and home screen">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2 text-left text-muted">Module</th>
              {ROLE_ORDER.map((r) => (
                <th key={r} className="px-1 py-2">
                  <button onClick={() => set({ role: r })} className={`rounded-lg px-2 py-1 font-semibold ${role === r ? 'bg-brand text-white dark:text-forest-950' : 'hover:bg-surface-3'}`}>
                    {ROLES[r].label.split(' ')[0]}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line/50">
              <td className="py-1.5 text-ink-2">Home screen</td>
              {ROLE_ORDER.map((r) => (
                <td key={r} className="text-center text-[10px] text-muted">
                  {DASHBOARD_ROLES.includes(r) ? 'Dashboard' : 'Workspace'}
                </td>
              ))}
            </tr>
            {modules.map((m) => (
              <tr key={m.path} className="border-b border-line/50">
                <td className="py-1.5 text-ink-2">{t(m.key)}</td>
                {ROLE_ORDER.map((r) => (
                  <td key={r} className="text-center">
                    {canAccess(r, m.path) ? <Check className="mx-auto size-4 text-brand" /> : <X className="mx-auto size-3.5 text-line-strong" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
    <SectionCard title="Role simulator" subtitle="Visual demonstration of permissions — NOT real security">
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft/50 p-3 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-danger" />
        Role switching runs entirely in the browser and anyone can change it. A production system needs server-side authentication (e.g. Cloudflare Access or an identity provider) and authorisation enforced in Pages Functions.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="py-2 text-left text-muted">Permission</th>
              {ROLE_ORDER.map((r) => (
                <th key={r} className="px-1 py-2">
                  <button onClick={() => set({ role: r })} className={`rounded-lg px-2 py-1 font-semibold ${role === r ? 'bg-brand text-white dark:text-forest-950' : 'hover:bg-surface-3'}`}>
                    {ROLES[r].label.split(' ')[0]}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p} className="border-b border-line/50">
                <td className="py-1.5 capitalize text-ink-2">{PERM_LABEL[p]}</td>
                {ROLE_ORDER.map((r) => (
                  <td key={r} className="text-center">
                    {can(r, p) ? <Check className="mx-auto size-4 text-brand" /> : <X className="mx-auto size-3.5 text-line-strong" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
    </div>
  );
}

function Integrations() {
  const db = useDbState();
  const [loading, setLoading] = React.useState(false);
  const fx = db.config.fx;
  const items: [string, string, string, React.ReactNode][] = [
    ['NEWPAGES website', 'Not connected', 'No documented NEWPAGES API is assumed. A catalog adapter interface and CSV export (Catalog → Export) are ready for a future sync; the public site would show "Price on request" only.', <Globe className="size-4" />],
    ['WhatsApp Business', 'Not connected', 'Enquiries are simulated. "Copy WhatsApp draft" and "Open WhatsApp" are explicit user actions; nothing is auto-sent.', <MessageCircle className="size-4" />],
    ['Accounting (AutoCount / other)', 'Not connected', 'Neutral journal CSV export available in Finance. The package in use must be confirmed with the client.', <Landmark className="size-4" />],
    ['LHDN MyInvois', 'Not connected', 'Readiness preview only. Requires credentials, tax configuration and official sandbox testing.', <ShieldCheck className="size-4" />],
    ['Shared backend (Cloudflare D1)', 'Disabled', 'Repository interface + prototype in integrations/d1-prototype. Requires authentication and server-side authorisation before use.', <Server className="size-4" />],
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <SectionCard className="xl:col-span-7" title="Integration status" subtitle="Documented seams — nothing external is connected in the demo">
        <ul className="space-y-2">
          {items.map(([n, s, d, icon]) => (
            <li key={n} className="flex gap-3 rounded-xl border border-line p-3">
              <span className="mt-0.5 text-muted">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{n}</span>
                  <Badge>{s}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard className="xl:col-span-5" title="Reference FX (optional)" subtitle="For imported goods — reference only, never auto-applied to approved costs or prices">
        <KV k="USD → MYR" v={<span className="tabular font-semibold">{fx.usdMyr.toFixed(4)}</span>} />
        <KV k="Source" v={fx.source} />
        <KV k="Retrieved" v={fx.retrievedAt ? fmtDateTime(fx.retrievedAt) : 'Seed value'} />
        <KV k="Type" v={fx.synthetic ? <Badge tone="amber">synthetic</Badge> : <Badge tone="green">provider</Badge>} />
        <Button
          className="mt-3"
          variant="outline"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            const r = await fetchUsdMyr();
            setLoading(false);
            act(setFxRates, { usdMyr: r.usdMyr, source: r.source, synthetic: r.synthetic }, { success: r.synthetic ? 'Provider unavailable — synthetic fallback rate recorded' : `Reference rate ${r.usdMyr.toFixed(4)} from ${r.source}` });
          }}
        >
          <RotateCcw className="size-4" /> Fetch reference rate (Frankfurter)
        </Button>
        <p className="mt-2 text-[11px] text-muted">Bank Negara Malaysia also publishes official rates. Any costing conversion should be manually approved.</p>
      </SectionCard>
    </div>
  );
}

function Data() {
  const confirm = useConfirm();
  const repo = useDbStore((s) => s.repoKind);
  const db = useDbState();
  const counts = { products: Object.keys(db.products).length, quotes: Object.keys(db.quotes).length, orders: Object.keys(db.salesOrders).length, invoices: Object.keys(db.invoices).length, audit: Object.keys(db.audit).length };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Where is the data?" icon={<Info className="size-4 text-brand" />}>
        <p className="text-sm text-ink-2">
          All demo data is stored in <b>this browser's IndexedDB</b> on this device ({repo === 'memory' ? 'currently in-memory because storage is unavailable' : 'persistent'}). It is not shared between devices or users, not backed up, and not secure. Anyone can read a static site's JavaScript — never put real prices or customer data in this demo.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 text-sm">
          {Object.entries(counts).map(([k, v]) => (
            <KV key={k} k={k} v={v.toLocaleString()} />
          ))}
          <KV k="Seeded" v={fmtDateTime(db.config.seededAt)} />
          <KV k="Data version" v={db.config.dataVersion} />
        </div>
      </SectionCard>
      <SectionCard title="Demo data controls">
        <div className="space-y-3">
          <Button
            variant="danger"
            onClick={async () => {
              if (await confirm({ title: 'Reset all demo data?', body: 'Everything is regenerated from the deterministic seed (90 days of fictional history ending today). Your changes will be lost.', confirmLabel: 'Reset demo data', danger: true, requireText: 'RESET' })) {
                await resetDemo();
                toast.success('Demo data reset');
              }
            }}
          >
            <RotateCcw className="size-4" /> Reset demo data
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { downloadText(`mk-erp-demo-snapshot-${new Date().toISOString().slice(0, 10)}.json`, exportSnapshot(), 'application/json'); toast.success('Snapshot exported'); }}>
              <Download className="size-4" /> Export snapshot (JSON)
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
              <Upload className="size-4" /> Import snapshot
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!(await confirm({ title: 'Replace current demo data with this snapshot?', confirmLabel: 'Import', danger: true }))) return;
                  try {
                    await importSnapshot(await f.text());
                    toast.success('Snapshot imported');
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Import failed');
                  }
                }}
              />
            </label>
          </div>
          <p className="text-xs text-muted">Snapshots let you prepare a scenario on one device and replay it on another. Total open AR now: {formatRM(Object.values(getDb().invoices).reduce((s, i) => s + Math.max(0, i.total - i.paid - i.credited), 0))}.</p>
        </div>
      </SectionCard>
    </div>
  );
}

function Audit() {
  const db = useDbState();
  const [entity, setEntity] = React.useState('');
  const rows = React.useMemo(() => Object.values(db.audit).filter((a) => !entity || a.entityType === entity).sort((a, b) => b.at.localeCompare(a.at)), [db.audit, entity]);
  const types = [...new Set(Object.values(db.audit).map((a) => a.entityType))].sort();
  const columns = React.useMemo<ColumnDef<AuditEvent, unknown>[]>(
    () => [
      { id: 'at', header: 'Time', accessorKey: 'at', cell: (c) => <span className="whitespace-nowrap text-xs">{fmtDateTime(c.row.original.at)}</span> },
      { id: 'actor', header: 'User', accessorKey: 'actor', cell: (c) => <span className="text-xs">{c.row.original.actor} <span className="text-muted">({ROLES[c.row.original.role]?.label})</span></span> },
      { id: 'action', header: 'Action', accessorKey: 'action', cell: (c) => <span className="font-mono text-[11px]">{c.getValue() as string}</span> },
      { id: 'ref', header: 'Record', accessorFn: (a) => a.entityRef ?? a.entityId, cell: (c) => <span className="font-mono text-[11px]">{c.getValue() as string}</span> },
      { id: 'summary', header: 'Change', accessorKey: 'summary', cell: (c) => <span className="line-clamp-2 max-w-[460px] text-xs">{c.row.original.summary}{c.row.original.changes?.length ? <span className="block text-muted">{c.row.original.changes.map((x) => `${x.field}: ${x.from} → ${x.to}`).join('; ')}</span> : null}</span> },
      { id: 'reason', header: 'Reason', accessorFn: (a) => a.reason ?? '', cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
    ],
    [],
  );
  return (
    <DataTable
      id="audit"
      data={rows}
      columns={columns}
      getRowId={(a) => a.id}
      exportName="audit-log"
      pageSize={25}
      minWidth={1000}
      searchPlaceholder="Search user, action, record, text…"
      toolbar={
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="h-9 w-auto" aria-label="Record type">
          <option value="">All record types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      }
    />
  );
}
