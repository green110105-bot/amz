# 全局裁决工作清单 (3轮深度评审产出)

总计 135 项；来源 7 功能域。


## P0 (46)

### [workbench] W1 — 统一 GET /api/v1/dashboard DB 分支与 buildDashboard 同构契约 _(bug)_
- files: apps/api/src/extended-routes.mjs, packages/domain/src/dashboard-engine.mjs, apps/api/src/data-store-profit.mjs
- 验收: 带 Bearer+x-store-id 请求 GET /api/v1/dashboard 返回体含 overview(由 aggregateProfit 产出，含 revenue/netProfit/totalCosts/profitMargin/orders/confidence 数字键) 且含 generatedAt(ISO 字符串)；actionCards 为数组，每张卡含 type(anomaly|profit_leak|ad_suggestion|inventory)、priority、payload，且 payload 含稳定 id、evidence、expectedImpact、confidence、recommendation、auditRequired；mock 路径与 DB 路径响应顶层 key 集合一致。可写为：解析两条 codepath 响应，assert keys 超集相等 + 每卡三键存在 + payload.id 存在。
- 理由: extended-routes.mjs:130-147 实测缺 overview/generatedAt 且 actionCards 与 buildDashboard 交集仅 title，付费绑店用户 KPI 恒空、tab 计数恒0、决策卡空壳。头号 P0 且 100% 可断言。

### [workbench] W2 — 前端统一传归一化整卡 + DecisionCard 入参契约归一 _(bug)_
- files: apps/web-v2/src/pages/Workbench.vue, apps/web-v2/src/pages/AdsActions.vue, apps/web-v2/src/components/DecisionCard.vue, apps/web-v2/src/utils/format.js
- 验收: 删除 Workbench.vue:169 的 `:card="card.payload"` 改为传规范化整卡；新增 normalizeCard 同时吃 dashboard(db/mock)/ads-suggestions(audit) 三形态输出单一 schema；DB 态挂载 Workbench 不产生任何 Vue prop 警告（mount 测试断言 console.warn 未被调用且 DecisionCard 渲染出 title/severity）。
- 理由: Workbench.vue:169 传 card.payload，DB 分支无 payload 字段→DecisionCard 收到 undefined 渲染崩坏；AdsActions:105 传整卡，方向相反。需收敛为整卡单一事实源。

### [workbench] W3 — 服务端按 REAL_WRITES_ENABLED 强制覆写 requiresRealStoreWrite，写操作强制经 ad_action_queue _(bug)_
- files: apps/api/src/routes.mjs, packages/domain/src/audit-center.mjs
- 验收: POST /api/v1/audit/mock-execute：当 process.env.REAL_WRITES_ENABLED!=='true' 时，无论请求 body 传 requiresRealStoreWrite:true 还是 false，服务端均强制覆写为 false（或在 REAL_WRITES_ENABLED!=='true' 时对任何真实写入意图返回 blocked），不信任前端 body。可写为：env 关闭态下传 requiresRealStoreWrite:true 调用，assert 返回 executionMode!=='real' 且未绕过队列；env 开启态另测。审计/真实执行入口必经 ad_action_queue 落一条记录。
- 理由: routes.mjs:58 透传前端 body，audit-center.mjs:75 闸门只读前端字段 requiresRealStoreWrite，结构上可被客户端绕过。安全不变量不可妥协。

### [workbench] W4 — 前端 requiresRealStoreWrite 由 appStore 驱动而非硬编码 false _(bug)_
- files: apps/web-v2/src/composables/useAudit.js, apps/web-v2/src/stores/app.js
- 验收: useAudit.js:16 删除硬编码 `requiresRealStoreWrite: false`，改为读取 appStore.realWritesEnabled；当 store.realWritesEnabled===true 时提交的 payload.requiresRealStoreWrite===true。可写为：set store realWritesEnabled=true，调 submit，assert 出站 action.payload.requiresRealStoreWrite===true（闸门可被测试触发）。
- 理由: useAudit.js:16 硬编码 false 使真实写入闸门永远无法被触发或测试，是不可验证的安全承诺。前端值仅用于使闸门可测，真值仍由 W3 服务端强制。

### [workbench] W5 — appStore 新增 sourceMeta+setSourceMeta 单一真相源，dashboard 响应回写 _(bug)_
- files: apps/web-v2/src/stores/app.js, apps/web-v2/src/pages/Workbench.vue, apps/web-v2/src/api/dashboard.js
- 验收: app.js 新增 sourceMeta state({source,mock,realWritesEnabled,sourceMode}) 与 setSourceMeta action；Workbench load() 成功后调 setSourceMeta(响应的 sourceMeta+sourceMode)，realWritesEnabled 不再是无 setter 死常量。可写为：mock dashboard 返回 realWritesEnabled:true，触发 load，assert appStore.realWritesEnabled===true 且 sourceMeta.sourceMode 被写入。
- 理由: app.js:8 realWritesEnabled 无 setter，dashboard.js 不回写，后端真值无任何前端代码消费。建立单一真相源是 W6 的前置。

### [workbench] W6 — 顶栏与 Workbench 系统状态卡去硬编码改由 store 驱动，真实写入开启显红色高危 _(bug)_
- files: apps/web-v2/src/layouts/DefaultLayout.vue, apps/web-v2/src/pages/Workbench.vue
- 验收: DefaultLayout.vue:259-263 与 Workbench.vue:210-211 改由 appStore.sourceMeta/realWritesEnabled 驱动：realWritesEnabled===true 时顶栏显红色(type=danger)高危「真实写入已开启·将影响真实店铺」；sourceMode==='db' 或 sourceMeta.mock!==false 时不得出现「Mock 数据已加载」「真实数据」字样。可写为：set store realWritesEnabled=true mount DefaultLayout，assert 渲染含 danger tag 与高危文案、不含「真实写入已关闭」；set sourceMode='db' assert 不含「Mock 数据已加载」。
- 理由: DefaultLayout.vue:259-263 实测硬编码标识，REAL_WRITES_ENABLED=true 时 UI 仍显「真实写入已关闭/Mock已加载」，是不可被测试触发的虚假安全承诺。

### [workbench] W7 — DecisionCard.execute 接 submit 返回值阻断不 emit + 防重入；父组件绑 @execute 置灰刷新 _(bug)_
- files: apps/web-v2/src/components/DecisionCard.vue, apps/web-v2/src/pages/Workbench.vue, apps/web-v2/src/pages/AdsActions.vue
- 验收: execute 改 `const r = await submit(...); if(!r.ok) return;`（被阻断不 emit('execute')）；新增 submitting ref 绑 :loading/:disabled 防重入；父组件 Workbench/AdsActions 绑 @execute 后乐观置灰标「已入队待审」(verdict=pending 非 splice 移除) 并刷新 cardSummary。可写为：submit 返回 {ok:false} 时 assert execute 未 emit；200ms 内双击仅产生 1 条审计/1 次 submit 调用；emit 后该卡标记 disabled。
- 理由: DecisionCard.execute(57-67) 丢弃 useAudit 返回的 {ok} 无条件 emit，无 loading 防重入→双击产生两条 pending 审计行、被阻断的卡也被乐观移除。verdict 为 pending 非终态成功，不可直接 splice。

### [workbench] W13 — dashboard 契约回归测套件（mock 与 db 两 codepath） _(test)_
- files: tests/contract/dashboard-contract.test.mjs, tests/web/workbench-mount.test.mjs
- 验收: 遍历 mock 与 db 两条 codepath：assert 两者均含 overview && generatedAt && Array.isArray(actionCards)；每卡 assert 至少含 type&&priority&&payload 三键且 payload.id 为稳定值；assert 两路径顶层 key 集合互为超集；前端 mount 测试 assert DB 态无 Vue prop warning。采用「至少含三键」策略以允许合理扩展。
- 理由: 将 W1/W2 同构契约固化为回归，防字段漂移再次导致付费倒挂。团队收敛为至少含三键(放过合理扩展)。

### [amazon-auth] AUTH-01 — 回流停止自动 probe + 清 query 前置:handleOAuthReturn success 分支默认仅 loadStatus,删除自动 runProbe,router.replace 移到进入 success 分支首行(任何 await 之前) _(bug)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue
- 验收: 挂载时 route.query.oauth='success' 后:(a) 整个回流过程对 POST /diagnostics 的调用次数===0(不发 liveProbe/apiProbe);(b) router.replace 在第一个 await 之前已执行,二次 mount 时 route.path 上已无 oauth/status/error/marketplaces/profiles query;(c) success 分支仍调用一次 loadStatus(GET status+diagnostics+oauth/config);(d) apiProbe 仅经 tab4'运行真实诊断'按钮(:632)或页头'真实诊断'显式触发。可写组件测试 mock route.query 断言 liveDiagnostics spy 调用 0 次、replace 调用早于 loadStatus。
- 理由: AmazonAuthCenter.vue:261 success 分支自动 runProbe()→:218 liveProbe&apiProbe both true;:266 router.replace 在两个 await 之后,重放窗口=探针往返时延,产生确定性重复探针/重复 toast/重复配额。四角色共识、零依赖裁决。

### [amazon-auth] AUTH-02 — readiness 双 false-positive 修复:live_partial→warning 并渲染 blockers[0];readinessType 穷举枚举禁止默认落 success;mock 态后端降级 mock_ready + push warning _(bug)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue, apps/api/src/integrations/authorization-diagnostics.mjs
- 验收: 断言矩阵成立:{ready,live_ok}→'success';{live_partial,mock_ready,blocked,missing}→'warning';{live_error,revoked}→'danger';其他→'info'。具体:(a) readinessType('live_partial')==='warning' 且 active 不再映射 success(改 warning 或独立处理);(b) live_partial 时 tag 旁渲染 provider.blockers[0];(c) 当 ADS_API_MOCK=1,ads diagnostic.readiness==='mock_ready'(非 ready)且 warnings 含 'ads_running_on_mock_fixtures',m3Impact.m3DataMode==='ads_mock_fixture';(d) 页面在 m3DataMode==='ads_mock_fixture' 时 0 个 type==='success' 的 el-tag。可写后端单测断言 readiness 值 + 前端快照断言 tag type。
- 理由: 前端 :148 把 live_partial 与 active 都吃成 success 绿;diagnostics :322 设 live_partial 但无前端区分;:269 mock 走 ads_mock_fixture 但 readiness 仍可 ready。双 false-positive 让运营误信'真实就绪'。共识、零依赖。

### [amazon-auth] AUTH-03 — marketplaceIds 前端硬编码移除:v-model 初值改空串(placeholder 保留),回填守卫去掉恒 false 的 !marketplaceIds 条件改为'后端有发现值则覆盖/diff 提示' _(bug)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue
- 验收: (a) spapiForm.marketplaceIds 初值为 '';(b) :588 textarea placeholder 仍为 'ATVPDKIKX0DER';(c) applyStatusToForms 当 status.providers[spapi].marketplaceIds 非空时无条件覆盖表单值(移除 && !spapiForm.value.marketplaceIds 守卫),并展示'已自动发现站点: X'只读提示;(d) Grep 证实仓库内无任何前端/E2E 断言依赖 marketplaceIds 默认值 'ATVPDKIKX0DER'(已核实 19 命中均为 seed/后端测试,非前端默认值断言),改后 522 测试零破坏。
- 理由: AmazonAuthCenter.vue:30 硬编码默认 'ATVPDKIKX0DER',:171 回填含恒 false 守卫,EU/JP 已授权卖家会静默被填美国站拉错数据(逆向漏斗)。A 升级 P0,测试已 Grep 证实安全。

### [m1] M1-001 — 修复 ResearchBlock 真假标签反置：后端补 is_mock/source_meta，前端唯一信任该字段 _(bug)_
- files: apps/api/src/data-store-listings.mjs, apps/web-v2/src/components/m1/ResearchBlock.vue, apps/web-v2/src/api/m1.js
- 验收: 1) m1_research_reports 表新增 is_mock INTEGER NOT NULL DEFAULT 1 与 source_meta TEXT 列(迁移幂等 ALTER/CREATE)。2) triggerResearch 等所有 PRNG 路径(data-store-listings.mjs:548-595)写入 is_mock=1、source_meta={provider:'deterministic-mock'};未来真实接入路径写 is_mock=0。3) GET research 返回 is_mock/source_meta。4) ResearchBlock.vue:34/41 删除 `source: raw ? 'api' : 'mock'`,改为 `source: report.is_mock ? 'mock' : 'api'`(唯一信任后端字段);evidence 在 is_mock 时加 '[示例数据]' 前缀。可测断言:triggerResearch 后查 DB is_mock===1;ResearchBlock 渲染出的每个 lane source==='mock'。
- 理由: 已核实 data-store-listings.mjs:558-582 用 mulberry32 编造 evidence 字符串,但因 INSERT 进 m1_research_reports 后有值(raw 非空),ResearchBlock.vue:41 据'有无 raw'推断把编造数据标成绿色 'api(真)',诚实兜底反被标 'mock'。真假信号反置,是诚信红线。

### [m1] M1-002 — combinedPick 审计 actionType 从 M1_LISTING_UPLOAD 改为 M1_VERSION_COMBINE _(bug)_
- files: apps/api/src/data-store-listings.mjs
- 验收: data-store-listings.mjs:1606 actionType 改为 'M1_VERSION_COMBINE'。可测断言:combinedPick 后最近一条审计 actionType==='M1_VERSION_COMBINE' 且 uploaded_to_amazon 字段不出现在'已发布'统计;审计中无任何 M1_LISTING_UPLOAD 由 combinedPick 产生。
- 理由: 已核实 combinedPick(data-store-listings.mjs:1602)生成 uploaded_to_amazon=0 的本地草稿,却在 :1606 写 actionType='M1_LISTING_UPLOAD',审计中心会误判已上线、污染发布率口径。零测试断言、零回归风险。

### [m1] M1-003 — createAbTest/combinedPick 后端补 external/竞品写护栏 + 版本归属校验,提取权威 isReadOnly(target) _(bug)_
- files: apps/api/src/data-store-listings.mjs, apps/api/src/store-routes-listings.mjs
- 验收: 1) 导出权威函数 isReadOnly(target)=Boolean(target.is_competitor_only||target.isCompetitorOnly||target.asin_kind==='external'||target.asinKind==='external')。2) createRun 现有护栏(data-store-listings.mjs:994)改为复用 isReadOnly。3) createAbTest(:1703)与 combinedPick(:1564)入口命中 isReadOnly 返回 {error:'external_asin_cannot_optimize'} 不落库;route 层返回 422(与 createRun 统一,注意 createRun 当前 route 返 400,需统一为同一码并改测试)。4) createAbTest 校验 controlVersionId/treatmentVersionId 均存在、属于同 target_id、control≠treatment,否则 error:'validation_failed' 不落库;combinedPick 校验 fieldPicks 引用的 vId 均存在且属于该 target,全无效则 validation_failed 不产生空版本。可测断言:对 external target POST /ab 返 422 且 m1_ab_tests 行数不变;control===treatment 返 422;引用他人 target 的 version 返 422。
- 理由: 已核实 createAbTest(:1703-1733)与 combinedPick(:1564)后端零 external 护栏,前端 disabled(AbCenter:279)可被直接 POST 绕过;对照 createRun(:994)已有硬护栏。当前三套 readOnly 口径(m1.js:360 / AbCenter:279 / createRun:994)须收敛为单一 isReadOnly。

### [m1] M1-004 — getAbMetrics 改纯只读 + 新增 POST /ab/:id/finalize 端点承载状态固化 _(bug)_
- files: apps/api/src/data-store-listings.mjs, apps/api/src/store-routes-listings.mjs
- 验收: 1) getAbMetrics(data-store-listings.mjs:1831)删除 :1842-1848 的 UPDATE,纯计算返回 {test,metrics,stats},GET 路径零写。2) 新增 finalizeAbTest(db,...,id):仅当 status==='running' 计算 stats 并 UPDATE lift/significance/winner/status(completed)。3) route 补 POST /api/v1/store/m1/ab/:id/finalize。4) adoptAbWinner 前置校验:status 非 completed/ready_for_manual_publish 时返 {error:'not_finalized'},不再内部隐式调 getAbMetrics 触发固化(删除 :1856-1859 force compute)。可测断言:连续两次 GET metrics 前后 m1_ab_tests.status 不变;finalize 前 adopt 返错误;finalize 后 status==='completed' 且 winner 非 null。重排 700 区测试为 start→finalize→adopt。
- 理由: 已核实 getAbMetrics 是 GET 却在读路径 UPDATE status/winner/lift(:1842-1848),running 实验被一次详情查看翻成 completed,破坏读写分离与幂等;现有 adopt 测试依赖该副作用作为通过前提。

### [m1] M1-005 — 消除 A/B treatment 基线偏置 + amazon_experiment_id 为 null 强制'合成演示数据'横幅、删'亚马逊原生 z-test'文案 _(bug)_
- files: apps/api/src/data-store-listings.mjs, apps/web-v2/src/pages/ListingAbCenter.vue
- 验收: 1) startAbTest(data-store-listings.mjs:1799/1803)treatment 转化基线(0.115)与 control(0.10)统一为同一基线,或在 UI 显式标'合成乐观示例'(择一并写注释说明)。2) AbCenter 列表/详情:当 amazon_experiment_id 为 null 时(恒 null,:1721)渲染一条不可关闭的 warning 横幅文案'合成演示数据 · 未接入亚马逊原生实验';PageHeader subtitle(AbCenter:180)删除'亚马逊原生 z-test'字样,manualGuidance 中'亚马逊原生'措辞保留(那是真实指引)。可测断言:渲染 AbCenter 时存在含'合成演示数据'的横幅;subtitle 不含'亚马逊原生 z-test';control/treatment 基线参数相等(或代码含显式 SYNTHETIC_OPTIMISTIC 标记)。
- 理由: 已核实 treatment 基线 0.115 系统性高于 control 0.10(:1799/1803),使 treatment 近乎必胜;amazon_experiment_id 恒 null(:1721)而 UI 宣称'亚马逊原生 z-test'(AbCenter:180),违反'无凭证不得伪装 real'。

### [m1] M1-006 — 采用 Winner 链路前端补全:删前端预写审计、补 ready_for_manual_publish 状态映射、改 success 文案、按钮条件改 winner!==null _(bug)_
- files: apps/web-v2/src/pages/ListingAbCenter.vue
- 验收: 1) 删除 onAdoptWinner(AbCenter:142-149)内 submit({actionType:'ADOPT_AB_WINNER'...}) 前端预写审计,只保留 adoptWinner(row.id) 调后端。2) statusLabel(:115)/statusType(:105) 增加 ready_for_manual_publish→'待手动发布'/'warning'(橙)。3) adoptWinner 成功后 ElMessage 文案改'已生成手动发布包,需在 Seller Central 手动发布(未写回 Amazon)';KpiCard'已完成'success 改 warning 或单列'待手动发布'。4) 操作列按钮(:252/264)条件由 row.status==='completed' && row.winner==='treatment' 改为 row.status==='completed' && row.winner!==null,并按 winner 取 control_version_id/treatment_version_id 传给后端(后端已支持 :1860)。可测断言:winner==='control' 的 completed 行渲染出'采用'按钮;onAdoptWinner 不再调用 useAudit.submit;ready_for_manual_publish 行 statusLabel 返回'待手动发布'。
- 理由: 已核实 onAdoptWinner(AbCenter:142-149)在调后端前预写一条无诚实字段的 ADOPT_AB_WINNER 审计,与后端 M1_AB_ADOPT_WINNER(:1864)构成同一动作双写双命名;winner==='control' 无采用入口;ready_for_manual_publish(后端 :1875 已写)前端无标签映射会显示原始英文。

### [m1] M1-007 — PromoteToManual 归 M3 + 接 ad_action_queue 草案两态,doSubmit 不伪装已执行,expectedImpact 系数标注估算 _(bug)_
- files: apps/web-v2/src/pages/PromoteToManual.vue, apps/web-v2/src/router/index.js
- 验收: 1) doSubmit(PromoteToManual.vue:74)涉真实广告动作必须经 ad_action_queue 产出 draft 态记录,不得仅 submit() 写审计就清空;提交后保留可追踪草案记录(展示 draft id/状态),不直接 step=0+清空。2) 按钮文案(:268)改'生成手动转化草案(未写回 Amazon)'。3) expectedImpact 与模板 :261 的 sales30d*0.4 系数标注'估算假设(经验系数,非预测)'或移除该数字。4) sourceModule 保持 M3(已是),但确认路由归属(当前 /ads/promote-to-manual)与 actionType PROMOTE_TO_MANUAL 可被审计中心单一断言。可测断言:doSubmit 调用 ad_action_queue 提交(mock 下产出 draft 记录);按钮文案含'未写回 Amazon';模板含'估算假设'或不含裸 0.4 推算数。
- 理由: 已核实 doSubmit(:74-85)仅 submit() 写审计、不入 ad_action_queue、不调任何广告 API,违反'不得绕过 ad_action_queue'不变量;数据全来自 mockPromotionCandidates(:7),expectedImpact sales30d*0.4(:80/:261)凭空无来源。受真实凭证缺失约束,执行态保留为 blocker(见 boundaryNotes)。

### [m2] M2-P0-01 — 补货闭环 reorder.* 命名空间全量对齐(主键/状态/乐观态) _(bug)_
- files: apps/web-v2/src/pages/InventoryReorder.vue, apps/web-v2/src/composables/useM2State.js, apps/api/src/store-routes-profit.mjs
- 验收: InventoryReorder.vue 的 openPoDialog/dismiss 主键改为 row.reorder.id(删除 row.id||row.productId 兜底,顶层无 id 会复发 404);模板状态读 row.reorder.status(tag 颜色与 :disabled 均基于 reorder.status,无 id 时按钮 disabled);useM2State.js:341/354 findIndex 改 (d.reorder?.id)===id 且乐观态写 d.reorder.status;dismiss 改软删后以服务端 status='dismissed' 覆盖而非 splice;page 层空 catch 改回滚乐观态且不二次弹 toast(composable 已弹 error)。测试:e2e 断言 createPO 收到的 path 参数===reorder.id 且响应 201(非 404);单测在嵌套 reorder shape 下断言按钮 disabled 与 tag 文案正确;dismiss 后刷新状态不回跳。
- 理由: 四方坐实:store-routes-profit.mjs:214-223 把行 reshape 成 {productId,sku,reorder:{id,status,...}} 顶层无 id/status。前端 InventoryReorder.vue:72/99 的 row.id||row.productId 必取 productId → create-po/dismiss(WHERE id=?) 100% 404;:165/170/175 读 row.status 恒 undefined → tag 永显 pending、生成 PO 按钮永不置灰可连点、invalid_status 被空 catch 吞。

### [m2] M2-P0-02 — 现金流出账唯一真相源:删 transitionPO 出账,payPO 幂等短路,(ref_id,source) 唯一索引 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/ProfitCashflow.vue, apps/web-v2/src/composables/useM2State.js
- 验收: 删除 transitionPO 中 :1568-1589 两段 cashflow INSERT(po_deposit/po_balance);出账只由 payPO 触发;payPO(:1625) 入口判 deposit_paid/balance_paid 已置位则返回 already_paid 拒绝(幂等);DB 对 m2_cashflow_events(ref_id,source) 加唯一索引兜底;前端 payment 按钮加 inflight loading、成功后禁用对应 phase。测试:单 PO 走 ordered→payPO(deposit) 后 SELECT COUNT(*) WHERE source='po_deposit' AND ref_id=poId ===1;重复 payPO(deposit) 第二次返回 already_paid 且 COUNT 仍为 1。
- 理由: 坐实:transitionPO(:1568-1577) 与 payPO(:1631-1637) 对同 ref_id 同 source 无唯一约束;payPO(:1626) 无 deposit_paid 幂等守卫 → 标准 UI 流程双扣、payPO 自重复亦重复入账,出账聚合高估,现金流页数字不可信。

### [m2] M2-P0-03 — 现金流余额真相源:PO 出账行写真实 running balance,addCashflowEvent 事务回算,去 350000 魔数,future30/90 按日历日偏移 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/ProfitCashflow.vue
- 验收: payPO 出账行 balance 不再写 null(:1636);getCashflowTimeline(:1166) 改为按 inflow/outflow 增量重算余额(不信任稀疏 balance 列)或按真实日期 forward-fill 逐日序列;addCashflowEvent 取基准余额剔除 NULL、去掉 350000 魔数(:1210);事务回算 event_date>= 插入点后所有行 balance;future30/future90 按 today+30/+90 真实日历日偏移取点(非数组下标);CNY/USD 统一换算到单一记账币。前端 date-picker 设 min 或弹'将重算后续余额'确认,提交成功才 clearDraft。测试:插入 outflow=100 后 timeline 末点 balance 应较前减 100;在中间日期插入事件后其后行 balance 全部被回算。
- 理由: 坐实:PO 行 balance 写 null(:1576/1587/1636)+ getCashflowTimeline 仅 balance!=null 才更新曲线(:1166) → 余额曲线漏 PO 出账(余额高估);addCashflowEvent 因 NULL 回退 350000 魔数(:1210) 致手工事件基准余额伪造;future30/90 按数组下标取稀疏点错位。

### [m2] M2-P0-04 — applyRepricing 保本价护栏 + 0 价吞噬修复 + 文案去完成暗示 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/ScenarioSimulator.vue, apps/web-v2/src/composables/useM2State.js
- 验收: applyRepricing(:1758) 改 Number.isFinite 校验;price<=0 或 price<break_even_price 返回 {error:'validation_error'} 除非 body.confirmBelowBreakeven===true;前端对 margin<0/unitProfit<0 方案禁用'采用'或升级危险二次确认;确认弹窗文案改'仅生成 M1 草稿、需到 M1 上架才真实改价'。测试:applyRepricing({price:0}) 期望 400;applyRepricing({price:breakEven-1}) 期望 400;applyRepricing({price:breakEven-1,confirmBelowBreakeven:true}) 期望 200。
- 理由: 坐实 P0(开发撤回 P1):applyRepricing:1758 Number(body.price)||recommended_price 把 price=0 静默替换,从不校验 break_even_price(列存在于 :349/698),可把售价采用到保本线下,直接动收入字段并联动 M1,符合'造成真实损失'判据。

### [m2] M2-P0-05 — executeSlowMoving option A 亏本甩卖修复:oldPrice 取真实售价 + break_even 下限 + 执行/预览同源 + 文案 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/SlowMovingDecision.vue
- 验收: executeSlowMoving option A 的 oldPrice 改取该 SKU 真实 listing 售价(非 inventory_value/inventory 单件成本,:1384);newPrice 加 break_even 下限护栏,低于成本时 confirm 用 warning 展示单件亏损金额并要求二次确认;预览价与执行价共用同一计算函数(消除 :1385 cost×0.7 与预览不同源);执行态文案去掉'已执行'改'已生成 M1 降价草稿、待 M1 上架生效'。测试:option A 执行后写入 M1 的 newPrice >= break_even(无 confirm 时);oldPrice 等于 listing 售价非单件成本。
- 理由: 坐实:oldPrice=inventory_value/inventory=单件成本(:1384)、newPrice=成本×0.7(:1385) 结构性低于成本甩卖,无 break_even 下限,预览价与执行价不同源,'已执行'话术误导(实际仅生成 uploaded_to_amazon=0 的 M1 草稿)。

### [m2] M2-P0-06 — executeInvLinkEvent 去虚假完成态:status 改 queued_pending_review,通知 severity 降级,锁 dryRun 安全断言 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/InventoryLink.vue, apps/web-v2/src/composables/useM2State.js
- 验收: executeInvLinkEvent 落库 status 由 'auto_executed'(:2291) 改为 'queued_pending_review';M4 通知(:2296) severity 降级去掉完成暗示;前端文案改中性'已入队待 M3 审核'并展示 rollbackPlan.needsManualReview;保留底层 _enqueueManualAction 的 dryRun:true/needs_review/queued-not-written 不变量。测试:执行后事件 status==='queued_pending_review';断言 ad_action_queue 写入项 dryRun===true 且 guardrail.status==='needs_review'(回归锁定不得误改成真写)。
- 理由: 坐实:底层 dryRun:true 守住 ad_action_queue 安全(:2271-2281 queued-not-written),但事件硬置 status='auto_executed'(:2291) 并发 P0/P1 通知制造'广告已停'虚假确定性;无真实 Amazon 凭证不得伪装 real。

### [m2] M2-P0-07 — scanAlerts 真实化或止血(条件求值+cooldown+isSimulated+前端 scan 入口与结构化条件构造器) _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/api/src/store-routes-profit.mjs, apps/web-v2/src/pages/CustomAlerts.vue, apps/web-v2/src/api/m2.js, apps/web-v2/src/composables/useM2State.js
- 验收: scanAlerts(:2072) 按 r.conditions(field/op/value/duration)对真实指标求值,不匹配不写事件;用 last_triggered+cooldown_hours 去重;matched_value 写真实值而非 'simulated_trigger';mock 模式事件标 isSimulated=true;CustomAlerts 自由文本 textarea+JSON.parse 静默吞(:109) 改结构化条件构造器(指标+运算符+阈值+duration 下拉);新增'立即测试规则'按钮调 alertsApi.scan 后刷新 events。若 PM 选止血方案则删 /alerts/scan 路由(:482)+scanAlerts 并确认前端无调用。测试:conditions 不匹配 created===0;cooldown 内二次 scan created===0;mock 模式事件 isSimulated===true。
- 理由: 坐实净负价值假事件机:scanAlerts(:2072-2107) 无条件 INSERT、写死 simulated_trigger、不读 conditions、不判 cooldown,且按真实 severity 推 m4_notifications,端点 :482 可被直接 POST 灌假 P0/P1 进 M4,比'没有告警'更糟。范围/止血时序为 carryForward。

### [m3-ads] M3-P0-01 — useLxState 全 mutation 删除成功路径 snapback,仅 catch 回滚 _(bug)_
- files: apps/web-v2/src/composables/useLxState.js
- 验收: 删除 toggle(:208/:421)/setBid(:402)/setBudget(:226)/setBidStrategy(:244)/setBidAdj 成功路径上 await 之前的 x=prev/x=previousVal 写回行;prev 仅用于入队 payload(currentValue)与 catch 失败回滚。可断言测试:mock enqueueLxManualAction resolve 后,被操作 reactive 实体的字段值===desired(不回到 prev);mock reject 后字段值===prev 且 ElMessage.error 被调用。对 toggle 还需断言 desired 由真实 reactive 引用 c.enabled 计算而非传入副本。
- 理由: 已实锤:成功路径在 await 前置 prev 且从不写回 desired,导致每次内联编辑视觉回滚,用户误以为操作失败。证据链闭合(setBid 因所有调用方都传 oldVal 故 previousBid 恒!==undefined)。

### [m3-ads] M3-P0-02 — executeActionQueueBatch approve:true 仅放行 guardrail.status==passed 的 queued,needs_review/blocked 入 skipped _(bug)_
- files: apps/api/src/data-store-ads.mjs
- 验收: executeActionQueueBatch(:2192-2194)的 approve 分支改为:仅当 cur.state==='queued' 且 cur.guardrail?.status==='passed' 才调用 approveActionQueueItem;needs_review/blocked 项不批准、不执行,收入返回结构新增 skipped:[{id,reason}]。返回体新增 skipped 字段。测试:入队 1 needs_review + 1 passed,调 batch{approve:true},读回 needs_review 项 state 仍='queued'(未执行)且出现在 result.skipped[];passed 项 state='executed'。
- 理由: 已实锤越权:当前 batch 只判 state==='queued' 即批准,绕过护栏批量放行 needs_review 项。

### [m3-ads] M3-P0-03 — approveActionQueueItem 增加 guardrail 守卫禁止批准非 passed _(bug)_
- files: apps/api/src/data-store-ads.mjs
- 验收: approveActionQueueItem(:2040-2044)在状态校验后增加 if(cur.guardrail?.status!=='passed') throw new TypeError('approve_requires_passed_guardrail')。测试:对 guardrail.status='needs_review' 的 item 调 approve 抛 approve_requires_passed_guardrail;对 passed item 正常 approved。
- 理由: 已实锤:approveActionQueueItem 不校验 guardrail,是自动批准 needs_review 的第二条入口。

### [m3-ads] M3-P0-04 — enqueueManualAction 服务端强制重算 guardrail,关闭客户端 passed 通道 _(bug)_
- files: apps/api/src/data-store-ads.mjs, apps/api/src/store-routes-ads.mjs
- 验收: enqueueManualAction(:1991-2004)忽略 body.guardrail 与 body.state:对 lx/非系统来源一律 state='queued',guardrail 经服务端 buildGuardrailResult 重算(本期阈值未定则硬落 needs_review);body 传入的 guardrail 仅可作展示不入库为权威。测试:raw POST body.guardrail.status='passed' 且 body.state='approved',读回 item state='queued' 且 guardrail.status!=='passed'(为 needs_review 或服务端重算值);该 item 直接走 execute 抛 approval_required。
- 理由: 已实锤:服务端信任 body.guardrail,可 raw POST 伪造 passed,且 passed+state=queued 因 execute 允许 queued 执行而绕过 approve 直接落库执行。

### [m3-ads] M3-P0-05 — BudgetAllocator/Dayparting 及同模式 M3 写页禁止 useAudit().submit 旁路,改走 actionQueueApi.enqueue + gate ok===true;后端未就绪先 disabled _(bug)_
- files: apps/web-v2/src/pages/BudgetAllocator.vue, apps/web-v2/src/pages/Dayparting.vue, apps/web-v2/src/composables/useAudit.js
- 验收: BudgetAllocator(:20)/Dayparting(:11)的实体 mutation(预算/出价/分时段/否定词)不得调用 useAudit().submit 直写;改走 actionQueueApi.enqueue,本地状态变更必须 gate 在返回 ok===true 之后,ok:false 不改本地值。后端 enqueue 端点未就绪前对应按钮 disabled + '即将上线/Demo数据' 角标且不写任何审计。删除 Dayparting:29 '基于过去 30 天分时段 CVR' 无数据支撑文案。测试:点击应用按钮断言调用 actionQueueApi.enqueue 而非 submit;断言不产生 INCREASE_BUDGET/分时段 直写审计;enqueue 返回 ok:false 时本地表格值不变。
- 理由: 已实锤第二条治理旁路:这两页(及十余处同模式 M3 页)经 useAudit().submit→mockExecute 完全绕过 ActionQueue/guardrail/dry_run 并本地改值伪装成功。

### [m3-ads] M3-P0-06 — 修复 LxTabTargeting.commitBulkState 入队值反转 + 移除无条件 success toast _(bug)_
- files: apps/web-v2/src/pages/lx/tabs/LxTabTargeting.vue
- 验收: commitBulkState(:74-82)改为对每行调用 toggle(row, !row.enabled) 传真实 reactive row 引用(不再 toggle({...row, enabled:!row.enabled}) 传副本,该副本既使 composable 改不到真实行又使 desired 取反);移除 :82 无条件 ElMessage.success,改为按 enqueue 返回真实统计 '已加入执行篮 N 条(待审核+dry-run)',全失败时 error/warning。测试:mock enqueue,断言每行传入 toggle 的对象 === 原 reactive row 且 recommendedValue.enabled === 用户意图值;部分失败时 toast 文案含真实成功条数。
- 理由: 已实锤 success 谎报:漏传 desired 致入队值反转 + 副本致表格行不变 + 无条件 success toast,证伪 'LX 是诚实只读剧场'。

### [m3-ads] M3-P0-07 — AdsTimeline manual-change revert:后端端点就绪前隐藏撤销/恢复按钮且禁止单独写 TIMELINE_REVERT 审计 _(bug)_
- files: apps/web-v2/src/pages/AdsTimeline.vue
- 验收: revertProcessed(:206-222)对 entry.kind==='manual_change' 分支:在后端 /manual-changes/:id/revert 端点就绪前,前端隐藏该类条目的撤销/恢复按钮,且绝不执行 :206 的 submit({actionType:'TIMELINE_REVERT'}) 也不仅做本地 entry.item.state='pending' 写回;suggestion 撤销仅调用后端 revert(由后端写审计),删除前端 :206 的 submit 双写。测试:manual_change 条目无可点击撤销按钮(或点击不发任何 submit);suggestion 撤销断言不调用前端 submit、仅调用 revert API。
- 理由: 已实锤审计/数据分叉:前端先写 TIMELINE_REVERT 审计后仅改本地 state,无后端真实写入,制造审计与数据不一致。

### [m3-ads] M3-P0-08 — 确立并执行硬规则:前端禁止在无后端真实写入时单独 submit 审计 _(refactor)_
- files: apps/web-v2/src/composables/useAudit.js, apps/web-v2/src/pages/AdsTimeline.vue, apps/web-v2/src/pages/BudgetAllocator.vue, apps/web-v2/src/pages/Dayparting.vue
- 验收: useAudit().submit 仅允许真正只读/记录类动作;所有实体 mutation 的审计由后端在数据变更后写入。本期落地范围:AdsTimeline/BudgetAllocator/Dayparting 三页移除 mutation 类 submit 直写(其余同模式页登记为 P1 收敛清单)。可断言:grep 这三个文件无 mutation-actionType(TIMELINE_REVERT/INCREASE_BUDGET/分时段)的 useAudit().submit 调用。
- 理由: 上述多处 P0 共因:前端审计旁路。需立硬规则防回归。

### [m4] M4-P0-01 — submitHijackingAppeal 事务化 + 透传 manual-evidence + 判返回值再改状态 _(bug)_
- files: apps/api/src/data-store-monitor.mjs
- 验收: data-store-monitor.mjs:1215 submitHijackingAppeal 用 db.transaction 包裹;调用 submitAppeal 时第4参用服务端自取的 cur.appeal_id(确认假货时自动建的草稿 id),第5参透传 body 的四项 manual-evidence;cur.appeal_id 为 null 时直接返回 {error:'validation_failed',message:'no draft appeal'} 不改任何状态。测试:(a)对 status='test_buy_received' 且 appeal_id 存在的跟卖,传齐四项 manual-evidence 调用 → submitAppeal 返回 submitted、m4_hijacking.status='appeal_submitted'、m4_appeals.status='submitted';(b)缺任一 manual-evidence 字段 → 返回 validation_failed.missing 含缺失字段,且 m4_hijacking.status 仍为 test_buy_received、appeal_id 未被脏写;(c)appeal_id 为 null → validation_failed,状态不变;(d)整个事务任一步抛错则 hijacking 与 appeal 均不落库。
- 理由: 实测 1219-1221:无事务、submitAppeal 不传第5参 body(导致 submitAppeal:1726 必返 validation_failed 但被丢弃)、先无条件 UPDATE status='appeal_submitted' 并用前端值覆盖 appeal_id。构成跨表脏写+静默假成功,是确定 P0。

### [m4] M4-P0-02 — Hijacking.vue 申诉入口 gating 改 test_buy_received + 删 appeal_drafted 死分支 + 四项 manual-evidence 表单 _(bug)_
- files: apps/web-v2/src/pages/Hijacking.vue, apps/web-v2/src/composables/useM4State.js
- 验收: Hijacking.vue:270 与 :282 的『记录人工申诉』按钮 v-if 改为 row.status==='test_buy_received';删除全部 appeal_drafted 操作分支(useM4State.js:97-98 的 appeal_drafted transition 同步清理或保留为不可达需注明);recordAppealSubmission(175) 改为弹出收集 amazonCaseId/submittedBy/manualSubmittedAt/evidenceAttachment 四项的表单(可用对话框组件),appealId 不由用户填、由 row.appealId 携带;成功提示仅在后端返回 hijacking.status==='appeal_submitted'(或 appeal.status==='submitted')时弹。测试(组件级):(a)渲染一行 status='test_buy_received' → 出现『记录人工申诉』按钮;(b)渲染 status='appeal_drafted' → 不出现该按钮(死状态);(c)表单缺字段提交 → 不调用 API 或回显逐项红字;(d)提交成功路径不再把用户输入当 appealId 传给后端。
- 理由: 实测后端零处写 appeal_drafted(confirm-counterfeit 停在 test_buy_received),按钮永不出现 → 运营无申诉入口;且 recordAppealSubmission:187 把用户输入的 Case ID 当 body.appealId 传入,被后端误用为 appeal 记录 id。

### [m4] M4-P0-03 — Appeals.vue 普通 review 申诉 submit 前补 manual-evidence 表单并透传 body + 逐项错误渲染 _(bug)_
- files: apps/web-v2/src/pages/Appeals.vue, apps/web-v2/src/api/m4.js
- 验收: Appeals.vue:103 ap.submit(a.id) 改为 submit 前弹与跟卖共用的 manual-evidence 表单(amazonCaseId/submittedBy/manualSubmittedAt/evidenceAttachment),收集后 ap.submit(a.id, form);响应 error==='validation_failed' 时把 error.missing 数组逐项渲染为红字而非笼统『提交失败』。测试:(a)draft 申诉传齐四项 → 响应 200/status='submitted';(b)缺字段 → 渲染对应 missing 项红字、状态停留 draft;(c)m4.js 的 appeals submit 封装允许透传 body 第二参。
- 理由: 实测 submitAppeal:1726 强制四项 manual-evidence;Appeals.vue:103 不传 body → draft→submitted 100% validation_failed,申诉中心整体不可用。

### [m4] M4-P0-04 — revert _MANUAL 断链修复:入口 strip _MANUAL + 补全 HIJACK_*/MANUAL 系列 case _(bug)_
- files: apps/api/src/data-store-monitor.mjs
- 验收: revertAuditLog 在 switch 前对 actionType 执行 .replace(/_MANUAL$/,'') 规整(line 2124/2126);新增 case:HIJACK_START_TESTBUY、HIJACK_SUBMIT_APPEAL、HIJACK_CONFIRM_GENUINE/COUNTERFEIT 的处理或显式不可回滚白名单、HIJACK_CLOSE、并确保 SUBMIT_APPEAL/SUBMIT_IP_COMPLAINT/SEND_RECOVERY_EMAIL 的 _MANUAL 变体经 strip 后命中既有 case。测试:对每个 audit 写入的 actionType(含 _MANUAL 后缀)调用 revert → 返回 true 或落入显式白名单,不再落 default return false(2313)。
- 理由: 实测审计写 SUBMIT_APPEAL_MANUAL(1743)/SUBMIT_IP_COMPLAINT_MANUAL(1377)/HIJACK_SUBMIT_APPEAL(1222) 等,而 switch(2126) 用原始 actionType 且无 strip、无 HIJACK_* case → 落 default false,撤销静默失败。

### [m4] M4-P0-05 — TabHistory.vue revert 假成功修复:读 dispatchedInverse 决定 reverted _(bug)_
- files: apps/web-v2/src/components/ad-drawer-tabs/TabHistory.vue
- 验收: onRevert(89) 在 revertAuditLog 返回后,仅当响应 dispatchedInverse!==false 才设 row.reverted=true(105);dispatchedInverse===false 时不置 reverted、弹 warning『撤销未生效(动作未实际反转)』并 reload。测试:(a)mock 返回 {dispatchedInverse:true} → row.reverted=true;(b)mock 返回 {dispatchedInverse:false} → row.reverted 不变、出现 warning。
- 理由: 实测 data-store.mjs:549 后端诚实回传 dispatchedInverse,但 TabHistory.vue:105 无条件 row.reverted=true 不读真值,造成 UI 假回滚。

### [m4] M4-P0-06 — CI gate:revert 集合覆盖 + 申诉链路红线断言 _(test)_
- files: apps/api/src/data-store-monitor.mjs
- 验收: 新增 CI 测试:(1)静态/运行时收集 auditM4 写入的全部 actionType 字面量集合,断言 ⊆ revertAuditLog 可处理 case 集合 ∪ 显式不可回滚白名单(白名单需在源码集中声明);(2)anomaly closed/resolved→resolve 返回 state_transition_forbidden(400)(依赖 M4-P1-01);(3)跟卖 confirm-counterfeit 后 status 仍为 test_buy_received(不是 appeal_drafted);(4)draft 申诉提交含四字段 → 200、缺字段 → validation_failed.missing;(5)test_buy_received 行渲染出申诉按钮(组件测试)。全部测试随 npm test 跑过且失败可阻断合并。
- 理由: 两轮 P0/P1 决议在 main 几乎全部未落地、本域真实风险=决议前(主持人实跑核验)。无 CI gate 锁定关键不变量,修复会再次漂移。

### [cross] X-P0-01 — 后端修复假回滚: revertAuditLog 对真实写白名单且未真正反向时禁止置 reverted=1, 返回 needsManualReversal 并降级 HTTP 409 _(bug)_
- files: apps/api/src/data-store.mjs, apps/api/src/data-store-ads.mjs, apps/api/src/store-routes-ads.mjs, apps/api/src/store-routes.mjs
- 验收: 给定 action_type 属于真实写白名单(ACTION_QUEUE_REAL_WRITE / real_write_success 来源 run)的审计行, 调用 revertAuditLog 时: (1) 若 _revertM3AdsAction/_revertM4Action 返回 dispatched===false, 则 data-store.mjs:547 的无条件 UPDATE audit_logs SET reverted=1 必须被跳过, 数据库中该行 reverted 仍为 0; (2) 返回对象含 {status:'revert_failed', needsManualReversal:true, dispatchedInverse:false}; (3) revert 路由据此返回 HTTP 409(非 200); (4) 对普通本地可逆 action(STRATEGY_TOGGLE 等)行为不变, dispatchedInverse===true 且 reverted=1 且返回 200。可写测试: 构造一条 ACTION_QUEUE_REAL_WRITE 审计 → revert → assert reverted 仍为 0 且 needsManualReversal===true 且 res.status===409。
- 理由: 已核实 data-store.mjs:534-550: 无论 dispatched 真假都执行 UPDATE reverted=1; revertM3Action(data-store-ads.mjs:3204 switch)无 ACTION_QUEUE_REAL_WRITE 分支必返 false; 真实写记录被假标记为已回滚=审计造假, 违反审计可信不变量。

### [cross] X-P0-02 — 前端修复假回滚共谋: Audit.vue revert() 与 useLocalStore.revertAuditLog 改悲观 await, 按 dispatchedInverse 分流红色阻断态, 删除吞错 catch _(bug)_
- files: apps/web-v2/src/pages/Audit.vue, apps/web-v2/src/composables/useLocalStore.js
- 验收: (1) useLocalStore.revertAuditLog(167-177)移除 await 之前的乐观翻绿(删除 170-173 的 log.reverted=true 前置赋值), 改为 await storeApi.revertAuditLog 之后依据响应的 dispatchedInverse/needsManualReversal 决定本地状态; (2) catch 块不得吞错静默, 失败/needsManualReversal 时不得标记 reverted; (3) Audit.vue revert(47-66)移除 catch{} 吞错与 await 前乐观赋值(61-63), 当响应 dispatchedInverse===false 时渲染红色阻断态文案 '本地已标记, Amazon 端未自动回滚, 需人工处理', 不显示 '已回滚（反向 API 调用...已持久化）'。可写测试(组件/集成): mock storeApi.revertAuditLog 返回 {dispatchedInverse:false,needsManualReversal:true} → assert 行未变为 reverted 且出现阻断态文案; 返回 {dispatchedInverse:true} → assert 显示成功态。
- 理由: 已核实 useLocalStore.js:170-176 在 await 前即翻绿且 catch 仅 console.warn; Audit.vue:59-65 不读返回值/不 await 网络结果/catch{} 吞错。四层断裂的前端两层, 真相已在后端响应却被前端单方面毁约。

### [cross] X-P0-03 — 真实写 gate 增 isRealMode() 守卫: assertRealWriteGate 首行非 real 模式直接拒绝, 杜绝 mock/hybrid 沙盒真打 Amazon _(bug)_
- files: apps/api/src/integrations/ads-api/live-action-executor.mjs
- 验收: assertRealWriteGate(live-action-executor.mjs:38)首行新增 if(!isRealMode()) throw new TypeError('real_write_requires_real_provider_mode')(从 provider-mode.mjs 引入 isRealMode)。可写测试: 在 DATA_PROVIDER_MODE 为 mock 或 hybrid 且 ADS_REAL_WRITES_ENABLED/confirmRealWrite/riskAccepted/凭证全部齐备的条件下调用 execute, assert 抛 real_write_requires_real_provider_mode 且 globalThis.fetch 对 /sp/keywords PUT 的调用次数为 0; 仅 DATA_PROVIDER_MODE=real 时允许真实写路径继续。
- 理由: 已核实 assertRealWriteGate(39-53)只校验 ADS_REAL_WRITES_ENABLED/ADS_API_MOCK/confirm/risk/allowlist, 无 provider-mode 守卫; 默认 hybrid 下若 env 齐备即可真打。维护 '非 real 不得真打 Amazon' 不变量。

### [cross] X-P0-04 — 重写 gate 回归测试: ads-live-action-gate.test.mjs 成功用例显式设 DATA_PROVIDER_MODE=real, 新增 mock/hybrid 必 throw 且零 fetch 反向用例 _(test)_
- files: tests/integrations/ads-live-action-gate.test.mjs
- 验收: (1)既有 '执行一次确认 keyword bid 变更' 成功用例顶部显式 process.env.DATA_PROVIDER_MODE='real' 才允许 200/PUT 成功; (2)新增用例: DATA_PROVIDER_MODE='hybrid'(及 'mock')+全 env 齐备时 execute 返回非 200 错误且 calls 中无任何 advertising-api-test.amazon.com/sp/keywords PUT; (3)断言序列化响应不含 refresh/access token 模式串(沿用现有 doesNotMatch)。测试本身锁定 'mock/hybrid 零真实 fetch' 契约。
- 理由: 已核实该测试(:9-19)未设 DATA_PROVIDER_MODE 即默认 hybrid, 却在 :107-131 断言真实 PUT 成功——正向背书了 X-P0-03 的漏洞, 是 522 全绿中的 false-negative 缺口, 必须随 gate 修复同步改写。

### [cross] X-P0-05 — 修改 m3-button-level.test.mjs 真实写回滚期望并新增 ACTION_QUEUE_REAL_WRITE revert 反向用例 _(test)_
- files: tests/qa/m3-button-level.test.mjs
- 验收: (1)M3-audit-07(:1513)与 M3-cross-03(:1539)若涉及真实写记录, 期望改为 reverted 仍 0 / 阻断态 / 非 200; 本地可逆 action 用例保持 dispatchedInverse===true; (2)新增用例: 对 ACTION_QUEUE_REAL_WRITE 审计行 revertAuditLog → assert dispatchedInverse===false 且 needsManualReversal===true 且 DB 中 reverted===0; (3)新增 real_write→revert 数据回归(若有真实 lx_targetings.bid 改写记录): assert 仅在 dispatchedInverse===true 时 bid 才回到 previousValue。
- 理由: 已核实现有 revert 用例(:1252-1448)一律 assert dispatchedInverse===true, 但这些均为本地可逆 action; 缺真实写白名单的阻断态断言, 当前测试套件正向锁死了错误契约。

### [cross] X-P0-06 — UI 对 real-write 记录禁用一键回滚改 申请人工回滚 阻断态; 真实写自动反向通道在 change-limit 悖论解决前不上线 _(ux)_
- files: apps/web-v2/src/pages/Audit.vue, apps/web-v2/src/components/SuggestionDrawer.vue, apps/web-v2/src/components/SuggestionCard.vue
- 验收: 审计/抽屉 UI 对 origin 为真实写(real-write / status===real_write_success)的记录: 回滚按钮置为 '申请人工回滚' 阻断态(不可触发自动反向), 本地可逆记录保留 '回滚' 按钮。可写测试(组件): 给定记录 {actionType:'ACTION_QUEUE_REAL_WRITE'} → assert 渲染 '申请人工回滚' 且自动 revert 不被调用; 给定 {actionType:'STRATEGY_TOGGLE'} → assert 渲染可点回滚。
- 理由: 全员附议硬约束: 反向写自身再过 assertRealWriteGate+assertChangeLimit(live-action-executor.mjs:69-78, previousValue 偏差>10% 触发 real_write_delta_too_large), 自动回滚工程上不可兑现, UI 绝不可承诺一键回滚。

### [cross] X-P0-07 — 产品形态根决策落地: 本期采纳 B 方案(纯 mock 坦白), 全站降级 已执行/已挽回/可回滚/真写=开启 文案为 模拟/草稿, 不打通真实写可达链路 _(feature)_
- files: apps/web-v2/src/components/SuggestionDrawer.vue, apps/web-v2/src/layouts/DefaultLayout.vue, apps/web-v2/src/composables/useAudit.js, apps/web-v2/src/pages/Audit.vue, apps/web-v2/src/stores/app.js
- 验收: 确定本期 = B 方案(纯 mock 坦白): (1)移除/改写所有把当前操作描述为 '真实已执行/已挽回/可回滚' 的误导文案为 '模拟/草稿/审计'; (2)不新增 confirmRealWrite/riskAccepted 双确认弹窗, audit.js 不暴露真实写端点(useAudit.js:16 requiresRealStoreWrite:false 与现状一致, 但 UI 文案明示 'mock'); (3)所有保留的真实写后端 gate 仅作沙盒/集成测试用途, 不在正规 UI 可达。验收: 全站 grep 无 '已挽回'/'已执行' 等承诺真实副作用且未带 '模拟/预估' 限定词的文案。
- 理由: 未决议题首要项, 必须本期拍板以统一所有徽章/文案修复方向。开发警告半成品最危险; 真实 Amazon 凭证缺失下真实写链路本期不可端到端验证, B 方案为唯一可发布且不构成欺诈的形态。


## P1 (49)

### [workbench] W8 — AdsActions 汇总卡口径与列表同源（risk.severity / risk.requiresApproval） _(bug)_
- files: apps/web-v2/src/pages/AdsActions.vue
- 验收: summary.high 改读 a.risk?.severity==='high'；需审批改读 a.risk?.requiresApproval===true（删除 blocked/status.includes 语义）；最佳做法直接复用 cards.value 计算汇总。可写为：构造含 risk.severity:'high' 的 audit，assert summary.high>0 且与下方列表过滤(:57) 计数一致。
- 理由: AdsActions.vue:34-35 summary.high 读 expectedImpact/target.priority、blocked 读 status.includes('blocked')（mock 无 blocked 态）→ 恒0，与 cards(53 行用对了 risk) 自相矛盾，诱导误判风险为0。

### [workbench] W9 — Workbench 三态分流 + refresh 改 await，空态接同步 CTA _(bug)_
- files: apps/web-v2/src/pages/Workbench.vue, apps/web-v2/src/api/integrations.js, apps/web-v2/src/components/EmptyState.vue
- 验收: 区分三态：error 非空=「加载失败」带重试；200 但无 overview/未绑店=「引导接店铺·同步」带 CTA(调 integrations.syncAll)；确无卡=「今日无待处理」。删除 Workbench.vue:130「数据加载失败」与 :174「所有事项都已处理完成」对成功/空数据的误用。refresh() 改 `await load()` 后按 error 分别弹 success/error。可写为：mock 成功空数据 assert 渲染引导文案非「加载失败」；mock reject assert 渲染「加载失败」；refresh 在 load reject 时不弹 success。
- 理由: Workbench.vue:130/174 把成功/空响应渲染成「数据加载失败」「已处理完成」，refresh()(108-111) 不 await 即弹「已刷新」(false-positive)；新用户激活闭环断裂(integrations.syncAll 存在但工作台未调)。

### [workbench] W10 — 为 GET /api/v1/ads/suggestions 增加 DB/scope 分支并与 dashboard 归一 _(bug)_
- files: apps/api/src/routes.mjs, apps/api/src/extended-routes.mjs
- 验收: GET /api/v1/ads/suggestions 在带 scope(Bearer+x-store-id) 时走 DB 分支返回 sourceMode:'db' 且 audits 形态可被前端 normalizeCard 归一为与 dashboard 同 schema。可写为：带 scope 请求 assert sourceMode==='db' 且每条含 risk.severity/risk.requiresApproval/payload.id。
- 理由: routes.mjs:47-48 ads/suggestions 为 mock-only，与工作台 db 分支构成同会话两套真相（工作台 db / 广告清单 mock）。

### [workbench] W11 — reject 二选一：真落库 dismissed 或删除虚假「反馈已记录」文案 _(bug)_
- files: apps/web-v2/src/components/DecisionCard.vue, apps/web-v2/src/pages/Workbench.vue, apps/web-v2/src/pages/AdsActions.vue, apps/api/src/routes.mjs, apps/web-v2/src/api/audit.js
- 验收: 若后端新增 POST /api/v1/audit/dismiss：reject 调用并落一条 dismissed 记录(reason/operator/time)，父组件绑 @reject 移除卡片；可写为 assert dismiss 端点被调且持久化一条。若不新增端点：删除「反馈已记录」改「本次会话已隐藏」，禁止宣称已记录；可写为 assert 文案不含「已记录」。父组件 Workbench/AdsActions 均绑 @reject。
- 理由: DecisionCard.reject(69-72) 仅 ElMessage('反馈已记录') 零持久化，且经核实后端无 /api/v1/audit/dismiss 端点(仅 m2/m4 有 dismiss)。父组件未绑 @reject 卡片不消失，体验自相矛盾。

### [workbench] W12 — DecisionCard 缺依据时禁用「一键执行」+ auditRequired 取后端真值 _(bug)_
- files: apps/web-v2/src/components/DecisionCard.vue
- 验收: 当 payload/evidence/recommendation 全空时「一键执行」按钮 disabled 并提示「缺少依据不可执行」；auditRequired 取 card.auditRequired 后端真值，不再兜底 true(:36)。可写为：传空 evidence+空 recommendation 的卡，assert 执行按钮 disabled；传 auditRequired:false 的卡 assert c.auditRequired===false。
- 理由: DecisionCard:36 auditRequired 兜底 true 掩盖后端真值；空依据卡仍可点执行会产生无依据的审计行。

### [workbench] W14 — 写入闸门越权/绕过回归测试 _(test)_
- files: tests/security/real-write-gate.test.mjs
- 验收: REAL_WRITES_ENABLED!=='true' 时：前端 body 传 requiresRealStoreWrite:true 调 mock-execute，assert 服务端覆写为 false 不触达真实店铺；execute 200ms 双击仅产生 1 条审计行。REAL_WRITES_ENABLED='true' 时另 assert 闸门进入 requiresApproval 路径且经 ad_action_queue。
- 理由: 将 W3/W4/W7 的安全不变量固化为回归，覆盖客户端绕过与防重入。

### [amazon-auth] AUTH-04 — realWriteEnabled 单一真相源:新增后端 getRealWriteGateState() 聚合 (ADS_REAL_WRITES_ENABLED && !ADS_API_MOCK && allowlist非空),diagnostics/oauth-flow/前端统一消费,删除三处硬编码常量;gate=true 时 hero 红色高亮并移除无条件'不会修改账户'承诺 _(bug)_
- files: apps/api/src/integrations/authorization-diagnostics.mjs, apps/api/src/integrations/oauth-flow.mjs, apps/api/src/integrations/provider-mode.mjs, apps/web-v2/src/pages/AmazonAuthCenter.vue
- 验收: (a) 新增 getRealWriteGateState() 返回 {realWriteEnabled, envGate, mockExclusive, allowlistConfigured};realWriteEnabled === (ADS_REAL_WRITES_ENABLED 为真 && ADS_API_MOCK 非真 && allowlist 非空);(b) diagnostics m3Impact.realWriteEnabled 与 buildOAuthConfig userExperience.realWritesEnabled 均改为调用该函数(删除 :272 / :197 硬编码 false);(c) 前端 hero(:424)展开 envGate/mockExclusive/allowlist 三子状态;realWriteEnabled=true 时 hero 渲染红色 banner 且不再无条件显示'不会修改账户';(d) 严守安全不变量:本改动仅诚实回显,不开启真实写入、不绕过 ad_action_queue/live-action-executor gate(现有 ads-live-action-gate.test.mjs 全绿不变)。可写单测注入 env 组合断言 realWriteEnabled 真值表。
- 理由: realWriteEnabled 三处硬编码 false 与真实 env 脱节,若运维误开 ADS_REAL_WRITES_ENABLED 页面仍显'关闭',诚实性失真。收敛为单源仅回显,不触碰 executor gate。

### [amazon-auth] AUTH-05 — SP-API callback 增加 cookie==state 第二因子强比对(CSRF token injection 防护);login handoff 改为 cookie 与 query state 都在时必须相等 _(bug)_
- files: apps/api/src/integrations/oauth-flow.mjs, tests/integrations/oauth-flow.test.mjs
- 验收: (a) handleOAuthCallback 在 provider==='spapi' 时读回 SPAPI_STATE_COOKIE 与 row.state/query state 比对,不一致或 cookie 缺失即返回 400 invalid_oauth_state 且不调用 exchangeAuthorizationCode(fetchCalls 不增);(b) handleSpApiLoginHandoff 当 query state 与 cookie 都存在时必须相等,否则 error spapi_login_state_mismatch;(c) 同步更新现有 oauth-flow.test.mjs:133 spapi callback 用例传入 start 下发的 cookie 使其继续通过;(d) 新增回归用例:spapi callback 无 cookie → 400 且 fetchCalls 不增;cookie!=state → 400。ads 路径维持现状(无 cookie 可比),标注 carryForward。
- 理由: oauth-flow:255 start 下发 cookie 但 :530-536 callback 从不读 cookie,只验 state,缺第二因子,可被注入他人 state 完成 token 绑定。成本低不依赖部署形态,本期落可断言拦截点;CSRF 终极定级与 ads 第二因子 carryForward。注意现有测试未传 cookie 必须同步改。

### [amazon-auth] AUTH-06 — 暴露撤销授权入口:新增 DELETE /credentials/:provider 路由调用已有 revokeSpApiCredentials/revokeAdsCredentials,内部强制 appendAuditLog 记 previousSellingPartnerId/previousProfileId;前端加'撤销授权'按钮 + ElMessageBox 二次确认 _(feature)_
- files: apps/api/src/integrations/sync-routes.mjs, apps/web-v2/src/api/integrations.js, apps/web-v2/src/pages/AmazonAuthCenter.vue
- 验收: (a) DELETE /api/v1/integrations/credentials/spapi 与 .../ads 路由存在,鉴权后调用对应 revoke 函数,成功返回 {ok:true,provider,status:'revoked'};(b) 撤销前读取并在 appendAuditLog payload 写入 previousSellingPartnerId(spapi)/previousProfileId(ads),actionType 为 AMAZON_SPAPI_CREDENTIALS_REVOKED / AMAZON_ADS_CREDENTIALS_REVOKED;(c) 撤销后 GET /status 该 provider status==='revoked';(d) integrations.js 加 revoke(provider) 方法;前端授权卡片/状态表加'撤销授权'按钮经 ElMessageBox.confirm 二次确认后调用。可写集成测试:DELETE 后 status 变 revoked 且 audit_logs 存在含 previousSellingPartnerId 的 REVOKED 行。
- 理由: revokeSpApiCredentials/revokeAdsCredentials 已实现但无路由暴露、前端无入口,用户无法解绑/换绑。审计记 previousId 为审计闭环不变量。

### [amazon-auth] AUTH-07 — 同步并发底线:前端 computed syncBusy=!!syncing 禁用整组同步按钮(含 syncAll/syncOrders/...);渲染后端已返回的 steps 数组为逐步成功/失败清单 _(bug)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue
- 验收: (a) 新增 computed syncBusy 在任一同步进行时为真;所有同步按钮(:499-503 与 :710-715)disabled 绑定 syncBusy,防跨按钮并发重复提交;(b) sync/all 返回的 result.steps 数组在结果区按 step.label + step.status(ok/error)+ errorCode/errorMessage 逐条渲染(当前 sync-routes:304 已返回 steps,前端从未渲染);(c) 单项同步进行中点 syncAll 被禁用(无第二次请求)。可写组件测试:设置 syncing='orders' 后断言 syncAll 按钮 disabled;给定含 steps 的 lastResult 断言渲染出 N 条 step 行。
- 理由: 前端 syncing 是单字符串无全局闸,sync-routes 无 in_progress 拦截,可跨按钮并发触发配额/token 竞态。底线 syncBusy 闸不依赖架构裁决先行;后端 in_progress/异步化 carryForward。

### [amazon-auth] AUTH-08 — Settings 授权徽标与 credentials 存在性一致:修复 demo seed authorized=1 但无 store_credentials 行的确定性误导;新增一致性不变量断言测试 _(bug)_
- files: apps/api/src/data-store.mjs, apps/web-v2/src/pages/Settings.vue, tests/integrations/provider-mode.test.mjs
- 验收: (a) 建立不变量:任一 store 的 sp_api_authorized=1(或 ads_api_authorized=1)当且仅当 store_credentials 存在对应 provider 的 active 行;(b) 新增断言测试遍历 seed 后所有 store,凡 *_api_authorized=1 必能查到对应 active credentials 行(否则失败);(c) 修复 data-store.mjs:265-266 demo seed:或置 0,或同时插入对应 active store_credentials 行(具体路线待产品确认 demo 是否需显示已接入,见 boundaryNotes);(d) Settings.vue 徽标(:155/:162)在 spApiAuthorized/adsApiAuthorized 为 undefined 时不再恒显误导态。注意 sp_api_authorized/ads_api_authorized 是真实 DB 列(被 sp-api-foundation.test.mjs:84 等断言),不可整体废弃改 /status。
- 理由: data-store.mjs:265-266 非 real 模式置 authorized=1 但不建 credentials,Settings 徽标显'查看接入'而 diagnostics 报 missing,确定性误导已接入店。修一致性不变量;seed 取值路线 carryForward。

### [amazon-auth] AUTH-09 — marketplace 发现失败时 spapi 凭证 status 落 needs_attention/incomplete 而非 active,使 active 语义与 diagnostics readiness 对齐;finalize 异常路径不留半就绪 active _(bug)_
- files: apps/api/src/integrations/oauth-flow.mjs, apps/api/src/integrations/sp-api/credentials.mjs
- 验收: (a) finalizeSpApiOAuth 当 marketplace 发现失败(warnings 含 marketplace_discovery_failed)且最终 marketplaceIds 为空时,updateSpApiCredentialMetadata 把 status 落为 'needs_attention'(非 active);(b) diagnostics classifyProvider 对 status!=='active' 仍 push blocker(现 :152 已有),从而 readiness 不为 ready,前端不显绿;(c) audit 仍记 partial。可写集成测试:stub marketplace participations 失败 → 回调后 store_credentials.status!=='active' 且 diagnostics readiness 非 ready。
- 理由: oauth-flow:444 发现失败仅 push warning,status 仍 active(:463 audit partial 但凭证 active),与 diagnostics'marketplace_ids_missing'blocker 矛盾,active 语义失真。

### [amazon-auth] AUTH-16 — 回归测试套件(断言矩阵基线):覆盖回流 0 probe / replace 前置 / syncBusy 禁用 / spapi 无 cookie callback 400 / live_partial 非纯 success / mock 非 success / DELETE 后 revoked / authorized↔credentials 一致性 _(test)_
- files: tests/integrations/oauth-flow.test.mjs, tests/integrations/sync-routes.test.mjs, tests/qa/amazon-auth-center-contract.test.mjs, tests/integrations/authorization-diagnostics.test.mjs, tests/integrations/provider-mode.test.mjs
- 验收: 可断言项全部成立:(a) 回流 route.query.oauth='success' 时前端 liveDiagnostics 调用===0 且二次 mount URL 已无 oauth 参数(AUTH-01);(b) 无 cookie 的 spapi callback 返回 400 invalid_oauth_state 且 fetchCalls 不增,cookie!=state 同样 400(AUTH-05);(c) syncAll pending 期间单项同步按钮 disabled(AUTH-07);(d) readiness 枚举映射断言矩阵:{ready,live_ok}→success,{live_partial,mock_ready,blocked,missing}→warning,{live_error,revoked}→danger,其他→info,且 m3DataMode==='ads_mock_fixture' 时页面 0 个 success tag(AUTH-02);(e) ADS_API_MOCK=1 时 ads readiness!=='ready' 且 tag type!=='success'(AUTH-02);(f) DELETE /credentials/:provider 后 status==='revoked' 且 audit 含 previousSellingPartnerId(AUTH-06);(g) 任一 store *_api_authorized=1 必有对应 active credentials 行(AUTH-08)。现有 522 测试保持全绿。
- 理由: 将本期决策固化为回归基线,防回退;断言矩阵被四角色采纳为统一契约。AUTH-05 需同步修改现有 oauth-flow.test.mjs:133 用例传 cookie 否则会红。

### [m1] M1-008 — 统一 manual A/B 创建契约为 201+manualRequired:true(消除落库+422 第三态),前端 unshift+幂等去重 _(bug)_
- files: apps/api/src/store-routes-listings.mjs, apps/web-v2/src/composables/useM1State.js, apps/web-v2/src/pages/ListingAbCenter.vue
- 验收: 裁决:采用 201+manualRequired:true 方案(测试工程师从回归成本强烈倾向,且 manual 测试本就需被用户看见以执行手动指引)。1) route(store-routes-listings.mjs:294-299)删除 422 分支,manual 返回 json({...result,manualRequired:true},201)。2) useM1State.create(:477)成功分支据 r.manualRequired/status==='manual_required' 给 warning 提示并 unshift(已有 :480),删除 catch 内 manual_required 分支(:488)。3) submitCreate(AbCenter:82)成功才关抽屉(已是),补幂等:create 前若 list 已存在同(targetId,testType,controlVersionId,treatmentVersionId)且 status==='manual_required' 则不重复 INSERT(前端拦 + 后端可选去重)。可测断言:POST manual 类型返 201;响应含 manualRequired===true 且 status==='manual_required';POST 后 GET /ab 数量+1;重复提交相同四元组不产生第二条 manual_required 行。改写测试 636-646 为'数量+1 且 status=manual_required'断言。
- 理由: 已核实当前最坏第三态:createAbTest(:1716)INSERT 落库后,route(:294-298)返 422+error:manual_required,前端 create(:479)在 422 时走 catch 抛错、不 unshift,DB 有记录/UI 看不见/测试锁 422 三方不一致。需单一终裁,本 PM 拍板 201 方案。

### [m1] M1-009 — 修复双 versions store 不同步:事件总线 invalidate(targetId) 首修,run/combinedPick 互相刷新 _(bug)_
- files: apps/web-v2/src/composables/useM1State.js, apps/web-v2/src/pages/ListingOptimize.vue
- 验收: 裁决:本轮先做低风险事件总线 invalidate,合并单一 store 留后续。1) 引入 invalidateVersions(targetId):清 _flowCache.get(targetId).versions loaded 标志 + _versionsCache.get(targetId).loaded 标志。2) createRun 成功(useM1State.js:226)后调 invalidateVersions 并让 _versionsCache 下次 fetch 拿到新版本;combinedPick 成功(:411)后同步把新版本写入 _flowCache.versions 或调 invalidateVersions 触发 flow 重取。3) ListingOptimize.latestVersion(读 flow.versions)在 combinedPick 后能反映最新组合版本,runPreflight(:95)校验最新版本而非旧版本。可测断言(组件级/集成):createRun 后 useVersions(targetId).list 含新版本;combinedPick 后 useTargetFlow(targetId).versions 含组合版本;补端到端用例'生成→组合→VersionBlock 可见'。
- 理由: 已核实 _flowCache.versions(run 生成 :226)与 _versionsCache.list(combinedPick 生成 :411)是两个独立 Map,不交叉失效;组合版本生成后 GenerationBlock/VersionBlock 不刷新,ListingOptimize.latestVersion 读 _flowCache 导致 runPreflight 校验旧版本。

### [m1] M1-010 — 补 A/B 与版本契约可断言测试套件 _(test)_
- files: apps/api/src/data-store-listings.mjs, apps/web-v2/src/composables/useM1State.js
- 验收: 新增/重排测试覆盖:1) manual A/B 返 201+manualRequired+数量+1(配 M1-008)。2) zTestSignificance clicks=0 时 significance 返回 1 但 winner='no_difference'、不得把 significance 当置信度展示为'高'(断言 :1745 分支)。3) GET metrics 幂等(前后 status 不变,配 M1-004)。4) finalize 前 adopt 被拒、finalize 后 winner 非 null。5) createAbTest version 归属/control≠treatment 校验(配 M1-003)。6) winner='control' 采用入口可见(配 M1-006)。7) combinedPick 空 fieldPicks/全无效 vId 返 validation_failed 不产生空版本。8) combinedPick actionType==='M1_VERSION_COMBINE'(配 M1-002)。可测断言:以上每条为独立可跑用例,全绿。
- 理由: 3 轮共识:这些契约当前 0 或错误断言覆盖,且多处修复(M1-002/003/004/006/008)需测试锁定防回归。

### [m1] M1-011 — audit actionType 渲染层强校验:upload 类必须带 amazon_receipt 否则不渲染'已发布' _(refactor)_
- files: apps/web-v2/src/composables/useAudit.js, apps/web-v2/src/pages/ListingAbCenter.vue
- 验收: 1) 审计渲染层(审计中心/任意展示'已发布/已上线'状态的组件)对 actionType 含 UPLOAD/PUBLISH 语义的条目,仅当存在 amazon_receipt/amazonReceiptId 非空时才渲染为'已发布',否则渲染'草稿/未写回 Amazon'。2) 建立单一 actionType 规范注释(同一逻辑动作单一字符串):adopt 收敛为单一 M1_AB_ADOPT_WINNER(配 M1-006 删前端预写)。可测断言:无 amazon_receipt 的 UPLOAD 类审计条目不显示'已发布';adopt 动作审计只产生一条 M1_AB_ADOPT_WINNER。
- 理由: 已核实 adopt 当前 3 个 actionType/2 条写路径(前端 ADOPT_AB_WINNER + 后端 M1_AB_ADOPT_WINNER),combinedPick 误用 UPLOAD;审计中心无法单一断言'是否真上线'。

### [m2] M2-P1-01 — ScenarioSimulator/previewScenario 成本口径统一(消费后端 delta+真实 unitCost+preview/save 同源) _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/ScenarioSimulator.vue
- 验收: 前端删除 0.20 魔数自算 delta,改消费后端权威 r.delta;baseline 须带该 SKU 真实 unitCost(从 listSkuProfit 取)发给后端,避免 previewScenario(:1236)落回 price*0.45;previewScenario 与 saveScenario 共用同一 computeUnitProfit;接全成本前 UI 标注'估算-未含 FBA/头程/资金成本,与利润页可能不符'并改副标题去掉'后端实时计算'矛盾措辞;净利率<0 返回 feasible:false。测试:相同输入下 preview 与 save 的 unitProfit 一致;syncBaseline 传 unitCost 后后端不使用 price*0.45 回退。
- 理由: 明确 bug:前端自算 delta 用写死 20% 毛利(:103-105)丢弃后端权威 delta;syncBaseline 不发 unitCost 致后端 previewScenario:1236 落回 price*0.45(成本随售价线性浮动谬误);副标题与写死系数矛盾。

### [m2] M2-P1-02 — recompute lifecycle/days_cover 真实推算 + recompute 返回体停止伪装异步 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/api/src/store-routes-profit.mjs, apps/web-v2/src/composables/useM2State.js
- 验收: recomputeProfit(:909) 的 lifecycle/days_cover 按 velocity/days_cover 真实推算(去掉硬编 'mature'/30),恢复 ProfitSkus 生命周期筛选;recomputeProfit 返回体由 {queued,jobId,etaSeconds}(:920) 改 {recomputed:true,count};useM2State.js:74 改只取 res.overview。测试:recompute 后 listSkuProfit 按 lifecycle 筛选可区分多种 lifecycle(非全 mature);recompute 返回体不含 queued 字段。
- 理由: 坐实:recomputeProfit:909 硬编 lifecycle='mature'/days_cover=30 使生命周期筛选失效;:920 同步执行却返回伪 {queued,jobId,etaSeconds} 契约撒谎。注:route :115 当前已 spread ov(含 overview),useM2State:74 改 res.overview 即可正确刷新 KPI。

### [m2] M2-P1-03 — 无真实数据源页面合规披露:FxRisk/TaxAssist/LTV/Dimensions/Repricing 注入 providerMode 演示横幅 + real 空态用 EmptyState _(ux)_
- files: apps/web-v2/src/pages/FxRisk.vue, apps/web-v2/src/pages/TaxAssist.vue, apps/web-v2/src/pages/LTV.vue, apps/web-v2/src/pages/Dimensions.vue, apps/web-v2/src/pages/ScenarioSimulator.vue, apps/api/src/integrations/provider-mode.mjs
- 验收: 上述页面读 providerMode() 注入全局'演示数据/未接入真实引擎'横幅;real 模式无真实数据时空态用 EmptyState 而非 0 值 KPI;FxRisk 'AI 建议'(:1849-1852 写死字符串)改标题'规则提示(演示)'去掉具体锁汇/换通道动作话术,或基于 exposures.share+getFxRates 波动率真实计算后才出建议;fx_rates seed source 由 'central_bank' 改 'seed'。测试:DATA_PROVIDER_MODE=mock 时这些页面渲染演示横幅;real 模式无数据时渲染 EmptyState 而非 0 KPI。注:real 模式是否硬禁用动作按钮为 carryForward(需法务裁定)。
- 理由: 安全不变量:无真实 Amazon/汇率/税务凭证不得伪装 real。FxRisk 写死中文建议、TaxAssist 全 seed 当权威应纳税额、LTV/Dimensions 冻结 seed,均需合规披露。

### [m2] M2-P1-04 — TaxAssist 真实性整改:移除/禁用撒谎导出按钮 + fileTax 文案明确不提交税局 + days_left 实时计算 _(bug)_
- files: apps/web-v2/src/pages/TaxAssist.vue
- 验收: 移除/禁用 exportData 三个导出按钮(:93/122/150),未生成文件不留 toast(删 :67 '申报数据已导出 CSV(Avalara/TaxJar 兼容格式)');fileTax(:57) 确认弹窗文案改'本地标记为已申报(不向税局/Avalara 提交)',状态 tag 与税局真实申报区分;days_left/deadlines 改 deadline-today 实时计算(非 seed 静态)。测试:点击导出按钮无成功 toast(按钮禁用或不弹假成功);fileTax 弹窗文本包含'不提交税局';days_left 随当前日期变化。
- 理由: 坐实:TaxAssist:67 纯 toast 伪装已导出 CSV(无文件生成),fileTax 伪装税局已申报,days_left 用 seed 静态值 —— 法律/合规风险。

### [m2] M2-P1-05 — InventoryTransfers approveTransfer 库存真值或明确文案 + 空 catch 回滚 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/InventoryTransfers.vue, apps/web-v2/src/composables/useM2State.js
- 验收: approveTransfer(:1417) 在事务内真实位移 on_hand(from 减/to 加)+写 audit+补 in_transit/received 状态机,或明确 UI 文案'仅记录调拨决策、不自动调整库存快照';前端空 catch 改 ElMessage.error+回滚乐观态。测试:若选真实位移,approve 后 from 仓 on_hand 减少、to 仓增加且写 audit;approve 失败时前端乐观态回滚。
- 理由: approveTransfer 当前不动 on_hand(零库存位移)却让用户以为已调拨;空 catch 吞错。方向(真实位移 vs 仅文案)为 carryForward。

### [m2] M2-P1-06 — PaymentChannels monthly_cost 后端单一真相源计算 + draft 隔离 _(bug)_
- files: apps/web-v2/src/pages/PaymentChannels.vue, apps/api/src/data-store-profit.mjs, apps/api/src/store-routes-profit.mjs
- 验收: 弹窗补 monthlyVolume 输入;后端按 fee_pct*monthlyVolume+fee_fixed*txCount 计算 monthly_cost(单一真相源,前端不自算);openCreate 先重置 draft 为默认、openEdit 仅挑白名单字段禁止写 id/计算列。测试:给定 fee_pct/fee_fixed/monthlyVolume/txCount 后端返回的 monthly_cost 等于公式值;openCreate 后 draft 不残留上次 openEdit 的字段。
- 理由: PaymentChannels 当前裸字段存储仅展示壳,monthly_cost 非计算列;openEdit spread 整行+openCreate 不重置致 draft 共享污染。是否真功能化为 carryForward。

### [m2] M2-T-01 — M2 核心回归测试套件(P0 修复可断言锁定) _(test)_
- files: tests/domain/m2-advanced-engine.test.mjs, tests/qa/m2-functional.test.mjs
- 验收: 新增/扩展断言:(1) reorder create-po(reorder.id)⇒201、(productId)⇒404、嵌套 reorder shape 快照锁定 store-routes-profit.mjs:214;(2) 单 PO ordered+payPO(deposit) 后 po_deposit COUNT===1、重复 payPO⇒already_paid;(3) 插入 outflow=100 后 timeline 末点 balance 减 100;(4) applyRepricing({price:0})⇒400、({price:breakEven-1})⇒400、(+confirm)⇒200;(5) scan conditions 不匹配 created===0、cooldown 内二次 created===0、mock isSimulated===true;(6) executeInvLinkEvent 后事件 status==='queued_pending_review' 且 ad_action_queue dryRun===true;(7) recompute 后 lifecycle 可区分;(8) executeSlowMoving option A newPrice>=break_even。全套 tests 绿。
- 理由: 所有 P0/P1 修复必须有可写成测试的验收锁定,防回归与防误改成真写(尤其 ad_action_queue dryRun 与现金流 COUNT 不变量)。

### [m3-ads] M3-P1-09 — executeActionQueueItem 删除 realWriteEnabled 死分支,硬编码 dryRun=1/status=dry_run_success,清脏文案 _(refactor)_
- files: apps/api/src/data-store-ads.mjs
- 验收: executeActionQueueItem(:2083)删除 body.realWriteEnabled 三元,硬编码 dryRun=1;:2102 status 仅 'dry_run_success'(删 mock_write_success);:2094 message 仅 'dry_run_success_no_external_write'(删 real_write_requested_but_adapter_mocked)。真写收敛到 live-action-executor(executeRealAds...)唯一入口。测试:即使传 realWriteEnabled:true 调 executeActionQueueItem,读回 run.dry_run===1 且 status==='dry_run_success';real 写语义仅经 /execute?realWriteEnabled=true→executeReal 路径断言。
- 理由: 已实锤:该分支为 HTTP 入口不可达死码 + 脏文案,批量路径下产生'假已处理'。

### [m3-ads] M3-P1-10 — enqueueManualAction 增 active 去重并统一三入队路径去重契约为 200+{duplicate,existing} _(bug)_
- files: apps/api/src/data-store-ads.mjs, apps/api/src/store-routes-ads.mjs
- 验收: enqueueManualAction 增加 (storeId,entityKind,resourceId,actionPrimitive,state∈active) 去重命中返回 {duplicate:true,existing};LX targeting(store-routes-ads.mjs:1161)与 SQP(:1169)由 409 改为 200+{duplicate:true,existing};suggestion 路径(:353/:366)已是 200+duplicate 保持。去重 key 粒度本期定为 (entity,primitive)='同实体 active 动作唯一'。测试:同一 entity+primitive 连点入队两次,第二次 HTTP 200 且 body.duplicate===true,队列长度===1;三路径均 200+duplicate 契约一致。
- 理由: 已实锤三路径契约不一致(suggestion 200 / manual 恒 201 无去重 / LX 409),前端把 409 良性结果 catch 成 error。

### [m3-ads] M3-P1-11 — 前端 enqueue 包装层把 duplicate/409 统一降级为 info,成功打 queuedInBasket 禁用重复入篮 _(bug)_
- files: apps/web-v2/src/api/ads-timeline.js, apps/web-v2/src/composables/useLxState.js, apps/web-v2/src/composables/useAdsState.js
- 验收: actionQueueApi.enqueue 包装层识别 res.duplicate===true 或 409,统一 ElMessage.info('已在执行篮中')而非 error;enqueueSuggestion/enqueueLxManualAction 成功后给对应实体打 queuedInBasket 标记并禁用重复入篮控件。测试:mock enqueue 返回 duplicate:true 时调用 ElMessage.info 不调用 ElMessage.error;成功入队后再次点击同控件被 disabled/拦截。
- 理由: 配合 M3-P1-10 的契约统一,消除良性重复被报错的体验。

### [m3-ads] M3-P1-12 — AdsHub dataHealth/healthType/aiContribution mock 诚实化 _(bug)_
- files: apps/web-v2/src/pages/AdsHub.vue
- 验收: dataHealth(:115-120):去掉 lx 硬编码 'healthy'(:119)与 m2 'partial' 计入 healthy;provider-mode!=='real' 时全 adapter status 强制 'mock';healthy 仅 real+真实回流时给出。healthType(:123)在非 real 下恒 'warning'(去除 >=3 即 success)。aiContribution(:109-113,hero :224)在 mock 下隐藏数值或加 '示例估算' 角标,不以 formatCurrency 美元净额作 hero 主视觉。测试:stub provider-mode='mock' 时 dataHealth 无 status==='healthy' 项、healthType==='warning'、AI 贡献区不渲染裸美元 hero(带示例标记或隐藏)。
- 理由: 已实锤语义颠倒:有 mock seed 反标 healthy、lx 硬编码 healthy、>=3 恒 success、把 mock impact 求和当美元 hero,误导采购/续费。

### [m3-ads] M3-P1-13 — 三态机诚实降级:裁剪为 pending/observing/rejected,删 succeeded/failed 死分支与观察期回流/自动回滚/回测文案 _(refactor)_
- files: apps/web-v2/src/pages/AdsTimeline.vue
- 验收: stateText/stateType(:230-248)删除 succeeded/failed(及 accepted 若无后端推进则一并核实)死分支;删除 :subtitle(:136 '按小时数据周期更新')、:167 等 '观察期回流/自动回滚/回测' 空头文案;observing 文案改 '已入队/待人工复盘' 或保留但不承诺自动结算。测试:全仓无 cron 推进 observing→succeeded 的证据下,UI 不出现 succeeded/failed 标签与 '已生效/未达预期' 文案;状态枚举集合 ⊆ {pending,observing,rejected}。
- 理由: 已实锤:succeeded/failed/观察期回流/自动回滚为不可达死码 + 空头承诺(无 cron 推进、observationWindow/cooldown 仅入库不消费)。

### [m3-ads] M3-P1-14 — LxAllCampaigns 过滤/同步工具条接真实过滤或全 disabled+即将上线;修 Clock 未 import _(bug)_
- files: apps/web-v2/src/pages/lx/LxAllCampaigns.vue
- 验收: filterDate(:65/:91)接 watch 或并入 fetchAll(params) 查询参数;查询(:100)/重置(:101)/同步(:111)绑定真实 handler(查询→fetchAll(params)、重置→清空+refetch、同步→fetchAll(force=true)+loading);未实现控件 disabled + '即将上线' tooltip。修复 Clock(:182)未 import(当前仅 import Histogram :4)致渲染错误。测试:点 查询 调用 fetchAll 带 filterDate 参数;点 同步 触发 force refetch+loading;组件挂载渲染无 Clock 未定义错误(快照/渲染测试通过)。
- 理由: 已实锤死控件群 + Clock 未 import 渲染报错。

### [m3-ads] M3-P1-15 — AdAnalysisDrawer 治理:refreshKey 触发重取、preset 标量单向 applyPreset、统一 fetcher 接 api/lx.js、mock tab 加示例水印 _(feature)_
- files: apps/web-v2/src/components/SuggestionDrawer.vue, apps/web-v2/src/api/lx.js, apps/web-v2/src/composables/useLxState.js
- 验收: 刷新改 refreshKey provide/inject 触发各 tab 真实 re-fetch;日期 preset radio 改字符串标量 v-model 单向驱动 applyPreset(date) 触发 fetch;抽象统一 fetcher 接 api/lx.js 并对齐字段契约;每个 mock tab 加 '示例数据' 水印,Compare 无真实数据时禁用语义色。测试:改 refreshKey 后断言 tab fetcher 被再次调用;选 preset 触发对应日期 fetch;mock 数据 tab 渲染含 '示例数据' 标记。
- 理由: 抽屉刷新不重取、preset 双向绑定与 mock 无标识,误导分析判断。

### [m3-ads] M3-P1-16 — 补 P0/P1 回归测试套件(可断言) _(test)_
- files: tests/qa/m3-action-queue-guardrail.test.mjs, tests/qa/m3-lx-snapback.test.mjs, tests/qa/m3-dedup-contract.test.mjs
- 验收: 覆盖:(a)batch{approve:true} 后 needs_review 项仍 queued 且在 skipped[];(b)raw body.guardrail.status=passed 读回仍 needs_review;(c)realWriteEnabled:true 调 executeActionQueueItem 仍 dry_run=1+status=dry_run_success;(d)useLxState 各 mutation 成功后 model===desired、失败后===prev;(e)LxTabTargeting commitBulkState 入队 recommendedValue===用户意图且传真实 row;(f)BudgetAllocator/Dayparting 点击走 enqueue 无直写审计;(g)三入队路径重复入队均 200+duplicate 且队列长度=1;(h)approveActionQueueItem 非 passed 抛 approve_requires_passed_guardrail;(i)provider-mode=mock 时 dataHealth 无 healthy 项。全部用例可执行且初始对未修代码应 RED。
- 理由: 决策明确要求为本轮所有 P0/P1 补可断言回归用例锁定不变量。

### [m3-ads] M3-P1-17 — LX 内联编辑范式定稿并统一应用(乐观 pending 角标 / 加入执行篮) _(ux)_
- files: apps/web-v2/src/composables/useLxState.js, apps/web-v2/src/pages/lx/tabs/LxTabTargeting.vue, apps/web-v2/src/pages/lx/LxAllCampaigns.vue, apps/web-v2/src/pages/lx/LxPortfolioDetail.vue
- 验收: 全 lx tab 统一范式:成功 enqueue 后控件停在 desired 并显示 pending 角标(从 action-queue 反查该实体 active 动作),区分 '当前生效值' 与 '篮中待执行值';toast 统一 '已加入执行篮待批准生效'。本期范式裁决:乐观 pending 角标(保留 v-model);影子回写/纯审计列为 carryForward 架构项。测试:enqueue 成功后控件值===desired 且渲染 pending 角标;角标数据源自 action-queue active 查询而非本地猜测。
- 理由: snapback 修复后须定义控件停 desired 的可观测范式,避免控件值≠真值二义。依赖 M3-P0-01。

### [m4] M4-P1-01 — anomaly 状态机 from 守卫 + 抽取共享 ANOMALY_TRANSITIONS 常量 _(refactor)_
- files: apps/api/src/data-store-monitor.mjs, apps/web-v2/src/composables/useM4State.js
- 验收: 抽取 ANOMALY_TRANSITIONS 常量(后端导出,前端复用同一定义或镜像并加一致性测试);resolveAnomaly(826)/dismissAnomaly(843)/escalateAnomaly(853)/acknowledgeAnomaly(820)/assignAnomaly 在 UPDATE 前校验 from∈合法前驱,非法返回 {error:'state_transition_forbidden'} 映射 HTTP 400;acknowledge 对非 assigned/non-open 状态返回 forbidden 而非 no-op。测试:(a)resolved 状态再 escalate → 400;(b)closed 再 resolve → 400;(c)合法 open→acknowledged→resolved 链路 200。
- 理由: 实测三函数均无 from 校验,可 resolved↔escalated 循环反复 insertSlaEvent 刷 SLA event。

### [m4] M4-P1-02 — SLA breach 派生判定修复 _(bug)_
- files: apps/api/src/data-store-monitor.mjs
- 验收: slaBoard(872) 的达成率不再仅依赖存量 a.sla_breached 标志;breached 派生为 (now>sla_deadline 且 status 非 resolved/dismissed) 或已记录的 breach 事件;slaRate(887) 据此重算。测试:构造一条 detected_at 早于 deadline 阈值、未 resolved 的 P0 anomaly → 计入 breached、达成率下降;一条按时 resolved 的 → 计入达成。
- 理由: 实测 slaRate 用 !a.sla_breached(仅 escalate 时被置1),超时未处理但未升级的不计 breach → 达成率虚高。

### [m4] M4-P1-03 — sendRecovery 降级为工单台(不伪装 real) _(bug)_
- files: apps/api/src/data-store-monitor.mjs, apps/web-v2/src/pages/ReviewList.vue, apps/web-v2/src/composables/useM4State.js
- 验收: sendRecovery(1825):状态改为 'marked_sent'(或 'manual_sent'),不再写 reviews.recovery_status='sent'(1830 移除或改 'marked_sent');强制 manual-evidence(channel/sentBy/sentAt),缺失返回 validation_failed;审计 actionType 改 SEND_RECOVERY_EMAIL_MANUAL(externalWrite:false)并补对应 revert case;前端按钮文案改『标记已人工发送』,KPI/文案去除『通过 Buyer-Seller Messaging 已发送』。测试:(a)缺 manual-evidence → validation_failed;(b)成功 → m4_recovery_emails.status='marked_sent'、reviews 未被写 'sent'、audit actionType 含 _MANUAL;(c)revert 该 audit → 200。
- 理由: 实测 1829-1830 裸翻 sent + 污染 reviews.recovery_status='sent',无 BSM/邮件实现、无 manual-evidence、审计无 _MANUAL,违反『无真实通道不得伪装 real』不变量。

### [m4] M4-P1-04 — Notifications 通道去伪装(接通真实通道前) _(bug)_
- files: apps/api/src/data-store-monitor.mjs, apps/web-v2/src/pages/Notifications.vue
- 验收: emitNotification(505) 接通前 channels 默认仅 ['in_app'],或保留 email/wechat 但前端按 deliveryStatus 将 queued 通道渲染为置灰 tag+tooltip『通道未接入(queued)』;Notifications.vue 读 deliveryStatus 而非仅渲染 channels tag;页面副标题去除『邮件+微信+静默时段』实然宣称,改『站内通知(邮件/微信通道规划中)』;silent_window_skipped 写死 0 的语义在 UI 不呈现为已生效静默。测试:(a)P0 通知的 email/wechat deliveryStatus==='queued' 在前端置灰;(b)副标题不含『已通过邮件/微信』类承诺。
- 理由: 实测 emitNotification:522 对 email/wechat 永久 queued、silent_window_skipped 恒 0,无真实通道;前端只渲染 channels tag 不读 deliveryStatus,误导运营以为已多通道触达。

### [m4] M4-P1-05 — categoryRank 指标降级:改名竞品 BSR(示意)+ 锁定单一对比 + sourceMeta mock:true + 删误导 action _(bug)_
- files: apps/api/src/store-routes-monitor.mjs, apps/web-v2/src/components/m4/M4DailyReport.vue
- 验收: store-routes-monitor.mjs:287 categoryRank 与 288 prevRank 重构:按单一 ourAsin/competitorAsin 锁定对比,prevRank 取同一 competitor_asin 的上一快照 BSR;返回字段重命名为 competitorBsr(示意);该维度 sourceMeta 强制 mock:true(独立于 spapi/ads sync,见 M4-P2-05);删除基于 categoryRank 的『类目排名下滑』action(331-334)。测试:(a)两条不同 competitor_asin 快照不再被当作同一指标的前后值;(b)无真实采集源时 sourceMeta.mock===true;(c)buildDailyReport 输出不含『类目排名下滑』action。前端列名/标题改『竞品 BSR(示意)』。
- 理由: 实测 287-288 取竞品快照 BSR 当我方类目排名、prevRank 跨竞品跨日取值,rankDelta 无意义却驱动误导 action(331);底层 mulberry32 伪随机却未标 mock。

### [m4] M4-P1-06 — M4DailyReport 定时推送文案降级(无 daily-report cron) _(ux)_
- files: apps/web-v2/src/components/m4/M4DailyReport.vue
- 验收: M4DailyReport.vue 关于『每天09:30固定复盘』的文案改为『打开即看当前同步结果,定时推送规划中』;fixedTime 时间选择器置灰或移除。测试(组件):无法兑现的『定时推送』承诺文案不再出现、时间选择器为 disabled 或不渲染。
- 理由: 实测 scheduler.mjs 仅有 orders/inventory/ads sync job,无 daily-report cron,M4DailyReport 的定时推送是无法兑现承诺。

### [m4] M4-P1-07 — draftRecovery 不再静默覆盖 reviews.recovery_status='drafted' 致漏出待挽回队列 _(bug)_
- files: apps/api/src/data-store-monitor.mjs
- 验收: draftRecovery(1821)调整:起草不把差评移出待挽回池——采用『可逆 in_progress 仍计入待办』或新增『挽回失败-待复盘』独立队列方案之一(本期定调可逆 in_progress);reviewMetrics 分母口径相应说明。测试:(a)起草后该 review 仍出现在待挽回/待办查询中;(b)挽回最终失败的件回流待挽回或落独立队列、不丢失。
- 理由: 实测 1821 起草即写 recovery_status='drafted',若前端待挽回池过滤掉 drafted 则差评静默漏出;需保证起草不脱离待办视图。注:三选一方案最终口径属 carryForward,本项落『可逆 in_progress』。

### [cross] X-P1-01 — sourceMeta poison-default 统一改 unknown(警示橙): 全部≥9 处(7 组件+api 层)缺省由 mock/mock seed/deterministic_mock 改显式 unknown; 后端 deriveSource 对 real 数据强制行级 origin _(bug)_
- files: apps/web-v2/src/components/SuggestionDrawer.vue, apps/web-v2/src/components/SuggestionCard.vue, apps/web-v2/src/components/m1/GenerationBlock.vue, apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue, apps/web-v2/src/pages/AdsHub.vue, apps/web-v2/src/api/m1.js, apps/api/src/store-routes-monitor.mjs
- 验收: (1)所有 sourceMeta.freshness/source 缺省回退由 'mock seed'/'deterministic_mock' 改为 'unknown'(SuggestionDrawer.vue:248, SuggestionCard.vue:45, AdsHub.vue:171, GenerationBlock.vue:178, m1.js:202/214/444/499 等); (2)后端对 real+active 凭证数据强制填行级 origin, 不得回退 mock。可写测试(组件): 给定 sourceMeta={mock:false} 且无 freshness → assert 不渲染 'mock seed' 文案且渲染 'unknown' 警示橙角标。
- 理由: 已核实 ≥9 处缺省回退为 mock 文案; real 数据缺 freshness 被误渲染 'mock seed' = 反向污蔑真实数据, 违反真假可辨不变量。缺省应表达 '来源未知不可断言真假'。

### [cross] X-P1-02 — M4 dailySourceMetaFor 真假判定与 providerMode 解耦: 改 hasSuccessfulSync 为主, hybrid 下有成功真实 sync 的字段标 mock:false _(bug)_
- files: apps/api/src/store-routes-monitor.mjs
- 验收: dailySourceMetaFor(:100-105)去掉 mode==='real' 前置硬门, 改为以 hasSuccessfulSync(行级 origin/last_sync_at)为主判定: hybrid 模式下有 spapi/ads 成功真实 sync 的字段 mock===false。可写测试: given DATA_PROVIDER_MODE='hybrid' + spapi 成功 sync 行 → assert sales sourceMeta.mock===false 且 realDataOnly 反映真实覆盖。
- 理由: 已核实 :103-105 spapiReal/adsReal/localReal 均 && mode==='real', 默认 hybrid 下恒 false → 真实已同步数据被系统性误标 mock(realDataOnly 死开关), 确定性 false-positive。

### [cross] X-P1-03 — 顶栏三信任锚点动态化: 删除 app.js currentStore/realWritesEnabled 死常量, 徽章从 /provider/status 派生 real/mock/hybrid 三态, 真实写状态读后端实际 gate _(bug)_
- files: apps/web-v2/src/stores/app.js, apps/web-v2/src/layouts/DefaultLayout.vue, apps/web-v2/src/composables/useLocalStore.js
- 验收: (1)app.js:8 realWritesEnabled 死常量与 currentStore 死值移除, 顶栏徽章从 listProviderStatus(/provider/status)派生 real(绿)/mock(蓝)/hybrid(橙)三态; (2)DefaultLayout.vue:15/259 的 realWritesEnabled 改读后端 provider status 而非 Pinia 死值; (3)收敛 Pinia 与 useLocalStore 双真相源为单一来源。可写测试: mock /provider/status 返回 mode='real' → assert 顶栏渲染 real 绿徽章; 返回 'hybrid' → 橙徽章。
- 理由: 已核实 app.js:8 realWritesEnabled:false 与 DefaultLayout.vue:15 storeToRefs 读死值, 与 /provider/status 脱节; Pinia 与 useLocalStore 双真相源使顶栏读死值业务读真值永不一致(激活→留存→续费漏斗信任锚点击穿)。

### [cross] X-P1-04 — x-store-id 写路径 ownership 校验: 抽 resolveStoreScope(userId, headerStoreId) 强制 SELECT user_stores WHERE id=? AND user_id=?, 不匹配 403 store_not_owned, 五路由统一调用 _(bug)_
- files: apps/api/src/store-routes-ads.mjs, apps/api/src/store-routes-listings.mjs, apps/api/src/store-routes-monitor.mjs, apps/api/src/store-routes-profit.mjs, apps/api/src/store-routes.mjs
- 验收: 新增共享 resolveStoreScope(u.id, headerStoreId): SELECT user_stores WHERE id=? AND user_id=?, 不匹配返回 403 store_not_owned; 五个 store-routes 写路径统一调用。可写测试: userA 的有效 token + 伪造 x-store-id(属于 userB)→ assert HTTP 403 store_not_owned; userA 自有 store-id → 通过。
- 理由: 已核实 6+ 路由文件消费 x-store-id 但缺 ownership 断言; 多租户隔离越权止血, 拍板前先补。

### [cross] X-P1-05 — security.mjs header-RBAC 定性并止血: tenantId/role 不得 header 自报, 改从认证 token 派生; 移除 securityJson 注入的 sourceMode:mock _(bug)_
- files: apps/api/src/security.mjs
- 验收: (1)evaluateTenantAccess 的 actor.role/tenantId 不再读 request.headers.get('x-role')/'x-tenant-id' 自报(security.mjs:21-40), 改从认证 token 派生(或本期定性为遗留删除该 header-RBAC 骨架); (2)securityJson(:80-88)停止注入 sourceMode:'mock', 改用独立 securityMode 字段。可写测试: 携带 x-role:admin 但 token 非 admin 的请求不得获得 admin 权限; 安全错误响应 JSON 不含 sourceMode 字段。
- 理由: 已核实 security.mjs:33 role 默认 'admin' 且可被 x-role header 自报、:37 resource tenant 也由 header 自报 = RBAC 形同虚设; :81 securityJson 注入 sourceMode:'mock' 使一次安全错误污染前端真假状态机。

### [cross] X-P1-06 — shouldSeedMock catch 改 fail-closed: 返回 false + console.error, 杜绝 DB 抖动期向真实店铺 fail-open 注入 mock 种子 _(bug)_
- files: apps/api/src/integrations/provider-mode.mjs
- 验收: provider-mode.mjs:32-34 catch 分支由 return true 改为 console.error 后 return false。可写测试: stub getDbInstance().prepare 抛错 → assert shouldSeedMock(userId,storeId)===false。
- 理由: 已核实 :32-34 catch{ return true } = DB 查询失败时默认播种 mock, 对配置了真实凭证的店铺构成 fail-open 污染。

### [cross] X-P1-07 — 统一审计视图(单一来源): 合并 mock(useAudit)与 real(recordActionQueueExternalResult)记录, 新增 origin 列(mock-seed/local-real/ads-real-write), 回滚按钮按 origin 分流 _(feature)_
- files: apps/web-v2/src/composables/useAudit.js, apps/web-v2/src/pages/Audit.vue, apps/api/src/data-store.mjs, apps/api/src/data-store-ads.mjs
- 验收: (1)审计中心消费后端统一 audit log(含 ACTION_QUEUE_REAL_WRITE 来源), 新增 origin 列区分 mock-seed/local-real/ads-real-write; (2)mock-seed 行禁用回滚, ads-real-write 行强制 '申请人工回滚' 阻断态(承接 X-P0-06), local-real 且 dispatchedInverse 可达类型放开回滚; (3)useAudit.js 移除恒 mockExecute 假象的硬编码语义, 文案物理区分 mock/real。可写测试: 列表含三类 origin → assert 各自回滚按钮态正确。
- 理由: 已核实 useAudit.js:16 硬编码 requiresRealStoreWrite:false; 正规 UI 所有写只产生 mock 审计却承诺可回滚 = 闭环欺骗。需单一视图 + origin 区分 mock 可逆 vs real 需人工。

### [cross] X-P1-08 — removeUserStore 审计留痕: audit_logs 从删店级联硬删剔除, 改软删(store_archived_at)或迁 archived_audit_logs; 删店前存在未回滚真实写时阻断; 前端弹窗声明保留策略 _(refactor)_
- files: apps/api/src/data-store.mjs, apps/web-v2/src/composables/useLocalStore.js, apps/web-v2/src/pages/Settings.vue
- 验收: (1)removeUserStore(data-store.mjs:437)从事务中移除 DELETE FROM audit_logs, 改软删(写 store_archived_at)或迁 archived_audit_logs 保留留痕; (2)删店前若存在 reverted=0 的真实写白名单审计, 返回 409 阻断; (3)前端删店确认弹窗显式声明审计保留策略。可写测试: 删店后 assert audit_logs(或归档表)中该 store 记录仍存在; 存在未回滚真实写时 assert 删店 409。
- 理由: 已核实 data-store.mjs:437 在删店事务内物理硬删 audit_logs, 违反审计不可篡改不变量。与 ownership 争论脱钩单独立项。

### [cross] X-P1-09 — 本月已挽回 reduce 语义修正: 拆 已节省/已投入 分账禁止正负净加; 真实写跑通前 KPI 改 预估可挽回(模拟)橙色水印 _(bug)_
- files: apps/web-v2/src/pages/Audit.vue
- 验收: (1)Audit.vue:37 monthlyImpact 的 reduce 不再对正负 monthlySaving 净加, 改拆 '已节省' 与 '已投入' 两个分账字段; (2)KPI 卡标题(:97)改为 '预估可挽回(模拟)' 并加橙色水印, 移除 '累计自动节省' 的真实功效暗示。可写测试: 给定 logs 含 monthlySaving=[-1500,800,2000] → assert 已节省与已投入分别汇总而非净加为 1300; assert KPI 文案含 '模拟/预估'。
- 理由: 已核实 Audit.vue:37 reduce 把含负值(mock 种子 -1500/-800)的 saving 净加输出语义错乱数字, 且来源是 mock 事前预估, Amazon 端从未发生(承接 B 方案合规口径)。


## P2 (33)

### [workbench] W15 — 端点契约矩阵清点（付费倒挂是否系统性） _(test)_
- files: tests/contract/endpoint-matrix.test.mjs, apps/api/src/routes.mjs
- 验收: 逐一 Read 并列出 inventory/decisions、monitor/overview、ads/suggestions 等是否缺 DB 分支，产出契约矩阵；对已确认缺 DB 分支的端点纳入回归断言（带 scope 请求应返回 sourceMode:'db' 或登记为已知 blocker）。
- 理由: routes.mjs:43-52 实测 inventory/decisions、ads/suggestions、monitor/overview 均 mock-only，付费倒挂为系统性策略问题，需矩阵清点确认范围。

### [workbench] W16 — AdsActions 孤儿页处置（删页并入 Workbench 单一 Inbox） _(refactor)_
- files: apps/web-v2/src/pages/AdsActions.vue, apps/web-v2/src/router/index.js, docs/seed 或 PROJECT_STATUS.md
- 验收: 在 W10(ads/suggestions DB 分支) 与 W1 补齐后：删除 AdsActions 页面组件，路由 /ads/actions 改 redirect→/workbench?filter=ad_suggestion；清点 M3 深链无指向 /ads/actions 的死链；更新种子文档去「(旧)」标记，确立单一事实源。可写为：访问 /ads/actions assert 重定向到 /workbench?filter=ad_suggestion；grep 代码库无残留 /ads/actions 深链。
- 理由: AdsActions(/ads/actions) 是 router 无 group 的孤儿页(标题「操作清单(旧)」)与 Workbench 走不同端点构成双真相。收敛为删除时机分歧——须待 W1/W10 补齐后删，避免删除当前唯一真 severity 入口。

### [workbench] W17 — 全局 Action Inbox 待办权威源统一（决策卡 Inbox 与 NotificationBell 同源） _(feature)_
- files: apps/api/src/extended-routes.mjs, apps/web-v2/src/components/NotificationBell.vue, apps/web-v2/src/composables/useNotificationsBus.js, apps/web-v2/src/layouts/DefaultLayout.vue
- 验收: 评估新增轻量 GET /api/v1/dashboard/summary 供顶栏角标轮询并使 NotificationBell 未读数与 Workbench cardSummary 同源；execute/reject 后两处计数同步刷新。可写为：execute 一条后 assert bus.unreadCount 与 cardSummary.total 同步变化。若产品决定不统一则文档下线跨页未读角标需求。
- 理由: NotificationBell 是真实 10s 轮询单例 bus(确认存在)，但通知流与决策卡 Inbox 两套互不相通真相，两个「待办」计数永远对不上；Workbench 仅 onMounted 拉一次、execute/reject 后不刷新。

### [amazon-auth] AUTH-10 — OAuth start/finalize store 绑定一致性:callback redirect query 带 storeId,前端 handleOAuthReturn 比对当前 store,不一致则提示并切回授权店铺 _(bug)_
- files: apps/api/src/integrations/oauth-flow.mjs, apps/web-v2/src/pages/AmazonAuthCenter.vue
- 验收: (a) handleOAuthCallback 成功 redirect query 增加 storeId=row.store_id;(b) 前端 handleOAuthReturn 读取 query.storeId,若与 currentStoreId 不一致则 ElMessage 提示并 switchStore 回授权店铺后再 loadStatus;(c) 可写组件测试 mock query.storeId!=currentStoreId 断言触发 switchStore。
- 理由: 授权在 A 店发起、回流时前端可能停在 B 店,凭证落 A 店但页面展示 B 店状态,造成'授权成功却看不到'。row.store_id 已存,补回传比对即可。

### [amazon-auth] AUTH-11 — 多 profile 回流引导(非探测路径):消费 callback 回传的 profileSelection==='required',前端进入显式 profile 选择态并定向滚动到选择卡,不依赖第二次易超时 probe _(feature)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue, apps/api/src/integrations/oauth-flow.mjs
- 验收: (a) handleOAuthReturn 读取 route.query.profileSelection;==='required' 时进入显式选择态(展开 profile 选择卡并 scrollIntoView),不触发 runProbe;(b) callback 在 profiles>1 时把候选 profileId 经 redirect query 或后端 /status 回传(不依赖前端再发 liveProbe);(c) probe 仍失败时给可见错误+重试按钮,不静默吞掉。可写组件测试:query.profileSelection='required' 断言展开选择态且未调用 liveDiagnostics。
- 理由: oauth-flow:576 已回传 profileSelection 但前端从不消费(AmazonAuthCenter.vue 无引用);且 adsProfileCandidates(:62)依赖 liveProbe 结果,与'停 probe'(AUTH-01)冲突,需非探测候选路径。

### [amazon-auth] AUTH-12 — 手动 saveSpapi/saveAds 与一键路径对齐:增加 currentStoreId 前置校验 + 店铺名二次确认;start 前若该 provider 已 active 弹覆盖确认,finalize 覆盖时审计 previous sellingPartnerId/profileId _(bug)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue, apps/api/src/integrations/oauth-flow.mjs
- 验收: (a) saveSpapi/saveAds 在 !currentStoreId 时 ElMessage 警告并 return(对齐 startOneClick:232);(b) 保存前 ElMessageBox 确认目标店铺名;(c) startOAuth/finalize 当该 provider 已存在 active 凭证时,前端 start 前弹覆盖确认,后端 finalize 覆盖时 audit payload 记 previousSellingPartnerId/previousProfileId。换账号是 409 硬阻断还是确认+覆盖待裁(见 carryForward),本项只落'覆盖前审计 previousId'不变量。可写测试:已存在 active 凭证时再次 finalize → audit 含 previous*Id。
- 理由: startOneClick 有 currentStoreId 校验(:232)但 saveSpapi/saveAds(:268/:287)无,可把凭证落到非预期店铺;覆盖换账号无 previousId 审计无法回溯。换账号严苛度 carryForward。

### [amazon-auth] AUTH-14 — 授权成功页转化收口:flow-strip 第4格文案改'同步后即可在 M2/M3/M4 使用'停止过度承诺;成功后引导'去同步真实数据'CTA(不自动触发同步) _(ux)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue
- 验收: (a) flow-strip 第4格(:528-532)及 hero 文案不再无条件承诺'业务可用/读取真实数据',改为'同步后即可在 M2/M3/M4 使用';(b) 授权成功后展示醒目'去同步真实数据'CTA(指向 tab4 / quick-sync 卡),点击进入手动同步而非自动触发;(c) 不引入授权后自动首同步(见 boundaryNotes carryForward)。可写快照测试断言新文案存在、无自动 sync 调用。
- 理由: 授权成功≠有数据,当前文案让运营误以为立即可用(空白页)。A 的自动首同步诉求被工程否决(须 syncBusy+409 先落),本期只做文案与 CTA 收口。

### [amazon-auth] AUTH-15 — 跨模块以 source meta 而非 readiness 判定真实数据:M3/M4 渲染 mock fixture 时显 warning+'数据来源: Mock Fixture'标签并置灰/禁用真实同步绿标 _(bug)_
- files: apps/web-v2/src/pages/AmazonAuthCenter.vue, apps/api/src/integrations/authorization-diagnostics.mjs, apps/api/src/data-store-ads.mjs
- 验收: (a) Ads mock 模式 live checks 标 source:'fixture';(b) 消费方(M3 control tower / 抽屉 sourceMeta)以 source meta(source==='mock'/'fixture')而非 readiness 判定是否真实数据,渲染 warning + '数据来源: Mock Fixture' 标签,且不显真实绿标;(c) m3DataMode==='ads_mock_fixture' 时相关真实同步按钮置灰。可写测试:注入 ADS_API_MOCK=1 后断言诊断 source meta 与前端 mock 标签渲染、0 绿标。
- 理由: diagnostics:269 已有 ads_mock_fixture 但跨模块仍可能凭 readiness 误判真实;SuggestionDrawer:209 已读 sourceMeta.realWriteEnabled,应统一以 source meta 驱动真实/mock 展示。

### [m1] M1-012 — 删除死页 ListingExperiments.vue / ListingList.vue + 加 CI lint 检测未注册未引用 .vue _(refactor)_
- files: apps/web-v2/src/pages/ListingExperiments.vue, apps/web-v2/src/pages/ListingList.vue, apps/web-v2/src/router/index.js
- 验收: 1) 确认 ListingExperiments.vue/ListingList.vue 既不在 router/index.js(已核实不在)也无被已注册组件 import,直接删除。2) 受影响跳转(若有指向 ListingList 的)改 /listings/select。3) 新增 CI lint 脚本:glob 所有 src/**/*.vue,对每个文件断言'在 router/index.js 注册 或 被某已注册组件/页面 import',否则失败。可测断言:仓库不含这两个文件;CI lint 脚本对故意新增的孤儿 .vue 报错退出非 0。
- 理由: 已核实两文件未在 router 注册,构成与 AbCenter 并行的第二套 A/B 入口幻影(ListingExperiments 含第三套 adoptWinner 写路径),死页被测试 import 会产生 false-positive 覆盖率。

### [m1] M1-013 — rewriteRunField 与 startAbTest 去除 Date.now seed/baseDate,恢复确定性以支持 golden-snapshot _(refactor)_
- files: apps/api/src/data-store-listings.mjs
- 验收: 1) rewriteRunField(data-store-listings.mjs:1073)mulberry32 seed 去掉 Date.now(),改用 runId+field+次数计数(如该 run+field 的重写序号)。2) startAbTest(:1786)baseDate 从 started_at 派生(started_at - duration_days)而非 Date.now();ends_at=started_at+duration。可测断言:同一 runId+field 重写第 N 次结果稳定可复现;固定 started_at 下 startAbTest 生成的 metrics 数值 golden-snapshot 稳定。
- 理由: 已核实 rewriteRunField :1073 用 Date.now() 入种子(非确定性);startAbTest :1786 baseDate 用 Date.now()(RNG 虽确定但日期漂移),致数值层永久无法 golden-snapshot 回归。与 finalize(M1-004)配套。

### [m1] M1-014 — deleteVersion 增加'被 running/completed A/B 引用则拒绝删除'校验 + 前端按 id 回滚 + 归档版本标记 _(bug)_
- files: apps/api/src/data-store-listings.mjs, apps/api/src/store-routes-listings.mjs, apps/web-v2/src/composables/useM1State.js
- 验收: 1) deleteVersion(data-store-listings.mjs:1541)在删除前查 m1_ab_tests 是否存在 control_version_id=id 或 treatment_version_id=id 且 status IN('running','completed','ready_for_manual_publish'),命中返 {error:'version_referenced_by_ab'},route 返 409/400。2) 前端 remove(useM1State.js:382)回滚已是按 splice index,确认 splice 回插用原 index 安全(当前实现 OK,补测)。3) version 下拉(AbCenter versionsForTarget)标记 is_archived 版本。可测断言:删除被 running A/B 引用的版本返错误且行不删;归档版本在下拉显示'(已归档)'标记。
- 理由: 已核实 deleteVersion(:1541-1553)仅拦 round_no=1 baseline,不检查 A/B 引用,删除后 A/B 详情/采用 Winner 会指向不存在的 version。

### [m1] M1-015 — M1ResourceHub'进入作战室'携 targetId 或先导选择 + 文案降级标'未联动(占位)' _(ux)_
- files: apps/web-v2/src/pages/M1ResourceHub.vue
- 验收: 1) M1ResourceHub.vue:118'进入 Listing 作战室'按钮改跳 /listings/select(不带 targetId 会被 ListingOptimize:59-62 弹回 select,体验断裂)。2) 联动实现前,'从资料陈列柜改成作战室补给线'(:135)等措辞降级标注'未联动(占位)',或删除暗示已闭环的'补给线/闭环'表述。3) hero 数字若为静态写死,改为动态或标注示例。可测断言:点击主按钮 path 为 /listings/select(非 /listings/optimize 无参);页面含'未联动'或'示例'标注。
- 理由: 已核实 :118 跳 /listings/optimize 不带 id,落地即被 ListingOptimize onMounted(:59-62)弹回 select;:135 文案宣称已成'补给线'但实际未联动 keyword/voc 注入。

### [m2] M2-P2-01 — M2 死代码清理:repricingApi.detail + useM2State detail() _(refactor)_
- files: apps/web-v2/src/api/m2.js, apps/web-v2/src/composables/useM2State.js
- 验收: 删除 repricingApi.detail(m2.js:119, GET /repricing/:id 后端未注册)+useM2State.js:684-691 detail() 及 composable 公共导出;确认 repricing list 已内联 scenarios、补 current&&!scenarios.length 空态(不补后端路由)。测试:代码库无 repricingApi.detail 引用;切换 SKU 时 repricing 详情从 list 内联 scenarios 读取。
- 理由: 坐实死接口:store-routes-profit.mjs 无 GET /repricing/:id 注册(:357 是 list,:366 是 apply),m2.js:119 detail 永远 404;useM2State.js:684-691 死代码。已确认 list 内联 scenarios,不补后端路由。

### [m2] M2-P2-02 — M2 全域 list envelope 治理 + 乐观更新/软删统一规则 _(refactor)_
- files: apps/web-v2/src/composables/useM2State.js, apps/web-v2/src/api/m2.js, apps/api/src/store-routes-profit.mjs
- 验收: 锁定后端统一 envelope(reorder→{decisions}/slow→{items}/transfers→{transfers}/po→{pos} 或统一为 {items,total,cursor}),删 useM2State 多键兜底,解包非数组时 console.warn 暴露契约漂移;软删场景以服务端返回对象覆盖 status 不 splice;乐观更新成功后一律以服务端返回对象覆盖、废弃乐观值。range 入参全域统一('30d' 字符串 vs 纯数字 days)。测试:各 list 端点返回固定 envelope key 的快照测试;dismiss/软删后刷新状态不回跳。注:一次性 vs 分批为 carryForward。
- 理由: 坐实:18+ 端点多键 envelope 兜底掩盖契约漂移;dismiss 后端软删但前端 splice 硬删致刷新状态回跳。治理节奏/范围为 carryForward。

### [m2] M2-P2-03 — InventoryLink 阈值单调性校验 + enabled 开关持久化 _(bug)_
- files: apps/web-v2/src/pages/InventoryLink.vue, apps/api/src/data-store-profit.mjs
- 验收: 配置保存校验阈值单调性(拒绝 stopAt>=alertAt 等矛盾规则);enabled 开关 @change 立即 saveConfig 持久化(非仅乐观)。测试:提交 stopAt=alertAt 矛盾配置返回 validation_error;切换 enabled 后刷新页面状态保持。
- 理由: InventoryLink 阈值无单调性校验可配矛盾规则;enabled 开关乐观不持久化。

### [m2] M2-P2-04 — PO 编号数值排序 + 状态机终态/inflight 禁用 _(bug)_
- files: apps/api/src/data-store-profit.mjs, apps/web-v2/src/pages/ProfitCashflow.vue
- 验收: PO 编号取 max 改 CAST(substr AS INTEGER) 数值排序或零填充(修 PO-999→PO-1000 字典序撞唯一键),唯一冲突 retry;PO 状态机 UI 补 cancelled/disputed 终态分支入口;transition/payment 按钮加 inflight 禁用防连点;写操作后以服务端返回对象为准。测试:已有 PO-999 时下个编号为 PO-1000(非 PO-1000 被 PO-999 字典序压过);连点 transition 仅提交一次。
- 理由: PO 编号字符串排序 PO-999>PO-1000 字典序取错撞唯一键+并发同号;状态机缺终态;写按钮无 inflight 防连点。

### [m2] M2-P2-05 — LTV/Dimensions 假控件处置(range/tab 标注或接真实重算) _(bug)_
- files: apps/web-v2/src/pages/LTV.vue, apps/web-v2/src/pages/Dimensions.vue, apps/api/src/data-store-profit.mjs
- 验收: 短期:移除无效 range/tab 切换控件或标'估算-不随周期变化';或中期 listLtv/listDimensions 接 range 并基于 listSkuProfit 实时归并重算并显示 computed_at。测试:若标注则无效控件不出现或带'不随周期变化'提示;若接 range 则切换 range 返回不同聚合值。
- 理由: LTV/Dimensions 冻结 seed+假控件(range/tab 切换无效)。处置方向为 carryForward(取决于 real 是否有重算计划)。

### [m2] M2-P2-06 — RepricingDecision rejected 死控件处置 + EmptyState 文案分流 _(bug)_
- files: apps/web-v2/src/pages/ScenarioSimulator.vue, apps/api/src/data-store-profit.mjs, apps/api/src/store-routes-profit.mjs
- 验收: 补 reject 端点+审计,或删除 'rejected' 状态筛选 radio(后端无 reject 路径);EmptyState 文案按是否带筛选分流(有筛选→'当前筛选无结果',无筛选→'暂无重定价建议')。测试:若保留 reject radio 则存在 reject 端点且筛选返回 rejected 项;否则该 radio 不渲染。
- 理由: RepricingDecision 'rejected' 筛选为死控件(后端无 reject 路径)。

### [m3-ads] M3-P2-18 — 约30个绕过队列的直写库函数收敛(@internal+守卫或物理删除) _(refactor)_
- files: apps/api/src/data-store-ads.mjs, apps/api/src/store-routes-ads.mjs, apps/api/src/integrations/ads-api/live-action-executor.mjs
- 验收: 逐一核实 updateCampaignBudget/promoteUserSearchTerm/updateTargetingBid/toggleCampaign 等直写函数是否被批量/间接路径调用:未被路由暴露且无间接调用者→物理删除;仍被内部执行器调用→加 @internal 注释 + assertQueuedExecutionContext 运行时守卫(非执行器调用栈抛错)或移入 live-action-executor。executeLivePrimitive 对 ADJUST_BID/ADJUST_BUDGET 之外的 primitive 必抛 unsupported_real_write_primitive(已实锤 :279),补防回归断言其不静默成功。测试:非执行器上下文调用受守卫函数抛错;调用未支持 primitive 的 real 写抛 unsupported_real_write_primitive。
- 理由: 职责边界:~30 直写函数与 lx.js 客户端直写 API 是潜在越权面,需核栈后收敛。

### [m3-ads] M3-P2-19 — lx.js 客户端直写 API 标 @deprecated 或迁 admin/internal,注释禁止 UI 直调须经 Action Queue _(refactor)_
- files: apps/web-v2/src/api/lx.js
- 验收: lx.js 中 toggle/setBudget/setBid/update/remove 等直写 API 标 @deprecated 注释 '禁止 UI 直调,实体 mutation 须经 actionQueueApi.enqueue';或迁至 admin/internal 命名空间。测试:grep 业务页(非 admin)无对这些 deprecated 直写 API 的调用。
- 理由: 配合 M3-P2-18 前端侧收敛,防止绕过 Action Queue。

### [m3-ads] M3-P2-20 — StrategyLibrary 诚实化:去魔法数83、未实现入口移除/置灰、排序/视图加 handler 或移除 _(ux)_
- files: apps/web-v2/src/pages/StrategyLibrary.vue
- 验收: strategyCount(:101)去掉 ||83 魔法数兜底,无数据显示 0 或加载态;'我创建的'(:228)/'模板库'(:237)未实现前从左栏移除或置灰带 tooltip;排序(:251)/视图(:252)按钮加真实 handler 或移除;已 disabled 的模板库/导入/新建(:136-138)保持并核对 tooltip 上线时间。测试:无策略数据时 UI 不出现 83;排序/视图按钮要么有 @click 要么不渲染;未实现左栏项 disabled 或不存在。
- 理由: 魔法数83伪造规模、死按钮与未实现入口降低可信度(部分按钮已正确 disabled)。

### [m3-ads] M3-P2-21 — LxTab 工具栏死按钮统一 disabled+tooltip,优先实现前端 CSV 导出当前数据 _(feature)_
- files: apps/web-v2/src/pages/lx/tabs/LxTabTargeting.vue, apps/web-v2/src/pages/lx/tabs/LxTabAdGroups.vue, apps/web-v2/src/pages/lx/tabs/LxTabSearchTerms.vue
- 验收: 添加投放/CSV批量改/列配置/导出 等无 handler 按钮统一 disabled + '即将上线' tooltip;导出按钮优先实现纯前端 CSV 导出当前已加载表格数据。测试:无 handler 按钮均 disabled 且有 tooltip;点击导出生成含当前行数据的 CSV blob。
- 理由: 死控件群体验问题,CSV 导出可低成本兑现。

### [m3-ads] M3-P2-22 — SuggestionDrawer 死代码清理:portfolioGuess/muteStrategy/targetCampaign 降级 _(bug)_
- files: apps/web-v2/src/components/SuggestionDrawer.vue
- 验收: 删除死的 portfolioGuess 或落实 SKU/portfolio 真实匹配;muteStrategy 接后端静音端点回写策略状态(端点未就绪则按钮 disabled+tooltip,不本地伪装);targetCampaign 匹配失败给降级占位而非空/错值。测试:portfolioGuess 不再渲染无依据猜测;muteStrategy 调后端端点或 disabled;targetCampaign 无匹配时显示占位。
- 理由: 抽屉内 portfolio 猜测与 muteStrategy 本地伪装属诚实度问题。

### [m3-ads] M3-P2-23 — acceptSuggestion 落 next_eligible_at 并在 listSuggestions 过滤,兑现观察窗不重复触发;否则修正文案 _(bug)_
- files: apps/api/src/data-store-ads.mjs
- 验收: acceptSuggestion 落地 next_eligible_at=now+observation_window 并在 listSuggestions 中对未到期项过滤/标记;若本期不实现则删除/修正 '观察窗内不重复触发' 文案。测试:accept 后该 suggestion 在 next_eligible_at 前不出现在可触发列表;或文案不再承诺观察窗去重。
- 理由: observationWindow/cooldown 仅入库不消费,文案与行为不符。

### [m4] M4-P2-01 — markNotificationRead 归属校验 + 前端乐观更新回滚 _(bug)_
- files: apps/api/src/store-routes-monitor.mjs, apps/api/src/data-store-monitor.mjs, apps/web-v2/src/composables/useM4State.js
- 验收: markNotificationRead(data-store-monitor.mjs:2096)新增 storeId 参数,写前 SELECT(id+user_id+store_id)校验,不存在返回 404(store-routes-monitor.mjs:851 透传 404);前端 markRead 失败时从本地已读集合删除该 id 并回滚 unreadCount,不再吞 404;消费 n.link 做路由跳转。测试:(a)跨 store 的 notif id → 404、不被标记;(b)前端 markRead 失败 → unreadCount 回滚、本地已读移除。
- 理由: 实测 emitNotification 链路与多店,markNotificationRead 当前无 storeId/归属校验;前端无失败回滚。

### [m4] M4-P2-02 — 日报 alerts 计数去重(同事件 anomaly+notification 双写) _(bug)_
- files: apps/api/src/store-routes-monitor.mjs
- 验收: store-routes-monitor.mjs:294 alerts 计数按 relatedResourceType+relatedResourceId 去重(同一事件的 openAnomaly 与其 emitNotification 不重复计 2),或拆为两个独立指标。测试:构造一条跟卖事件(产生 1 anomaly + 1 notification 指向同一 relatedResourceId)→ alerts 计 1 非 2。
- 理由: 实测 294 alerts = openAnomalies.length + notifications + m2AlertEvents,同事件双写会重复计数。

### [m4] M4-P2-03 — SLABoard todayStats/range 口径统一 _(refactor)_
- files: apps/api/src/data-store-monitor.mjs, apps/web-v2/src/components/m4/SLABoard.vue, apps/web-v2/src/api/m4.js
- 验收: 统一 slaBoard 默认 range(后端 872 默认 '7d'、SLABoard.vue 与 m4.js 三处对齐为同一默认);todayStats 字段在前端展示层映射为随 range 变化的标题(rangeStats 语义),或后端字段更名同时保留兼容映射不破坏契约。测试:range='7d' 时 KPI 标题反映 7d 口径、字段值与后端 cutoff(873)一致;三处默认 range 一致。
- 理由: 实测后端 872 默认 '7d' 但命名 todayStats(892),与前端 today 默认存在口径矛盾。

### [m4] M4-P2-04 — recordRecoveryReply 状态守卫(必须已发送才可回复) _(bug)_
- files: apps/api/src/data-store-monitor.mjs
- 验收: recordRecoveryReply(1834)写前校验 cur.status∈{sent,marked_sent}(随 M4-P1-03 调整),否则返回 state_transition_forbidden;禁止未发先回污染 reviews.rating(1843)。测试:(a)对 status='draft' 的件 record-reply → forbidden、reviews.rating 不变;(b)对 marked_sent 的件 → 允许。
- 理由: 实测 1834-1843 无前置状态守卫,可在未发送时写回复并改 reviews.rating。

### [m4] M4-P2-05 — sourceMeta mock 判定逐维度独立化 + 核查 _(test)_
- files: apps/api/src/store-routes-monitor.mjs
- 验收: categoryRank/competitor price/rating、review trend snapshot 等维度的 mock 判定独立于 spapi/ads sync 标志;无真实采集源(底层 mulberry32 种子噪声生成)的维度恒 mock:true。新增测试逐维度断言:生成来源为伪随机的维度 sourceMeta.mock===true。
- 理由: 实测 categoryRank 底层伪随机却未标 mock;competitor/trend 维度疑似同类误标,需逐维度核查并独立判定。

### [m4] M4-P2-06 — ReviewList draftAppeal violationType 由 AI/用户驱动而非硬编码 _(bug)_
- files: apps/web-v2/src/pages/ReviewList.vue
- 验收: ReviewList.vue:61-79 draftAppeal 的 violationType 不再硬编码 'unrelated_to_product',改由 AI 分析字段或用户选择驱动;draftAppeal/draftRecovery 语义统一。测试(组件):选择不同 violationType 时传给后端的值随之变化、默认不写死单一值。
- 理由: 辩论实锤 ReviewList draftAppeal 硬编码 violationType,降低申诉质量与语义正确性。

### [cross] X-P2-01 — 统一真实写 env 名: gate 与 security 头/路由 status 同读单一 ADS_REAL_WRITES_ENABLED, 补布尔一致断言 _(refactor)_
- files: apps/api/src/security.mjs, apps/api/src/routes.mjs, apps/api/src/extended-routes.mjs, apps/api/src/integrations/ads-api/live-action-executor.mjs, .env.example
- 验收: security.mjs:60 / routes.mjs:23,26 / extended-routes.mjs:132 的 REAL_WRITES_ENABLED 与 gate 的 ADS_REAL_WRITES_ENABLED 收敛为单一 env 名。可写测试: 设单一 env=true → assert x-real-write-policy 与 gate envBool 同为真; =false → 同为假。
- 理由: 已核实 gate 读 ADS_REAL_WRITES_ENABLED(live-action-executor.mjs:39), 而 security 头/routes/.env.example 读 REAL_WRITES_ENABLED = 两个不同 env, UI 策略徽章与实际 gate 解耦, 双真相源。

### [cross] X-P2-02 — amazonResponse 落库前 token 脱敏: requestPayload/responsePayload 字段 allowlist 裁剪 + token 正则脱敏, 补 DB 行级断言 _(test)_
- files: apps/api/src/integrations/ads-api/live-action-executor.mjs, apps/api/src/data-store-ads.mjs, tests/integrations/ads-live-action-gate.test.mjs
- 验收: live-action-executor.mjs:201/236/270 的 amazonResponse 在 data-store-ads.mjs JSON.stringify 落库前做 token 正则脱敏(/Atzr\||Atza\||refresh_token/)与字段 allowlist 裁剪。可写测试: 真实写后查询 ad_action_runs.response_payload 列, assert.doesNotMatch(payload, /Atzr\||refresh_token/)。
- 理由: 现有测试仅断言 HTTP 响应 body 脱敏, 未断言 DB 行级落库脱敏; refresh/access token 可能原样进 response_payload 列。

### [cross] X-P2-03 — gate allowlist 键格式统一为 userId:storeId, 去裸 storeId 分支; 评估 per-store 真实写速率/总量上限防循环单条 execute 绕批量限制 _(refactor)_
- files: apps/api/src/integrations/ads-api/live-action-executor.mjs
- 验收: (1)assertRealWriteGate 的 store allowlist(:45-50)恒用 userId:storeId 键, 去掉 storeAllow.includes(storeId) 裸分支; (2)评估并(若本期纳入)加 per-store 真实写频率/总量上限, 循环单条 execute 累计超限熔断。可写测试: 仅裸 storeId 在 allowlist 而 userId:storeId 不在 → assert 拒绝; 单 store 短时间内 N+1 次真实写 → assert 第 N+1 次被速率上限拦截。
- 理由: 已核实 :45-50 同时支持裸 storeId 与 userId:storeId 两种放行口径易运维误配; assertRealWriteGate 无 per-store 频率/总量上限, 逐条单条 execute 可绕过 batch 禁令不变量。


## P3 (7)

### [workbench] W18 — 全局顶栏搜索框接全局检索（当前为死控件） _(feature)_
- files: apps/web-v2/src/layouts/DefaultLayout.vue
- 验收: 顶栏搜索框回车跳搜索结果页或下拉联想；当前无 @keyup/@change 事件的死控件须接事件。可写为：输入并回车 assert router.push 到搜索结果路由。
- 理由: 顶栏搜索框无事件绑定为无功能死控件，优先级最低，可在主链路修复后处理。

### [amazon-auth] AUTH-13 — 回调错误归一化为有限枚举 + 过期 state 清理任务:错误码限定 (state_expired/state_used/code_missing/lwa_rejected/invalid_oauth_state),前端按枚举显示中文指引;LWA 原始 message 只写审计不回显 URL;加定期清理过期 integration_oauth_states 行 _(ux)_
- files: apps/api/src/integrations/oauth-flow.mjs, apps/web-v2/src/pages/AmazonAuthCenter.vue, apps/api/src/integrations/scheduler.mjs
- 验收: (a) handleOAuthCallback catch 分支不再把 LWA 原始 message 截 120 字塞进 redirect query(:596),改为有限枚举 error code,原始 message 仅 appendAuditLog;(b) 前端按 error 枚举映射中文指引文案,未知码兜底通用文案;(c) lastResult 全量 JSON 收进折叠面板;(d) 新增清理任务删除 expires_at 已过期且 consumed 的 integration_oauth_states 行。可写测试:模拟 lwa_rejected 回调 → redirect query error 为枚举值且不含原始 LWA 文本。
- 理由: oauth-flow:596 把原始 LWA 报错回显到 URL 既泄露又不可读;过期 state 行无清理会无限增长。属体验/卫生项,P3。

### [m1] M1-016 — ListingOptimize loading 态锚点落空修复 + ListingWorkbenchPanel mock 文案诚实化 _(ux)_
- files: apps/web-v2/src/pages/ListingOptimize.vue, apps/web-v2/src/components/m1/ResearchBlock.vue
- 验收: 1) ListingOptimize anchor-bar(:113)在 workbench 未加载/loading 态 disabled+tooltip,或 anchor-bar 也 gated 于 workbench 存在。2) scrollToAnchor(:40)找不到 el 时短延迟(如 200ms)重试一次。3) ListingWorkbenchPanel'真实快照'文案改'商品档案(示例)',sourceMeta.mock=true 的数据隐藏或改名 Confidence。可测断言:loading 态点击 anchor 不报错且按钮 disabled;scrollToAnchor 对延迟挂载的 el 能成功滚动(重试生效)。
- 理由: 已核实 8 个锚点 DOM id(含 assets/compliance/preflight)全部存在且挂在已 mount 组件(撤回上轮'区块未渲染'P1 主张),仅 loading 态 anchor-bar 提前渲染致 scrollToAnchor 静默落空,降为 P3。

### [m2] M2-P3-01 — alert events 批量确认 + acknowledged boolean 统一 + ackBy _(ux)_
- files: apps/api/src/data-store-profit.mjs, apps/api/src/store-routes-profit.mjs, apps/web-v2/src/pages/CustomAlerts.vue
- 验收: ack 支持批量确认;acknowledged 统一为 boolean;ackAlertEvent 支持可选 ackBy body。测试:批量 ack 多条事件一次成功;返回 acknowledged 为 boolean。
- 理由: alert events 当前单条 ack、acknowledged 类型不统一、ackBy 硬编 'operator'(:2113)。

### [m3-ads] M3-P3-24 — LxTabSearchTerms negate 加轻确认/撤销 toast;promote 缺 cpc 时禁用避免异常出价进队 _(ux)_
- files: apps/web-v2/src/pages/lx/tabs/LxTabSearchTerms.vue
- 验收: 单条 negate(GOVERN_KEYWORD)加轻确认或可撤销 toast;promote 出价缺 cpc(undefined/0/NaN)时禁用 promote 按钮,避免零/异常出价入队。测试:cpc 缺失时 promote 按钮 disabled;negate 操作产生确认或撤销入口。
- 理由: 防止异常出价进队与误否定,低优体验项。

### [m4] M4-P3-01 — 行操作按钮防重复提交 + 单飞 promise 携带 params 签名 _(ux)_
- files: apps/web-v2/src/pages/MonitorAnomalies.vue, apps/web-v2/src/composables/useM4State.js
- 验收: MonitorAnomalies.vue 行操作按钮加 :loading/disabled 防重复提交、onResolve 空值统一处理;useM4State.js:133 _anomPromise 单飞键携带 params 签名(或 AbortController 取消旧请求),合并 MonitorAnomalies.vue:29/46 两处同源 watch,assignee 过滤加 debounce。测试:连续点击 resolve 仅触发一次请求;切换 assignee 过滤时旧请求不覆盖新结果。
- 理由: 辩论提出的竞态与重复提交风险,实测 useM4State 单飞键不带 params。归 P3 不阻塞核心修复。

### [m4] M4-P3-02 — 乐观更新用后端返回对象 + list 端点契约统一 _(refactor)_
- files: apps/web-v2/src/composables/useM4State.js, apps/web-v2/src/api/m4.js
- 验收: useM4State.js:676/1037 乐观更新用后端返回对象(patchRow)而非硬编码 'pushed' 字符串,失败回滚或重新 fetch 单条;m4.js:8-13 统一 list 端点返回 {items,summary?,total?} 并统一 unwrapFull,移除多重 ?? 兜底以暴露契约漂移。测试:返回结构不符约定时显式报错而非静默兜底;乐观更新失败后状态回滚。
- 理由: 辩论提出的契约漂移与硬编码乐观值问题,质量优化项,归 P3。

