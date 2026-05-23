CREATE TABLE order_profit_facts (
  tenant_id String,
  product_id String,
  order_id String,
  ordered_at DateTime,
  revenue Decimal(14, 2),
  total_costs Decimal(14, 2),
  net_profit Decimal(14, 2),
  profit_margin Float64,
  accuracy_level String,
  computed_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ordered_at)
ORDER BY (tenant_id, product_id, ordered_at, order_id);

CREATE TABLE ad_metrics_daily (
  tenant_id String,
  product_id String,
  campaign_id String,
  date Date,
  impressions UInt64,
  clicks UInt64,
  spend Decimal(14, 2),
  sales Decimal(14, 2),
  orders UInt64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, product_id, campaign_id, date);
