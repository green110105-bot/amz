# 功能域辩论证据: M4 监控 (异常/Review/跟卖/侵权/申诉/竞品/通知/日报)

## 清单梳理

I have all the evidence needed. Here is the complete clinical inventory.

# M4 监控域 — 逐页/逐 tab/弹层清单

数据来源结论先行：**整个 M4 域全部走真实数据库（13 张 `m4_*` 表 + `reviews`/`notifications_read` 表）**，前端页面无 localStorage/硬编码 mock。所有页面通过 `apps/web-v2/src/api/m4.js` 或 `composables/useM4State.js` 调用 `/api/v1/store/m4/*`（`store-routes-monitor.mjs`）→ `data-store-monitor.mjs`。表建于 `data-store-monitor.mjs:99-426`（`initMonitorSchema`）。
所谓「mock」语义只出现在两处：① 种子数据由 `mulberry32(hashStr(...))` 确定性生成并**真实落库**（`scan/sync/snapshot/recompute` 系列函数）；② 日报 BFF 的 `sourceMeta.mock` 标志，依据 `providerMode()`+`sync_runs` 判断底层 SP-API/Ads 是否有真实同步（`store-routes-monitor.mjs:100-120`）。

跨模块写语义统一为**队列态、不直接外写**：所有 M4→M3（广告暂停/恢复/品牌反击）都只写 `ad_action_queue`（state=`'queued'`, `dry_run=1`, `audit_required=1`, guardrail=`needs_review`），见 `enqueueM3ReviewAction`（`data-store-monitor.mjs:13-69`）。所有 M4→Amazon 外部动作（test-buy / 申诉 / 侵权投诉提交）都是**人工取证录入**，强制 `externalWrite:false`，不调外部 API。

---

## A. 主入口（group `m4-main`）

### 1. 运营风险工作台 `M4OpsWorkbench.vue` — `/m4/workbench`
路由 `router/index.js:106`。聚合页，含 4 个 tab（`M4OpsWorkbench.vue:341/376/386/396`），各 tab 是 router-link 卡片墙跳深链，自身只读聚合：
- `inbox` 风险收件箱 / `voice` 客户声音 / `competitors` 竞品雷达 / `learn` 处置与复盘。
- 数据：`anomaliesApi.list({})` 等真实聚合（`M4OpsWorkbench.vue:5-17,111`）。**只读**，写动作下放到深链页。

### 2. 每日监控日报 `M4DailyReport.vue` — `/m4/reports/daily`（旧 `/m4/daily-report` 重定向，`router:104-105`）
- 业务目的：店铺/链接维度的销量/GMV/广告花费/评分/类目排名/告警 7 日趋势 + 行动建议聚合快照。
- 数据来源：**hybrid（只读 BFF）**。`dailyReportsApi.get` → `buildDailyReport`（`store-routes-monitor.mjs:368-458`）实时拼装 M2 订单（`m2_orders`）、M3 广告日报、M4 评分快照/竞品 BSR/异常/通知/M2 告警。每字段带 `sourceMeta.mock` 真实/占位标志（`:79-120`）。
- 写语义：**无写入**，纯只读快照。`triggerType` 默认 `on_demand`，schedule 仅声明 `fixed_time 09:30`，无真实定时任务。

---

## B. 监控（group `m4-monitor`）

### 3. 异常列表 `MonitorAnomalies.vue` — `/monitor/anomalies`（`router:108`）
- 目的：运营异常事件中心（含 P0-P3 分级、按 severity/status/assignee/sku/asin/q 过滤）。
- 数据：`useAnomalies`→`anomaliesApi`（`MonitorAnomalies.vue:13`）→ `listAnomalies`/`anomalySummary`（`store-routes-monitor.mjs:502-512`, `data-store-monitor.mjs:717-740`）。db。
- 写：**真实 db 状态机写入** — create/assign/acknowledge/resolve/dismiss/escalate（`store-routes:513-536`，`data-store:770-871`），每步写 `m4_sla_events`（`insertSlaEvent` 760）+ 审计。

### 4. SLA 看板 `SLABoard.vue` — `/monitor/sla`（`router:109`）
- 目的：异常处置时效看板（响应/解决耗时）。`useSLABoard`（`SLABoard.vue:10`）。
- 数据：`slaApi.board/events` → `slaBoard`/`listSlaEvents`（`store-routes:541-546`，`data-store:872-932`）。db **只读聚合**，无写。

### 5. 处置案例库 `ResolutionCases.vue` — `/monitor/cases`（`router:110`）
- 目的：可复用处置 SOP 案例库 + 按异常推荐。`useResolutionCases`（:9）。
- 数据：`resolutionApi` → `listCases/getCase/recommend`（`store-routes:551-576`）。db。
- 写：**真实** create/update（`data-store:948-988`）。

### 6. 复盘报告 `Postmortems.vue` — `/monitor/postmortems`（`router:111`）
- 目的：异常事后复盘（5-why/时间线/verdict）。`usePostmortems`+`useAnomalies`（:11）。
- 数据：`postmortemsApi` → `listPostmortems/generate/update`（`store-routes:581-598`）。db。
- 写：**真实** generate（基于异常确定性生成并落库，`data-store:1018-1060`）+ update。

### 7. 跟卖处置 `Hijacking.vue` — `/monitor/hijacking`（`router:112`）
- 目的：跟卖检测→test-buy→取证→申诉→关闭全流程。`useHijacking`+`hijackingApi`（:12-14）。
- 数据：`listHijacking`（db, `data-store:1081`）。
- 写：**真实 db + 队列 + 跨模块**：
  - `scan` 确定性生成 1-2 行落库（`data-store:1093-1123`）。
  - `start-test-buy` **强制人工取证**（manualOrderId/submittedBy/...，缺则 `validation_failed`），`externalWrite:false`（`:1124-1151`）。
  - `upload-proof` 确认假货时：①调 `pauseAdsForAsin`→**仅入队 `ad_action_queue`**（queued, dry_run）+写 `ad_suggestions`（`:1180,1251-1293`）；②自动建申诉草稿（`m4_appeals`）；③24h dedup；④发 P0 通知（`:1157-1213`）。
  - `submit-appeal`/`close`（close 触发 `resumeAdsForAsin` 同样入队，`:1226-1244`）。

### 8. 侵权告警 `Infringement.vue` — `/monitor/infringement`（`router:113`）
- 目的：IP 侵权投诉建档→AI 起草→人工提交→裁决。`useInfringement`+`infringementApi`（:12-14）。
- 数据：`listInfringement`（db, `data-store:1316`）。
- 写：**真实** create/draft/submit/resolve（`:1324-1399`）。`draft` 需 `legalDisclaimerAck`；`submit` **强制人工取证** `amazonComplaintId/submittedBy/...`，`externalWrite:false`（`:1356-1386`）。

---

## C. Review（group `m4-review`）

### 9. Review 列表 `ReviewList.vue` — `/reviews`（`router:115`）
- 目的：评价中心（情感/星级/聚类/asin/q 过滤）。`useReviews`（:11）→ `reviewsApi`。
- 数据：`listReviewsM4`（db `reviews` 表, `data-store:1404`）。
- 写：**真实** `sync`（确定性造评价落库 + ≥3 条负面触发 `A_REVIEW_NEGATIVE_BURST` 异常, `:1429-1477`）、`mark-appealable`、`push-m1`（**跨模块写 `m1_optimization_targets`** + 通知, `:1486-1525`）。

### 10. 差评聚类 `ReviewClusters.vue` — `/reviews/clusters`（`router:116`）
- 目的：负面评价聚类→根因分层→推 M1。`useReviewClusters`（:9）。
- 数据：`listClusters`（db, `data-store:1530`）。
- 写：**真实** `recompute`（删旧簇+确定性重建落库, `:1542-1576`）、`push-m1`（写 `m1_optimization_targets`, `:1577-1617`）。

### 11. 评分趋势 `ReviewTrends.vue` — `/reviews/trends`（`router:117`）
- 目的：评分/评论数 7d/30d 趋势快照。`useReviewTrends`（:8）。
- 数据：`listTrends`（db `m4_review_trend_snapshots`, `data-store:1622`）。
- 写：**真实** `snapshot`（确定性生成趋势落库, `:1638+`）。

### 12. 申诉中心 `Appeals.vue` — `/reviews/appeals`（`router:118`）
- 目的：评价/跟卖申诉状态机（draft→submitted→under_review→accepted/rejected→retry）。`useAppeals`+状态机辅助（:17）。
- 数据：`listAppeals`（db `m4_appeals`, `data-store:1678`）。
- 写：**真实状态机** draft/submit/review/retry（`:1693-1782`）。`submit` **强制人工取证** `amazonCaseId/submittedBy/...`，`externalWrite:false`（`:1720-1752`）。`retry` 从 rejected 派生子申诉。

### 13. 挽回邮件 `RecoveryEmails.vue` — `/reviews/recovery`（`router:119`）
- 目的：差评客户挽回邮件多轮 SOP。`useRecovery`+状态机（:13）。
- 数据：`listRecovery`（db `m4_recovery_emails`, `data-store:1789`）。
- 写：**真实** draft/send/record-reply/next-round（`:1799-1855`）。注意 `send` **只把状态置 `sent` 并回写 `reviews.recovery_status`，不实际发邮件**（无外部投递, `:1825-1833`）。

---

## D. 竞品（group `m4-competitors`）

### 14. 竞品作战室 `Competitors.vue` — `/competitors`（`router:121`）
- 目的：竞品 9 维快照监控（价格/BSR/评分/评论数/变化时间线）。`useCompetitors`（:10）。
- 数据：`listCompetitors`/`timeline`（db `m4_competitor_snapshots`, `data-store:1860,1917`）。
- 写：**真实** add/snapshot（确定性生成快照+变化检测落库, `:1867-1916`）/dismiss-change（`:1925-1937`）。

### 15. 竞品图像变化 `ImageDiff.vue` — `/competitors/image-diff`（`router:122`）
- 目的：竞品主图/A+ 图像 pHash 差异检测→推 M1 改图。`useImageDiffs`（:9）。
- 数据：`listImageDiffs`（db `m4_image_diffs`, `data-store:1942`）。
- 写：**真实** scan（造 diff 落库，图 URL 为 `mock-cdn.amazon` 占位, `:1950-1977`）、push-m1（**跨模块写 `m1_optimization_targets`** + 通知, `:1978-2012`）。

---

## E. 通知 + 跨域复用页

### 16. 通知中心 `Notifications.vue` — `/notifications`（group `main`, `router:125`）
- 目的：全站铃铛通知总线（P0-P2、按 severity/source/unread 过滤、已读管理）。
- 数据：用 `useNotificationsBus`（`Notifications.vue:7`，带轮询）→ `notificationsApi`（`m4.js:135-142`）→ `m4_notifications` + `notifications_read`（db, `data-store:2069-2112`）。
- 写：**真实** list/post/markRead/markAllRead/unreadCount。注意 `emitNotification`（`:505-540`）按 severity 记 `channels=['in_app','email','wechat']` 且 `delivery_status` 把 email/wechat 标为 `'queued'`，但**无真实外部投递**，仅入库；含 5min dedup。

### 17. 品牌词防御 `BrandDefense.vue` — `/ads/brand-defense`（group `m3` 路由 `router:98`，但 API 属 M4）
- 目的：品牌词多层防御（L1-L4）+ 反击竞品出价。`useBrandDefense`（:9）→ `brandDefenseApi`（`m4.js:128-133`）。
- 数据：`getBrandDefense`（db `m4_brand_defense_layers`, `data-store:2017`）。
- 写：enable/disable layer **真实 db 写**（`:2021-2038`）；`counter` **跨模块仅入队**（`enqueueM3ReviewAction` M4_BRAND_COUNTER_BID，不直接改 `lx_targetings` 出价, `:2039-2063`）+ 通知。

### 18. 竞品 ASIN 攻击 `CompetitorAttack.vue` — `/ads/competitor-attack`（路由 `router:99`，复用 `useCompetitors`，:10）
- 目的：以竞品 ASIN 为靶向的攻击视图，复用竞品快照数据。db（同 #14 数据源）。

---

## 关键证据索引（file:line）
- 路由全集：`apps/web-v2/src/router/index.js:103-125`（M4 段）+ `:98-99`（BrandDefense/CompetitorAttack）+ `:125`（Notifications）。
- API 客户端：`apps/web-v2/src/api/m4.js`（13 个 api 命名空间，全部 http→db）。`apps/web-v2/src/api/monitor.js` 仅 `monitorApi.overview`（与 M4 域无直接绑定）。
- 前端全部接真后端证据：`useM4State.js:11-24`（import 真实 api）+ 各页 import（见上 grep 结果）。
- 后端路由表：`store-routes-monitor.mjs:486-856`（3.0 日报 ~ 3.15 通知，共 16 组端点）。
- 13 表 schema：`data-store-monitor.mjs:99-426`。
- 跨模块队列语义（不外写）：`data-store-monitor.mjs:13-69`（enqueueM3ReviewAction，state=queued/dry_run=1）。
- 人工取证强制（externalWrite:false）：test-buy `:1148`、infringement submit `:1383`、appeal submit `:1749`。
- 日报 mock 标志逻辑：`store-routes-monitor.mjs:88-120`。

## 第 1 轮

## M4 监控域 第1/10轮 辩论记录

### 一、本轮各角色核心主张

**产品经理A(增长/闭环视角)** 主张本域大量卖点是"状态字段搬运"而非真实执行到 Amazon 侧:
- 跟卖处置闭环断裂(P0):`uploadHijackingProof` 确认假货后置 `test_buy_received`,但前端"记录人工申诉"按钮仅在 `status==='appeal_drafted'` 时出现,而后端从不写该状态。
- 日报无定时推送(P1)、categoryRank 误用竞品 BSR(P1)、RecoveryEmails pending KPI 死值+sendRecovery 不真发信(P1)、markNotificationRead 无 storeId(P2)、alerts 三源重复计数+action 决策树缺止损项(P2)。

**产品经理B(风险/合规/真实性视角)** 主张 M4 护栏在申诉/侵权/TestBuy 三线"克制但非对称",真正风险是护栏不对称与回滚断链:
- revertM4Action 断链(P0):审计写 `SUBMIT_APPEAL_MANUAL`/`SUBMIT_IP_COMPLAINT_MANUAL`,但 revert switch 只匹配无 `_MANUAL` 后缀的标签,且无 HIJACK TestBuy 分支 → 敏感合规动作不可回滚,UI 却暗示"可回滚"。
- sendRecovery 零护栏+零外呼但 UI 宣称"通过 Buyer-Seller Messaging"(P0 伪装real)、Notifications 宣称邮件/微信三通道但 queued 永不出队+静默时段写死0(P0 安全告警造假)、categoryRank 伪随机却被标 mock:false(P2)。

**资深开发(契约/状态机视角)** 主张前后端两份状态机不是同一套,后端几乎不校验跳转:
- 前端 ANOMALY_TRANSITIONS 控按钮显隐,但后端 resolve/dismiss/escalate 无任何 from 校验,API 直连可任意跳转(P1)。
- 单飞 promise 不带 params 签名 → 快速切过滤器竞态(P1)、markNotificationRead 跨店越权(P2)、todayStats 命名与 range 错配(P2)、draftAppeal 硬编码 violationType(P2)、silent() 吞404掩盖真实错误(P2)。

**测试工程师(可验证性视角)** 主张多处契约"声称返回 state_transition_forbidden 实则永不返回",会导致回归断言 false-positive/false-negative:
- anomaly 无状态机 → 对 resolved 再 resolve 返回200(应400)。
- sla_breached 只有 escalate/seed 两处置1,无 `now>sla_deadline` 派生 → SLA 达成率虚高(false-negative)。
- submitHijackingAppeal(1219)先无条件改 hijacking 状态再调 submitAppeal 且丢弃返回值 → 底层申诉失败时两实体 desync(P1)。
- recordRecoveryReply 无状态守卫可"未发先回"且污染 reviews.rating(P2)。

### 二、记录员代码核验结果(交锋裁定)

我已直接核验关键证据,对部分主张做出更正:

1. **跟卖死分支(P0)成立**,但流程细节需更正 PM-A:实际状态流为 `pending_test_buy`→startTestBuy→`test_buy_in_transit`→uploadProof(假货)→`test_buy_received`(data-store-monitor.mjs:1142/1166)。前端按钮 gating 在不存在的 `appeal_drafted`(Hijacking.vue:270/282),`test_buy_received` 只命中 v-else 详情 → 申诉入口不可达。**反驳 PM-A 一个子论点**:el-steps 数组(Hijacking.vue:292)确实包含 `test_buy_received`,故步骤条 indexOf 不会返回-1、不会错乱;该子论点不成立,但主 P0 结论成立。

2. **revert 断链(P0)成立**:审计 `SUBMIT_APPEAL_MANUAL`(1743) vs revert case `SUBMIT_APPEAL`(2245)确实不匹配,且 switch 中**完全无任何 anomaly case**(2220-2315 仅含 appeal/recovery/infringement/competitor/cluster/brand)。**更正 PM-B/PM-A 措辞**:anomaly 的审计类型是 `ANOMALY_RESOLVE/DISMISS/ESCALATE`(非 `_MANUAL`),但无论命名如何,revert 对 anomaly 一律落 default:return false。

3. **日报无推送(P1)成立**:scheduler.mjs 仅注册 `inventory`(:25),无 daily/report/m4 job,setInterval 仅一处(:155)。

4. **alerts 三源重叠(P2)成立**:store-routes-monitor.mjs:294 `openAnomalies.length + unread notifications + m2AlertEvents`,而异常会 emitNotification → 确有重复。action 决策树(316-335)确无跟卖/侵权/被拒申诉分支。

5. **categoryRank 误用竞品 BSR(P1)成立**::287 取 `withBsr[0].bsr`(竞品快照 BSR),:288 prevRank 用 find 跨异日期任意竞品。

6. **submitHijackingAppeal desync(P1)成立**:1219 先 UPDATE status='appeal_submitted',1221 调 submitAppeal 丢弃返回值;若 submitAppeal 因缺 amazonCaseId 返回 validation_failed,hijacking 已显示已提交。

7. **anomaly 后端无状态校验(P1)成立**:resolveAnomaly(826)/dismissAnomaly(843)/escalateAnomaly(853)均直接 SET,无 from 校验;对比 submitAppeal(1723)有 APPEAL_TRANSITIONS 守卫。

### 三、主要交锋点
- **P0 跟卖死分支定级**:三方(PM-A/PM-B/QA)一致认为是真实闭环断裂;PM-B 列 P1(因后端已自动建草稿、仅前端 gating 错),PM-A/QA 列 P0。记录员裁定:前端无任何路径可达 submitAppeal,核心止损动作无法推进 → **采纳 P0**。
- **"真实执行 vs 状态搬运"定位**:PM-A 主张未执行到 Amazon 侧即非闭环;PM-B 主张护栏是"克制"而非"缺失",sendRecovery 是护栏非对称的最严重案例。两者在"必须立即修 UI 文案"上一致。
- **状态机真相源**:开发+QA 一致主张后端为准并下发共享常量;尊重安全不变量,后端必须补校验。

- 共识: 跟卖处置存在 P0 闭环断裂:uploadHijackingProof 确认假货置 test_buy_received,但前端'记录人工申诉'按钮仅在永不出现的 appeal_drafted 状态显示,导致假货确认后申诉入口在 UI 上完全不可达(Hijacking.vue:270/282 vs data-store-monitor.mjs:1166)。; revertM4Action 存在回滚断链:审计写入 *_MANUAL 后缀(SUBMIT_APPEAL_MANUAL/SUBMIT_IP_COMPLAINT_MANUAL)而 revert switch 只匹配无后缀标签,且对所有 anomaly 动作无任何 case,这些回滚静默落 default:return false,UI 却暗示可回滚。; RecoveryEmails 与 Notifications 存在'伪装 real':sendRecovery 仅翻 status 不真发信(全仓无 nodemailer/邮件实现),Notifications 宣称邮件/微信三通道但 delivery 永久 queued、silent_window_skipped 写死 0,UI 文案给运营'已触达'的虚假预期 — 违反'无真实通道不得伪装 real'不变量。; anomaly 后端无状态机校验:resolve/dismiss/escalate 直接 SET 无 from 守卫,与前端 ANOMALY_TRANSITIONS 不是同一套,API 直连可做任意非法转换;mapResult 声称返回 state_transition_forbidden 实则永不触发。; 日报无定时推送:scheduler.mjs 仅注册 inventory job,无任何 daily/m4/report cron,fixedTime='09:30' 仅回显不产生订阅效果。; categoryRank 数据来源错误:取竞品快照 BSR 当作我方类目排名,prevRank 跨异日期/异竞品取值,据此给的'排名下滑'action 建立在错误指标上。; markNotificationRead 缺 storeId 且无归属校验,与 markAllNotificationsRead 的 store 口径不一致,多店切换时未读数会跳变/错减。
- 分歧: 跟卖死分支定级:PM-B 列 P1(后端已自动建草稿、属前端 gating 单点错),PM-A/QA 列 P0(核心止损无法推进)。记录员暂裁 P0,待技术轮确认是否有其它 UI 路径(详情弹窗)能触达 submitAppeal。; M4 发信/日报/广告暂停的产品定位:定位为'仅记录人工操作的工单台'(则修 UI 文案+加 manual-evidence 护栏即可)还是'自动执行到 Amazon'(则需补 scheduler cron + 真实 BSM/邮件/微信 API)。; revert 断链是纯 bug 还是'敏感动作故意不可回滚'的设计:若后者,UI 必须明确告知'不可回滚'而非暗示可回滚。; 状态机唯一真相源:开发/QA 主张后端为准并下发共享常量(收紧行为);需产品确认是否接受行为收紧带来的回归风险。; manual-evidence 护栏边界:应只覆盖'对外合规动作'(submit/startTestBuy)还是所有改变对外承诺状态的动作(含 sendRecovery/resolveAnomaly/dismissAnomaly)。; silent() 是否继续吞 404:当前后端全部已实现使该防御掩盖真实错误,但未来端点灰度上线又需要它。
- 决策: P0 跟卖死分支:采用'前端 gating 改为 test_buy_received + 行内展示后端已生成的 appeal_id 与草稿跳转'方案(优先前端最小改动),并补 el-steps 已含 test_buy_received 的事实(无需改步骤映射)。技术轮验证后定稿。; P0 伪装 real:在接通真实通道前,sendRecovery 按钮文案改为'标记已人工发送'、Notifications channels 仅返回实际可达的 in_app(或显式渲染 deliveryStatus 置灰+tooltip'通道未接入'),副标题去掉'微信/静默时段'的实然宣称。尊重'无凭证不得伪装 real'不变量。; P0 revert 断链:revertM4Action 的 case 标签兼容 _MANUAL 后缀,新增 HIJACK_START_TESTBUY_MANUAL 分支与全部 anomaly 分支;补 CI 单测断言 auditM4 actionType 集合与 revert case 集合一一对应。; anomaly 后端补 ANOMALY_TRANSITIONS 状态机,resolve/dismiss/escalate/assign/acknowledge 统一返回 state_transition_forbidden(400);前后端抽取共享 transition 常量;后端为状态机唯一真相源。; submitHijackingAppeal 改为先调 submitAppeal 取返回值,error 则不改 hijacking 状态并透传错误(用 better-sqlite3 事务包裹保证原子)。; 日报今日待办 action 决策树补入开放跟卖(假货确认)、侵权、被拒申诉等止损项;alerts 改为按 relatedResourceId 去重计数。; markNotificationRead 增加 storeId 参数,写入前 SELECT 校验 (id+user_id+store_id) 归属,不存在返回 not_found(404);前端 markRead 失败回滚 _unreadCount。

## 第 2 轮

## M4 监控域 第2/10轮 辩论记录

### 一、四角色核心主张与交锋

**P0 跟卖止损链断裂(全员一致升级,核心议题)**
- PM-A 主张「双重断裂」P0:前端 gating 错(Hijacking.vue:270/282 绑 `appeal_drafted`,后端永不写该状态)+ 兜底 Appeals.vue submit 不传 body(:103)而后端强制四项 manual-evidence(:1726)必失败。
- PM-B 主张同 P0,并补充种子数据(:2450)直接造 `test_buy_received` 行,首屏即触死分支;撤回上轮自评的 P1。
- 资深开发**升级为「调用链三重断裂」**:`submitHijackingAppeal`(:1219)先无条件 `UPDATE status='appeal_submitted'` 再调 `submitAppeal`(:1221)且不传 body、丢弃返回值、非事务 → appeal 记录留 draft 但 hijacking 已脏置 appeal_submitted,**跨表撕裂**。这是比纯前端 gating 更深的后端 bug。
- 测试工程师**实锤三重断裂并证伪 PM-B「后端已自动建草稿、纯前端 gating」的判断**:前端传的 appealId 是用户手填的 Amazon Case ID 字符串而非真实草稿 id(`ap-xxxx` 存在 `hijacking.appeal_id` 但从未回传前端)。给出可断言红线测试。
- **主持人核验结论(已读源码确认)**:三重断裂全部属实。`uploadHijackingProof`(:1166)置 `test_buy_received` 并建草稿写 `appeal_id`(:1199);Hijacking.vue 操作列(266-274/279-285)对 `test_buy_received` 落到 `v-else` 仅「详情」;详情弹窗(289-308)只有 el-steps + M3 证据,无申诉按钮;`submitHijackingAppeal`(:1219-1221)确为先改状态→不传 body→丢返回值→非事务。**P0 锁定,修复必须前后端联动**。

**revert _MANUAL 后缀断链(全员纠正上轮事实错误)**
- 四角色一致**纠正上轮「revert 对所有 anomaly 无 case」的错误共识**:revertM4Action 已有 ANOMALY_CREATE/ASSIGN/ACK/RESOLVE/DISMISS/ESCALATE 全套(2127-2155)。
- 真正断链:审计写 `SUBMIT_APPEAL_MANUAL`(1743)/`SUBMIT_IP_COMPLAINT_MANUAL`(1377)/`HIJACK_START_TESTBUY_MANUAL`(1143)/`ACTION_QUEUE_ADD_MANUAL`(63),而 revert switch 只有无后缀 `SUBMIT_APPEAL`(2245)/`SUBMIT_IP_COMPLAINT`(2226),无 HIJACK case,无 _MANUAL strip → 落 `default:return false`(2313)。
- PM-B 额外指出 `revertAuditLog` 无视 dispatched 仍 flip `reverted=1`(data-store.mjs:547),构成「静默假回滚」,危害更高。
- **主持人核验**:grep 确认仅 1143/1377/1743/63 写 _MANUAL,revert 仅 2226/2245/2260 匹配。注意 `SEND_RECOVERY_EMAIL`(revert:2260)与审计(:1831,无 _MANUAL)**正确匹配**,不在断链范围。断链精确为 3 个对外合规动作:SUBMIT_APPEAL_MANUAL / SUBMIT_IP_COMPLAINT_MANUAL / HIJACK_START_TESTBUY_MANUAL,外加无 case 的 HIJACK_CONFIRM_COUNTERFEIT/SUBMIT_APPEAL/CLOSE。PM-B/开发定 P0,PM-A/测试定 P1。

**伪装 real 三件套(全员一致,违反安全不变量)**
- sendRecovery(:1829)仅翻 status='sent' 且连带污染 `reviews.recovery_status='sent'`(:1830),全仓无 SMTP/nodemailer/BSM 实现;RecoveryEmails KPI「通过 Buyer-Seller Messaging」+按钮「发送」。**主持人核验确认**,且 sendRecovery 连 manual-evidence 护栏都没有(对比 submitAppeal/startTestBuy 均有),是裸奔最彻底的一个。
- emitNotification(:517-522)P0 写 channels=[in_app,email,wechat] 但 email/wechat 永久 `queued`、silent_window_skipped 硬编码 0(:535),Notifications.vue:91 渲染 channel tag 完全不读 deliveryStatus。**主持人核验确认**。
- M4DailyReport fixedTime 仅作 query 透传,无定时推送。

**scheduler.mjs 存在性交锋(主持人裁定)**
- 测试工程师称「scheduler.mjs Path does not exist、全仓 cron 零命中」;PM-A/PM-B/开发均引用 scheduler.mjs:75 jobs=['orders','inventory','ads']。
- **主持人核验:测试工程师此条证据错误**——`apps/api/src/integrations/scheduler.mjs` 确实存在(runOnce jobs 默认 ['orders','inventory','ads']:75,startScheduler setInterval:155)。但**结论方向正确**:该模块只做 SP-API/Ads 增量同步,无任何 daily-report/M4 cron。后续测试断言必须引用真实文件路径,不可写「文件不存在」。

**categoryRank 指标张冠李戴(全员一致 P1)**
- categoryRank 取竞品快照 BSR(withBsr[0].bsr)当我方类目排名,prevRank 跨竞品/跨日期取值,rankDelta 无意义,并驱动「排名下滑」误导 action。sourceMeta 在 providerMode=real+任一 sync 成功时标 mock:false(:84/117 localReal),把竞品种子噪声包装成真数据 → 系统性 mock 误标。

### 二、未锁定分歧
- 修复优先级:测试/开发主张「先通后端链路再改前端 gating」(纯改前端仍失败);上轮「前端最小改动优先」被推翻。
- revert _MANUAL 断链定级 P0(PM-B/开发) vs P1(PM-A/测试)。
- M4 三大对外动作定位「工单台 vs 自动执行」未拍板——本域过半 P1 的总开关。
- manual-evidence 护栏是否扩展到 resolveAnomaly/dismissAnomaly。

- 共识: P0 跟卖止损链路三重断裂实锤:(1)前端操作列+详情弹窗对 test_buy_received 无任何申诉入口(Hijacking.vue:266-308,gating 错绑永不出现的 appeal_drafted);(2)submitHijackingAppeal(monitor.mjs:1219)先无条件置 appeal_submitted 再调 submitAppeal 且不传 body、丢返回值、非事务;(3)submitAppeal(:1726)强制四项 manual-evidence,空 body 必返 validation_failed → appeal 留 draft、hijacking 脏置 appeal_submitted 的跨表撕裂。修复必须前后端联动,纯改前端无效。; 纠正上轮错误共识:revertM4Action 对 anomaly 六动作 case 齐全(2127-2155),并非『全无 case』。真正断链是 _MANUAL 后缀错配:审计写 SUBMIT_APPEAL_MANUAL(1743)/SUBMIT_IP_COMPLAINT_MANUAL(1377)/HIJACK_START_TESTBUY_MANUAL(1143)/ACTION_QUEUE_ADD_MANUAL(63),revert 仅匹配无后缀(2226/2245)且无 HIJACK case → default:return false(2313)。注意 SEND_RECOVERY_EMAIL 正确匹配不在断链内。; revertAuditLog(data-store.mjs:547)无视 revertM4Action 返回的 dispatched 值,无脑 flip reverted=1,对外合规动作构成『显示已回滚但 DB 未动』的静默假成功。; 伪装 real 违反安全不变量(三处):sendRecovery(1829)仅翻 status 且污染 reviews.recovery_status、全仓无邮件/BSM 实现且无 manual-evidence 护栏;emitNotification(517-522)email/wechat 永久 queued、silent_window_skipped 写死 0、前端 Notifications.vue:91 不读 deliveryStatus;M4DailyReport fixedTime 仅 query 透传无定时推送。; categoryRank 指标错误:取竞品快照 BSR 当我方类目排名(store-routes-monitor.mjs:287),prevRank 跨竞品跨日期取值致 rankDelta 无意义,并驱动误导性『排名下滑』action(331-334);sourceMeta 因 localReal 门槛把竞品种子噪声错标 mock:false。; anomaly resolve/dismiss/escalate/acknowledge(826/843/853/819)后端无 from 状态机守卫,与前端 ANOMALY_TRANSITIONS 非同源,API 直连可任意非法转换污染 SLA;mapResult 的 state_transition_forbidden 对 anomaly 路径为死代码。注意 appeal/hijacking 守卫已存在(submitAppeal:1723/startTestBuy:1127),状态机缺失仅 anomaly 局部。; markNotificationRead(2096)无 storeId/归属校验,与 markAll/unreadCount 按 store 统计口径不一致,多店未读数会跳变。
- 分歧: 修复优先级:测试/开发主张『先打通后端 submitHijackingAppeal 事务化链路、再改前端 gating』(因纯改前端仍 validation_failed);上轮『前端最小改动优先』已被推翻,但前端是否可先上『记录人工申诉』入口+收集 manual-evidence 表单作为并行修复仍有分歧。; revert _MANUAL 断链定级:PM-B/资深开发定 P0(对外合规动作静默假回滚危害最高);PM-A/测试工程师定 P1。; M4 三大对外动作(挽回发信/日报推送/广告暂停)定位:『工单台-仅记录人工操作+改文案+加 manual-evidence 护栏』 vs 『自动执行到 Amazon-排期补 scheduler cron + 真实 BSM/邮件/微信 API』。此为本域过半 P1 的总开关,未拍板前无法判定是文案 bug 还是缺失实现。; manual-evidence 护栏边界:是否扩展到 resolveAnomaly/dismissAnomaly 强制 note/resolutionCaseId/reason 防 SLA 刷分。PM-B/测试主张至少强制 reason;PM-A 列 P2;开发担忧增加运营摩擦。; HIJACK_CONFIRM_COUNTERFEIT 是否允许回滚:若允许需复合 revert(撤草稿+恢复广告+回退 status,注意已写 24h dedup_key);若刻意不可回滚则 UI 必须显式置灰标注『不可回滚』。; revert dispatched===false 时:静默 flip(现状) vs 返回 409 阻断 vs flip 但回传 dispatchedInverse=false 由 UI 告警——三选一未定,且需评估对历史 _MANUAL 审计行的兼容。; categoryRank 数据源:接我方 ASIN catalog BSR 新数据源(成本待评估) vs 短期降级改名『竞品 BSR(示意)』+mock:true+删除排名下滑 action。; notifications_read 是否增加 store_id 维度(彻底隔离多店、需迁移历史表) vs 仅在 markRead 加归属校验。; todayStats→rangeStats:改后端字段名(破坏契约需同步所有调用方) vs 前端纯展示层映射(契约不动但各页易漏)。
- 决策: P0 跟卖止损链路修复升级为『前后端联动 P0』:后端 submitHijackingAppeal 必须用 db.transaction 包裹,改为先用 cur.appeal_id(真实草稿 id)调 submitAppeal、透传前端收集的 amazonCaseId/submittedBy/manualSubmittedAt/evidenceAttachment、判 submitAppeal 返回 error 后才决定是否改 hijacking 状态(error 时不改);前端 Hijacking.vue 操作列新增 v-else-if status==='test_buy_received' 显示『记录人工申诉』,弹窗收集四项 manual-evidence 并行内展示 row.appealId;删除/并入永不出现的 appeal_drafted 分支。; sendRecovery 在接通真实 BSM 通道前必须降级为工单台:按钮文案改『标记已人工发送』、KPI 去掉『通过 Buyer-Seller Messaging』、状态『已发送』改『已标记发送(未自动外发)』,send 弹窗强制 manual-evidence(发送渠道/发送人/时间),审计 actionType 改 SEND_RECOVERY_EMAIL_MANUAL 并同步补对应 revert case;不再连带改写 reviews.recovery_status='sent'。遵守『无真实通道不得伪装 real』不变量。; emitNotification 在接通真实通道前:channels 仅返回 in_app,或前端 Notifications.vue:91 按 deliveryStatus 把 email/wechat 渲染为置灰 tag+tooltip『通道未接入(queued)』;副标题去掉『邮件+微信+静默时段』实然宣称改为『站内通知(邮件/微信通道规划中)』。; revert _MANUAL 断链定为必修(取 P0/P1 较高方按 P0 排期):revert 入口对 actionType 做 replace(/_MANUAL$/,'') 规整后再 switch,并新增 HIJACK_START_TESTBUY/HIJACK_CONFIRM_COUNTERFEIT/HIJACK_SUBMIT_APPEAL/HIJACK_CLOSE/ACTION_QUEUE_ADD 分支;补 CI 断言 auditM4 全部 actionType 字面量集合 A ⊆ revert case 集合 B(排除显式『不可回滚』白名单)。若某动作刻意不可回滚,UI 必须置灰并 tooltip。; categoryRank 短期降级:UI 列名改『竞品 BSR(示意)』、按单一 ourAsin/competitorAsin 锁定对比对象、prevRank 按同一 competitor_asin 取值、sourceMeta 强制 mock:true 直到接入我方 catalog BSR,并删除基于它的『类目排名下滑』action。; scheduler.mjs 确实存在(integrations/scheduler.mjs,仅 orders/inventory/ads 同步,无 daily-report cron)——后续所有引用与测试断言必须用真实文件路径与真实事实(无 M4/report cron),不得再写『文件不存在』。M4DailyReport fixedTime 在定调前先改文案为『打开即看当前结果,暂无定时推送』并弱化/置灰时间选择器。; anomaly 状态机收紧:抽取前后端共享 ANOMALY_TRANSITIONS 常量,后端为唯一真相源,resolve/dismiss/escalate/assign/acknowledge 写前校验 from,非法转换返回 state_transition_forbidden(400);acknowledge 对非 assigned 直接 forbidden 而非静默 no-op;前端乐观 _patch 失败回滚。接受由此带来的行为收紧回归。; markNotificationRead 增加 storeId 参数+写前 SELECT 校验(id+user_id+store_id)归属,不存在返回 not_found(404);useNotificationsBus markRead 失败从 _readLocal 删除该 id 并回滚 readAt/_unreadCount,bus 不再吞 404。

## 第 3 轮

## M4 监控域 第3/10轮 辩论记录

### 本轮基调
四位角色对前两轮的"决议"做了一次冷酷的代码核账。我(主持人)实跑核验了全部 P0 实锤,结论:**前两轮写入的 P0/P1 决策在 main 代码层几乎零落地**,本域真实风险等级 = 决议前。PM-B/开发/测试三方独立得出此结论,证据一致,无人反驳。

### 各角色主张

**产品经理A(增长/ROI 视角)** 把战场从"状态机断链"上移到"度量层断裂":
- 挽回邮件中心整条链路无 ROI/转化度量。`reviewMetrics(data-store-monitor.mjs:1414)` 只数 `recoveryPending`,全仓无"挽回成功率=review_updated/sent"、无 avgRatingLift。挽回沦为"发信日志",无法驱动"先挽回哪条差评"的资源分配。(P1)
- **新增桶底漏水实锤**:`draftRecovery(1821)` 无条件把 `reviews.recovery_status='drafted'`,而待挽回队列只数 `pending` → 一旦起草,该差评永久从待挽回队列消失,挽回失败也不回流 → 静默漏单。(P1)
- 日报无"今日需处理的钱/时间"聚合、无 daily-report cron(承诺虚标)、`categoryRank` 假信号驱动错误 action。(P1)
- 跨链路缺"本月为你挽回/止损 $X"价值回收看板,直击续费/LTV。(P2)
- 主张:**度量层(纯计算,不依赖真实通道)可独立先行,优先于通道选型总开关**。

**产品经理B(风险/合规/真实性视角)** 逐条核对决议落地情况,实锤"纸面决议":
- 跟卖申诉、sendRecovery 工单台化、Notifications 通道渲染、revert _MANUAL 规整、categoryRank 降级、fixedTime 文案 —— **全部未改**。
- **新增 P0 脏写**:`recordAppealSubmission(Hijacking.vue:187)` 把运营手填的 Amazon Case ID 当 `appealId` 传入,`submitHijackingAppeal:1219` 据此覆盖真实草稿 `appeal_id`,再用错 id 调 `submitAppeal:1221` 必 not_found → hijacking 脏置 appeal_submitted 而 appeal 表纹丝不动。"运营按指引操作反而制造跨表脏数据"。
- 强烈主张:决议须配 CI gate,否则会再次漂移。

**资深开发(工程可行性)** 做了最关键的事实纠正:
- **纠正前两轮事实错误**:前端代码已变,`recordAppealSubmission` 按钮已存在(Hijacking.vue:270/282),但 gate 在 `row.status==='appeal_drafted'` —— 我(主持人)Grep 实锤后端零处写 `appeal_drafted`,upload-proof 后停在 `test_buy_received`,**这是永不为真的死分支**。所以"前端缺入口"措辞过期,但 P0 方向对。
- **升级实锤**:`submitHijackingAppeal:1219→1221→1222` 是"静默成功"而非"validation 阻断" —— 后端先无条件脏置状态、调 submitAppeal 不传 body、**丢弃返回值**、继续 auditM4 并 return 成功行。比前轮描述更恶劣。
- **扩大范围(独立 P0)**:`Appeals.vue:103 ap.submit(a.id)` 无 body → 整个申诉中心 draft→submitted 100% 失败,范围比跟卖更广。
- 开发明确倾向:**短期三大对外动作全降级工单台**(成本低、安全不变量不破)。

**测试工程师(可验证性)** 做了第二处关键纠正:
- **纠正 revert "静默假成功"定性**:`data-store.mjs:547` 确无条件 flip `reverted=1`,但 **`:549` out.dispatchedInverse=dispatched 已诚实回传** —— 后端 API 契约诚实。真正断点在 `TabHistory.vue:103-105` **无条件 `row.reverted=true`、不读 dispatchedInverse**。修复点应落前端,而非只改后端。(我主持人已核验 TabHistory.vue:105 确为无条件赋值,纠正成立)
- 补强 anomaly 状态机无 from 守卫(resolve/dismiss/escalate 可无限循环刷 SLA event)。(P1)
- _MANUAL 断链逐字符比对实锤(无误),emitNotification deliveryStatus 永久 queued 实锤。

### 主持人核验结论(实跑)
- ✅ `appeal_drafted` 后端零匹配,Hijacking.vue:270/282 死分支 —— **实锤成立**。
- ✅ `submitHijackingAppeal:1218-1224` 非事务/丢 body/吞返回值/脏写 appeal_id —— **实锤成立**。
- ✅ `submitAppeal:1726` 强制四项 manual-evidence;`Appeals.vue:103` 无 body —— **申诉中心整体不可用,实锤成立**。
- ✅ revert switch(2226/2245/2260)仅匹配无后缀,审计写 `_MANUAL`(1743 等),无 HIJACK_* case,落 default return false(2313) —— **断链实锤成立**。
- ✅ `data-store.mjs:549` 诚实回传 dispatchedInverse;`TabHistory.vue:105` 无条件 reverted=true —— **测试的"前端吞真值"纠正成立**。
- ✅ `emitNotification:522` email/wechat 写 queued;silent_window_skipped 写死 0 —— **实锤成立**。

### 交锋点
1. **度量层 vs 通道层优先级**:PM-A 主张度量先行可独立落地;开发/PM-B 主张通道定位(工单台 vs 自动执行)是过半 P1 的总开关。两者实际不冲突——度量层纯计算不破不变量,可与工单台降级并行。
2. **revert 修复点落前端还是后端**:测试纠正为"前端读 dispatchedInverse 最低成本";PM-B 倾向 "dispatched===false 不得 flip reverted"(后端侧)。需权衡历史 _MANUAL 行兼容。
3. **前端代码已变**:开发/测试纠正前两轮"前端缺入口"为"前端有按钮但 gate 在死分支",PM-B 沿用了过期描述被纠正。

- 共识: 前两轮的 P0/P1 决议在 main 代码层几乎全部未落地,本域真实风险 = 决议前;必须为关键不变量配 CI gate 防止再次漂移(PM-B/开发/测试一致,主持人实跑核验确认); submitHijackingAppeal(data-store-monitor.mjs:1215-1224)是确定的 P0:非事务、调 submitAppeal 不传 body 第5参、丢弃返回值、先无条件脏置 status='appeal_submitted' 并用前端值覆盖 appeal_id —— 构成跨表脏写+静默假成功,而非 validation 阻断; 申诉中心整体不可用是独立 P0:Appeals.vue:103 ap.submit(a.id) 不传 manual-evidence body,后端 submitAppeal:1726 强制四项必返 validation_failed,普通 review 申诉 draft→submitted 100% 失败; Hijacking.vue:270/282 的 recordAppealSubmission 按钮 gate 在 row.status==='appeal_drafted',而后端零处写该状态(主持人 Grep 实锤),confirm-counterfeit 后停在 test_buy_received → 永不为真的死分支,运营无申诉入口; revert _MANUAL 断链成立:审计写 SUBMIT_APPEAL_MANUAL(1743)/SUBMIT_IP_COMPLAINT_MANUAL(1377)/HIJACK_START_TESTBUY_MANUAL(1143),revert switch 仅匹配无后缀(2226/2245/2260)且无 HIJACK_* case → 落 default return false(2313); revert 假回滚的精确定位:data-store.mjs:549 已诚实回传 dispatchedInverse,后端 API 诚实;断点在前端 TabHistory.vue:105 无条件 row.reverted=true 不读真值(测试纠正,主持人核验确认); sendRecovery 伪装 real:1829 裸翻 status='sent' + 1830 污染 reviews.recovery_status='sent',无 BSM/邮件实现、无 manual-evidence、审计无 _MANUAL,违反'无真实通道不得伪装 real'安全不变量;前端文案'通过 Buyer-Seller Messaging 已发送'全套虚假承诺; emitNotification:522 对 email/wechat 永久写 queued、silent_window_skipped 写死 0,无真实通道;Notifications.vue:91 只渲染 channels tag 不读 deliveryStatus,误导运营以为已多通道触达; categoryRank(store-routes-monitor.mjs:287)取竞品快照 BSR 当我方类目排名,prevRank 跨竞品/跨日取值,rankDelta 无意义却驱动'类目排名下滑'action(331-334);底层 mulberry32 伪随机却标 mock:false; 无 daily-report cron(scheduler 仅 orders/inventory/ads),M4DailyReport.vue:135 '每天09:30固定复盘'+时间选择器是无法兑现的定时推送承诺
- 分歧: 度量层与通道层的优先级:PM-A 主张挽回成功率/止损价值看板(纯计算,不依赖真实通道)应独立先行;开发/PM-B 主张三大对外动作总开关(工单台 vs 自动执行)是过半 P1 的前置决策。主持人判断两者不互斥,可并行; revert dispatched===false 的修复落点:测试主张前端读 dispatchedInverse+弹警告(最低成本,后端 549 已回传真值);PM-B 主张后端 dispatched===false 不得 flip reverted=1(假回滚不变量更彻底)。需权衡历史 _MANUAL 审计行兼容; draftRecovery 覆盖 recovery_status 的修法三选一:不覆盖(起草不脱离待挽回池)vs 可逆 in_progress 仍计入待办 vs 新增'挽回失败-待复盘'独立队列,对 reviewMetrics 分母口径影响不同; 日报'潜在损失估算/价值回收'是否纳入本期:PM-A 列 P1(价值感知/续费钩子);开发担忧估算口径需跨 M2/M3/M4 取数、易被质疑准确性,倾向 P3; manual-evidence 护栏是否扩展到 resolveAnomaly/dismissAnomaly 强制 reason 防 SLA 刷分:PM-B/测试主张至少强制 reason;PM-A 列 P2;开发担忧运营摩擦且主张应先补 anomaly from 状态机守卫再谈护栏; HIJACK_CONFIRM_COUNTERFEIT 复合动作是否允许回滚:允许则需复合 revert(撤草稿+经 ad_action_queue 恢复广告+回退 status,注意 24h dedup_key);不允许则 UI 须置灰+tooltip。方向需产品定; SLABoard 是否从'速度看板'升级为'损失控制看板':需 anomaly 表补'影响金额'字段(schema 迁移),影响金额来源(估算 vs 实测)成本未评估
- 决策: submitHijackingAppeal 必须后端先修:用 db.transaction 包裹;用服务端自取的 cur.appeal_id(确认假货时自动建的草稿)作为 submitAppeal 第4参,透传前端四项 manual-evidence 作为第5参 body;判 submitAppeal 返回 error 后才决定是否改 hijacking 状态(error 不改、不脏写 appeal_id)。边界:cur.appeal_id 为 null 时禁止 submit-appeal; Hijacking.vue 操作列 gating 改 row.status==='test_buy_received',删除永不出现的 appeal_drafted 死分支;recordAppealSubmission 改为收集 amazonCaseId/submittedBy/manualSubmittedAt/evidenceAttachment 四项表单,appealId 用 row.appealId 不让用户填,success 文案必须基于后端返回 appeal.status==='submitted' 才弹; Appeals.vue submit 前弹 manual-evidence 表单(与跟卖共用组件)收集四项后传入 ap.submit(a.id, form);validation_failed 时前端把 error.missing 逐项渲染为红字而非笼统'提交失败'。与跟卖申诉同批修; revert 修复:入口对 actionType 先 .replace(/_MANUAL$/,'') 规整再 switch,新增 HIJACK_START_TESTBUY/HIJACK_SUBMIT_APPEAL/HIJACK_CLOSE/ACTION_QUEUE_ADD case;前端 TabHistory.vue 读 dispatchedInverse===false 时不置 row.reverted=true 并弹警告(前后端双修,落点争议归到 carryForward 细化); sendRecovery 降级工单台:不再改 reviews.recovery_status='sent',状态改'已标记发送(未自动外发)',强制 manual-evidence(渠道/发送人/时间),审计改 SEND_RECOVERY_EMAIL_MANUAL 并同步补 revert case;前端按钮文案改'标记已人工发送',KPI 去掉'通过 Buyer-Seller Messaging'(沿用前轮决议,本轮重申为待修复 P0/P1); Notifications 接通真实通道前:emitNotification channels 仅返回 in_app 或前端按 deliveryStatus 将 queued 通道渲染为置灰 tag+tooltip'通道未接入(queued)';页面副标题文案改'站内通知(邮件/微信通道规划中)'; categoryRank 接入我方 catalog BSR 前降级:列名改'竞品 BSR(示意)'、按单一 ourAsin/competitorAsin 锁定对比、prevRank 按同一 competitor_asin 取值、sourceMeta 强制 mock:true、删除基于它的'类目排名下滑'action; M4DailyReport.vue 文案改'打开即看当前同步结果,定时推送规划中',时间选择器置灰或移除(沿用前轮决议,重申为待修复); 必须建立 CI gate:断言 auditM4 全部 actionType 字面量集合 ⊆ revert case 集合∪显式不可回滚白名单;断言 test_buy_received 行渲染出申诉按钮;断言 draft 申诉提交需含四字段且响应 200
