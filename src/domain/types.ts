/**
 * Normalised domain entities for the MK Hardware ERP demo.
 * All monetary values are integer sen. All quantities on stock records are in the
 * product's BASE unit of measure; document lines keep the selling UOM + factor snapshot.
 * Everything here is illustrative demo data — not the client's real records.
 */
import type { Sen } from '@/lib/money';

export type ID = string;
export type ISO = string;
export type { Sen };

export type UomCode =
  | 'PCS' | 'BOX' | 'CTN' | 'BAG' | 'LEN' | 'M' | 'ROLL' | 'DRUM' | 'L' | 'KG' | 'TONNE' | 'PALLET' | 'SET' | 'PAIR' | 'SHEET';

export type RoleKey =
  | 'owner' | 'sales_manager' | 'sales_exec' | 'procurement' | 'wh_supervisor' | 'picker' | 'dispatcher' | 'finance' | 'cashier';

export type CustomerTier = 'walkin' | 'trade' | 'contractor' | 'key' | 'project';

export type ArtKey =
  | 'pipe' | 'elbow' | 'tee' | 'valve' | 'tank' | 'anchor' | 'bolt' | 'ubolt' | 'angle' | 'beam' | 'channel' | 'paver' | 'block' | 'pad'
  | 'geotextile' | 'mesh' | 'roof' | 'bag' | 'board' | 'barrier' | 'helmet' | 'gloves' | 'vest' | 'cone' | 'harness' | 'netting' | 'mask'
  | 'drill' | 'grinder' | 'saw' | 'hammer' | 'spanner' | 'tape' | 'level' | 'screwdriver' | 'pliers' | 'sealant' | 'pail' | 'drum'
  | 'spray' | 'cable' | 'lamp' | 'fan' | 'socket' | 'box' | 'shelf' | 'ladder' | 'disc' | 'bits' | 'platform' | 'lock' | 'hose' | 'wheelbarrow';

export interface Actor {
  name: string;
  role: RoleKey;
}

// ───────────────────────── Catalog ─────────────────────────
export interface Category {
  id: ID;
  code: string;
  name: string;
  icon: string;
  sort: number;
}

export interface Brand {
  id: ID;
  name: string;
  origin: string;
  /** Public product brand (names only; no official specs or prices implied). */
  publicBrand: boolean;
}

export interface UomConversion {
  uom: UomCode;
  /** Number of BASE units in one of this UOM. Product-specific; never global. */
  factor: number;
}

export interface Product {
  id: ID;
  sku: string;
  name: string;
  familyId?: ID;
  familyName?: string;
  variantLabel?: string;
  categoryId: ID;
  brandId: ID;
  baseUom: UomCode;
  uoms: UomConversion[];
  specs: Record<string, string>;
  description: string;
  art: ArtKey;
  barcode: string;
  weightKg: number;
  status: 'active' | 'discontinued';
  preferredSupplierId: ID;
  leadTimeDays: number;
  reorderPoint: number;
  reorderQty: number;
  volatility: 'low' | 'medium' | 'high';
  abc: 'A' | 'B' | 'C';
  /** Approved costing basis per base unit (landed). */
  cost: Sen;
  /** Previous approved cost per base unit (for change display). */
  previousCost: Sen;
  /** Most recent supplier cost signal per base unit (may still be pending approval). */
  latestCost: Sen;
  latestCostAt: ISO;
  latestCostSupplierId: ID;
  /** Approved list (walk-in) selling price per base unit. */
  basePrice: Sen;
  priceEffectiveFrom: ISO;
  pendingChangeId?: ID;
  ruleId?: ID;
  watch: boolean;
  substitutes: ID[];
  datasheets: { name: string; sizeKb: number }[];
  createdAt: ISO;
  updatedAt: ISO;
}

// ───────────────────────── Pricing ─────────────────────────
export interface PriceRule {
  id: ID;
  name: string;
  scope: 'global' | 'category' | 'product';
  scopeId?: ID;
  method: 'margin' | 'markup' | 'fixed';
  targetMarginPct: number;
  markupPct: number;
  fixedPrice?: Sen;
  /** Minimum gross margin before manager approval is required. */
  minMarginPct: number;
  /** Discount off list price per customer tier (%). */
  tierDiscountPct: Record<CustomerTier, number>;
  /** Volume discount breaks in BASE units. */
  bulkBreaks: { minQty: number; discountPct: number }[];
  /** Optional freight add-on per base unit for delivered quotes. */
  freightPerUnit: Sen;
  /** Price ending increment in sen (e.g. 5 = round up to 5 sen). */
  roundingSen: number;
  /** A selling price change larger than this % needs manager approval. */
  approvalChangePct: number;
  active: boolean;
  updatedAt: ISO;
  updatedBy: string;
}

export type CostSource = 'seed' | 'supplier_list' | 'csv' | 'shock' | 'grn' | 'manual' | 'rollback' | 'fx';

export interface CostVersion {
  id: ID;
  productId: ID;
  supplierId: ID;
  supplierCost: Sen;
  freight: Sen;
  handling: Sen;
  fxPct: number;
  landedCost: Sen;
  effectiveFrom: ISO;
  source: CostSource;
  status: 'active' | 'proposed' | 'superseded' | 'rejected';
  changeId?: ID;
  createdAt: ISO;
  createdBy: string;
  note?: string;
}

export interface PriceHistory {
  id: ID;
  productId: ID;
  basePrice: Sen;
  cost: Sen;
  effectiveFrom: ISO;
  changeId?: ID;
  reason: string;
  by: string;
  kind: 'seed' | 'approved_change' | 'rollback' | 'manual';
}

export interface PriceChange {
  id: ID;
  number: string;
  productId: ID;
  batchId?: ID;
  source: CostSource;
  supplierId?: ID;
  oldCost: Sen;
  newCost: Sen;
  oldPrice: Sen;
  suggestedPrice: Sen;
  proposedPrice: Sen;
  costVersionId?: ID;
  effectiveFrom: ISO;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  approvalId?: ID;
  createdAt: ISO;
  createdBy: string;
  decidedAt?: ISO;
  decidedBy?: string;
  decisionNote?: string;
}

export interface PriceBatch {
  id: ID;
  number: string;
  fileName: string;
  createdAt: ISO;
  createdBy: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  changeIds: ID[];
  effectiveFrom: ISO;
  status: 'pending' | 'approved' | 'partially_approved' | 'rejected';
}

export interface CustomerPriceAgreement {
  id: ID;
  customerId: ID;
  productId?: ID;
  categoryId?: ID;
  kind: 'fixed' | 'discount';
  /** Fixed price per base unit. */
  fixedPrice?: Sen;
  discountPct?: number;
  validFrom: ISO;
  validTo: ISO;
  locked: boolean;
  reference: string;
}

// ───────────────────────── Suppliers / Procurement ─────────────────────────
export interface Supplier {
  id: ID;
  code: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  currency: 'MYR' | 'USD' | 'CNY';
  paymentTermsDays: number;
  leadTimeDays: number;
  onTimePct: number;
  qualityScore: number;
  categoryIds: ID[];
  status: 'active' | 'on_hold';
  isImport: boolean;
  notes?: string;
}

export interface SupplierProduct {
  id: ID;
  supplierId: ID;
  productId: ID;
  supplierSku: string;
  /** Supplier list cost per base unit (MYR). */
  cost: Sen;
  moq: number;
  leadTimeDays: number;
  availableQty: number;
  validUntil: ISO;
}

export interface SupplierQuoteLine {
  productId: ID;
  unitCost: Sen;
  moq: number;
  leadTimeDays: number;
  availableQty: number;
  specCompliant: boolean;
  note?: string;
}

export interface SupplierQuote {
  id: ID;
  number: string;
  requisitionId: ID;
  supplierId: ID;
  lines: SupplierQuoteLine[];
  validUntil: ISO;
  receivedAt: ISO;
  status: 'received' | 'selected' | 'declined';
  simulated: true;
}

export interface RequisitionLine {
  id: ID;
  productId: ID;
  qty: number;
}

export interface PurchaseRequisition {
  id: ID;
  number: string;
  lines: RequisitionLine[];
  reason: string;
  sourceType: 'low_stock' | 'backorder' | 'manual' | 'reorder';
  sourceRef?: ID;
  status: 'open' | 'quoting' | 'ordered' | 'cancelled';
  createdAt: ISO;
  createdBy: string;
  neededBy: ISO;
  supplierQuoteIds: ID[];
  selectedQuoteId?: ID;
  poId?: ID;
}

export interface POLine {
  id: ID;
  productId: ID;
  /** Ordered quantity in base units. */
  qty: number;
  /** Cost per base unit. */
  unitCost: Sen;
  received: number;
  damaged: number;
}

export type POStatus = 'draft' | 'sent' | 'acknowledged' | 'partial' | 'received' | 'closed' | 'cancelled';

export interface PurchaseOrder {
  id: ID;
  number: string;
  supplierId: ID;
  requisitionId?: ID;
  status: POStatus;
  lines: POLine[];
  createdAt: ISO;
  orderedAt?: ISO;
  acknowledgedAt?: ISO;
  expectedAt: ISO;
  closedAt?: ISO;
  freight: Sen;
  notes?: string;
  createdBy: string;
  delayReason?: string;
  grnIds: ID[];
  billId?: ID;
}

export interface GRNLine {
  poLineId: ID;
  productId: ID;
  qty: number;
  damaged: number;
  binId: ID;
  unitCost: Sen;
}

export interface GoodsReceipt {
  id: ID;
  number: string;
  poId: ID;
  supplierId: ID;
  receivedAt: ISO;
  receivedBy: string;
  lines: GRNLine[];
  note?: string;
  costChangeIds: ID[];
  allocations: { orderId: ID; lineId: ID; qty: number }[];
}

export interface PurchaseBill {
  id: ID;
  number: string;
  poId: ID;
  supplierId: ID;
  billRef: string;
  amount: Sen;
  receivedValue: Sen;
  variance: Sen;
  status: 'matched' | 'variance' | 'paid';
  date: ISO;
}

// ───────────────────────── Warehouse / Inventory ─────────────────────────
export interface Warehouse {
  id: ID;
  code: string;
  name: string;
  note: string;
  width: number;
  depth: number;
}

export interface Zone {
  id: ID;
  code: string;
  name: string;
  kind: 'storage' | 'receiving' | 'dispatch' | 'quarantine' | 'yard';
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Rack {
  id: ID;
  zoneId: ID;
  code: string;
  type: 'cantilever' | 'selective' | 'shelving' | 'floor';
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  levels: number;
  bays: number;
  /** Orientation: rows run along X (0) or Z (90). */
  rotation: 0 | 90;
}

export interface Bin {
  id: ID;
  code: string;
  zoneId: ID;
  rackId?: ID;
  level: number;
  bay: number;
  /** Abstract capacity in "slots" for occupancy display. */
  capacity: number;
  kind: 'rack' | 'floor' | 'staging' | 'dock' | 'quarantine';
}

export interface BinStock {
  id: ID;
  productId: ID;
  binId: ID;
  qty: number;
  status: 'ok' | 'quarantine' | 'damaged';
  lot?: string;
  receivedAt: ISO;
}

export interface Reservation {
  id: ID;
  productId: ID;
  orderId: ID;
  lineId: ID;
  qty: number;
  createdAt: ISO;
  expiresAt?: ISO;
  status: 'active' | 'released' | 'fulfilled';
}

export type MovementType =
  | 'receipt' | 'pick' | 'unpick' | 'dispatch' | 'return' | 'adjustment' | 'transfer' | 'pos_sale' | 'quarantine' | 'release' | 'delivery_return';

export interface InventoryMovement {
  id: ID;
  at: ISO;
  productId: ID;
  type: MovementType;
  /** Change in on-hand quantity (base units). Transfers/picks inside the warehouse are 0. */
  qty: number;
  /** Quantity physically moved (always positive). */
  moved: number;
  fromBinId?: ID;
  toBinId?: ID;
  refType?: string;
  refId?: ID;
  refNumber?: string;
  reason?: string;
  by: string;
  onHandAfter: number;
}

// ───────────────────────── Customers / CRM ─────────────────────────
export interface Contact {
  name: string;
  role: string;
  phone: string;
  email: string;
}

export interface CustomerSite {
  id: ID;
  name: string;
  address: string;
  project?: string;
}

export type CustomerType = 'contractor' | 'renovation' | 'industrial' | 'project' | 'walkin' | 'trade';

export interface Customer {
  id: ID;
  code: string;
  name: string;
  type: CustomerType;
  tier: CustomerTier;
  contacts: Contact[];
  billingAddress: string;
  sites: CustomerSite[];
  creditLimit: Sen;
  paymentTermsDays: number;
  contractValidUntil?: ISO;
  tags: string[];
  notes: { id: ID; at: ISO; by: string; text: string }[];
  createdAt: ISO;
  status: 'active' | 'on_hold';
  /** Placeholder tax fields for e-Invoice readiness (fictional). */
  tin?: string;
  brn?: string;
  phone: string;
  email: string;
}

// ───────────────────────── Enquiries / RFQ ─────────────────────────
export type Channel = 'whatsapp' | 'phone' | 'email' | 'website';

export interface EnquiryMessage {
  id: ID;
  from: 'customer' | 'staff' | 'system';
  text: string;
  at: ISO;
}

export interface ExtractedLine {
  id: ID;
  raw: string;
  productId?: ID;
  alternativeId?: ID;
  qty: number;
  uom: UomCode;
  note?: string;
  confidence: 'high' | 'medium' | 'low' | 'manual';
}

export type EnquiryStatus = 'new' | 'qualified' | 'rfq' | 'quoted' | 'won' | 'lost';

export interface Enquiry {
  id: ID;
  number: string;
  channel: Channel;
  customerId?: ID;
  contactName: string;
  contactPhone: string;
  subject: string;
  status: EnquiryStatus;
  messages: EnquiryMessage[];
  lines: ExtractedLine[];
  siteName?: string;
  requiredBy?: ISO;
  assignedTo: string;
  followUpAt?: ISO;
  activity: { at: ISO; by: string; text: string }[];
  createdAt: ISO;
  updatedAt: ISO;
  rfqId?: ID;
  quoteId?: ID;
  unread: boolean;
  lostReason?: string;
}

export interface RFQLine {
  id: ID;
  productId: ID;
  qty: number;
  uom: UomCode;
  specs?: string;
}

export interface RFQ {
  id: ID;
  number: string;
  enquiryId?: ID;
  customerId: ID;
  siteId?: ID;
  lines: RFQLine[];
  requiredBy: ISO;
  status: 'open' | 'quoted' | 'closed';
  createdAt: ISO;
  createdBy: string;
  quoteId?: ID;
}

// ───────────────────────── Quotations ─────────────────────────
export type QuoteStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'issued' | 'accepted' | 'rejected' | 'expired' | 'converted' | 'cancelled';

export interface QuoteLine {
  id: ID;
  productId: ID;
  description: string;
  qty: number;
  uom: UomCode;
  /** Base units per selling UOM, snapshotted at time of quoting. */
  factor: number;
  /** Unit price per selling UOM before line discount. */
  unitPrice: Sen;
  /** Tier/contract list price per UOM at time of pricing (for override detection). */
  listPrice: Sen;
  /** Cost per selling UOM snapshot. */
  unitCost: Sen;
  discountPct: number;
  priceSource: 'tier' | 'contract' | 'manual' | 'bulk';
  leadTimeDays: number;
  note?: string;
}

export interface QuoteTotals {
  subtotal: Sen;
  discount: Sen;
  freight: Sen;
  tax: Sen;
  total: Sen;
  cost: Sen;
  marginPct: number;
}

export interface QuoteVersion {
  version: number;
  lines: QuoteLine[];
  freight: Sen;
  validityDays: number;
  notes: string;
  terms: string;
  createdAt: ISO;
  createdBy: string;
  reason: string;
  issuedAt?: ISO;
  expiresAt?: ISO;
  /** Once issued, a version is immutable (snapshot). */
  frozen: boolean;
  totals: QuoteTotals;
}

export interface Quote {
  id: ID;
  number: string;
  customerId: ID;
  siteId?: ID;
  rfqId?: ID;
  enquiryId?: ID;
  status: QuoteStatus;
  versions: QuoteVersion[];
  currentVersion: number;
  fulfilment: 'delivery' | 'pickup';
  createdAt: ISO;
  updatedAt: ISO;
  createdBy: string;
  owner: string;
  projectRef?: string;
  recheck?: { kind: 'cost_increase' | 'price_updated'; reason: string; at: ISO; productIds: ID[] };
  contractLocked: boolean;
  approvalIds: ID[];
  orderId?: ID;
  acceptedAt?: ISO;
  closedReason?: string;
  /** Set when an expired quote is revised; re-issue needs manager approval. */
  reissue?: boolean;
  channel?: Channel;
}

// ───────────────────────── Approvals ─────────────────────────
export type ApprovalType =
  | 'price_change' | 'margin_floor' | 'discount' | 'price_override' | 'quote_reissue' | 'credit_override' | 'pos_discount';

export interface Approval {
  id: ID;
  number: string;
  type: ApprovalType;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  refType: 'price_change' | 'quote' | 'order' | 'pos';
  refId: ID;
  refNumber: string;
  title: string;
  detail: string;
  amount?: Sen;
  requestedBy: string;
  requestedAt: ISO;
  requiredRoles: RoleKey[];
  decidedBy?: string;
  decidedAt?: ISO;
  note?: string;
  severity: 'info' | 'warning' | 'critical';
}

// ───────────────────────── Sales orders / fulfilment ─────────────────────────
export interface SalesOrderLine {
  id: ID;
  quoteLineId?: ID;
  productId: ID;
  description: string;
  qty: number;
  uom: UomCode;
  factor: number;
  /** Ordered quantity in base units. */
  qtyBase: number;
  unitPrice: Sen;
  discountPct: number;
  unitCost: Sen;
  /** Quantities below are all in base units. */
  allocated: number;
  picked: number;
  dispatched: number;
  delivered: number;
  invoiced: number;
  promisedDate: ISO;
  backorderQty: number;
  backorderPromisedDate?: ISO;
}

export type OrderStatus =
  | 'pending_credit' | 'confirmed' | 'partially_allocated' | 'allocated' | 'picking' | 'ready'
  | 'partially_dispatched' | 'dispatched' | 'delivered' | 'invoiced' | 'closed' | 'cancelled';

export interface SalesOrder {
  id: ID;
  number: string;
  quoteId?: ID;
  quoteNumber?: string;
  quoteVersion?: number;
  customerId: ID;
  siteId?: ID;
  fulfilment: 'delivery' | 'pickup';
  status: OrderStatus;
  lines: SalesOrderLine[];
  freight: Sen;
  requiredDate: ISO;
  paymentTermsDays: number;
  projectRef?: string;
  createdAt: ISO;
  createdBy: string;
  timeline: { at: ISO; label: string; by: string }[];
  creditStatus: 'ok' | 'pending_override' | 'overridden';
  creditApprovalId?: ID;
  cancelledReason?: string;
}

export interface Backorder {
  id: ID;
  orderId: ID;
  lineId: ID;
  productId: ID;
  qty: number;
  promisedDate: ISO;
  status: 'open' | 'allocated' | 'cancelled';
  createdAt: ISO;
  poId?: ID;
}

export interface PickTask {
  id: ID;
  lineId: ID;
  productId: ID;
  binId: ID;
  qty: number;
  picked: number;
  status: 'open' | 'picked' | 'short';
  discrepancy?: string;
}

export interface Picklist {
  id: ID;
  number: string;
  orderId: ID;
  tasks: PickTask[];
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: ISO;
  assignee: string;
  completedAt?: ISO;
}

export type DOStatus =
  | 'packed' | 'scheduled' | 'out_for_delivery' | 'delivered' | 'failed' | 'ready_for_collection' | 'collected' | 'cancelled';

export interface DeliveryOrder {
  id: ID;
  number: string;
  orderId: ID;
  customerId: ID;
  siteId?: ID;
  type: 'delivery' | 'pickup';
  status: DOStatus;
  lines: { lineId: ID; productId: ID; qty: number }[];
  vehicleId?: ID;
  driverId?: ID;
  scheduledDate: ISO;
  dispatchedAt?: ISO;
  completedAt?: ISO;
  pod?: { signedName: string; at: ISO; photo?: string; note?: string };
  pickupToken?: string;
  failReason?: string;
  createdAt: ISO;
  weightKg: number;
  progress: { at: ISO; label: string }[];
  invoiceId?: ID;
  promisedDate: ISO;
}

export interface Vehicle {
  id: ID;
  plate: string;
  type: string;
  capacityKg: number;
}

export interface Driver {
  id: ID;
  name: string;
  phone: string;
  vehicleId: ID;
}

// ───────────────────────── Finance ─────────────────────────
export interface InvoiceLine {
  id: ID;
  productId: ID;
  description: string;
  qty: number;
  uom: UomCode;
  unitPrice: Sen;
  discountPct: number;
  unitCost: Sen;
  lineTotal: Sen;
  orderLineId?: ID;
}

export interface Invoice {
  id: ID;
  number: string;
  customerId: ID;
  orderId?: ID;
  deliveryOrderId?: ID;
  posSaleId?: ID;
  issueDate: ISO;
  dueDate: ISO;
  lines: InvoiceLine[];
  subtotal: Sen;
  freight: Sen;
  taxLabel: string;
  taxRatePct: number;
  tax: Sen;
  total: Sen;
  cost: Sen;
  paid: Sen;
  credited: Sen;
  status: 'issued' | 'partial' | 'paid' | 'void';
  reminders: { at: ISO; by: string }[];
}

export interface Payment {
  id: ID;
  number: string;
  customerId: ID;
  amount: Sen;
  method: 'bank_transfer' | 'cheque' | 'cash' | 'card' | 'duitnow';
  reference: string;
  receivedAt: ISO;
  allocations: { invoiceId: ID; amount: Sen }[];
  unallocated: Sen;
  recordedBy: string;
}

export interface CreditNote {
  id: ID;
  number: string;
  invoiceId: ID;
  customerId: ID;
  amount: Sen;
  reason: string;
  at: ISO;
}

export interface ReturnRequest {
  id: ID;
  number: string;
  orderId?: ID;
  productId: ID;
  qty: number;
  reason: string;
  status: 'received' | 'credited';
  at: ISO;
  binId: ID;
  condition: 'resaleable' | 'damaged';
}

// ───────────────────────── POS ─────────────────────────
export interface PosLine {
  id: ID;
  productId: ID;
  qty: number;
  uom: UomCode;
  factor: number;
  unitPrice: Sen;
  listPrice: Sen;
  discountPct: number;
  unitCost: Sen;
}

export interface PosSale {
  id: ID;
  number: string;
  status: 'held' | 'completed' | 'converted';
  tier: CustomerTier;
  customerId?: ID;
  lines: PosLine[];
  payMethod?: 'cash' | 'card' | 'bank_transfer' | 'duitnow';
  tendered?: Sen;
  total: Sen;
  at: ISO;
  heldLabel?: string;
  cashier: string;
  invoiceId?: ID;
  quoteId?: ID;
}

// ───────────────────────── System ─────────────────────────
export interface AuditEvent {
  id: ID;
  at: ISO;
  actor: string;
  role: RoleKey;
  action: string;
  entityType: string;
  entityId: ID;
  entityRef?: string;
  summary: string;
  reason?: string;
  changes?: { field: string; from: string; to: string }[];
}

export type NotificationKind = 'pricing' | 'quote' | 'order' | 'stock' | 'procurement' | 'delivery' | 'finance' | 'system';

export interface AppNotification {
  id: ID;
  at: ISO;
  kind: NotificationKind;
  severity: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  body: string;
  link?: string;
  read: boolean;
}

export interface BusinessConfig {
  id: 'config';
  dataVersion: number;
  seededAt: ISO;
  anchorDate: ISO;
  minMarginPct: number;
  targetMarginPct: number;
  quoteValidityOptions: number[];
  defaultValidityDays: number;
  discountApprovalPct: number;
  invoiceOnDelivery: boolean;
  tax: { enabled: boolean; label: string; ratePct: number; note: string };
  reservationHoldDays: number;
  overdueBlockDays: number;
  creditWarnPct: number;
  defaultTerms: string;
  seq: number;
  sequences: Record<string, number>;
  fx: { usdMyr: number; cnyMyr: number; source: string; retrievedAt?: ISO; synthetic: boolean };
  /** Product SKUs used by the guided scenarios. */
  scenario: Record<string, ID>;
}
