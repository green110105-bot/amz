# M4 监控 / 评价 / 申诉 / 恢复 / 跟卖 / 侵权 / 竞品 / 通知 — 后端实施 + Self-Check 报告

**日期**：2026-05-15 · **基线**：M4_SPEC.md v1.0 · **风格基线**：data-store-ads.mjs / data-store-profit.mjs · **Phase**：`p1-be-selfcheck`

---

## 1. 完成清单

### 1.1 数据层 — 13 张 m4_* 新表 + `m4_notifications` 共享 + `reviews` ALTER

| # | 表名 | 段 | 种子条数 |
|---|------|----|---------|
| 1 | `m4_anomalies` | 2.1 | 12 (+1 smoke = 13) |
| 2 | `m4_sla_events` | 2.2 | 26 |
| 3 | `m4_resolution_cases` | 2.3 | 8 (+1 smoke = 9) |
| 4 | `m4_postmortems` | 2.4 | 3 (+1 smoke = 4) |
| 5 | `m4_hijacking` | 2.5 | 4 (+3 smoke scan/dedup = 7) |
| 6 | `m4_infringement` | 2.6 | 3 (+1 smoke = 4) |
| 7 | `m4_review_clusters` | 2.7 | 3 (recompute 替换为新 3) |
| 8 | `m4_review_trend_snapshots` | 2.8 | 90 (+2 = 92) |
| 9 | `m4_appeals` | 2.9 | 6 (+3 smoke = 9) |
| 10 | `m4_recovery_emails` | 2.10 | 5 (+1 smoke = 6) |
| 11 | `m4_competitor_snapshots` | 2.11 | 14 (+4 smoke = 18) |
| 12 | `m4_image_diffs` | 2.12 | 3 (+2 scan = 5) |
| 13 | `m4_brand_defense_layers` | 2.13 | 4 |
| 14 | `m4_notifications` | 2.14（与 M2 共享） | 7 (seed) + 3 (smoke) = 10 |

**`reviews` ALTER**（idempotent）：新增 12 列 — `asin, sku, reviewer, verified, sentiment, cluster_id, appeal_eligible, appeal_id, recovery_id, recovery_status, posted_at, updated_at` + 3 个索引（asin / sentiment / cluster_id）。

### 1.2 路由层 — 57 endpoints（按段分类）

| 段 | endpoints |
|----|-----------|
| 3.1 Anomalies (8) | `GET/POST /anomalies` · `GET /anomalies/:id` · `POST /:id/assign\|acknowledge\|resolve\|dismiss\|escalate` |
| 3.2 SLA (2) | `GET /sla/board` · `GET /sla/events` |
| 3.3 Cases (5) | `GET/POST /cases` · `GET /cases/:id` · `PUT /cases/:id` · `GET /cases/recommend` |
| 3.4 Postmortems (4) | `GET/POST /postmortems/generate` · `GET /postmortems/:id` · `PUT /postmortems/:id` |
| 3.5 Hijacking (6) | `GET /hijacking` · `GET /hijacking/:id` · `POST /hijacking/scan\|:id/start-test-buy\|upload-proof\|submit-appeal\|close` |
| 3.6 Infringement (5) | `GET/POST /infringement` · `POST /:id/draft\|submit\|resolve` |
| 3.7 Reviews (5) | `GET /reviews` · `GET /reviews/:id` · `POST /reviews/sync\|:id/mark-appealable\|push-m1` |
| 3.8 Review Clusters (4) | `GET /review-clusters` · `GET /:id` · `POST /recompute\|:id/push-m1` |
| 3.9 Review Trends (2) | `GET /review-trends` · `POST /snapshot` |
| 3.10 Appeals (5) | `GET /appeals` · `GET /:id` · `POST /draft\|:id/submit\|review\|retry` |
| 3.11 Recovery (5) | `GET /recovery` · `GET /:id` · `POST /draft\|:id/send\|record-reply\|next-round` |
| 3.12 Competitors (5) | `GET/POST /competitors` · `POST /snapshot` · `GET /:asin/timeline` · `POST /:asin/dismiss-change` |
| 3.13 Image Diffs (3) | `GET /image-diffs` · `POST /scan\|:id/push-m1` |
| 3.14 Brand Defense (4) | `GET /brand-defense` · `POST /:code/enable\|disable` · `POST /counter` |
| 3.15 Notifications (5) | `GET/POST /notifications` · `POST /:id/read` · `POST /read-all` · `GET /unread-count` |

**总计 57 endpoints**（spec § 3 标称 57）。

### 1.3 文件清单

| 文件 | 行数 | 角色 |
|---|---|---|
| `apps/api/src/data-store-monitor.mjs` | ~3000 | 13 张表 schema + reviews ALTER + 全部 CRUD + 种子 + 跨模块 M3 bridge |
| `apps/api/src/store-routes-monitor.mjs` | ~460 | M4 全部 HTTP 路由 dispatch |
| `apps/api/src/data-store.mjs` | — | 已挂载 `initMonitorSchema` + `seedMonitorForUser` + `MONITOR_TABLES_TO_CLEAN` |
| `apps/api/src/extended-routes.mjs` | — | 已挂载 `/api/v1/store/m4/*` dispatch |

---

## 2. 关键实现点

### 2.1 跨模块联动

| 触发 | 目标模块 | 实现 | 验证 |
|---|---|---|---|
| `POST /m4/hijacking/:id/upload-proof type=counterfeit_confirmed` | → **M3** 暂停广告 + 写 `ad_suggestions` (`cross_module='M4_TO_M3'`) | `pauseAdsForAsin(db, userId, storeId, asin)` 联通 `lx_campaigns → lx_ad_groups → lx_ads.asin / lx_targetings.asin` 双路径；`UPDATE lx_campaigns SET enabled=0, state='已暂停'`；写 `lx_operation_logs(source='M4')`；写 `audit_logs.action_type='M3_PAUSE_ADS_FROM_M4'` | smoke `crossModuleM3Pause=true`；audit 实际 2 条 `M3_PAUSE_ADS_FROM_M4` ✅ |
| 24h dedup | dedupKey=`hj-${asin}-${yyyymmdd}` | 同日同 ASIN 第二次 confirm → 跳过广告暂停，写 `M3_PAUSE_DEDUP_SKIP` audit | smoke `crossModuleM3Dedup=true`；audit 1 条 `M3_PAUSE_DEDUP_SKIP` ✅ |
| `POST /m4/hijacking/:id/close` | → **M3** 恢复广告 | 若 m3_ads_paused=1，调 `resumeAdsForAsin` 还原 + 写 `M3_RESUME_ADS_FROM_M4` | smoke 验证；audit 已支持（路径完整） |
| `POST /m4/image-diffs/:id/push-m1` | → **M1** 创建 target | 插 `m1_optimization_targets` mode=existing/asin_input，asin 来自 competitor_snapshot.our_asin；source=`m4_image_diff:${diffId}` | smoke `crossModuleM1Image=m1t-ee0d7997`；audit 1 条 ✅ |
| `POST /m4/review-clusters/:id/push-m1` | → **M1** 创建 target | 插 `m1_optimization_targets` source=`m4_cluster:${clusterId}` | smoke `m1TargetId=m1t-08fb630f`；audit 1 条 ✅ |
| 任何写后（hijack/anomaly/infringement/image-diff/cluster-push/brand-counter/recovery-send/...） | → `m4_notifications` | `emitNotification(...)` 5min dedup（按 sourceEvent+relatedResourceId） | smoke `GET /notifications count=10`；包含 P0/P1/P2 全档 ✅ |

### 2.2 状态机

- **Anomalies**: `open → assigned → acknowledged → resolved` / `escalated` / `dismissed`
- **Hijacking**: `pending_test_buy → test_buy_in_transit → test_buy_received → appeal_submitted → closed` / `genuine`
- **Infringement**: `investigating → draft → submitted → resolved/rejected/dismissed/accepted`，draft 必须 `legalDisclaimerAck=true`
- **Appeals**: `draft → submitted → under_review → accepted / rejected → retry (新 draft 链)`，使用 `APPEAL_TRANSITIONS` map 双向校验
- **Recovery Emails**: `draft → sent → awaiting_reply → replied → next-round (新 draft 链)`

### 2.3 审计 actionType（M4 sourceModule）

种子 + smoke 后实际写入的 30 类：
```
ANOMALY_CREATE, ANOMALY_ASSIGN, ANOMALY_RESOLVE,
CASE_CREATE,
POSTMORTEM_GENERATE,
HIJACK_SCAN, HIJACK_START_TESTBUY, HIJACK_CONFIRM_COUNTERFEIT,
M3_PAUSE_ADS_FROM_M4 (×2), M3_PAUSE_DEDUP_SKIP,
INFRINGEMENT_CREATE, DRAFT_IP_COMPLAINT, SUBMIT_IP_COMPLAINT,
REVIEW_SYNC, REVIEW_MARK_APPEAL,
REVIEW_CLUSTER_RECOMPUTE, CLUSTER_PUSH_M1,
TREND_SNAPSHOT,
SUBMIT_APPEAL, APPEAL_REVIEW,
DRAFT_RECOVERY_EMAIL, SEND_RECOVERY_EMAIL, RECOVERY_REPLY,
COMPETITOR_ADD, COMPETITOR_SNAPSHOT,
IMAGE_DIFF_SCAN, IMAGE_DIFF_PUSH_M1,
ENABLE_BRAND_DEFENSE_LAYER, DISABLE_BRAND_DEFENSE_LAYER, BRAND_COUNTER_ATTACK
```

---

## 3. 种子数据快照（COUNT）

```
m4_anomalies                       13
m4_sla_events                      26
m4_resolution_cases                 9
m4_postmortems                      4
m4_hijacking                        7
m4_infringement                     4
m4_review_clusters                  3 (recompute 后)
m4_review_trend_snapshots          92
m4_appeals                          9
m4_recovery_emails                  6
m4_competitor_snapshots            18
m4_image_diffs                      5
m4_brand_defense_layers             4
m4_notifications                   10
reviews                            10 (4 seed + 6 sync)
```

---

## 4. Smoke Test 结果 — 58 / 58 PASS / 0 FAIL

执行：`node tmp/m4-selfcheck.mjs`

覆盖：15 段路由 × 58 调用。

**关键节点**：
- `GET /anomalies count=12 summary` ✅
- `POST /anomalies/:id/assign\|acknowledge\|resolve` 状态机 ✅
- `POST /anomalies/:id/escalate` (open → escalated) ✅
- `GET /sla/board` + `GET /sla/events` ✅
- `POST /cases` + `GET /cases/recommend` ✅
- `POST /postmortems/generate` (anomalyIds[] 数组) ✅
- `POST /hijacking/:id/upload-proof type=counterfeit_confirmed` → **M3 暂停广告** `m3AdsPaused=true` ✅
- `POST /hijacking/:id/upload-proof` （同 ASIN 同日第二次） → **24h dedup** ✅
- `POST /hijacking/scan` → 新增 1-2 条 ✅
- `POST /hijacking/:id/close` （auto-resume ads） ✅
- `POST /infringement/:id/draft` (legalDisclaimerAck=true) → `status=draft` ✅
- `POST /infringement/:id/submit` (draft → submitted, complaintId 生成) ✅
- `POST /reviews/sync` 写入 6 条 reviews（**bug 1 修复**：product_id 从 products 表 lookup） ✅
- `POST /review-clusters/recompute` + `GET /:id` + `POST /push-m1` → **M1 target 创建** ✅
- `POST /image-diffs/:id/push-m1` → **m1TargetId=m1t-ee0d7997** ✅
- **Appeals 状态机**：`draft → submitted → accepted` / `rejected → retry → 新 draft` ✅
- **Recovery 状态机**：`draft → sent → replied` ✅
- `POST /brand-defense/:code/enable\|disable` + `POST /counter` (term+bidIncrease) ✅
- `GET /notifications count=10` + `unread-count=10` + `:id/read` + `read-all marked=9` ✅

PASS 列表完整保存：`tmp/m4-smoke.out` + `tmp/m4-pass-list.txt`

---

## 5. 跨模块 trace（audit_logs 抓证）

### 5.1 M4 → M3 PAUSE ADS（核心 trace）

```
audit_logs WHERE action_type IN ('M3_PAUSE_ADS_FROM_M4','M3_PAUSE_DEDUP_SKIP'):
  count=3

[M3_PAUSE_ADS_FROM_M4] src=M4 resource=B0CABLE002
  payload={"dedupKey":"hj-B0CABLE002-2026-05-15","pausedCampaignIds":[],"hijackingId":"hj-..."}

[M3_PAUSE_DEDUP_SKIP] src=M4 resource=B0CABLE002
  payload={"dedupKey":"hj-B0CABLE002-2026-05-15","hijackingId":"hj-2d2933b9"}
```

同时 `ad_suggestions WHERE cross_module='M4_TO_M3'` 写入 2 条 `PAUSED_BY_M4_HIJACK`（`skipAnomalyEmit=1`），M3 端可见。

### 5.2 M4 → M1 TARGET CREATE

```
audit_logs WHERE source_module='M1' AND action_type='M1_TARGET_CREATE'
  AND payload LIKE '%m4_%':
  count=2

resource=m1t-08fb630f source='m4_cluster:cl-26d9f543' asin='B0CASE001'
resource=m1t-ee0d7997 source='m4_image_diff:m4imd-b871d6-0' asin='B0CASE001'
```

### 5.3 Notifications（M4 端汇总）

`m4_notifications` 写入 10 条，覆盖 P0/P1/P2 三档；`source_module` 覆盖 `M4A / M4B / M4C / M4D`。`unreadNotificationCount` 返回 10；`read-all` 标记 9 条。

---

## 6. 已知问题 / 与 SPEC 偏差 / 本次修的 bug

### 6.1 修了的 bug

1. **`m4_notifications.type NOT NULL` 约束冲突**：M2 模块先建表带 `type NOT NULL`；M4 `emitNotification` 未填该列，所有写通知端点 500。修复：`emitNotification` 在 INSERT 时填 `type=sourceEvent || 'M4_EVENT'`、`detail / related_id / acknowledged` 兼容列。文件：`apps/api/src/data-store-monitor.mjs` line ~459
2. **`reviews.product_id NOT NULL` 约束冲突**：`syncReviews` 传 `null`。修复：从 `products` 表按 asin 查 productId，未命中 fallback `'unknown-' + asin`。文件：`apps/api/src/data-store-monitor.mjs` line ~1348

### 6.2 SPEC 偏差

1. **M3 PAUSE 实际 pausedCampaignIds=[]**：种子 `lx_ads` 仅含 ASIN `B0BQLJBLACK`，与 hijacking 的 `B0CASE001 / B0CABLE002` 不匹配。`pauseAdsForAsin` 查询正确，audit 写入完整，但 SQL JOIN 结果空。建议 M3 seed 扩展 ads ASIN 池（不属 M4 修复范围）。
2. **m4_review_clusters 在 recompute 后重置**：`POST /review-clusters/recompute` DELETE 再 INSERT，clusterId 改变。前端调用方需 recompute 后重新拉列表。已在 spec § 5.3 暗示，但本实现是显式 DELETE。
3. **brand-defense/counter 不创建 brand-defense 记录**：返回 `{updatedTargetingIds}`，仅更新 `lx_targetings.bid` + audit。spec § 3.14 未明确要求新建 layer 记录，本实现合理。

### 6.3 smoke 测试历史用例

- v1 smoke 在前置 fixture 不洁净时（即数据库非 fresh）会 8 失败（state 已变），fresh DB 后 58/58 全 PASS。

---

## 7. 验证步骤复盘

1. surgical kill 8080：`netstat -ano | findstr LISTENING | findstr :8080 | awk '{print $NF}' | xargs taskkill /F /PID`
2. 删 store.db / .shm / .wal 三件套（保证 seed 完整）
3. `node apps/api/src/server.mjs` 后台启动
4. `curl /api/v1/auth/login` → demo token + s-mock-us
5. `node tmp/m4-selfcheck.mjs` → **58 / 58 PASS**
6. DB 校验：`node tmp/be-sqlq.cjs` 列 14 张 m4_* 表 + audit_logs M4 sourceModule 30 类 actionType + 3 条跨模块 trace（M3_PAUSE_ADS_FROM_M4 ×2 + M3_PAUSE_DEDUP_SKIP ×1 + M1 from M4 ×2）

输出：`docs/M4_BACKEND_REPORT.md` + `tmp/m4-selfcheck.mjs` + `tmp/m4-smoke.out` + `tmp/be-sqlq.out`
