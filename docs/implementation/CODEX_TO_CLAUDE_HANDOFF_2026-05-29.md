# Codex -> Claude 开发交接文档（2026-05-29）

> 目的：后续开发交给 Claude。本文把 Codex 已完成的开发、测试、部署、Git 状态、风险边界、后续优先级全部整理成可执行交接。Claude 接手后请先读本文件，再读引用的实现报告和测试文件。

---

## 0. 当前结论

- M3 领星/Amazon Ads 写类入口已统一改为 `ad_action_queue` 审计队列 intent。
- M2 库存联动、M4 跟卖/品牌防御联动不再绕过 M3 直接写广告影子表。
- Amazon 手动凭证保存已补 audit，且 audit payload 不泄露 refresh token。
- 认证态 `/api/v1/dashboard` 已从 sample mock 改为 DB-backed 工作台合同。
- M4 日报 source-aware、M4 外部动作 manual-only、M1 发布语义 manual publish 的安全口径已落地。
- Linux 服务器 `http://47.97.252.71/` 已更新到本轮代码和最新 Web dist。
- GitHub push 尚未完成：临时 clone 已生成 commit 和 bundle，但当前 sandbox 没有可用 GitHub SSH alias/key/token。
- 真实 Amazon SP-API / Ads 凭证/profileId 仍未配置；真实外部写入没有完成，也不能打开批量真实写。

---

## 1. Claude 接手必读顺序

1. `codex22claude.md`（本文件）
2. `PROJECT_STATUS.md`
3. `MEMORY.md`
4. `docs/implementation/PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md`
5. `docs/implementation/FULL_REVIEW_DEVELOPMENT_EXECUTION_2026-05-29.md`
6. `docs/implementation/ROUND23_LINUX_GIT_DEPLOY_2026-05-29.md`
7. `docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md`
8. `docs/implementation/LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md`
9. `docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md`
10. 核心测试：`tests/qa/m3-button-level.test.mjs`、`tests/qa/m2-functional.test.mjs`、`tests/qa/m4-functional.test.mjs`、`tests/integrations/sync-routes.test.mjs`、`tests/api/workbench-dashboard-contract.test.mjs`

---

## 2. 环境与部署状态

### 2.1 本地

- 工作目录：`D:\amz`
- Shell：PowerShell
- Windows 下运行 npm 命令优先用 `npm.cmd`。
- 当前工作树很脏，包含大量已开发文件和新文件；不要随意 revert。
- 原仓库 `.git` 当前对 sandbox 用户禁止写入 `index.lock`，所以不能在 `D:\amz` 直接 `git add/commit`。

### 2.2 Linux 服务器

- 公网入口：`http://47.97.252.71/`
- 源码目录：`/opt/amz/src`
- Web root：`/var/www/amz-web`
- API service：systemd `amz-api`
- API Node：`/root/.nvm/versions/node/v24.15.0/bin/node`
- SQLite 数据：`/opt/amz/data/store.db`（部署必须保留）
- 本轮备份：`/opt/amz/backups/20260528T200037Z-round23-action-queue`
- 本轮部署报告：`docs/implementation/ROUND23_LINUX_GIT_DEPLOY_2026-05-29.md`

### 2.3 服务器已验证

- 核心 API 文件 `node --check` PASS。
- 远端 Node tests 14/14 PASS。
- `nginx -t` PASS。
- `systemctl restart amz-api` 后服务 active。
- `http://127.0.0.1:8090/health` PASS。
- `http://127.0.0.1:8090/ready` PASS。
- 认证态 `/api/v1/dashboard` 返回 `sourceMode: db`。
- 公网 `/health`、`/ready`、`/` 均 200。

### 2.4 部署注意事项

后续部署不能覆盖：

- `/opt/amz/src/.env`
- `/opt/amz/src/node_modules`
- `/opt/amz/data/*`
- 任何生产凭证、日志、SQLite 数据文件

本轮部署方式：本地打 source tar + web dist tar，上传服务器，备份旧 `/opt/amz/src` 与 `/var/www/amz-web`，保留 `.env/node_modules/data`，解包新源码和 Web dist，重启 `amz-api`。

---

## 3. Git 状态

### 3.1 原仓库问题

在 `D:\amz` 直接提交会失败：

```text
fatal: Unable to create 'D:/amz/.git/index.lock': Permission denied
```

原因是 `.git` ACL 对当前 sandbox 用户禁止写入。不要盲目改权限；如需修复，建议由有权限用户处理 `.git` ACL 或以 Administrator 身份操作。

### 3.2 临时 clone 与 bundle

已在临时 clone 创建提交：

- 临时 clone：`D:\amz\tmp\amz-push-round23-20260529T0411`
- commit message：`feat: finalize Amazon ops audit queue rollout`
- 当前短 hash：以临时 clone 中 `git rev-parse --short HEAD` 输出为准
- bundle：`D:\amz\tmp\amz-round23-latest.bundle`
- 服务器 bundle：`/opt/amz/backups/20260528T200037Z-round23-action-queue/amz-round23-latest.bundle`

bundle 已验证：

```powershell
git bundle verify D:\amz\tmp\amz-round23-latest.bundle
```

### 3.3 GitHub push 未完成的原因

- 原 remote：`git@github.com-green110105:green110105-bot/amz.git`，当前环境无法解析 `github.com-green110105` 这个 SSH alias。
- 改成 `git@github.com:green110105-bot/amz.git` 后，当前 sandbox 用户无法读取 Administrator 的 SSH key，出现 publickey 权限失败。

后续可选做法：

```powershell
cd D:\amz\tmp\amz-push-round23-20260529T0411
git remote set-url origin git@github.com:green110105-bot/amz.git
git push origin main
```

或从 bundle 恢复：

```powershell
git clone D:\amz\tmp\amz-round23-latest.bundle D:\amz\tmp\amz-from-bundle
cd D:\amz\tmp\amz-from-bundle
git remote add origin git@github.com:green110105-bot/amz.git
git push origin main
```

不要把服务器密码、Amazon token、LWA secret、GitHub token 写进任何 md、代码或日志。

---

## 4. 总体安全不变量

后续开发必须保持：

1. 写 Amazon Ads / 领星广告实体前必须进 `ad_action_queue`。
2. 默认 `dryRun=1`、`auditRequired=1`、`guardrail.status='needs_review'`。
3. 没有真实 Ads profileId、审批、风险确认、real-write gate，不允许真实写 Amazon Ads。
4. 批量真实写入仍禁止；真实 executor 只能逐条执行经过审计的 intent。
5. Amazon 手动保存 refresh token/profileId 必须写 audit，但 audit payload 不能包含 token 明文。
6. M4 跟卖、侵权、申诉、test-buy 都是 manual-only 外部动作，不自动提交 Amazon，也不生成伪 Amazon case/order id。
7. M1 是人工发布包/Listing 作战室，没有 SP-API 发布回执时不得标记已上传 Amazon。
8. M4 daily 必须 source-aware，mock/hybrid 数据不能伪装 `realDataOnly=true`。
9. 认证态工作台必须返回 DB-backed 数据；未认证 legacy mock fallback 可保留用于旧安全测试。
10. 真实 Amazon 授权未完成前，所有真实外部依赖只能 mock/sandbox/read-only diagnostics。

---

## 5. M3 广告模块细节

### 5.1 核心文件

- `apps/api/src/store-routes-ads.mjs`
- `apps/api/src/data-store-ads.mjs`
- `tests/qa/m3-button-level.test.mjs`
- `apps/web-v2/src/composables/useLxState.js`
- `apps/web-v2/src/composables/useAdsState.js`
- `apps/web-v2/src/pages/AdsHub.vue`
- `apps/web-v2/src/pages/AdsTimeline.vue`
- `apps/web-v2/src/pages/StrategyLibrary.vue`
- `apps/web-v2/src/pages/lx/LxAllCampaigns.vue`
- `apps/web-v2/src/pages/lx/LxPortfolioDetail.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabAdGroups.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabAds.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabPlacements.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabSettings.vue`
- `apps/web-v2/src/pages/lx/tabs/LxTabTargeting.vue`

### 5.2 `queueLxManualAction`

位置：`apps/api/src/store-routes-ads.mjs`

作用：把路由层写类动作转换为 `ad_action_queue` 中的人工待审 intent，而不是直接改业务影子表。

关键输入字段：

- `actionPrimitive`
- `entityKind`
- `entity`
- `currentValue`
- `recommendedValue`
- `rollbackMethod`
- `note`
- `priorityScore`
- `riskLevel`
- `expiresAt`

生成语义：

- `dryRun=1`
- `auditRequired=1`
- `guardrail.status='needs_review'`
- `rollbackPlan.needsManualReview=true`
- 写 `ACTION_QUEUE_ADD_MANUAL` audit

### 5.3 已队列化的 M3 actionPrimitive

Portfolio：

- `CREATE_PORTFOLIO`
- `UPDATE_PORTFOLIO`
- `DELETE_PORTFOLIO`
- `TOGGLE_PORTFOLIO`
- `ADJUST_PORTFOLIO_BUDGET`

Campaign：

- `CREATE_CAMPAIGN`
- `UPDATE_CAMPAIGN`
- `DELETE_CAMPAIGN`
- `TOGGLE_CAMPAIGN`
- `ADJUST_CAMPAIGN_BUDGET`
- `UPDATE_CAMPAIGN_BID_STRATEGY`
- `COPY_CAMPAIGN`
- `BULK_ADJUST_CAMPAIGN_BUDGET`
- `BULK_CREATE_CAMPAIGNS`

Search term / Report：

- `PROMOTE_SEARCH_TERM`
- `NEGATE_SEARCH_TERM`
- `REPORT_PROMOTE_SEARCH_TERM`
- `REPORT_NEGATE_SEARCH_TERM`

Ad group：

- `CREATE_AD_GROUP`
- `UPDATE_AD_GROUP`
- `DELETE_AD_GROUP`
- `ADJUST_AD_GROUP_BID`

Ad：

- `CREATE_AD`
- `UPDATE_AD`
- `DELETE_AD`
- `TOGGLE_AD`

Targeting：

- `CREATE_TARGETING`
- `UPDATE_TARGETING`
- `DELETE_TARGETING`
- `ADJUST_TARGETING_BID`
- `TOGGLE_TARGETING`
- `BULK_ADJUST_TARGETING_BID`

Negative：

- `CREATE_NEGATIVE`
- `DELETE_NEGATIVE`

KW Grabbing：

- `CREATE_KW_GRABBING`
- `UPDATE_KW_GRABBING`
- `DELETE_KW_GRABBING`
- `APPLY_KW_GRABBING_BID`

Placement / AMC / SQP / Bulk：

- `UPDATE_PLACEMENT_BID`
- `CREATE_AMC_AUDIENCE`
- `DELETE_AMC_AUDIENCE`
- `SQP_TAKE_ACTION`
- `BULK_IMPORT`

### 5.4 SQP 与 Bulk 特殊处理

- SQP 增加 queued/approved pending intent dedupe，相同 query/action 重复提交返回 `409`。
- bulk-import unknown `type` 返回 `400 validation_error`。
- JSON 和 multipart CSV bulk-import 都进入 Action Queue，不再直接插业务影子表。

### 5.5 允许保留的本地写入

不要误判：Strategy 库增删改、goal profile、本地配置类写入是内部管理数据，不等于 Amazon Ads 外部写。它们可以继续直写 DB，但必须有 audit/权限/tenant 隔离。未来任何会映射 Amazon Ads 真实实体变更的动作，必须进入 `ad_action_queue`。

---

## 6. M2 -> M3 库存联动

核心文件：

- `apps/api/src/data-store-profit.mjs`
- `tests/qa/m2-functional.test.mjs`

旧逻辑中 M2 inventory-link 可能直接 pause campaign 或 reduce campaign budget。现在统一改为队列 intent：

- `M2_PAUSE_CAMPAIGN_FOR_INVENTORY`
- `M2_REDUCE_CAMPAIGN_BUDGET_FOR_INVENTORY`

行为：

- M2 仍根据库存/风险规则计算建议。
- 需要影响广告时，只生成 M3 Action Queue item。
- `lx_campaigns` 不直接被 M2 改写。
- 审批、dry-run、执行、回滚由 M3 审计队列统一接管。

---

## 7. M4 -> M3 联动

核心文件：

- `apps/api/src/data-store-monitor.mjs`
- `tests/qa/m4-functional.test.mjs`

新增/本地 helper：`enqueueM3ReviewAction(...)`。

### 7.1 跟卖暂停/恢复广告

函数：

- `pauseAdsForAsin(...)`
- `resumeAdsForAsin(...)`

新 action：

- `M4_PAUSE_ADS_FOR_ASIN`
- `M4_RESUME_ADS_FOR_ASIN`

行为：

- 根据 ASIN 查关联 campaign。
- 不再直接 update `lx_campaigns.enabled/state/service_state`。
- audit payload 增加 `queuedActionId`。
- `ad_suggestions` 中保留 M4->M3 queued evidence。

### 7.2 品牌防御 counter bid

函数：`counterBrand(...)`

新 action：

- `M4_BRAND_COUNTER_BID`

行为：

- 查 `lx_targetings` 目标词。
- 不再直接 update bid。
- audit payload 包含 `queuedActionId`。

### 7.3 Legacy revert 不要乱改

`data-store-monitor.mjs` 的 `revertM4Action` 仍保留对历史 audit action 的 direct SQL revert，例如：

- `M3_PAUSE_ADS_FROM_M4`
- `M3_RESUME_ADS_FROM_M4`
- `BRAND_COUNTER_ATTACK`

这是为了兼容旧 audit 和回归测试。不要轻易删除，除非做完整迁移和测试更新。

---

## 8. Amazon 授权与凭证审计

核心文件：

- `apps/api/src/integrations/oauth-flow.mjs`
- `apps/api/src/integrations/authorization-diagnostics.mjs`
- `apps/api/src/integrations/sync-routes.mjs`
- `apps/api/src/integrations/provider-mode.mjs`
- `apps/api/src/integrations/sp-api/credentials.mjs`
- `apps/api/src/integrations/ads-api/credentials.mjs`
- `apps/api/src/integrations/ads-api/auth.mjs`
- `apps/api/src/integrations/ads-api/client.mjs`
- `apps/api/src/integrations/ads-api/live-action-executor.mjs`
- `apps/web-v2/src/pages/AmazonAuthCenter.vue`
- `apps/web-v2/src/api/integrations.js`

已完成：

- Auth Center 页面。
- OAuth config endpoint。
- SP-API one-click OAuth flow 合同。
- Ads OAuth callback 合同，可自动选择唯一 profileId。
- diagnostics endpoint 离线可用且脱敏。
- 手动保存 SP-API credentials 写 audit。
- 手动保存 Ads credentials 写 audit。
- 保存 Ads profileId 写 audit。
- audit payload 不包含 refresh token 明文。
- real Ads live action executor 存在，但受强 gate 限制。

新增 audit action：

- `AMAZON_SPAPI_CREDENTIALS_SAVED`
- `AMAZON_ADS_CREDENTIALS_SAVED`
- `AMAZON_ADS_PROFILE_SAVED`

重要边界：用户目前没有可用 Amazon developer app / LWA / Ads app credentials。所以 Auth Center 页面/合同可以测，但真实 Seller Central/Ads 授权、真实只读同步、真实写入都没有完成。

---

## 9. 工作台 Dashboard DB-backed

核心文件：

- `apps/api/src/extended-routes.mjs`
- `tests/api/workbench-dashboard-contract.test.mjs`

认证态 `GET /api/v1/dashboard` 返回：

- `sourceMode: 'db'`
- `sourceMeta.mock: false`
- 当前 store 信息
- queued action 数量
- audit log 数量
- action cards
- action card 深链 `/ads/action-queue?id=...`

未认证或旧安全测试路径仍 fallback 到旧 mock handler。不要删除这个 fallback，否则旧合同测试可能失败。

未完成：全局 Action Inbox 还不是最终生产形态，仍缺 owner/due/approve/reject/snooze/done/evidence/audit/revert 统一 schema。

---

## 10. M1 Listing 模块

核心文件：

- `apps/api/src/data-store-listings.mjs`
- `apps/api/src/store-routes-listings.mjs`
- `apps/web-v2/src/pages/ListingOptimize.vue`
- `apps/web-v2/src/pages/ListingSelect.vue`
- `apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue`
- `apps/web-v2/src/pages/M1ResourceHub.vue`
- `tests/qa/m1-button-level.test.mjs`
- `tests/qa/m1-frontend-workbench-contract.test.mjs`
- `tests/qa/m1-production-readiness.test.mjs`
- `tests/qa/m1-resource-hub-contract.test.mjs`

M1 A/B adopt winner 正确语义：

- 状态进入 `ready_for_manual_publish`
- audit payload 包含 `manualPublishRequired: true`
- audit payload 包含 `publishAdapterRequired: 'SP-API'`
- audit payload 包含 `uploadedToAmazon: false`
- 没有真实 SP-API 发布回执，不允许写 `uploaded_to_amazon=1`

产品定位：M1 是人工发布包系统，不是自动发布 Amazon Listing 的系统。

用户曾指出“关键词热力图、多语言母版没用”。后续不要恢复这种看似高级但运营无用的模块。

---

## 11. M2 / M4 工作台与日报

### 11.1 M2 Control Tower

核心文件：

- `apps/web-v2/src/pages/M2ControlTower.vue`
- `apps/web-v2/src/composables/useM2State.js`
- `apps/api/src/data-store-profit.mjs`
- `tests/qa/m2-m4-workbench-ia-contract.test.mjs`

当前定位：利润、库存、PO、调价、现金流、告警、M2->M3 联动建议。

边界：真实 order/settlement/inventory 依赖 SP-API 只读同步；ledger/PO 强约束还不是最终生产闭环。

### 11.2 M4 Daily Report

核心文件：

- `apps/api/src/store-routes-monitor.mjs`
- `apps/web-v2/src/pages/M4DailyReport.vue`
- `apps/web-v2/src/pages/M4OpsWorkbench.vue`
- `apps/web-v2/src/api/m4.js`
- `tests/qa/m4-daily-report-api.test.mjs`
- `tests/qa/m4-daily-report-contract.test.mjs`

已完成：

- canonical route `/m4/reports/daily`
- legacy redirect `/m4/daily-report`
- 店铺维度 / 链接维度
- summary 指标聚合
- alerts/actions/trends/deepLinks
- source-aware provenance
- mock/hybrid 不伪装 real

未完成：真实 Review、真实 BSR/类目排名、真实 Ads/订单回流、每日固定时间生成/推送、团队 owner/due/action inbox。

### 11.3 M4 manual-only

核心文件：

- `apps/api/src/data-store-monitor.mjs`
- `apps/api/src/store-routes-monitor.mjs`
- `apps/web-v2/src/pages/Hijacking.vue`
- `apps/web-v2/src/pages/Infringement.vue`
- `tests/qa/m4-functional.test.mjs`
- `tests/qa/m4-safe-copy-contract.test.mjs`

要求：

- test-buy 必填人工订单/提交人/提交时间/证据附件。
- infringement submit 必填 Amazon complaint/case id、提交人、提交时间、证据附件。
- appeal submit 必填 Amazon case id、提交人、提交时间、证据附件。
- 不自动生成 `TB-*`、`IP-*`、`AMZ-CASE-*` 伪外部单号。

---

## 12. 前端交互口径

主要页面/组件：

- `apps/web-v2/src/pages/AmazonAuthCenter.vue`
- `apps/web-v2/src/pages/M1ResourceHub.vue`
- `apps/web-v2/src/pages/M2ControlTower.vue`
- `apps/web-v2/src/pages/M4DailyReport.vue`
- `apps/web-v2/src/pages/M4OpsWorkbench.vue`
- `apps/web-v2/src/pages/AdsHub.vue`
- `apps/web-v2/src/pages/AdsTimeline.vue`
- `apps/web-v2/src/pages/Settings.vue`
- `apps/web-v2/src/pages/Hijacking.vue`
- `apps/web-v2/src/pages/Infringement.vue`
- `apps/web-v2/src/pages/StrategyLibrary.vue`
- `apps/web-v2/src/router/index.js`
- `apps/web-v2/src/layouts/DefaultLayout.vue`
- `apps/web-v2/src/components/SuggestionCard.vue`
- `apps/web-v2/src/components/SuggestionDrawer.vue`

交互原则：

- 广告写动作不应该本地乐观改实体状态，而应显示“已进入执行/审计队列”。
- Amazon Auth Center 不能伪装授权成功；必须显示缺少 app credentials/profileId/diagnostics 状态。
- M4 daily 必须显示 sourceMeta，不能让 mock 数据看起来像真实店铺日报。
- M4 manual-only 页面必须提示外部动作需要人工提交证据。

---

## 13. 测试证据

本地全量：

```powershell
npm.cmd run check
```

结果：PASS，覆盖 requirements、coverage、contracts、db validate、ai-eval、`npm test` 724/724、web build、health-check、replay、perf smoke、mock scenario、benchmark mock、release dry-run。

重点三轮回归：

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
for ($i = 1; $i -le 3; $i++) { node --test @tests }
```

结果：每轮 364/364 PASS。

关键测试：

- `tests/qa/m3-button-level.test.mjs` -> 170/170 PASS
- `tests/qa/m2-functional.test.mjs` -> M2 inventory-link queue assertion PASS
- `tests/qa/m4-functional.test.mjs` -> M4 -> M3 queue assertion PASS
- `tests/integrations/sync-routes.test.mjs` -> credential audit/redaction PASS
- `tests/api/workbench-dashboard-contract.test.mjs` -> dashboard DB-backed PASS
- `tests/docs/docs-coverage.test.mjs` -> 2/2 PASS

未纳入默认门禁：全部 Playwright `.spec.mjs` 端到端 journey、真实 Amazon OAuth、真实 SP-API/Ads 只读同步、真实 Ads write executor。

---

## 14. 后续开发优先级

### P0：修 Git 推送能力

- 修复当前用户对 `D:\amz\.git` 的写权限，或继续使用临时 clone。
- 配置 `github.com-green110105` SSH alias，或改用直连 GitHub 的可用 key。
- 使用 token 时不要写入仓库、日志、文档。
- 可直接从 `D:\amz\tmp\amz-round23-latest.bundle` 恢复并推送。

### P0：真实 Amazon 授权前置

先拿到：

- SP-API developer app / LWA app id / client id / client secret
- Ads LWA client id / client secret
- 合法 redirect URI
- `CREDENTIAL_ENC_KEY`
- Ads profileId

顺序：配置 app-level credentials -> diagnostics -> OAuth/token exchange -> SP-API 只读同步 -> Ads 只读同步 -> 核对 sourceMeta -> 再讨论单条 real write。不要一上来打开真实写。

### P1：全局 Action Inbox

统一工作台、M2、M3、M4 action card schema：

- action id
- module
- store/listing/campaign/entity
- owner
- due date
- severity
- approve/reject/snooze/done
- evidence
- audit log
- revert path
- sourceMeta
- realWriteGate

### P1：Playwright 关键 journey

建议加入 smoke：

- 登录 -> 工作台 -> action card -> M3 action queue detail
- M3 LX campaign budget update -> queued -> approve dry-run -> not real-write
- M4 hijack confirm -> M3 queue intent -> dashboard card
- M4 daily store/link dimension switch
- Amazon Auth Center diagnostics without credentials
- M1 adopt winner -> manual publish state

---

## 15. 禁止事项

1. 不要把 mock/hybrid 数据标成 real。
2. 不要在 audit payload 写 token/secret/password。
3. 不要让 M2/M4 直接 update `lx_campaigns` / `lx_targetings`。
4. 不要删除 M4 legacy revert direct SQL，除非做完整迁移。
5. 不要删除 unauthenticated dashboard mock fallback。
6. 不要打开批量真实 Ads 写入。
7. 不要把 M1 adopt winner 说成已上传 Amazon。
8. 不要把 Amazon Auth Center 页面完成说成真实授权完成。
9. 不要在服务器部署时覆盖 `.env`、`node_modules`、`/opt/amz/data/store.db`。
10. 不要把本会话中出现过的服务器密码写进任何文件。
11. 不要回滚用户在 `PRD.md` 或 `docs/` 的历史变更。
12. 不要对 `PROJECT_STATUS.md` 中历史乱码段落做猜测式修复；如要修，按源文档重写。

---

## 16. 关键文件索引

后端：

- `apps/api/src/store-routes-ads.mjs`
- `apps/api/src/data-store-ads.mjs`
- `apps/api/src/data-store-profit.mjs`
- `apps/api/src/data-store-monitor.mjs`
- `apps/api/src/data-store-listings.mjs`
- `apps/api/src/extended-routes.mjs`
- `apps/api/src/integrations/sync-routes.mjs`
- `apps/api/src/integrations/oauth-flow.mjs`
- `apps/api/src/integrations/authorization-diagnostics.mjs`
- `apps/api/src/integrations/ads-api/live-action-executor.mjs`

前端：

- `apps/web-v2/src/pages/AmazonAuthCenter.vue`
- `apps/web-v2/src/pages/M1ResourceHub.vue`
- `apps/web-v2/src/pages/M2ControlTower.vue`
- `apps/web-v2/src/pages/M4DailyReport.vue`
- `apps/web-v2/src/pages/M4OpsWorkbench.vue`
- `apps/web-v2/src/pages/AdsHub.vue`
- `apps/web-v2/src/pages/AdsTimeline.vue`
- `apps/web-v2/src/pages/lx/LxAllCampaigns.vue`
- `apps/web-v2/src/pages/lx/LxPortfolioDetail.vue`
- `apps/web-v2/src/router/index.js`

测试：

- `tests/qa/m3-button-level.test.mjs`
- `tests/qa/m2-functional.test.mjs`
- `tests/qa/m4-functional.test.mjs`
- `tests/integrations/sync-routes.test.mjs`
- `tests/api/workbench-dashboard-contract.test.mjs`
- `tests/integrations/oauth-flow.test.mjs`
- `tests/integrations/authorization-diagnostics.test.mjs`
- `tests/integrations/ads-live-action-gate.test.mjs`
- `tests/qa/amazon-auth-center-contract.test.mjs`
- `tests/qa/m4-daily-report-api.test.mjs`
- `tests/qa/m4-daily-report-contract.test.mjs`
- `tests/deploy/release-safety.test.mjs`

文档：

- `PROJECT_STATUS.md`
- `MEMORY.md`
- `docs/implementation/PRODUCT_REVIEW_20_ROUNDS_2026-05-29.md`
- `docs/implementation/FULL_REVIEW_DEVELOPMENT_EXECUTION_2026-05-29.md`
- `docs/implementation/ROUND23_LINUX_GIT_DEPLOY_2026-05-29.md`
- `docs/implementation/AMAZON_OAUTH_CREDENTIALS_HOWTO_2026-05-26.md`
- `docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md`
- `docs/implementation/LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md`

---

## 17. Claude 接手第一天建议

先验证，不要马上大改：

```powershell
cd D:\amz
npm.cmd run check
node --test tests/qa/m3-button-level.test.mjs tests/qa/m2-functional.test.mjs tests/qa/m4-functional.test.mjs tests/integrations/sync-routes.test.mjs tests/api/workbench-dashboard-contract.test.mjs
```

再检查服务器：

```powershell
Invoke-WebRequest -UseBasicParsing http://47.97.252.71/health
Invoke-WebRequest -UseBasicParsing http://47.97.252.71/ready
Invoke-WebRequest -UseBasicParsing http://47.97.252.71/
```

然后先解决 Git 推送权限，再继续功能开发。

---

## 18. 最终交接口径

可以说：

- 服务器已部署最新 Round 23 代码。
- M3/M2/M4 广告写入审计队列收口已完成。
- 工作台 dashboard 已 DB-backed。
- 本地和远端关键验证通过。
- Git commit/bundle 已准备好。

不能说：

- GitHub 已成功 push（目前没有）。
- 真实 Amazon 授权已经打通（没有）。
- 真实 Amazon 数据已经完整回流（没有）。
- 真实 Ads 写入已经生产可用（没有）。
- M2/M4 全局 Action Inbox 已经最终生产级完成（没有）。

