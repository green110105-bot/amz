# 功能域辩论证据: Amazon 授权接入中心 (OAuth/diagnostics/credentials/provider-mode)

## 清单梳理

I have all the evidence needed. Here is my analysis.

---

# 功能域清单：Amazon 授权接入中心 (OAuth / diagnostics / credentials / provider-mode)

## 路由入口
- 唯一页面路由：`/settings/amazon-auth` → `AmazonAuthCenter.vue`，导航分组 `main`，标题"Amazon 授权接入"。证据：`apps/web-v2/src/router/index.js:126`。
- Settings 页 (`Settings.vue`) **不属于本域**：它只在 `Settings.vue:48` 提供一个跳转按钮 `router.push('/settings/amazon-auth')`，其"店铺与授权"tab (`Settings.vue:135`) 是店铺 CRUD，不是 Amazon OAuth/凭证接入。
- 后端全部挂在 `/api/v1/integrations/*`，由 `sync-routes.mjs:84` 的 `handleSyncRequest` 分发（注释清单见 `sync-routes.mjs:4-20`）。

## 单页结构（这是一个单页 + 内嵌 tabs/弹层的设计，没有独立子路由）

页面骨架在 `AmazonAuthCenter.vue:397-770`，从上到下分为 6 个区块 + 1 组折叠内 tabs：

### 1. Hero / 数据模式横幅 (`AmazonAuthCenter.vue:412-426`)
- 业务目的：展示当前店铺、`status.mode`（provider mode）、M3 真实写入开关状态。
- 数据来源：**DB**。`mode` 来自 `GET /status` → `listProviderStatus()` → `providerMode()`（`provider-mode.mjs:12,49`，读 env `DATA_PROVIDER_MODE`，默认 `hybrid`）。`realWriteEnabled` 来自 diagnostics 的 `m3Impact`（`authorization-diagnostics.mjs:272` 硬编码 `realWriteEnabled: false`）。
- 写入/队列：无。纯读。

### 2. 一键授权卡片 × 2（Step 1 SP-API / Step 2 Ads）(`AmazonAuthCenter.vue:428-473`)
- 业务目的：发起 Amazon 官方 OAuth 同意流程（`startOneClick`，`:231-253`），跳转到 `authorizationUrl`。
- 数据来源：**DB/env hybrid**。就绪状态 (`spapiOAuthReady`/`adsOAuthReady`) 来自 `GET /oauth/config` → `buildOAuthConfig()`（`oauth-flow.mjs:185-200`），读 env (`SPAPI_OAUTH_APPLICATION_ID`、`SPAPI_LWA_CLIENT_ID/SECRET`、`ADS_LWA_CLIENT_ID/SECRET`) + 加密密钥就绪 (`isCredentialEncryptionReady`)。
- 写入/队列：**有真实写入语义**。`POST /oauth/:provider/start`（`sync-routes.mjs:117-122` → `startOAuth` `oauth-flow.mjs:229-266`）向 DB 表 `integration_oauth_states` **INSERT** 一条 15 分钟短效 state 行（`oauth-flow.mjs:248-253`），SP-API 还下发 HttpOnly cookie。这是真实的 OAuth 写入，不是 mock。

### 3. Ads profileId 选择弹层卡 (`AmazonAuthCenter.vue:475-489`)
- 业务目的：账号下多 profile 时让用户确认/保存 profileId（`useCandidate`/`saveAdsProfile`）。
- 数据来源：**DB（live probe 结果）**。候选来自 `adsProfileCandidates`（`:61-69`），取 diagnostics live probe 的 `ads_profiles_list.profileIdCandidates`。
- 写入/队列：**真实写入**。`POST /credentials/ads/profile`（`sync-routes.mjs:213-235` → `setAdsProfileId` `ads-api/credentials.mjs:84-91`）UPDATE `store_credentials.profile_id`，并写审计日志 `AMAZON_ADS_PROFILE_SAVED`。

### 4. 快速同步卡 (`AmazonAuthCenter.vue:491-510`)
- 业务目的：授权后一键触发真实数据同步（orders/settlement/inventory/ads/全部）。
- 数据来源：**真实 API → DB**。
- 写入/队列：**真实写入，同步执行（非队列）**。`syncOrders/Settlement/Inventory/Ads/All`（`:321-389`）→ 后端 `POST /spapi/sync/*`、`/ads/sync/all`、`/sync/all`（`sync-routes.mjs:237-305`），用 `runWithGuard` **串行**执行真实 sync 函数；每次底层 API 调用经 `sp-api/client.mjs:45` / `ads-api/client.mjs:74` **INSERT 一条 `sync_runs` 审计行**。这是 best-effort 同步，不是消息队列；语义为"立即跑、记审计行"。

### 5. 流程说明条 (`AmazonAuthCenter.vue:512-533`)：纯静态 UI，无数据来源。

### 6. 高级折叠面板内的 4 个 tabs (`AmazonAuthCenter.vue:535-734`，`el-tabs v-model="activeStep"`)
默认折叠，OAuth 未配置或回调失败时自动展开 (`advancedPanels=['advanced']`)。

- **Tab 1「环境检查」`name=environment`** (`:543-561`)
  - 目的：列出所需 env (CREDENTIAL_ENC_KEY、SPAPI/ADS 各 client id/secret、redirect/login uri) 是否已配置。
  - 数据来源：**env**。`envRows`（`:71-129`）合并 diagnostics 的 `environment` + oauth/config 的 `providers`。来自 `buildEnvironment()`（`authorization-diagnostics.mjs:118-142`）+ `providerConfig()`（`oauth-flow.mjs:106-153`）。仅返回布尔 `configured`/`source`，**不回显密钥**。
  - 写入：无。

- **Tab 2「保存凭证」`name=credentials`**（默认 tab）(`:563-624`)
  - 目的：手动兜底录入 SP-API / Ads refresh token + 元数据。
  - 数据来源：表单。
  - 写入/队列：**真实写入**。`saveSpapi`/`saveAds`（`:268-302`）→ `POST /credentials/spapi`、`/credentials/ads`（`sync-routes.mjs:154-210`）→ `upsertSpApiCredentials`/`upsertAdsCredentials`（`sp-api/credentials.mjs:11-42`、`ads-api/credentials.mjs:13-47`）。refresh token 经 `encryptToken` 加密后写 `store_credentials`，置 `status='active'`，并 UPDATE `user_stores.sp_api_authorized/ads_api_authorized=1`，写审计 `AMAZON_SPAPI/ADS_CREDENTIALS_SAVED`。

- **Tab 3「诊断与 profileId」`name=diagnostics`** (`:626-676`)
  - 目的：离线就绪诊断 + 显式 live probe（刷 LWA token、只读安全接口）+ profileId 候选。
  - 数据来源：**DB + 可选真实 API**。`runProbe`（`:215-230`）→ `POST /diagnostics {liveProbe,apiProbe}`（`sync-routes.mjs:136-152` → `buildAmazonAuthorizationDiagnostics` `authorization-diagnostics.mjs:286-339`）。离线部分读 `store_credentials` 快照（`readCredentialSnapshot:55-94`，**不解密 token**）+ 最近 5 条 `sync_runs`（`recentRuns:96-112`）；live probe 真实调用 `getAccessToken(force)`、`sellers.getMarketplaceParticipations`、`ads.profiles.list`（`probeSpApi:193`、`probeAds:228`），但 `audit:false` **不落 sync_runs**。
  - 写入/队列：诊断本身不写业务表；但 live probe 会触发 token 刷新（间接 UPDATE access_token 缓存）。真实写操作明确被阻断：`m3Impact.realWriteMode='disabled_dry_run_audit_first'`（`authorization-diagnostics.mjs:271-273`）。

- **Tab 4「同步真实数据」`name=sync`** (`:678-730`)
  - 目的：带参数（日期、ASIN、profileId）的完整同步面板（比快速卡多 Catalog）。
  - 数据来源/写入：同区块 4，真实 API → `sync_runs`，串行 best-effort，非队列。额外显示 `m3Impact.m3DataMode`（`authorization-diagnostics.mjs:269`）。

### 7. 「当前店铺授权状态」表 (`AmazonAuthCenter.vue:736-758`)
- 目的：展示每个 provider 的 status/sellingPartnerId(脱敏)/profileId/region/marketplace/lastError。
- 数据来源：**DB**。`providerStatusRows` ← `GET /status` → `listProviderStatus()`（`provider-mode.mjs:38-63`，读 `store_credentials`）。token 全程脱敏 (`maskValue`)，不回显。
- 写入：无。

### 8. 「最近执行结果」JSON 面板 (`AmazonAuthCenter.vue:760-768`)：前端内存 `lastResult`（`capture()` `:182-191`），无后端。

## 关键结论
- **数据来源整体为 hybrid**：UI 状态/诊断/凭证状态全部来自真实 DB 表 (`store_credentials`、`sync_runs`、`integration_oauth_states`、`user_stores`)；env 配置驱动就绪判断；**没有 mock fixture 喂给本页**（mock 只在 `provider-mode.mjs:24` 的 `shouldSeedMock` 决定其他业务域是否种子）。
- **真实写入确实存在**：OAuth state INSERT、凭证加密 upsert、profileId 保存、access token 刷新、sync_runs 审计行——都是对 SQLite 的真实写入。
- **队列语义**：本域**没有异步消息队列**；同步是 `runWithGuard` 串行立即执行 + 每调用一条 `sync_runs` 审计行（`sp-api/client.mjs:45`、`ads-api/client.mjs:74`）。真正的"action queue"概念存在于 M3 (`ads-api/live-action-executor.mjs`)，但 diagnostics 明确声明 Amazon 真实写操作被门控关闭 (`realWriteEnabled:false`, `authorization-diagnostics.mjs:272`)。

## 涉及文件
- 后端：`apps/api/src/integrations/sync-routes.mjs`、`oauth-flow.mjs`、`authorization-diagnostics.mjs`、`provider-mode.mjs`、`sp-api/credentials.mjs`、`ads-api/credentials.mjs`、`sp-api/client.mjs`、`ads-api/client.mjs`
- 前端：`apps/web-v2/src/pages/AmazonAuthCenter.vue`、`apps/web-v2/src/api/integrations.js`、`apps/web-v2/src/router/index.js:126`

## 第 1 轮

## 第1轮 · Amazon 授权接入中心 — 可读证据记录

### 交锋焦点一: OAuth 回调 CSRF / state 双因子绑定 (P0 vs P1 之争)
- **产品经理B 主张 P0**: 回调端点 unauthenticated, 信任完全建立在 SQLite 随机 state 上; `finalizeSpApiOAuth/finalizeAdsOAuth` 的 user_id/store_id 完全取自 state 行 (start 时写死), 回调时不做 session/cookie 再绑定。SPAPI 在 start 时确实下发了 `SPAPI_STATE_COOKIE`(oauth-flow.mjs:254-255), 但 callback 路径完全不读它, ads 连 cookie 都没下发。state 会出现在 URL/历史/Referer/日志 → login-CSRF / token 注入, 把攻击者凭证绑到受害者 store。
- **测试工程师 定级 P1**: 同一缺口, 但给出可断言用例 (无 cookie 的回调应 4xx 而非 302 success; ads start 响应头应含 set-cookie — 当前两条断言都会失败)。
- **主持人核验 (已读源码)**: oauth-flow.mjs:530-536 确认回调只校验 `row.provider === provider`, 无任何 cookie/session/PKCE 校验; L254-256 确认 cookie 仅 spapi 下发、ads 为空对象, 且 callback 全程未 `readCookie`。指控**属实**。定级取决于部署形态 (单租户内网 vs 多租户公网), 这是 B 与测试都列入未决的前置问题。

### 交锋焦点二: realWriteEnabled 硬编码 false 的性质
- **产品经理A (价值视角)**: 认为这是"核心价值阉割"——M3 自动改竞价/预算/否词永久关闭, 授权页却宣传"用于 M3 广告优化", 授权转化与价值兑现错位 → 留存崩。定 P1。
- **产品经理B (合规视角)**: 升级为 P0 — 不是"该不该写", 而是"页面声称关闭、后端其实可写"的**状态与现实不一致**。诊断 (authorization-diagnostics.mjs:272) 与 oauthConfig (oauth-flow.mjs:197) 把 realWriteEnabled 硬编码 false, 但真实写护栏在 live-action-executor.mjs:39 读 env `ADS_REAL_WRITES_ENABLED`。两者脱钩 → 运维一旦开 env, 页面仍显示绿色"关闭"的虚假安全感。
- **主持人核验**: live-action-executor.mjs:38-53 确认真实门是多重 env gate (`ADS_REAL_WRITES_ENABLED` + `ADS_API_MOCK` 互斥 + confirmRealWrite + riskAccepted + primitive/store/profile allowlist), 而 diagnostics:272 是裸常量 false。B 的"两套脱钩"指控**属实**。注意: 这并不违反安全不变量 (执行器本身护栏完备、且 mock 下硬拒写 L40), 真正问题是**前端回显的诚实性**。A/B 在"是阉割还是诚实回显"上仍有定性分歧。

### 交锋焦点三: 授权成功后自动 runProbe (apiProbe:true) 违背 explicit-only 契约
- **产品经理B / 测试工程师** 共同指出: sync-routes.mjs:11 注释承诺"liveProbe/API probe must be explicit", 但 handleOAuthReturn 在每次授权成功后自动 `runProbe()`, 而 runProbe 写死 `liveProbe:true, apiProbe:true` (AmazonAuthCenter.vue:218,261) → 未经点击强制真实命中 Amazon, 违背契约且在 rate-limit 紧时放大风险, 刷新带 ?oauth=success 会重放。
- **产品经理A** 从体验角度补充: 授权成功正反馈被自动 probe 报错冲淡。
- 三方一致, 无交锋, 高置信。

### 交锋焦点四: store 绑定来源不一致 + 切店时序竞态
- **资深开发** 主线: start 用 X-Store-Id header 写 state (正确), 但前端 startOneClick 校验 `currentStoreId.value`(L232) 而真正发送的是 axios 拦截器读 localStorage 的值 (client.js:37)。用户在 Amazon 授权页停留 (state 15min 有效) 期间切店 → 回跳后 loadStatus 读当前店铺, 出现"提示 A 店、凭证落 B 店、面板显 A 店"。
- **测试工程师** 降维为断言: 用 user A token 发起 start, 无 token 命中 callback, 断言落库 user_id 必须且仅等于 A; 并断言前端 state.storeId 与成功后显示 store 一致。
- **资深开发自我立靶**: 预先反驳后续把本域降级为"文案优化"的倾向, 主张真正 P0/P1 全是数据契约/状态机问题。

### 交锋焦点五: readiness 状态字段契约断裂 (false-positive 高发)
- **资深开发**: /status 返回 `status`(active/revoked/missing), /diagnostics 返回 `readiness`(ready/blocked/live_ok/live_partial/live_error), 前端 spapiReadiness 双 fallback 把两套取值空间混进同一个 readinessType, 且把 live_partial 误归 success (绿色)。
- **测试工程师** 立桩反对任何把 readiness=ready 当验收门槛的测试: spapi readiness 只校验 refresh_token+LWA client, **不校验** SPAPI_OAUTH_APPLICATION_ID, 而一键授权必需它 (oauth-flow.mjs:123 ready 多了 app.value 条件)。→ readiness=ready 但 oauthReady=false 自相矛盾。主张拆 credentialReadiness / oauthReadiness / liveReadiness 三态。
- **主持人核验**: authorization-diagnostics.mjs:179 readiness 只看 blockers (L150-166, 不含 app id); oauth-flow.mjs:123 ready 含 `!!app.value`。两套 ready 定义不一致**属实**。

### 交锋焦点六: 长耗时真实同步 vs 15s axios timeout (可稳定复现回归)
- **资深开发 / 测试工程师** 一致 P1: sync/all 服务端串行跑 orders+settlement+inventory+catalog+ads 5 步真实同步 (sync-routes.mjs:291-305), 远超 client.js:30 的 15000ms; 前端 reject 报"失败"但后端仍在跑并落库 → "前端报错、后端成功"撕裂 + 用户重复点击 → 重复同步/重复 LWA 换码/限流。runProbe 与 loadStatus 共用同一 loading ref 还会闪烁。

### 交锋焦点七: marketplaceIds 硬编码默认值导致多站点静默断裂
- **产品经理A / 资深开发** 一致: spapiForm.marketplaceIds 初值硬编码 'ATVPDKIKX0DER'(L30), applyStatusToForms 回填条件 `&& !spapiForm.value.marketplaceIds`(L171) 因初值非空恒为 false → OAuth 自动发现的真实站点永不回填, 欧/日卖家走手动同步会用错美国站。

### 其他单方发现 (无交锋)
- **B**: marketplace 发现失败仍落 active (credentials.mjs status='active'), 与 diagnostics 的 marketplace_missing blocker 打架 (P1); Ads Mock 下 readiness 可显示 ready/live_ok 而非降级 mock_ready (P2); 缺 revoke 入口、无 state 清理任务、无失败回滚 (P2)。
- **A**: 无定时/增量调度, 卖家变人肉 cron (P1); start 无既有凭证校验, 换账号无护栏 (P2)。
- **资深开发**: profileId 多选候选强耦合 apiProbe, callback 不回传候选列表 (P2); 手动 saveSpapi/saveAds 无 storeId 校验, 与一键路径不一致 (P2); lastResult 全量 JSON dump 隐患面 (P3)。
- **测试**: OAuth 路径允许 marketplaceCount=0 落库 active, 与手动路径强制非空不一致 (P3)。

- 共识: 回调 CSRF/state 缺乏第二因子: handleOAuthCallback 仅校验 row.provider===provider, 无 cookie/session/PKCE 再绑定 (oauth-flow.mjs:530-536); spapi 的 SPAPI_STATE_COOKIE 在 start 下发却从未在 callback 读取, ads 连 cookie 都不下发。已核验属实, 三角色 (B/开发/测试) 均认定为安全缺口。; 授权成功后自动 runProbe(apiProbe:true) 违背 sync-routes.mjs:11 的 explicit-only 契约 (AmazonAuthCenter.vue:218,261), 强制未经点击真实命中 Amazon, 且 ?oauth=success 可重放。四角色一致。; 前端 15s 全局 timeout (client.js:30) 与服务端串行多步真实同步/probe (sync-routes.mjs:291-305) 冲突, 产生'前端报错后端成功'撕裂 + 重复提交风险, 可稳定复现。开发与测试一致 P1。; readiness 字段契约断裂: /status.status 与 /diagnostics.readiness 取值空间不同被前端混用; readiness=ready 不校验 SPAPI_OAUTH_APPLICATION_ID 故与一键授权所需的 oauthReady 自相矛盾; live_partial 被误映射为绿色 success。开发与测试一致。; marketplaceIds 表单初值硬编码 ATVPDKIKX0DER + 回填条件恒 false (AmazonAuthCenter.vue:30,171), 导致 OAuth 自动发现站点永不回填, 多站点卖家手动同步静默用错站点。A 与开发一致。; 授权中心缺少 revoke/解绑/换绑入口 — 后端 revokeSpApiCredentials/revokeAdsCredentials 已实现但前端零调用、sync-routes 无 DELETE/revoke 路由。A 与 B 一致。; realWriteEnabled 在 diagnostics:272 / oauth-flow:197 为硬编码常量 false, 与真实写护栏 live-action-executor.mjs:39 读 env ADS_REAL_WRITES_ENABLED 完全脱钩 (已核验)。执行器护栏本身完备且不违反安全不变量, 但前端回显不诚实。
- 分歧: 回调 CSRF 定级: 产品经理B 定 P0 (多租户公网即致命), 测试工程师定 P1 (先要威胁模型归属)。分歧根因是部署形态未定 (单租户内网 vs 多租户公网)。; realWriteEnabled 的性质: 产品经理A 视为'核心价值阉割'(产品定位之争, P1), 产品经理B 视为'状态与现实不一致的合规风险'(P0), 两者诉求不同 — A 要么开 gate 要么改话术, B 要后端真实回显 env 状态。; 同步触发模型: 产品经理A 主张授权后自动首同步 + 定时增量 (省时间), 但 B 与测试担忧 Amazon 限流/配额/数据成本与重复换码风险。手动 vs 自动未裁决。; 长耗时同步的架构方向: 开发/测试主张'后端异步任务 + 前端轮询'(更稳但工作量大), 备选'仅放大单请求 timeout'(轻量但仍阻塞)。两条测试路线互斥, 需架构裁决。; readiness 状态建模: 测试/开发主张拆为 credentialReadiness / oauthReadiness / liveReadiness 三态独立断言; 备选合并为单一 readiness 契约更简单。决定前端绿标语义与测试断言点。; 换账号覆盖授权: A 主张'已绑定则前端弹确认 + 后端审计 previous id'(允许但加护栏), B 倾向考虑是否应禁止而非仅提示 (历史数据归属一致性)。; marketplaceIds 硬编码默认值: 是否彻底移除前端默认值强制以后端发现为准 — 开发提醒需先核对 seed/测试用例是否依赖该默认值, 移除可能破坏 demo。
- 决策: 确认安全不变量未被违反: live-action-executor.mjs:38-53 的真实写多重护栏 (env gate + mock 互斥 + confirmRealWrite + riskAccepted + primitive/store/profile allowlist) 完备, mock 下硬拒真实写 (L40)。本域整改不得削弱这些 gate, 不得绕过 ad_action_queue。; 前端 realWriteEnabled 必须改为后端真实回显 (聚合 ADS_REAL_WRITES_ENABLED / ADS_API_MOCK / allowlist), 禁止继续用硬编码常量 false 伪装关闭状态 — 这是诚实回显要求, 不是开启写入。; 授权成功后的自动流程必须停止自动 apiProbe: 默认仅 loadStatus (离线诊断), apiProbe 改为用户显式点击; 回调成功后立即 router.replace 清掉 ?oauth=success query 防重放。三角色共识直接落为决策。; 为 integrations 的 sync/probe 端点单独配置更长 per-request timeout, 并在超时窗口内禁用/保持按钮 loading 防重复提交 (无论最终走异步任务还是放大 timeout, 防重复提交是底线)。; 本域 P0/P1 锚定在数据契约与状态机 (回调绑定、readiness 契约、store 绑定、timeout), 文案类问题最多 P3 — 采纳资深开发立靶, 后续轮次不得把核心问题降级为 UI 文案。

## 第 2 轮

## 第2轮辩论记录 — Amazon 授权接入中心

### 本轮重大升级:"伪装 real"从争论变为坐实(代码已核)
产品经理B 与资深开发本轮把上一轮悬而未决的"是否伪装 real"打穿到代码链路,我已逐行复核确认:
- `authorization-diagnostics.mjs:169` `const envNeeded = !env.ads.mock` —— ADS_API_MOCK 开启时直接跳过 `ads_lwa_client_id_missing` / `ads_lwa_client_secret_missing` 两个 blocker;
- `:179` `blockers.length === 0 ? 'ready'` —— 零真实凭证的 mock 店铺据此判 `ready`;
- `probeAds`(`:240-261`)在 mock 下 `adsCall` 返回 fixture 仍 `status:'ok'`,经 `:322` `liveProbe.status==='ok' && blockers.length===0 ? 'live_ok'` 把 readiness 拔到 `live_ok`;
- 前端 `AmazonAuthCenter.vue:148` `readinessType('live_ok'|'ready'|'live_partial')→success` 全部染绿。
**结论(已核实):一个零真实 Amazon 凭证、纯 fixture 的店铺,会在"真实授权中心"拿满绿标。** 这直接触碰项目安全不变量"无凭证时不得伪装 real"。B 据此把定性从"硬编码 false 不诚实"升级为"真实性造假",维持 P0,我采纳。

### 交锋点 1:回调 CSRF 第二因子(P0 vs P1)
- **B + 产品经理A** 主张 P0:A 以 `Settings.vue:138`"多店铺隔离" + team 多角色判定本系统事实上是多租户 SaaS,无单租户回旋;`oauth-flow.mjs:536` 仅校验 `row.provider` 即写 refresh token。
- **测试工程师** 程序性反驳 P0:已核实 `SPAPI_STATE_COOKIE` 在 `:255` 下发、`:300`(login handoff)读取,但 callback(`:530-536`)从不读 cookie —— 在第二因子契约落地前**没有可断言的拦截点**,P0 无法进回归门禁,工程上等价 P1-待裁。
- **B 让一步并加边界(已核实)**:无论部署形态,"补全 cookie==state 比对"成本极低、是"写了一半的防御"(`:255` set 了却不读),**应本期立即做**,不应整体压在"等威胁模型";待裁的只是 PKCE 是否纳入。这是本轮 CSRF 议题的实质收敛。

### 交锋点 2:换账号覆盖 —— A(允许+审计)vs B(409 硬阻断)
- **A** 主张前端二次确认 + 审计 previous sellingPartnerId/profileId 即可。
- **B 反驳并升级**:`upsertSpApiCredentials/upsertAdsCredentials` 是覆盖式,而 `sync_runs/orders/ad_action_queue` 按 `(userId,storeId)` 落库且**无 sellingPartnerId/profileId 版本戳**,覆盖后旧账号历史订单与新账号数据在同 storeId 混账,审计 previous id 救不回已混的行。主张同 storeId 换不同 partner/profile 应 **409 硬阻断、强制新建 store**。
- 测试侧指出两条路线对应互斥断言("第二次 save 不同 partnerId 被拒 4xx" vs "弹 confirm + 写 previousId"),架构未裁前无法固化断言。**未达成共识,带入下一轮。**

### 交锋点 3:自动 runProbe 的危害层级(三方叠加补强)
- **A**:转化视角 —— 授权成功是信心峰值,自动 runProbe(`AmazonAuthCenter.vue:261` apiProbe:true)串行命中 SP-API+Ads,必然超 `client.js:30` 全局 15s timeout,卖家刚成功就吃红色报错,`router.replace` 清 query 后无法重试 —— 是 P1 转化杀手。
- **B**:真实性视角 —— mock 店铺上自动 probe 把 fixture profileId 当真实候选填入 `adsForm/syncForm`(`:221-225`),是 mock 污染真实落库表的触发器。
- **资深开发**:实现视角 —— `loadStatus` 与 `runProbe` 共享同一 `loading` ref(`:193/216`),页头三按钮(`:407-408`)集体转圈,可观测性塌陷;且 `.catch(()=>{})` 静默吞掉自动诊断失败。
- **测试**:`router.replace` 在 `await runProbe` 之后(`:266`),重放窗口=探针时延,是**确定性重放**而非偶发,断言必须覆盖"replace 必须先于任何 await"。
四方一致:默认仅 loadStatus、apiProbe 显式化。

### 被修正的上一轮观点
- 资深开发**修正**"?oauth=success 可重放":后端 `consumeState(:568)` 已防换码重放(重放命中 `row.consumed_at→error` 分支 `:539`),真正可重放的是**前端信任 URL query**(手动拼 `?oauth=spapi&status=success` 即触发真实 probe),修法应是后端一次性 server-side flash + state 回查,而非"清 query 即可"。
- 资深开发**反驳**把 realWriteEnabled 当纯"诚实回显":三处独立硬编码 false(`diagnostics:272`、`oauth-flow:197`、前端 `:424`)且**无 single-source-of-truth**,即便要诚实回显也缺聚合函数,会各自漂移 —— 这是数据契约层缺陷。注:`live-action-executor.mjs` 真实写护栏(env gate+mock 互斥+confirmRealWrite+allowlist)经 B 核实**完备**,不违反安全不变量,问题纯在授权中心回显脱钩。

### readiness 状态机契约断裂(资深开发三处证据链,已核)
1. `spapiReadiness`(`:53`)用 `??` 把 diagnostics 枚举(ready/blocked/live_ok/live_partial/live_error)与 store_credentials.status 枚举(active/missing/revoked)串入同一 el-tag;
2. `readinessType` 把 `live_partial`(`:322` 探针通但 blockers>0,如缺 profileId)误染 success 绿,而 M3 实为 NOT ready;hero 卡片显绿、底部 status 表(`:745`)显裸字 active,同 provider 自相打架;
3. `classifyProvider` 的 `ready`(`:158-166`)不校验 `SPAPI_OAUTH_APPLICATION_ID`,而一键授权 ready 强依赖 appId(`oauth-flow:123`)—— "诊断说 ready"与"授权按钮缺 appId disabled"可同真。
测试侧给出可断言形式:穷举 {ready,blocked,live_ok,live_partial,live_error,revoked,active,missing,unknown}×期望 type,禁止默认落 info 当成功路径。

- 共识: 自动 runProbe 必须停止:OAuth 回流后默认仅 loadStatus(离线诊断,毫秒级),apiProbe 改为用户显式勾选/点击 —— 四角色一致(转化/真实性/实现/可测四个视角均坐实危害); handleOAuthReturn 中 router.replace 清 query 必须发生在任何 await 之前(当前在 :266 await runProbe 之后,造成确定性重放窗口=探针时延); marketplaceIds 前端硬编码默认值 'ATVPDKIKX0DER'(:30)+ 回填守卫 '!spapiForm.value.marketplaceIds'(:171)恒 false 是确认缺陷,导致 OAuth 已发现的真实站点(oauth-flow:443)永不回填,EU/JP 卖家手动同步静默用美国站 —— 四角色一致; realWriteEnabled 三处独立硬编码 false(diagnostics:272 / oauth-flow:197 / 前端 :424)缺 single-source-of-truth,必须改为后端聚合 getRealWriteGateState()(ADS_REAL_WRITES_ENABLED && !ADS_API_MOCK && allowlist非空)统一回显;此改动仅诚实回显,不得开启写入、不得削弱 live-action-executor gate; 后端 revokeSpApiCredentials/revokeAdsCredentials 已实现但零路由暴露(sync-routes 全文无 DELETE/revoke)、integrations.js 零调用,缺 revoke/解绑入口是运营自助闭环硬缺口; live-action-executor.mjs 真实写护栏(env gate + mock 互斥 + confirmRealWrite + riskAccepted + allowlist)经核实完备,不违反安全不变量;问题纯在授权中心回显与 ad_action_queue 之外的 readiness 造假,真实写路径本身未被绕过; readiness 必须拆为可表达数据来源的多态:至少 live_partial 不得复用 success 绿标(应 warning + 展示首个 blocker);mock 模式 readiness 必须降级为独立 'mock_ready' 态,不得复用 ready/live_ok 绿标 —— 这是阻止 mock 伪装 real 的核心闸门(触及安全不变量); callback 补 cookie==state 比对成本极低且与部署形态裁决无关,应本期立即做(SPAPI_STATE_COOKIE 已在 :255 下发但 callback :536 从不读,是写了一半的防御);PKCE 是否纳入随威胁模型裁
- 分歧: 回调 CSRF 定级:B+A 主张 P0(事实多租户 SaaS,token 注入污染数据源头);测试工程师程序性反驳 —— 第二因子契约落地前无可断言拦截点,P0 进不了回归门禁,等价 P1-待裁。分歧根因=部署形态未裁; 换账号覆盖:A 主张'前端二次确认 + 审计 previous id'(允许覆盖);B 主张'同 storeId 换不同 sellingPartnerId/profileId 应 409 硬阻断、强制新建 store'(禁止覆盖)。根因=orders/sync_runs/ad_action_queue 无账号版本戳,历史数据归属一致性能否由审计补救; 同步触发模型:A 主张授权成功后自动一次轻量首同步(orders 近 7 天,给即时'有数据'成功体验提升转化);B+测试担心 Amazon 配额/限流成本。折中提案:首同步范围收窄 + 明确告知配额消耗; 长耗时同步架构:资深开发倾向异步任务+轮询(jobId);A 退而求其次可接受'放大单请求 timeout + 提交后全组禁用'。两条互斥路线对应互斥测试断言(jobId 轮询 vs 'timeout>最坏串行耗时'),需架构表态; Settings 授权徽标数据源:A 主张废弃 mock 字段 spApiAuthorized/adsApiAuthorized 改真实 /status;需确认是否破坏现有 demo 截图/回归对绿色徽标的依赖; readiness 状态建模:B+资深开发+测试强烈倾向拆 credentialReadiness/oauthReadiness/liveReadiness 三态(+B 提的第四维 dataSource:real|sandbox|mock);是否本期承担新增字段与前端断言点未定; Mock 在生产'真实授权中心'的合法性:B 主张生产强制 ADS_API_MOCK 不可设(启动即拒);是否接受此硬约束未裁
- 决策: 采纳:OAuth 回流后默认仅 loadStatus,apiProbe 改显式触发(四角色共识,P1); 采纳:router.replace 清 query 必须前置于任何 await(消除确定性重放窗口); 采纳:callback 立即补 cookie==state 比对(本期做,成本低,不依赖部署形态裁决);PKCE 待威胁模型; 采纳:realWriteEnabled 改后端单一聚合函数 getRealWriteGateState() 诚实回显,禁止三处常量;严格约束为仅回显、不开启写入、不削弱 executor gate(尊重安全不变量); 采纳(安全不变量驱动,强制):mock 模式 readiness 降级为独立 'mock_ready' 态,classifyProvider 不得因 mock 跳过 LWA blocker 而应额外 push warning 'ads_running_on_mock_fixtures',m3DataMode=ads_mock_fixture 时禁止任何 success 绿标 —— 直接落实'无凭证不得伪装 real'; 采纳:暴露 DELETE /credentials/:provider 路由调用已有 revoke 函数 + 前端解绑入口(二次确认); 采纳:live_partial 前端映射改为 warning(非绿),展示首个 blocker 文案; 暂缓裁定(带入下一轮):回调 CSRF 定级(P0/P1)、换账号覆盖(409 阻断 vs 确认+审计)、同步架构(异步 vs 放大 timeout)、生产禁 mock 硬约束 —— 均需架构/部署形态/数据归属方表态

## 第 3 轮

## 第3/10轮 · Amazon 授权接入中心 — 辩论记录

### 核心交锋:授权漏斗在"成功授权→看到真实数据"之间断裂
**产品经理A(增长视角)** 把上一轮"必须停掉回流自动 probe"的安全共识,从转化角度反向拷打:停 probe 后会暴露一个更大的产品空洞——授权成功页将彻底无数据、无下一步 CTA(已核 handleOAuthReturn:258-261 success 分支除 loadStatus+runProbe 外无任何"去同步"引导),而 flow-strip:530-531 已对用户承诺"M2/M3/M4 读真实数据"=过度承诺。A 主张"停 probe"不能孤立采纳,必须同时补"授权后引导/轻量首同步(orders 近7天单次)"。

**资深开发** 直接否决 A 的自动首同步:他从前端核到一个此前未被点名的具体破口——syncAll 进行中其余单项按钮 :loading 仍 false(AmazonAuthCenter.vue:499-503),`syncing` 单值 ref 仅锁单按钮,跨按钮可并发命中同一 store_credentials/sync_runs/token 刷新;sync-routes.mjs:291 sync/all 无 in_progress 拦截、无幂等键。结论:在 syncBusy 全局闸 + 后端 idempotency(409 in_progress)落地前,引入任何自动首同步都会与手动点击叠加并发,配额与 token 竞态双输。**A 与开发就"自动首同步是否本期引入"正面冲突,未裁。**

### marketplaceIds 硬编码 — 定级与回归阻塞双双被解锁
**A、B、开发** 三方独立坐实:spapiForm.marketplaceIds 初值硬编码 'ATVPDKIKX0DER'(:30),回填守卫 `!spapiForm.value.marketplaceIds`(:171)因初值非空恒 false,OAuth 已发现的真实站点(oauth-flow:443)永不回填,EU/JP 卖家静默拉美国站数据污染 M2/M4。**A 升级为 P0**(逆向漏斗、把已授权高价值用户在终点赶走)。**测试工程师** 执行了上一轮 carryForward 要求但无人做的 Grep:19 个 'ATVPDKIKX0DER' 命中全是后端 seed 列值/fixture 返回体/upsert 入参,无一断言前端 spapiForm 初值,无 E2E 读取该 input default → **删除前端硬编码对现有 522 测试零破坏,阻塞性前置担忧正式解除**(本人已二次核实 line 30/171/148 与 grep 一致)。

### "mock/partial 伪装 real" — 病灶定位被纠正并扩大
**产品经理B** 纠正上一轮两处事实错误并重定位伪装点:(1)spApiAuthorized/adsApiAuthorized 不是 mock 字段,而是 user_stores 真实 DB 列(data-store.mjs:399-400),由 upsert/revoke 在真实存/撤 token 时翻转,已有单测断言——上一轮"废弃改 /status"方向错、会破坏绿测。(2)真正最先骗到运营的是 **data-store.mjs:262-268 demo seed 在 hybrid 模式直接写 authorized=1 而 store_credentials 一行真实凭证都没有**(本人已核实 line 265-266 `isRealProviderMode()?0:1`,确无配套 credentials 插入)→ Settings.vue:155 显绿"查看接入",点进去 diagnostics 又是 blocked(credentials_missing),前后矛盾。B 定 **P0**。
**开发** 进一步把 Settings 徽标定性从"mock 字段"修正为"undefined 字段":store 对象从无 spApiAuthorized 键、Settings 从不拉 status,后果是"已接入店恒显示未接入(primary)"——比 mock 更隐蔽,且 demo 若有绿标必另有来源。
**测试工程师** 将 readiness 伪装升级为 **两个独立 false-positive**:不止 mock(ads_mock_fixture, diagnostics:269),live_partial(liveProbe ok 但 blockers 非空, diagnostics:322)也吃绿标(readinessType:148 把 ready/live_ok/live_partial/active 全映射 success,本人已核实)。给出穷举断言矩阵。

### CSRF 第二因子定级 — 三方拉锯
**A** 据 Settings.vue:138 多店隔离 + team 多角色主张事实多租户=**P0**,反驳"门禁可行性不应反向降级业务危害"。**B** 同意事实多租户倾向 P0,但接受先落 cookie==state 强比对再定级。**测试工程师** 给出关键技术约束:cookie 仅 spapi/start 下发(本人核实 oauth-flow:255),**ads 分支不下发 cookie(:256),callback:534 仅 `params.get('state')` 从不 readCookie(本人核实 line 534-536)** → 对 ads provider 第二因子天然不可断言,若强推 P0 门禁会产生 "ads 路径恒跳过=通过" 的 false-negative。测试建议拆 **P0(spapi)+ P1(ads 待第二因子设计)**。**部署形态裁决仍是 P0/P1 与 PKCE 的前置。**

### revoke 解绑闭环 — 写了一半
**B + 测试** 共同坐实:revokeSpApiCredentials/revokeAdsCredentials 已实现(credentials.mjs:118/102)但 sync-routes.mjs 全文 308 行无 DELETE 分支、integrations.js 无调用,仅 4 个单测直接 import。**B 加严**:两个 revoke 函数体内零 appendAuditLog,即便接上路由也将使"撤销授权"这一最敏感操作无审计轨迹,违反审计闭环不变量。Settings.vue:173 "解绑"只 removeStore(删整店)≠ 撤销 Amazon 授权,无"换绑不删店"路径。

### realWriteEnabled 三处硬编码 — 诚实但僵死
全体坐实 diagnostics:272 / oauth-flow:197 / 前端:424 三处独立硬编码 false 无 SSOT。开发补前端视角::424 是用户唯一能看到的写入闸信号,僵死=授权中心对真实写入闸零可观测性;改聚合 getRealWriteGateState() 后前端须展开 env gate/mock 互斥/allowlist 三子状态而非单布尔。安全约束:仅诚实回显,不开写入、不削弱 executor gate。

- 共识: 回流自动 probe 必须停:handleOAuthReturn success 分支默认仅 loadStatus(毫秒级离线),apiProbe 改 tab4 内已存在的'运行真实诊断'按钮(:632)显式触发(全四角色一致,已坐实 :261 自动 runProbe + :218 liveProbe&apiProbe both true); router.replace 清 query 必须前置到任何 await 之前(进入 success 分支首行即清),消除'重放窗口=探针往返时延'的确定性重复探针/重复 toast(已核实 :266 在两个 await 之后); marketplaceIds 前端硬编码移除安全:v-model 初值改空串(placeholder :588 保留),回填守卫去掉恒 false 的 !spapiForm 条件改为'后端有发现值则覆盖/diff 提示'——测试已 Grep 证实 19 命中无一断言前端默认值,对 522 测试零破坏,阻塞前置解除; readiness 双 false-positive 必须修:live_partial→warning 并在 tag 旁渲染 provider.blockers[0];mock 态后端 push warning 'ads_running_on_mock_fixtures' 并降级独立 mock_ready,前端映射 warning/info(已核实 :148 live_partial 当前吃绿); realWriteEnabled 收敛单一 getRealWriteGateState()=(ADS_REAL_WRITES_ENABLED && !ADS_API_MOCK && allowlist非空),三处统一回显;严格仅诚实回显、不开写入、不削弱 live-action-executor gate; DELETE /credentials/:provider 路由本期补:调用已实现的 revoke 函数,且强制 appendAuditLog 记录 previousSellingPartnerId/previousProfileId;前端加'撤销授权'按钮 + 二次确认(B 加严的审计内置为审计闭环不变量要求); 同步并发底线本期立即做(不依赖架构裁决):computed syncBusy=!!syncing,任一同步进行中禁用整组同步按钮含 syncAll;渲染后端已返回的 steps 数组为逐步成功/失败清单(sync-routes:304 已返回,前端未渲染); callback 增加 cookie==state 强比对(spapi 路径,成本低不依赖部署形态),不一致即 invalid_oauth_state;login handoff 改为 cookie 与 query state 都在时必须相等; Settings 徽标当前是确定性误导(seed authorized=1 但无 credentials,或字段 undefined 恒 primary),必须修——但 spApiAuthorized/ads_api_authorized 是真实 DB 列非 mock 字段,不可整体废弃改 /status(会破坏已绿单测)
- 分歧: 授权后自动轻量首同步是否本期引入:A 主张'回流后 orders 近7天单次'是转化必需(否则授权成功=空白页);开发否决——在 syncBusy 闸 + 后端 idempotency(409 in_progress)落地前,自动首同步会与手动点击跨按钮并发,配额+token 竞态双输,首同步必须等队列语义先落地;B+测试倾向纯手动控配额; 换账号覆盖处理:B 维持 409 硬阻断(account_mismatch)强制 revoke→新建,理由是 orders/sync_runs/ad_action_queue 无账号版本戳前审计无法回溯已落库污染;A 主张前端二次确认 + 审计 previousId 允许覆盖; CSRF 终极定级:A 据 Settings 多店隔离+team 多角色判事实多租户=P0;测试据 ads 分支无 cookie 不可断言,主张拆 P0(spapi)+P1(ads 待第二因子设计);B 倾向 P0 但接受先落 cookie==state 再定级——根因部署形态(单租户内网 vs 多租户公网)未裁; 长耗时同步架构:开发坚持异步 jobId+幂等键(因已发现跨按钮并发+sync-routes 无 in_progress 拦截,放大 timeout 无法表达并发互斥);对立方主张放大单请求 timeout——决定测试断言形式(jobId 收敛 vs timeout>最坏串行耗时); marketplaceIds 危害定级:A 升级 P0(逆向漏斗,EU/JP 已授权用户静默拉错站);B/开发标 P1; Settings authorized 标志修复范围:B 主张 seed 一律置 0(去掉 hybrid 的 1 分支)+ 一致性断言;另一路线保留 demo 绿标但加 dataSource='demo/seed' 标识——触及 demo 截图依赖未定
- 决策: 本期落地(零依赖裁决):(a) handleOAuthReturn 默认仅 loadStatus、删除自动 runProbe、清 query 前置于所有 await;(b) marketplaceIds v-model 初值改空串 + 回填守卫改覆盖/diff;(c) readinessType live_partial→warning 且渲染 blockers[0],mock 态降级 + warning push;(d) syncBusy 全局闸禁用整组同步按钮 + 渲染后端 steps 清单;(e) callback spapi 路径 cookie==state 强比对; 本期补 DELETE /credentials/:provider 路由,内部强制 appendAuditLog(actionType AMAZON_*_CREDENTIALS_REVOKED, 记 previousSellingPartnerId);前端加撤销授权按钮+ElMessageBox 二次确认; realWriteEnabled 三处收敛为后端单一 getRealWriteGateState() 聚合,前端展开 envGate/mockExclusive/allowlist 三子状态;严守安全不变量:仅回显不开写入、不绕过 ad_action_queue/executor gate; Settings demo seed authorized 标志与 credentials 存在性必须一致:authorized=1 当且仅当 store_credentials 有 active 行;新增一致性断言测试(任一 store *_api_authorized=1 则 store_credentials 必有对应 active 行); CSRF 定级本期暂记 P1-待裁,先落 cookie==state(spapi)可断言拦截点;ads 第二因子契约缺失明确为'拆 P0(spapi)+P1(ads)'的前置,P0 升级待部署形态方裁决; 断言矩阵采纳为回归基线:{ready/live_ok→success, live_partial/mock_ready/blocked/missing→warning, live_error/revoked→danger, 其他→info},且 m3DataMode==='ads_mock_fixture' 时页面 0 个 success tag
