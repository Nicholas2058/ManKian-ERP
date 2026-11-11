import type { DbState } from '@/domain/state';

/**
 * Repository seam. The demo ships with a browser IndexedDB implementation (per device,
 * not shared, not secure). A future Cloudflare D1 implementation would implement the
 * same interface behind authenticated Pages Functions — never exposing D1 to the browser.
 */
export interface DataRepository {
  readonly kind: 'indexeddb' | 'memory' | 'd1';
  load(): Promise<DbState | null>;
  replaceAll(state: DbState): Promise<void>;
  /** Persist the records that changed between two immutable states in ONE transaction. */
  applyDiff(prev: DbState, next: DbState): Promise<void>;
  clear(): Promise<void>;
}
