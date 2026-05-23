-- Full module analytics schema for ClickHouse.

CREATE TABLE IF NOT EXISTS analytics_events (
  tenant_id String,
  event_id String,
  module LowCardinality(String),
  event_type LowCardinality(String),
  actor_id String,
  subject_type LowCardinality(String),
  subject_id String,
  source LowCardinality(String),
  is_mock UInt8,
  confidence Float64,
  payload String,
  occurred_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (tenant_id, module, event_type, occurred_at, event_id);

CREATE TABLE IF NOT EXISTS listing_iteration_events (
  tenant_id String,
  product_id String,
  iteration_id String,
  round_id String,
  event_type LowCardinality(String),
  score_before Float64,
  score_after Float64,
  accepted UInt8,
  payload String,
  occurred_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (tenant_id, product_id, iteration_id, occurred_at);

CREATE TABLE IF NOT EXISTS order_profits_ck (
  tenant_id String,
  product_id String,
  order_id String,
  order_item_id String,
  ordered_at DateTime,
  revenue Decimal(14, 2),
  amazon_fees Decimal(14, 2),
  ad_cost_allocated Decimal(14, 2),
  cogs Decimal(14, 2),
  freight Decimal(14, 2),
  net_profit Decimal(14, 2),
  profit_margin Float64,
  accuracy_level LowCardinality(String),
  calculation_version UInt32,
  computed_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ordered_at)
ORDER BY (tenant_id, product_id, ordered_at, order_id, order_item_id);

CREATE TABLE IF NOT EXISTS inventory_daily_facts (
  tenant_id String,
  product_id String,
  date Date,
  available Int64,
  inbound Int64,
  reserved Int64,
  forecast_p50 Int64,
  forecast_p90 Int64,
  stockout_risk Float64,
  stale_risk Float64,
  payload String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, product_id, date);

CREATE TABLE IF NOT EXISTS ad_target_metrics_daily (
  tenant_id String,
  product_id String,
  campaign_id String,
  ad_group_id String,
  target_id String,
  keyword_text String,
  date Date,
  impressions UInt64,
  clicks UInt64,
  spend Decimal(14, 2),
  sales Decimal(14, 2),
  orders UInt64,
  acos Float64,
  roas Float64,
  profit_roas Float64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, product_id, campaign_id, target_id, date);

CREATE TABLE IF NOT EXISTS lifecycle_daily_facts (
  tenant_id String,
  product_id String,
  date Date,
  lifecycle_stage LowCardinality(String),
  stage_confidence Float64,
  sales Decimal(14, 2),
  units UInt64,
  ad_spend Decimal(14, 2),
  tacos Float64,
  conversion_rate Float64,
  payload String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, product_id, date);

CREATE TABLE IF NOT EXISTS anomaly_events (
  tenant_id String,
  anomaly_id String,
  anomaly_type LowCardinality(String),
  severity LowCardinality(String),
  product_id String,
  status LowCardinality(String),
  dedup_key String,
  payload String,
  detected_at DateTime,
  resolved_at Nullable(DateTime)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(detected_at)
ORDER BY (tenant_id, anomaly_type, severity, detected_at, anomaly_id);

CREATE TABLE IF NOT EXISTS review_cluster_events (
  tenant_id String,
  product_id String,
  cluster_id String,
  cluster_key String,
  sentiment LowCardinality(String),
  review_count UInt64,
  payload String,
  computed_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(computed_at)
ORDER BY (tenant_id, product_id, cluster_key, computed_at);

CREATE TABLE IF NOT EXISTS competitor_change_events (
  tenant_id String,
  competitor_asin String,
  our_product_id String,
  change_id String,
  change_type LowCardinality(String),
  severity LowCardinality(String),
  payload String,
  detected_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(detected_at)
ORDER BY (tenant_id, competitor_asin, change_type, detected_at, change_id);

CREATE TABLE IF NOT EXISTS audit_action_events (
  tenant_id String,
  audit_log_id String,
  module LowCardinality(String),
  action_type LowCardinality(String),
  status LowCardinality(String),
  sovereignty_mode LowCardinality(String),
  risk_level LowCardinality(String),
  expected_impact String,
  outcome String,
  occurred_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (tenant_id, module, action_type, status, occurred_at, audit_log_id);

CREATE TABLE IF NOT EXISTS billing_usage_events (
  tenant_id String,
  subscription_id String,
  metric_key LowCardinality(String),
  used_amount Float64,
  included_amount Float64,
  overage_amount Float64,
  payload String,
  occurred_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (tenant_id, metric_key, occurred_at);
