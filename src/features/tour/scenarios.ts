import type { DbState } from '@/domain/state';
import type { RoleKey } from '@/domain/types';

export interface TourStep {
  title: string;
  body: string;
  route: (db: DbState) => string;
  /** data-tour target(s); comma-separated fallbacks, first visible one wins. */
  target?: string;
  role?: RoleKey;
  /** Completed when the underlying records reflect the action. */
  done?: (db: DbState, startedAt: string) => boolean;
}

export interface Scenario {
  key: string;
  letter: string;
  title: string;
  summary: string;
  minutes: number;
  steps: TourStep[];
}

const sc = (db: DbState) => db.config.scenario;

export const SCENARIOS: Scenario[] = [
  {
    key: 'A',
    letter: 'A',
    title: 'Daily cost shock',
    summary: 'A supplier raises steel cost 14%. Watch proposed prices, margins and draft quotes react — while issued quotes keep their snapshot.',
    minutes: 2,
    steps: [
      { title: 'Open the tracked steel SKU', body: 'Pricing Command Center shows angle bar 50x50x5 with cost history, tier prices and the margin formula.', route: (db) => `/pricing?sku=${sc(db).shockProduct}`, target: 'pricing-detail' },
      {
        title: 'Simulate a 14% supplier cost rise',
        body: 'In the Cost Shock Simulator choose Industrial & Steel → angle bar, set +14% and click "Apply as supplier cost update". This records the cost and raises a price proposal.',
        route: (db) => `/pricing?tab=shock&sku=${sc(db).shockProduct}`,
        target: 'shock-panel',
        role: 'procurement',
        done: (db, t) => Object.values(db.priceChanges).some((c) => c.productId === sc(db).shockProduct && c.createdAt >= t),
      },
      { title: 'See the affected quotations', body: 'One draft falls below the margin floor, one is contract-locked (price honoured) and one issued quote keeps its historical selling price.', route: (db) => `/pricing?tab=shock&sku=${sc(db).shockProduct}`, target: 'shock-impact' },
      {
        title: 'Approve as Sales Manager',
        body: 'Switch role to Sales Manager (top-right) and approve the proposed price in the approval inbox. You can adjust the price before approving.',
        route: () => '/approvals',
        target: 'approval-inbox',
        role: 'sales_manager',
        done: (db, t) => Object.values(db.priceChanges).some((c) => c.productId === sc(db).shockProduct && c.status === 'approved' && (c.decidedAt ?? '') >= t),
      },
      { title: 'Confirm the cross-module result', body: 'The draft quote is now flagged "price updated — reprice"; the issued quote is untouched. Price history, the audit log and the dashboard alert all reflect the change.', route: (db) => `/quotes/${sc(db).quoteA1}`, target: 'quote-recheck' },
    ],
  },
  {
    key: 'B',
    letter: 'B',
    title: 'WhatsApp enquiry → quotation → order',
    summary: 'A fictional contractor asks for 40 × 2" elbows and 20 lengths of 2" pipe. Only 25 elbows are in stock.',
    minutes: 2,
    steps: [
      { title: 'Open the WhatsApp enquiry', body: 'Simulated channel. Rule-based extraction already suggests SKUs, quantities and UOMs — staff confirm them.', route: (db) => `/enquiries?id=${sc(db).enquiryB}`, target: 'enquiry-thread' },
      { title: 'Convert to a structured RFQ', body: 'Check the suggested lines, then click "Create RFQ". Stock and lead time are shown per line.', route: (db) => `/enquiries?id=${sc(db).enquiryB}`, target: 'enquiry-actions', done: (db) => !!db.enquiries[sc(db).enquiryB]?.rfqId },
      { title: 'Build the quotation', body: 'Click "Create quotation". Add an optional freight charge and choose validity; margin and availability are shown per line.', route: (db) => (db.enquiries[sc(db).enquiryB]?.quoteId ? `/quotes/${db.enquiries[sc(db).enquiryB].quoteId}` : `/enquiries?id=${sc(db).enquiryB}`), target: 'quote-summary,enquiry-actions', done: (db) => !!db.enquiries[sc(db).enquiryB]?.quoteId },
      {
        title: 'Approve, issue the PDF and mark accepted',
        body: 'Submit (approve as Sales Manager if a rule triggers), issue, download the DEMO SAMPLE PDF, then mark the quote accepted.',
        route: (db) => `/quotes/${db.enquiries[sc(db).enquiryB]?.quoteId ?? ''}`,
        target: 'quote-actions',
        done: (db) => ['accepted', 'converted'].includes(db.quotes[db.enquiries[sc(db).enquiryB]?.quoteId ?? '']?.status ?? ''),
      },
      {
        title: 'Convert to order and reserve stock',
        body: 'Convert to a sales order, then click "Reserve stock". 25 elbows are reserved and a 15-unit backorder is created with a promised date.',
        route: (db) => {
          const q = db.quotes[db.enquiries[sc(db).enquiryB]?.quoteId ?? ''];
          return q?.orderId ? `/orders?id=${q.orderId}` : `/quotes/${q?.id ?? ''}`;
        },
        target: 'order-actions,quote-actions',
        done: (db) => {
          const q = db.quotes[db.enquiries[sc(db).enquiryB]?.quoteId ?? ''];
          return !!q?.orderId && Object.values(db.backorders).some((b) => b.orderId === q.orderId);
        },
      },
    ],
  },
  {
    key: 'C',
    letter: 'C',
    title: 'Procurement → receiving → 3D warehouse',
    summary: 'A low-stock U-bolt blocks a customer order. Compare three suppliers, raise a PO, receive part of it and watch it land in the 3D warehouse.',
    minutes: 2,
    steps: [
      { title: 'Open the low-stock alert', body: 'UBL-M12-4 is below its reorder point and an order is backordered.', route: () => '/inventory?tab=reorder', target: 'reorder-list' },
      {
        title: 'Compare three suppliers',
        body: 'Create a requisition, request (simulated) supplier quotations and compare price, MOQ, lead time and past performance.',
        route: (db) => `/procurement?tab=requisitions&product=${sc(db).ubolt}`,
        target: 'requisitions',
        role: 'procurement',
        done: (db, t) => Object.values(db.requisitions).some((r) => r.createdAt >= t && r.lines.some((l) => l.productId === sc(db).ubolt) && r.supplierQuoteIds.length >= 2),
      },
      {
        title: 'Raise the PO and receive a partial delivery',
        body: 'Select a supplier, send the PO, then post a goods receipt for part of the quantity into a bin. Leave "allocate backorders" on.',
        route: () => '/procurement?tab=pos',
        target: 'po-list',
        role: 'wh_supervisor',
        done: (db, t) => Object.values(db.goodsReceipts).some((g) => g.receivedAt >= t && g.lines.some((l) => l.productId === sc(db).ubolt)),
      },
      {
        title: 'See it arrive in the 3D warehouse',
        body: 'The receiving animation moves the goods from the dock to the bin. Click the bin to see the same stock figures as the inventory module.',
        route: (db) => {
          const g = Object.values(db.goodsReceipts).filter((x) => x.lines.some((l) => l.productId === sc(db).ubolt)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
          return g ? `/warehouse?grn=${g.id}` : '/warehouse';
        },
        target: 'warehouse-view',
      },
      { title: 'Verify stock, backorder and cost', body: 'On-hand and available increased, the backorder is allocated, and any PO cost difference is a PROPOSED cost version — not an overwrite.', route: (db) => `/catalog?id=${sc(db).ubolt}`, target: 'product-stock', done: (db) => Object.values(db.backorders).some((b) => b.productId === sc(db).ubolt && b.status === 'allocated') },
    ],
  },
  {
    key: 'D',
    letter: 'D',
    title: 'Dispatch and self-pickup',
    summary: 'Pick two ready orders on a mobile picklist, send one by lorry with proof of delivery and hand the other over at the counter.',
    minutes: 2,
    steps: [
      { title: 'Pick the delivery order', body: 'Generate the picklist for the Teratai order and confirm each bin pick (tap or scan the barcode).', route: () => '/inventory?tab=picking', target: 'picking', role: 'wh_supervisor', done: (db) => Object.values(db.picklists).some((p) => p.orderId === sc(db).orderD1 && p.status === 'completed') },
      { title: 'Prepare the self-pickup order', body: 'Pick the Halia order and pack it as a self-pickup with a collection token.', route: () => '/inventory?tab=picking', target: 'picking', done: (db) => Object.values(db.deliveryOrders).some((d) => d.orderId === sc(db).orderD2 && d.type === 'pickup') },
      { title: 'Dispatch, drive and confirm', body: 'In Delivery, pack the Teratai goods, schedule a vehicle, dispatch and confirm in the driver view with a typed signature. Download the DO PDF.', route: () => '/delivery', target: 'delivery-page', role: 'dispatcher', done: (db) => Object.values(db.deliveryOrders).some((d) => d.orderId === sc(db).orderD1 && d.status === 'delivered') },
      { title: 'Customer timeline & stock', body: 'The order timeline shows every step; dispatched stock left the warehouse and an invoice was issued per the configured workflow.', route: (db) => `/orders?id=${sc(db).orderD1}`, target: 'order-timeline' },
    ],
  },
  {
    key: 'E',
    letter: 'E',
    title: 'Finance & credit control',
    summary: 'A fictional customer is over their credit limit with an overdue invoice. A new order needs a manager override; a payment then restores headroom.',
    minutes: 1,
    steps: [
      { title: 'Review the customer', body: 'Zamrud Home Improvement: credit limit, exposure, overdue invoice and ageing.', route: () => '/customers?id=c26', target: 'credit-panel' },
      { title: 'Convert the accepted quote', body: 'Converting triggers a credit hold — stock cannot be reserved until Finance or the Owner overrides.', route: (db) => `/quotes/${sc(db).quoteE}`, target: 'quote-actions', role: 'sales_exec', done: (db) => Object.values(db.salesOrders).some((o) => o.quoteId === sc(db).quoteE) },
      { title: 'Approve the override as Finance', body: 'Switch role to Finance and approve (or reject) the override in the approval inbox.', route: () => '/approvals', target: 'approval-inbox', role: 'finance', done: (db) => Object.values(db.salesOrders).some((o) => o.quoteId === sc(db).quoteE && o.creditStatus === 'overridden') },
      { title: 'Record and allocate a payment', body: 'Record a simulated bank transfer and allocate it to the overdue invoice. Ageing and exposure recompute instantly.', route: () => '/finance?tab=receivables&customer=c26', target: 'payment', role: 'finance', done: (db, t) => Object.values(db.payments).some((p) => p.customerId === 'c26' && p.receivedAt >= t) },
      { title: 'See it on the dashboard', body: 'Open receivables and the overdue alert update; the audit log records the override and payment.', route: () => '/', target: 'kpis' },
    ],
  },
  {
    key: 'F',
    letter: 'F',
    title: 'Management review',
    summary: 'Find why Industrial & Steel margins are slipping and export the evidence.',
    minutes: 1,
    steps: [
      { title: 'Spot the declining category', body: 'Category mix and the margin trend show Industrial & Steel slipping while costs rose.', route: () => '/', target: 'category-mix' },
      { title: 'Drill into analytics', body: 'Margin by category over time, quote conversion and the deterministic Operations Insights explain the cause.', route: () => '/analytics?category=ind', target: 'margin-trend' },
      { title: 'Confirm with price history', body: 'Steel costs rose four times; approved list prices passed through only part of each increase.', route: (db) => `/pricing?sku=${sc(db).shockProduct}`, target: 'price-history' },
      { title: 'Export the evidence', body: 'Download the KPI CSV and the management PDF summary.', route: () => '/analytics', target: 'export' },
    ],
  },
];

export function scenarioByKey(k: string | null) {
  return SCENARIOS.find((s) => s.key === k);
}
