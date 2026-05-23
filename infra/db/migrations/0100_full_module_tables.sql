-- Full module schema extension for M1/M2/M3/M4, commercialization, and audit.
-- Uses TEXT ids to remain compatible with existing provider-agnostic migrations.

CREATE TABLE IF NOT EXISTS module_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  assignee_user_id TEXT REFERENCES users(id),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS data_freshness_checks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  source_name TEXT NOT NULL,
  source_table TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  freshness_at TIMESTAMPTZ,
  max_age_minutes INTEGER NOT NULL DEFAULT 1440,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  is_mock BOOLEAN NOT NULL DEFAULT true,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'ok'
);

CREATE TABLE IF NOT EXISTS listing_diagnoses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  listing_id TEXT REFERENCES listings(id),
  score_total NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_keyword NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_conversion NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_compliance NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_competition NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_readability NUMERIC(5,2) NOT NULL DEFAULT 0,
  improvement_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  diagnosed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS listing_iterations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  base_listing_version_id TEXT,
  current_round INTEGER NOT NULL DEFAULT 0,
  objective TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  selected_diagnosis_id TEXT REFERENCES listing_diagnoses(id),
  guardrails JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_by TEXT REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS iteration_rounds (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  iteration_id TEXT NOT NULL REFERENCES listing_iterations(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  target_field TEXT NOT NULL,
  prompt_version TEXT,
  user_instruction TEXT,
  ai_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_option JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_feedback TEXT,
  score_before NUMERIC(5,2),
  score_after NUMERIC(5,2),
  reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'generated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listing_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  iteration_id TEXT REFERENCES listing_iterations(id),
  version_number INTEGER NOT NULL,
  title TEXT,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  a_plus_html TEXT,
  image_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  compliance_status TEXT NOT NULL DEFAULT 'unchecked',
  publish_status TEXT NOT NULL DEFAULT 'draft',
  published_audit_id TEXT,
  rollback_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ab_experiments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  listing_version_id TEXT REFERENCES listing_versions(id),
  experiment_name TEXT NOT NULL,
  hypothesis TEXT,
  variant_a JSONB NOT NULL DEFAULT '{}'::jsonb,
  variant_b JSONB NOT NULL DEFAULT '{}'::jsonb,
  traffic_split JSONB NOT NULL DEFAULT '{}'::jsonb,
  primary_metric TEXT NOT NULL DEFAULT 'cvr',
  status TEXT NOT NULL DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  results JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS listing_user_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  tone TEXT,
  banned_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  locale TEXT NOT NULL DEFAULT 'en-US',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keyword_library (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  keyword TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en-US',
  intent TEXT,
  source TEXT NOT NULL DEFAULT 'mock',
  search_volume INTEGER,
  relevance_score NUMERIC(5,2),
  conversion_score NUMERIC(5,2),
  competition_score NUMERIC(5,2),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS image_generations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  listing_version_id TEXT REFERENCES listing_versions(id),
  image_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  input_asset_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_asset_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  compliance_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  copyright_risk TEXT NOT NULL DEFAULT 'unknown',
  generation_provider TEXT NOT NULL DEFAULT 'mock',
  status TEXT NOT NULL DEFAULT 'generated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listing_category_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  category TEXT NOT NULL,
  marketplace_id TEXT NOT NULL DEFAULT 'ATVPDKIKX0DER',
  score_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  compliance_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_costs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  cost_type TEXT NOT NULL DEFAULT 'cogs',
  amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_from DATE NOT NULL,
  effective_to DATE,
  source TEXT NOT NULL DEFAULT 'user_input',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_logistics_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT UNIQUE NOT NULL REFERENCES products(id),
  lead_time_days INTEGER NOT NULL DEFAULT 45,
  safety_stock_days INTEGER NOT NULL DEFAULT 14,
  reorder_cycle_days INTEGER NOT NULL DEFAULT 30,
  min_order_quantity INTEGER NOT NULL DEFAULT 0,
  carton_units INTEGER,
  storage_volume_cbm NUMERIC(14,4),
  freight_per_unit NUMERIC(14,4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_profits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  order_item_id TEXT REFERENCES order_items(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  amazon_fees NUMERIC(14,2) NOT NULL DEFAULT 0,
  ad_cost_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs NUMERIC(14,2) NOT NULL DEFAULT 0,
  freight NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  fx_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit_margin NUMERIC(8,4) NOT NULL DEFAULT 0,
  calculation_version INTEGER NOT NULL DEFAULT 1,
  accuracy_level TEXT NOT NULL DEFAULT 'estimated',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leak_points (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  leak_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  estimated_monthly_impact NUMERIC(14,2) NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendation JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventory_forecasts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  forecast_date DATE NOT NULL,
  horizon_days INTEGER NOT NULL DEFAULT 30,
  p50_units INTEGER NOT NULL DEFAULT 0,
  p90_units INTEGER NOT NULL DEFAULT 0,
  mape NUMERIC(8,4),
  model_version TEXT NOT NULL DEFAULT 'mock-v1',
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reorder_recommendations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  forecast_id TEXT REFERENCES inventory_forecasts(id),
  recommended_units INTEGER NOT NULL DEFAULT 0,
  recommended_ship_date DATE,
  expected_stockout_date DATE,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  cash_required NUMERIC(14,2) NOT NULL DEFAULT 0,
  reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  audit_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slow_moving_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  inventory_age_days INTEGER NOT NULL DEFAULT 0,
  excess_units INTEGER NOT NULL DEFAULT 0,
  recommendation_type TEXT NOT NULL,
  expected_recovery_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  audit_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repricing_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  current_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  recommended_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_margin NUMERIC(8,4) NOT NULL DEFAULT 0,
  competitor_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  audit_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_terms TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  lead_time_days INTEGER,
  quality_score NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_pricing (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  min_quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  effective_from DATE NOT NULL,
  effective_to DATE
);

CREATE TABLE IF NOT EXISTS purchase_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  supplier_id TEXT REFERENCES suppliers(id),
  batch_code TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  landed_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  received_at DATE,
  remaining_units INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS order_batch_matches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  purchase_batch_id TEXT NOT NULL REFERENCES purchase_batches(id),
  matched_units INTEGER NOT NULL DEFAULT 0,
  matched_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'fifo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  supplier_id TEXT REFERENCES suppliers(id),
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  expected_ship_date DATE,
  expected_arrival_date DATE,
  payment_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  landed_cost_estimate NUMERIC(14,4) NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS cashflow_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  store_id TEXT REFERENCES stores(id),
  product_id TEXT REFERENCES products(id),
  source_type TEXT NOT NULL,
  source_id TEXT,
  event_date DATE NOT NULL,
  direction TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'planned',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS payment_channels_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL DEFAULT 'mock',
  settlement_currency TEXT NOT NULL DEFAULT 'USD',
  fee_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  fx_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  store_id TEXT REFERENCES stores(id),
  channel_config_id TEXT REFERENCES payment_channels_config(id),
  requested_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  received_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  fx_rate NUMERIC(14,6),
  requested_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS custom_alert_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'medium',
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_dimensions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT UNIQUE NOT NULL REFERENCES products(id),
  portfolio TEXT,
  seasonality TEXT,
  lifecycle_stage_override TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  budget_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  actual_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS inventory_transfer_recommendations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  recommended_units INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  expected_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  audit_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sku_lifecycle (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT UNIQUE NOT NULL REFERENCES products(id),
  current_stage TEXT NOT NULL DEFAULT 'unknown',
  stage_confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  stage_started_at DATE,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  strategy_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lifecycle_transitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id),
  external_ad_group_id TEXT NOT NULL,
  name TEXT,
  default_bid NUMERIC(14,2),
  state TEXT NOT NULL DEFAULT 'enabled',
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_targets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id),
  ad_group_id TEXT REFERENCES ad_groups(id),
  target_type TEXT NOT NULL,
  keyword_text TEXT,
  match_type TEXT,
  asin TEXT,
  bid NUMERIC(14,2),
  state TEXT NOT NULL DEFAULT 'enabled',
  performance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_suggestions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  campaign_id TEXT REFERENCES ad_campaigns(id),
  target_id TEXT REFERENCES ad_targets(id),
  lifecycle_stage TEXT,
  action_type TEXT NOT NULL,
  recommendation JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasoning JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium',
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  audit_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auto_execution_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL DEFAULT 'M3',
  suggestion_id TEXT REFERENCES ad_suggestions(id),
  audit_id TEXT,
  provider TEXT NOT NULL DEFAULT 'mock',
  action_type TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'mocked',
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_structure_health (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  campaign_id TEXT REFERENCES ad_campaigns(id),
  health_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_allocations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  campaign_id TEXT REFERENCES ad_campaigns(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  recommended_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  allocation_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  audit_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  campaign_id TEXT REFERENCES ad_campaigns(id),
  creative_type TEXT NOT NULL,
  headline TEXT,
  asset_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  compliance_status TEXT NOT NULL DEFAULT 'unchecked',
  performance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creative_ab_tests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  creative_a_id TEXT REFERENCES ad_creatives(id),
  creative_b_id TEXT REFERENCES ad_creatives(id),
  campaign_id TEXT REFERENCES ad_campaigns(id),
  hypothesis TEXT,
  primary_metric TEXT NOT NULL DEFAULT 'ctr',
  status TEXT NOT NULL DEFAULT 'draft',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  results JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS keyword_rankings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  keyword TEXT NOT NULL,
  organic_rank INTEGER,
  sponsored_rank INTEGER,
  marketplace_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'mock',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_ad_link_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL REFERENCES tenants(id),
  low_stock_action TEXT NOT NULL DEFAULT 'reduce_budget',
  stockout_action TEXT NOT NULL DEFAULT 'pause_ads',
  overstock_action TEXT NOT NULL DEFAULT 'increase_budget',
  thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_query_performance (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  query TEXT NOT NULL,
  asin TEXT,
  date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cart_adds INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS auto_mode_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL REFERENCES tenants(id),
  default_mode TEXT NOT NULL DEFAULT 'semi_auto',
  module_modes JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_single_amount NUMERIC(14,2) NOT NULL DEFAULT 500,
  daily_operation_limit INTEGER NOT NULL DEFAULT 50,
  sku_exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dayparting_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  bid_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  audit_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS dedup_key TEXT;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS auto_executable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS audit_id TEXT;

CREATE TABLE IF NOT EXISTS anomaly_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  root_cause_type TEXT NOT NULL,
  title TEXT NOT NULL,
  related_anomaly_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  impact_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS assignment_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  anomaly_type TEXT,
  severity TEXT,
  module TEXT NOT NULL DEFAULT 'M4',
  assignee_user_id TEXT REFERENCES users(id),
  escalation_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hijacking_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  asin TEXT NOT NULL,
  seller_name TEXT,
  buy_box_owner TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'high',
  status TEXT NOT NULL DEFAULT 'open',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS infringement_alerts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  competitor_asin TEXT,
  infringement_type TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitor_image_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  competitor_asin TEXT NOT NULL,
  image_slot TEXT NOT NULL DEFAULT 'main',
  before_hash TEXT,
  after_hash TEXT NOT NULL,
  similarity_score NUMERIC(5,4),
  change_summary TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resolution_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  anomaly_type TEXT NOT NULL,
  scenario_summary TEXT NOT NULL,
  scenario_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  related_anomaly_id TEXT REFERENCES anomalies(id),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS postmortems (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  related_group_id TEXT REFERENCES anomaly_groups(id),
  title TEXT NOT NULL,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  root_cause TEXT,
  impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sla_metrics (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  anomaly_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  detected_count INTEGER NOT NULL DEFAULT 0,
  acknowledged_p95_minutes NUMERIC(10,2),
  resolved_p95_minutes NUMERIC(10,2),
  breach_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS review_clusters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  product_id TEXT REFERENCES products(id),
  cluster_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sentiment TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  sample_review_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  insight JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 1,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_appeals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  review_id TEXT NOT NULL REFERENCES reviews(id),
  appeal_reason TEXT NOT NULL,
  draft_text TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  audit_id TEXT,
  submitted_at TIMESTAMPTZ,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_emails (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  review_id TEXT REFERENCES reviews(id),
  product_id TEXT REFERENCES products(id),
  recipient_hash TEXT NOT NULL,
  template_key TEXT NOT NULL,
  draft_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  audit_id TEXT,
  sent_at TIMESTAMPTZ,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitor_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  competitor_asin TEXT NOT NULL,
  our_product_id TEXT REFERENCES products(id),
  change_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  before_snapshot_id TEXT,
  after_snapshot_id TEXT,
  change_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  strategy_inferred TEXT,
  recommended_responses JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id),
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity_threshold TEXT NOT NULL DEFAULT 'medium',
  quiet_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  routing_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  plan_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  monthly_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  store_limit INTEGER,
  sku_limit INTEGER,
  seat_limit INTEGER,
  api_access BOOLEAN NOT NULL DEFAULT false,
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  quota_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  payment_provider TEXT NOT NULL DEFAULT 'mock',
  provider_subscription_id TEXT,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  subscription_id TEXT REFERENCES tenant_subscriptions(id),
  metric_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  used_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  included_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  overage_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  subscription_id TEXT REFERENCES tenant_subscriptions(id),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  provider_invoice_id TEXT
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL DEFAULT 'mock',
  provider_payment_method_id TEXT,
  method_type TEXT NOT NULL DEFAULT 'card',
  display_name TEXT,
  billing_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'mocked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trial_conversions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  subscription_id TEXT REFERENCES tenant_subscriptions(id),
  funnel_stage TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operation_conflicts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  conflict_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS rollback_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  audit_log_id TEXT NOT NULL REFERENCES audit_center_logs(id),
  rollback_type TEXT NOT NULL,
  reverse_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS circuit_breakers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  module TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'closed',
  reason TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_outcome_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  audit_log_id TEXT NOT NULL REFERENCES audit_center_logs(id),
  horizon_days INTEGER NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_center_logs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE audit_center_logs ADD COLUMN IF NOT EXISTS before_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE audit_center_logs ADD COLUMN IF NOT EXISTS reverse_action JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE audit_center_logs ADD COLUMN IF NOT EXISTS conflict_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE audit_center_logs ADD COLUMN IF NOT EXISTS sovereignty_mode TEXT NOT NULL DEFAULT 'manual';
