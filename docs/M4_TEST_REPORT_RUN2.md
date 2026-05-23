# M4 监控 / 评价 / 申诉 / 跟卖 / 竞品 / 通知 模块 — QA 验收回归测试报告（Run 2）

**日期**：2026-05-16
**Phase**：`p9-m4-rerun` · 端口 **8081**（surgical kill；不动 8080 / 8082 / 8083）
**测试范围**：M4_SPEC.md §9 — 11 个核心测试场景 × 5 次（Run 1 在 `docs/M4_TEST_REPORT.md`）
**测试基线**：Run 1 后端已修 1 bug（`recommendCases()` ref_count 短路径自增）；M4_BACKEND_REPORT.md (Round 2 self-check 58/58 PASS)
**测试方法**：直接复用 Run 1 脚本 `D:/amz/tmp/m4-qa-s*.sh` + `m4-qa-common.sh`（拷贝到 `D:/amz/tmp/rerun-m4/`，仅改 heartbeat phase 为 `p9-m4-rerun`），脚本逻辑、断言、固定端口 8081 完全一致
**前提**：本次回归 **未修改任何业务代码**；目的是验证 Run 1 修复 + 11 场景全套行为在新一轮独立运行下保持稳定

---

## 0. 测试环境与启停

- API server: `http://localhost:8081`（`API_PORT=8081 node D:/amz/apps/api/src/server.mjs`）
- DB: `D:/amz/apps/api/data/store.db`（WAL；与并行 phase 不冲突）
- 用户 / 店铺：`u-demo` / `s-mock-us`
- 启停：surgical kill 仅针对端口 8081；server.log 落 `D:/amz/tmp/m4-rerun-server.log`
- 脚本目录：`D:/amz/tmp/rerun-m4/m4-qa-s{1..11}.sh`；日志同目录 `m4-qa-s{1..11}.log`

### 本轮起始 DB 快照（继承 Run 1 + 其它 phase 累积写入）

| 表 | 起始行数 (pre) | 结束行数 (post) | Δ |
|---|---|---|---|
| m4_anomalies | 149 | 184 | +35 |
| m4_sla_events | 332 | 417 | +85 |
| m4_resolution_cases | 29 | 34 | +5 |
| m4_postmortems | 19 | 24 | +5 |
| m4_hijacking | 77 | 89 | +12 |
| m4_infringement | 19 | 24 | +5 |
| m4_review_clusters | 48 | 63 | +15 |
| m4_review_trend_snapshots | 92 | 92 | 0 |
| m4_appeals | 79 | 99 | +20 |
| m4_recovery_emails | 36 | 46 | +10 |
| m4_competitor_snapshots | 63 | 78 | +15 |
| m4_image_diffs | 25 | 30 | +5 |
| m4_brand_defense_layers | 4 | 4 | 0 |
| m4_notifications | 343 | 433 | +90 |
| reviews | 682 | 802 | +120 |
| audit_logs (M4) | 968 | 1233 | +265 |
| audit_logs.M3_PAUSE_ADS_FROM_M4 | 17 | 22 | +5 |
| audit_logs.M3_PAUSE_DEDUP_SKIP | 26 | 31 | +5 |
| audit_logs.M3_RESUME_ADS_FROM_M4 | 15 | 20 | +5 |
| audit_logs.M1_TARGET_CREATE (m4_) | 32 | 42 | +10 |

> 说明：`pre` 取本轮 Step 0 `node D:/amz/tmp/m4-qa-sqlq.cjs` 输出。M2 QA 时间窗内 `notifications` 已从 318→343 增长，属 M2 / 其它并行 phase 正常写入，与本轮 M4 回归无关。

#### Run 1 vs Run 2 累计对比（spec / sanity 校验）

Run 1 最终累计：149/332/29/19/77/19/48/92/79/36/63/25/4/318/682（关键键值）
Run 2 起点：149/332/...（与 Run 1 终点一致）→ 终点：184/417/34/24/89/24/63/92/99/46/78/30/4/433/802
**结论**：每张 m4_* 表行数稳定递增，无截断 / 异常清零，schema 未变更。

---

## 1. 场景总览（11 × 5 = 55 iteration）

| 场景 | Run 1 结果 | Run 2 结果 | 状态 |
|---|---|---|---|
| S1 异常状态机 (open→assigned→investigating→resolved) | 5/5 PASS | **5/5 PASS** | STABLE |
| S2 SLA 手动 escalate (P0 / sla_breached / notif / sla_event) | 5/5 PASS (with note) | **5/5 PASS** | STABLE |
| S3 Resolution Case + recommend ref_count++ (**Run 1 修复点**) | 5/5 PASS (FIXED) | **5/5 PASS** | **修复稳定** |
| S4 Postmortem 生成 (timeline ≥ 4 / improvements ≥ 2 / audit) | 5/5 PASS | **5/5 PASS** | STABLE |
| S5 跟卖 → M3 暂停广告 + 24h dedup + close 恢复 | 5/5 PASS | **5/5 PASS** | STABLE |
| S6 侵权全流程 + legalDisclaimerAck=false→400 | 5/5 PASS | **5/5 PASS** | STABLE |
| S7 评论聚类 → M1 push (target / notif / audit) | 5/5 PASS | **5/5 PASS** | STABLE |
| S8 申诉 draft→submit→reject→retry→submit→ retry-on-submitted→400 | 5/5 PASS | **5/5 PASS** | STABLE |
| S9 Recovery 多轮邮件 (round_no=2 / parent_email_id / review_updated) | 5/5 PASS | **5/5 PASS** | STABLE |
| S10 竞品快照 + image-diff → M1 target | 5/5 PASS | **5/5 PASS** | STABLE |
| S11 负面爆发风暴控制 (5+负 → 1 burst anomaly + dedup) | 5/5 PASS | **5/5 PASS** | STABLE |

**Run 2 结果：55/55 PASS，0 FAIL，0 regression，1 已修 bug 持续稳定。**

---

## 2. Run 2 各场景关键数据

### S1 — 异常状态机
- 全部 5 iter：`assign→assigned`、`acknowledge→investigating`、`resolve→resolved`、`slaΔ=3`
- 样本 ids：`anom-4160ed8c / 626e97ee / 02582bab / 26a458bf` + iter1

### S2 — SLA 手动 escalate
- 全部 5 iter：`status=escalated`、`sla_breached=true`、`notifΔ=1`、`evtΔ=1`
- 备注：mock 后台 tick 仍未实现（同 Run 1 设计偏差），manual escalate 端点全套副作用 OK

### S3 — Resolution Case 推荐 ref_count++（重点回归点）
| iter | cid | upd status | reusable | found | refΔ (0→1) |
|---|---|---|---|---|---|
| 1-5 | rc-… | successful | true | yes | **+1** |
- 样本 ids：`rc-c1a47c76 / 897e4114 / eb1cb44b / 434cf70e` + iter1
- **结论**：Run 1 修复（`apps/api/src/data-store-monitor.mjs::recommendCases()` UPDATE 上移至早期 return 之前）在 Run 2 重新运行下 **5/5 仍稳定**；ref_count 在每个 iter 都 +1。无回归。

### S4 — Postmortem 生成
- 全部 5 iter：`verdict=successful`、`timeline rows=6`、`improvements rows=3`、`auditPG=1`
- 样本 ids：`pm-c5b4a3a3 / pm-079fccfa` 等

### S5 — 跟卖 → M3 暂停 + 24h dedup + 恢复
- 全部 5 iter：`pause1.m3AdsPaused=true`、`id2Paused=false (dedup)`、`close=closed`、`audits=p:1/d:1/r:1`
- ASIN 样本：`B0S50903271..5`（运行时 HHMMSS 后缀保唯一）

### S6 — 侵权全流程
- 全部 5 iter：`badAck=400`、`draft→submitted→resolved` 链路全通过
- 样本 ids：`inf-c597bcbd / inf-6eaa8dc1` 等

### S7 — 评论聚类 → M1 push
- 全部 5 iter：`status=pushed`、`pushed=1`、`auditM1=1`、`tgts=1`、`cpm1=1`、`notifΔ=1`
- 样本 cids：`cl-0fc7992b / cl-b480c3e2` 等

### S8 — 申诉 draft→submit→reject→retry 重提 + retry-on-submitted→400
- 全部 5 iter：`ap2.parent=ap1`、ap2 流转 `draft→submitted`、`reretry=400/state_transition_forbidden`
- 样本 ids：`ap-5abb5738 / ap-c865e674` 等

### S9 — Recovery 多轮邮件
- 全部 5 iter：`r2.round=2`、`parent=r1`、`r2.status=sent`、`reply→review_updated`、`reviews.recovery_status=review_updated`
- 样本 ids：`rec-cdaa264c → rec-6aff3f9a` 等

### S10 — 竞品快照 + 图片差异 → M1
- 全部 5 iter：`snap1/2 OK`、`timeline=12`、`image-diff push m1Exist=1`、`notifΔ=1`
- 样本 ids：`imd-986b643e → m1t-7bd9cd13` 等
- 备注：timeline 从 Run 1 的 6 增长到 Run 2 的 12（每次 QA 重跑同 ASIN 累积 2 行，无业务问题）

### S11 — 负面爆发风暴控制
- 全部 5 iter：`created=12`、`burstΔ=1`、`2nd-burstΔ=0`（同日 dedup OK）、`notifΔ=1`
- 样本 burst ids：`anom-52674d91 / anom-c15d8b04` 等

---

## 3. Run 1 → Run 2 对比结论

### 3.1 已修 bug 持续稳定（重点）
**`recommendCases()` 早期 return 跳过 ref_count UPDATE** — Run 1 已修（`apps/api/src/data-store-monitor.mjs` 第 926-939 行，UPDATE 循环移至 `if (direct.length>=5) return direct;` 之前）。Run 2 中 S3 5 个 iter 全部 `refΔ=1`，无回归，修复行为稳定。

### 3.2 无新增 bug
Run 2 全 11 场景 × 5 iter 共 55 个独立 iteration，**无任何 FAIL**，无新的 4xx / 5xx / 状态机异常 / DB 副作用偏离。

### 3.3 设计偏差（与 Run 1 一致；未阻塞）
- S2：SLA 后台 tick 未实现（spec §9 场景 2 描述自动 tick）— `POST /escalate` 端点完整可用
- S1：`acknowledge → investigating`（实际优于 spec 文字 `acknowledged`）
- S6：`resolve outcome=accepted` 直接落库 `status=resolved`（一步合并而非两步链路）
- S10：竞品 snapshot 无 (asin, minute) 唯一索引，QA 重跑累计 timeline 行数
- S11：burst 通知 + ANOMALY_CREATE 通知是两条不同 source_event，5 分钟窗口不合并（设计取舍）

以上 5 条设计偏差与 Run 1 一致，**不计为回归**。

---

## 4. 复现指南

```bash
# Step 1 — surgical kill 8081 + 起 server
netstat -ano | findstr LISTENING | findstr :8081 | awk '{print $NF}' | sort -u | while read PID; do taskkill //F //PID "$PID" 2>/dev/null || true; done
API_PORT=8081 node D:/amz/apps/api/src/server.mjs > D:/amz/tmp/m4-rerun-server.log 2>&1 &

# Step 2 — 跑全部 11 场景
for s in $(ls D:/amz/tmp/rerun-m4/m4-qa-s*.sh | sort -V); do
  bash "$s" > "${s%.sh}.log" 2>&1
done

# Step 3 — 汇总
for s in $(ls D:/amz/tmp/rerun-m4/m4-qa-s*.log | sort -V); do
  grep -E '^S[0-9]+ SUMMARY' "$s"
done

# Step 4 — DB 快照
node D:/amz/tmp/m4-qa-sqlq.cjs

# Step 5 — surgical kill 8081
netstat -ano | findstr LISTENING | findstr :8081 | awk '{print $NF}' | sort -u | while read PID; do taskkill //F //PID "$PID" 2>/dev/null || true; done
```

---

## 5. 总结

- **N = 11 场景**，**M = 55 iteration**，**K = 55 PASS / 0 FAIL**
- **Run 1 修复点**：`recommendCases()` ref_count++ 在 Run 2 全部 5 iter 稳定 → **修复稳定，无回归**
- **本轮未修改任何业务代码**
- **未发现新 bug**
- **未阻塞设计偏差**：与 Run 1 完全一致（5 项）
