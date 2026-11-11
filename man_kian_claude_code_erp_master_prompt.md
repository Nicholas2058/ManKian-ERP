# CLAUDE CODE MASTER BUILD PROMPT
## Man Kian Hardware & Trading Sdn Bhd — Hardware Distribution & Dynamic Pricing ERP

You are Claude Code acting as a senior full-stack engineer, product architect, UX designer, and QA lead. Build a visually outstanding, fully interactive, mobile-first ERP **demo** from scratch for **Man Kian Hardware & Trading Sdn Bhd (MK Hardware)**, based in Puchong, Selangor, Malaysia. The result must look and behave like a sophisticated modern enterprise SaaS product, not a generic admin template or a static mockup. The demo must be deployable to the **Cloudflare Pages Free plan** from a Git repository.

## 0. START HERE: CRITICAL EXECUTION INSTRUCTIONS

- Inspect the working directory/repository first, if it exists, before changing code. Create a clean Vite + React + TypeScript project if empty.
- Research the official company site at https://www.mkhardware.com.my/ as source material when browsing is available, specifically the homepage, About, Product, Portfolio, Download, and official pricing notice at https://www.mkhardware.com.my/latestnews/nid/178191/ . Never claim to be their official ERP or show genuine supplier pricing unless provided by the client.
- **Product reality:** The company publicly lists plumbing, building materials, industrial products, power tools, hand tools, safety products, electrical appliances, chemicals, household and storage items; its portfolio presents delivery and self-pickup; its site uses enquiry/WhatsApp workflows and cautions against unauthorized third-party pricing. The client has separately said that prices change every day. These are the design anchors.
- The company uses NEWPAGES for its website, but do not assume a documented NEWPAGES API or direct database access. Add an adapter interface and CSV import/export for future catalog sync.
- **Absolutely no public fixed-price e-commerce store.** The internal ERP may show private demonstration prices. A future customer-facing catalog should show “Request quotation / Price on enquiry”, not public fixed prices. Prices in this demo are entirely fictional and must be labeled as such.
- Work independently through implementation, fixing errors, and testing. Do not stop after scaffolding. When a part requires unknown external credentials or business facts, build a fully functional local simulation and document the integration seam rather than leaving inert buttons.
- Prioritize deep working paths over superficial breadth. All primary action buttons must do something meaningful, with consistent state changes across pages. Avoid dead-end UI, lorem ipsum, placeholder 404 pages, and fake “live” badges.
- Support English as the fully translated default. Provide a language switcher architecture, with a meaningful Bahasa Melayu and Simplified Chinese subset for the main dashboard/quotations/navigation; do not fake full translations for untranslated strings.
- Deliver a working app, a clear README, deployment instructions, sample data, simple tests, and a demo walkthrough. Maintain a task checklist and proceed until the critical flows have been verified.

## 1. BUSINESS MODEL & PERSONAS

Design a single-company hardware distributor/wholesaler and retail-counter operations platform, not a manufacturer ERP. Do not invent actual company branches, warehouse layouts, headcount, real customers, or financials. Treat them as illustrative demo structures.

Core personas:
1. Owner / Director — financial performance, margin erosion, cash collection, supplier exposure, approvals.
2. Sales Manager — incoming RFQs, sales pipeline, quotation approval, customer price tiers.
3. Sales Executive — customer enquiries, product lookups, quote builder, stock inquiries, order follow-up.
4. Procurement — supplier list price updates, comparison, purchasing, delivery ETA, backorders.
5. Warehouse Supervisor — stock reservations, racks, bins, GRN, picking and stock discrepancies.
6. Warehouse Picker — mobile-first picklists, barcode/search and packing confirmation.
7. Delivery Dispatcher / Driver — delivery order, load assignment, delivery confirmation / proof of delivery.
8. Finance — invoices, payment allocation, outstanding receivables, credit limits, accounting export.
9. Counter Cashier — walk-in sales, product search, pickup, receipt.

Add a beautiful role-switch control in the top bar for demo exploration. This is a **visual demo simulation**, not secure authentication. Restrict/alter visible controls in the client demo to show role concepts, but explicitly label it as not secure enough for a real deployment. Provide realistic action audit entries.

## 2. VISUAL DESIGN: A PREMIUM HARDWARE OPERATIONS COCKPIT

Inspiration: MK Hardware's green brand identity, staff uniforms, practical industrial products, contemporary logistics SaaS, Linear/Vercel clarity, and refined dashboard design. Use a custom brand system; **do not simply copy the public website's dated layout**.

Design tokens (suggested; adjust after visual inspection of official logo):
- Primary deep forest: #103F34
- Secondary rich evergreen: #176A50
- Bright action green: #29B47F
- Soft mint highlight: #E7F5ED
- Canvas: #F5F8F6
- Paper/card: #FFFFFF
- Ink: #172B25
- Muted: #6D8077
- Border: #DEE8E1
- Warm orange accent (sparingly, referencing branded uniforms): #F08B46
- Warning: #E0A43A; danger: #D95752
- Optional dark mode: #101F1B canvas, #183029 surfaces, jade accents.

Typography: Inter or Manrope with strong numeric hierarchy; compact, modern data tables. Use inline SVG/lucide icons, meaningful product photos where licensing allows (locally optimized/cached if permission is held), elegant warehouse illustrations, and custom lightweight vector diagrams instead of generic emojis. Where official MK logo is available and usage is authorized by the demo owner, use the actual asset preserving proportions; otherwise render a temporary “MK Hardware / DEMO” wordmark and document how to replace it. No unauthorized product image scraping or hotlink dependencies.

Desktop layout:
- Fixed dark forest left sidebar, 248px with expandable/collapsible navigation and active mint indicator.
- Top bar with command search (Ctrl/Cmd+K), branch/warehouse display explicitly labeled illustrative, date, notification dropdown, role selector, theme/language toggles.
- Wide responsive content surface with generous margins, 12-column grid, bright cards, subtle borders, filtered reports, coherent spacing.
- Quick action button “+ New” that can create RFQ, quote, PO, stock adjustment, or delivery order.

Mobile layout:
- Mobile-first responsive shell; functional at 360px/390px/430px and on tablets.
- Replace sidebar with compact header and bottom navigation or an accessible slide-out drawer.
- Tables turn into readable compact cards, with status, primary KPI and expandable details. Avoid 1000px-tall cards for a single record.
- Large tap targets, sticky create/approve/confirm actions, swipeable optional microinteractions; all modals become bottom sheets when appropriate.
- Mobile quote builder and warehouse scanner simulation must work without horizontal scrolling.

Motion guidelines:
- Use Motion / Framer Motion for tasteful spring transitions, staggered lists, tab indicators, sliding drawers, quote line addition, filtered cards, animated numbers, hover-lift and real-time status transitions.
- 120–250ms for most interactions, 300–500ms for meaningful page/dialog transitions; do not overload every element with entrance animations.
- Animate meaningful changes: new supplier cost -> new suggested price; approved quote -> order; stock received -> live availability; picking -> dispatch.
- Dashboard charts animate once and respond to filters. Use skeleton loading states, clear form validation, command palette, toast notifications, undo where safe, confirmation dialogs for destructive actions.
- Respect `prefers-reduced-motion` and use GPU-friendly transforms. Avoid video autoplay, heavy particles, and gratuitous 3D in normal operations.

## 3. TECHNOLOGY & CLOUDFLARE FREE PLAN

Required primary stack:
- React + TypeScript + Vite; current stable package versions available at execution time.
- React Router (SPA) and route-level code splitting.
- Tailwind CSS + shadcn/ui (or Radix primitives) with a cohesive custom theme.
- Lucide icons.
- Motion for animations.
- Recharts or Apache ECharts for data visualizations.
- TanStack Table for serious filters, sorting, pagination and row actions.
- Zustand for UI state, Dexie/IndexedDB for persisted demo data; localStorage only for settings.
- Zod schemas for domain validation; React Hook Form for forms.
- date-fns and Intl formatting for Malaysia locale/time zone, monetary amounts with RM.
- React Three Fiber + Three.js + Drei for a self-contained 3D warehouse visualization. Load only on-demand with React.lazy; use a Canvas fallback when WebGL is absent.
- pdf-lib / jsPDF (choose one) for real quotation/PO/DO PDF generation and print preview; CSV import/export with validation; avoid huge heavyweight dependencies.

Hosting constraints:
- Must build to `dist/` and deploy to Cloudflare Pages Free with `npm run build`.
- No Node/Express runtime, no localhost server, no paid hosted database required in the default demo.
- All default functionality must be fully operational on static hosting, using browser IndexedDB persistence. Explicitly explain that local demo data is per browser/device and cannot be used as shared or secure production state.
- Provide a repository layout that can later move data repositories to Cloudflare Pages Functions / Workers + D1, with typed API interfaces; optionally implement a **clearly separated and disabled-by-default** D1 prototype, but don't make it a deployment blocker.
- If you implement Pages Functions: use D1 bindings, parameterized queries, and server-side authorization when real authentication is introduced; do not expose a D1 database to the browser directly. Keep the default public demo isolated from any privileged API.
- No secret tokens, customer PII, or production pricing in source code.
- Ensure SPA direct routes refresh correctly on Cloudflare Pages; implement necessary fallback behavior per the current Pages documentation. Do not break /api requests if Functions are added.
- Deliver a `.env.example` documenting optional integrations; never commit secrets.
- Avoid extra paid products, proprietary APIs, and long-running compute assumptions.

Recommended structure (adjust as needed):
```
src/
  app/ (router, providers, app shell)
  components/ (shared, dashboard, forms, data-table, charts, 3d)
  features/ (dashboard, pricing, catalog, rfq, quotes, orders,
             procurement, inventory, warehouse3d, delivery, crm,
             pos, finance, analytics, approvals, settings)
  domain/ (entities, pricing rules, inventory rules, validators)
  data/ (factory seeding, demo scenarios, reference categories)
  repositories/ (interfaces, indexedDb implementation, future D1 adapter)
  services/ (pdf, csv, external FX, map adapter, audit)
  store/ (view preferences, demo session, global notifications)
  lib/ (currency, date, ids, helpers, test utilities)
public/ (logo if licensed, icons, product placeholders, optional local assets)
tests/ (unit and browser critical-flow tests)
README.md
DEPLOYMENT.md
DEMO_WALKTHROUGH.md
ASSUMPTIONS_AND_PRODUCTION_GAPS.md
```

## 4. DATA MODEL & ACCURACY REQUIREMENTS

Use normalized TypeScript entities and Dexie tables/repository interfaces for:
- Product, ProductVariant, ProductCategory, Brand, Barcode, UOMConversion, ProductSpecification, Datasheet, ProductImage
- Supplier, SupplierProduct, SupplierPriceVersion, SupplierQuote, PurchaseRequisition, PurchaseOrder, POItem, GoodsReceipt, GRNItem
- Warehouse, Zone, Rack, Bin, StockLot, InventoryMovement, StockAdjustment, InventoryReservation, StockTransfer
- Customer, CustomerSite, CustomerPriceAgreement, Contact, CreditAccount, Project
- Enquiry, RFQ, RFQItem, Quote, QuoteVersion, QuoteLine, QuoteApproval
- SalesOrder, SalesOrderLine, SalesOrderAllocation, Backorder
- Picklist, PickTask, PackingSlip, DeliveryOrder, Shipment, DeliveryProof, CollectionRecord
- Invoice, InvoiceLine, Payment, PaymentAllocation, CreditNote, ReturnRequest
- PriceRule, CostVersion, PriceHistory, ApprovalRule, Notification, AuditEvent, DemoScenario, UserRole

Data integrity rules:
- Stock On Hand = physically held stock; Reserved = allocated to orders; Available = On Hand minus reserved minus other committed/blocked stock; Incoming = outstanding PO quantities. Do not add incoming to available.
- Quoting is not the same as reserving inventory; quote acceptance/reservation must be a separate user action with an explicit expiry/hold policy.
- Do not allow negative unallocated stock; surface a backorder or override workflow instead.
- Order line can be fulfilled in parts; track ordered, allocated, picked, dispatched, received, invoiced and balance quantities separately.
- UOM matters: piece, box, carton, bag, length, meter, roll, drum, litre, kilogram, tonne and pallet; conversions must be product-specific (e.g. 1 box = N pcs) and never guessed globally.
- Cost and selling price have effective dates; quotation version stores immutable line-price snapshots when issued.
- Margin percentage = (selling price - cost) / selling price * 100. Markup percentage = (selling price - cost) / cost * 100. These are distinct and must be labeled correctly.
- Imported supplier costs should never silently modify an already approved customer quotation. Mark affected open/draft quotes for recheck; preserve issued/signed snapshots.
- Use sensible currency precision and consistent rounding in totals; do calculations without accumulating floating-point errors (use minor units or decimal-safe helpers where appropriate).
- Every significant record update should create an audit log entry with user, timestamp, change, and reason.
- Use synthetic/demo values only. All sample customers and suppliers should be clearly fictional except public product brand names. Don't make up real company financial results.
- Malaysia e-Invoice and SST handling must be configurable; do not hard-code a tax rate or claim that demo records are valid regulatory submissions.

Seed realistic, **illustrative**, internally consistent data:
- 120–160 SKUs across the nine key categories; 10–15 brands; variants with specifications, UOMs and lead times.
- Include clearly distinguishable real product *types* appearing on the official site: chemical anchor, PVC pipe and fittings, U-bolt, angle bar, concrete paver, ventilation block, rubber bearing pad, geotextile, safety helmet, industrial gloves, drill, grinder, sealant, IBC tank, wire mesh, roofing item and steel sections. Do not present made-up product specs or prices as official.
- 12–20 synthetic suppliers; 20–35 synthetic B2B customers and walk-in account types.
- 30–50 recent RFQs/quotes; 20–35 orders; 15–25 POs; multiple deliveries, invoices and open receivables.
- One illustrative warehouse with zones A/B/C, several rack types and bins; never claim this is the real Puchong facility layout.
- Reasonable activity over the last 90 days so that dashboard charts are connected to records, not static unrelated numbers.
- Include scenario flags for 1) sudden supplier cost increase, 2) margin-breaching quote, 3) 40-unit order with only 25 in stock, 4) delayed PO, 5) pickup and delivery orders, 6) overdue customer invoice, 7) low-stock item.
- Provide "Reset demo data" (confirmation required), scenario switcher, import/export snapshot, and optional scenario replay.

## 5. DETAILED MODULE REQUIREMENTS

### 5.1 OWNER'S MISSION CONTROL DASHBOARD — MUST FEEL IMPRESSIVE
Attractive responsive dashboard with:
- Today / 7 days / 30 days / 90 days date filters and KPIs that actually recompute.
- Illustrative net sales, orders in pipeline, gross margin, quote conversion, open receivables, purchase commitments and fulfillment performance.
- Pricing exposure: count of items with cost updates today, quotes requiring review, price changes pending approval, and margin at risk.
- Sales trend area chart, category mix visualization, quote funnel, orders by delivery status, supplier cost-change heatmap.
- Operational alerts and actionable cards for expiring quotes, unallocated orders, low stock, GRN discrepancy and payment delays.
- “Today's operations” timeline; recent activities linked to actual records.
- Primary “Simulate a Price Shock” CTA launches signature scenario and highlights cross-module reactions.
- A tasteful warehouse operational mini-map tile with a button opening the 3D Warehouse Explorer.
- Every chart supports tooltips and click-to-filter / drill-down where reasonable.

### 5.2 DYNAMIC PRICING COMMAND CENTER — THE HERO MODULE
This is the key differentiator. Build a high-quality master/detail interface with:
- Searchable price table: SKU, category, brand, supplier cost, previous cost, percentage cost change, target margin, suggested selling price, last approved price, effective date, customer tier, pending action.
- Price trend sparkline per item and detailed historical price chart.
- Different customer pricing tiers: walk-in, trade, contractor, key account, project-specific. Tier pricing must preserve individual quote approval rules.
- Rules engine for cost-plus pricing, markup, minimum gross margin, manual fixed price, bulk discount tiers, contract override, freight add-on, expiry and manager approval thresholds.
- Supplier cost version history and selected supplier for costing; optionally landed cost components (freight, handling, FX) with explanation.
- Batch update screen with CSV import and preview, bad row validation, change summary, effective dates, approve/reject action, history and rollback via a new version rather than destructive overwrite.
- “Cost Shock Simulator”: choose scenario + category, adjust supplier cost by -10% to +35%, watch suggested prices and margins change with smooth animated cards; show impact on draft quotes and unapproved RFQs; issued quotes remain intact. Provide scenario reset.
- Approval inbox for margin floor breach, exceptional customer discount, price override and expired quotation reissue.
- Price list export (internally labeled confidential). Do not expose in public pages.
- Quote validity choices such as same day, 3 days or 7 days (illustrative and configurable); never make validity a universal business fact.
- Status labels: approved, pending, needs recheck, expired, below margin threshold, contract locked.
- Include clear formula, line-level cost/markup/margin explanations and a simple profitability waterfall.

### 5.3 MASTER PRODUCT CATALOG / PIM
- Toggle polished image cards vs dense table; instant fuzzy search by SKU, brand, name and specs.
- Faceted filters for category, brand, unit, stock, vendor, price volatility, active/discontinued.
- Product detail drawer with photo, variants, dimensions, pipe diameter, grade/material, batch, UOM conversions, technical datasheets, alternatives/substitutes, supplier sourcing, stock, history and linked RFQs.
- Operations: add/edit product, archive, duplicate variant, batch import CSV with mapping preview, export, watchlist, create RFQ line, create purchase requisition.
- Show “price on request” in any optional customer-facing catalog preview.
- Add a project-material list / BOQ basket (not checkout) supporting 10–20 mixed SKUs and unit conversions; click “Request quote” rather than “Buy now.”
- Group certain identical products with selectable size/diameter/thickness variants.

### 5.4 RFQ / ENQUIRY INBOX
- Unified demonstration inbox for WhatsApp, phone, email and website enquiries; use synthetic conversations and transparent “simulated channel” labels.
- Left conversation list, conversation detail center, customer context right panel; mobile full-page alternate.
- Convert chat items into structured line items and RFQ with quantity/UOM/specs/site/date.
- Flow: new enquiry -> qualify -> RFQ -> quote draft -> submitted -> accepted/rejected/expired; follow-up reminders and activity notes.
- Simulate inbound enquiries without connecting to personal WhatsApp or sending messages.
- “Copy WhatsApp draft” and optionally “Open official WhatsApp” with a prefilled non-sensitive message as an explicit outbound user action; never auto-send.
- Show a matching suggested SKU and alternative, but label recommendations rule-based/demo.

### 5.5 QUOTATION STUDIO
- Modern split view: product search and line builder on left; customer, validity, stock, margin and document preview on right; adapt to mobile steps.
- Autocomplete from catalog; select variant and UOM; enter quantity, unit price, discount, freight, notes and promised lead time.
- Internal margin insights, available vs backordered quantity and estimated fulfillment; if quote has a forbidden margin, require approval before issue.
- Status workflow draft -> submitted for approval -> approved -> issued -> accepted/rejected/expired -> converted to order.
- Approved quotes are versioned, issue timestamps and expiry dates immutable in quote version history. Reprice creates a new version.
- One-click export as realistic PDF with company name / logo if permitted, public company address, clear DEMO SAMPLE watermark, quote number, lines, date, validity, terms and signature section; no live invoice submission.
- Copy a formatted quote into a message, print preview, duplicate, revise, send simulation (do not actually send without integration).
- Credit checks and customer-specific pricing controls.

### 5.6 SALES ORDER / ALLOCATION
- Convert accepted quote -> sales order with traceable line IDs and preserved prices.
- Stock-reservation action is explicit; if insufficient stock, offer partial allocation and backorder with separate promised dates.
- Sales board view plus searchable table; detail view timeline of received, allocated, picklist, packed, out for delivery, delivered, invoiced.
- Order split between available stock and incoming supplier shipment; no fake instant fulfillment.
- Linked documents, customer sites, project reference, payment terms, actions and audit logs.

### 5.7 PROCUREMENT / SUPPLIER INTELLIGENCE
- Supplier management table and supplier detail profiles with contact data for **fictional** demo suppliers.
- Purchase requisition -> 2–3 supplier quotations -> supplier comparison -> PO -> acknowledgement -> GRN -> invoice matching (demo).
- Compare supplier unit cost, MOQ, available quantity, delivery lead time, quoted validity, product spec compliance and past performance.
- PO builder with partial receipts, pending, late, cancelled and closed status.
- Receiving goods should change on-hand stock, reconcile reservation/backorders and generate a proposed cost version for approval (not overwrite issued quote snapshots).
- Simulate freight/FX exposure for imported supply, if relevant; company-specific actual import sourcing is unverified.
- Low-stock suggested POs and configurable reorder points.

### 5.8 INVENTORY & WAREHOUSE MANAGEMENT
- Stock status: on hand, reserved, available, incoming, damaged/quarantined and allocated per bin.
- Product-specific UOM conversion, serialized/batch stock where relevant, unit conversion edge cases.
- Goods receiving (GRN), transfer, adjustment, issue and returns with reason and audit trail.
- Low-stock dashboards, ageing and slow-moving stock, ABC grouping and reorder suggestions.
- Inventory ledger and stock movement history with filters.
- Mobile-friendly simulated barcode scanner: keyboard input and optional camera scanning only with explicit browser permission and a reliable typed fallback. Do not claim a scan succeeded if no input was captured.
- Pick/pack lists linked to sales orders; scan or tap "Pick" updates picked quantities only, with discrepancy handling and no hidden reservations.

### 5.9 SIGNATURE INTERACTIVE 3D WAREHOUSE EXPLORER
This is an optional immersive *operational* tool, not decorative gimmick. Use Three.js / React Three Fiber, no paid 3D API.
- Create a compact elegant illustrative warehouse interior: floor grid, 3–4 storage zones, racks and shelf bins, stacks of pallets/boxes, safe aisle, receiving dock, loading bay, forklift silhouette. Use efficient procedural primitives and instanced meshes; no massive paid asset packs.
- Camera supports gentle orbit, pan, zoom, auto-fit, reset-to-isometric; floor/zone labels; legend; mini-map toggle.
- Color-coded rack occupancy and stock risk, with accessible color+text indicators; smooth hover outlines, highlighted selection and overlay tooltips.
- Clicking a rack/bin opens a side panel with real seeded SKU assignments, stock, reserved quantity, picking list and actions. The underlying data must agree with the inventory module.
- Toggle modes: "Occupancy", "Low Stock", "Picking Route", "Receiving". In Picking Route, animate a **diagrammatic**, not geographically optimized, path along warehouse aisles to picked bins.
- Demo forklift may animate toward a target location on an optional button; don't imply real-time location tracking.
- Animate goods receipt: receiving dock -> allocated rack/bin with a short visual transition; data updates immediately in catalog and inventory.
- Label the display prominently "Illustrative warehouse layout — not an actual survey".
- Ensure usable controls on mobile via simplified 2D floor plan fallback, no WebGL, reduced motion and low-power settings. Lazy load the 3D bundle only upon entering this screen.

### 5.10 DELIVERY & SELF-PICKUP CENTER
- Dispatch board: ready for picking -> packed -> load scheduled -> out for delivery -> delivered / exception; self-pickup separate scheduled -> ready -> collected.
- Vehicle/driver assignment with fictional identities; loads, weight/size constraints where recorded; no made-up geospatial route metrics.
- Live-looking but explicitly **simulated** route progress timeline. Driver mobile layout with Stop Details, Confirm Delivery, signed-name typed confirmation, timestamp, sample photo attachment and exception report.
- Delivery order (DO) PDF and proof of delivery records.
- Partial delivery support, failed delivery reason, reschedule, self-pickup token / collection verification.
- MapLibre optional if an appropriate compliant tile provider/token is configured. Default to a self-contained vector region/site diagram and synthetic stops, without depending on a third-party tile API for core functionality.

### 5.11 CRM / CUSTOMER ACCOUNTS
- Customer directory with types: contractor, renovation firm, industrial buyer, project account, walk-in.
- Profile includes customer billing/site addresses (fictional), contacts, price tier, contract validity, credit limit, payment terms, recent RFQs, purchases, late invoices.
- Create customer, search/filter, attach notes and tags, create quote directly, view order history.
- Customer scorecard based on simulated trade activity, not fabricated personal profiling.

### 5.12 COUNTER POS — OPTIONAL P1 BUT FUNCTIONAL
- Fast product search, quantity, customer type, stock, discount approval and cart (internal point-of-sale, not website e-commerce).
- Hold/resume sale, convert to quote if price approval required, complete fictional cash/card/transfer sale, show receipt and stock decrement once confirmed.
- Simulated payment only. No real card collection or QR acquiring.

### 5.13 FINANCE / ACCOUNTING PREVIEW
- Sales invoice listing generated from delivered/accepted invoices per configured workflow; invoice PDF with SAMPLE watermark.
- Payment allocations, ageing buckets, overdue reminders (copy draft only), customer credit limit flags.
- Purchase bills and expense placeholders, stock valuation estimate, simple sales/margin reports.
- Account software integration screen should list "Not connected" and a documented future adapter for AutoCount or any client-confirmed accounting platform. Do not claim AutoCount is currently used.
- Malaysia e-Invoice readiness panel: fields required for customer tax details, invoice mapping and validation preview; show explicit "Demo only — no submission to LHDN" banner. Integration with MyInvois is future work, not promised without credentials, tax configuration and official sandbox tests.
- Build CSV export in a neutral format and state that actual accounting import mapping must be agreed with the client.

### 5.14 ANALYTICS & RULE-BASED BUSINESS INSIGHTS
- Interactive revenue/margin trend, cost-shock analysis, category share, inventory turnover proxy, supplier on-time score, RFQ conversion, fill rate and overdue debt.
- Powerful table filtering, chart click-to-drill, CSV export, date-range selector and KPI definition tooltips.
- "Operations Insights" highlights the next actions using **deterministic transparent rules** (e.g. cost increased >8%, margin below threshold, quote expires today, stock under reorder point, order overdue). Do not call this real AI unless connected to an actual model and clearly labeled.
- Simulated real-time activity panel with controlled "Play demo event" button instead of misleading randomly changing production data.

### 5.15 SETTINGS, PERMISSIONS, AUDIT, HELP
- Theme, density, language, notification preferences, margin thresholds, quote validity, warehouse mock settings, tax configuration, UOM definitions, role simulator.
- Audit history for prices, quotes, orders, receipts, stock adjustments, approvals and payments.
- First-run onboarding spotlight / guided tour and a persistent "Demo scenarios" control.
- Explain demo data reset, limitations and which components need production integrations.

## 6. MANDATORY INTERCONNECTED DEMO SCENARIOS

Implement these as scripted but stateful guided walkthroughs. When users trigger events, real seeded records update and dashboards recalculate. Each scenario has a 3–6-step guided overlay and a Restart Scenario action.

**A — DAILY COST SHOCK (TOP PRIORITY)**
1. Open Pricing Command Center on a tracked structural steel / pipe / material SKU.
2. Simulate a 14% supplier cost rise; show last cost, new cost, date, proposed selling price, margin under existing customer rates.
3. Show three affected draft quotes, one below margin floor, one contract-locked quote and one issued quote that retains its historical selling price.
4. Submit a proposed price update for manager approval and use role-switch to approve it.
5. Confirm current product price and relevant draft quote flags update; issued quote does not silently change. Show new history entry, audit log and dashboard alert resolution.

**B — WHATSAPP ENQUIRY TO QUOTATION TO ORDER**
1. Open synthetic WhatsApp inquiry from a fictional contractor who needs 40 units of PVC fittings and 20 lengths of pipe by a date.
2. Convert message to RFQ, resolve variants/UOM and check stock/lead time.
3. Build quotation with price validity, line item margin indicator, optional freight charge.
4. Trigger an approval where needed, approve as manager, issue sample PDF, then mark accepted.
5. Convert to sales order; reserve the available quantity; generate backorder for remaining balance; show the statuses across modules.

**C — PROCUREMENT TO RECEIVING TO 3D WAREHOUSE**
1. Open low-stock alert for a product required by an order.
2. Compare 3 fictional suppliers on price, MOQ, delivery time; choose one.
3. Generate sample PO, simulate partial delivery and GRN.
4. In 3D explorer show arrival and shelf/bin placement.
5. Verify on-hand/available and linked backorder become updatable and prices are proposed, not forcibly overwritten.

**D — DISPATCH AND SELF-PICKUP**
1. From ready order generate picklist, complete bin picks on mobile-friendly interface.
2. Choose customer self-pickup for one order and delivery for another.
3. Simulate warehouse packing/dispatch, driver confirmation, DO/POD PDF.
4. Track partial shipments separately; update customer order timeline and inventory.

**E — FINANCE / CREDIT CONTROLS**
1. Use fictional customer approaching or exceeding credit limit.
2. Attempt approval of new credit order; show manager override requirement.
3. Simulate received payment, allocate it to open invoice.
4. Recompute outstanding/ageing, show dashboard change and audit log.

**F — MANAGEMENT REVIEW**
1. From dashboard inspect declining category margins and quote-conversion trend.
2. Drill into product and customers; identify cause using price-history and open quotes.
3. Export sample KPI and quote CSV / PDF.

Every guided scenario should be accessible from a dedicated polished **"Demo Tour"** screen and from a global floating or header shortcut.

## 7. INTERACTIVE DETAILS & VISUAL QUALITY BAR

- Build actual charts: KPI sparklines, waterfall, heatmap, line, stacked bar, radial occupancy, progress funnels where useful. No random unrelated fake dashboard figures.
- Implement searchable global command palette with keyboard shortcuts linking records/routes/actions.
- Table header sorting, column chooser, filters, saved view presets, date range selectors and pagination.
- Product images or clean illustrations with consistent aspect ratio. Avoid broken hotlinks.
- Form quality: proper focus, inline errors, required fields, confirmed actions, cancel/reset, toasts, undo where safe.
- Use responsive details drawers instead of navigating into clumsy nested pages for each table row.
- Accessibility: semantic controls, keyboard interactions, focus traps, appropriate labels, WCAG-friendly contrast, reduced motion support; 3D companion list/2D alternative.
- Empty/loading/error states, including external API unavailable, lack of permission, missing product and failed import.
- Iconography consistent; visual restraint and good information architecture outweigh flashy gimmicks.
- 3D never dominates an operational task or causes mobile lag. Prefer meaningful warehouse visualization to a randomly floating decorative warehouse.

## 8. OPTIONAL ZERO/LOW-COST EXTERNAL DATA

Do not force external APIs for the demo to work.

1. Optional reference FX rate card for imported goods:
   - Frankfurter, e.g. https://api.frankfurter.dev/v2/rate/usd/myr . Free, no API key per provider documentation; cache daily; include retrieved date/source; fallback to clearly labeled synthetic rate if unavailable. FX reference should **never auto-overwrite client-approved cost or selling prices**.
   - Bank Negara Malaysia also publishes official exchange-rate APIs. Prefer manual approval for any costing conversion.
2. Optional mapping with MapLibre GL JS. MapLibre library is open source, but map tiles/data still need a licensed/terms-compliant provider. Do not rely on public demo servers for commercial operations. Core delivery demo works without map tiles.
3. Optional browser barcode capture (native BarcodeDetector where supported) with manual barcode input fallback.
4. Do not use a non-commercial-only weather API in a commercial sales demo without appropriate license. Weather is not core to this project.
5. No external 3D API is necessary; Three.js/R3F renders the scene in-browser for free.

## 9. APPLICATION STATE, PERSISTENCE, SYSTEM INTEGRITY

- Implement a single domain service / repository layer. No module should maintain inconsistent independent copies of stock, quotes, prices, invoices or customers.
- Seed from the same persisted dataset and derive dashboard data rather than showing disconnected hardcoded stats.
- Support transactional operations in IndexedDB when receiving stock, reserving orders, recording payments or converting quotes to orders.
- Use reproducible seeded scenarios with deterministic test IDs and a migration/version strategy so updates do not destroy user-created demo data unexpectedly.
- When client changes a price, reflect it in catalog, pricing history, quote creation and any margin warnings but preserve issued quote snapshots.
- Add action safety: when an order is cancelled, release reservations; when a picked quantity is reversed, log and correctly restore inventory state; don't duplicate fulfillment or payment on repeated clicks.
- Simple local-state role simulation must **never be mistaken for actual server-side security**.
- Keep synthetic customer data and pricing clear. Protect this demo URL by convention where possible, but don't claim that public static JS hides data.

## 10. TESTS AND ACCEPTANCE CRITERIA

Write unit tests with Vitest for:
- markup vs gross margin, cost shock and rounding,
- customer tier pricing, discount and margin approvals,
- quote expiry/version snapshot behavior,
- unit conversions with product-specific pack sizes,
- on hand/reserved/available/incoming,
- partial GRN and partial order fulfillment,
- credit limit rules and payment allocation,
- dashboard KPIs derived from actual records.

If feasible, add Playwright E2E covering:
- boot to dashboard; product search; price change approval; quote creation; order conversion; backorder; goods receipt; pick/dispatch; data persists after refresh; PDF generation; mobile viewport; 3D fallback.

Verify:
- `npm install`, `npm run dev`, `npm run build`, and `npm run preview` succeed.
- No TS errors or critical console errors; no broken navigation, charts or images.
- All visible major CTA controls are wired to real actions.
- Reload preserves state on the same browser/device; reset is predictable.
- 360px, 390px, 768px, 1440px widths; check mobile menus, tables, sheets and quote creation.
- WebGL optional path works, graceful fallback without WebGL.
- Reduced motion path works.
- Lighthouse-minded performance: lazy-load 3D and major chart routes, avoid huge bundles/images, minimize layout shift.
- Clear privacy and demo-data disclosures.

## 11. CLOUDFLARE PAGES DEPLOYMENT DELIVERABLES

1. Include `README.md` with how to run, stack, architecture, included modules and demo scenario steps.
2. Include `DEPLOYMENT.md` with exact Cloudflare Pages Git integration steps:
   - repository branch: `main`
   - build command: `npm run build`
   - output directory: `dist`
   - no required environment secrets for default demo
   - pages.dev deployment expected; custom domain optional
   - explain SPA routing and fallback, and any required Wrangler config.
3. Include `ASSUMPTIONS_AND_PRODUCTION_GAPS.md` documenting company details needing verification, unknown accounting platform, stock system, site sync, actual warehouses, price rules, GST/SST/e-invoice handling, invoice templates, real user authentication, authorization, and data privacy needs.
4. Include `DEMO_WALKTHROUGH.md` with a script for a 10-minute meeting: brand dashboard 1m, price shock 2m, RFQ quote 2m, warehouse 3D 2m, procurement/delivery 2m, executive insights 1m.
5. Include GitHub Actions CI (optional) for build/tests, provided it stays compatible with Free plan and does not require secrets.
6. If Cloudflare credentials or GitHub access are unavailable, do not pretend to deploy; finish a ready-to-deploy build and show precise commands to the user.
7. Do not connect production WhatsApp, payments, LHDN, company website or accounting system without explicit permission and proper credentials.

## 12. BUILD ORDER — FINISH SOMETHING FULLY WORKING AT EACH STAGE

A. Inspect and research. Establish assumptions, brand tokens, sitemap and wireframe / design approach.
B. Set up app shell, responsive nav, dark mode, notifications, global search, local data and seeded models.
C. Build interconnected dashboard, catalog, pricing engine and quotations — these must work end to end first.
D. Add RFQ, sales orders, reservations, procurement, GRN and warehouse inventory.
E. Add 3D warehouse explorer with linked data and mobile 2D fallback.
F. Add delivery/self-pickup, CRM, finance/receivables, POS and analytics.
G. Add polished tour mode and the six scenarios, PDF/CSV export, language subset and settings.
H. Audit all action controls, perform tests, fix bugs, optimize and verify mobile production build.
I. Complete deployment docs and report final status with working features, limits and manual setup steps.

If scope or tool time becomes constrained, prioritize **working pricing + RFQ/quote + procurement/inventory + 3D warehouse + management dashboard**, not 20 disconnected dummy screens. Keep every promised status truthful.

## 13. WHAT YOU MUST OUTPUT WHEN FINISHED

- A full runnable project in the repository, not a prose suggestion.
- Clear directory tree and tech choices.
- A succinct list of completed flows and known limitations.
- Build/test results, including failures fixed.
- Cloudflare Pages deployment instructions and a public URL **only if actually deployed and verified**.
- A walkthrough telling me exactly how to demonstrate: daily price rise, approval, customer quotation, partial stock sourcing, 3D warehouse, dispatch and finance.

## 14. BUSINESS DISCOVERY QUESTIONS TO RETAIN FOR THE REAL CLIENT

Do **not** delay the demo for answers to these. Document assumptions and build configuration panels so they can be changed later:
- Which accounting package do they use (AutoCount, SQL Accounting, UBS, other)? Desktop or cloud?
- What is the existing inventory/quotation process (Excel, manual, POS, ERP)?
- Where do supplier price updates arrive (WhatsApp, email, spreadsheet, PDF, supplier portal) and who approves them?
- Are changes daily for every product or only selected categories? Which costs are most volatile and are some fixed by project contract?
- How are selling prices calculated: fixed margin, markup, wholesale tiers, per-customer agreements, negotiated discounts, special tenders?
- Does accepting a quote reserve stock? For how long? Any quote cancellation/expiration rules?
- How many active products, warehouse locations, bins, suppliers, users and drivers? Is barcode scanning in use?
- How are out-of-stock items sourced, how are lead times handled, and is direct-to-site supplier delivery common?
- Do they deliver with own fleet, third parties, or both? How are proof-of-delivery and self-pickup recorded?
- What are credit terms, approval limits, deposit rules, payment methods and the SST/e-Invoice position?
- How should a future website integration work with NEWPAGES, and can official exports/API access be provided?

FINAL INSTRUCTION: Build a beautiful, credible, interactive, fully functioning business demo suitable for showing Man Kian Hardware's management. The purpose is to demonstrate how their particular issues — **frequent price changes, complex SKUs, customer quotations, supplier sourcing, stock visibility and delivery** — can be controlled by a unified ERP. Smooth animations and 3D should strengthen comprehension, not replace real operations.
