import * as React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Customer, CustomerTier, CustomerType } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { addCustomerNote, createCustomer, updateCustomer } from '@/domain/commands/sales';
import { ageing, creditPosition, invoiceBalance, invoiceState } from '@/domain/finance';
import { TIER_LABELS, TIERS } from '@/domain/pricing';
import { useNow, useParam } from '@/lib/hooks';
import { compactRM, formatPct, formatRM, toSen } from '@/lib/money';
import { addDays, daysOverdue, fmtDate, relTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, Field, Input, Progress, Select, Textarea } from '@/components/ui/core';
import { Drawer, Modal } from '@/components/ui/overlay';
import { PageHeader, Gate, KV, SectionCard, KpiTile, fmtInt, fmtCompact } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/status';
import { FileText, Lock, Pencil, Plus, Tag, Users, Wallet, X, AlertTriangle, MapPin, Phone, Mail } from '@/components/ui/icons';

const TYPES: CustomerType[] = ['contractor', 'renovation', 'industrial', 'project', 'trade', 'walkin'];

export default function CustomersPage() {
  const db = useDbState();
  const now = useNow();
  const [id, setId] = useParam('id');
  const [type, setType] = React.useState('');
  const [tier, setTier] = React.useState('');
  const [create, setCreate] = React.useState(false);
  const rows = React.useMemo(() => Object.values(db.customers).filter((c) => (!type || c.type === type) && (!tier || c.tier === tier)), [db.customers, type, tier]);
  const cp = React.useMemo(() => Object.fromEntries(Object.values(db.customers).map((c) => [c.id, creditPosition(db, c.id, now)])), [db, now]);
  const lastOrder = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of Object.values(db.salesOrders)) if (!m[o.customerId] || o.createdAt > m[o.customerId]) m[o.customerId] = o.createdAt;
    return m;
  }, [db.salesOrders]);
  const columns = React.useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      { id: 'name', header: 'Customer', accessorKey: 'name', cell: (c) => <span className="font-medium">{c.row.original.name}</span> },
      { id: 'code', header: 'Code', accessorKey: 'code', cell: (c) => <span className="font-mono text-xs">{c.getValue() as string}</span> },
      { id: 'type', header: 'Type', accessorKey: 'type', cell: (c) => <span className="text-xs capitalize text-muted">{c.getValue() as string}</span> },
      { id: 'tier', header: 'Price tier', accessorFn: (c) => TIER_LABELS[c.tier], cell: (c) => <Badge tone={c.row.original.tier === 'key' ? 'violet' : c.row.original.tier === 'project' ? 'blue' : 'neutral'}>{c.getValue() as string}</Badge> },
      { id: 'limit', header: 'Credit limit', accessorKey: 'creditLimit', meta: { align: 'right' }, cell: (c) => (c.row.original.creditLimit ? compactRM(c.row.original.creditLimit) : <span className="text-muted">Cash</span>) },
      { id: 'util', header: 'Utilisation', accessorFn: (c) => cp[c.id]?.utilisationPct ?? 0, cell: (c) => (c.row.original.creditLimit ? <div className="w-28"><Progress value={Math.min(100, c.getValue() as number)} tone={cp[c.row.original.id]?.status === 'ok' ? 'green' : cp[c.row.original.id]?.status === 'near' ? 'amber' : 'red'} /><span className="text-[10px] text-muted">{(c.getValue() as number).toFixed(0)}%</span></div> : null) },
      { id: 'out', header: 'Outstanding', accessorFn: (c) => cp[c.id]?.outstanding ?? 0, meta: { align: 'right' }, cell: (c) => compactRM(c.getValue() as number) },
      { id: 'od', header: 'Overdue', accessorFn: (c) => cp[c.id]?.overdue ?? 0, meta: { align: 'right' }, cell: (c) => <span className={(c.getValue() as number) ? 'font-semibold text-danger' : 'text-muted'}>{(c.getValue() as number) ? compactRM(c.getValue() as number) : '—'}</span> },
      { id: 'last', header: 'Last order', accessorFn: (c) => lastOrder[c.id] ?? '', cell: (c) => <span className="text-xs text-muted">{c.getValue() ? relTime(c.getValue() as string, now) : '—'}</span> },
      { id: 'tags', header: 'Tags', accessorFn: (c) => c.tags.join(', '), cell: (c) => <span className="flex flex-wrap gap-1">{c.row.original.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> },
    ],
    [cp, lastOrder, now],
  );
  const overdueCust = Object.values(cp).filter((x) => x.overdue > 0).length;
  const sel = id ? db.customers[id] : undefined;
  return (
    <div>
      <PageHeader
        title="Customers & Accounts"
        subtitle="Contractors, renovation firms, industrial buyers, project accounts and walk-in accounts. All names, contacts and addresses are fictional."
        actions={
          <Gate perm="customer.edit">
            <Button onClick={() => setCreate(true)}>
              <Plus className="size-4" /> New customer
            </Button>
          </Gate>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Accounts" value={Object.keys(db.customers).length} format={fmtInt} icon={<Users className="size-3.5" />} />
        <KpiTile label="With overdue invoices" value={overdueCust} format={fmtInt} tone={overdueCust ? 'warn' : 'default'} icon={<AlertTriangle className="size-3.5" />} />
        <KpiTile label="Over / near credit limit" value={Object.values(cp).filter((x) => x.status !== 'ok').length} format={fmtInt} icon={<Lock className="size-3.5" />} />
        <KpiTile label="Total receivables" value={Object.values(cp).reduce((s, x) => s + x.outstanding, 0)} format={fmtCompact} icon={<Wallet className="size-3.5" />} />
      </div>
      <DataTable
        id="customers"
        data={rows}
        columns={columns}
        getRowId={(c) => c.id}
        onRowClick={(c) => setId(c.id)}
        exportName="customers"
        minWidth={1000}
        toolbar={
          <>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-auto" aria-label="Type">
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </Select>
            <Select value={tier} onChange={(e) => setTier(e.target.value)} className="h-9 w-auto" aria-label="Tier">
              <option value="">All tiers</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </Select>
          </>
        }
        mobileCard={(c) => (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{c.name}</span>
              <Badge>{TIER_LABELS[c.tier]}</Badge>
            </div>
            <p className="text-xs text-muted">
              {c.type} · outstanding {compactRM(cp[c.id]?.outstanding ?? 0)} {cp[c.id]?.overdue ? `· ${compactRM(cp[c.id].overdue)} overdue` : ''}
            </p>
          </div>
        )}
      />
      <Drawer open={!!sel} onOpenChange={(o) => !o && setId(null)} title={sel?.name ?? ''} subtitle={sel ? `${sel.code} · ${sel.type} · fictional account` : ''} width="max-w-2xl">
        {sel && <CustomerProfile c={sel} now={now} />}
      </Drawer>
      <CustomerForm open={create} onOpenChange={setCreate} />
    </div>
  );
}

function CustomerProfile({ c, now }: { c: Customer; now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const [note, setNote] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [edit, setEdit] = React.useState(false);
  const cp = creditPosition(db, c.id, now);
  const invs = Object.values(db.invoices).filter((i) => i.customerId === c.id).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const ag = ageing(invs, now);
  const quotes = Object.values(db.quotes).filter((q) => q.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const orders = Object.values(db.salesOrders).filter((o) => o.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const enq = Object.values(db.enquiries).filter((e) => e.customerId === c.id);
  const ags = Object.values(db.agreements).filter((a) => a.customerId === c.id);
  // scorecard (simulated trade activity, not personal profiling)
  const cut = addDays(now, -90);
  const sales90 = invs.filter((i) => i.issueDate >= cut).reduce((s, i) => s + i.subtotal, 0);
  const cost90 = invs.filter((i) => i.issueDate >= cut).reduce((s, i) => s + i.cost, 0);
  const decided = quotes.filter((q) => ['accepted', 'converted', 'rejected', 'expired'].includes(q.status));
  const won = decided.filter((q) => ['accepted', 'converted'].includes(q.status)).length;
  const paid = Object.values(db.payments).filter((p) => p.customerId === c.id);
  const onTimePays = paid.flatMap((p) => p.allocations.map((a) => ({ a, p }))).filter(({ a, p }) => daysOverdue(db.invoices[a.invoiceId]?.dueDate ?? p.receivedAt, p.receivedAt) === 0).length;
  const allocs = paid.reduce((s, p) => s + p.allocations.length, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => nav(`/quotes/new?customer=${c.id}`)}>
          <FileText className="size-4" /> New quotation
        </Button>
        <Gate perm="customer.edit" fallback={null}>
          <Button variant="outline" onClick={() => setEdit(true)}>
            <Pencil className="size-4" /> Edit
          </Button>
        </Gate>
        <Button variant="outline" onClick={() => nav(`/finance?tab=receivables&customer=${c.id}`)}>
          <Wallet className="size-4" /> Receivables
        </Button>
      </div>
      <Card className={cn('p-4', cp.status !== 'ok' && 'border-danger/40')} data-tour="credit-panel">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Credit position</p>
          <Badge tone={cp.status === 'ok' ? 'green' : cp.status === 'near' ? 'amber' : 'red'}>{cp.status === 'ok' ? 'Within limit' : cp.status === 'near' ? 'Near limit' : cp.status === 'over' ? 'Over limit' : `Blocked — overdue > ${db.config.overdueBlockDays}d`}</Badge>
        </div>
        {c.creditLimit ? (
          <>
            <Progress value={Math.min(100, cp.utilisationPct)} className="mt-3 h-2.5" tone={cp.status === 'ok' ? 'green' : cp.status === 'near' ? 'amber' : 'red'} />
            <div className="mt-3 grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-3">
              <KV k="Limit" v={formatRM(cp.limit)} />
              <KV k="Outstanding" v={formatRM(cp.outstanding)} />
              <KV k="Open orders" v={formatRM(cp.openOrders)} />
              <KV k="Exposure" v={<b>{formatRM(cp.exposure)}</b>} />
              <KV k="Headroom" v={<span className={cp.headroom < 0 ? 'text-danger' : ''}>{formatRM(cp.headroom)}</span>} />
              <KV k="Overdue" v={<span className={cp.overdue ? 'text-danger' : ''}>{formatRM(cp.overdue)}</span>} />
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5 text-center text-[11px]">
              {[
                ['Current', ag.current],
                ['1–30', ag.d1_30],
                ['31–60', ag.d31_60],
                ['61–90', ag.d61_90],
                ['90+', ag.d90p],
              ].map(([k, v], i) => (
                <div key={k as string} className={cn('rounded-lg py-1.5', (v as number) > 0 && i > 0 ? 'bg-danger-soft' : 'bg-surface-2')}>
                  <p className="text-muted">{k}</p>
                  <p className="tabular font-semibold">{compactRM(v as number)}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Cash account — no credit extended.</p>
        )}
      </Card>
      <div className="grid gap-x-6 text-sm sm:grid-cols-2">
        <KV k="Price tier" v={TIER_LABELS[c.tier]} />
        <KV k="Payment terms" v={c.paymentTermsDays ? `${c.paymentTermsDays} days` : 'Cash'} />
        <KV k="Contract valid until" v={c.contractValidUntil ? fmtDate(c.contractValidUntil) : '—'} />
        <KV k="TIN / BRN (placeholder)" v={<span className="font-mono text-xs">{c.tin ?? '—'} / {c.brn ?? '—'}</span>} />
      </div>
      <SectionCard title="Scorecard" subtitle="From simulated trade activity only (no personal profiling)">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted">Sales (90d)</p>
            <p className="tabular font-bold">{compactRM(sales90)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Gross margin</p>
            <p className="tabular font-bold">{sales90 ? formatPct(((sales90 - cost90) / sales90) * 100) : '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Quote win rate</p>
            <p className="tabular font-bold">{decided.length ? formatPct((won / decided.length) * 100, 0) : '—'}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Paid on time</p>
            <p className="tabular font-bold">{allocs ? formatPct((onTimePays / allocs) * 100, 0) : '—'}</p>
          </div>
        </div>
      </SectionCard>
      {c.contacts.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Contacts</p>
          {c.contacts.map((ct) => (
            <div key={ct.name} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
              <span className="font-medium">{ct.name}</span>
              <span className="text-xs text-muted">{ct.role}</span>
              <span className="flex items-center gap-1 text-xs text-muted"><Phone className="size-3" /> {ct.phone}</span>
              <span className="flex items-center gap-1 text-xs text-muted"><Mail className="size-3" /> {ct.email}</span>
            </div>
          ))}
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Billing & sites (fictional addresses)</p>
        <p className="text-sm">{c.billingAddress}</p>
        {c.sites.map((s) => (
          <p key={s.id} className="mt-1 flex items-start gap-1.5 text-xs text-muted">
            <MapPin className="mt-0.5 size-3" /> <b className="text-ink-2">{s.name}:</b> {s.address}
          </p>
        ))}
      </div>
      {ags.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Price agreements</p>
          {ags.map((a) => (
            <p key={a.id} className="flex items-center gap-2 rounded-lg bg-violet-soft/50 px-3 py-1.5 text-xs">
              <Lock className="size-3.5 text-violet" /> {a.productId ? db.products[a.productId]?.sku : db.categories[a.categoryId ?? '']?.name}: {a.kind === 'fixed' ? formatRM(a.fixedPrice ?? 0) : `−${a.discountPct}%`} · {a.reference} · to {fmtDate(a.validTo)}
            </p>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Quotes & RFQs ({quotes.length + enq.length})</p>
          <ul className="space-y-1 text-xs">
            {quotes.slice(0, 6).map((q) => (
              <li key={q.id}>
                <Link to={`/quotes/${q.id}`} className="flex justify-between rounded-lg px-2 py-1 hover:bg-surface-2">
                  <span className="font-mono">{q.number}</span>
                  <StatusBadge kind="quote" status={q.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Orders & invoices</p>
          <ul className="space-y-1 text-xs">
            {orders.slice(0, 4).map((o) => (
              <li key={o.id}>
                <Link to={`/orders?id=${o.id}`} className="flex justify-between rounded-lg px-2 py-1 hover:bg-surface-2">
                  <span className="font-mono">{o.number}</span>
                  <StatusBadge kind="order" status={o.status} />
                </Link>
              </li>
            ))}
            {invs.filter((i) => invoiceBalance(i) > 0).slice(0, 4).map((i) => (
              <li key={i.id}>
                <Link to={`/finance?tab=invoices&id=${i.id}`} className="flex justify-between rounded-lg px-2 py-1 hover:bg-surface-2">
                  <span className="font-mono">{i.number}</span>
                  <span className="flex items-center gap-1">
                    {formatRM(invoiceBalance(i))} <StatusBadge kind="invoice" status={invoiceState(i, now)} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Tags</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {c.tags.map((t) => (
            <Badge key={t} icon={<Tag className="size-3" />}>
              {t}
              <button className="ml-0.5" aria-label={`Remove tag ${t}`} onClick={() => act(updateCustomer, { customerId: c.id, patch: { tags: c.tags.filter((x) => x !== t) } })}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tag.trim()) { act(updateCustomer, { customerId: c.id, patch: { tags: [...new Set([...c.tags, tag.trim()])] } }); setTag(''); } }} placeholder="Add tag + Enter" className="h-7 w-36 text-xs" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Notes</p>
        <div className="flex gap-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (visible to the team)" className="min-h-[44px]" />
          <Button onClick={() => { if (act(addCustomerNote, { customerId: c.id, text: note }, { success: 'Note added' }) !== undefined) setNote(''); }} disabled={!note.trim()}>
            Add
          </Button>
        </div>
        <ul className="mt-2 space-y-1.5 text-xs">
          {c.notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-ink">{n.text}</p>
              <p className="text-muted">
                {n.by} · {relTime(n.at, now)}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <CustomerForm open={edit} onOpenChange={setEdit} customer={c} />
    </div>
  );
}

const custSchema = z.object({
  name: z.string().trim().min(3, 'Name is required'),
  type: z.string(),
  tier: z.string(),
  contactName: z.string().trim().min(2, 'Contact name is required'),
  phone: z.string().trim().regex(/^[+0-9 -]{7,}$/, 'Enter a valid phone number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  billingAddress: z.string().trim().min(5, 'Address is required'),
  creditLimit: z.coerce.number().min(0),
  paymentTermsDays: z.coerce.number().int().min(0).max(120),
});

function CustomerForm({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: Customer }) {
  const nav = useNavigate();
  const defaults = {
    name: customer?.name ?? '',
    type: customer?.type ?? 'contractor',
    tier: customer?.tier ?? 'trade',
    contactName: customer?.contacts[0]?.name ?? '',
    phone: customer?.contacts[0]?.phone ?? customer?.phone ?? '',
    email: customer?.contacts[0]?.email ?? '',
    billingAddress: customer?.billingAddress ?? '',
    creditLimit: customer ? customer.creditLimit / 100 : 0,
    paymentTermsDays: customer?.paymentTermsDays ?? 0,
  };
  const { register, handleSubmit, formState, reset } = useForm<z.input<typeof custSchema>>({ resolver: zodResolver(custSchema), defaultValues: defaults, mode: 'onBlur' });
  React.useEffect(() => {
    if (open) reset(defaults);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const e = formState.errors;
  const submit = handleSubmit((raw) => {
    const v = custSchema.parse(raw);
    const data = {
      name: v.name,
      type: v.type as CustomerType,
      tier: v.tier as CustomerTier,
      contacts: [{ name: v.contactName, role: customer?.contacts[0]?.role ?? 'Contact', phone: v.phone, email: v.email }],
      billingAddress: v.billingAddress,
      creditLimit: toSen(v.creditLimit),
      paymentTermsDays: v.paymentTermsDays,
      phone: v.phone,
      email: v.email,
    };
    if (customer) {
      if (act(updateCustomer, { customerId: customer.id, patch: data }, { success: 'Customer updated', undo: `edit ${customer.name}` }) !== undefined) onOpenChange(false);
    } else {
      const c = act(createCustomer, { ...data, sites: [{ id: `site_${Date.now()}`, name: 'Main office', address: v.billingAddress }], tags: [] }, { success: (x) => `${x.name} created` });
      if (c) {
        onOpenChange(false);
        nav(`/customers?id=${c.id}`);
      }
    }
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={customer ? `Edit ${customer.name}` : 'New customer'} description="Use fictional details in this demo. Credit limits above zero would normally need Finance approval." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}>{customer ? 'Save' : 'Create customer'}</Button></>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Company name" required error={e.name?.message} className="sm:col-span-2">
          <Input {...register('name')} invalid={!!e.name} autoFocus />
        </Field>
        <Field label="Type">
          <Select {...register('type')}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price tier">
          <Select {...register('tier')}>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact name" required error={e.contactName?.message}>
          <Input {...register('contactName')} invalid={!!e.contactName} />
        </Field>
        <Field label="Phone" required error={e.phone?.message}>
          <Input {...register('phone')} invalid={!!e.phone} placeholder="+60 12-000 0000" />
        </Field>
        <Field label="Email" error={e.email?.message}>
          <Input {...register('email')} invalid={!!e.email} placeholder="name@company.example" />
        </Field>
        <Field label="Payment terms (days)" error={e.paymentTermsDays?.message}>
          <Input type="number" {...register('paymentTermsDays')} />
        </Field>
        <Field label="Credit limit (RM)" error={e.creditLimit?.message}>
          <Input type="number" {...register('creditLimit')} />
        </Field>
        <Field label="Billing address" required error={e.billingAddress?.message} className="sm:col-span-2">
          <Textarea {...register('billingAddress')} className="min-h-[60px]" />
        </Field>
      </form>
    </Modal>
  );
}
