-- Core schema contract generated from PRD/docs for local validation.
-- This file is intentionally SQL-first and provider-agnostic.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'growth',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  marketplace_id TEXT NOT NULL,
  seller_id TEXT,
  region TEXT,
  sp_api_refresh_token_enc TEXT,
  ads_api_refresh_token_enc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  asin TEXT NOT NULL,
  sku TEXT NOT NULL,
  title TEXT,
  brand TEXT,
  category TEXT,
  lifecycle_stage TEXT,
  launched_at TIMESTAMPTZ
);

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  title TEXT,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  a_plus_html TEXT,
  image_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE search_terms (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  term TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  date DATE NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  amazon_order_id TEXT NOT NULL,
  ordered_at TIMESTAMPTZ,
  status TEXT,
  total_amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  item_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  fees_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE financial_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  event_type TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  posted_at TIMESTAMPTZ,
  related_order_id TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE profit_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  date DATE NOT NULL,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  fees NUMERIC(14,2) NOT NULL DEFAULT 0,
  ad_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_provision NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs NUMERIC(14,2) NOT NULL DEFAULT 0,
  freight NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  fx_loss NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_costs NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit_margin NUMERIC(8,4) NOT NULL DEFAULT 0,
  accuracy JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ad_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  ad_type TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT,
  daily_budget NUMERIC(14,2),
  state TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE inventory_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  fnsku TEXT,
  date DATE NOT NULL,
  available INTEGER NOT NULL DEFAULT 0,
  inbound INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  in_stock_days INTEGER
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  asin TEXT NOT NULL,
  rating INTEGER NOT NULL,
  title TEXT,
  body TEXT,
  reviewer_hash TEXT,
  posted_at TIMESTAMPTZ,
  verified_purchase BOOLEAN,
  sentiment TEXT,
  cluster_tag TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE competitor_products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  our_product_id TEXT NOT NULL REFERENCES products(id),
  competitor_asin TEXT NOT NULL,
  added_by TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_auto_recommended BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE competitor_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  competitor_asin TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  price NUMERIC(14,2),
  bsr INTEGER,
  review_count INTEGER,
  avg_rating NUMERIC(4,2),
  content_hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
  promotions JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE ai_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL,
  product_id TEXT,
  decision_type TEXT NOT NULL,
  context JSONB NOT NULL,
  recommendation JSONB NOT NULL,
  reasoning JSONB NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  executed_by TEXT,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE anomalies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  store_id TEXT REFERENCES stores(id),
  product_id TEXT REFERENCES products(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT,
  channel TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  action_taken_at TIMESTAMPTZ
);
