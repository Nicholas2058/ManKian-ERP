import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import type { Channel, Enquiry, ExtractedLine, UomCode } from '@/domain/types';
import { useDbState, getDb } from '@/store/db';
import { act } from '@/lib/act';
import * as S from '@/domain/commands/sales';
import { productStock, stockIndex } from '@/domain/inventory';
import { creditPosition, invoiceBalance } from '@/domain/finance';
import { productUoms } from '@/domain/uom';
import { TIER_LABELS } from '@/domain/pricing';
import { useNow, useParam, useMediaQuery } from '@/lib/hooks';
import { addDays, fmtDate, fmtTime, relTime } from '@/lib/dates';
import { formatRM } from '@/lib/money';
import { cn, copyText, createRng } from '@/lib/utils';
import { ENQUIRY_TEMPLATES, STAFF_REPLIES } from '@/data/enquiryTemplates';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui/core';
import { Modal, Segmented } from '@/components/ui/overlay';
import { PageHeader, Gate, DemoNote, KV } from '@/components/widgets';
import { StatusBadge } from '@/components/status';
import { ProductSearch } from '@/components/ProductSearch';
import {
  ArrowLeft, Bot, Calendar, Check, Copy, FileText, Globe, Inbox, Mail, MessageCircle, Phone, Plus, RefreshCw, Send, Trash, UserPlus, X, Zap, Clock, ExternalLink, ArrowRight,
} from '@/components/ui/icons';

const CH_ICON: Record<Channel, React.ReactNode> = {
  whatsapp: <MessageCircle className="size-4" />,
  phone: <Phone className="size-4" />,
  email: <Mail className="size-4" />,
  website: <Globe className="size-4" />,
};
const CH_TONE: Record<Channel, string> = { whatsapp: 'bg-accent-soft text-brand', phone: 'bg-info-soft text-info', email: 'bg-violet-soft text-violet', website: 'bg-orange-soft text-orange' };

export default function EnquiriesPage() {
  const db = useDbState();
  const now = useNow();
  const [id, setId] = useParam('id');
  const [newParam, setNewParam] = useParam('new');
  const [filter, setFilter] = React.useState<'open' | 'all' | 'lost'>('open');
  const lg = useMediaQuery('(min-width: 1024px)');
  const xl = useMediaQuery('(min-width: 1440px)');
  const list = React.useMemo(
    () =>
      Object.values(db.enquiries)
        .filter((e) => (filter === 'open' ? !['lost', 'won'].includes(e.status) : filter === 'lost' ? ['lost', 'won'].includes(e.status) : true))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [db.enquiries, filter],
  );
  const sel = id ? db.enquiries[id] : undefined;
  React.useEffect(() => {
    if (sel?.unread) act(S.markEnquiryRead, { enquiryId: sel.id }, { quiet: true });
  }, [sel?.id, sel?.unread]);
  React.useEffect(() => {
    if (lg && !id && list[0]) setId(list[0].id);
  }, [lg, id, list, setId]);

  const simulate = () => {
    const rng = createRng(Date.now() % 100000);
    const t = rng.pick(ENQUIRY_TEMPLATES);
    const e = act(S.receiveEnquiry, { channel: t.channel, customerId: t.customerId, contactName: t.contactName, contactPhone: t.contactPhone, subject: t.subject, text: t.text, siteName: t.siteName, requiredBy: addDays(now, 4) }, { success: (x) => `New simulated ${x.channel} enquiry from ${x.contactName.split(' (')[0]}` });
    if (e) setId(e.id);
  };
  React.useEffect(() => {
    if (newParam) {
      setNewParam(null);
      simulate();
    }
  }, [newParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const showList = lg || !sel;
  return (
    <div>
      <PageHeader
        title="Enquiry & RFQ Inbox"
        subtitle="One inbox for WhatsApp, phone, email and website enquiries (simulated channels). Turn conversations into structured RFQs and quotations."
        actions={
          <Button onClick={simulate}>
            <Zap className="size-4" /> Simulate inbound enquiry
          </Button>
        }
      />
      <div className={cn('grid gap-4', lg && (xl ? 'grid-cols-[320px_minmax(0,1fr)_300px]' : 'grid-cols-[300px_minmax(0,1fr)]'))}>
        {showList && (
          <Card className="flex max-h-[calc(100dvh-13rem)] min-h-[420px] flex-col overflow-hidden">
            <div className="border-b border-line p-3">
              <Segmented
                id="enq-f"
                size="sm"
                value={filter}
                onChange={setFilter}
                className="w-full [&>button]:flex-1"
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'lost', label: 'Closed' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
            <ul className="scrollbar-thin flex-1 overflow-y-auto p-1.5">
              <AnimatePresence initial={false}>
                {list.map((e) => (
                  <motion.li key={e.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                    <button onClick={() => setId(e.id)} className={cn('flex w-full gap-3 rounded-xl p-2.5 text-left transition', id === e.id ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', CH_TONE[e.channel])}>{CH_ICON[e.channel]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-sm', e.unread ? 'font-bold text-ink' : 'font-medium text-ink-2')}>{e.contactName.split(' (')[0]}</span>
                          <span className="shrink-0 text-[10px] text-muted">{relTime(e.updatedAt, now).replace(' ago', '')}</span>
                        </span>
                        <span className="block truncate text-xs text-muted">{e.subject}</span>
                        <span className="mt-1 flex items-center gap-1.5">
                          <StatusBadge kind="enquiry" status={e.status} />
                          {e.unread && <span className="size-2 rounded-full bg-ember-500" aria-label="unread" />}
                          {e.followUpAt && <Clock className="size-3 text-warn" aria-label="follow-up set" />}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
              {list.length === 0 && <p className="p-6 text-center text-sm text-muted">No enquiries in this view.</p>}
            </ul>
          </Card>
        )}
        {sel ? (
          <>
            <Conversation e={sel} now={now} onBack={() => setId(null)} showBack={!lg} />
            {xl && <CustomerContext e={sel} now={now} />}
          </>
        ) : (
          lg && <EmptyState icon={<Inbox className="size-6" />} title="Select an enquiry" body="Or simulate a new inbound enquiry." />
        )}
      </div>
    </div>
  );
}

function Conversation({ e, now, onBack, showBack }: { e: Enquiry; now: string; onBack: () => void; showBack: boolean }) {
  const db = useDbState();
  const nav = useNavigate();
  const [reply, setReply] = React.useState('');
  const [qualify, setQualify] = React.useState(false);
  const [lost, setLost] = React.useState(false);
  const [follow, setFollow] = React.useState(false);
  const tpl = ENQUIRY_TEMPLATES.find((t) => t.subject === e.subject);
  const endRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [e.messages.length]);
  const c = e.customerId ? db.customers[e.customerId] : undefined;
  const rfq = e.rfqId ? db.rfqs[e.rfqId] : undefined;
  const quote = e.quoteId ? db.quotes[e.quoteId] : undefined;
  const closed = ['won', 'lost'].includes(e.status);
  const send = () => {
    if (!reply.trim()) return;
    act(S.addEnquiryMessage, { enquiryId: e.id, text: reply, from: 'staff' }, { success: 'Reply logged in the thread (simulation — not sent)' });
    setReply('');
  };
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden" data-tour="enquiry-thread">
      <div className="flex flex-wrap items-start gap-3 border-b border-line p-4">
        {showBack && (
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to list">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', CH_TONE[e.channel])}>{CH_ICON[e.channel]}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{e.contactName}</p>
          <p className="text-xs text-muted">
            {e.number} · {e.contactPhone} (fictional) · <span className="capitalize">{e.channel}</span> · simulated channel
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusBadge kind="enquiry" status={e.status} />
            {e.siteName && <Badge>Site: {e.siteName}</Badge>}
            {e.requiredBy && <Badge tone="amber">Need by {fmtDate(e.requiredBy)}</Badge>}
            {e.followUpAt && <Badge tone="blue" icon={<Clock className="size-3" />}>Follow up {fmtDate(e.followUpAt)}</Badge>}
          </div>
        </div>
      </div>

      <div className="scrollbar-thin max-h-[360px] space-y-2.5 overflow-y-auto bg-surface-2 p-4">
        {e.messages.map((m) => (
          <div key={m.id} className={cn('flex', m.from === 'staff' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm', m.from === 'staff' ? 'rounded-br-md bg-brand text-white dark:text-forest-950' : 'rounded-bl-md bg-surface text-ink')}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className={cn('mt-1 text-right text-[10px]', m.from === 'staff' ? 'text-white/70 dark:text-forest-950/70' : 'text-muted')}>
                {fmtTime(m.at)} {m.from === 'staff' && '· logged, not sent'}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {!closed && (
        <div className="border-b border-line p-3">
          <div className="flex gap-2">
            <Input value={reply} onChange={(x) => setReply(x.target.value)} onKeyDown={(x) => x.key === 'Enter' && send()} placeholder="Type a reply (logged in thread, never auto-sent)…" />
            <Button onClick={send} disabled={!reply.trim()} aria-label="Log reply">
              <Send className="size-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STAFF_REPLIES.map((r) => (
              <button key={r} onClick={() => setReply(r)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-2 hover:border-brand">
                {r.slice(0, 38)}…
              </button>
            ))}
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                const ok = await copyText(reply || STAFF_REPLIES[0]);
                toast[ok ? 'success' : 'error'](ok ? 'WhatsApp draft copied — paste it yourself' : 'Clipboard unavailable');
              }}
            >
              <Copy className="size-3.5" /> Copy WhatsApp draft
            </Button>
            <a className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-2 hover:bg-surface-3" href={`https://wa.me/?text=${encodeURIComponent(reply || STAFF_REPLIES[0])}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> Open WhatsApp
            </a>
            {tpl && (
              <Button size="xs" variant="ghost" onClick={() => act(S.addEnquiryMessage, { enquiryId: e.id, text: tpl.reply, from: 'customer', reparse: true }, { success: 'Simulated customer reply received' })}>
                <MessageCircle className="size-3.5" /> Simulate customer reply
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Bot className="size-3.5" /> Suggested lines · rule-based extraction (demo)
          </p>
          {!rfq && !closed && (
            <Button size="xs" variant="ghost" onClick={() => act(S.reparseEnquiry, { enquiryId: e.id }, { success: 'Re-extracted lines from customer messages' })}>
              <RefreshCw className="size-3.5" /> Re-run
            </Button>
          )}
        </div>
        <LineEditor e={e} locked={!!rfq || closed} />
      </div>

      <div className="mt-auto border-t border-line bg-surface-2 p-4" data-tour="enquiry-actions">
        <div className="flex flex-wrap gap-2">
          {!closed && !e.customerId && (
            <Button onClick={() => setQualify(true)}>
              <UserPlus className="size-4" /> Qualify & link customer
            </Button>
          )}
          {!closed && e.customerId && e.status === 'new' && (
            <Button variant="outline" onClick={() => act(S.qualifyEnquiry, { enquiryId: e.id, customerId: e.customerId!, siteName: e.siteName, requiredBy: e.requiredBy }, { success: 'Enquiry qualified' })}>
              <Check className="size-4" /> Qualify
            </Button>
          )}
          {!closed && e.customerId && !rfq && (
            <Gate perm="quote.create">
              <Button
                onClick={() => {
                  if (e.status === 'new') act(S.qualifyEnquiry, { enquiryId: e.id, customerId: e.customerId!, siteName: e.siteName, requiredBy: e.requiredBy }, { quiet: true });
                  act(S.convertEnquiryToRfq, { enquiryId: e.id }, { success: (r) => `RFQ ${r.number} created with ${r.lines.length} lines` });
                }}
              >
                <FileText className="size-4" /> Create RFQ
              </Button>
            </Gate>
          )}
          {rfq && !quote && (
            <Gate perm="quote.create">
              <Button
                onClick={() => {
                  const q = act(S.createQuoteFromRfq, { rfqId: rfq.id }, { success: (x) => `Draft ${x.number} created from ${rfq.number}` });
                  if (q) nav(`/quotes/${q.id}`);
                }}
              >
                <ArrowRight className="size-4" /> Create quotation
              </Button>
            </Gate>
          )}
          {quote && (
            <Button onClick={() => nav(`/quotes/${quote.id}`)}>
              <FileText className="size-4" /> Open {quote.number} <StatusBadge kind="quote" status={quote.status} />
            </Button>
          )}
          {!closed && (
            <>
              <Button variant="outline" onClick={() => setFollow(true)}>
                <Calendar className="size-4" /> Follow-up
              </Button>
              <Button variant="ghost" onClick={() => setLost(true)}>
                <X className="size-4" /> Mark lost
              </Button>
            </>
          )}
        </div>
        {rfq && (
          <p className="mt-2 text-xs text-muted">
            {rfq.number} · {rfq.lines.length} lines · required {fmtDate(rfq.requiredBy)} · {rfq.status}
          </p>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted">Activity ({e.activity.length})</summary>
          <ol className="mt-2 space-y-1.5 text-xs">
            {[...e.activity].reverse().map((a, i) => (
              <li key={i} className="text-ink-2">
                <span className="text-muted">{relTime(a.at, now)} · {a.by}:</span> {a.text}
              </li>
            ))}
          </ol>
        </details>
      </div>
      <QualifyModal open={qualify} onOpenChange={setQualify} e={e} />
      <LostModal open={lost} onOpenChange={setLost} e={e} />
      <FollowModal open={follow} onOpenChange={setFollow} e={e} />
    </Card>
  );
}

function LineEditor({ e, locked }: { e: Enquiry; locked: boolean }) {
  const db = useDbState();
  const stock = stockIndex(db);
  const [adding, setAdding] = React.useState(false);
  const save = (lines: ExtractedLine[]) => act(S.setEnquiryLines, { enquiryId: e.id, lines });
  const upd = (lid: string, patch: Partial<ExtractedLine>) => save(e.lines.map((l) => (l.id === lid ? { ...l, ...patch, confidence: patch.productId ? 'manual' : l.confidence } : l)));
  if (!e.lines.length && locked) return <p className="text-sm text-muted">No lines.</p>;
  return (
    <div className="space-y-2">
      {e.lines.map((l) => {
        const p = l.productId ? db.products[l.productId] : undefined;
        const alt = l.alternativeId ? db.products[l.alternativeId] : undefined;
        const st = p ? stock[p.id] : undefined;
        const need = p ? l.qty * (p.uoms.find((u) => u.uom === l.uom)?.factor ?? 1) : 0;
        return (
          <div key={l.id} className={cn('rounded-xl border p-3', p ? 'border-line' : 'border-danger/40 bg-danger-soft/30')}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span className="italic">“{l.raw}”</span>
              <Badge tone={l.confidence === 'high' ? 'green' : l.confidence === 'medium' ? 'amber' : l.confidence === 'manual' ? 'blue' : 'red'}>{l.confidence === 'manual' ? 'confirmed by staff' : `${l.confidence} match`}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {p ? (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs text-muted">{p.sku}</span> {p.name}
                    {p.variantLabel ? ` — ${p.variantLabel}` : ''}
                  </p>
                  <p className={cn('text-xs', (st?.available ?? 0) >= need ? 'text-brand' : 'text-warn')}>
                    {st?.available ?? 0} {p.baseUom} available{(st?.available ?? 0) < need ? ` — short ${need - (st?.available ?? 0)} · lead time ${p.leadTimeDays}d` : ''} · {st?.incoming ?? 0} incoming
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-sm text-danger">{l.note ?? 'No SKU selected'}</p>
              )}
              {!locked && (
                <>
                  <Input type="number" min={0} value={l.qty} onChange={(x) => upd(l.id, { qty: Number(x.target.value) })} className="h-8 w-20" aria-label="Quantity" />
                  {p && (
                    <Select value={l.uom} onChange={(x) => upd(l.id, { uom: x.target.value as UomCode })} className="h-8 w-28" aria-label="UOM">
                      {productUoms(p).map((u) => (
                        <option key={u.uom} value={u.uom}>
                          {u.uom}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => save(e.lines.filter((x) => x.id !== l.id))} aria-label="Remove line">
                    <Trash className="size-4" />
                  </Button>
                </>
              )}
              {locked && (
                <span className="tabular text-sm font-semibold">
                  {l.qty} {l.uom}
                </span>
              )}
            </div>
            {!locked && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ProductSearch className="min-w-[220px] flex-1" placeholder={p ? 'Change SKU…' : 'Select SKU…'} onPick={(x) => upd(l.id, { productId: x.id, uom: x.baseUom, note: undefined })} />
                {alt && (
                  <Button size="xs" variant="outline" onClick={() => upd(l.id, { productId: alt.id, alternativeId: p?.id, uom: alt.baseUom })}>
                    Alternative: {alt.sku} {alt.variantLabel ?? ''}
                  </Button>
                )}
                {l.note && p && <span className="text-[11px] text-warn">{l.note}</span>}
              </div>
            )}
          </div>
        );
      })}
      {!locked && (adding ? (
        <div className="rounded-xl border border-dashed border-line-strong p-3">
          <ProductSearch autoFocus onPick={(x) => { save([...e.lines, { id: `el_${Date.now()}`, raw: 'Added by staff', productId: x.id, qty: 1, uom: x.baseUom, confidence: 'manual' }]); setAdding(false); }} />
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add line manually
        </Button>
      ))}
      <DemoNote>Suggestions use transparent keyword + size matching against the catalog — not AI. Staff confirm every line before it becomes an RFQ.</DemoNote>
    </div>
  );
}

function CustomerContext({ e, now }: { e: Enquiry; now: string }) {
  const db = useDbState();
  const nav = useNavigate();
  const c = e.customerId ? db.customers[e.customerId] : undefined;
  if (!c)
    return (
      <Card className="p-4 text-sm text-muted">
        <p className="font-semibold text-ink">Unknown contact</p>
        <p className="mt-1">Qualify the enquiry to link or create a customer. Prices default to the walk-in tier until then.</p>
      </Card>
    );
  const cp = creditPosition(db, c.id, now);
  const quotes = Object.values(db.quotes).filter((q) => q.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const orders = Object.values(db.salesOrders).filter((o) => o.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  const openInv = Object.values(db.invoices).filter((i) => i.customerId === c.id && invoiceBalance(i) > 0);
  return (
    <Card className="space-y-4 self-start p-4">
      <div>
        <button onClick={() => nav(`/customers?id=${c.id}`)} className="text-left font-semibold hover:text-brand">
          {c.name}
        </button>
        <p className="text-xs capitalize text-muted">
          {c.type} · {TIER_LABELS[c.tier]} tier
        </p>
      </div>
      <div className="text-sm">
        <KV k="Credit limit" v={c.creditLimit ? formatRM(c.creditLimit) : 'Cash'} />
        <KV k="Exposure" v={<span className={cp.status === 'ok' ? '' : 'text-danger'}>{formatRM(cp.exposure)}</span>} />
        <KV k="Open invoices" v={`${openInv.length} · ${formatRM(openInv.reduce((s, i) => s + invoiceBalance(i), 0))}`} />
        <KV k="Terms" v={c.paymentTermsDays ? `${c.paymentTermsDays} days` : 'Cash'} />
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent quotes</p>
        <ul className="space-y-1 text-xs">
          {quotes.map((q) => (
            <li key={q.id}>
              <button onClick={() => nav(`/quotes/${q.id}`)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface-2">
                <span className="font-mono">{q.number}</span>
                <StatusBadge kind="quote" status={q.status} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent orders</p>
        <ul className="space-y-1 text-xs">
          {orders.map((o) => (
            <li key={o.id}>
              <button onClick={() => nav(`/orders?id=${o.id}`)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface-2">
                <span className="font-mono">{o.number}</span>
                <StatusBadge kind="order" status={o.status} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function QualifyModal({ open, onOpenChange, e }: { open: boolean; onOpenChange: (o: boolean) => void; e: Enquiry }) {
  const db = useDbState();
  const [mode, setMode] = React.useState<'existing' | 'new'>('existing');
  const [cust, setCust] = React.useState('');
  const [name, setName] = React.useState(e.contactName.replace(/\s*\(.*\)/, ''));
  const [site, setSite] = React.useState(e.siteName ?? '');
  const submit = () => {
    let cid = cust;
    if (mode === 'new') {
      const c = act(S.createCustomer, { name, type: 'contractor', tier: 'walkin', contacts: [{ name, role: 'Contact', phone: e.contactPhone, email: '' }], billingAddress: 'To be confirmed', sites: [], creditLimit: 0, paymentTermsDays: 0, tags: ['prospect'], phone: e.contactPhone, email: '' }, { success: (x) => `Prospect ${x.name} created (cash terms)` });
      if (!c) return;
      cid = c.id;
    }
    if (!cid) return toast.error('Choose a customer');
    if (act(S.qualifyEnquiry, { enquiryId: e.id, customerId: cid, siteName: site || undefined }, { success: 'Enquiry qualified and linked' }) !== undefined) onOpenChange(false);
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Qualify enquiry"
      description="Link the enquiry to a customer account so tier and contract prices apply."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Qualify</Button>
        </>
      }
    >
      <Segmented
        id="ql-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'existing', label: 'Existing customer' },
          { value: 'new', label: 'New prospect' },
        ]}
      />
      <div className="mt-3 space-y-3">
        {mode === 'existing' ? (
          <Field label="Customer" required>
            <Select value={cust} onChange={(x) => setCust(x.target.value)}>
              <option value="">Select…</option>
              {Object.values(db.customers)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="Prospect name" required hint="Created as a cash (walk-in tier) account; credit terms need Finance approval later.">
            <Input value={name} onChange={(x) => setName(x.target.value)} />
          </Field>
        )}
        <Field label="Site / project">
          <Input value={site} onChange={(x) => setSite(x.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function LostModal({ open, onOpenChange, e }: { open: boolean; onOpenChange: (o: boolean) => void; e: Enquiry }) {
  const [reason, setReason] = React.useState('No stock in time');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Mark enquiry lost"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => act(S.markEnquiryLost, { enquiryId: e.id, reason }, { success: 'Marked lost' }) !== undefined && onOpenChange(false)}>
            Mark lost
          </Button>
        </>
      }
    >
      <Field label="Reason">
        <Select value={reason} onChange={(x) => setReason(x.target.value)}>
          {['No stock in time', 'Price', 'Customer unresponsive', 'Duplicate enquiry', 'Item not carried'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

function FollowModal({ open, onOpenChange, e }: { open: boolean; onOpenChange: (o: boolean) => void; e: Enquiry }) {
  const [date, setDate] = React.useState(addDays(new Date().toISOString(), 1).slice(0, 10));
  const [note, setNote] = React.useState('');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Set follow-up reminder"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => act(S.setFollowUp, { enquiryId: e.id, at: new Date(`${date}T09:00:00+08:00`).toISOString(), note }, { success: `Follow-up set for ${date}` }) !== undefined && onOpenChange(false)}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(x) => setDate(x.target.value)} />
        </Field>
        <Field label="Note">
          <Textarea value={note} onChange={(x) => setNote(x.target.value)} placeholder="e.g. Call to confirm site address" />
        </Field>
      </div>
    </Modal>
  );
}
