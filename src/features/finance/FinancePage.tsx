import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import type { Invoice, Payment } from '@/domain/types';
import { useDbState, getDb } from '@/store/db';
import { act } from '@/lib/act';
import { recordPayment, logReminder, issueCreditNote } from '@/domain/commands/finance';
import { recordSupplierBill } from '@/domain/commands/procurement';
import { ageing, allocateFifo, creditPosition, invoiceBalance, invoiceState } from '@/domain/finance';
import { computeKpis, categoryMix, rangeFor } from '@/domain/kpis';
import { stockIndex } from '@/domain/inventory';
import { useNow, useParam } from '@/lib/hooks';
import { compactRM, formatPct, formatRM, roundSen, toSen } from '@/lib/money';
import { daysOverdue, fmtDate, fmtDateTime, dayKey } from '@/lib/dates';
import { cn, copyText, downloadText } from '@/lib/utils';
import { toCsv } from '@/services/csv';
import { invoicePdf } from '@/services/pdf';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/core';
import { Drawer, Modal, Tabs, TabPanel } from '@/components/ui/overlay';
import { PageHeader, Gate, KV, SectionCard, KpiTile, fmtCompact, fmtInt, DemoNote } from '@/components/widgets';
import { DataTable } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/status';
import { BarList } from '@/components/charts/Charts';
import { AlertTriangle, Banknote, Check, Copy, Download, FileSpreadsheet, Landmark, Receipt, ShieldCheck, Wallet, X, Building2, ChartColumn, Lock } from '@/components/ui/icons';

export default function FinancePage() {
  const db = useDbState();
  const now = useNow();
  const [tab, setTab] = useParam('tab');
  const invs = Object.values(db.invoices);
  const ag = ageing(invs, now);
  const [payOpen, setPayOpen] = React.useState(false);
  return (
    <div>
      <PageHeader
        title="Finance · Receivables & Invoices"
        subtitle="Invoices generated from delivered orders and counter sales, payment allocation, ageing and credit control. Documents are samples; nothing is submitted to LHDN or an accounting system."
        actions={
          <Gate perm="finance.manage">
            <Button onClick={() => setPayOpen(true)} data-tour="payment">
              <Banknote className="size-4" /> Record payment
            </Button>
          </Gate>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Open receivables" value={ag.total} format={fmtCompact} icon={<Wallet className="size-3.5" />} onClick={() => setTab('receivables')} />
        <KpiTile label="Current (not due)" value={ag.current} format={fmtCompact} />
        <KpiTile label="1–30 days overdue" value={ag.d1_30} format={fmtCompact} tone={ag.d1_30 ? 'warn' : 'default'} />
        <KpiTile label="31–60 days" value={ag.d31_60} format={fmtCompact} tone={ag.d31_60 ? 'danger' : 'default'} />
        <KpiTile label="60+ days" value={ag.d61_90 + ag.d90p} format={fmtCompact} tone={ag.d61_90 + ag.d90p ? 'danger' : 'default'} />
      </div>
      <Tabs
        id="fin"
        value={tab ?? 'receivables'}
        onValueChange={(v) => setTab(v)}
        tabs={[
          { value: 'receivables', label: 'Receivables', icon: <Wallet className="size-4" /> },
          { value: 'invoices', label: 'Invoices', icon: <Receipt className="size-4" /> },
          { value: 'payments', label: 'Payments', icon: <Banknote className="size-4" /> },
          { value: 'bills', label: 'Supplier bills', icon: <Building2 className="size-4" /> },
          { value: 'einvoice', label: 'e-Invoice readiness', icon: <ShieldCheck className="size-4" /> },
          { value: 'accounting', label: 'Accounting export', icon: <FileSpreadsheet className="size-4" /> },
          { value: 'reports', label: 'Reports', icon: <ChartColumn className="size-4" /> },
        ]}
      >
        <TabPanel value="receivables" className="pt-4">
          <Receivables now={now} onPay={() => setPayOpen(true)} />
        </TabPanel>
        <TabPanel value="invoices" className="pt-4">
          <Invoices now={now} />
        </TabPanel>
        <TabPanel value="payments" className="pt-4">
          <Payments />
        </TabPanel>
        <TabPanel value="bills" className="pt-4">
          <Bills />
        </TabPanel>
        <TabPanel value="einvoice" className="pt-4">
          <EInvoice />
        </TabPanel>
        <TabPanel value="accounting" className="pt-4">
          <Accounting />
        </TabPanel>
        <TabPanel value="reports" className="pt-4">
          <Reports now={now} />
        </TabPanel>
      </Tabs>
      <PaymentModal open={payOpen} onOpenChange={setPayOpen} />
    </div>
  );
}

function Receivables({ now, onPay }: { now: string; onPay: () => void }) {
  const db = useDbState();
  const [cust] = useParam('customer');
  const rows = Object.values(db.customers)
    .map((c) => ({ c, cp: creditPosition(db, c.id, now), ag: ageing(Object.values(db.invoices).filter((i) => i.customerId === c.id), now) }))
    .filter((r) => r.cp.outstanding > 0)
    .sort((a, b) => b.cp.overdue - a.cp.overdue || b.cp.outstanding - a.cp.outstanding);
  const focus = cust ? rows.find((r) => r.c.id === cust) : undefined;
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <SectionCard className="xl:col-span-8" title="Customer ageing" subtitle="Outstanding balances by days overdue · credit status uses the configured limit and overdue block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                <th className="py-2 text-left">Customer</th>
                <th className="py-2 text-right">Current</th>
                <th className="py-2 text-right">1–30</th>
                <th className="py-2 text-right">31–60</th>
                <th className="py-2 text-right">61–90</th>
                <th className="py-2 text-right">90+</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, cp, ag }) => (
                <tr key={c.id} className={cn('border-b border-line/60', c.id === cust && 'bg-accent-soft/50')}>
                  <td className="py-2">
                    <Link to={`/customers?id=${c.id}`} className="font-medium hover:text-brand">
                      {c.name}
                    </Link>
                  </td>
                  {[ag.current, ag.d1_30, ag.d31_60, ag.d61_90, ag.d90p].map((v, i) => (
                    <td key={i} className={cn('tabular py-2 text-right', v && i > 0 ? 'text-danger' : 'text-muted')}>
                      {v ? compactRM(v) : '—'}
                    </td>
                  ))}
                  <td className="tabular py-2 text-right font-semibold">{compactRM(ag.total)}</td>
                  <td className="py-2 text-right">
                    <Badge tone={cp.status === 'ok' ? 'green' : cp.status === 'near' ? 'amber' : 'red'}>{cp.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <div className="space-y-4 xl:col-span-4">
        {focus && (
          <SectionCard title={focus.c.name} subtitle="Open invoices">
            <ul className="space-y-1.5 text-sm">
              {Object.values(db.invoices)
                .filter((i) => i.customerId === focus.c.id && invoiceBalance(i) > 0)
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                    <span>
                      <span className="font-mono text-xs">{i.number}</span>
                      <span className="block text-[11px] text-muted">due {fmtDate(i.dueDate)}{daysOverdue(i.dueDate, now) ? ` · ${daysOverdue(i.dueDate, now)}d overdue` : ''}</span>
                    </span>
                    <span className="tabular font-semibold">{formatRM(invoiceBalance(i))}</span>
                  </li>
                ))}
            </ul>
            <Gate perm="finance.manage">
              <Button className="mt-3 w-full" onClick={onPay} data-tour="payment">
                <Banknote className="size-4" /> Record payment for {focus.c.name.split(' ')[0]}
              </Button>
            </Gate>
          </SectionCard>
        )}
        <Reminders now={now} />
      </div>
    </div>
  );
}

function reminderText(db: ReturnType<typeof getDb>, inv: Invoice, now: string) {
  const c = db.customers[inv.customerId];
  return `Dear ${c?.contacts[0]?.name ?? c?.name},\n\nThis is a friendly reminder that invoice ${inv.number} (${formatRM(inv.total)}) dated ${fmtDate(inv.issueDate)} was due on ${fmtDate(inv.dueDate)} and has an outstanding balance of ${formatRM(invoiceBalance(inv))} (${daysOverdue(inv.dueDate, now)} days overdue).\n\nPlease arrange payment or let us know if there is a query.\n\nThank you,\nAccounts — MK Hardware (DEMO DRAFT — not sent)`;
}

function Reminders({ now }: { now: string }) {
  const db = useDbState();
  const overdue = Object.values(db.invoices).filter((i) => invoiceBalance(i) > 0 && daysOverdue(i.dueDate, now) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  return (
    <SectionCard title="Overdue reminders" subtitle="Copy a draft — the demo never sends messages">
      <ul className="space-y-1.5">
        {overdue.map((i) => (
          <li key={i.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="font-mono">{i.number}</span> · {db.customers[i.customerId]?.name}
              <span className="block text-danger">{daysOverdue(i.dueDate, now)} days · {formatRM(invoiceBalance(i))}</span>
            </span>
            <Gate perm="finance.manage" compact>
              <Button size="xs" variant="outline" onClick={async () => { const ok = await copyText(reminderText(db, i, now)); if (ok) { act(logReminder, { invoiceId: i.id }, { success: 'Reminder draft copied (not sent)' }); } else toast.error('Clipboard unavailable'); }}>
                <Copy className="size-3.5" /> Draft
              </Button>
            </Gate>
          </li>
        ))}
        {!overdue.length && <li className="text-sm text-muted">No overdue invoices.</li>}
      </ul>
    </SectionCard>
  );
}

function Invoices({ now }: { now: string }) {
  const db = useDbState();
  const [id, setId] = useParam('id');
  const [day] = useParam('day');
  const [week] = useParam('week');
  const [state, setState] = React.useState('');
  const rows = React.useMemo(
    () =>
      Object.values(db.invoices)
        .filter((i) => (!day || dayKey(i.issueDate) === day) && (!week || (dayKey(i.issueDate) >= week && dayKey(i.issueDate) < dayKey(new Date(Date.parse(week) + 7 * 86_400_000).toISOString()))) && (!state || invoiceState(i, now) === state))
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    [db.invoices, day, week, state, now],
  );
  const columns = React.useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      { id: 'n', header: 'Invoice', accessorKey: 'number', cell: (c) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{c.row.original.number}</span> },
      { id: 'c', header: 'Customer', accessorFn: (i) => db.customers[i.customerId]?.name ?? '', cell: (c) => <span className="line-clamp-1">{c.getValue() as string}</span> },
      { id: 'src', header: 'Source', accessorFn: (i) => (i.posSaleId ? 'Counter' : db.salesOrders[i.orderId ?? '']?.number ?? ''), cell: (c) => <span className="text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'date', header: 'Issued', accessorKey: 'issueDate', cell: (c) => <span className="text-xs">{fmtDate(c.row.original.issueDate)}</span> },
      { id: 'due', header: 'Due', accessorKey: 'dueDate', cell: (c) => <span className="text-xs">{fmtDate(c.row.original.dueDate)}</span> },
      { id: 'total', header: 'Total', accessorKey: 'total', meta: { align: 'right', csv: (i) => (i.total / 100).toFixed(2) }, cell: (c) => formatRM(c.row.original.total) },
      { id: 'bal', header: 'Balance', accessorFn: (i) => invoiceBalance(i), meta: { align: 'right' }, cell: (c) => <b>{formatRM(c.getValue() as number)}</b> },
      { id: 'st', header: 'Status', accessorFn: (i) => invoiceState(i, now), cell: (c) => <StatusBadge kind="invoice" status={c.getValue() as string} /> },
    ],
    [db.customers, db.salesOrders, now],
  );
  const sel = id ? db.invoices[id] : undefined;
  return (
    <>
      {(day || week) && <p className="mb-2 text-sm">Filtered to invoices issued {day ? `on ${day}` : `in week of ${week}`} (from dashboard drill-down).</p>}
      <DataTable
        id="invoices"
        data={rows}
        columns={columns}
        getRowId={(i) => i.id}
        onRowClick={(i) => setId(i.id)}
        exportName="invoices"
        minWidth={860}
        toolbar={
          <Select value={state} onChange={(e) => setState(e.target.value)} className="h-9 w-auto" aria-label="Invoice status">
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="partial">Part-paid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </Select>
        }
        mobileCard={(i) => (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold">{i.number}</p>
              <p className="truncate text-sm">{db.customers[i.customerId]?.name}</p>
            </div>
            <div className="text-right">
              <p className="tabular font-semibold">{formatRM(invoiceBalance(i))}</p>
              <StatusBadge kind="invoice" status={invoiceState(i, now)} />
            </div>
          </div>
        )}
      />
      <Drawer open={!!sel} onOpenChange={(o) => !o && setId(null)} title={sel?.number ?? ''} subtitle={sel ? db.customers[sel.customerId]?.name : ''}>
        {sel && <InvoiceDetail inv={sel} now={now} />}
      </Drawer>
    </>
  );
}

function InvoiceDetail({ inv, now }: { inv: Invoice; now: string }) {
  const db = useDbState();
  const [cn2, setCn] = React.useState(false);
  const pays = Object.values(db.payments).filter((p) => p.allocations.some((a) => a.invoiceId === inv.id));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <StatusBadge kind="invoice" status={invoiceState(inv, now)} />
        <Badge tone="amber">e-Invoice: not submitted (demo)</Badge>
      </div>
      <div className="grid gap-x-6 text-sm sm:grid-cols-2">
        <KV k="Issued" v={fmtDate(inv.issueDate)} />
        <KV k="Due" v={fmtDate(inv.dueDate)} />
        <KV k="Order" v={inv.orderId ? <Link className="hover:text-brand" to={`/orders?id=${inv.orderId}`}>{db.salesOrders[inv.orderId]?.number}</Link> : 'Counter sale'} />
        <KV k="Delivery" v={inv.deliveryOrderId ? db.deliveryOrders[inv.deliveryOrderId]?.number : '—'} />
      </div>
      <ul className="space-y-1 text-sm">
        {inv.lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
            <span className="min-w-0 truncate">{l.description}</span>
            <span className="tabular shrink-0">
              {l.qty} {l.uom} · {formatRM(l.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <div className="text-sm">
        <KV k="Subtotal" v={formatRM(inv.subtotal)} />
        <KV k="Freight" v={formatRM(inv.freight)} />
        <KV k={`${inv.taxLabel}${inv.taxRatePct ? ` ${inv.taxRatePct}%` : ' (not configured)'}`} v={formatRM(inv.tax)} />
        <KV k="Total" v={<b>{formatRM(inv.total)}</b>} />
        <KV k="Paid" v={formatRM(inv.paid)} />
        {inv.credited > 0 && <KV k="Credited" v={formatRM(inv.credited)} />}
        <KV k="Balance" v={<b className={invoiceBalance(inv) ? 'text-danger' : 'text-brand'}>{formatRM(invoiceBalance(inv))}</b>} />
        <KV k="Gross margin (internal)" v={formatPct(inv.subtotal ? ((inv.subtotal - inv.cost) / inv.subtotal) * 100 : 0)} />
      </div>
      {pays.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Payments allocated</p>
          {pays.map((p) => (
            <p key={p.id} className="text-xs">
              {p.number} · {fmtDate(p.receivedAt)} · {p.method.replace('_', ' ')} · {formatRM(p.allocations.find((a) => a.invoiceId === inv.id)?.amount ?? 0)}
            </p>
          ))}
        </div>
      )}
      {inv.reminders.length > 0 && <p className="text-xs text-muted">Reminder drafts: {inv.reminders.map((r) => fmtDate(r.at)).join(', ')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void invoicePdf(getDb(), inv)}>
          <Download className="size-4" /> Sample PDF
        </Button>
        {invoiceBalance(inv) > 0 && (
          <Gate perm="finance.manage" fallback={null}>
            <Button variant="ghost" onClick={() => setCn(true)}>
              Credit note
            </Button>
          </Gate>
        )}
      </div>
      <CreditNoteModal open={cn2} onOpenChange={setCn} inv={inv} />
    </div>
  );
}

function CreditNoteModal({ open, onOpenChange, inv }: { open: boolean; onOpenChange: (o: boolean) => void; inv: Invoice }) {
  const [amt, setAmt] = React.useState('');
  const [reason, setReason] = React.useState('Pricing adjustment agreed with customer');
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={`Credit note on ${inv.number}`} footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!(Number(amt) > 0)} onClick={() => act(issueCreditNote, { invoiceId: inv.id, amount: toSen(Number(amt)), reason }, { success: (c) => `${c.number} issued` }) !== undefined && onOpenChange(false)}>Issue credit note</Button></>}>
      <div className="space-y-3">
        <Field label={`Amount (max ${formatRM(invoiceBalance(inv))})`}>
          <Input type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </Field>
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[60px]" />
        </Field>
      </div>
    </Modal>
  );
}

function PaymentModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDbState();
  const [custParam] = useParam('customer');
  const [cust, setCust] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState<Payment['method']>('bank_transfer');
  const [ref, setRef] = React.useState('');
  const [alloc, setAlloc] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (open) {
      setCust(custParam ?? '');
      setAmount('');
      setRef(`IBG${Date.now().toString().slice(-7)}`);
      setAlloc({});
    }
  }, [open, custParam]);
  const open2 = Object.values(db.invoices).filter((i) => i.customerId === cust && invoiceBalance(i) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const amtSen = toSen(Number(amount) || 0);
  const autoFill = () => {
    const a = allocateFifo(open2, amtSen);
    setAlloc(Object.fromEntries(a.map((x) => [x.invoiceId, (x.amount / 100).toFixed(2)])));
  };
  const allocated = Object.values(alloc).reduce((s, v) => s + toSen(Number(v) || 0), 0);
  const err = !cust ? 'Choose a customer' : !(amtSen > 0) ? 'Enter an amount' : allocated > amtSen ? 'Allocations exceed the payment' : undefined;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Record payment (simulated)"
      description="Allocate to invoices oldest-first or manually. Duplicate references are blocked to prevent double posting."
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            Allocated {formatRM(allocated)} · unallocated {formatRM(Math.max(0, amtSen - allocated))}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!!err} onClick={() => act(recordPayment, { customerId: cust, amount: amtSen, method, reference: ref, allocations: Object.entries(alloc).map(([invoiceId, v]) => ({ invoiceId, amount: toSen(Number(v) || 0) })).filter((x) => x.amount > 0) }, { success: (p) => `${p.number} recorded — ${p.allocations.length} invoice(s) updated` }) !== undefined && onOpenChange(false)}>
            <Check className="size-4" /> Post payment
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer" required>
          <Select value={cust} onChange={(e) => { setCust(e.target.value); setAlloc({}); }}>
            <option value="">Select…</option>
            {Object.values(db.customers)
              .filter((c) => Object.values(db.invoices).some((i) => i.customerId === c.id && invoiceBalance(i) > 0))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Amount (RM)" required>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value as Payment['method'])}>
            <option value="bank_transfer">Bank transfer (IBG)</option>
            <option value="duitnow">DuitNow</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
          </Select>
        </Field>
        <Field label="Reference" required>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      {cust && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Allocate to open invoices</p>
            <Button size="xs" variant="outline" onClick={autoFill} disabled={!amtSen}>
              Auto (oldest first)
            </Button>
          </div>
          <ul className="space-y-1.5">
            {open2.map((i) => (
              <li key={i.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs">{i.number}</span> · due {fmtDate(i.dueDate)}
                  <span className="block text-xs text-muted">balance {formatRM(invoiceBalance(i))}</span>
                </span>
                <Input type="number" step="0.01" value={alloc[i.id] ?? ''} onChange={(e) => setAlloc({ ...alloc, [i.id]: e.target.value })} className="h-8 w-28" aria-label={`Allocate to ${i.number}`} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && amount && <p className="mt-2 text-xs text-danger">{err}</p>}
    </Modal>
  );
}

function Payments() {
  const db = useDbState();
  const rows = React.useMemo(() => Object.values(db.payments).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)), [db.payments]);
  const columns = React.useMemo<ColumnDef<Payment, unknown>[]>(
    () => [
      { id: 'n', header: 'Payment', accessorKey: 'number', cell: (c) => <span className="font-mono text-xs font-semibold">{c.row.original.number}</span> },
      { id: 'c', header: 'Customer', accessorFn: (p) => db.customers[p.customerId]?.name ?? '' },
      { id: 'd', header: 'Received', accessorKey: 'receivedAt', cell: (c) => <span className="text-xs">{fmtDateTime(c.row.original.receivedAt)}</span> },
      { id: 'm', header: 'Method', accessorKey: 'method', cell: (c) => <span className="text-xs capitalize">{c.row.original.method.replace('_', ' ')}</span> },
      { id: 'r', header: 'Reference', accessorKey: 'reference', cell: (c) => <span className="font-mono text-xs">{c.getValue() as string}</span> },
      { id: 'a', header: 'Amount', accessorKey: 'amount', meta: { align: 'right' }, cell: (c) => <b>{formatRM(c.row.original.amount)}</b> },
      { id: 'al', header: 'Allocated to', accessorFn: (p) => p.allocations.map((a) => db.invoices[a.invoiceId]?.number).join(', '), cell: (c) => <span className="line-clamp-1 text-xs text-muted">{c.getValue() as string}</span> },
      { id: 'u', header: 'Unallocated', accessorKey: 'unallocated', meta: { align: 'right' }, cell: (c) => (c.row.original.unallocated ? <span className="text-warn">{formatRM(c.row.original.unallocated)}</span> : '—') },
    ],
    [db.customers, db.invoices],
  );
  return <DataTable id="payments" data={rows} columns={columns} getRowId={(p) => p.id} exportName="payments" minWidth={900} />;
}

function Bills() {
  const db = useDbState();
  const [po, setPo] = React.useState<string | null>(null);
  const pos = Object.values(db.purchaseOrders).filter((p) => p.lines.some((l) => l.received + l.damaged > 0)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <SectionCard title="Supplier bills · 3-way match (PO × GRN × bill)" subtitle="Record the supplier's bill against received quantities. Variance > 1% is flagged.">
      <ul className="space-y-2">
        {pos.slice(0, 25).map((p) => {
          const bill = p.billId ? db.purchaseBills[p.billId] : undefined;
          const recv = p.lines.reduce((s, l) => s + roundSen((l.received + l.damaged) * l.unitCost), 0) + p.freight;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs font-semibold">{p.number}</span> · {db.suppliers[p.supplierId]?.name}
                <span className="block text-xs text-muted">Received value {formatRM(recv)}</span>
              </span>
              {bill ? (
                <>
                  <span className="tabular text-xs">Bill {bill.billRef}: {formatRM(bill.amount)}</span>
                  <Badge tone={bill.status === 'matched' ? 'green' : 'red'}>{bill.status === 'matched' ? 'Matched' : `Variance ${formatRM(bill.variance, { sign: true })}`}</Badge>
                </>
              ) : (
                <Gate perm="finance.manage" compact>
                  <Button size="sm" variant="outline" onClick={() => setPo(p.id)}>
                    Record bill
                  </Button>
                </Gate>
              )}
            </li>
          );
        })}
      </ul>
      <BillModal poId={po} onClose={() => setPo(null)} />
    </SectionCard>
  );
}

function BillModal({ poId, onClose }: { poId: string | null; onClose: () => void }) {
  const db = useDbState();
  const po = poId ? db.purchaseOrders[poId] : undefined;
  const recv = po ? po.lines.reduce((s, l) => s + roundSen((l.received + l.damaged) * l.unitCost), 0) + po.freight : 0;
  const [ref, setRef] = React.useState('');
  const [amt, setAmt] = React.useState('');
  React.useEffect(() => {
    setRef(`INV-${Math.floor(Math.random() * 90000 + 10000)}`);
    setAmt((recv / 100).toFixed(2));
  }, [poId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={!!po} onOpenChange={(o) => !o && onClose()} size="sm" title={`Supplier bill for ${po?.number}`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => act(recordSupplierBill, { poId: poId!, billRef: ref, amount: toSen(Number(amt)) }, { success: (b) => `Bill recorded — ${b.status}` }) !== undefined && onClose()}>Record & match</Button></>}>
      <div className="space-y-3">
        <p className="text-sm">Received value per GRNs: <b>{formatRM(recv)}</b></p>
        <Field label="Supplier invoice no.">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        <Field label="Bill amount (RM)" hint="Change it to see a variance flag">
          <Input type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EInvoice() {
  const db = useDbState();
  const cust = Object.values(db.customers).filter((c) => c.creditLimit > 0);
  const checks = (c: (typeof cust)[number]) => [
    ['Registered name', !!c.name],
    ['TIN (tax ID)', !!c.tin],
    ['BRN / registration no.', !!c.brn],
    ['Billing address', c.billingAddress.length > 10],
    ['Contact email', !!c.email || !!c.contacts[0]?.email],
    ['Contact phone', !!c.phone],
  ] as const;
  const sample = Object.values(db.invoices).find((i) => !i.posSaleId);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-danger/40 bg-danger-soft/40 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="text-sm">
          <p className="font-bold text-danger">Demo only — no submission to LHDN (MyInvois)</p>
          <p className="mt-1 text-ink-2">
            This panel previews the data mapping a Malaysia e-Invoice integration would need. Real submission requires the client's tax configuration, MyInvois credentials, the official sandbox and testing. Tax IDs shown are placeholders.
          </p>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <SectionCard className="xl:col-span-7" title="Buyer data readiness" subtitle="Fields typically required for e-Invoices (to be confirmed against the official specification)">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 text-left">Customer</th>
                  {checks(cust[0]).map(([k]) => (
                    <th key={k} className="py-2 text-center">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cust.map((c) => (
                  <tr key={c.id} className="border-t border-line/60">
                    <td className="py-1.5">{c.name}</td>
                    {checks(c).map(([k, ok]) => (
                      <td key={k} className="py-1.5 text-center">
                        {ok ? <Check className="mx-auto size-4 text-brand" /> : <X className="mx-auto size-4 text-danger" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard className="xl:col-span-5" title="Validation preview" subtitle={sample ? `Mapping of ${sample.number} (not transmitted)` : ''}>
          {sample && (
            <pre className="max-h-80 overflow-auto rounded-xl bg-forest-950 p-3 text-[11px] leading-relaxed text-jade-400">
              {JSON.stringify(
                {
                  _notice: 'DEMO PREVIEW — not a valid e-Invoice, not submitted',
                  invoiceNumber: sample.number,
                  issueDate: sample.issueDate.slice(0, 10),
                  supplier: { name: 'Man Kian Hardware & Trading Sdn Bhd', registration: '201401023990 (1100078-X)', tin: '<to be provided by client>' },
                  buyer: { name: db.customers[sample.customerId]?.name, tin: db.customers[sample.customerId]?.tin ?? null, brn: db.customers[sample.customerId]?.brn ?? null },
                  currency: 'MYR',
                  lines: sample.lines.slice(0, 2).map((l) => ({ description: l.description, qty: l.qty, unit: l.uom, unitPrice: l.unitPrice / 100, amount: l.lineTotal / 100, taxType: '<per client tax config>' })),
                  totals: { subtotal: sample.subtotal / 100, tax: sample.tax / 100, total: sample.total / 100 },
                  validation: { status: 'NOT_SUBMITTED', checks: ['Buyer TIN present', 'Totals reconcile', 'Tax code mapping pending'] },
                },
                null,
                2,
              )}
            </pre>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Accounting() {
  const db = useDbState();
  const [from, setFrom] = React.useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const exportJournal = () => {
    const rows: Record<string, unknown>[] = [];
    for (const i of Object.values(db.invoices)) {
      if (i.issueDate.slice(0, 10) < from) continue;
      rows.push({ date: i.issueDate.slice(0, 10), doc_type: 'SALES_INVOICE', doc_no: i.number, account: 'AR_TRADE', party: db.customers[i.customerId]?.code, debit: (i.total / 100).toFixed(2), credit: '0.00' });
      rows.push({ date: i.issueDate.slice(0, 10), doc_type: 'SALES_INVOICE', doc_no: i.number, account: 'SALES', party: db.customers[i.customerId]?.code, debit: '0.00', credit: ((i.subtotal + i.freight) / 100).toFixed(2) });
      if (i.tax) rows.push({ date: i.issueDate.slice(0, 10), doc_type: 'SALES_INVOICE', doc_no: i.number, account: 'TAX_PAYABLE', party: '', debit: '0.00', credit: (i.tax / 100).toFixed(2) });
    }
    for (const p of Object.values(db.payments)) {
      if (p.receivedAt.slice(0, 10) < from) continue;
      rows.push({ date: p.receivedAt.slice(0, 10), doc_type: 'RECEIPT', doc_no: p.number, account: 'BANK', party: db.customers[p.customerId]?.code, debit: (p.amount / 100).toFixed(2), credit: '0.00' });
      rows.push({ date: p.receivedAt.slice(0, 10), doc_type: 'RECEIPT', doc_no: p.number, account: 'AR_TRADE', party: db.customers[p.customerId]?.code, debit: '0.00', credit: (p.amount / 100).toFixed(2) });
    }
    downloadText(`journal-export-${from}-DEMO.csv`, `# Neutral journal format (demo). Account codes and import mapping must be agreed with the client's accounting package.\n${toCsv(rows)}`, 'text/csv');
    toast.success(`Exported ${rows.length} journal lines`);
  };
  const adapters = [
    ['AutoCount', 'Not connected', 'Future adapter: map neutral journal/AR exports to the client-confirmed AutoCount import format. We do not assume AutoCount is in use.'],
    ['SQL Accounting / UBS / other', 'Not connected', 'Same neutral export can feed other packages once the client confirms which one is used (desktop or cloud).'],
    ['MyInvois (LHDN)', 'Not connected', 'Requires credentials, tax configuration and official sandbox testing.'],
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Neutral CSV export" subtitle="Double-entry journal lines for invoices and receipts">
        <div className="flex items-end gap-2">
          <Field label="From date">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Gate perm="finance.manage">
            <Button onClick={exportJournal}>
              <Download className="size-4" /> Export journal CSV
            </Button>
          </Gate>
        </div>
        <DemoNote className="mt-3">The actual accounting import mapping (account codes, tax codes, customer codes) must be agreed with the client and their accountant.</DemoNote>
      </SectionCard>
      <SectionCard title="Accounting integrations" subtitle="Documented adapter seams — none connected">
        <ul className="space-y-2">
          {adapters.map(([n, s, d]) => (
            <li key={n} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  <Landmark className="size-4 text-muted" /> {n}
                </span>
                <Badge tone="neutral" icon={<Lock className="size-3" />}>
                  {s}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function Reports({ now }: { now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const k30 = computeKpis(db, rangeFor('30d', now), now);
  const mix = categoryMix(db, rangeFor('30d', now));
  const idx = stockIndex(db);
  const stockValue = Object.values(db.products).reduce((s, p) => s + roundSen((idx[p.id]?.onHand ?? 0) * p.cost), 0);
  const byCatStock = Object.values(db.categories).map((c) => ({ key: c.id, label: c.name, value: Object.values(db.products).filter((p) => p.categoryId === c.id).reduce((s, p) => s + roundSen((idx[p.id]?.onHand ?? 0) * p.cost), 0) }));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard title="Sales & margin (30 days)" subtitle="Net of tax and freight">
        <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
          <KV k="Net sales" v={compactRM(k30.netSales)} />
          <KV k="COGS" v={compactRM(k30.cogs)} />
          <KV k="Margin" v={formatPct(k30.grossMarginPct)} />
        </div>
        <BarList format={(v) => compactRM(v)} rows={mix.filter((m) => m.sales).sort((a, b) => b.sales - a.sales).map((m) => ({ key: m.categoryId, label: m.name, value: m.sales, sub: `· ${formatPct(m.marginPct)}` }))} onClick={(c) => nav(`/analytics?category=${c}`)} />
      </SectionCard>
      <SectionCard title="Stock valuation estimate" subtitle={`At approved cost · total ${compactRM(stockValue)}`}>
        <BarList format={(v) => compactRM(v)} rows={byCatStock.sort((a, b) => b.value - a.value)} />
        <p className="mt-3 text-xs text-muted">Valuation method (FIFO / weighted average) must be confirmed with the client's accountant. This is an illustrative on-hand × cost estimate.</p>
      </SectionCard>
      <SectionCard title="Expenses (placeholder)" subtitle="Operating expenses are not modelled in this demo">
        <EmptyState title="Not in scope for the demo" body="Expense claims, payroll and GL would come from the client's accounting system." />
      </SectionCard>
    </div>
  );
}
