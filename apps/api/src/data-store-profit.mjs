// data-store-profit.mjs — M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块
// 24 张新表：m2_orders / m2_order_costs / m2_sku_profit_snapshots / m2_cashflow_events /
//   m2_leaks / m2_scenarios / m2_inventory_snapshots / m2_reorder_recommendations /
//   m2_slow_moving_decisions / m2_inventory_transfers / m2_purchase_orders /
//   m2_purchase_order_items / m2_suppliers / m2_repricing_recommendations /
//   m2_fx_rates / m2_fx_exposures / m2_payment_channels / m2_tax_records /
//   m2_ltv_snapshots / m2_alert_rules / m2_alert_events / m2_dimensions /
//   m2_inventory_link_config / m2_inventory_link_events
//
// 所有写操作走 appendAuditLog (sourceModule='M2')。
// 风格严格对齐 data-store-listings.mjs / data-store-ads.mjs：
//   - initProfitSchema(db) 统一建表
//   - seedProfitForUser(db, userId, storeId) Mulberry32 PRNG 确定性种子
//   - PROFIT_TABLES_TO_CLEAN 给 removeUserStore() 用
//
// 跨模块联动：
//   M2 → M1: applyRepricing() 写入 m1_listing_versions(source='m2_reprice')
//   M2 → M3: triggerInventoryLink() 调用 toggleCampaign / updateCampaignBudget
//   M2 → M4: appendM4Notification() 写入轻量 m4_notifications 占位表

import { randomBytes } from 'node:crypto';
import { appendAuditLog } from './data-store.mjs';
import {
  toggleCampaign as _toggleCampaign,
  updateCampaignBudget as _updateCampaignBudget,
  listCampaigns as _listCampaigns,
} from './data-store-ads.mjs';

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return prefix + '-' + randomBytes(4).toString('hex'); }
function _j(s) { try { return JSON.parse(s); } catch { return null; } }
function _r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ============================================================
// Deterministic PRNG (mulberry32)
// ============================================================
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ============================================================
// Schema
// ============================================================
export function initProfitSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS m2_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      asin TEXT,
      sku TEXT,
      product_id TEXT,
      marketplace TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL,
      revenue REAL,
      total_costs REAL,
      net_profit REAL,
      profit_margin REAL,
      accuracy_level TEXT,
      confidence REAL,
      ordered_at TEXT,
      shipped_at TEXT,
      settled_at TEXT,
      raw TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_orders_us ON m2_orders(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_orders_sku ON m2_orders(user_id, store_id, sku);
    CREATE INDEX IF NOT EXISTS idx_m2_orders_date ON m2_orders(user_id, store_id, ordered_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_orders_oid ON m2_orders(user_id, store_id, order_id);

    CREATE TABLE IF NOT EXISTS m2_order_costs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      cost_type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      accuracy_level TEXT,
      source TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_costs_us ON m2_order_costs(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_costs_oid ON m2_order_costs(user_id, store_id, order_id);

    CREATE TABLE IF NOT EXISTS m2_sku_profit_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      asin TEXT,
      product_id TEXT,
      range_days INTEGER NOT NULL,
      revenue REAL,
      cogs REAL, fees REAL, ad_cost REAL, refund REAL, storage REAL,
      total_cost REAL, net_profit REAL, margin REAL,
      units_sold INTEGER,
      lifecycle TEXT,
      days_cover INTEGER,
      computed_at TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_skupf_us ON m2_sku_profit_snapshots(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_skupf_sku ON m2_sku_profit_snapshots(user_id, store_id, sku, range_days);

    CREATE TABLE IF NOT EXISTS m2_cashflow_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      event_date TEXT NOT NULL,
      label TEXT,
      inflow REAL DEFAULT 0,
      outflow REAL DEFAULT 0,
      balance REAL,
      source TEXT,
      ref_id TEXT,
      currency TEXT DEFAULT 'CNY',
      is_forecast INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_cf_us ON m2_cashflow_events(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_cf_date ON m2_cashflow_events(user_id, store_id, event_date);

    CREATE TABLE IF NOT EXISTS m2_leaks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      type TEXT NOT NULL,
      sku TEXT,
      asin TEXT,
      recommendation TEXT,
      evidence TEXT,
      monthly_impact REAL,
      confidence REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      fixed_actual_saving REAL,
      audit_id TEXT,
      detected_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_leaks_us ON m2_leaks(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_leaks_st ON m2_leaks(user_id, store_id, status, severity);

    CREATE TABLE IF NOT EXISTS m2_scenarios (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT,
      sku TEXT,
      baseline TEXT NOT NULL,
      variables TEXT NOT NULL,
      result TEXT,
      preset TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_sc_us ON m2_scenarios(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m2_inventory_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      asin TEXT,
      product_id TEXT,
      warehouse TEXT NOT NULL,
      on_hand INTEGER DEFAULT 0,
      reserved INTEGER DEFAULT 0,
      inbound INTEGER DEFAULT 0,
      available INTEGER DEFAULT 0,
      unit_cost REAL,
      daily_velocity REAL,
      days_cover INTEGER,
      in_stock_days INTEGER,
      lts_countdown_days INTEGER,
      snapshot_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_inv_us ON m2_inventory_snapshots(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_inv_sku ON m2_inventory_snapshots(user_id, store_id, sku);

    CREATE TABLE IF NOT EXISTS m2_reorder_recommendations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      product_id TEXT,
      urgency TEXT NOT NULL,
      recommended_qty INTEGER NOT NULL,
      capital_required REAL,
      days_remaining INTEGER,
      forecast_daily REAL,
      lead_days INTEGER,
      safety_days INTEGER,
      supplier_id TEXT,
      po_draft_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      computed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_re_us ON m2_reorder_recommendations(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_re_st ON m2_reorder_recommendations(user_id, store_id, status, urgency);

    CREATE TABLE IF NOT EXISTS m2_slow_moving_decisions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      asin TEXT,
      inventory INTEGER,
      inventory_value REAL,
      monthly_storage_cost REAL,
      capital_lock_cost_yearly REAL,
      in_stock_days INTEGER,
      lts_countdown_days INTEGER,
      options TEXT NOT NULL,
      recommended_option TEXT,
      selected_option TEXT,
      executed_at TEXT,
      audit_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_slow_us ON m2_slow_moving_decisions(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_slow_st ON m2_slow_moving_decisions(user_id, store_id, status);

    CREATE TABLE IF NOT EXISTS m2_inventory_transfers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      from_warehouse TEXT NOT NULL,
      to_warehouse TEXT NOT NULL,
      transfer_qty INTEGER NOT NULL,
      transfer_cost REAL,
      repurchase_cost REAL,
      savings REAL,
      reason TEXT,
      lead_days INTEGER DEFAULT 7,
      status TEXT NOT NULL DEFAULT 'recommended',
      approved_at TEXT,
      received_at TEXT,
      audit_id TEXT,
      detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_xfer_us ON m2_inventory_transfers(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_xfer_st ON m2_inventory_transfers(user_id, store_id, status);

    CREATE TABLE IF NOT EXISTS m2_purchase_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      po_number TEXT NOT NULL,
      supplier_id TEXT,
      supplier_name TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      total_landed REAL,
      currency TEXT DEFAULT 'USD',
      shipping_method TEXT,
      tracking TEXT,
      deposit REAL,
      deposit_paid INTEGER DEFAULT 0,
      balance REAL,
      balance_paid INTEGER DEFAULT 0,
      ordered_at TEXT,
      shipped_at TEXT,
      expected_at TEXT,
      received_at TEXT,
      documents TEXT,
      notes TEXT,
      audit_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_po_us ON m2_purchase_orders(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_po_st ON m2_purchase_orders(user_id, store_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_po_num ON m2_purchase_orders(user_id, store_id, po_number);

    CREATE TABLE IF NOT EXISTS m2_purchase_order_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      po_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_cost REAL,
      subtotal REAL,
      received_qty INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_poi_us ON m2_purchase_order_items(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_poi_po ON m2_purchase_order_items(user_id, store_id, po_id);

    CREATE TABLE IF NOT EXISTS m2_suppliers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      contact TEXT,
      email TEXT,
      phone TEXT,
      region TEXT,
      rating REAL,
      status TEXT NOT NULL DEFAULT 'active',
      sku_count INTEGER DEFAULT 0,
      total_spend REAL DEFAULT 0,
      on_time_rate REAL,
      defect_rate REAL,
      price_stability REAL,
      lead_days INTEGER,
      last_order_at TEXT,
      payment_terms TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_sup_us ON m2_suppliers(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m2_repricing_recommendations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      asin TEXT,
      our_price REAL,
      competitor_asin TEXT,
      competitor_price REAL,
      competitor_old_price REAL,
      break_even_price REAL,
      price_elasticity REAL,
      scenarios TEXT NOT NULL,
      recommended_price REAL,
      trigger_reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      applied_price REAL,
      applied_at TEXT,
      audit_id TEXT,
      m1_listing_version_id TEXT,
      detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_rp_us ON m2_repricing_recommendations(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_rp_st ON m2_repricing_recommendations(user_id, store_id, status);

    CREATE TABLE IF NOT EXISTS m2_fx_rates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      base TEXT NOT NULL,
      quote TEXT NOT NULL,
      rate REAL NOT NULL,
      rate_date TEXT NOT NULL,
      source TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_fx ON m2_fx_rates(user_id, store_id, base, quote, rate_date);
    CREATE INDEX IF NOT EXISTS idx_m2_fx_us ON m2_fx_rates(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m2_fx_exposures (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount_source REAL,
      cny_equivalent REAL,
      share REAL,
      computed_at TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_fxe_us ON m2_fx_exposures(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m2_payment_channels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT,
      is_primary INTEGER DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      fee_pct REAL,
      fee_fixed_per_tx REAL,
      currency TEXT,
      monthly_volume REAL,
      monthly_cost REAL,
      warning INTEGER DEFAULT 0,
      warning_message TEXT,
      account_info TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_pc_us ON m2_payment_channels(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m2_tax_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      tax_type TEXT NOT NULL,
      region TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      sales REAL,
      tax_rate REAL,
      output_tax REAL,
      input_tax REAL,
      collected REAL,
      due REAL,
      threshold REAL,
      nexus INTEGER DEFAULT 0,
      deadline TEXT,
      days_left INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      filing_ref TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_tax_us ON m2_tax_records(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_tax_type ON m2_tax_records(user_id, store_id, tax_type, region);

    CREATE TABLE IF NOT EXISTS m2_ltv_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      first_order_count INTEGER,
      repeat_rate REAL,
      avg_repeats REAL,
      avg_order_value REAL,
      ltv REAL,
      cac_breakeven REAL,
      ad_30d_acos REAL,
      status TEXT,
      computed_at TEXT NOT NULL,
      detail TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_ltv_us ON m2_ltv_snapshots(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_ltv_sku ON m2_ltv_snapshots(user_id, store_id, sku);

    CREATE TABLE IF NOT EXISTS m2_alert_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      conditions TEXT NOT NULL,
      severity TEXT NOT NULL,
      notify_channels TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      cooldown_hours INTEGER DEFAULT 6,
      trigger_count INTEGER DEFAULT 0,
      last_triggered TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_m2_ar_us ON m2_alert_rules(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m2_alert_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      rule_name TEXT,
      severity TEXT,
      matched_value TEXT,
      message TEXT,
      acknowledged INTEGER DEFAULT 0,
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      pushed_to_m4 INTEGER DEFAULT 0,
      triggered_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_ae_us ON m2_alert_events(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_ae_rule ON m2_alert_events(user_id, store_id, rule_id, triggered_at DESC);

    CREATE TABLE IF NOT EXISTS m2_dimensions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      dim_type TEXT NOT NULL,
      name TEXT NOT NULL,
      members INTEGER,
      sku_ids TEXT,
      metrics TEXT,
      computed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_dim_us ON m2_dimensions(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_dim_type ON m2_dimensions(user_id, store_id, dim_type);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_dim ON m2_dimensions(user_id, store_id, dim_type, name);

    CREATE TABLE IF NOT EXISTS m2_inventory_link_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      stop_at INTEGER NOT NULL DEFAULT 3,
      reduce_50_at INTEGER NOT NULL DEFAULT 7,
      reduce_20_at INTEGER NOT NULL DEFAULT 14,
      alert_at INTEGER NOT NULL DEFAULT 21,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_ilc ON m2_inventory_link_config(user_id, store_id);

    CREATE TABLE IF NOT EXISTS m2_inventory_link_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      asin TEXT,
      days_left INTEGER,
      action TEXT NOT NULL,
      impact_campaigns TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      executed_at TEXT,
      reverted_at TEXT,
      audit_id TEXT,
      detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m2_ile_us ON m2_inventory_link_events(user_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_m2_ile_st ON m2_inventory_link_events(user_id, store_id, status);

    -- M4 occupancy: 轻量通知占位表（M4 模块尚未完整建表）
    CREATE TABLE IF NOT EXISTS m4_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      source_module TEXT NOT NULL,
      type TEXT NOT NULL,
      severity TEXT,
      title TEXT,
      detail TEXT,
      related_id TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_m4_notif_us ON m4_notifications(user_id, store_id);
  `);
}

export const PROFIT_TABLES_TO_CLEAN = [
  'm2_orders','m2_order_costs','m2_sku_profit_snapshots','m2_cashflow_events',
  'm2_leaks','m2_scenarios','m2_inventory_snapshots','m2_reorder_recommendations',
  'm2_slow_moving_decisions','m2_inventory_transfers','m2_purchase_orders','m2_purchase_order_items',
  'm2_suppliers','m2_repricing_recommendations','m2_fx_rates','m2_fx_exposures',
  'm2_payment_channels','m2_tax_records','m2_ltv_snapshots','m2_alert_rules','m2_alert_events',
  'm2_dimensions','m2_inventory_link_config','m2_inventory_link_events',
];

// 14 项费用 cost_type
export const COST_TYPES = [
  'referral_fee','fba_fee','refund_provision','storage','ad_alloc','cogs',
  'freight','fx_loss','capital_cost','long_term_storage','return_processing',
  'inbound_placement','subscription','misc',
];

// ============================================================
// Row converters
// ============================================================
export function rowToOrder(r) {
  if (!r) return null;
  return {
    id: r.id, orderId: r.order_id, asin: r.asin, sku: r.sku, productId: r.product_id,
    marketplace: r.marketplace, currency: r.currency, quantity: r.quantity,
    unitPrice: r.unit_price, revenue: r.revenue, totalCosts: r.total_costs,
    netProfit: r.net_profit, profitMargin: r.profit_margin,
    accuracy: { level: r.accuracy_level, confidence: r.confidence },
    accuracyLevel: r.accuracy_level, confidence: r.confidence,
    orderedAt: r.ordered_at, shippedAt: r.shipped_at, settledAt: r.settled_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function rowToCost(r) {
  if (!r) return null;
  return {
    id: r.id, orderId: r.order_id, costType: r.cost_type, amount: r.amount,
    currency: r.currency, accuracyLevel: r.accuracy_level, source: r.source,
    detail: _j(r.detail), createdAt: r.created_at,
  };
}
export function rowToLeak(r) {
  if (!r) return null;
  return {
    id: r.id, title: r.title, severity: r.severity, type: r.type,
    sku: r.sku, asin: r.asin, recommendation: r.recommendation,
    evidence: _j(r.evidence), monthlyImpact: r.monthly_impact,
    confidence: r.confidence, status: r.status,
    fixedActualSaving: r.fixed_actual_saving, auditId: r.audit_id,
    detectedAt: r.detected_at, resolvedAt: r.resolved_at,
  };
}
export function rowToScenario(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, sku: r.sku,
    baseline: _j(r.baseline), variables: _j(r.variables), result: _j(r.result),
    preset: r.preset, createdAt: r.created_at, createdBy: r.created_by,
  };
}
export function rowToInvSnap(r) {
  if (!r) return null;
  return {
    id: r.id, sku: r.sku, asin: r.asin, productId: r.product_id,
    warehouse: r.warehouse, onHand: r.on_hand, reserved: r.reserved,
    inbound: r.inbound, available: r.available, unitCost: r.unit_cost,
    dailyVelocity: r.daily_velocity, daysCover: r.days_cover,
    inStockDays: r.in_stock_days, ltsCountdownDays: r.lts_countdown_days,
    snapshotAt: r.snapshot_at,
  };
}
export function rowToReorder(r) {
  if (!r) return null;
  return {
    id: r.id, sku: r.sku, productId: r.product_id, urgency: r.urgency,
    recommendedQty: r.recommended_qty, capitalRequired: r.capital_required,
    daysRemaining: r.days_remaining, forecastDaily: r.forecast_daily,
    leadDays: r.lead_days, safetyDays: r.safety_days,
    supplierId: r.supplier_id, poDraftId: r.po_draft_id,
    status: r.status, computedAt: r.computed_at,
  };
}
export function rowToSlow(r) {
  if (!r) return null;
  return {
    id: r.id, sku: r.sku, asin: r.asin, inventory: r.inventory,
    inventoryValue: r.inventory_value, monthlyStorageCost: r.monthly_storage_cost,
    capitalLockCostYearly: r.capital_lock_cost_yearly,
    inStockDays: r.in_stock_days, ltsCountdownDays: r.lts_countdown_days,
    options: _j(r.options) || [], recommendedOption: r.recommended_option,
    selectedOption: r.selected_option, executedAt: r.executed_at,
    auditId: r.audit_id, status: r.status, detectedAt: r.detected_at,
  };
}
export function rowToTransfer(r) {
  if (!r) return null;
  return {
    id: r.id, sku: r.sku, fromWarehouse: r.from_warehouse,
    toWarehouse: r.to_warehouse, transferQty: r.transfer_qty,
    transferCost: r.transfer_cost, repurchaseCost: r.repurchase_cost,
    savings: r.savings, reason: r.reason, leadDays: r.lead_days,
    status: r.status, approvedAt: r.approved_at, receivedAt: r.received_at,
    auditId: r.audit_id, detectedAt: r.detected_at,
  };
}
export function rowToPO(r) {
  if (!r) return null;
  return {
    id: r.id, poNumber: r.po_number, supplierId: r.supplier_id,
    supplierName: r.supplier_name, status: r.status, totalLanded: r.total_landed,
    currency: r.currency, shippingMethod: r.shipping_method, tracking: r.tracking,
    deposit: r.deposit, depositPaid: !!r.deposit_paid,
    balance: r.balance, balancePaid: !!r.balance_paid,
    orderedAt: r.ordered_at, shippedAt: r.shipped_at,
    expectedAt: r.expected_at, receivedAt: r.received_at,
    documents: _j(r.documents) || {}, notes: r.notes, auditId: r.audit_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function rowToPOItem(r) {
  if (!r) return null;
  return {
    id: r.id, poId: r.po_id, sku: r.sku, qty: r.qty,
    unitCost: r.unit_cost, subtotal: r.subtotal,
    receivedQty: r.received_qty, notes: r.notes, createdAt: r.created_at,
  };
}
export function rowToSupplier(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, contact: r.contact, email: r.email, phone: r.phone,
    region: r.region, rating: r.rating, status: r.status,
    skuCount: r.sku_count, totalSpend: r.total_spend, onTimeRate: r.on_time_rate,
    defectRate: r.defect_rate, priceStability: r.price_stability,
    leadDays: r.lead_days, lastOrderAt: r.last_order_at,
    paymentTerms: r.payment_terms, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function rowToReprice(r) {
  if (!r) return null;
  return {
    id: r.id, sku: r.sku, asin: r.asin, ourPrice: r.our_price,
    competitorAsin: r.competitor_asin, competitorPrice: r.competitor_price,
    competitorOldPrice: r.competitor_old_price, breakEvenPrice: r.break_even_price,
    priceElasticity: r.price_elasticity, scenarios: _j(r.scenarios) || [],
    recommendedPrice: r.recommended_price, triggerReason: r.trigger_reason,
    status: r.status, appliedPrice: r.applied_price, appliedAt: r.applied_at,
    auditId: r.audit_id, m1ListingVersionId: r.m1_listing_version_id,
    detectedAt: r.detected_at,
  };
}
export function rowToFxRate(r) {
  if (!r) return null;
  return {
    id: r.id, base: r.base, quote: r.quote, rate: r.rate,
    rateDate: r.rate_date, source: r.source, createdAt: r.created_at,
  };
}
export function rowToFxExposure(r) {
  if (!r) return null;
  return {
    id: r.id, currency: r.currency, amountSource: r.amount_source,
    cnyEquivalent: r.cny_equivalent, share: r.share,
    computedAt: r.computed_at, detail: _j(r.detail),
  };
}
export function rowToPaymentChannel(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, provider: r.provider, isPrimary: !!r.is_primary,
    enabled: !!r.enabled, feePct: r.fee_pct, feeFixedPerTx: r.fee_fixed_per_tx,
    currency: r.currency, monthlyVolume: r.monthly_volume,
    monthlyCost: r.monthly_cost, warning: !!r.warning,
    warningMessage: r.warning_message, accountInfo: _j(r.account_info) || {},
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function rowToTax(r) {
  if (!r) return null;
  return {
    id: r.id, taxType: r.tax_type, region: r.region,
    periodStart: r.period_start, periodEnd: r.period_end,
    sales: r.sales, taxRate: r.tax_rate, outputTax: r.output_tax,
    inputTax: r.input_tax, collected: r.collected, due: r.due,
    threshold: r.threshold, nexus: !!r.nexus, deadline: r.deadline,
    daysLeft: r.days_left, status: r.status, filingRef: r.filing_ref,
    createdAt: r.created_at,
  };
}
export function rowToLtv(r) {
  if (!r) return null;
  return {
    id: r.id, sku: r.sku, firstOrderCount: r.first_order_count,
    repeatRate: r.repeat_rate, avgRepeats: r.avg_repeats,
    avgOrderValue: r.avg_order_value, ltv: r.ltv,
    cacBreakeven: r.cac_breakeven, ad30dAcos: r.ad_30d_acos,
    status: r.status, computedAt: r.computed_at, detail: _j(r.detail),
  };
}
export function rowToAlertRule(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, conditions: _j(r.conditions) || [],
    severity: r.severity, notifyChannels: _j(r.notify_channels) || [],
    enabled: !!r.enabled, cooldownHours: r.cooldown_hours,
    triggerCount: r.trigger_count, lastTriggered: r.last_triggered,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
export function rowToAlertEvent(r) {
  if (!r) return null;
  return {
    id: r.id, ruleId: r.rule_id, ruleName: r.rule_name, severity: r.severity,
    matchedValue: _j(r.matched_value), message: r.message,
    acknowledged: !!r.acknowledged, acknowledgedAt: r.acknowledged_at,
    acknowledgedBy: r.acknowledged_by, pushedToM4: !!r.pushed_to_m4,
    triggeredAt: r.triggered_at,
  };
}
export function rowToDimension(r) {
  if (!r) return null;
  return {
    id: r.id, dimType: r.dim_type, name: r.name, members: r.members,
    skuIds: _j(r.sku_ids) || [], metrics: _j(r.metrics) || {},
    computedAt: r.computed_at,
  };
}
export function rowToInvLinkConfig(r) {
  if (!r) return null;
  return {
    id: r.id, enabled: !!r.enabled, stopAt: r.stop_at,
    reduce50At: r.reduce_50_at, reduce20At: r.reduce_20_at,
    alertAt: r.alert_at, updatedAt: r.updated_at,
  };
}
export function rowToInvLinkEvent(r) {
  if (!r) return null;
  return {
    id: r.id, sku: r.sku, asin: r.asin, daysLeft: r.days_left,
    action: r.action, impactCampaigns: _j(r.impact_campaigns) || [],
    status: r.status, executedAt: r.executed_at, revertedAt: r.reverted_at,
    auditId: r.audit_id, detectedAt: r.detected_at,
  };
}

// ============================================================
// M4 通知（轻量占位）
// ============================================================
export function appendM4Notification(db, userId, storeId, payload) {
  const id = newId('m4n');
  db.prepare(`INSERT INTO m4_notifications(
    id, user_id, store_id, source_module, type, severity, title, detail,
    related_id, acknowledged, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, payload.source || 'M2', payload.type,
    payload.severity || 'P1', payload.title || '', JSON.stringify(payload.detail || {}),
    payload.relatedId || null, 0, nowIso()
  );
  return id;
}
export function listM4Notifications(db, userId, storeId) {
  return db.prepare('SELECT * FROM m4_notifications WHERE user_id=? AND store_id=? ORDER BY created_at DESC')
    .all(userId, storeId).map((r) => ({
      id: r.id, sourceModule: r.source_module, type: r.type, severity: r.severity,
      title: r.title, detail: _j(r.detail), relatedId: r.related_id,
      acknowledged: !!r.acknowledged, createdAt: r.created_at,
    }));
}

// ============================================================
// 利润 / 订单 / SKU 利润快照
// ============================================================
export function getProfitOverview(db, userId, storeId, rangeDays = 30) {
  // 对齐 listSkuProfit：若有当前 range 的 sku 快照，就用 snapshot 求和；
  // 否则按 ordered_at 滚动 N 天聚合。这样保证 overview / skus 闭合（spec § 8 场景 1）。
  const snap = db.prepare(`SELECT COUNT(*) AS n FROM m2_sku_profit_snapshots
    WHERE user_id=? AND store_id=? AND range_days=?`).get(userId, storeId, rangeDays);
  const useSnap = (snap?.n || 0) > 0;
  let revenue, netProfit, totalCosts, ordersCount, confidence;
  if (useSnap) {
    const agg = db.prepare(`SELECT SUM(revenue) AS revenue, SUM(net_profit) AS netProfit,
      SUM(total_cost) AS totalCosts, SUM(units_sold) AS unitsSold
      FROM m2_sku_profit_snapshots WHERE user_id=? AND store_id=? AND range_days=?`)
      .get(userId, storeId, rangeDays) || {};
    revenue = _r2(agg.revenue || 0);
    netProfit = _r2(agg.netProfit || 0);
    totalCosts = _r2(agg.totalCosts || 0);
    // orders count 仍取实际订单（仅用于显示）
    const allOrders = db.prepare(`SELECT COUNT(*) AS n, AVG(confidence) AS conf
      FROM m2_orders WHERE user_id=? AND store_id=?`).get(userId, storeId) || {};
    ordersCount = allOrders.n || 0;
    confidence = _r2(allOrders.conf || 0);
  } else {
    const cutoff = new Date(Date.now() - rangeDays * 86400000).toISOString();
    const r = db.prepare(`SELECT COUNT(*) AS orders, SUM(revenue) AS revenue,
      SUM(total_costs) AS totalCosts, SUM(net_profit) AS netProfit, AVG(confidence) AS confidence
      FROM m2_orders WHERE user_id=? AND store_id=? AND ordered_at >= ?`)
      .get(userId, storeId, cutoff) || {};
    revenue = _r2(r.revenue || 0);
    totalCosts = _r2(r.totalCosts || 0);
    netProfit = _r2(r.netProfit || 0);
    confidence = _r2(r.confidence || 0);
    ordersCount = r.orders || 0;
  }
  const margin = revenue > 0 ? _r2(netProfit / revenue) : 0;
  const cutoff2 = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const topSkus = db.prepare(`SELECT sku, SUM(revenue) AS rev, SUM(net_profit) AS np
    FROM m2_orders WHERE user_id=? AND store_id=? AND ordered_at>=?
    GROUP BY sku ORDER BY rev DESC LIMIT 5`).all(userId, storeId, cutoff2).map((row) => ({
      sku: row.sku, revenue: _r2(row.rev), netProfit: _r2(row.np),
      margin: row.rev > 0 ? _r2(row.np / row.rev) : 0,
    }));
  const trendRows = db.prepare(`SELECT substr(ordered_at, 1, 10) AS d,
    SUM(net_profit) AS np FROM m2_orders
    WHERE user_id=? AND store_id=? AND ordered_at>=?
    GROUP BY d ORDER BY d ASC`).all(userId, storeId, cutoff2);
  const trend = trendRows.map((row) => ({ date: row.d, netProfit: _r2(row.np) }));
  return {
    overview: { revenue, orders: ordersCount, totalCosts, netProfit, profitMargin: margin, confidence },
    topSkus, trend,
  };
}

export function recomputeProfit(db, userId, storeId, rangeDays = 30) {
  // 重算 SKU 利润快照
  const cutoff = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const rows = db.prepare(`SELECT sku, asin, product_id,
    SUM(revenue) AS rev, SUM(net_profit) AS np, COUNT(*) AS units,
    AVG(confidence) AS conf
    FROM m2_orders WHERE user_id=? AND store_id=? AND ordered_at>=?
    GROUP BY sku`).all(userId, storeId, cutoff);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM m2_sku_profit_snapshots WHERE user_id=? AND store_id=? AND range_days=?')
      .run(userId, storeId, rangeDays);
    for (const r of rows) {
      // 拆 14 项费用聚合
      const costs = db.prepare(`SELECT cost_type, SUM(amount) AS s
        FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id IN (
          SELECT order_id FROM m2_orders WHERE user_id=? AND store_id=? AND sku=? AND ordered_at>=?
        ) GROUP BY cost_type`).all(userId, storeId, userId, storeId, r.sku, cutoff);
      const breakdown = {};
      for (const c of costs) breakdown[c.cost_type] = _r2(c.s);
      const totalCost = Object.values(breakdown).reduce((a, b) => a + b, 0);
      const id = newId('skupf');
      db.prepare(`INSERT INTO m2_sku_profit_snapshots(
        id, user_id, store_id, sku, asin, product_id, range_days,
        revenue, cogs, fees, ad_cost, refund, storage, total_cost,
        net_profit, margin, units_sold, lifecycle, days_cover, computed_at, detail)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, userId, storeId, r.sku, r.asin, r.product_id, rangeDays,
        _r2(r.rev), breakdown.cogs || 0,
        (breakdown.referral_fee || 0) + (breakdown.fba_fee || 0),
        breakdown.ad_alloc || 0, breakdown.refund_provision || 0,
        breakdown.storage || 0, _r2(totalCost),
        _r2(r.np), r.rev > 0 ? _r2(r.np / r.rev) : 0,
        r.units || 0, 'mature', 30, nowIso(), JSON.stringify(breakdown)
      );
    }
  });
  tx();
  const jobId = newId('recompute');
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'PROFIT_RECOMPUTE',
    resourceType: 'm2_sku_profit_snapshots', resourceId: jobId,
    rangeDays, count: rows.length,
  });
  return { queued: true, jobId, etaSeconds: 1 };
}

export function listSkuProfit(db, userId, storeId, filters = {}) {
  const rangeDays = Number(filters.range || filters.rangeDays || 30);
  let sql = `SELECT * FROM m2_sku_profit_snapshots
    WHERE user_id=? AND store_id=? AND range_days=?`;
  const params = [userId, storeId, rangeDays];
  if (filters.search) {
    sql += ' AND (sku LIKE ? OR asin LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.lifecycle) {
    sql += ' AND lifecycle = ?';
    params.push(filters.lifecycle);
  }
  sql += ' ORDER BY net_profit DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => ({
    sku: r.sku, asin: r.asin, productId: r.product_id, revenue: r.revenue,
    cogs: r.cogs, fees: r.fees, adCost: r.ad_cost, refund: r.refund,
    storage: r.storage, totalCost: r.total_cost, netProfit: r.net_profit,
    margin: r.margin, unitsSold: r.units_sold,
    lifecycle: r.lifecycle, daysCover: r.days_cover,
    detail: _j(r.detail), computedAt: r.computed_at,
  }));
}

export function getSkuWaterfall(db, userId, storeId, sku, rangeDays = 30) {
  // snapshot-aware to match overview/skus, fixes Round 6 S1 C3
  // 优先读 m2_sku_profit_snapshots（与 getProfitOverview / listSkuProfit 同源），
  // 各 14 cost 项分量从 m2_order_costs JOIN m2_orders 累加 + 残差归一到 misc，
  // 保证 Σ(items) === snapshot.net_profit ±0.01。
  const labelMap = {
    referral_fee: '佣金', fba_fee: 'FBA 费', refund_provision: '退款拨备',
    storage: '仓储费', ad_alloc: '广告分摊', cogs: '采购成本',
    freight: '头程运费', fx_loss: '汇率损失', capital_cost: '资金成本',
    long_term_storage: '长期仓储', return_processing: '退货处理',
    inbound_placement: '入库布局', subscription: '订阅费', misc: '杂项',
  };
  const cutoff = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const confRow = db.prepare(`SELECT AVG(confidence) AS conf
    FROM m2_orders WHERE user_id=? AND store_id=? AND sku=? AND ordered_at>=?`)
    .get(userId, storeId, sku, cutoff) || {};
  const conf = _r2(confRow.conf || 0);

  // 1) 优先尝试 snapshot（与 overview/skus 闭合）
  const snap = db.prepare(`SELECT revenue, net_profit, total_cost, detail
    FROM m2_sku_profit_snapshots
    WHERE user_id=? AND store_id=? AND sku=? AND range_days=?`)
    .get(userId, storeId, sku, rangeDays);

  if (snap && (snap.revenue || snap.net_profit)) {
    const revenue = _r2(snap.revenue || 0);
    const netProfit = _r2(snap.net_profit || 0);
    const expectedCost = _r2(revenue - netProfit);
    // 各 14 cost 项分量从 m2_order_costs JOIN m2_orders 累加（按 live order 比例分摊）
    const liveCosts = db.prepare(`SELECT cost_type, SUM(amount) AS s
      FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id IN (
        SELECT order_id FROM m2_orders WHERE user_id=? AND store_id=? AND sku=? AND ordered_at>=?
      ) GROUP BY cost_type`).all(userId, storeId, userId, storeId, sku, cutoff);
    const liveTotal = liveCosts.reduce((s, c) => s + Number(c.s || 0), 0);
    const order = ['cogs', 'referral_fee', 'fba_fee', 'ad_alloc', 'refund_provision',
      'storage', 'freight', 'fx_loss', 'capital_cost', 'long_term_storage',
      'return_processing', 'inbound_placement', 'subscription', 'misc'];
    const liveByType = Object.fromEntries(liveCosts.map((c) => [c.cost_type, Number(c.s || 0)]));
    const items = [{ label: '收入', value: revenue, type: 'positive' }];
    const negItems = [];
    let costSum = 0;
    if (liveTotal > 0) {
      // 按 live 比例缩放到 snapshot total cost，保证求和闭合
      const scale = expectedCost / liveTotal;
      for (const k of order) {
        const v = liveByType[k];
        if (!v) continue;
        const r = _r2(v * scale);
        costSum += r;
        negItems.push({ key: k, label: labelMap[k] || k, value: -r, type: 'negative' });
      }
    } else {
      // 无 live 订单：仅从 snapshot detail 取（兜底）
      let breakdown = {};
      try { breakdown = JSON.parse(snap.detail || '{}') || {}; } catch { breakdown = {}; }
      for (const k of order) {
        const v = Number(breakdown[k] || 0);
        if (!v) continue;
        const r = _r2(v);
        costSum += r;
        negItems.push({ key: k, label: labelMap[k] || k, value: -r, type: 'negative' });
      }
    }
    // 残差：revenue - Σcost == netProfit；rounding 漂移归一到 misc 保证 ±0.01 闭合
    const drift = _r2(expectedCost - costSum);
    if (Math.abs(drift) >= 0.01 || negItems.length === 0) {
      const miscIdx = negItems.findIndex((x) => x.key === 'misc');
      if (miscIdx >= 0) {
        negItems[miscIdx].value = _r2(negItems[miscIdx].value - drift);
      } else {
        negItems.push({ key: 'misc', label: labelMap.misc, value: _r2(-drift), type: 'negative' });
      }
    }
    for (const it of negItems) {
      items.push({ label: it.label, value: it.value, type: it.type });
    }
    items.push({ label: '净利润', value: netProfit, type: 'total' });
    return {
      items,
      accuracy: conf > 0.8 ? 'final' : 'high_estimate',
      confidence: conf,
    };
  }

  // 2) Fallback：无 snapshot 时按 live orders 计算（保持旧行为）
  const orderRow = db.prepare(`SELECT SUM(revenue) AS rev, SUM(net_profit) AS np, AVG(confidence) AS conf
    FROM m2_orders WHERE user_id=? AND store_id=? AND sku=? AND ordered_at>=?`).get(userId, storeId, sku, cutoff);
  if (!orderRow || !orderRow.rev) return null;
  const costs = db.prepare(`SELECT cost_type, SUM(amount) AS s
    FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id IN (
      SELECT order_id FROM m2_orders WHERE user_id=? AND store_id=? AND sku=? AND ordered_at>=?
    ) GROUP BY cost_type`).all(userId, storeId, userId, storeId, sku, cutoff);
  const items = [{ label: '收入', value: _r2(orderRow.rev), type: 'positive' }];
  for (const c of costs) {
    items.push({ label: labelMap[c.cost_type] || c.cost_type, value: -_r2(c.s), type: 'negative' });
  }
  items.push({ label: '净利润', value: _r2(orderRow.np), type: 'total' });
  return {
    items,
    accuracy: orderRow.conf > 0.8 ? 'final' : 'high_estimate',
    confidence: _r2(orderRow.conf || 0),
  };
}

export function listOrders(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_orders WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.from) { sql += ' AND ordered_at >= ?'; params.push(filters.from); }
  if (filters.to) { sql += ' AND ordered_at <= ?'; params.push(filters.to); }
  if (filters.sku) { sql += ' AND sku = ?'; params.push(filters.sku); }
  if (filters.minMargin) { sql += ' AND profit_margin >= ?'; params.push(Number(filters.minMargin)); }
  if (filters.maxMargin) { sql += ' AND profit_margin <= ?'; params.push(Number(filters.maxMargin)); }
  if (filters.accuracy) { sql += ' AND accuracy_level = ?'; params.push(filters.accuracy); }
  sql += ' ORDER BY ordered_at DESC';
  const limit = Math.max(1, Math.min(500, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.cursor) || 0);
  sql += ' LIMIT ? OFFSET ?';
  params.push(limit + 1, offset);
  const rows = db.prepare(sql).all(...params);
  const hasMore = rows.length > limit;
  const orders = rows.slice(0, limit).map(rowToOrder);
  return { orders, nextCursor: hasMore ? String(offset + limit) : null };
}

export function getOrderProfit(db, userId, storeId, orderId) {
  const orderRow = db.prepare('SELECT * FROM m2_orders WHERE user_id=? AND store_id=? AND order_id=?')
    .get(userId, storeId, orderId);
  if (!orderRow) return null;
  const costRows = db.prepare('SELECT * FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id=?')
    .all(userId, storeId, orderId);
  const fees = {};
  for (const c of costRows) fees[_camelCost(c.cost_type)] = _r2(c.amount);
  for (const ct of COST_TYPES) { if (fees[_camelCost(ct)] === undefined) fees[_camelCost(ct)] = 0; }
  return {
    order: rowToOrder(orderRow),
    fees,
    timeline: [
      { label: '下单', at: orderRow.ordered_at },
      { label: '发货', at: orderRow.shipped_at },
      { label: '结算', at: orderRow.settled_at },
    ],
  };
}
function _camelCost(s) {
  return s.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

// ============================================================
// 漏点
// ============================================================
export function listLeaks(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_leaks WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.severity && filters.severity !== 'all') {
    sql += ' AND severity = ?'; params.push(filters.severity);
  }
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  sql += ' ORDER BY severity, monthly_impact DESC';
  const leaks = db.prepare(sql).all(...params).map(rowToLeak);
  const counts = db.prepare(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN severity='P0' THEN 1 ELSE 0 END) AS p0,
    SUM(CASE WHEN severity='P1' THEN 1 ELSE 0 END) AS p1,
    SUM(CASE WHEN status='fixing' THEN 1 ELSE 0 END) AS fixing
    FROM m2_leaks WHERE user_id=? AND store_id=?`).get(userId, storeId);
  return { leaks, counts };
}

export function startFixLeak(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m2_leaks WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'pending') return { error: 'invalid_status', message: `current status: ${cur.status}` };
  db.prepare('UPDATE m2_leaks SET status=? WHERE id=?').run('fixing', id);
  const audit = appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'LEAK_START_FIX',
    resourceType: 'm2_leak', resourceId: id, before: { status: cur.status },
    after: { status: 'fixing' },
  });
  db.prepare('UPDATE m2_leaks SET audit_id=? WHERE id=?').run(audit?.id || null, id);
  return rowToLeak(db.prepare('SELECT * FROM m2_leaks WHERE id=?').get(id));
}
export function markFixedLeak(db, userId, storeId, id, actualSaving) {
  const cur = db.prepare('SELECT * FROM m2_leaks WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('UPDATE m2_leaks SET status=?, fixed_actual_saving=?, resolved_at=? WHERE id=?')
    .run('fixed', Number(actualSaving) || 0, nowIso(), id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'LEAK_MARK_FIXED',
    resourceType: 'm2_leak', resourceId: id, actualSaving,
    before: { status: cur.status }, after: { status: 'fixed' },
  });
  return rowToLeak(db.prepare('SELECT * FROM m2_leaks WHERE id=?').get(id));
}
export function ignoreLeak(db, userId, storeId, id, reason) {
  const cur = db.prepare('SELECT * FROM m2_leaks WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('UPDATE m2_leaks SET status=?, resolved_at=? WHERE id=?').run('ignored', nowIso(), id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'LEAK_IGNORE',
    resourceType: 'm2_leak', resourceId: id, reason,
    before: { status: cur.status }, after: { status: 'ignored' },
  });
  return rowToLeak(db.prepare('SELECT * FROM m2_leaks WHERE id=?').get(id));
}

// ============================================================
// 现金流
// ============================================================
export function getCashflowTimeline(db, userId, storeId, days = 30) {
  const today = new Date();
  const rows = db.prepare(`SELECT * FROM m2_cashflow_events
    WHERE user_id=? AND store_id=? ORDER BY event_date ASC`).all(userId, storeId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.event_date)) map.set(r.event_date, { date: r.event_date, inflow: 0, outflow: 0, balance: r.balance, label: r.label });
    const cur = map.get(r.event_date);
    cur.inflow += r.inflow || 0;
    cur.outflow += r.outflow || 0;
    if (r.balance != null) cur.balance = r.balance;
    if (r.label && !cur.label) cur.label = r.label;
  }
  const points = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  // 控制到 days 个点
  const sliced = points.slice(0, Math.max(7, Math.min(180, days)));
  const balances = sliced.map((p) => p.balance || 0);
  const minBalance = balances.length ? Math.min(...balances) : 0;
  const minBalanceIdx = balances.indexOf(minBalance);
  const minBalanceDate = sliced[minBalanceIdx]?.date || sliced[0]?.date;
  return {
    points: sliced,
    summary: {
      today: balances[0] || 0,
      future30: balances[Math.min(29, balances.length - 1)] || 0,
      future90: balances[Math.min(89, balances.length - 1)] || 0,
      minBalance, minBalanceDate,
    },
  };
}

export function getCashflowAlerts(db, userId, storeId) {
  // 简化版：从 m2_leaks 中抽取 type 与现金流相关的，作为 alerts
  const leaks = db.prepare(`SELECT * FROM m2_leaks WHERE user_id=? AND store_id=?
    AND type IN ('AD_OVERSPEND','STORAGE_FEE','FX_LOSS','INVENTORY_AGING') ORDER BY monthly_impact DESC LIMIT 5`)
    .all(userId, storeId);
  const alerts = leaks.map((l) => ({
    type: 'capital_locked', level: l.severity === 'P0' ? 'critical' : 'warn',
    title: l.title, detail: l.recommendation,
    relatedSku: l.sku, impact: l.monthly_impact,
  }));
  return { alerts };
}

export function addCashflowEvent(db, userId, storeId, body) {
  if (!body.event_date && !body.eventDate) return { error: 'validation_error', message: 'event_date required' };
  const id = newId('cfe');
  const date = body.event_date || body.eventDate;
  // 取上一行 balance 作为基础
  const last = db.prepare(`SELECT balance FROM m2_cashflow_events
    WHERE user_id=? AND store_id=? AND event_date <= ? ORDER BY event_date DESC LIMIT 1`)
    .get(userId, storeId, date);
  const inflow = Number(body.inflow) || 0;
  const outflow = Number(body.outflow) || 0;
  const balance = (last?.balance || 350000) + inflow - outflow;
  db.prepare(`INSERT INTO m2_cashflow_events(
    id, user_id, store_id, event_date, label, inflow, outflow, balance,
    source, ref_id, currency, is_forecast, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, date, body.label || null, inflow, outflow, balance,
    body.source || 'manual', body.refId || body.ref_id || null,
    body.currency || 'CNY', body.isForecast ? 1 : 0, nowIso()
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'CASHFLOW_EVENT_CREATE',
    resourceType: 'm2_cashflow_event', resourceId: id, ...body,
  });
  return { id, eventDate: date, label: body.label, inflow, outflow, balance };
}

// ============================================================
// 情景模拟
// ============================================================
export function previewScenario(body) {
  const baseline = body.baseline || {};
  const v = body.variables || {};
  const price = (baseline.price || 0) * (1 + (Number(v.priceDelta) || 0) / 100);
  const acos = (baseline.acos || 0) + (Number(v.acosDelta) || 0) / 100;
  const volume = (baseline.monthlyVolume || 0) * (1 + (Number(v.volumeDelta) || 0) / 100);
  const returnRate = (baseline.returnRate || 0) + (Number(v.returnDelta) || 0) / 100;
  const unitProfit = price * (1 - 0.15 - acos - returnRate) - (baseline.unitCost || price * 0.45);
  const monthlyProfit = unitProfit * volume;
  const monthlyRevenue = price * volume;
  const margin = monthlyRevenue > 0 ? monthlyProfit / monthlyRevenue : 0;
  const baselineMonthlyProfit = ((baseline.price || 0) * (1 - 0.15 - (baseline.acos || 0) - (baseline.returnRate || 0)) - (baseline.unitCost || (baseline.price || 0) * 0.45)) * (baseline.monthlyVolume || 0);
  return {
    simulated: {
      price: _r2(price), acos: _r2(acos), volume: Math.round(volume),
      unitProfit: _r2(unitProfit), monthlyProfit: _r2(monthlyProfit),
      monthlyRevenue: _r2(monthlyRevenue), margin: _r2(margin),
    },
    delta: _r2(monthlyProfit - baselineMonthlyProfit),
  };
}

export function saveScenario(db, userId, storeId, body) {
  const id = newId('sc');
  db.prepare(`INSERT INTO m2_scenarios(
    id, user_id, store_id, name, sku, baseline, variables, result, preset, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.name || '未命名情景', body.sku || null,
    JSON.stringify(body.baseline || {}), JSON.stringify(body.variables || {}),
    JSON.stringify(body.result || {}), body.preset || 'custom',
    nowIso(), body.createdBy || null
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'SCENARIO_SAVE',
    resourceType: 'm2_scenario', resourceId: id,
    name: body.name, sku: body.sku, preset: body.preset,
  });
  return { id, createdAt: nowIso() };
}

export function listScenarios(db, userId, storeId, sku) {
  let sql = 'SELECT * FROM m2_scenarios WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (sku) { sql += ' AND sku=?'; params.push(sku); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(rowToScenario);
}

// ============================================================
// 库存 / 补货
// ============================================================
export function listReorders(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_reorder_recommendations WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.urgency) { sql += ' AND urgency=?'; params.push(filters.urgency); }
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  sql += ` ORDER BY CASE urgency WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`;
  return db.prepare(sql).all(...params).map(rowToReorder);
}

export function createPOFromReorder(db, userId, storeId, reorderId, body = {}) {
  const reorder = db.prepare('SELECT * FROM m2_reorder_recommendations WHERE id=? AND user_id=? AND store_id=?')
    .get(reorderId, userId, storeId);
  if (!reorder) return { error: 'not_found' };
  if (reorder.status !== 'pending') return { error: 'invalid_status', message: `current: ${reorder.status}` };

  const supplier = body.supplierId
    ? db.prepare('SELECT * FROM m2_suppliers WHERE id=? AND user_id=? AND store_id=?').get(body.supplierId, userId, storeId)
    : null;
  const poId = newId('po');
  // 计算下一个 PO 编号
  const maxNum = db.prepare(`SELECT po_number FROM m2_purchase_orders
    WHERE user_id=? AND store_id=? ORDER BY po_number DESC LIMIT 1`).get(userId, storeId);
  let nextNum = 1;
  if (maxNum?.po_number) {
    const m = maxNum.po_number.match(/PO-(\d+)/);
    if (m) nextNum = Number(m[1]) + 1;
  }
  const poNumber = `PO-${String(nextNum).padStart(3, '0')}`;
  const unitCost = reorder.capital_required && reorder.recommended_qty
    ? reorder.capital_required / reorder.recommended_qty : 10;
  const totalLanded = _r2(unitCost * reorder.recommended_qty * 1.1); // +10% 运费
  const deposit = _r2(totalLanded * 0.3);
  const balance = _r2(totalLanded - deposit);

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO m2_purchase_orders(
      id, user_id, store_id, po_number, supplier_id, supplier_name, status,
      total_landed, currency, shipping_method, deposit, balance,
      notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      poId, userId, storeId, poNumber, supplier?.id || null,
      supplier?.name || '默认供应商', 'draft', totalLanded, 'USD',
      body.shippingMethod || 'ocean_freight', deposit, balance,
      body.notes || `From reorder ${reorderId}`, nowIso()
    );
    const itemId = newId('poi');
    db.prepare(`INSERT INTO m2_purchase_order_items(
      id, user_id, store_id, po_id, sku, qty, unit_cost, subtotal, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      itemId, userId, storeId, poId, reorder.sku, reorder.recommended_qty,
      unitCost, _r2(unitCost * reorder.recommended_qty), nowIso()
    );
    db.prepare('UPDATE m2_reorder_recommendations SET status=?, po_draft_id=? WHERE id=?')
      .run('drafted', poId, reorderId);
  });
  tx();
  const audit = appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'CREATE_PURCHASE_ORDER_DRAFT',
    resourceType: 'm2_purchase_order', resourceId: poId,
    poNumber, reorderId, sku: reorder.sku, qty: reorder.recommended_qty,
  });
  db.prepare('UPDATE m2_purchase_orders SET audit_id=? WHERE id=?').run(audit?.id || null, poId);
  return { poId, poNumber, status: 'draft' };
}

export function dismissReorder(db, userId, storeId, id, reason) {
  const cur = db.prepare('SELECT * FROM m2_reorder_recommendations WHERE id=? AND user_id=? AND store_id=?')
    .get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('UPDATE m2_reorder_recommendations SET status=? WHERE id=?').run('dismissed', id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'REORDER_DISMISS',
    resourceType: 'm2_reorder_recommendation', resourceId: id, reason,
  });
  return rowToReorder(db.prepare('SELECT * FROM m2_reorder_recommendations WHERE id=?').get(id));
}

// ============================================================
// 滞销决策
// ============================================================
export function listSlowMoving(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_slow_moving_decisions WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  sql += ' ORDER BY detected_at DESC';
  return db.prepare(sql).all(...params).map(rowToSlow);
}

export function executeSlowMoving(db, userId, storeId, id, option) {
  const cur = db.prepare('SELECT * FROM m2_slow_moving_decisions WHERE id=? AND user_id=? AND store_id=?')
    .get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'pending') return { error: 'invalid_status', message: `current: ${cur.status}` };
  if (!['A', 'B', 'C', 'D'].includes(option)) return { error: 'validation_error', message: 'option must be A/B/C/D' };

  const audit = appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'SLOW_MOVING_EXECUTE',
    resourceType: 'm2_slow_moving_decision', resourceId: id,
    sku: cur.sku, option,
  });

  let m1VersionId = null;
  // option=A 触发 M1 listing version （降价 30%）
  if (option === 'A') {
    try {
      const oldPrice = _r2((cur.inventory_value || 0) / Math.max(1, cur.inventory || 1));
      const newPrice = _r2(oldPrice * 0.7);
      // 子 audit: REPRICE_DOWN（spec § 7.1 父子链）
      const repriceAudit = appendAuditLog(userId, storeId, {
        sourceModule: 'M2', actionType: 'REPRICE_DOWN',
        resourceType: 'm2_slow_moving_decision', resourceId: id,
        sku: cur.sku, oldPrice, newPrice, parentAuditId: audit?.id,
      });
      m1VersionId = _writeM1ListingVersionFromM2(db, userId, storeId, cur.sku, newPrice, repriceAudit?.id || audit?.id);
    } catch (e) {
      console.warn('[M2 slow_moving] M1 write failed:', e?.message);
    }
  }

  db.prepare(`UPDATE m2_slow_moving_decisions SET status=?, selected_option=?, executed_at=?, audit_id=?
    WHERE id=?`).run('executed', option, nowIso(), audit?.id || null, id);

  return {
    id, status: 'executed', executedAt: nowIso(), auditId: audit?.id || null,
    m1VersionId,
  };
}

// ============================================================
// 调拨
// ============================================================
export function listTransfers(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_inventory_transfers WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  sql += ' ORDER BY detected_at DESC';
  return db.prepare(sql).all(...params).map(rowToTransfer);
}
export function approveTransfer(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m2_inventory_transfers WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'recommended') return { error: 'invalid_status', message: `current: ${cur.status}` };
  db.prepare('UPDATE m2_inventory_transfers SET status=?, approved_at=? WHERE id=?').run('approved', nowIso(), id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'INVENTORY_TRANSFER_APPROVE',
    resourceType: 'm2_inventory_transfer', resourceId: id,
    before: { status: cur.status }, after: { status: 'approved' },
  });
  return rowToTransfer(db.prepare('SELECT * FROM m2_inventory_transfers WHERE id=?').get(id));
}
export function cancelTransfer(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m2_inventory_transfers WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('UPDATE m2_inventory_transfers SET status=? WHERE id=?').run('cancelled', id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'INVENTORY_TRANSFER_CANCEL',
    resourceType: 'm2_inventory_transfer', resourceId: id,
    before: { status: cur.status }, after: { status: 'cancelled' },
  });
  return rowToTransfer(db.prepare('SELECT * FROM m2_inventory_transfers WHERE id=?').get(id));
}

// ============================================================
// 采购单
// ============================================================
export function listPOs(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_purchase_orders WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  if (filters.supplierId) { sql += ' AND supplier_id=?'; params.push(filters.supplierId); }
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params).map(rowToPO);
}
export function getPO(db, userId, storeId, id) {
  const po = db.prepare('SELECT * FROM m2_purchase_orders WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!po) return null;
  const items = db.prepare('SELECT * FROM m2_purchase_order_items WHERE po_id=? AND user_id=? AND store_id=? ORDER BY created_at').all(id, userId, storeId).map(rowToPOItem);
  const timeline = [
    { label: '创建', at: po.created_at },
    { label: '已下单', at: po.ordered_at },
    { label: '发货', at: po.shipped_at },
    { label: '入仓', at: po.received_at },
  ];
  return { ...rowToPO(po), items, timeline };
}
export function createPO(db, userId, storeId, body) {
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return { error: 'validation_error', message: 'items required' };
  }
  const supplier = body.supplierId
    ? db.prepare('SELECT * FROM m2_suppliers WHERE id=? AND user_id=? AND store_id=?').get(body.supplierId, userId, storeId)
    : null;
  const poId = newId('po');
  const maxNum = db.prepare(`SELECT po_number FROM m2_purchase_orders
    WHERE user_id=? AND store_id=? ORDER BY po_number DESC LIMIT 1`).get(userId, storeId);
  let nextNum = 1;
  if (maxNum?.po_number) {
    const mm = maxNum.po_number.match(/PO-(\d+)/);
    if (mm) nextNum = Number(mm[1]) + 1;
  }
  const poNumber = `PO-${String(nextNum).padStart(3, '0')}`;
  const totalLanded = _r2(body.items.reduce((s, it) => s + (Number(it.unitCost) || 0) * (Number(it.qty) || 0), 0) * 1.1);
  const deposit = _r2(totalLanded * 0.3);
  const balance = _r2(totalLanded - deposit);
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO m2_purchase_orders(
      id, user_id, store_id, po_number, supplier_id, supplier_name, status,
      total_landed, currency, shipping_method, deposit, balance,
      notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      poId, userId, storeId, poNumber, supplier?.id || null,
      supplier?.name || body.supplierName || '默认供应商', 'draft',
      totalLanded, 'USD', body.shippingMethod || 'ocean_freight',
      deposit, balance, body.notes || null, nowIso()
    );
    for (const it of body.items) {
      const itemId = newId('poi');
      db.prepare(`INSERT INTO m2_purchase_order_items(
        id, user_id, store_id, po_id, sku, qty, unit_cost, subtotal, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        itemId, userId, storeId, poId, it.sku, Number(it.qty) || 0,
        Number(it.unitCost) || 0, _r2((Number(it.qty) || 0) * (Number(it.unitCost) || 0)),
        nowIso()
      );
    }
  });
  tx();
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'PO_CREATE',
    resourceType: 'm2_purchase_order', resourceId: poId,
    poNumber, totalLanded, itemCount: body.items.length,
  });
  return { id: poId, poNumber, status: 'draft', totalLanded };
}
export function updatePO(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m2_purchase_orders WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = []; const params = [];
  const map = {
    shippingMethod: 'shipping_method', tracking: 'tracking', notes: 'notes',
    supplierName: 'supplier_name', expectedAt: 'expected_at',
  };
  for (const [k, c] of Object.entries(map)) {
    if (patch[k] !== undefined) { fields.push(`${c}=?`); params.push(patch[k]); }
  }
  if (patch.documents !== undefined) { fields.push('documents=?'); params.push(JSON.stringify(patch.documents)); }
  if (!fields.length) return rowToPO(cur);
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  db.prepare(`UPDATE m2_purchase_orders SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'PO_UPDATE',
    resourceType: 'm2_purchase_order', resourceId: id, patch,
  });
  return rowToPO(db.prepare('SELECT * FROM m2_purchase_orders WHERE id=?').get(id));
}

const VALID_TRANSITIONS = {
  draft: ['ordered', 'cancelled'],
  ordered: ['in_transit', 'cancelled', 'disputed'],
  in_transit: ['received', 'cancelled', 'disputed'],
  received: ['disputed'],
  cancelled: [],
  disputed: ['received', 'cancelled'],
};
export function transitionPO(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m2_purchase_orders WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const to = body.to;
  if (!to) return { error: 'validation_error', message: 'to required' };
  const allowed = VALID_TRANSITIONS[cur.status] || [];
  if (!allowed.includes(to)) {
    return { error: 'invalid_transition', message: `${cur.status} -> ${to} not allowed` };
  }
  const tx = db.transaction(() => {
    const updates = ['status=?'];
    const params = [to];
    if (to === 'ordered') { updates.push('ordered_at=?'); params.push(nowIso()); }
    if (to === 'in_transit') {
      updates.push('shipped_at=?'); params.push(nowIso());
      if (body.tracking) { updates.push('tracking=?'); params.push(body.tracking); }
    }
    if (to === 'received') {
      updates.push('received_at=?'); params.push(body.receivedAt || nowIso());
    }
    updates.push('updated_at=?'); params.push(nowIso());
    params.push(id, userId, storeId);
    db.prepare(`UPDATE m2_purchase_orders SET ${updates.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);

    // 出账：ordered -> 写定金 cashflow
    if (to === 'ordered' && cur.deposit) {
      const cfId = newId('cfe');
      const today = nowIso().slice(0, 10);
      db.prepare(`INSERT INTO m2_cashflow_events(
        id, user_id, store_id, event_date, label, inflow, outflow, balance,
        source, ref_id, currency, is_forecast, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cfId, userId, storeId, today, `${cur.po_number} 定金`, 0, cur.deposit,
        null, 'po_deposit', id, 'USD', 0, nowIso()
      );
    }
    if (to === 'in_transit' && cur.balance) {
      const cfId = newId('cfe');
      const today = nowIso().slice(0, 10);
      db.prepare(`INSERT INTO m2_cashflow_events(
        id, user_id, store_id, event_date, label, inflow, outflow, balance,
        source, ref_id, currency, is_forecast, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        cfId, userId, storeId, today, `${cur.po_number} 尾款`, 0, cur.balance,
        null, 'po_balance', id, 'USD', 0, nowIso()
      );
    }
    // received -> 入库 inventory_snapshot
    if (to === 'received') {
      const items = db.prepare('SELECT * FROM m2_purchase_order_items WHERE po_id=? AND user_id=? AND store_id=?')
        .all(id, userId, storeId);
      for (const item of items) {
        const snap = db.prepare(`SELECT * FROM m2_inventory_snapshots
          WHERE user_id=? AND store_id=? AND sku=? AND warehouse=?`)
          .get(userId, storeId, item.sku, 'FBA-US');
        if (snap) {
          db.prepare('UPDATE m2_inventory_snapshots SET on_hand=?, snapshot_at=? WHERE id=?')
            .run((snap.on_hand || 0) + item.qty, nowIso(), snap.id);
        } else {
          const sid = newId('inv');
          db.prepare(`INSERT INTO m2_inventory_snapshots(
            id, user_id, store_id, sku, warehouse, on_hand, snapshot_at)
            VALUES (?,?,?,?,?,?,?)`).run(sid, userId, storeId, item.sku, 'FBA-US', item.qty, nowIso());
        }
      }
    }
    appendAuditLog(userId, storeId, {
      sourceModule: 'M2', actionType: 'PO_STATE_TRANSITION',
      resourceType: 'm2_purchase_order', resourceId: id,
      before: { status: cur.status }, after: { status: to },
      tracking: body.tracking, receivedAt: body.receivedAt,
    });
  });
  tx();
  return rowToPO(db.prepare('SELECT * FROM m2_purchase_orders WHERE id=?').get(id));
}

export function payPO(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m2_purchase_orders WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const phase = body.phase;
  if (!['deposit', 'balance'].includes(phase)) return { error: 'validation_error', message: 'phase required' };
  const tx = db.transaction(() => {
    if (phase === 'deposit') db.prepare('UPDATE m2_purchase_orders SET deposit_paid=1, updated_at=? WHERE id=?').run(nowIso(), id);
    else db.prepare('UPDATE m2_purchase_orders SET balance_paid=1, updated_at=? WHERE id=?').run(nowIso(), id);
    const cfId = newId('cfe');
    const date = body.paidAt ? body.paidAt.slice(0, 10) : nowIso().slice(0, 10);
    const amount = Number(body.amount) || (phase === 'deposit' ? cur.deposit : cur.balance);
    db.prepare(`INSERT INTO m2_cashflow_events(
      id, user_id, store_id, event_date, label, inflow, outflow, balance,
      source, ref_id, currency, is_forecast, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      cfId, userId, storeId, date, `${cur.po_number} ${phase}`, 0, amount || 0,
      null, `po_${phase}`, id, 'USD', 0, nowIso()
    );
    appendAuditLog(userId, storeId, {
      sourceModule: 'M2', actionType: 'PO_PAYMENT',
      resourceType: 'm2_purchase_order', resourceId: id,
      phase, amount, paidAt: body.paidAt,
    });
  });
  tx();
  return rowToPO(db.prepare('SELECT * FROM m2_purchase_orders WHERE id=?').get(id));
}

// ============================================================
// 供应商
// ============================================================
export function listSuppliers(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_suppliers WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  sql += ' ORDER BY rating DESC, created_at DESC';
  return db.prepare(sql).all(...params).map(rowToSupplier);
}
export function getSupplier(db, userId, storeId, id) {
  return rowToSupplier(db.prepare('SELECT * FROM m2_suppliers WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId));
}
export function createSupplier(db, userId, storeId, body) {
  if (!body.name) return { error: 'validation_error', message: 'name required' };
  const id = newId('sup');
  db.prepare(`INSERT INTO m2_suppliers(
    id, user_id, store_id, name, contact, email, phone, region, rating, status,
    sku_count, total_spend, on_time_rate, defect_rate, price_stability, lead_days,
    payment_terms, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.name, body.contact || null, body.email || null,
    body.phone || null, body.region || null, body.rating || 4.0, 'active',
    body.skuCount || 0, body.totalSpend || 0, body.onTimeRate || null,
    body.defectRate || null, body.priceStability || null, body.leadDays || null,
    body.paymentTerms || null, body.notes || null, nowIso()
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'SUPPLIER_CREATE',
    resourceType: 'm2_supplier', resourceId: id, name: body.name,
  });
  return getSupplier(db, userId, storeId, id);
}
export function updateSupplier(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m2_suppliers WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const map = {
    name: 'name', contact: 'contact', email: 'email', phone: 'phone',
    region: 'region', rating: 'rating', status: 'status',
    onTimeRate: 'on_time_rate', defectRate: 'defect_rate',
    priceStability: 'price_stability', leadDays: 'lead_days',
    paymentTerms: 'payment_terms', notes: 'notes',
  };
  const fields = []; const params = [];
  for (const [k, c] of Object.entries(map)) {
    if (patch[k] !== undefined) { fields.push(`${c}=?`); params.push(patch[k]); }
  }
  if (!fields.length) return rowToSupplier(cur);
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  db.prepare(`UPDATE m2_suppliers SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'SUPPLIER_UPDATE',
    resourceType: 'm2_supplier', resourceId: id, patch,
  });
  return getSupplier(db, userId, storeId, id);
}
export function deleteSupplier(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m2_suppliers WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('UPDATE m2_suppliers SET status=?, updated_at=? WHERE id=?').run('inactive', nowIso(), id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'SUPPLIER_DELETE',
    resourceType: 'm2_supplier', resourceId: id,
  });
  return { ok: true };
}

// ============================================================
// 重定价
// ============================================================
export function listRepricing(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_repricing_recommendations WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  sql += ' ORDER BY detected_at DESC';
  return db.prepare(sql).all(...params).map(rowToReprice);
}
export function triggerRepricing(db, userId, storeId, body) {
  if (!body.sku) return { error: 'validation_error', message: 'sku required' };
  const id = newId('rp');
  const rng = mulberry32(hashStr(body.sku + nowIso()));
  const ourPrice = 22.99 + rng() * 10;
  const compPrice = ourPrice * (0.9 + rng() * 0.2);
  const scenarios = [
    { price: _r2(ourPrice * 0.9), label: '激进 -10%', unitProfit: _r2(ourPrice * 0.9 * 0.2), margin: 0.2, expectedVolume30d: 380, expectedTotalProfit30d: _r2(ourPrice * 0.9 * 0.2 * 380), recommended: true },
    { price: _r2(ourPrice), label: '保持', unitProfit: _r2(ourPrice * 0.25), margin: 0.25, expectedVolume30d: 320, expectedTotalProfit30d: _r2(ourPrice * 0.25 * 320), recommended: false },
    { price: _r2(ourPrice * 1.05), label: '提价 +5%', unitProfit: _r2(ourPrice * 1.05 * 0.28), margin: 0.28, expectedVolume30d: 260, expectedTotalProfit30d: _r2(ourPrice * 1.05 * 0.28 * 260), recommended: false },
  ];
  db.prepare(`INSERT INTO m2_repricing_recommendations(
    id, user_id, store_id, sku, asin, our_price, competitor_asin, competitor_price,
    competitor_old_price, break_even_price, price_elasticity, scenarios,
    recommended_price, trigger_reason, status, detected_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.sku, body.asin || null, _r2(ourPrice),
    body.competitorAsin || 'B0COMP', _r2(compPrice), _r2(compPrice * 1.02),
    _r2(ourPrice * 0.7), 1.2, JSON.stringify(scenarios),
    scenarios[0].price, body.manual ? 'manual' : 'competitor_down',
    'pending', nowIso()
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'REPRICING_TRIGGER',
    resourceType: 'm2_repricing_recommendation', resourceId: id,
    sku: body.sku, manual: body.manual,
  });
  return rowToReprice(db.prepare('SELECT * FROM m2_repricing_recommendations WHERE id=?').get(id));
}
export function applyRepricing(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m2_repricing_recommendations WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status === 'applied') return { error: 'invalid_status', message: 'already applied' };
  const newPrice = Number(body.price) || cur.recommended_price;

  let m1VersionId = null;
  const audit = appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'REPRICE_APPLY',
    resourceType: 'm2_repricing_recommendation', resourceId: id,
    sku: cur.sku, oldPrice: cur.our_price, newPrice,
  });
  try {
    m1VersionId = _writeM1ListingVersionFromM2(db, userId, storeId, cur.sku, newPrice, audit?.id);
  } catch (e) {
    console.warn('[M2 applyRepricing] M1 write failed:', e?.message);
  }

  db.prepare(`UPDATE m2_repricing_recommendations
    SET status=?, applied_price=?, applied_at=?, audit_id=?, m1_listing_version_id=?
    WHERE id=?`).run('applied', newPrice, nowIso(), audit?.id || null, m1VersionId, id);

  return { id, status: 'applied', auditId: audit?.id || null, m1VersionId };
}

// 跨模块联动 helper: 写入 M1 listing version
function _writeM1ListingVersionFromM2(db, userId, storeId, sku, newPrice, parentAuditId) {
  // 查 product / target
  const product = db.prepare('SELECT id, asin FROM products WHERE user_id=? AND store_id=? AND sku=? LIMIT 1')
    .get(userId, storeId, sku);
  if (!product) {
    // 创建一个 M1 target 占位
    const targetId = newId('m1t');
    db.prepare(`INSERT INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind,
      is_competitor_only, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      targetId, userId, storeId, 'existing', null, null, 'own',
      0, 'optimizing', nowIso()
    );
    return _insertM1Version(db, userId, storeId, targetId, sku, newPrice, parentAuditId);
  }
  // 查或建 target
  let target = db.prepare(`SELECT id FROM m1_optimization_targets
    WHERE user_id=? AND store_id=? AND product_id=? LIMIT 1`).get(userId, storeId, product.id);
  if (!target) {
    const targetId = newId('m1t');
    db.prepare(`INSERT INTO m1_optimization_targets(
      id, user_id, store_id, mode, product_id, asin, asin_kind,
      is_competitor_only, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      targetId, userId, storeId, 'existing', product.id, product.asin, 'own',
      0, 'optimizing', nowIso()
    );
    target = { id: targetId };
  }
  return _insertM1Version(db, userId, storeId, target.id, sku, newPrice, parentAuditId);
}
function _insertM1Version(db, userId, storeId, targetId, sku, newPrice, parentAuditId) {
  const maxRow = db.prepare(`SELECT MAX(round_no) AS mx FROM m1_listing_versions
    WHERE user_id=? AND store_id=? AND target_id=?`).get(userId, storeId, targetId);
  const roundNo = (maxRow?.mx || 0) + 1;
  const versionId = newId('m1v');
  db.prepare(`INSERT INTO m1_listing_versions(
    id, user_id, store_id, target_id, run_id, round_no, source,
    title, bullet_1, bullet_2, bullet_3, bullet_4, bullet_5, description,
    a_plus_modules, main_image_id, side_image_ids, a_plus_image_ids,
    field_picks_hash, is_pinned, is_archived, uploaded_to_amazon, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    versionId, userId, storeId, targetId, null, roundNo, 'm2_reprice',
    `[M2 调价] ${sku} @ $${newPrice}`,
    `调价生效价：$${newPrice}`, '由 M2 重定价流程触发', '保留原列表内容',
    '保留 5 点结构', '价格策略已更新',
    `M2 REPRICE_APPLY: price -> $${newPrice}`,
    JSON.stringify([]), null, JSON.stringify([]), JSON.stringify([]),
    null, 0, 0, 0, nowIso()
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M1', actionType: 'LISTING_VERSION_CREATE_FROM_M2',
    resourceType: 'm1_listing_version', resourceId: versionId,
    sku, newPrice, parentAuditId,
  });
  return versionId;
}

// ============================================================
// 汇率
// ============================================================
export function getFxExposures(db, userId, storeId) {
  const rows = db.prepare('SELECT * FROM m2_fx_exposures WHERE user_id=? AND store_id=? ORDER BY share DESC')
    .all(userId, storeId).map(rowToFxExposure);
  const total = rows.reduce((s, r) => s + (r.cnyEquivalent || 0), 0);
  return {
    totalExposureCny: _r2(total),
    exposures: rows,
    recommendations: [
      'USD 占比偏高，建议增加 PingPong 提现频率',
      '欧元区敞口建议锁汇 30 天',
    ],
  };
}
export function getFxRates(db, userId, storeId, filters = {}) {
  const base = filters.base || 'USD';
  const quote = filters.quote || 'CNY';
  const days = Math.max(7, Math.min(180, Number(filters.days) || 30));
  const rows = db.prepare(`SELECT * FROM m2_fx_rates
    WHERE user_id=? AND store_id=? AND base=? AND quote=?
    ORDER BY rate_date DESC LIMIT ?`).all(userId, storeId, base, quote, days);
  const sorted = rows.slice().reverse();
  return {
    rateHistory: sorted.map((r) => ({ date: r.rate_date, [`${base.toLowerCase()}${quote}`]: r.rate, rate: r.rate })),
  };
}
export function getFxSensitivity(db, userId, storeId) {
  const exp = getFxExposures(db, userId, storeId);
  const total = exp.totalExposureCny;
  return {
    sensitivity: [-3, -1, 1, 3].map((d) => ({
      delta: d, profitImpactCny: _r2(total * d / 100),
    })),
  };
}

// ============================================================
// 支付通道
// ============================================================
export function listPaymentChannels(db, userId, storeId) {
  return db.prepare('SELECT * FROM m2_payment_channels WHERE user_id=? AND store_id=? ORDER BY is_primary DESC, created_at')
    .all(userId, storeId).map(rowToPaymentChannel);
}
export function createPaymentChannel(db, userId, storeId, body) {
  if (!body.name) return { error: 'validation_error', message: 'name required' };
  const id = newId('pc');
  db.prepare(`INSERT INTO m2_payment_channels(
    id, user_id, store_id, name, provider, is_primary, enabled,
    fee_pct, fee_fixed_per_tx, currency, monthly_volume, monthly_cost,
    warning, warning_message, account_info, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.name, body.provider || 'payoneer',
    body.isPrimary ? 1 : 0, body.enabled !== false ? 1 : 0,
    body.feePct || 0.01, body.feeFixedPerTx || 0,
    body.currency || 'USD', body.monthlyVolume || 0, body.monthlyCost || 0,
    body.warning ? 1 : 0, body.warningMessage || null,
    JSON.stringify(body.accountInfo || {}), nowIso()
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'PAYMENT_CHANNEL_CREATE',
    resourceType: 'm2_payment_channel', resourceId: id, name: body.name,
  });
  return rowToPaymentChannel(db.prepare('SELECT * FROM m2_payment_channels WHERE id=?').get(id));
}
export function updatePaymentChannel(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m2_payment_channels WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const map = {
    name: 'name', provider: 'provider', feePct: 'fee_pct',
    feeFixedPerTx: 'fee_fixed_per_tx', currency: 'currency',
    monthlyVolume: 'monthly_volume', monthlyCost: 'monthly_cost',
    warningMessage: 'warning_message',
  };
  const fields = []; const params = [];
  for (const [k, c] of Object.entries(map)) {
    if (patch[k] !== undefined) { fields.push(`${c}=?`); params.push(patch[k]); }
  }
  if (patch.isPrimary !== undefined) { fields.push('is_primary=?'); params.push(patch.isPrimary ? 1 : 0); }
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.warning !== undefined) { fields.push('warning=?'); params.push(patch.warning ? 1 : 0); }
  if (patch.accountInfo !== undefined) { fields.push('account_info=?'); params.push(JSON.stringify(patch.accountInfo)); }
  if (!fields.length) return rowToPaymentChannel(cur);
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  db.prepare(`UPDATE m2_payment_channels SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'PAYMENT_CHANNEL_UPDATE',
    resourceType: 'm2_payment_channel', resourceId: id, patch,
  });
  return rowToPaymentChannel(db.prepare('SELECT * FROM m2_payment_channels WHERE id=?').get(id));
}
export function deletePaymentChannel(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m2_payment_channels WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.is_primary) return { error: 'cannot_delete_primary', message: 'primary channel cannot be deleted' };
  db.prepare('DELETE FROM m2_payment_channels WHERE id=?').run(id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'PAYMENT_CHANNEL_DELETE',
    resourceType: 'm2_payment_channel', resourceId: id,
  });
  return { ok: true };
}

// ============================================================
// 税务
// ============================================================
export function getTaxSummary(db, userId, storeId) {
  const vats = db.prepare(`SELECT region, SUM(due) AS due FROM m2_tax_records
    WHERE user_id=? AND store_id=? AND tax_type='vat' GROUP BY region`).all(userId, storeId);
  const sales = db.prepare(`SELECT region, SUM(collected) AS collected FROM m2_tax_records
    WHERE user_id=? AND store_id=? AND tax_type='sales_tax' GROUP BY region`).all(userId, storeId);
  const deadlines = db.prepare(`SELECT region, tax_type, deadline, days_left FROM m2_tax_records
    WHERE user_id=? AND store_id=? AND status='pending' AND days_left IS NOT NULL
    ORDER BY days_left ASC LIMIT 6`).all(userId, storeId);
  return {
    vat: {
      totalDue: _r2(vats.reduce((s, v) => s + (v.due || 0), 0)),
      byCountry: vats.map((v) => ({ region: v.region, due: _r2(v.due) })),
    },
    salesTax: {
      totalCollected: _r2(sales.reduce((s, v) => s + (v.collected || 0), 0)),
      byState: sales.map((v) => ({ region: v.region, collected: _r2(v.collected) })),
    },
    deadlines: deadlines.map((d) => ({
      name: `${d.tax_type === 'vat' ? 'VAT' : 'Sales Tax'} - ${d.region}`,
      dueAt: d.deadline, daysLeft: d.days_left,
    })),
  };
}
export function listTaxRecords(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_tax_records WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.type) { sql += ' AND tax_type=?'; params.push(filters.type); }
  if (filters.region) { sql += ' AND region=?'; params.push(filters.region); }
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  sql += ' ORDER BY deadline ASC';
  return db.prepare(sql).all(...params).map(rowToTax);
}
export function fileTaxRecord(db, userId, storeId, id, body) {
  const cur = db.prepare('SELECT * FROM m2_tax_records WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'pending') return { error: 'invalid_status', message: `current: ${cur.status}` };
  db.prepare('UPDATE m2_tax_records SET status=?, filing_ref=? WHERE id=?').run('filed', body.filingRef || null, id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'TAX_FILE',
    resourceType: 'm2_tax_record', resourceId: id, filingRef: body.filingRef,
  });
  return rowToTax(db.prepare('SELECT * FROM m2_tax_records WHERE id=?').get(id));
}

// ============================================================
// LTV
// ============================================================
export function listLtv(db, userId, storeId) {
  return db.prepare('SELECT * FROM m2_ltv_snapshots WHERE user_id=? AND store_id=? ORDER BY ltv DESC')
    .all(userId, storeId).map(rowToLtv);
}

// ============================================================
// 报警规则 + 事件
// ============================================================
export function listAlertRules(db, userId, storeId) {
  return db.prepare('SELECT * FROM m2_alert_rules WHERE user_id=? AND store_id=? ORDER BY created_at DESC')
    .all(userId, storeId).map(rowToAlertRule);
}
export function createAlertRule(db, userId, storeId, body) {
  if (!body.name) return { error: 'validation_error', message: 'name required' };
  const id = newId('ar');
  db.prepare(`INSERT INTO m2_alert_rules(
    id, user_id, store_id, name, conditions, severity, notify_channels,
    enabled, cooldown_hours, trigger_count, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, userId, storeId, body.name,
    JSON.stringify(body.conditions || []),
    body.severity || 'P1',
    JSON.stringify(body.notifyChannels || body.notify_channels || ['in_app']),
    body.enabled !== false ? 1 : 0, body.cooldownHours || 6, 0, nowIso()
  );
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'ALERT_RULE_CREATE',
    resourceType: 'm2_alert_rule', resourceId: id, name: body.name,
  });
  return rowToAlertRule(db.prepare('SELECT * FROM m2_alert_rules WHERE id=?').get(id));
}
export function updateAlertRule(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m2_alert_rules WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = []; const params = [];
  if (patch.name !== undefined) { fields.push('name=?'); params.push(patch.name); }
  if (patch.severity !== undefined) { fields.push('severity=?'); params.push(patch.severity); }
  if (patch.cooldownHours !== undefined) { fields.push('cooldown_hours=?'); params.push(patch.cooldownHours); }
  if (patch.conditions !== undefined) { fields.push('conditions=?'); params.push(JSON.stringify(patch.conditions)); }
  if (patch.notifyChannels !== undefined) { fields.push('notify_channels=?'); params.push(JSON.stringify(patch.notifyChannels)); }
  const isToggle = patch.enabled !== undefined && Object.keys(patch).length === 1;
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  if (!fields.length) return rowToAlertRule(cur);
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  db.prepare(`UPDATE m2_alert_rules SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: isToggle ? 'ALERT_RULE_TOGGLE' : 'ALERT_RULE_UPDATE',
    resourceType: 'm2_alert_rule', resourceId: id, patch,
  });
  return rowToAlertRule(db.prepare('SELECT * FROM m2_alert_rules WHERE id=?').get(id));
}
export function deleteAlertRule(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m2_alert_rules WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('DELETE FROM m2_alert_rules WHERE id=?').run(id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'ALERT_RULE_DELETE',
    resourceType: 'm2_alert_rule', resourceId: id,
  });
  return { ok: true };
}
export function listAlertEvents(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_alert_events WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.ruleId) { sql += ' AND rule_id=?'; params.push(filters.ruleId); }
  if (filters.acknowledged !== undefined && filters.acknowledged !== null && filters.acknowledged !== '') {
    sql += ' AND acknowledged=?';
    params.push(filters.acknowledged === '1' || filters.acknowledged === 'true' || filters.acknowledged === true ? 1 : 0);
  }
  sql += ' ORDER BY triggered_at DESC LIMIT 200';
  return db.prepare(sql).all(...params).map(rowToAlertEvent);
}
/**
 * scanAlerts —— 遍历启用的规则，匹配则写 m2_alert_events 一行
 * 简单实现：对启用的规则模拟一次"触发"，写 1 条事件 + 增 trigger_count + 写 audit
 * 也尝试给 M4 推一条 notification（如果 m4_notifications 表存在）
 */
export function scanAlerts(db, userId, storeId, body = {}) {
  const rules = db.prepare(`SELECT * FROM m2_alert_rules
    WHERE user_id=? AND store_id=? AND enabled=1`).all(userId, storeId);
  const created = [];
  const ruleId = body.ruleId;  // optional: only scan one
  for (const r of rules) {
    if (ruleId && r.id !== ruleId) continue;
    const eventId = newId('ae');
    const message = `${r.name} 触发：扫描时检测到匹配条件 (rule=${r.id})`;
    db.prepare(`INSERT INTO m2_alert_events(
      id, user_id, store_id, rule_id, rule_name, severity, matched_value,
      message, acknowledged, pushed_to_m4, triggered_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      eventId, userId, storeId, r.id, r.name, r.severity,
      JSON.stringify({ source: 'scan', value: 'simulated_trigger' }),
      message, 0, 0, nowIso()
    );
    db.prepare(`UPDATE m2_alert_rules SET trigger_count=trigger_count+1, last_triggered=?
      WHERE id=?`).run(nowIso(), r.id);
    // M4 推送（best-effort）
    try {
      db.prepare(`INSERT INTO m4_notifications(
        id, user_id, store_id, source_module, type, severity, title, detail, related_id, acknowledged, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        newId('n'), userId, storeId, 'M2', 'alert_event', r.severity,
        r.name, message, eventId, 0, nowIso()
      );
    } catch { /* m4_notifications schema mismatch — skip */ }
    appendAuditLog(userId, storeId, {
      sourceModule: 'M2', actionType: 'ALERT_SCAN',
      resourceType: 'm2_alert_event', resourceId: eventId,
      ruleId: r.id, ruleName: r.name,
    });
    created.push({ eventId, ruleId: r.id, ruleName: r.name, severity: r.severity });
  }
  return { scanned: rules.length, created: created.length, events: created };
}
export function ackAlertEvent(db, userId, storeId, id, body = {}) {
  const cur = db.prepare('SELECT * FROM m2_alert_events WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  db.prepare('UPDATE m2_alert_events SET acknowledged=1, acknowledged_at=?, acknowledged_by=? WHERE id=?')
    .run(nowIso(), body.by || 'operator', id);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'ALERT_ACK',
    resourceType: 'm2_alert_event', resourceId: id, by: body.by,
  });
  return rowToAlertEvent(db.prepare('SELECT * FROM m2_alert_events WHERE id=?').get(id));
}

// ============================================================
// 维度
// ============================================================
export function listDimensions(db, userId, storeId, by) {
  let sql = 'SELECT * FROM m2_dimensions WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (by) { sql += ' AND dim_type=?'; params.push(by); }
  sql += ' ORDER BY name';
  const items = db.prepare(sql).all(...params).map(rowToDimension);
  return {
    items: items.map((d) => ({
      id: d.id, name: d.name, members: d.members, dimType: d.dimType,
      skus: d.metrics?.skus || (d.skuIds?.length || 0),
      gmv: d.metrics?.gmv || 0,
      profit: d.metrics?.profit || 0,
      margin: d.metrics?.margin || 0,
    })),
  };
}
export function updateDimension(db, userId, storeId, id, patch) {
  const cur = db.prepare('SELECT * FROM m2_dimensions WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  const fields = []; const params = [];
  if (patch.name !== undefined) { fields.push('name=?'); params.push(patch.name); }
  if (patch.members !== undefined) { fields.push('members=?'); params.push(patch.members); }
  if (patch.skuIds !== undefined) { fields.push('sku_ids=?'); params.push(JSON.stringify(patch.skuIds)); }
  if (patch.metrics !== undefined) { fields.push('metrics=?'); params.push(JSON.stringify(patch.metrics)); }
  if (!fields.length) return rowToDimension(cur);
  fields.push('computed_at=?'); params.push(nowIso());
  params.push(id, userId, storeId);
  db.prepare(`UPDATE m2_dimensions SET ${fields.join(', ')} WHERE id=? AND user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'DIMENSION_UPDATE',
    resourceType: 'm2_dimension', resourceId: id, patch,
  });
  return rowToDimension(db.prepare('SELECT * FROM m2_dimensions WHERE id=?').get(id));
}

// ============================================================
// 库存联动
// ============================================================
export function getInvLinkConfig(db, userId, storeId) {
  let r = db.prepare('SELECT * FROM m2_inventory_link_config WHERE user_id=? AND store_id=?').get(userId, storeId);
  if (!r) {
    const id = newId('ilc');
    db.prepare(`INSERT INTO m2_inventory_link_config(
      id, user_id, store_id, enabled, stop_at, reduce_50_at, reduce_20_at, alert_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, userId, storeId, 1, 3, 7, 14, 21, nowIso());
    r = db.prepare('SELECT * FROM m2_inventory_link_config WHERE id=?').get(id);
  }
  return rowToInvLinkConfig(r);
}
export function updateInvLinkConfig(db, userId, storeId, patch) {
  const cur = getInvLinkConfig(db, userId, storeId);
  const fields = []; const params = [];
  if (patch.enabled !== undefined) { fields.push('enabled=?'); params.push(patch.enabled ? 1 : 0); }
  const t = patch.thresholds || patch;
  if (t.stopAt !== undefined) { fields.push('stop_at=?'); params.push(t.stopAt); }
  if (t.reduce50At !== undefined) { fields.push('reduce_50_at=?'); params.push(t.reduce50At); }
  if (t.reduce20At !== undefined) { fields.push('reduce_20_at=?'); params.push(t.reduce20At); }
  if (t.alertAt !== undefined) { fields.push('alert_at=?'); params.push(t.alertAt); }
  if (!fields.length) return cur;
  fields.push('updated_at=?'); params.push(nowIso());
  params.push(userId, storeId);
  db.prepare(`UPDATE m2_inventory_link_config SET ${fields.join(', ')} WHERE user_id=? AND store_id=?`).run(...params);
  appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'INVENTORY_LINK_CONFIG_UPDATE',
    resourceType: 'm2_inventory_link_config', resourceId: cur.id, patch,
  });
  return getInvLinkConfig(db, userId, storeId);
}
export function listInvLinkEvents(db, userId, storeId, filters = {}) {
  let sql = 'SELECT * FROM m2_inventory_link_events WHERE user_id=? AND store_id=?';
  const params = [userId, storeId];
  if (filters.status) { sql += ' AND status=?'; params.push(filters.status); }
  sql += ' ORDER BY detected_at DESC';
  return db.prepare(sql).all(...params).map(rowToInvLinkEvent);
}
// 跨模块联动：M2 → M3 暂停广告 / 调预算
export function executeInvLinkEvent(db, userId, storeId, id) {
  const cur = db.prepare('SELECT * FROM m2_inventory_link_events WHERE id=? AND user_id=? AND store_id=?').get(id, userId, storeId);
  if (!cur) return null;
  if (cur.status !== 'pending') return { error: 'invalid_status', message: `current: ${cur.status}` };

  const audit = appendAuditLog(userId, storeId, {
    sourceModule: 'M2', actionType: 'INVENTORY_LINK_EXECUTE',
    resourceType: 'm2_inventory_link_event', resourceId: id,
    sku: cur.sku, action: cur.action, daysLeft: cur.days_left,
  });

  // M2→M3 联动：定位 lx_campaigns by sku
  const impacted = [];
  try {
    const campaigns = _listCampaigns(db, userId, storeId);
    const skuCampaigns = campaigns.filter((c) =>
      (c.skus && (Array.isArray(c.skus) ? c.skus.includes(cur.sku) : String(c.skus).includes(cur.sku)))
      || (c.name && c.name.includes(cur.sku))
    );
    for (const c of skuCampaigns) {
      if (cur.action === 'stop_all') {
        const updated = _toggleCampaign(db, userId, storeId, c.id, false);
        if (updated) impacted.push(c.id);
      } else if (cur.action === 'bid_reduce_50') {
        const updated = _updateCampaignBudget(db, userId, storeId, c.id, _r2((c.dailyBudget || 100) * 0.5), 'm2_inventory_link');
        if (updated) impacted.push(c.id);
      } else if (cur.action === 'bid_reduce_20') {
        const updated = _updateCampaignBudget(db, userId, storeId, c.id, _r2((c.dailyBudget || 100) * 0.8), 'm2_inventory_link');
        if (updated) impacted.push(c.id);
      }
      // alert_only：不动 M3
    }
  } catch (e) {
    console.warn('[M2 invLink M3 call failed]', e?.message);
  }

  db.prepare(`UPDATE m2_inventory_link_events
    SET status=?, executed_at=?, impact_campaigns=?, audit_id=?
    WHERE id=?`).run('auto_executed', nowIso(), JSON.stringify(impacted), audit?.id || null, id);

  // 同时推 M4 通知
  try {
    appendM4Notification(db, userId, storeId, {
      source: 'M2', type: 'inventory_link', severity: cur.days_left < 3 ? 'P0' : 'P1',
      title: `库存联动: ${cur.sku} 触发 ${cur.action}`,
      detail: { sku: cur.sku, daysLeft: cur.days_left, action: cur.action, impactCampaigns: impacted },
      relatedId: id,
    });
  } catch {}

  return rowToInvLinkEvent(db.prepare('SELECT * FROM m2_inventory_link_events WHERE id=?').get(id));
}

// ============================================================
// 种子数据
// ============================================================
const SKUS = [
  { sku: 'CASE-001', asin: 'B0CASE001', productId: 'prod-case-001', price: 22.99, unitCost: 8.4 },
  { sku: 'CABLE-002', asin: 'B0CABLE002', productId: 'prod-cable-002', price: 12.99, unitCost: 5.1 },
  { sku: 'LAMP-003', asin: 'B0LAMP003', productId: 'prod-lamp-003', price: 19.99, unitCost: 12.5 },
];

export function seedProfitForUser(db, userId, storeId) {
  const rng = mulberry32(hashStr(`${userId}::${storeId}::m2`));
  const tx = db.transaction(() => {
    // 清旧
    for (const t of PROFIT_TABLES_TO_CLEAN) {
      db.prepare(`DELETE FROM ${t} WHERE user_id=? AND store_id=?`).run(userId, storeId);
    }
    db.prepare('DELETE FROM m4_notifications WHERE user_id=? AND store_id=? AND source_module=?').run(userId, storeId, 'M2');

    // ---- m2_orders + m2_order_costs（412 单 × 14 项费用）----
    const now = Date.now();
    const orderInsert = db.prepare(`INSERT INTO m2_orders(
      id, user_id, store_id, order_id, asin, sku, product_id, marketplace, currency,
      quantity, unit_price, revenue, total_costs, net_profit, profit_margin,
      accuracy_level, confidence, ordered_at, shipped_at, settled_at, raw, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const costInsert = db.prepare(`INSERT INTO m2_order_costs(
      id, user_id, store_id, order_id, cost_type, amount, currency,
      accuracy_level, source, detail, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const totalOrders = 412;
    for (let i = 0; i < totalOrders; i++) {
      const skuObj = SKUS[Math.floor(rng() * SKUS.length)];
      const orderedAt = new Date(now - Math.floor(rng() * 30 * 86400000)).toISOString();
      const qty = Math.floor(rng() * 3) + 1;
      const unitPrice = _r2(skuObj.price * (0.95 + rng() * 0.1));
      const revenue = _r2(unitPrice * qty);
      const accuracyRoll = rng();
      const accLevel = accuracyRoll < 0.8 ? 'final' : (accuracyRoll < 0.95 ? 'high_estimate' : 'estimate');
      const conf = accLevel === 'final' ? _r2(0.9 + rng() * 0.08) : (accLevel === 'high_estimate' ? _r2(0.75 + rng() * 0.12) : _r2(0.55 + rng() * 0.15));

      const referral = _r2(revenue * 0.15);
      const fbaFee = _r2(3.85 * qty);
      const refundProv = _r2(revenue * 0.04);
      const storage = _r2(0.65 * qty);
      const adAlloc = _r2(revenue * 0.12);
      const cogs = _r2(skuObj.unitCost * qty);
      const freight = _r2(2.10 * qty);
      const fxLoss = _r2(revenue * 0.02);
      const capital = _r2(revenue * 0.007);
      const lts = rng() < 0.1 ? _r2(rng() * 1.5) : 0;
      const retProc = rng() < 0.05 ? _r2(rng() * 2) : 0;
      const inbound = _r2(0.50 * qty);
      const subscription = _r2(0.10);
      const misc = _r2(rng() * 0.5);
      const costs = {
        referral_fee: referral, fba_fee: fbaFee, refund_provision: refundProv,
        storage, ad_alloc: adAlloc, cogs, freight, fx_loss: fxLoss,
        capital_cost: capital, long_term_storage: lts,
        return_processing: retProc, inbound_placement: inbound,
        subscription, misc,
      };
      const totalCost = _r2(Object.values(costs).reduce((s, v) => s + v, 0));
      const netProfit = _r2(revenue - totalCost);
      const margin = revenue > 0 ? _r2(netProfit / revenue) : 0;

      const orderId = `112-${String(1000000 + i).padStart(7, '0')}-${String(Math.floor(rng() * 9000000) + 1000000)}`;
      const id = newId('m2o');
      orderInsert.run(
        id, userId, storeId, orderId, skuObj.asin, skuObj.sku, skuObj.productId,
        'ATVPDKIKX0DER', 'USD', qty, unitPrice, revenue, totalCost, netProfit, margin,
        accLevel, conf, orderedAt, orderedAt, accLevel === 'final' ? orderedAt : null,
        JSON.stringify({ raw: 'seed' }), nowIso()
      );
      for (const ct of COST_TYPES) {
        const cid = newId('m2c');
        costInsert.run(
          cid, userId, storeId, orderId, ct, costs[ct] || 0, 'USD',
          accLevel, 'amazon_estimated', JSON.stringify({}), nowIso()
        );
      }
    }

    // ---- m2_sku_profit_snapshots（5 SKU x 3 range 这里只取 3 SKU）----
    const snapInsert = db.prepare(`INSERT INTO m2_sku_profit_snapshots(
      id, user_id, store_id, sku, asin, product_id, range_days,
      revenue, cogs, fees, ad_cost, refund, storage, total_cost,
      net_profit, margin, units_sold, lifecycle, days_cover, computed_at, detail)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const range of [7, 30, 90]) {
      for (const skuObj of SKUS) {
        const id = newId('skupf');
        const rev = _r2(skuObj.price * (range * 12));
        const cogs = _r2(skuObj.unitCost * (range * 12));
        const fees = _r2(rev * 0.2);
        const adCost = _r2(rev * 0.12);
        const refund = _r2(rev * 0.04);
        const storage = _r2(rev * 0.03);
        const totalCost = _r2(cogs + fees + adCost + refund + storage);
        const net = _r2(rev - totalCost);
        snapInsert.run(
          id, userId, storeId, skuObj.sku, skuObj.asin, skuObj.productId, range,
          rev, cogs, fees, adCost, refund, storage, totalCost,
          net, rev > 0 ? _r2(net / rev) : 0, range * 12,
          ['mature', 'growth', 'mature'][SKUS.indexOf(skuObj)], 30,
          nowIso(), JSON.stringify({ cogs, fees, ad_cost: adCost })
        );
      }
    }

    // ---- m2_cashflow_events（90 天 + 12 个 label 事件）----
    const cfInsert = db.prepare(`INSERT INTO m2_cashflow_events(
      id, user_id, store_id, event_date, label, inflow, outflow, balance,
      source, ref_id, currency, is_forecast, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let bal = 350000;
    for (let d = 0; d < 90; d++) {
      const date = new Date(now + d * 86400000).toISOString().slice(0, 10);
      let label = null, inflow = 0, outflow = 0, source = 'forecast';
      if (d % 14 === 0 && d > 0) { label = 'Amazon 双周结算'; inflow = 48000; source = 'amazon_settle'; }
      if (d % 30 === 5) { label = 'PingPong 提现'; inflow = inflow ? inflow + 30000 : 30000; source = 'pingpong_withdraw'; }
      if (d === 7) { label = 'PO-018 定金'; outflow = 15000; source = 'po_deposit'; }
      if (d === 30) { label = 'PO-018 尾款'; outflow = 35000; source = 'po_balance'; }
      bal += inflow - outflow;
      cfInsert.run(newId('cfe'), userId, storeId, date, label, inflow, outflow, bal,
        source, null, 'CNY', d > 0 ? 1 : 0, nowIso());
    }

    // ---- m2_leaks（12 行）----
    const leakInsert = db.prepare(`INSERT INTO m2_leaks(
      id, user_id, store_id, title, severity, type, sku, asin, recommendation,
      evidence, monthly_impact, confidence, status, detected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const leakDefs = [
      ['广告 ACOS 飙升', 'P0', 'AD_OVERSPEND', 'CASE-001', 'B0CASE001', '暂停 5 个低效广告组', 18000],
      ['长期仓储费即将触发', 'P0', 'STORAGE_FEE', 'LAMP-003', 'B0LAMP003', '清仓 30%', 12000],
      ['汇率敞口过大', 'P0', 'FX_LOSS', null, null, '锁汇 30 天', 9000],
      ['退款率超过阈值', 'P1', 'REFUND_HIGH', 'CABLE-002', 'B0CABLE002', '改进包装', 5000],
      ['广告费用占比过高', 'P1', 'AD_OVERSPEND', 'CASE-001', 'B0CASE001', '降 bid 20%', 4500],
      ['滞销库存超过 180 天', 'P1', 'INVENTORY_AGING', 'LAMP-003', 'B0LAMP003', 'Removal', 4000],
      ['利润率为负', 'P1', 'NEGATIVE_MARGIN', 'CABLE-002', 'B0CABLE002', '提价或降本', 3500],
      ['仓储费占比异常', 'P1', 'STORAGE_FEE', 'LAMP-003', null, '减少 FBA 库存', 3000],
      ['价差导致 BuyBox 流失', 'P1', 'PRICE_GAP', 'CASE-001', 'B0CASE001', '调价 -5%', 2500],
      ['退款率 7 天异常', 'P2', 'REFUND_HIGH', 'CASE-001', 'B0CASE001', '关注客服', 1500],
      ['库存周转偏慢', 'P2', 'INVENTORY_AGING', 'CABLE-002', null, '促销', 1200],
      ['ACOS 偏高', 'P2', 'AD_OVERSPEND', 'CABLE-002', null, '调 bid', 1000],
    ];
    for (const [title, sev, type, sku, asin, rec, impact] of leakDefs) {
      const id = newId('leak');
      leakInsert.run(id, userId, storeId, title, sev, type, sku, asin, rec,
        JSON.stringify({ note: 'auto' }), impact, _r2(0.7 + rng() * 0.2), 'pending', nowIso());
    }

    // ---- m2_scenarios（3 行）----
    const scInsert = db.prepare(`INSERT INTO m2_scenarios(
      id, user_id, store_id, name, sku, baseline, variables, result, preset, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const preset of ['reset', 'conservative', 'aggressive']) {
      scInsert.run(newId('sc'), userId, storeId, `${preset} 情景`, 'CASE-001',
        JSON.stringify({ price: 22.99, acos: 0.22, monthlyVolume: 320, returnRate: 0.05 }),
        JSON.stringify({ priceDelta: preset === 'aggressive' ? -10 : 0, acosDelta: 0, volumeDelta: preset === 'aggressive' ? 30 : 0, returnDelta: 0 }),
        JSON.stringify({ monthlyProfit: 1240 }), preset, nowIso());
    }

    // ---- m2_inventory_snapshots（5 SKU × 4 warehouse 取 3×4=12）----
    const invInsert = db.prepare(`INSERT INTO m2_inventory_snapshots(
      id, user_id, store_id, sku, asin, product_id, warehouse,
      on_hand, reserved, inbound, available, unit_cost,
      daily_velocity, days_cover, in_stock_days, lts_countdown_days, snapshot_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const warehouses = ['FBA-US', 'FBA-DE', 'OVERSEAS', 'IN_TRANSIT'];
    for (const skuObj of SKUS) {
      for (const wh of warehouses) {
        const id = newId('inv');
        const onHand = skuObj.sku === 'LAMP-003' && wh === 'FBA-US' ? 1200
          : skuObj.sku === 'CASE-001' && wh === 'FBA-US' ? 350
          : Math.floor(rng() * 300);
        const velocity = skuObj.sku === 'CASE-001' ? 12 : (skuObj.sku === 'LAMP-003' ? 3 : 8);
        invInsert.run(id, userId, storeId, skuObj.sku, skuObj.asin, skuObj.productId, wh,
          onHand, 0, 0, onHand, skuObj.unitCost, velocity,
          velocity > 0 ? Math.floor(onHand / velocity) : 0,
          skuObj.sku === 'LAMP-003' && wh === 'FBA-US' ? 210 : Math.floor(rng() * 90),
          skuObj.sku === 'LAMP-003' && wh === 'FBA-US' ? 30 : 180,
          nowIso());
      }
    }

    // ---- m2_reorder_recommendations（4 行）----
    const reorderInsert = db.prepare(`INSERT INTO m2_reorder_recommendations(
      id, user_id, store_id, sku, product_id, urgency, recommended_qty,
      capital_required, days_remaining, forecast_daily, lead_days, safety_days,
      supplier_id, status, computed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const reorderDefs = [
      ['CASE-001', 'critical', 500, 4200, 8, 12.5],
      ['CABLE-002', 'high', 800, 4080, 15, 8],
      ['CABLE-002', 'high', 600, 3060, 18, 6],
      ['LAMP-003', 'medium', 200, 2500, 25, 3],
    ];
    for (const [sku, urg, qty, capital, days, vel] of reorderDefs) {
      const skuObj = SKUS.find((s) => s.sku === sku);
      const id = newId('reord');
      reorderInsert.run(id, userId, storeId, sku, skuObj?.productId || null,
        urg, qty, capital, days, vel, 35, 7, null, 'pending', nowIso());
    }

    // ---- m2_slow_moving_decisions（2 行）----
    const slowInsert = db.prepare(`INSERT INTO m2_slow_moving_decisions(
      id, user_id, store_id, sku, asin, inventory, inventory_value,
      monthly_storage_cost, capital_lock_cost_yearly, in_stock_days,
      lts_countdown_days, options, recommended_option, status, detected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const slowOpts = (rec) => [
      { id: 'A', label: '降价清仓 30%', daysToClose: 45, totalLoss: -3200, cashRecovery: 33600, recommended: rec === 'A', reason: '快速回笼资金' },
      { id: 'B', label: 'Promotion 限时 20% off', daysToClose: 60, totalLoss: -1800, cashRecovery: 38400, recommended: rec === 'B' },
      { id: 'C', label: 'FBA Removal 退回海外仓', daysToClose: 30, totalLoss: -1200, cashRecovery: 40000, recommended: rec === 'C' },
      { id: 'D', label: '销毁处理', daysToClose: 7, totalLoss: -4800, cashRecovery: 0, recommended: rec === 'D' },
    ];
    slowInsert.run(newId('slow'), userId, storeId, 'LAMP-003', 'B0LAMP003',
      1200, 48000, 4500, 9600, 210, 30,
      JSON.stringify(slowOpts('A')), 'A', 'pending', nowIso());
    slowInsert.run(newId('slow'), userId, storeId, 'CABLE-002', 'B0CABLE002',
      600, 18000, 1800, 3600, 180, 60,
      JSON.stringify(slowOpts('C')), 'C', 'pending', nowIso());

    // ---- m2_inventory_transfers（3 行）----
    const xferInsert = db.prepare(`INSERT INTO m2_inventory_transfers(
      id, user_id, store_id, sku, from_warehouse, to_warehouse, transfer_qty,
      transfer_cost, repurchase_cost, savings, reason, lead_days, status, detected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    xferInsert.run(newId('xfer'), userId, storeId, 'CASE-001', 'FBA-DE', 'FBA-US', 200, 800, 2400, 1600, 'DE 滞销 US 紧张', 7, 'recommended', nowIso());
    xferInsert.run(newId('xfer'), userId, storeId, 'CABLE-002', 'FBA-DE', 'FBA-US', 300, 600, 2100, 1500, 'DE 缓慢 US 高速', 7, 'recommended', nowIso());
    xferInsert.run(newId('xfer'), userId, storeId, 'LAMP-003', 'OVERSEAS', 'FBA-US', 100, 500, 1500, 1000, '海外仓有富余', 14, 'recommended', nowIso());

    // ---- m2_suppliers（4 行）----
    const supInsert = db.prepare(`INSERT INTO m2_suppliers(
      id, user_id, store_id, name, contact, email, phone, region, rating, status,
      sku_count, total_spend, on_time_rate, defect_rate, price_stability, lead_days,
      payment_terms, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const supplierDefs = [
      ['深圳福田电子厂', '张经理', 'zhang@sup1.cn', '+86 138...', '广东深圳', 4.8, 12, 280000, 0.95, 0.02, 0.92, 35, '30% 定金 70% 出货', 'PO 配合度高'],
      ['宁波海康配件', '李老板', 'li@sup2.cn', '+86 139...', '浙江宁波', 4.5, 8, 145000, 0.88, 0.04, 0.85, 28, '50% 定金 50% 出货', null],
      ['义乌饰品城 A05', '王姐', 'wang@sup3.cn', '+86 137...', '浙江义乌', 4.2, 6, 78000, 0.82, 0.06, 0.78, 21, '现金 / 支票', '小批量灵活'],
      ['东莞精密制造', '陈总', 'chen@sup4.cn', '+86 136...', '广东东莞', 4.0, 4, 52000, 0.75, 0.05, 0.7, 42, 'TT 30/70', '价格谈判空间大'],
    ];
    const supIds = [];
    for (const def of supplierDefs) {
      const id = newId('sup');
      supIds.push(id);
      supInsert.run(id, userId, storeId, def[0], def[1], def[2], def[3], def[4], def[5], 'active',
        def[6], def[7], def[8], def[9], def[10], def[11], def[12], def[13], nowIso());
    }

    // ---- m2_purchase_orders + items（6 PO × 2 item）----
    const poInsert = db.prepare(`INSERT INTO m2_purchase_orders(
      id, user_id, store_id, po_number, supplier_id, supplier_name, status,
      total_landed, currency, shipping_method, tracking, deposit, balance,
      ordered_at, shipped_at, expected_at, received_at,
      documents, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const poiInsert = db.prepare(`INSERT INTO m2_purchase_order_items(
      id, user_id, store_id, po_id, sku, qty, unit_cost, subtotal, received_qty, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const poDefs = [
      ['PO-001', 'draft', 'CASE-001', 1000, 8.4, null, null, null, null],
      ['PO-002', 'draft', 'CABLE-002', 2000, 5.1, null, null, null, null],
      ['PO-003', 'ordered', 'CASE-001', 800, 8.4, new Date(now - 5*86400000).toISOString(), null, null, null],
      ['PO-004', 'in_transit', 'LAMP-003', 600, 12.5, new Date(now - 20*86400000).toISOString(), new Date(now - 15*86400000).toISOString(), new Date(now + 10*86400000).toISOString(), null],
      ['PO-005', 'in_transit', 'CABLE-002', 1500, 5.1, new Date(now - 25*86400000).toISOString(), new Date(now - 20*86400000).toISOString(), new Date(now + 5*86400000).toISOString(), null],
      ['PO-006', 'received', 'CASE-001', 1200, 8.4, new Date(now - 60*86400000).toISOString(), new Date(now - 50*86400000).toISOString(), new Date(now - 20*86400000).toISOString(), new Date(now - 18*86400000).toISOString()],
    ];
    for (let i = 0; i < poDefs.length; i++) {
      const [num, st, sku, qty, uc, ordAt, shipAt, expAt, recAt] = poDefs[i];
      const id = newId('po');
      const total = _r2(qty * uc * 1.1);
      const dep = _r2(total * 0.3); const bal = _r2(total - dep);
      poInsert.run(id, userId, storeId, num, supIds[i % supIds.length], supplierDefs[i % supplierDefs.length][0],
        st, total, 'USD', 'ocean_freight', st !== 'draft' && st !== 'ordered' ? 'TRK-' + i : null,
        dep, bal, ordAt, shipAt, expAt, recAt,
        JSON.stringify({}), `Seed PO ${num}`, nowIso());
      const itId = newId('poi');
      poiInsert.run(itId, userId, storeId, id, sku, qty, uc, _r2(qty * uc),
        st === 'received' ? qty : 0, nowIso());
      // 第二个 item
      const sku2 = SKUS[(i + 1) % SKUS.length].sku;
      const uc2 = SKUS[(i + 1) % SKUS.length].unitCost;
      const qty2 = Math.floor(qty * 0.3);
      poiInsert.run(newId('poi'), userId, storeId, id, sku2, qty2, uc2, _r2(qty2 * uc2),
        st === 'received' ? qty2 : 0, nowIso());
    }

    // ---- m2_repricing_recommendations（3 行）----
    const rpInsert = db.prepare(`INSERT INTO m2_repricing_recommendations(
      id, user_id, store_id, sku, asin, our_price, competitor_asin, competitor_price,
      competitor_old_price, break_even_price, price_elasticity, scenarios,
      recommended_price, trigger_reason, status, applied_price, applied_at, detected_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const rpScenarios = (rec) => [
      { price: _r2(rec * 0.9), label: '激进 -10%', unitProfit: 4.2, margin: 0.2, expectedVolume30d: 380, expectedTotalProfit30d: _r2(4.2 * 380), recommended: false },
      { price: rec, label: '建议价', unitProfit: 5.5, margin: 0.25, expectedVolume30d: 340, expectedTotalProfit30d: _r2(5.5 * 340), recommended: true },
      { price: _r2(rec * 1.05), label: '提价 +5%', unitProfit: 6.8, margin: 0.28, expectedVolume30d: 280, expectedTotalProfit30d: _r2(6.8 * 280), recommended: false },
    ];
    rpInsert.run(newId('rp'), userId, storeId, 'CASE-001', 'B0CASE001', 22.99, 'B0COMP1', 21.50, 22.99, 16.8, 1.2, JSON.stringify(rpScenarios(21.99)), 21.99, 'competitor_down', 'pending', null, null, nowIso());
    rpInsert.run(newId('rp'), userId, storeId, 'CABLE-002', 'B0CABLE002', 12.99, 'B0COMP2', 11.99, 12.50, 9.2, 1.5, JSON.stringify(rpScenarios(11.99)), 11.99, 'competitor_down', 'applied', 11.99, nowIso(), nowIso());
    rpInsert.run(newId('rp'), userId, storeId, 'LAMP-003', 'B0LAMP003', 19.99, 'B0COMP3', 19.99, 18.99, 18.4, 0.9, JSON.stringify(rpScenarios(20.49)), 20.49, 'low_margin', 'rejected', null, null, nowIso());

    // ---- m2_fx_rates（30 天 USD/CNY）----
    const fxInsert = db.prepare(`INSERT INTO m2_fx_rates(
      id, user_id, store_id, base, quote, rate, rate_date, source, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    let r = 6.95;
    for (let d = 0; d < 30; d++) {
      r += (rng() - 0.5) * 0.05;
      r = Math.max(6.85, Math.min(7.05, r));
      const date = new Date(now - (29 - d) * 86400000).toISOString().slice(0, 10);
      fxInsert.run(newId('fx'), userId, storeId, 'USD', 'CNY', _r2(r), date, 'central_bank', nowIso());
    }

    // ---- m2_fx_exposures（4 币种）----
    const fxeInsert = db.prepare(`INSERT INTO m2_fx_exposures(
      id, user_id, store_id, currency, amount_source, cny_equivalent, share, computed_at, detail)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const fxes = [
      ['USD', 120000, 840000, 0.72],
      ['EUR', 30000, 240000, 0.20],
      ['GBP', 6000, 54000, 0.05],
      ['JPY', 500000, 33000, 0.03],
    ];
    for (const [cur, src, cny, share] of fxes) {
      fxeInsert.run(newId('fxe'), userId, storeId, cur, src, cny, share, nowIso(), JSON.stringify({ source: 'seed' }));
    }

    // ---- m2_payment_channels（4 行）----
    const pcInsert = db.prepare(`INSERT INTO m2_payment_channels(
      id, user_id, store_id, name, provider, is_primary, enabled,
      fee_pct, fee_fixed_per_tx, currency, monthly_volume, monthly_cost,
      warning, warning_message, account_info, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const pcDefs = [
      ['Payoneer', 'payoneer', 1, 1, 0.012, 0, 'USD', 120000, 1440, 0, null],
      ['PingPong', 'pingpong', 0, 1, 0.008, 0, 'USD', 80000, 640, 0, null],
      ['WorldFirst', 'worldfirst', 0, 1, 0.010, 0, 'USD', 30000, 300, 0, null],
      ['ACCS', 'accs', 0, 1, 0.015, 1, 'USD', 5000, 75, 1, '汇率不稳定，建议减少使用'],
    ];
    for (const def of pcDefs) {
      pcInsert.run(newId('pc'), userId, storeId, def[0], def[1], def[2], def[3], def[4], def[5], def[6], def[7], def[8], def[9], def[10], JSON.stringify({}), nowIso());
    }

    // ---- m2_tax_records（8 行）----
    const taxInsert = db.prepare(`INSERT INTO m2_tax_records(
      id, user_id, store_id, tax_type, region, period_start, period_end,
      sales, tax_rate, output_tax, input_tax, collected, due, threshold,
      nexus, deadline, days_left, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const periodStart = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
    const periodEnd = new Date(now).toISOString().slice(0, 10);
    const taxDefs = [
      ['vat', 'DE', 0.19, 25000, 4750, 1200, 0, 3550, 18],
      ['vat', 'UK', 0.20, 18000, 3600, 800, 0, 2800, 25],
      ['vat', 'FR', 0.20, 12000, 2400, 600, 0, 1800, 40],
      ['sales_tax', 'CA-US', 0.075, 35000, 0, 0, 2625, 0, 12],
      ['sales_tax', 'TX-US', 0.0625, 22000, 0, 0, 1375, 0, 20],
      ['sales_tax', 'NY-US', 0.08, 18000, 0, 0, 1440, 0, 30],
      ['sales_tax', 'WA-US', 0.065, 9000, 0, 0, 585, 0, 45],
      ['sales_tax', 'FL-US', 0.06, 11000, 0, 0, 660, 0, 50],
    ];
    for (const def of taxDefs) {
      const deadline = new Date(now + def[8] * 86400000).toISOString().slice(0, 10);
      taxInsert.run(newId('tax'), userId, storeId, def[0], def[1], periodStart, periodEnd,
        def[3], def[2], def[4], def[5], def[6], def[7], 35000, 1,
        deadline, def[8], 'pending', nowIso());
    }

    // ---- m2_ltv_snapshots（3 SKU）----
    const ltvInsert = db.prepare(`INSERT INTO m2_ltv_snapshots(
      id, user_id, store_id, sku, first_order_count, repeat_rate, avg_repeats,
      avg_order_value, ltv, cac_breakeven, ad_30d_acos, status, computed_at, detail)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const sku of SKUS) {
      const rate = 0.05 + rng() * 0.3;
      const aov = sku.price;
      const ltv = _r2(aov * (1 + rate * 1.5));
      const isHighLtv = rate > 0.2;
      // high_ltv 时 cac_breakeven > aov（可容忍高 CAC）；low_ltv 时 cac_breakeven < aov
      const cacBreakeven = isHighLtv ? _r2(aov * (1 + rate * 0.5)) : _r2(ltv * 0.55);
      ltvInsert.run(newId('ltv'), userId, storeId, sku.sku,
        Math.floor(50 + rng() * 200), _r2(rate), _r2(1 + rate * 1.5),
        _r2(aov), ltv, cacBreakeven, _r2(0.18 + rng() * 0.15),
        isHighLtv ? 'high_ltv' : 'low_ltv', nowIso(), JSON.stringify({ source: 'seed' }));
    }

    // ---- m2_alert_rules（4 行）----
    const arInsert = db.prepare(`INSERT INTO m2_alert_rules(
      id, user_id, store_id, name, conditions, severity, notify_channels,
      enabled, cooldown_hours, trigger_count, last_triggered, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const arIds = [];
    const arDefs = [
      ['低利润率', [{ field: 'sku.margin', op: '<', value: 0.15, duration_days: 3 }], 'P1'],
      ['库存断货预警', [{ field: 'sku.days_cover', op: '<', value: 7 }], 'P0'],
      ['ACOS 飙升', [{ field: 'campaign.acos', op: '>', value: 0.50 }], 'P1'],
      ['现金缺口', [{ field: 'cashflow.balance', op: '<', value: 100000 }], 'P0'],
    ];
    for (const [name, cond, sev] of arDefs) {
      const id = newId('ar');
      arIds.push(id);
      arInsert.run(id, userId, storeId, name, JSON.stringify(cond), sev,
        JSON.stringify(['in_app', 'email']), 1, 6,
        Math.floor(rng() * 3), null, nowIso());
    }

    // ---- m2_alert_events（6 行）----
    const aeInsert = db.prepare(`INSERT INTO m2_alert_events(
      id, user_id, store_id, rule_id, rule_name, severity, matched_value,
      message, acknowledged, pushed_to_m4, triggered_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const aeDefs = [
      [0, 'CASE-001 利润率 0.10', 'P1'],
      [0, 'LAMP-003 利润率 0.08', 'P1'],
      [1, 'CASE-001 daysCover=5', 'P0'],
      [2, 'campaign-001 ACOS 0.62', 'P1'],
      [2, 'campaign-003 ACOS 0.55', 'P1'],
      [3, 'balance=85000 < 100000', 'P0'],
    ];
    for (const [ri, msg, sev] of aeDefs) {
      aeInsert.run(newId('ae'), userId, storeId, arIds[ri], arDefs[ri][0], sev,
        JSON.stringify({ value: msg }), msg, 0, 0,
        new Date(now - rng() * 7 * 86400000).toISOString());
    }

    // ---- m2_dimensions（brand 4 + team 2 + owner 3 + project 2 = 11）----
    const dimInsert = db.prepare(`INSERT INTO m2_dimensions(
      id, user_id, store_id, dim_type, name, members, sku_ids, metrics, computed_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const dimDefs = [
      ['brand', '品牌 A', 1, ['CASE-001'], { skus: 1, gmv: 80000, profit: 12000, margin: 0.15 }],
      ['brand', '品牌 B', 1, ['CABLE-002'], { skus: 1, gmv: 40000, profit: 6000, margin: 0.15 }],
      ['brand', '品牌 C', 1, ['LAMP-003'], { skus: 1, gmv: 60000, profit: 8000, margin: 0.13 }],
      ['brand', '品牌 D', 0, [], { skus: 0, gmv: 0, profit: 0, margin: 0 }],
      ['team', '团队 A', 2, ['CASE-001', 'CABLE-002'], { skus: 2, gmv: 120000, profit: 18000, margin: 0.15 }],
      ['team', '团队 B', 1, ['LAMP-003'], { skus: 1, gmv: 60000, profit: 8000, margin: 0.13 }],
      ['owner', '张三', 1, ['CASE-001'], { skus: 1, gmv: 80000, profit: 12000, margin: 0.15 }],
      ['owner', '李四', 1, ['CABLE-002'], { skus: 1, gmv: 40000, profit: 6000, margin: 0.15 }],
      ['owner', '王五', 1, ['LAMP-003'], { skus: 1, gmv: 60000, profit: 8000, margin: 0.13 }],
      ['project', '热销项目', 2, ['CASE-001', 'CABLE-002'], { skus: 2, gmv: 120000, profit: 18000, margin: 0.15 }],
      ['project', '滞销项目', 1, ['LAMP-003'], { skus: 1, gmv: 60000, profit: 8000, margin: 0.13 }],
    ];
    for (const [dt, name, members, skuIds, metrics] of dimDefs) {
      dimInsert.run(newId('dim'), userId, storeId, dt, name, members,
        JSON.stringify(skuIds), JSON.stringify(metrics), nowIso());
    }

    // ---- m2_inventory_link_config（1 行）----
    db.prepare(`INSERT INTO m2_inventory_link_config(
      id, user_id, store_id, enabled, stop_at, reduce_50_at, reduce_20_at, alert_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      newId('ilc'), userId, storeId, 1, 3, 7, 14, 21, nowIso());

    // ---- m2_inventory_link_events（2 行）----
    const ileInsert = db.prepare(`INSERT INTO m2_inventory_link_events(
      id, user_id, store_id, sku, asin, days_left, action, impact_campaigns,
      status, executed_at, detected_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    ileInsert.run(newId('ile'), userId, storeId, 'LAMP-003', 'B0LAMP003', 2,
      'stop_all', JSON.stringify([]), 'pending', null, nowIso());
    ileInsert.run(newId('ile'), userId, storeId, 'CASE-001', 'B0CASE001', 18,
      'alert_only', JSON.stringify([]), 'monitoring', nowIso(), nowIso());
  });
  tx();
}
