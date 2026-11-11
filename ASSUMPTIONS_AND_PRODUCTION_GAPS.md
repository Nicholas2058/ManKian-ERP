# Assumptions & production gaps

This demo is designed to *show* how MK Hardware's operations could be controlled in one connected system. This document separates verified public facts from assumptions, and lists what a production system would need.

## 1. What was taken from public sources

From the official website (www.mkhardware.com.my), read during the build:

- Legal name **Man Kian Hardware & Trading Sdn Bhd**, registration **201401023990 (1100078-X)**, address **26, Jalan BP 5/2, Bandar Bukit Puchong, 47100 Puchong, Selangor**. These appear on sample PDFs only.
- Product categories and example product types (PVC/uPVC pipe, chemical anchor, rubber bearing pad, concrete paver, ventilation block, geotextile, IBC tank, safety items, power and hand tools, roofing, storage). The demo's 143 SKUs are **illustrative** versions of these types.
- Brands mentioned on the site (e.g. Sika, HILTI, BINA PLASTIC, BOSCH, MAKITA, DeWALT, HIKOKI, BAHCO, 3M, FOSROC, MAPEI, WURTH, PYE). They are used as product brand names only.
- The site's notice that MK Hardware has not authorised third-party platforms to display its products or pricing. The demo therefore has **no public price list**; the customer-facing preview shows "Price on request".
- Delivery and self-pickup services; the website is built on NEWPAGES.

## 2. Assumptions in the demo (to verify)

| Area | Demo assumption | To confirm with the client |
|---|---|---|
| Company structure | One company, one illustrative warehouse (zones A/B/C, receiving, dispatch, quarantine) | Real branches, warehouses, yard/outdoor storage, rack types and bin labelling |
| Products | 143 SKUs, 14 brands, specs and pack sizes illustrative | Actual item master, variants, UOMs and conversions, barcodes, datasheets, images and usage rights |
| Costs & prices | Fictional; category rules (target margin 20–35%, floors 10–15%), 5-sen price endings, tier discounts walk-in / trade / contractor / key / project, volume breaks | Real pricing method (margin, markup, fixed lists), tiers, contract and tender pricing, who approves which thresholds, rounding and price-ending conventions |
| Price changes | Supplier cost updates raise proposals; approval updates the list price; drafts are flagged; issued quotes keep their snapshot | How supplier updates arrive (WhatsApp, email, Excel, PDF, portal); which items change daily; whether some costs are contract-fixed |
| Quotations | Validity options of same day / 3 / 7 / 14 days; acceptance does not reserve stock; re-issuing an expired quote needs approval | Their real validity rules and quote templates/terms; whether acceptance should reserve stock and for how long |
| Reservations | Explicit action, held until required date + 5 days; flagged (not auto-released) when expired | Hold policy and auto-release rules |
| Credit | Limits, terms and an overdue block of 60 days; Finance/Owner override | Real limits, deposit rules, approval matrix |
| Tax | SST **not configured** (0%) by default; configurable label and rate | SST registration status, taxable items, rates and exemptions — confirm with their tax adviser |
| Invoicing | Auto-invoice on delivery/collection (configurable) | Invoice timing (per DO, consolidated, progress billing), numbering, templates |
| Delivery | 4 fictional vehicles and drivers, recorded weights, simulated route progress | Own fleet vs third-party, POD practice, zones and delivery charges |
| Procurement | Supplier quotations simulated deterministically; 3-way match tolerance 1% | Real supplier list, MOQ, lead times, import/FX exposure, approval of POs |

## 3. Production gaps (what the demo deliberately does not do)

### Security, users and data

- **Authentication and authorisation.** The role switcher is a browser simulation, not security. Production needs real sign-in (e.g. Cloudflare Access or an identity provider), server-side role checks, and per-user audit attribution.
- **Shared, durable data.** Demo data is per browser and per device, with no backup, sync or multi-user concurrency. Production needs a server database (e.g. Cloudflare D1 behind authenticated Pages Functions; see `integrations/d1-prototype`), backups, and migrations.
- **Data protection.** Production would handle real customer contacts and financial data. That needs a PDPA (Malaysia) review, access controls, retention rules and secure hosting. Static JavaScript cannot hide data.
- **Concurrency and integrity at scale.** Commands would run on the server inside transactions with optimistic locking. Price approvals, stock reservations and payments must be serialised server-side.

### Integrations (none connected)

| Integration | Needed for production |
|---|---|
| Accounting (AutoCount, SQL Accounting, UBS or other) | Confirmation of the package and edition (desktop or cloud), chart of accounts, tax codes, customer/supplier code mapping, import format or API access |
| LHDN MyInvois (e-Invoice) | Tax configuration, credentials, official sandbox testing, buyer TIN capture, consolidated vs individual e-Invoice policy |
| WhatsApp Business | Approved WhatsApp Business API account (or a manual copy/paste process), message templates, consent handling |
| Website (NEWPAGES) | Official export/API access, or a CSV feed. The public site must keep "Price on request" (no public fixed prices) |
| Email | Transactional email provider and approved sender domain for quotations, POs and reminders |
| Payments | Bank feeds or a payment gateway (DuitNow/FPX) if online collection is wanted; card acquiring is out of scope |
| Barcode/label printing | Label format (EAN/Code128), printers and handheld scanners |
| Maps | Licensed tile provider if live maps are wanted (MapLibre is open source; tiles are not) |
| FX | Bank Negara Malaysia or the bank's rates for import costing; manual approval of any conversion |

### Functional gaps

- Multi-warehouse transfers, lot/serial traceability, expiry dates and cycle-count scheduling are only partially modelled.
- Supplier bills, purchase returns, GL, expenses, payroll and full financial statements are out of scope (accounting system).
- Real route optimisation and GPS tracking are not included (the route is diagrammatic and the forklift is an animation).
- The enquiry parser is rule-based keyword and size matching. An AI model could be added later, but only if clearly labelled.
- Translations: English is complete; Bahasa Melayu and Simplified Chinese cover navigation, dashboard and quotation essentials and need native-speaker review.
- Accessibility and performance were checked in Chromium. A formal WCAG audit and device lab testing (iOS Safari, low-end Android) are recommended.

## 4. Discovery questions for the client

1. Which accounting package do you use (AutoCount, SQL Accounting, UBS, other)? Desktop or cloud? Who maintains it?
2. How do you quote today (Excel, manual, POS, an existing ERP)? Can we see a recent quotation and invoice template?
3. Where do supplier price updates arrive (WhatsApp, email, spreadsheet, PDF, supplier portal), how often, and who approves selling-price changes?
4. Do prices change daily for every product or only some categories (steel, PVC, cement, copper)? Are some costs fixed by project contract?
5. How are selling prices set: fixed margin, markup, wholesale tiers, per-customer agreements, negotiated discounts, tenders?
6. Does accepting a quote reserve stock? For how long? What happens when a quote expires or is cancelled?
7. How many active SKUs, warehouse locations, bins, suppliers, users and drivers? Do you use barcodes today?
8. How are out-of-stock items sourced, how are lead times promised, and is direct-to-site supplier delivery common?
9. Own fleet, third-party lorries, or both? How are proof of delivery and self-pickup recorded today?
10. What are your credit terms, approval limits, deposit rules and payment methods? What is your SST and e-Invoice position and timeline?
11. How should the website integrate with NEWPAGES? Can NEWPAGES provide exports or API access?
12. May we use the official MK Hardware logo and product photos in the demo and the final system?

## 5. Suggested path to production

1. Discovery workshop (questions above) and data samples (item master, price lists, customers, open orders).
2. Shared backend: authenticated Pages Functions + D1 (or another managed database), with the existing domain commands moved server-side.
3. Import real master data through the CSV import flows (catalog, supplier costs), with validation.
4. Pilot with one team (e.g. sales + pricing), then warehouse and delivery, then finance integration.
5. Accounting and e-Invoice integration once the package, credentials and sandbox are available.
