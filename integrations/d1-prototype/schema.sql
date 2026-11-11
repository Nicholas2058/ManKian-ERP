-- FUTURE shared backend for the MK Hardware ERP (Cloudflare D1 / SQLite dialect).
-- DISABLED: not used by the demo build. Requires authentication and server-side
-- authorisation before any deployment. Money in integer sen; quantities in base units.

CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','sales_manager','sales_exec','procurement','wh_supervisor','picker','dispatcher','finance','cashier')),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  base_uom TEXT NOT NULL,
  cost_sen INTEGER NOT NULL,
  list_price_sen INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uom_conversion (
  product_id TEXT NOT NULL REFERENCES product(id),
  uom TEXT NOT NULL,
  factor REAL NOT NULL CHECK (factor > 0),
  PRIMARY KEY (product_id, uom)
);

CREATE TABLE IF NOT EXISTS price_change (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id),
  old_cost_sen INTEGER NOT NULL,
  new_cost_sen INTEGER NOT NULL,
  old_price_sen INTEGER NOT NULL,
  proposed_price_sen INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','superseded')),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES app_user(id),
  created_at TEXT NOT NULL,
  decided_by TEXT REFERENCES app_user(id),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS bin_stock (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id),
  bin_id TEXT NOT NULL,
  qty REAL NOT NULL CHECK (qty >= 0),
  status TEXT NOT NULL DEFAULT 'ok'
);

CREATE TABLE IF NOT EXISTS reservation (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES product(id),
  order_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  qty REAL NOT NULL CHECK (qty >= 0),
  status TEXT NOT NULL,
  expires_at TEXT
);

-- Quotations are stored as immutable versions (issued snapshots are never updated).
CREATE TABLE IF NOT EXISTS quote_version (
  quote_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  frozen INTEGER NOT NULL DEFAULT 0,
  issued_at TEXT,
  expires_at TEXT,
  PRIMARY KEY (quote_id, version)
);

CREATE TABLE IF NOT EXISTS audit_event (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES app_user(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_bin_stock_product ON bin_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_reservation_product ON reservation(product_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_event(entity_type, entity_id);
