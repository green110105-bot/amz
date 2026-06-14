# 功能域辩论证据: M1 Listing 作战室 (生成/版本/图片矩阵/A-B/资源中心)

## 清单梳理

`ImagePromptEditor.vue` exists but is not imported by any page/component (only referenced in docs) — it is dead code. I have all the evidence needed.

# M1 Listing 作战室 — 逐页/逐tab 清单梳理

域路由全部挂在 `apps/web-v2/src/router/index.js:8-22`（注释「M1 商品 - 主流程（重构为 3-Flow 工作流）」），后端统一前缀 `/api/v1/store/m1/...`（`apps/api/src/store-routes-listings.mjs:2,62`），所有写操作走 `appendAuditLog(sourceModule='M1')`。

## 一、页面清单（router 实际注册）

### 1. ListingSelect — 优化目标选择（`/listings/select`）
- 路由：`router/index.js:10`；组件 `apps/web-v2/src/pages/ListingSelect.vue`
- 业务目的：M1 入口，3 种模式选优化目标。页内用 `el-radio-group` 切 3 个 tab（`ListingSelect.vue:180-184`）：
  - **Mode 1 选择店铺 Listing**：表格选自有 SKU 进作战室（`ListingSelect.vue:186-234`）
  - **Mode 2 ASIN 识别**：输 ASIN/链接，后端判 own/external，external 锁只读对标（`ListingSelect.vue:236-258`；归属判定 `data-store-listings.mjs:411-415,451-459`）
  - **Mode 3 新建 Listing 简报**：表单（类目/3-5 卖点/人群/价格带等），草稿存 localStorage `m1_draft_new_listing`（`ListingSelect.vue:101-159`）
- 数据来源：**hybrid（db 优先，失败回退 mock）**。`useTargets().fetch` → `targetsApi.list` → `GET /m1/targets`（db `listTargets` 真查询）；接口失败时 `buildMockTargetList()` 回退并 toast（`useM1State.js:22-47`；`api/m1.js:189-217`）
- 写入语义：**真实 DB 写入**。`createTarget` → `POST /m1/targets` → `data-store-listings.mjs:434-493`（INSERT + audit `M1_TARGET_CREATE`）。无队列，同步写。

### 2. ListingOptimize — Listing 作战室（`/listings/optimize/:id?`）
- 路由：`router/index.js:11`；组件 `apps/web-v2/src/pages/ListingOptimize.vue`，标题「优化室 ⭐」
- 业务目的：单 target 的全流程作战室。**非真 tab，是锚点滚动**的 8 个内嵌区块（`ListingOptimize.vue:29-38`，`anchor-bar`）：`作战室 / 调研 / 评分 / 文案·素材 / 图片矩阵 / 合规 / 发布前检查 / 版本`
- 由 5 个子组件渲染（`ListingOptimize.vue:131-137`）：`ListingWorkbenchPanel`、`ResearchBlock`、`ScoreBlock`、`GenerationBlock`、`VersionBlock`（图片矩阵/合规/发布前检查 内嵌在前两者的 `id="assets/compliance/preflight"` 锚点里）
- 数据来源：**hybrid，多源聚合 + 客户端兜底**。`useTargetFlow.fetch` 并行拉 target/research/score/runs/versions/workbench/images，每个都 `.catch(()=>null)`（`useM1State.js:144-175`）；最终 `buildM1Workbench()` 把 API 数据规整，缺真实 Amazon 字段时拼确定性 mock，并打 `sourceMeta.source = api / hybrid_api_plus_deterministic_mock / deterministic_mock`（`api/m1.js:407-547`）
- 写入语义：见各子区块。「发布前检查」按钮 → `checkReadiness` → `POST /m1/readiness/check`（`useM1State.js:282-292`），后端 `checkListingReadiness` 计算阻塞项并写 audit `M1_READINESS_CHECK`，**只产出 readiness + auditId，不写 Amazon**（`data-store-listings.mjs:1498-1516`）

### 3. ListingAbCenter — A/B 测试中心（`/listings/ab`）
- 路由：`router/index.js:12`（旧 `/listings/experiments` 重定向到此 `router/index.js:14`）；组件 `apps/web-v2/src/pages/ListingAbCenter.vue`
- 业务目的：原生 SP A/B 管理（主图/标题/A+ 自动；五点/描述/价格手动）。含两个弹层：**创建抽屉**（`ListingAbCenter.vue:270-319`）、**详情抽屉 + 每日 metrics**（`ListingAbCenter.vue:321-372`）
- 数据来源：**真 DB**。`useAbTests().fetch` → `GET /m1/ab` → `listAbTests`（`data-store-listings.mjs:1679-1685`）；metrics → `GET /m1/ab/:id/metrics`
- 写入/队列语义（均真实 DB 写 + audit）：
  - create → `createAbTest`：auto 类型 `status='draft'`；手动类型（bullets/description/price/manual）→ `status='manual_required'` + 生成 `manual_guidance`（`data-store-listings.mjs:1693-1734`）
  - start → `startAbTest`：置 running 并**mock 生成 14 天双臂 metrics**（`data-store-listings.mjs:1775-1817`）
  - metrics 读取时**惰性跑 z-test**，≥14 条且 |z|>1.96 自动置 completed + winner/lift/significance（`data-store-listings.mjs:1831-1850`）
  - adoptWinner → `adoptAbWinner`：仅置 `status='ready_for_manual_publish'` + audit（`publishState=ready_for_manual_publish, uploadedToAmazon=false, publishAdapterRequired='SP-API'`），**明确不写 Amazon**（`data-store-listings.mjs:1852-1878`）。前端「采用 Winner」前还另发一条 `useAudit` 业务审计 `ADOPT_AB_WINNER`（`ListingAbCenter.vue:140-151`）

### 4. M1ResourceHub — 素材规则中心（`/listings/resources`）
- 路由：`router/index.js:16`；组件 `apps/web-v2/src/pages/M1ResourceHub.vue`
- 业务目的：收口页，4 张工具卡（关键词护栏/类目发布规则/VOC 痛点库/评分规则校准）+ 映射表 + 下线说明。深链跳子工具页
- 数据来源：**纯 mock（静态）**。指标全来自 `utils/mock-data-extras`（`mockKeywordLibrary/mockCategoryPains/mockCategoryTemplates/mockCalibration`，`M1ResourceHub.vue:5,23-79`）
- 写入语义：**无任何写入**，纯导航/展示
- 下线入口：`/listings/keyword-heatmap`、`/listings/multi-locale` 重定向到此并带 `retired` 提示（`router/index.js:21-22`，`M1ResourceHub.vue:10-21`）

### 5. M1 资源子页（中心页深链，不进主导航）
均在 `router/index.js:17-20`，组件存在但本次未逐一读其数据源（按 ResourceHub 用的是 mock-data-extras，推断为 mock）：
- `/listings/keywords-library` KeywordLibrary（关键词护栏）
- `/listings/templates` CategoryTemplates（类目发布规则）
- `/listings/category-pains` CategoryPains（VOC 痛点库）
- `/listings/calibration` ScoringCalibration（评分规则校准）

## 二、ListingOptimize 内嵌区块（子组件级）

| 区块/组件 | 业务目的 | 数据来源 | 写入/队列语义 |
|---|---|---|---|
| **ListingWorkbenchPanel** (`components/m1/ListingWorkbenchPanel.vue`) | 作战室总览：商品档案/变体属性/关键词覆盖矩阵/9 图槽位 mini/合规风险/发布前检查 | hybrid（读 `workbench` 对象，含 api+mock 标注，`ListingWorkbenchPanel.vue:8-19,40-47`） | 只读展示，无写入 |
| **ResearchBlock** (`components/m1/ResearchBlock.vue`) | 竞品/VOC/关键词/图片结构调研 brief（5 卡） | hybrid，无 research 时显示 fallback 文案并标 `source:'mock'`（`ResearchBlock.vue:24-44,51-79`） | 真写 DB：trigger → `POST /m1/research/trigger`（7 天缓存，`data-store-listings.mjs:540-601`，audit `M1_RESEARCH_TRIGGER`）；重新调研先 `DELETE /research/:id/cache`（`ResearchBlock.vue:81-94`，`data-store-listings.mjs:603-612`） |
| **ScoreBlock** (`components/m1/ScoreBlock.vue`) | 五维评分雷达 + 改进排序 | hybrid，无 score 时用 workbench 派生 `fallbackScores`（`ScoreBlock.vue:49-60`） | 真写 DB：trigger → `POST /m1/scores/trigger`（`data-store-listings.mjs:623-675`，audit `M1_SCORE_TRIGGER`；`new_listing` 模式返回 `scoring_not_applicable`） |
| **GenerationBlock** (`components/m1/GenerationBlock.vue`) | 文案编辑（标题/5点/描述/后台词）+ 图片矩阵生成 + A+/Video/360 + AI 风格滑杆 | hybrid（draft 同步自 latestVersion/workbench.copy，`GenerationBlock.vue:23-33`） | 真写 DB：① 生成下一轮 → `createRun` `POST /m1/runs`（确定性变异，非真 LLM；round1 baseline，round2+ 改 markedFields；5 版折叠归档；audit `M1_RUN_CREATE`，`data-store-listings.mjs:990-1061`）② 单字段 AI 重写 → `POST /runs/:id/rewrite-field`（`mutateField` 加后缀标记，`data-store-listings.mjs:1063-1082`）③ 生成/重生图 → `POST /m1/images/generate`、`/images/:id/regenerate`（**mock 图 picsum.photos，status 直接 completed，无真异步队列**，`data-store-listings.mjs:1625-1671`） |
| **VersionBlock** (`components/m1/VersionBlock.vue`) | 最近 5 版管理、置顶、删除；弹层：Diff 对比、组合挑选字段 | 真 DB（`useVersions` → `GET /m1/versions`，`useM1State.js:337-431`） | 真写 DB + audit：pin/unpin（`M1_VERSION_PIN/UNPIN`）、删除（round1 baseline 禁删 `cannot_delete_baseline`）、combinedPick → `POST /versions/combined-pick`（按 fieldPicks 哈希幂等，生成 `source='combined_pick'` 版本，audit 复用 `M1_LISTING_UPLOAD`，`data-store-listings.mjs:1530-1611`） |
| **ListingDiff** (`components/m1/ListingDiff.vue`) | 两版本逐字段 Diff | 真 DB（`versionsApi.diff`，`ListingDiff.vue:4,36-40`；后端 `diffVersions` `data-store-listings.mjs:1555-1562`） | 只读 |
| **图片矩阵/合规/发布前检查** | 锚点 `#assets`(GenerationBlock 内) `#compliance`/`#preflight`(WorkbenchPanel 内) | 后端 `buildAssetMatrix/buildComplianceReport/buildReadiness`，全部 `mock.m1_listing_ops.v1`（`data-store-listings.mjs:1104,1216-1496`） | 见上（图片真写、readiness 写 audit 不写 Amazon） |

## 三、孤儿/遗留代码（非当前主流程，须标注）

- **ListingList.vue**（`pages/ListingList.vue`）：**未在 router 注册**（无路由引用），纯 `mockSkus` 静态数据（`ListingList.vue:6,13`），且「进入优化室」跳 `?asin=` 旧式参数（`ListingList.vue:42-44`）。属遗留死页。
- **ListingExperiments.vue**（`pages/ListingExperiments.vue`）：旧 A/B 页，路由已重定向到 `/listings/ab`（`router/index.js:14`）。**纯 mock**（`mockExperiments`，`ListingExperiments.vue:6,12`），「启动新实验」无 handler（`ListingExperiments.vue:45`），adoptWinner 只发 `useAudit` 假审计。已被 ListingAbCenter 取代。
- **ImagePromptEditor.vue**（`components/m1/ImagePromptEditor.vue`）：存在但**无任何页面/组件 import**（仅 docs 引用），死组件。
- **PromoteToManual.vue**：虽在种子列表，但其路由 `/ads/promote-to-manual` 属 **M3 广告域**（`router/index.js:90`），不属本 M1 域。

## 四、域级结论

- 真实 DB（SQLite，8 张 `m1_*` 表 `data-store-listings.mjs:37-207`）+ 真实写入 + 全程 audit 的：targets、research、scores、runs、versions、images、ab_tests/metrics、readiness/combinedPick/adoptWinner。
- 但「真实」均为**确定性 mock 业务逻辑**：研究/评分用 `mulberry32` 伪随机；文案生成是后缀变异非 LLM（`mutateField` `data-store-listings.mjs:981-988`）；图片是 picsum 占位且**同步 completed 无异步队列**；A/B metrics 是 mock 生成、z-test 真算。
- **没有任何真正写回 Amazon 的语义**：workbench/assets/compliance 标 `source:'mock.m1_listing_ops.v1', mock:true`；adoptWinner 显式 `uploadedToAmazon=false / publishAdapterRequired='SP-API'`（`data-store-listings.mjs:1862-1873`）。
- 前端对所有读接口做 `.catch` 回退 + `sourceMeta/confidence` 标注，便于后续替换真数据（`useM1State.js:144-175`；`api/m1.js:303-329`）。

## 第 1 轮

## M1 Listing 作战室 — 第 1/10 轮辩论记录

### 交锋焦点：M1 是「演示态闭环」还是「可发布/可决策系统」？
四位角色高度一致地立靶：**M1 的 UI 链条看似闭环，落到代码是「演示态闭环」**。我已逐条核验关键代码，主张全部成立：

- **采纳 Winner 不写回 Amazon（PM-A / PM-B / 开发 / 测试 四方共证，P0/P1）**：`data-store-listings.mjs:1862` guidance 明文 "Winner adoption only prepares a manual publish package. SP-API publish adapter required before uploaded_to_amazon can be set."，`:1874-1876` 状态置 `ready_for_manual_publish`、`uploadedToAmazon:false`。前端 `useM1State.js:541` 却弹 success「已采纳获胜版本」，`ListingAbCenter.vue:105-123` 无该状态映射 → 列表显示裸英文 + success 误导。**已核验属实。**
- **A/B 是预设结果的伪实验（PM-A / PM-B / 测试，P0）**：`startAbTest` 一启动即 `DELETE` 旧 metrics 并回填 14 天×2 臂 mock（`:1793-1808`），且 **treatment 基线 0.115 > control 0.10 被系统性预设更高**（`:1799` vs `:1803`）→ treatment 几乎必赢。`getAbMetrics` 在 `metrics.length>=14` 时 GET 即写副作用把 running 改 completed（`:1842-1848`），ends_at 却设在未来 14 天（`:1781`），「进行中」与「已到期」脱钩。`amazon_experiment_id` 恒为 null（`:1721`）但 UI subtitle 写死「亚马逊原生 A/B · 14 天 · z-test」。**PM-B 主张「伪造、结果预设的实验被包装成亚马逊原生」核验属实。**
- **双版本 cache 不同步（开发，P0，新增系统性病灶）**：`useTargetFlow` 生成新版本只 `unshift` 进 `_flowCache.s.versions`（`useM1State.js:226`），`VersionBlock` 渲染独立的 `_versionsCache.list`（`:326-349`），两 store 互不写入，`useVersions.fetch` 有 `loaded` 短路（`:344`）。→ 生成后版本列表不刷新、workbench/A-B 读到过期版本。**核验属实，是本轮唯一被开发单独揭出的纯工程 P0。**
- **真实性标签反置（PM-B，P0）**：`ResearchBlock.vue:41` `source: raw ? 'api' : 'mock'` — 只要 DB 有 `triggerResearch` 写入的 PRNG 伪造 evidence（`data-store-listings.mjs:558-582`），前端就标「api 真实」；真正的静态兜底反标「mock」。**核验属实，标签语义完全反置。**

### 审计语义不一致（PM-B 单独揭出，开发/测试附议，P1/P2）
`combinedPick` 仅在本地建组合版本（`uploaded_to_amazon=0`），却写 `actionType='M1_LISTING_UPLOAD'`（`:1606`）— 审计谎称「已上传 listing」；而 `adoptAbWinner`（`:1864`）诚实写 `M1_AB_ADOPT_WINNER` + `uploadedToAmazon:false`。**同一模块对「上传」诚实度天差地别，核验属实。**

### 护栏后端缺失（PM-B / 测试，P1/P2）
`createRun`（`:994-996`）对 `is_competitor_only` 有拦截，但 `createAbTest`（`:1703-1734`)**完全不校验** target 是否 external/competitor，也不校验 controlVersionId/treatmentVersionId 是否存在、归属、互异。前端 disabled（`ListingAbCenter.vue:279`）可被直接打 API 绕过。**测试指出 readOnly 判定有三套口径（后端 is_competitor_only / m1.js:360 asin_kind / AbCenter disabled）互不等价，核验属实。**

### 孤儿页 / 悬空入口（PM-A / 开发，P1/P2）
- `ListingExperiments.vue` 已被 `router/index.js:14` redirect 死代码、纯 mock、按钮无 handler。
- `ListingList.vue` 无路由、`openOptimize` 用 query asin 但路由要 `:id` params → 进去被弹回 select。
- `M1ResourceHub.vue:118` 「进入作战室」跳无 id 的 `/listings/optimize` → 警告 toast + 踢回 select。
- `ListingOptimize.vue:29-38` navItems 声明 8 锚点，模板仅渲染 5 区块、仅 #research/#versions 有真实 id → assets/compliance/preflight 点击静默不滚动。**四处悬空核验属实。**

### PromoteToManual 归属争议（PM-A / PM-B / 开发 三方，P1）
该页 `sourceModule:'M3'` 却在 M1 种子集合，`/ads/*` 路由下；纯前端 mock、`doSubmit` 只写审计无真实 ads-api 调用、不进 `ad_action_queue`；预期影响系数硬编码（`sales30d*0.4`）。**三方一致认为归属混乱 + 「确认提交无真实副作用」构成误导，核验属实。** 注意：此页若真要执行广告动作，必须走 ad_action_queue（安全不变量）。

### 被反驳/预先立靶的观点
四方一致预先反驳「这些只是 mock 不算问题」：在**无任何 UI 风险标注**下，卖家会据此做真实预算/上架决策 → 构成业务风险而非纯演示。本轮无人持反方，该立靶暂未被挑战，留待后续工程视角是否提出「演示态可接受」反论。

- 共识: 采纳 Winner 不写回 Amazon：adoptAbWinner 仅生成手动发布包，uploaded_to_amazon 恒 false（data-store-listings.mjs:1862/1874），但前端弹 success「已采纳获胜版本」且无 ready_for_manual_publish 状态映射，属误导——四角色一致，符合安全不变量（无凭证不得伪装 real）; A/B 实验为预设结果的伪实验：startAbTest 启动即回填 14 天 mock 且 treatment 基线(0.115)系统性高于 control(0.10)，getAbMetrics 在 GET 时写副作用秒判 completed，amazon_experiment_id 恒 null 却 UI 宣称「亚马逊原生 A/B」——PM-A/PM-B/测试一致; 真实性标签反置确为缺陷：ResearchBlock.vue:41 source 基于「有无 raw」判 api/mock，导致 PRNG 编造的 evidence 被标为真实 api，静态兜底反标 mock; 双版本 cache 不同步是真实工程缺陷：useTargetFlow(_flowCache) 与 useVersions(_versionsCache) 是两套独立 store，生成新版本后 VersionBlock 不刷新（已核验 useM1State.js:226 vs 326-349）; createAbTest 写路径缺后端护栏：不校验 target external/competitor、不校验 version 存在性/归属/互异，前端 disabled 可被绕过——护栏必须后端兜底; 审计语义不一致：combinedPick 误用 actionType='M1_LISTING_UPLOAD'（data-store-listings.mjs:1606）会让审计中心误判 listing 已上线; 存在多处孤儿页/悬空入口：ListingExperiments(死代码 redirect)、ListingList(无路由+错误跳转)、M1ResourceHub「进入作战室」无 id、ListingOptimize 3 个 navItems 锚点无对应 DOM 区块; PromoteToManual 归属混乱(sourceModule M3 却在 M1)且提交无真实副作用，预期影响系数硬编码无依据
- 分歧: 采纳 Winner/发布前检查「只生成手动包不写回」的定性：PM-A 主张 P0(后果是真实销售损失)，开发/测试更多定为 P1(状态机+文案修复)。共识是必须 UI 强标注，但严重级未统一; A/B 「启动即回填 14 天 mock+秒判 winner」该如何处置：是允许的演示数据(只需加 mock 横幅)，还是必须改为按 ends_at 渐进生成、未到周期不出 winner(工程改动大)——运营视角认为污染决策，工程视角可能认为 mock 无害; 孤儿页(ListingExperiments/ListingList)处置：直接删除以减维护/误导面，还是补接真实数据保留(涉及 M1 选品漏斗顶部是否要独立列表页); 真实性标签策略全域裁决：按「有无后端记录」判 api/mock(现状会把编造标成真)，还是强制所有 mock 写 sourceMeta.mock=true 并由前端唯一信任该字段; manual A/B 创建契约：现状「落库+422」(污染数据且前端以为失败)，应改为「201+manualRequired 标志」还是「422 时不落库(先校验后写)」——影响幂等与 list 更新; winner='control'(原版更优)是否算需采用的合法结论：当前 UI 仅 treatment 胜可采用，可能丢失「维持原版」决策路径
- 决策: 确认安全不变量已被遵守的部分：adoptAbWinner 诚实标 uploadedToAmazon:false/amazon_receipt:null/SP-API required，未伪装 real——此处方向正确，仅需补前端状态映射与文案，不得改成自动写回; 确认违反「不得伪装 real」的部分必须修复：A/B UI 宣称「亚马逊原生」但 amazon_experiment_id 恒 null、ResearchBlock 把编造数据标 api、Workbench「真实快照」文案——这些是伪装 real，本轮裁定为需修缺陷; combinedPick 的 actionType 必须从 M1_LISTING_UPLOAD 改为组合语义(如 M1_VERSION_COMBINE/M1_COMBINED_PICK)——审计绝不能谎称 upload; 写路径护栏(external ASIN / version 归属)必须后端兜底，不能只靠前端 disabled——确立全域硬约束; PromoteToManual 若涉及真实广告动作必须走 ad_action_queue，当前纯审计无副作用属误导；归属(M1 vs M3)需 PM 拍板，倾向归 M3

## 第 2 轮

## M1 Listing 作战室 — 第 2/10 轮 可读证据

### 一、四角色立场与新证据

**产品经理A(增长/转化)**：把每个缺陷换算为卖家真金白银损失。
- 升级"采用Winner"为 **P0**：onAdoptWinner(ListingAbCenter.vue:140-152) 先 useAudit.submit 写一条 expectedImpact:{metric:'cvr_lift'} 审计，再调 adoptWinner，useM1State.js:541 弹「已采纳获胜版本」success；但后端 uploaded_to_amazon 恒 false、status='ready_for_manual_publish'(data-store-listings.mjs:1870-1876),详情抽屉(322-372)无该状态映射、manual_guidance 仅 manual_required 分支显示、采用后无"去 Seller Central 发布"指引。卖家以为赢版已上线，真实 listing 纹丝不动 = 持续真实销售损失。
- A/B treatment 基线偏置(0.115 vs control 0.10)是"有毒数据"，会诱导卖家形成"每次改版稳涨10%"的错误增长认知，主张 P1 起步并去偏置。
- PromoteToManual 的 expectedImpact 用 sales30d*0.4 等硬编码系数会误导扩量决策。

**产品经理B(风险/合规/真实性)**：核查"伪装 real"载体。
- **新增最强证据**：triggerResearch 用 PRNG 编造竞品统计(字符数/相似度/样本数)写入 m1_research_reports，source 列**写死 'auto'**(data-store-listings.mjs:589)，全表无 mock/sourceMeta 列。ResearchBlock.vue:42 `source: raw ? 'api' : 'mock'` → 编造数据标绿"真"、诚实兜底标"假",标签**完全反置**。定 P0,且指出"这不是判定策略问题，是 schema 缺字段问题"。
- 细化"采用Winner"分歧：后端 adoptAbWinner 本身**诚实**(uploaded=false/receipt=null);真正缺陷在前端 onAdoptWinner 预写不含诚实字段的审计 + statusLabel 无映射 → "诚实的后端被不诚实的前端覆盖"。
- 补充正面：checkListingReadiness 对 external 返回 blocked/EXTERNAL_ASIN_READ_ONLY(1426-1428) 是权威实现，但全域有三套 readOnly 口径(后端 / m1.js:360 / AbCenter:279)未收敛。

**资深开发(契约/状态机)**：逐行复核，纠正两处事实。
- **纠错(被反驳)**：上一轮"ListingOptimize 3 个 navItems 锚点无对应 DOM"被指为部分失实——dev 称 workbench/compliance/preflight 的 id 在 ListingWorkbenchPanel 内、assets 在 GenerationBlock 内,8 锚点均可命中,真实问题仅是 v-else-if="workbench" 包裹下 loading/错误态点击落空(降为 P3)。**主持人复核**：ListingOptimize.vue:131-137 页面级仅渲染 Workbench/Research/Score/Generation/Version 五块,assets/compliance/preflight **无页面级区块**——dev 的"id 藏在子组件内"需在下一轮逐 id 核验(ListingWorkbenchPanel:51/146/160、GenerationBlock:173/229),在核验前 PM-A 的"合规/发布前检查闭环 UI 缺失"与 dev 的"锚点能命中"并存,合并为 carryForward。
- **补强(被三方确认)**：manual A/B 是"静默写入+UI 不可见+可无限重复写"三重缺陷——createAbTest:1716 先 INSERT 再返 _manualRequired,route:294-298 转 422,client.js:50 reject,useM1State.create catch(488) 弹 warning、list.unshift(481) 永不执行;且 manual 分支无去重(对比 combinedPick 有 hash 去重)。
- 第三处 cache 不同步：GenerationBlock 生成走 _flowCache、combinedPick 走 _versionsCache,双向断链。
- 反驳"A/B mock 无害论"：getAbMetrics GET 写副作用导致"详情看过变 completed、列表仍 running"的读写撕裂,是确定的 P1 状态不一致。

**测试工程师(可验证性)**：把结论转成红/绿断言,暴露不可测处。
- **新增**：ListingExperiments.vue 是**未注册路由的死页**(router/index.js 无引用),内置第二套 adoptWinner 仅写审计无副作用;加上 AbCenter 前端审计 'ADOPT_AB_WINNER' + 后端 'M1_AB_ADOPT_WINNER' = 同一逻辑动作 **3 个 actionType 字符串、2 条写路径**,审计无法单一断言核对。
- **升级 external 写护栏为 P0**：createRun 对 is_competitor_only 有硬护栏(994-995),但 createAbTest(1703-1734)/combinedPick 完全不校验 external/版本归属/互异,可直接 POST 对 external ASIN 建实验,前端 disabled(279) 可绕过 → 违反"护栏必须后端兜底"。
- startAbTest 混入 Math.random()(1797-1803)+Date.now()(1781/1786),数值与日期随墙钟漂移,**无法 golden-snapshot 断言**;且 winner='control' 后端支持(1860)但前端按钮锁死 treatment(252) = 后端能力与前端入口不一致的可测 bug。

### 二、主持人代码复核结论
- ✅ A/B treatment 基线偏置:确认 data-store-listings.mjs:1799(0.10) vs 1803(0.115)。
- ✅ getAbMetrics GET 内 UPDATE status='completed':确认 1842-1848,条件 metrics.length>=14,而 startAbTest 一次回填 14 天 → 首次 GET 即秒判。
- ✅ createAbTest 仅校验 4 字段非空 + getTarget 存在(1704-1708),无 external/版本归属/互异校验。
- ✅ manual"先 INSERT(1716)后 422(route:298)"链路确认,且无去重。
- ✅ amazon_experiment_id 恒 null(1721)。
- ⚠️ ListingOptimize 页面级仅渲染 5 块(131-137),assets/compliance/preflight 子组件 id 归属待逐 id 核验。

### 三、本轮交锋焦点
1. "采用Winner"P0 vs P1：PM-A 坚持 P0(销售损失+既成事实);PM-B/dev 拆分为"后端诚实(P1 文案)+前端审计撒谎(独立缺陷)",三方实质共识"前端 onAdoptWinner 预写审计 + 缺 ready_for_manual_publish 映射"必修,争点仅在标签级别。
2. external 写护栏:测试工程师定 P0(可绕过+无后端兜底),与 dev/PM-B 的 P1 形成级别分歧。
3. A/B 整体:PM-B 升 P0(伪实验触达真实销售动作),dev/测试定 P1(读写分离+去随机),工程派已放弃"加横幅即可"的无害论。

- 共识: triggerResearch 的真实性标签反置是确凿缺陷:后端 source 写死 'auto'(data-store-listings.mjs:589)、全表无 mock 列,ResearchBlock.vue:42 用 `raw ? 'api':'mock'` 导致编造数据标绿'真'、诚实兜底标'假'。根因是 schema 缺真假信号字段,违反'无凭证不得伪装 real'不变量。; combinedPick 审计 actionType 误用 M1_LISTING_UPLOAD(data-store-listings.mjs:1606),而该函数只生成本地草稿版本 uploaded_to_amazon=0(1602),审计中心会误判 listing 已上线,污染发布率/合规口径,必须改为 M1_VERSION_COMBINE 类语义。; A/B 实验链路存在系统性伪装 real:treatment 基线 0.115 高于 control 0.10(1799/1803)使 treatment 近乎必胜;getAbMetrics 在 GET 内 UPDATE status/winner(1842-1848)破坏读写分离与幂等;amazon_experiment_id 恒 null(1721) 却 UI 宣称'亚马逊原生 z-test'(AbCenter:180)。横幅不足以补救,需去偏置+读写分离。; 后端 adoptAbWinner 本身诚实(uploaded_to_amazon=false/amazonReceiptId=null/status='ready_for_manual_publish',1870-1876),遵守安全不变量;缺陷在前端层。; 前端 onAdoptWinner(AbCenter:140-152) 预写一条不含诚实字段的 expectedImpact 审计、且 statusLabel(105-123) 无 ready_for_manual_publish 映射、success 文案'已采纳获胜版本'(useM1State:541) 暗示已上线 —— 三者叠加构成误导,必须修复(删前端预写审计、补状态映射、改文案为'仅生成手动包未写回 Amazon')。; manual A/B 创建是'落库(1716)+422(route:298)+前端当失败+无去重'的复合缺陷,需要前后端统一为单一契约。; createAbTest/combinedPick 缺后端写护栏(不校验 external/版本归属/互异),前端 disabled 可被直接 POST 绕过,必须后端兜底(对齐 createRun:994-995 的 external 硬护栏)。; 存在双/三套并行 A/B 入口与审计写路径:ListingExperiments.vue 是未注册路由的死页(仅 mock+审计无副作用),AbCenter 前端审计 'ADOPT_AB_WINNER' 与后端 'M1_AB_ADOPT_WINNER' 并存,审计无法单一断言。; PromoteToManual 提交仅写审计、无 ad_action_queue 入队、sourceModule 标 M3 却置于 M1、expectedImpact 系数(0.4)硬编码无依据 —— 违反'不得绕过 ad_action_queue'不变量,UI 不得呈现为已执行。; M1ResourceHub '进入作战室'按钮(118) router.push('/listings/optimize') 不带 targetId,落地即被 ListingOptimize:58-62 warning 踢回 select 页,'补给线/闭环'宣称在数据层未打通。; 存在双 versions cache 不同步(_flowCache vs _versionsCache),GenerationBlock 生成与 combinedPick 写入不在同一数组,VersionBlock/Workbench 双向不刷新。; winner='control'(维持原版更优)后端已支持(adoptAbWinner:1860)但前端按钮锁死 treatment(AbCenter:252),丢失合法决策路径,属后端能力与前端入口不一致。
- 分歧: '采用Winner'严重级:PM-A 坚持 P0(预写 cvr_lift 审计+无状态映射+无后续指引=既成事实误导+真实销售损失);PM-B/dev/测试拆分为'后端诚实(P1)+前端审计撒谎(独立缺陷,P1 偏上)'。分歧在整体定 P0 还是拆成两条 P1。; external/竞品写路径护栏严重级:测试工程师定 P0(可绕过+无后端兜底+可对 external 建实验/组合版本);dev/PM 倾向 P1。; A/B 整体严重级:PM-B 升 P0(伪实验经'采用Winner→生成手动包→改 listing'触达真实销售动作);dev/测试定 P1(读写分离+去偏置+去随机即可)。; manual A/B 契约二选一:'201+manualRequired:true'(PM-A/PM-B/dev 倾向,落库一次+列表可见+可跟踪,需配 create 成功路径 unshift+去重) vs '先校验后写、422 不落库'(测试可写'GET /ab 数量不变'断言,但丢失 manual 实验记录)。两者测试断言互斥。; ListingExperiments/ListingList 死页处置:直接删除(PM-A/测试主张,消除双入口+false-positive 绿测) vs 保留补接真实数据。; ListingOptimize 锚点定性:dev 称 8 锚点 id 全在子组件内可命中(降 P3,loading 态落空) vs PM-A 称 assets/compliance/preflight 区块根本未渲染(P1,合规闭环 UI 缺失)。主持人复核:页面级仅 5 块,子组件 id 归属待逐 id 核验。; A/B 状态固化时机三选一:显式 finalize 端点(dev/测试强烈倾向,GET 永不改状态) vs ends_at 到期 vs metrics 足量。未定则无法写'running 不应在 GET 后变 completed'稳定断言。
- 决策: 真实性标签全域裁决:采纳 PM-B/dev 方案 —— 后端所有 mock/PRNG 生成路径强制写 sourceMeta.mock=true(research 表补 is_mock/source_meta 列),前端唯一信任该字段判 api/mock,禁止用'有无 raw'推断。理由:符合'无凭证不得伪装 real'不变量,且根治 ResearchBlock 标签反置。; combinedPick actionType 改为 M1_VERSION_COMBINE(非 UPLOAD);审计渲染层增加校验:upload 类 actionType 必须带 amazon_receipt,否则不得渲染为'已发布'。; A/B 处置定为必修(去偏置 + 读写分离),不接受'仅加横幅':(a)消除 treatment 基线偏置或显式标注'合成乐观示例';(b)getAbMetrics 改为只读,状态固化迁到显式 POST /ab/:id/finalize 或按 ends_at 调度;(c)amazon_experiment_id 为 null 时强制显示'合成演示数据'横幅并禁止'亚马逊原生'字样。; 采用Winner前端修复定为必修(级别留待 PM 终裁,本轮锁定动作清单):删除前端 onAdoptWinner 预写审计、统一以后端 M1_AB_ADOPT_WINNER 为准;补 ready_for_manual_publish 状态映射('待手动发布'橙色);success 文案改'已生成手动发布包,需在 Seller Central 手动发布(未写回 Amazon)';为该状态加'查看/复制发布包'按钮。; external/竞品写护栏后端兜底(级别按 P0 处理,与测试工程师一致,因可绕过且触及真实写语义边界):createAbTest/combinedPick 入口校验 is_competitor_only/asin_kind==='external' 直接 422 不落库,并校验两 version 存在+归属 target_id+互异。; 提取单一权威 isReadOnly(target)=is_competitor_only||asin_kind==='external',后端导出、前端 AbCenter/readiness/workbench 复用,收敛三套口径。; winner='control' 提供采用/'维持原版'入口:按钮条件改为 winner!==null,control 胜走 control_version_id(已支持 1860),消除前端不可达。; PromoteToManual 归属裁定为 M3:在 M1 域内仅作占位,UI 明示'草案/未执行';涉真实广告动作必须走 ad_action_queue 形成'草案→执行'两态;expectedImpact 系数必须标注'估算假设'或来源,不得呈现为精确预测。

## 第 3 轮

## M1 Listing 作战室 — 第 3/10 轮辩论记录

本轮四角色证据已由主持人独立抽查复核(data-store-listings.mjs:1564-1610/1703-1734/1775-1850、ResearchBlock.vue:41、ListingAbCenter.vue onAdoptWinner),核心 file:line 全部坐实。本轮基调:从"读源码猜测"升级为"现有绿测已把缺陷锁成期望值",修复风险被显著抬高。

### 一、本轮新增的关键升级与坐实
- **测试工程师提供"绿色护城河"证据(最强增量)**:tests/qa/m1-button-level.test.mjs 实测显示——(a) adopt-winner 测试(703)能通过的唯一原因,是其前序的 metrics GET(690)在 `getAbMetrics`(data-store:1842-1848)内偷偷把 running→completed,即"GET 副作用是测试通过的隐性前提,不是 bug 旁支";(b) manual A/B 测试(636-646)已断言 `422 且取 body.id`,把"落库+422"锁成期望;(c) combinedPick 的 `actionType=M1_LISTING_UPLOAD`(1606)被 0 条测试断言,改名零回归。这把多条 P1 的"修复=必然红测"风险摆上台面。
- **PM-B 把上轮"schema 缺字段"裁决从『待实现』拉到『已有现成范式只差贯通』**:前端 m1.js(:202/:444/:498-504)已落地 `sourceMeta.mock=true` 诚实范式并被 normalizeApiWorkbench(:308-329)透传,但后端 triggerResearch(:589 写死 'auto')与 startAbTest(PRNG)两条"会被运营当真"的路径未接入。裁决方向由此明确:**下沉前端已有范式到后端表,而非从零设计**。
- **三方共同坐实的四条硬缺陷**:① ResearchBlock:41 `raw?'api':'mock'` 标签反置(编造数据标绿"api 真"、诚实兜底标"mock 假");② combinedPick actionType 误用 UPLOAD 但 `uploaded_to_amazon=0`(1602 vs 1606);③ 双 versions store 不同步(_flowCache:122 vs _versionsCache:326);④ createAbTest/combinedPick 后端零 external 护栏,前端 disabled 可被直接 POST 绕过(对照 createRun:994-995 有硬护栏)。

### 二、主要交锋点
- **『采用Winner』严重级 — P0(PM-A/PM-B 坚持)vs 拆两条 P1(dev/测试上轮立场)**:PM-A/PM-B 论证这是一条贯穿前后端的 P0 真实性事故链:treatment 基线 0.115>control 0.10(1799/1803)系统偏置→伪 winner;GET 副作用判 completed(1842);前端 onAdoptWinner 预写 `ADOPT_AB_WINNER`+`cvr_lift` 审计(AbCenter:144-148,无诚实字段)与后端 `M1_AB_ADOPT_WINNER`(1864)双写;success 文案"已采纳获胜版本"(useM1State:541)+statusLabel 无 `ready_for_manual_publish` 映射+按钮锁死 `winner==='treatment'`(252,control 胜不可达)→运营据此真去 Seller Central 改 listing=真实销售损失。**测试工程师本轮给出关键裁决依据**:后端诚实被 703 逐字段断言,但前端预写审计 0 测试覆盖,后端绿测制造"adopt 链路安全"的 false-positive 错觉——并附条件:若 PM 认定"前端预写审计=既成事实误导且零覆盖"则应升 P0。dev 亦在本轮逐 id 复核后将 adopt 列为 P0。**主持人裁决:P0**(零覆盖 + 既成事实审计 + 无后续指引 + 真实销售决策入口,符合"无凭证不得伪装 real"被违反的判据)。
- **external 写护栏严重级 — P0(PM-B/dev/测试)vs P1(部分倾向)**:三方一致 P0(可绕过 disabled 直接 POST + 触及"对非自有 listing 生成可发布草案"的真实写语义边界 + 当前 0 越权测试覆盖)。**主持人裁决:P0**。
- **PromoteToManual 严重级 — P0(PM-A 本轮新主张,PM-B 附议)vs 可能"只是 mock 页"**:PM-A 升级理由:M1 域唯一明示"帮你赚钱(+XX/月)"的页面,`sales30d*0.4` 系数凭空(:80)、候选全 mock(:7)、doSubmit 仅 submit() 不入 ad_action_queue(:74-85)、提交后清空无草案态、sourceModule 标 'M3' 却在 /ads 路由。"假装赚钱"比"假装上线"对信任杀伤更直接。**主持人裁决:P0**(直接违反"不得绕过 ad_action_queue"不变量,且营造已执行真实广告动作的错觉)。
- **PM-A 自我让步(本轮唯一主动撤回)**:撤回上轮"ListingOptimize assets/compliance/preflight 区块未渲染→P1 合规闭环 UI 缺失"。dev 逐 id 核验 8 锚点全部命中且 compliance/preflight 有真实内容(WorkbenchPanel:146/160 等),PM-A 让步降为 **P3**(仅 loading 态 anchor-bar 在 workbench 未就绪即渲染、scrollToAnchor 静默 no-op)。dev 同时给自己上轮"锚点全可命中"打补丁:loading 态确有交互落空。

### 三、被反驳/修正的观点
- "全域都没真假信号" → 被 PM-B 反驳修正为"前端已有 sourceMeta.mock 范式、后端两条高风险路径(research/ab_metrics)未贯通"。
- "加横幅即可解决 A/B 伪装" → 被测试工程师反驳:测试结构本身依赖 GET 副作用(703 依赖 690),轻量方案不成立,必须迁 finalize 端点。
- "adopt 后端诚实=链路安全" → 被测试工程师反驳为 false-positive:前端预写审计零覆盖是温床。
- PM-A 上轮"合规闭环 UI 缺失 P1" → 被 dev 推翻、PM-A 自行撤回为 P3。

- 共识: ResearchBlock.vue:41 `source: raw ? 'api' : 'mock'` 标签反置确凿:后端 triggerResearch PRNG 编造数据(data-store-listings.mjs:560-582)因有 raw 被标绿'api(真)'、诚实兜底因无 raw 被标'mock(假)'。修复方向:后端 research 表补 is_mock/source_meta 列,所有 PRNG 路径强制写 mock=true,前端唯一信任该字段,禁用'有无 raw'推断。; combinedPick actionType 误用确凿:生成 uploaded_to_amazon=0 的本地草稿(data-store-listings.mjs:1602)却写 actionType='M1_LISTING_UPLOAD'(:1606),审计中心会误判已上线、污染发布率口径。改为 M1_VERSION_COMBINE 被 0 条测试断言、零回归风险,应立即做。; createAbTest(1703)与 combinedPick(1564)后端零 external/竞品(is_competitor_only||asin_kind==='external')护栏,前端 disabled/JS 校验可被直接 POST 绕过,对照 createRun(994-995)已有硬护栏。须后端兜底返 422 不落库。; getAbMetrics 是 GET 端点却在读路径内 UPDATE status/winner/lift(data-store-listings.mjs:1842-1848),破坏读写分离与幂等,running 实验被一次详情查看翻成 completed;且现有 adopt 测试(703)依赖该副作用作为通过前提。; A/B treatment 基线 0.115 系统性高于 control 0.10(1799/1803)=合成乐观偏置使 treatment 近乎必胜;amazon_experiment_id 恒 null(1721)而 UI 副标题宣称'亚马逊原生 z-test'(AbCenter:180),违反'无凭证不得伪装 real'。; 前端 onAdoptWinner(AbCenter:144-148)在调后端前预写一条 ADOPT_AB_WINNER+cvr_lift 审计(无诚实字段),与后端 M1_AB_ADOPT_WINNER(1864)构成同一动作双写双命名,审计中心无法单一断言'是否上线';且前端预写审计 0 测试覆盖。; 双 versions store 不同步确凿:_flowCache.versions(run 生成,:226) vs _versionsCache.list(combinedPick 生成,:411),AbCenter 创建抽屉第三处独立 fetch,组合版本生成后 GenerationBlock/VersionBlock 不刷新;ListingOptimize.latestVersion 读 _flowCache.versions(:22-23)导致 runPreflight 校验旧版本而非刚组合的新版本。; PromoteToManual doSubmit(:74-85)仅 submit() 写审计、不入 ad_action_queue、不调任何广告 API,违反'不得绕过 ad_action_queue'不变量;数据全来自 mockPromotionCandidates(:7),expectedImpact 系数 sales30d*0.4(:80)凭空无来源。; ListingOptimize 8 锚点 DOM id 全部存在且挂在已 mount 组件,PM-A 上轮'compliance/preflight 区块未渲染'为误判,降为 P3(仅 loading 态 anchor-bar 提前渲染致 scrollToAnchor 静默落空)。; ListingExperiments.vue/ListingList.vue 是未注册路由的死页,构成与 AbCenter 并行的第二套 A/B 入口幻影,且死页若被测试 import 会产生 false-positive 覆盖率。; 前端 mock 层已落地诚实范式(m1.js:202/444/498-504 写 sourceMeta.mock=true),修复策略应是把该范式下沉到后端 research/ab_metrics 表,而非从零设计。
- 分歧: manual A/B 契约二选一未拍板:'201+manualRequired:true+前端 unshift'(回归断言:POST 后 GET 数量+1 且 status=manual_required)vs '422 且后端不落库'(回归断言:数量不变)。两者回归断言互斥。当前是最坏第三态'落库+422+前端当失败+测试默认 422 合法'(636-646 已锁 422+取 body.id),DB 有记录/UI 看不见/测试还绿三方不一致。测试工程师从回归成本明确倾向 201 方案(422 不落库会破已绿测试 636)。需 PM+架构师本轮后单一终裁。; A/B 状态固化时机三选一未定稿:显式 POST /ab/:id/finalize(dev/测试/PM-B 共同强支持,唯一能写'GET 永不改状态'+'finalize 前 adopt 被拒'稳定断言)vs ends_at 到期 vs metrics 足量自动固化(后者无法写稳定断言)。需架构师拍板以确定回归断言。; 双 versions store 处置范围:合并单一 targetId-keying store(回归面大:GenerationBlock/VersionBlock/WorkbenchPanel/AbCenter 抽屉)vs 事件总线 invalidate(targetId) 低风险首修。dev 倾向先事件总线后合并;是否引入 targetId 维度 keying 未定。; startAbTest 去随机(mulberry32 种子+started_at 派生 baseDate 替代 Math.random/Date.now)是否纳入本轮:不去则 A/B 数值层永久无法 golden-snapshot 回归,与 finalize 端点是配套项。测试工程师视为硬约束。; 真假信号范式下沉是否同时改造 score 路径(data-store:632-637 同为 PRNG):PM-B 提出但范围未定。; M1ResourceHub'补给线/闭环'文案处置:实现 keyword/voc query 注入的'带入作战室'按钮(联动)vs 文案降级标'未联动(占位)'——需选定。
- 决策: 『采用Winner』链路定 P0:删除前端 onAdoptWinner 内预写审计(AbCenter:144-148),唯一信任后端 M1_AB_ADOPT_WINNER 单一写路径;补 statusLabel ready_for_manual_publish→'待手动发布'(橙)映射;success 文案改'已生成手动发布包,需在 Seller Central 手动发布(未写回 Amazon)';按钮条件由 winner==='treatment'(252/264)改为 winner!==null 并按 control/treatment 取对应 version_id。依据:既成事实审计+前端预写审计零测试覆盖(false-positive)+无后续指引+真实销售决策入口。; external 写护栏定 P0:提取权威 isReadOnly(target)=is_competitor_only||asin_kind==='external' 后端导出;createAbTest/combinedPick 入口命中即返 external_asin_cannot_optimize(422,与 createRun 一致)不落库;并校验 controlVersionId/treatmentVersionId/fieldPicks 引用的 version 存在+归属同 target_id+control≠treatment;route 补 422 分支。; PromoteToManual 定 P0:涉真实广告动作必须走 ad_action_queue 形成草案→执行两态,doSubmit 只产出 draft 不得伪装已执行;按钮文案改'生成手动转化草案(未写回 Amazon)';expectedImpact 0.4 系数标注'估算假设(经验系数,非预测)'或删除;sourceModule 与路由归属统一(广告动作归 M3,审计 actionType 须可单一断言);提交后给可追踪草案记录而非清空。; combinedPick actionType 立即改为 M1_VERSION_COMBINE(零回归风险);审计渲染层加强校验:upload 类 actionType 必须带 amazon_receipt,否则不得渲染为'已发布'。; getAbMetrics 改为纯只读,GET 路径内禁止任何 UPDATE;状态固化迁到显式 POST /ab/:id/finalize 端点(写出'GET metrics 前后 status 不变'与'finalize 前 adopt 被拒'稳定断言);700 区测试重排为 start→finalize→adopt。; 真假信号:后端 research 表(m1_research_reports)与 ab_metrics 补 is_mock/source_meta 列,复用 m1.js 已有 sourceMeta.mock 范式下沉,所有 PRNG/mock 路径强制 mock=true;前端 ResearchBlock 唯一信任该字段判 api/mock,移除 raw 推断。amazon_experiment_id 为 null 时 AbCenter 强制'合成演示数据'横幅并删除'亚马逊原生 z-test'字样。; ListingOptimize 锚点闭环 UI 完整,定 P3:仅在 loading/无 workbench 态把 anchor-bar 也 gated 于 workbench 或加载期 disabled+tooltip,scrollToAnchor 找不到 el 时短延迟重试一次。撤回上轮 P1 合规闭环缺失主张。; ListingExperiments.vue/ListingList.vue 死页:直接删除(消除双 A/B 入口+false-positive 绿测);加 CI lint 规则'任何 .vue 既不在 router/index 也无被已注册组件 import 即失败'(glob+AST 静态断言)。
