# 全功能 20 轮产品评审与研发/测试重做裁决报告

日期：2026-05-29  
范围：工作台、Amazon 授权接入、M1 Listing、M2 利润库存、M3 广告、M4 全部子 tab/页面  
状态：已完成只读产品评审、研发评审、测试评审；本报告是后续研发与测试重做的验收基线，不声明代码已经全部重做。

---

## 0. PMO 最终结论

当前系统已经不是纯 demo：M1-M4 路由、页面、API、审计、mock-gated 数据链路、Amazon OAuth 骨架、M3 Strategy OS、M4 日报都已有实现。但离“接入真实 Amazon 店铺后，运营团队每天放心使用”的生产级系统，还缺四个底座：

1. **真实/Mock 数据边界**：不能让 seed/mock 数据伪装成真实同步数据；`realDataOnly`、`mock:false`、授权状态必须可证明。
2. **Action / Audit / Revert 闭环**：所有 write-like 操作必须有 before/after、审批、dry-run、真实写入闸门、失败补偿、级联回滚。
3. **工作台可处置性**：工作台不能只是“看板 + 跳深水页”，必须能 assign、due、approve/reject、snooze、done、evidence、audit、revert。
4. **前端交互与测试证明**：导航、深链、移动端、sourceMeta、错误态、空态、表单校验、E2E 门禁都要重做。

PMO 裁决：

- **不要盲目删除已有代码再重写**。Amazon OAuth 加密、Ads 真实写入 gate、M1/M2/M3/M4 已有业务端点、domain engines 和大量回归测试应保留为安全网。
- **必须按生产不变量重做**：provider mode、source/freshness/confidence、tenant isolation、audit/revert、real-write gate、workbench action inbox、strict test gate。
- **研发和测试都要重做到“可证明”**：每个评审结论必须映射到需求 ID、代码路径、测试 ID、证据日志；旧的 491/491、148/148 只能作为历史。

---

## 1. 参与角色与证据

| 角色 | Subagent / 职责 | 输出性质 | 关键结论 |
|---|---|---|---|
| 项目经理 PMO | James `019e6f6e-d728-7f51-aadb-5ceeeaf2791a` | 20 轮评审框架与监督标准 | 每轮必须有业务结论、交互结论、证据、验收标准 |
| 产品经理 A | Turing `019e6f6e-f496-7093-b92c-478d22f9763b` | 工作台 + Amazon 授权 + 全局导航 | 缺统一数据/授权状态机；一键授权要变成 onboarding wizard |
| 产品经理 B | Mencius `019e6f6f-259e-7070-90e9-01e6311a08f2` | M1 + M2 | M1/M2 是准作战系统，但缺发布包、财务严谨性、执行闭环 |
| 产品经理 C | Copernicus `019e6f6f-4d25-7d11-ae89-0b345b0cb4a5` | M3 + M4 | M3/M4 骨架完整，但领星 tab、执行复盘、M4 深链、风险处置仍是 P0 |
| 研发架构 | Kant `019e6f6f-6a7c-74a0-94c4-8b7f0fc8197f` | 后端/前端/路由/数据层架构 | provider-mode 未真正约束 seed；API contract 与 legacy mock 漂移 |
| 后端研发 | Chandrasekhar `019e6f7c-22b1-70b2-9cb9-4c32343110f3` | Amazon/Auth/API/Data/Audit 只读评审 | 数据来源、审计回滚、租户隔离、OAuth 安全是 P0 |
| 前端研发 | Lagrange `019e6f7c-2313-7a80-8c56-a3b10eebd7df` | IA/交互/状态/移动端只读评审 | 导航、write-like gate、sourceMeta、移动端 fallback 要重做 |
| 测试负责人 | Einstein `019e6f70-12e9-7392-9ee0-c74f468f0fa6` | 已运行测试 + 测试架构建议 | 548 pass；`npm test` 718/720 pass，2 个 release-safety 失败；E2E 未入默认门禁 |
| QA/E2E | Darwin `019e6f7c-2383-7722-8428-f47c56a48752` | 测试重做方案 | 现有测试多但过浅，必须重建 TCR、合同、集成、E2E 和卫生门禁 |

本轮核验过的代表性证据：

- 全局路由：`apps/web-v2/src/router/index.js:4`、`apps/web-v2/src/router/index.js:10`、`apps/web-v2/src/router/index.js:26`、`apps/web-v2/src/router/index.js:52`、`apps/web-v2/src/router/index.js:105`、`apps/web-v2/src/router/index.js:126`
- 全局布局与状态提示：`apps/web-v2/src/layouts/DefaultLayout.vue:108`、`apps/web-v2/src/layouts/DefaultLayout.vue:228`、`apps/web-v2/src/layouts/DefaultLayout.vue:263`
- Amazon 授权：`apps/web-v2/src/pages/AmazonAuthCenter.vue:249`、`apps/web-v2/src/pages/AmazonAuthCenter.vue:444`、`apps/web-v2/src/pages/AmazonAuthCenter.vue:467`、`apps/api/src/integrations/sync-routes.mjs:5`、`apps/api/src/integrations/oauth-flow.mjs:41`
- M1：`apps/web-v2/src/pages/ListingSelect.vue:180`、`apps/web-v2/src/pages/ListingOptimize.vue:29`、`apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue:57`、`apps/api/src/store-routes-listings.mjs:72`
- M2：`apps/web-v2/src/pages/M2ControlTower.vue:90`、`apps/web-v2/src/pages/M2ControlTower.vue:320`、`apps/web-v2/src/pages/M2ControlTower.vue:424`、`apps/api/src/data-store-profit.mjs:1201`
- M3：`apps/web-v2/src/pages/AdsHub.vue:207`、`apps/web-v2/src/pages/AdsTimeline.vue:217`、`apps/web-v2/src/pages/StrategyLibrary.vue:131`、`apps/web-v2/src/utils/ad-drawer-config.js:45`
- M4：`apps/web-v2/src/pages/M4DailyReport.vue:119`、`apps/web-v2/src/pages/M4OpsWorkbench.vue:420`、`apps/web-v2/src/pages/ReviewList.vue:69`、`apps/web-v2/src/pages/ReviewClusters.vue:67`
- 数据/Mock 边界：`apps/api/src/integrations/provider-mode.mjs:4`、`apps/api/src/data-store.mjs:314`、`apps/api/src/data-store.mjs:389`、`apps/api/src/store-routes-monitor.mjs:404`
- 测试门禁：`package.json:16`、`package.json:17`、`playwright.config.mjs:11`、`tests/contracts/openapi.test.mjs:6`

---

## 2. 20 轮深度产品评审记录

### R01 项目基线与范围冻结

- 争论：保留已有 M1-M4 骨架继续演进，还是全部推倒重写。
- 证据：`apps/api/src/extended-routes.mjs:30` 已分发 integrations、M1/M2/M3/M4；`apps/web-v2/src/router/index.js:4` 已有完整 SPA 主路由。
- 裁决：保留已证明可用的骨架，不做无意义推倒；按生产不变量重做底座与交互闭环。
- 重做要求：先定义 provider/source/audit/tenant/real-write 不变量，再动模块。
- 测试证明：新增 `tests/contracts/product-review-traceability.test.mjs`，让每轮结论映射到测试。

### R02 全局工作台、导航、店铺切换、数据健康

- 争论：工作台是 BI 看板还是运营行动入口。
- 证据：`apps/web-v2/src/pages/Workbench.vue:21` 已接 dashboard API；`apps/web-v2/src/layouts/DefaultLayout.vue:263` 仍硬编码“Mock 数据已加载”；`apps/web-v2/src/layouts/DefaultLayout.vue:228` 顶部搜索只有输入。
- 裁决：工作台必须回答“今天要处理什么、数据真实吗、谁负责、处理完了吗”。
- 重做要求：建立全局 `AuthDataStatus` / `DataHealth` 状态源；店铺切换触发 M1-M4 数据刷新；深链高亮父模块。
- 测试证明：E2E 覆盖 deep route active、store switch refresh、sourceMeta 可见、移动抽屉跳转后关闭。

### R03 Amazon 授权接入主流程

- 争论：用户要“一键授权”，是否还需要手填很多参数。
- 证据：`apps/web-v2/src/pages/AmazonAuthCenter.vue:444` 有“一键授权 SP-API”；`apps/web-v2/src/pages/AmazonAuthCenter.vue:467` 有“一键授权 Amazon Ads”；`apps/api/src/integrations/oauth-flow.mjs:158` 会生成 Seller Central 授权入口；`docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md:34` 仍列缺 Amazon app-level 参数。
- 裁决：最终形态必须是运营点击授权 -> Amazon 页面确认 -> 回到系统 -> 自动诊断 -> 选择 profile/marketplace -> 同步数据；没有 Amazon developer app 时不能假装可跳转。
- 重做要求：授权页改成 onboarding wizard；无配置时展示“申请开发者应用/继续 sandbox”的清晰路径。
- 测试证明：覆盖 no-config、OAuth success、OAuth error、multi-profile、token redaction、callback replay。

### R04 Amazon 授权安全、同步与下游可用性

- 争论：为了开发测试能否冒险接真实店铺；生产边界如何守住。
- 证据：`apps/api/src/integrations/crypto/token-cipher.mjs:11` 缺 key fail-closed；`apps/api/src/integrations/oauth-flow.mjs:257` start 响应返回 state；`apps/api/src/integrations/sync-routes.mjs:252` 有 sync all；`apps/api/src/integrations/sp-api/credentials.mjs:40` 保存凭证后标授权。
- 裁决：真实读可以冒险，真实写不能冒险；授权成功不等于下游 M1-M4 可用，必须经过同步和数据健康判断。
- 重做要求：SP-API login handoff 校验官方 Amazon callback host；HTTPS-only；manual token 保存要 RBAC；同步结果要 records/errors/freshness。
- 测试证明：`oauth-callback-allowlist`、`oauth-credential-redaction-rbac`、`amazon-auth-store-isolation`。

### R05 M1 目标选择与真实 Listing 输入

- 争论：M1 入口三模式是否足够贴近真实运营。
- 证据：`apps/web-v2/src/pages/ListingSelect.vue:180` 提供已有 Listing、ASIN 识别、新建 Listing；`apps/web-v2/src/pages/ListingSelect.vue:91` 外部 ASIN 阻断进入作战室；`apps/web-v2/src/pages/ListingSelect.vue:133` 新建 brief 只要求类目/卖点/人群/价格带。
- 裁决：三入口方向正确，但新品 brief 过轻；外部 ASIN 不能优化是对的，但应生成竞品对标报告。
- 重做要求：新建 Listing brief 增加站点、语言、变体、尺寸重量、FBA/FBM、COGS、目标毛利、合规文件、素材来源。
- 测试证明：三入口 E2E；external ASIN 只读锁；新建 brief 字段校验。

### R06 M1 Listing 作战室主流程

- 争论：作战室是否已经能替代运营手工 checklist。
- 证据：`apps/web-v2/src/pages/ListingOptimize.vue:29` 有 8 个锚点；`apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue:80` 覆盖真实快照、竞品 VOC、文案、素材、合规、版本实验；`apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue:160` 有发布前检查卡。
- 裁决：作战室方向正确，但必须输出“可人工发布的 Listing 发布包”。
- 重做要求：发布包包含文案 diff、关键词覆盖、MAIN+PT01-PT08、A+/Video、PTD 必填、合规阻断、签核、Seller Central 手工发布步骤、发布后复盘。
- 测试证明：M1 war room flow 集成测 + Playwright 从目标到 readiness。

### R07 M1 文案、图片、合规、发布前检查

- 争论：当前 fixed word risk check 和 picsum mock 图片能否支撑真实发布。
- 证据：`apps/web-v2/src/components/m1/GenerationBlock.vue:70` 固定风险词；`apps/web-v2/src/components/m1/GenerationBlock.vue:229` 明确 MAIN + PT01-PT08；`apps/api/src/data-store-listings.mjs:1614` 图片生成注释为 mock；`docs/implementation/M1_PRODUCTION_LISTING_WAR_ROOM_2026-05-25.md:122` 说明 readiness 不等于真实 Amazon 发布成功。
- 裁决：M1 只能定位为“发布前准备/人工发布包”，不能把 mock 图片或 readiness 当 Amazon 发布成功。
- 重做要求：合规规则扩展到类目禁词、商标/IP、认证、FDA/Prop65、儿童/电池/无线/食品接触材料、图片 OCR。
- 测试证明：`m1-publish-semantics`：没有 SP-API publish 成功回执不得置 `uploaded_to_amazon=1`。

### R08 M1 版本、A/B、资源治理中心

- 争论：资源库是知识库，还是可治理的生产规则系统。
- 证据：`apps/web-v2/src/components/m1/VersionBlock.vue:109` 支持 diff；`apps/web-v2/src/components/m1/VersionBlock.vue:159` 支持 combined pick；`apps/web-v2/src/pages/M1ResourceHub.vue:209` 已下线关键词热力图、多语言母版；`apps/web-v2/src/pages/M1ResourceHub.vue:5` 仍导入 mock 资源。
- 裁决：资源中心要保留关键词护栏、类目规则、VOC、评分校准，但必须 API 化、版本化、可审批。
- 重做要求：资源规则加 owner、版本、生效站点/类目、审批、冲突处理、导入日志、影响的 Listing。
- 测试证明：资源路由重定向、规则 API、影响 Listing 追踪。

### R09 M2 经营利润工作台

- 争论：M2 工作台是汇总看板还是执行收件箱。
- 证据：`apps/web-v2/src/pages/M2ControlTower.vue:90` 并行拉取 overview、SKU、漏点、补货、滞销、跟价、现金流、PO、供应商、调拨、汇率、税务、LTV、报警；`apps/web-v2/src/pages/M2ControlTower.vue:168` 合并 actionCards；`apps/web-v2/src/pages/M2ControlTower.vue:424` 抽屉展示 JSON evidence。
- 裁决：M2 工作台必须升级为 Action Inbox，首页能处理 80% P0/P1 卡片。
- 重做要求：每张卡必须有 typed action、owner、due、source/freshness/confidence、impact、risk、approve/reject/snooze/done、audit、revert。
- 测试证明：M2 workbench E2E；局部 API 失败不能被 `settle` 静默吞掉。

### R10 M2 利润、漏点、现金流、情景模拟

- 争论：当前利润和现金流能否给财务决策使用。
- 证据：`apps/web-v2/src/pages/ProfitOverview.vue:71` 显示平均置信度；`apps/web-v2/src/pages/OrderProfit.vue:123` 有费用瀑布；`apps/api/src/data-store-profit.mjs:949` waterfall 做金额闭合；`apps/api/src/data-store-profit.mjs:1201` 新增现金流事件只基于上一行余额计算当前行；`apps/api/src/integrations/sp-api/sync/orders-mapper.mjs:88` 输出 estimate。
- 裁决：M2 可用于发现异常，不能作为最终财务账；必须做 ledger 和 reconciliation。
- 重做要求：现金流新增/修改/删除事件后重算未来余额；订单、结算、退款、FBA/Referral fee、广告花费、汇率、库存成本做暂估转终值。
- 测试证明：waterfall 金额闭合、cashflow future recompute、estimate->actual reconciliation。

### R11 M2 库存、补货、PO、供应商、调拨

- 争论：现有 PO/供应链是否足够让采购直接下单。
- 证据：`apps/web-v2/src/pages/InventoryReorder.vue:170` 支持生成 PO 草稿；`apps/web-v2/src/pages/InventoryReorder.vue:185` 供应商不是强校验；`apps/api/src/data-store-profit.mjs:1296` 生成 PO 可落默认供应商；`apps/web-v2/src/pages/PurchaseOrders.vue:122` 支持状态流转。
- 裁决：供应链页面方向正确，但下单必须强约束。
- 重做要求：补货考虑 supplier、MOQ、箱规、lead time、FBA 库容、入仓 ETA、现金约束、断货损失；PO 强制供应商和 SKU 校验。
- 测试证明：PO 状态机非法迁移、供应商必填、付款/入仓写现金流/库存/audit。

### R12 M2 跟价、汇率、支付、税务、LTV、报警、库存联动

- 争论：企业页和跨模块联动是否已生产可用。
- 证据：`apps/web-v2/src/pages/MultiStore.vue:7` 仍直接导入 mockMultiStore；`apps/web-v2/src/pages/TaxAssist.vue:66` 税务导出只是成功提示；`apps/web-v2/src/pages/InventoryLink.vue:176` 可立即执行；`PROJECT_STATUS.md:40` 记录 M2->M3 impactCampaigns 通常为空。
- 裁决：M2 企业页不能只做看板；M2->M1/M3/M4 联动必须默认 dry-run + 可回滚。
- 重做要求：调价要有最低毛利、MAP、Buy Box、价格健康、Coupon/广告联动；库存联动列出具体 campaigns/adgroups/keywords。
- 测试证明：`m2-cross-module-revert-cascade`、inventory-link impactCampaigns 非空或给出 unavailableReason。

### R13 M3 Control Tower 与目标档案

- 争论：广告投手是否应该直接管理 83 条策略。
- 证据：`apps/web-v2/src/pages/AdsHub.vue:215` 已把 83 条策略收敛为少量动作卡；`apps/web-v2/src/pages/AdsHub.vue:207` 明示真实写入关闭；`apps/api/src/data-store-ads.mjs:141` 有 `ad_goal_profiles`。
- 裁决：用户不直接管理 83 条策略，而是配置目标、边界、预算、风险偏好、不动对象；系统输出少量高质量动作卡。
- 重做要求：GoalProfile、GuardrailProfile、StrategyRun、Signal、ConflictDecision、Observation 标准化。
- 测试证明：每张建议卡必须含 typedAction、EvidenceRef、Guardrail、Rollback、Impact、sourceMeta。

### R14 M3 Timeline、执行篮、审计、真实写入 gate

- 争论：是否允许广告动作一键执行。
- 证据：`apps/web-v2/src/pages/AdsTimeline.vue:155` 支持批量 dry-run；`apps/web-v2/src/pages/AdsTimeline.vue:217` manual change revert 仍是前端本地状态；`apps/api/src/integrations/ads-api/live-action-executor.mjs:38` 有真实写入 gate；`apps/api/src/data-store-ads.mjs:2180` action queue revert 偏本地。
- 裁决：P0 不开放真实批量写入；先做 dry-run + 人工执行清单 + 执行凭证回填 + 观察复盘。
- 重做要求：每个 Ads primitive 需要 dry-run inverse、live inverse 或人工补偿 SLA；manual change 不可伪装“撤销成功”。
- 测试证明：`m3-action-queue-proof` 与 `m3-real-write-compensation`。

### R15 M3 Strategy OS 与 AI 策略落地

- 争论：AI 是出价决策者还是策略分析/解释者。
- 证据：`docs/implementation/M3_ULTIMATE_AI_STRATEGY_OS.md:31` 写明 83 条策略；`apps/web-v2/src/pages/StrategyLibrary.vue:131` 页面仍写 72 条策略；`apps/web-v2/src/pages/StrategyLibrary.vue:134` 顶部按钮存在但动作不完整。
- 裁决：LLM 不能直接决定 bid/budget/pause/否词真实写入；AI 做 Context Builder、Signal Analyst、Conflict Judge、Operator Explainer、Postmortem Analyst。
- 重做要求：策略数量动态化；策略库从“启停列表”变为模板/实例/冲突裁决/回测/胜率。
- 测试证明：策略数量与数据一致；guardrail blocked 可视化；无死按钮。

### R16 M3 领星等价广告模块与 tab 矩阵

- 争论：领星等价页是“漂亮 UI”，还是必须结构等价真实领星。
- 证据：`apps/web-v2/src/utils/ad-drawer-config.js:45` 当前 target 包含 `userSearchTerms`；`docs/implementation/LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md:68` 明确真实投放详情只有 4 tab；`docs/implementation/LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md:535` 目标 tab 应为 `daily/compare/hourly/placement`。
- 裁决：P0 修正领星 tab 矩阵；不能再用单一 `entityType=target` 一刀切，必须用 `surfaceKey + adProduct + entityKind`。
- 重做要求：建立 surface registry、identity、daily/hourly/placement/searchTerm/matchedTarget/attribution/log facts。
- 测试证明：target 详情无 userSearchTerms；用户搜索词独立路径；surface matrix 合同测试。

### R17 M4 每日监控日报

- 争论：日报是第二个重复监控页，还是老板/运营每天必看的日报。
- 证据：`apps/web-v2/src/pages/M4DailyReport.vue:119` 声明只读真实库、无 mock 补齐；`apps/web-v2/src/pages/M4DailyReport.vue:189` 包含销量/GMV/广告花费/评分/告警；`apps/api/src/store-routes-monitor.mjs:404` 返回 `realDataOnly:true`，但后端可能读取 seed。
- 裁决：M4 日报是必要功能，但必须支持店铺维度、链接维度、趋势、深链和真实/Mock 证明。
- 重做要求：日报聚合需输出每个指标的 provider、syncRunId、freshness、confidence、mockSeedBatch；无真实数据时显示无数据，不用 mock 补齐。
- 测试证明：`mock-provenance-daily-report`、`m4-daily-report-schema`、日报 E2E。

### R18 M4 异常、SLA、案例、复盘

- 争论：风险工作台是收件箱，还是处置台。
- 证据：`apps/web-v2/src/pages/M4OpsWorkbench.vue:152` 聚合 riskCards；`apps/web-v2/src/pages/M4OpsWorkbench.vue:420` 抽屉直接展示 JSON；`apps/web-v2/src/pages/MonitorAnomalies.vue:64` 深水页已有分派、确认、解决、忽略、升级。
- 裁决：工作台做分诊 + 快速动作 + SLA，深水页做专业处置 + 证据编辑 + 复盘沉淀。
- 重做要求：统一 M4 case lifecycle；异常、SLA、case、postmortem 同源事件线；SLA 后台 tick 必须补齐。
- 测试证明：M4 anomaly state machine、SLA breach tick、case/postmortem audit。

### R19 M4 跟卖、侵权、BrandDefense、品牌保护

- 争论：跟卖假货是否自动暂停广告。
- 证据：`apps/api/src/data-store-monitor.mjs:127` 跟卖表含 M3 广告暂停字段；`docs/M4_SPEC.md:573` 要求跟卖确认假货后调用 M3 暂停广告并防重复；`apps/web-v2/src/pages/Hijacking.vue:71` 通知 link 写 `/hijacking`，实际路由是 `/monitor/hijacking`；`apps/web-v2/src/pages/BrandDefense.vue:39` sourceModule 仍写 M3。
- 裁决：确认假货后可触发 M3 暂停建议或 sandbox pause，但必须展示证据、影响 campaign、恢复时间、dedup、override。
- 重做要求：品牌保护案件主表；跟卖/侵权/BrandDefense/M3 品牌词防御形成统一链路。
- 测试证明：hijack counterfeit -> M3 pause/resume/dedup；通知 link 不 404。

### R20 M4 Review、竞品、图片差异、通知与跨模块闭环

- 争论：差评优先客服处理，还是推 M1 Listing 改版。
- 证据：`apps/web-v2/src/pages/ReviewList.vue:69` 申诉跳 `/appeals`，真实路由是 `/reviews/appeals`；`apps/web-v2/src/pages/ReviewList.vue:78` 挽回跳 `/recovery-emails`，真实路由是 `/reviews/recovery`；`apps/web-v2/src/pages/ReviewClusters.vue:67` 聚类查看评论跳 `/reviews/list`，真实路由是 `/reviews`；`apps/web-v2/src/pages/ImageDiff.vue:95` 使用 placeholder 图。
- 裁决：Review 卡片必须同时给客服动作、Listing 动作、广告保护动作，但默认只生成建议，不自动外部发送。
- 重做要求：Review case lifecycle：发现 -> 归因 -> 申诉/挽回 -> 推 M1 -> 广告保护 -> 结果追踪。
- 测试证明：ReviewList 跳转、cluster 跳转、image diff push M1、notification read/unread/link。

---

## 3. 最终产品方案：整体功能进化

系统级不变量：

1. **Data Provenance First**：每个指标和动作都必须说明 `sourceMode/provider/syncRunId/freshness/confidence/mockSeedBatch`。
2. **Auth -> Sync -> Readiness**：授权成功只是第一步，必须诊断、选择 profile/marketplace、同步、计算模块可用性。
3. **Action Inbox First**：工作台默认展示可处理事项；所有动作有 owner、due、状态、证据、影响、风险。
4. **Audit/Revert First**：所有 write-like 操作都必须先有审计和回滚/补偿路径。
5. **Real Write Off By Default**：真实 Amazon/Ads 写默认关闭；只有 allowlist + confirm + riskAccepted + approval + rollback plan 全部满足才能写。
6. **Human-readable Evidence**：证据抽屉不能裸 JSON，必须给运营/财务/老板看得懂的证据链。
7. **Mobile Core Actions**：移动端至少能看 P0/P1、批准/拒绝、备注、分派、查看证据。
8. **Test Traceability**：20 轮评审每条裁决都要落到 TCR、代码路径、测试路径、证据日志。

模块最终形态：

- **工作台**：全局数据健康 + Amazon 授权状态 + 今日行动 Inbox + 跨模块风险 + 审计/回滚入口。
- **Amazon 授权接入**：一键授权 wizard；没有 Amazon developer app 时给申请路径和 sandbox 继续路径；授权后自动诊断、profile 选择、同步、数据健康。
- **M1**：Listing 发布包系统；从目标、竞品、VOC、文案、图片、合规、PTD、签核到人工发布/复盘的作战室。
- **M2**：经营利润与库存执行台；财务可信度、现金流 ledger、PO/供应链约束、补货/滞销/调价/广告联动的行动系统。
- **M3**：广告 AI Strategy OS；83 条策略不直接暴露，由目标、护栏、信号、冲突裁决、动作卡、dry-run、观察复盘驱动。
- **M4**：运营风险与日报系统；每日关键指标 + 风险分诊 + Review/品牌保护/竞品监控 + 通知偏好 + case lifecycle。

---

## 4. 研发重做裁决

### 4.1 必须保留

- Amazon OAuth/诊断/凭证加密总体模式：`apps/api/src/integrations/oauth-flow.mjs`、`apps/api/src/integrations/authorization-diagnostics.mjs`、`apps/api/src/integrations/crypto/token-cipher.mjs`
- Ads 真实写入 gate 思路：`apps/api/src/integrations/ads-api/live-action-executor.mjs`
- M1/M2/M3/M4 已有 store routes 与 domain engines，作为回归安全网
- 已有 mock fixtures，用于 sandbox 与测试，但必须显式标记来源

### 4.2 必须重做

| 优先级 | 重做项 | 文件/范围 | 验收 |
|---|---|---|---|
| P0 | provider-mode 与 seed 语义 | `apps/api/src/integrations/provider-mode.mjs`、`apps/api/src/data-store.mjs`、各 `data-store-*` | real 模式不 seed；mock 不伪装授权；M4 daily 不硬编码 real |
| P0 | 数据 provenance | M1/M2/M3/M4 API + 前端 sourceMeta | 每个核心指标有 provider/freshness/confidence/mockSeedBatch |
| P0 | Action/Audit/Revert 引擎 | `apps/api/src/data-store.mjs`、`infra/db/migrations/0050_audit_center.sql` | inverse 未成功不得标 reverted；M2/M3/M4 级联回滚 |
| P0 | Ads 多租户键 | `apps/api/src/data-store-ads.mjs`、`ads-api/sync/campaigns-sync.mjs` | `(user,store,profile,externalId)` 隔离，不覆盖 |
| P0 | OAuth 安全 | `oauth-flow.mjs`、`sync-routes.mjs`、credentials | HTTPS-only、callback allowlist、RBAC、token redaction |
| P0 | 前端 IA/状态 | `DefaultLayout.vue`、`useLocalStore.js`、Pinia app store | 深链高亮、店铺切换刷新、统一数据健康 |
| P0 | M3 领星 tab 矩阵 | `ad-drawer-config.js`、LX 页面/API | target 4 tab；search term 独立实体 |
| P0 | M4 错误深链 | Review/Hijacking/Infringement/BrandDefense | 全站 M4 主流程无 404 |
| P1 | M1 发布语义 | M1 publish/readiness/version/AB | 无 SP-API 回执不得 uploaded_to_amazon=true |
| P1 | M2 财务 ledger | M2 profit/cashflow/settlement | estimate/actual reconciliation；现金流未来余额重算 |
| P1 | M4 case lifecycle | M4 anomalies/review/brand/competitor | 从发现到复盘统一事件线 |
| P2 | 安全默认值 | `security.mjs`、security tests | 生产 CORS 不为 `*`，客户端不能改限流 |

---

## 5. 测试全部重做方案

测试重做不是“多跑几遍旧测试”，而是把测试目标从“页面能点、字符串存在”改为“业务闭环可证明”。

### 5.1 现有测试问题

- `package.json:16` 的 `npm test` 只跑 `.test.mjs`，不跑 Playwright `.spec.mjs`。
- `playwright.config.mjs:11` 设置 `forbidOnly:false`，门禁不应允许 `.only`。
- 多个 E2E 使用 safeClick/tryClick/soft assertion，点击失败会被吞掉。
- 多个 QA 测试用 `if (!fixture) return` 静默跳过关键断言。
- OpenAPI 测试只查 route/operationId，`ApiResponse` 允许任意属性，不能证明 schema。
- `docs/test-evidence/SUMMARY.md:1` 证据时间早于后续改造，旧 491/491 不能作为当前验收。

### 5.2 新增测试清单

| 类型 | 文件 | 覆盖 |
|---|---|---|
| 合同 | `tests/contracts/product-review-traceability.test.mjs` | 20 轮评审 -> TCR -> 测试映射 |
| 合同 | `tests/contracts/openapi-schema-strict.test.mjs` | 禁止 generic-only schema，运行时响应 schema-valid |
| 合同 | `tests/contracts/test-hygiene-contract.test.mjs` | 禁止 `.only`、soft pass、conditional return、永真断言 |
| 合同 | `tests/contracts/docs-encoding-contract.test.mjs` | 关键 docs/status 不允许乱码/连续问号损坏 |
| 集成 | `tests/integrations/amazon-auth-store-isolation.test.mjs` | OAuth state、store 隔离、多 profile、token 不回显 |
| 集成 | `tests/integrations/provider-mode-real-no-seed.test.mjs` | real 模式不 seed、不伪授权 |
| 集成 | `tests/integrations/m1-war-room-flow.test.mjs` | M1 发布包、图片 9 槽、合规、readiness audit |
| 集成 | `tests/integrations/m2-profit-inventory-loop.test.mjs` | 利润、补货、PO、现金流、M3/M4 联动 |
| 集成 | `tests/integrations/m3-action-queue-proof.test.mjs` | suggestion -> queue -> approve -> dry-run -> observe -> rollback |
| 集成 | `tests/integrations/m4-risk-daily-fanout.test.mjs` | 日报多源 fan-out、空值语义、sourceMeta |
| E2E | `tests/e2e/critical-operator-journeys.spec.mjs` | M1/M2/M3/M4/Auth 五条关键运营旅程 |
| E2E | `tests/e2e/m3-evidence-action-queue.spec.mjs` | M3 证据深链、执行篮、dry-run、回滚 |
| E2E | `tests/e2e/m2-m4-workbench-ia.spec.mjs` | M2/M4 两次点击到任务、旧深链可达 |
| E2E | `tests/e2e/m4-daily-report.spec.mjs` | 店铺/链接维度、趋势、深链、无 mock 补齐 |
| E2E | `tests/e2e/amazon-auth-center.spec.mjs` | 缺开发者应用、OAuth callback、DOM token 泄漏扫描 |

### 5.3 测试-证明-修复迭代

| 轮次 | 目标 | 证明物 | 通过标准 |
|---|---|---|---|
| R0 红灯基线 | 先启用严格测试，不修代码 | red log、失败截图/trace、失败 TCR | 能抓到 E2E 未门禁、schema 泛化、conditional return、文档损坏 |
| R1 合同修复 | 修 TCR、OpenAPI schema、测试卫生 | 合同 red -> green 记录 | 20 轮结论都有 owner/test；无 generic-only schema |
| R2 集成修复 | 修 fixture、状态机、副作用、audit/rollback | DB/audit 断言日志 | 无静默空跑；write-like 操作都有 audit/rollback |
| R3 E2E 修复 | 修关键运营旅程和 UI 状态 | Playwright trace/screenshot/API 日志 | 五条关键旅程全绿；错误数 0；无 soft assertion 掩盖 |
| R4 反证回归 | 故意破坏一个 guardrail/schema/route 再恢复 | mutation fail log + restore green log | 测试能抓住故意破坏，恢复后全门禁通过 |

---

## 6. 验收门槛

- **产品验收**：20 轮评审每条裁决都有 TCR、owner、代码路径、测试路径、证据日志。
- **数据验收**：真实凭证未接入时所有 mock/seed/fallback 显式标记；real 模式不 seed；日报不伪 real。
- **授权验收**：一键授权能跳 Amazon；缺开发者应用时给明确原因；OAuth state 防重放/过期；token 不回显。
- **M1 验收**：能产出完整 Listing 发布包；没有 SP-API 回执不得声明已发布 Amazon。
- **M2 验收**：工作台能处理 80% P0/P1 卡；利润/现金流有 estimate/actual 和 reconciliation。
- **M3 验收**：每个建议卡有证据、护栏、回滚、预期影响；执行篮 dry-run 可证明；领星 target tab 矩阵正确。
- **M4 验收**：日报支持店铺/链接维度和趋势；风险工作台可处置；Review/跟卖/侵权/竞品/通知全链路无错链。
- **前端验收**：导航深链高亮、移动端可处理核心动作、表单有校验、错误/空态/sourceMeta 统一。
- **测试验收**：`npm run check` 必须包含 Node tests + strict contracts + web build + Playwright smoke；旧绿灯不能替代当前证明。

---

## 7. 下一步执行建议

按依赖顺序启动研发，而不是按“首批/次批策略”拆产品能力：

1. **平台不变量**：provider-mode real no seed、数据 provenance、全局 AuthDataStatus、OAuth 安全、测试卫生门禁。
2. **Action/Audit/Revert**：统一 action schema、audit_center runtime、M2/M3/M4 级联回滚、真实写补偿边界。
3. **前端 IA 与工作台闭环**：全局导航/搜索/深链、M2/M4/M3 action inbox、人类可读证据抽屉、移动核心动作。
4. **模块专项修复**：M1 发布包、M2 ledger/PO 约束、M3 领星 tab/Strategy OS、M4 daily/case/review/brand/notification。
5. **测试-证明-修复 5 轮**：R0 红灯 -> R1 合同 -> R2 集成 -> R3 E2E -> R4 反证回归，并生成可审计日志。

PMO 最终要求：没有完成上述证明前，不能再对外声称“生产级 100% 完成”。可以说“mock/sandbox 流程已验证”，不能说“真实 Amazon 运营闭环已完成”。
