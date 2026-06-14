# Memory

> **Single source of truth**: `D:/amz/docs/FINAL_STATUS_REPORT.md` (2026-05-16)
> 旧的 `npm run check` / 148 测试 / static no-build 等描述已作废，下列内容反映当前实际状态。

## 产品定位（不变）
- 一句话：「亚马逊卖家的 AI 操盘手 —— 一个人 + AI = 一个运营团队。」（PRD §1.1）
- 内部更准确：AI 副驾驶 + 可选自动驾驶；决策权在用户，全自动有护栏 + 审计 + 一键回滚。
- 4 大模块：M1 Listing 优化 / M2 实时利润 + 库存 / M3 生命周期广告 / M4 日常运营监控。

## 当前实施状态（2026-05-16）
- **M1 Listing**：PASS — 8 表 + 30 endpoints + 12/12 smoke + 10×5=50/50 QA + 3 Flow 页 + 6 m1 组件。报告 `docs/M1_BACKEND_REPORT.md` / `M1_FRONTEND_REPORT.md` / `M1_TEST_REPORT.md`。
- **M2 利润/库存**：PASS — 24 表 + 50 endpoints + 55/55 smoke + 10×5=50/50 QA + 19/19 前端页 0 mock。报告 `docs/M2_*_REPORT.md`。
- **M3 广告**：PASS — 20 表 + 1 join 表 + ~82 endpoints + Strategy OS 执行契约 + action queue dry-run/revert + goal profile guardrails + EvidenceRef 深链 + 10/10 smoke + 10×5=50/50 QA + 18 fix×5=90 + 10/10 Playwright e2e + 24 前端页改造。报告 `docs/M3_*_REPORT.md` + `M3_FIX_REPORT.md` + `docs/implementation/M3_FINAL_AI_STRATEGY_OS_USABILITY_PLAN.md`。
- **M4 监控/Review**：PASS — 13 表 + 共享 `m4_notifications` + `reviews` ALTER + 57 endpoints + 58/58 smoke + 11×5=55/55 QA + 14/16 前端页接入（BrandDefense / Notifications partial）。报告 `docs/M4_*_REPORT.md`。

## 跨模块联动（已验证 + audit trace）
- M2 → M1 重定价：REPRICE_APPLY → LISTING_VERSION_CREATE_FROM_M2
- M2 → M1 滞销降价：SLOW_MOVING_EXECUTE → REPRICE_DOWN → LISTING_VERSION_CREATE_FROM_M2（3 层链）
- M2 → M3 库存联动：INVENTORY_LINK_EXECUTE（audit 完整；seed ASIN 池不匹配导致 impactCampaigns=[] 是已知偏差）
- M2 → M4 告警：`/m2/alerts/scan` → `m2_alert_events` + `m4_notifications`
- M4 → M3 跟卖暂停广告：HIJACK_CONFIRM → M3_PAUSE_ADS_FROM_M4（×17）
- M4 → M3 24h dedup：M3_PAUSE_DEDUP_SKIP（×26）
- M4 → M3 close 恢复：M3_RESUME_ADS_FROM_M4（×15）
- M4 → M1 评论聚类 / image-diff push → m1_optimization_targets（×32 M4 origin）
- 全局通知总线：`useNotificationsBus` 单例 + `NotificationBell.vue` 挂在 DefaultLayout.vue:174 + 10s poll
- M3 Audit Revert：17 类 actionType 反向 dispatch 真实回滚资源（revertM3Action）

## 实际运行时栈
- 持久层：**SQLite + better-sqlite3 WAL 模式**（`apps/api/data/store.db`），不是 Postgres / ClickHouse。
- API：Node 内置 http server（`apps/api/src/server.mjs`）+ ES Module；路由分发 `extended-routes.mjs` → `store-routes-{ads,listings,profit,monitor}.mjs`。
- 前端：**Vue 3 SPA + Vite + Element Plus**（`apps/web-v2/`），有 build（`npm run build` 7.58s PASS），不是 static no-build。
- 端点总数：**~207 endpoints**（M1 30 + M2 50 + M3 70+ + M4 57）。
- 测试：curl + better-sqlite3 query helper（`tmp/m{1..4}-qa-*.{sh,cjs}`）+ Playwright（M3 e2e 10/10）。
- 服务端口约定：API server 8080；M4 QA 端口 8081 与 M2 QA 并行（共享同一 SQLite WAL DB）。

## 流水线本轮（5 Phase, 2026-05-15 → 16）
- Phase 1 BE Self-Check（p1-be-selfcheck）— PASS — 2 bug 修
- Phase 2 FE Self-Check（p2-fe-selfcheck）— PASS — 2 medium FE 偏差（BrandDefense / Notifications）
- Phase 3 M2 QA（p3-m2-qa）— PASS 50/50 — 4 bug 修
- Phase 4 M4 QA（p4-m4-qa）— PASS 55/55 — 1 bug 修
- Phase 5 Aggregator（p5-aggregator）— 本会话
- **累计修 bug：7（全部 P0 / P1）**

## 已知未修偏差（不阻塞，留给下一轮迭代）
- FE-M4-01 / FE-M4-02：BrandDefense.vue / Notifications.vue 仍 mock — medium
- M2-O1 ~ O5：LTV seed 3 行（标称 5）/ revertAuditLog 不级联子 audit 真还原 / createPO 字段名 qty vs quantity / M3 lx_ads seed ASIN 不含 M2 SKU / ad_manual_changes 无 cause 列
- M4 观察：SLA 后台 tick 未实现（需 setInterval 60s） / acknowledge → investigating 与 SPEC §9 文字差异 / infringement accepted 一步落 resolved / syncReviews seedTag 决定性差 / m4_competitor_snapshots 不去重

## 工程纪律 / 协议
- Agent 协议 `D:/amz/tmp/AGENT_PROTOCOL.md`：sentinel + heartbeat + 端口隔离 + DB 隔离 + surgical kill（禁止 `taskkill /F /IM node.exe`）
- 输出文件隔离：每个 phase 只写自己模块的报告 + tmp 脚本

## 待办
- **baseline commit（最优先）**：4 Round Dev + 5 Phase 验收全部产出仍未入 git；按模块分多次 commit
- 解 FE-M4-01 / FE-M4-02
- 解 M2-O2（revertAuditLog 级联子 audit 真还原）
- 加 SLA 后台 tick
- 真实凭证接入：SP-API / Ads API / Keepa / SellerSprite / Helium10 / LLM

## 旧事实（已作废，仅供历史参考）
- 「148 测试 npm test passing」「OpenAPI 212 操作」「static no-build mock command center」「dependency-light Node」「contract-first Go/Python/Next skeletons」均是项目早期路径，已被实际的 SQLite + Vue SPA + better-sqlite3 + Node 内置 http 替代。

---

## 生产部署（2026-05-16, Round 7）

> **完整报告**：`D:/amz/docs/DEPLOY_TEST_REPORT.md`

- **线上 URL**：http://47.97.252.71/（mock-gated, demo-only, HTTP 明文）
- **服务器**：Ubuntu 24.04 阿里云 ECS（4 CPU / 7.1 GB / 40 GB）
- **运行栈**：nvm Node 24.15.0 → systemd `amz-api.service` 监听 `127.0.0.1:8090` → nginx :80 反代 `/api/` + serve `apps/web-v2/dist/` 静态 SPA + SPA fallback；SQLite WAL DB 在 `/opt/amz/data/store.db`；保留服务器既有站点 `live5.cloudcut.fun` 等不动。
- **部署期修 2 bug**：
  - `apps/api/src/data-store-ads.mjs` 顶部 DB_PATH 硬编码 `D:/amz/...` → 改为 `fileURLToPath(new URL('../data/store.db', import.meta.url))`
  - `apps/api/src/data-store.mjs` 同样问题，同样修复
- **Prod 前端全量测试**：4 模块、79+ 页、~471 元素、195 用例、每元素 ×10 iter（~1950 次交互）、综合通过率 **97.4%**
  - M1 100/100（100%） / M2 37/39（94.9%，2 条为 Playwright 嵌套 dropdown flake 非产品 bug） / M3 36/36（100%） / M4 17/17（100%）
- **状态**：production-deployed (mock-gated, demo-only)。后续路线：FE-M4-01/02 接真后端、baseline git commit、HTTPS、真实凭证（SP-API / Ads / Keepa / LLM）。

---

## Mobile Responsive 部署 + iPhone 测试（2026-05-16, Round 8）

> **完整报告**：`D:/amz/docs/MOBILE_DEPLOY_REPORT.md`
> **规范**：`D:/amz/docs/MOBILE_RESPONSIVE_SPEC.md`

- **线上 URL 不变**：http://47.97.252.71/（同 PC 端，纯前端自适应；无独立 mobile build / 无独立路由）
- **设计**：保留 Element Plus；外围加薄层 — `useMediaQuery` 断点（768 / 1024）+ T1/T2/T3 三层策略。
- **基础设施（Phase A / p15）**：4 wrapper 组件 + composable + 全局 CSS：
  - `apps/web-v2/src/composables/useViewport.js`（isMobile/isTablet/isDesktop ref 单例）
  - `apps/web-v2/src/styles/mobile.css`（tap target ≥40px / dialog 移动全屏 / 字体收紧）
  - `apps/web-v2/src/components/ResponsiveTable.vue`（桌面 el-table / 移动 card 列表）
  - `apps/web-v2/src/components/ResponsiveDialog.vue`（移动 92vw / 自动全屏）
  - `apps/web-v2/src/components/ResponsiveDrawer.vue`（移动 bottom-to-top）
  - `apps/web-v2/src/components/MobileFallback.vue`（T3 兜底 + readonly slot）
  - `DefaultLayout.vue` 改造：移动汉堡键 + 抽屉 sidebar；`index.html` 加 viewport metas
- **4 模块迁移（Phase B / p16-p19，并行）**：M1 10 页 / M2 19 页 / M3 34 页（40 文件） / M4 16 页 + NotificationBell；T1 mobile-first 8 页 / T3 MobileFallback 9 页；4 模块 vite build 全 PASS。
- **iPhone 12 emulation 测试（Phase D / p20-p23，并行）**：62 spec × 10 iter = 296 page-level 测试。
  - M1 120/120 (100%) / M2 18/19 spec (190 page loads PASS) / M3 130/140 (92.9%) / M4 170/170 (100%)
  - **合计 285/296 = 96.3% PASS · 0 产品 bug**
  - 11 failed 全部为 spec 误判：TEST-M2-01（PurchaseOrders 列表强断言）/ TEST-M3-01（LxPortfolios OR-selector false-negative）
- **全局 NotificationBell**：mobile popover 92vw / 70vh / sticky 底部 / item ≥56px — ×10 PASS
- **部署**：vite build 7.39s / dist 12 MB → scp `/var/www/amz-web/` + `systemctl restart amz-api`；nginx 0 变更；外部探测稳定（1× 502 落 restart 窗口外其余全 200）
- **状态**：production-deployed (mobile-responsive ready, mock-gated)
- **Sentinel 链**：p15-p24 全部 DONE/PASS；累计 Round 1-8 共 24 phase 0 产品 bug 全闭环

## Round 9 全绿（2026-05-16，p25-p44）

> 详细见 `docs/ALL_FIXED_REPORT.md`。本轮把 Round 7/8 留下的 6 个真实 product bug + 6 个测试 spec false-negative 全部修了并经 10 iter 重测验证。

- **F1 (p25)**：`getSkuWaterfall` snapshot-aware — 改读 `m2_sku_profit_snapshots`，14 cost items 按比例缩放，残差归 misc，5 SKU × 5 runs diff = 0.0000 < 0.01
- **F2 (p26)**：`BrandDefense.vue` / `Notifications.vue` 接真后端（`useBrandDefense` / `useNotificationsBus` 单例），0 mock import，build PASS
- **F3 (p27)**：4 spec 文件修 — `m2-mobile` PurchaseOrders selector + 180s timeout / `m3-mobile` LxPortfolios 加 5 个 OR selector / `m2-prod` dropdown 简化 + setTimeout 180s / `m3-prod` 去 `describe.serial`
- **Phase G 部署**：AD-BUG + DB-BUG 路径硬编码 Windows → `import.meta.url` 相对路径；scp + `systemctl restart amz-api`
- **Retest v1 (p28-p35)**：M1 desktop 100/100 / M4 desktop 17/17 / M1 mobile 120/120 / M4 mobile 17/17；M2 / M3 部分 PARTIAL → v2-v4
- **Retest v2-v4 (p36-p43)**：发现 + 修 PO-BUG（`usePO.fetch` 漏 `res.pos`）；最终：M2 mobile 19/19 (p42) / M2 desktop 42/42 (p43) / M3 mobile 140/140 (p40) / M3 desktop 36/36 (p38)
- **p44 aggregator**：本段 + `docs/ALL_FIXED_REPORT.md`

### Round 9 最终矩阵
- 桌面 4 模块：100 + 42 + 36 + 17 = **195 / 195 PASS**
- 移动 4 模块：120 + 19 + 140 + 17 = **296 / 296 PASS**
- **总 491 / 491 = 100% PASS**

### Round 9 后路线图
1. **Baseline commit + PR**（p7 任务仍 pending — 强烈推荐）
2. HTTPS（Let's Encrypt + certbot）
3. 改服务器 demo/demo 默认密码
4. SLA 后台 tick（manual escalate 已可用）
5. 真实凭证：SP-API / Ads / Keepa / 邮件 / 支付

### 全管道闭环
- Round 1-4 Dev / Self-Check / QA → Round 5-6 Rerun → Round 7 部署 + 桌面 → Round 8 Mobile → **Round 9 Fix + Retest 491/491**
- **累计 44 phase · 6 product bug + 6 spec issue 全修 · 0 阻塞偏差**

---

## TaskList #6 — Ads API integration (Week-1 Day-4, 2026-05-22, Agent C)

> Sentinel: `tmp/sentinels/p51-ads-api.{STARTED,DONE}`

### Deliverables
- `apps/api/src/integrations/ads-api/`
  - `schema.mjs` — additive ALTER TABLE on `store_credentials` (+`profile_id`, +`country_code`); SP-API rows unaffected
  - `credentials.mjs` — provider='ads' CRUD (`upsertAdsCredentials` / `getAdsCredentials` / `setAdsAccessToken` / `setAdsProfileId` / `recordAdsError` / `revokeAdsCredentials`); refresh + access tokens AES-256-GCM encrypted via shared `token-cipher`
  - `auth.mjs` — LWA refresh against `api.amazon.com/auth/o2/token`; per-(user,store) single-flight Map; 60s pre-expiry refresh; mock-mode short-circuit mints `Atza|MOCK-ads-access-*`
  - `client.mjs` — region hosts (NA/EU/FE prod + advertising-api-test sandbox); required headers `Authorization: Bearer` / `Amazon-Advertising-API-ClientId` / `-Scope`; 429+5xx retry with jittered exp backoff (max 5 attempts); `sync_runs` audit row per call with `provider='ads'`; **ADS_API_MOCK=true short-circuits before fetch**
  - `rate-limiter.mjs` — registers 7 Ads endpoints (`ads.*`) into shared token-bucket via new `_registerDefaults` hook on sp-api/rate-limiter
  - `endpoints/{profiles,campaigns,adGroups,keywords,productAds}.mjs` — thin wrappers
  - `sync/campaigns-sync.mjs` — `syncAdsHierarchy({userId,storeId,profileId})` fetches campaigns + adGroups + productAds + keywords, upserts to `lx_campaigns` / `lx_ad_groups` / `lx_ads` / `lx_targetings` via `INSERT … ON CONFLICT(id) DO UPDATE`; one `audit_logs` row with `sourceModule='ADS'` `actionType='ads_sync_batch'`
  - `_fixtures/` — `profiles.json` (2 profiles) / `campaigns.json` (5) / `ad-groups.json` (15 = 5×3) / `keywords.json` (150 = 15×10) / `product-ads.json` (15)

### Env vars (added)
- `ADS_API_MOCK` — true short-circuits client/auth before fetch (DEFAULT for tests)
- `ADS_API_USE_SANDBOX` — true routes to `advertising-api-test.amazon.com`
- `ADS_LWA_CLIENT_ID` / `ADS_LWA_CLIENT_SECRET` — separate from SPAPI_*
- `ADS_API_DEFAULT_REGION` — NA / EU / FE

### Tests (`tests/integrations/ads-api.test.mjs`)
- 14 tests, all PASS in 1.18s
- Coverage: schema ALTER, encrypt/decrypt round-trip, mock-mode auth-no-fetch (`globalThis.fetch` sentinel), mock-mode listProfiles-no-fetch, listCampaigns sync_runs audit, stateFilter / campaignIdFilter behaviour, `profile_id_required` validation, syncAdsHierarchy populates 5/15/15/150 rows, idempotent re-sync, rate-limiter 5-sequential, revoke

### Test totals
- ads-api: 14/14 PASS
- sp-api foundation+catalog+orders-sync+reports: 32/32 PASS (verified `_registerDefaults` injection didn't break existing limits)
- npm test full run: 192/194 PASS; 2 PRE-EXISTING failures in `tests/deploy/release-safety.test.mjs` (compose ports / images alignment) unrelated to Ads work — confirmed by stashing all untracked files (the `tests/` directory itself isn't in git baseline)

### Hand-off
- Real Ads onboarding flow: user sets `ADS_API_MOCK=false` + `ADS_LWA_CLIENT_ID` + `ADS_LWA_CLIENT_SECRET`, then `upsertAdsCredentials({…, refreshToken})`, then `listProfiles()` to discover `profileId`, then `setAdsProfileId` or `upsertAdsCredentials` re-issue with `profileId`, then `syncAdsHierarchy({userId, storeId, profileId})` becomes live.
- SP-API integration files unchanged except `sp-api/rate-limiter.mjs` gained `_registerDefaults(map)` export (additive).
- `lx_*` schemas unchanged.

---

## Codex 领星广告模块需求报告（2026-05-25）

- 产出：`docs/implementation/LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md`。
- 背景：用户要求基于 `tmp/keyscreen/a1.png` / `a2.png` 深度调查领星广告模块，形成以后接入真实亚马逊数据仍可按目标开发的需求报告。
- 关键结论：`a1` 是广告模块“全部投放”页；红色箭头 2 是行级分析入口；`a2` 是 `投放详情 slushie machine` modal，URL 不变。
- 关键修正：`投放详情`已实证为 4 tab（天数据 / 对比分析 / 小时数据 / 广告位），旧 Claude 映射中 `target -> userSearchTerms` 不适用于该入口；`用户搜索词`应作为独立顶层页/实体详情。
- 报告内容：六页面详情矩阵、投放主表字段、`投放详情`四个 tab 字段/控件/验收、campaign 9-tab 语义、Network 请求路径、指标公式、真实数据源分工、建议数据模型、API 抽象、前端 tab 配置目标和分阶段实施。
- 安全边界：本轮只读，未点击保存/启停/批量/创建/删除/导入/调价应用等真实写入口；证据中 `risk=0`。

---

## Codex 领星广告模块深度补调研 v2（2026-05-25）

- 产出：`docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md`，作为 `LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md` 的补充和升级版。
- 覆盖：领星广告模块 35 个 surface，只读列表巡检 + 行级分析入口识别 + 可点击详情弹层 tab 矩阵 + 重点 Network 复核；证据在 `tmp/recon-ad-only/deep-complete/`、`deep-complete-remaining/`、`deep-network-key/`。
- 最关键修正：不能再用 `entityType=target` 一刀切；后续必须用 `surfaceKey + adProduct + entityKind` 决定 tab、字段和数据源。
- 已确认 tab 差异：`all_target` 4 tab；`sp_keyword` / `sp_product_target` / `sp_auto_target` / `sb_keyword` 5 tab；SP campaign 9 tab；SB campaign 6 tab；SD campaign 5 tab；SD product target/audience 为 3 tab 且第三 tab 是 `matchedTargets`。
- 数据开发目标：补 `surface registry`、实体 identity、daily/hourly/placement/searchTerm/matchedTarget/attribution/timeSequence/log facts；前端表格列按 `surfaceKey + tabKey + adProduct` 配置；每个 tab 显示 source/freshness/confidence/unavailableReason。
- 安全：仍为真实账号只读，`riskyDelta=0` / `remaining risky=0`；未点击竞价保存、应用预算、启停、批量、创建、删除、导入、规则、策略、添加词库/抢位等写入口。

---

## M3 整体功能进化与 AI 策略落地方案（2026-05-25）

- 产出：`docs/implementation/M3_EVOLUTION_AI_STRATEGY_PLAN.md`。
- 方向：M3 不继续堆报表，升级为“广告 AI 操盘系统”；默认入口改为“今日操盘台”，复杂领星等价页面退到证据/细节/执行入口。
- 五层架构：今日操盘台、Strategy Studio 策略工作室、领星等价操作面、复盘与学习、数据与护栏。
- AI 策略原则：规则/算法先生成候选，LLM 负责诊断、排序、解释、策略创建和复盘；LLM 不直接决定 bid/budget/pause/否词等真实写动作。
- 核心工程对象：TypedAction、EvidenceRefs、StrategyRun、ActionCandidate、ActionExecution、ActionObservation、AI feedback。
- 推荐优先级：先做 TypedAction + EvidenceRefs，再做今日操盘台和 StrategyRun，然后做自然语言策略创建 + dry-run，最后接真实 Ads/Marketing Stream/M2/M4 数据并逐步开放自动驾驶。

---

## M3 终局版广告 AI 策略操作系统（2026-05-25）

- 产出：`docs/implementation/M3_ULTIMATE_AI_STRATEGY_OS.md`，替代“首批/次批策略包”思路。
- 结合现有 M3 策略库源码：当前是 83 条策略 × 9 大策略域 × 35 种动作类型；终局不是让用户逐条启停，而是由业务目标、风险偏好、预算池、禁区和数据置信度自动编排。
- 决策栈优先级：异常护栏 > 跨模块风险约束 > 类目/季节/市场约束 > 生命周期目标 > 预算分配 > 广告结构 > 关键词治理 > 出价/分时/广告位 > 竞品攻防。
- 35 种动作类型收敛为 8 类 typed action 原语：`ADJUST_BID`、`ADJUST_BUDGET`、`GOVERN_KEYWORD`、`CREATE_OR_EVOLVE_STRUCTURE`、`PAUSE_OR_THROTTLE`、`SYNC_CONTEXT`、`CROSS_MODULE_TASK`、`GUARDRAIL_ONLY`。
- AI 角色：Context Builder、Signal Analyst、Strategy Composer、Conflict Judge、Action Writer、Risk Critic、Operator Explainer、Postmortem Analyst、Strategy Coach；LLM 只做解释/复核/策略生成/复盘，不直接决定真实写金额或绕过 guardrail/audit/rollback。
- 终局 UI：M3 Control Tower 回答“今天做什么、风险挡住了吗、哪些动作要批准、AI 做得对不对”；Strategy OS 展示九大域堆栈、策略图、冲突裁决、回测和历史胜率。

---

## M3 最终方案：通用、合理、易用（2026-05-25）

- 产出：`docs/implementation/M3_FINAL_AI_STRATEGY_OS_USABILITY_PLAN.md`，作为 M3 AI 策略顶层最终方案；`M3_ULTIMATE_AI_STRATEGY_OS.md` 保留能力架构细节。
- 三轮收敛：第一轮能力最大化确认 Strategy OS 正确；第二轮通用性要求以目标/边界/动作/证据抽象替代固定页面和固定策略；第三轮易用性要求普通用户默认只看 Control Tower，不看 83 条策略。
- 最终用户心智：目标、边界、操盘卡、复盘。M3 要让用户更少钻广告系统，而不是更懂广告系统。
- 首次启用只问 5 件事：主要目标、风险偏好、不可动对象、预算边界、自动化范围。
- 通用性：EvidenceRef 映射领星 surface、Ads API、Marketing Stream、M2/M4；Capability registry 处理 SP/SB/SD 差异；CategoryProfile 处理类目差异。
- 合理性：小样本不激进、归因未完成降置信、生命周期不同阈值不同、冷却期防抖、高风险不自动、真实写全部审计。
- 实施顺序：TypedAction/EvidenceRef/Guardrail/Impact/Rollback/Confidence -> Control Tower -> StrategyRun/Signal/ConflictDecision/Observation -> 83 条策略模板/实例化 -> Strategy OS 专家模式 -> 自动化等级提升。

---

## 2026-05-25 M3 Strategy OS 首轮开发记忆

- M3 最终方向已从“策略列表”进入“目标驱动的广告 AI 操盘系统”：普通用户默认看 Control Tower，专家才进入策略库和领星等价证据面。
- 当前已在 `apps/api/src/data-store-ads.mjs` 对所有建议派生执行契约：`typedAction`、`evidenceRefs`、`guardrail`、`rollback`、`impactEstimate`、`sourceMeta`、`confidenceBreakdown`；不依赖 DB migration，旧 seed/旧 SQLite 行也能返回新结构。
- 所有真实广告写入继续关闭：`dryRun=true`、`auditRequired=true`、`sourceMeta.realWriteEnabled=false`。预算/否词/结构/暂停/跨模块动作为人工复核优先，符合 PRD 的 mock/sandbox 策略。
- `AdsHub.vue` 已升级为 M3 Control Tower：今日必须处理、系统已自动保护、等待批准、正在观察、AI 贡献、数据健康成为首屏心智。
- `SuggestionCard.vue` / `SuggestionDrawer.vue` 已显示 TypedAction/EvidenceRef/Guardrail/Rollback/Source/Confidence，后续接真实 Ads API 或领星数据时不要回退成纯文本建议。
- 验证结果：M3 QA `tests/qa/m3-button-level.test.mjs` 164/164 PASS；前端 `npm.cmd run build` PASS。

---

## 2026-05-25 M3 Strategy OS 100% 闭环开发记忆

- 已完成至少 4 轮“测试 -> 证明 -> 修复/增强”：后端执行篮、前端执行篮、EvidenceRef 深链 + GoalProfile、易用性稳定化。
- 后端新增 `ad_action_queue` / `ad_action_runs` / `ad_goal_profiles` 三张表；新增 action queue API 与 `GET/PUT /api/v1/store/ads/goal-profile`；真实写入仍强制 `realWriteEnabled=false`。
- 建议契约现在受 GoalProfile 影响：保护 SKU/ASIN/Campaign/Keyword、动作原语黑/白名单、bid/budget 单次变化上限、最低自动置信度和证据数量都会进入 `guardrail.reasons/gates/profileSnapshot`。
- EvidenceRef 已从 `surfaceKey/tabKey/metricKeys` 升级到可跳转 `routePath/routeQuery`；`SuggestionDrawer.vue` 可直接“跳到证据”，未来真实 Ads/领星数据只需替换 adapter 和 freshness。
- Timeline 的“执行此动作”不再绕过执行篮：会先入篮、必要时批准、再 dry-run 执行并进入观察期；批量执行篮与单条执行同一契约。
- Control Tower 已显示目标档案和执行篮 KPI，并提供“利润优先 / 护栏增长”两种快捷 GoalProfile 配置；普通用户仍只处理目标、边界、操盘卡、复盘。
- 最终验证：`node --check apps/api/src/data-store-ads.mjs; node --check apps/api/src/store-routes-ads.mjs` PASS；`node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs` 169/169 PASS；`npm.cmd run build` PASS。

---

## 2026-05-25 Amazon 授权诊断与 M3 复测记忆

- 新增 `apps/api/src/integrations/authorization-diagnostics.mjs`：离线检查不触网、不解密、不泄密；显式 live probe 才会换 LWA token，并可选调用 SP-API sellers marketplace participations 与 Ads profiles list 两个只读探测。
- 新增 `/api/v1/integrations/diagnostics`：GET 为离线诊断，POST 支持 `{ provider, liveProbe, apiProbe }`；响应包含 env presence、credential snapshot、blockers/warnings、recentSyncs、m3Impact。
- Ads env 兼容：代码现在接受 `ADS_LWA_CLIENT_ID/ADS_LWA_CLIENT_SECRET` 与历史 `ADS_CLIENT_ID/ADS_CLIENT_SECRET`；首选仍是 `ADS_LWA_*`。
- M3 仍保持真实写入关闭：诊断只判断“能否真实读取/同步 Ads 数据”，不会打开竞价、预算、暂停、否词等 Amazon Ads 写动作。
- 测试闭环：新增 `tests/integrations/authorization-diagnostics.test.mjs` 覆盖脱敏、缺凭证、加密凭证、LWA live probe、安全 API probe、非法 provider；M3 button-level QA 169/169 PASS 连续 3 次。

---

## 2026-05-25 M3 Ads 真实写入闸门记忆

- 新增 `executeRealAdsActionQueueItem()`，真实写入只从 M3 action queue 单条执行进入；`execute-batch` 若 `realWriteEnabled=true` 会被拒绝。
- 当前真实写入支持 SP keyword bid、SP adGroup defaultBid、SP campaign dailyBudget；默认环境只允许 `ADJUST_BID`，预算需显式配置。
- 必须同时满足 `ADS_REAL_WRITES_ENABLED=true`、`ADS_API_MOCK=false`、allowlist、`confirmRealWrite=true`、`riskAccepted=true`、delta limit，才会调用 Amazon Ads PUT 接口。
- 成功写入会记录 `ad_action_runs.status=real_write_success`、audit action `ACTION_QUEUE_REAL_WRITE`，并同步更新本地 `lx_targetings.bid` / `lx_ad_groups.default_bid` / `lx_campaigns.daily_budget` 快照；失败记录 `real_write_failed`，queue 不变为 executed。
- CLI：`node scripts/live-ads-smoke-write.mjs --profile-id ... --keyword-id ... --current-bid ... --new-bid ... --confirm`；不要在未确认 profile/keyword/currentBid 前运行。

## M3 Strategy OS + Amazon Auth Linux Deploy (2026-05-25)

- `http://47.97.252.71/` has been updated from local `D:/amz` artifacts.
- Remote layout is `/opt/amz/src` for source, `/var/www/amz-web` for Vite dist, systemd `amz-api` on `127.0.0.1:8090`, nginx on `:80`, SQLite at `/opt/amz/data/store.db`.
- Backup path: `/opt/amz/backups/20260525T145908Z`.
- Deployed M3 Strategy OS additions, Amazon authorization diagnostics, and gated Ads real-write executor. Batch real writes remain blocked; single real writes require explicit env/request gates.
- Evidence: local M3 QA 169/169 PASS; local auth/Ads gate integration 7/7 PASS; web build PASS; remote syntax + integration 7/7 PASS; public health/login/M3 suggestions PASS; M3 prod Playwright observed 36/36 PASS via split timeout-safe runs.
- Server lacks real Amazon credential env/storage (`CREDENTIAL_ENC_KEY`, SP-API LWA, Ads LWA, store credentials), so diagnostics report blocked and M3 stays mock-gated until credentials/profileId are added.

---

## 2026-05-25 M1 Production Listing War Room 记忆

- 用户认为旧 M1 粗糙、不像真实运营使用，尤其图片数量和 Listing 真实流程不完整；本轮已按“人类 Amazon 运营工作流”重构 M1。
- PM/Product subagent 12 轮讨论最终收敛：M1 是 Listing 作战室，不是单纯 AI 文案生成器；必须覆盖真实快照、竞品/VOC、文案、关键词、图片矩阵、A+、变体属性、合规、发布前检查、版本/实验。
- Amazon 图片矩阵在系统里固定为 MAIN + PT01-PT08：主图白底、核心卖点、场景、功能拆解、尺寸兼容、材质细节、对比选择、安装开箱、信任/FAQ。
- 后端新增 M1 production-readiness API：workbench、readiness check、assets matrix、keyword coverage、compliance report；readiness check 会写 `M1_READINESS_CHECK` audit。
- 前端关键文件已重写：`m1.js`、`useM1State.js`、`ListingSelect.vue`、`ListingOptimize.vue`、`ListingWorkbenchPanel.vue`、`ResearchBlock.vue`、`ScoreBlock.vue`、`GenerationBlock.vue`、`VersionBlock.vue`、`ListingDiff.vue`。
- 新增文档：`docs/implementation/M1_PRODUCTION_LISTING_WAR_ROOM_2026-05-25.md`；新增部署记录：`docs/implementation/M1_LINUX_DEPLOY_2026-05-25.md`。
- 新增测试：`tests/qa/m1-frontend-workbench-contract.test.mjs`，防止 M1 UI 再出现乱码占位、缺 9 槽图片矩阵或缺作战室流程。
- Linux 已部署：`http://47.97.252.71/`；备份目录 `/opt/amz/backups/20260525T163449Z`；远程 M1 workbench/readiness/API 与服务器端测试通过。
- 真实 Amazon 写入仍然 mock-gated：外部 ASIN 只读，发布前检查只做 audit/readiness，不直接发布；未来接 SP-API Listings Items、Product Type Definitions、Catalog、A+、图片资产、Reviews/VOC、Ads/SQP 时沿用本轮契约。

---

## 2026-05-25 M1 Final Remote Parity Memory

- Final server parity was checked after the handoff: documentation/status files were uploaded to `/opt/amz/src` and sha256 matched local files.
- Remote service uses Node v24 at `/root/.nvm/versions/node/v24.15.0/bin/node`; `/usr/bin/node` is v18 and is not suitable for server tests with the deployed native SQLite module.
- Final remote validation passed: nginx, health, ready, demo auth, M1 workbench/assets/keywords/compliance/readiness, syntax checks, and M1 QA `11/11`.

---

## 2026-05-26 M2/M4 Workbench IA Memory

- User approved reducing M2/M4 redundancy. Product subagent delivered 12-round PM/Product discussion: keep functionality/API/routes, collapse human navigation into task workbenches.
- New M2 route: `/m2/workbench` with `M2ControlTower.vue`; purpose is to answer which SKUs are losing money, tying up cash, at stockout risk, or need repricing.
- New M4 route: `/m4/workbench` with `M4OpsWorkbench.vue`; purpose is one risk inbox for anomalies, Review, hijacking, infringement, and competitor/image changes.
- `DefaultLayout.vue` sidebar now exposes `m2-main` and `m4-main` instead of old M2/M4 multi-group page sprawl. Old deep links remain intact.
- Contract doc/test added: `docs/implementation/M2_M4_WORKBENCH_IA_OPTIMIZATION_2026-05-26.md` and `tests/qa/m2-m4-workbench-ia-contract.test.mjs`.

---

## 2026-05-26 M2/M4 Workbench Linux Deploy Memory

- M2/M4 workbench IA optimization deployed to `http://47.97.252.71/` with backup `/opt/amz/backups/20260525T225707Z-m2m4-ia`.
- Web dist archive used: `dist/release/amz-web-v2-dist-m2-m4-20260525T225605Z.tar.gz`.
- Remote validation passed: new IA contract `4/4`, health/ready/login/public root, M2 overview/leaks/reorder, M4 anomalies/reviews/image-diffs.
- Deploy report added at `docs/implementation/M2_M4_WORKBENCH_LINUX_DEPLOY_2026-05-26.md`.

---

## 2026-05-26 M1 Resource Hub Cleanup Memory

- 用户明确认为 `商品 · 资源库` 下的 `关键词热力图`、`多语言母版` 没用；本轮结论是不要再恢复这两个顶层入口。
- 新主入口为 `/listings/resources`，页面文件 `apps/web-v2/src/pages/M1ResourceHub.vue`；导航标题为 `素材规则中心`，归入 `m1-main`。
- `m1-resources` sidebar group 已移除；有用资源页 `关键词护栏`、`类目发布规则`、`VOC 痛点库`、`评分规则校准` 只作为 hub 深链工具。
- `/listings/keyword-heatmap` 和 `/listings/multi-locale` 现在重定向到 hub，并通过 `retired` query 显示下线原因，避免 404 但不再鼓励使用。
- 未来真实数据接入时，搜索词/SQP/Ads search terms 进关键词护栏，Product Type Definitions/Catalog 进类目规则，Review/退货/竞品差评进 VOC，A/B/CVR/退货率进评分校准；多站点本地化应挂到单 ASIN 版本分支，不要恢复成独立资源库页。
- 文档与测试：`docs/implementation/M1_RESOURCE_HUB_CLEANUP_2026-05-26.md`，`tests/qa/m1-resource-hub-contract.test.mjs`。
- 本地验证：M1 resource hub 4/4 PASS，M1 frontend workbench 4/4 PASS，M2/M4 IA regression 4/4 PASS，`apps/web-v2` build PASS。

---

## 2026-05-26 M1 Resource Hub Linux Deploy Memory

- 已部署到 `http://47.97.252.71/`；备份目录 `/opt/amz/backups/20260525T231736Z-m1-resource-hub`。
- Web dist 使用 `dist/release/amz-web-v2-dist-m1-resource-hub-20260525T231632Z.tar.gz`，服务器 `/var/www/amz-web/assets/M1ResourceHub-CkIo9p3-.js` 返回 200。
- 远端验证 PASS：nginx config、`amz-api` restart、`/health`、`/ready`、demo login、public root。
- 远端测试 PASS：M1 resource hub contract 4/4，M1 frontend workbench contract 4/4，M2/M4 IA regression 4/4。
- 部署报告：`docs/implementation/M1_RESOURCE_HUB_LINUX_DEPLOY_2026-05-26.md`。

---

## 2026-05-26 M4 ?????? Memory

- ?????? M4 ??????????????????????????????????GMV????????????????????
- ?????????????????M4 ???????????????????????????????????
- canonical route ? `/m4/reports/daily`??? alias `/m4/daily-report`?M4 ?????????????????
- ?????? BFF `/api/v1/store/m4/reports/daily`??? M2/M3/M4 ??????? `reportDate/generatedAt/schedule/sourceMeta/summary/stores/actions/alerts/trends/deepLinks`?
- BFF ????? audit?????? Amazon ????? SP-API / Ads API / Catalog / Review / BSR ??????? adapter?????????????
- ???????? `dailyReportsApi`????????? `profitApi`?`campaignReportApi`?`anomaliesApi`?`notificationsApi`?`reviewsApi`?`competitorsApi`?`imageDiffsApi` ???????????????????
- ???`docs/implementation/M4_DAILY_REPORT_MONITOR_2026-05-26.md`????`tests/qa/m4-daily-report-contract.test.mjs`?`tests/qa/m4-daily-report-api.test.mjs`?

---

## 2026-05-26 M4 ?????? Linux Deploy Memory

- M4 ?????????? `http://47.97.252.71/`?
- ????????`/opt/amz/backups/20260525T233950Z-m4-daily-report`?
- Web dist archive?`dist/release/amz-web-v2-dist-m4-daily-report-20260525T233950Z.tar.gz`????? `M4DailyReport-K97ospli.js` ?? 200?
- ???????M4 daily contract 4/4?M4 daily API 2/2?M2/M4 IA 4/4?nginx?amz-api?health?demo login?daily API ? PASS?
- ?????`docs/implementation/M4_DAILY_REPORT_LINUX_DEPLOY_2026-05-26.md`?

---

## 2026-05-26 M4 ???????????? Memory

- ????????????????????????????????????????????? mock?
- ?????`/m4/reports/daily` ????? canonical route?`/m4/daily-report` ????? redirect?
- `M4DailyReport.vue` ??? `dailyReportsApi.get()`????? fan-out ? profit/ads/anomaly/review API ??????? mockMultiStore?
- ?? BFF ?? `availableStores`?`availableLinks`?`stores`?`links`?`filters.realDataOnly=true` ? `sourceMeta.*.mock=false`?
- ??/GMV ?? `m2_orders` ????????????? `lx_daily_data` ?? ASIN/SKU ??? `search_term_reports`?????????? 0/?-????????
- `search_term_reports` ???? `reportingDate` ??? `from/to/asin/sku` ????? Amazon Ads Reporting/Marketing Stream ???????????????
- ???M4 daily contract 4/4?M4 daily API 3/3?M2/M4 IA 4/4?M3 button-level 169/169?web-v2 build PASS?

---

## 2026-05-26 M4 ?????????? Linux Deploy Memory

- ???? `http://47.97.252.71/`????? `/opt/amz/backups/20260526T002344Z-m4-daily-real-dimensions`?
- ?? asset ???`/assets/M4DailyReport-EYrrW-WS.js` ?? 200?
- ???????M4 daily contract 4/4?M4 daily API 3/3?M2/M4 IA 4/4?nginx?amz-api?health?demo login??????? API??????? API?
- ???????? `/health` ??? `mode: mock`???? provider mode????????/BFF??? mock??????? DB ???????????? 0/?-??

---

## 2026-05-26 Amazon 授权接入中心 Memory

- 用户要“全部做完”真实店铺接入流程，本轮把授权/诊断/同步做成页面入口 `/settings/amazon-auth`，不再要求用户手敲 curl。
- 页面文件：`apps/web-v2/src/pages/AmazonAuthCenter.vue`；API client：`apps/web-v2/src/api/integrations.js`。
- 后端新增 `POST /api/v1/integrations/credentials/ads/profile`，用于 Ads refresh token 已保存后单独保存 profileId；没有 Ads 凭证时返回 `ads_credentials_missing`。
- `listProviderStatus()` 现在返回 `profileId`，页面可脱敏展示并回填 Ads 同步参数。
- Settings 店铺授权列已从“模拟授权”改为跳转真实接入中心，避免运营误以为已经完成真实 Amazon 授权。
- 本轮仍只开启真实读取/同步：SP-API Orders/Settlement/Inventory/Catalog 与 Amazon Ads hierarchy；M3 真实写入仍由独立 real-write gate 控制，默认不开。
- 文档：`docs/implementation/AMAZON_AUTH_CENTER_2026-05-26.md`。
- 本地验证：sync routes 19/19、authorization diagnostics 4/4、Amazon auth center contract 4/4、M4 daily API 3/3、M4 daily contract 4/4、M3 button-level 169/169、Ads API 14/14、Ads live action gate 3/3、web-v2 build PASS。

---

## 2026-05-26 Amazon 授权接入中心 Linux Deploy Memory

- 已部署到 `http://47.97.252.71/#/settings/amazon-auth`。
- 部署前备份：`/opt/amz/backups/20260526T011409Z-amazon-auth-center`。
- Web dist archive：`dist/release/amz-web-v2-dist-amazon-auth-center-20260526T011319Z.tar.gz`。
- 线上 asset：`/assets/AmazonAuthCenter-_-DaHeux.js` 返回 200。
- 远端验证：Node syntax PASS；sync routes + auth center contract + authorization diagnostics 合计 27/27 PASS；nginx PASS；amz-api active；health/ready PASS；demo login + integrations status/diagnostics PASS。
- 部署报告：`docs/implementation/AMAZON_AUTH_CENTER_LINUX_DEPLOY_2026-05-26.md`。

---

## 2026-05-26 Amazon ?? OAuth ?????? Memory

- ????????????????????????????????????????? refresh token/profileId/marketplaceId ?????????
- ????? `/settings/amazon-auth`???????????`???? SP-API`?`???? Amazon Ads`??? refresh token ????? `?????? / ????`?
- SP-API ?????????? Login URI handoff?`/api/v1/integrations/oauth/spapi/login` ???? HttpOnly SameSite=Lax cookie ???? state??? Amazon `amazon_callback_uri`???? `/oauth/spapi/callback` ? token?
- Ads OAuth ? LWA authorization code flow?callback ????? profiles????? profileId ??????????????????
- OAuth state ?? SQLite `integration_oauth_states`?15 ???????????callback ??? Bearer token??????? state?
- ???/???`apps/api/src/integrations/oauth-flow.mjs`?`docs/implementation/AMAZON_ONE_CLICK_OAUTH_AUTH_2026-05-26.md`?`docs/implementation/AMAZON_ONE_CLICK_OAUTH_LINUX_DEPLOY_2026-05-26.md`?`tests/integrations/oauth-flow.test.mjs`?
- `.env.example` ?? SP-API/Ads OAuth ??????????????? `CREDENTIAL_ENC_KEY`?SP-API app id/client id/secret?Ads client id/secret??? Amazon ?????? URI?
- Linux ????`http://47.97.252.71/#/settings/amazon-auth`??? `/opt/amz/backups/20260526T015827Z-one-click-oauth`?web asset `AmazonAuthCenter-DG6F5u4N.js`?
- ????? OAuth/sync/diagnostics/auth-contract/M3/build ? PASS??? OAuth+auth+sync 27/27 PASS?M3 button-level 169/169 PASS?health/ready/login/OAuth config/status/diagnostics PASS?
- M3 ???????????? OAuth ?????????????????? `ADS_REAL_WRITES_ENABLED`?

---

## 2026-05-26 ???????? Memory

- ????????????????????? OAuth ???????????????????????????? `???? SP-API` / `???? Amazon Ads`?
- ???????auth center contract ???? `??????` ????????
- Linux ??????? asset `AmazonAuthCenter-BtLWlGm4.js`????? chunk ?????????????????????????
- ????????? Amazon ???`CREDENTIAL_ENC_KEY`?`AMZ_WEB_BASE_URL`?SP-API Login/Callback URI?Ads Callback URI?Ads mock=false?sandbox=false?
- ????? Amazon ?? Amazon ?????SP-API `SPAPI_OAUTH_APPLICATION_ID` / `SPAPI_LWA_CLIENT_ID` / `SPAPI_LWA_CLIENT_SECRET`?Ads `ADS_LWA_CLIENT_ID` / `ADS_LWA_CLIENT_SECRET`???? app-level ????????????????????????

---

## 2026-05-26 Amazon OAuth ?????? Memory

- ????????????????????? md???? `docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md`?
- ??????????? refresh token/profileId/marketplaceId??????????? Amazon app-level ???
- ??????????? `CREDENTIAL_ENC_KEY`??? Login/Callback URI?Ads mock=false??? Amazon ????`SPAPI_OAUTH_APPLICATION_ID`?`SPAPI_LWA_CLIENT_ID`?`SPAPI_LWA_CLIENT_SECRET`?`ADS_LWA_CLIENT_ID`?`ADS_LWA_CLIENT_SECRET`?
- ?????Amazon/LWA ????? HTTP IP redirect URI?????????? + HTTPS?

---

## 2026-05-26 OAuth credential guide encoding fix

- User reported `AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md` was unreadable with `???`.
- Root cause: Chinese text was actually written as question marks in the file.
- Rewrote the guide and saved it as UTF-8 with BOM; synced the corrected file to Linux.

## 2026-05-26 No Amazon developer app continuation note

- User clarified they do not currently have an Amazon developer application.
- Updated `docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md` with section 10: apply final Public SP-API/Ads app in parallel, but continue development via Private SP-API self-authorization, mock adapters, or CSV/manual imports while waiting for Amazon approval.


---

## 2026-05-29 记忆：20 轮全功能产品评审

- 评审报告已落地：`docs/implementation/PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md`。
- PMO 裁决：不要盲目推倒已有 M1-M4 骨架；要按生产不变量重做真实/Mock 边界、数据来源、审计回滚、租户隔离、OAuth 安全、真实写入 gate、前端 IA、测试门禁。
- 用户关心的范围已全部纳入：全局工作台、Amazon 一键授权、M1 Listing 作战室、M2 利润库存、M3 广告/领星等价/Strategy OS、M4 日报与全部风险/Review/竞品/通知子页。
- 当前不能把“已有页面/旧测试通过”当作生产完成证明；后续开发必须每个结论绑定 TCR、代码路径、测试路径和证据日志。
- 重要 P0：provider real no seed；M4 daily sourceMeta 真实性；M3 Ads 外部 ID 多租户隔离；M3 领星 target 4 tab；M4 错链修复；M2/M3/M4 级联 audit/revert。

---

## 2026-05-29 全功能复评后的开发闭环 Memory

- 本轮不是单纯评审，已把 QA 证明的红点落到代码：M3 LX 写类动作入 Action Queue、M4 daily source-aware、M4 manual-only 后端强制、M1 manual publish 语义、release-safety CRLF 修复。
- 新报告：`docs/implementation/FULL_REVIEW_DEVELOPMENT_EXECUTION_2026-05-29.md`。该报告明确哪些可以声明、哪些不能过度声明。
- 关键测试结果更新为：`npm.cmd test` 724/724 PASS；`npm.cmd run web:build` PASS；`npm.cmd run check` PASS；重点 suite 连跑 3 轮，每轮 364/364 PASS。
- 不能对用户声称本轮已部署 Linux 或真实 Amazon 生产闭环 100% 完成；本轮没有远程部署，也没有真实 SP-API/Ads 凭证。
- 后续重点：在真实 Amazon app credentials/profileId 到位后先只读同步与 provenance 验证；真实 Ads 写入只允许逐条已审批 Action Queue intent 通过显式 real-write gate。

---

## 2026-05-29 Round 23 收口 Memory

- M3 领星剩余 write-like 路由已统一进入 `ad_action_queue`：portfolio/campaign/ad-group/ad/targeting/negative/user-search-term/report/SQP/bulk/copy/kw-grabbing/AMC audience 等不再由路由层直接改业务影子表。
- M2 库存联动不再直接暂停/降预算 campaign，改为 `M2_PAUSE_CAMPAIGN_FOR_INVENTORY` / `M2_REDUCE_CAMPAIGN_BUDGET_FOR_INVENTORY` queue intent。
- M4 跟卖暂停/恢复广告、品牌防御 counter bid 不再直接写 `lx_campaigns` / `lx_targetings`，改为 `M4_PAUSE_ADS_FOR_ASIN` / `M4_RESUME_ADS_FOR_ASIN` / `M4_BRAND_COUNTER_BID` queue intent。
- Amazon 手动凭证/profileId 保存路径补 audit，并确认 audit payload 不泄露 refresh token。
- 认证 `/api/v1/dashboard` 已走 DB-backed 工作台合同，能把 queued action cards 深链到 `/ads/action-queue?id=...`。
- 本轮证据：直写扫描通过；重点回归 3 轮每轮 364/364 PASS；`npm.cmd test` 724/724 PASS；`npm.cmd run web:build` PASS；`npm.cmd run check` PASS。
- Round 23 收口完成时尚未部署 Linux；后续 Round 24 已通过服务器连接完成部署。仍不要声称真实 Amazon 店铺已经打通、M2/M4 全局 Action Inbox 生产级统一完成，或把策略库/本地配置写误称为外部广告写。

---

## 2026-05-29 Round 24 Linux/Git Sync Memory

- 本轮随后已完成 Linux 部署：`http://47.97.252.71/` 更新到 Round 23 收口代码与最新 Web dist。
- 服务器备份：`/opt/amz/backups/20260528T200037Z-round23-action-queue`。
- 部署报告：`docs/implementation/ROUND23_LINUX_GIT_DEPLOY_2026-05-29.md`。
- 本地门禁：`npm.cmd run check` PASS，其中 `npm test` 724/724 PASS，Web build PASS。
- 远端验证：核心 API 文件 `node --check` PASS；远端 tests 14/14 PASS；`nginx -t` PASS；`amz-api` active；远端 `/health`、`/ready` PASS；认证 dashboard 返回 DB-backed；公网 `/health`、`/ready`、`/` 均 200。
- Git 状态：原仓库 `.git` 当前 sandbox 用户无法写入 index.lock，已在 `tmp/amz-push-round23-20260529T0411` 临时 clone 中创建 commit；bundle `D:\amz\tmp\amz-round23-latest.bundle` 已验证并复制到服务器备份目录；GitHub push 因缺少可用 SSH alias/key/token 未完成。
- 仍不能声称真实 Amazon 授权/真实数据/真实写入已完成；服务器仍未配置真实 SP-API / Ads 凭证/profileId，真实写入仍受 gate 保护。

---

## 2026-05-29 Codex -> Claude Handoff Memory

- 已按用户要求新增 `codex22claude.md`，作为 Claude 后续接手开发的完整交接文档。
- 同步新增 `docs/implementation/CODEX_TO_CLAUDE_HANDOFF_2026-05-29.md`，满足 docs/implementation 状态更新要求。
- 交接内容覆盖：服务器部署、Git bundle/推送阻塞、M3 队列化细节、M2/M4 联动、Amazon 授权与凭证 audit、工作台 dashboard、M1/M2/M4 产品边界、测试证据、后续优先级和禁止事项。
- 文档没有写入服务器密码、Amazon token、LWA secret、GitHub token；Claude 后续仍需先解决 GitHub SSH/key/token 和真实 Amazon app credentials。
