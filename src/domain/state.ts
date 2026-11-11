import type * as T from './types';

/** Every persisted collection, keyed by table name. */
export interface Tables {
  categories: T.Category;
  brands: T.Brand;
  products: T.Product;
  priceRules: T.PriceRule;
  costVersions: T.CostVersion;
  priceHistory: T.PriceHistory;
  priceChanges: T.PriceChange;
  priceBatches: T.PriceBatch;
  agreements: T.CustomerPriceAgreement;
  suppliers: T.Supplier;
  supplierProducts: T.SupplierProduct;
  supplierQuotes: T.SupplierQuote;
  requisitions: T.PurchaseRequisition;
  purchaseOrders: T.PurchaseOrder;
  goodsReceipts: T.GoodsReceipt;
  purchaseBills: T.PurchaseBill;
  warehouses: T.Warehouse;
  zones: T.Zone;
  racks: T.Rack;
  bins: T.Bin;
  binStock: T.BinStock;
  reservations: T.Reservation;
  movements: T.InventoryMovement;
  customers: T.Customer;
  enquiries: T.Enquiry;
  rfqs: T.RFQ;
  quotes: T.Quote;
  approvals: T.Approval;
  salesOrders: T.SalesOrder;
  backorders: T.Backorder;
  picklists: T.Picklist;
  deliveryOrders: T.DeliveryOrder;
  vehicles: T.Vehicle;
  drivers: T.Driver;
  invoices: T.Invoice;
  payments: T.Payment;
  creditNotes: T.CreditNote;
  returns: T.ReturnRequest;
  posSales: T.PosSale;
  audit: T.AuditEvent;
  notifications: T.AppNotification;
}

export type TableName = keyof Tables;

export const TABLE_NAMES: TableName[] = [
  'categories', 'brands', 'products', 'priceRules', 'costVersions', 'priceHistory', 'priceChanges', 'priceBatches', 'agreements',
  'suppliers', 'supplierProducts', 'supplierQuotes', 'requisitions', 'purchaseOrders', 'goodsReceipts', 'purchaseBills',
  'warehouses', 'zones', 'racks', 'bins', 'binStock', 'reservations', 'movements',
  'customers', 'enquiries', 'rfqs', 'quotes', 'approvals', 'salesOrders', 'backorders', 'picklists', 'deliveryOrders', 'vehicles', 'drivers',
  'invoices', 'payments', 'creditNotes', 'returns', 'posSales', 'audit', 'notifications',
];

export type DbState = { [K in TableName]: Record<T.ID, Tables[K]> } & { config: T.BusinessConfig };

export function emptyState(config: T.BusinessConfig): DbState {
  const s = { config } as DbState;
  for (const t of TABLE_NAMES) (s as unknown as Record<string, unknown>)[t] = {};
  return s;
}

/** Context passed to every domain command. */
export interface Ctx {
  now: T.ISO;
  actor: T.Actor;
  /** Suppress notifications (used while generating seed history). */
  silent?: boolean;
}

export class DomainError extends Error {
  constructor(message: string, public code = 'domain', public meta?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
  }
}

export const DATA_VERSION = 3;
