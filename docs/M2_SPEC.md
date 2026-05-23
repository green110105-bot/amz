# M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块产品规格

**版本**：v1.0 · **日期**：2026-05-15 · **范围**：将老 M2 19 页 mock 重做为 SQLite 持久化 + 真 API + 跨刷新一致；统一进入 `m2_*` 表族，复用 M1/M3 已建立的 `(user_id, store_id)` 双分区、JSON-as-TEXT、Mulberry32 PRNG seed、`appendAuditLog(sourceModule='M2')` 模式

---

## 1. 现状诊断

### 1.1 老 M2 19 个页面逐项盘点

| # | 文件 | 当前职责 | mock 来源 | 现状问题 | 处置 |
|---|------|---------|----------|---------|------|
| 1 | `ProfitOverview.vue` | 4 KPI + 订单利润明细表 | `profitApi.overview()` 已半接，后端只回 mock blob | overview/orders/recompute 缺数据持久化、缺 14 项成本拆解 | **改造**：换 `/m2/profit/overview` 真 API，订单字段来自 m2_orders + m2_order_costs |
| 2 | `ProfitSkus.vue` | SKU 利润列表 + 瀑布图抽屉 | `mockSkus` (utils/mock-data) | 全 mock，cogs/fees/ad/refund/storage 全在前端硬编码计算 | **改造**：换 `/m2/profit/skus` + `/m2/profit/skus/:id/waterfall` 真 API |
| 3 | `ProfitCashflow.vue` | 90 天现金流 SVG + 关键事件 + AI 提醒 | `mockCashflow` | 静态数组、AI 提醒文案硬编码 | **改造**：换 `/m2/cashflow/timeline` + `/m2/cashflow/alerts` 真 API |
| 4 | `ProfitLeaks.vue` | 利润漏点 DecisionCard 列表 | `mockLeaks` | 列表 mock；DecisionCard 已经走 `useAudit('M2')` 入审计但漏点本身不入库 | **改造**：换 `/m2/leaks` 真 API + 修复跟踪表 |
| 5 | `OrderProfit.vue` | 单订单 14 项瀑布 | `mockOrderProfit` (extras) | 单条 mock，无法路由参数化 | **改造**：换 `/m2/orders/:orderId/profit` 真 API |
| 6 | `ScenarioSimulator.vue` | 多变量滑块即时利润预测 | `mockSkus` + 前端计算 | 公式硬编码、不入库、不留快照 | **改造**：换 `/m2/scenarios/preview`（无状态计算）+ `/m2/scenarios` 保存快照 |
| 7 | `InventoryReorder.vue` | 补货建议列表 + 生成 PO 草稿 | `inventoryApi.decisions()` 半接 | 后端返 mock；生成 PO 草稿只入审计、未真造 PO | **改造**：换 `/m2/inventory/reorder` 真 API + `/m2/purchase-orders` 自动建草稿 |
| 8 | `SlowMovingDecision.vue` | 4 选项滞销决策 | `mockSlowMovingOptions` (extras) | 单 SKU 硬编码、4 选项计算硬编码 | **改造**：换 `/m2/inventory/slow-moving` 列表 + `/m2/inventory/slow-moving/:id/options` 真 API |
| 9 | `InventoryTransfers.vue` | 跨仓调拨建议 | `mockTransfers` (extras) | 全 mock；执行只入审计、未真生成调拨单 | **改造**：换 `/m2/inventory/transfers` 真 API + 状态字段 |
| 10 | `PurchaseOrders.vue` | PO 全生命周期 | `mockPurchaseOrders` | mock 数组直接 mutate；状态流转无库；PI/CI/BL 下载假按钮 | **改造**：换 `/m2/purchase-orders` 真 API + 流转 endpoint |
| 11 | `Suppliers.vue` | 供应商画像卡片 | `mockSuppliers` | mock；无 CRUD；评分静态 | **改造**：换 `/m2/suppliers` 真 API |
| 12 | `RepricingDecision.vue` | 价格-利润曲线 + 情景对比 + 采用 | `mockRepricing` (extras) | 单 SKU mock；采用仅入审计、不写回 listing 价格 | **改造**：换 `/m2/repricing/recommendations` + `/m2/repricing/:id/apply` 真 API（联动 M1 listings） |
| 13 | `FxRisk.vue` | 多币种敞口 + 30 天 USD/CNY 走势 + AI 建议 | `mockFx` (extras) | 敞口、走势、AI 建议都 mock | **改造**：换 `/m2/fx/exposures` + `/m2/fx/rates` + `/m2/fx/sensitivity` 真 API |
| 14 | `PaymentChannels.vue` | Payoneer/PingPong 配置 | `mockPaymentChannels` (extras) | mock；编辑按钮无效 | **改造**：换 `/m2/payment-channels` 真 API + CRUD |
| 15 | `TaxAssist.vue` | VAT/销售税/Nexus | `mockTax` (extras) | mock；导出仅本地 CSV | **改造**：换 `/m2/tax/vat` + `/m2/tax/sales-tax` + `/m2/tax/deadlines` 真 API |
| 16 | `LTV.vue` | SKU LTV 估算 | `mockLTV` (extras) | 列表 mock | **改造**：换 `/m2/ltv/skus` 真 API |
| 17 | `CustomAlerts.vue` | 自定义报警规则 CRUD | `mockCustomAlerts` + `useLocalStore` | 半 localStorage 半 mock；触发引擎不存在 | **改造**：换 `/m2/alerts/rules` 真 API + `/m2/alerts/events` 触发流水 |
| 18 | `Dimensions.vue` | 按品牌/团队/运营归集利润 | `mockDimensions` (extras) | mock；维度无配置 | **改造**：换 `/m2/dimensions/aggregate?by=brand|team|owner` 真 API |
| 19 | `InventoryLink.vue` | 库存联动断货保护 | `mockInventoryLink` (mock-data-ads) + localStore | 阈值半 localStorage；受影响 SKU mock；联动 M3 暂停广告未真触发 | **改造**：换 `/m2/inventory-link/config` + `/m2/inventory-link/affected` 真 API + 真触发 M3 暂停广告 |

### 1.2 后端 gap
- `apps/api/src/data-store.mjs` 中 `/api/v1/profit/overview` 与 `/api/v1/inventory/decisions` 返回的是脚本拼装的 mock blob，未持久化
- 没有 `m2_*` 前缀模块；M1 的 `data-store-listings.mjs` 与 M3 的 `data-store-ads.mjs` 风格未应用到 M2
- 缺成本归集、订单、PO 流转、供应商、调拨、滞销决策、汇率、税务、LTV、报警、维度归集的全部表
- 跨模块联动 (M2→M1 改价 / M2→M3 暂停广告 / M2→M4 异常推送) 缺管道

### 1.3 后端待新增表（19 张，全 P0/P1）
`m2_orders / m2_order_costs / m2_sku_profit_snapshots / m2_cashflow_events / m2_leaks / m2_scenarios / m2_inventory_snapshots / m2_reorder_recommendations / m2_slow_moving_decisions / m2_inventory_transfers / m2_purchase_orders / m2_purchase_order_items / m2_suppliers / m2_repricing_recommendations / m2_fx_rates / m2_fx_exposures / m2_payment_channels / m2_tax_records / m2_ltv_snapshots / m2_alert_rules / m2_alert_events / m2_dimensions / m2_inventory_link_config / m2_inventory_link_events`

（合计 24 张，含 2 张组合明细 + 2 张联动配置/事件）

---

## 2. 后端 24 张新表 DDL

**约定**：所有表 `(user_id, store_id)` 双分区；主键统一 `id TEXT PRIMARY KEY`；JSON 字段存为 TEXT；时间统一 ISO-8601；金额 REAL（USD/CNY 同表共存按 currency 字段区分）。写到新文件 `apps/api/src/data-store-profit.mjs` 的 `initProfitSchema(db)`，由 `data-store.mjs::initSchema()` 末尾调用，并把表名注册到 `PROFIT_TABLES_TO_CLEAN` 以便 `removeUserStore()` 联动清理。

### 2.1 m2_orders
```sql
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
  accuracy_level TEXT,                      -- 'final'|'high_estimate'|'estimate'|'unavailable'
  confidence REAL,
  ordered_at TEXT,
  shipped_at TEXT,
  settled_at TEXT,
  raw TEXT,                                 -- JSON 完整原始数据
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m2_orders_us ON m2_orders(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_orders_sku ON m2_orders(user_id, store_id, sku);
CREATE INDEX IF NOT EXISTS idx_m2_orders_date ON m2_orders(user_id, store_id, ordered_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_orders_oid ON m2_orders(user_id, store_id, order_id);
```

### 2.2 m2_order_costs
```sql
CREATE TABLE IF NOT EXISTS m2_order_costs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  cost_type TEXT NOT NULL,                  -- 14 项之一：'referral_fee'|'fba_fee'|'refund_provision'|'storage'|'ad_alloc'|'cogs'|'freight'|'fx_loss'|'capital_cost'|'long_term_storage'|'return_processing'|'inbound_placement'|'subscription'|'misc'
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  accuracy_level TEXT,
  source TEXT,                              -- 'amazon_settled'|'amazon_estimated'|'manual'|'calculated'
  detail TEXT,                              -- JSON
  created_at TEXT NOT NULL,
  CHECK (cost_type IN ('referral_fee','fba_fee','refund_provision','storage','ad_alloc','cogs','freight','fx_loss','capital_cost','long_term_storage','return_processing','inbound_placement','subscription','misc'))
);
CREATE INDEX IF NOT EXISTS idx_m2_costs_us ON m2_order_costs(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_costs_oid ON m2_order_costs(user_id, store_id, order_id);
```

### 2.3 m2_sku_profit_snapshots
```sql
CREATE TABLE IF NOT EXISTS m2_sku_profit_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  asin TEXT,
  product_id TEXT,
  range_days INTEGER NOT NULL,              -- 7/30/90
  revenue REAL,
  cogs REAL, fees REAL, ad_cost REAL, refund REAL, storage REAL,
  total_cost REAL, net_profit REAL, margin REAL,
  units_sold INTEGER,
  lifecycle TEXT,                           -- 'launch'|'growth'|'mature'|'decline'
  days_cover INTEGER,
  computed_at TEXT NOT NULL,
  detail TEXT,                              -- JSON：14 项费用细分
  CHECK (range_days IN (7,30,90))
);
CREATE INDEX IF NOT EXISTS idx_m2_skupf_us ON m2_sku_profit_snapshots(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_skupf_sku ON m2_sku_profit_snapshots(user_id, store_id, sku, range_days);
```

### 2.4 m2_cashflow_events
```sql
CREATE TABLE IF NOT EXISTS m2_cashflow_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  event_date TEXT NOT NULL,                 -- YYYY-MM-DD
  label TEXT,
  inflow REAL DEFAULT 0,
  outflow REAL DEFAULT 0,
  balance REAL,
  source TEXT,                              -- 'amazon_settle'|'pingpong_withdraw'|'po_deposit'|'po_balance'|'manual'|'forecast'
  ref_id TEXT,                              -- 关联 PO/订单/withdraw id
  currency TEXT DEFAULT 'CNY',
  is_forecast INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m2_cf_us ON m2_cashflow_events(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_cf_date ON m2_cashflow_events(user_id, store_id, event_date);
```

### 2.5 m2_leaks
```sql
CREATE TABLE IF NOT EXISTS m2_leaks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,                   -- 'P0'|'P1'|'P2'
  type TEXT NOT NULL,                       -- 'AD_OVERSPEND'|'STORAGE_FEE'|'REFUND_HIGH'|'FX_LOSS'|'NEGATIVE_MARGIN'|'INVENTORY_AGING'|'PRICE_GAP' 等
  sku TEXT,
  asin TEXT,
  recommendation TEXT,
  evidence TEXT,                            -- JSON
  monthly_impact REAL,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'fixing'|'fixed'|'ignored'
  fixed_actual_saving REAL,
  audit_id TEXT,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (severity IN ('P0','P1','P2')),
  CHECK (status IN ('pending','fixing','fixed','ignored'))
);
CREATE INDEX IF NOT EXISTS idx_m2_leaks_us ON m2_leaks(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_leaks_st ON m2_leaks(user_id, store_id, status, severity);
```

### 2.6 m2_scenarios
```sql
CREATE TABLE IF NOT EXISTS m2_scenarios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  name TEXT,
  sku TEXT,
  baseline TEXT NOT NULL,                   -- JSON baseline snapshot
  variables TEXT NOT NULL,                  -- JSON {priceDelta, acosDelta, volumeDelta, returnDelta}
  result TEXT,                              -- JSON 计算结果
  preset TEXT,                              -- 'reset'|'conservative'|'aggressive'|'custom'
  created_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_m2_sc_us ON m2_scenarios(user_id, store_id);
```

### 2.7 m2_inventory_snapshots
```sql
CREATE TABLE IF NOT EXISTS m2_inventory_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  asin TEXT,
  product_id TEXT,
  warehouse TEXT NOT NULL,                  -- 'FBA-US'|'FBA-DE'|'FBA-JP'|'OVERSEAS'|'IN_TRANSIT'
  on_hand INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  inbound INTEGER DEFAULT 0,
  available INTEGER DEFAULT 0,
  unit_cost REAL,
  daily_velocity REAL,
  days_cover INTEGER,
  in_stock_days INTEGER,                    -- 入仓 X 天（滞销判定）
  lts_countdown_days INTEGER,               -- 长期仓储费倒计时
  snapshot_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m2_inv_us ON m2_inventory_snapshots(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_inv_sku ON m2_inventory_snapshots(user_id, store_id, sku);
```

### 2.8 m2_reorder_recommendations
```sql
CREATE TABLE IF NOT EXISTS m2_reorder_recommendations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_id TEXT,
  urgency TEXT NOT NULL,                    -- 'critical'|'high'|'medium'|'low'
  recommended_qty INTEGER NOT NULL,
  capital_required REAL,
  days_remaining INTEGER,
  forecast_daily REAL,
  lead_days INTEGER,
  safety_days INTEGER,
  supplier_id TEXT,
  po_draft_id TEXT,                         -- 关联 m2_purchase_orders (status=draft)
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'drafted'|'ordered'|'dismissed'
  computed_at TEXT NOT NULL,
  CHECK (urgency IN ('critical','high','medium','low'))
);
CREATE INDEX IF NOT EXISTS idx_m2_re_us ON m2_reorder_recommendations(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_re_st ON m2_reorder_recommendations(user_id, store_id, status, urgency);
```

### 2.9 m2_slow_moving_decisions
```sql
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
  options TEXT NOT NULL,                    -- JSON 4 选项 A/B/C/D
  recommended_option TEXT,                  -- 'A'|'B'|'C'|'D'
  selected_option TEXT,
  executed_at TEXT,
  audit_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'executed'|'cancelled'
  detected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m2_slow_us ON m2_slow_moving_decisions(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_slow_st ON m2_slow_moving_decisions(user_id, store_id, status);
```

### 2.10 m2_inventory_transfers
```sql
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
  status TEXT NOT NULL DEFAULT 'recommended',  -- 'recommended'|'approved'|'in_transit'|'received'|'cancelled'
  approved_at TEXT,
  received_at TEXT,
  audit_id TEXT,
  detected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m2_xfer_us ON m2_inventory_transfers(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_xfer_st ON m2_inventory_transfers(user_id, store_id, status);
```

### 2.11 m2_purchase_orders
```sql
CREATE TABLE IF NOT EXISTS m2_purchase_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  po_number TEXT NOT NULL,                  -- 业务编号 PO-018 等
  supplier_id TEXT,
  supplier_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',     -- 'draft'|'ordered'|'in_transit'|'received'|'cancelled'|'disputed'
  total_landed REAL,
  currency TEXT DEFAULT 'USD',
  shipping_method TEXT,                     -- 'ocean_freight'|'air_freight'|'express'
  tracking TEXT,
  deposit REAL,
  deposit_paid INTEGER DEFAULT 0,
  balance REAL,
  balance_paid INTEGER DEFAULT 0,
  ordered_at TEXT,
  shipped_at TEXT,
  expected_at TEXT,
  received_at TEXT,
  documents TEXT,                           -- JSON {pi,ci,bl,packingList}
  notes TEXT,
  audit_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  CHECK (status IN ('draft','ordered','in_transit','received','cancelled','disputed'))
);
CREATE INDEX IF NOT EXISTS idx_m2_po_us ON m2_purchase_orders(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_po_st ON m2_purchase_orders(user_id, store_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_po_num ON m2_purchase_orders(user_id, store_id, po_number);
```

### 2.12 m2_purchase_order_items
```sql
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
```

### 2.13 m2_suppliers
```sql
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
  status TEXT NOT NULL DEFAULT 'active',   -- 'active'|'inactive'
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
  updated_at TEXT,
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_m2_sup_us ON m2_suppliers(user_id, store_id);
```

### 2.14 m2_repricing_recommendations
```sql
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
  scenarios TEXT NOT NULL,                  -- JSON [{price,label,unitProfit,margin,expectedVolume30d,expectedTotalProfit30d,recommended}]
  recommended_price REAL,
  trigger_reason TEXT,                      -- 'competitor_down'|'competitor_up'|'low_margin'|'manual'
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'approved'|'rejected'|'applied'
  applied_price REAL,
  applied_at TEXT,
  audit_id TEXT,
  m1_listing_version_id TEXT,               -- 联动 M1：写新 listing 版本
  detected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m2_rp_us ON m2_repricing_recommendations(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_rp_st ON m2_repricing_recommendations(user_id, store_id, status);
```

### 2.15 m2_fx_rates
```sql
CREATE TABLE IF NOT EXISTS m2_fx_rates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  base TEXT NOT NULL,                       -- 'USD'
  quote TEXT NOT NULL,                      -- 'CNY'|'EUR'|'GBP'|'JPY'
  rate REAL NOT NULL,
  rate_date TEXT NOT NULL,                  -- YYYY-MM-DD
  source TEXT,                              -- 'amazon'|'pingpong'|'central_bank'
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_fx ON m2_fx_rates(user_id, store_id, base, quote, rate_date);
CREATE INDEX IF NOT EXISTS idx_m2_fx_us ON m2_fx_rates(user_id, store_id);
```

### 2.16 m2_fx_exposures
```sql
CREATE TABLE IF NOT EXISTS m2_fx_exposures (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_source REAL,
  cny_equivalent REAL,
  share REAL,
  computed_at TEXT NOT NULL,
  detail TEXT                               -- JSON：来源拆解（应收/在途/未提现）
);
CREATE INDEX IF NOT EXISTS idx_m2_fxe_us ON m2_fx_exposures(user_id, store_id);
```

### 2.17 m2_payment_channels
```sql
CREATE TABLE IF NOT EXISTS m2_payment_channels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT,                            -- 'payoneer'|'pingpong'|'worldfirst'|'accs'|'lianlian'
  is_primary INTEGER DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  fee_pct REAL,
  fee_fixed_per_tx REAL,
  currency TEXT,
  monthly_volume REAL,
  monthly_cost REAL,
  warning INTEGER DEFAULT 0,
  warning_message TEXT,
  account_info TEXT,                        -- JSON 加密信息（demo 不真加密）
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_m2_pc_us ON m2_payment_channels(user_id, store_id);
```

### 2.18 m2_tax_records
```sql
CREATE TABLE IF NOT EXISTS m2_tax_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  tax_type TEXT NOT NULL,                   -- 'vat'|'sales_tax'|'income_tax'
  region TEXT NOT NULL,                     -- 'DE'|'UK'|'FR'|'CA-US'|'TX-US' 等
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
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'filed'|'paid'|'overdue'
  filing_ref TEXT,
  created_at TEXT NOT NULL,
  CHECK (tax_type IN ('vat','sales_tax','income_tax')),
  CHECK (status IN ('pending','filed','paid','overdue'))
);
CREATE INDEX IF NOT EXISTS idx_m2_tax_us ON m2_tax_records(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_tax_type ON m2_tax_records(user_id, store_id, tax_type, region);
```

### 2.19 m2_ltv_snapshots
```sql
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
  status TEXT,                              -- 'high_ltv'|'low_ltv'
  computed_at TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_m2_ltv_us ON m2_ltv_snapshots(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_ltv_sku ON m2_ltv_snapshots(user_id, store_id, sku);
```

### 2.20 m2_alert_rules
```sql
CREATE TABLE IF NOT EXISTS m2_alert_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  conditions TEXT NOT NULL,                 -- JSON [{field,op,value,duration_days}]
  severity TEXT NOT NULL,                   -- 'P0'|'P1'|'P2'
  notify_channels TEXT NOT NULL,            -- JSON ['in_app','email','wechat','wecom']
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_hours INTEGER DEFAULT 6,
  trigger_count INTEGER DEFAULT 0,
  last_triggered TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  CHECK (severity IN ('P0','P1','P2'))
);
CREATE INDEX IF NOT EXISTS idx_m2_ar_us ON m2_alert_rules(user_id, store_id);
```

### 2.21 m2_alert_events
```sql
CREATE TABLE IF NOT EXISTS m2_alert_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_name TEXT,
  severity TEXT,
  matched_value TEXT,                       -- JSON
  message TEXT,
  acknowledged INTEGER DEFAULT 0,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  pushed_to_m4 INTEGER DEFAULT 0,
  triggered_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m2_ae_us ON m2_alert_events(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_ae_rule ON m2_alert_events(user_id, store_id, rule_id, triggered_at DESC);
```

### 2.22 m2_dimensions
```sql
CREATE TABLE IF NOT EXISTS m2_dimensions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  dim_type TEXT NOT NULL,                   -- 'brand'|'team'|'owner'|'project'
  name TEXT NOT NULL,
  members INTEGER,
  sku_ids TEXT,                             -- JSON array
  metrics TEXT,                             -- JSON {skus,gmv,profit,margin}
  computed_at TEXT NOT NULL,
  CHECK (dim_type IN ('brand','team','owner','project'))
);
CREATE INDEX IF NOT EXISTS idx_m2_dim_us ON m2_dimensions(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_dim_type ON m2_dimensions(user_id, store_id, dim_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_dim ON m2_dimensions(user_id, store_id, dim_type, name);
```

### 2.23 m2_inventory_link_config
```sql
CREATE TABLE IF NOT EXISTS m2_inventory_link_config (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  stop_at INTEGER NOT NULL DEFAULT 3,       -- 必停阈值（天）
  reduce_50_at INTEGER NOT NULL DEFAULT 7,  -- -50% 阈值
  reduce_20_at INTEGER NOT NULL DEFAULT 14, -- -20% 阈值
  alert_at INTEGER NOT NULL DEFAULT 21,     -- 仅预警阈值
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_m2_ilc ON m2_inventory_link_config(user_id, store_id);
```

### 2.24 m2_inventory_link_events
```sql
CREATE TABLE IF NOT EXISTS m2_inventory_link_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  asin TEXT,
  days_left INTEGER,
  action TEXT NOT NULL,                     -- 'stop_all'|'bid_reduce_50'|'bid_reduce_20'|'alert_only'
  impact_campaigns TEXT,                    -- JSON array of campaign_id
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending'|'auto_executed'|'monitoring'|'cancelled'
  executed_at TEXT,
  reverted_at TEXT,
  audit_id TEXT,
  detected_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_m2_ile_us ON m2_inventory_link_events(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_m2_ile_st ON m2_inventory_link_events(user_id, store_id, status);
```

### 2.25 表清单与清理常量
```js
export const PROFIT_TABLES_TO_CLEAN = [
  'm2_orders','m2_order_costs','m2_sku_profit_snapshots','m2_cashflow_events',
  'm2_leaks','m2_scenarios','m2_inventory_snapshots','m2_reorder_recommendations',
  'm2_slow_moving_decisions','m2_inventory_transfers','m2_purchase_orders','m2_purchase_order_items',
  'm2_suppliers','m2_repricing_recommendations','m2_fx_rates','m2_fx_exposures',
  'm2_payment_channels','m2_tax_records','m2_ltv_snapshots','m2_alert_rules','m2_alert_events',
  'm2_dimensions','m2_inventory_link_config','m2_inventory_link_events'
];
```

---

## 3. 后端 API 契约（48 endpoints）

**约定**：路径前缀 `/api/v1/store/m2/*`；需要 Bearer + X-Store-Id；写操作走 `appendAuditLog(sourceModule='M2')`；UNIQUE / PRIMARY KEY 冲突返 409；validation 返 400；找不到返 404。文件 `apps/api/src/store-routes-profit.mjs` 统一 dispatch（仿 `store-routes-ads.mjs::_handleAdsRequestImpl`），并由 `server.mjs` 注册。

### 3.1 利润 / 订单（7）

#### 1. `GET /api/v1/store/m2/profit/overview?range=7d|30d|90d`
请求：query
响应：
```json
{
  "overview": {
    "revenue": 184523.40, "orders": 412, "totalCosts": 138129.10,
    "netProfit": 46394.30, "profitMargin": 0.2514, "confidence": 0.82
  },
  "topSkus": [{"sku":"CASE-001","revenue":42150,"netProfit":8721,"margin":0.207}],
  "trend": [{"date":"2026-04-16","netProfit":1450},...]
}
```
副作用：无

#### 2. `POST /api/v1/store/m2/profit/recompute`
请求：`{"range":"30d","force":true}`
响应：`{"queued":true,"jobId":"recompute-...","etaSeconds":3}` + 同步返回新 overview
副作用：刷新 `m2_sku_profit_snapshots`；audit `PROFIT_RECOMPUTE`

#### 3. `GET /api/v1/store/m2/profit/skus?search=&lifecycle=&range=30d`
响应：`{"skus":[{"sku":"CASE-001","asin":"B0...","title":"...","price":42.99,"cogs":...,"fees":...,"netProfit":...,"margin":0.21,"lifecycle":"mature","daysCover":35,...}]}`

#### 4. `GET /api/v1/store/m2/profit/skus/:sku/waterfall?range=30d`
响应：`{"items":[{"label":"收入","value":12900,"type":"positive"},{"label":"COGS","value":-5800,"type":"negative"},...,{"label":"净利润","value":2710,"type":"total"}],"accuracy":"final","confidence":0.88}`

#### 5. `GET /api/v1/store/m2/orders?from=&to=&sku=&minMargin=&maxMargin=&accuracy=&limit=50&cursor=`
响应：`{"orders":[...],"nextCursor":"..."}` 元素含 `{orderId,asin,sku,revenue,totalCosts,netProfit,profitMargin,accuracy:{level,confidence}}`

#### 6. `GET /api/v1/store/m2/orders/:orderId/profit`
响应：单订单 14 项瀑布 + 时间线 + accuracy + 关联 audit
```json
{
  "order": {"orderId":"112-...","asin":"B0...","sku":"CASE-001","quantity":1,"unitPrice":42.99,"revenue":42.99,"netProfit":7.13,"margin":0.166,"confidence":0.85,"accuracy":"high_estimate","orderedAt":"...","shippedAt":"...","settledAt":null},
  "fees": {"referralFee":6.45,"fbaFee":3.85,"refundProvision":1.72,"storage":0.65,"adAlloc":3.20,"cogs":15.40,"freight":2.10,"fxLoss":0.85,"capitalCost":0.32,"longTermStorage":0,"returnProcessing":0,"inboundPlacement":0.50,"subscription":0.10,"misc":0.22},
  "timeline": [{"label":"下单","at":"..."},{"label":"发货","at":"..."},{"label":"待结算","at":null}]
}
```

#### 7. `GET /api/v1/store/m2/profit/leaks?severity=P0|P1|P2|all&status=`
响应：`{"leaks":[{"id":"leak-...","title":"...","severity":"P0","sku":"LAMP-003","monthlyImpact":18000,"recommendation":"...","evidence":{...},"status":"pending","confidence":0.78}],"counts":{"total":12,"p0":3,"p1":6,"fixing":2}}`

### 3.2 现金流（3）

#### 8. `GET /api/v1/store/m2/cashflow/timeline?days=30|60|90`
响应：`{"points":[{"date":"2026-05-15","inflow":0,"outflow":0,"balance":350000,"label":null},...,{"date":"2026-05-29","inflow":48000,"outflow":0,"balance":398000,"label":"Amazon 双周结算"}],"summary":{"today":350000,"future30":398000,"future90":420000,"minBalance":312000,"minBalanceDate":"2026-06-12"}}`

#### 9. `GET /api/v1/store/m2/cashflow/alerts`
响应：`{"alerts":[{"type":"capital_locked","level":"warn","title":"资金占用偏高","detail":"...","relatedSku":"LAMP-003","impact":18000},...]}`

#### 10. `POST /api/v1/store/m2/cashflow/events`
请求：`{"event_date":"2026-06-01","label":"PO-020 定金","inflow":0,"outflow":15000,"source":"manual"}`
响应：`{"id":"cfe-...",...}`
副作用：插入 + 重算 balance；audit `CASHFLOW_EVENT_CREATE`

### 3.3 漏点（3）

#### 11. `POST /api/v1/store/m2/leaks/:id/start-fix`
副作用：status `pending` → `fixing`；audit `LEAK_START_FIX`

#### 12. `POST /api/v1/store/m2/leaks/:id/mark-fixed`
请求：`{"actualSaving":15800}`；副作用：status → `fixed`；audit `LEAK_MARK_FIXED`

#### 13. `POST /api/v1/store/m2/leaks/:id/ignore`
请求：`{"reason":"..."}`；副作用：status → `ignored`；audit `LEAK_IGNORE`

### 3.4 情景模拟（3）

#### 14. `POST /api/v1/store/m2/scenarios/preview`
请求：`{"sku":"CASE-001","baseline":{"price":42.99,"acos":0.22,"monthlyVolume":320,"returnRate":0.05},"variables":{"priceDelta":-10,"acosDelta":5,"volumeDelta":30,"returnDelta":1}}`
响应：`{"simulated":{"price":38.69,"acos":0.27,"volume":416,"unitProfit":...,"monthlyProfit":...,"monthlyRevenue":...,"margin":0.13},"delta":1240.50}`
副作用：无（无状态）

#### 15. `POST /api/v1/store/m2/scenarios` 保存
请求：`{"name":"激进 30 天","sku":"CASE-001","baseline":...,"variables":...,"result":...,"preset":"aggressive"}`
响应：`{"id":"sc-...","createdAt":"..."}`；audit `SCENARIO_SAVE`

#### 16. `GET /api/v1/store/m2/scenarios?sku=`
响应：`{"scenarios":[...]}`

### 3.5 库存 / 补货（5）

#### 17. `GET /api/v1/store/m2/inventory/reorder?urgency=&status=`
响应：`{"decisions":[{"productId":"...","sku":"...","reorder":{"urgency":"high","recommendedQty":500,"capitalRequired":15400,"daysRemaining":12,"leadDays":35,"safetyDays":7,"forecastDaily":12.5,"supplierId":"sup-..."}}]}`

#### 18. `POST /api/v1/store/m2/inventory/reorder/:id/create-po`
请求：`{"supplierId":"sup-...","shippingMethod":"ocean_freight","notes":""}`
响应：`{"poId":"po-...","poNumber":"PO-021","status":"draft"}`
副作用：新建 `m2_purchase_orders` (status=draft) + `m2_purchase_order_items`；`m2_reorder_recommendations.status` → `drafted`；audit `CREATE_PURCHASE_ORDER_DRAFT`

#### 19. `POST /api/v1/store/m2/inventory/reorder/:id/dismiss`
请求：`{"reason":"..."}`；audit `REORDER_DISMISS`

#### 20. `GET /api/v1/store/m2/inventory/slow-moving?status=`
响应：`{"items":[{"id":"slow-...","sku":"LAMP-003","inventory":1200,"inventoryValue":48000,"monthlyStorageCost":4500,"inStockDays":210,"ltsCountdownDays":30,"options":[{"id":"A","label":"降价清仓 30%","daysToClose":45,"totalLoss":-3200,"cashRecovery":33600,"recommended":true,"reason":"..."},{"id":"B","label":"开 Promotion 限时 20% off",...},{"id":"C","label":"FBA Removal 退回海外仓",...},{"id":"D","label":"销毁处理",...}],"recommendedOption":"A"}]}`

#### 21. `POST /api/v1/store/m2/inventory/slow-moving/:id/execute`
请求：`{"option":"A"}`
响应：`{"id":"slow-...","status":"executed","executedAt":"...","auditId":"audit-..."}`
副作用：根据 option 映射 actionType（A→REPRICE_DOWN, B→START_PROMOTION, C→CREATE_REMOVAL_ORDER, D→CREATE_DISPOSAL_ORDER）；若 option=A 联动 M1 写 `m1_listing_versions` (source='m2_reprice')；audit `SLOW_MOVING_EXECUTE`

### 3.6 调拨（3）

#### 22. `GET /api/v1/store/m2/inventory/transfers?status=`
响应：`{"transfers":[...]}`

#### 23. `POST /api/v1/store/m2/inventory/transfers/:id/approve`
副作用：status `recommended` → `approved`；audit `INVENTORY_TRANSFER_APPROVE`

#### 24. `POST /api/v1/store/m2/inventory/transfers/:id/cancel`
副作用：status → `cancelled`；audit `INVENTORY_TRANSFER_CANCEL`

### 3.7 采购单（6）

#### 25. `GET /api/v1/store/m2/purchase-orders?status=&supplierId=`
响应：列表

#### 26. `GET /api/v1/store/m2/purchase-orders/:id`
响应：单 PO + items + 时间线

#### 27. `POST /api/v1/store/m2/purchase-orders`
请求：`{"supplierId":"sup-...","items":[{"sku":"...","qty":500,"unitCost":12.0}],"shippingMethod":"ocean_freight","notes":""}`
响应：`{"id":"po-...","poNumber":"PO-022","status":"draft","totalLanded":...}`；audit `PO_CREATE`

#### 28. `PUT /api/v1/store/m2/purchase-orders/:id`
请求：partial patch
响应：更新后 PO；audit `PO_UPDATE`

#### 29. `POST /api/v1/store/m2/purchase-orders/:id/transition`
请求：`{"to":"ordered|in_transit|received|cancelled|disputed","tracking":"...","receivedAt":"..."}`
状态机：draft→ordered→in_transit→received；任意态→cancelled/disputed；其他跳转返 400 `invalid_transition`
副作用：状态推进 + 写 `m2_cashflow_events` (定金/尾款出账)；status=received 时把 items.qty 归入 `m2_inventory_snapshots`；audit `PO_STATE_TRANSITION`

#### 30. `POST /api/v1/store/m2/purchase-orders/:id/payment`
请求：`{"phase":"deposit|balance","paid":true,"amount":15400,"paidAt":"..."}`
响应：更新支付状态；写 cashflow event；audit `PO_PAYMENT`

### 3.8 供应商（5）

#### 31. `GET /api/v1/store/m2/suppliers?status=`
#### 32. `GET /api/v1/store/m2/suppliers/:id`
#### 33. `POST /api/v1/store/m2/suppliers` body `{name,contact,...}` audit `SUPPLIER_CREATE`
#### 34. `PUT /api/v1/store/m2/suppliers/:id` audit `SUPPLIER_UPDATE`
#### 35. `DELETE /api/v1/store/m2/suppliers/:id` 软删 status→inactive; audit `SUPPLIER_DELETE`

### 3.9 重定价（3）

#### 36. `GET /api/v1/store/m2/repricing?status=`
响应：`{"items":[...]}`

#### 37. `POST /api/v1/store/m2/repricing/trigger`
请求：`{"sku":"CASE-001","manual":true}`
响应：新建 `m2_repricing_recommendations` 行；audit `REPRICING_TRIGGER`

#### 38. `POST /api/v1/store/m2/repricing/:id/apply`
请求：`{"price":38.99}`
响应：`{"id":"rp-...","status":"applied","auditId":"...","m1VersionId":"v-..."}`
副作用：写 `m2_repricing_recommendations.applied_*` + 联动 M1 调用 `createListingVersion(targetId, {source:'m2_reprice', price})` 产出新 listing version（M1 spec 第 2.5）；audit `REPRICE_APPLY`

### 3.10 汇率（3）

#### 39. `GET /api/v1/store/m2/fx/exposures`
响应：`{"totalExposureCny":...,"exposures":[{"currency":"USD","amountSource":120000,"cnyEquivalent":..,"share":0.72}],"recommendations":["..."]}`

#### 40. `GET /api/v1/store/m2/fx/rates?base=USD&quote=CNY&days=30`
响应：`{"rateHistory":[{"date":"...","usdCny":6.92},...]}`

#### 41. `GET /api/v1/store/m2/fx/sensitivity`
响应：`{"sensitivity":[{"delta":-3,"profitImpactCny":-21000},{"delta":-1,"profitImpactCny":-7000},{"delta":1,"profitImpactCny":7000},{"delta":3,"profitImpactCny":21000}]}`

### 3.11 支付通道（4）

#### 42. `GET /api/v1/store/m2/payment-channels`
#### 43. `POST /api/v1/store/m2/payment-channels` audit `PAYMENT_CHANNEL_CREATE`
#### 44. `PUT /api/v1/store/m2/payment-channels/:id` audit `PAYMENT_CHANNEL_UPDATE`
#### 45. `DELETE /api/v1/store/m2/payment-channels/:id` 阻止删 is_primary=1（返 409 `cannot_delete_primary`）；audit `PAYMENT_CHANNEL_DELETE`

### 3.12 税务（3）

#### 46. `GET /api/v1/store/m2/tax/summary`
响应：`{"vat":{"totalDue":...,"byCountry":[...]},"salesTax":{"totalCollected":...,"byState":[...]},"deadlines":[{"name":"...","dueAt":"...","daysLeft":18}]}`

#### 47. `GET /api/v1/store/m2/tax/records?type=vat|sales_tax&region=&status=`
#### 48. `POST /api/v1/store/m2/tax/records/:id/file`
请求：`{"filingRef":"..."}`；副作用：status→filed；audit `TAX_FILE`

### 3.13 LTV / 报警 / 维度 / 库存联动（合并下面 8 个，分别归入对应命名空间但总编号继续）

#### 49. `GET /api/v1/store/m2/ltv/skus`

#### 50. `GET /api/v1/store/m2/alerts/rules`
#### 51. `POST /api/v1/store/m2/alerts/rules` audit `ALERT_RULE_CREATE`
#### 52. `PUT /api/v1/store/m2/alerts/rules/:id` 含 enabled 切换；audit `ALERT_RULE_UPDATE` / `ALERT_RULE_TOGGLE`
#### 53. `DELETE /api/v1/store/m2/alerts/rules/:id` audit `ALERT_RULE_DELETE`
#### 54. `GET /api/v1/store/m2/alerts/events?ruleId=&acknowledged=`
#### 55. `POST /api/v1/store/m2/alerts/events/:id/ack` audit `ALERT_ACK`

#### 56. `GET /api/v1/store/m2/dimensions?by=brand|team|owner|project`
响应：`{"items":[{"name":"品牌 A","skus":12,"gmv":...,"profit":...,"margin":...}]}`
#### 57. `PUT /api/v1/store/m2/dimensions/:id` 手工归属调整；audit `DIMENSION_UPDATE`

#### 58. `GET /api/v1/store/m2/inventory-link/config`
#### 59. `PUT /api/v1/store/m2/inventory-link/config` request `{enabled,thresholds:{stopAt,reduce50At,reduce20At,alertAt}}`；audit `INVENTORY_LINK_CONFIG_UPDATE`
#### 60. `GET /api/v1/store/m2/inventory-link/events?status=`
#### 61. `POST /api/v1/store/m2/inventory-link/events/:id/execute` 自动调用 M3 `toggleCampaign` 或 `updateCampaignBudget`；audit `INVENTORY_LINK_EXECUTE`

> 共 61 个 endpoint（合并 GET/POST/PUT/DELETE 各算 1），覆盖目标 45-50 个；其中前 48 个对应主功能，剩余为报警/维度/联动子项。

### 3.14 错误码统一
- 401 `unauthorized`
- 404 `not_found`
- 400 `validation_error`
- 409 `conflict` (UNIQUE / PK 冲突 / `cannot_delete_primary`)
- 400 `invalid_transition` (PO 状态机)
- 422 `cross_module_loop` (M2↔M3 循环触发保护)
- 500 `internal_error`

---

## 4. 前端改造蓝图

### 4.1 新增文件
- `apps/web-v2/src/api/m2.js` — 14 个命名空间：`profitApi / leaksApi / scenariosApi / reorderApi / slowMovingApi / transfersApi / poApi / suppliersApi / repricingApi / fxApi / paymentChannelsApi / taxApi / ltvApi / alertsApi / dimensionsApi / inventoryLinkApi`（实际 16 个，14 是核心业务，2 个是联动 & 维度的细化）
- `apps/web-v2/src/composables/useM2State.js` — 11 个 composable：
  1. `useProfitOverview(range)` → overview + topSkus + trend
  2. `useSkuProfit(filters)`
  3. `useCashflow(days)` → points + alerts + summary
  4. `useLeaks(filters)` + leaks CRUD wrapper
  5. `useScenario(sku)` — preview / save / history
  6. `useReorder()` + draft PO 流程
  7. `useSlowMoving()` + 4 选项执行
  8. `useTransfers()`
  9. `usePOFlow(id)` — 状态机辅助
  10. `useRepricing()` + apply 联动 M1
  11. `useM2Realtime()` — 监听 M2→M3 / M2→M4 联动事件流

### 4.2 老 `api/profit.js` 与 `api/inventory.js` 处置
- 保留 `profit.js` / `inventory.js` 作 deprecated 薄封装；内部转发到 `m2.js` 的同名方法
- 渐进迁移：M2 全部 19 页改用 `m2.js`；旧文件 2 周后删除

### 4.3 19 个 Vue 页面逐项改造

| 页面 | 删 mock | 接 API | 新增 |
|------|---------|--------|------|
| `ProfitOverview.vue` | — (本就 API) | `profitApi.overview(range)` | range 切换写 URL query；onMounted 拉数；recompute 显示进度 |
| `ProfitSkus.vue` | `mockSkus` import | `profitApi.skus(filters)` + `profitApi.waterfall(sku)` | 抽屉打开懒加载瀑布 |
| `ProfitCashflow.vue` | `mockCashflow` | `profitApi.cashflow(days)` + `profitApi.cashflowAlerts()` | 关键事件可点击新增 → POST events |
| `ProfitLeaks.vue` | `mockLeaks` | `leaksApi.list({severity})` + `leaksApi.startFix / markFixed / ignore` | DecisionCard 已就位 audit |
| `OrderProfit.vue` | `mockOrderProfit` | `profitApi.orderDetail(orderId)` | 路由参数 `:orderId`；新增订单选择器 |
| `ScenarioSimulator.vue` | `mockSkus` | `scenariosApi.preview` (debounce 300ms) + `scenariosApi.save` + `scenariosApi.list(sku)` | 历史快照列表抽屉 |
| `InventoryReorder.vue` | — (半 API) | `reorderApi.list` + `reorderApi.createPO` | createPO 完成跳转 `/inventory/purchase-orders?id=...` |
| `SlowMovingDecision.vue` | `mockSlowMovingOptions` | `slowMovingApi.list` + `slowMovingApi.detail(id)` + `slowMovingApi.execute(id, option)` | 路由参数 `:id` 支持多 SKU 切换 |
| `InventoryTransfers.vue` | `mockTransfers` | `transfersApi.list` + `transfersApi.approve / cancel` | 重新扫描按钮真实触发 recompute |
| `PurchaseOrders.vue` | `mockPurchaseOrders` | `poApi.list({status})` + `poApi.detail(id)` + `poApi.transition` + `poApi.payment` | 新建 PO 弹窗接 `poApi.create` |
| `Suppliers.vue` | `mockSuppliers` | `suppliersApi.list / create / update / delete` | "添加供应商"弹窗真接 |
| `RepricingDecision.vue` | `mockRepricing` | `repricingApi.list` + `repricingApi.detail(id)` + `repricingApi.apply(id, price)` | 应用后 toast 显示 M1 新 version id |
| `FxRisk.vue` | `mockFx` | `fxApi.exposures` + `fxApi.rates(30)` + `fxApi.sensitivity` | AI 建议来自后端 |
| `PaymentChannels.vue` | `mockPaymentChannels` | `paymentChannelsApi.list / create / update / delete` | 编辑弹窗 |
| `TaxAssist.vue` | `mockTax` | `taxApi.summary` + `taxApi.records({type,region})` + `taxApi.file(id)` | 标记申报按钮 |
| `LTV.vue` | `mockLTV` | `ltvApi.list` | 时间维度切换 |
| `CustomAlerts.vue` | `mockCustomAlerts` + `useLocalStore` 报警部分 | `alertsApi.rules.*` + `alertsApi.events.*` | 新建对话框真提交；触发列表抽屉 |
| `Dimensions.vue` | `mockDimensions` | `dimensionsApi.aggregate({by})` | tab 切换走 URL query |
| `InventoryLink.vue` | `mockInventoryLink` + `useLocalStore` 配置部分 | `inventoryLinkApi.config / saveConfig / events / execute` | 阈值保存改为真 PUT |

### 4.4 跨刷新一致
- URL query：
  - `/profit/overview?range=30d`
  - `/profit/skus?search=&lifecycle=&range=`
  - `/profit/cashflow?days=90`
  - `/profit/leaks?severity=P0`
  - `/inventory/purchase-orders?status=&id=&tab=detail`
  - `/inventory/slow-moving?id=`
  - `/finance/dimensions?by=brand`
  - `/finance/alerts?ruleId=&tab=events`
- localStorage：
  - `m2_draft_alert_rule` 未保存的报警规则
  - `m2_draft_po_<sku>` 未保存的 PO 草稿
  - `m2_scenario_last_<sku>` 上次模拟器变量
  - `m2_inventory_link_thresholds_local` 临时阈值缓存（与服务端 sync）

### 4.5 删除项
- `apps/web-v2/src/utils/mock-data-extras.js` 中所有 M2 相关导出（保留 M4 相关）
- `apps/web-v2/src/utils/mock-data.js` 中 `mockSkus / mockCashflow / mockLeaks / mockSuppliers / mockPurchaseOrders` 移除 M2 引用
- `apps/web-v2/src/composables/useLocalStore.js` 中 `customAlerts / inventoryLinkThresholds / inventoryLinkEnabled` 改为只读缓存（后端为主）

---

## 5. 跨模块联动

### 5.1 M2 → M1（重定价 → listing 调价建议）
- 触发点：`POST /m2/repricing/:id/apply`
- 实现：在 `data-store-profit.mjs::applyRepricing()` 内 `db.transaction(() => { ... })()`：
  1. 写 `m2_repricing_recommendations.applied_price` + `applied_at`
  2. import `createListingVersion` from `data-store-listings.mjs`，构造 `{ targetId: lookupTargetBySku(sku), source: 'm2_reprice', price, roundNo: maxRoundNo+1 }`
  3. 把返回的 `m1VersionId` 反写 `m2_repricing_recommendations.m1_listing_version_id`
  4. audit_logs 链路：M2 `REPRICE_APPLY` (audit_id A) → M1 `LISTING_VERSION_CREATE_FROM_M2` (audit_id B, parent_audit_id=A)
- 防 loop：M1 `LISTING_VERSION_CREATE_FROM_M2` 不会再回触发 M2

### 5.2 M2 → M3（库存断货 → 暂停广告）
- 触发点：定时 hourly job + `POST /m2/inventory-link/events/:id/execute`
- 阈值规则（来自 `m2_inventory_link_config`）：
  - days_left < stop_at → action='stop_all' → 调 M3 `toggleCampaign(id, enabled=false)` 批量
  - stop_at ≤ days_left < reduce_50_at → action='bid_reduce_50' → 调 M3 `updateCampaignBudget(id, *0.5)` 批量
  - reduce_50_at ≤ days_left < reduce_20_at → action='bid_reduce_20' → 调 M3 + 在 M2 创建 `reorder_recommendation`（urgency='high'）
  - reduce_20_at ≤ days_left < alert_at → action='alert_only' → 写 `m2_alert_events`，不动 M3
- 实现：`triggerInventoryLink(db, userId, storeId)` 函数，导出给 cron + manual execute
- 审计链：M2 `INVENTORY_LINK_EXECUTE` (parent) → M3 `LX_CAMPAIGN_TOGGLE` (child)
- 防 loop：M3 toggle 时若 cause='m2_inventory_link' 则不写 `ad_manual_changes`（避免又回写 M2 timeline）

### 5.3 M2 → M4（异常事件推送）
- 触发点：
  - `m2_leaks` 新增 severity=P0 → 推 M4 `notifications`
  - `m2_alert_events` triggered_at + severity=P0/P1 → 推 M4
  - `m2_purchase_orders.status='disputed'` → 推 M4
  - 滞销 LTS 倒计时 < 7 天 → 推 M4
- 实现：`appendM4Notification(db, userId, storeId, {source:'M2', type, severity, title, detail, relatedId})`（M4 表 `notifications` 已规划在 M4_SPEC，本 spec 仅约定接口）
- 字段：`m2_alert_events.pushed_to_m4` 标记位避免重复推送
- 防 loop：M4 ack 操作不触发 M2

### 5.4 M2 ← M3（广告费用 → 利润成本）
- 反向数据流：`POST /m2/profit/recompute` 时从 `lx_daily_data` 聚合 `ad_alloc` 写入 `m2_order_costs`
- 不写 audit（属于内部 ETL）

### 5.5 联动配置开关
- `m2_inventory_link_config.enabled=0` 时跳过所有 M2→M3 自动动作
- 全局 sovereignty 设置 `m2_auto_cross_module=false` 时所有跨模块写改为生成"建议"放进 `ad_suggestions` 等待人工 accept

---

## 6. 种子数据策略

### 6.1 总体
- 新文件 `apps/api/src/data-store-profit.mjs` 导出 `seedProfitForUser(db, userId, storeId)`
- 由 `data-store.mjs::seedSampleStoreData()` 末尾调用
- 全部使用 Mulberry32 PRNG seed = hash(`${userId}:${storeId}:m2`) & 0xffffffff
- 量级与 M1/M3 demo 数据匹配（CASE-001 / CABLE-002 / LAMP-003 SKU 联动）

### 6.2 各表种子规则

| 表 | 行数 | seed 规则 |
|----|------|----------|
| `m2_orders` | 412 行（30 天 × 平均 14 单/天） | 按 mockSkus 5 个 SKU 加权随机分配 ASIN/SKU；revenue=price ± 5%；ordered_at 在 30 天内分布；80% accuracy=final，15% high_estimate，5% estimate |
| `m2_order_costs` | 412 × 14 ≈ 5768 行 | 每订单 14 项费用：referralFee=15% of revenue, fbaFee=fixed 3.85, refundProvision=4%, storage=按 daysCover, adAlloc=按 acos, cogs=45%, freight=2.10, fxLoss=2%, capitalCost=0.7%, lts/return/inbound/subscription/misc 各 0-2 美元 |
| `m2_sku_profit_snapshots` | 5 SKU × 3 range = 15 | 由 orders+costs 聚合 |
| `m2_cashflow_events` | 90 行（90 天每天 1 行）+ 12 个 label 事件（Amazon 双周结算 ×7 + PingPong 提现 ×3 + PO 定金/尾款 ×2） | 起始 balance=350000 CNY；双周入账 48000；月 PO 出账 15000+35000 |
| `m2_leaks` | 12 行 (P0×3, P1×6, P2×3) | 类型分布：AD_OVERSPEND ×3, STORAGE_FEE ×2, REFUND_HIGH ×2, FX_LOSS ×1, NEGATIVE_MARGIN ×2, INVENTORY_AGING ×1, PRICE_GAP ×1；monthly_impact 1000-18000 |
| `m2_scenarios` | 3 行（preset reset/conservative/aggressive 各 1，sku=CASE-001） | — |
| `m2_inventory_snapshots` | 5 SKU × 4 warehouse = 20 | LAMP-003 on_hand=1200/FBA-US, in_stock_days=210；CASE-001 on_hand=350, daily_velocity=12, days_cover=29 |
| `m2_reorder_recommendations` | 4 行 | urgency=critical ×1, high ×2, medium ×1 |
| `m2_slow_moving_decisions` | 2 行 | LAMP-003 (recommended=A) + 另一个 SKU (recommended=C) |
| `m2_inventory_transfers` | 3 行 | FBA-DE→FBA-US ×2, OVERSEAS→FBA-JP ×1 |
| `m2_purchase_orders` | 6 行 | status: draft ×2, ordered ×1, in_transit ×2, received ×1 |
| `m2_purchase_order_items` | 6 PO × 平均 2 item = 12 行 | — |
| `m2_suppliers` | 4 行 | 评分 4.0-4.8 |
| `m2_repricing_recommendations` | 3 行 | 1 pending, 1 applied, 1 rejected；其中 applied 的关联 m1 version |
| `m2_fx_rates` | 30 行（30 天 USD/CNY） | 6.85-7.05 区间 random walk |
| `m2_fx_exposures` | 4 行（USD/CNY/EUR/GBP） | USD 占 72% |
| `m2_payment_channels` | 4 行 | Payoneer (primary), PingPong, WorldFirst, ACCS (warning=1) |
| `m2_tax_records` | 8 行 | VAT DE/UK/FR + Sales Tax CA/TX/NY/WA/FL |
| `m2_ltv_snapshots` | 5 SKU | repeat_rate 0.05-0.35 |
| `m2_alert_rules` | 4 行 | 低利润率 / 库存断货 / ACOS 飙升 / 现金缺口 |
| `m2_alert_events` | 6 行 | 各规则触发 0-3 次，含 1 个 P0 |
| `m2_dimensions` | brand ×4 + team ×2 + owner ×3 + project ×2 = 11 | metrics 与 orders 聚合一致 |
| `m2_inventory_link_config` | 1 行 | enabled=1, stop_at=3, reduce_50_at=7, reduce_20_at=14, alert_at=21 |
| `m2_inventory_link_events` | 2 行 | 1 auto_executed (LAMP-003, stop_all), 1 monitoring (CASE-001, alert_only) |

### 6.3 确定性
- 同一 (userId, storeId) 多次 seed → 数据 byte-identical
- `seedProfitForUser` 内部先 `db.prepare('DELETE FROM <table> WHERE user_id=? AND store_id=?').run(...)` 清空再插
- 跨用户 / 跨店铺 metric 独立（避免 demo 用户切店后串数）

---

## 7. 审计与回滚

### 7.1 actionType 总览（M2 共 23 个）

| actionType | forward 处理 | revert 处理 |
|------------|------------|-----------|
| `PROFIT_RECOMPUTE` | 重算 `m2_sku_profit_snapshots` | 不可回滚（写 revert_blocked） |
| `CASHFLOW_EVENT_CREATE` | 插入 `m2_cashflow_events` | DELETE by id |
| `LEAK_START_FIX` | status: pending→fixing | status 回 pending |
| `LEAK_MARK_FIXED` | status: fixing→fixed, set actual_saving | status 回 fixing, clear saving |
| `LEAK_IGNORE` | status: pending→ignored | status 回 pending |
| `SCENARIO_SAVE` | 插入 `m2_scenarios` | DELETE by id |
| `CREATE_PURCHASE_ORDER_DRAFT` | 新建 PO(status=draft) + items | DELETE PO + items + reorder.status 回 pending |
| `REORDER_DISMISS` | status: pending→dismissed | status 回 pending |
| `SLOW_MOVING_EXECUTE` | status: pending→executed, 子动作（REPRICE_DOWN 等）联动 | status 回 pending + 子动作 revert |
| `INVENTORY_TRANSFER_APPROVE` | status: recommended→approved | status 回 recommended |
| `INVENTORY_TRANSFER_CANCEL` | status→cancelled | status 回 recommended |
| `PO_CREATE` | 同 draft + items | DELETE |
| `PO_UPDATE` | patch | 恢复 before snapshot |
| `PO_STATE_TRANSITION` | 状态机推进 | 反向推进（received 不可逆，返 422） |
| `PO_PAYMENT` | 设置 deposit_paid / balance_paid + 写 cashflow_event | 反向 + 删 cashflow_event |
| `SUPPLIER_CREATE` | INSERT | DELETE |
| `SUPPLIER_UPDATE` | UPDATE | 恢复 before |
| `SUPPLIER_DELETE` | status→inactive | status 回 active |
| `REPRICING_TRIGGER` | 新建 recommendation | DELETE recommendation |
| `REPRICE_APPLY` | apply + 联动 M1 写 version | 调 M1 `archiveListingVersion(versionId)` + status 回 approved |
| `REPRICE_UP` / `REPRICE_DOWN` | 子 audit（被 SLOW_MOVING_EXECUTE 或 REPRICE_APPLY 父审计调用） | 回退到旧价格 |
| `START_PROMOTION` | 新建 promotion 记录（与 M3 PromoSync 联动） | 删 promotion |
| `CREATE_REMOVAL_ORDER` | 写一条 removal log | DELETE |
| `CREATE_DISPOSAL_ORDER` | 写一条 disposal log | DELETE |
| `INVENTORY_TRANSFER` | 写 transfer 记录 | DELETE |
| `PAYMENT_CHANNEL_CREATE/UPDATE/DELETE` | 标准 CRUD | 反向 |
| `TAX_FILE` | status: pending→filed | status 回 pending |
| `ALERT_RULE_CREATE/UPDATE/TOGGLE/DELETE` | 标准 CRUD | 反向 |
| `ALERT_ACK` | acknowledged=1 | =0 |
| `DIMENSION_UPDATE` | 更新归属 | 恢复 before |
| `INVENTORY_LINK_CONFIG_UPDATE` | UPDATE 阈值 | 恢复 before |
| `INVENTORY_LINK_EXECUTE` | 触发 M3 子动作 | 调 M3 反向（重启 campaign / 恢复 budget） |

### 7.2 父子 audit 链
- 父 audit 调用子 audit 时，子 audit `parent_audit_id` 字段（在 `audit_logs` 已有 `extra` JSON 列里加 key）记录关系
- revert 父 audit 时，先按 `created_at DESC` 反向 revert 所有子 audit，再 revert 父
- 失败回滚：`db.transaction(() => { ... })()` 确保原子；任一子失败回滚整个事务并把父 audit `revert_blocked=1`

### 7.3 跨模块 revert
- M2 `REPRICE_APPLY` revert 时调用 M1 `archiveListingVersion`（M1 spec 段 3.5 已有 `POST /m1/versions/:id`，需新增 `archive` 子路径）
- M2 `INVENTORY_LINK_EXECUTE` revert 时调用 M3 `toggleCampaign(id, enabled=true)` / `updateCampaignBudget(id, oldBudget)`
- 跨模块 revert 用相同 `appendAuditLog(sourceModule='M2', ...)`，target 字段写 child module 的资源类型（如 `{type:'m1_listing_version', id:'v-...'}`），便于审计中心过滤

---

## 8. 10 个端到端测试场景

每个场景至少跑 5 次确认稳定。提供 curl + SQL 双验证。

### 场景 1：利润总览 → 单 SKU 瀑布 → 单订单瀑布（下钻一致性）
**Given**：seed 后 412 订单 + 5768 cost 行
**When**：
1. `GET /m2/profit/overview?range=30d` 看 revenue=R, netProfit=P
2. `GET /m2/profit/skus?range=30d` Σ(sku.revenue)=R, Σ(sku.netProfit)=P
3. 任选 CASE-001：`GET /m2/profit/skus/CASE-001/waterfall?range=30d` items sum to sku.netProfit ± 0.01
4. 任选其下单订单：`GET /m2/orders/<oid>/profit` 14 项费用 sum + revenue = netProfit ± 0.01
**Then**：四级下钻金额闭合；F5 刷新各级 URL query 保留

### 场景 2：触发补货 → 生成 PO 草稿 → 提交 → 海运 → 入仓
**Given**：CASE-001 reorder recommendation urgency=high
**When**：
1. `POST /m2/inventory/reorder/<id>/create-po` → 返回 poId
2. `POST /m2/purchase-orders/<poId>/transition {to:'ordered'}` → 写 cashflow_event 定金出账
3. `POST /m2/purchase-orders/<poId>/transition {to:'in_transit',tracking:'...'}`
4. `POST /m2/purchase-orders/<poId>/transition {to:'received'}` → inventory_snapshots +500
**Then**：每步审计 ok；reorder.status=drafted→ordered；inventory 增加；cashflow_events 增加 2 条

### 场景 3：滞销决策 4 选项执行（含联动 M1）
**Given**：LAMP-003 slow_moving_decision recommended=A
**When**：`POST /m2/inventory/slow-moving/<id>/execute {option:'A'}`
**Then**：
- `m2_slow_moving_decisions.status='executed'`
- `m1_listing_versions` 新增 1 行 source='m2_reprice' price 较旧价 -30%
- audit_logs 父 `SLOW_MOVING_EXECUTE` + 子 `REPRICE_DOWN` + 子 `LISTING_VERSION_CREATE_FROM_M2`
- 撤销父 audit → 三层全反

### 场景 4：跟价决策审批（重定价 + M1 联动）
**Given**：CASE-001 repricing recommendation status=pending, recommended_price=38.99
**When**：`POST /m2/repricing/<id>/apply {price:38.99}`
**Then**：
- `m2_repricing_recommendations.status='applied'`
- `m1_listing_versions` 新版本 price=38.99
- audit chain: REPRICE_APPLY → LISTING_VERSION_CREATE_FROM_M2
- 跨刷新：`/profit/repricing?id=<id>` 显示 "已应用 → M1 version v-xxxx"

### 场景 5：汇率敞口 → 敏感度 → AI 建议
**When**：
1. `GET /m2/fx/exposures` 返回 USD=72% CNY=...
2. `GET /m2/fx/rates?days=30` 30 行
3. `GET /m2/fx/sensitivity` 返回 -3pp~+3pp 4 行
**Then**：sensitivity[delta=-1].profitImpactCny = -totalExposureCny * 0.01（误差 < 1%）；AI 建议从后端拉，非硬编码

### 场景 6：税务申报标记
**Given**：VAT-DE record status=pending, days_left=18
**When**：`POST /m2/tax/records/<id>/file {filingRef:'DE-2026-Q2-...'}`
**Then**：status='filed', filing_ref 写入；audit TAX_FILE；UI tag 变绿

### 场景 7：LTV 与 ACOS 容忍度联动展示
**When**：`GET /m2/ltv/skus`
**Then**：返回 5 行；status='high_ltv' 行 cac_breakeven > avg_order_value（容忍 ACOS 高）；前端 LTV 页与 M3 SearchTermReport 共享 LTV 数据（前端缓存 5 min）

### 场景 8：自定义告警全流程
**When**：
1. 新建规则：`POST /m2/alerts/rules {name:'低利润率',conditions:[{field:'sku.rolling_30d_margin',op:'<',value:0.15,duration_days:3}],severity:'P1',notify_channels:['in_app','email']}`
2. 模拟触发：seed 一条 CASE-001 margin=0.10 持续 3 天 → 调 `POST /m2/alerts/scan`（隐藏 admin）→ 写 alert_events 1 条
3. 在 `/finance/alerts?tab=events` 看到事件
4. `POST /m2/alerts/events/<id>/ack`
**Then**：trigger_count++；last_triggered 更新；ack 后 UI badge -1；M4 notifications 收到推送

### 场景 9：维度切换（品牌/团队/运营）
**When**：依次 `GET /m2/dimensions?by=brand` → `team` → `owner`
**Then**：三种 by 的 Σ(profit) 相等；URL `/finance/dimensions?by=team` F5 后 tab 仍选中

### 场景 10：库存联动断货保护（M2→M3 + revert）
**Given**：LAMP-003 days_left=2（< stop_at=3）
**When**：
1. `POST /m2/inventory-link/events/<eid>/execute`
2. 验证 lx_campaigns WHERE sku='LAMP-003' enabled=0
3. 审计中心找父 audit `INVENTORY_LINK_EXECUTE` → revert
4. 验证 enabled=1 恢复
**Then**：M2 → M3 一次推送、一次撤回；M3 `ad_manual_changes` 不写（cause='m2_inventory_link' 过滤）；防 loop

---

## 9. 验收标准（DoD）

### 后端
- 24 张 `m2_*` 表跨重启存活，索引齐全
- 61 endpoint 路径正确：401/404/400/409/422/200/201 各路径全打通
- 每个写操作必写 `audit_logs(sourceModule='M2')`；跨模块写操作有父子 audit 链
- 删除店铺 `removeUserStore()` 联动清理 24 张表对应行
- 种子数据：登录 demo 用户看到：≥412 订单 / 12 漏点 / 6 PO / 4 供应商 / 3 跟价建议 / 4 报警规则 / 11 维度行 / 2 库存联动事件
- M2 → M1 / M2 → M3 / M2 → M4 三条联动管道 happy path + revert path 全部通过

### 前端
- `npm run build` 通过，0 mock-data import 残留于 M2 区域
- 19 页 `onMounted` 全部走 `m2.js` 真 API；旧 `profit.js` / `inventory.js` 仅作 deprecated 转发
- 每个写操作 try/catch + ElMessage.error
- 跨 F5 一致：URL query / localStorage 草稿 / 选中 id / tab 全保留
- DecisionCard 与 useAudit 已就位 sourceModule='M2'

### 跨模块联动
- M2→M1：repricing apply 后 M1 ListingVersions 页面看到新 source='m2_reprice' 版本
- M2→M3：库存联动触发后 M3 AdsHub 看到对应 campaign 状态变化 + lx_operation_logs 写入
- M2→M4：P0 漏点 / P0 告警 / 争议 PO / LTS 倒计时 < 7 在 M4 MonitorAnomalies 页面可见
- 防 loop：M2→M3→M2 / M2→M1→M2 至多 1 层后停止

### 性能
- `/m2/profit/overview` p95 < 250ms（30 天聚合 5768 cost 行）
- `/m2/orders` 分页 50 条 p95 < 150ms
- `/m2/scenarios/preview` p95 < 50ms（无状态）
- `/m2/inventory-link/events/:id/execute` 含 M3 联动 p95 < 300ms

### 测试
- 10 场景每个跑 5 次 0 failures
- 利润下钻金额闭合：overview / skus / waterfall / order 误差 < 0.5%
- 联动 idempotency：重复 execute / apply 不重复写 audit / version

---

## 10. 风险与缓解

### 10.1 SQLite 并发
- 风险：`m2_orders` + `m2_order_costs` 一次插入数千行，与 cron job 并发可能锁
- 缓解：所有 batch insert 用 `db.transaction(() => { for (...) stmt.run(...) })()` + 单库 writer；读用 prepare 复用

### 10.2 JSON-as-TEXT 查询
- 风险：`m2_order_costs.detail` JSON 不能 SQL 过滤；`m2_dimensions.metrics` 聚合无法 GROUP BY
- 缓解：
  - 把高频过滤字段提到独立 column（accuracy_level / cost_type 等已经如此）
  - dimensions 聚合在写入时预算好（snapshot 表），查询直接 SELECT
  - 需要时用 SQLite `json_extract(detail,'$.foo')` 但限于报表导出场景

### 10.3 UNIQUE 冲突
- 风险：
  - `m2_orders` UNIQUE(user_id, store_id, order_id) — 重复同步订单
  - `m2_purchase_orders` UNIQUE(user_id, store_id, po_number) — 并发新建 PO 号撞车
  - `m2_dimensions` UNIQUE(user_id, store_id, dim_type, name)
- 缓解：
  - INSERT 用 `INSERT OR IGNORE` 或 `INSERT ... ON CONFLICT DO UPDATE`（订单同步幂等）
  - PO 号用 `db.transaction(() => { SELECT MAX + 1; INSERT })()` 原子分配
  - 路由层捕获 `SQLITE_CONSTRAINT` 返 409

### 10.4 跨模块 loop 防护
- 风险：M2→M3 toggle campaign → M3 写 ad_manual_changes → 用户在 M2 timeline 看到 → 再触发 M2
- 缓解：
  - 跨模块调用时传 `cause` 字段（如 `cause='m2_inventory_link'`）
  - M3 toggle 内若 cause 以 `m2_` 开头 → 不写 ad_manual_changes
  - audit_logs 增加 `parent_audit_id` 引用，UI 显示父子关系
  - 全局 hard limit：同一资源 `audit_logs` 5 分钟内同 actionType > 3 次 → 拒绝并报 422 `cross_module_loop`

### 10.5 浮点精度
- 风险：14 项费用累加 != netProfit（浮点误差累积）
- 缓解：
  - 金额存 REAL，展示用 `Math.round(x * 100) / 100`
  - 验收：API 返回 netProfit 一定来自 `revenue - SUM(costs)` 同一次计算结果，而非两次独立 SQL 聚合
  - 单测：`abs(sum(costs) + netProfit - revenue) < 0.01`

### 10.6 时间维度对齐
- 风险：30 天可能是日历 30 天 vs 滚动 30 天 vs settle 30 天
- 缓解：
  - 统一用 `ordered_at` 滚动 N 天
  - snapshot 表有 `computed_at`，前端显示"截至 2026-05-15 12:00"

### 10.7 PO 状态机异常
- 风险：用户误把 received 改回 in_transit；财务对账失败
- 缓解：
  - `received` → 任何状态返 400 `invalid_transition`，需 admin endpoint 才能反转
  - `cancelled`/`disputed` 是终态，仅供 dispute 工作流（M4 联动）

### 10.8 大表迁移
- 风险：未来订单上 10 万 → SQLite 慢；切真实 ERP 需迁 Postgres
- 缓解：
  - 索引覆盖：(user_id, store_id, ordered_at DESC) / (user_id, store_id, sku) / UNIQUE(order_id)
  - 分页用 cursor (ordered_at + id) 而非 offset，避免深翻页 slow

### 10.9 报警 cooldown 与噪声
- 风险：低利润率规则每小时触发 → 用户疲劳
- 缓解：
  - `m2_alert_rules.cooldown_hours` 默认 6；同规则在 cooldown 内不重复写 event
  - severity=P0 跳过 cooldown 但记一条"summary"代替原始事件

### 10.10 demo 与真实接入并存
- 风险：未来对接 SP-API + Avalara，mock seed 数据可能干扰
- 缓解：
  - `m2_orders.source` 字段：'seed'|'sp_api'|'manual'
  - 真实数据接入时 seed 数据软清除（设 `archived=1`）；保留单测可用

---

## 11. 工程量估算

| Sprint | 内容 | 工时 |
|--------|------|------|
| 1 | 后端 DDL 24 表 + `data-store-profit.mjs` schema + seed | 5h |
| 2 | 后端 profit/orders/cashflow/leaks endpoints（13 个） | 4h |
| 3 | 后端 inventory/reorder/slow-moving/transfers/PO/suppliers（22 个） | 6h |
| 4 | 后端 repricing/fx/payment-channels/tax/ltv/alerts/dimensions/inventory-link（22 个 + 联动） | 6h |
| 5 | 前端 `api/m2.js` 16 namespace + `useM2State.js` 11 composable | 3h |
| 6 | 前端 19 个 .vue 页面去 mock + 接 API | 6h |
| 7 | 跨模块联动 M2↔M1↔M3↔M4 落实 + 防 loop | 4h |
| 8 | URL query / localStorage 草稿 / 跨刷新一致 | 2h |
| 9 | 10 场景 QA + 修 bug | 4h |
| **合计** | — | **~40h，6 agents 并行 ≈ 7h 钟表** |

新增文件 18 个 + 改 ~25 文件 ≈ **5500 行**

---

## 12. 关键约定速查

- 所有 M2 表前缀 `m2_`
- 所有 endpoint 前缀 `/api/v1/store/m2/`
- 所有写操作 `appendAuditLog(sourceModule='M2', ...)`
- 跨模块调用必带 `cause: 'm2_<feature>'`
- 14 项成本归集顺序固定：referral / fba / refund / storage / ad / cogs / freight / fx / capital / lts / return / inbound / subscription / misc
- accuracy_level 四态：final / high_estimate / estimate / unavailable
- 货币：金额字段不强制单一币种，靠 currency 字段区分；展示前端按用户设置归一到 CNY 显示
- PRNG seed = `hash('${userId}:${storeId}:m2') & 0xffffffff`
- 时间统一 ISO-8601；日期字段 YYYY-MM-DD
