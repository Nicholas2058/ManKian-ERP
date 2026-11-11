# 10-minute demo walkthrough

A click-by-click script for presenting to MK Hardware management. Allow about 10 minutes, plus questions.

**Before the meeting**

- Open the deployed URL (or `npm run dev`) in Chrome on a laptop, at 1440 px or wider. Keep a phone handy for the mobile moments.
- **Settings → Demo data → Reset** (type `RESET`). This gives clean data dated to today.
- Close the welcome dialog ("Explore on my own"). Role = **Owner / Director** (top-right).
- Optional: keep **Demo Tour** open in a second tab. Every scenario can be driven by the guided panel instead of this script.

Say early: *"Everything you see is fictional — customers, suppliers and prices. It runs entirely in the browser; there is no connection to your systems."*

---

## 1. Brand & dashboard — 1 min

1. **Mission Control**. Point out the green MK palette and the **DEMO** wordmark.
2. Switch **30 days → 7 days → 90 days**. Every KPI recomputes from invoices, quotes, orders and POs in the dataset; none of the numbers are hard-coded.
3. Point to **Pricing exposure**: cost updates today, prices pending approval, quotes needing review, margin at risk.
4. Hover the **supplier cost-change heatmap**. Red weeks are supplier increases by category.
5. Scroll to **Operational alerts** and **Today's operations** (live audit trail; each line links to its record).

## 2. Daily price shock — 2 min (Scenario A)

1. Click **Simulate a price shock** (orange button). The guided panel opens on *Pricing Command Center* for **ANG-5050 angle bar 50×50×5**.
2. Show the detail panel: latest cost, approved list price, **margin vs markup** (labelled separately), the formula for the suggested price, tier prices, the **contract price** for Granite Line Construction, the waterfall, and price/cost history.
3. **Cost shock** tab: the slider is preset to **+14%**. The cards animate to the new cost, suggested price and margin, and the SKU turns red: *below 12% floor*.
4. **Impact on open quotations**: one draft falls below the floor, one draft is **contract-locked** (price honoured), and one **issued** quote keeps its snapshot ("price unchanged").
5. Click **Apply as supplier cost update**. Say: *"Procurement records the supplier's new cost; the selling price doesn't change until a manager approves."*
6. Top-right role switcher → **Sales Executive**. Open **Approvals** and show that the Approve button is locked.
7. Switch to **Sales Manager**. Adjust the final price if you like, then **Approve**.
8. Open the flagged draft quote (Quotations → *Recheck* filter). It shows "Price updated — reprice available". The issued quote is unchanged. Mention the price-history entry, the audit log, and that the dashboard alert has resolved.

## 3. WhatsApp enquiry → quotation → order — 2 min (Scenario B)

1. **Enquiries & RFQ** → *Rizal Hakim (Bayu Plumbing)*: "40 pcs 2" PVC elbow 90 and 20 lengths 2" PVC pipe class D…".
2. Point out the **suggested lines**: rule-based matching (not AI) with confidence, the alternative SKU, and stock ("25 available — short 15").
3. **Create RFQ → Create quotation**. In the Studio, add **Freight** (e.g. RM 80) and choose a validity. Show the line margin and availability.
4. **Submit for approval** (approve as Sales Manager if a rule triggers) → **Issue quotation** → **PDF**. The PDF carries the DEMO SAMPLE watermark, company details and validity. Show **Copy as message** (a WhatsApp-ready text; nothing is sent).
5. **Mark accepted → Convert to sales order → Create sales order**.
6. On the order, click **Reserve stock**: 25 elbows are reserved and a **15-unit backorder** is created with a promised date. Point out the line table (ordered / reserved / picked / dispatched / delivered / invoiced / backorder).

## 4. 3D warehouse — 2 min

1. **3D Warehouse**. Read out the label: *"Illustrative layout — not your actual warehouse."*
2. Orbit and zoom. In **Occupancy** mode the colours show fill level; hover a bin to see SKUs and quantities.
3. Click a bin. The side panel shows the same on-hand / reserved / available figures as Inventory. Open the **Stock card**.
4. **Low stock** mode highlights bins holding SKUs below their reorder point.
5. **Picking route**: choose an open picklist to see the numbered stops along the aisles (diagrammatic, not route-optimised). Click the forklift button for the demo animation (not live tracking).
6. On the phone, open the same page. It defaults to the **2D floor plan**, which also works without WebGL.

## 5. Procurement & delivery — 2 min (Scenarios C and D, condensed)

1. **Inventory → Reorder & ABC**: **UBL-M12-4** is below its reorder point with a backorder. Click **Requisition**.
2. **Procurement → Requisitions & compare → Request quotations**. Three simulated supplier quotes appear, compared on price, MOQ, lead time, on-time and quality. **Select & draft PO → Send to supplier**.
3. Switch to **Warehouse Supervisor** → **Receive goods (GRN)**. Enter a **partial** quantity and keep "Allocate to backorders" ticked → **Post GRN**. Click **Open 3D** in the toast to watch the crate move from the dock to the bin. If the PO cost differs, a *proposed* cost version is raised; it is not applied automatically.
4. **Inventory → Picking**: start the Teratai order, tap **Pick** on each bin (or scan a barcode), then **Pack as delivery**.
5. **Delivery**: **Schedule load** (capacity check) → **Dispatch** → **Confirm delivery** with a typed signature (and optionally a photo). Download the **DO PDF**. The invoice is issued automatically. Mention self-pickup tokens for counter collection.

## 6. Executive insights — 1 min (Scenario F + E teaser)

1. **Analytics**: weekly margin % with the floor line. Click **Industrial & Steel**: margin has slipped. **Cost shock pass-through** shows that only part of each steel increase reached the price list. Drill to the products, then open price history.
2. **Operations insights** tab: every insight shows the rule that produced it (transparent rules, not AI).
3. Export **CSV** / **PDF summary**.
4. *(If time allows)* **Customers → Zamrud Home Improvement**: over limit with an overdue invoice. Converting their accepted quote puts the order on **credit hold** until Finance overrides; recording a payment updates ageing immediately.

---

### Closing talking points

- One dataset: a cost change, receipt, delivery or payment shows up in every module at once.
- Controls the client asked for: daily price changes are governed by approvals, issued quotes are never silently changed, stock is never negative, and everything is audited.
- Before production we would need their accounting package, real price rules, warehouse layout, SST / e-Invoice position, user accounts, and a shared backend with real authentication (see `ASSUMPTIONS_AND_PRODUCTION_GAPS.md`).

### Recovery tips

- Something odd? **Settings → Demo data → Reset**, or use **Restart on clean data** on any Demo Tour card.
- A button shows a lock? Your demo role lacks the permission; click it to switch roles.
- Browser storage blocked (some private windows)? A yellow banner appears and data resets when the tab closes. Everything still works.
