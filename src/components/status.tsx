import { Badge, type Tone } from './ui/core';
import { AlertTriangle, Check, CircleDot, Clock, Lock, RefreshCw, Truck, X, Hourglass, PackageCheck, Ban } from './ui/icons';

type Def = [string, Tone, React.ReactNode?];
const I = 'size-3';

const MAPS: Record<string, Record<string, Def>> = {
  quote: {
    draft: ['Draft', 'neutral', <CircleDot className={I} />],
    pending_approval: ['Pending approval', 'amber', <Hourglass className={I} />],
    approved: ['Approved', 'green', <Check className={I} />],
    issued: ['Issued', 'blue', <Lock className={I} />],
    accepted: ['Accepted', 'green', <Check className={I} />],
    rejected: ['Rejected', 'red', <X className={I} />],
    expired: ['Expired', 'orange', <Clock className={I} />],
    converted: ['Converted to order', 'dark', <PackageCheck className={I} />],
    cancelled: ['Cancelled', 'neutral', <Ban className={I} />],
  },
  order: {
    pending_credit: ['Credit hold', 'red', <Lock className={I} />],
    confirmed: ['Confirmed — to reserve', 'neutral'],
    partially_allocated: ['Partially reserved', 'amber'],
    allocated: ['Reserved — to pick', 'blue'],
    picking: ['Picking', 'violet'],
    ready: ['Packed / staged', 'violet', <PackageCheck className={I} />],
    partially_dispatched: ['Partially dispatched', 'amber', <Truck className={I} />],
    dispatched: ['Dispatched', 'blue', <Truck className={I} />],
    delivered: ['Delivered', 'green', <Check className={I} />],
    invoiced: ['Invoiced', 'dark'],
    closed: ['Closed', 'neutral'],
    cancelled: ['Cancelled', 'neutral', <Ban className={I} />],
  },
  po: {
    draft: ['Draft', 'neutral'],
    sent: ['Sent', 'blue'],
    acknowledged: ['Acknowledged', 'violet'],
    partial: ['Partially received', 'amber'],
    received: ['Received', 'green', <Check className={I} />],
    closed: ['Closed', 'neutral'],
    cancelled: ['Cancelled', 'neutral', <Ban className={I} />],
  },
  delivery: {
    packed: ['Packed', 'violet'],
    scheduled: ['Load scheduled', 'blue'],
    out_for_delivery: ['Out for delivery', 'amber', <Truck className={I} />],
    delivered: ['Delivered', 'green', <Check className={I} />],
    failed: ['Failed — reschedule', 'red', <AlertTriangle className={I} />],
    ready_for_collection: ['Ready for collection', 'blue'],
    collected: ['Collected', 'green', <Check className={I} />],
    cancelled: ['Cancelled', 'neutral'],
  },
  invoice: {
    open: ['Open', 'blue'],
    partial: ['Part-paid', 'amber'],
    overdue: ['Overdue', 'red', <AlertTriangle className={I} />],
    paid: ['Paid', 'green', <Check className={I} />],
    void: ['Void', 'neutral'],
  },
  enquiry: {
    new: ['New', 'orange'],
    qualified: ['Qualified', 'blue'],
    rfq: ['RFQ created', 'violet'],
    quoted: ['Quoted', 'green'],
    won: ['Won', 'dark'],
    lost: ['Lost', 'neutral'],
  },
  price: {
    approved: ['Approved', 'green', <Check className={I} />],
    pending: ['Pending approval', 'amber', <Hourglass className={I} />],
    needs_recheck: ['Needs recheck', 'orange', <RefreshCw className={I} />],
    below_margin: ['Below margin floor', 'red', <AlertTriangle className={I} />],
    contract_locked: ['Contract locked', 'violet', <Lock className={I} />],
    expired: ['Expired', 'neutral', <Clock className={I} />],
  },
  approval: {
    pending: ['Pending', 'amber', <Hourglass className={I} />],
    approved: ['Approved', 'green', <Check className={I} />],
    rejected: ['Rejected', 'red', <X className={I} />],
    cancelled: ['Superseded', 'neutral'],
  },
  change: {
    pending: ['Pending', 'amber'],
    approved: ['Approved', 'green'],
    rejected: ['Rejected', 'red'],
    superseded: ['Superseded', 'neutral'],
  },
  requisition: {
    open: ['Open', 'orange'],
    quoting: ['Comparing quotes', 'blue'],
    ordered: ['PO created', 'green'],
    cancelled: ['Cancelled', 'neutral'],
  },
  picklist: {
    open: ['Open', 'orange'],
    in_progress: ['In progress', 'blue'],
    completed: ['Completed', 'green'],
    cancelled: ['Cancelled', 'neutral'],
  },
};

export function StatusBadge({ kind, status, className }: { kind: keyof typeof MAPS; status: string; className?: string }) {
  const d = MAPS[kind]?.[status] ?? [status.replace(/_/g, ' '), 'neutral' as Tone];
  return (
    <Badge tone={d[1]} icon={d[2]} className={className}>
      {d[0]}
    </Badge>
  );
}

export function statusLabel(kind: keyof typeof MAPS, status: string) {
  return MAPS[kind]?.[status]?.[0] ?? status.replace(/_/g, ' ');
}
