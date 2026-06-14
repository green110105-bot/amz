# 功能域辩论证据: 横切关注: provider-mode/sourceMeta 真假边界, audit/revert 级联, 多租户隔离, 真实写入 gate, 前端 IA 一致性

## 清单梳理

I have all the evidence needed. Here is the domain inventory.

---

# 横切关注域清单：provider-mode/sourceMeta · audit/revert 级联 · 多租户隔离 · 真实写入 gate · 前端 IA 一致性

这是一个**横切域**——没有独立"页面集合"，而是渗透在多个模块的页面/路由/中间件中。下面按"五个关注点"逐项给出涉及的页面/tab/弹层、业务目的、数据来源、写入/队列语义,均附 file:line 证据。

## 1. provider-mode / sourceMeta 真假边界

**后端真值源** `apps/api/src/integrations/provider-mode.mjs`
- 单一开关 `DATA_PROVIDER_MODE = mock|real|hybrid`，默认 `hybrid`(provider-mode.mjs:12-15)。
- `mock`/`hybrid` 仅在**无 active 真实凭证**时才种 mock(`shouldSeedMock` 查 `store_credentials … status='active'`,provider-mode.mjs:24-35)；`real` 永不种。
- `listProviderStatus` 给 UI 徽章/`/status` 喂凭证态 + 最近 10 条 `sync_runs`(provider-mode.mjs:38-63)。

**sourceMode/sourceMeta 在 API 响应里的真假标注** `apps/api/src/extended-routes.mjs`
- 认证态(有 token 解析出 scope)→ DB 路径标 `sourceMode:'db'`；无 scope → `sourceMode:'mock'` 走 `sampleStore`。证据：listing diagnosis(extended-routes.mjs:82 vs 93)、review clusters(:108 三元)、competitor changes(:115 vs 118)。
- **dashboard 是唯一显式发 `sourceMeta` 的端点**：`{ source:'store-db', mock:false, realWritesEnabled: REAL_WRITES_ENABLED==='true' }`(extended-routes.mjs:131-132)；且**无 scope 时不 fallback**(只有 `if(scope)` 分支,:125-148)——符合 codex22claude.md:413 "保留未认证 mock fallback" 之外的 dashboard DB-backed 要求(:64,:405-406)。
- 安全中间件对被拦截请求**强制标 `sourceMode:'mock'`**(security.mjs:81)——拒绝响应永不冒充 real。

**安全不变量(codex22claude.md 第 4 节)**:#8 "M4 daily 必须 source-aware,mock/hybrid 不能伪装 `realDataOnly=true`"(:145)、#10 "授权完成前真实外部依赖只能 mock/sandbox/read-only"(:147)、前端口径 #530 "M4 daily 必须显示 sourceMeta"。

**边界缺口**：除 `/api/v1/dashboard` 外,绝大多数端点只给字符串 `sourceMode`,**不给结构化 `sourceMeta.mock`**；mock/db 判定**完全等价于"token 是否解析出 scope"**(resolveScope,extended-routes.mjs:21-29),与 `DATA_PROVIDER_MODE` 解耦——即 `real` 模式下若 token 失效仍会落到 `sampleStore` mock 路径。

## 2. audit / revert 级联

**统一审计表 + 级联派发** `apps/api/src/data-store.mjs`
- `audit_logs` 含 `reverted/reverted_at/revert_reason`(data-store.mjs:84-86)。
- `revertAuditLog(userId, storeId, id, reason)` 是级联核心(data-store.mjs:527-551)：先按 `action_type` **派发反向动作**——先试 M3 (`_revertM3AdsAction`,:536),失败再试 M4 (`_revertM4Action`,:542),最后才翻 `reverted=1`(:547),返回 `dispatchedInverse`(:549)。
- M3 反向派发器 `revertM3Action`(data-store-ads.mjs:3197-)是一张大 switch：`STRATEGY_TOGGLE` 反翻 enabled(:3205)、`STRATEGY_UPDATE` 用 `payload.previousValues` 逐字段还原(:3213)、`TIMELINE_ACCEPT/REVERT/REJECT` 还原 suggestion state(:3242-3265)、`ADD_NEGATIVE_KEYWORD` 删除新建负词(:3267)、`PROMOTE_TO_MANUAL` 删 targeting(:3275)。
- Action-queue 自有 revert：`revertActionQueueItem` 仅允许 `state==='executed'`(data-store-ads.mjs:2220-2239)，并**级联反 suggestion**(:2227 `revertSuggestion`)。

**前端页面**：`/audit` 审计中心 `pages/Audit.vue`(router/index.js:129)
- 业务目的：所有写操作的统一回滚入口；"7 天窗口可回滚"。
- 数据来源:**hybrid(混合)**——`logs` = LocalStorage 真实记录 + `mockAuditLogs` 去重合并(Audit.vue:16-19,import :8)。这是 IA 不一致点：**不读后端 `/audit` 列表 API**。
- 写入语义:revert 调 `localStore.revertAuditLog(log.id,'user_revert')`(Audit.vue:59),后者**真打后端反向 API** `storeApi.revertAuditLog`(useLocalStore.js:175),同时本地乐观改 mock 行(:61-63)。

**写操作统一通道** `composables/useAudit.js`
- `submit()` 所有写动作必经审计中心(useAudit.js:8-61),走 `auditApi.mockExecute`(audit.js:4 → `/api/v1/audit/mock-execute`),强制 `payload.requiresRealStoreWrite:false`(useAudit.js:18)。成功标 `status:'mock_executed'/verdict:'pending'`(:35-36),否则提示"已阻断:不在白名单"(:55)。

**全量 scope revert 端点**:`POST /api/v1/audit/{auditId}/revert` 在 full-scope 路由标 `requiresRealStoreWrite:true`(full-scope-routes.mjs:230)——与 useAudit 的 `false` 形成两条不同语义路径。

## 3. 多租户隔离

**网关层(声明式)** `apps/api/src/security.mjs`
- `applyApiSecurity` 仅对 `/api/` 生效(security.mjs:19)。`REQUIRE_TENANT_HEADER==='true'` 时缺 `x-tenant-id` 返 401(:22-24),否则默认 `tenant-demo`(:26)。
- 调 `evaluateTenantAccess`(governance-engine)做 actor/resource 租户 + RBAC 校验,拒绝返 403(:30-44)。actor tenant 来自 `x-tenant-id`,resource tenant 来自 `x-resource-tenant-id`(:37),role/permissions 来自 header(:33-34)。
- 速率限制按 `tenantId:method:path:window` 分桶(:69-77)。
- **声明性弱点**:role 默认 `'admin'`(:33),权限完全由客户端 header 自报,无服务端身份绑定。

**数据层(强制)**:真隔离在 SQL `WHERE user_id=? AND store_id=?`——见 live-action-executor 每条 lookup(:106,:126,:135)与所有 UPDATE(:193,:227,:261);audit 查询同样按 `(user_id,store_id)`(data-store.mjs:90,128)。`resolveScope` 从 Bearer token 解 `userId`,store 来自 `x-store-id` 或默认(extended-routes.mjs:21-29)。schema 注释:"每用户多店铺;…按 (user_id,store_id) 隔离"(data-store.mjs:4)。
- **跨店越权防护**:`revertAuditLog` 校验 `r.store_id !== storeId → return null`(data-store.mjs:531)。

无专门"租户管理"前端页;隔离是后端横切。

## 4. 真实写入 gate

**唯一真实外部写路径** `apps/api/src/integrations/ads-api/live-action-executor.mjs`
- `assertRealWriteGate`(:38-54)六重门:`ADS_REAL_WRITES_ENABLED`(:39)、`!ADS_API_MOCK`(:40)、`body.confirmRealWrite===true`(:41)、`body.riskAccepted===true`(:42)、primitive 白名单(默认仅 `ADJUST_BID`,:34/:43)、store/profile 允许名单(:45-53)。
- `assertChangeLimit` 每动作变更上限:budget 默认 5%、bid 默认 10%(:73-76)。
- `validateExecutableItem`:item 必须未删/未执行/未被 guardrail 阻断/状态 ∈ {queued,approved,reverted}(:147-153)。
- `resolveProfile`:必须有 profileId + active refreshToken(:138-145)。
- 真正 PUT 到 Amazon(`adsCall`,:184/:218/:252)→ `assertAmazonMutationOk`(:86-98)→ 写影子表 → `recordActionQueueExternalResult(status:'real_write_success', dryRun:false, auditActionType:'ACTION_QUEUE_REAL_WRITE')`(:307-315);失败也记审计 `real_write_failed` 但 `markExecuted:false`(:316-327)。
- `previewRealAdsWriteGate`(:330-333)供前端预演 gate。

**路由 gate** `apps/api/src/store-routes-ads.mjs`
- 单条 execute:`body.realWriteEnabled===true` 才走真实 executor(:394-395),否则 `executeActionQueueItem`(mock/dry-run,:398)。
- **批量真实写被硬禁**:`execute-batch` 见 `realWriteEnabled===true` 直接 throw(:371-373);单条路由内同样的批量保护(对应不变量 #4 "批量真实写入仍禁止")。

**安全头**:`x-real-write-policy = 'requires-explicit-audit-approval' | 'blocked'`(security.mjs:60)。

**安全不变量(codex22claude.md:138-141)**:写 Ads 前必进 `ad_action_queue`、默认 `dryRun=1/auditRequired=1/guardrail='needs_review'`、无 profileId/审批/风险确认/gate 不允许真写、真实 executor 只逐条。

## 5. 前端 IA 一致性

**主导航专属页**(`group:'main'`,router/index.js:124-130)
- `/audit` 审计中心(:129)——见上,数据 hybrid 本地态。
- `/settings/amazon-auth` Amazon 授权接入 `AmazonAuthCenter.vue`(:126)——口径要求"不能伪装授权成功,必须显示缺 credentials/profileId/diagnostics 状态"(codex22claude.md:529)。
- `/settings`(:130)、`/notifications`(:125)。

**LX 子页队列语义** `composables/useLxState.js`
- `enqueueLxManualAction`(:30-63)是 LX 全部写动作的唯一出口(被 :139–:663 共 ~23 处复用)。强制 `dryRun:true, auditRequired:true`(:50-51)、`guardrail.status:'needs_review' reasons:['manual_lx_write_requires_action_queue']`(:53-56)、`rollbackPlan.needsManualReview:true`(:57),并提示 "Added to Action Queue. Approval and dry-run are required before any write."(:61)——契合口径 #528 "广告写动作不本地乐观改实体,显示已进队列"。

**IA 不一致 / 风险点**
- **同名重复挂载**:`/ads/lx` 下 `sp/sb/sd/st` 四条路由全部复用 `LxAllCampaigns.vue`(router:67-70),`purchased/op-log/download` 复用 `LxStubPage.vue`(:71-73)——导航多入口但组件未分化。
- **旧/新双轨**:策略库存在 `/ads/strategies`(新 ⭐,:54)与 `/ads/playbook`(旧 42 条,:85)并存;`/listings/ab` 与重定向自 `/listings/experiments`(:12-14);`/m4/daily-report → /m4/reports/daily`(:104)等大量兼容 redirect。
- **审计中心数据双源**:`Audit.vue` 把后端 revert API 调用与 LocalStorage + `mockAuditLogs` 混合(Audit.vue:16-19,59-63),与 dashboard 的纯 DB-backed 口径不一致。
- 路由守卫仅查 localStorage token 存在性(router:142-149),不校验 tenant/role(隔离全靠后端)。

---

## 关键证据文件索引
- `apps/api/src/integrations/provider-mode.mjs:12-63` — mode 真值源 + seed 判定 + status
- `apps/api/src/security.mjs:19-94` — 租户/RBAC/速率网关、real-write-policy 头、拒绝响应强标 mock
- `apps/api/src/extended-routes.mjs:21-29,82-148` — resolveScope + sourceMode/sourceMeta 真假边界(dashboard 唯一发 sourceMeta)
- `apps/api/src/integrations/ads-api/live-action-executor.mjs:38-54,69-78,287-333` — 真实写入六重 gate + 变更上限 + 审计落库
- `apps/api/src/store-routes-ads.mjs:369-406` — 队列 execute/revert 路由 + 批量真写硬禁
- `apps/api/src/data-store.mjs:84-90,527-551` — audit 表 + revert 级联派发(M3→M4→翻位)
- `apps/api/src/data-store-ads.mjs:2220-2239,3197-3283` — queue revert + M3 反向动作 switch
- `apps/web-v2/src/composables/useAudit.js:8-61` — 写动作统一审计通道(requiresRealStoreWrite:false)
- `apps/web-v2/src/composables/useLxState.js:30-63` — LX 写动作统一入队(dryRun/auditRequired/needs_review)
- `apps/web-v2/src/pages/Audit.vue:16-19,47-66` — 审计中心 hybrid 数据 + revert 调后端
- `apps/web-v2/src/router/index.js:54-99,124-130` — IA:strategies/playbook 双轨、LX 同名复用、main 组(audit/auth/settings)
- `codex22claude.md:134-147,395-413,475-531` — 安全不变量、dashboard DB-backed、M4 source-aware、前端交互口径

## 第 1 轮

# 第1轮辩论记录 — 横切关注: provider-mode/sourceMeta 真假边界 · audit/revert 级联 · 多租户隔离 · 真实写入 gate · 前端 IA 一致性

## 主持人代码核验结论
本轮 4 位角色给出的核心代码证据已逐条核验,全部属实(非读注释臆断):
- `data-store.mjs:534-547` revertAuditLog 确实先算出 `dispatched`,但第547行**无条件** `UPDATE audit_logs SET reverted=1, status='reverted'`,`dispatchedInverse` 仅塞进返回值(:549)不影响落库。
- `data-store-ads.mjs:3382-3384` revertM3Action switch 的 `default: return false`,**确无 `ACTION_QUEUE_REAL_WRITE` 分支**。
- `data-store-ads.mjs:2229-2241` revertActionQueueItem 仅 `state='reverted'` + 插入 `dry_run=1` 硬编码 run,`response_payload` 写死 `{reverted:true, method:...}`,**无 lx_* 反写、无 adsCall 反向 PUT**。
- `useAudit.js:16,23,47` 前端审计统一路径 `requiresRealStoreWrite:false` 硬编码、恒走 `mockExecute`、成功文案恒为"已 mock 执行,可在审计中心回滚"。
- `security.mjs:26,33,37` 租户/RBAC 全 header 驱动,默认 `actorTenantId='tenant-demo'`、`role='admin'`、resource tenant 取客户端头;`security.mjs:60` 策略头读 `REAL_WRITES_ENABLED`,而 `live-action-executor.mjs:39` gate 读 `ADS_REAL_WRITES_ENABLED` — **两个不同 env,策略声明与实际门禁脱节**。
- `live-action-executor.mjs:38-54` assertRealWriteGate **不检查 providerMode**;`provider-mode.mjs:32-34` shouldSeedMock catch **fail-open return true**。

## 各角色主张与交锋
**产品经理A(增长/信任主线)**: 主打"假回滚烧广告费"(P0)与"removeUserStore 物理删 audit 抹证据"(P2),并把 hybrid 默认模式定性为对真实卖家不友好。强调卖家看到绿色"已撤销"会误以为钱救回来了。

**产品经理B(风险/合规)**: 与A在"假回滚"P0上**完全共振**,并补刀两条独立 P0:(1) `x-store-id` 无 ownership 校验,两套身份系统(token vs x-tenant-id)解耦=隔离形同虚设;(2) 提出"**逐条单条 execute 等效绕过批量真写禁令(不变量#4)**"的攻击路径。预先立判据:任何"有 gate/audit/revert"乐观结论必须接受三反问(a 能否绕过 b payload 是否记录真实副作用 c revert 是否真回滚 Amazon)。

**资深开发(契约断裂)**: 立靶三处系统性契约断裂——revert 对真实写是空操作、`sourceMode='db'` 被错误等价为"真实 Amazon 数据"、tenant 鉴权与 token 身份解耦。新增视角:**真实写 executor 从正规 UI 完全不可达**(无任何组件发送 `confirmRealWrite/riskAccepted`),形成"死契约"——UI 用"真写=开启"徽章暗示有能力,实际无按钮可触发。

**测试工程师(可验证性)**: 把每条结论翻译成可运行失败断言(如 real_write→revert→断言 lx_targetings.bid===previousBid 当前必失败),并独家发现:(1) sourceMeta 在 real 模式下被**反向强制标 mock**(data-store-ads.mjs:878,953),既有 false-negative;(2) gate allowlist **双键格式(裸 storeId vs userId:storeId)混用**易配错;(3) shouldSeedMock fail-open;(4) audit payload 中 `amazonResponse` 原样落库,token 脱敏路径未覆盖。

## 交锋点 / 被质疑的观点
- **revert 严重度**: A/B/开发/测试四方在"假回滚=P0"上无分歧,这是本轮最强共识,无人替现状辩护。
- **x-store-id 写污染严重度分歧**: 开发定 P1(攻击者 user_id + 他人 store_id 可建行污染命名空间 + audit 归属错乱),并预判"有人会认为读不到他人数据故只是 P2 数据卫生问题"。此为本轮唯一被显式标记的潜在严重度分歧。
- **被预先反驳的乐观立场**: B/开发/测试三方均预设"任何主张安全不变量已落地者"为反驳对象,要求可运行断言证伪。本轮无人提出乐观立场,该靶位暂空置但带入后续轮次。
- **真实写 UI 可达性的定性分歧**: 开发提出二选一(刻意保守 vs 未完成死契约),A/B 倾向"应能安全真写但需双确认",尚未对齐。

- 共识: 假回滚 P0 闭环断裂(四方一致): 真实 Amazon 写入(ACTION_QUEUE_REAL_WRITE)后,revertM3Action 无对应 case 落 default return false,而 revertAuditLog 仍无条件标 reverted=1;revertActionQueueItem 仅翻状态机+dry_run=1,无 lx_* 反写、无反向 adsCall。Amazon 侧出价/预算不变,审计/UI 却显示已回滚,直接误导运营并烧卖家广告费。; 多租户隔离形同虚设(四方一致): security.mjs 的 tenant/RBAC 完全 header 驱动(默认 tenant-demo/admin/resource 取客户端头),与真正做隔离的 token->user->store(SQL user_id=?)两套身份系统从不交叉校验;前端从不发 x-tenant-id,该层在正常流量零触发,给人'有 RBAC'的假象。; 真假数据边界未透出前端(四方一致): hybrid 为默认模式,后端部分端点(store-routes-ads.mjs:213)已产出 sourceMeta 但前端 useM1/useM4/useAdsState 0 消费;sourceMode='db' 被错误等价为'真实 Amazon 数据',无行级 origin 标记,违反安全不变量#8。; 前端审计统一路径是 mock-only 死契约: useAudit.submit 硬编码 requiresRealStoreWrite:false 恒走 mockExecute,真实写 audit 另起于后端 recordActionQueueExternalResult,两条审计流未在同一视图合并,'可在审计中心回滚'文案对真实写入是误导。; 真实写 gate 与 provider-mode 解耦: assertRealWriteGate 不检查 DATA_PROVIDER_MODE,mock/hybrid 沙盒态下只要 env+body 齐备即可真打 Amazon,打破'mock 是绝对安全沙盒'的卖家心智。; env 命名不一致: 真实写 gate 读 ADS_REAL_WRITES_ENABLED,而 security 响应头 x-real-write-policy 读 REAL_WRITES_ENABLED,对外策略声明与实际门禁可不一致。
- 分歧: x-store-id 写路径污染(攻击者 user_id + 他人 store_id 建行)的严重度: 资深开发定 P1(命名空间污染 + audit 归属错乱),预判反方认为'读不到他人数据故仅 P2 数据卫生问题'。需对齐对审计完整性的重视程度后定级。; 真实写 gate 当前从正规 UI 不可达的性质: 是'刻意的安全保守'(则前端应移除'真写=开启'误导徽章,统一显示仅干跑/审计) 还是'未完成的死契约'(则应补全双确认链路打通 confirmRealWrite/riskAccepted)。开发主张二选一,A/B 倾向后者但未定。; sourceMode 二值('db'/'mock')是否够用: 开发主张需三态(real/mock-seeded/hybrid-overlay)+行级 origin,但承认会扩散到所有路由与前端徽章,成本不小,是否本期必做未定。; hybrid 作为生产默认是否合适: A 主张生产默认应改 real、仅 dev 用 hybrid,因混合数据违反不变量#8 精神;尚待运营/合规视角(后续轮次)评估。
- 决策: (主持人裁定,尊重安全不变量) 假回滚 P0 必修: revertAuditLog 在 dispatchedInverse=false 且 action_type 属真实写白名单(ACTION_QUEUE_REAL_WRITE 等)时,禁止静默置 reverted=1,必须返回 needsManualReversal/409 status='revert_failed';前端据此渲染红色阻断态'本地已标记,Amazon 端未自动回滚,需人工处理'。不得把真实副作用伪装成可逆。; (裁定) 真实写 gate 必须增加 provider-mode 守卫: assertRealWriteGate 增加 if(!isRealMode()) throw 'real_write_requires_real_provider_mode'。无真实凭证/非 real 模式时严禁真打 Amazon,符合'无凭证不得伪装 real'不变量。; (裁定) sourceMeta.mock 不得为常量: 必须由 store_credentials active 状态 + 行级 origin 动态派生;real+active 凭证下创建对象 source 不得标 mock。security 错误响应不应携带 sourceMode(改用独立 securityMode 字段),避免污染全局真假徽章。; (裁定) 统一真实写 env 名: gate 与 security 头读同一个 ADS_REAL_WRITES_ENABLED,消除策略声明与门禁脱节。; (裁定) shouldSeedMock catch 必须 fail-closed: DB 查询失败 return false 并告警,不得默认播种 mock 污染真实店铺视图。

## 第 2 轮

# 第2轮辩论记录 · 横切关注(真假边界/audit-revert/多租户/真写gate/前端IA)

## 本轮主题升级
第1轮把"假回滚""mock-only 死契约""x-store-id 零校验"定为**后端结论**。第2轮四方一致把这些**钉到前端像素与 toast 文案**, 并实证升级:谎言不是后端被动遗漏, 而是**前端主动制造**。

## 各角色核心主张

**产品经理A(增长/信任视角)**: 唯一拷问——"卖家点回滚/真实写/查真假数据三个按钮, 拿到的业务结果与界面承诺差多少"。主张:
- 假回滚是**后端+前端双断裂**, 仅修后端不改 Audit.vue 乐观更新契约则 P0 依旧。
- x-store-id 污染从增长视角应 P1(而非预判 P2):审计归属错乱会让"本月已挽回 ¥X"(Audit.vue:97)计入错误租户, 直接污染对客户的 ROI 续费话术——**商业可信度**问题。
- DefaultLayout 顶栏"Mock 数据已加载"是写死常量徽章, 真实接店卖家在生产永远看到"Mock", 当场击穿托管信任, 本身即 P1, 与 hybrid 之争无关。

**产品经理B(风险/合规/真实性视角)**: "只看系统对运营说了什么谎"。主张:
- 把假回滚定性从"前端没消费 dispatchedInverse"升级为"**UI 层主动伪造回滚成功态**"(Audit.vue:59 连 await 都没有, fire-and-forget)。
- x-store-id 锁 P1 不下调:removeUserStore(data-store.mjs:437)对 audit_logs **物理 DELETE**, 攻击者用自己 token+伪造 store_id 落的 REAL_WRITE 审计可被己方删店物理抹除, 破坏"真实写留痕不可篡改"不变量。
- security.mjs:81 securityJson 给所有安全错误注入 sourceMode:'mock', 污染前端真假徽章。

**资深开发(工程可行性/数据契约视角)**:
- 三层叠加实证假回滚:store-routes 恒200忽略 dispatchedInverse → data-store.mjs:547 无条件 reverted=1 → revertM3Action default:return false(3382)。
- **纠正第1轮事实错误**:"前端0消费 sourceMeta"为假, 实测13文件消费; 但真相更糟——消费方式是 `s.sourceMeta?.freshness || 'mock seed'`, real 数据若不带字段被**默认渲染成 mock seed**, 把真实污蔑成假, 反向违背不变量#8。缺省值有毒。

**测试工程师(可验证性/false-positive视角)**:
- **抓出第1轮两处过度归罪/方向错误**:(1)"0消费 sourceMeta"是 false-positive; (2)M4 真假边界方向相反——dailySourceMetaFor(store-routes-monitor.mjs:103-108)`real=mode==='real'&&hasSuccessfulSync`, hybrid(默认)下 mode!=='real' 恒 false → **真实 sync 已覆盖的数据仍被误标 mock:true**, 是对真实数据的 false-positive 误标, 第1轮只抓了"db 被当 real"一半。
- 揭露**522测试全绿与 P0 共存**的根因:m3-button-level.test.mjs 仅对有 case 的类型断言 dispatchedInverse===true, 无任何对 ACTION_QUEUE_REAL_WRITE 断言 false 的测试 → false-negative 测试套件。

## 交锋点
1. **x-store-id 定级**:A/B/开发主张 P1(审计归属=商业可信度+留痕可被物理删除); 测试承认"读侧由 user_id 隔离不泄露他人数据故非 P0", 但写侧命名空间污染+审计完整性支持 P1。预判方"仅 P2 数据卫生"未到场正面交锋——**四方实质已对齐 P1**。
2. **乐观更新范式**:A 从增长侧本能想保 mock 演示流畅度, 但承认对真实写=说谎; 开发/B/测试主张真实副作用动作强制 await+悲观渲染。倾向"双契约"(可逆 mock 允许乐观 / 真实写强制悲观)。
3. **realWriteEnabled 字段**:测试精确化为"透出的是死常量(data-store-ads.mjs:871/878/953/1303 硬编码 false)比不透出更危险, 给运营虚假确定性"。

## 被反驳/修正的观点
- 第1轮"前端 useM1/useM4/useAdsState 0 消费 sourceMeta" → 被开发+测试双双证伪, 实为"消费了有毒缺省值的字段"。
- 第1轮"hybrid 下 db 被等价为 real" → 被测试修正为双向误报, 主误报方向反而是"真实数据被误标 mock"。

## 已代码复核确认的硬证据(本轮主持人复验)
- Audit.vue:59-65 fire-and-forget + catch{} 吞错 + 恒 success 文案"反向 API 调用 + 审计记录已持久化"——已读取确认。
- data-store.mjs:547 无条件 `UPDATE audit_logs SET reverted=1...status='reverted'`, dispatched 仅塞入 out.dispatchedInverse(549)无人读——已确认。
- data-store-ads.mjs:3382 revertM3Action default:return false, 无 ACTION_QUEUE_REAL_WRITE case——已确认。
- live-action-executor.mjs:38-54 assertRealWriteGate 无 isRealMode() 守卫——已确认。
- provider-mode.mjs:13 默认 hybrid; :32-34 shouldSeedMock catch return true (fail-open)——已确认。
- security.mjs:60 读 REAL_WRITES_ENABLED vs gate 读 ADS_REAL_WRITES_ENABLED(env 分裂); :81 securityJson 注入 sourceMode:'mock'——已确认。

- 共识: 假回滚是后端+前端三层断裂的 P0:revertM3Action 对 ACTION_QUEUE_REAL_WRITE 落 default:return false(data-store-ads.mjs:3382), revertAuditLog 仍无条件 UPDATE reverted=1(data-store.mjs:547), 前端 Audit.vue:59-65 fire-and-forget+catch吞错+恒弹绿色'已回滚(反向API调用)', 三层叠加=Amazon端纹丝不动却显示成功。修复必须前后端同改, 仅修后端不改前端乐观更新契约 P0 依旧成立。; 真实写 gate assertRealWriteGate(live-action-executor.mjs:38-54)缺 isRealMode() 守卫是 P0:mock/hybrid 沙盒态下只要 env+confirmRealWrite+riskAccepted 齐备即可真打 Amazon, 破坏'mock=绝对安全沙盒'心智, 违反'无凭证/非real模式不得真实写'安全不变量。; useAudit.submit(useAudit.js:16/23/47)硬编码 requiresRealStoreWrite:false + 恒走 mockExecute + toast'可在审计中心回滚', 与真实写审计(recordActionQueueExternalResult)两条流从不交叉, '统一审计中心'是假象。真实写在正规 UI 物理不可达。; sourceMeta 消费契约缺省值有毒:前端 `sourceMeta?.freshness || 'mock seed'`(SuggestionCard.vue:45, AdsHub.vue:170)使 real 数据缺字段时被误渲染为'mock seed', 把真实污蔑成假, 反向违背不变量#8(真假可辨)。第1轮'0消费'结论被证伪。; DefaultLayout 顶栏'Mock 数据已加载'是写死常量徽章(不读 providerMode/sourceMeta), 真实接店卖家在生产永远看到'Mock 数据', 击穿托管信任, 定 P1。; shouldSeedMock(provider-mode.mjs:32-34)catch return true 是 fail-open:DB 抖动/迁移期会向真实店铺注入 mock 种子污染真实视图, 应改 fail-closed return false。; security.mjs:81 securityJson 给所有安全错误响应注入 sourceMode:'mock', 污染前端全局真假徽章, 应改用独立 securityMode 字段。; M4 真假判定存在对真实数据的 false-positive 误标:dailySourceMetaFor(store-routes-monitor.mjs:103-108)real=mode==='real'&&hasSuccessfulSync, hybrid 默认下真实 sync 已覆盖的数据仍被标 mock:true, realDataOnly 过滤器在生产默认下永不为真。; env 命名分裂:gate 读 ADS_REAL_WRITES_ENABLED(live-action-executor.mjs:39) vs 对外策略头 x-real-write-policy 读 REAL_WRITES_ENABLED(security.mjs:60), 对外声明与实际门禁可矛盾, 应统一单一 env。; 522 测试全绿与 P0 共存的根因:m3-button-level.test.mjs 缺对 ACTION_QUEUE_REAL_WRITE 断言 dispatchedInverse===false 的回归测试, 是 false-negative 套件。
- 分歧: x-store-id 写路径 ownership 缺失的定级:A/B/开发坚持 P1(审计归属错乱污染ROI汇报 + removeUserStore物理删audit_logs破坏不可篡改留痕 + 命名空间污染), 预判中'读不到他人数据故仅 P2 数据卫生'方未正面到场。四方实质倾向 P1, 但需在'审计完整性=商业可信度'前提上正式对齐后定级。; 前端乐观更新是否作为全站写范式整体推翻:A 从增长侧想保留 mock 演示流畅度, 主张'可逆mock允许乐观/真实写强制await悲观'双契约; 开发/B/测试更倾向真实副作用一律悲观渲染。双契约会增加前端复杂度, 改造面需开发评估。; 真实写能力对正规 UI 该不该可达:开发倾向'未完成死契约, 应补全 confirmRealWrite/riskAccepted 双确认链路'; B 倾向'若本期纯审计则清掉所有真写徽章误导文案'。这是产品决策, 本期必须拍。; '已挽回 ¥X'增长指标对外续费话术能否使用:A 倾向必须打'模拟/预估'水印(真实写未跑通前所有 saving 是 mock 推演), 但预期销售侧会反对削弱卖点, 需运营/合规拉齐。; security.mjs header-RBAC 定性:是遗留实验件(应删, 否则持续误导合规审计'有多租户' + sourceMode污染)还是计划骨架(必须与 token->user 打通)——架构 owner 未拍板, B/开发主张拍板前先补 x-store-id ownership 断言止血。
- 决策: P0-假回滚双端修复:后端 revertAuditLog 当 action_type∈真实写白名单(ACTION_QUEUE_REAL_WRITE)且 dispatched===false 时, 禁止置 reverted=1, 返回 409 status='revert_failed'/needsManualReversal=true; 路由据此返回非200。前端 Audit.vue revert() 必须 await 并读 dispatchedInverse, false 时渲染红色阻断态'本地已标记, Amazon端未自动回滚, 需人工处理', 禁绿色成功文案, 移除 catch{} 吞错; useLocalStore.revertAuditLog 移除 await 前置真。; P0-真写gate增 provider-mode 守卫:assertRealWriteGate 首行加 if(!isRealMode()) throw 'real_write_requires_real_provider_mode', 确保 mock/hybrid 沙盒态绝不真打 Amazon, 落实安全不变量。; P0-补回归测试堵 false-negative:新增断言——given action_type='ACTION_QUEUE_REAL_WRITE' 的 audit, when revert, then dispatchedInverse===false 且 audit 行 reverted 仍为 0; given DATA_PROVIDER_MODE=mock+全 env/body 齐备, when previewRealAdsWriteGate, then 必 throw。; P1-sourceMeta 缺省值改非有毒:前端缺省由 'mock seed' 改为显式 'unknown'(警示橙); 后端 deriveSource 由 real+active 凭证+行级 origin 动态派生, real 数据不得标 mock; realWriteEnabled 必须由 isRealMode()+active凭证+ADS_REAL_WRITES_ENABLED 派生, 禁死常量。; P1-顶栏徽章动态化:DefaultLayout 'Mock数据'徽章改为从 /provider/status 派生(real+active→绿'真实数据', mock→蓝'Mock沙盒', hybrid→橙'混合含mock残留'); '真实写入'状态读后端实际 gate 而非前端常量。; P1-shouldSeedMock 改 fail-closed:catch 改 return false + console.error 告警, 无法确认无凭证时绝不播种 mock。; P1-security 错误响应去污染:securityJson 改用独立 securityMode 字段, 不再注入 sourceMode:'mock'。; P2-env 统一:gate 与对外策略头/status 统一读单一 ADS_REAL_WRITES_ENABLED, 消除声明-门禁脱节。

## 第 3 轮

## 第3/10轮 — 横切关注(provider-mode真假边界 / audit-revert级联 / 多租户隔离 / 真实写gate / 前端IA一致性)

本轮四角色高度收敛于"系统当前=草稿生成器+假执行",并把前两轮的孤立bug升级为**系统性范式问题**。主持人已逐条核对代码,以下结论均经源码验证。

### 一、假回滚:从"三层"升级为"四层断裂",且经核为"前端单方面毁约"
- **资深开发**最关键的精确化:真相**确实在 HTTP 响应里**——`revertAuditLog` 计算 `out.dispatchedInverse=dispatched`(data-store.mjs:549)且路由 `return json(log)` 原样200透传,问题纯粹是 `Audit.vue:59` 既不 await 也不读该字段。修复成本因此**低于**"三层全改"的判断:后端对 real-write+dispatched===false 返409,前端读字段即可。
- **测试工程师**给出四层精确定位:(L1)`Audit.vue:61-64` await前乐观翻绿+恒绿文案;(L2)`useLocalStore.revertAuditLog` await(175)前先置 `log.reverted=true`、catch仅console.warn;(L3)路由200透传;(L4)`data-store.mjs:547` 无条件 `UPDATE reverted=1`。**已核实**:`_revertM3AdsAction` 的 switch(终于 data-store-ads.mjs:3382 `default:return false`)结构上根本不存在 `ACTION_QUEUE_REAL_WRITE` case,而审计行 actionType 恰写死为它 → **每条真实写回滚100%必假,非偶发**。
- **测试工程师**最有杀伤力的发现:`tests/qa/m3-button-level.test.mjs` 的 M3-audit-07(1518)/M3-cross-03(1542)**正把假回滚断言为"reverted===true且idempotent"**——这不是"忘加断言",是"已有断言锁死错误契约",修复后这些用例会变红需同步改测。**产品经理B**补充第四层证据(路由层无降级判断,store-routes.mjs:159-161)。
- 定级:四方一致 **P0**。

### 二、真实写gate缺 isRealMode 守卫 — "测试反向背书"铁证
- **测试工程师**提供活体证据:`tests/integrations/ads-live-action-gate.test.mjs:107-127` 设 `ADS_API_MOCK=false + ADS_REAL_WRITES_ENABLED=true` 但**从不设 DATA_PROVIDER_MODE**(默认hybrid),却断言真实写Amazon成功(status===200,/sp/keywords PUT命中)。即**CI绿灯正在把"hybrid沙盒态真打Amazon"固化为期望行为**。
- **已核实** `assertRealWriteGate`(live-action-executor.mjs:38-54)整段无 `isRealMode()` 检查。这直接违反项目安全不变量"真实Amazon无凭证时不得伪装real"的姊妹约束"非real模式不得真实写"。
- **产品经理A/B**从运营心智补强:对外宣传"Mock=绝对安全沙盒"与此gap正面矛盾,误配env会让卖家亏真钱。
- 定级:四方一致 **P0**。交锋点(未决):修复点应在 gate 首行 throw,还是 mock/hybrid 路由层物理404。测试+产品B倾向**404硬隔离**(可断言"路由不存在"比"断言异常消息"更稳,且杜绝循环单条execute绕批量限制),开发待对齐。

### 三、useAudit 死契约 = 产品形态根问题(本轮最硬决策点)
- **已核实** `useAudit.submit` 硬编码 `requiresRealStoreWrite:false`(:16)、恒走 `mockExecute`(:23)、toast"可在审计中心回滚"(:47);`api/audit.js` 仅导出 mockExecute,真实写HTTP端点在前端**物理不可暴露**。
- 三方共识:正规UI所有写操作只产生mock审计且承诺可回滚→回滚到Audit.vue即假回滚 → **闭环欺骗**。"统一审计中心+一键省时"卖点对真实写不可达。
- 交锋:**B方案(产品B/A倾向)** 承认纯mock现状,清掉所有"已执行/已挽回/可回滚"误导文案降级为"模拟/草稿";**开发方案** 补全 confirmRealWrite/riskAccepted 双确认链路+暴露端点。**开发明确警告:当前半成品状态(有真写徽章却无真写触点)最危险。** 此决策决定下方所有文案/徽章修复方向,必须本轮拍。

### 四、"本月已挽回¥X" — 产品经理A 从话术问题升级为业务逻辑bug
- **已核实** `Audit.vue:37` `reduce((s,l)=>s+(l.monthlySaving||0),0)` 把正向saving与负向投入(mock种子中 -1500增预算、-800跟价回滚)**净加**,输出语义错乱数字;源头是 mockExecute 的事前预估,Amazon端从未发生。
- A 主张拆 P0(逻辑求和错误)+ 合规话术单独立项;**证伪**了上一轮仅作为"打水印"carry的弱处理。

### 五、poison-default 污染面被严重低估(产品经理B 证伪)
- **B 证伪上一轮"仅2处"**:实际≥9处——ReasonChain.vue:8、DecisionCard.vue:35、AdsActions.vue:54、Workbench.vue:221、SuggestionDrawer.vue:247-248、GenerationBlock.vue:178、m1.js:202/214,加 SuggestionCard.vue:45、AdsHub.vue:171。改造面=7组件+api层,非2行。**资深开发**证实 SuggestionCard.vue:45 确为 `|| 'mock seed'`,**彻底证伪第1轮"sourceMeta 0消费"**。real数据缺freshness字段被误渲染mock=反向污蔑真实数据。

### 六、顶栏徽章双真相源(资深开发新增更深契约分裂)
- **已核实** `app.js:6` 硬编码 `currentStore:'mock-store-us'`、:8 `realWritesEnabled:false`;`DefaultLayout.vue:262-264` "Mock数据已加载"为无条件常量。开发点出上一轮未发现的**双真相源**:Pinia(app.js)死值 vs useLocalStore 真实 currentStoreId,顶栏读死值、业务读真值永不一致。B 加码**反向误导**:若后端真打Amazon顶栏仍显示"真实写入已关闭"。
- 定级分歧:A/B(第一项)主张 **P0**(信任漏斗整体击穿),开发/测试/B(后续)定 **P1**。分歧锚点=本期是否有真实接店卖家走到这一步。

### 七、其余确凿事实(B/测试新增,与争论脱钩)
- **removeUserStore 审计硬删**(data-store.mjs:437 `DELETE FROM audit_logs`):**已核实**在删店事务内物理硬删审计,违反"审计不可篡改"不变量。B 主张从 x-store-id ownership 争论中**脱钩独立 P1**。
- **securityJson 全局注入 sourceMode:'mock'**(security.mjs:81):**已核实**,一次403能污染前端真假徽章状态机,P1,改用独立 securityMode 字段。
- **shouldSeedMock fail-open**(provider-mode.mjs:32-34 catch return true):**已核实**,DB抖动期向真实店播种mock,应 fail-closed,测试零覆盖该分支。
- **M4 false-positive**(store-routes-monitor.mjs:103 `mode==='real'`):**已核实**默认hybrid下恒false→真实已同步数据全标mock,`realDataOnly` 是死开关。确定性可断言项。

### 八、被反驳/修正的观点
- 产品A **自我修正**:撤回"保留mock演示流畅度"的旧主张——流畅度不能建立在"谎称已执行/已挽回"之上。
- A/开发 **证伪第2轮"前端乐观更新双契约(mock乐观/real悲观)可保留方案"**:既然 real 写在正规UI物理不可达,当前不存在"real悲观"线,双契约是为不存在的形态预付复杂度;本期应先承认纯mock现实。

- 共识: 假回滚为P0且为四层断裂,根因是'真相在HTTP响应(dispatchedInverse已返回)、前端单方面毁约'——Audit.vue:59不await/不读字段+双重catch吞错+useLocalStore await前乐观翻绿+后端data-store.mjs:547无条件UPDATE reverted=1。修复:后端对真实写白名单且dispatched===false时禁止置reverted=1并返409 needsManualReversal,前端await读字段渲染红色阻断态、移除catch吞错; 真实写gate缺isRealMode守卫为P0,且tests/integrations/ads-live-action-gate.test.mjs:107-127正反向背书该漏洞(默认hybrid下断言真打Amazon成功)。必须加 isRealMode() 守卫并新增'mock/hybrid下全env齐备必throw且零/sp/keywords fetch'的反向回归; useAudit为死契约(硬编码requiresRealStoreWrite:false+恒mockExecute+api/audit.js不暴露真实写端点),正规UI所有写操作只产生mock审计却承诺可回滚,构成闭环欺骗;'统一审计中心+一键省时'对真实写物理不可达; 真实写自动回滚工程上不可兑现:反向写自身再过assertRealWriteGate+assertChangeLimit,previousValue偏差>10%被real_write_delta_too_large拦死('回滚也回不去')。拍板前UI对real-write记录绝不可承诺'一键回滚',应改'申请人工回滚'阻断态; sourceMeta poison-default污染面≥9处(7组件+api层),非上轮认定的2处;real数据缺freshness被误渲染'mock seed'=反向污蔑真实数据,违反真假可辨不变量。缺省应改显式'unknown'(警示橙); 顶栏三信任锚点(currentStore/realWritesEnabled/Mock数据徽章)全为死常量,与/provider/status脱节;且存在Pinia(app.js)与useLocalStore双真相源,顶栏读死值业务读真值永不一致; M4 dailySourceMetaFor(mode==='real')在默认hybrid下恒false,真实已同步数据被系统性误标mock,realDataOnly为死开关——确定性可断言false-positive; '本月已挽回¥X'(Audit.vue:37 reduce)把正负saving净加(mock种子含-1500/-800)输出语义错乱数字,且来源是mock事前预估,Amazon端从未发生; removeUserStore(data-store.mjs:437)在删店事务内物理硬删audit_logs,违反审计不可篡改不变量,应与ownership争论脱钩单独立项; 当前522测试全绿不能作为本期可发布证据:已证实至少2套件(ads-live-action-gate、m3-button-level的M3-audit-07/M3-cross-03)正反向锁死错误契约
- 分歧: 本期产品形态根决策:B方案(承认纯mock,清掉所有'已执行/已挽回/可回滚'真写文案降级为'模拟/草稿' — 产品A/B倾向) vs 开发方案(本期补全confirmRealWrite/riskAccepted双确认链路+audit.js暴露真实写端点)。开发警告半成品状态最危险,产品必须本轮拍; 顶栏死常量徽章定级:P0(产品A/B,理由=激活→留存→续费漏斗整体击穿) vs P1(开发/测试,理由=真实卖家当前能否走到这一步未知,纯demo则伤害延后)。分歧锚点=本期是否有真实接店场景; 真实写gate修复点:assertRealWriteGate首行throw(易断言但路由仍可达) vs mock/hybrid下execute路由物理404硬隔离(测试+产品B倾向,可断言'路由不存在'更稳且杜绝循环单条execute绕批量限制); '已挽回¥X'定级与拆分:合并P0(产品A,业务求和bug+虚假功效双重) vs 拆为'前端reduce语义bug P1'+'对外话术合规单独立项'(需运营/合规拍口径); '已挽回'是否区分estimated/realized双字段且KPI只汇总realized:做(规避虚假宣传,产品B) vs 销售/增长可能反对(削弱卖点数字)——需销售+合规+增长三方拍,本期最硬商业-合规冲突; 前端写范式:全站悲观await(开发,真实副作用一律悲观渲染) vs 保留mock乐观+引入requiresRealStoreWrite字段驱动分流(代价=前端复杂度翻倍,改造面=整个useLocalStore composable); sourceMeta二态(mock bool) vs 三态(real/mock-seeded/hybrid-overlay)+行级provenance:本期是否只先修hybrid反向误报(M4)+死常量+poison-default改unknown,三态延后?deriveSource真相源owner未定
- 决策: 假回滚链路本期必修(P0):后端对真实写白名单action_type且dispatched===false时禁止UPDATE reverted=1,返回{status:'revert_failed',needsManualReversal:true},路由据此返409;前端Audit.vue revert()与useLocalStore.revertAuditLog均改悲观——await后读dispatchedInverse,false渲染红色阻断态'本地已标记,Amazon端未自动回滚,需人工处理',删除两处catch吞错与await前乐观翻绿。同步修改m3-button-level.test.mjs的M3-audit-07/M3-cross-03期望(reverted仍0/阻断态),新增ACTION_QUEUE_REAL_WRITE revert反向用例; 真实写gate本期必修(P0):assertRealWriteGate增isRealMode()守卫(非real模式直接拒),改造ads-live-action-gate.test.mjs显式设DATA_PROVIDER_MODE=real才允许成功,新增mock/hybrid+全env齐备必throw且零/sp/keywords PUT fetch断言。尊重安全不变量:绝不允许非real模式真实写Amazon、绝不绕过ad_action_queue; 拍板前硬约束(全员附议,不再议):UI对所有真实写(real-write)记录禁用'一键回滚'按钮,改为'申请人工回滚'阻断态;真实写自动反向通道在change-limit悖论解决前不上线; poison-default本期统一缺省由'mock'/'mock seed'/'deterministic_mock'改为显式'unknown'(警示橙,语义=来源未知不可断言真假),覆盖全部≥9处(7组件+api层);后端deriveSource对real+active凭证数据强制填行级origin,不得回退mock。新增组件级测试:freshness缺失+mock:false→不出现'mock seed'文案; removeUserStore审计硬删从ownership争论中脱钩,本期单独修为P1:audit_logs从级联硬删剔除,改软删(store_archived_at)或迁archived_audit_logs保留留痕;前端删店确认弹窗显式声明审计保留策略; securityJson停止注入sourceMode:'mock'(security.mjs:81),改用独立securityMode字段,避免一次安全错误污染前端真假状态机(P1); shouldSeedMock catch分支改fail-closed return false+console.error(provider-mode.mjs:32-34);新增测试:注入getDbInstance().prepare抛错→断言shouldSeedMock===false(注入失败也绝不向真实店播种mock); '本月已挽回'reduce语义错误(正负净加)本期作为前端bug修正:拆'已节省'与'已投入'分账,禁止净加;真实写跑通前KPI显示'预估可挽回(模拟)'并打橙色水印。对外续费话术合规口径单独立项交运营/合规
