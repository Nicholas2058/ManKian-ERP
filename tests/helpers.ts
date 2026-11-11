import { produce } from 'immer';
import { buildSeed, pid } from '@/data/seed';
import type { Ctx, DbState } from '@/domain/state';
import type { RoleKey } from '@/domain/types';
import { ROLES } from '@/domain/roles';

export const ANCHOR = '2026-11-11T06:30:00.000Z';
let cached: DbState | null = null;

/** Fresh, frozen copy of the deterministic seed (cached build). */
export function seed(): DbState {
  if (!cached) cached = produce(buildSeed({ anchor: ANCHOR, seed: 20261111 }), () => {});
  return cached;
}

export function ctx(role: RoleKey = 'owner', at = ANCHOR): Ctx {
  return { now: at, actor: { name: ROLES[role].persona, role } };
}

/** Run a command immutably like the app store does. */
export function exec<A, R>(db: DbState, fn: (d: DbState, c: Ctx, a: A) => R, args: A, c: Ctx = ctx()): { db: DbState; r: R } {
  let r!: R;
  const next = produce(db, (d) => {
    r = fn(d as DbState, c, args);
    // detach results from the draft
    r = JSON.parse(JSON.stringify(r ?? null));
  });
  return { db: next, r };
}

export { pid };
