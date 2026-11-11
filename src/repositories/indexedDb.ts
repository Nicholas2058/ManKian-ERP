import Dexie, { type Table } from 'dexie';
import { TABLE_NAMES, type DbState, type TableName } from '@/domain/state';
import type { BusinessConfig } from '@/domain/types';
import type { DataRepository } from './types';

/** Secondary indexes for the most-queried tables (future-proofing for server queries). */
const INDEXES: Partial<Record<TableName, string>> = {
  products: 'id, sku, categoryId, status',
  quotes: 'id, status, customerId, createdAt',
  salesOrders: 'id, status, customerId, createdAt',
  invoices: 'id, customerId, dueDate, status',
  movements: 'id, productId, at, type',
  audit: 'id, at, entityId, action',
  binStock: 'id, productId, binId',
  reservations: 'id, productId, orderId, status',
  priceChanges: 'id, productId, status',
  priceHistory: 'id, productId, effectiveFrom',
  costVersions: 'id, productId, status',
  purchaseOrders: 'id, supplierId, status',
  deliveryOrders: 'id, orderId, status',
  enquiries: 'id, status, channel',
  approvals: 'id, status, type',
  notifications: 'id, at, read',
};

class ErpDexie extends Dexie {
  meta!: Table<BusinessConfig, string>;
  constructor(name: string) {
    super(name);
    const schema: Record<string, string> = { meta: 'id' };
    for (const t of TABLE_NAMES) schema[t] = INDEXES[t] ?? 'id';
    // Version strategy: bump the Dexie version when indexes change; data-shape changes are
    // handled by BusinessConfig.dataVersion + migrations in store/db.ts.
    this.version(1).stores(schema);
  }
}

export class IndexedDbRepository implements DataRepository {
  readonly kind = 'indexeddb' as const;
  private db: ErpDexie;
  constructor(name = 'mk-erp-demo') {
    this.db = new ErpDexie(name);
  }

  private table(t: TableName) {
    return this.db.table(t);
  }

  async load(): Promise<DbState | null> {
    const config = await this.db.meta.get('config');
    if (!config) return null;
    const state = { config } as DbState;
    await this.db.transaction('r', [this.db.meta, ...TABLE_NAMES.map((t) => this.table(t))], async () => {
      for (const t of TABLE_NAMES) {
        const rows = (await this.table(t).toArray()) as { id: string }[];
        const rec: Record<string, unknown> = {};
        for (const r of rows) rec[r.id] = r;
        (state as unknown as Record<string, unknown>)[t] = rec;
      }
    });
    return state;
  }

  async replaceAll(state: DbState): Promise<void> {
    await this.db.transaction('rw', [this.db.meta, ...TABLE_NAMES.map((t) => this.table(t))], async () => {
      await this.db.meta.clear();
      for (const t of TABLE_NAMES) {
        await this.table(t).clear();
        const rows = Object.values(state[t] as Record<string, unknown>);
        if (rows.length) await this.table(t).bulkPut(rows);
      }
      await this.db.meta.put(state.config);
    });
  }

  async applyDiff(prev: DbState, next: DbState): Promise<void> {
    const changed = TABLE_NAMES.filter((t) => prev[t] !== next[t]);
    const configChanged = prev.config !== next.config;
    if (!changed.length && !configChanged) return;
    await this.db.transaction('rw', [this.db.meta, ...changed.map((t) => this.table(t))], async () => {
      for (const t of changed) {
        const a = prev[t] as Record<string, unknown>;
        const b = next[t] as Record<string, unknown>;
        const puts: unknown[] = [];
        const dels: string[] = [];
        for (const id in b) if (a[id] !== b[id]) puts.push(b[id]);
        for (const id in a) if (!(id in b)) dels.push(id);
        if (puts.length) await this.table(t).bulkPut(puts);
        if (dels.length) await this.table(t).bulkDelete(dels);
      }
      if (configChanged) await this.db.meta.put(next.config);
    });
  }

  async clear(): Promise<void> {
    await this.db.transaction('rw', [this.db.meta, ...TABLE_NAMES.map((t) => this.table(t))], async () => {
      await this.db.meta.clear();
      for (const t of TABLE_NAMES) await this.table(t).clear();
    });
  }
}

/** Fallback when IndexedDB is unavailable (e.g. some private browsing modes). */
export class MemoryRepository implements DataRepository {
  readonly kind = 'memory' as const;
  private state: DbState | null = null;
  async load() {
    return this.state;
  }
  async replaceAll(s: DbState) {
    this.state = s;
  }
  async applyDiff(_p: DbState, n: DbState) {
    this.state = n;
  }
  async clear() {
    this.state = null;
  }
}
