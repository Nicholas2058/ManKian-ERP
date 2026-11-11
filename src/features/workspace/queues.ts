import type { DbState } from '@/domain/state';
import type { ID, RoleKey } from '@/domain/types';
import { OPEN_PO, poOutstanding, stockIndex } from '@/domain/inventory';
import { invoiceBalance } from '@/domain/finance';
import { daysOverdue, dayKey, fmtDate } from '@/lib/dates';
import { compactRM, formatRM } from '@/lib/money';

export interface QueueStat {
  key: string;
  label: string;
  value: number;
  display?: string;
  link: string;
  tone?: 'warn' | 'danger' | 'default';
}

export interface TaskItem {
  id: ID;
  title: string;
  detail: string;
  link: string;
  action: string;
  tone?: 'warn' | 'danger' | 'info';
}

export interface QuickAction {
  label: string;
  link: string;
}

export interface Workspace {
  stats: QueueStat[];
  tasks: { title: string; items: TaskItem[]; empty: string }[];
  actions: QuickAction[];
}

/** Role-specific work queues derived from the same records every module uses. */
export function workspaceFor(role: RoleKey, db: DbState, now: string): Workspace {
  const today = dayKey(now);
  const quotes = Object.values(db.quotes);
  const orders = Object.values(db.salesOrders);
  const pos = Object.values(db.purchaseOrders);
  const dos = Object.values(db.deliveryOrders);
  const stock = stockIndex(db);
  const cust = (id: ID) => db.customers[id]?.name ?? '';
  const cur = (q: (typeof quotes)[number]) => q.versions[q.currentVersion - 1];

  switch (role) {
    case 'sales_exec': {
      const enq = Object.values(db.enquiries).filter((e) => ['new', 'qualified', 'rfq'].includes(e.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const drafts = quotes.filter((q) => q.status === 'draft');
      const expiring = quotes.filter((q) => q.status === 'issued' && cur(q).expiresAt && (Date.parse(cur(q).expiresAt!) - Date.parse(now)) / 3_600_000 <= 48);
      const accepted = quotes.filter((q) => q.status === 'accepted');
      const toReserve = orders.filter((o) => o.status === 'confirmed');
      return {
        stats: [
          { key: 'enq', label: 'Open enquiries', value: enq.length, link: '/enquiries' },
          { key: 'drafts', label: 'Draft quotations', value: drafts.length, link: '/quotes' },
          { key: 'exp', label: 'Quotes expiring ≤ 48h', value: expiring.length, link: '/quotes?filter=expiring', tone: expiring.length ? 'warn' : 'default' },
          { key: 'acc', label: 'Accepted — convert', value: accepted.length, link: '/quotes?filter=won', tone: accepted.length ? 'warn' : 'default' },
        ],
        tasks: [
          { title: 'Reply to enquiries', empty: 'Inbox is clear.', items: enq.slice(0, 5).map((e) => ({ id: e.id, title: `${e.contactName.split(' (')[0]} · ${e.channel}`, detail: e.subject, link: `/enquiries?id=${e.id}`, action: e.status === 'rfq' ? 'Quote' : 'Open', tone: e.unread ? 'warn' : undefined })) },
          { title: 'Follow up before expiry', empty: 'No quotes close to expiry.', items: expiring.slice(0, 5).map((q) => ({ id: q.id, title: `${q.number} · ${cust(q.customerId)}`, detail: `${formatRM(cur(q).totals.total)} · expires ${fmtDate(cur(q).expiresAt)}`, link: `/quotes/${q.id}`, action: 'Follow up', tone: 'warn' })) },
          { title: 'Convert & reserve', empty: 'Nothing waiting.', items: [...accepted.map((q) => ({ id: q.id, title: `${q.number} accepted`, detail: cust(q.customerId), link: `/quotes/${q.id}`, action: 'Convert' })), ...toReserve.map((o) => ({ id: o.id, title: `${o.number} needs stock reserved`, detail: cust(o.customerId), link: `/orders?id=${o.id}`, action: 'Reserve' }))].slice(0, 5) },
        ],
        actions: [
          { label: 'New quotation', link: '/quotes/new' },
          { label: 'Simulate WhatsApp enquiry', link: '/enquiries?new=1' },
          { label: 'Product catalog', link: '/catalog' },
          { label: 'Counter POS', link: '/pos' },
        ],
      };
    }
    case 'procurement': {
      const low = Object.values(db.products).filter((p) => p.status === 'active' && (stock[p.id]?.available ?? 0) + (stock[p.id]?.incoming ?? 0) < p.reorderPoint);
      const reqs = Object.values(db.requisitions).filter((r) => ['open', 'quoting'].includes(r.status));
      const drafts = pos.filter((p) => p.status === 'draft');
      const late = pos.filter((p) => OPEN_PO.includes(p.status) && p.expectedAt < now && p.lines.some((l) => poOutstanding(l) > 0));
      const pendingCost = Object.values(db.priceChanges).filter((c) => c.status === 'pending');
      return {
        stats: [
          { key: 'low', label: 'Below reorder point', value: low.length, link: '/inventory?tab=reorder', tone: low.length ? 'warn' : 'default' },
          { key: 'req', label: 'Open requisitions', value: reqs.length, link: '/procurement?tab=requisitions' },
          { key: 'late', label: 'Late POs', value: late.length, link: '/procurement?tab=pos', tone: late.length ? 'danger' : 'default' },
          { key: 'cost', label: 'Cost proposals pending', value: pendingCost.length, link: '/pricing?tab=approvals' },
        ],
        tasks: [
          { title: 'Replenish', empty: 'All SKUs above reorder point.', items: low.slice(0, 5).map((p) => ({ id: p.id, title: `${p.sku} ${p.variantLabel ?? ''}`, detail: `available ${stock[p.id]?.available ?? 0} · incoming ${stock[p.id]?.incoming ?? 0} · ROP ${p.reorderPoint}`, link: `/procurement?tab=requisitions&product=${p.id}`, action: 'Requisition', tone: (stock[p.id]?.available ?? 0) <= 0 ? 'danger' : 'warn' })) },
          { title: 'Chase suppliers', empty: 'No late purchase orders.', items: late.slice(0, 5).map((p) => ({ id: p.id, title: `${p.number} · ${db.suppliers[p.supplierId]?.name}`, detail: `expected ${fmtDate(p.expectedAt)} · ${daysOverdue(p.expectedAt, now)}d late`, link: `/procurement?tab=pos&id=${p.id}`, action: 'Open', tone: 'danger' })) },
          { title: 'Send draft POs', empty: 'No drafts.', items: drafts.slice(0, 5).map((p) => ({ id: p.id, title: p.number, detail: db.suppliers[p.supplierId]?.name ?? '', link: `/procurement?tab=pos&id=${p.id}`, action: 'Send' })) },
        ],
        actions: [
          { label: 'New requisition', link: '/procurement?new=pr' },
          { label: 'New purchase order', link: '/procurement?new=po' },
          { label: 'Import supplier price list', link: '/pricing?tab=batch' },
          { label: 'Cost shock simulator', link: '/pricing?tab=shock' },
        ],
      };
    }
    case 'wh_supervisor':
    case 'picker': {
      const toPick = orders.filter((o) => o.status !== 'cancelled' && o.creditStatus !== 'pending_override' && o.lines.some((l) => l.allocated - (l.picked - l.dispatched) > 1e-6));
      const lists = Object.values(db.picklists).filter((p) => ['open', 'in_progress'].includes(p.status));
      const due = pos.filter((p) => OPEN_PO.includes(p.status) && dayKey(p.expectedAt) <= today && p.lines.some((l) => poOutstanding(l) > 0));
      const shorts = Object.values(db.picklists).flatMap((p) => p.tasks.filter((t) => t.status === 'short').map((t) => ({ p, t })));
      const blocked = Object.values(db.binStock).filter((b) => b.status !== 'ok');
      const pickTasks: TaskItem[] = [
        ...lists.map((p) => ({ id: p.id, title: `${p.number} · ${db.salesOrders[p.orderId]?.number}`, detail: `${p.tasks.filter((t) => t.status === 'open').length} bin task(s) open · ${cust(db.salesOrders[p.orderId]?.customerId ?? '')}`, link: `/inventory?tab=picking&pl=${p.id}`, action: 'Continue', tone: 'info' as const })),
        ...toPick.filter((o) => !lists.some((l) => l.orderId === o.id)).map((o) => ({ id: o.id, title: `${o.number} ready to pick`, detail: `${cust(o.customerId)} · ${o.fulfilment}`, link: '/inventory?tab=picking', action: 'Start' })),
      ];
      if (role === 'picker')
        return {
          stats: [
            { key: 'pick', label: 'Orders to pick', value: toPick.length, link: '/inventory?tab=picking', tone: toPick.length ? 'warn' : 'default' },
            { key: 'lists', label: 'Picklists in progress', value: lists.length, link: '/inventory?tab=picking' },
            { key: 'short', label: 'Short picks reported', value: shorts.length, link: '/inventory?tab=ledger' },
          ],
          tasks: [{ title: 'Your pick queue', empty: 'Nothing to pick right now.', items: pickTasks.slice(0, 8) }],
          actions: [
            { label: 'Open picking', link: '/inventory?tab=picking' },
            { label: 'Barcode scanner', link: '/inventory?tab=scanner' },
            { label: '3D picking route', link: '/warehouse' },
          ],
        };
      return {
        stats: [
          { key: 'pick', label: 'Orders to pick', value: toPick.length, link: '/inventory?tab=picking', tone: toPick.length ? 'warn' : 'default' },
          { key: 'due', label: 'Deliveries due in', value: due.length, link: '/procurement?tab=pos' },
          { key: 'short', label: 'Pick discrepancies', value: shorts.length, link: '/inventory?tab=ledger', tone: shorts.length ? 'danger' : 'default' },
          { key: 'q', label: 'Quarantined lots', value: blocked.length, link: '/inventory' },
        ],
        tasks: [
          { title: 'Receive goods', empty: 'No supplier deliveries due.', items: due.slice(0, 5).map((p) => ({ id: p.id, title: `${p.number} · ${db.suppliers[p.supplierId]?.name}`, detail: `expected ${fmtDate(p.expectedAt)}`, link: `/procurement?tab=pos&id=${p.id}`, action: 'Receive', tone: p.expectedAt < now ? 'warn' : undefined })) },
          { title: 'Picking', empty: 'Nothing to pick.', items: pickTasks.slice(0, 5) },
          { title: 'Discrepancies to count', empty: 'No discrepancies.', items: shorts.slice(0, 5).map(({ p, t }) => ({ id: t.id, title: `${db.bins[t.binId]?.code} · ${db.products[t.productId]?.sku}`, detail: t.discrepancy ?? '', link: `/inventory?id=${t.productId}`, action: 'Count', tone: 'danger' })) },
        ],
        actions: [
          { label: 'Receive goods (GRN)', link: '/procurement?tab=pos' },
          { label: 'Picking', link: '/inventory?tab=picking' },
          { label: 'Adjust stock', link: '/inventory?new=adjust' },
          { label: '3D warehouse', link: '/warehouse' },
        ],
      };
    }
    case 'dispatcher': {
      const packed = dos.filter((d) => d.type === 'delivery' && (d.status === 'packed' || d.status === 'failed'));
      const todays = dos.filter((d) => d.type === 'delivery' && ['scheduled', 'out_for_delivery'].includes(d.status));
      const ready = dos.filter((d) => d.status === 'ready_for_collection');
      return {
        stats: [
          { key: 'packed', label: 'Packed — to schedule', value: packed.length, link: '/delivery', tone: packed.length ? 'warn' : 'default' },
          { key: 'route', label: 'Scheduled / on the road', value: todays.length, link: '/delivery' },
          { key: 'fail', label: 'Exceptions', value: dos.filter((d) => d.status === 'failed').length, link: '/delivery', tone: dos.some((d) => d.status === 'failed') ? 'danger' : 'default' },
          { key: 'pickup', label: 'Pickups waiting', value: ready.length, link: '/delivery' },
        ],
        tasks: [
          { title: 'Schedule loads', empty: 'Nothing packed.', items: packed.slice(0, 5).map((d) => ({ id: d.id, title: `${d.number} · ${cust(d.customerId)}`, detail: `${d.weightKg} kg${d.failReason ? ` · failed: ${d.failReason}` : ''}`, link: `/delivery?id=${d.id}`, action: d.status === 'failed' ? 'Reschedule' : 'Schedule', tone: d.status === 'failed' ? 'danger' : undefined })) },
          { title: 'Stops', empty: 'No stops scheduled.', items: todays.slice(0, 5).map((d) => ({ id: d.id, title: `${d.number} · ${cust(d.customerId)}`, detail: `${d.status === 'out_for_delivery' ? 'On the road' : 'Scheduled'} · ${d.vehicleId ? db.vehicles[d.vehicleId]?.type : ''}`, link: `/delivery?id=${d.id}`, action: d.status === 'out_for_delivery' ? 'Confirm' : 'Dispatch', tone: 'info' })) },
        ],
        actions: [
          { label: 'Dispatch board', link: '/delivery' },
          { label: 'Order timelines', link: '/orders' },
        ],
      };
    }
    case 'cashier': {
      const held = Object.values(db.posSales).filter((s) => s.status === 'held');
      const sales = Object.values(db.posSales).filter((s) => s.status === 'completed' && dayKey(s.at) === today);
      const ready = dos.filter((d) => d.status === 'ready_for_collection');
      return {
        stats: [
          { key: 'sales', label: 'Counter sales today', value: sales.length, link: '/pos' },
          { key: 'takings', label: 'Takings today', value: sales.reduce((s, x) => s + x.total, 0), display: compactRM(sales.reduce((s, x) => s + x.total, 0)), link: '/pos' },
          { key: 'held', label: 'Held sales', value: held.length, link: '/pos', tone: held.length ? 'warn' : 'default' },
          { key: 'pickup', label: 'Customer pickups ready', value: ready.length, link: '/pos' },
        ],
        tasks: [
          { title: 'Held sales', empty: 'No held sales.', items: held.map((s) => ({ id: s.id, title: s.number, detail: `${s.heldLabel} · ${formatRM(s.total)}`, link: '/pos', action: 'Resume', tone: 'warn' })) },
          { title: 'Pickups at the counter', empty: 'No collections waiting.', items: ready.slice(0, 5).map((d) => ({ id: d.id, title: `${d.number} · ${cust(d.customerId)}`, detail: `Token ${d.pickupToken} — warehouse supervisor hands over goods`, link: '/pos', action: 'View' })) },
        ],
        actions: [
          { label: 'Open counter POS', link: '/pos' },
          { label: 'Product catalog (customer view)', link: '/catalog' },
          { label: 'Customers', link: '/customers' },
        ],
      };
    }
    case 'finance': {
      const overdue = Object.values(db.invoices).filter((i) => invoiceBalance(i) > 0 && daysOverdue(i.dueDate, now) > 0);
      const holds = orders.filter((o) => o.creditStatus === 'pending_override');
      return {
        stats: [
          { key: 'hold', label: 'Credit holds', value: holds.length, link: '/approvals', tone: holds.length ? 'danger' : 'default' },
          { key: 'od', label: 'Overdue invoices', value: overdue.length, display: `${overdue.length} · ${compactRM(overdue.reduce((s, i) => s + invoiceBalance(i), 0))}`, link: '/finance?tab=receivables', tone: overdue.length ? 'warn' : 'default' },
        ],
        tasks: [],
        actions: [],
      };
    }
    case 'sales_manager': {
      const ap = Object.values(db.approvals).filter((a) => a.status === 'pending' && ['price_change', 'margin_floor', 'discount', 'price_override', 'quote_reissue', 'pos_discount'].includes(a.type));
      const recheck = quotes.filter((q) => q.recheck && ['draft', 'pending_approval', 'approved'].includes(q.status));
      return {
        stats: [
          { key: 'ap', label: 'Approvals waiting for you', value: ap.length, link: '/approvals', tone: ap.length ? 'warn' : 'default' },
          { key: 'rc', label: 'Quotes needing recheck', value: recheck.length, link: '/quotes?filter=recheck' },
        ],
        tasks: [],
        actions: [],
      };
    }
    default:
      return { stats: [], tasks: [], actions: [] };
  }
}
