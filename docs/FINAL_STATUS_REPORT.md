# amz AI Operator — 最终交付状态

**日期**：2026-05-16
**会话**：多角色 subagent 多 Round 开发（Plan → Dev → Self-Check → QA → Aggregator）
**状态**：4 模块（M1/M2/M3/M4）+ 跨模块联动 + 全局通知总线 全部 PASS

---

## 1. 产品摘要（30 秒读）

> **一句话定位**（PRD §1.1）：「给亚马逊卖家的 AI 操盘手 —— 一个人 + AI = 一个运营团队。」
> 内部更准确：**AI 副驾驶 + 可选自动驾驶**（决策权在用户，全自动模式有护栏 + 审计 + 一键回滚）

| 模块 | 一行概述 |
|---|---|
| **M1 Listing 优化室** | 选目标（own/external/new_listing）→ 5 维度调研 → 5 维度打分 → 多轮生成 → 5 版本管理 + diff + combined-pick → 图片生成 → A/B 测试 |
| **M2 实时利润 + 库存决策** | 利润下钻（overview/skus/waterfall/order 4 级闭合）+ leak / cashflow / scenario / PO 状态机 / 滞销重定价 / 汇率敞口 / 税务 / LTV / 自定义告警 / 维度切换 / M2→M3 库存联动 |
| **M3 生命周期广告** | Strategy 库 / Timeline 采纳建议 / 外部更改捕获 / LX 实体（portfolio/campaign/adGroup/ad/targeting/negative）/ SQP 加投 / KW 抢位 / 策略 ↔ Campaign 多对多绑定 / 14 类 audit revert 反向 dispatch |
| **M4 日常运营监控中心** | 异常状态机 / SLA / Resolution Case + 推荐 / Postmortem / 跟卖（→M3 暂停广告 + 24h dedup）/ 侵权 / 评论 + 聚类（→M1）/ 申诉重提链 / 多轮 Recovery / 竞品快照 + image-diff（→M1）/ 品牌防御 / 通知总线 |

---

## 2. 实施总览

| 模块 | 后端表 | endpoints | smoke | QA 场景 × 迭代 | 前端页 | 状态 |
|---|---:|---:|---|---|---|---|
| M1 Listing | 8 | 30 | 12/12 PASS | 10 × 5 = 50/50 PASS | 3 Flow + 6 m1 组件 | PASS |
| M2 利润 / 库存 | 24 | 50 | 55/55 PASS | 10 × 5 = 50/50 PASS | 19 / 19 | PASS |
| M3 广告 | 17 (+1 join 表) | ~70 | 10/10 PASS | 10 × 5 = 50/50 PASS + 18 fix×5 = 90 PASS + 10/10 e2e | 24 改造 | PASS |
| M4 监控 / Review | 13 (+ m4_notifications 共享 + reviews ALTER) | 57 | 58/58 PASS | 11 × 5 = 55/55 PASS | 14 / 16 done · 2 partial | PASS (2 partial 不阻塞) |
| **合计** | **62 张新表 + reviews ALTER + 1 m2-m4 共享** | **~207 endpoints** | **135/135** | **41 场景 × 5 = 205/205** | **63+ 页 / 组件** | **PASS** |

---

## 3. 跨模块联动 — 已验证

| 联动 | 触发点 | 接收效果 | trace 来源（audit_logs） | 状态 |
|---|---|---|---|---|
| M2 → M1 重定价 | `POST /m2/repricing/:id/apply` | `m1_listing_versions` 新版本（source=`m2_reprice`） | REPRICE_APPLY → LISTING_VERSION_CREATE_FROM_M2 ×16 | PASS |
| M2 → M1 滞销降价 | `POST /m2/inventory/slow-moving/:id/execute option=A` | `m1_listing_versions` 新版本 + 3 层 audit 链 | SLOW_MOVING_EXECUTE → REPRICE_DOWN → LISTING_VERSION_CREATE_FROM_M2 ×22 | PASS |
| M2 → M3 库存联动 | `POST /m2/inventory-link/events/:id/execute` | 关联 ASIN 的活跃 campaigns 收影响列表 | INVENTORY_LINK_EXECUTE ×17（seed 池 ASIN 不匹配 → impactCampaigns=[]，但 audit 路径完整） | PASS w/ caveat |
| M2 → M4 自定义告警 | `POST /m2/alerts/scan` 命中规则 | `m2_alert_events` +1 + `m4_notifications` +1 | ALERT_SCAN ×25 + 通知 push | PASS |
| M4 → M3 跟卖暂停广告 | `POST /m4/hijacking/:id/upload-proof type=counterfeit_confirmed` | `lx_campaigns.enabled=0` + `ad_suggestions(cross_module=M4_TO_M3)` | M3_PAUSE_ADS_FROM_M4 ×17 | PASS |
| M4 → M3 24h dedup | 同 ASIN 同日第二次 confirm | 跳过暂停 + 写 skip audit | M3_PAUSE_DEDUP_SKIP ×26 | PASS |
| M4 → M3 close 恢复 | `POST /m4/hijacking/:id/close` | `lx_campaigns` 还原 enabled | M3_RESUME_ADS_FROM_M4 ×15 | PASS |
| M4 → M1 评论聚类 push | `POST /m4/review-clusters/:id/push-m1` | `m1_optimization_targets` 新行 (source=`m4_cluster:<id>`) | M1_TARGET_CREATE (payload LIKE '%m4_%') ×32（含 image-diff） | PASS |
| M4 → M1 image-diff push | `POST /m4/image-diffs/:id/push-m1` | `m1_optimization_targets` 新行 (source=`m4_image_diff:<id>`) | M1_TARGET_CREATE ×N | PASS |
| 全局通知总线 | 任一模块写入 `m4_notifications` | `NotificationBell.vue` 顶栏 10s poll → 弹层 + markRead | useNotificationsBus 单例 + `/m4/notifications/*` 端点 | PASS |
| Audit Revert（M3） | `POST /audit-logs/:id/revert` | 17 类 actionType 反向 dispatch 真实回滚资源 | revertM3Action ×13 actionType × 5 iter = 65 PASS | PASS |

---

## 4. 流水线执行记录

| Phase | Agent | 主要交付 | 结果 |
|---|---|---|---|
| Round 1 Plan + Dev (M1/M2/M3/M4) | 多个 dev subagent | 4 模块 SPEC → 后端 + 前端代码 + 13 份模块报告 | 完成（基础在前序 Round） |
| **Phase 1** BE Self-Check | `p1-be-selfcheck` | M2 smoke 55/55 + M4 smoke 58/58 + 跨模块 trace 3/3 | **PASS** — 2 bug 修（`m4_notifications` type NOT NULL；`reviews.product_id` NOT NULL）|
| **Phase 2** FE Self-Check | `p2-fe-selfcheck` | build 7.58s PASS；M2 19/19 接入 0 mock；M4 14/16 接入；NotificationBell 挂在 DefaultLayout:174 | **PASS** — 2 medium 偏差（BrandDefense.vue / Notifications.vue 仍 mock）|
| **Phase 3** M2 QA | `p3-m2-qa` | 10 场景 × 5 iter = 50/50 PASS | **PASS** — 4 bug 修 (S1 overview/skus 闭合 / S3 REPRICE_DOWN 中间审计 / S7 LTV cac_breakeven 公式 / S8 `/alerts/scan` endpoint + M4 通知) |
| **Phase 4** M4 QA | `p4-m4-qa` | 11 场景 × 5 iter = 55/55 PASS（端口 8081，与 M2 并行）| **PASS** — 1 bug 修 (`recommendCases` 早期 return 跳过 ref_count UPDATE) |
| **Phase 5** Aggregator | `p5-aggregator` | 本文档 + MEMORY.md + PROJECT_STATUS.md 覆盖写 | — |

---

## 5. 已修 Bug 总览（按阶段）

### Phase 1 BE Self-Check（2 bug）
- **BE-BUG-1** `apps/api/src/data-store-monitor.mjs:~459` `emitNotification` 未填 `m4_notifications` 的 `type / detail / related_id / acknowledged` 兼容列（M2 模块先建表带 NOT NULL）→ 所有 M4 写通知 500。**FIXED**。
- **BE-BUG-2** `apps/api/src/data-store-monitor.mjs:~1348` `syncReviews` 插入 `reviews.product_id=null`，但列为 NOT NULL。**FIXED**：按 asin 查 `products`，fallback `'unknown-'+asin`。

### Phase 3 M2 QA（4 bug）
- **B1 (S1)** `apps/api/src/data-store-profit.mjs` `getProfitOverview()`：当 `m2_sku_profit_snapshots` 有当前 range 行时按 snapshot 求和（与 `listSkuProfit` 一致），避免滚动窗口飘移导致 overview/skus 失闭合。
- **B2 (S3)** `apps/api/src/data-store-profit.mjs` `executeSlowMoving()` option=A：在 `_writeM1ListingVersionFromM2` 之前插入 `REPRICE_DOWN` 子 audit，形成 3 层链 SLOW_MOVING_EXECUTE → REPRICE_DOWN → LISTING_VERSION_CREATE_FROM_M2。
- **B3 (S7)** `apps/api/src/data-store-profit.mjs` `seedProfitForUser()` LTV 段公式 + DB 一次性 UPDATE：high_ltv 行 `cac_breakeven = aov × (1+rate×0.5)` 严格 > aov。
- **B4 (S8)** 新增 `POST /m2/alerts/scan` endpoint：`apps/api/src/data-store-profit.mjs::scanAlerts` + `apps/api/src/store-routes-profit.mjs` 路由 + import；scan 命中规则后写 `m2_alert_events` + `m4_notifications` + `ALERT_SCAN` audit。

### Phase 4 M4 QA（1 bug）
- **M4-QA-1** `apps/api/src/data-store-monitor.mjs:926-939` `recommendCases()`：将 `reference_count` UPDATE 循环上移到 `if (direct.length>=5) return direct;` 之前；修复 ≥5 条复用 case 后短路径下 ref_count 永不自增，对齐 SPEC §9 场景 3。

**5 Phase 累计已修 Bug：7 条**（全部 P0 / P1，已 commit 到工作树但未 git commit）

---

## 6. 未修偏差 / 已知问题（不阻塞，下一轮迭代再处理）

| ID | 描述 | 严重度 | 建议处理 |
|---|---|---|---|
| FE-M4-01 | `apps/web-v2/src/pages/BrandDefense.vue:5` 仍 `import { mockBrandDefense }`；`useBrandDefense` composable + `brandDefenseApi` 已就绪未引用 | medium | 下一轮 FE 重写页面接入 |
| FE-M4-02 | `apps/web-v2/src/pages/Notifications.vue:5` 仍 `import { mockNotifications }`；可改 `notificationsApi.list({limit:100})` 或复用 `useNotificationsBus().list` | medium | 下一轮 FE 重写 |
| M2-O1 | LTV seed 仅 3 行（SPEC §6.2 标称 5）— 不影响 S7 业务约束 | P2 | seed 补 2 行 |
| M2-O2 | `revertAuditLog()` 不级联子 audit 实际 SQL 状态翻转（只翻父 audit.reverted=1）— S3 子 audit 在父 revert 后未真还原 | P1 | revertM3Action 风格扩展到 M2 三层链 |
| M2-O3 | `createPO` 使用 items[].qty 字段而非 spec 文字描述的 quantity — 前端已对齐 | P3 | 文档勘误 |
| M2-O4 | M3 `lx_ads` seed ASIN 不含 M2 SKU → `impactCampaigns:[]` （S10）— audit 链完整 | P2 | M3 seed 扩展 ASIN 池 |
| M2-O5 | `ad_manual_changes` 无 `cause` 列 — 防 loop 在 `cross_module_loop` 计数器层 | P3 | schema 增列或保留现状 |
| M4-观察-1 | 场景 2 SLA 后台 tick 未实现（cron / setInterval 缺）— manual escalate 端点完整 | P2 | 加 `setInterval(checkSlaBreached, 60_000)` |
| M4-观察-2 | acknowledge 转 `investigating`（SPEC §9 文字写 `acknowledged`，但 §6 状态机用 investigating）| 文档级 | 修 SPEC §9 文字 |
| M4-观察-3 | infringement `outcome='accepted'` 一步落库为 `status='resolved'`（SPEC §9 描述两步链） | P3 | 拆为 2 步或更新 SPEC |
| M4-观察-4 | `syncReviews` seedTag 决定性差 — limit=12 偶发负面 < 3 不触发 burst | P2 | 加 minNegativeShare 或自动 retry seed |
| M4-观察-5 | `m4_competitor_snapshots` 重复跑不去重 — timeline 跨 QA 重跑会增长 | P3 | 加唯一索引 (asin, snapshot_at_minute) |

---

## 7. 报告索引（13 份模块报告 + 1 份 final）

| 模块 | 后端 | 前端 | 测试 | 修复 |
|---|---|---|---|---|
| M1 | `D:/amz/docs/M1_BACKEND_REPORT.md` | `D:/amz/docs/M1_FRONTEND_REPORT.md` | `D:/amz/docs/M1_TEST_REPORT.md` | — |
| M2 | `D:/amz/docs/M2_BACKEND_REPORT.md` | `D:/amz/docs/M2_FRONTEND_REPORT.md` | `D:/amz/docs/M2_TEST_REPORT.md` | — |
| M3 | `D:/amz/docs/M3_BACKEND_REPORT.md` | `D:/amz/docs/M3_FRONTEND_REPORT.md` | `D:/amz/docs/M3_TEST_REPORT.md` | `D:/amz/docs/M3_FIX_REPORT.md` |
| M4 | `D:/amz/docs/M4_BACKEND_REPORT.md` | `D:/amz/docs/M4_FRONTEND_REPORT.md` | `D:/amz/docs/M4_TEST_REPORT.md` | — |
| Final | `D:/amz/docs/FINAL_STATUS_REPORT.md`（本文件） | — | — | — |

---

## 8. 数据库累计快照（截止 Phase 4 收尾）

`D:/amz/apps/api/data/store.db` (SQLite + WAL 模式, better-sqlite3 驱动)

### M1（8 张表）
m1_optimization_targets 152 / m1_research_reports 12 / m1_listing_scores 54 / m1_optimization_runs 355 / m1_listing_versions 365 / m1_generated_images 107 / m1_ab_tests 47 / m1_ab_metrics 714

### M2（24 张表）— Phase 3 收尾累计
m2_orders 412 / m2_order_costs 5768 / m2_sku_profit_snapshots 9 / m2_cashflow_events 129 / m2_leaks 12 / m2_scenarios 4 / m2_inventory_snapshots 12 / m2_reorder_recommendations 4 / m2_slow_moving_decisions 2 / m2_inventory_transfers 3 / m2_purchase_orders 32 / m2_purchase_order_items 38 / m2_suppliers 5 / m2_repricing_recommendations 4 / m2_fx_rates 30 / m2_fx_exposures 4 / m2_payment_channels 5 / m2_tax_records 8 / m2_ltv_snapshots 3 / m2_alert_rules 26 / m2_alert_events 31 / m2_dimensions 11 / m2_inventory_link_config 1 / m2_inventory_link_events 2

### M3（17 张表 + 1 join 表）
ad_strategies 83 / ad_suggestions 8 / ad_manual_changes (变动) / ad_strategy_bindings (新建) / lx_portfolios 5 / lx_campaigns 16 / lx_ad_groups 4 / lx_ads 2 / lx_targetings 7+ / lx_negatives 4 / lx_user_search_terms 6 / lx_operation_logs 7+ / lx_daily_data 14 / lx_kw_grabbing 3 / lx_placements 20 / lx_amc_audiences 3 / sqp_queries 28 / search_term_reports 28

### M4（14 张表）— Phase 4 收尾累计
m4_anomalies 149 / m4_sla_events 332 / m4_resolution_cases 29 / m4_postmortems 19 / m4_hijacking 77 / m4_infringement 19 / m4_review_clusters 48 / m4_review_trend_snapshots 92 / m4_appeals 79 / m4_recovery_emails 36 / m4_competitor_snapshots 63 / m4_image_diffs 20 / m4_brand_defense_layers 4 / m4_notifications 318 / reviews 682

### 跨模块审计
audit_logs (M4) 968 / M3_PAUSE_ADS_FROM_M4 17 / M3_PAUSE_DEDUP_SKIP 26 / M3_RESUME_ADS_FROM_M4 15 / M1_TARGET_CREATE (M4 origin) 32 / LISTING_VERSION_CREATE_FROM_M2 38 / audit_logs (合计) ≥1309

---

## 9. 建议下一步

1. **baseline commit（最优先）** — 4 Round 多 subagent Dev + 5 Phase 验收（Self-Check + QA + Aggregator）全部产出仍在工作树（README.md modified + 大量 ?? untracked：`apps/`, `packages/`, `scripts/`, `infra/`, `tests/`, `docs/`, `playwright.config.mjs`, `package.json`, `package-lock.json`, `.env.example`, `.github/`, `.gitignore`, `.claude/`, `AGENTS.md`, `MEMORY.md`, `PRD.md`, `PROJECT_STATUS.md`, `test-results/`, `tmp/`）。建议立即按模块分多次 commit 入库以免丢失。
2. **解 FE-M4-01 / FE-M4-02**（2 个 partial 前端页面接入真接口）
3. **解 M2-O2**：把 revertM3Action 的"反向 SQL 还原"风格扩展到 M2 三层 audit 链
4. **解 M4-观察-1**：加 SLA 后台 tick `setInterval(checkSlaBreached, 60_000)`
5. **M3 seed 扩展 ASIN 池**：让 `lx_ads` 包含 `B0CASE001 / B0CABLE002 / B0LAMP003`，使 M2→M3 库存联动 `impactCampaigns` 非空（解 M2-O4）
6. **真实凭证接入**：SP-API 沙箱 / Ads API 沙箱 / Keepa / SellerSprite / Helium10 / LLM Provider（按 PRD §13 顺序）
7. **加 Playwright e2e 覆盖**到 M1 / M2 / M4（M3 已有 10/10 e2e）

---

## 附录 A：完整 sentinel 链

5 个 Phase 的 STARTED / HEARTBEAT / DONE 路径：

| Phase | STARTED | DONE | endedAt (UTC) |
|---|---|---|---|
| p1-be-selfcheck | `D:/amz/tmp/sentinels/p1-be-selfcheck.STARTED` | `D:/amz/tmp/sentinels/p1-be-selfcheck.DONE` | 2026-05-15T19:25:28Z |
| p2-fe-selfcheck | `D:/amz/tmp/sentinels/p2-fe-selfcheck.STARTED` | `D:/amz/tmp/sentinels/p2-fe-selfcheck.DONE` | 2026-05-15T19:14:22Z |
| p3-m2-qa | `D:/amz/tmp/sentinels/p3-m2-qa.STARTED` | `D:/amz/tmp/sentinels/p3-m2-qa.DONE` | 2026-05-15T19:46:15Z |
| p4-m4-qa | `D:/amz/tmp/sentinels/p4-m4-qa.STARTED` | `D:/amz/tmp/sentinels/p4-m4-qa.DONE` | 2026-05-15T19:43:04Z |
| p5-aggregator | `D:/amz/tmp/sentinels/p5-aggregator.STARTED` | `D:/amz/tmp/sentinels/p5-aggregator.DONE` | 本次 |

HEARTBEAT 文件按协议覆盖写，最新一条反映该 phase 末态。

## 附录 B：核心运行时栈

| 层 | 实现 |
|---|---|
| 持久层 | SQLite + better-sqlite3（WAL 模式 / `apps/api/data/store.db`） |
| API | Node 内置 http server（`apps/api/src/server.mjs`） + ES Module |
| 路由分发 | `extended-routes.mjs` 按前缀派发到 store-routes-{ads,listings,profit,monitor}.mjs |
| 前端 | Vue 3 SPA + Vite + Element Plus（`apps/web-v2/`），编译产物 `dist/` |
| 跨模块状态 | audit_logs 单表 + 反向 dispatch + previousValues JSON + cross_module='M*_TO_M*' 标签 |
| 通知总线 | `m4_notifications` 表 + `useNotificationsBus` 单例 + `NotificationBell.vue` 10s poll |
| 测试 | curl + better-sqlite3 query helper（tmp/m{1..4}-qa-*.{sh,cjs}） + Playwright (M3 e2e 10/10) |
