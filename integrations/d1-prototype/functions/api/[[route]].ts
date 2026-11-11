/**
 * PROTOTYPE Cloudflare Pages Function — NOT deployed (lives outside the root /functions folder).
 *
 * To evaluate it in a separate environment:
 *   1. Create a D1 database and apply ../schema.sql.
 *   2. Put real authentication in front (e.g. Cloudflare Access) and map the verified identity to app_user.
 *   3. Copy this folder to /functions, bind the database as `DB`, and keep the demo build isolated.
 *
 * Principles shown here: the browser never talks to D1 directly; every request is authenticated;
 * role checks run on the server; queries are parameterised; multi-step writes use db.batch().
 */
interface Env {
  DB: D1Database;
}

// Minimal type shims so this file type-checks without @cloudflare/workers-types.
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}
type PagesFunction<E> = (ctx: { request: Request; env: E; params: Record<string, string | string[]> }) => Promise<Response>;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function currentUser(request: Request, env: Env) {
  // Cloudflare Access forwards a verified email header when the app is protected by Access.
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (!email) return null;
  return env.DB.prepare('SELECT id, role FROM app_user WHERE email = ?1 AND active = 1').bind(email).first<{ id: string; role: string }>();
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const user = await currentUser(request, env);
  if (!user) return json({ error: 'unauthenticated' }, 401);
  const route = ([] as string[]).concat(params.route ?? []).join('/');

  if (request.method === 'GET' && route === 'products') {
    const { results } = await env.DB.prepare('SELECT id, sku, name, base_uom, list_price_sen, status FROM product WHERE status = ?1 ORDER BY sku LIMIT 500').bind('active').all();
    return json(results);
  }

  if (request.method === 'POST' && route === 'price-changes/approve') {
    if (!['owner', 'sales_manager'].includes(user.role)) return json({ error: 'forbidden' }, 403);
    const body = (await request.json()) as { changeId: string; priceSen: number; note?: string };
    if (!body.changeId || !Number.isInteger(body.priceSen) || body.priceSen <= 0) return json({ error: 'invalid' }, 400);
    const ch = await env.DB.prepare('SELECT product_id, new_cost_sen, status FROM price_change WHERE id = ?1').bind(body.changeId).first<{ product_id: string; new_cost_sen: number; status: string }>();
    if (!ch || ch.status !== 'pending') return json({ error: 'not pending' }, 409);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE price_change SET status = 'approved', proposed_price_sen = ?1, decided_by = ?2, decided_at = ?3 WHERE id = ?4 AND status = 'pending'").bind(body.priceSen, user.id, now, body.changeId),
      env.DB.prepare('UPDATE product SET cost_sen = ?1, list_price_sen = ?2, updated_at = ?3 WHERE id = ?4').bind(ch.new_cost_sen, body.priceSen, now, ch.product_id),
      env.DB.prepare('INSERT INTO audit_event (id, at, user_id, action, entity_type, entity_id, summary, reason) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)').bind(crypto.randomUUID(), now, user.id, 'price.approved', 'product', ch.product_id, `Approved ${body.changeId}`, body.note ?? null),
    ]);
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
};
