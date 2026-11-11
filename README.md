# MK Hardware — Distribution & Dynamic Pricing ERP (Demo)

An interactive, mobile-first ERP **demo** built for a management presentation to **Man Kian Hardware & Trading Sdn Bhd (MK Hardware)**, Puchong, Selangor. It shows how frequent supplier price changes, complex SKUs and UOMs, customer quotations, supplier sourcing, stock visibility and delivery can be controlled in one connected system.

> **Demo disclaimer.** This is not an official MK Hardware system. Every customer, supplier, person, address, price, cost and stock figure is **fictional**. Brand names are public product brands only; no official specifications or prices are implied. Data is stored only in the visitor's browser. The role switcher is a visual simulation, **not security**.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build → dist/
npm run preview    # serve dist/ at http://localhost:4173
npm test           # unit tests (Vitest)
npm run test:e2e   # browser critical flows (Playwright; run `npx playwright install chromium` once)
```

On first load the app generates **90 days of fictional history** in the browser (about 1–2 seconds), then persists it in IndexedDB. Use **Settings → Demo data → Reset** to regenerate it relative to today.

**Node:** works on Node 20.17+ (local) and Node 22 (Cloudflare Pages, pinned in `.node-version`). Vite 6 and Vitest 3 were chosen deliberately because Vite 8 / Vitest 5 require Node ≥ 20.19 / 22.12 and the development machine runs 20.17. Upgrade them once every environment is on Node 22.12+.

---

## What's included

| Module | Highlights |
|---|---|
| **Mission Control** (owner dashboard) | KPIs that recompute for Today / 7 / 30 / 90 days with deltas vs the prior period; sales trend, category mix with margin, quote funnel, orders by stage, supplier cost-change heatmap; pricing exposure (cost updates today, pending approvals, quotes needing review, margin at risk); actionable alerts; today's operations timeline from the audit trail; warehouse mini-map; **Simulate a price shock** CTA |
| **Dynamic Pricing Command Center** (hero) | Searchable price table (supplier cost, previous cost, Δ%, target margin, suggested, approved list, margin @ list, cost sparkline, status); detail panel with formula explanation, tier prices, contract prices, profitability waterfall, price/cost history, cost versions, rollback-as-new-version; **Cost Shock Simulator** (−10% … +35%) with animated cards and impact on draft/issued quotes and RFQs; batch CSV import with validation and approve/reject; approval inbox; rules engine (margin/markup/fixed, floors, tiers, volume breaks, rounding, freight add-on, approval thresholds); change history; confidential price-list export |
| **Product Catalog / PIM** | Card ↔ table views, instant search, facets (category, brand, unit, stock, vendor, volatility, archived); family variant chips; product drawer (specs, UOM conversions, datasheet placeholders, substitutes, sourcing, stock, linked quotes/RFQs); add/edit (React Hook Form + Zod), archive/restore, duplicate variant, watchlist, CSV import with column mapping, export; **BOQ basket → Request quote**; customer-facing preview with **"Price on request"** |
| **Enquiry & RFQ inbox** | Simulated WhatsApp / phone / email / website conversations; rule-based line extraction (quantity + UOM + SKU match with confidence and alternatives); qualify → RFQ → quotation; follow-ups, notes, mark lost; copy WhatsApp draft / open WhatsApp (explicit user action, never auto-sent); customer context panel |
| **Quotation Studio** | Split view (mobile: steps); autocomplete with variant chips and product-specific UOMs; per-line price source (tier / contract / volume / manual), discount, margin and availability with backorder estimate; approval rules; draft → submitted → approved → issued → accepted/rejected/expired → converted; immutable issued snapshots; reprice/revise create new versions; real PDF with DEMO SAMPLE watermark; print preview; copy as message; simulated send; duplicate |
| **Sales orders & allocation** | Board + table; conversion with preserved prices and traceable lines; credit check with override workflow; **explicit** reservation with hold policy; partial allocation + backorders with promised dates; line-level ordered / reserved / picked / dispatched / delivered / invoiced; timeline and linked documents; release / cancel |
| **Procurement** | Reorder suggestions; requisition → 3 simulated supplier quotations → comparison (price, MOQ, lead time, availability, spec compliance, on-time, quality) → PO; send / acknowledge / ETA updates / short-close / cancel; goods receipt with bin put-away, damage to quarantine, backorder allocation, **proposed** cost versions; supplier profiles; PO PDF |
| **Inventory** | On hand / reserved / available / incoming / blocked / staged per product and bin; ledger with filters; adjustments with reasons; transfers; quarantine/release/write-off; customer returns; ABC and slow-moving; mobile picking with barcode/SKU/bin confirmation, short picks, reverse pick; barcode scanner (typed or keyboard wedge, optional camera via BarcodeDetector with explicit permission) |
| **3D Warehouse Explorer** | Three.js / React Three Fiber, lazy-loaded; instanced bins coloured by occupancy / low stock / picking route / receiving; hover tooltips; click a bin to see the same stock as Inventory; animated diagrammatic picking route; GRN arrival animation dock → bin; demo forklift; reset/fit view; mini-map; low-power mode; **accessible 2D floor-plan fallback** (no WebGL, small screens); rack list companion; clearly labelled "Illustrative warehouse layout — not an actual survey" |
| **Delivery & self-pickup** | Dispatch board; vehicle loads vs recorded capacity; schedule / dispatch / simulated route progress / proof of delivery (typed signature, timestamp, photo) / exception & reschedule; self-pickup tokens; DO & collection PDFs; driver mobile view; self-contained service-area schematic (no map tiles) |
| **Customers / CRM** | Directory with credit utilisation; profile with credit position and ageing, scorecard from trade activity, contacts, fictional sites, price agreements, quotes/orders/invoices, notes and tags; create/edit with validation |
| **Counter POS** | Fast search and quick tiles; tier pricing; quantity/UOM/discount; hold/resume; manager discount approval or convert to quotation; simulated cash/card/DuitNow/transfer with change; receipt; stock decrement on completion |
| **Finance** | Receivables and ageing; invoices (auto-generated on delivery/collection per setting) with sample PDF, reminder drafts (copied, never sent), credit notes; payments with oldest-first or manual allocation and duplicate protection; supplier bills with 3-way match; **e-Invoice readiness** preview ("Demo only — no submission to LHDN"); neutral journal CSV export; AutoCount / other adapters shown as **Not connected** |
| **Analytics & insights** | Revenue, weekly margin % (with floor), category share, cost-shock pass-through, margin change by category, product drill-down, inventory turnover proxy, supplier on-time score, quote conversion trend, ageing; KPI/quote CSV and PDF summary; **deterministic Operations Insights** with the rule shown on each; controlled "play demo event" feed |
| **Approvals, settings, audit, tour** | Unified approval inbox routed by role; preferences (theme, density, language, motion, low-power 3D, notifications); configurable business rules, SST configuration, UOMs; role permission matrix; integration status and optional FX reference (Frankfurter, never auto-applied); reset / export / import snapshots; full audit log; first-run onboarding and **six guided, stateful scenarios** with restart |

Cross-cutting: Ctrl/⌘+K command palette, quick "+ New" menu, notifications, role switcher (each role gets its own menu, home screen — Mission Control for Owner / Sales Manager / Finance, a task workspace for everyone else — and permitted actions; see *Settings → Roles*), light theme by default with optional dark mode, Bahasa Melayu / 简体中文 subset with English fallback, reduced-motion support, toasts with Undo for safe actions, confirmation dialogs for destructive actions, responsive drawers and bottom sheets.

---

## Architecture

```
React UI (features/*)  ──act()──▶  store/db.ts  ──produce()──▶  domain/commands/*  (pure business rules)
        ▲                               │                               │
        │ useDbState() (immutable)      │ diff → one IndexedDB txn       ▼
        └───────────────────────────────┴──────────▶ repositories/indexedDb.ts (Dexie)
                                                      repositories/d1Adapter.ts (future, disabled)
```

- **Single source of truth.** One immutable state (`DbState`) holds every table. UI components derive views with `useMemo`; nothing keeps its own copy of stock, prices, quotes or invoices.
- **Domain commands** (`src/domain/commands`) are plain functions that mutate an Immer draft. The same functions generate the seed history, run in unit tests, and power the UI. That is how cross-module consistency is guaranteed: e.g. `receiveGoods` updates bins, PO lines, movements and backorders, and proposes cost versions, all in one call.
- **Persistence.** After each command, only changed records are written to IndexedDB in **one transaction** (`applyDiff`), so a receipt, reservation or payment is atomic. `BusinessConfig.dataVersion` plus a migration registry protect saved data across releases.
- **Money** is stored as integer **sen**; quantities on stock records are in the product's **base UOM**; document lines keep the selling UOM and a factor snapshot.
- **Integrity rules** enforced in commands: available = on hand − blocked − reserved (incoming never counts); quoting never reserves; reservation is explicit with an expiry; no negative stock (backorder instead); partial fulfilment tracked per line; product-specific UOMs only; issued quote versions are frozen; supplier cost updates flag drafts and never touch issued snapshots; every significant change is audited; repeated clicks are idempotent (picklists, dispatch, payments, POS).
- **Code splitting.** Every route is lazy-loaded; Recharts, jsPDF, the 3D scene and the seed generator are separate chunks.

```
src/
  app/            router, providers, navigation config
  components/     ui primitives, layout shell, data-table, charts, product art
  features/       dashboard, pricing, catalog, enquiries, quotes, orders, procurement,
                  inventory, warehouse3d, delivery, crm, pos, finance, analytics,
                  approvals, settings, tour
  domain/         types, state, pricing / inventory / finance rules, KPIs, insights,
                  rule-based parser, roles, commands/*
  data/           reference data (categories, 143 SKUs, fictional suppliers/customers),
                  warehouse layout, deterministic 90-day seed generator, enquiry templates
  repositories/   IndexedDB (Dexie) implementation, in-memory fallback, D1 adapter seam
  services/       PDF (jsPDF), CSV (PapaParse + Zod), FX reference
  store/          db store + command runner, session preferences, BOQ basket
  lib/            money, dates (Asia/Kuala_Lumpur), hooks, helpers
  i18n/           EN (full) + BM / 中文 subset
tests/            Vitest unit tests (pricing, operations, finance, parser, seed integrity)
e2e/              Playwright critical flows
integrations/     d1-prototype (schema + example Pages Function, NOT deployed)
public/           brand/ (official logo files), products/ (client product photos), favicons, _headers (noindex + security headers), robots.txt
```

**Stack:** React 19 · TypeScript (strict) · Vite 6 · React Router 7 · Tailwind CSS 4 · Radix primitives · Lucide · Motion · Recharts · TanStack Table 8 · Zustand · Dexie · Immer · Zod · React Hook Form · date-fns / Intl (MYR, Asia/Kuala_Lumpur) · Three.js + React Three Fiber + Drei · jsPDF + autotable · PapaParse · cmdk · Sonner.

> TanStack Table **v8** is used deliberately (stable, well-known API) rather than the newly released v9.

---

## Demo scenarios

Open **Demo Tour** (sidebar, bottom tab on mobile or the ▷ icon). Each scenario has 4–5 steps, spotlights the area to look at or click (the rest of the screen is greyed out and blocked; Esc or the – button lets you explore freely), ticks steps off when the records change, and can be restarted on clean data.

| | Scenario | What it proves |
|---|---|---|
| A | Daily cost shock | +14% steel cost → proposal → manager approval by role switch → list price, history, audit, dashboard; draft below floor flagged, contract-locked draft honoured, issued quote unchanged |
| B | WhatsApp → quotation → order | Rule-based extraction, RFQ, quote with freight and validity, approval, PDF, acceptance, order, 25 reserved + 15 backordered with promised date |
| C | Procurement → receiving → 3D | Low-stock U-bolt with a backordered order, 3-supplier comparison, PO, partial GRN, 3D arrival, backorder allocated, cost proposed not overwritten |
| D | Dispatch & self-pickup | Mobile picking, delivery with POD and DO PDF, self-pickup with token, partial shipments, timeline |
| E | Finance & credit | Over-limit customer with overdue invoice, credit hold and override, payment allocation, ageing and dashboard update |
| F | Management review | Industrial & Steel margin erosion explained via category trend, pass-through and price history; CSV/PDF export |

The full 10-minute meeting script is in **[DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md)**.

---

## Testing

- `npm test` — **35 unit tests**: margin vs markup, price endings and rounding, rules/tiers/contract prices, approval triggers, cost shock (drafts flagged, issued snapshot intact, approval required), rejection and rollback-as-new-version, product-specific UOM conversions, stock definitions, adjustment guards, an end-to-end quote → order → partial reservation → backorder → partial dispatch → PO → partial GRN with quarantine → backorder allocation run, idempotent picklists and dispatch, pick reversal, quote expiry and re-issue approval, credit hold and override, FIFO payment allocation and duplicate protection, KPIs derived from records, rule-based insights, parser accuracy, and seed integrity/determinism.
- `npm run test:e2e` — **10 Playwright tests** against the production build: boot and onboarding, command-palette search, cost shock with a role-gated approval, WhatsApp → PDF → order with backorder, goods receipt, pick → pack → dispatch → POD, persistence after reload, mobile viewport (no horizontal scroll), 3D canvas, and the WebGL-disabled 2D fallback. Each test also fails on any console error.

## Deployment

Cloudflare Pages Free, static build, no secrets. See **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Assumptions & production gaps

See **[ASSUMPTIONS_AND_PRODUCTION_GAPS.md](ASSUMPTIONS_AND_PRODUCTION_GAPS.md)**. It covers what needs the client's real data, credentials or decisions, and the discovery questions to ask.

## Branding

The official Man Kian Hardware logo is used with the client's permission (`public/brand/mk-logo.png`, `mk-mark.png`; favicon and touch icon are derived from the mark) in the sidebar, welcome dialog and PDF letterheads, and the UI palette is matched to the logo's green (#107c08) and orange (#f39200). Product photos come from the client's own website (www.mkhardware.com.my, used with permission): 35 photos in `public/products/` mapped to 50 demo SKUs in `src/data/productPhotos.ts` (each entry notes the source product id). A photo shows the product *type* — sizes/variants of one family share a photo — and brand-specific SKUs only use a photo of the same brand. SKUs without a good match (and any product added in the demo) fall back to original SVG illustrations. The public company name, registration number and address shown on sample documents come from the official website.
