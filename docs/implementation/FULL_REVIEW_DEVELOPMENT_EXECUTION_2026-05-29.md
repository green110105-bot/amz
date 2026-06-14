# 全功能产品复评后的开发执行报告（2026-05-29）

日期：2026-05-29  
范围：工作台、Amazon 授权接入、M1、M2、M3 广告、M4 全子 tab/页面、测试门禁、部署安全  
状态：本轮已完成本地开发闭环与全量验证；随后已执行 Linux 部署，见 `docs/implementation/ROUND23_LINUX_GIT_DEPLOY_2026-05-29.md`；未接入真实 Amazon 凭证。

---

## 1. PMO 最终裁决

本轮不是再写空泛规划，而是在 `PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md` 的评审结论基础上，把 QA 已经证明的高风险红点落到代码和测试：

- M3 领星写类操作必须先进入 Action Queue，默认 dry-run / needs_review，不能绕过审计直接改变关键投放状态。
- M4 日报必须 source-aware；mock/hybrid fixture 不能再伪装成 `realDataOnly=true`。
- M4 跟卖 test-buy、侵权 complaint、appeal submit 都是人工提交外部动作，后端必须强制人工证据，不能空 body 自动生成 Amazon 单号。
- M1 A/B adopt winner 只能进入 `ready_for_manual_publish`，没有 SP-API 发布回执时不得标记 `uploaded_to_amazon=1`。
- 发布安全测试必须兼容 Windows/CRLF，避免 compose 标准格式被误判失败。

PMO 口径：本轮可声明“mock/sandbox 本地关键红点已闭环，`npm run check` 全绿”；不能声明“真实 Amazon 店铺生产闭环 100% 完成”，因为真实凭证、线上部署和真实数据回归不在本轮可执行环境内。

---

## 2. Subagent 评审与执行证据

| 角色 | Subagent/来源 | 本轮证据结论 | 产出/影响 |
|---|---|---|---|
| PMO 监督 | Rawls/James + 既有 20 轮评审 | 要求从页面可用升级为业务闭环可证明 | `docs/implementation/PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md` |
| 产品经理 A | 工作台 + Amazon Auth 评审 | 授权要走一键 OAuth/onboarding；不能让 mock 授权等于真实授权 | 保留 Auth Center，后续需真实 app credentials |
| 产品经理 B | M1 + M2 评审 | M1 发布语义、M2 Action Inbox/ledger/PO 是关键 | 本轮修正 M1 发布语义；M2 深层 ledger 仍作为后续真实财务闭环 |
| 产品经理 C | M3 + M4 评审 | M3 LX 写动作不得绕过执行篮；M4 daily/manual-only 不能伪真 | 本轮完成 M3/M4 高风险修复 |
| 研发 Pauli | M1 发布语义 | A/B adopt winner 不再写 `uploaded_to_amazon=1` | `apps/api/src/data-store-listings.mjs`、`tests/qa/m1-button-level.test.mjs` |
| 研发 Sagan | M4 安全文案 | 跟卖/侵权前端文案转为 manual-only，展示 M3 pause/dedup 证据 | `Hijacking.vue`、`Infringement.vue`、`m4-safe-copy-contract.test.mjs` |
| QA Gauss | 只读红灯审计 | 证明 M3 直写、M4 daily 伪真、manual-only 后端未强制、release-safety 失败 | 直接驱动本轮修复清单 |
| 主线程研发/QA | Codex | 修复代码、更新测试、跑全量门禁和 3 轮重点回归 | `npm.cmd run check` 通过；重点回归每轮 364/364 通过 |

完整 20 轮产品评审证据仍以 `docs/implementation/PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md` 为基线；本报告记录评审后的研发落地、测试证明和剩余边界。

---

## 3. 10 个深度复评主题的最终落地

| 复评主题 | 产品裁决 | 本轮开发/验证状态 |
|---|---|---|
| 工作台/全局入口 | 工作台必须从看板变成行动入口 | 已保留现有 workbench 与 action-card 方向；本轮重点没有重写全局工作台 |
| Amazon 授权接入 | 运维点击一键授权；管理员配置 app credentials | OAuth/Auth Center 已存在并测试通过；真实 app 未提供，不能真实跳转授权 |
| M1 目标与发布包 | M1 是人工发布包系统，不是自动发布系统 | 已修正 adopt winner 发布语义，防止假装已发布 Amazon |
| M1 资源/图片/合规 | Listing 资产必须按真实 Amazon 运营槽位组织 | 既有 M1 War Room/Resource Hub 保留；本轮重点补发布语义测试 |
| M2 利润工作台 | M2 要成为经营 Action Inbox | 既有 M2 Control Tower 保留；深层 ledger/PO 强约束仍是后续真实财务闭环 |
| M2 库存/采购/跨模块 | 采购、调价、库存联动必须可审计/可回滚 | 本轮未重写 M2；全量回归确保未破坏现有 M2 |
| M3 Strategy OS | 用户不直接管理 83 条策略，而处理少量高质量动作卡 | 现有 Strategy OS 保留；本轮把更多 LX 写动作导入 Action Queue |
| M3 领星广告等价面 | surface/tab 必须等价真实领星，target 详情 4 tab | target drawer 4 tab 单测通过，LX 写动作队列化测试通过 |
| M4 日报与风险工作台 | 日报必须分店铺/链接维度、source-aware，不 mock 伪真 | 已修复 realDataOnly/sourceMeta，日报 API/contract 全绿 |
| M4 Review/跟卖/侵权/通知 | 外部 Amazon 动作必须人工证据，不得自动假提交 | 已后端强制 manual evidence，文案合同和功能测试全绿 |

---

## 4. 代码级完成项

### 4.1 M3：领星写类动作进入 Action Queue

关键文件：

- `apps/api/src/data-store-ads.mjs`
- `apps/api/src/store-routes-ads.mjs`
- `apps/web-v2/src/composables/useLxState.js`
- `apps/web-v2/src/pages/lx/LxAllCampaigns.vue`
- `apps/web-v2/src/pages/lx/LxPortfolioDetail.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabAdGroups.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabAds.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabPlacements.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabSettings.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabTargeting.vue`
- `tests/qa/m3-button-level.test.mjs`

完成内容：

- 新增 `enqueueManualAction(...)`，支持无 suggestionId 的人工 LX 写动作入队。
- 新增 `queueLxManualAction(...)`，把 toggle/budget/bid/bulk/promote/placement 等高风险写动作统一转换为 queued write intent。
- 队列默认 `dryRun=1`、`auditRequired=1`、`guardrail.status='needs_review'`。
- 前端不再乐观写入真实实体状态，而是提交 Action Queue 并显示队列结果。
- 新增/更新测试证明队列入库、DB 原值不变、dry-run/revert 路径仍可用。

2026-05-29 Round 23 收口：portfolio/campaign/ad-group/ad/targeting/negative/user-search-term/report/SQP/bulk/copy/kw-grabbing/AMC audience 等剩余 write-like 路由已统一改为 `ad_action_queue` intent；路由层不再直接改业务影子表。SQP 增加 queued/approved pending intent dedupe；bulk-import unknown type 返回 `400 validation_error`。

### 4.2 M4：日报 source-aware provenance

关键文件：

- `apps/api/src/store-routes-monitor.mjs`
- `apps/web-v2/src/pages/M4DailyReport.vue`
- `tests/qa/m4-daily-report-api.test.mjs`
- `tests/qa/m4-daily-report-contract.test.mjs`

完成内容：

- `realDataOnly` 改为由 `sourceMeta.*.mock === false` 推导，不再默认写死 true。
- `dailySourceMetaFor(...)` 在 real provider mode 且存在成功同步记录时才标为真实；mock/hybrid 默认暴露 unavailableReason。
- 前端显示 `realDataOnly={{ realDataOnly }}`、`mode=real/mock-hybrid/unknown`、`mock=true/false`，避免误导老板或运营。
- API 测试改为默认 fixture `realDataOnly=false`，防止以后回归成伪真。

### 4.3 M4：manual-only 后端强制

关键文件：

- `apps/api/src/data-store-monitor.mjs`
- `apps/api/src/store-routes-monitor.mjs`
- `apps/web-v2/src/api/m4.js`
- `apps/web-v2/src/composables/useM4State.js`
- `apps/web-v2/src/pages/Hijacking.vue`
- `apps/web-v2/src/pages/Infringement.vue`
- `tests/qa/m4-functional.test.mjs`
- `tests/qa/m4-safe-copy-contract.test.mjs`

完成内容：

- `startTestBuy(...)` 必填人工订单/提交人/提交时间/证据附件。
- `submitInfringement(...)` 必填 Amazon complaint/case id、提交人、提交时间、证据附件。
- `submitAppeal(...)` 必填 Amazon case id、提交人、提交时间、证据附件。
- 不再自动生成 `TB-*`、`IP-*`、`AMZ-CASE-*` 伪外部单号。
- audit action 改为 manual-only 语义，并标注 `externalWrite:false`。
- 前端 test-buy 增加人工证据输入与校验。

### 4.4 M1：A/B adopt winner 发布语义

关键文件：

- `apps/api/src/data-store-listings.mjs`
- `tests/qa/m1-button-level.test.mjs`

完成内容：

- A/B adopt winner 状态改为 `ready_for_manual_publish`。
- audit payload 明确 `manualPublishRequired:true`、`publishAdapterRequired:'SP-API'`、`uploadedToAmazon:false`。
- 没有真实 SP-API 发布回执时，不允许标记 `uploaded_to_amazon=1`。

### 4.5 发布安全测试修复

关键文件：

- `tests/deploy/release-safety.test.mjs`

完成内容：

- 修复 `serviceBlock(...)` 对 CRLF 文件的误判，先统一换行再匹配 compose service block。
- `node --test tests/deploy/release-safety.test.mjs` 从 2 fail 修复为 9/9 pass。

### 4.6 Round 23：M2/M4/工作台/授权的最后收口

关键文件：

- `apps/api/src/store-routes-ads.mjs`
- `apps/api/src/data-store-monitor.mjs`
- `apps/api/src/data-store-profit.mjs`
- `apps/api/src/integrations/sync-routes.mjs`
- `apps/api/src/extended-routes.mjs`
- `tests/qa/m2-functional.test.mjs`
- `tests/qa/m3-button-level.test.mjs`
- `tests/qa/m4-functional.test.mjs`
- `tests/integrations/sync-routes.test.mjs`
- `tests/api/workbench-dashboard-contract.test.mjs`

完成内容：

- M3 领星剩余 create/update/delete/report/SQP/bulk/copy/AMC/kw-grabbing 写类入口统一返回 Action Queue item，业务表保持只读影子数据，只有后续 executor 才能在显式 gate 后执行。
- M2 库存联动不再直接 pause/reduce campaign；改为 `M2_PAUSE_CAMPAIGN_FOR_INVENTORY` / `M2_REDUCE_CAMPAIGN_BUDGET_FOR_INVENTORY` queue intent。
- M4 跟卖暂停/恢复广告、品牌防御 counter bid 不再直接写 `lx_campaigns` / `lx_targetings`；改为 `M4_PAUSE_ADS_FOR_ASIN` / `M4_RESUME_ADS_FOR_ASIN` / `M4_BRAND_COUNTER_BID` queue intent。
- Amazon 手动保存 SP-API、Ads refresh token、Ads profileId 会写 audit，但 payload 不包含 token 明文。
- 认证态 `/api/v1/dashboard` 改为 DB-backed 工作台响应，暴露 `sourceMode:'db'`、`sourceMeta.mock:false`、Action Queue 深链；未认证路径保留旧 mock 兼容安全测试。

---

## 5. 测试-证明-修复闭环

### 5.1 红灯基线

QA 先证明以下问题真实存在：

- M3 LX budget/toggle/bid 部分 route 会直接写 DB，Action Queue 数量不变。
- M4 daily 默认 mock/hybrid 仍可能报告 `realDataOnly=true`。
- M4 manual-only 外部动作空 body 仍可能返回成功。
- full `npm test` 在 deploy release-safety 有 2 个失败。

### 5.2 修复后单项验证

- `node --test tests/deploy/release-safety.test.mjs` -> 9/9 pass。
- `node --test tests/unit/ad-drawer-config.test.mjs` -> 10/10 pass。
- `node --test tests/qa/m1-button-level.test.mjs` -> 94/94 pass。
- `node --test tests/qa/m3-button-level.test.mjs` -> 170/170 pass。
- `node --test tests/qa/m4-daily-report-contract.test.mjs tests/qa/m4-daily-report-api.test.mjs` -> 7/7 pass。
- `node --test tests/qa/m4-functional.test.mjs tests/qa/m4-regression-revertM4Action.test.mjs` -> 61/61 pass。
- `node --test tests/qa/m4-safe-copy-contract.test.mjs` -> 2/2 pass。

### 5.3 全量门禁

- `npm.cmd test` -> 724/724 pass。
- `npm.cmd run web:build` -> pass；仅有第三方 Rollup pure comment warning 和 chunk size warning。
- `npm.cmd run check` -> pass；覆盖 requirements、coverage、contracts、db validate、ai-eval、npm test、web build、health、replay、perf smoke、mock scenario、benchmark、package dry-run。

### 5.4 三轮重点回归

命令：

```powershell
$tests = @(
  'tests/qa/m3-button-level.test.mjs',
  'tests/qa/m2-functional.test.mjs',
  'tests/qa/m4-functional.test.mjs',
  'tests/integrations/sync-routes.test.mjs',
  'tests/api/workbench-dashboard-contract.test.mjs',
  'tests/qa/m4-daily-report-api.test.mjs',
  'tests/qa/m4-daily-report-contract.test.mjs',
  'tests/deploy/release-safety.test.mjs'
)
for ($i = 1; $i -le 3; $i++) {
  node --test @tests
}
```

结果：3 轮均通过；每轮 364/364 pass；覆盖 M2/M3/M4、Amazon 手动凭证 audit、工作台 dashboard contract、M4 日报和发布安全。

### 5.5 五个验证闭环口径

| 闭环 | 发现/目标 | 修复 | 证明 |
|---|---|---|---|
| 1 | QA 红灯：M3 直写、M4 伪真、manual-only 未强制 | M3 queue、M4 provenance、M4 evidence validation | targeted tests 全绿 |
| 2 | M1 发布语义可能误导为已上传 Amazon | adopt winner 改 manual publish | M1 94/94 pass |
| 3 | release-safety CRLF 误报导致 full test 红 | normalize CRLF | release-safety 9/9 pass |
| 4 | 全量回归风险 | 跑 `npm test` + `web:build` + `check` | 724/724 + build pass + check pass |
| 5 | 稳定性反证 | 重点 suite 连跑 3 轮 | 364/364 x 3 pass |

### 5.6 本轮复跑矩阵与未覆盖项

| 范围 | 本轮证据 | 覆盖断言 | 未覆盖项 |
|---|---|---|---|
| 工作台 | `tests/api/workbench-dashboard-contract.test.mjs`；全量 `npm.cmd test` | 认证 dashboard 走 DB、返回 source metadata、Action Queue 深链 | 全局 Action Inbox UI 统一 schema、端到端店铺切换 journey |
| Amazon Auth | `tests/integrations/oauth-flow.test.mjs`、`authorization-diagnostics.test.mjs`、`sync-routes.test.mjs`；全量 `npm.cmd test` | OAuth/config/diagnostics/手动凭证保存 audit 与脱敏 | 真实 Amazon developer app、Seller Central/Ads 实际授权跳转和真实只读同步 |
| M1 | `tests/qa/m1-button-level.test.mjs`；全量 `npm.cmd test` | Listing/版本/A-B/人工发布语义，不伪造 uploaded-to-Amazon | 真实 SP-API listing 上传回执、真实图片资产发布 |
| M2 | `tests/qa/m2-functional.test.mjs` 3 轮回归；全量 `npm.cmd test` | 利润/库存/PO/告警/M2->M3 库存联动进入队列 | 真实订单/settlement/inventory 对账、ledger/PO 生产强约束 |
| M3 | `tests/qa/m3-button-level.test.mjs` 170/170；直写扫描；全量 `npm.cmd test` | LX/Amazon Ads write-like entity route 进入 `ad_action_queue`，DB 原值不变 | 真实 Ads API profileId 下的单条 real executor；策略库本地管理写不属于外部广告写 |
| M4 | `tests/qa/m4-functional.test.mjs`、`m4-daily-report-*.test.mjs` 3 轮回归 | 日报 source-aware；manual-only 外部动作；M4->M3 广告动作进入队列 | 真实 Review/BSR/竞品/Ads/订单数据回流；真实外部 case/test-buy 人工回执 |
| 门禁 | `npm.cmd run check` | requirements/coverage/contracts/db/ai-eval/test/web build/health/replay/perf/mock/package dry-run | 默认门禁尚未包含全部 Playwright `.spec.mjs` journey |

### 5.7 证据日志口径

- 运行环境：Windows PowerShell，本地目录 `D:\amz`，日期 2026-05-29；网络受限，approval policy 为 never。
- 直写扫描命令：`rg -n "createPortfolio|updatePortfolio|...|bulkImport|createAmcAudience|deleteAmcAudience" apps/api/src/store-routes-ads.mjs`；结果仅出现 import 行。
- 重点三轮回归命令：`node --test` 加载 M2/M3/M4/sync-routes/workbench-dashboard/M4 daily/release-safety 8 个 suite；每轮 364/364 PASS。
- 全量门禁命令：`npm.cmd test` -> 724/724 PASS；`npm.cmd run web:build` -> PASS；`npm.cmd run check` -> PASS。
- 未纳入默认门禁：全部 Playwright `.spec.mjs` 端到端 journey、远程 Linux health、真实 Amazon SP-API/Ads 授权跳转、真实只读同步、真实写入 executor。

---

## 6. 不能过度声明的边界

- 本地开发闭环完成时尚未部署 Linux；后续部署结果见 `docs/implementation/ROUND23_LINUX_GIT_DEPLOY_2026-05-29.md`。
- 本轮没有真实 Amazon SP-API / Ads 凭证，不能证明真实店铺订单、广告、Review、BSR 数据已经接入。
- `npm run check` 当前没有把全部 Playwright `.spec.mjs` 纳入默认门禁；本轮证明的是 Node/contract/web build/check 体系。
- M2 ledger、PO 强约束、全局工作台 Action Inbox、M4 case lifecycle 深层统一仍属于后续真实生产闭环，不应在本轮报告里说已经 100% 完成。
- M3 write-like 路由层本轮已统一进入 `ad_action_queue`；真实 Amazon Ads 写入仍必须等真实 Ads 凭证/profileId、逐条审批、显式风险确认和 executor gate。

---

## 7. 下一步 PMO 指令

1. 获得真实 Amazon developer app / LWA / SP-API / Ads credentials 后，先走 Auth Center 诊断与只读同步，不直接打开真实写。
2. 下一步应在真实 Ads 凭证/profileId 到位后，只对单条已审批 Action Queue intent 打开真实 executor；继续保留 dry-run、manual compensation、audit revert 作为默认安全阀。
3. 把全局工作台、M2、M4 的 action cards 统一成 owner/due/approve/reject/snooze/done/evidence/audit/revert schema。
4. 把 Playwright 关键 journey 加入独立 smoke 门禁，而不是只依赖 `.test.mjs`。
5. 真实 Linux 部署必须在网络/权限允许时执行：备份、上传、restart、health、远程 tests、asset 验证、状态文档回填。


---

## 8. Round 23 收口结论（2026-05-29）

- 直写扫描：`store-routes-ads.mjs` 中 create/update/delete/report/SQP/bulk/copy 等危险 helper 仅保留 import 引用，路由处理不再直接调用这些 helper 写业务表。
- 业务联动：M2/M4 发起的广告动作全部改为 M3 Action Queue intent，避免跨模块绕过 M3 审计、审批、dry-run 和回滚语义。
- 工作台：认证 dashboard 从 sample mock 变为 DB-backed，可以把待审批行动卡直接深链到 `/ads/action-queue?id=...`。
- 授权：手动凭证保存路径已经补 audit 和脱敏；一键 OAuth 仍取决于 Amazon developer app / LWA / redirect URI 是否真实配置。
- 测试证据：重点回归 3 轮每轮 364/364 PASS；`npm.cmd test` 724/724 PASS；`npm.cmd run web:build` PASS；`npm.cmd run check` PASS。
- 交付边界：本地 mock/sandbox 和合同层已收口，且后续已部署 Linux；但仍没有真实 Amazon 店铺凭证回执，不能宣称线上真实数据闭环已经完成。
