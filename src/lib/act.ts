import { toast } from 'sonner';
import { DomainError, type Ctx, type DbState } from '@/domain/state';
import { ROLES } from '@/domain/roles';
import type { RoleKey } from '@/domain/types';
import { run, undoLast } from '@/store/db';
import { useSession } from '@/store/session';

/**
 * Run a domain command from the UI with consistent feedback: success toast (with Undo
 * where safe), rule-violation toasts, and a one-click role switch for permission errors.
 */
export function act<A, R>(
  fn: (db: DbState, ctx: Ctx, args: A) => R,
  args: A,
  opts: { success?: string | ((r: R) => string); undo?: string; quiet?: boolean } = {},
): R | undefined {
  try {
    const r = run(fn, args, { undo: opts.undo });
    const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
    if (msg && !opts.quiet) {
      toast.success(msg, opts.undo ? { action: { label: 'Undo', onClick: () => { const l = undoLast(); if (l) toast.info(`Undone: ${l}`); } } } : undefined);
    }
    // Void commands return `true` so callers can distinguish success (`!== undefined`) from a handled error.
    return (r === undefined ? (true as unknown as R) : r);
  } catch (e) {
    if (e instanceof DomainError) {
      const role = e.meta?.suggestRole as RoleKey | undefined;
      toast.error(e.message, role ? { duration: 8000, action: { label: `Switch to ${ROLES[role].label}`, onClick: () => { useSession.getState().set({ role }); toast.info(`Demo role: ${ROLES[role].label} (${ROLES[role].persona})`); } } } : { duration: 6000 });
    } else {
      console.error(e);
      toast.error(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    }
    return undefined;
  }
}
