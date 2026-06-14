I'll produce the executive report directly from the adjudication digest provided. This is a synthesis/writing task — no code investigation needed since the digest already contains verified findings. Let me compile the comprehensive report.

# 3 轮深度产品评审执行报告

> **文档性质**：客户交付版 · 多角色对抗式评审裁决纪要
> **评审范围**：6 大功能域（全局工作台、Amazon 授权接入、M1 Listing、M2 利润/库存/采购、M3 广告/领星/Action Queue、M4 监控）+ 1 个横切关注域
> **评审日期窗口**：截至 2026-05-29
> **裁决产出**：合并去重后共 **108 项可执行 work item**（其中 P0 级 33 项）
> **核心结论**：当前代码库 522 个测试虽全绿，**但不可作为可发布证据**——已证实至少两处测试正向锁死了错误契约（背书安全漏洞），全量审计尚未完成。

---

## 一、评审方法与角色配置

### 1.1 角色配置

本次评审采用 **「1 PMO 监督 + 多产品经理 + 开发 + 测试」** 的对抗式多角色结构：

| 角色 | 职责 | 在评审中的作用 |
|---|---|---|
| **PMO（项目经理/监督方）** | 流程仲裁、跨域裁决、未决议题拍板 | 对存在角色分歧的议题做最终定级（如 M1-008 manual A/B 契约拍板 201 方案、M2-P0-07 双方案二选一拍板） |
| **产品经理（多名）** | 商业价值、用户漏斗、文案诚信主张 | 提出「省钱/省时间」价值主张是否成立、激活→留存→续费漏斗断点 |
| **开发** | 根因定位、修复路线、工程可行性 | 多处主动升级/降级定级（如 M2-P0-04 开发将 applyRepricing 从 P1 自我升级为 P0） |
| **测试** | 可断言验收、回归基线、防回退 | 所有 acceptanceCriteria 均收敛为「可写成测试」的形式；识别测试套件 false-negative 缺口 |

### 1.2 评审方法：每域 3 轮辩论 + 逐行代码核验

- **第 1 轮**：广度发散，列出疑似缺陷（合并前约 38+ 条/域）；
- **第 2 轮**：对抗辩论，去重合并、角色互相质证（如「LX 是诚实只读剧场」主张被 LxTabTargeting commitBulkState 实锤证伪）；
- **第 3 轮**：逐项 `Read` 源码核验根因、定级、写成可断言验收标准。

**关键质量保证**：本轮区别于纯辩论的核心在于「**实跑核验**」——主持人逐行打开源码确认行号与缺陷，并对前两轮已通过决议复核「决议→代码→CI gate」闭环是否落地。**M4 域的核验结论尤为严峻：前两轮 P0/P1 决议在 main 分支几乎全部未落地，本域真实风险等于决议前**，根因是「无人对决议→代码→CI gate 闭环负责」。这直接驱动了本轮在 P0 中强制要求「修复 + CI gate 同时落地」。

### 1.3 过程亮点

- **撤回错误主张**：评审保持自我纠错，例如 M1 域上一轮「ListingOptimize 8 锚点区块缺失」的 P1 主张，本轮经核实 8 个锚点 DOM 全部真实渲染，**主动撤回并降级为 P3**（仅 loading 态滚动落空）。
- **拍板历史未决**：对长期悬而未决的契约分歧给出单一终裁（manual A/B 统一为 `201 + manualRequired:true`，消除「落库 + 422 第三态」三方不一致）。

---

## 二、按功能域汇总：关键结论与最高优先级问题

### 域 1 · 全局工作台 + 全局 Action Inbox（workbench，18 项）

**最高优先级问题：付费倒挂 + 安全标识物理断链。**

- **付费倒挂**：`GET /api/v1/dashboard` 的 DB 分支（`extended-routes.mjs:130-147`）缺 `overview/generatedAt`，actionCards 与 mock 路径 `buildDashboard` 的富契约**交集仅 `title`**。结果：**付费绑店用户首屏 KPI 恒空、四个 tab 计数恒 0、决策卡因传 `card.payload`（DB 无该字段）渲染空壳**——付费用户体验劣于演示态。
- **安全标识物理断链**：`app.js:8` `realWritesEnabled` 是无 setter 的死常量，前端硬编码「真实写入已关闭/Mock 已加载」，后端真值（`extended-routes.mjs:132`）**零前端消费**——无法被测试触发的虚假安全承诺。
- **护栏可被客户端绕过**：`useAudit.js:16` 硬编码 `requiresRealStoreWrite:false`，服务端 `routes.mjs:58` 透传前端 body 不强制覆写，闸门只读前端字段——结构上可被客户端绕过。
- **成功被渲染成失败**：`Workbench.vue:130/174` 把成功/空响应渲染成「数据加载失败」「已处理完成」，`refresh()` 不 await 即弹「已刷新」（false-positive）。

### 域 2 · Amazon 授权接入中心（amazon-auth，16 项）

**最高优先级问题：OAuth 回流重复探针 + readiness 双 false-positive + EU/JP 拉错站。**

- **回流即重复探针**：成功分支自动 `runProbe` 触发 liveProbe + apiProbe，且 `router.replace` 清 query 在两个 await 之后——重放窗口产生确定性重复探针/重复 toast/重复配额消耗。
- **readiness 双 false-positive**：前端把 `live_partial` 与 `active` 都吃成 success 绿；`ADS_API_MOCK` 时 mock 可冒充 ready——**运营误信「真实就绪」**。
- **EU/JP 静默拉错站**：`marketplaceIds` 前端硬编码默认 `ATVPDKIKX0DER`（美国站），回填守卫含恒 false 条件——**EU/JP 已授权卖家被静默填美国站拉错数据**（逆向漏斗）。
- **CSRF 第二因子缺失**：SP-API callback 只读 state 不读 `SPAPI_STATE_COOKIE`（start 已下发但 callback 从不读），可被注入他人 state 完成 token 绑定。
- **确定性误导**：demo seed 非 real 模式置 `*_api_authorized=1` 但不建 credentials 行——Settings 徽标显「已接入」而 diagnostics 报 missing。

### 域 3 · M1 Listing 作战室（m1，16 项）

**最高优先级问题：诚信红线——真假标签反置 + 既成事实风险。**

- **真假标签反置（诚信红线）**：`ResearchBlock.vue:41` 据「有无 raw」推断来源，把 mulberry32 **编造数据标成 `api`（真）**、诚实兜底反被标 `mock`——真假信号物理反置。
- **既成事实污染**：`combinedPick` 误用 `M1_LISTING_UPLOAD` actionType（`uploaded_to_amazon=0` 却标已上线），污染发布率口径（零回归立即可改）。
- **后端零护栏可绕过**：`createAbTest/combinedPick` 后端零 external 写护栏，前端 disabled 可被直接 POST 绕过。
- **GET 写副作用**：`getAbMetrics` 是 GET 却在读路径 UPDATE status/winner——running 实验被一次详情查看翻成 completed，破坏读写分离。
- **统计偏置 + 伪装原生**：treatment 基线 `0.115 > control 0.10` 使 treatment 近乎必胜；`amazon_experiment_id` 恒 null 却宣称「亚马逊原生 z-test」。

### 域 4 · M2 利润/库存/采购/调价/现金流（m2，19 项）

**最高优先级问题：真实财务损失 + 现金流三重双记账。**

- **补货闭环 100% 404**：嵌套 `reorder` shape + 前端 `row.id||productId` 兜底取错主键 → create-po/dismiss 100% 404，且按钮永不禁用可连点。
- **现金流三重 P0**：`transitionPO` 与 `payPO` 对同 `ref_id+source` **双记账且无幂等无唯一约束**；PO 行 balance 写 null 致余额漏出账；addCashflowEvent 回退 `350000` 魔数伪造基准余额——**现金流数字整体不可信**。
- **结构性亏本（真实损失）**：`applyRepricing` 静默吞 0 价且从不校验 break_even，可把售价采用到保本线下；`executeSlowMoving` 把单件成本当售价 × 0.7 结构性亏本甩卖——**符合「造成真实损失」判据**。
- **假事件机（净负价值）**：`scanAlerts` 无条件写死 `simulated_trigger` 假事件并按真实 severity 推 M4——**比「没有告警」更糟**。

### 域 5 · M3 广告 / 领星(LX) / Strategy OS / Action Queue（m3-ads，24 项）

**最高优先级问题：三条服务端越权 + 治理旁路 + success 谎报。**

- **三条服务端越权（needs_review 批量放行链）**：① `executeActionQueueBatch` approve 只判 state 不判 guardrail；② `approveActionQueueItem` 不校验 guardrail；③ `enqueueManualAction` 信任 `body.guardrail` 可 raw POST 伪造 `passed` 直接执行。
- **治理旁路**：BudgetAllocator/Dayparting（及十余处同模式页）经 `useAudit().submit→mockExecute` **完全绕过 ActionQueue/guardrail/dry_run** 本地改值伪装成功。
- **LX 内联编辑必回滚（P0）**：useLxState 全 mutation 在 await 前置 prev 且从不写回 desired——每次内联编辑视觉回滚，用户误以为失败。
- **success 谎报**：`LxTabTargeting.commitBulkState` 传副本致 composable 改不到真实行 + desired 取反 + 无条件 success toast——证伪「LX 是诚实只读剧场」。
- **审计/数据分叉**：`AdsTimeline` revert 先写 `TIMELINE_REVERT` 审计再仅改本地 state（后端端点未实现）。

### 域 6 · M4 监控（m4，21 项）

**最高优先级问题：决议未落地 + 申诉链路整体不可用 + 假回滚。**

- **决议未落地（根因级）**：前两轮 P0/P1 决议在 main 几乎全部未落地，本域真实风险 = 决议前——必须**修复与 CI gate 同时落地**。
- **申诉链路 100% 不可用**：`submitHijackingAppeal` 非事务、不传 manual-evidence、丢弃返回值、无条件脏置状态（跨表脏写 + 静默假成功）；`Appeals.vue:103` 不传 body 致普通申诉 draft→submitted **100% 失败**；运营无申诉入口（按钮 gate 在后端零处写的状态）。
- **假回滚（静默失败）**：revert switch 用原始 actionType、无 `_MANUAL` strip、无 HIJACK_* case → 落 default false 静默假回滚；前端 `TabHistory.vue:105` 无条件置 reverted 不读后端真值。
- **违反「不伪装 real」**：`sendRecovery` 裸翻 sent、无通道无审计标识；notifications email/wechat 永久 queued 但 UI 不读 deliveryStatus。

### 域 7 · 横切关注（cross，23 项）

**最高优先级问题：假回滚四层断裂 + 真实写 gate 缺模式守卫 + 测试正向背书漏洞。**

- **假回滚四层断裂**：后端无论是否真正反向都无条件 `UPDATE reverted=1` → 前端 await 前乐观翻绿 + catch 仅 console.warn → Audit.vue 不 await/不读 dispatchedInverse/catch{} 吞错——**真实写记录被假标记为已回滚 = 审计造假**。
- **真实写 gate 缺 isRealMode() 守卫**：默认 hybrid 模式下 env 齐备即可真打 Amazon——非 real 模式不应触达真实店铺。
- **测试正向背书漏洞（致命）**：`ads-live-action-gate.test.mjs` 未设 `DATA_PROVIDER_MODE` 即默认 hybrid，却断言真实 PUT 成功——**测试本身正向锁死了 gate 漏洞**，是 522 全绿中的 false-negative 缺口。
- **sourceMeta poison-default 污染 ≥9 处**：缺省回退为 mock 文案，**将真实数据误标 mock**（反向污蔑）；M4 真假判定 `&& mode==='real'` 致 hybrid 下真实 sync 恒标 mock。
- **多租户隔离失效**：`security.mjs` role/tenant 由 header 自报致 RBAC 形同虚设；x-store-id 写路径无 ownership 校验；删店物理硬删 audit_logs。

---

## 三、合并后的全局裁决工作清单（研发重做输入）

> 以下为跨域合并、按优先级排序的权威清单。`type` 取值：bug / refactor / feature / test / ux。研发应以每项的 acceptanceCriteria（见原裁决 JSON）为完工判据，全部可写成测试。

### 3.1 P0 级（33 项 · 阻断发布 · 必须修复 + 测试锁定）

| ID | type | 标题（精简） | 关键 files |
|---|---|---|---|
| W1 | bug | dashboard DB 分支与 buildDashboard 同构契约 | extended-routes.mjs, dashboard-engine.mjs, data-store-profit.mjs |
| W2 | bug | 前端统一传归一化整卡 + DecisionCard 入参归一 | Workbench.vue, AdsActions.vue, DecisionCard.vue, format.js |
| W3 | bug | 服务端按 REAL_WRITES_ENABLED 强制覆写 + 写操作必经 ad_action_queue | routes.mjs, audit-center.mjs |
| W4 | bug | 前端 requiresRealStoreWrite 由 appStore 驱动 | useAudit.js, app.js |
| W5 | bug | appStore 新增 sourceMeta + setSourceMeta 单一真相源 | app.js, Workbench.vue, dashboard.js |
| W6 | bug | 顶栏/系统状态卡去硬编码，真实写入开启显红色高危 | DefaultLayout.vue, Workbench.vue |
| W7 | bug | DecisionCard.execute 接 submit 返回值阻断 + 防重入 | DecisionCard.vue, Workbench.vue, AdsActions.vue |
| W13 | test | dashboard 契约回归测套件（mock 与 db 双 codepath） | tests/contract/dashboard-contract.test.mjs, tests/web/workbench-mount.test.mjs |
| AUTH-01 | bug | 回流停止自动 probe + 清 query 前置 | AmazonAuthCenter.vue |
| AUTH-02 | bug | readiness 双 false-positive 修复 + mock 态降级 | AmazonAuthCenter.vue, authorization-diagnostics.mjs |
| AUTH-03 | bug | marketplaceIds 前端硬编码移除 + 回填守卫修复 | AmazonAuthCenter.vue |
| M1-001 | bug | ResearchBlock 真假标签反置（后端补 is_mock，前端唯一信任） | data-store-listings.mjs, ResearchBlock.vue, m1.js |
| M1-002 | bug | combinedPick actionType 改 M1_VERSION_COMBINE | data-store-listings.mjs |
| M1-003 | bug | createAbTest/combinedPick 补 external 护栏 + 权威 isReadOnly | data-store-listings.mjs, store-routes-listings.mjs |
| M1-004 | bug | getAbMetrics 改纯只读 + 新增 finalize 端点 | data-store-listings.mjs, store-routes-listings.mjs |
| M1-005 | bug | 消除 A/B treatment 基线偏置 + 合成数据横幅 + 删「亚马逊原生」文案 | data-store-listings.mjs, ListingAbCenter.vue |
| M1-006 | bug | 采用 Winner 链路前端补全（删前端预写审计、补状态映射） | ListingAbCenter.vue |
| M1-007 | bug | PromoteToManual 接 ad_action_queue 草案两态，不伪装已执行 | PromoteToManual.vue, router/index.js |
| M2-P0-01 | bug | 补货闭环 reorder.* 命名空间全量对齐 | InventoryReorder.vue, useM2State.js, store-routes-profit.mjs |
| M2-P0-02 | bug | 现金流出账唯一真相源（删 transitionPO 出账 + payPO 幂等 + 唯一索引） | data-store-profit.mjs, ProfitCashflow.vue, useM2State.js |
| M2-P0-03 | bug | 现金流余额真相源（写真实 running balance，去 350000 魔数） | data-store-profit.mjs, ProfitCashflow.vue |
| M2-P0-04 | bug | applyRepricing 保本价护栏 + 0 价吞噬修复 | data-store-profit.mjs, ScenarioSimulator.vue, useM2State.js |
| M2-P0-05 | bug | executeSlowMoving 亏本甩卖修复（oldPrice 取真实售价 + break_even 下限） | data-store-profit.mjs, SlowMovingDecision.vue |
| M2-P0-06 | bug | executeInvLinkEvent 去虚假完成态（改 queued_pending_review，锁 dryRun 断言） | data-store-profit.mjs, InventoryLink.vue, useM2State.js |
| M2-P0-07 | bug | scanAlerts 真实化或止血（PM 拍板二选一，已写双方案验收） | data-store-profit.mjs, store-routes-profit.mjs, CustomAlerts.vue, m2.js, useM2State.js |
| M3-P0-01 | bug | useLxState 全 mutation 删成功路径 snapback | useLxState.js |
| M3-P0-02 | bug | executeActionQueueBatch 仅放行 guardrail.passed | data-store-ads.mjs |
| M3-P0-03 | bug | approveActionQueueItem 增 guardrail 守卫 | data-store-ads.mjs |
| M3-P0-04 | bug | enqueueManualAction 服务端强制重算 guardrail | data-store-ads.mjs, store-routes-ads.mjs |
| M3-P0-05 | bug | BudgetAllocator/Dayparting 禁止 submit 旁路，改走 enqueue gate | BudgetAllocator.vue, Dayparting.vue, useAudit.js |
| M3-P0-06 | bug | LxTabTargeting commitBulkState 入队值反转 + 删无条件 success toast | LxTabTargeting.vue |
| M3-P0-07 | bug | AdsTimeline manual-change revert 隐藏按钮 + 禁单独写审计 | AdsTimeline.vue |
| M3-P0-08 | refactor | 硬规则：无后端真实写入时禁止前端单独 submit 审计 | useAudit.js, AdsTimeline.vue, BudgetAllocator.vue, Dayparting.vue |
| M4-P0-01 | bug | submitHijackingAppeal 事务化 + 透传 manual-evidence | data-store-monitor.mjs |
| M4-P0-02 | bug | Hijacking 申诉入口 gating 改 test_buy_received + 四项 evidence 表单 | Hijacking.vue, useM4State.js |
| M4-P0-03 | bug | Appeals 普通申诉 submit 透传 body + 逐项错误渲染 | Appeals.vue, m4.js |
| M4-P0-04 | bug | revert _MANUAL 断链修复（strip + 补 HIJACK_* case） | data-store-monitor.mjs |
| M4-P0-05 | bug | TabHistory revert 假成功修复（读 dispatchedInverse） | TabHistory.vue |
| M4-P0-06 | test | CI gate：revert 集合覆盖 + 申诉链路红线断言 | data-store-monitor.mjs |
| X-P0-01 | bug | 后端修复假回滚（真实写未反向禁置 reverted=1，返回 409） | data-store.mjs, data-store-ads.mjs, store-routes-ads.mjs, store-routes.mjs |
| X-P0-02 | bug | 前端修复假回滚共谋（改悲观 await，按 dispatchedInverse 分流） | Audit.vue, useLocalStore.js |
| X-P0-03 | bug | 真实写 gate 增 isRealMode() 守卫 | live-action-executor.mjs |
| X-P0-04 | test | 重写 gate 回归测试（成功用例显式设 real，新增 mock/hybrid 零 fetch） | tests/integrations/ads-live-action-gate.test.mjs |
| X-P0-05 | test | 修改 m3-button-level 真实写回滚期望 + 新增反向用例 | tests/qa/m3-button-level.test.mjs |
| X-P0-06 | ux | UI 对 real-write 记录禁用一键回滚改「申请人工回滚」 | Audit.vue, SuggestionDrawer.vue, SuggestionCard.vue |
| X-P0-07 | feature | 产品形态根决策：采纳 B 方案（纯 mock 坦白），全站降级误导文案 | SuggestionDrawer.vue, DefaultLayout.vue, useAudit.js, Audit.vue, app.js |

> **P0 跨域主线（建议按此顺序统一治理）**：① 真实写/审计安全不变量（W3/W4、M3-P0-02/03/04、X-P0-01/02/03/06/07）；② 假回滚四层断裂（M4-P0-04/05、X-P0-01/02）；③ 付费倒挂数据契约（W1/W2/W5、AUTH-02）；④ 真实财务损失（M2-P0-02~05）；⑤ 诚信红线（M1-001、M1-005）。

### 3.2 P1 级（精选 · 修复 + 回归锁定）

横跨 6 域共约 40 项，关键项如下（type/files 见原 JSON）：

- **数据契约归一**：W9（Workbench 三态分流 + refresh await）、W10（ads/suggestions 增 DB 分支）、W11（reject 真落库或删虚假文案）、W12（缺依据禁用一键执行）。
- **安全/审计**：W14（写入闸门越权回归测试，test）、AUTH-05（SP-API callback cookie==state，bug）、AUTH-16（授权回归测试矩阵，test）、X-P1-04（x-store-id ownership 校验，bug）、X-P1-05（header-RBAC 止血，bug）、X-P1-06（shouldSeedMock fail-closed，bug）、X-P1-07（统一审计视图 + origin 列，feature）、X-P1-08（删店审计留痕，refactor）。
- **诚实化/合规披露**：AUTH-04（realWriteEnabled 单一真相源，bug）、M2-P1-03（无数据源页面注入演示横幅，ux）、M2-P1-04（TaxAssist 移除撒谎导出，bug）、M3-P1-12（AdsHub dataHealth/aiContribution 诚实化，bug）、M3-P1-13（三态机诚实降级，refactor）、X-P1-01（sourceMeta poison-default 改 unknown，bug）、X-P1-02（M4 真假判定与 providerMode 解耦，bug）、X-P1-03（顶栏三信任锚点动态化，bug）、X-P1-09（已挽回 reduce 语义 + 模拟水印，bug）。
- **业务正确性**：M1-008（manual A/B 统一 201 契约，bug）、M1-009（双 versions store 事件总线 invalidate，bug）、M2-P1-01（成本口径统一，bug）、M2-P1-02（lifecycle/days_cover 真实推算，bug）、M3-P1-10（三入队路径去重契约统一 200+duplicate，bug）、M3-P1-11（前端 duplicate/409 降级 info，bug）、M3-P1-14（LxAllCampaigns 死控件 + Clock import，bug）、M3-P1-15（AdAnalysisDrawer 治理，feature）、M3-P1-17（LX 内联编辑 pending 角标范式，ux）、M4-P1-01~07（anomaly 状态机守卫、SLA breach 派生、sendRecovery 工单台降级、Notifications 通道去伪装、categoryRank 降级、日报定时文案降级、draftRecovery 不漏队列）。
- **回归测试套件**：W14、M1-010、M2-T-01、M3-P1-16、AUTH-16 —— 将本期全部 P0/P1 不变量固化为可断言回归，**初始对未修代码应 RED**。

### 3.3 P2/P3 级（质量/体验/技术债 · 主链路修复后处理）

约 27 项，含：W15（端点契约矩阵清点，test）、W16（AdsActions 孤儿页并入，refactor）、W17（Action Inbox 待办权威源统一，feature）、W18（顶栏搜索接全局检索，feature）、AUTH-10~15（store 绑定一致性、profile 回流引导、错误归一化、转化收口等）、M1-012（删死页 + CI lint，refactor）、M1-013~016、M2-P2-01~06 / M2-P3-01、M3-P2-18~23 / M3-P3-24（直写库函数收敛、lx.js 直写 API 标 deprecated、StrategyLibrary 诚实化、CSV 导出等）、M4-P2-01~06 / M4-P3-01~02、X-P2-01~03（统一真实写 env 名、token 落库脱敏、gate allowlist 格式统一 + 速率上限）。

---

## 四、硬边界与不可声明项

以下为**贯穿全部功能域的不可逾越约束**。研发重做时，凡触及以下边界一律降级为 mock/draft/工单台，**严禁伪装 real**：

### 4.1 真实 Amazon 凭证缺失（最高硬边界）

- 真实 LWA client id/secret + refresh token、SP-API publish adapter、Ads API 生产凭证**全部缺失**。
- 影响：所有「写回 Amazon / 执行手动转化 / 跟卖申诉 / IP 投诉 / 挽回信外发 / 真实暂停广告」**只能到 mock/sandbox/工单台**。
- 验证手段：只能 stub fetch（参照 `oauth-flow.test.mjs` fetchCalls 模式）+ sandbox（advertising-api-test.amazon.com），**无法做端到端真实店铺写入 E2E**。

### 4.2 真实写入 gate（安全不变量 · 不可妥协）

- `REAL_WRITES_ENABLED!=='true'` 时，服务端必须强制覆写前端 `requiresRealStoreWrite`，**严禁前端伪装 real、严禁绕过 ad_action_queue**。
- 真实写唯一门控 = `live-action-executor`，当前仅支持 `ADJUST_BID/ADJUST_BUDGET`，其余 primitive **必抛 `unsupported_real_write_primitive`**，不得静默成功。
- `executeActionQueueItem` 硬编码 `dryRun=1` 是**正确边界**，回归测试须锁定其不被误改成真写。

### 4.3 真实写自动回滚工程上不可兑现（保留为 blocker）

- 反向写自身需再过 `assertRealWriteGate + assertChangeLimit`，`previousValue` 偏差 >10% 触发 `real_write_delta_too_large`。
- 在不引入独立可审计豁免通道前，真实写记录**只能走「申请人工回滚」阻断态**，UI 绝不可承诺一键回滚。

### 4.4 无真实数据源的能力一律标 mock

- 汇率源（FxRisk）、税务引擎（TaxAssist）、竞品采集（categoryRank/BSR）、Subscribe&Save/Brand Analytics（LTV/Dimensions）、email/wechat 通道、daily-report cron **均缺真实源**。
- 这些页面只能做到「演示横幅 + 示例估算 + sourceMeta:mock」，真实接入列为 blocker。

### 4.5 git / 部署边界

- 本次评审为**代码契约与状态流分析裁决，不涉及生产部署**。
- W3 改动须保持 `REAL_WRITES_ENABLED=false` 默认安全态（回归 `release-safety.test.mjs` 与 `static-skeleton.test.mjs`）。
- DB 唯一索引迁移（M2-P0-02）须在迁移脚本执行并对存量 seed 双记账行去重清洗，否则建索引会失败。

### 4.6 不可声明项（对外文案红线）

- 不得宣称「已挽回 ¥X / 已执行 / 真实已发送 / 已向税局申报 / 亚马逊原生 z-test / 类目排名」等**未实际发生的真实副作用**，除非带「模拟/预估/示例」限定词。
- `522 测试全绿不可作为发布证据`——已证实至少 `ads-live-action-gate` 与 `m3-button-level` 正向锁死了错误契约，审计完成前不得以全绿为发布门槛。

---

## 五、下一阶段执行建议：研发全量重做 + 5 轮验收循环

### 5.1 阶段一：研发全量重做（按 P0 → P1 → P2/P3 推进）

1. **先立 CI gate 再改代码**（吸取 M4 教训）：P0 项必须「修复 + 可断言测试」同批提交，测试初始对未修代码应 RED，防止「决议→代码→CI gate」再次断链。
2. **P0 按安全主线分批**：建议先治理「真实写/审计安全不变量」与「假回滚四层断裂」（跨 workbench/M3/M4/cross 四域同源），再做「付费倒挂数据契约」与「真实财务损失」。
3. **产品先拍板再开发**：X-P0-07（B 方案纯 mock 坦白）是统一全站文案方向的前置；M2-P0-07（scanAlerts 真实化 vs 止血）需 PM 在双方案中选定后才动工。
4. **修复测试 false-negative**：X-P0-04/X-P0-05 须与对应 gate 修复**同批**改写，否则错误契约继续被绿色背书。

### 5.2 阶段二：5 轮验收循环（建议结构）

| 轮次 | 验收重点 | 通过门槛 |
|---|---|---|
| **第 1 轮** | P0 安全不变量 + 假回滚 | 全部 P0 安全/审计回归 GREEN；无前端单独写审计；mock/hybrid 零真实 fetch |
| **第 2 轮** | 付费倒挂数据契约 + 真实财务损失 | dashboard 双 codepath 同构；现金流 COUNT===1 不变量；applyRepricing/executeSlowMoving break_even 护栏 |
| **第 3 轮** | 诚信/合规文案 + sourceMeta 真假边界 | 全站 grep 无未限定的「已执行/已挽回」；sourceMeta 真实数据不误标 mock |
| **第 4 轮** | P1 业务正确性 + 状态机守卫 | manual A/B 201 契约；anomaly 状态机守卫；去重契约统一 |
| **第 5 轮** | P2/P3 收敛 + 全量回归 + 发布门槛复核 | 死页/死控件清理；全量回归 GREEN 且**经审计确认无错误契约被锁死** |

### 5.3 验收循环的硬性要求

- **每轮验收以 acceptanceCriteria 为唯一判据**（均已写成可断言测试），不接受「人工自测通过」。
- **每轮结束复核「全绿 ≠ 可发布」**：抽查绿色断言是否锁死了正确契约（重点：dryRun 不变量、reverted 阻断态、provider-mode 守卫）。
- **carryForward 议题需在对应轮次前由 owner 拍板**：CSRF 终极定级（部署形态）、现金流双记账修复路线（架构）、observation cron（调度设施）、对外「已挽回」营销口径（运营/合规）、护栏分级阈值与去重 key 粒度（架构二次裁决）。这些未拍板项不阻塞零依赖 P0，但阻塞其依赖项的最终落地。

---

**报告结语**：本次 3 轮评审的核心价值在于——**用对抗式多角色 + 逐行核验，把「测试全绿」的虚假安全感拆穿到具体行号**。当前系统的最大风险不是功能缺失，而是**多处「伪装成功/伪装真实/伪装已回滚」的诚信与安全缺陷**，叠加「付费用户体验劣于演示态」的付费倒挂。建议客户将本清单作为研发全量重做的权威输入，并坚持「修复与 CI gate 同批、5 轮验收逐关 GREEN、全绿不等于可发布」三条铁律。