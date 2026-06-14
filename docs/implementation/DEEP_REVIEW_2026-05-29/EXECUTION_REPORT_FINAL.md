# 深度产品评审 → 全量重做 → 验收 → 部署 · 最终执行报告

> 文档性质：项目经理(PMO)交付版执行总报告
> 完成日期：2026-06-01
> 范围：全局工作台(含 Amazon 授权接入)、M1 Listing、M2 利润/库存、M3 广告/领星/Strategy OS、M4 监控 —— 全部子页与 tab
> 最终状态：**本地全量门禁全绿 + 线上部署成功并验证**

---

## 0. 一句话结论

按用户要求，以"1 项目经理监督 + 多产品经理 + 多开发 + 多测试"的多 agent 对抗式编排，完成了**深度产品评审 → 研发全量重做 → 修复循环 → 对抗式验收 → 线上部署**全链路。最终 `npm run check` 全量门禁 **EXIT=0（996 测试全绿 + web build 通过 + 11 道子门禁全过）**，并已部署到 `http://47.97.252.71/`，公网 `/health`、`/ready`、`/` 均 200，认证态 dashboard 返回 `sourceMode=db / mock=false / realWrites=false`。

---

## 1. 执行方法与角色配置

| 角色 | 数量/形态 | 职责 |
|---|---|---|
| 项目经理(PMO) | 监督方 | 流程裁决、跨域冲突拍板、放行/阻断决策 |
| 产品经理 | 每域 2 名(增长视角 + 风险/真实性视角) | 业务逻辑梳理、价值闭环、合规真实性 |
| 开发 | 每域 1 名 + 16 个重做批次负责人 + 4 个修复域负责人 | 根因定位、工程实现、契约设计 |
| 测试 | 每域 1 名 + 4 个对抗审计员 | 可断言验收、回归基线、证伪"已完成" |

全程多 agent 编排（Dynamic Workflow），累计 **400+ subagent**。所有评审/开发/审计发言均要求 `Read/Grep` 核对真实代码后产出，带 `file:line` 证据。

---

## 2. 阶段执行与证据

### Stage 1 — 深度产品评审（用户定为 3 轮/域）
- **7 个功能域 × 3 轮辩论 × 4 角色 + 主持人综合**，每轮发言必须反驳/补强上一轮(`critiqueOfPrevious`)。
- 产出：**135 条裁决工作清单**（P0=46 / P1=49 / P2=33 / P3=7；bug=86 / refactor=17 / test=12 / ux=12 / feature=8）。
- 证据落盘：`PMO_REPORT.md`、`WORKLIST.md`、`worklist.json`、`BOUNDARY_NOTES.md`、`debate-{workbench,amazon-auth,m1,m2,m3-ads,m4,cross}.md`。
- 评审最尖锐的发现：522 测试"全绿"**不可作为发布证据**——多处"伪装成功/伪装真实/伪装已回滚"的安全与诚信缺陷，且至少两处测试正向锁死了错误契约。

### Stage 2 — 研发全量重做（不止 P0）
- 因 127/135 项共享文件构成单一连通分量，采用 **16 个顺序文件安全批次**（后端安全核心 → 各模块后端 → 共享前端 store → 各模块前端 → 测试），零文件冲突。
- 每批"实现 + 同批写可断言测试"（落实 PMO"fix + CI gate 同批"铁律）。
- 首轮落地 106/135；证据：`STAGE2_DEV_REPORT.md`。

### Stage 3 — 修复循环（用户定上限 2 轮）+ 对抗式验收
- **机器重启一次**：进程丢失但磁盘代码完好；用全量测试重建真相（77 fail），4 域顺序修复 agent → 3 fail → 手工裁决修复 → **992 全绿**。
- **验收第 2 轮（对抗式独立审计，只读证伪）** 发现 992 全绿掩盖的真实缺陷：
  - **BLOCKER**：M4 `counterBrand` 直写 `lx_targetings.bid`，绕过 `ad_action_queue`（违反安全不变量#1 + 禁止事项#3）。已修：改为 enqueue `M4_BRAND_COUNTER_BID` 队列 intent + 回归测试断言"不直写 + 队列 dryRun=1/needs_review"。
  - **MAJOR**：M3-P0-05 伪绿——`BudgetAllocator/Dayparting` 调用的 `/action-queue/enqueue` 后端路由不存在(404)，测试只做静态 grep。已修：新增 `POST /enqueue` + `GET /active` 路由（服务端强制重算 guardrail），并补真实 HTTP 集成测试断言落 needs_review/dryRun=1 行 + dedupe。
  - **MAJOR**：X-P1-04 缺口——`store-routes-monitor.mjs` 写路径未调 `resolveStoreScope`，伪造 `x-store-id` 不返回 403。已修 + monitor 路由 403 回归测试。
  - **MINOR**：409/duplicate 被前端当成功。已修：`queued!==false` 才回写本地态。
- 修复引入 2 处旧契约回归，按新正确契约更新测试后 **996 全绿**。

### Stage 4 — 线上部署
- 本地 `npm run check` 全量门禁 **EXIT=0**。
- 打包 source + web dist，paramiko 自动化部署：备份旧版 + 保留 `.env`/`node_modules`/`data` + 解包 + `node --check` + `systemctl restart amz-api` + `nginx -t` + 健康检查。
- 备份：`/opt/amz/backups/20260601T010903Z-deep-rebuild`。

---

## 3. 最终验证证据

| 门禁/探针 | 结果 |
|---|---|
| `npm.cmd test` | **996 tests / 996 pass / 0 fail** |
| `npm.cmd run web:build` | ✓ built（仅 chunk-size 提示） |
| `npm.cmd run check`（11 子门禁全量） | **EXIT=0** |
| 线上 `node --check` 6 核心文件 | 全 ok |
| 线上 `amz-api` | active |
| 线上 `nginx -t` | ok |
| 公网 `/health` `/ready` `/` | 全 **200** |
| 认证 `/api/v1/dashboard` | `sourceMode=db / mock=false / realWrites=false` |

---

## 4. 已落地的关键安全不变量（回归测试固化）

1. 写 Ads/LX 实体必经 `ad_action_queue`（含本轮新堵的 `counterBrand`）；默认 `dryRun=1/auditRequired=1/guardrail needs_review`。
2. `REAL_WRITES_ENABLED!==true` 时服务端强制 `requiresRealStoreWrite=false`，不信前端 body。
3. 真实写需 `isRealMode()` + 多重 gate；mock/hybrid 零真实 PUT；禁批量真实写。
4. 真实写未真正反向时回滚阻断（409/"申请人工回滚"），前端按 `dispatchedInverse` 真值分流。
5. 多租户 `x-store-id` ownership 校验覆盖全部 5 个 store-routes（含本轮补的 monitor）。
6. 不伪装 real：`sourceMeta` 真实数据不误标 mock，mock 不冒充 real。
7. 审计 payload token 脱敏。

---

## 5. 硬边界与不可声明项（保持不变）

- 用户当前**无真实 Amazon developer app / LWA / Ads 凭证 / profileId**，故所有"写回 Amazon / 真实只读同步 / 真实写入"仍为 **mock/sandbox/工单台**，真实接入列为 blocker。线上 `/ready` 明确 `realWritesEnabled:false` + blocker `real_writes_disabled_until_credentials_and_approval`。
- **不能声明**：真实 Amazon 授权已打通、真实数据已回流、真实 Ads 写入生产可用。
- **Git push 未完成**：原仓库 `.git` 对当前 sandbox 用户禁写 `index.lock`，无可用 GitHub 凭证；本轮改动已在工作树 + 线上部署，未入 GitHub。

---

## 6. 安全处置记录

- 服务器 root 密码全程仅经会话内存（env 变量）用于 SSH，**未写入任何文件/日志/commit**；部署脚本与 deploy.py 用后即删。
- 发现并修复一处**历史遗留泄露**：`claude2codex.md` 中明文存有 root 密码，已 redact 为占位符。

---

## 7. 后续建议

1. 解决 Git push 权限（修 `.git` ACL 或用 bundle 恢复推送），把本轮 ~210 文件改动入库。
2. 取得真实 Amazon app credentials 后，按"app-level 配置 → diagnostics → OAuth → 只读同步 → provenance 核对 → 单条审批真实写"顺序推进，勿一步打开真实写。
3. 线上启用 HTTPS、改 demo 默认口令。
4. 把本轮 45+ 回归测试纳入 CI gate，防止安全不变量回退。

---

## 附录 A — 第二轮功能迭代（2026-06-09，carryForward 决策项落地）

用户拍板推进评审阶段挂起的 carryForward 项（C 技术项 + B 决策项），按 CODEX.md 七步工作法以 8 个顺序文件安全批次实现：

| 批次 | 内容 | 关键决策 |
|---|---|---|
| N1 (B-1) | scanAlerts 真实化 | `_evalCondition` 改为对真实 DB 行（m2_leaks/快照/现金流）求值，每事件带 `sourceMeta` 指向真实行主键；无命中=空态；**绝不写死假事件**；`is_simulated` 反映数据真伪而非仅 mock 模式 |
| N2 (B-4) | CSRF 公网多租户 P0 | SP-API cookie==state 保持强制；**Ads OAuth 新增 HttpOnly state cookie 第二因子**，callback 强制校验、token 交换前拦截；消除"Ads CSRF 恒跳过"blocker |
| N3 (C) | notifications_read 多店隔离 | 幂等迁移加 `store_id` 维度（PK 升 `(user_id,store_id,notif_id)` + backfill），markRead/markAll/unreadCount 全维度隔离 + 跨店越权 not_found |
| N4 (C) | M1 score `is_mock` 下沉 | `m1_listing_scores` 加 `is_mock`/`source_meta`，PRNG 合成分一律标 `synthetic_demo`，不伪装真实评分 |
| N5 (C) | M3 observation 自动结算 | 新增 `settleObservations` + `POST /observations/settle`，窗口过期按确定性规则结算 succeeded/failed，标 `sourceMeta.simulated=true`，不触达真实 Amazon |
| N6 (B-2) | 工作台 reject 落库 | 新增 `POST /api/v1/audit/dismiss`（`DASHBOARD_CARD_DISMISS`），前端 reject 落库成功后才移除卡片，文案改"已忽略并记录" |
| N7 (B-3) | W6 安全文案 provider 真值驱动 | 文案永远由 `realWritesEnabled` 真值切换：mock→"演示·沙箱"，real→红色高危"将影响真实店铺"（终态，可证伪） |
| N8 (B-6+B-5) | daily-report 调度 + 已挽回口径 | scheduler 增 dailyReport job（默认 disabled 但代码就绪可断言）；"已挽回¥X"拆 `estimated`/`realized` 双字段 + "模拟/预估"水印 |

**验证（本人重跑，不信自报）**：`npm.cmd test` = **1037 tests / 1037 pass / 0 fail**（较上轮 +41 测试，0 回归）；`npm.cmd run web:build` ✓；`npm.cmd run check` **EXIT=0**。

**部署**：已上线 `http://47.97.252.71/`，备份 `/opt/amz/backups/20260609T165441Z-feature-round2`；8 核心文件 `node --check` 全过；公网 `/health`·`/ready`·`/` 均 200；认证 dashboard `sourceMode=db / mock=false / realWrites=false`。服务器密码全程仅过会话内存，部署脚本用后即删，repo 无密码残留。

**仍为 blocker（受硬边界约束，已诚实标注）**：真实 Amazon 凭证缺失下的真实写入/真实数据回流；真实 daily-report cron 需调度设施；真实评分/竞品采集/汇率/税务源接入。
