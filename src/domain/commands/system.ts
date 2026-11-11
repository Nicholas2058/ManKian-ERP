import type { BusinessConfig, ID } from '../types';
import type { Ctx, DbState } from '../state';
import { audit, requirePerm } from './helpers';

export function markNotificationsRead(db: DbState, _ctx: Ctx, a: { ids?: ID[] }) {
  for (const n of Object.values(db.notifications)) if (!a.ids || a.ids.includes(n.id)) n.read = true;
}

export function updateConfig(db: DbState, ctx: Ctx, a: { patch: Partial<Omit<BusinessConfig, 'id' | 'seq' | 'sequences'>> }) {
  requirePerm(ctx, 'settings.edit');
  const changes = Object.entries(a.patch)
    .filter(([k, v]) => JSON.stringify((db.config as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v))
    .map(([k, v]) => ({ field: k, from: JSON.stringify((db.config as unknown as Record<string, unknown>)[k]), to: JSON.stringify(v) }));
  Object.assign(db.config, a.patch);
  audit(db, ctx, { action: 'settings.updated', entityType: 'settings', entityId: 'config', summary: `Business settings updated (${changes.map((c) => c.field).join(', ')})`, changes });
}

export function setFxRates(db: DbState, ctx: Ctx, a: { usdMyr: number; cnyMyr?: number; source: string; synthetic: boolean }) {
  db.config.fx = { usdMyr: a.usdMyr, cnyMyr: a.cnyMyr ?? db.config.fx.cnyMyr, source: a.source, retrievedAt: ctx.now, synthetic: a.synthetic };
  audit(db, ctx, { action: 'fx.updated', entityType: 'settings', entityId: 'fx', summary: `Reference FX USD/MYR ${a.usdMyr.toFixed(4)} from ${a.source} (reference only — no prices changed)` });
}

/** Generic activity entry (e.g. simulated send, copied message, printed document). */
export function logActivity(db: DbState, ctx: Ctx, a: { entityType: string; entityId: string; entityRef?: string; action: string; summary: string }) {
  audit(db, ctx, { action: a.action, entityType: a.entityType, entityId: a.entityId, entityRef: a.entityRef, summary: a.summary });
}
