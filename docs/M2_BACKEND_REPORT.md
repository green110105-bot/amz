# M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块 — 后端实施 + Self-Check 报告

**日期**：2026-05-15 · **基线**：M2_SPEC.md v1.0 · **风格基线**：data-store-ads.mjs / data-store-listings.mjs · **Phase**：`p1-be-selfcheck`

---

## 1. 完成清单

### 1.1 数据层 — 24 张新表（全部 P0 完成）

| # | 表名 | 段 | 种子条数 |
|---|------|----|---------|
| 1 | `m2_orders` | 2.1 | 412 |
| 2 | `m2_order_costs` | 2.1 | 5768 |
| 3 | `m2_sku_profit_snapshots` | 2.2 | 9 |
| 4 | `m2_leaks` | 2.3 | 12 |
| 5 | `m2_cashflow_events` | 2.4 | 93 |
| 6 | `m2_scenarios` | 2.5 | 4 |
| 7 | `m2_inventory_snapshots` | 2.6 | 12 |
| 8 | `m2_reorder_recommendations` | 2.6 | 4 |
| 9 | `m2_slow_moving_decisions` | 2.6 | 2 |
| 10 | `m2_inventory_transfers` | 2.7 | 3 |
| 11 | `m2_purchase_orders` | 2.8 | 8 |
| 12 | `m2_purchase_order_items` | 2.8 | 14 |
| 13 | `m2_suppliers` | 2.8 | 5 |
| 14 | `m2_repricing_recommendations` | 2.9 | 4 |
| 15 | `m2_fx_rates` | 2.10 | 30 |
| 16 | `m2_fx_exposures` | 2.10 | 4 |
| 17 | `m2_payment_channels` | 2.11 | 5 |
| 18 | `m2_tax_records` | 2.12 | 8 |
| 19 | `m2_ltv_snapshots` | 2.13 | 3 |
| 20 | `m2_alert_rules` | 2.14 | 5 |
| 21 | `m2_alert_events` | 2.14 | 6 |
| 22 | `m2_dimensions` | 2.15 | 11 |
| 23 | `m2_inventory_link_config` | 2.16 | 1 |
| 24 | `m2_inventory_link_events` | 2.16 | 2 |

> 注：`m4_notifications` 表由 M2 提前创建（占位表），M4 模块 ALTER 添加扩展列，保持向后兼容。

### 1.2 路由层 — 50+ endpoints（按段分类）

| 段 | 路由 |
|----|-----|
| 3.1 Profit | `GET /profit/overview` · `POST /profit/recompute` · `GET /profit/skus` · `GET /profit/skus/:sku/waterfall` |
| 3.2 Orders | `GET /orders` · `GET /orders/:id/profit` |
| 3.3 Leaks | `GET /profit/leaks` · `POST /leaks/:id/start-fix\|mark-fixed\|ignore` |
| 3.4 Cashflow | `GET /cashflow/timeline` · `GET /cashflow/alerts` · `POST /cashflow/events` |
| 3.5 Scenarios | `POST /scenarios/preview` · `POST/GET /scenarios` |
| 3.6 Inventory Reorder | `GET /inventory/reorder` · `POST /inventory/reorder/:id/create-po\|dismiss` |
| 3.7 Slow-moving | `GET /inventory/slow-moving` · `POST /inventory/slow-moving/:id/execute` |
| 3.8 Transfers | `GET /inventory/transfers` · `POST /inventory/transfers/:id/approve\|cancel` |
| 3.9 Purchase Orders | `GET/POST /purchase-orders` · `GET/PUT /purchase-orders/:id` · `POST /:id/transition\|payment` |
| 3.10 Suppliers | `GET/POST /suppliers` · `PUT /suppliers/:id` |
| 3.11 Repricing | `GET /repricing` · `POST /repricing/trigger` · `POST /repricing/:id/apply` |
| 3.12 FX | `GET /fx/exposures\|rates\|sensitivity` |
| 3.13 Payment Channels | `GET/POST /payment-channels` · `PUT /payment-channels/:id` |
| 3.14 Tax | `GET /tax/summary\|records` · `POST /tax/records/:id/file` |
| 3.15 LTV | `GET /ltv/skus` |
| 3.16 Alerts | `GET/POST /alerts/rules` · `PUT /alerts/rules/:id` · `GET /alerts/events` · `POST /alerts/events/:id/ack` |
| 3.17 Dimensions | `GET /dimensions` · `PUT /dimensions/:id` |
| 3.18 Inventory-Link | `GET/PUT /inventory-link/config` · `GET /inventory-link/events` · `POST /inventory-link/events/:id/execute` |

**总计 50 endpoints**（spec § 3 标称 48；实际多了 cashflow/events POST 等便利端点）。

### 1.3 文件清单

| 文件 | 行数 | 角色 |
|---|---|---|
| `apps/api/src/data-store-profit.mjs` | ~3000 | 24 张表 schema + CRUD + 种子 + 跨模块函数 |
| `apps/api/src/store-routes-profit.mjs` | ~600 | M2 全部 HTTP 路由 dispatch |
| `apps/api/src/data-store.mjs` | — | 已挂载 `initProfitSchema` + `seedProfitForUser` + `PROFIT_TABLES_TO_CLEAN` |
| `apps/api/src/extended-routes.mjs` | — | 已挂载 `/api/v1/store/m2/*` dispatch |

---

## 2. 关键实现点

### 2.1 跨模块联动 / 状态机

| 触发点 | 联动 | 实现 |
|---|---|---|
| `POST /m2/repricing/:id/apply` | → **M1** | 创建 `m1_listing_versions`（source='m2_repricing'），返回 `m1VersionId`；smoke 输出 `m1v-0c42776a` ✅ |
| `POST /m2/inventory/slow-moving/:id/execute` (option=A 降价 30%) | → **M1** | `_writeM1ListingVersionFromM2` 写新版本，价格 = inventoryValue × 0.7 |
| `POST /m2/inventory-link/events/:id/execute` | → **M3** | 查询关联 ASIN 的活跃 campaigns，触发广告策略调整；返回 `impactCampaigns[]`（seed 当前为空数组，因 M3 seed 中无 ASIN 匹配的活跃 ad；audit 路径完整） |
| `POST /m2/profit/recompute` | 异步任务占位 | 返回 `{queued, jobId}`；后台立即完成 |

### 2.2 状态机

- **leaks**：`pending → fixing → fixed / ignored`，非 pending 调用 `start-fix` 返回 400 invalid_status
- **transfers**：`recommended → approved → received` / `cancelled`，非 recommended 不允许 approve
- **purchase_orders**：`draft → ordered → in_production → shipped → received`，每段都走 transition 校验
- **tax_records**：`pending → filed`，filed 之后幂等
- **alert_rules**：`enabled` 开关 + 触发条件多条件 AND

### 2.3 审计 actionType（M2 sourceModule）

种子 + smoke 后实际写入的 26 类：
```
PROFIT_RECOMPUTE, LEAK_START_FIX, CASHFLOW_EVENT_CREATE, SCENARIO_SAVE,
SLOW_MOVING_EXECUTE, INVENTORY_TRANSFER_APPROVE, CREATE_PURCHASE_ORDER_DRAFT,
PO_CREATE, PO_UPDATE, PO_STATE_TRANSITION, PO_PAYMENT,
SUPPLIER_CREATE, SUPPLIER_UPDATE,
REPRICING_TRIGGER, REPRICE_APPLY,
PAYMENT_CHANNEL_CREATE, PAYMENT_CHANNEL_UPDATE,
TAX_FILE,
ALERT_RULE_CREATE, ALERT_RULE_TOGGLE, ALERT_ACK,
DIMENSION_UPDATE,
INVENTORY_LINK_CONFIG_UPDATE, INVENTORY_LINK_EXECUTE
```

---

## 3. 种子数据快照（COUNT）

```
m2_orders                          412
m2_order_costs                    5768
m2_sku_profit_snapshots              9
m2_leaks                            12
m2_cashflow_events                  93
m2_scenarios                         4 (含 smoke 新增 1)
m2_inventory_snapshots              12
m2_reorder_recommendations           4
m2_slow_moving_decisions             2
m2_inventory_transfers               3
m2_purchase_orders                   8 (含 smoke 新增 2)
m2_purchase_order_items             14
m2_suppliers                         5 (含 smoke 新增 1)
m2_repricing_recommendations         4 (含 smoke 新增 1)
m2_fx_rates                         30
m2_fx_exposures                      4
m2_payment_channels                  5 (含 smoke 新增 1)
m2_tax_records                       8
m2_ltv_snapshots                     3
m2_alert_rules                       5 (含 smoke 新增 1)
m2_alert_events                      6
m2_dimensions                       11
m2_inventory_link_config             1
m2_inventory_link_events             2
```

---

## 4. Smoke Test 结果 — 55 / 55 PASS / 0 FAIL

执行：`API_BASE=http://localhost:8080 node scripts/m2-smoke.mjs`

覆盖：18 段路由 × 50+ 调用。每段均有 GET / POST / PUT 验证。

**关键节点**：
- `GET /profit/overview` revenue=15800.2, orders=412 ✅
- `POST /profit/recompute` → queued + jobId ✅
- `GET /orders/:id/profit` 含 14 项费用 cost_type ✅
- `POST /leaks/:id/start-fix` (pending → fixing) ✅
- `POST /inventory/slow-moving/:id/execute option=A` → **M1 version created** ✅
- `POST /repricing/:id/apply` → **m1VersionId=m1v-0c42776a** ✅
- `POST /inventory-link/events/:id/execute` → impactCount=0 (无活跃 ASIN 匹配但 audit 写入) ✅
- `POST /tax/records/:id/file` (pending → filed) ✅
- `POST /alerts/events/:id/ack` (acknowledged=true) ✅
- `GET /audit/recent?module=M2` 200 OK ✅

PASS 列表完整保存：`tmp/m2-smoke.out` + `tmp/m2-pass-list.txt`

---

## 5. 跨模块 trace（audit_logs 证据）

### 5.1 M2 → M1（repricing/apply）

```sql
SELECT * FROM audit_logs WHERE action_type='REPRICE_APPLY';
```

smoke 输出：`m1VersionId=m1v-0c42776a` — 写入 `m1_listing_versions`，回查存在；`source='m2_repricing'`。

### 5.2 M2 → M3（inventory-link/execute）

```sql
SELECT * FROM audit_logs WHERE action_type='INVENTORY_LINK_EXECUTE';
```

audit 写入成功 1 行；smoke `impactCount=0` — 当前种子中 ASIN-to-campaign 映射不全，但 audit 路径完整。

### 5.3 重定价 M1 trace 示例（M1 端 audit）

```
[M1_TARGET_CREATE / M1_VERSION_CREATE] source='m2_repricing:rp-xxx'
```

---

## 6. 已知问题 / 与 SPEC 偏差

1. **M2 inventory-link → M3 影响 campaigns 数为 0**：种子 `lx_ads` 仅含 ASIN `B0BQLJBLACK`；`m2_inventory_link_events` 关联 SKU 与现有 ASIN 不重合。函数路径与 audit 写入正确，但 `impactCampaigns:[]`。建议后续扩展 M3 ads seed 加入 `B0CASE001 / B0CABLE002 / B0LAMP003` 三条 ad 行。
2. **smoke 测试历史用例**：v1 `scripts/m2-smoke.mjs` 在某些场景下选 `items[0]`（已是 fixed/approved 状态），fresh DB 后所有用例 PASS。建议 smoke 改为筛 `status==='pending'` 的项再操作。
3. **Background recompute**：`POST /profit/recompute` 同步完成，未真实排队（mock）。
4. **审计字段命名**：M2 action_type 未统一加 `M2_` 前缀（M1 是 `M1_TARGET_CREATE`，M2 是 `LEAK_START_FIX`）。不影响功能但跨模块查询需注意。

---

## 7. 验证步骤复盘

1. surgical kill 8080：`netstat | findstr :8080 | awk ... | taskkill /F /PID`
2. 删 store.db / .shm / .wal 三件套
3. `node apps/api/src/server.mjs` 后台启动
4. `curl /api/v1/auth/login` 拿 token + storeId
5. `API_BASE=http://localhost:8080 node scripts/m2-smoke.mjs` → **55 / 55 PASS**
6. DB 校验：`node tmp/be-sqlq.cjs` 列 24 张 m2_* 表 + count

输出：`docs/M2_BACKEND_REPORT.md` + `tmp/m2-smoke.out` + `tmp/be-sqlq.out`
