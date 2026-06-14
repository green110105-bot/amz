# 功能域辩论证据: M2 利润/库存/采购/调价/现金流/汇率/税务/LTV/告警

## 清单梳理

I have all the evidence needed. Here is the complete M2 domain inventory.

---

# M2 功能域逐页清单梳理（利润/库存/采购/调价/现金流/汇率/税务/LTV/告警）

## 总体架构结论（基于真实代码）

- **后端完全真实落库**：`apps/api/src/data-store-profit.mjs` 定义 24 张 SQLite 表 + 1 张 M4 占位表（`data-store-profit.mjs:57-552`），`PROFIT_TABLES_TO_CLEAN` 列出 24 张表（`:555-562`）。所有写操作经事务 + `appendAuditLog(sourceModule='M2')`。
- **HTTP 路由全量挂载**：`store-routes-profit.mjs` 前缀 `/api/v1/store/m2/*`，要求 Bearer + X-Store-Id（`:59-67`），16 个 API 分组共约 60 个端点。
- **前端全部走真实 API**：页面经 `composables/useM2State.js`（包裹 `api/m2.js` 的 16 个 apiGroup）调用，唯一例外是 **MultiStore.vue 用纯 mock**（`MultiStore.vue:7,12` `import { mockMultiStore }`）。
- **种子数据**：`seedProfitForUser` 用 mulberry32 确定性 PRNG 生成 412 单 × 14 项费用等（`data-store-profit.mjs:2315-2354`）。属 DB-seeded（非 mock），可被真实写操作覆盖。
- **路由分组（router/index.js:24-48）**：`m2-main`（工作台）/`m2-profit`/`m2-decisions`/`m2-enterprise` 四组。注意：**InventoryLink.vue 虽属 M2 逻辑但挂在 `/ads/inventory-link`（router:96，无分组）**；MultiStore 在 `m2-enterprise` 但为 mock。

---

## 一、主入口

### 1. M2ControlTower.vue — 经营利润工作台（`/m2/workbench`，router:26）
- **目的**：M2 收口主入口，聚合全域看板。
- **数据来源**：**hybrid 聚合（全真实 API）**——`load()` 用 `Promise.all` + `settle()` 容错并发拉取 15 个 M2 端点（`M2ControlTower.vue:88-148`，直接 import `api/m2`:5-18）。
- **Tab 结构（4 个 el-tab-pane，:320-421）**：
  - `actions` 今日必须处理（:321）
  - `profit` 利润雷达（:355）
  - `cash` 资金与采购（:386）
  - `tools` 高级工具（:411）
- **写入语义**：本页只读聚合；模板含 `mock/source 保留` 标签（:282）。无写操作。

---

## 二、利润组（m2-profit）

### 2. ProfitOverview.vue — 利润总览（`/profit/overview`，router:28）
- **目的**：按订单/SKU 看真实利润，区分暂估 vs 终值。
- **数据来源**：**真实 DB**。`useProfit().fetchOverview` → `profitApi.overview`（`useM2State.js:55-69`）→ 后端 `getProfitOverview`（`data-store-profit.mjs:826-875`，snapshot 优先否则按 ordered_at 滚动聚合）。订单列表走 `fetchOrders`(:106)。
- **写入/队列**：「重新计算」按钮 → `recompute` → `recomputeProfit`（`:877-921`），**真实写入** `m2_sku_profit_snapshots`（先 DELETE 再 INSERT），返回 `{queued:true, jobId, etaSeconds:1}` 的**伪队列语义**（同步执行后返回 queued 标记）。

### 3. ProfitSkus.vue — 单 SKU 利润（`/profit/skus`，router:29）
- **目的**：单 SKU 维度利润 + 14 项费用拆解。
- **数据来源**：**真实 DB**。`fetchSkus`→`profitApi.skus`→`listSkuProfit`（`data-store-profit.mjs:923+`，读 `m2_sku_profit_snapshots`）；瀑布 `fetchWaterfall`→`getSkuWaterfall`。
- **写入**：只读。

### 4. OrderProfit.vue — 单订单瀑布（`/profit/orders/sample`，router:30）
- **目的**：单订单费用瀑布图（14 项 cost_type）。
- **数据来源**：**真实 DB**。`fetchOrderDetail`→`profitApi.orderDetail`→`getOrderProfit`（读 `m2_orders`+`m2_order_costs`）。
- **写入**：只读（弹层/抽屉式详情）。

### 5. ProfitLeaks.vue — 漏点中心（`/profit/leaks`，router:31）
- **目的**：利润漏点检测 + 修复闭环。
- **数据来源**：**真实 DB**。`useLeaks().fetch`→`leaksApi.list`→`listLeaks`（读 `m2_leaks`）。
- **写入/队列**：**真实写入**。start-fix / mark-fixed / ignore 三个动作（`ProfitLeaks.vue:49`；后端 `startFixLeak/markFixedLeak/ignoreLeak`，路由 `store-routes-profit.mjs:169-189`）改 `m2_leaks.status` + 审计。乐观更新+回滚（`useM2State.js:208-248`）。

### 6. ProfitCashflow.vue — 现金流（`/profit/cashflow`，router:32）
- **目的**：90 天现金流时间线 + 预警。
- **数据来源**：**真实 DB**。`useProfit().fetchCashflow`→`profitApi.cashflow`+`cashflowAlerts`（`useM2State.js:129-144`）→ `getCashflowTimeline`/`getCashflowAlerts`（`data-store-profit.mjs:1187+`），读 `m2_cashflow_events`。
- **写入**：**真实写入**。`createCashflowEvent`→`addCashflowEvent`（`:1200`）INSERT `m2_cashflow_events`，返 201。含 localStorage 草稿（`ProfitCashflow.vue:43-51`）。

### 7. ScenarioSimulator.vue — 情景模拟器（`/profit/scenario`，router:33）
- **目的**：调价/成本变量的利润情景推演。
- **数据来源**：preview 为**纯计算无 DB**——`previewScenario(body)`（`data-store-profit.mjs:1229`）不带 db 参数，路由 `:194-197` 直接计算返回。历史走 `listScenarios`（真实 DB `m2_scenarios`）。
- **写入**：**真实写入**。`save`→`saveScenario` INSERT `m2_scenarios`（路由 `:198-202`，返 201）。

---

## 三、决策组（m2-decisions）

### 8. InventoryReorder.vue — 补货建议（`/inventory/reorder`，router:35）
- **目的**：补货紧急度 + 推荐数量 + 资金占用，生成 PO 草稿。
- **数据来源**：**真实 DB**。`useReorder().fetch`→`reorderApi.list`→`listReorders`（读 `m2_reorder_recommendations`，路由含字段重塑 `store-routes-profit.mjs:210-225`）。
- **写入/跨模块**：**真实写入 + 跨表联动**。createPO→`createPOFromReorder`（`data-store-profit.mjs:1289-1342`）：事务内 INSERT `m2_purchase_orders` + `m2_purchase_order_items`，并 UPDATE reorder.status='drafted'，写审计。dismiss→改 status='dismissed'（`:1344-1354`）。

### 9. SlowMovingDecision.vue — 滞销决策（`/inventory/slow-moving`，router:36）
- **目的**：滞销 SKU 的 A/B/C/D 处置方案（清仓/降价/调拨等）。
- **数据来源**：**真实 DB**。`useSlowMoving().fetch`→`listSlowMoving`（读 `m2_slow_moving_decisions`）。
- **写入/跨模块**：**真实写入 + M2→M1 真实写**。execute(A/B/C/D)→`executeSlowMoving`（`:1367-1405`）UPDATE status='executed'；**option=A 时真实写入 M1** `m1_listing_versions`(source='m2_reprice')经 `_writeM1ListingVersionFromM2`（`:1780-1837`），父子审计链。

### 10. RepricingDecision.vue — 跟价决策（`/repricing`，router:37）
- **目的**：竞品价对比 + 盈亏平衡价 + 弹性场景，应用调价。
- **数据来源**：**真实 DB**。`useRepricing().fetch`→`listRepricing`（读 `m2_repricing_recommendations`）；detail/trigger。
- **写入/跨模块**：**真实写入 + M2→M1 真实写**。apply→`applyRepricing`（`:1754-1777`）UPDATE status='applied' + 调 `_writeM1ListingVersionFromM2` **真实 INSERT** `m1_listing_versions`（标题 `[M2 调价]…`，`:1817-1830`），返回 `m1VersionId`，前端提示「已应用 → M1 version …」（`useM2State.js:698-699`）。trigger→`triggerRepricing` 真实 INSERT 建议。

### 11. PurchaseOrders.vue — 采购单（`/inventory/po`，router:38）
- **目的**：采购单全生命周期状态机（draft→ordered→in_transit→received）+ 付款。
- **数据来源**：**真实 DB**。`usePO().fetch/fetchDetail`→`listPOs/getPO`（读 `m2_purchase_orders`+items）。
- **写入/队列/跨表**：**真实写入 + 状态机 + 现金流/库存联动**。
  - create/update：真实 INSERT/UPDATE。
  - transition→`transitionPO`（`:1543-1618`）：校验 `VALID_TRANSITIONS`（非法跳转返 `invalid_transition` 400，前端提示「状态机不允许」`useM2State.js:550-551`）；**副作用真实写**：ordered 写定金 cashflow、in_transit 写尾款 cashflow、received 真实**入库** UPDATE/INSERT `m2_inventory_snapshots`。
  - payment→`payPO`（`:1620+`）UPDATE deposit_paid/balance_paid + INSERT 付款 cashflow。
  - 含 localStorage 草稿（`PurchaseOrders.vue:40-43`）。

### 12. Suppliers.vue — 供应商（`/inventory/suppliers`，router:39）
- **目的**：供应商档案 + 评分（准时率/次品率/价格稳定性）。
- **数据来源**：**真实 DB**。`useSuppliers().fetch`→`listSuppliers`（读 `m2_suppliers`，带缓存 `loaded`）。
- **写入**：**真实 CRUD**。create/update/remove（remove 为停用语义，`useM2State.js:639-650`；后端 `createSupplier/updateSupplier/deleteSupplier`）。草稿 localStorage（`Suppliers.vue:41-42`）。

### 13. InventoryTransfers.vue — 跨仓调拨（`/inventory/transfers`，router:40）
- **目的**：跨仓调拨建议（调拨成本 vs 重购成本 vs 节省）。
- **数据来源**：**真实 DB**。`useTransfers().fetch`→`listTransfers`（读 `m2_inventory_transfers`）。
- **写入**：**真实写入**。approve→`approveTransfer`（`:1417+`）/cancel→`cancelTransfer`，改 status + 审计，乐观更新回滚（`useM2State.js:435-465`）。

---

## 四、大卖/企业组（m2-enterprise）

### 14. MultiStore.vue — 多店铺合并（`/profit/multi-store`，router:42）
- **目的**：多店铺利润合并视图。
- **数据来源**：⚠️ **纯 mock**（唯一 mock 页）——`import { mockMultiStore } from '../utils/mock-data-extras'`，`data = ref({ ...mockMultiStore })`（`MultiStore.vue:7,12`）。**m2.js 无对应 API**。
- **写入**：无（无后端）。

### 15. Dimensions.vue — 多维度归集（`/profit/dimensions`，router:43）
- **目的**：按 brand/category 等维度归集利润。
- **数据来源**：**真实 DB**。`useDimensions().fetch(by)`→`dimensionsApi.aggregate`→`listDimensions`（`data-store-profit.mjs:2124+`，读 `m2_dimensions`，按 by 缓存 `useM2State.js:951-971`）。
- **写入**：**真实写入**。`dimensionsApi.update`→`updateDimension`（路由 `:500-505`）。

### 16. FxRisk.vue — 汇率管理（`/profit/fx`，router:44）
- **目的**：汇率敞口 + 走势 + 敏感度。
- **数据来源**：**真实 DB（部分硬编码建议）**。`useFx().fetch`→并发 `fxApi.exposures/rates/sensitivity`（`useM2State.js:735-756`）→ `getFxExposures`(读 `m2_fx_exposures`)/`getFxRates`(读 `m2_fx_rates`)/`getFxSensitivity`（`data-store-profit.mjs:1842-1867`）。注意 `recommendations` 为**硬编码字符串**（`:1849-1852`）。
- **写入**：只读（无 rate 写端点）。

### 17. PaymentChannels.vue — 跨境支付通道（`/costs/payment-channels`，router:45）
- **目的**：支付通道费率/月成本对比 + 主通道管理。
- **数据来源**：**真实 DB**。`usePaymentChannels().fetch`→`listPaymentChannels`（读 `m2_payment_channels`）。
- **写入**：**真实 CRUD**。create/update/remove；删主通道返 `cannot_delete_primary` 409（路由 `:411-416`，前端提示「不能删除主通道」`useM2State.js:822-823`）。草稿 localStorage。

### 18. TaxAssist.vue — VAT/销售税（`/tax`，router:46）
- **目的**：VAT/美国销售税摘要 + 申报记录 + nexus/阈值。
- **数据来源**：**真实 DB**。`useTax().fetch`→并发 `taxApi.summary/records`（`useM2State.js:980-997`）→ `getTaxSummary/listTaxRecords`（读 `m2_tax_records`）。
- **写入**：**真实写入**。file→`fileTaxRecord`（`:1979+`，路由 `:433-440`）改 status='filed' + filing_ref。

### 19. LTV.vue — LTV 复购视角（`/profit/ltv`，router:47）
- **目的**：SKU 复购率/LTV/CAC 盈亏平衡。
- **数据来源**：**真实 DB（只读）**。`useLTV().fetch`→`ltvApi.list`→`listLtv`（读 `m2_ltv_snapshots`，路由 `:445-447`，仅 1 个端点）。
- **写入**：无（纯只读）。

### 20. CustomAlerts.vue — 自定义报警（`/alerts/custom`，router:48）
- **目的**：自定义告警规则 + 触发事件流，推送 M4。
- **数据来源**：**真实 DB**。`useAlerts().fetchRules/fetchEvents`→读 `m2_alert_rules`/`m2_alert_events`。
- **写入/跨模块**：**真实写入 + M2→M4**。规则 CRUD（create/update/remove）；event ack→`ackAlertEvent`（`:2109-2119`）。**扫描** `scanAlerts`（`:2072-2108`，路由 `:482-485`）真实 INSERT `m2_alert_events`、UPDATE rule 计数、并 INSERT `m4_notifications`（M2→M4 推送，best-effort try/catch）。`conditions` JSON 解析（`CustomAlerts.vue:109`）。

---

## 五、附属（M2 逻辑但挂 M3 路由）

### 21. InventoryLink.vue — 库存联动（`/ads/inventory-link`，router:96，**无 group，不在 M2 侧栏**）
- **目的**：库存剩余天数阈值触发广告联动（停投/降预算/告警）。
- **数据来源**：**真实 DB**。`useInventoryLink().fetch`（`InventoryLink.vue:9,27`）→并发 `inventoryLinkApi.config/events`→`getInvLinkConfig`(读 `m2_inventory_link_config`)/`listInvLinkEvents`(读 `m2_inventory_link_events`)。
- **写入/跨模块（关键队列语义）**：
  - saveConfig→`updateInvLinkConfig` **真实 UPDATE** 阈值配置。
  - executeEvent→`executeInvLinkEvent`（`data-store-profit.mjs:2200-2304`）：UPDATE event.status='auto_executed' + 写审计 + INSERT `m4_notifications`（M2→M4）。
  - ⚠️ **M2→M3 不直接写，而是入动作队列**：对匹配的 lx_campaigns 调 `_enqueueManualAction`（`:2221-2282`），typedAction 标记 `dryRun:true`、`mode:'queued-not-written'`、`guardrail.status:'needs_review'`、reasons `['m2_inventory_m3_write_requires_action_queue']`。即**M3 侧为队列待审、非真实下发**。

---

## 跨模块写入语义汇总（真实代码证据）

| 联动 | 触发页 | 语义 | 证据 |
|---|---|---|---|
| M2→M1 调价落版本 | Repricing apply / SlowMoving option A | **真实写** `m1_listing_versions`(source='m2_reprice') | `data-store-profit.mjs:1767, 1392, 1817-1830` |
| M2→M3 库存停投/降预算 | InventoryLink execute | **队列待审（dryRun，未真实下发）** | `data-store-profit.mjs:2221-2282`（mode='queued-not-written'）|
| M2→M4 通知 | InventoryLink / scanAlerts | **真实写** `m4_notifications`(轻量占位表) | `:803-813, 2093-2099, 2295-2300` |
| M2 内部 PO→现金流/库存 | PurchaseOrders transition/payment | **真实写** `m2_cashflow_events` / `m2_inventory_snapshots` | `:1568-1607, 1628-1631` |
| 审计 | 所有写操作 | **真实写** `appendAuditLog(sourceModule='M2')` | 贯穿全文件 |

## 需要标注的非真实点
1. **MultiStore.vue 纯 mock**，无后端无 m2.js API（`MultiStore.vue:7,12`）。
2. **recomputeProfit 伪队列**：同步执行却返回 `{queued:true, etaSeconds:1}`（`:914-920`）。
3. **FxRisk recommendations 硬编码**字符串（`:1849-1852`）；FX 无写端点。
4. **scenarios.preview 无 DB 纯计算**（`previewScenario` 不接 db，`:1229`）。
5. **种子数据为确定性 PRNG 生成**（412 单等，`:2334`），非真实拉单，但落 DB 且可被真实写覆盖。
6. **InventoryLink 归属错位**：M2 逻辑但路由在 `/ads/inventory-link` 且无 m2 分组（router:96）。

相关文件（绝对路径）：
- `D:\amz\apps\api\src\data-store-profit.mjs`
- `D:\amz\apps\api\src\store-routes-profit.mjs`
- `D:\amz\apps\web-v2\src\api\m2.js`
- `D:\amz\apps\web-v2\src\composables\useM2State.js`
- `D:\amz\apps\web-v2\src\router\index.js`
- `D:\amz\apps\web-v2\src\pages\M2ControlTower.vue`、`MultiStore.vue`（mock）及上述 19 个 M2 页面

## 第 1 轮

## M2 利润/库存/采购/调价/现金流/汇率/税务 — 第 1/10 轮辩论记录

### 立靶（各角色开场主张）
- **产品经理A（增长/效率）**：M2 的核心是"帮卖家多赚钱、少花时间"，审查重心必须从 UI 细节转向"决策结论是否真实可执行"。开场即点名 3 处 P0 假动作：补货生成PO点不动、告警 scan 空转、重定价用随机数。立场宣言："再顺滑的滑块，喂的是 price=0 和随机弹性，也只是精致的废话。"
- **产品经理B（风险/合规/真实性）**：预设交锋靶——"有 appendAuditLog 就合规"是表面合规。`executeInvLinkEvent` 写 `INVENTORY_LINK_EXECUTE` 审计、把事件标成 `auto_executed`，但底层只 enqueue 了 `dryRun:true / needs_review` 占位，广告根本没停。审计齐全反而成了"伪装 real"的帮凶。
- **资深开发（契约/交互实现）**：立标尺——本域大量 camelCase || snake_case 双写兜底说明前后端契约从未被锁定，"双写兜底是契约未定的遮羞布，不是健壮性"。反对任何"功能已闭环"论断。
- **测试工程师（可验证性）**：把每条结论压成可断言的回归锚点（余额连续性不变量、`po_deposit` 计数=1、apply 低于保本价被拒、`overview('7d').orders===overview('90d').orders` 恒真）。预设反驳："若有人说这些是 mock/seed 不必修，请用断言反驳——它们在用户首次手动操作即触发，不依赖第三方数据。"

### 主持人代码核验（已逐条比对源码）
- **补货 id 断链（CONFIRMED P0）**：`store-routes-profit.mjs:210-224` 每行结构 `{productId, sku, reorder:{id,...}}`，真 id 嵌在 `reorder.id`，顶层无 `id`。`InventoryReorder.vue:72,99` 取 `row.id || row.productId` → 把 `productId` 当 reorderId 传入。`createPOFromReorder`（`data-store-profit.mjs:1290`）`WHERE id=?` 查 reorder 表 → 永远 `not_found` → 404。补货页两个主动作（生成PO/dismiss）双双点不动。`submitPO` 的 catch 静默（:93）。**四方指控全部坐实。**
- **scanAlerts 假触发（CONFIRMED P0/P1）**：`data-store-profit.mjs:2072-2107` 对每条 enabled 规则无条件 INSERT，`matched_value` 写死 `{value:'simulated_trigger'}`，**完全不读 `r.conditions`**，`last_triggered` 只写不读（:2089），**完全无视 cooldown_hours**。狼来了 + 无冷却重复刷事件。PM-A 与 PM-B 指控一致坐实。
- **executeInvLinkEvent 伪装 real（CONFIRMED P0）**：`data-store-profit.mjs:2200-2304` 对 stop_all/bid_reduce 只 `_enqueueManualAction({dryRun:true, guardrail.status:'needs_review', sourceMeta.mode:'queued-not-written'})`，从不真正 toggle/调预算，**却在 :2291 把事件 UPDATE 成 `status='auto_executed'`** 并写审计 + 推 P0/P1 M4 通知。PM-B 的核心论点（队列本身对、但 `auto_executed` 文案把"已入队"伪装成"已执行"）坐实。**注意：enqueue 到 ad_action_queue 本身符合"不绕过队列"安全不变量——问题纯在状态命名与 UI 反馈。**
- **applyRepricing 无保本护栏（CONFIRMED P0/P1）**：`:1758 newPrice = Number(body.price) || cur.recommended_price`——`price=0` 被 `||` 静默吞成推荐价；**无任何 `break_even_price` 比较**；`:1829 uploaded_to_amazon` 传 0（仅写 M1 草稿，不真改价）。PM-B、测试的指控坐实。
- **triggerRepricing 随机模型（CONFIRMED P0）**：`:1728-1735` `ourPrice=22.99+rng()*10`，margin 硬编 0.2/0.25/0.28，销量 380/320/260，弹性恒 1.2，`break_even=ourPrice*0.7`，"激进-10%"恒 `recommended:true`。与真实成本/弹性无关。
- **repricingApi.detail 死接口（CONFIRMED P1）**：`m2.js:119 detail=GET /repricing/${id}`，但 `store-routes-profit.mjs` 仅注册 list（:357）/trigger（:360）/`:id/apply`（:366），**无 GET `/:id`**。
- **现金流 addCashflowEvent 余额腐败（CONFIRMED P1）**：`:1205-1210` 仅取上一行 balance 计算自身，**不回算后续行**。插入历史日期一笔即让其后所有行 balance 失真，且无重算入口。测试的"余额连续性不变量"断言成立。
- **previewScenario 硬编模型（CONFIRMED P1/P2）**：`:1236` 佣金硬编 0.15、无 FBA/头程、`unitCost||price*0.45`、括号转负无 feasible 标记；改价时默认 COGS 随价格虚增。

### 交锋点
1. **"队列即护栏" vs "auto_executed 即伪装"**：PM-B 主动反驳"有审计有队列即合规"——核验支持 PM-B。enqueue dryRun 是对的（守住了 ad_action_queue 不变量），但 `status='auto_executed'` + P0 通知制造"已处置"虚假确定性。开发补强：状态机落库值与前端枚举对齐是契约问题。**主持裁定：队列正确，状态命名错误，二者不矛盾——必须改名为 `queued_pending_review`。**
2. **"demo 种子可接受" vs "首次操作即触发的真 bug"**：测试用"不依赖第三方数据、用户首次手动操作即触发"的断言，预先击穿"这是 mock 不必修"的辩护。主持核验：补货断链、余额腐败、apply 无护栏、scan 假触发均在纯本地操作触发，**不属于"无凭证占位"可豁免范围**——区别于税务/汇率的种子数字。
3. **契约统一 vs 多键兜底**：开发主张锁定后端 `{items}` envelope；PM 视角更关心结论真实性。无人正面反驳"兜底=健壮"，该靶留待后续轮由持兜底立场者应战。
4. **现金流双记账谁是唯一真相源**：PM-B、开发、测试三方独立命中 `transitionPO`（:1568-1589 写 po_deposit/po_balance）与 `payPO`（:1631-1637 同写）无幂等守卫 → 可双扣。三方一致，无人辩护，已具备共识基础。
5. **硬编费率先补数据源 vs 先标"估算"**：PM-A 主张补 `listSkuProfit` 字段（price/acos/volume/returnRate），PM-B/测试主张至少加免责标注。优先级未定，进 carryForward。

- 共识: 补货页主动作彻底断链（P0）：reorder 真 id 嵌在 row.reorder.id，前端用 row.id||row.productId 取值，后端 WHERE id=? 永远 not_found，生成PO 与 dismiss 双双点不动且 catch 静默——四角色一致认定为最高优先必修。; scanAlerts 是假动作（P0/P1）：无条件 INSERT、写死 simulated_trigger、完全不读 conditions、不判 cooldown——告警从决策工具降级为噪声制造机，PM-A/PM-B 一致定性。; executeInvLinkEvent 伪装 real（P0）：底层只 enqueue dryRun:true/needs_review 占位（正确守住 ad_action_queue 不变量），但事件被硬置 status='auto_executed' 并发 P0/P1 通知，制造'广告已停'的虚假确定性。; applyRepricing 无保本价护栏（P0/P1）：newPrice=Number(body.price)||recommended_price 会把 0 价静默吞成推荐价，且不校验 break_even_price，可一键调到亏损线下；uploaded_to_amazon=0 仅生成 M1 草稿但 UI 文案让人以为价格已生效。; triggerRepricing 三套场景价/销量/毛利率全由 mulberry32 随机数与魔法系数编出，与真实成本/弹性无关，'激进-10%'恒 recommended——拿假模型改真实价格。; 现金流双记账风险：transitionPO 与 payPO 两条路径都向 m2_cashflow_events 写 po_deposit/po_balance 出账，无去重/幂等/deposit_paid 守卫，可重复出账污染余额预测——PM-B/开发/测试三方独立命中。; repricingApi.detail（GET /repricing/:id）是埋着的死接口，后端从未注册该路由——开发与 PM-A 一致，需删前端或补后端。; 硬编/随机模型贯穿 previewScenario(佣金固定15%、unitCost=price*0.45)、getFxExposures(写死中文建议)、getFxSensitivity(纯线性乘法)、税务(全 seed 数字)——多角色一致认为不可作为真实决策依据。; 审计齐全不等于真实发生：appendAuditLog 记录的是'声称发生的动作'而非'真实发生的动作'，不能作为'功能已闭环'的证据。
- 分歧: mock 种子数据(税务 due/collected、汇率敞口建议、保本价)在无 provider-mode 横幅下被当权威数字呈现：是 demo 阶段可接受占位，还是上线即合规雷区？PM-B 倾向合规雷区需全局横幅；尚无角色给出'可接受'的正式辩护，需对齐 provider-mode 在 real 模式是否注入真实数据。; 契约治理路线：开发主张锁定后端统一 {items,total,cursor} envelope 并删除前端多键兜底；'兜底=健壮'的反方立场本轮无人正式持有，靶子悬空待后续轮应战。; 硬编费率(15%佣金等)修复顺序：先补 listSkuProfit 真实字段(PM-A) 还是先加'估算'免责标注降低误导(PM-B/测试)——工程优先级未定。; applyRepricing/executeSlowMoving 只写 M1 草稿(uploaded_to_amazon=0)从不真改价：是'故意的人工复核闸门'(安全设计) 还是'功能未实现却用 M1 联动话术包装成已生效'(误导)？取决于 UI 是否明确告知'仅生成草稿'，当前未告知，PM-B 倾向判误导。; 乐观更新边界：写操作后以本地乐观值还是服务端返回对象为准？PO transition/payment 出现乐观值与 fetchDetail 重取并存，开发主张'写成功一律以服务端对象覆盖'，需全域定规则。
- 决策: 补货 reorder id 断链统一裁定：全程改用 row.reorder?.id 作为写操作主键（不在路由层平铺，避免顶层 id/productId 语义混淆）；createPOFromReorder 返回键统一为 id；createPO 失败时回滚乐观状态并 ElMessage.error，禁止 catch{} 静默。; executeInvLinkEvent 事件落库状态禁止叫 auto_executed，改为 queued_pending_review；前端状态文案与颜色改为中性'已入队待 M3 审核'并展示 rollbackPlan.needsManualReview；M4 通知 severity 不得用 P0 暗示'已处置'。enqueue 到 ad_action_queue 的现有行为保留(符合安全不变量)。; applyRepricing 增加硬护栏：price<=0 或 < break_even_price 时返回 validation_error 或要求 confirmBelowBreakeven=true；前端对 margin<0 / 单件毛利为负的方案禁用'采用'按钮或升级为危险二次确认；确认弹窗文案明确'仅生成 M1 草稿，需到 M1 上架后才真实改价'。; scanAlerts 必须按 r.conditions 对真实指标(利润率/ACOS/库存天数)求值，并用 last_triggered+cooldown_hours 去重；前端 conditions 改为结构化条件构造器(指标+运算符+阈值)与后端可执行集合对齐；mock 模式下事件标 isSimulated:true。; 现金流出账唯一真相源裁定：只由 payPO 触发；transitionPO 不再自动记现金流，或对 (ref_id, source) 加唯一约束并在 payPO 入口拒绝已支付阶段。addCashflowEvent 必须用事务回算 event_date>= 该日期的所有后续行 balance。; repricingApi.detail 二选一并锁定：补后端 GET /repricing/:id 且切换 SKU 时拉 scenarios，或确认 list 即含 scenarios 并删除前端 detail() 死代码；为 current && !scenarios.length 增加空态。

## 第 2 轮

## M2 利润/库存/采购/调价/现金流/汇率/税务 — 第 2/10 轮辩论记录

本轮四角色逐行 Read 复核了第 1 轮的全部 P0 结论，并就成因、传导路径、定级做了多处精确化与互相反驳。整体特征：**结论方向高度一致，但成因与危害边界被多次修正**——这正是从"猜测"走向"可写回归断言"的关键一轮。

### 一、被四方独立坐实的 P0(成因已精确到行)

**1) 补货断链(InventoryReorder)** — 全员复核成立，且**成因被开发纠偏**：
- PM-A/PM-B 最初表述"后端 WHERE id=? 永远 not_found"。**开发反驳**：后端逻辑没错(store-routes-profit.mjs:226-229 透传 m[1]→createPOFromReorder WHERE id=?),断链 100% 在前端——`InventoryReorder.vue:72/99` 用 `row.id || row.productId`，而 reorder GET 响应(:214-223)顶层只有 productId/sku，真 id 藏在 `reorder.id`，故传入的恒为 productId → 必 not_found。
- 开发再补"双层 bug":`useM2State.js:341/354` 的 findIndex 同样用 `(d.id||d.productId)===id`，乐观更新连本地行都找不到。
- 开发同时修正"catch 静默"归属：composable 是 `throw e`(:345/357)，真正吞错的是 **page 的 `submitPO`/`dismiss` 空 `catch{}`(InventoryReorder.vue:93/101)**——修复点在 page 不在 composable。
- 测试给出可断言回归点：`POST create-po(productId) ⇒ 404`；`POST create-po(reorder.id) ⇒ 201`。

**2) 现金流双记账(transitionPO + payPO)** — 全员 P0，且**危害路径被两次修正**:
- 开发升级可达性:不是边角竞态而是**主流程必触发**——`PurchaseOrders.vue:277` "标记已付"按钮仅以 depositPaid 隐藏，而 transitionPO **不设 deposit_paid=1**(data-store-profit.mjs:1568-1578),按钮始终在 → 用户走"提交发出+标记已付"标准流程即双扣定金；payPO 守卫(:1626)永不短路。
- **PM-B 与测试联合反驳第 1 轮"双记账放大余额预测"的假设**:transition/payPO 插入行 balance 列恒 NULL(:1576/1587/1636),getCashflowTimeline(:1166)仅 `balance!=null` 才更新曲线 → **PO 出账根本不进余额曲线**。真实表现是两个相反方向的 bug 并存：**余额曲线低估(漏 PO 出账)+ outflow 高估(双计)**,且污染 addCashflowEvent 取"上一行 balance"基准。测试给出断言:`COUNT(*) WHERE source='po_deposit' AND ref_id=poId` 应=1,当前=2。

**3) executeInvLinkEvent 伪 auto_executed** — 全员 P0，安全不变量底层守住但 UI 撒谎:
- 三方确认:底层 `_enqueueManualAction` 全部 `dryRun:true`/`needs_review`/`mode='queued-not-written'`(:2231-2236),**未对广告做任何真实改动(正确守住 ad_action_queue 不变量)**;但事件硬置 `status='auto_executed'`(:2291)并发 P0/P1 M4 通知(:2296),制造"广告已停"的虚假确定性。
- 测试断言:execute 后 ad_action_queue 该项 `dryRun===true && status!=='executed'`,但 inventory_link_event.status==='auto_executed' → 两库状态不一致即失败点。

**4) scanAlerts 噪声制造器 + 前端不可达** — 全员 P0:
- 无条件 INSERT、matched_value 写死 `simulated_trigger`(:2086)、不读 r.conditions、不判 cooldown(:2072-2107)。
- 测试关键补强:**种子规则本身已带结构化条件**(:2700 `sku.margin<0.15` / :2701 `sku.days_cover<7`)与可比对快照,scan 却全部丢弃。可断言:(a)永不满足的规则 scan ⇒ created 应=0(当前=规则数);(b)cooldown 内二次 scan ⇒ created=0(当前恒+1)。
- 开发/PM-A/PM-B 共同确认前端不可达:`m2.js:21/165-176` alertsApi 无 scan 绑定,CustomAlerts.vue 无 scan 入口,后端 :482 路由虽在但"连假动作都点不到";conditions 是自由文本 textarea(:245-247)与后端零对齐。

**5) applyRepricing 0 价吞噬 + 无保本护栏** — 全员高危(PM-A/PM-B/测试判 P0,开发判 P1):
- `newPrice=Number(body.price)||recommended_price`(:1758):传 0 因 JS 短路静默吞成推荐价;不校验 break_even;`uploaded_to_amazon=0`(:1829)只生成 M1 草稿。
- scenarios 由 mulberry32 随机+魔法系数(:1728-1735),"激进-10%"恒 recommended。
- 测试断言:`POST apply(price=0)` 当前返回 recommended_price(false-positive 成功),应返回 0 或 validation_error;`apply(price<break_even)` 应被拒。

### 二、本轮新增/升级的发现

**6) TaxAssist 假 CSV 导出(PM-B 升 P0)**:`TaxAssist.vue:67` "标记申报"弹 `ElMessage.success('申报数据已导出 CSV（Avalara/TaxJar 兼容格式）')` 但**代码无任何导出动作**——"功能未实现却用成功提示伪装已完成"的最高级别误导。`:161` 把 seed 的 nexus 渲染为"已触线（需注册）"红牌,诱导运营做不必要税务注册。real 模式 shouldSeedMock=false 且全仓无 sync 写 m2_tax_records → real 恒空、mock 恒假数,皆无横幅。

**7) FX 假 AI 建议(PM-B P1)**:getFxExposures 返回写死中文建议(:1849-1852),`FxRisk.vue:132` 渲染在"AI 建议"标题下,虚假归因为 AI 生成;getFxSensitivity 纯线性乘法当权威。

**8) SlowMoving option A 结构性亏本甩卖 + 预览/执行脱节(PM-A/PM-B/开发/测试 P1)**:`oldPrice=inventory_value/inventory`(单件成本)→ `newPrice=0.7×成本`(:1384-1385),结构性低于成本甩卖,把"止损"做成"加速亏损"。开发补:**预览 opt 数(seed)与执行价(成本×0.7)不同源**,决策预览与实际执行脱节。

**9) recompute 假异步(测试明确反驳第 1 轮)**:**第 1 轮"前端判 res.overview 永远 undefined 不刷新且把 queued 当 done"为 FALSE**。recomputeProfit 实为**同步执行**(:877-920)后返回假 `{queued,jobId,etaSeconds:1}`,路由 `{...r,...ov}`(:114-115)合并 overview,前端 `await load()` 会刷新。真问题是:(1)返回体撒谎称 queued(无真实 job);(2)忽略 body.force;(3)`useM2State.js:74` 把整个响应塞进 `_overview` 污染形状,应只取 `res.overview`。PM-B/开发/测试一致降为 P2。

**10) recompute 硬编 lifecycle/days_cover(测试 P1)**:recompute 写死 `lifecycle='mature'`/`days_cover=30`(:909),使 ProfitSkus 生命周期/库存健康筛选(:932-934)在 recompute 后形同虚设——筛 'growth' 永远空表。测试断言:seed 后有 growth/mature(:2408),recompute 后查 lifecycle=growth ⇒ 0 行。

**11) overview orders 口径不一致(PM-B/测试 P2)**:快照路径 ordersCount 无 range cutoff(:842-844),overview('7d').orders===overview('90d').orders 恒真,与按 range 聚合的 revenue 口径打架。

**12) repricingApi.detail 死接口(各方降级共识)**:`m2.js:119`→GET /repricing/:id 无后端路由,但 RepricingDecision 全程用 list 内联 scenarios(rowToReprice:699),从不调 detail。开发反驳"补后端不划算":直接删 `m2.js:119`+`useM2State.js:684-691`。PM-A 提醒:detail() 是 composable 公共导出方法,必须删干净不能只删 RepricingDecision 引用。

**13) previewScenario 费率口径(开发/测试 P2)**:硬编佣金 0.15、unitCost fallback price*0.45(:1236/1240),缺 FBA/头程/仓储/资金成本等其余 cost_type(recompute 实拆 14 项:889-896),系统性高估利润;preview 不落库 vs save 存前端 result 可能漂移。

### 三、主要交锋点
- **成因之争(补货)**:"后端 WHERE id=? 错" vs 开发"后端对、前端取错主键+双层 bug+catch 归属在 page"——**开发胜,证据更硬**。
- **危害路径(双记账)**:第 1 轮"放大预测曲线" vs PM-B/测试"balance=NULL 不进曲线,实为余额低估+outflow 双计两个相反 bug"——**PM-B/测试胜**。
- **recompute 定性**:第 1 轮"不刷新/把 queued 当 done" vs 测试"同步完成却伪装 queued,会刷新"——**测试胜,降 P2**。
- **applyRepricing/SlowMoving 是安全闸门还是误导**:PM-B 维持"当前 UI 文案(RepricingDecision.vue:70 '将售价改为$X')未告知仅草稿+uploaded_to_amazon=0 → 判误导,加'仅草稿'文案后方可改判安全设计"。PM-A 同站误导方。**一致:UI 缺'仅草稿'告知即误导**。

- 共识: 补货断链(InventoryReorder)P0 成立且成因锁定:前端 InventoryReorder.vue:72/99 用 row.id||row.productId 取错主键(真 id 在 row.reorder.id),后端逻辑正确;page 的 submitPO/dismiss 空 catch{}(:93/101)静默吞 404;composable findIndex(useM2State.js:341/354)同样用错键。修复:全程改 row.reorder?.id + page catch 改 ElMessage.error 并回滚乐观态 + composable findIndex 同步改键。; 现金流双记账(transitionPO + payPO)P0,经标准 UI 流程必触发:transitionPO 写 po_deposit/po_balance 出账(:1568-1588)但不设 deposit_paid=1,payPO 守卫(:1626)永不短路,'提交发出+标记已付'即双扣。出账唯一真相源裁定只走 payPO,transitionPO 不再写现金流,并对 (ref_id,source) 加唯一约束兜底。; 现金流余额曲线 bug 重新界定为两个相反方向:transition/payPO 插入行 balance 列恒 NULL(:1576/1587/1636),getCashflowTimeline(:1166)仅 balance!=null 才更新曲线 → 余额曲线低估(漏 PO 出账)+ outflow 聚合高估(双计),并污染 addCashflowEvent 取基准。'放大预测曲线'的旧表述被修正。; executeInvLinkEvent P0:底层 _enqueueManualAction 全部 dryRun:true/needs_review,正确守住 ad_action_queue 安全不变量,但事件硬置 status='auto_executed'(:2291)并发 P0/P1 M4 通知(:2296)制造'广告已停'虚假确定性。修复:状态改 queued_pending_review,前端中性文案'已入队待 M3 审核'并展示 rollbackPlan.needsManualReview,通知 severity 降级,enqueue 行为保留。; scanAlerts P0:无条件 INSERT/写死 simulated_trigger/不读 conditions/不判 cooldown(:2072-2107),且种子规则已带结构化条件(:2700-2701)被丢弃;前端 m2.js 无 scan 绑定、CustomAlerts.vue 无入口、conditions 为自由文本 textarea,告警闭环前后端皆断。; applyRepricing 高危:newPrice=Number(body.price)||recommended_price(:1758)把 0 价静默吞成推荐价,不校验 break_even,uploaded_to_amazon=0 只生成 M1 草稿。修复:price<=0 或 <break_even 返回 validation_error 或要求 confirmBelowBreakeven=true;前端对负毛利方案禁用/危险二次确认。; M2→M1 联动(applyRepricing/executeSlowMoving)只写 uploaded_to_amazon=0 的草稿从不真改 Amazon 价,而 UI 文案(RepricingDecision.vue:70 '将售价改为$X'、SlowMoving:100 '已执行')无'仅草稿'字样即构成误导;补'仅生成 M1 草稿,需到 M1 上架才真实改价'文案后方可视为安全人工闸门。; SlowMoving option A 结构性亏本甩卖:oldPrice=inventory_value/inventory(单件成本)→newPrice=0.7×成本(:1384-1385),且预览 opt(seed)与执行价(成本×0.7)不同源。修复:oldPrice 改取真实售价,加 break_even 下限护栏,执行价与预览同源。; repricingApi.detail 是死接口(m2.js:119 调 GET /repricing/:id 无后端路由),RepricingDecision 全程用 list 内联 scenarios。共识:删 m2.js:119 + useM2State.js:684-691(含 composable 公共导出),无需补后端路由。; recompute 定性修正为 P2:它是同步执行(:877-920)却伪装返回 {queued,jobId,etaSeconds},前端实际会刷新(第 1 轮'不刷新'结论为 FALSE);残留问题是返回体撒谎、忽略 force、useM2State.js:74 把整个响应塞进 _overview 污染形状(应只取 res.overview)。; real 模式下 provider-mode shouldSeedMock=false 且全仓无 sync 写 m2_tax_records/m2_fx_*,即 tax/fx/repricing 三类页面 real 恒空、mock/hybrid 恒为假数,二者皆无演示横幅;TaxAssist '导出 CSV(Avalara/TaxJar 兼容)' 是纯 toast 无导出实现,属功能未实现却伪装已完成的误导。
- 分歧: applyRepricing 0 价吞噬+无保本护栏的定级:PM-A/PM-B/测试判 P0(直接动收入、可调到亏损线下),开发判 P1。需在下一轮统一定级。; 现金流双记账修复路线:开发主张'删 transitionPO 出账、唯一真相走 payPO'(最干净,但已建 seed 的 ordered 态 PO 将不再有定金出账行,需评估对 M2ControlTower 余额预测的回填影响) vs '保留两条路径+加 (ref_id,source) 唯一约束+deposit_paid 幂等守卫'(更兼容现有 seed/审计)。; addCashflowEvent 事务回算余额是否追溯重写历史 PO 行 balance(涉及历史数据迁移)还是只对新事件生效——未定。; 种子数据(税务 due/collected、汇率写死建议、breakEvenPrice、slow-moving opt)在无 provider-mode 横幅下当权威数字:PM-B 主张为上线合规雷区(必须全局横幅+禁用动作按钮),其他角色倾向 demo 占位可接受;直接决定 FxRisk/TaxAssist 是 P2 还是升 P1,且'real 模式动作按钮是否一律禁用'未对齐。; lifecycle/days_cover 硬编(:909)使 ProfitSkus 生命周期筛选失效:是数据正确性 P1 bug 还是 demo 可接受近似——取决于该筛选是否对外宣称为可用功能,需产品口径定调。; 契约 envelope 治理:是否锁定后端统一 {items,total,cursor} envelope 并一次性删掉 useM2State 所有多键兜底(:87/328/490/674/854);风险是 18 个端点同时改 envelope 的回归面 vs 现状继续容错。'兜底=健壮'反方本轮仍无人正式持有,靶子悬空。; scanAlerts 修复方向:'补前端扫描入口+真实条件求值'(纳入告警模块到本期范围)vs '直接删除接口避免假事件入库'。; recompute 的 {queued,jobId,etaSeconds} 是'契约谎言应改返回体'还是'为未来真异步留的占位骨架应补 job 轮询'——需架构负责人定方向。
- 决策: 补货断链(InventoryReorder)定为本域第一优先 P0 必修:前端全程改 row.reorder?.id 作写主键;page 的 submitPO/dismiss 空 catch{} 改为 ElMessage.error(e.message) 并回滚乐观态、禁止空 catch;composable findIndex 改按真 id 比对;按钮在 row.reorder?.id 缺失时 disabled。; 现金流出账唯一真相源裁定只由 payPO 触发,transitionPO 删除两段 cashflow INSERT;并对 (ref_id,source) 加唯一索引、payPO 入口判 deposit_paid/balance_paid 已置位则拒绝,作为兜底。(具体迁移/seed 回填方案下一轮敲定); executeInvLinkEvent 落库状态改 queued_pending_review,前端文案/颜色中性化'已入队待 M3 审核'并展示 rollbackPlan.needsManualReview,M4 通知 severity 降级且去掉'已触发/已停'完成暗示;enqueue dryRun:true 行为保留(守住 ad_action_queue 不变量)。; scanAlerts 必须按 r.conditions 对真实指标求值并以 last_triggered+cooldown_hours 去重,mock 模式事件标 isSimulated:true;若决定保留则补 m2.js scan 绑定+前端入口,否则删除接口——二选一下一轮敲定。; 所有 M2→M1 联动动作(applyRepricing/executeSlowMoving)的确认弹窗必须明确'仅生成 M1 草稿,需到 M1 上架后才真实改价',执行态文案不得用'已执行/已改价'完成话术。; applyRepricing 加护栏:price<=0 或 <break_even_price 返回 validation_error 或要求 confirmBelowBreakeven=true;前端对 margin<0/负毛利方案禁用'采用'或升级危险二次确认。; repricingApi.detail 死代码删除:删 m2.js:119 + useM2State.js:684-691(含 composable 公共导出方法),不补后端路由(已确认 list 内联 scenarios)。; recompute 降为 P2:修 useM2State.js:74 改为只取 res.overview(不再把整个响应塞进 _overview);返回体停止伪装 queued(改 {recomputed,count})或真异步化二选一,留待架构方向定夺。; tax/fx/repricing 等 real 模式无真实数据源的页面,上线前强制注入读 providerMode() 的全局'演示数据/未接入真实引擎'横幅;TaxAssist 的假 CSV 导出 toast 必须在导出未实现前移除或禁用按钮,fileTax 文案改'仅本地标记,未提交税局'。

## 第 3 轮

## M2 功能域 第 3/10 轮 辩论记录

### 主持人现场核验（已逐行确证 4 条关键证据，排除 false-positive 风险）
- **补货 reshape 坐实**：`store-routes-profit.mjs:214-223` 确把扁平行重包成 `{productId, sku, reorder:{id, urgency, recommendedQty, status, ...}}`，wire 上**无顶层 id、无顶层 status**。开发与测试对前两轮"真 id 在 store 层 rowToReorder.reorder.id"的归因更正成立——真相源是 ROUTE 层 reshape，store 层 rowToReorder 返回的是扁平对象。`createPOFromReorder` 端点(:226-232)用路径参数按 `WHERE id=?` 查，前端 `row.id||row.productId` 必落 productId → 100% 404。
- **现金流双记账坐实**：`transitionPO` 在 `to==='ordered'` 时无条件 INSERT `source='po_deposit'` outflow=deposit、balance=null(:1568-1577)；`payPO` phase=deposit 时**无任何 deposit_paid 幂等守卫**(:1626 直接 UPDATE deposit_paid=1)，再无条件 INSERT `source='po_${phase}'`(='po_deposit')、balance=null(:1631-1637)。同 ref_id、同 source、无唯一约束 → 标准 UI 流程双扣，且 payPO 自身重复调用也重复入账。开发"连守卫都不存在"的措辞修正属实。
- **applyRepricing 0 价吞噬坐实**：`:1758 newPrice=Number(body.price)||cur.recommended_price`，price=0 被静默替换为推荐价，全程不读 break_even_price。
- **scanAlerts 假事件机坐实**：`:2072-2107` 对每条 enabled 规则无条件 INSERT 一条事件，matched_value 写死 `simulated_trigger`，从不读 r.conditions、不判 cooldown/last_triggered，且按规则真实 severity 推 m4_notifications(:2093-2098)。该端点已在路由暴露(`store-routes-profit.mjs:482`)，可被直接 POST 触发灌假 P0/P1 进 M4。

### 各角色主张与交锋
- **产品经理A（增长/ROI 视角）**：火力转向"决策辅助/配置类"页面，论证它们 UI 完整但业务闭环断在最后一公里（负 ROI）。新证据：① ScenarioSimulator 前端自算 delta(`*0.20` 写死毛利, :103-105)丢弃后端权威 delta(`data-store-profit.mjs:1247`)，且 syncBaseline 不发 unitCost → 后端落回 `price*0.45`，造成"工厂成本随 Amazon 售价线性浮动"的经济学谬误，定 P1。② PaymentChannels 弹窗不采集 monthlyVolume、后端把 monthly_cost 当裸字段存(`:1895`)，多通道成本对比对真实数据完全失效，且 openCreate 不重置共享 draft + openEdit spread 整行 → 脏数据，定 P1。③ LTV/Dimensions 的 range/tab 是假控件，后端读冻结 seed 不接 range、不实时汇总(`listLtv:1994` / `listDimensions:2124`)，定 P2。④ 现金流跑道 KPI `future30/future90` 用 `balances[29]/balances[89]` 按**数组下标**取值，但 points 是按 DISTINCT event_date 的**稀疏点**，事件稀疏时 today/+30/+90 会塌缩成同一最终余额、日期含义错位，定 P1。
- **产品经理B（风险/合规/真实性视角）**：聚焦"对外撒谎"的合规雷区。① FxRisk 把两条写死字符串(`:1849-1852`)标题包装成"AI 建议"给锁汇/换通道指令，与真实敞口无关，fx_rates seed 还伪标 source='central_bank'。② TaxAssist 三个"导出 CSV"按钮是纯 toast 无文件生成，fileTax 仅本地置 status='filed' 却用绿色"已申报"渲染（伪装已向税局申报）；days_left seed 时固化不按当日重算(`:2669-2672`)。③ InventoryTransfers approveTransfer 零库存位移(`:1417-1427` 只翻 status，不动 on_hand），跨模块污染补货真值，空 catch 吞错。④ addCashflowEvent 因 PO 行 balance=NULL 回退 350000 魔数(`:1210`)、currency 默认 CNY 与 PO 行 USD 混币直加。**主张 FxRisk/TaxAssist 必须从 P2 升 P1（法律/合规风险面），强制注入演示横幅 + real 模式禁用动作按钮**。
- **资深开发（工程/契约视角）**：亲跑数据链，更正前两轮归因（真相源 ROUTE 层非 store 层），并补一条**此前漏报的伴生 P0**：route 输出无顶层 status，故 tag(`:165`)/按钮 disabled(`:170/175`)读 `row.status` 恒 undefined → 状态永显 pending、"生成 PO"按钮永不置灰可重复点、后端回 invalid_status 又被空 catch 吞。强调修复主键应用 `row.reorder.id`（**不要 `?.||productId` 兜底，顶层 id 压根不存在，兜底=继续踩坑**），且 composable findIndex(`:341/354`)也要改 `d.reorder?.id`。撤回上轮自己的 applyRepricing P1 立场，**上调至 P0** 与 PM/测试对齐。补：repricingApi.detail(`m2.js:119`)死接口、recompute 同步执行却返回伪 `{queued,jobId,etaSeconds}` 契约撒谎、useM2State 18+ 端点多键 envelope 兜底掩盖契约漂移、dismiss 软删 vs 前端 splice 硬删导致"忽略后又冒出"。
- **测试工程师（可验证性视角）**：把每条结论翻成可断言测试，专找 false-positive。确认补货归因需按真实 wire shape 重写否则"修复测试会过、线上仍坏"。修正"page catch{} 完全静默"的表述——composable 层(`:346/358`)已 ElMessage.error，page 又吞二次，修复时**勿弹两次 toast**。给出每条 bug 的具体断言（createPO 收到 path 参数===reorder.id 且 201；applyRepricing({price:0}) 期望 400；同规则 cooldown 内二次 scan created===0；单 PO 走 ordered+payPO 后 po_deposit 行 COUNT===1）。新增主张：必须把 `store-routes-profit.mjs:214` 嵌套 reorder shape 纳入**快照/契约测试**，防止有人把路由改回扁平 shape 而前端改回 row.id 又"绿着坏"。补一条 executeInvLinkEvent：底层 _enqueueManualAction 全 dryRun:true（守住 ad_action_queue 不变量，正确），但事件硬置 status='auto_executed' 并发 P0/P1 通知制造"广告已停"虚假确定性 → 状态应改 queued_pending_review。

### 主要交锋点
1. **applyRepricing 定级**：开发上轮持 P1，本轮**撤回并上调 P0**；PM-A/PM-B/测试一致 P0。四方收口 P0。
2. **FxRisk/TaxAssist 定级**：PM-B 力主升 P1（合规/法律面，强制横幅 + real 禁用动作）；其他角色倾向 P2 demo 占位。PM-B 反驳"中性占位"说——FxRisk 冒充 AI 给金融对冲指令、TaxAssist 伪装税局申报完成 + 撒谎导出 toast，是法律风险面。未收口。
3. **scanAlerts 处置时序**：PM-B/测试主张"先删 /alerts/scan 路由止血（零回归，前端本无调用）+ 告警模块另行排期"两步法；开发/PM-A 倾向纳入本期做真实求值+结构化构造器。测试指出删接口是最低回归路径。
4. **现金流双记账修复路线**：开发主张"删 transitionPO 出账 + payPO 幂等短路 + (ref_id,source) 唯一索引"三件套；反方"保留两路径仅加唯一约束"对 seed ordered 态 PO 更兼容。路线直接决定回归测试形态（COUNT===1 vs already_paid），且涉及历史 seed 黄金值重新基线化，未定。

- 共识: 补货闭环 P0 全四方坐实：路由层 store-routes-profit.mjs:214-223 把行 reshape 成 {productId,sku,reorder:{id,status,...}}，wire 上无顶层 id/status；前端 InventoryReorder.vue:72/99 的 row.id||row.productId 必取 productId → create-po/dismiss 端点(按 WHERE id=? 查)100% 404。修复主键须用 row.reorder.id，禁止 ?.||productId 兜底（顶层 id 不存在，兜底会复发）。; 补货伴生 P0（此前漏报）成立：route 无顶层 status，模板 :165/170/175 读 row.status 恒 undefined → 状态 tag 永显 pending、生成 PO 按钮永不置灰可重复点击、后端回 invalid_status 被空 catch 吞。须与主键修复合并为 reorder.* 命名空间全量对齐批次，并补前端契约/快照测试锁定嵌套 shape。; 现金流双记账 P0 坐实：transitionPO(:1568-1577 ordered→po_deposit 出账) 与 payPO(:1631-1637 phase=deposit→po_${phase} 出账，:1626 无 deposit_paid 幂等守卫) 同 ref_id 同 source 无唯一约束，标准 UI 流程双扣，payPO 自身重复调用亦重复入账。; 现金流 balance 列恒 NULL（PO 行 :1576/1587/1636 写 null）+ getCashflowTimeline 仅 balance!=null 才更新曲线(:1166) → 余额曲线漏 PO 出账（余额高估/乐观）；同时双计使 outflow 聚合高估；两方向错误叠加，现金流页数字不可信。addCashflowEvent 因 NULL 回退 350000 魔数(:1210) 致手工事件基准余额也伪造。; applyRepricing 0 价吞噬 + 无保本护栏定级 P0（开发已撤回 P1、与 PM/测试对齐）：:1758 Number(body.price)||recommended_price，price=0 被静默替换，从不校验 break_even_price，可把售价采用到保本线下，直接动收入字段并联动 M1。须后端 price<=0 或 <breakEvenPrice 返回 validation_error（除非 confirmBelowBreakeven===true），前端对负毛利方案禁用/危险二次确认，弹窗文案改'仅生成 M1 草稿、需到 M1 上架才真实改价'。; executeSlowMoving option A 结构性亏本甩卖坐实：oldPrice 取 inventory_value/inventory=单件成本(:1384)、newPrice=成本×0.7(:1385)，无 break_even 下限，且预览价与执行价不同源；执行态'已执行'话术误导（实际仅生成 uploaded_to_amazon=0 的 M1 草稿）。; scanAlerts(:2072-2107) 是净负价值的假事件机：无条件 INSERT、写死 simulated_trigger、不读 conditions、不判 cooldown，且按真实 severity 推 m4_notifications，端点已在 store-routes-profit.mjs:482 暴露可被直接 POST 触发灌假 P0/P1 进 M4，比'没有告警'更糟。CustomAlerts 的 conditions 自由文本 textarea + JSON.parse 静默吞失败(:109) 是产品可用性底线问题。; ScenarioSimulator/previewScenario 成本口径与 listSkuProfit 14 项 cost_type 无法对账：前端自算 delta 用写死 20% 毛利(:103-105) 丢弃后端权威 delta、syncBaseline 不发 unitCost 致后端落回 price*0.45（成本随售价线性浮动的经济学谬误）、副标题'后端实时计算'与实际写死系数矛盾。属明确 bug，非单纯口径分歧。; executeInvLinkEvent 底层 _enqueueManualAction 全 dryRun:true/needs_review 守住了 ad_action_queue 不变量（安全，正确），应锁成回归断言；但事件硬置 status='auto_executed' 并发 P0/P1 通知制造'广告已停'虚假确定性，状态应改 queued_pending_review。; useM2State 全域问题：18+ 端点多键 envelope 兜底掩盖契约漂移（真实 envelope 确定：reorder→{decisions}/slow→{items}/transfers→{transfers}/po→{pos}）；dismiss 后端软删 status='dismissed' 但前端 splice 硬删致刷新后状态回跳。repricingApi.detail(m2.js:119) 与 useM2State.js:684-691 是死代码应删；recompute 同步执行却返回伪 {queued,jobId,etaSeconds} 契约撒谎，useM2State.js:74 整响应塞 _overview 污染形状。
- 分歧: FxRisk'AI 建议'(:1849-1852 写死字符串) + TaxAssist'申报状态/CSV 导出'(纯 toast、伪装税局已申报) 定级：PM-B 主张升 P1（法律/合规风险面，强制 providerMode 演示横幅 + real 模式一律禁用动作按钮），开发/PM-A/测试倾向 P2 demo 占位。需产品+法务口径裁定 real 模式是否硬禁用动作按钮。; scanAlerts 处置时序：PM-B/测试主张'先删 /alerts/scan 路由止血（零回归，前端本无调用）+ 告警模块另行排期纳入本期'两步法；开发/PM-A 倾向直接纳入本期做真实条件求值+结构化构造器+scan 入口+通知派发。范围/工期未拍板。; 现金流双记账修复路线：开发主张'删 transitionPO 两段出账 INSERT + payPO 幂等短路 + (ref_id,source) 唯一索引'三件套（最干净、防 payPO 自重复）；反方主张'保留两路径仅加唯一约束'对已建 seed 的 ordered 态 PO 更兼容。路线决定回归测试形态（COUNT===1 vs already_paid），不可互换。; 余额列回算策略：历史 PO 行 balance=NULL 是追溯重写（数据迁移、需重新基线化 M2ControlTower 预测黄金值）vs 前端改为按 inflow/outflow 增量推导余额绕开历史迁移、放弃 balance 列作真相源。未定，需架构确认。; LTV/Dimensions/FxRisk/TaxAssist 这类'冻结 seed + 假控件（range/tab 切换无效）'统一定级：demo 占位可接受 vs 上线合规雷区（升 P1 + 强制 providerMode 演示横幅 + real 模式动作按钮一律禁用）。取决于 real 模式是否有真实 tax/fx/ltv 重算/数据注入计划。; PaymentChannels monthly_cost 应由后端 fee_pct*monthlyVolume+fee_fixed*txCount 计算（PM-A 立场，决定该页是真功能）vs 维持裸字段存储（仅展示壳）；以及 draft 共享污染（openEdit spread 整行 + openCreate 不重置）是否升级为全域'编辑/新建草稿隔离'规则。; 契约 envelope 治理范围与节奏：一次性锁定 18 端点统一 envelope + 删全部多键兜底（回归面大）vs 分批；软删 vs 硬删前端统一表现（以服务端返回对象覆盖 status vs splice）的最终裁定；乐观更新全域规则（成功一律以服务端返回对象覆盖、废弃乐观值）是否纳入本期硬约束。
- 决策: 补货 reorder.* 命名空间全量对齐定为 P0 单一批次：前端 InventoryReorder.vue 主键统一改 row.reorder.id（禁止 ?.||productId 兜底）、状态读路径统一改 row.reorder.status（tag + 按钮 :disabled）、composable useM2State.js:341/354 findIndex 改 (d.reorder?.id)===id 且乐观态写 d.reorder.status；空 catch 改回滚乐观态，注意 composable 已弹 error、page 勿二次弹 toast。验收硬约束：新增契约/快照测试锁定 store-routes-profit.mjs:214 嵌套 reorder shape + e2e 断言 createPO 收到 path 参数===reorder.id 且响应 201（非 404）。; applyRepricing 终裁 P0（开发撤回 P1，四方收口）：直接动收入且可调至亏损线下，符合'造成真实损失'判据。后端加 Number.isFinite + price<=0/<breakEvenPrice 返回 validation_error（除非 confirmBelowBreakeven===true），前端对 margin<0/unitProfit<0 方案禁用'采用'或升级危险二次确认，弹窗文案明确'仅生成 M1 草稿、需到 M1 上架才真实改价'。可断言：applyRepricing({price:0}) 期望 400，applyRepricing({price:breakEven-1}) 期望 400 除非 confirm=true。; executeSlowMoving option A 纳入 repricing/亏损护栏同批 P0：oldPrice 改取真实售价字段、加 break_even 下限护栏、执行价与预览同源（共用计算函数），执行态文案去掉'已执行'改'已生成 M1 降价草稿、待 M1 上架生效'。; executeInvLinkEvent 的 dryRun:true/queued-not-written 锁成安全回归断言（不得未来误改成真写 ad_action_queue）；同时把事件 status 由 auto_executed 改为 queued_pending_review、通知 severity 降级去掉完成暗示。; 死代码清理本期执行：删 repricingApi.detail(m2.js:119) + useM2State.js:684-691（已确认 list 内联 scenarios，不补后端路由）；recompute 返回体改 {recomputed,count} 停止伪装异步，useM2State.js:74 改只取 res.overview。; ScenarioSimulator/previewScenario 作为明确 bug 处理（非口径分歧）：前端删除 0.20 魔数自算 delta、消费后端权威 r.delta，baseline 须带该 SKU 真实 unitCost（从 listSkuProfit 取），preview 与 save 共用同一 computeUnitProfit；接全成本前先在 UI 标注'估算-未含 FBA/头程/资金成本，与利润页可能不符'并改副标题。; 确立全域规则待批准草案（carryForward 跟踪）：(a) 前端禁止自算决策数字，决策口径来自单一后端计算源；(b) 编辑/新建草稿隔离——openCreate 必先重置 draft 为默认、openEdit 仅挑白名单字段、禁止把 id/计算列写进持久化 draft；(c) 乐观更新成功后一律以服务端返回对象覆盖、废弃乐观值，软删不 splice 而是覆盖 status 并依赖列表 filter。; 安全不变量重申：真实 Amazon 无凭证时不得伪装 real（FxRisk/TaxAssist/LTV/Dimensions 等无真实数据源页面须按 carryForward 裁定结果注入 providerMode 演示横幅、real 空态用 EmptyState 而非 0 值 KPI）；不得绕过 ad_action_queue（executeInvLinkEvent 必须保持 dryRun:true/needs_review）。
