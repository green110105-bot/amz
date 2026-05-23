# M1 QA Rerun Report (Round 2 of stability test)

**日期**：2026-05-16
**目的**：稳定性回归 — 在 Phase 1-4 后端/前端联调完成后，重跑首轮 10 个 M1 场景 × 5 次，验证零回归。
**首轮报告**：`docs/M1_TEST_REPORT.md`
**Phase 标识**：`p6-m1-rerun`

---

## 1. 环境

| 项 | 值 |
|---|---|
| API server | `node apps/api/src/server.mjs`（API_PORT=8082）|
| Port | 8082（surgical kill 启停，不影响 8080/8081/8083）|
| DB | `D:/amz/apps/api/data/store.db`（累计，未清表）|
| 用户 | `demo@amz.local` / `u-demo` |
| Store | 登录返回的 `defaultStoreId` |
| 脚本 | `D:/amz/tmp/rerun-m1/m1-s*.sh`（首轮脚本 port 替换 8080→8082）|
| 日志 | `D:/amz/tmp/rerun-m1/m1-s*.log` |
| 时间窗口 | 2026-05-16 01:01Z ~ 01:09Z |

每个场景脚本内部已自带 5 次循环。

---

## 2. 场景结果（vs 首轮 docs/M1_TEST_REPORT.md）

| 场景 | 首轮 | 本轮 5x | 状态 |
|---|---|---|---|
| S1 Mode 1 existing → 5 维度打分入库 | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S2 Mode 2 external ASIN → cannot_optimize | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S3 Mode 3 new_listing → 跳过打分 | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S4 多轮生成：markedFields 之外 byte-identical | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S5 图片 5 槽位 + regenerate | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S6 5 轮后第 6 轮自动归档 + pin 保护 | 5/5 FIXED-AND-PASS | 5/5 PASS | PASS (修复后保持稳定) |
| S7 版本 diff | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S8 combined-pick 上传 + 幂等 + audit | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S9 A/B create + start + metrics + manual_required | 5/5 PASS | 5/5 PASS | PASS (无回归) |
| S10 全流程跨 F5 一致 | 5/5 PASS | 5/5 PASS | PASS (无回归) |

**汇总**：本轮 PASS=50/50，FAIL=0，Regression=0。

每场景末行（节选）：

- S1 — `RESULT: PASS=5 FAIL=0` + `DETERMINISM: PASS (all 5 equal)`
- S2 — `iter 5 PASS kind=external comp=true runHTTP=400 err=external_asin_cannot_optimize DB=external/1`
- S3 — `iter 5 PASS mode=new_listing scores=400/scoring_not_applicable research=201 runs=201`
- S4 — `iter 5 PASS marked=["title","bullet_4"] v1=m1v-66b34c43 v2=m1v-7d0405dc`
- S5 — `iter 5 PASS ids=5 count=5 regenPromptOk=yes ... times=51 48 49 49 48ms`
- S6 — `iter 5 PASS active=5 r1arch=1 r6arch=0 | pinTest: r1={"arch":0,"pin":1} r2_arch=1`
- S7 — `iter 5 PASS http=200 changed=bullet_3,title count=7 elapsed=48ms`
- S8 — `iter 5 PASS http1=201 http2=201 source=combined_pick idempotentSameId=yes count=1 auditDelta=1`
- S9 — `iter 5 PASS auto:[201/draft→200/running metrics=200 len=28 47ms] bullets:[422/manual_required ...]`
- S10 — `iter 5 PASS target=200 vers=3 runs=3 img=5 ab=running metr=28 score=200`

---

## 3. DB 累计变化

DB 未清表，本轮在首轮基础上累计写入。

| 表 | 首轮结束后 (snapshot) | 本轮结束后 | Δ (本轮新增) |
|---|---|---|---|
| `m1_optimization_targets` | 37 | 93 | +56 |
| `m1_listing_scores` | 2 | 17 | +15 |
| `m1_listing_versions` | 41 | 191 | +150 |
| `m1_optimization_runs` | 3 | 138 | +135 |
| `m1_research_reports` | 1 | 6 | +5 |
| `m1_ab_tests` | 1 | 16 | +15 |
| `m1_ab_metrics` | 14 | 294 | +280 |
| `m1_generated_images` | 5 | 55 | +50 |

每张表均有新行写入，未观察到写入异常或孤儿数据。Δ 数量与脚本预期循环次数一致（S1 5×3=15 scores；S5 5×10=50 images 等）。

---

## 4. Regression 详情

**无**。10 个场景全部 PASS=5/5，包括首轮 S6 修复后的归档+pin 行为本轮继续稳定通过。

---

## 5. 结论

- M1 端到端流程在 Phase 1-4（后端/前端联调）之后**零回归**。
- 50/50 PASS，覆盖三种 mode、5 维打分、版本管理（archive + pin）、版本 diff、combined-pick + audit、A/B 自动/手动、图片 5 槽位、跨流程一致性、确定性 seed。
- DB 写入正常，无表损坏或写入失败。
- 首轮 S6 的修复（5 轮后第 6 轮归档 + pin 保护）保持稳定。

**Phase `p6-m1-rerun` 结果：PASS**。

---

## 6. 复现指南

```bash
# 1. 启 server
API_PORT=8082 node D:/amz/apps/api/src/server.mjs > D:/amz/tmp/m1-rerun-server.log 2>&1 &

# 2. 跑全部 10 场景
for s in $(ls D:/amz/tmp/rerun-m1/m1-s*.sh | sort -V); do
  bash "$s" > "${s%.sh}.log" 2>&1
done

# 3. 看结果
grep "^RESULT:" D:/amz/tmp/rerun-m1/m1-s*.log

# 4. surgical kill
netstat -ano | findstr LISTENING | findstr :8082 | awk '{print $NF}' | sort -u \
  | while read PID; do taskkill //F //PID "$PID"; done
```
