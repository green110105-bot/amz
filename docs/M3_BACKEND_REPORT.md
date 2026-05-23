# M3 广告模块后端实施报告

**日期**：2026-05-14
**实施者**：后端 dev (Claude Opus 4.7)
**目标**：从前端 mock 重构为 SQLite 持久化 + 真 API

---

## 1. 完成清单

### 1.1 17 张新表（全部建立索引）
| # | 表名 | 索引 | 备注 |
|---|---|---|---|
| 1 | `ad_strategies` | (user_id,store_id) + (user_id,store_id,category) | 83 条种子 |
| 2 | `ad_suggestions` | (user_id,store_id) + (user_id,store_id,state) | 8 条种子 |
| 3 | `ad_manual_changes` | (user_id,store_id) + (user_id,store_id,state) | 4 条种子 |
| 4 | `lx_portfolios` | (user_id,store_id) | 5 条种子 |
| 5 | `lx_campaigns` | (user_id,store_id) + (..,portfolio_id) | 16 条种子 |
| 6 | `lx_ad_groups` | (user_id,store_id) + (..,campaign_id) | 4 条种子 |
| 7 | `lx_ads` | (user_id,store_id) + (..,ad_group_id) | 2 条种子 |
| 8 | `lx_targetings` | (user_id,store_id) + (..,campaign_id) + (..,ad_group_id) | 7 条种子 |
| 9 | `lx_negatives` | (user_id,store_id) + (..,campaign_id) | 4 条种子 |
| 10 | `lx_user_search_terms` | (user_id,store_id) + (..,campaign_id) | 6 条种子 |
| 11 | `lx_operation_logs` | (user_id,store_id,time DESC) + (..,campaign_id,time DESC) | 7 条种子 |
| 12 | `lx_daily_data` | (user_id,store_id) + (..,campaign_id,date) | 14 条种子 |
| 13 | `lx_kw_grabbing` | (user_id,store_id) | 3 条种子 |
| 14 | `lx_placements` | (user_id,store_id) + (..,campaign_id) | 20 条种子（5 cmp × 4 行） |
| 15 | `lx_amc_audiences` | (user_id,store_id) | 3 条种子 |
| 16 | `sqp_queries` | (user_id,store_id) | 28 条种子 |
| 17 | `search_term_reports` | (user_id,store_id) | 28 条种子 |

### 1.2 已实现的 endpoints（P0 全部，P1/P2 大部分）
**P0 策略 / 建议 / 外部更改**
- `GET/POST /api/v1/store/ads/strategies`、`GET/PUT/DELETE /strategies/:id`、`POST /strategies/:id/toggle`、`POST /strategies/:id/bind`
- `GET /api/v1/store/ads/suggestions`、`GET /suggestions/:id`、`POST /suggestions/:id/accept|reject|revert`
- `GET /api/v1/store/ads/manual-changes`、`POST /manual-changes/:id/apply-alternative|ignore`

**P0 LX 实体**
- `lx/portfolios` 全套（含 toggle/budget）
- `lx/campaigns` 全套（含 toggle/budget/bid-strategy）
- `lx/ad-groups` 全套（含 bid）
- `lx/targetings` 全套（含 bid/toggle/bulk-bid）
- `lx/negatives` 全套
- `lx/user-search-terms` GET + promote + negate
- `lx/op-log` GET、`lx/daily` GET

**P1（额外实现）**
- `lx/ads` 全套（含 toggle）
- `lx/kw-grabbing` 全套（含 apply-bid）
- `lx/placements` GET/PUT
- `lx/amc-audiences` 全套
- `reports/search-terms` GET + promote + negate
- `reports/campaigns` GET
- `sqp` GET + `/sqp/take-action`
- `lx/bulk-create-campaigns`、`lx/bulk-import`（JSON 行，CSV 解析未实现）

### 1.3 修改的现有文件
- `data-store.mjs` — `import { initAdsSchema, seedAdsForUser, ADS_TABLES_TO_CLEAN }`；`initSchema()` 末尾调 `initAdsSchema(db)`；`seedSampleStoreData()` 末尾调 `seedAdsForUser(db, userId, storeId)`；`removeUserStore()` tx 中循环清 17 张新表；新增 `getDbInstance()` export 供 routes 共享同一连接（避免 SQLITE_BUSY）。
- `extended-routes.mjs` — import `handleAdsRequest` 并在 `/api/v1/auth/` 分支之前做 `if (pathname.startsWith('/api/v1/store/ads/')) {...}` 优先派发。

---

## 2. 跳过清单 + 原因

| 项目 | 原因 |
|---|---|
| `lx/bulk-import` CSV 解析 | 当前接受 JSON `{ type, rows }`；CSV 解析需要 multipart formdata 解析器，可单独追加 |
| 真正的 FOREIGN KEY 约束 | 表间用普通字段引用，未加 FK；删除联动靠 `removeUserStore()` 显式清表 |
| 种子数据中部分 `recentSuggestions` 含 `Math.random()` 时间戳 | 已在模块初始化时用 mulberry32 seeded PRNG 固定，跨重启可复现 |
| AI 评估管道（自动检测外部更改、生成 AI verdict） | spec 5.3 描述的"自动检测"管道未实现；当前 `updateCampaignBudget` 内同步插入一条 pending manual_change 作为 placeholder |
| URL query / localStorage 草稿（spec §6 跨刷新一致） | 前端任务，本次后端不动 |
| 24 个 Vue 文件改造 | 前端任务，明确排除（"不要触碰 frontend"） |

---

## 3. 10 个 Smoke Test 结果

服务器：`http://localhost:8080`；store=`s-mock-us`；fresh DB；登录 demo@amz.local/demo。

| # | 测试 | 期望 | 结果 | 输出 |
|---|---|---|---|---|
| 1 | `GET /strategies` | items ≥ 70 | **PASS** | `count=83` |
| 2 | `GET /suggestions?state=pending` | items ≥ 5 | **PASS** | `count=6`（含 sug-001..sug-006） |
| 3 | `GET /manual-changes?state=pending` | items ≥ 3 | **PASS** | `count=3`（mch-001..003） |
| 4 | `GET /lx/portfolios` | items ≥ 5 | **PASS** | `count=5`（pf-001..pf-005） |
| 5 | `GET /lx/campaigns?portfolioId=pf-001` | items ≥ 5 | **PASS** | `count=7`（cmp-001..cmp-007） |
| 6 | `POST /strategies/st-lc-001/toggle {enabled:false}` | 200 | **PASS** | `enabled: false` |
| 7 | `POST /suggestions/sug-001/accept` | 200 state=observing | **PASS** | `state: observing` |
| 8 | `POST /suggestions/sug-001/revert` | 200 state=pending | **PASS** | `state: pending` |
| 9 | `POST /lx/campaigns/cmp-001/budget {dailyBudget:99}` | 200 + 新增 manual_change | **PASS** | `budget: 99`；pending mc 从 3→4 |
| 10 | `GET /audit-logs` 含 4 类 actionType | 4 类全部出现 | **PASS** | STRATEGY_TOGGLE / TIMELINE_ACCEPT / TIMELINE_REVERT / LX_CAMPAIGN_BUDGET_UPDATE 全 YES |

**全 10 PASS。**

---

## 4. 已知 bug / TODO

1. 单 `better-sqlite3` 连接复用（`getDbInstance()` 跨模块），写操作虽包在 `db.transaction()` 中确保原子性，但 WAL 模式下并发读高 QPS 时仍需验证。
2. `seedAdsForUser` 在模块 import 时通过 top-level await 预加载所有 mock 文件（约 70KB）。若 mock 文件不可用（CI 环境无 web-v2 目录），seed 会跳过，仅警告。
3. `recordManualChange` 内 AI verdict 写死 `"neutral" / "待评估"`；spec §3.3 描述的"AI 智能评判"需对接 ai-decision-engine。
4. `lx/bulk-import` 当前接受 JSON 数组；CSV multipart 解析未实现。
5. `acceptSuggestion` / `rejectSuggestion` / `revertSuggestion` 完全幂等：对已是目标状态的请求返回 200 而不冲突。
6. `bindStrategy` 仅更新 `binding_count`；spec §3.1 描述的"实际把 strategy 挂到 campaign"关联表未建立（暂用 count 满足前端 KPI）。

---

## 5. 文件清单

| 路径 | 行数 | 用途 |
|---|---|---|
| `D:\amz\apps\api\src\data-store-ads.mjs` | 1932 | M3 schema + 17 表 CRUD + 种子 |
| `D:\amz\apps\api\src\store-routes-ads.mjs` | 511 | M3 全部 HTTP 路由 dispatch |
| `D:\amz\apps\api\src\data-store.mjs` | 711 | 改 — initSchema、seedSampleStoreData、removeUserStore 联动 |
| `D:\amz\apps\api\src\extended-routes.mjs` | 131 | 改 — handleAdsRequest 优先派发 |
| `D:\amz\docs\M3_BACKEND_REPORT.md` | 本文件 | 实施报告 |

---

## 6. 端到端验证命令

```bash
# 1. 启动
rm D:/amz/apps/api/data/store.db*
node D:/amz/apps/api/src/server.mjs

# 2. 登录
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@amz.local","password":"demo"}' | jq -r .token)

# 3. 跑全套 10 个测试
H="-H Authorization:Bearer\ $TOKEN -H X-Store-Id:s-mock-us"
# 参见上表
```
