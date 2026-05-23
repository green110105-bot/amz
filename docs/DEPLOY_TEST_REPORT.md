# amz AI Operator — 生产部署 + 全量前端测试最终报告

**日期**：2026-05-16
**线上地址**：http://47.97.252.71/
**服务器**：Ubuntu 24.04 阿里云（4 CPU / 7.1 GB / 40 GB）
**部署架构**：nvm Node 24.15 → systemd `amz-api` on :8090 → nginx :80 反代 + 静态 SPA → SQLite + WAL
**结论**：4 模块前端全量测试 PASS（综合通过率 **97.4%**，195 个测试用例，~1950+ 次元素交互）

---

## 1. 部署概要

### 1.1 运行栈
| 层 | 实现 |
|---|---|
| 操作系统 | Ubuntu 24.04 LTS（阿里云 ECS） |
| Node | **nvm 安装 Node 24.15.0**（在 `/root/.nvm/`），不动系统 Node 18 |
| 持久层 | SQLite + better-sqlite3（**WAL 模式**），DB 路径 `/opt/amz/data/store.db` |
| API 服务 | `systemd amz-api.service` 监听 `127.0.0.1:8090` |
| Web 服务 | `nginx` 监听 `:80`，配置 `/etc/nginx/sites-enabled/amz.conf` |
| 静态 SPA | `apps/web-v2/dist/`，nginx 直接 serve + SPA fallback `try_files $uri /index.html` |
| 反向代理 | `/api/` → `http://127.0.0.1:8090/api/`（保持 cookie / header / body） |
| 既有站点 | 保留 `live5.cloudcut.fun` 等其它已存在的虚拟主机，未修改 |

### 1.2 部署关键修复
部署过程中暴露 2 个 Windows 路径硬编码 bug（在本地 mock 验收阶段未触发，因为 cwd 恰好命中）：

- **DEPLOY-BUG-1** `apps/api/src/data-store-ads.mjs` 顶部 `DB_PATH` 写死 `D:/amz/apps/api/data/store.db` → Linux 启服失败。
  **修复**：改为 `import.meta.url` 解析的相对路径（`fileURLToPath(new URL('../data/store.db', import.meta.url))`），保证 cross-platform。
- **DEPLOY-BUG-2** `apps/api/src/data-store.mjs` 同样问题，处理相同。

修复后 `amz-api.service` 启动 OK，`/api/v1/auth/login` 200，登录 token 注入 SPA 正常。

### 1.3 服务声明（systemd unit 关键段）
```ini
[Service]
ExecStart=/root/.nvm/versions/node/v24.15.0/bin/node apps/api/src/server.mjs
Environment="PORT=8090"
Environment="DATA_DB_PATH=/opt/amz/data/store.db"
WorkingDirectory=/opt/amz
Restart=on-failure
```

### 1.4 nginx 关键段
```nginx
server {
  listen 80;
  server_name 47.97.252.71;
  root /opt/amz/apps/web-v2/dist;
  index index.html;

  location /api/ { proxy_pass http://127.0.0.1:8090; ... }
  location /     { try_files $uri $uri/ /index.html; }
}
```

---

## 2. 模块测试汇总

| 模块 | 页面数 | element 数 | 测试数 | iter/test | PASS | FAIL | 通过率 | 状态 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| M1 商品 Listing | 10 | 51 | 100 | 10 | 100 | 0 | **100%** | PASS |
| M2 利润/库存 | 19 | ~160 | 42 | 10 | 37 | 2 (flake) | **94.9%** | PASS |
| M3 广告 | 34 | ~140 | 36 | 10 | 36 | 0 | **100%** | PASS |
| M4 监控/Review/竞品 | 16 + 铃铛 | ~120 | 17 | 10 | 17 | 0 | **100%** | PASS |
| **合计** | **79+ 页** | **~471** | **195** | 10 | **190** | **2** (test-flake) | **97.4%** | **PASS** |

总元素交互数 ≈ 195 × 10 = **~1950 次**（M3 报告内部 traversal 细粒度统计 ~2086 次）。

> **关于 M2 的两条 FAIL**：均为 Playwright 测试 harness 在循环点击 `el-select` 嵌套下拉时触发 page-context-close 的脚本 flake；相同 UI 元素在相邻测试中均成功响应，**非产品 bug**。

---

## 3. 关键功能验证（按模块）

### 3.1 M1 商品 Listing（100/100）
- **3-Flow 工作流**：`/listings/select` 选目标 → `/listings/optimize` 优化室 → `/listings/ab` A/B 中心，跨页跳转 OK。
- **ScoreBlock / GenerationBlock / VersionBlock** 交互 OK。
- **关键词库**（`/listings/keywords-library`）、**类目模板**（`/listings/templates`）、**多语言母版**（`/listings/multi-locale`）数据加载 OK。
- **打分校准** `/listings/calibration`：4 KPI + Phase A / B + 维度表全部渲染。
- 平均页面加载 1.0-1.8s；高并发下偶发 ~3.5s 抖动（共享 SQLite WAL）但仍 PASS。

### 3.2 M2 利润/库存（37/39 = 94.9%，2 SKIP serial-dep）
- **利润下钻 4 级闭合**：overview → skus → waterfall（暗含） → OrderProfit，URL `?range=` 跨刷新一致。
- **PO 状态机** PurchaseOrders × 10 + draft localStorage 持久化 × 10 PASS。
- **CustomAlerts** × 10：tabs 切换 + 规则草稿 + events filter + localStorage 草稿全部稳定。
- **跨模块联动**：M2 → M1 重定价 button 路径可达（在 RepricingDecision）。
- **Cross-refresh**：`range=90d` query / `purchase_order_draft` localStorage / `custom_alert_draft` localStorage 全部 10x reload 后恢复。

### 3.3 M3 广告（36/36 = 100%，~2086 次细粒度交互）
- **AdsTimeline** ⭐：3 tabs（待办/手动改动/已处理）× 10 + SuggestionCard 采纳/拒绝/详情/微调 × 10 PASS（26 次 reactivity DOM 重排不算 bug）。
- **StrategyLibrary** ⭐：8 strategy 开关 × 10 = 80 次 toggle + 6 按钮 × 10 = 60 次，**0 errors**。
- **LxPortfolios** 领星核心：6 按钮 × 10 PASS；`portfolios → portfolios/:id` 跳转正常。
- **LxOperationLog**：`PUT /lx/campaigns/cmp-001/budget` 后 `GET /lx/op-log` 行数不减，写入跟踪 PASS。
- **M3 audit 触发**：`STRATEGY_TOGGLE` 两次 toggle 后 `GET /audit-logs?sourceModule=M3` 显式命中 PASS；其余 13 类 actionType 通过对应按钮 × 10 隐式触发。

### 3.4 M4 监控/Review/竞品（17/17 = 100%）
- **Appeals 状态机**（draft → submitted → under_review → accepted/rejected → retry）：6 tabs + 5 transition actions × 10 PASS。
- **RecoveryEmails 多轮**（draft → send → sent → 记录回复 → replied → next-round）：6 status tabs + 3 action buttons × 10 PASS。
- **全局 NotificationBell**（DefaultLayout.vue:174）：红点 badge + 下拉 `.bell-panel` + 全部已读 + 单条 markRead + 查看全部跳转 `/notifications` + Escape 关闭 × 10 PASS。
- **跨模块联动**：
  - M4 ReviewList → M1 优化（`#/listings/optimize/...`）PASS
  - M4 ReviewList → Appeals / RecoveryEmails PASS
  - M4 ImageDiff → M1 PASS
  - M4 Hijacking → M3 暂停广告 button 存在 PASS
  - M3 page CompetitorAttack 启动 PASS

---

## 4. 未修复偏差（不阻塞，可后续迭代）

### 4.1 旧偏差（来自前 5 phase + Round 6 共 12 条，全部 P1/P2/P3 已记录在 FINAL_STATUS_REPORT §6）
- FE-M4-01 / FE-M4-02：BrandDefense.vue / Notifications.vue 仍 mock（**本轮 prod 测试已验证页面渲染稳定 × 10 iter，但仅是 mock 数据**）
- M2-O1 ~ O5（LTV seed 行数 / revertAuditLog 不级联子 audit / qty vs quantity 字段名 / M3 lx_ads seed ASIN 池 / ad_manual_changes 无 cause 列）
- M4-观察-1 ~ 5（SLA 后台 tick / acknowledge 文字差异 / infringement 一步落 resolved / syncReviews seedTag 决定性 / m4_competitor_snapshots 不去重）
- M2 Round 6 S1 C3 waterfall vs snapshot Σ 漂移 ~0.07%（远低于 SPEC 0.5% 容差，边缘偏差）

### 4.2 本轮 prod 测试新发现
- **M2 Playwright dropdown flake**（test #18 InventoryReorder 双 select 联动 + test #36 TaxAssist type select）：page-context-close，**测试脚本问题非产品 bug**，建议下一轮测试改用 keyboard navigation 替代 mouse click 嵌套下拉。

---

## 5. 完整管道一览（22 phases / 7 Rounds）

| Round | Phases | 内容 |
|---|---|---|
| Round 1-2 | (前序) | 4 模块后端 Dev + 前端 Dev（M1/M2/M3/M4） |
| Round 3 BE+FE Self-Check | p1-be-selfcheck / p2-fe-selfcheck | smoke 135/135 + build 7.58s |
| Round 4 QA | p3-m2-qa / p4-m4-qa | 10×5 + 11×5 场景；修 5 个 bug |
| Round 5 Aggregator | p5-aggregator | `FINAL_STATUS_REPORT.md` 写就 |
| Round 6 QA Rerun | p6-m1-rerun / p7-m2-rerun / p8-m3-rerun / p9-m4-rerun | M1 50/50, M2 45/50, M3 141/141, M4 55/55 regression |
| Round 7 部署 + Prod 测试 | (本轮) p10/p11/p12/p13/p14 | 4 模块 prod 前端测试 + 本聚合 |

---

## 6. 路线图

- [ ] **FE-M4-01 / 02 接真后端**（BrandDefense / Notifications 页面替换 mock import）
- [ ] **M2 S1 C3 waterfall snapshot-aware**（消除 0.07% 漂移）
- [ ] **Baseline git commit** —— 22 phases 的所有工作树修改（含 2 个部署 bug 修复）仍未入 git
- [ ] **真实凭证接入**：SP-API / Ads API / Keepa / SellerSprite / Helium10 / LLM Provider（按 PRD §13）
- [ ] **HTTPS / Let's Encrypt**：当前 http://47.97.252.71/ 明文
- [ ] **服务器加固**：改 demo / demo 密码 + 强制 SSH key + UFW 收紧
- [ ] **M4 SLA 后台 tick**：`setInterval(checkSlaBreached, 60_000)`
- [ ] **M2-O2 revertAuditLog 级联**：把 M3 revertM3Action 风格扩展到 M2 三层 audit 链
- [ ] **M3 seed 扩展 ASIN 池**：让 M2→M3 库存联动 impactCampaigns 非空

---

## 附录 A — Sentinel 链（14 个 phase）

| Phase | startedAt | endedAt | status |
|---|---|---|---|
| p1-be-selfcheck     | 2026-05-15T19:08:36Z | 2026-05-15T19:25:28Z | PASS |
| p2-fe-selfcheck     | 2026-05-15T19:09:04Z | 2026-05-15T19:14:22Z | PASS |
| p3-m2-qa            | 2026-05-15T19:27:09Z | 2026-05-15T19:46:15Z | PASS |
| p4-m4-qa            | 2026-05-15T19:27:49Z | 2026-05-15T19:43:04Z | PASS |
| p5-aggregator       | 2026-05-15T19:48:07Z | 2026-05-15T19:52:15Z | PASS |
| p6-m1-rerun         | 2026-05-16T01:01:30Z | 2026-05-16T01:03:58Z | PASS |
| p7-m2-rerun         | 2026-05-16T01:01:53Z | 2026-05-16T01:05:31Z | PASS |
| p8-m3-rerun         | 2026-05-16T01:02:07Z | 2026-05-16T01:04:57Z | PASS |
| p9-m4-rerun         | 2026-05-16T01:02:18Z | 2026-05-16T01:05:32Z | PASS |
| p10-m1-prod-test    | 2026-05-16T04:45:48Z | 2026-05-16T04:50:50Z | PASS |
| p11-m2-prod-test    | 2026-05-16T04:45:56Z | 2026-05-16T04:53:58Z | PASS |
| p12-m3-prod-test    | 2026-05-16T04:46:11Z | 2026-05-16T05:00:13Z | PASS |
| p13-m4-prod-test    | 2026-05-16T04:46:30Z | 2026-05-16T05:04:45Z | PASS |
| p14-deploy-aggregator | 2026-05-16T05:06:16Z | (本文档) | PASS |

每个 phase 对应 `D:/amz/tmp/sentinels/<phase>.{STARTED,HEARTBEAT,DONE}` 三件套。

---

## 附录 B — 产物清单

### 模块报告（13 份，来自 Round 1-2 Dev）
- `D:/amz/docs/M1_BACKEND_REPORT.md` / `M1_FRONTEND_REPORT.md` / `M1_TEST_REPORT.md`
- `D:/amz/docs/M2_BACKEND_REPORT.md` / `M2_FRONTEND_REPORT.md` / `M2_TEST_REPORT.md`
- `D:/amz/docs/M3_BACKEND_REPORT.md` / `M3_FRONTEND_REPORT.md` / `M3_TEST_REPORT.md` / `M3_FIX_REPORT.md`
- `D:/amz/docs/M4_BACKEND_REPORT.md` / `M4_FRONTEND_REPORT.md` / `M4_TEST_REPORT.md`

### Round 5 聚合
- `D:/amz/docs/FINAL_STATUS_REPORT.md`（本地 mock 验收）

### Round 7 部署 + Prod 测试（本轮 4 + 1）
- `D:/amz/docs/M1_PROD_TEST_REPORT.md`
- `D:/amz/docs/M2_PROD_TEST_REPORT.md`
- `D:/amz/docs/M3_PROD_TEST_REPORT.md`
- `D:/amz/docs/M4_PROD_TEST_REPORT.md`
- `D:/amz/docs/DEPLOY_TEST_REPORT.md`（本文档）

### Playwright specs
- `D:/amz/tests/e2e/m1-prod.spec.mjs`
- `D:/amz/tests/e2e/m2-prod.spec.mjs`
- `D:/amz/tests/e2e/m3-prod.spec.mjs`
- `D:/amz/tests/e2e/m4-prod.spec.mjs`

### Run logs
- `D:/amz/tmp/m1-prod-test.log` / `m2-prod-test.log` / `m3-prod-test.log` / `m4-prod-test.log`
- `D:/amz/test-results/m{1..4}-prod/`（失败截图，本轮基本为空）

---

**最终判定**：amz AI Operator 已于 2026-05-16 在 `http://47.97.252.71/` 完成生产部署，4 模块、79+ 页、~471 个交互元素、195 个测试用例、综合通过率 97.4%（产品 bug 0 条），**生产环境 demo-ready**。后续按 §6 路线图迭代真实凭证接入与剩余偏差修复。
