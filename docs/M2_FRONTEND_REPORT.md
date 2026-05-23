# M2 利润 / 库存 / 财务模块 — 前端 Self-Check 报告

**日期**：2026-05-16
**Phase**：`p2-fe-selfcheck`
**范围**：1 API client + 1 composable 单例 + 19 页面改造
**目标**：将老 M2 mock 数据全部替换为 `m2.js` + `useM2State.js`，对接后端 SQLite 真接口

---

## 1. 完成清单

### 1.1 新建文件（2 个核心 + 复用 1 个）

| 路径 | 行数 | 角色 |
|---|---|---|
| `apps/web-v2/src/api/m2.js` | 220 | 16 namespace / ~56 endpoints |
| `apps/web-v2/src/composables/useM2State.js` | 1105 | 16 composable（每模块一个） |
| `apps/web-v2/src/composables/useNotificationsBus.js` | 175 | 跨模块复用（M2 可调 `pushLocal()` 触发铃铛事件） |

### 1.2 改造 19 页面（每个都 `import` `useM2State` 中的对应 hook）

| # | 页面 | LOC | 改造摘要 |
|---|------|-----|---------|
| 1 | `ProfitOverview.vue` | 163 | `useProfit().fetchOverview` |
| 2 | `ProfitSkus.vue` | 163 | `useProfit().fetchSkus / waterfall` |
| 3 | `ProfitCashflow.vue` | 265 | `useProfit().fetchCashflow / alerts / createEvent` |
| 4 | `ProfitLeaks.vue` | 116 | `useLeaks()` |
| 5 | `OrderProfit.vue` | 133 | `useProfit().fetchOrders / fetchOrderDetail` |
| 6 | `ScenarioSimulator.vue` | 237 | `useScenarios()` + `useProfit()` (基线) |
| 7 | `InventoryReorder.vue` | 195 | `useReorder()` + `useSuppliers()` |
| 8 | `SlowMovingDecision.vue` | 128 | `useSlowMoving()` |
| 9 | `InventoryTransfers.vue` | 119 | `useTransfers()` |
| 10 | `PurchaseOrders.vue` | 304 | `usePO()` + `useSuppliers()` 五态流转 |
| 11 | `Suppliers.vue` | 205 | `useSuppliers()` 全 CRUD |
| 12 | `RepricingDecision.vue` | 137 | `useRepricing()` trigger / apply |
| 13 | `FxRisk.vue` | 135 | `useFx()` exposures + rates + sensitivity |
| 14 | `PaymentChannels.vue` | 158 | `usePaymentChannels()` CRUD |
| 15 | `TaxAssist.vue` | 164 | `useTax()` summary + records + file |
| 16 | `LTV.vue` | 92 | `useLTV()` |
| 17 | `CustomAlerts.vue` | 257 | `useAlerts()` rules + events |
| 18 | `Dimensions.vue` | 76 | `useDimensions()` aggregate + update |
| 19 | `InventoryLink.vue` | 193 | `useInventoryLink()` config + events + execute |

**19 页面 LOC 合计：3240**

---

## 2. API 契约（`src/api/m2.js`）

16 个命名空间，约 56 endpoints，全部走 `http`（client.js 自动注入 Bearer + X-Store-Id）。基础路径 `/api/v1/store/m2`。

| Namespace | 端点数 | 主要方法 |
|-----------|--------|---------|
| `profitApi` | 10 | overview / recompute / skus / waterfall / orders / orderDetail / cashflow / cashflowAlerts / createCashflowEvent |
| `leaksApi` | 4 | list / startFix / markFixed / ignore |
| `scenariosApi` | 3 | preview / save / list |
| `reorderApi` | 3 | list / createPO / dismiss |
| `slowMovingApi` | 2 | list / execute |
| `transfersApi` | 3 | list / approve / cancel |
| `poApi` | 6 | list / detail / create / update / transition / payment |
| `suppliersApi` | 5 | list / detail / create / update / remove |
| `repricingApi` | 4 | list / detail / trigger / apply |
| `fxApi` | 3 | exposures / rates / sensitivity |
| `paymentChannelsApi` | 4 | list / create / update / remove |
| `taxApi` | 3 | summary / records / file |
| `ltvApi` | 1 | list |
| `alertsApi` | 6 | rules.{list,create,update,remove} + events.{list,ack} |
| `dimensionsApi` | 2 | aggregate / update |
| `inventoryLinkApi` | 4 | config / saveConfig / events / execute |
| **合计** | **~63** | — |

---

## 3. Composable 清单（`src/composables/useM2State.js`）

16 个 composable，单例模块作用域 ref + 单飞 promise + 乐观更新 + 失败回滚，与 M1/M3 模式一致：

```
useProfit           （1105 中第 54 行）
useLeaks            186
useScenarios        269
useReorder          323
useSlowMoving       378
useTransfers        420
usePO               483
useSuppliers        590
useRepricing        667
useFx               733
usePaymentChannels  769
useAlerts           847
useDimensions       951
useTax              978
useLTV              1025
useInventoryLink    1053
```

错误码识别（spec §6）：`profit_recompute_in_progress` / `scoring_not_applicable` / `cashflow_balance_negative` / `po_state_invalid` / `supplier_in_use` 等通过 composable 内 try/catch + ElMessage.error 提示。

---

## 4. 19 页面改造状态

| 状态 | 数量 | 页面 |
|------|------|------|
| **done** | 19 | 全部（见 §1.2） |
| partial | 0 | — |
| blocked | 0 | — |

import 检查（grep `useM2State`）：19/19 均含 `import { useXxx } from '../composables/useM2State'`。

---

## 5. Build 结果

```
npm --prefix apps/web-v2 run build
✓ built in 7.58s
exit=0
```

M2 关键 chunk（dist/assets/）：

| chunk | 大小 |
|-------|------|
| `useM2State-S7xVe4k4.js` | 19.69 kB (gzip 5.22) |
| `ProfitOverview-W5GZ081K.js` | (chunk 存在) |
| `ProfitSkus-Dz6LXFPT.js` | 6.29 kB |
| `ProfitCashflow-C8yWsg0c.js` | 8.87 kB |
| `ProfitLeaks-Bhmq-GWG.js` | — |
| `OrderProfit-BJLFW6N8.js` | — |
| `ScenarioSimulator-B1lwufeA.js` | 8.35 kB |
| `InventoryReorder-C5Re0_Cj.js` | 7.03 kB |
| `SlowMovingDecision-ChSMAzKv.js` | — |
| `InventoryTransfers-DF3Pagkb.js` | — |
| `PurchaseOrders-spfCMNOM.js` | 12.00 kB |
| `Suppliers-PqaOKABC.js` | 7.22 kB |
| `RepricingDecision-CKY1pp0g.js` | 6.95 kB |
| `FxRisk-CbzaWJbv.js` | — |
| `PaymentChannels-CKlWWV3b.js` | 6.47 kB |
| `TaxAssist-DXPcwsAx.js` | 7.05 kB |
| `LTV-DI28NQ9Q.js` | — |
| `CustomAlerts-GP56gzt0.js` | 9.33 kB |
| `Dimensions-CFYAjQEg.js` | — |
| `InventoryLink-CTKTc49n.js` | 7.25 kB |

全部 19 个 M2 页面均 emit 独立 chunk。无 build error；只有标准 "chunk > 500 kB" warning（来自 index.js 主包 1256 kB，与 ECharts 等共享依赖相关，预期）。

---

## 6. 静态校验

### 6.1 mock-data 残留（19 页面）

```bash
grep -E "from.*mock-data|mockData\\s*=|const \\w*[Mm]ock\\w*\\s*=" \
     apps/web-v2/src/pages/{19 个 M2 页面}.vue
# 输出：（空）
```

**所有 19 页面 0 mock-data 残留**，全部走 `useM2State` + `m2.js` 真接口。

### 6.2 import 一致性

| 页面 | composable / api 引用 |
|------|----------------------|
| 19 / 19 | 均含 `from '../composables/useM2State'` |
| 0 / 19 | 直接 import `api/m2`（保持 spec：业务层只接触 composable，不直撕 API） |

### 6.3 后端接口存活（由 p1-be-selfcheck 验证）

本 phase 不调后端。`useM2State` 内 try/catch 对 404 / Network 走 `ElMessage.error` 降噪，UI 不崩。

---

## 7. 已知问题 / 与 SPEC 偏差

无功能性偏差。

- 后端 endpoints 完整性由 `p1-be-selfcheck` 报告确认；本 phase 仅校验前端契约一致性。
- `useM2State` 没有 export `unwrap`；如后端 envelope 形状变动需调 composable 内部 mapper。
- `inventoryLinkApi.events` 当前 polling 走业务页 setInterval（5s），可视后端长连接到位后切 SSE。
- `LTV` 接口仅 list 一项，等下一版补 cohort / breakdown（spec §4.13 已留位）。

---

## 8. 验收 checklist

- [x] `npm run build` PASS（exit=0, 7.58s）
- [x] 19 M2 页面均 import `useM2State`
- [x] 19 M2 页面 0 mock-data 残留
- [x] `m2.js` 16 namespace × 56+ endpoints 全部到位
- [x] `useM2State.js` 16 composable 全部到位
- [x] surgical kill 5173-5180（未误伤 8080）
- [x] 哨兵 STARTED / HEARTBEAT 已写
