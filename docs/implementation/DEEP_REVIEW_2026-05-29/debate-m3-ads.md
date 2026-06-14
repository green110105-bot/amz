# 功能域辩论证据: M3 广告 / 领星等价 (LX) / Strategy OS / Action Queue

## 清单梳理

I now have full, code-verified coverage of the entire domain. Confirmed: dry-run execution records an `ad_action_runs` row + flips queue state to `executed` + flips the source suggestion to observing/accepted, but does NOT mutate the underlying LX entity (no UPDATE lx_* in the dry-run path); real writes are env-gated through `live-action-executor`.

---

# M3 广告 / 领星等价 (LX) / Strategy OS / Action Queue — 逐页/逐tab清单

## 0. 架构总览（基于真实代码）

- **路由定义**: `apps/web-v2/src/router/index.js:50-100`（M3 主块）。
- **后端**: 17 张 SQLite 表 + 全 CRUD + Action Queue/Runs/Goal-Profile，定义在 `apps/api/src/data-store-ads.mjs`；HTTP 路由 `apps/api/src/store-routes-ads.mjs`，前缀 `/api/v1/store/ads/...`。
- **种子数据来源**: 后端启动时把前端 mock 文件（`mock-data-strategies.js / -ads-timeline.js / -lx.js / -sqp.js / -ads-reports.js`）用冻结随机数导入 SQLite（`data-store-ads.mjs:474-518`）。所以"DB"内容本质是 mock 种子，但**通过真实 SQLite 表 + 真实 HTTP 读写**。
- **关键写入语义（核心结论）**: M3 不存在"前端直接写实体"。所有 mutation 统一收口到 **Action Queue**：
  - LX 实体的所有写路由（POST/PUT/DELETE/toggle/budget/bid…）在后端**不直接改实体**，而是调用 `queueLxManualAction()` → `enqueueManualAction()`，返回 201 队列项（`store-routes-ads.mjs:178-216` 及 429-1229 全部 LX 路由）。
  - 前端 LX composable 也对称地用 `enqueueLxManualAction()` 把操作打进队列（`useLxState.js:30-63`），并提示"Added to Action Queue. Approval and dry-run are required before any write."
  - 执行只有 dry-run：`executeActionQueueItem` 写一条 `ad_action_runs`、把队列项置 `executed`、把来源建议置 observing/accepted，但**不 UPDATE lx_* 实体**（`data-store-ads.mjs:2072-2124`）。
  - 真实写入被多重 env 门禁锁死，仅 `ADJUST_BID` 等白名单原语、单条执行可走 `live-action-executor.mjs`（`assertRealWriteGate` `live-action-executor.mjs:38-54`），batch 显式禁止真实写（`store-routes-ads.mjs:369-375`）。Goal Profile 强制 `realWriteEnabled=false`（`data-store-ads.mjs:952-953`）。

---

## 1. 主入口页面（sidebar group `m3-main`）

### 1.1 总览 / Control Tower — `pages/AdsHub.vue`（路由 `/ads`，`router:52`）
- **业务目的**: 目标驱动的 AI 操盘台。聚合"今日操盘卡 / 已自动保护 / 等待批准 / 观察中 / AI 贡献 / 数据健康"，目标档案预设切换。
- **数据来源**: **DB(hybrid)**。组合多个 composable: suggestions / manualChanges / strategies / actionQueue / goalProfile / portfolios（`AdsHub.vue:23-28`）+ campaignReport/searchTermsReport API（`:33-42`）。
- **写入/队列语义**: 只读为主；唯一写动作是 `applyGoalPreset()` → `updateGoalProfile()`（`:178-196`），落 `ad_goal_profiles` 表。页头硬编码"真实写入关闭 · Sandbox / Mock"（`:207`）。

### 1.2 AI 时间线 — `pages/AdsTimeline.vue`（`/ads/timeline`，`router:53`）⭐
- **业务目的**: 统一时间流，3 个 tab：**我的待办（AI 建议）/ 外部更改 / 已处理（含撤销）**；含"执行篮"批量 dry-run。
- **数据来源**: **DB**。useSuggestions / useManualChanges / useStrategies / useActionQueue（`:10-32`）。
- **写入/队列语义**: 真实队列语义。
  - `execute(s)`: enqueue→（needs_review 则 approve）→ dry-run execute（`:122-141`）。
  - `runExecutionBasket()`: `executeBatch({approve:true})`（`:153-171`）。
  - reject/revert/applyAlternative/ignoreManual 走对应 suggestion/manual-change endpoint（`:143-193`）。
  - 注意 bug 痕迹：manual change 的"撤销"仅前端改 state，后端 endpoint 标 TBD（`:217-221`）。

### 1.3 策略库 / Strategy OS — `pages/StrategyLibrary.vue`（`/ads/strategies`，`router:54`）⭐
- **业务目的**: 83 条策略 9 大类（生命周期/类目/出价/预算/关键词/竞品/结构/跨模块/异常护栏），策略是"AI 建议的水龙头"，启用即生效。左目录+右网格+详情抽屉。
- **数据来源**: **DB**。useStrategies（`:29`），落 `ad_strategies` 表。
- **写入/队列语义**: 仅 `toggle`（启用/暂停，乐观更新+回滚，`useAdsState.js:58-68`）落库。**新建/导入/模板库三个按钮 disabled**（`:136-138`），save/remove/bind composable 存在但页面未接。

### 1.4 报表中心 — `pages/ReportsCenter.vue`（`/ads/reports`，`router:78`）
- 单一报表入口（未在本次种子清单内，未逐行读；其下三个子报表见 §3）。

---

## 2. 领星等价 (LX) wrapper — `/ads/lx`（`layouts/LxAdsLayout.vue`，`router:57-75`）

含 11 子页。**统一数据来源 = `composables/useLxState.js` → `api/lx.js` → 后端 `/api/v1/store/ads/lx/*`（DB）**；统一写入语义 = `enqueueLxManualAction()`（队列，需审批+dry-run，不直接写）。

### 2.1 广告组合（领星核心）— `pages/lx/LxPortfolios.vue`（`/ads/lx/portfolios`，`router:63`）⭐
- **目的**: 22 列 Portfolio 大表（曝光/点击/CTR/CPC/花费/销售额/ACoS/CPA/CVR…），行点击进详情，快速分析图标开 AdAnalysisDrawer。
- **来源**: **DB** usePortfolios（`LxPortfolios.vue:26`）。
- **写入**: 页面本身只读+查询；"同步"按钮只是 `fetch(true)`（`:60-62`）。Portfolio 的 toggle/setBudget 走队列（`useLxState.js:134-169`）。

### 2.2 广告组合详情 — `pages/lx/LxPortfolioDetail.vue`（`/ads/lx/portfolios/:id`，`router:64`）
- **目的**: 单组合 KPI 卡 + SVG 趋势图 + 该组合下 Campaign 表 + 批量操作（复制/改预算/暂停）。
- **来源**: **DB** usePortfolios + useCampaigns(portfolioId)（`:32-33`）。**注意趋势图是 `Math.random()` 假数据**（`:151-163`）。
- **写入/队列**: campaign toggle/setBudget 走队列（`:132-138`）；批量复制/批量改预算额外走 `useAudit().submit()` 写审计（`:54-117`）。

### 2.3 广告活动详情 — `pages/lx/LxCampaignDetail.vue`（`/ads/lx/campaigns/:id`，`router:65`）
- **目的**: 容器页，按 `?g=` 渲染 **12 个子 tab**（见 §2.12）。移动端 fallback。
- **来源**: **DB** usePortfolios + campaignsApi.get / useCampaigns 缓存（`:28-47`）。
- **写入**: 无（委托给各 tab）。

### 2.4 全部活动 / SP / SB / SD / ST — `pages/lx/LxAllCampaigns.vue`
（路由 `all-campaigns`/`sp`/`sb`/`sd`/`st` 共用此组件，`router:66-70`）
- **目的**: 全 Campaign 表，按路由后缀过滤广告类型（`:47-62`）。快速分析开 9-tab drawer。
- **来源**: **DB** useCampaigns().fetchAll（`:25-28`）。
- **写入**: 行内 `el-switch` toggle 走队列（`:78-80`）；"添加广告活动""同步"按钮无 handler（占位）。

### 2.5 已购商品 / 操作日志 / 下载中心 — `pages/lx/LxStubPage.vue`
（路由 `purchased`/`op-log`/`download`，`router:71-73`）
- **目的**: 三个桩页。
- **来源**: **纯 Mock（硬编码/直接 import）**。op-log 直接 `import { operationLogs } from '../../utils/mock-data-lx'`（`LxStubPage.vue:4`）；purchased/download 为组件内硬编码常量（`:24-51`）。**不走后端**（即便后端有 `lx_operation_logs` 表也未接）。
- **写入**: 无（download 的"重新下载"为占位按钮）。

### 2.12 LxCampaignDetail 的 12 个子 tab — `pages/lx/tabs/*`
全部 **DB** 来源（经 useLxState/lx api），全部写入走队列。逐个：

| Tab (`?g=`) | 文件 | 目的 | 来源 | 写入/队列 |
|---|---|---|---|---|
| ad-groups | `LxTabAdGroups.vue` | 广告组列表+快速分析 | DB useAdGroups | 队列 (setBid/toggle) |
| ads | `LxTabAds.vue` | 广告(ASIN)列表 | DB adsApi/adGroupsApi + actionQueueApi | 队列 |
| placements | `LxTabPlacements.vue` | 广告位加成 | DB usePlacements | 队列 (setBidAdj) |
| kw-grabbing | `LxTabKwGrabbing.vue` | 关键词抢位规则 | DB useKwGrabbing | 队列 (create/applyBid/update) + useAudit |
| targeting | `LxTabTargeting.vue` | 投放词/定向+AI信号 | DB useTargetings + `tabAiSignals`(ads-integration) + actionQueueApi | 队列 (bulk-bid 等) |
| negative | `LxTabNegative.vue` | 否定投放 | DB useNegatives + tabAiSignals | 队列 (create/remove) |
| search-terms | `LxTabSearchTerms.vue` | 用户搜索词 | DB useUserSearchTerms + tabAiSignals | 队列 (promote/negate) + useAudit |
| settings | `LxTabSettings.vue` | 活动设置 | DB portfoliosApi + actionQueueApi | 队列 |
| op-log | `LxTabOpLog.vue` | 该活动操作日志 | DB useOpLog | 只读 |
| daily | `LxTabDaily.vue` | 天数据 | DB useDailyData | 只读 |
| strategy | `LxTabStrategy.vue` | 绑定的策略 | DB useStrategies + useCampaigns | 只读/绑定 |
| amc-audiences | `LxTabAmc.vue` | AMC 人群包 | DB useAmcAudiences | 只读(列表) |

证据: 各 tab import 行见 Grep 结果 `pages/lx/tabs/*`（`LxTabTargeting.vue:5-11` 等）；tab 映射 `LxCampaignDetail.vue:53-68`。

---

## 3. 报表深链页（保留路由，不在 sidebar）

| 页面 | 路由 (`router`) | 目的 | 来源 | 写入/队列 |
|---|---|---|---|---|
| `SearchTermReport.vue` | `/ads/reports/search-terms`:80 | 搜索词报告，浪费/收割信号 | **DB** searchTermsReportApi (`:9`) | **队列**: promote/negate → 后端 `queueLxManualAction`(`store-routes-ads.mjs:1110-1135`) + useAudit (`SearchTermReport.vue:105-134`) |
| `CampaignReport.vue` | `/ads/reports/campaigns`:81 | 活动报表 | **DB** campaignReportApi + campaignsApi (`:8-9`) | useAudit submit (无直接实体写) |
| `SqpReport.vue` | `/ads/reports/sqp`:82 | SQP 份额/瓶颈 | **DB** sqpApi (`:5,35`) | **队列**: `sqpApi.takeAction` → 后端 `SQP_TAKE_ACTION` 入队 + 重复检测 409 (`store-routes-ads.mjs:1144-1179`；`SqpReport.vue:139`) |

---

## 4. 深度页 / 旧页归档（保留路由，不在 sidebar，`router:85-100`）

这些是重构前的旧页，**几乎全部 Mock（直接 import mock-data-*）**，写入仅落审计（useAudit），无 Action Queue 语义：

| 页面 | 路由 | 来源 | 证据 |
|---|---|---|---|
| `Playbook.vue` (旧42条策略) | `/ads/playbook`:85 | **Mock** `mockPlaybook` | `:8` |
| `AdsActions.vue` (操作清单·旧) | `/ads/actions`:86 | **DB(部分)** `adsApi.suggestions()` | `:8`；`api/ads.js:4` 只有 suggestions |
| `Campaigns.vue` (架构·深度) | `/ads/campaigns`:87 | **DB** campaignReportApi | `:14` |
| `Keywords.vue` (关键词·深度) | `/ads/keywords`:88 | **Mock** `mockSearchTerms,mockKeywordRankings` | `:7` |
| `Lifecycle.vue` | `/ads/lifecycle`:89 | **Mock** `mockSkus` | `:8` |
| `PromoteToManual.vue` | `/ads/promote-to-manual`:90 | **Mock** `mockAdTree,mockPromotionCandidates` | `:7` |
| `StructureHealth.vue` | `/ads/structure-health`:91 | **Mock** `mockStructureHealth` | `:8` |
| `BudgetAllocator.vue` | `/ads/budget-allocator`:92 | **Mock** `mockBudgetAllocation` | `:8` |
| `Dayparting.vue` | `/ads/dayparting`:94 | **Mock** `mockAdTree,defaultDaypartingMatrix` | `:7` |
| `Placements.vue` | `/ads/placements`:95 | **Mock** `mockPlacements` | `:7` |
| `KeywordLibrary.vue`(关键词护栏) | `/listings/keywords-library`:17 | **Mock+本地** `mockKeywordLibrary` + useLocalStore | `:8-9`（注：归 M1 路由，但属关键词域） |

（同组还有 BudgetForecast/InventoryLink/PromoSync/BrandDefense/CompetitorAttack/Creatives，`router:93-100`，未在种子清单内，未逐读。）

---

## 5. 弹层 / 抽屉组件

### 5.1 AdAnalysisDrawer — `components/AdAnalysisDrawer.vue`（领星 MCompare 等价）
- **目的**: 顶部下拉抽屉，按 entity type 渲染不同 tab 集（campaign 9 tab / keyword 5 / target 4 / adgroup·ad·placement 3 / portfolio 2）。Tab 矩阵 `utils/ad-drawer-config.js:43-51`。
- **被调用方**: LxPortfolios / LxAllCampaigns / LxCampaignDetail 多个 tab。
- **10 个 tab 组件 `components/ad-drawer-tabs/*`，数据来源关键发现**:
  - **几乎全部 Mock**: TabDaily/Compare/Hourly/Placement/OverBudget/Attribution/TimeSeries/KeyKeywords 均 `import generateMock* from './_mock-data.js'`（Grep 结果）。
  - **混合**: `TabUserSearchTerms.vue` 同时 import `userSearchTermsApi`(DB) 与 `generateMockSearchTerms`（`:8-9`）；`TabHistory.vue` import `storeApi`（`:7`）+ mock。
- **写入**: 抽屉级只读分析；个别 tab(History/KeyKeywords/UserSearchTerms) 有 ElMessageBox 交互按钮。

### 5.2 SuggestionCard / SuggestionDrawer — `components/SuggestionCard.vue` / `SuggestionDrawer.vue`
- **目的**: AdsTimeline"我的待办"的卡片与详情抽屉，展示证据/护栏/影响/置信度/回滚，发出 execute/reject/auto-toggle/view-detail 事件。
- **来源/写入**: 自身无 fetch；事件由 AdsTimeline 接住走 Action Queue（见 §1.2，`AdsTimeline.vue:351-359,425-430`）。

### 5.3 其它配套弹层（非种子清单但属本域）
- `StrategyDetailDrawer.vue`（策略详情，StrategyLibrary/LxTabStrategy 用）、`ManualChangeCard.vue`、`BulkCsvDialog.vue`（LX 批量导入→队列 `BULK_IMPORT`）、`BatchActionBar.vue`/`BidAdjustModal.vue`（targeting 批量）。

---

## 6. 总结判定

- **真实 DB + 真实 HTTP 读路径**: AdsHub、AdsTimeline、StrategyLibrary、所有 `/ads/lx/*`（除 LxStubPage）、3 个报表页、Campaigns/AdsActions（深度）。
- **纯 Mock（直接 import 或硬编码，不经后端）**: LxStubPage（op-log/purchased/download）、AdAnalysisDrawer 的 8/10 个分析 tab、以及深度归档页（Playbook/Keywords/Lifecycle/Placements/Dayparting/StructureHealth/BudgetAllocator/PromoteToManual/KeywordLibrary）。
- **假数据混进 DB 页**: LxPortfolioDetail 趋势图、LxPortfolio detail KPI 部分（`Math.random()`）。
- **真实写入/队列语义存在且统一**: 整个 LX + 建议流 + SQP/搜索词动作都收口到 `ad_action_queue`/`ad_action_runs`，带 guardrail/rollback/dry-run/audit；**但目前只能 dry-run（不改实体）**，真实 Amazon 写入被 env 门禁（`ADS_REAL_WRITES_ENABLED` 等）锁死、且仅单条+白名单原语可走 `live-action-executor.mjs`。
- **明显未完成**: StrategyLibrary 新建/导入/模板按钮 disabled；AdsTimeline manual-change revert 后端 TBD（仅前端改 state）；LxAllCampaigns 添加活动/同步、LxStubPage download 等为占位按钮。

## 第 1 轮

## M3 广告 / LX / Strategy OS / Action Queue — 第 1/10 轮 证据记录

### 各角色核心主张

**产品经理A（增长/闭环视角）** 立靶："本域最大风险不是单点按钮坏，而是整条价值闭环在沙箱模式下不可观测"。证据链：
- LX 内联编辑（LxTabTargeting.vue:183/202）改完 bid/启停后输入框/开关立即弹回旧值（useLxState.js:402 `if(previousBid!==undefined)t.bid=previousBid`、:421 `t.enabled=prev`），同时弹绿色成功 toast "Added to Action Queue"——视觉(回弹)与文案(成功)矛盾，操盘手会误判为 bug。
- executeActionQueueItem 在 dry-run 下从不把 recommendedValue 回写实体（已核对 :2072-2123，无 entity 写入分支，仅当 suggestionId 存在才 acceptSuggestion）→ 卖家走完 入队→批准→dry-run 全流程，列表 bid/状态仍是旧值，整个 LX 面是"只读剧场"（P0）。
- Drawer 7/9 tab 无条件 generateMock*（TabDaily.vue 仅 TODO week-2），AdsHub "AI 预估贡献 $X" 建立在 mock 上构成货币化误导（P1）。

**产品经理B（风险/合规/真实性视角）** 给出关键定性："HTTP 表面确实做到所有写进 Action Queue 且默认 dry-run、真写需多重 env+确认门，这点是真的、不是伪装；但纵深防御已退化到只剩最后一层"。证据：
- 约 30 个直写库函数（updateCampaignBudget/promoteUserSearchTerm 等，:2482-2524、:2801-2825）绕过队列直接 UPDATE/INSERT lx_* 表，grep 确认无任何路由调用——是"不可达的后门函数"，一次错误接线即破防（P1）。
- AdsHub dataHealth 把 mock seed 标 healthy、lx 硬编码 status:'healthy'（AdsHub.vue:115-123）→ 老板看到绿灯误判真实数据已接入（P1）。
- executeActionQueueItem 的 realWriteEnabled 分支可造假 real 标志：status='mock_write_success'、dry_run=0 却零外部副作用（已核对 :2083-2104），仅靠路由层拦截幸免（P2）。
- enqueueManualAction 接受客户端自报 state='approved'/guardrail.status='passed'，后端不重算（:1991-2029），前端守规矩、后端不设防（P2）。

**资深开发（工程可行性/数据契约视角）** 反对任何"前端已完成只差接数据"的乐观结论："数据契约层和去重/状态机一致性根本没打通"。证据：
- manual change 撤销只改前端 state='pending' 无后端调用，且已先写 TIMELINE_REVERT 审计 → 审计与数据分叉，F5 后撤销丢失，"幽灵成功"（AdsTimeline.vue:216-221，P0）。
- 去重双语义不一致：enqueueSuggestionAction 返回 200+duplicate，通用 /action-queue 返回 409 conflict，前端 catch 统一报"加入失败"——同一动作可能弹相反提示（P1）。
- 建议状态机 accepted/succeeded/failed 三态有完整 UI 但无可达路径，observing 进度走到 100% 永远停住（P2）。
- Drawer 刷新按钮（__refresh__ 切换 + KeepAlive 同步 mock）无效、preset radio 绑定新建数组引用永不高亮（P1）。
- LxAllCampaigns filter-bar 全部控件无 handler，rows 忽略 filterStore/filterDate（P1）。

**测试工程师（可验证性视角）** 锁定可写成断言的"假绿"风险，并直接反驳"M3 护栏统一"："三条写路径护栏语义各不相同，不存在统一契约"。证据：
- **executeActionQueueBatch 在 body.approve===true 时无差别 approve 所有 queued 项（含 needs_review）**（已核对 :2192-2194 `if(cur.state==='queued')approveActionQueueItem`，前端 :163 固定传 approve:true），等于"批量 dry-run"按钮静默批准需复核动作，绕过单卡流人工 approve 设计（P0 越权）。
- BudgetAllocator/Dayparting 走 useAudit.submit 旁路，完全不经 buildGuardrailResult，budgetMax/bidMax 零约束（P1）。
- execute() 文案承诺"观察窗内不重复触发"但 acceptSuggestion 不读 cooldown/observation_window、不写 next_eligible_at（P1，false-positive 测试陷阱）。

### 交锋点
- **被反驳的极端结论（预设靶子）**：PM-B 与测试同时反对"M3 真实写入零风险/护栏统一"的乐观断言；开发反对"只差接数据"的轻量化判断；四方一致反对"纯假壳"的另一极端——HTTP 表面的多重门控（ADS_REAL_WRITES_ENABLED + 非 mock + confirmRealWrite + riskAccepted + 主键白名单 + 幅度上限）是真实存在的。
- **dry-run 影子回写之争**：PM-A 主张沙箱 dry-run 应做"影子写"提升可观测性；PM-B 倾向纯审计语义更安全。直接冲突，需架构裁决。
- **批量 approve 定性**：测试判 P0 越权放行，PM-A/开发认同执行后无可见归宿放大该问题。我（主持）核对代码确认其为真实绕过，倾向 P0。


- 共识: HTTP/UI 主写路径(suggestion 入队、LX enqueueLxManualAction)确实强制进 ad_action_queue 且默认 dry-run，真实 Amazon 写入受多重 env+确认门控——安全不变量在主路径上成立，非纯伪装,也非零风险。; 当前形态下整条价值闭环在沙箱不可观测:dry-run 不回写实体、LX 内联编辑改完弹回旧值、无 pending 视觉态,卖家拿不到'我改了什么/省了多少'的反馈(PM-A P0 + 开发 + 测试共识)。; 存在多处'交互假象/假绿':约30个绕过队列的直写死函数、executeActionQueueItem 的 realWriteEnabled 造假 real 标志、dataHealth 把 mock 标 healthy、manual revert 仅前端改 state 却写审计、LxAllCampaigns filter-bar 无 handler、Drawer 刷新/preset 失效。; 三条写路径护栏语义不一致:LX 恒 needs_review 硬编码、timeline 单卡走动态 buildGuardrailResult、BudgetAllocator/Dayparting 走 useAudit 完全旁路——不存在'统一护栏契约'。; Drawer 7/9 tab 与 AdsHub KPI/AI贡献金额建立在 mock seed 上,缺数据来源标识,货币化数字构成误导。
- 分歧: 沙箱 dry-run 是否应对本地实体做'影子回写'(PM-A:应做,提升可观测/可演示) vs 坚持纯审计不写任何东西(PM-B:更安全)——直接冲突,需架构+安全视角裁决。; 批量 dry-run 自动 approve needs_review 项是'产品认可的批量即默认批准'还是'越权放行护栏'(测试判 P0,需产品/架构仲裁;主持人倾向 P0 越权)。; 内联编辑控件(switch/input)与'一切入执行篮'安全模型的冲突解法:乐观保留新值+pending 态(PM-A/测试) vs 禁用内联编辑改显式'加入执行篮'按钮——交互范式之争。; 约30个直写死函数应物理删除/加运行时守卫(PM-B P1) 还是保留作为未来 live-action-executor 真写雏形(GOVERN_KEYWORD/PAUSE/CREATE_STRUCTURE 真写执行器尚缺)——需产研确认职责边界。; accepted/succeeded/failed 三态死代码:是补后端观察期回流(定时任务+效果指标)实现三态,还是裁剪为 pending/observing/rejected 并先删死代码——能力 vs 承诺取舍。
- 决策: 确认安全不变量未被主路径破坏,但纵深防御已退化:本期必须收敛'是否真写'判定到唯一受门控执行器(live-action-executor),executeActionQueueItem 移除 realWriteEnabled 分支、硬编码 dry_run=1、status 仅允许 dry_run_success。; 批量执行 executeActionQueueBatch 不得对 needs_review 项自动 approve:approve:true 仅可放行 guardrail.status==='passed' 的 queued 项,needs_review 计入 skipped,前端确认文案须披露'含需复核项不会被自动批准'(P0 修复)。; enqueueManualAction 服务端强制重算 guardrail:对 sourceSurface==='lx' 或非系统建议来源,忽略客户端传入 state/guardrail.status,一律落 queued+needs_review,buildGuardrailResult 服务端权威。; 所有 mock seed 数据的 dataHealth status 一律标 'mock'(非 healthy);healthy 仅在 provider-mode=real 且有真实回流时给出;AI 贡献金额在 mock 模式加'示例/mock 估算'角标,不以货币承诺呈现。; manual change 撤销在后端 revert 端点就绪前,前端隐藏撤销按钮且不写 TIMELINE_REVERT 审计,杜绝审计与数据分叉的幽灵成功。; 去重契约统一:两条入队路径都返回 200+{duplicate:true,existing},前端 catch 识别 409/existing 降级为 info('已在篮中')而非 error。

## 第 2 轮

## M3/LX/Strategy OS/Action Queue — 第2轮辩论记录

### 本轮性质:代码逐行复核 + 上轮决策真伪校准
四位角色一致把本轮当作"决策落地审计",主持人已亲自核对 HEAD 源码,逐条结果如下(均为真阳性):

| 上轮决策 | HEAD 现状 | 核实结果 |
|---|---|---|
| executeActionQueueItem 硬编码 dry_run=1 | data-store-ads.mjs:2083 仍 `body.realWriteEnabled===true?0:1`,2094/2102 仍 `mock_write_success`/`real_write_requested_but_adapter_mocked` | 未落地 |
| 批量不自动 approve needs_review | :2192-2194 对任意 `state==='queued'` 项无条件 approve;approveActionQueueItem:2044 仅校验 state 不看 guardrail;executeActionQueueItem:2077 守卫被 approved 绕过 | 未落地 |
| enqueueManualAction 服务端重算 guardrail | :1997 仍 `body.guardrail || {...needs_review}`,信任客户端 | 未落地 |
| dataHealth 标 mock | AdsHub.vue:116 `campaignReport.length?'healthy':'mock'`(语义颠倒:有 mock seed 反而 healthy),:119 lx 硬编码 healthy | 未落地 |
| manual 撤销不写审计 | AdsTimeline.vue:206-212 仍先 submit `TIMELINE_REVERT` 审计,:218-220 仅改前端 state 无 API(:217 注释 TBD) | 未落地 |
| 去重统一 200 | enqueueSuggestionAction:1958-1961 有 active 去重返回 200+duplicate;enqueueManualAction:1991 **完全无去重**;SQP/targeting 路径走 409 | 未落地 |

**主持人裁定:上轮6条均为"已决议待实现",无人改过代码。决策栈与代码已分叉一轮。**

### 关键交锋点

**1. realWriteEnabled 分支定性之争(开发 vs PM-B/测试)**
- 开发主张:store-routes-ads.mjs:391-399 证明 /execute 路由在 `realWriteEnabled===true` 时改走【已门控】executeRealAdsActionExecutor(live-action-executor 含 env+confirm+riskAccepted+allowlist+changeLimit 多重闸),故 data-store-ads.mjs:2083 分支在 HTTP 主路径**不可达,恒 dryRun=1**——应定性为"死分支+脏文案",而非"造假 real 写"。
- PM-B 让步并精化:同意它不产生真实写入,但坚持 executeActionQueueBatch 透传 body 时仍可能命中 dry_run=0 分支(纵深防御退化)。
- 测试补刀:危险不在"假装真写",而在 `status='mock_write_success'` 字符串是 **false-positive 陷阱**——任何断言 status 含 success 的 E2E 会误判为写入成功。
- **主持人采纳开发的路由级证据**:HEAD 确认 :394-397 网关存在。定性降为"死代码+脏文案+测试陷阱",但处置方向(删分支、硬编码 dry_run=1、status 仅 dry_run_success)与上轮决策一致,保持必修。

**2. LX 内联编辑 snapback — 从"可能失败回滚"加重为"成功路径确定性回弹"(全员证实)**
- 上轮模糊表述"改完弹回旧值(可能仅失败时)"被四角色一致**加重并精确定位**:useLxState.js setBid:402 `if(previousBid!==undefined) t.bid=prev`、toggle:421 `t.enabled=prev` 在 await **之前**执行,成功分支从不写回 desired。叠加 LxTabTargeting.vue:183/202 的 v-model 双向绑定 → 100% 确定复现:控件瞬间弹回旧值 + 同时弹 success toast = 自相矛盾交互假象。
- bug 本身**无争议须修**;仅交互范式(乐观 pending 态 vs 显式"加入执行篮"按钮)有争议。

**3. 影子回写之争(PM-A vs PM-B vs 开发)**
- PM-A:纯审计零回写使 LX 整面成"只读剧场",闭环为零、Demo 无法证明价值,必须做沙箱影子回写。
- PM-B:顾虑影子写入若无清晰 sandbox 角标会变成更深的伪 real,要求强绑 `sourceMeta.sandbox=true`+UI 水印。
- 开发反制:工程上做 **pending 态**(从 action-queue 反查该 entity 的 active 项渲染"待执行"角标)即可解决可观测性,**无需对 lx_* 实体影子回写**,避免"沙箱已改/未真写"二义性。
- 测试评估:影子回写更可断言(可写"enqueue 后镜像值==desired+sandbox 标"),pending 态次之但仍可断言"控件终值==desired+pending 样式";纯审计语义只能断言审计行存在、断不了用户可见反馈(最弱)。
- **未收敛,carry forward 给架构裁决。**

**4. 护栏分级 vs 全锁 needs_review(PM-A 升级)**
- PM-A 纠偏上轮"buildGuardrailResult 服务端权威"共识:queueLxManualAction:210 实际写死常量 needs_review,**安全靠"全锁死"实现而非护栏判定**,导致任何 LX 动作(哪怕降1分钱 bid)同权重堆 needs_review,卖家批不过来=不省时间,护栏失去分级能力。
- 与 PM-B/测试发现的"enqueueManualAction 信任 body.guardrail"形成张力:既被前端全锁 needs_review,后端又可被伪造 passed 绕过——两个方向都错。

**5. 三态死代码(全员证实)**
全仓无 cron/scheduler 推进 observing→succeeded/failed;scheduler.mjs 仅做 SP-API sync;observationWindowHours 仅入库(:579)从不被消费。AdsTimeline.vue:136/167/248/297 的"观察期不重复触发/周期更新/效果回流"是无后端支撑的空头承诺,succeeded/failed 为不可达死状态。

### 被反驳/纠正的上轮观点
- "约30个直写死函数绕过队列"被 PM-B **部分证伪**:store-routes-ads.mjs 路由层未见绕队列直写,LX 主写全量走 queueLxManualAction→enqueueManualAction;这些 CRUD 是"未被路由暴露的雏形",真正 P0 是 AdsTimeline manual revert 的审计-数据分叉,不应笼统并列。
- "live-action-executor 与 executeActionQueueItem 混为多条伪 real"被开发/PM-B 反驳:live-action-executor.mjs:287-328 门控完备且诚实,问题专指 data-store 层 dry_run 旁路文案。

- 共识: 上轮6条决策在 HEAD 代码中逐条核实均未落地(主持人已亲自核对源码确认),应视为'已决议待实现'而非'已收敛';本轮不叠加冲突新决策,优先督促实现; LX 内联编辑 setBid:402/toggle:421 在成功路径(await 之前)即把模型值改回 prev,成功分支从不写回 desired,叠加 v-model 双向绑定构成100%确定复现的 P0 交互假象(控件回弹+success toast 自相矛盾);bug 本身无争议须修; executeActionQueueBatch 在 approve:true 时对任意 queued 项无条件 approve(:2192-2194),approveActionQueueItem:2044 不校验 guardrail.status,executeActionQueueItem:2077 守卫被 approved 绕过 = needs_review 护栏可被批量一键放行,确认 P0 越权; enqueueManualAction:1997 信任 body.guardrail 不服务端重算,与 suggestion 路径(buildGuardrailResult 服务端权威)不对称,可被 POST 伪造 status:passed 绕过复核 = P0 安全洞; AdsHub dataHealth 语义颠倒(有 mock seed 反而 healthy:116-117)+ lx 硬编码 healthy(:119)+ AI 贡献 mock 求和以美元大字呈现 = mock 冒充健康真值,误导采购/续费决策,免责小字弱于绿标与货币主视觉; 全仓无任何 cron/scheduler 推进 observing→succeeded/failed,observationWindowHours/cooldownHours 仅入库从不被消费,observing 是事实终态,succeeded/failed/'观察期回流/自动回滚'是不可达死代码+空头承诺; data-store-ads.mjs:2083 realWriteEnabled 分支在 HTTP /execute 路由不可达(:394-397 已路由到门控执行器),应定性为'死分支+脏文案(mock_write_success)+E2E false-positive 陷阱',而非'造假 real 写';但处置方向与上轮一致(删分支、硬编码 dry_run=1、status 仅 dry_run_success); live-action-executor.mjs:287-328 真写门控(env+confirm+riskAccepted+allowlist+changeLimit)完备且诚实,不是伪 real;问题专指 data-store 层 dry_run 旁路,二者不应混为一谈; enqueueManualAction:1991 完全无去重(对比 enqueueSuggestionAction:1958-1961 有 active 去重),LX 连点同一开关/bid 会无限堆叠队列项,执行时对同一实体下达冲突指令; 去重契约跨路径不一致:suggestion 返回 200+duplicate,LX SQP/targeting 返回 409 conflict,前端统一 catch 成 error toast,把'已在篮中'良性结果报成失败
- 分歧: 沙箱可观测性方案:PM-A 主张对 lx_* 做影子回写(可证价值),PM-B 要求若影子写则必须强绑 sourceMeta.sandbox=true+UI 水印否则更危险,开发主张只做 pending 态(从 action-queue 反查 active 项渲染待执行角标)不碰实体以避免二义性,测试评估三方案可断言性递减(影子回写>pending态>纯审计)——四方未收敛; 护栏策略:是否引入 buildGuardrailResult 对 LX 动作真实分级(低风险降bid 可 passed 以省卖家时间,PM-A)还是接受'LX 一律 needs_review'换取安全简单——直接关系'省时间'承诺,且与'后端可被伪造 passed'的安全洞形成张力; 三态机:补 observation cron 兑现 observing→succeeded/failed+自动 revert(开发倾向至少补轻量定时任务标 closed),还是先删 succeeded/failed 死码+移除观察期文案做诚实降级(PM-A/PM-B/测试倾向)——能力 vs 承诺取舍; LX 内联编辑范式:保留双向控件+乐观 pending 态 vs 改显式'加入执行篮'按钮(只读显示)——范式之争(snapback bug 本身须先修,无争议); 去重 key 粒度:(entity,primitive)阻止同实体改两次预算(可能正当) vs (entity,primitive,recommendedValue)放过反复横跳——需产品定义'同实体 active 动作唯一'还是'同目标值唯一'; 未被路由暴露的 CRUD 直写函数(updateTargetingBid 等)处置:物理删除 vs 加运行时守卫(检测非执行器调用栈即抛错) vs 保留作 live-executor 雏形——需先核实是否被批量路径间接调用
- 决策: [安全不变量·须落地] executeActionQueueItem 删除 realWriteEnabled 分支、硬编码 dryRun=1,status 仅允许 'dry_run_success',删除 mock_write_success/real_write_requested 等脏文案;真写唯一合法入口保留为 /execute 路由 realWriteEnabled===true 分支的 executeRealAdsActionExecutor(其门控完备); [安全不变量·须落地] executeActionQueueBatch 在 approve:true 时仅放行 guardrail.status==='passed' 的 queued 项,needs_review/blocked 计入 skipped 并原状返回;approveActionQueueItem 增加 guardrail 守卫(needs_review/blocked 不可被自动 approve); [安全不变量·须落地] enqueueManualAction 对 sourceSurface==='lx'/非系统来源忽略客户端 body.guardrail/state,服务端强制落 queued+needs_review(或经 buildGuardrailResult 重算),客户端值仅作展示;统一所有入队路径走服务端护栏权威; [必修 P0] useLxState setBid/toggle/setBudget/setBidAdj 成功路径禁止把值改回 prev,仅 catch 失败才回滚;先修复'成功路径设回旧值'的逻辑反转(范式选择可后定,但反转 bug 无争议立即修); [审计治理·硬规则] 确立'前端禁止在无后端数据写入时单独 submit 审计'为全域硬规则;AdsTimeline manual-change revert 后端 endpoint 就绪前,隐藏手动更改的撤销/恢复按钮,严禁单独写 TIMELINE_REVERT 审计;审计必须由后端在数据真正变更后写入; [诚实化·须落地] AdsHub provider-mode!=real 时 dataHealth 一律标 'mock'(含 lx,去掉硬编码 healthy),healthy 仅 provider-mode=real 且有真实回流时给出;AI 贡献金额在 mock 下隐藏数值或仅显示'示例估算'角标,不以美元净额作主视觉; [去重契约·须落地] enqueueManualAction 增加 active 去重(按 storeId,entityKind,resourceId,actionPrimitive,state IN active),命中返回 200+{duplicate:true,existing};统一两条入队路径都返回 200+duplicate,前端对 duplicate 降级为 info('已在执行篮中')而非 error; [诚实化·须落地] 短期裁剪建议状态为 pending/observing/rejected,删除 succeeded/failed 死分支与'观察期不重复触发/周期更新/已生效'文案;补 observation cron 兑现三态与自动 revert 列为中期项(carry forward 决定本期是否做)

## 第 3 轮

## M3 / LX / Strategy OS / Action Queue — 第3/10轮 证据记录

本轮主题:**前端 success 文案与真实写入状态的契约一致性**。四角色全部亲自 Read HEAD 源码逐行复核,我(主持人)对 4 条载荷性 P0 当场抽验确认无误,无一被推翻。本轮最大进展是把战火从"LX 入队路径护栏不对称"扩大到**第二条治理旁路:useAudit().submit→mockExecute 直写审计**,并把 BudgetAllocator/Dayparting 从上轮"待判 Demo占位 vs 护栏缺陷"**确定升级为 P0 护栏缺陷+审计旁路**。

### 交锋点 1:LX snapback —— 从"笼统"到"证据链闭合"(全员补强,无反驳)
- **开发 + 测试** 精化上轮定性:不是泛泛"成功路径设回旧值",而是分两类机制:
  - `toggle` 族(useLxState:421 等)`t.enabled = prev` **无条件**在 await 前执行 → 100% 回弹,与第三参无关;
  - `setBid/setBudget` 族(:402 `if(previousBid!==undefined) t.bid=previousBid`)**依赖调用方传第三参 oldVal**,但开发核到所有调用方(LxTabTargeting:126 / LxTabAdGroups:24 / LxTabPlacements:26 / LxPortfolioDetail:137)**全部传了 oldVal**,故生产路径同样 100% 回弹。
- 我抽验 useLxState.js:400-435 **确认**:成功路径从不写回 desired,仅 catch 也写回 prev(:413/432)。**修复要点(全员共识):删掉成功路径的 `x=prev` 整行,prev 仅用于构造入队 payload 与 catch 回滚**,而非"只改 catch"。
- 测试给出零 false-positive 断言:`@change(desired,old)` 后 await,断言 `model===desired`(当前实测 ===old 必失败)。

### 交锋点 2:BudgetAllocator/Dayparting —— PM-A 主张升级,全员背书(本轮裁定)
- **PM-A** 明确升级:上轮"下轮专项核对、待判 Demo占位"应直接定 **P0**,因为它**比 LX snapback 更隐蔽**——snapback 至少回弹(异常可见),而这两页 `submit→mockExecute` 后**本地 `c.currentBudget=c.recommendedBudget`(:41/54)伪装成功**,控件停在新值+绿色成功通知,Amazon 端零写入、ActionQueue 零记录、护栏从未评估。
- **开发** 把范围扩大为**十余处同模式 M3 页**(SearchTermReport:105/SqpReport:132/StructureHealth:34/Placements:23/Keywords:42/Lifecycle:29/CampaignReport:93/LxPortfolioDetail/LxTab*),根因是 `useAudit.js:16` 硬编码 `requiresRealStoreWrite:false`,且 `submit` 返回 `{ok:false}`(白名单拦截)时前端**仍执行本地改值无回滚**。
- **测试** 额外指出 `Dayparting.applyAiRecommend` 弹"已应用AI推荐(基于过去30天分时段CVR)"是**纯文案造假**——无任何 30 天 CVR 数据源。
- 我抽验 BudgetAllocator.vue:30-55 **确认** applyAll/applyOne 走 `submit` + 无条件本地赋值,与各角色描述一致。
- **PM-B** 补强:`useAudit.js:44-52` 成功文案承诺"可在审计中心回滚",但无真实变更可回滚——回滚承诺也是假的。

### 交锋点 3:服务端越权三连(全员逐行复核,无反驳)
- **批量越权**:`executeActionQueueBatch:2192-2194` approve:true 时仅判 `state==='queued'` 不判 guardrail → `approveActionQueueItem:2044` 不校验 guardrail.status → `executeActionQueueItem:2077` 的 `needs_review && state!=='approved'` 守卫因 state 已 approved 而短路 = **needs_review 批量一键放行**。我抽验 :2184-2218 **确认**。
- **伪造 passed**:`enqueueManualAction:1997` `guardrail = body.guardrail || {needs_review}` **信任客户端**。我抽验 :1991-2038 **确认**(对比 `enqueueSuggestionAction` 用服务端权威 `s.guardrail`)。**测试新增更深一层**:伪造 passed 项不仅绕 needs_review,还因 execute 允许 `state==='queued'` 直接执行而**绕过 approve**(绕复核+绕审批双重)。
- **dryRun 死分支**:`executeActionQueueItem:2083` 的 `realWriteEnabled===true?0:1` 在 HTTP 入口不可达(route:394-397 已分流 real 到 `executeRealAdsActionQueueItem`,execute-batch:371-373 显式拒绝 realWriteEnabled)。**PM-B/测试一致**:上轮"死分支+脏文案+E2E false-positive 陷阱"定性**精确,不应升级为"伪造 real 写"**。**但 PM-A 补一刀**:批量路径下 needs_review 被静默 approve 后标 `mock_write_success`,对卖家而言"假已处理"业务危害与造假等价,**产品严重性不因技术上是 dry_run 而降级**。

### 被反驳/纠偏的观点
- **上轮"LX 整面是只读但诚实剧场"被推翻**:PM-B/开发以 `LxTabTargeting.commitBulkState:74-88` 实锤——它**不是诚实只读,而是 success 谎报**:`toggle({...row}, undefined)` 传浅拷贝且漏传 desired → useLxState:419 `desired=!Boolean(t.enabled)=row.enabled`(**入队 recommendedValue 反转/空操作**),:82 无条件 `ElMessage.success('已启用/已暂停 N 条')`,但表格行全是原值。比内联 snapback 更严重(连乐观态都没有)。
- **纠偏(测试)**:不应因 data-store dry_run 死分支而否定 `live-action-executor` 的诚实性——后者门控(env+confirm+riskAccepted+allowlist+changeLimit)完备,是两回事。

### 其余确认项
- **AdsHub dataHealth 语义颠倒**(:116-117 有 mock seed 反而 healthy、:119 lx 硬编码 healthy、:122 partial 计入、:123 ≥3 恒 success)+ aiContribution mock 求和当美元 hero —— PM-A/PM-B/开发/测试**四方一致 P1**。
- **LxAllCampaigns 死控件群**(filterDate 无 watch、查询/重置/同步/列配置无 handler、Clock 未 import)—— 四方一致 P1。
- **三态机/observation cron**:全仓无 cron 推进 observing→succeeded/failed(测试 Read scheduler.mjs 全文确认仅 sync 三 job),observationWindowHours/cooldownHours 仅入库不消费 → succeeded/failed/观察期回流/自动回滚为**不可达死码+空头承诺**。四方一致 P1。LX 入队 `suggestion_id=NULL`(:2011)致 `executeActionQueueItem:2109` 整块跳过,Timeline 无归宿、回滚链断。
- **去重契约三态不一致**:enqueueSuggestion(200+duplicate 有去重)vs enqueueManualAction(无去重恒 201)vs LX targeting/SQP(409),前端统一 catch 成 error toast 把"已在篮中"良性结果报失败。

- 共识: LX snapback 是实锤 P0 且证据链已闭合:toggle 族(useLxState:421 等)无条件 t.enabled=prev、setBid/setBudget 族(:402 等)因所有调用方都传 oldVal 而 previousBid 恒!==undefined,均在 await 前执行;成功路径从不写回 desired。修复必须删掉成功路径的 x=prev 整行(prev 仅供入队 payload 与 catch 回滚),不可只改 catch。; BudgetAllocator/Dayparting(及十余处同模式 M3 页:SearchTermReport/SqpReport/StructureHealth/Placements/Keywords/Lifecycle/CampaignReport/LxPortfolioDetail/LxTab*)走 useAudit().submit→mockExecute 是第二条治理旁路,完全绕过 ActionQueue/guardrail/dry_run,且本地改值伪装成功——定性为 P0 护栏缺陷+审计旁路,不再是待判 Demo 占位。; 服务端三连越权全部实锤 P0 且已决议待实现:(1)executeActionQueueBatch:2192-2194 approve 只判 state==='queued' 不判 guardrail → needs_review 批量放行;(2)approveActionQueueItem:2044 不校验 guardrail.status;(3)enqueueManualAction:1997 信任 body.guardrail,可 raw POST 伪造 passed,且 passed 项因 execute 允许 state='queued' 而绕过 approve 直接执行。; executeActionQueueItem:2083 的 realWriteEnabled 分支(mock_write_success/real_write_requested 文案)是 HTTP 入口不可达死码+脏文案,应删除硬编码 dryRun=1;此前定性精确,不升级为'伪造 real 写'。但其在批量路径下产生的'假已处理'产品危害与造假等价。; LxTabTargeting.commitBulkState:74-88 是 success 谎报(漏传 desired 致入队值反转 + 无条件 success toast + 表格行不变),证伪了上轮'LX 是诚实只读剧场'的乐观定性。; AdsHub dataHealth 语义颠倒(有 mock seed 反而 healthy、lx 硬编码 healthy、partial 计入、≥3 恒 success)+ aiContribution 把 mock impact 求和当美元 hero 主视觉,误导采购/续费决策,P1。; 三态机 succeeded/failed/观察期回流/自动回滚为不可达死码+空头承诺(全仓无 cron 推进、observationWindow/cooldown 仅入库不消费);LX 入队 suggestion_id=NULL 致 Timeline 无归宿、回滚链断,P1。; 去重契约三路径不一致(suggestion 200+duplicate / manual 恒 201 无去重 / LX targeting/SQP 409),前端把 409 良性结果 catch 成 error toast,需统一为 200+{duplicate:true} 且前端降级为 info。; LxAllCampaigns 过滤/同步工具条是死控件群(filterDate 无 watch、查询/重置/同步/列配置无 handler、Clock 图标未 import),P1。; 安全不变量重申:真实 Amazon 无凭证时不得伪装 real、不得绕过 ad_action_queue;前端禁止在无后端真实写入时单独 submit 审计。
- 分歧: BudgetAllocator/Dayparting 本期处置力度:PM-A 主张立即改走 enqueueManualAction(走服务端护栏,保留可点击形态)vs PM-B/开发倾向后端端点未就绪前先 disabled+'即将上线/Demo数据'角标降级——力度未与开发/测试收口。; 沙箱可观测性范式(影响 snapback 修复后控件停在 desired 还是旧值):开发倾向(B)显式'加入执行篮'只读按钮根除控件值≠真值二义;PM 侧倾向(A)保留双向控件+乐观 pending 角标兑现即时感。测试可断言性排序:影子回写 > pending态 > 纯审计,但纯审计最不可断言。; 护栏分级:LX 低风险降 bid 是否经 buildGuardrailResult 判 passed 省时间(PM-A 倾向省时间)vs 全锁 needs_review;全员共识是'客户端 passed 通道未关闭前一律 needs_review,分级不能先于服务端权威落地'。; observation cron 本期补 vs 仅删死码:PM-A 从'证明 AI 赚钱'强烈主张中期必补否则增长闭环无法验证;PM-B/测试/开发倾向本期先诚实降级删死码,cron 列中期(若本期补须同时补可断言结算用例)。; 去重 key 粒度:(entity,primitive)vs(entity,primitive,recommendedValue)——PM-A 倾向(entity,primitive)防同实体反复横跳;测试无偏好但要求一旦定须三路径统一。需产品定义'同实体 active 动作唯一'还是'同目标值唯一'。; LX 动作 Timeline 归宿:为 LX 入队动作生成轻量 suggestion 进统一时间流 vs Timeline 单列手动操作历史——影响 LX 动作可否被 revert 的可断言性,未决。
- 决策: 定 P0 并实现:删除 useLxState.js 所有 mutation(toggle/setBid/setBudget/setBidStrategy/setBidAdj)成功路径的 x=prev/x=previousBid 写回行,prev 仅用于入队 payload 与 catch 失败回滚;成功路径保留 desired。; 定 P0:executeActionQueueBatch approve:true 仅放行 guardrail.status==='passed' 的 queued 项,needs_review/blocked 计入 result.skipped 数组原状返回供前端提示;approveActionQueueItem 增加 if(cur.guardrail?.status!=='passed') throw 'approve_requires_passed_guardrail' 守卫。; 定 P0:enqueueManualAction 对 sourceSurface==='lx'/非系统来源忽略 body.guardrail 与 body.state,服务端强制 state='queued' 且 guardrail 经 buildGuardrailResult 重算(或硬落 needs_review),客户端 guardrail 仅作展示——关闭客户端 passed 通道。; 定 P0:BudgetAllocator/Dayparting 及同模式 M3 实体写页禁止 useAudit().submit 旁路;实体 mutation(预算/出价/分时段/否定词)统一改走 actionQueueApi.enqueue;本地状态变更必须 gate 在 enqueue 返回 ok===true 之后,ok:false 不改本地值;后端端点未就绪前按钮 disabled+'即将上线/Demo数据'角标且严禁单独写审计。删除 Dayparting'基于过去30天分时段CVR'无数据支撑文案。; 定 P0:修复 LxTabTargeting.commitBulkState 漏传 desired(改 toggle(row,!row.enabled) 传真实 reactive row 引用),移除无条件 success toast,改为按 enqueue 返回统计真实入队条数文案'已加入执行篮 N 条(待审核+dry-run)'。; 定 P1:删除 executeActionQueueItem:2083 的 realWriteEnabled 三元分支硬编码 dryRun=1,status 仅 'dry_run_success',删除 mock_write_success/real_write_requested 死文案;测试侧立规——禁止对非路由暴露的内部函数断言 real-write 语义,real 写断言须经 /execute?realWriteEnabled=true 走 executeRealAdsActionQueueItem。; 定 P1:enqueueManualAction 增加 (storeId,entityKind,resourceId,actionPrimitive,state∈active) 去重命中返回 {duplicate:true};统一三入队路径返回 200+duplicate(LX targeting/SQP 由 409 改 200);前端 enqueue 包装层把 duplicate/409 统一降级为 info('已在执行篮中')。; 定 P1:provider-mode!=='real' 时 AdsHub dataHealth 全 adapter(含 lx 去硬编码)强制 'mock',healthy 仅 real+真实回流;healthType 在 mock 下恒 warning;aiContribution 在 mock 下隐藏数值或标'示例估算',不以美元净额作 hero 主视觉。; 定 P1:三态机本期诚实降级——裁剪状态为 pending/observing/rejected(或 observing 改称'已入队/待人工复盘'),删除 succeeded/failed 死分支与'观察期回流/自动回滚/回测'文案;observation cron 列中期项。; 定 P1:AdsTimeline.revertProcessed —— manual-change 后端 revert 端点就绪前隐藏其撤销/恢复按钮且不写 TIMELINE_REVERT 审计;suggestion 撤销只由后端 revert 端点写审计,删前端 :206 的 submit 双写。
