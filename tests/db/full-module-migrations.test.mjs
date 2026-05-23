import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const readSql = (dir) => fs.readdirSync(path.join(process.cwd(), dir))
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => fs.readFileSync(path.join(process.cwd(), dir, file), 'utf8'))
  .join('\n');

const pgSql = readSql('infra/db/migrations');
const chSql = readSql('infra/clickhouse/migrations');

function createTableBlock(sql, table) {
  const pattern = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\(([\\s\\S]*?)\\);`, 'i');
  return sql.match(pattern)?.[1] ?? '';
}

function hasTable(sql, table) {
  return new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, 'i').test(sql);
}

function hasColumn(sql, table, column) {
  const block = createTableBlock(sql, table);
  const inCreate = new RegExp(`\\b${column}\\b`, 'i').test(block);
  const inAlter = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${column}\\b`, 'i').test(sql);
  return inCreate || inAlter;
}

function assertTableColumns(sql, table, columns) {
  assert.ok(hasTable(sql, table), `missing table ${table}`);
  for (const column of columns) {
    assert.ok(hasColumn(sql, table, column), `missing column ${table}.${column}`);
  }
}

test('Postgres full-module migrations include M1 listing optimization tables and fields', () => {
  assertTableColumns(pgSql, 'listing_diagnoses', [
    'tenant_id', 'product_id', 'score_total', 'improvement_points', 'evidence', 'confidence',
  ]);
  assertTableColumns(pgSql, 'listing_iterations', [
    'tenant_id', 'product_id', 'current_round', 'selected_diagnosis_id', 'guardrails',
  ]);
  assertTableColumns(pgSql, 'iteration_rounds', [
    'iteration_id', 'round_number', 'target_field', 'ai_options', 'score_before', 'score_after',
  ]);
  assertTableColumns(pgSql, 'listing_versions', [
    'product_id', 'version_number', 'image_refs', 'compliance_status', 'publish_status', 'rollback_snapshot',
  ]);
  assertTableColumns(pgSql, 'image_generations', [
    'product_id', 'prompt', 'output_asset_refs', 'compliance_checks', 'copyright_risk', 'generation_provider',
  ]);
});

test('Postgres full-module migrations include M2 profit, inventory, purchasing, and cashflow tables', () => {
  assertTableColumns(pgSql, 'product_costs', ['tenant_id', 'product_id', 'cost_type', 'amount', 'effective_from']);
  assertTableColumns(pgSql, 'order_profits', [
    'order_id', 'product_id', 'revenue', 'amazon_fees', 'ad_cost_allocated', 'net_profit', 'accuracy_level',
  ]);
  assertTableColumns(pgSql, 'leak_points', [
    'leak_type', 'estimated_monthly_impact', 'evidence', 'recommendation', 'confidence',
  ]);
  assertTableColumns(pgSql, 'inventory_forecasts', [
    'product_id', 'forecast_date', 'p50_units', 'p90_units', 'mape', 'model_version',
  ]);
  assertTableColumns(pgSql, 'purchase_orders', [
    'supplier_id', 'po_number', 'status', 'total_amount', 'payment_schedule', 'audit_id',
  ]);
  assertTableColumns(pgSql, 'cashflow_events', [
    'source_type', 'event_date', 'direction', 'amount', 'currency', 'status',
  ]);
});

test('Postgres full-module migrations include M3 lifecycle ads tables and audit-linked fields', () => {
  assertTableColumns(pgSql, 'sku_lifecycle', [
    'product_id', 'current_stage', 'stage_confidence', 'signals', 'strategy_profile',
  ]);
  assertTableColumns(pgSql, 'ad_targets', [
    'campaign_id', 'ad_group_id', 'target_type', 'keyword_text', 'bid', 'performance_snapshot',
  ]);
  assertTableColumns(pgSql, 'ad_suggestions', [
    'action_type', 'recommendation', 'expected_impact', 'reasoning', 'confidence', 'audit_id',
  ]);
  assertTableColumns(pgSql, 'budget_allocations', [
    'recommended_budget', 'current_budget', 'allocation_reason', 'status', 'audit_id',
  ]);
  assertTableColumns(pgSql, 'dayparting_configs', [
    'timezone', 'schedule', 'bid_modifiers', 'is_active', 'audit_id',
  ]);
});

test('Postgres full-module migrations include M4 monitoring, review, competitor, and notification tables', () => {
  assertTableColumns(pgSql, 'anomalies', [
    'scope', 'dedup_key', 'assigned_to', 'auto_executable', 'audit_id',
  ]);
  assertTableColumns(pgSql, 'review_clusters', [
    'cluster_key', 'label', 'review_count', 'sample_review_ids', 'recommended_actions', 'confidence',
  ]);
  assertTableColumns(pgSql, 'review_appeals', [
    'review_id', 'appeal_reason', 'draft_text', 'evidence', 'audit_id', 'outcome',
  ]);
  assertTableColumns(pgSql, 'competitor_changes', [
    'competitor_asin', 'change_type', 'change_payload', 'strategy_inferred', 'recommended_responses',
  ]);
  assertTableColumns(pgSql, 'notification_preferences', [
    'user_id', 'channels', 'severity_threshold', 'quiet_hours', 'routing_rules',
  ]);
});

test('Postgres full-module migrations include commercialization and audit control tables', () => {
  assertTableColumns(pgSql, 'subscription_plans', [
    'plan_code', 'monthly_price', 'store_limit', 'sku_limit', 'feature_flags', 'quota_defaults',
  ]);
  assertTableColumns(pgSql, 'tenant_subscriptions', [
    'tenant_id', 'plan_id', 'status', 'trial_ends_at', 'payment_provider',
  ]);
  assertTableColumns(pgSql, 'usage_counters', [
    'metric_key', 'used_amount', 'included_amount', 'overage_amount',
  ]);
  assertTableColumns(pgSql, 'operation_conflicts', [
    'resource_type', 'resource_id', 'action_ids', 'conflict_type', 'resolution',
  ]);
  assertTableColumns(pgSql, 'rollback_actions', [
    'audit_log_id', 'rollback_type', 'reverse_payload', 'requested_by', 'outcome',
  ]);
  assertTableColumns(pgSql, 'circuit_breakers', [
    'module', 'scope', 'state', 'failure_count', 'opened_at', 'reset_at',
  ]);
  assert.ok(hasColumn(pgSql, 'audit_center_logs', 'reverse_action'));
  assert.ok(hasColumn(pgSql, 'audit_center_logs', 'sovereignty_mode'));
});

test('ClickHouse full-module analytics migrations include module event fact tables', () => {
  const tables = {
    analytics_events: ['tenant_id', 'module', 'event_type', 'is_mock', 'confidence', 'occurred_at'],
    listing_iteration_events: ['product_id', 'iteration_id', 'score_before', 'score_after', 'accepted'],
    order_profits_ck: ['order_id', 'ad_cost_allocated', 'net_profit', 'profit_margin', 'accuracy_level'],
    ad_target_metrics_daily: ['campaign_id', 'target_id', 'spend', 'acos', 'profit_roas'],
    anomaly_events: ['anomaly_id', 'anomaly_type', 'severity', 'dedup_key', 'resolved_at'],
    competitor_change_events: ['competitor_asin', 'change_id', 'change_type', 'severity'],
    audit_action_events: ['audit_log_id', 'module', 'action_type', 'sovereignty_mode', 'risk_level'],
    billing_usage_events: ['subscription_id', 'metric_key', 'used_amount', 'overage_amount'],
  };

  for (const [table, columns] of Object.entries(tables)) {
    assertTableColumns(chSql, table, columns);
    assert.match(createTableBlock(chSql, table) + chSql, /ENGINE\s*=\s*MergeTree/i);
  }
});
