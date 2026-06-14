# Project Status

Last updated: 2026-05-29

> **Single source of truth**: `D:/amz/docs/FINAL_STATUS_REPORT.md`（本地 mock 验收） + `D:/amz/docs/DEPLOY_TEST_REPORT.md`（生产部署 + Prod 测试）。
> 本文件提供高层快照；细节、bug、偏差、数据库快照都在两份报告中。
> 注意：2026-05-26 附近的部分历史段落存在 `????` 编码损坏，只能作为历史线索，不能作为当前验收证据；当前可引用证据以 Round 21-23 和 `docs/implementation/FULL_REVIEW_DEVELOPMENT_EXECUTION_2026-05-29.md` 为准。

## Current Phase
**linux-deployed, mock/sandbox-gated (2026-05-29)** — 本轮在 `D:/amz` 本机完成代码收口、合同验证和全量门禁，并已部署到 `http://47.97.252.71/`。文档中“真 API”指内部 Node/SQLite API，不代表 Amazon SP-API / Amazon Ads / Keepa / 邮件 / 支付等外部真实数据已接入。外部真实凭证仍未提供，真实写入默认禁止。HTTP 明文，HTTPS 未启用。

## 2026-05-29 Final Boundary Snapshot

| 范围 | 已完成 | 本轮证据 | 不可过度声明 | 下一验收门槛 |
|---|---|---|---|---|
| 工作台 | 认证 `/api/v1/dashboard` DB-backed，action card 可深链 Action Queue | `tests/api/workbench-dashboard-contract.test.mjs` PASS | 统一 owner/due/approve/reject/snooze/done/evidence schema 未全局完成 | 做全局 Action Inbox 与 Playwright journey |
| Amazon Auth | Auth Center/OAuth/diagnostics/手动凭证 audit 合同存在，token 脱敏 | `tests/integrations/oauth-flow.test.mjs`、`sync-routes.test.mjs`、`authorization-diagnostics.test.mjs` 在全量门禁内 PASS | 未获得真实 Amazon developer app，未完成真实 Seller Central/Ads 授权 | 配置真实 LWA/SP-API/Ads app 后先只读同步 |
| M1 | Listing 生成/版本/图片/A-B 都保持人工发布包语义 | `tests/qa/m1-button-level.test.mjs` 在全量门禁内 PASS | 没有 SP-API 上传回执前不得声称已发布到 Amazon | 引入真实 catalog/listing 只读数据与人工发布回执 |
| M2 | 利润/库存/PO/调价内部 DB + mock/hybrid 闭环，M2->M3 写入改 queue | `tests/qa/m2-functional.test.mjs` 3 轮回归 PASS | 真实 settlement/order/inventory 依赖 SP-API；ledger/PO 强约束仍需生产化 | 真实 SP-API 只读同步 + 财务对账样本 |
| M3 | 领星/Amazon Ads write-like entity 路由进入 `ad_action_queue` | `tests/qa/m3-button-level.test.mjs` 170/170 PASS，直写扫描通过 | 策略库/本地配置写入仍是内部管理动作；真实 Ads 写入未打开 | 真实 Ads profileId + 单条审批 + real-write gate |
| M4 | 日报 source-aware；跟卖/侵权/申诉 manual-only；M4->M3 写入改 queue | `tests/qa/m4-functional.test.mjs`、`m4-daily-report-*.test.mjs` 3 轮回归 PASS | 不会自动提交 Amazon 外部 test-buy/complaint/appeal | 真实 Review/BSR/Ads/订单只读回流与人工证据流 |

## Implementation Scope
- **M1 Listing 迭代优化室**：8 表 + 30 endpoints；own/external/new_listing 三模式；5 维度调研 + 5 维度打分；多轮生成（markedFields 之外 byte-identical）；5 版本管理 + 第 6 轮自动归档 + pin 保护；版本 diff + combined-pick 幂等；5 槽位图片生成（picsum mock）；A/B 测试（z-test + 自动 mock 14 天 metrics + manual_required 4xx 路径）。
- **M2 实时利润中枢 + 库存决策**：24 表 + 50 endpoints；利润下钻 4 级闭合（overview / skus / waterfall / order）；leak / cashflow / scenario / PO 5 态机；滞销 option A 三层 audit 链 → M1；汇率敞口 + 30 天 rates + sensitivity；税务标记；LTV high_ltv 业务约束；自定义告警 + 维度切换 + M2→M3 库存联动。
- **M3 生命周期广告优化**：20 表 + 1 join 表 + ~82 endpoints；Strategy 库 / Timeline / 外部更改捕获 / LX 12 实体；新增 Strategy OS 执行契约、`ad_action_queue` / `ad_action_runs` 执行篮、`ad_goal_profiles` 目标/护栏档案；SQP 加投放 dedup；KW 抢位 apply-bid；策略 ↔ Campaign 多对多（`ad_strategy_bindings`）；CSV multipart + JSON 双入参 bulk-import；17 类 actionType 反向 dispatch revert + action queue 自带 dry-run / revert；audit-logs 按 sourceModule / actionType / reverted 过滤分页；Playwright e2e 10/10。
- **M4 日常运营监控**：13 表 + 共享 `m4_notifications` + `reviews` ALTER 12 列 + 57 endpoints；异常 5 态机；SLA board / events（后台 tick 未实现，manual escalate 端点完整）；Resolution Case + recommend ref_count；Postmortem 自动生成；跟卖 → M3 暂停广告 + 24h dedup + close 恢复；侵权 4 态（legalDisclaimerAck 强校验）；评论聚类 + 趋势 + push-M1；申诉重提链；多轮 Recovery 邮件；竞品快照 + image-diff push-M1；品牌防御 + counter；通知 5min dedup + bell poll。

## Architecture
- **持久层**：SQLite（`apps/api/data/store.db`）+ better-sqlite3 WAL 模式；全部模块共享同一 DB；M2 / M4 QA 在不同端口（8080 / 8081）并行写入互不干扰。
- **API**：Node 内置 `http` server（`apps/api/src/server.mjs`）+ ESM；按前缀分发 `/api/v1/store/{m1,m2,m3,m4,...}/*` 到 4 个 store-routes 模块。
- **前端**：Vue 3 SPA + Vite + Element Plus，`apps/web-v2/`；`npm run build` PASS 7.58s；router 单例 + composable 单飞 promise + 乐观更新 + 失败回滚；NotificationBell 顶栏挂载在 DefaultLayout.vue:174，10 秒 poll 全局通知总线。
- **跨模块状态机制**：单表 `audit_logs` 记录全部写操作 + `cross_module='M*_TO_M*'` 标签 + `previousValues` JSON 支撑反向 dispatch；`m4_notifications` 兼作通知总线表。

## API Surface
- **总端点数约 207**：M1 30 + M2 50 + M3 70+ + M4 57，外加 audit / health / auth 公共端点。
- 全部端点都走 `apps/api/src/extended-routes.mjs` 派发；100% 落 SQLite。
- 错误码语义：`scoring_not_applicable` / `external_asin_cannot_optimize` / `manual_required` / `cannot_delete_baseline` / `legalDisclaimerAck` 422 / `state_transition_forbidden` / `po_state_invalid` 等已 spec 化并测试验证。

## Evidence — 5 Phase Pipeline
- Phase 1 BE Self-Check：M2 55/55 + M4 58/58 smoke PASS + 跨模块 trace 3/3，修 2 bug
- Phase 2 FE Self-Check：build PASS；M2 19/19 接入 0 mock；M4 14/16 接入；NotificationBell 挂载 OK；2 medium FE 偏差待修
- Phase 3 M2 QA：10 场景 × 5 iter = 50/50 PASS，修 4 bug
- Phase 4 M4 QA：11 场景 × 5 iter = 55/55 PASS，修 1 bug
- Phase 5 Aggregator（本次）：汇总 + 文档刷新
- **累计：smoke 135/135 + QA 205/205 + e2e 10/10 + 修 7 个 bug**

## Known Limitations
- FE-M4-01 / FE-M4-02：BrandDefense.vue / Notifications.vue 2 页仍 mock（composable / api 已就绪未引用）
- M2-O2：revertAuditLog 不级联子 audit 真还原（M3 revertM3Action 风格未扩展到 M2 / M4）
- M4 SLA 后台 tick 未实现（manual escalate 完整可用）
- M3 lx_ads seed ASIN 池有限 → M2→M3 库存联动 impactCampaigns 通常为空（audit 链完整）
- 详细 12 条偏差见 FINAL_STATUS_REPORT.md §6

## Blocked For Real Validation Only
- Amazon SP-API（OAuth / Reports / 真写）
- Amazon Ads API（campaign 真写）
- Keepa / SellerSprite / Helium10 真 API key
- 外部 LLM Provider key
- 邮件 / WeCom / WeChat 发送账号 + 模板
- 支付 Provider 商户凭证
- 真实 beta 卖家账号

## Next Steps (按优先级)
1. **baseline commit**：4 Round 多 subagent 开发 + 5 Phase 验收的全部产出仍在工作树未入 git；按模块分多次 commit
2. 解 FE-M4-01 / FE-M4-02（2 页接入真接口）
3. 解 M2-O2（revertAuditLog 级联）
4. 加 SLA 后台 tick `setInterval(checkSlaBreached, 60_000)`
5. M3 seed 扩展 ASIN 池（让 M2→M3 库存联动 impactCampaigns 非空）
6. 加 Playwright e2e 覆盖 M1 / M2 / M4（M3 已有）
7. 真实凭证按 PRD §13 顺序接入

## 历史路径作废说明
PRD 早期描述中的 "static no-build mock command center" / "148 测试 npm test passing" / "OpenAPI 212 operations 自动覆盖" / "Polyglot Go/Python/Next migration skeletons" 已被实际选择的 SQLite + Vue SPA + better-sqlite3 + Node 内置 http 取代。M1/M2/M3/M4 模块的 SPEC.md 是当前权威实施基准；本流水线 4 Round Dev + 5 Phase QA 全部以这 4 份 SPEC 为标尺。

---

## Batch B9-fe-workbench — 决策卡 Inbox + 全局工作台（2026-05-29 DEEP_REVIEW）

worklist items W7 / W8 / W9 / W12 / W16，回归测套件 `tests/web/b9-fe-workbench.test.mjs`（16/16 PASS）。

- **W7** `DecisionCard.execute` 接 `useAudit().submit()` 返回值：`{ok:false}` 阻断不 `emit('execute')`；新增 `submitting`/`executed` ref 绑 `:loading/:disabled` 防重入（200ms 双击仅 1 次 submit / 1 条 pending 审计）；执行成功乐观置灰标「已入队待审」(verdict=pending，非 splice 移除)；父组件 Workbench `@execute` 重新 `load()` + `bus.refresh()` 刷新 cardSummary。
- **W8** 广告建议汇总口径并入 Workbench 决策卡 Inbox：severity/审批经 `normalizeCard` 取 `risk.severity` / `risk.requiresApproval`，不再读 `expectedImpact.priority` / `status.includes('blocked')` 的恒 0 错误语义（随 W16 一并收敛，AdsActions 页删除后 Workbench 为单一事实源）。
- **W9** Workbench 三态分流：`error`(「加载失败」+重试) / `onboarding`(「引导接店铺·同步」CTA 调 `amazonIntegrationsApi.syncAll`) / `ready`(确无卡才「今日无待处理」)。`refresh()` 改 `await load()` 后按 error 分别弹 success/error，删除对成功/空数据的误用文案。
- **W12** `DecisionCard` 缺依据(payload/evidence/recommendation 全空)时「一键执行」disabled + tooltip「缺少依据不可执行」；`auditRequired` 取后端真值，不再兜底 `true`。
- **W16** 删除 `apps/web-v2/src/pages/AdsActions.vue`（孤儿页「操作清单(旧)」）；路由 `/ads/actions` 改 `redirect → /workbench?filter=ad_suggestion`；ProfitSkus 深链改指 Workbench；Workbench 接受 `?filter=` 深链（W1/W10 DB 分支已补齐，删页前置条件满足）。确立 Workbench 决策卡 Inbox 为广告建议单一事实源。

约定（对后续批次）：`useAudit().submit` 返回 `{ok}`，前端必须按 `ok` 真值分流（阻断不 emit）；`verdict=pending` 为非终态，不得直接 splice 移除卡片；广告建议唯一入口为 `/workbench?filter=ad_suggestion`，`/ads/actions` 仅作 redirect 兼容。

---

## Round 7 — 生产部署 + Prod 前端全量测试（2026-05-16）

> **完整报告**：`D:/amz/docs/DEPLOY_TEST_REPORT.md`

### 部署
- 线上 URL：**http://47.97.252.71/**
- 服务器：阿里云 ECS Ubuntu 24.04（4 CPU / 7.1 GB / 40 GB）
- 架构：**nvm Node 24.15** → `systemd amz-api.service`（:8090） → `nginx :80` 反代 + serve SPA dist + SQLite WAL（`/opt/amz/data/store.db`）
- 部署期修复 2 bug（`data-store-ads.mjs` / `data-store.mjs` 硬编码 Windows DB_PATH → 改 `import.meta.url` 相对路径）
- 保留服务器现有站点不动（`live5.cloudcut.fun` 等）

### Prod 前端全量测试
- 4 模块 / 79+ 页 / ~471 元素 / 195 用例 / 每元素 × 10 iter（~1950 次交互）
- **M1 100/100（100%）** · **M2 37/39（94.9%，2 条 Playwright dropdown flake 非产品 bug）** · **M3 36/36（100%）** · **M4 17/17（100%）**
- 综合通过率 **97.4%**，产品 bug 0 条
- Sentinel：`p10-m1-prod-test` / `p11-m2-prod-test` / `p12-m3-prod-test` / `p13-m4-prod-test` / `p14-deploy-aggregator` 全部 DONE/PASS

### Round 7 后路线图
1. FE-M4-01 / 02：BrandDefense / Notifications 接真后端
2. baseline git commit（22 phases 修改仍未入 git）
3. HTTPS / Let's Encrypt
4. demo 账号密码 + SSH key 加固
5. 真实凭证接入（SP-API / Ads API / Keepa / SellerSprite / Helium10 / LLM）

---

## Round 8 — Mobile Responsive 部署 + iPhone 12 测试（2026-05-16）

> **完整报告**：`D:/amz/docs/MOBILE_DEPLOY_REPORT.md` · **规范**：`D:/amz/docs/MOBILE_RESPONSIVE_SPEC.md`

### 设计
- **同 URL 同 SPA**：http://47.97.252.71/ 不变；运行时凭 `useMediaQuery` 切 mobile / tablet / desktop 形态
- **三层策略**：T1 mobile-first（重排）/ T2 mobile-usable（表格 → 卡片）/ T3 desktop-preferred（MobileFallback 提示 + readonly slot）
- 不重写 Element Plus，只加薄层

### Phase A 基础设施（p15）
- 4 wrapper 组件：`ResponsiveTable.vue` / `ResponsiveDialog.vue` / `ResponsiveDrawer.vue` / `MobileFallback.vue`
- composable `useViewport.js` + 全局 `mobile.css`
- `DefaultLayout.vue` 改造（汉堡键 + 抽屉 sidebar）+ `index.html` viewport metas
- 增 `@vueuse/core` 依赖

### Phase B 4 模块迁移（p16-p19，并行）
- M1 10 页 / M2 19 页 / M3 34 页（40 文件） / M4 16 页 + NotificationBell
- T1 mobile-first 8 页：ProfitOverview / AdsHub / AdsTimeline / StrategyLibrary / LxPortfolios / MonitorAnomalies / SLABoard / Notifications
- T3 MobileFallback 9 页：ListingOptimize / ScenarioSimulator / PurchaseOrders / TaxAssist / LxCampaignDetail / Campaigns / Playbook / Dayparting / Appeals
- 4 模块 vite build 全 PASS

### Phase C 部署
- vite build 7.39s / dist 12 MB → scp `/var/www/amz-web/` + `systemctl restart amz-api`；nginx 0 变更

### Phase D iPhone 12 emulation 测试（p20-p23，并行）
- 设备：iPhone 12 emulation（390×844 / DPR 3 / hasTouch / isMobile）via Playwright Chromium
- **M1 120/120 (100%) · M2 18/19 spec PASS (190 page loads) · M3 130/140 (92.9%) · M4 170/170 (100%)**
- **合计 285/296 = 96.3% PASS / 0 产品 bug**
- 11 failed 全是 spec 误判：TEST-M2-01 (PurchaseOrders list 强断言) / TEST-M3-01 (LxPortfolios OR-selector false-negative)
- NotificationBell mobile popover 92vw / 70vh / sticky 底部 ×10 PASS

### Sentinel
- `p15-mobile-foundation` / `p16-m1-mobile` / `p17-m2-mobile` / `p18-m3-mobile` / `p19-m4-mobile` / `p20-m1-mobile-test` / `p21-m2-mobile-test` / `p22-m3-mobile-test` / `p23-m4-mobile-test` / `p24-mobile-aggregator` 全部 DONE/PASS

### Round 8 后路线图
1. TEST-M2-01 / TEST-M3-01：放松 / 修复 2 个假阴 spec 断言
2. UX-M3-02：LxPortfolios 个别按钮 tap target 14px → ≥ 40px
3. （沿用 Round 7 路线图：FE-M4-01/02 / baseline commit / HTTPS / 真实凭证）

### 全管道闭环
- Round 1-4 Dev + Self-Check + QA / Round 5-6 QA Rerun / Round 7 部署 + 桌面 Prod 测试 / Round 8 Mobile 部署 + iPhone 测试 / Round 9 Fix + Retest 全绿
- **累计 44 phase · 491/491 PASS · 6 product bug + 6 spec issue 全修**

## Round 9 — Fix + 全量重测全绿（2026-05-16，p25-p44）

> 详细见 `docs/ALL_FIXED_REPORT.md`。

### 修了什么
- **6 个真实 product bug**：F1 (M2 waterfall 0.07% 漂移) / F2-01 (BrandDefense.vue mock) / F2-02 (Notifications.vue mock) / PO-BUG (usePO 漏 `res.pos`) / AD-BUG (M3 ads.mjs Windows 硬编码) / DB-BUG (M2 store.mjs Windows 硬编码)
- **6 个测试 spec false-negative**：TEST-M2-01 / TEST-M2-02 / TEST-M2-03 / TEST-M2-04 / TEST-M3-01 / TEST-M3-02

### 最终成绩
| 模块 | Desktop | Mobile |
|---|---|---|
| M1 | 100/100 (p28) | 120/120 (p32) |
| M2 | 42/42 (p43) | 19/19 (p42) |
| M3 | 36/36 (p38) | 140/140 (p40) |
| M4 | 17/17 (p31) | 17/17 (p35) |
| **总** | **195/195** | **296/296** |
| **合计** | **491/491 (100%)** | |

### Sentinel
- p25-p44 全部 DONE；其中 p25/26/27 (Fix)、p28/31/32/35/38/40/42/43 (绿色 retest)、p44 (aggregator)
- p29/p30/p33/p34/p36/p37/p39/p41 为 PARTIAL（已被 v2-v4 取代）

### Round 9 后路线图
1. **Baseline commit + PR（p7 仍 pending）**
2. HTTPS（Let's Encrypt + certbot）
3. 改服务器默认 demo/demo 密码
4. SLA 后台 tick / M2-O2 revertAuditLog 级联
5. 真实凭证接入（SP-API / Ads / Keepa / 邮件 / 支付）

---

## Codex 领星广告模块需求报告（2026-05-25）

- 新增需求基线文档：`docs/implementation/LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md`。
- 范围限定：仅领星左侧栏“广告”模块；重点复核 `tmp/keyscreen/a1.png` 红色箭头 2 打开的 `投放详情` 弹层。
- 核心修正：真实 `投放详情` 只有 4 个 tab（天数据 / 对比分析 / 小时数据 / 广告位），不是旧 recon 中包含 `用户搜索词` 的 5-tab 结构；`用户搜索词`是独立顶层页，详情为 2 tab。
- 需求沉淀：报告固化六个广告页矩阵、`投放详情`字段、Network 接口证据、指标口径、未来 Amazon Ads API / Marketing Stream / SP-API 数据模型、前后端 API 抽象和验收标准。
- 安全：本轮只读复核，证据目录 `tmp/recon-ad-only/` 中风险计数为 `risk=0`，未触发真实广告写动作。

## Codex 领星广告模块深度补调研 v2（2026-05-25）

- 新增深度需求基线：`docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md`，用于覆盖并扩展上一版 `LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md`。
- 覆盖范围：领星左侧栏“广告”模块内 35 个广告相关 surface，只读进入列表、识别行级分析入口、打开可用分析弹层、点击只读 tab，并对重点 SP/SB/SD surface 做 Network 复核。
- 核心结论：行级详情不能再按单一 `entityType` 配置，必须按 `surfaceKey + adProduct + entityKind -> tabs` 建模；`all_target` 是 4 tab，SP/SB 关键词/投放类部分 surface 是 5 tab，SD 投放/受众是 `匹配的目标` 3 tab。
- 新增矩阵：SP campaign 9 tab、SB campaign 6 tab、SD campaign 5 tab、SD ad/adgroup 2 tab、SD target/audience 3 tab；否定对象/预算上限/归因购买/匹配目标按列表或设置能力建模，不强套 MCompare 弹层。
- 新增风险地图：只读入口包括 `to-compare-data-list`、`to-compare-vs-list`、日志、搜索排行、Amazon 外链；写/配置入口包括保存竞价、应用预算、启停、批量、规则、策略、导入、添加词库/抢位，必须 disabled-by-default + 审计。
- 安全与限制：本轮仍为真实账号只读调研，风险复核 `riskyDelta=0` / `remaining risky=0`；未验证任何真实写流程，真实公式需等 Amazon Ads Reporting / Marketing Stream / SP-API 数据接入后最终复核。

## M3 整体功能进化与 AI 策略落地方案（2026-05-25）

- 新增方案文档：`docs/implementation/M3_EVOLUTION_AI_STRATEGY_PLAN.md`。
- 定位：把 M3 从“广告页面 + 策略库 + AI 建议列表”升级为“广告 AI 操盘系统”，以“今日操盘台 + 策略工作室 + 领星等价操作面 + 复盘学习 + 数据护栏”五层架构推进。
- 核心产品调整：M3 默认入口应从报表/列表转为“今天该处理什么”；每张 AI 操盘卡必须有 typed action、entity path、证据入口、预期影响、护栏、回滚和 source/freshness/confidence。
- AI 策略原则：规则/算法先生成候选，LLM 负责诊断补充、排序、解释、策略创建和复盘；LLM 不直接决定竞价/预算/暂停等金额或写动作。
- 实施重点：TypedAction + EvidenceRefs、Strategy Run、Strategy Studio、自然语言策略创建 + dry-run、执行后 7/14/30 天复盘、逐步按风险等级开放自动驾驶。
- 注：不再按“首批/次批策略包”理解 M3；策略库应整体进入统一策略操作系统，由目标、风险、数据置信度和冲突裁决动态编排。

## M3 终局版广告 AI 策略操作系统（2026-05-25）

- 新增终局设计：`docs/implementation/M3_ULTIMATE_AI_STRATEGY_OS.md`，用于替代“分批策略包”思路。
- 结合现有 M3 策略库源码，当前策略资产为 83 条策略、9 大策略域、35 种动作类型；终局不让用户逐条管理策略，而是把它们纳入“业务目标 -> 策略域 -> 信号 -> 决策图 -> typed action -> 审计执行 -> 效果复盘 -> 策略自学习”的统一操作系统。
- 九大策略域按优先级形成决策栈：异常护栏 > 跨模块风险 > 类目/季节 > 生命周期 > 预算 > 结构 > 关键词 > 出价/分时/广告位 > 竞品攻防；用于解决扩量、库存、利润、预算、抢位、竞品攻击之间的冲突。
- 35 种动作收敛为 8 类动作原语：`ADJUST_BID`、`ADJUST_BUDGET`、`GOVERN_KEYWORD`、`CREATE_OR_EVOLVE_STRUCTURE`、`PAUSE_OR_THROTTLE`、`SYNC_CONTEXT`、`CROSS_MODULE_TASK`、`GUARDRAIL_ONLY`。
- AI 定位：不是出价计算器，而是 Context Builder / Signal Analyst / Strategy Composer / Conflict Judge / Operator Explainer / Postmortem Analyst；LLM 不直接绕过 typed action、guardrail、audit 和 rollback。
- 终局 UI：M3 Control Tower + Strategy OS；用户配置业务目标、预算池、风险偏好和禁区，系统自动组合策略，输出少量高质量操盘卡和复盘结论。

## M3 最终方案：通用、合理、易用（2026-05-25）

- 新增最终顶层方案：`docs/implementation/M3_FINAL_AI_STRATEGY_OS_USABILITY_PLAN.md`；该文档在 `M3_ULTIMATE_AI_STRATEGY_OS.md` 的能力架构上，经过通用性、合理性、易用性三轮收敛。
- 最终用户心智压缩为 4 件事：目标、边界、操盘卡、复盘；普通用户不直接管理 83 条策略，不默认进入领星式表格，也不依赖聊天框理解系统。
- 首次启用只问 5 个问题：主要目标、风险偏好、不可动对象、预算边界、自动化允许范围；系统自动生成 `GoalProfile`、`GuardrailProfile`、`StrategyInstances`、`AutomationLevel` 和禁区。
- M3 默认页最终定位为 `Control Tower`：今日必须处理、系统已自动保护、等待批准、正在观察、本周 AI 贡献、数据健康；领星等价页退为证据和人工深挖入口。
- 合理性约束：小样本不激进、归因未完成降低置信度、生命周期决定阈值、冷却期防抖、高风险动作不自动、所有真实写动作审计。
- 建设顺序：先补 TypedAction/EvidenceRef/Guardrail/Impact/Rollback/Confidence，再做 Control Tower，再做 StrategyRun/Signal/ConflictDecision/Observation，最后迁移 83 条策略为模板/实例并逐步开放自动化。

---

## Round 10 — M3 Strategy OS 契约与 Control Tower 首轮落地（2026-05-25）

- **后端契约**：`ad_suggestions` 保持旧表兼容，在 `rowToSuggestion()` 派生 `typedAction` / `evidenceRefs` / `guardrail` / `rollback` / `impactEstimate` / `sourceMeta` / `confidenceBreakdown`，既支持旧 seed DB，也为真实 Amazon Ads / 领星等价数据接入预留稳定结构。
- **安全边界**：所有建议默认 `dryRun=true`、`auditRequired=true`、`sourceMeta.realWriteEnabled=false`；预算、否词、结构、暂停、跨模块动作默认 `needs_review`，低风险 bid 动作才可进入低风险自动化语义。
- **前端首屏**：`AdsHub.vue` 从“广告总览/三入口”升级为 **M3 Control Tower**，首屏直接展示今日必须处理、系统已自动保护、等待批准、正在观察、AI 贡献、数据健康。
- **动作卡体验**：`SuggestionCard.vue` 与 `SuggestionDrawer.vue` 展示 TypedAction、EvidenceRef、Guardrail、Rollback、来源新鲜度和置信度拆解，复杂策略仍可展开，但默认不压给普通运营。
- **审计上下文**：`AdsTimeline.vue` 采纳建议时把 typed action / guardrail / rollback 一并提交到审计 payload，便于后续执行篮、批量确认和回滚复盘。
- **验证**：`node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs` 164/164 PASS；`npm.cmd run build` PASS。`npm run build` 在 PowerShell 因本机执行策略拦截，已用 `npm.cmd` 绕过。

---

## Round 11 — M3 Strategy OS 可验证闭环（2026-05-25）

- **迭代 1（后端执行篮）**：新增 `ad_action_queue` / `ad_action_runs`，提供建议入篮、批准、单条 dry-run、批量 dry-run、移除、回滚、run history；执行仍是 sandbox/dry-run，真实 Amazon 写入关闭。QA 从 164/164 提升到 166/166 PASS。
- **迭代 2（前端执行篮）**：`AdsTimeline.vue` 增加执行篮卡片、批量 dry-run、刷新闭环；`AdsHub.vue` Control Tower 显示执行篮 KPI；单条“执行此动作”也改为经执行篮批准/执行后进入观察期。`npm.cmd run build` PASS，M3 QA 166/166 PASS。
- **迭代 3（EvidenceRef + 目标护栏）**：EvidenceRef 后端返回 `routePath/routeQuery`，抽屉可“跳到证据”；新增 `ad_goal_profiles`、`GET/PUT /api/v1/store/ads/goal-profile`，GoalProfile 会影响建议 guardrail（保护实体、动作原语、变化幅度、置信度阈值），真实写入强制 `realWriteEnabled=false`。QA 增至 169/169 PASS。
- **迭代 4（易用性稳定化）**：Timeline 刷新按钮接真实 fetch；直接执行动作不再绕过执行篮；Control Tower 增目标档案卡和“利润优先 / 护栏增长”快捷配置。最终 `node --check`、`node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs` 169/169 PASS、`npm.cmd run build` PASS。
- **当前口径**：M3 已具备“目标档案 -> 策略建议契约 -> 证据深链 -> 执行篮 dry-run -> 审计日志 -> 观察/回滚”的本地闭环；真实 Ads/SP-API 接入后应复用这些契约，不再回退为纯文本建议或领星表格复制。

---

## Round 12 - Amazon 授权诊断与 M3 稳定性复测（2026-05-25）

- 新增可重复验证的 Amazon 授权诊断文档：`docs/implementation/AMAZON_AUTHORIZATION_DIAGNOSTICS.md`。
- 新增后端诊断能力：`GET /api/v1/integrations/diagnostics` 做离线 readiness 检查；`POST /api/v1/integrations/diagnostics` 支持显式 `liveProbe/apiProbe`，仅做 LWA 换 token 与安全只读探测，不做任何真实写入。
- 诊断返回严格脱敏：不返回 LWA client 值、refresh token、access token、密文 token，只返回配置是否存在、凭证状态、token 过期状态、blockers/warnings/nextActions、recent syncs 与 M3 impact。
- Ads LWA env 做兼容加固：优先 `ADS_LWA_CLIENT_ID/SECRET`，兼容历史 `ADS_CLIENT_ID/SECRET`；`.env.example` 已补充 Ads mock/sandbox/default region 配置。
- M3 影响边界明确：Ads 授权/profile/sync 完成前继续 mock/fixture；真实广告写入仍为 `disabled_dry_run_audit_first`，必须经 action queue + approval + dry-run + audit + rollback。
- 验证结果：authorization diagnostics 4/4 PASS；sync-routes 16/16 PASS；ads-api 14/14 PASS；M3 QA `tests/qa/m3-button-level.test.mjs` 169/169 PASS 且连续复跑 3 次；`apps/web-v2` build PASS；`git diff --check` 无 whitespace error，仅 LF/CRLF warning。

---

## Round 13 - M3 Amazon Ads 真实写入闸门（2026-05-25）

- 在用户确认店铺为开发测试店铺后，新增 M3 -> Amazon Ads 的窄口真实写入桥：`apps/api/src/integrations/ads-api/live-action-executor.mjs`。
- 支持首批真实动作原语：SP keyword bid `PUT /sp/keywords`、SP adGroup defaultBid `PUT /sp/adGroups`、SP campaign dailyBudget `PUT /sp/campaigns`；但默认只 allow `ADJUST_BID`，预算动作需显式加入 `ADS_REAL_WRITES_ALLOWED_PRIMITIVES`。
- 安全闸门：`ADS_REAL_WRITES_ENABLED=true`、`ADS_API_MOCK=false`、store/profile allowlist、`confirmRealWrite=true`、`riskAccepted=true`、bid/budget 单次变化上限、禁止 batch real write。
- M3 action queue 执行链已支持真实写入结果：`real_write_success` / `real_write_failed`，写 `ad_action_runs` 与 `audit_logs`，成功后更新本地 lx 实体快照；失败不标记 queue executed。
- 新增 CLI：`scripts/live-amazon-diagnostics.mjs` 与 `scripts/live-ads-smoke-write.mjs`；package scripts 增加 `amazon:diagnostics:live`、`ads:smoke-write`。
- 新增测试：`tests/integrations/ads-live-action-gate.test.mjs`，覆盖真实写入模拟、显式确认要求、批量真实写入禁用。
- 验证：ads-live-action-gate 3/3 PASS；authorization-diagnostics 4/4 PASS；sync-routes 16/16 PASS；ads-api 14/14 PASS；M3 button-level QA 169/169 PASS 连续 3 轮；web-v2 build PASS；`git diff --check` 无 whitespace error。

## Round 10 - M3 Strategy OS + Amazon Auth Linux Deploy (2026-05-25)

> Deployment evidence: `D:/amz/docs/implementation/M3_LINUX_DEPLOY_2026-05-25.md`

- Deployed current M3 Strategy OS / Amazon authorization diagnostics to `http://47.97.252.71/`.
- Server runtime confirmed: `/opt/amz/src` + `/var/www/amz-web` + systemd `amz-api` + nginx + SQLite `/opt/amz/data/store.db`.
- Backup before deploy: `/opt/amz/backups/20260525T145908Z`.
- Validation: local M3 QA 169/169 PASS, local auth/real-write gate integration 7/7 PASS, web build PASS, remote syntax + integration 7/7 PASS, public health/login/M3 suggestions PASS.
- M3 prod Playwright evidence split across timeout-safe runs: first 31/36 PASS before local harness timeout, remaining 5/5 PASS; combined observed M3 prod coverage 36/36 PASS.
- Server authorization diagnostics are deployed and redacted, but real Amazon credentials are not configured on the server yet; M3 remains mock-gated and real writes stay disabled by default.

---

## Round 14 - M1 Production Listing War Room（2026-05-25）

- 新增生产级需求与实施报告：`docs/implementation/M1_PRODUCTION_LISTING_WAR_ROOM_2026-05-25.md`。
- 新增部署报告：`docs/implementation/M1_LINUX_DEPLOY_2026-05-25.md`。
- M1 从“Listing 文案生成/版本列表”升级为“Listing 作战室”：目标选择 -> 商品档案 -> 竞品/VOC 调研 -> 五维评分 -> 文案编辑 -> MAIN + PT01-PT08 图片矩阵 -> A+/Video/360 -> 合规风险 -> 发布前检查 -> 版本 Diff/组合挑选。
- 后端新增 workbench/readiness/assets/keywords/compliance API；readiness 写入 `M1_READINESS_CHECK` 审计；外部 ASIN 只读；图片矩阵固定 9 槽；关键词覆盖含 competitor gap/stuffing/negative conflicts；合规含字段级风险码。
- 前端重写 M1 关键入口与作战室组件，清除乱码占位，补齐人类运营可理解的中文交互与 source/confidence/mock 标记。
- 新增 `tests/qa/m1-frontend-workbench-contract.test.mjs`，验证 M1 前端无 `???`/mojibake、具备作战室核心区块、MAIN+PT01-PT08 完整槽位和流程锚点。
- Linux 已更新到 `http://47.97.252.71/`，备份：`/opt/amz/backups/20260525T163449Z`；远程 health/login/M1 workbench/readiness 与服务器端 M1 测试均 PASS。
- 验证：本地 web build PASS；M1 readiness 7/7 PASS；M1 button-level 94/94 PASS；M1 domain/benchmark 15/15 PASS；M1 frontend contract 4/4 PASS；M3 regression 180/180 PASS；远程 M1 tests 11/11 PASS。

---

## Round 14b - M1 Final Remote Parity Check (2026-05-25)

- Final docs/status parity synced to `/opt/amz/src` and sha256-verified for `PROJECT_STATUS.md`, `MEMORY.md`, and both M1 implementation docs.
- Remote validation repeated with service Node `/root/.nvm/versions/node/v24.15.0/bin/node`: nginx PASS, `/health` PASS, `/ready` PASS, demo login PASS, M1 workbench/assets/keywords/compliance/readiness PASS.
- Remote M1 tests PASS: production-readiness + frontend workbench contract `11/11`.
- Note: server system `/usr/bin/node` is v18 and mismatches the deployed `better-sqlite3` binary; operational tests should use the systemd service Node v24 path.

---

## Round 15 - M2/M4 Workbench IA Optimization (2026-05-26)

- User confirmed M2/M4 are too redundant and hard to modify; PM/Product subagent completed 12 rounds of product discussion and settled on task-first workbench IA.
- M2 is now positioned as `经营利润工作台`: `/m2/workbench` aggregates profit health, decision queue, SKU profit radar, cash/procurement, and deep tool links while preserving all old M2 routes.
- M4 is now positioned as `运营风险工作台`: `/m4/workbench` aggregates anomaly, Review, hijacking, infringement, competitor/image-diff risks into one ops inbox while preserving all old M4 routes.
- Sidebar is collapsed from many M2/M4 groups into one M2 entry and one M4 entry; old pages remain accessible as deep links from workbenches.
- Added implementation report: `docs/implementation/M2_M4_WORKBENCH_IA_OPTIMIZATION_2026-05-26.md`.
- Added contract test: `tests/qa/m2-m4-workbench-ia-contract.test.mjs` to protect routes, nav collapse, deep links, and core workbench sections.

---

## Round 15b - M2/M4 Workbench Linux Deploy (2026-05-26)

- Deployed M2/M4 workbench IA optimization to `http://47.97.252.71/`.
- Backup before deploy: `/opt/amz/backups/20260525T225707Z-m2m4-ia`.
- Deployment report: `docs/implementation/M2_M4_WORKBENCH_LINUX_DEPLOY_2026-05-26.md`.
- Remote verification: nginx PASS, `/health` PASS, `/ready` PASS, demo login PASS, public web root PASS.
- Remote contract test PASS: `tests/qa/m2-m4-workbench-ia-contract.test.mjs` `4/4`.
- Remote M2/M4 API smoke PASS: M2 overview/leaks/reorder and M4 anomalies/reviews/image-diffs all returned seeded data.

---

## Round 16 - M1 Resource Hub Cleanup (2026-05-26)

- 用户指出 `商品 · 资源库` 中 `关键词热力图`、`多语言母版` 没有实际运营价值；本轮将资源库从页面堆叠改为 `M1 素材规则中心`。
- 新增 `/listings/resources` 与 `apps/web-v2/src/pages/M1ResourceHub.vue`，定位为 Listing 作战室补给线，只保留关键词护栏、类目发布规则、VOC 痛点库、评分规则校准四类有效素材。
- 侧边栏移除 `m1-resources` 与 `商品 · 资源库` 分组；`素材规则中心` 并入 `商品 · 主流程 (M1)`。
- `/listings/keyword-heatmap`、`/listings/multi-locale` 已从日常工作流下线并重定向到 `/listings/resources`，页面解释下线原因；其他资源页保留深链但不再平铺导航。
- 新增实施文档：`docs/implementation/M1_RESOURCE_HUB_CLEANUP_2026-05-26.md`。
- 新增契约测试：`tests/qa/m1-resource-hub-contract.test.mjs`，覆盖资源入口收口、无用页重定向、深链保留与中心页核心文案。
- 验证：M1 Resource Hub contract 4/4 PASS；M1 frontend workbench contract 4/4 PASS；M2/M4 IA regression 4/4 PASS；`apps/web-v2` build PASS。

---

## Round 16b - M1 Resource Hub Linux Deploy (2026-05-26)

- Deployed M1 Resource Hub cleanup to `http://47.97.252.71/`.
- Backup before deploy: `/opt/amz/backups/20260525T231736Z-m1-resource-hub`.
- Deployment report: `docs/implementation/M1_RESOURCE_HUB_LINUX_DEPLOY_2026-05-26.md`.
- Replaced `/var/www/amz-web` with `dist/release/amz-web-v2-dist-m1-resource-hub-20260525T231632Z.tar.gz`; uploaded M1 hub source/docs/tests/status files to `/opt/amz/src`.
- Remote verification PASS: nginx config, `amz-api` restart, `/health`, `/ready`, demo login, public web root, deployed `M1ResourceHub-*.js` asset.
- Remote tests PASS: M1 resource hub contract 4/4, M1 frontend workbench contract 4/4, M2/M4 IA regression 4/4.

---

## Round 17 - M4 ???????2026-05-26?

- ???? M4 ????????/????????????????? M4 ????????????????? + ????????
- ?? canonical ?? `/m4/reports/daily`??? `/m4/daily-report`???? `/m4/workbench` ?????????????
- ?? `apps/web-v2/src/pages/M4DailyReport.vue`?????????GMV??????ACOS????????????7 ??????????????/???????sourceMeta ????
- ???? BFF?`GET /api/v1/store/m4/reports/daily`??? M2 orders/profit?M3 campaign reports?M4 anomalies/reviews/trends/competitors/notifications/M2 alert events????? daily report ???
- ???? API `dailyReportsApi`??????? BFF?BFF ???????? adapter fan-out/mock fallback?
- ?????`docs/implementation/M4_DAILY_REPORT_MONITOR_2026-05-26.md`?
- ?????`tests/qa/m4-daily-report-contract.test.mjs` ? `tests/qa/m4-daily-report-api.test.mjs`????????????????BFF ?????? audit ????

---

## Round 17b - M4 ?????? Linux Deploy?2026-05-26?

- ??? M4 ??????? `http://47.97.252.71/`?
- Web dist?`dist/release/amz-web-v2-dist-m4-daily-report-20260525T233950Z.tar.gz`?
- ??????`/opt/amz/backups/20260525T233950Z-m4-daily-report`?
- ?????`docs/implementation/M4_DAILY_REPORT_LINUX_DEPLOY_2026-05-26.md`?

---

## Round 19 - Amazon 授权接入中心（2026-05-26）

- 新增可视化入口 `/settings/amazon-auth`，把 SP-API、Amazon Ads、profileId 发现/保存、真实诊断和真实读取同步收敛到一个页面，避免用户手敲 curl。
- 设置页店铺授权列不再执行“模拟授权”，统一跳转到 Amazon 授权接入中心，并按所选店铺切换上下文。
- 后端新增 `POST /api/v1/integrations/credentials/ads/profile`，支持 Ads refresh token 已保存后的 profileId 单独更新；没有 Ads 凭证时返回 `404 ads_credentials_missing`。
- `GET /api/v1/integrations/status` 增加返回 `profileId`，前端授权状态表和 Ads 同步表单可脱敏展示/回填。
- 前端新增 `apps/web-v2/src/api/integrations.js` 与 `apps/web-v2/src/pages/AmazonAuthCenter.vue`，支持环境检查、加密保存凭证、真实诊断、profileId 候选、订单/结算/库存/Catalog/Ads 层级同步、M2/M3/M4 深链。
- 新增文档：`docs/implementation/AMAZON_AUTH_CENTER_2026-05-26.md`。
- 新增测试：`tests/qa/amazon-auth-center-contract.test.mjs`，并扩展 `tests/integrations/sync-routes.test.mjs` 覆盖 Ads profileId endpoint。
- 本地验证 PASS：sync routes 19/19、authorization diagnostics 4/4、Amazon auth center contract 4/4、M4 daily API 3/3、M4 daily contract 4/4、M3 button-level 169/169、Ads API 14/14、Ads live action gate 3/3、`apps/web-v2` build PASS。

---

## Round 19b - Amazon 授权接入中心 Linux Deploy（2026-05-26）

- 已部署到 `http://47.97.252.71/#/settings/amazon-auth`。
- Web dist：`dist/release/amz-web-v2-dist-amazon-auth-center-20260526T011319Z.tar.gz`。
- 部署前备份：`/opt/amz/backups/20260526T011409Z-amazon-auth-center`。
- 远端验证 PASS：Node syntax、sync routes + auth center contract + authorization diagnostics 合计 27/27、nginx、amz-api active、`/health`、`/ready`、demo login、`/api/v1/integrations/status`、`/api/v1/integrations/diagnostics`。
- 线上资源 PASS：`/var/www/amz-web/assets/AmazonAuthCenter-_-DaHeux.js` 返回 `200 OK`。
- 部署文档：`docs/implementation/AMAZON_AUTH_CENTER_LINUX_DEPLOY_2026-05-26.md`。
- ???? PASS?M4 daily contract 4/4?M4 daily API 2/2?M2/M4 IA 4/4?nginx?amz-api active?health?demo login?daily API?M4DailyReport asset 200?

---

## Round 18 - M4 ?????????????2026-05-26?

- ???????????????????`/m4/reports/daily` ??????????`/m4/daily-report` ?? redirect??? `meta/group`?????????
- ???????????????????????? / ???????????? BFF ?? `availableStores`?`availableLinks`?`stores`?`links`?
- BFF `GET /api/v1/store/m4/reports/daily` ?? `realDataOnly=true`??? DB ??????????? mock???? overview/????/????????????? 0 ? ?-??
- ??/GMV ?????? `m2_orders` 7 ??????????????????? `lx_daily_data`????????? ASIN/SKU ??? `search_term_reports`?ACOS ???????????????
- ??????????????????????????????
- `data-store-ads.mjs` ? `search_term_reports` ?? `reportingDate` ???? `from/to/asin/sku` ????????????????????
- ?????`docs/implementation/M4_DAILY_REPORT_MONITOR_2026-05-26.md` ???????????????
- ???? PASS?M4 daily contract 4/4?M4 daily API 3/3?M2/M4 IA 4/4?M3 button-level 169/169?`apps/web-v2` build PASS?

---

## Round 18b - M4 ?????????? Linux Deploy?2026-05-26?

- ???? `http://47.97.252.71/`??????`/opt/amz/backups/20260526T002344Z-m4-daily-real-dimensions`?
- Web dist archive?`dist/release/amz-web-v2-dist-m4-daily-real-dimensions-20260526T002133Z.tar.gz`????? chunk?`M4DailyReport-EYrrW-WS.js`?
- ???? PASS?Node syntax?M4 daily contract 4/4?M4 daily API 3/3?M2/M4 IA 4/4?nginx?amz-api active?health?demo login??? API????? API??? asset 200?
- ?????`docs/implementation/M4_DAILY_REPORT_LINUX_DEPLOY_2026-05-26.md`?

---

## Round 20 - Amazon ?? OAuth ???????2026-05-26?

- ?????????????????????????????????????????? OAuth ??????????/????????? Amazon ????????????? token???????? marketplaceId/profileId?
- ???? SP-API ???? Login URI handoff?`GET /api/v1/integrations/oauth/spapi/login`????? HttpOnly SameSite=Lax state cookie ?? Seller Central `amazon_callback_uri` ??? callback???????? refresh token?
- ?? OAuth API?`GET /api/v1/integrations/oauth/config`?`POST /api/v1/integrations/oauth/:provider/start`?`GET /api/v1/integrations/oauth/:provider/callback`?callback ? Bearer token????? 15 ????? state?
- Ads OAuth ?? LWA authorization code flow?????? `/v2/profiles` ???? profileId???? profile ??????? profile ???????
- ?? `/settings/amazon-auth` ????????? SP-API / Amazon Ads????????? NA/EU/FE???????????????????? refresh token/profileId ??????????
- `.env.example` ?? `SPAPI_OAUTH_APPLICATION_ID`?`SPAPI_OAUTH_LOGIN_URI`?`SPAPI_OAUTH_REDIRECT_URI`?`ADS_OAUTH_REDIRECT_URI`?`ADS_OAUTH_SCOPE`?`AMZ_WEB_BASE_URL` ????
- ?????`docs/implementation/AMAZON_ONE_CLICK_OAUTH_AUTH_2026-05-26.md`???/?????`tests/integrations/oauth-flow.test.mjs`?`tests/qa/amazon-auth-center-contract.test.mjs`?
- ???? PASS?OAuth flow 4/4?sync routes 19/19?authorization diagnostics 4/4?auth center contract 4/4?M3 button-level 169/169?web build PASS?diff check PASS?? CRLF ????

---

## Round 20b - Amazon ?? OAuth Linux Deploy?2026-05-26?

- ???? `http://47.97.252.71/#/settings/amazon-auth`?
- Web dist?`dist/release/amz-web-v2-dist-one-click-oauth-20260526T015724Z.tar.gz`?
- ??????`/opt/amz/backups/20260526T015827Z-one-click-oauth`?
- ???? PASS?`/var/www/amz-web/assets/AmazonAuthCenter-DG6F5u4N.js`??? HEAD 200?
- ???? PASS?Node syntax?OAuth flow + auth center contract + sync routes ?? 27/27?M3 button-level 169/169?nginx?amz-api active?health/ready?demo login?OAuth config/status/diagnostics?
- ?????`docs/implementation/AMAZON_ONE_CLICK_OAUTH_LINUX_DEPLOY_2026-05-26.md`?
- ????????????????????????????? Amazon ?????? Login/Redirect URI ?????? env?M3 ??????????

---

## Round 20c - ?????????????? OAuth ???2026-05-26?

- ????????? OAuth ???????????????????????????? `???? SP-API` / `???? Amazon Ads`???????????????????
- ???????`tests/qa/amazon-auth-center-contract.test.mjs` ???????????????????
- ?????? asset?`/var/www/amz-web/assets/AmazonAuthCenter-BtLWlGm4.js`????? chunk ???????????????????????
- ??????????? `CREDENTIAL_ENC_KEY`?????? OAuth URI?SP-API Login/Callback ? Ads Callback ??? `http://47.97.252.71/api/v1/integrations/oauth/...`?`ADS_API_MOCK=false`?sandbox flags false?
- ???? Amazon ????????SP-API ?? `SPAPI_OAUTH_APPLICATION_ID` / `SPAPI_LWA_CLIENT_ID` / `SPAPI_LWA_CLIENT_SECRET`?Ads ?? `ADS_LWA_CLIENT_ID` / `ADS_LWA_CLIENT_SECRET`??????Amazon ????????????????????????
- ????? auth center contract 4/4?OAuth flow 4/4?sync routes 19/19?M3 button-level 169/169?web build PASS??? auth center contract PASS?health PASS?asset HEAD 200?

---

## Round 20d - Amazon OAuth ???????2026-05-26?

- ?????`docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md`?
- ????????????????? refresh token/profileId/marketplaceId??????????????? Amazon ??????
- ?? SP-API ??????????????? Public app??? Login URI / Redirect URI??? `SPAPI_OAUTH_APPLICATION_ID`?`SPAPI_LWA_CLIENT_ID`?`SPAPI_LWA_CLIENT_SECRET`?Draft ?? `SPAPI_OAUTH_VERSION=beta`?
- ?? Amazon Ads ??????? Ads API access??? Ads/LWA client id/secret??? Ads callback URI?scope ? profileId ???????
- ??????????????????/????HTTPS ???????????????????

---

## Round 20e - OAuth credential guide encoding fix (2026-05-26)

- Fixed `docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md`: the previous file had real `?` characters replacing Chinese text, not just a display issue.
- Rewrote the guide with readable Chinese content and saved it as UTF-8 with BOM for Windows editors.
- Verified locally that only URL query strings contain `?`; synced the corrected file to Linux.

## Round 20f - No Amazon Developer App Plan (2026-05-26)

- User confirmed they do not currently have an Amazon developer application.
- Extended `docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md` with a continuation plan: final route is SP-API Public App + Amazon Ads API access; short-term routes are SP-API Private App/self-authorization, mock adapters, and CSV/manual imports.
- Key product stance remains unchanged: daily operators should not fill refresh token/profileId/marketplaceId; app-level credentials are administrator setup, while store authorization is one-click after approval.


---

## Round 21 - 全功能 20 轮产品评审与重做裁决（2026-05-29）

- 新增 PMO 级评审报告：`docs/implementation/PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md`。
- 本轮由 PMO、3 个产品经理、3 个研发/架构、2 个测试/QA 角色完成只读评审；覆盖工作台、Amazon 授权接入、M1、M2、M3 广告、M4 全部子 tab/页面。
- 结论：当前系统已有大量 mock/sandbox 骨架，但生产级重做必须先落 `provider-mode/sourceMeta/audit-revert/tenant isolation/OAuth safety/real-write gate/test traceability` 七个底座。
- 重点 P0：real 模式不得 seed mock；M4 daily 不得把 seed 聚合标成 real；M3 领星 target tab 必须修正为 4 tab；M4 Review/跟卖/侵权错链必须修；M2/M3/M4 write-like action 必须可审计可回滚。
- 测试裁决：旧 491/491 与 148/148 仅作为历史；后续必须重建 TCR、strict contract、集成、Playwright E2E 和测试卫生门禁，并执行至少 R0-R4 的测试-证明-修复闭环。
- 本轮没有声明代码已全部重做，也没有线上部署；报告作为后续研发/测试重做的验收基线。

---

## Round 22 - 全功能复评后的开发闭环与本地全量验证（2026-05-29）

- 新增执行报告：`docs/implementation/FULL_REVIEW_DEVELOPMENT_EXECUTION_2026-05-29.md`，承接 `PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md` 的 PMO/多产品/研发/QA 评审结论，记录本轮代码落地、测试证明和未完成边界。
- M3 高风险写类入口已进一步收口：portfolio/campaign/adgroup/ad/targeting/user-search-term/kw-grabbing/placement 等 LX 写动作默认进入 `ad_action_queue`，`dryRun=1`、`auditRequired=1`、`guardrail.status=needs_review`，不再直接乐观改真实状态。
- M4 日报改为 source-aware provenance：mock/hybrid fixture 默认不再伪装 `realDataOnly=true`；前端展示 `mode=real/mock-hybrid/unknown` 与 `mock=true/false`。
- M4 manual-only 后端强制：test-buy、infringement submit、appeal submit 必须提交人工外部单号/提交人/提交时间/证据附件，不再自动生成伪 Amazon 单号。
- M1 A/B adopt winner 发布语义修正：没有 SP-API 发布回执时只进入 `ready_for_manual_publish`，不得标记 `uploaded_to_amazon=1`。
- 修复 `tests/deploy/release-safety.test.mjs` 的 CRLF compose block 误判；后续收口后最新门禁为 `npm.cmd test` 724/724 PASS，`npm.cmd run web:build` PASS，`npm.cmd run check` PASS；重点回归 3 轮，每轮 364/364 PASS。
- 本轮未执行 Linux 部署，未接入真实 Amazon 凭证；真实店铺生产闭环仍需在获得凭证与网络/部署权限后单独验证。

---

## Round 23 - M3/M2/M4/工作台审计队列最终收口（2026-05-29）

- M3 领星 write-like 路由继续收口到统一 `ad_action_queue`：portfolio / campaign / ad-group / ad / targeting / negative / user-search-term / report promote/negate / SQP take-action / bulk-create / bulk-import / campaign copy / kw-grabbing / AMC audience 等路由不再直接改业务影子表。
- M2 库存联动与 M4 跟卖/品牌防御联动不再绕过 M3：统一生成 `M2_*` / `M4_*` Action Queue intent，由 M3 审计、审批、dry-run、执行 gate 和回滚语义接管。
- Amazon 手动保存 SP-API refresh token、Ads refresh token、Ads profileId 已补 audit，且 audit payload 不包含 token 明文。
- 认证态 `/api/v1/dashboard` 已改为 DB-backed 工作台合同，返回 `sourceMode:'db'`、`sourceMeta.mock:false` 和 Action Queue 深链；未认证路径保留 sample mock 兼容安全测试。
- 直写扫描确认 `apps/api/src/store-routes-ads.mjs` 中危险 create/update/delete/report/SQP/bulk/copy helper 仅保留 import 引用，路由层不再直接调用。
- 验证证据：重点回归 3 轮每轮 364/364 PASS；`npm.cmd test` 724/724 PASS；`npm.cmd run web:build` PASS；`npm.cmd run check` PASS。
- 边界：Round 23 开发收口本身是本地 mock/sandbox 和合同层收口；真实 Amazon SP-API/Ads 凭证/profileId 仍未提供，真实外部写入仍必须通过逐条审批与显式 real-write gate。Linux 部署见 Round 24。

---

## Round 24 - Linux 部署与 Git 同步执行（2026-05-29）

- 已把 Round 23 收口代码和最新 Web dist 部署到 `http://47.97.252.71/`；部署报告：`docs/implementation/ROUND23_LINUX_GIT_DEPLOY_2026-05-29.md`。
- 服务器备份：`/opt/amz/backups/20260528T200037Z-round23-action-queue`。
- 本地部署前门禁：`npm.cmd run check` PASS，其中 `npm test` 724/724 PASS，Web build PASS。
- 远端验证：`node --check` 5 个核心 API 文件 PASS；远端 Node tests 14/14 PASS；`nginx -t` PASS；`systemctl restart amz-api` 后 active；远端 `/health`、`/ready` PASS；认证 `/api/v1/dashboard` 返回 `sourceMode: db`。
- 公网验证：`http://47.97.252.71/health`、`/ready`、`/` 均返回 200。
- Git 同步：因原仓库 `.git` 对当前 sandbox 用户禁止写入，已在 `tmp/amz-push-round23-20260529T0411` 临时 clone 中创建本地 commit；bundle 已生成 `D:\amz\tmp\amz-round23-latest.bundle` 并复制到服务器备份目录。推送 GitHub 失败，原因是 `github.com-green110105` SSH alias 在当前环境不可解析，直连 `github.com` 又无法读取 Administrator SSH key。
- 边界保持不变：服务器仍是 mock/sandbox-gated；未配置真实 Amazon SP-API / Ads 凭证/profileId；未开启批量真实写入。

---

## Round 25 - Codex to Claude 交接文档（2026-05-29）

- 新增完整交接文档：`codex22claude.md`。
- 同步镜像到实现文档：`docs/implementation/CODEX_TO_CLAUDE_HANDOFF_2026-05-29.md`。
- 文档覆盖：本地/服务器运行状态、Linux 部署证据、Git 临时 clone/bundle 状态、M3 Action Queue 收口、M2/M4 跨模块联动、Amazon 授权与凭证 audit、工作台 DB-backed、M1/M2/M4 边界、测试命令、后续 Claude 优先级和禁止事项。
- 交接边界：不包含任何服务器密码、Amazon refresh token、LWA secret 或 GitHub token；真实 Amazon 授权/真实数据/真实写入仍未完成。
