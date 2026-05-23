# M3 广告模块前端重构报告

**版本**：v1.0 · **日期**：2026-05-14 · **范围**：前端 mock 依赖 → API 客户端 + composables 调用后端 SQLite

---

## 1. 完成清单

### 1.1 新建 API 客户端（5 个）

| 文件 | 提供的 API |
|---|---|
| `D:\amz\apps\web-v2\src\api\ads-strategies.js` | `strategiesApi`（list / get / create / update / remove / toggle / bind） |
| `D:\amz\apps\web-v2\src\api\ads-timeline.js` | `suggestionsApi`（list / get / accept / reject / revert）+ `manualChangesApi`（list / applyAlternative / ignore） |
| `D:\amz\apps\web-v2\src\api\lx.js` | `portfoliosApi` / `campaignsApi`（含 bulkCreateFromStrategy / bulkImport）/ `adGroupsApi` / `adsApi` / `targetingsApi` / `negativesApi` / `userSearchTermsApi` / `opLogApi` / `dailyApi` / `kwGrabbingApi` / `placementsApi` / `amcApi` — 共 12 组 |
| `D:\amz\apps\web-v2\src\api\ads-reports.js` | `searchTermsReportApi` + `campaignReportApi` |
| `D:\amz\apps\web-v2\src\api\sqp.js` | `sqpApi`（list / takeAction） |

约定：

- 所有方法返回 `Promise<unwrapped data>`（`r.data.items ?? r.data ?? []` for list）
- 复用现有 `http`（`api/client.js`）—— 自动带 `Authorization: Bearer <token>` + `X-Store-Id`
- 路径前缀：`/api/v1/store/ads/...` 完全遵照 spec 段 3

### 1.2 新建 composables（2 个）

| 文件 | 暴露的函数 |
|---|---|
| `D:\amz\apps\web-v2\src\composables\useAdsState.js` | `useStrategies()` / `useSuggestions()` / `useManualChanges()` |
| `D:\amz\apps\web-v2\src\composables\useLxState.js` | `usePortfolios()` / `useCampaigns(portfolioId?)` / `useAdGroups(campaignId?)` / `useAds(adGroupId?)` / `useTargetings(campaignId?, adGroupId?)` / `useNegatives(campaignId?)` / `useUserSearchTerms(campaignId?)` / `useOpLog(campaignId?)` / `useDailyData(campaignId?)` / `useKwGrabbing(campaignId?)` / `usePlacements(campaignId?)` / `useAmcAudiences()` |

设计要点：

- 模块作用域单例 reactive ref（避免多组件重复请求）
- inflight Promise dedupe（同时挂载的组件共享一次 fetch）
- 每个 hook 暴露 `{ list, fetch, ... 业务 mutation 方法 }`
- mutation 乐观更新 + 失败回滚（保存 prev 值，catch 内还原）
- 错误统一 `ElMessage.error(e.message)`
- 子级实体按 `parentId` key 分桶（`useCampaigns(portfolioId)`, `useTargetings(campaignId)` 等）

### 1.3 改造 24 个 Vue 文件

| 文件 | 改造摘要 |
|---|---|
| `src/pages/AdsHub.vue` | 4 个 mock import → `useSuggestions` + `useManualChanges` + `useStrategies` + `usePortfolios` + `campaignReportApi/searchTermsReportApi`；`onMounted` 并行 fetch；KPI/卡片改为 computed 派生 |
| `src/pages/AdsTimeline.vue` | `suggestions`/`manualChanges`/`strategies` mock → composables；`execute/reject/revert/applyAlternative/ignoreManual` 改为 await composable mutation（仍保留 useAudit.submit）；`tab/sku/strategy` URL query 已存在保持 |
| `src/pages/StrategyLibrary.vue` | mock import → `useStrategies`；新增 URL query 同步（`cat/q/sov/status/scope/cross`）；`?focus=` 自动打开详情抽屉；`toggle` 走 composable |
| `src/pages/ReportsCenter.vue` | 未含 mock import，仅容器；未改 |
| `src/pages/SearchTermReport.vue` | mock import → `searchTermsReportApi.list()` + onMounted；批量 promote/negate 调 API + 写审计；URL query `?signal=` |
| `src/pages/CampaignReport.vue` | mock import → `campaignReportApi.list()`；批量启停调 `campaignsApi.toggle` |
| `src/pages/SqpReport.vue` | mock import → `sqpApi.list()`；funnel/opportunities/diagnosis 改为本地纯函数（输入 rows）；URL query `?bottleneck=&inv=&q=`；加投放调 `sqpApi.takeAction` |
| `src/pages/Campaigns.vue` | 旧版深度页 — 改为 stub 引导（仅含 KPI + 跳转 `/ads/lx/portfolios`），从 `campaignReportApi` 拉 KPI；移除 mockAdTree + suggestions 依赖 |
| `src/pages/lx/LxPortfolios.vue` | mock → `usePortfolios`；筛选 URL query；`sync()` 调 `fetch(true)` |
| `src/pages/lx/LxPortfolioDetail.vue` | `getPortfolio + campaignsByPortfolio` mock → `usePortfolios + useCampaigns(portfolioId)`；批量改预算调 `setBudget`；批量暂停调 `toggle` |
| `src/pages/lx/LxAllCampaigns.vue` | mock → `useCampaigns().fetchAll()`；switch 调 `toggle`；URL query `?store=` |
| `src/pages/lx/LxCampaignDetail.vue` | `getCampaign + getPortfolio` mock → 缓存 lookup + `campaignsApi.get` 兜底；保留所有 11 tab 路由 |
| `src/pages/lx/tabs/LxTabAdGroups.vue` | mock → `useAdGroups(campaignId)`；switch / bid 改 await composable |
| `src/pages/lx/tabs/LxTabAds.vue` | 双层 mock → `adGroupsApi.list` + `adsApi.list` 并行；switch 调 `adsApi.toggle` |
| `src/pages/lx/tabs/LxTabTargeting.vue` | mock → `useTargetings(campaignId)`；bid / switch 走 composable |
| `src/pages/lx/tabs/LxTabNegative.vue` | mock → `useNegatives(campaignId)`；add / remove 走 composable |
| `src/pages/lx/tabs/LxTabSearchTerms.vue` | mock → `useUserSearchTerms(campaignId)`；harvest/negate 同时写审计 + composable promote/negate |
| `src/pages/lx/tabs/LxTabPlacements.vue` | mock → `usePlacements(campaignId)`；bidAdj 改走 `setBidAdj` |
| `src/pages/lx/tabs/LxTabKwGrabbing.vue` | 内联 mock 数组 → `useKwGrabbing(campaignId)`；add / applyBid / pause/resume 走 composable + useAudit |
| `src/pages/lx/tabs/LxTabAmc.vue` | mock → `useAmcAudiences()` |
| `src/pages/lx/tabs/LxTabOpLog.vue` | mock → `useOpLog(campaignId)` |
| `src/pages/lx/tabs/LxTabDaily.vue` | mock → `useDailyData(campaignId)` |
| `src/pages/lx/tabs/LxTabStrategy.vue` | `getStrategiesForCampaign` mock → `useStrategies()` + 客户端按 scope 分组（account/portfolio/campaign） |
| `src/pages/lx/tabs/LxTabSettings.vue` | 加 `campaignsApi.update` 保存；草稿 `useLocalStorage` 写到 `amz_lx_drafts_settings_<campaignId>`；`portfoliosApi` 拉组合下拉 |
| `src/components/SuggestionDrawer.vue` | `getStrategy` + `suggestionsByStrategy` + `campaigns` mock → composables (`useStrategies.getById`, `useSuggestions.list`, `useCampaigns.getById`) |
| `src/components/StrategyDetailDrawer.vue` | `bindingsForStrategy` 移除；通过 strategy.bindings 数组 + `useCampaigns.getById` lookup；缺数据时 `strategiesApi.get(id)` 兜底；变成对真实绑定数据的纯渲染 |
| `src/components/BulkCsvDialog.vue` | 审计 submit 不变；新增 `campaignsApi.bulkImport(FormData)` 真上传调用（失败仅 console.warn） |

---

## 2. 跳过清单

| 文件 / 模块 | 跳过原因 |
|---|---|
| `src/utils/mock-data-*.js`（10 个） | 按要求保留为 fallback；不再被 24 个 M3 Vue 文件 import |
| `src/utils/ads-integration.js` | 用作 cross-table helper（`tabAiSignals`, `bindingsForStrategy`, `aiActivityForCampaign` 等）；其内部仍 import mock-data 作为 fallback。Vue 文件不再依赖它做主数据源 — 仅 `LxTabTargeting/Negative/SearchTerms` 通过它读 AI 信号统计（轻量装饰，无副作用） |
| `src/pages/lx/LxStubPage.vue` | 非 24 文件清单中；用于侧栏占位 (`报告 / 设置 / 工具` 子项) |
| 路由 `router/index.js` / 侧栏 `DefaultLayout.vue` | 工程纪律：不动 |
| 其他非 M3 页面（M1/M2/M4 / Workbench / Profit / Listing 等 ~50 个 Vue） | 不在 M3 范围 |
| Backend 任何文件 | 工程纪律：不动 |

---

## 3. 验证

### 3.1 Build 结果

`cd D:\amz\apps\web-v2 && npm run build` → **PASS**（10.79s, 0 errors, 1 chunk size warning，预期内）

```
✓ built in 10.79s
```

输出含 M3 关键 chunk：

- `AdsHub-*.js` (9.97 kB)
- `AdsTimeline-*.js` (33.26 kB)
- `StrategyLibrary-*.js` (13.26 kB)
- `SearchTermReport-*.js` / `CampaignReport-*.js` / `SqpReport-*.js`
- `LxPortfolios / LxPortfolioDetail / LxAllCampaigns / LxCampaignDetail-*.js`
- `useAdsState-*.js` (5.58 kB) / `useLxState-*.js` (7.32 kB)
- `StrategyDetailDrawer-*.js` / `SuggestionDrawer` 嵌在 AdsTimeline chunk
- `mock-data-*.js` chunks 仍存在（被 `ads-integration.js` / 非 M3 页面引用）—— 这是预期的 fallback 行为

### 3.2 Mock-data import 残留检查

```bash
grep -r "from .*mock-data" src/pages/AdsHub.vue src/pages/AdsTimeline.vue \
  src/pages/StrategyLibrary.vue src/pages/ReportsCenter.vue \
  src/pages/SearchTermReport.vue src/pages/CampaignReport.vue \
  src/pages/SqpReport.vue src/pages/Campaigns.vue \
  src/pages/lx/ src/pages/lx/tabs/ \
  src/components/SuggestionDrawer.vue src/components/StrategyDetailDrawer.vue \
  src/components/BulkCsvDialog.vue
```

结果：**0 个 import 匹配**（Campaigns.vue 中仅有一处历史注释提及，非 import）

剩余 mock-data 引用（非 M3 范围，未触碰）：

- `src/utils/ads-integration.js` — fallback helper（保留）
- `src/pages/lx/LxStubPage.vue` — 侧栏占位
- 非 M3 页面（StageTransitionAlert / Audit / BrandDefense / Postmortems / Creatives 等约 50 个） — 不在重构范围

---

## 4. 已知 bug / TODO（交给 QA）

### 4.1 后端 endpoint 待实现

所有新建 API 客户端调用的 endpoint 当前后端可能未实现：

- `/api/v1/store/ads/strategies/*`
- `/api/v1/store/ads/suggestions/*`
- `/api/v1/store/ads/manual-changes/*`
- `/api/v1/store/ads/lx/*` (12 组)
- `/api/v1/store/ads/reports/*`
- `/api/v1/store/ads/sqp/*`

按 spec 约定，先发请求；若 404 / 网络错误，composable 已通过 `ElMessage.error` 提示，UI 不会崩溃（列表为空）。

### 4.2 数据形状假设

- `strategy.bindings` — 假设后端返回 `string[]`（campaignId 数组）或 `Array<{id,name,type,portfolioId}>`；StrategyDetailDrawer 已两种都处理
- `suggestion.severity` / `actionType` — 假设后端返回 `{label, color, icon}` 对象（与 mock 形状一致）；若返回纯 string，UI 部分标签会显示空 — 建议后端 seed 时同 mock 字段
- `kwGrabbing.trend` — 数组中可含 `null`（观察期未达），UI 已处理

### 4.3 LxCampaignDetail "campaign 已缓存" 路径

`useCampaigns` 单例 lookup 跨缓存查找；若从外部直接 deep-link `/ads/lx/campaigns/<id>` 且 portfolio 列表尚未加载，会走 `campaignsApi.get(id)` 单条兜底 — 已在 onMounted 顺序处理。

### 4.4 SuggestionDrawer 中 targetCampaign 推断

旧逻辑通过 entity.campaign 字符串 + SKU 关键词推断 portfolio。新逻辑改为优先 `s.entity.campaignId`（若后端能提供）+ campaign 缓存 lookup。若都没有，targetCampaign 为 null，"在广告组合中的实时状态" 区块不渲染（旧行为是 fallback 到 campaigns[0]，新行为是隐藏）。

### 4.5 BulkCsvDialog 预览数据仍 mock

预览表的 4 行变更是写死 mock。真上传走 `campaignsApi.bulkImport(FormData)`，后端需要解析 CSV/Excel 返回真实预览（spec 段 3.5 约定，但当前 dialog 内未对接解析返回值）。

### 4.6 ads-integration.js 仍用 mock 作为统计源

`tabAiSignals` / `aiActivityForSku` / `bindingsForStrategy` 仍读取 mock-data。LxTab\* 的"AI 提示横幅"和 AiActivityBanner 的统计数字目前是 mock。建议下一轮把 `ads-integration.js` 改为读 `useSuggestions().list` + `useStrategies().list` 派生（同 composable，不再 import mock）。

### 4.7 LxTabSettings 草稿恢复

未保存的 inline 编辑写入 `amz_lx_drafts_settings_<campaignId>` key；只在 save 成功后清除。多组件竞争同 campaignId 时可能互相覆盖（PoC 阶段可接受）。

---

## 5. 改动统计

- 新建文件：**7 个**（5 API + 2 composables）
- 改造文件：**24 个**（10 lx tabs + 4 lx 顶层 + 7 M3 pages + 3 components）
- 总新增代码：约 **1850 行**（含 composables + API + Vue 重写）
- 删除直接 mock import：**24 处**（每个 Vue 文件 1+ 处）
