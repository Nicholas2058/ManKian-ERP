# Deployment — Cloudflare Pages (Free plan)

The demo is a **static single-page app**. `npm run build` writes everything to `dist/`; there is no server runtime, no database service and no secret required. All data lives in each visitor's browser (IndexedDB).

## Option A — Git integration (recommended)

1. Push this repository to GitHub or GitLab (branch **`main`**).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select the repository.
3. Build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | None (or "Vite") |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(repository root)* |
   | Environment variables | **none required** (Node version comes from `.node-version` = 22; you may also set `NODE_VERSION=22`) |

4. **Save and Deploy.** The site is served at `https://<project>.pages.dev`. Every push to `main` redeploys; pull requests get preview URLs.
5. *(Optional)* **Custom domain:** project → Custom domains → add, e.g. `erp-demo.example.com`.

`npm run build` runs `tsc --noEmit` first, so a type error fails the build instead of shipping.

## Option B — Direct upload with Wrangler

```bash
npm ci
npm run build
npx wrangler pages deploy dist --project-name mk-hardware-erp-demo --branch main
```

(`wrangler login` is needed the first time. No `wrangler.toml` is required for a static Pages project.)

## SPA routing (deep links / refresh)

Cloudflare Pages treats a project **without a top-level `404.html`** as a single-page application: any unknown path (e.g. `/quotes/qt_1a`, `/warehouse?grn=…`) is served `index.html`, and React Router renders the right screen. This build deliberately ships **no `404.html`** and **no catch-all `_redirects`** rule. A catch-all rewrite is unnecessary, and it would intercept `/api/*` if Pages Functions were added later. Unknown routes inside the app show a friendly in-app "not found" page.

## Headers

`public/_headers` is copied to `dist/` and applied by Pages:

- `X-Robots-Tag: noindex, nofollow` (plus `robots.txt`) — the demo should not be indexed.
- Basic security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` allowing the camera only for this origin's barcode scanner).
- Long-lived immutable caching for hashed `/assets/*`; `index.html` is not cached, so new deployments show up immediately.

## Protecting the demo URL

A static site cannot hide its JavaScript or demo data, and anyone with the URL can open it. That is acceptable because everything is fictional. To limit who can see it, put the project behind **Cloudflare Access** (Zero Trust → Access → Applications → add the `*.pages.dev` / custom domain, allow specific emails). The free tier covers small teams. Never put real prices, customers or credentials into this demo.

## Verifying a deployment

1. Open the URL in a private window. The splash screen generates demo data, then onboarding appears.
2. Refresh a deep link such as `/pricing?tab=shock` and confirm it loads, not a 404.
3. Run a scenario from **Demo Tour**, refresh, and confirm the data persisted.
4. Open the 3D warehouse; on a phone it defaults to the 2D floor plan.

## Optional integrations (not needed for the demo)

| Item | Status | Notes |
|---|---|---|
| Reference FX (Frankfurter) | Optional, client-side | Settings → Integrations → Fetch. Cached daily, clearly labelled, never applied to approved costs/prices. Falls back to a synthetic rate offline. |
| MapLibre delivery map | Not enabled | Needs a licensed tile provider and `VITE_MAP_STYLE_URL`. Core delivery works with the built-in schematic. |
| Shared backend (D1) | Disabled prototype | `integrations/d1-prototype/` holds a schema and an example Pages Function. It is **outside** the root `functions/` folder, so it is **not deployed**. Before enabling: add authentication (e.g. Cloudflare Access), enforce roles on the server, use parameterised queries / `db.batch()`, and keep the public demo isolated from any privileged API. |
| WhatsApp, LHDN MyInvois, accounting, NEWPAGES website | Not connected | Require the client's explicit permission and credentials. See `ASSUMPTIONS_AND_PRODUCTION_GAPS.md`. |

## CI

`.github/workflows/ci.yml` runs type-check, unit tests, build and the Playwright critical flows on Node 22. It needs no secrets and fits free GitHub Actions minutes. Cloudflare builds independently of CI.

## Deployment status

This repository has **not** been deployed by the build agent: no Cloudflare credentials were available. The production build was verified locally (`npm run build` + `npm run preview` + Playwright against the preview server). Use Option A or B above to publish.
