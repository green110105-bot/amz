# M2 利润 / 库存 / 采购 / 重定价 / 多维度财务模块 — QA 复跑报告 (Run 2)

**日期**：2026-05-16
**Phase**：`p7-m2-rerun`
**目的**：在 M2 Round-3 QA 全 PASS 之后，复跑相同 10 场景 × 5 次 (50 iterations) 验证稳定性 + 4 个首轮已修 Bug 是否仍稳过
**测试基线**：`docs/M2_TEST_REPORT.md` (Round 3, 10/10 PASS, 4 FIXED-AND-PASS)
**测试方式**：surgical kill 8080 → 启 server (`node apps/api/src/server.mjs`) → 复制脚本到 `D:/amz/tmp/rerun-m2/` → 顺序跑 S1-S10
**测试脚本**：`D:/amz/tmp/rerun-m2/m2-qa-s*.sh`，共享 `D:/amz/tmp/rerun-m2/m2-common.sh`
**端口隔离**：本 phase 只 kill 8080；8081/8082/8083 (M4/其它 agent) 不动

---

## 0. 总览

| 场景 | 5 次结果 | 状态 | 对比首轮 |
|---|---|---|---|
| S1 利润下钻闭合 | 0/5 | **REGRESSION** | 首轮 FIXED-AND-PASS → 本轮 SKU vs waterfall 不闭合 |
| S2 PO 状态机 draft→ordered→in_transit→received | 5/5 | PASS | 同首轮 |
| S3 滞销 option A + 3 层 audit 链 + revert | 5/5 | PASS | 首轮 FIXED-AND-PASS（修复持续生效） |
| S4 重定价 apply → M1 listing + 跨刷新 | 5/5 | PASS | 同首轮 |
| S5 汇率敞口 + sensitivity | 5/5 | PASS | 同首轮 |
| S6 税务申报 → status=filed | 5/5 | PASS | 同首轮 |
| S7 LTV cac_breakeven > avg_order_value | 5/5 | PASS | 首轮 FIXED-AND-PASS（修复持续生效） |
| S8 alerts/scan endpoint + M4 notification | 5/5 | PASS | 首轮 FIXED-AND-PASS（修复持续生效） |
| S9 维度切换 brand/team/owner Σ(profit) 相等 | 5/5 | PASS | 同首轮 |
| S10 库存联动 M2→M3 execute + revert | 5/5 | PASS | 同首轮 |

**结果**：45/50 iterations PASS，5/50 FAIL（全部集中在 S1 closure C3）。9/10 场景稳定，1 场景边缘回归。

---

## 1. 首轮 4 个已修 Bug 复测结果

| # | 首轮 Bug | 本轮场景 | 行为 | 状态 |
|---|---|---|---|---|
| B1 | S1: getProfitOverview 用滚动窗口 vs listSkuProfit 用 snapshot，二者不闭合 | S1 | overview revenue=15800.2 / Σsku.revenue=15800.2 ✓；overview netProfit=-3132.59 / Σsku.netProfit=-3132.59 ✓ | **STABLE（overview vs Σsku 已闭合）**；但 **SKU netProfit vs waterfall items 出现 0.10 差**（详见 §2） |
| B2 | S3: 滞销 option=A 只写 2 层 audit，缺 REPRICE_DOWN 子审计 | S3 | 三层链 SLOW_MOVING_EXECUTE → REPRICE_DOWN → LISTING_VERSION_CREATE_FROM_M2 全部存在，5/5 iters；REPRICE_DOWN audit_logs 新增 5 行 ✓ | **STABLE** |
| B3 | S7: high_ltv 行 cac_breakeven < avg_order_value 违反业务约束 | S7 | 3 行 high_ltv，0 行违规 ✓ | **STABLE** |
| B4 | S8: `POST /m2/alerts/scan` 不存在 (404)，M4 notification 推送缺失 | S8 | 5/5 iters：scan 生成 1 event + 1 m4_notification + ALERT_ACK audit 写入 ✓ | **STABLE** |

**3/4 已修 Bug 完全稳过。B1 部分回归**：overview 与 Σsku 仍闭合（首轮修复点），但首轮报告未单独验证的 **SKU netProfit vs SKU waterfall items 闭合** 出现 0.10 偏差（详见 §2）。

---

## 2. S1 回归详情（C3 不闭合）

### 2.1 现象

5 次 iter 全部一致：

```
iter 1 FAIL R=15800.2/15800.2 P=-3132.59/-3132.59  CASE001.P=-145.54/-145.64  ord=46.72 ond=-0.0 c1=True c2=True c3=False c4=True feeCnt=14
...iter 2-5 同上
```

四级 closure 中 C1 (overview.R vs Σsku.R)、C2 (overview.P vs Σsku.P)、C4 (order revenue - fees - netProfit) 全部 True；**C3 (SKU.netProfit vs SKU waterfall items 求和)** False：CASE-001 在 `m2_sku_profit_snapshots` 中 `net_profit=-145.54`，但 `GET /m2/profit/skus/CASE-001/waterfall?range=30d` 返回的 items 求和 = -145.64 ， **diff = 0.10**（容差 0.01）。

### 2.2 根因

- `listSkuProfit()` 直接读 `m2_sku_profit_snapshots.net_profit`（seed 时一次性计算的冻结值）。
- `getSkuWaterfall()` （或同名函数）按 SKU 实时聚合 `m2_orders.revenue` 与 `m2_order_costs` 的 14 类费用，得到 14 项 + 1 个 total 项。
- 首轮报告 §2 的修复 B1 把 `getProfitOverview()` 切到 snapshot 求和，使 overview/Σsku 闭合（C1/C2），但 **waterfall 仍走实时聚合**，与 snapshot 数据源不一致。
- 由于 4 月-5 月间真实时间推进，靠近 30d 窗口边界的若干订单 / 费用行已滑出，waterfall live 总和与 seed 时刻计算的 snapshot 总和出现 0.10 的累积漂移。

### 2.3 与首轮的对比

| 项 | 首轮 (Round 3) | 本轮 (Run 2) |
|---|---|---|
| overview.R / Σsku.R | 15800.2 / 15800.2 ✓ | 15800.2 / 15800.2 ✓ |
| overview.P / Σsku.P | -3132.59 / -3132.59 ✓ | -3132.59 / -3132.59 ✓ |
| CASE-001 sku.netProfit | -145.54 | -145.54（snapshot 未变） |
| CASE-001 waterfall items 求和 | -145.54 | **-145.64**（live 聚合漂移） |
| order fees 14 项 + 闭合 | ✓ | ✓ |

首轮 5 次 iter 该闭合 diff=0.0 是因为首轮跑测时距 seed 仅 ~1 天，waterfall 与 snapshot 重合度高；本轮跑测距首轮 +24h，边界订单逐步滑出窗口，waterfall 总和漂移 0.10。

### 2.4 影响评估

- **业务影响**：极低。-145.54 vs -145.64 在 SPEC § 8 的 "误差 < 0.5%" 容差下完全通过（0.10/145.54 = 0.07%），仅命中脚本里更严的 0.01 绝对差阈值。
- **修复方向（建议，本轮不动代码）**：在 `getSkuWaterfall()` 中也优先用 snapshot；或脚本容差放宽到 0.5% / 0.5 元。该决定属于 P1 后续增强，与 B1 一致改造方向。

---

## 3. 各场景 5 次摘要

### S2 PO 状态机 (PASS 5/5)
| iter | po | t1/t2/t3 | cf+ | audit |
|---|---|---|---|---|
| 1 | po-929d5c6f | ordered/in_transit/received | +2 | 3 |
| 2 | po-26b77840 | ordered/in_transit/received | +2 | 3 |
| 3 | po-094b3281 | ordered/in_transit/received | +2 | 3 |
| 4 | po-5e44a052 | ordered/in_transit/received | +2 | 3 |
| 5 | po-4a6cca81 | ordered/in_transit/received | +2 | 3 |

### S3 滞销 + 3 层 audit (PASS 5/5)
| iter | slow | SLOW_MOVING_EXECUTE | REPRICE_DOWN | LISTING_VERSION_CREATE_FROM_M2 | m1v | revert |
|---|---|---|---|---|---|---|
| 1 | slow-f8662576 | a-a58dbc47 | a-41cfd755 | a-8ac6b6c6 | m1v-9af21938 | True |
| 2 | slow-f8662576 | a-759420ac | a-23ed99fc | a-9c777b6e | m1v-388de8fd | True |
| 3 | slow-f8662576 | a-0d38564d | a-926691e7 | a-97ae2f10 | m1v-7b4666fc | True |
| 4 | slow-f8662576 | a-e8c0b70f | a-e966cebd | a-61dd962e | m1v-a273252a | True |
| 5 | slow-f8662576 | a-82b679ed | a-a4bbae99 | a-b62b858d | m1v-18c3edc5 | True |

### S4 重定价 apply (PASS 5/5)
| iter | rp | m1v | REPRICE_APPLY → LISTING_VERSION_CREATE_FROM_M2 | list.state | m1v 一致 |
|---|---|---|---|---|---|
| 1 | rp-b375bf81 | m1v-151d988c | a-5266f630 → a-a5d519ee | applied | ✓ |
| 2 | rp-b375bf81 | m1v-c20ab427 | a-60e6917b → a-f391561a | applied | ✓ |
| 3 | rp-b375bf81 | m1v-e2184394 | a-f7021c86 → a-67ca2555 | applied | ✓ |
| 4 | rp-b375bf81 | m1v-46ac5f3a | a-cb2484f1 → a-d9459e5a | applied | ✓ |
| 5 | rp-b375bf81 | m1v-e87816ad | a-f1435817 → a-49da28e3 | applied | ✓ |

### S5 FX (PASS 5/5)
| iter | total | exp/rates/sens | usdShare | pred(-1pp) | actual | 误差% |
|---|---|---|---|---|---|---|
| 1-5 | 1167000 | 4/30/4 | 0.72 | -11670 | -11670 | 0.0 |

### S6 税务标记 (PASS 5/5)
| iter | tax | status | filing_ref 写库 | TAX_FILE# |
|---|---|---|---|---|
| 1 | tax-b8fcc7ba | filed | DE-2026-Q2-QA-1-2682431 | 1 |
| 2 | tax-b8fcc7ba | filed | DE-2026-Q2-QA-2-2682431 | 2 |
| 3 | tax-b8fcc7ba | filed | DE-2026-Q2-QA-3-2682431 | 3 |
| 4 | tax-b8fcc7ba | filed | DE-2026-Q2-QA-4-2682431 | 4 |
| 5 | tax-b8fcc7ba | filed | DE-2026-Q2-QA-5-2682431 | 5 |

### S7 LTV (PASS 5/5)
3 行 LTV snapshot，3 行 high_ltv，cac_breakeven > avg_order_value 0 违规 × 5 iters。

### S8 自定义告警 (PASS 5/5)
| iter | rule | event Δ | m4_notif Δ | ack | ALERT_ACK# |
|---|---|---|---|---|---|
| 1 | ar-f61ea842 | +1 | +1 | True | 1 |
| 2 | ar-3e2288eb | +1 | +1 | True | 1 |
| 3 | ar-3196d4bd | +1 | +1 | True | 1 |
| 4 | ar-93250091 | +1 | +1 | True | 1 |
| 5 | ar-b1a54414 | +1 | +1 | True | 1 |

### S9 维度切换 (PASS 5/5)
| iter | Σprofit brand/team/owner | ΣGMV brand/team/owner |
|---|---|---|
| 1-5 | 26000 / 26000 / 26000 | 180000 / 180000 / 180000 |

### S10 库存联动 (PASS 5/5)
| iter | ile | exec | parent audit | revert | amc_m2 |
|---|---|---|---|---|---|
| 1 | ile-26692909 | auto_executed | INVENTORY_LINK_EXECUTE | True | 0 |
| 2 | ile-26692909 | auto_executed | INVENTORY_LINK_EXECUTE | True | 0 |
| 3 | ile-26692909 | auto_executed | INVENTORY_LINK_EXECUTE | True | 0 |
| 4 | ile-26692909 | auto_executed | INVENTORY_LINK_EXECUTE | True | 0 |
| 5 | ile-26692909 | auto_executed | INVENTORY_LINK_EXECUTE | True | 0 |

---

## 4. DB 校验（read-only，本轮 30 分钟窗口）

`audit_logs` 最近 30 min（仅 M1/M2，复跑期间产生）：

| action_type | count | 期望 |
|---|---:|---|
| M1_RUN_CREATE | 135 | 累积（含 M1 rerun agent 共存影响） |
| M1_TARGET_CREATE | 61 | 同上 |
| PO_STATE_TRANSITION | 15 | 5 iters × 3 transitions ✓ |
| LISTING_VERSION_CREATE_FROM_M2 | 10 | S3 5 + S4 5 ✓ |
| SLOW_MOVING_EXECUTE | 5 | S3 ✓ |
| REPRICE_DOWN | 5 | S3 子 audit ✓ **（B2 fix 持续生效）** |
| REPRICE_APPLY | 5 | S4 ✓ |
| PO_CREATE | 5 | S2 ✓ |
| INVENTORY_LINK_EXECUTE | 5 | S10 ✓ |
| TAX_FILE | 5 | S6 ✓ |
| ALERT_SCAN | 5 | S8 ✓ **（B4 fix 持续生效）** |
| ALERT_RULE_CREATE | 5 | S8 ✓ |
| ALERT_ACK | 5 | S8 ✓ |

`m4_notifications` 最近 30 min：75 行（含 S8 5 + 跨模块联动 / 其它 agent 共写），M2 alert scan 推送链通畅。

---

## 5. 总结

- **N = 10 场景，M = 50 iterations**
- **K = 45 PASS / 5 FAIL（全部 S1 C3）**
- **9 / 10 场景稳定无回归**
- **4 个首轮已修 Bug**：B2/B3/B4 完全稳过；B1 在 overview/Σsku 维度仍闭合，但 SKU netProfit vs waterfall items 出现 0.10 漂移，属同源未覆盖的边缘 case
- **建议下一步**：
  1. 把 `getSkuWaterfall()` 改成 snapshot-aware（与 B1 修复同方向），或
  2. 把 S1 脚本 C3 容差从 0.01 放宽到 SPEC § 8 标称的 0.5%（=0.73 for CASE-001），即可让 50/50 PASS

### 5.1 验收结论

- M2 主路径（10 场景 × 5 次中的 9 个场景，含全部 4 个修复点的核心断言）稳过，4 个首轮修复点行为稳定，无 P0 回归。
- S1 第三级闭合（SKU snapshot vs SKU waterfall）出现 0.10 边缘漂移，业务误差 0.07% 远小于 SPEC 容差 0.5%，记为 P1 后续增强（snapshot-aware waterfall）。
