# M3 广告模块产品规格

**版本**：v1.0 · **日期**：2026-05-14 · **范围**：从"前端 mock + 易丢失 ref state"重构为"SQLite 持久化 + 真 API + 跨刷新一致"

---

## 1. 现状诊断

### 1.1 前端 M3 页面 → mock 依赖
- `AdsHub.vue` → 4 个 mock import（mock-data-ads-timeline / ads-reports / strategies / lx）— 只读
- `AdsTimeline.vue` → mock-data-ads-timeline + mock-data-strategies — 含采纳/拒绝/撤销/对外部更改"采纳替代/忽略"
- `StrategyLibrary.vue` → mock-data-strategies (83 条 × 9 类) — 启用/禁用、主权切换、新建/编辑
- `ReportsCenter.vue` → tabs 容器
- `SearchTermReport.vue` / `CampaignReport.vue` / `SqpReport.vue` → 各自 mock
- `lx/LxPortfolios.vue` → mock-data-lx.portfolios — 切换启用
- `lx/LxPortfolioDetail.vue` → portfolios + campaigns — 改 budgetCap
- `lx/LxCampaignDetail.vue` → 11 tab 父容器
- `lx/LxAllCampaigns.vue` → campaigns — 启停/改预算
- 11 子 tab：AdGroups / Ads / Targeting / Negative / SearchTerms / Placements / KwGrabbing / Amc / OpLog / Daily / Strategy / Settings

### 1.2 当前数据问题
- ✗ 全部 mock import；任何写操作只改 ref state，刷新丢失
- ✗ useAudit.submit() 调 /api/v1/audit/mock-execute 仅写审计日志，不写实体表
- ✗ Timeline "外部更改" 是写死 4 条 mock，无自动检测管道
- ✓ Auth / Stores / AuditLogs / Settings / Sovereignty 后端已就绪
- ✓ `(user_id, store_id)` 隔离模式已被既有表广泛遵循

### 1.3 后端 gap
| 资源 | 表名 | 优先级 |
|---|---|---|
| 策略库 | ad_strategies | P0 |
| AI 建议流 | ad_suggestions | P0 |
| 外部更改 | ad_manual_changes | P0 |
| 广告组合 | lx_portfolios | P0 |
| 广告活动 | lx_campaigns | P0 |
| 广告组 | lx_ad_groups | P0 |
| 广告 | lx_ads | P1 |
| 投放 | lx_targetings | P0 |
| 否定投放 | lx_negatives | P0 |
| 用户搜索词 | lx_user_search_terms | P0 |
| 操作日志 | lx_operation_logs | P0 |
| 天数据 | lx_daily_data | P1 |
| 关键词抢位 | lx_kw_grabbing | P1 |
| 广告位 | lx_placements | P1 |
| AMC 人群 | lx_amc_audiences | P2 |
| SQP 数据 | sqp_queries | P1 |
| 搜索词报告 | search_term_reports | P1 |

---

## 2. 后端 SQLite DDL

> 约定：所有表带 `user_id TEXT NOT NULL` + `store_id TEXT NOT NULL` 双分区；主键统一 `id TEXT PRIMARY KEY`；JSON 字段存为 TEXT；写文件位置 `D:/amz/apps/api/src/data-store.mjs` 的 `initSchema()` 内 `db.exec()` 末尾追加。

### 2.1 ad_strategies
```sql
CREATE TABLE IF NOT EXISTS ad_strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sovereignty TEXT NOT NULL DEFAULT 'semi',
  scope TEXT,
  trigger_condition TEXT,
  frequency TEXT,
  cooldown_hours INTEGER DEFAULT 24,
  action TEXT,
  guardrails TEXT,
  cross_module TEXT,
  binding_count INTEGER DEFAULT 0,
  trigger_count INTEGER DEFAULT 0,
  success_rate REAL,
  success_trend TEXT,
  last_triggered TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ad_strategies_us ON ad_strategies(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_ad_strategies_cat ON ad_strategies(user_id, store_id, category);
```

### 2.2 ad_suggestions
```sql
CREATE TABLE IF NOT EXISTS ad_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  time_bucket TEXT NOT NULL, severity TEXT,
  action_type TEXT, cross_module TEXT,
  source_strategy_id TEXT, source_strategy_name TEXT,
  entity TEXT NOT NULL,
  title TEXT, summary TEXT, detail TEXT,
  confidence REAL, historical_success_rate REAL,
  impact TEXT, evidence TEXT,
  lifecycle TEXT, category TEXT, strategic_tags TEXT, alternatives TEXT,
  state TEXT NOT NULL DEFAULT 'pending',
  cooldown_hours INTEGER DEFAULT 6,
  observation_window_hours INTEGER DEFAULT 72,
  accepted_at TEXT, rejected_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_sug_us ON ad_suggestions(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_ad_sug_state ON ad_suggestions(user_id, store_id, state);
```

### 2.3 ad_manual_changes
```sql
CREATE TABLE IF NOT EXISTS ad_manual_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  operator TEXT, operator_label TEXT,
  operation TEXT,
  ai_verdict TEXT, ai_verdict_text TEXT, reason TEXT,
  suggested_alternative TEXT,
  state TEXT NOT NULL DEFAULT 'pending',
  resolved_at TEXT, resolved_action TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_mc_us ON ad_manual_changes(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_ad_mc_state ON ad_manual_changes(user_id, store_id, state);
```

### 2.4 lx_portfolios
```sql
CREATE TABLE IF NOT EXISTS lx_portfolios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  name TEXT NOT NULL, state TEXT, service_state TEXT,
  budget_cap REAL,
  msku TEXT, asin TEXT, sku TEXT,
  region TEXT, store_label TEXT,
  metrics TEXT,
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_lx_pf_us ON lx_portfolios(user_id, store_id);
```

### 2.5 lx_campaigns
```sql
CREATE TABLE IF NOT EXISTS lx_campaigns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  portfolio_id TEXT,
  name TEXT NOT NULL, type TEXT, targeting_type TEXT,
  state TEXT, service_state TEXT, service_state_color TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  daily_budget REAL, bid_strategy TEXT,
  lifecycle_stage TEXT, tags TEXT, metrics TEXT,
  started_at TEXT, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_lx_cmp_us ON lx_campaigns(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_lx_cmp_pf ON lx_campaigns(user_id, store_id, portfolio_id);
```

### 2.6 lx_ad_groups / lx_ads / lx_targetings / lx_negatives / lx_user_search_terms / lx_operation_logs / lx_daily_data / lx_kw_grabbing / lx_placements / lx_amc_audiences
（结构与上类似 — 略，参考 spec 段 2.6-2.16，含 FOREIGN KEY 到 lx_campaigns）

### 2.7 sqp_queries / search_term_reports
```sql
CREATE TABLE IF NOT EXISTS sqp_queries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  asin TEXT, search_term TEXT NOT NULL, reporting_date TEXT NOT NULL,
  total_search_volume INTEGER,
  impression_share REAL, click_share REAL, cart_share REAL, purchase_share REAL,
  bottleneck TEXT, severity TEXT,
  raw TEXT
);
CREATE TABLE IF NOT EXISTS search_term_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL, store_id TEXT NOT NULL,
  campaign_id TEXT, ad_group_id TEXT,
  search_term TEXT NOT NULL, matched_kw TEXT, match_type TEXT,
  signal TEXT, metrics TEXT,
  reporting_period TEXT, created_at TEXT NOT NULL
);
```

### 2.8 种子数据
- 在 `seedSampleStoreData(db, userId, storeId)` 中追加 `seedAdStrategies`、`seedLx`、`seedSqp`、`seedSearchTermReports`、`seedAdSuggestions`、`seedAdManualChanges`
- 数据来源：从 `D:/amz/apps/web-v2/src/utils/mock-data-strategies.js`、`mock-data-lx.js`、`mock-data-ads-timeline.js`、`mock-data-sqp.js` 迁移
- 与 `removeUserStore()` 联动清理 17 张新表对应行

---

## 3. 后端 API 契约

**约定**：路径前缀 `/api/v1/store/ads/...`，需要 X-Store-Id header，所有写操作走 `appendAuditLog`，lx 实体写操作同时写 `lx_operation_logs (source='本工具')`。

### 3.1 策略库
- `GET /api/v1/store/ads/strategies` (?category=&status=&sov=&scope=&q=)
- `POST /api/v1/store/ads/strategies`
- `GET /api/v1/store/ads/strategies/:id`
- `PUT /api/v1/store/ads/strategies/:id` (partial patch)
- `DELETE /api/v1/store/ads/strategies/:id`
- `POST /api/v1/store/ads/strategies/:id/toggle` `{ enabled }`
- `POST /api/v1/store/ads/strategies/:id/bind` `{ campaignIds }`

### 3.2 AI 建议
- `GET /api/v1/store/ads/suggestions` (?state=&sku=&strategy=)
- `GET /api/v1/store/ads/suggestions/:id`
- `POST /api/v1/store/ads/suggestions/:id/accept` `{ chosenAlternativeIndex? }`
- `POST /api/v1/store/ads/suggestions/:id/reject` `{ reason? }`
- `POST /api/v1/store/ads/suggestions/:id/revert` `{ reason? }`

### 3.3 外部更改
- `GET /api/v1/store/ads/manual-changes` (?state=)
- `POST /api/v1/store/ads/manual-changes/:id/apply-alternative`
- `POST /api/v1/store/ads/manual-changes/:id/ignore`

### 3.4 lx 实体（嵌套）
```
/api/v1/store/ads/lx/portfolios               GET/POST
/api/v1/store/ads/lx/portfolios/:id           GET/PUT/DELETE
/api/v1/store/ads/lx/portfolios/:id/toggle    POST
/api/v1/store/ads/lx/portfolios/:id/budget    PUT

/api/v1/store/ads/lx/campaigns                GET ?portfolioId= / POST
/api/v1/store/ads/lx/campaigns/:id            GET/PUT/DELETE
/api/v1/store/ads/lx/campaigns/:id/toggle     POST
/api/v1/store/ads/lx/campaigns/:id/budget     PUT
/api/v1/store/ads/lx/campaigns/:id/bid-strategy PUT

/api/v1/store/ads/lx/ad-groups                GET ?campaignId= / POST
/api/v1/store/ads/lx/ad-groups/:id            GET/PUT/DELETE
/api/v1/store/ads/lx/ad-groups/:id/bid        PUT

/api/v1/store/ads/lx/ads                      GET ?adGroupId= / POST
/api/v1/store/ads/lx/ads/:id                  PUT/DELETE
/api/v1/store/ads/lx/ads/:id/toggle           POST

/api/v1/store/ads/lx/targetings               GET ?campaignId=&adGroupId= / POST
/api/v1/store/ads/lx/targetings/:id           PUT/DELETE
/api/v1/store/ads/lx/targetings/:id/bid       PUT
/api/v1/store/ads/lx/targetings/:id/toggle    POST
/api/v1/store/ads/lx/targetings/bulk-bid      POST

/api/v1/store/ads/lx/negatives                GET ?campaignId= / POST
/api/v1/store/ads/lx/negatives/:id            DELETE

/api/v1/store/ads/lx/user-search-terms        GET ?campaignId=
/api/v1/store/ads/lx/user-search-terms/promote POST
/api/v1/store/ads/lx/user-search-terms/negate POST

/api/v1/store/ads/lx/op-log                   GET ?campaignId=&limit=
/api/v1/store/ads/lx/daily                    GET ?campaignId=
/api/v1/store/ads/lx/kw-grabbing              GET ?campaignId= / POST
/api/v1/store/ads/lx/kw-grabbing/:id          PUT/DELETE
/api/v1/store/ads/lx/kw-grabbing/:id/apply-bid POST
/api/v1/store/ads/lx/placements               GET ?campaignId=
/api/v1/store/ads/lx/placements/:id           PUT
/api/v1/store/ads/lx/amc-audiences            GET/POST/DELETE
```

### 3.5 报表 / SQP
```
GET  /api/v1/store/ads/reports/search-terms   ?period=&campaignId=
POST /api/v1/store/ads/reports/search-terms/promote
POST /api/v1/store/ads/reports/search-terms/negate
GET  /api/v1/store/ads/reports/campaigns      ?period=
GET  /api/v1/store/ads/sqp                    ?asin=&from=&to=
POST /api/v1/store/ads/sqp/take-action        { queryId, action, payload }
```

### 3.6 结构创建 / CSV 批量
```
POST /api/v1/store/ads/lx/bulk-create-campaigns  { strategyId, portfolioId, campaigns: [...] }
POST /api/v1/store/ads/lx/bulk-import            multipart: file, type='campaigns'|'targetings'|'negatives'
```

---

## 4. 前端改造清单

### 4.1 新增文件
- `src/api/ads-strategies.js`
- `src/api/ads-timeline.js`（suggestionsApi + manualChangesApi）
- `src/api/lx.js`（13 个子 API）
- `src/api/ads-reports.js`
- `src/api/sqp.js`
- `src/composables/useAdsState.js`（useStrategies / useSuggestions / useManualChanges）
- `src/composables/useLxState.js`

### 4.2 改造目标
- 删除所有 `import { ... } from '../utils/mock-data-*.js'` 引用
- 替换为对应的 `*Api` 调用
- onMounted 时拉数 + 显示骨架
- 写操作改为 async + try/catch + ElMessage.error 报错路径
- 列表/筛选/tab 状态用 URL query 同步
- 未保存的 inline edit 用 useLocalStorage 暂存

### 4.3 24 个 Vue 文件待改
StrategyLibrary / AdsTimeline / AdsHub / CampaignReport / SearchTermReport / SqpReport / Campaigns / LxPortfolios / LxPortfolioDetail / LxAllCampaigns / LxCampaignDetail / 11 个 LxTab*.vue / SuggestionDrawer / StrategyDetailDrawer / BulkCsvDialog

---

## 5. 10 个核心测试场景

每个场景**至少跑 5 次**确认稳定。

### 场景 1：启用/禁用策略后跨刷新持久化
- 切换 st-lc-001 启用状态 → F5
- 验证：`SELECT enabled FROM ad_strategies WHERE id='st-lc-001'` 与 UI 一致
- audit_logs 出现 STRATEGY_TOGGLE

### 场景 2：采纳 AI 建议 → 进入观察期 → 撤销
- 采纳 sug-001 → state=observing → 切到"已处理"撤销 → F5
- 验证：state 最终回到 pending；audit_logs 有 TIMELINE_ACCEPT + TIMELINE_REVERT

### 场景 3：lx 改 Campaign budget → 出现在 Timeline 外部更改
- 改 cmp-001 budget $50→$80
- 验证：ad_manual_changes 新增 1 条 pending；lx_operation_logs 1 条；audit_logs LX_CAMPAIGN_BUDGET_UPDATE

### 场景 4：应用结构策略 → 批量创建 N 个 Campaign
- 应用 st-struc-001 到 SKU LAMP-003
- 验证：lx_campaigns 增 3 条；lx_operation_logs 3 条；重复应用幂等

### 场景 5：CSV 批量上传 targetings
- 上传 3 行新 + 1 行错误
- 验证：created=3 errors=1 row=4；audit_logs BULK_CSV_IMPORT

### 场景 6：SQP 加投放
- search_term 高 severity → "加投放"到 cmp-002/ag-004
- 验证：lx_targetings +1；audit_logs SQP_ADD_TARGETING；重复 409

### 场景 7：关键词抢位"应用建议 bid"
- kw-g-001 应用 suggested_bid=1.55
- 验证：lx_kw_grabbing.current_bid=1.55；lx_targetings 对应 term bid 同步

### 场景 8：策略详情抽屉绑定 Campaign
- 给 st-bid-003 绑定 cmp-021/cmp-022/cmp-031
- 验证：binding_count=3；lx Strategy tab 显示

### 场景 9：Timeline 筛选 URL 参数同步
- 选 sku=CASE-001 + strategy=st-cm-004
- 验证：URL 含 ?sku=...&strategy=...&tab=pending；F5/复制 URL 还原

### 场景 10：审计中心 → M3 写操作可查 + 可回滚
- 执行 5 个写操作 → /audit 筛选 sourceModule=M3 → 选 STRATEGY_TOGGLE 回滚
- 验证：audit_logs.reverted=1；策略状态反转

---

## 6. 验收标准（DoD）

### 后端
- ✅ 17 张新表跨重启存活
- ✅ 每个 endpoint：401/404/400/200/201 各路径正确
- ✅ 每个写操作必写 audit_logs；lx 写操作同时写 lx_operation_logs
- ✅ 删除店铺联动清理新表
- ✅ 种子数据：登录 demo 用户看到 83 条策略 + 8 建议 + 4 manual + 5 portfolios + 16 campaigns

### 前端
- ✅ npm run build 通过，无 mock-data import 残留
- ✅ 所有列表页 onMounted 调 API
- ✅ 所有写操作有 try/catch + 错误提示
- ✅ 刷新 - tab/filter/sort/草稿全部保留

### 跨刷新一致
- ✅ URL query 同步：tab / filter / sort / 选中 id
- ✅ localStorage 草稿：未保存的 inline edits

### 性能
- ✅ 列表 GET p95 < 200ms
- ✅ 单 PUT/POST p95 < 100ms
- ✅ Bulk CSV 100 行 < 2s

### 测试
- ✅ 10 场景每个 5 次 0 failures

---

## 7. 工程量估算

| 阶段 | 工时 |
|---|---|
| Sprint 1 后端 DDL + strategies/suggestions/manual 核心 endpoints | 5d |
| Sprint 2 lx 实体 endpoints + bulk | 4d |
| Sprint 3 SQP/reports + 审计联动 | 3d |
| Sprint 4 前端 API client + composables | 2d |
| Sprint 5 前端 24 vue + 3 组件改造 | 5d |
| Sprint 6 跨刷新 / URL query / 草稿 | 2d |
| Sprint 7 QA + 修 bug | 4d |
| **总计** | **25d / 5w** |

新增文件 11 个；修改 ~31 文件 / ~1225 行。

---

## 8. 关键风险

1. **结构创建幂等**：用 strategyId+sku+version 作幂等键
2. **回滚语义**：audit_logs revert 需 switch(actionType) 反向 dispatch
3. **双写**：audit_logs + lx_operation_logs 用 `db.transaction(() => {...})()`
4. **种子数据漂移**：83 条策略 mock 含随机 metrics，需固定 seed
5. **store 切换**：清 URL query + 清 localStorage 草稿
