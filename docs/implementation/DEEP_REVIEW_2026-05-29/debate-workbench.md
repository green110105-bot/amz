# 功能域辩论证据: 全局工作台 + 全局 Action Inbox

## 清单梳理

I have all the evidence needed. Here is the complete inventory of the 全局工作台 + 全局 Action Inbox functional domain.

---

# 功能域清单：全局工作台 + 全局 Action Inbox

## 1. 路由归属（哪些页面属于本域）

来源：`apps/web-v2/src/router/index.js`

| 页面 | path | name | 侧边栏分组 | 证据 |
|---|---|---|---|---|
| 工作台（域核心） | `/workbench`（`/` 重定向至此） | Workbench | `main` | router/index.js:4, :6 |
| 操作清单（旧，全局广告 inbox） | `/ads/actions` | AdsActions | 无 group（不进 sidebar） | router/index.js:86 |
| 通知中心 | `/notifications` | Notifications | `main` | router/index.js:125 |
| 审计中心 | `/audit` | Audit | `main`（底部块） | router/index.js:129 |

说明：本域的"全局壳"还包含 `DefaultLayout.vue`（顶栏 + 侧边栏 + 通知铃铛 + 店铺切换），它是所有页面的容器。`AdsActions.vue` 自身在路由 meta 里被标注为"操作清单（旧）"（router/index.js:86），是已被降级/归档的全局广告 Action Inbox。

注意：`/audit`（审计中心）通常作为独立功能域单独梳理。本报告聚焦工作台 + Action Inbox，仅在写入语义处引用它。

---

## 2. 逐页/逐组件梳理

### 2.1 工作台 `/workbench` — `apps/web-v2/src/pages/Workbench.vue`

业务目的：当天经营驾驶舱。顶部 4 个 KPI（当期收入 / 净利润 / 总成本 / 数据置信度，Workbench.vue:31-68），中部"今日待处理"决策卡列表（聚合异常/利润漏点/广告建议/库存四类，可按类型筛选，Workbench.vue:80-101, :155-178），右侧"使用提示"与"系统状态"面板。

数据来源：**hybrid（DB-first，mock 兜底，但两路 schema 不一致）**
- 前端只调一个接口：`dashboardApi.fetch()` → `GET /api/v1/dashboard`（api/dashboard.js:3-4）。
- 后端有两套实现，路由按是否有店铺 scope 分流：
  - **DB 路径**：`extended-routes.mjs:123-149`。仅当 `resolveScope(request)` 命中时返回 `sourceMode:'db'`，从真实 DB 读 `listActionQueue(...state:'queued')` 前 8 条 + `audit_logs` 计数。**但它返回的字段是 `summary` + `actionCards{id,title,module,risk,status,href}`，没有 `overview`，也没有 `generatedAt`。**
  - **Mock 路径**：`routes.mjs:31-33` → `buildDashboard(sampleStore)`（dashboard-engine.mjs:8-41），返回 `sourceMode:'mock'` + `overview`(聚合利润) + `generatedAt` + `actionCards`（异常 3 + 漏点 3 + 广告 3 + 补货 2，payload 在 `card.payload`）。
- 不一致风险（基于代码）：Workbench.vue 的 KPI 行读 `data.value.overview`（Workbench.vue:32），DB 路径不返回 `overview` → DB 模式下 KPI 区会空（kpis 计算返回 `[]`，Workbench.vue:33）。卡片列表读 `card.payload`（Workbench.vue:169），而 DB 路径的卡片是扁平结构无 `payload` → DB 模式下 DecisionCard 收到 undefined。**即工作台页面实际只与 mock 形态（routes.mjs/buildDashboard）完全适配；DB 形态字段对不齐。**
- 右侧"系统状态"展示 `data?.sourceMode || 'mock'`（Workbench.vue:221），并硬编码"真实写入：已关闭"（Workbench.vue:209-211）。

写入/队列语义：**无真实写入；执行经 DecisionCard 走审计中心 mock**（见 §2.5）。页面本身只读 + 刷新。

### 2.2 操作清单（旧）`/ads/actions` — `apps/web-v2/src/pages/AdsActions.vue`

业务目的：全局广告操作 Action Inbox 的旧版——按生命周期 + 利润口径 ROAS 给出的每日广告建议，顶部 3 个汇总卡（待处理建议 / 高严重度 / 需审批，AdsActions.vue:30-37），下方建议列表，可按严重度筛选（AdsActions.vue:96-101）。副标题自述"已审计中心收口"（AdsActions.vue:65）。

数据来源：**mock（纯 mock）**
- 调 `adsApi.suggestions()` → `GET /api/v1/ads/suggestions`（api/ads.js:4）。
- 后端 `routes.mjs:47-49` → `buildAdSuggestionAudits(sampleStore)`，硬返回 `sourceMode:'mock'`。
- 组件内每条卡片也硬编码 `sourceMode:'mock'`（AdsActions.vue:54）。

写入/队列语义：**无真实写入；执行经 DecisionCard → 审计中心 mock**（§2.5）。汇总里的"需审批"用 `status.includes('blocked')` 统计（AdsActions.vue:36）。

### 2.3 通知中心 `/notifications` — `Notifications.vue` + 顶栏铃铛 `NotificationBell.vue`

业务目的：全局站内/邮件/微信/企微通知聚合，红点未读计数，下拉最近 10 条，点击标记已读并跳转 `n.link`，底部"查看全部"跳 `/notifications`（NotificationBell.vue:5-6, :25-26, :38-46）。

数据来源：通过 `useNotificationsBus` 单例 + `bus.startPolling(10000)` 每 10s 轮询（NotificationBell.vue:14, :18）。来源需进一步看 `useNotificationsBus`（本次未展开，但铃铛侧为轮询拉取，非 mock 常量）。

写入/队列语义：`bus.markRead(id)` 标记已读（NotificationBell.vue:39）——有读状态写入。

### 2.4 全局壳 `DefaultLayout.vue`

业务目的：侧边栏分组导航（`main / m1-main / m2-main / m3-main / m4-main`，DefaultLayout.vue:37-43，按 `meta.group` 聚合 routes，:48-53）、底部审计/设置块（:56-58）、顶栏搜索框（仅 UI，无逻辑绑定，:226-234）、店铺切换下拉、通知铃铛、用户菜单。

关键状态标识：顶栏渲染 `realWritesEnabled`（来自 `useAppStore`，DefaultLayout.vue:15）；为 false 时显示"真实写入已关闭"标签（:259-261），并始终显示"Mock 数据已加载"标签（:262-264）。

数据来源：导航来自 `router.getRoutes()`（:46-47）；店铺/用户来自 `useLocalStore`（:23-25），切店调 `localStore.switchStore`（:27-29）。

### 2.5 决策执行组件 `DecisionCard.vue`（工作台 + 操作清单共用的"执行入口"）

这是本域真正承载"写入/队列语义"的层。证据：
- 每张卡有"一键执行"和"忽略"（DecisionCard.vue:113-117）。
- 执行调 `useAudit().submit(...)`（DecisionCard.vue:57-66）。`useAudit.js` 强制 `payload.requiresRealStoreWrite:false`（useAudit.js:16），调 `auditApi.mockExecute` → `POST /api/v1/audit/mock-execute`（audit.js:4, routes.mjs:55-60）。
- 后端 `mockExecuteAuditAction`（audit-center.mjs:91-104）：若风控不通过返回 `status:'blocked'`，否则 `status:'mock_executed'` 并明确 `message:'No external account was touched.'`。风控里 `requiresRealStoreWrite` 会直接加入阻断原因（audit-center.mjs:75-77, :87 `executionMode:'blocked_real_store'`）。
- 执行后前端把记录写入本地审计日志 + 后端 DB（`store.addAuditLog`，useAudit.js:27-42），弹"已提交审计中心"（:45-51）。
- "忽略"仅 `ElMessage.info`，无后端调用（DecisionCard.vue:69-72）。

结论：**本域所有"执行"均为 mock 执行 + 审计留痕，无真实店铺写入。**

---

## 3. 真实队列 vs mock 队列

存在一套真实的 DB 行动队列 `ad_action_queue`（建表 data-store-ads.mjs:89-120；`listActionQueue` data-store-ads.mjs:1932-1942；入队 `enqueueSuggestionAction`/`enqueueManualAction` store-routes-ads.mjs:18）。工作台 DB 路径（extended-routes.mjs:127）正是读这张表的 `queued` 项。

但是：
- 工作台 DB 路径生成的卡片 `href:'/ads/action-queue?id='`（extended-routes.mjs:144）——**该路由在 router/index.js 中不存在**（Grep `action-queue` 无匹配），是一个死链。
- 工作台/操作清单的"执行"按钮走的是 `audit/mock-execute`（§2.5），**不是** `ad_action_queue` 的真实入队/执行端点。也就是说前端工作台 UI 与真实 DB 行动队列之间没有打通的执行闭环。

---

## 4. 弹层

本域无独立 modal/drawer 弹层。仅有的"展开"交互是 DecisionCard 内联的 `ReasonChain`（"为什么这么建议"，inline 展开非弹层，DecisionCard.vue:97-111）。通知铃铛为 popover 下拉（非路由弹层）。

---

## 5. 一句话总结（每页数据来源 + 写入语义）

- `/workbench`：hybrid（DB-first/mock 兜底，但 DB 与 mock 返回 schema 不一致，页面实际仅适配 mock 形态）；只读，执行经审计中心 mock，无真实写入。证据 Workbench.vue:21/32/169、extended-routes.mjs:123-149、routes.mjs:31-33。
- `/ads/actions`（旧 Action Inbox）：纯 mock；执行经审计中心 mock，无真实写入。证据 routes.mjs:47-49、AdsActions.vue:54。
- `/notifications` + 铃铛：轮询拉取（10s），有"标记已读"写入。证据 NotificationBell.vue:18/39。
- 全局壳 DefaultLayout：导航/状态来自 router 与 store；顶栏硬标"真实写入已关闭/Mock 已加载"。证据 DefaultLayout.vue:259-264。
- 执行层 DecisionCard/useAudit：统一 `POST /api/v1/audit/mock-execute`，强制 `requiresRealStoreWrite:false`，返回 `mock_executed`，零外部账户触达。证据 useAudit.js:16/23、audit-center.mjs:91-104。
- 真实 DB 队列 `ad_action_queue` 存在但与工作台 UI 未打通；工作台 DB 卡片 href `/ads/action-queue` 为死链（路由不存在）。证据 extended-routes.mjs:127/144、data-store-ads.mjs:89/1932、router/index.js 无 action-queue。

相关文件（绝对路径）：
- `D:\amz\apps\web-v2\src\pages\Workbench.vue`
- `D:\amz\apps\web-v2\src\pages\AdsActions.vue`
- `D:\amz\apps\web-v2\src\pages\Notifications.vue` / `D:\amz\apps\web-v2\src\components\NotificationBell.vue`
- `D:\amz\apps\web-v2\src\layouts\DefaultLayout.vue`
- `D:\amz\apps\web-v2\src\components\DecisionCard.vue` / `D:\amz\apps\web-v2\src\composables\useAudit.js`
- `D:\amz\apps\web-v2\src\api\dashboard.js` / `D:\amz\apps\web-v2\src\api\ads.js` / `D:\amz\apps\web-v2\src\api\audit.js`
- `D:\amz\apps\api\src\extended-routes.mjs` / `D:\amz\apps\api\src\routes.mjs` / `D:\amz\apps\api\src\full-scope-routes.mjs`
- `D:\amz\apps\api\src\data-store-ads.mjs` / `D:\amz\apps\api\src\store-routes-ads.mjs`
- `D:\amz\packages\domain\src\dashboard-engine.mjs` / `D:\amz\packages\domain\src\audit-center.mjs`

## 第 1 轮

## 第1/10轮 · 全局工作台 + 全局 Action Inbox · 可读证据记录

### 各角色核心主张
- **产品经理A(增长/效率)**：主张当前工作台"最大问题不是 UI 细节，而是前后端契约断裂导致主路径数据为空"，工作台对真实卖家是空壳/报错页，"一键执行→审计中心"闭环在主路径跑不通。点名 KPI/分组/payload 全空、全局搜索框是死控件、AdsActions 被标"(旧)"事实下架。
- **产品经理B(风险/合规/真实性)**：主张护栏是"安全剧场(security theater)"——`realWritesEnabled`/Mock 标签/可回滚全是硬编码声明，与后端开关脱钩，比无护栏更危险(给运营虚假安全感)。强调"空态/失败态/已清空"三态混淆会把故障伪装成"今日无事"。
- **资深开发(工程/契约)**：立硬事实基线——dashboard 响应与前端消费字段几乎完全错位(overview/generatedAt/type/payload 全对不上)，逐字段核对确认 `kpis` 在 `ov===undefined` 时 `return []`、`filteredCards` 按 `c.type` 恒筛空、`:card="card.payload"` 传 undefined。指出 AdsActions(`:card="card"`)与 Workbench(`:card="card.payload"`)对同一组件入参约定相反。
- **测试工程师(可验证性)**：把每条降维成可断言契约测试，抓住"mock 态 vs 登录 DB 态两条 codepath 契约分叉"为根因，并指出 AdsActions `summary.high`/`summary.blocked` 是 false-negative(恒为 0)。预先设防：任何"工作台正常"的乐观结论必须分两条 codepath 验证。

### 代码核验结果(主持人实测)
1. **契约分叉确认且为根因**：`routes.mjs:32` → `buildDashboard(sampleStore)` 返回富结构 `{sourceMode,overview,actionCards[].type/.priority/.payload}`(dashboard-engine.mjs:32-46);`extended-routes.mjs:130-147` DB 分支返回 `{sourceMeta,store,summary,actionCards[].id/title/module/risk/status/href/auditRequired}` —— **无 overview/type/payload/priority/generatedAt**。两端形状不同构。
2. **【交锋点·修正 PM-A/PM-B 的"无 scope→404/stub"论断】**：实测 `extended-routes` 在 `if(scope)` 块内**无 else/return**,无 scope 时**fall-through 到 line 157 `handleRequest`**,而 `handleRequest`(routes.mjs:32)正是富结构 `buildDashboard`。因此**未登录/Demo 态实际拿到的是完整富 mock 数据,工作台 KPI/卡片可正常渲染**。PM-A/B 所述"Demo 首屏即加载失败/404"在当前路由顺序下**不成立**;真正坏的是**已登录 DB 态**(测试工程师的"DB 分支才是残缺契约"判断更准确)。这是本轮最重要的交锋纠偏。
3. **前端 DB 态确实全断**:Workbench.vue:32(读 overview)、74-77(按 priority)、90/96-99(按 type)、169(`:card="card.payload"`)逐条确认——DB 字段全缺,这些消费在 DB 态全部退化为空。
4. **护栏硬编码确认**:app.js:8 `realWritesEnabled:false` 无 action 写;DefaultLayout.vue:259-263 两个标签硬编码(且"Mock 数据已加载"绿标无条件渲染);Workbench.vue:209-211 "真实写入/已关闭"写死;均不消费 `sourceMeta.realWritesEnabled`(extended-routes.mjs:132 已有真实值)。PM-B"安全剧场"判断成立。
5. **闭环/反馈缺陷确认**:useAudit.js:16 `requiresRealStoreWrite:false` 硬编码;DecisionCard.vue:69-72 reject 仅 ElMessage 无持久化(文案却称"反馈已记录");Workbench/AdsActions 均未绑 `@execute/@reject`(事件被丢弃);DecisionCard.vue:36 `auditRequired ?? true` 默认 true 掩盖真实丢失;Workbench.vue:108-110 refresh 不 await load 即弹"已刷新"。
6. **AdsActions 统计 false-negative 确认**:`summary.blocked` 用 `status.includes('blocked')`,而 createAuditAction 初始 status 不含 'blocked'→恒 0;`summary.high` 读 `expectedImpact.priority`(实际严重度在 `risk.severity`)→恒 0。

### 主要交锋
- A/B 与开发/测试在"哪条 codepath 坏"上分歧:A/B 认为无 scope/Demo 态坏,实测证明**DB 态才坏、mock 态正常**(经路由 fall-through 核验)。结论采纳测试工程师口径。
- 安全不变量校验:useAudit `requiresRealStoreWrite:false` 仅前端一处约束;**后端是否有强制写入闸门(服务端校验该字段、绕不过 ad_action_queue)尚未核验**——PM-B 提出的"护栏是否可被绕过"待后端链路下一轮验证。

- 共识: 根因是 GET /api/v1/dashboard 存在两套不同构契约:mock/base 分支(routes.mjs:32 buildDashboard)返回富结构 {overview, actionCards[].type/.priority/.payload, sourceMode},DB/scope 分支(extended-routes.mjs:130-147)返回残缺结构(无 overview/type/payload/priority/generatedAt)。这是 P0,必须统一。; 已登录真实(DB)用户的工作台主路径数据全断:4 张 KPI 卡不渲染、四个分组 tab 恒 0、决策卡因 :card=card.payload(payload 缺失)收到 undefined 渲染为空。; 护栏/数据来源标识在前端是硬编码:app.js realWritesEnabled 恒 false 且无 action 写、DefaultLayout 两标签写死、Workbench 系统状态卡写死,均不消费后端 sourceMeta.realWritesEnabled——属误导运营的安全真实性缺陷。; DecisionCard 的 execute/reject 闭环不完整:reject 不持久化(文案却称已记录)、父组件未绑定 @execute/@reject、execute 无 loading/防重入、auditRequired 默认 true 掩盖真实值。; AdsActions 顶部汇总卡 summary.high 与 summary.blocked 因字段口径错位恒为 0(false-negative),与下方列表过滤口径(risk.severity)自相矛盾。; Workbench refresh() 未 await load 即弹'已刷新',属 false-positive 反馈;且 KPI 空态把 HTTP 200 成功+缺 overview 误显示为'数据加载失败'。; DecisionCard 被 Workbench(:card=card.payload)与 AdsActions(:card=card)以相反入参约定调用,必有一处错,需统一为单一 props 契约。
- 分歧: 无 scope/Demo 态工作台是否'坏':PM-A/PM-B 主张未登录态首屏即'加载失败/404'是 P0;主持人实测证明 extended-routes 无 scope 时 fall-through 到 routes.mjs buildDashboard 富 mock 结构,Demo 态实际可正常渲染。分歧点是路由 fall-through 行为是否被 A/B 误读——倾向采纳'DB 态才是残缺契约'(测试工程师)口径,但需下一轮 e2e 实跑两条 codepath 终判。; 契约统一方向:后端把 DB 分支补成与 buildDashboard 同构(单一可断言 schema,开发/测试主张)vs 前端做双形状兼容适配——倾向后端统一,但对 AdsActions/审计中心等其它消费方的影响范围未定。; '一键执行永远 mock'(useAudit requiresRealStoreWrite:false)是临时阉割还是终态设计:若终态,则整套'真实写入开关'UI 文案均属误导应改;若临时,真实写入打开后的二次确认/审批/回滚验证全链路归属未定。; 全局 Action Inbox(DefaultLayout 角标/跨页未读数)是已规划未实现的缺陷,还是产品已砍而种子文档过期——影响该项按 bug 还是按文档维护处理。
- 决策: P0:统一 dashboard 契约。DB 分支(extended-routes.mjs:130-147)必须补齐 overview(复用 data-store-profit aggregateProfit/dashboard-engine 已有结构)与 generatedAt,并把 actionCards 映射为与 buildDashboard 同构的 {type, priority, payload:{...evidence/expectedImpact/confidence/recommendation}}。配 contract test 断言两条 codepath 的 keys 为超集关系且每张 card 同时含 type/priority/payload。; P0:护栏/数据来源状态必须由后端 sourceMeta(realWritesEnabled/sourceMode)驱动写入全局 app store,前端禁止硬编码安全文案;真实写入开启时必须高危红色提示。严守安全不变量:无真实 Amazon 凭证时不得显示'真实数据/real'。; P0:DecisionCard 推理链/payload 为空时禁用'一键执行'并提示'缺少依据不可执行',杜绝无证据决策诱导盲目执行。; 统一 DecisionCard 入参契约为传规范化 card 整体(:card=card),废弃 :card=card.payload 写法;两端由一份共享 schema 约束。; 三态分离:KPI/列表区必须区分'加载失败(error 非空)'、'返回成功但无数据(引导接店铺/同步)'、'确实无待处理'三态,禁止把成功响应或故障渲染成'已处理完成'或笼统'加载失败'。; execute 增加 loading/防重入并在成功后乐观置灰移除卡片;reject 必须落库(否则删除'反馈已记录'文案);父组件绑定 @execute/@reject 刷新列表与计数。; 安全不变量复核(下一轮后端视角):核实服务端是否强制校验 requiresRealStoreWrite 且所有写操作必经 ad_action_queue,确认护栏不可被前端绕过。

## 第 2 轮

## 第2/10轮 辩论记录：全局工作台 + 全局 Action Inbox

### 本轮核心交锋与定性收敛

**1. DB(绑店付费)态契约残缺 — 四方一致夯实为 P0，定性升级**
- 产品经理A 从增长视角加码：付费用户恰是绑店 DB 态，他们看到的工作台是产品价值的全部证据。extended-routes.mjs:138-146 的 `actionCards` 只输出 `{id,title,module,risk,status,href,auditRequired}`，缺 `type/priority/payload/overview/generatedAt`，导致首屏 4 张 KPI 空、四个分组 tab 恒 0、决策卡全空 → "唯一会付费的用户群体打开即故障"。
- 资深开发 实跑确认并扩大影响面：`GET /api/v1/ads/suggestions` 在 extended-routes.mjs 中**根本没有 DB 分支**，只落到 routes.mjs:47-49 返回 mock audits。结论：同一登录会话内"工作台=db残缺 / 广告清单=mock满血"两套真相并存，证明后端契约碎片化是**系统性**的，统一方案必须把 ads/suggestions 一并纳入。
- 测试工程师 纠偏上一轮"keys 超集断言"过严：mock 与 db 两者字段集**不相交**而非超集，正确契约测应断言"DB actionCards 每张同时含 type && priority && payload 三键"。
- **本人核对确认**：extended-routes.mjs:130-147 DB 分支返回体确无 overview/generatedAt，actionCards 确缺 type/priority/payload。

**2. 安全标识与后端状态脱钩 — 四方一致定为 P0，违反安全不变量**
- 产品经理B(风险/合规视角) 实跑判定为"安全剧场"：app.js:8 `realWritesEnabled` 恒 false 且全仓无任何 mutation(测试工程师 Grep 确认 store 仅 toggleSidebar 一个 action)；DefaultLayout.vue:262-264 "Mock 数据已加载"无 v-if 恒显；Workbench.vue:209-211 "真实写入已关闭"写死。后端 extended-routes.mjs:132 已返回 `sourceMeta.realWritesEnabled=process.env.REAL_WRITES_ENABLED==='true'`，前端完全不消费。
- 危险反向 case(测试工程师夯实)：即便后端 `REAL_WRITES_ENABLED=true`/sourceMode=db，顶栏仍恒显"Mock 数据已加载"+"真实写入已关闭"→ 运营在真实写入开启时仍以为是 Mock，false 安全保证可诱导误操作真实店铺。

**3. 护栏真伪 — 本轮取得关键终判(此前列为未决)**
- 产品经理B + 资深开发 + 测试工程师 三方实跑核对护栏链。**本人核对确认**：audit-center.mjs:75 `if(payload.requiresRealStoreWrite)` 才阻断、:87 executionMode 据此分支；但该判定读取的是**前端可控的 payload 字段**，而 useAudit.js:16 硬编码 `requiresRealStoreWrite: false`，使阻断分支永不触发。真实写入路径仅存在于 full-scope-routes.mjs:230(revert)/:458(M3 enqueue，置 true)，DecisionCard/Workbench/AdsActions 均不调用这些路径。
- 资深开发 精确定性(纠正产品经理B"可被前端绕过"的措辞)：不是"可被绕过"，而是"前端把所有写钉死成 mock，真护栏形同虚设、真实写入链路无任何 UI 入口"，"一键执行永远 mock"是**当前事实终态**而非临时阉割。
- **新增风险点(本人核对)**：服务端 assessRisk 被动信任前端 payload.requiresRealStoreWrite，不按 REAL_WRITES_ENABLED 强制覆写 → 若前端传 false 即绕过闸门。这直接触碰"不得绕过 ad_action_queue"的安全不变量。

**4. AdsActions 汇总卡口径错位 — 定为 P1，根因被精确化**
- 产品经理B 纠正上一轮措辞并加一层：summary.high(AdsActions.vue:34) 读 `expectedImpact?.priority||target?.priority`，summary.blocked(:36) 读 `status.includes('blocked')`。
- 测试工程师 给出可断言根因：createAuditAction(audit-center.mjs:49-58) 的 target/expectedImpact **均无 priority 字段**，严重度只在 `risk.severity`(值域 high|medium|low)；suggestions 端 status 只产出 `approved_for_mock_execution|pending_approval`，'blocked' 仅由 executeAuditAction:93 在执行后出现。故两卡**恒 0**。下方列表却用 `risk.severity==='high'` 过滤(:58) → 同屏"高严重度 0"但列表筛"高"有数据的确定性自相矛盾。
- 产品经理B 追加语义层批判："需审批"标签用 'blocked' 过滤是双重错位(语义错 + 数据永不命中)，应改用 `risk.requiresApproval`。

**5. AdsActions 是否孤儿页 — 产品经理A 主张直接定性下线**
- 产品经理A 纠偏上一轮"双入口之争"：router/index.js:86 `/ads/actions` meta 为"操作清单（旧）"且**无 group 字段**，DefaultLayout.vue:48-52 按 meta.group 过滤导航 → 此页不在侧边栏、用户点不到，是已被产品事实弃用的孤儿页，应判为待删冗余，工程力集中到 Workbench 单一 Inbox。

**6. reject 不落库 — 从 UX 瑕疵升级为合规审计链断裂**
- 产品经理B(合规视角)定性升级：DecisionCard.vue:70 `ElMessage.info('已忽略，反馈已记录')` 是**明确的虚假审计承诺**。运营忽略一条 P0 异常(如 Buy Box 丢失)后系统宣称"已记录"实则无落库，事后追责无法举证运营曾主动决策忽略 → 审计链断裂，非 UX 瑕疵。父组件 Workbench:166-170 / AdsActions:105 均未绑定 @reject，emit 落空。

**7. execute 闭环缺失 + 三态混淆 — P0/P1**
- 四方一致：DecisionCard execute 无 loading/防重入(可连点重复提审)；成功后卡片不移除、计数不刷新；refresh()(Workbench:108-111)不 await load 即弹"已刷新"(false-positive)。
- 测试工程师 标出最危险 false-positive：Workbench:130 把 HTTP200+缺 overview 误渲染"数据加载失败"(且 description 为空串)，:171-176 把伪空列表渲染"所有事项都已处理完成"→ 逻辑互斥两文案同屏，运营误以为店铺无风险而离开。

### 被反驳/修正的观点
- 上一轮"Demo 态加载失败"被测试工程师代码坐实为**误读**：extended-routes.mjs:123-149 dashboard 分支被 `if(scope)` 整体包裹，无 scope 时 fall-through 到 routes.mjs:32 buildDashboard 富结构，Demo 态满血。问题只在 DB 态。
- 上一轮"AdsActions 是双入口"被产品经理A 反驳：它是路由层已隐藏的孤儿页，不该作双入口争论。
- 上一轮"keys 超集断言"被测试工程师收紧为"三键齐全断言"(字段集不相交)。
- 产品经理B"护栏可被前端绕过"被资深开发精确化为"前端把写钉死 mock、真护栏形同虚设"(当前终态)。

- 共识: DB(绑店)分支契约残缺是 P0：extended-routes.mjs:138-146 actionCards 缺 type/priority/payload，返回体缺 overview/generatedAt，与 buildDashboard 富契约字段集不相交，导致付费用户工作台 KPI/分组tab/决策卡全断。四方一致并经主持人核对确认。; 契约碎片化是系统性的：GET /api/v1/ads/suggestions 在 extended-routes.mjs 无 DB 分支(只返回 routes.mjs mock audits)，同一登录会话出现'工作台=db残缺 / 广告清单=mock满血'两套真相。统一方案必须连带 ads/suggestions。; 安全标识与后端脱钩是 P0 且违反安全不变量：app.js:8 realWritesEnabled 恒 false 无 mutation，DefaultLayout.vue:262-264 'Mock 数据已加载'无条件恒显，Workbench.vue:209-211 写死，均不消费后端 sourceMeta.realWritesEnabled(extended-routes.mjs:132 已返回)。真实写入开启时 UI 仍显'已关闭/Mock'是危险 false 安全保证。; 护栏定性达成共识：audit-center.mjs:75 闸门真实存在但读取前端可控的 payload.requiresRealStoreWrite，useAudit.js:16 硬编码 false 使闸门永不触发；真实写入链路(full-scope-routes.mjs:230/458)无任何工作台 UI 入口。'一键执行永远 mock'是当前事实终态。; DecisionCard 闭环缺失：execute 无 loading/防重入，成功后卡片不移除、计数不刷新；reject 不落库却宣称'反馈已记录'(虚假审计承诺/审计链断裂)；父组件 Workbench:166-170 与 AdsActions:105 均未绑定 @execute/@reject。; Workbench 三态混淆：200+缺overview 被误渲染为'数据加载失败'(description空串)，伪空列表被渲染为'所有事项都已处理完成'，两互斥文案可同屏，误导运营以为无风险。; AdsActions 顶部汇总卡 summary.high/summary.blocked 因读取不存在的 priority 字段与错误 status 语义而恒 0，与下方按 risk.severity 过滤的列表自相矛盾(可截图回归)。; DecisionCard 入参契约不一致：Workbench :card=card.payload(DB态为undefined) vs AdsActions :card=card 整卡，方向相反必有一处错，应统一为规范化整卡。; 上一轮'Demo态加载失败'是误读：无 scope 时 fall-through 到 buildDashboard 富结构，Demo 态满血，问题仅在 DB 态。
- 分歧: AdsActions(/ads/actions) 处置：产品经理A主张直接删除并入 Workbench 单一 Inbox(理由:router meta 无 group 已是路由层孤儿页)；产品经理B/资深开发倾向先由产品定性再决定合并 vs 保留为深链入口。需产品最终拍板。; 契约统一责任面：资深开发倾向后端统一(DB分支补成与 buildDashboard 同构)；但 AdsActions 走另一端点、审计中心是否同源化为单一 schema 未达成一致，连带改动清单未定。; auditRequired/审批真值在 DB 态因取 card.payload 路径丢失的修复时序:是等契约统一一并修，还是前端先兜底取 card.auditRequired 临时止血——优先级有分歧。; 全局 Action Inbox 是按缺陷补实现(单一数据源+单一卡片契约+跨页未读store+轮询+已读清零)还是按文档过期下线，未定，直接决定是否进回归用例集。
- 决策: 判定 DB 分支契约残缺为本域 P0 头号项：后端必须为 GET /api/v1/dashboard 的 DB 分支补 overview(复用 aggregateProfit)+generatedAt，并把 actionCards 映射为 {type,priority,payload:{id,evidence,expectedImpact,confidence,recommendation,auditRequired}} 与 buildDashboard 同构；配契约测断言两 codepath 每张卡含 type&&priority&&payload 三键(三键齐全，非超集)。; 判定安全标识脱钩为 P0：建立全局唯一真相源——dashboard 响应 sourceMeta(sourceMode/realWritesEnabled)写入 appStore(新增 setSourceMeta action)，顶栏+各页系统状态卡均消费该 store；realWritesEnabled===true 时顶栏强制红色高危'真实写入已开启-将影响真实店铺'；无真实凭证(sourceMeta.mock!==false)时禁止出现 'real/真实数据'字样。严守安全不变量。; 判定护栏'安全剧场'需双向修复：(a)前端 requiresRealStoreWrite 必须由 appStore.realWritesEnabled 驱动而非硬编码 false，使真实闸门可被触发与测试；(b)服务端在 mock-execute/真实执行入口按 REAL_WRITES_ENABLED 强制覆写 requiresRealStoreWrite、不信任前端值，确保不可被前端绕过 ad_action_queue(安全不变量)。; 判定 DecisionCard 闭环为 P0：父组件绑定 @execute/@reject；execute 加 submitting ref + :loading + :disabled 防重入，成功后乐观移除卡片并刷新 cardSummary；reject 必须落库(dismissed 含 reason/operator/time)或删除'反馈已记录'文案；payload/evidence 为空时禁用一键执行并提示'缺少依据不可执行'。; 判定 Workbench 三态必须分流：error 非空=加载失败(可重试)；200 但无 overview=引导接店铺/触发同步(转化动作)；确实无卡=今日无待处理。禁止把缺数据渲染成'已处理完成'。refresh 改 async/await load 后再按 error 决定提示。; 判定 AdsActions summary 口径统一:high 改 risk.severity==='high'、需审批改 risk.requiresApproval===true(删除 blocked 语义)，与下方列表过滤同源。

## 第 3 轮

## 第3/10轮 · 全局工作台 + 全局 Action Inbox · 证据记录

### 本轮基调
四角色一致从「定性」转向「可断言」与「商业/安全后果」。主持人对六项核心代码主张逐一 Read 复核，全部坐实（见下「主持人复核」）。

### 各角色主张

**产品经理A（增长/转化视角）**
- 提出**商业模式倒挂**新论点：富结构体验（dashboard-engine.mjs:8-38 含 overview/priority/type）只服务不付钱的 Mock 演示态；DB 分支（extended-routes.mjs:130-147）只回 summary+残缺 actionCards，**付费绑真店用户首屏四张 KPI 恒空 → 渲染「数据加载失败」**。结论：最完整体验给 Demo 观众，空壳给付费客户。
- 升级两项 carryForward 为「已确认断裂」：(a) 空态无任何同步/接店 CTA（Workbench.vue:171-176），integrations.js:22 有 syncAll 但工作台不调用 → 新用户激活闭环=0；(b) `reject` 仅 `ElMessage('反馈已记录')` 无落库 → 工作台沦为只读看板而非待办收件箱。
- 反驳上一轮「AdsActions summary 恒0 仅口径矛盾」→ 应升 P1：summary.blocked 恒0 让卖家误以为「零项需审批可放心批量执行」，**诱导误操作**。

**产品经理B（风险/合规/真实性视角）**
- 强化安全标识 P0 根因：不是「忘了消费」而是**链路物理断开**——app.js:8 `realWritesEnabled` 恒 false 且全 store 无 setter（仅 toggleSidebar），dashboard.js 从不回写 store。后端已返回真值前端无路径消费 → 真开真写时顶栏仍打绿标「Mock已加载/真实写入已关闭」=合规级双重虚假安全承诺。
- **坐实护栏可绕过**：audit-center.mjs:75 闸门只读 payload.requiresRealStoreWrite；useAudit.js:16 硬编码 false；routes.mjs:58 mock-execute 透传前端 body 不按 REAL_WRITES_ENABLED 覆写。结论：「一键执行」走的是结构上永不触发真实写入闸门的路径——安全剧场 与 真上线无写入能力，二者必居其一，都是 P0。
- 纠偏「通知没做」：NotificationBell 是**真实 10s 轮询单例 bus**，问题是**通知流与决策卡 Inbox 两套互不相通的真相**，两个「待办」计数永远对不上。
- 反驳A「直接删 AdsActions」：它是当前**唯一暴露 risk.severity 真口径**的页面，删前必须先确认 Workbench DB 分支补齐。

**资深开发（工程可实现性视角）**
- 把契约残缺压成精确差集并给回归断言：buildDashboard 卡={type,priority,title,payload} vs DB 卡={id,title,module,risk,status,href,auditRequired}，**交集仅 title**。
- 修正上一轮「入参方向相反必有一处错」→ 给出明确答案：DecisionCard.c.computed 本就是按归一化整卡设计，**Workbench.vue:169 传 card.payload 是错的一方**（payload 内是 anomaly/leak 原始对象，字段名 anomaly.severity 而非 severity，DB 态更是 undefined），AdsActions:105 传整卡是对的 → 统一传归一化整卡。
- **新增全员漏掉的真 bug**：DecisionCard.execute（:57-67）`await submit()` 的返回值 `{ok}` 被丢弃，被 audit 阻断（ok:false）仍无条件 `emit('execute')` → 一旦实现「成功后乐观移除」会移除一张被阻断的卡，**乐观更新无回滚补偿**。

**测试工程师（可验证性视角）**
- 补强：DB 契约残缺是 100% 可断言、零 false-positive 的头号 P0（`expect(card).toHaveProperty('type'/'priority'/'payload')` 当前必 fail）。
- 反驳上一轮「reject 不落库=闭环缺失」混谈 → **收紧测试口径**：execute 侧确实落库（auditApi.mockExecute+addAuditLog，断言 audit_logs +1 当前可过），把它写进失败用例就是 false-positive；execute 真正缺陷是**无防重入**（双击=两条 pending 审计行，可截图）。reject 侧才是 dismissed 行数应+1 当前必 fail。
- 指出**最毒的测试盲区**：真实写入态（REAL_WRITES_ENABLED=true）目前**没有任何前端可触发路径**（app.js:8 是死常量）→「顶栏危险文案」E2E 在修通 setSourceMeta 前根本无法编写，回归集存在结构性覆盖盲区。

### 主要交锋点
1. **AdsActions 删 vs 留**：A 主张直接删并入单一 Inbox（孤儿页 router/index.js:86 无 group、标题「（旧）」用户触达不到=维护死代码）；B+开发主张「Workbench DB 分支补齐前不得删」（当前唯一真 severity 入口）。开发折中：保留路由作 redirect→/workbench?filter=ad_suggestion 薄重定向、删页面组件。→ 收敛为「删除**时机**」而非「删不删」。
2. **DecisionCard 入参方向**：上一轮悬而未决，本轮开发+测试一致判定 Workbench 传 .payload 为错方，统一归一化整卡。已收敛。
3. **「一键执行永远 mock」是终态还是临时**：决定全部安全文案与定价话术真伪，四人一致认为**这是商业拍板不是技术问题**，必须由产品定。
4. **乐观移除 vs 队列语义**：开发指出 audit verdict 是 'pending'（useAudit.js:36）非终态成功，splice 移除会让运营误以为「已完成」而非「已入队待审」→ 应置灰标「已入队」而非移除。

### 主持人复核（已 Read 坐实）
- useAudit.js:16 `requiresRealStoreWrite: false` 硬编码 ✓；:52/:56 确返回 `{ok}` → 证实 execute 丢弃返回值 bug ✓
- app.js 仅 `realWritesEnabled:false` 常量 + 仅 toggleSidebar action，无 setter ✓
- extended-routes.mjs:130-147 DB 分支无 overview/generatedAt，actionCards 无 type/priority/payload ✓
- DecisionCard.vue:57-67 execute 丢弃返回值且无条件 emit；:69-72 reject 仅 ElMessage ✓
- **安全关键**：routes.mjs:58 `createAuditAction(body)` 透传前端 body 不覆写 requiresRealStoreWrite；audit-center.mjs:75 闸门只读该前端字段；mock-execute 是独立于 ad_action_queue 的入口、永不入队 ✓ → 前端伪造 `requiresRealStoreWrite:true` 会被 block，但伪造 false 则畅通无阻进 mock 且不入队，安全裁决信任客户端值，违反「服务端裁决」不变量。

- 共识: DB 分支契约残缺为头号 P0 且 100% 可断言：extended-routes.mjs:130-147 缺 overview/generatedAt，actionCards 与 buildDashboard 富契约交集仅 title，导致付费绑店用户 KPI 恒空、四个分组 tab 计数恒0、决策卡渲染崩坏/空壳——付费用户首屏即「数据加载失败」; 顶栏/系统状态卡安全标识与后端真值物理断链为 P0：app.js:8 realWritesEnabled 是无 setter 的死常量，dashboard.js 不回写 store，后端 extended-routes.mjs:132 已返回真实 realWritesEnabled 但前端无任何代码消费 → REAL_WRITES_ENABLED=true 时 UI 仍显「Mock已加载/真实写入已关闭」，是不可被测试触发的虚假安全承诺; 护栏可被客户端绕过（坐实）：useAudit.js:16 硬编码 requiresRealStoreWrite:false + routes.mjs:58 透传前端 body 不按 REAL_WRITES_ENABLED 强制覆写 + audit-center.mjs:75 闸门只读该前端字段；且 mock-execute 是独立于 ad_action_queue 的入口永不入队——「一键执行」结构上永不触发真实写入闸门; DecisionCard 入参契约方向之争已收敛：统一传归一化整卡，Workbench.vue:169 传 card.payload 为错方，AdsActions:105 传整卡为对方; DecisionCard.execute 丢弃 submit 返回值 {ok} 且无条件 emit('execute')（已 Read 坐实 useAudit 返回 {ok}），叠加无 submitting/loading 防重入 → 双击产生两条 pending 审计行、被阻断的卡也会被乐观移除; reject 仅 ElMessage('反馈已记录') 无任何持久化 = 虚假审计承诺；父组件 Workbench/AdsActions 均未绑定 @reject，卡片不消失，体验自相矛盾; AdsActions 顶部汇总卡口径错配：summary.high 读 expectedImpact/target.priority（实际在 risk.severity）、summary.blocked 读 status.includes('blocked')（mock 无 blocked 态）→ 恒0，与下方按 risk.severity 过滤的列表自相矛盾，诱导误判风险为0; AdsActions(/ads/actions) 是 router 无 group 的孤儿页（标题「操作清单（旧）」），与 Workbench 走不同端点构成双真相，但删除时机需待 Workbench DB 分支补齐后; NotificationBell 是真实 10s 轮询单例 bus，问题不是通知没做，而是通知流与决策卡 Inbox 两套互不相通的真相，两个「待办」计数永远对不上；Workbench 仅 onMounted 拉一次、execute/reject 后不刷新; 新用户激活闭环断裂：DB 空数据被误渲染为「加载失败」或「所有事项都已处理完成」，空态无任何同步/接店 CTA（integrations.js:22 有 syncAll 但工作台不调用）
- 分歧: AdsActions 处置时机：A 主张直接删除并入单一 Inbox（孤儿页=维护死代码）；B 主张 Workbench DB 分支补齐前不得删（当前唯一真 severity 入口）；开发折中为 redirect→/workbench?filter=ad_suggestion 薄重定向+删页面组件。收敛为「删除时机」分歧而非「删不删」; 归一化层放哪：开发倾向「后端 DB 分支直接产出与 buildDashboard 同构整卡（前端零改）+ 前端薄 normalize 双保险」；是否把 audit 形态(ads/suggestions)并入同一 schema 未定; 乐观更新语义：execute ok:true 即 splice 移除卡片 vs 置灰标「已入队待审」——开发指出 audit verdict 是 pending 非终态成功，移除会误导运营以为「已完成」，需产品+M3 定状态机终态; 契约回归测严格度：断言「精确三键集」(防字段漂移但合理扩展会误报) vs 「至少含三键」(放过未来漂移)，测试团队需定 schema 严格度
- 决策: DB 分支必须与 buildDashboard 同构：后端补 overview=aggregateProfit(含 confidence)+generatedAt，actionCards 映射为 {type,priority,payload:{id,evidence,expectedImpact,confidence,recommendation,auditRequired}}；前端统一传归一化整卡（删 Workbench.vue:169 的 .payload）。配契约测：遍历 mock 与 db 两 codepath 每卡断言含 type&&priority&&payload 三键且 payload 含稳定 id; 安全不变量执行（不可妥协）：服务端 mock-execute(routes.mjs:55) 与真实执行入口必须按 process.env.REAL_WRITES_ENABLED 强制覆写 requiresRealStoreWrite、不信任前端 body；前端 requiresRealStoreWrite 由 appStore 驱动仅用于使闸门可测。无凭证时禁止伪装 real、禁止绕过 ad_action_queue; 新增 appStore.sourceMeta state + setSourceMeta action，dashboard 响应后写入；顶栏与 Workbench 系统状态卡统一消费该 store：realWritesEnabled===true 强制红色高危「真实写入已开启·将影响真实店铺」；sourceMode==='db'/sourceMeta.mock!==false 时禁止出现「Mock已加载」「真实数据」字样; DecisionCard.execute 改 const r=await submit(...); if(!r.ok) return;（阻断不 emit）+ submitting ref + :loading/:disabled 防重入；父组件绑 @execute 后乐观置灰标「已入队待审」并刷新 cardSummary（非直接 splice，因 verdict 为 pending）; reject 二选一：真落库 dismissed 记录(reason/operator/time) 或删除「反馈已记录」文案改「本次会话已隐藏」。在未持久化时禁止宣称「已记录」; AdsActions 汇总卡 summary.high 改 a.risk?.severity==='high'、需审批改 a.risk?.requiresApproval===true（删 blocked 语义），与列表 :57 过滤同源；最佳做法直接复用 cards.value 计算汇总（单一数据源）; Workbench 三态分流：error 非空=失败(带重试)；200 无 overview=引导接店/触发同步 CTA(调 integrations syncAll)；确无卡=今日无待处理。refresh 改 async await load
