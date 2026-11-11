import type { DbState } from '@/domain/state';
import type { DataRepository } from './types';

/**
 * FUTURE Cloudflare D1 adapter — DISABLED by default and not used by the demo.
 *
 * Production design (see integrations/d1-prototype/README.md):
 *  - The browser never talks to D1 directly. It calls authenticated Pages Functions under /api/*.
 *  - Functions verify the session, enforce server-side role permissions, and run the same
 *    domain commands with parameterised D1 queries inside a transaction (D1 batch).
 *  - Commands are sent as intents (e.g. POST /api/commands { name: 'approvePriceChange', args })
 *    rather than raw table diffs, so the server re-validates every business rule.
 */
export class D1ApiRepository implements DataRepository {
  readonly kind = 'd1' as const;
  constructor(private baseUrl = '/api') {}

  private notConfigured(): never {
    throw new Error(
      `D1 repository is not configured. The demo uses browser IndexedDB. To enable a shared backend, deploy the Pages Functions in integrations/d1-prototype with authentication, then set VITE_DATA_BACKEND=d1. (${this.baseUrl})`,
    );
  }
  async load(): Promise<DbState | null> {
    return this.notConfigured();
  }
  async replaceAll(): Promise<void> {
    return this.notConfigured();
  }
  async applyDiff(): Promise<void> {
    return this.notConfigured();
  }
  async clear(): Promise<void> {
    return this.notConfigured();
  }
}
