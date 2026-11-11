import { create } from 'zustand';
import { produce, current, isDraft, setAutoFreeze } from 'immer';
import { DATA_VERSION, DomainError, type Ctx, type DbState } from '@/domain/state';
import { ROLES } from '@/domain/roles';
import { expireQuotes } from '@/domain/commands/sales';
import type { DataRepository } from '@/repositories/types';
import { IndexedDbRepository, MemoryRepository } from '@/repositories/indexedDb';
import { useSession } from './session';

setAutoFreeze(true);

interface DbStore {
  db: DbState | null;
  status: 'loading' | 'seeding' | 'ready' | 'error';
  error?: string;
  repoKind: DataRepository['kind'];
  version: number;
  persistError?: string;
  needsReset?: boolean;
  undo?: { prev: DbState; label: string; version: number };
}

export const useDbStore = create<DbStore>(() => ({ db: null, status: 'loading', repoKind: 'indexeddb', version: 0 }));

let repo: DataRepository = new MemoryRepository();
let persistChain: Promise<void> = Promise.resolve();

/** Whole immutable state. Derive with useMemo([db]) in components. */
export function useDbState(): DbState {
  return useDbStore((s) => s.db!) as DbState;
}

export function getDb(): DbState {
  const db = useDbStore.getState().db;
  if (!db) throw new Error('Database not loaded');
  return db;
}

export function currentCtx(): Ctx {
  const role = useSession.getState().role;
  return { now: new Date().toISOString(), actor: { name: ROLES[role].persona, role } };
}

function finalize<T>(x: T): T {
  if (isDraft(x)) return current(x as never) as T;
  if (Array.isArray(x)) return x.map(finalize) as unknown as T;
  if (x && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) o[k] = finalize(v);
    return o as T;
  }
  return x;
}

function persist(prev: DbState, next: DbState) {
  persistChain = persistChain
    .then(() => repo.applyDiff(prev, next))
    .then(() => {
      if (useDbStore.getState().persistError) useDbStore.setState({ persistError: undefined });
    })
    .catch((e: unknown) => {
      console.error('Persist failed', e);
      useDbStore.setState({ persistError: e instanceof Error ? e.message : String(e) });
    });
  return persistChain;
}

/**
 * Run a domain command against the single source of truth. The command mutates an Immer
 * draft; only changed records are persisted, atomically, in one IndexedDB transaction.
 * Throws DomainError for business-rule violations (UI shows them as toasts).
 */
export function run<A, R>(fn: (db: DbState, ctx: Ctx, args: A) => R, args: A, opts: { undo?: string; ctx?: Partial<Ctx> } = {}): R {
  const st = useDbStore.getState();
  const prev = st.db;
  if (!prev) throw new DomainError('Data is still loading.');
  const ctx = { ...currentCtx(), ...opts.ctx };
  let result!: R;
  const next = produce(prev, (draft) => {
    result = finalize(fn(draft as DbState, ctx, args));
  });
  if (next !== prev) {
    const version = st.version + 1;
    useDbStore.setState({ db: next, version, undo: opts.undo ? { prev, label: opts.undo, version } : st.undo && st.undo.version === st.version ? undefined : st.undo });
    void persist(prev, next);
  }
  return result;
}

export function canUndo() {
  const s = useDbStore.getState();
  return !!s.undo && s.undo.version === s.version;
}

export function undoLast(): string | null {
  const s = useDbStore.getState();
  if (!s.undo || s.undo.version !== s.version || !s.db) return null;
  const cur = s.db;
  const prev = s.undo.prev;
  useDbStore.setState({ db: prev, version: s.version + 1, undo: undefined });
  void persist(cur, prev);
  return s.undo.label;
}

/** Simple forward migration registry: dataVersion → upgrade function. */
const MIGRATIONS: Record<number, (db: DbState) => DbState> = {
  // e.g. 3: (db) => ({ ...db, config: { ...db.config, newField: default, dataVersion: 4 } }),
};

async function seedFresh(): Promise<DbState> {
  useDbStore.setState({ status: 'seeding' });
  // Seed generation is code-split so the main bundle stays small.
  const { buildSeed } = await import('@/data/seed');
  await new Promise((r) => setTimeout(r, 30));
  return buildSeed({ anchor: new Date().toISOString() });
}

export async function bootDb() {
  try {
    let r: DataRepository;
    try {
      r = new IndexedDbRepository();
      await (r as IndexedDbRepository).load(); // probe
    } catch (e) {
      console.warn('IndexedDB unavailable — using in-memory demo data', e);
      r = new MemoryRepository();
    }
    repo = r;
    let db = await repo.load();
    let needsReset = false;
    if (db && db.config.dataVersion !== DATA_VERSION) {
      let v = db.config.dataVersion;
      while (v < DATA_VERSION && MIGRATIONS[v]) {
        db = MIGRATIONS[v](db);
        v = db.config.dataVersion;
      }
      if (db.config.dataVersion !== DATA_VERSION) needsReset = true; // keep user data; offer reset
    }
    if (!db) {
      db = await seedFresh();
      await repo.replaceAll(db);
    }
    useDbStore.setState({ db, status: 'ready', repoKind: repo.kind, needsReset, version: 1 });
    // housekeeping: expire lapsed quotes
    run(expireQuotes, undefined as never);
  } catch (e) {
    console.error(e);
    useDbStore.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

export async function resetDemo() {
  const db = await seedFresh();
  await persistChain;
  await repo.replaceAll(db);
  useDbStore.setState({ db, status: 'ready', version: useDbStore.getState().version + 1, undo: undefined, needsReset: false });
}

export function exportSnapshot(): string {
  const db = getDb();
  return JSON.stringify({ format: 'mk-erp-demo-snapshot', dataVersion: DATA_VERSION, exportedAt: new Date().toISOString(), db });
}

export async function importSnapshot(text: string) {
  let parsed: { format?: string; dataVersion?: number; db?: DbState };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DomainError('File is not valid JSON.');
  }
  if (parsed.format !== 'mk-erp-demo-snapshot' || !parsed.db?.config) throw new DomainError('Not an MK ERP demo snapshot file.');
  if (parsed.dataVersion !== DATA_VERSION) throw new DomainError(`Snapshot data version ${parsed.dataVersion} does not match this app (${DATA_VERSION}).`);
  await persistChain;
  await repo.replaceAll(parsed.db);
  useDbStore.setState({ db: parsed.db, version: useDbStore.getState().version + 1, undo: undefined });
}

export function repoKind() {
  return repo.kind;
}
