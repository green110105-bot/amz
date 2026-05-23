# M2：实时利润中枢 + 库存决策 — 详细设计

> **状态**：开发就绪规格
> **版本**：v1.0
> **最后更新**：2026-05-07
> **依赖**：数据底座、AI 决策引擎、SP-API（财务/订单/库存）、Ads API、用户录入

---

## 目录

- [1. 模块概述](#1-模块概述)
- [2. 用户场景](#2-用户场景)
- [3. 用户故事](#3-用户故事)
- [4. 信息架构](#4-信息架构)
- [5. 利润计算引擎（核心）](#5-利润计算引擎核心)
- [6. 漏点检测系统](#6-漏点检测系统)
- [7. 库存决策（补货）](#7-库存决策补货)
- [8. 滞销决策](#8-滞销决策)
- [9. 跟价决策](#9-跟价决策)
- [10. 资金周转分析](#10-资金周转分析)
- [11. 数据更新策略](#11-数据更新策略)
- [12. AI Prompt 设计](#12-ai-prompt-设计)
- [13. 页面与交互设计](#13-页面与交互设计)
- [14. 数据模型（DDL）](#14-数据模型ddl)
- [15. API 端点规格](#15-api-端点规格)
- [16. 业务规则](#16-业务规则)
- [17. 边界条件与异常](#17-边界条件与异常)
- [18. 与其他模块集成](#18-与其他模块集成)
- [19. 验收测试用例](#19-验收测试用例)
- [20. 性能与扩展](#20-性能与扩展)

---

## 1. 模块概述

### 1.1 价值主张

> **"看似赚了其实在亏" —— 把利润黑洞照亮。**
>
> 每一块钱赚在哪、亏在哪、压在哪，全部实时可见。把"补货 / 滞销 / 跟价"决策建立在真实利润而不是销售之上。

### 1.2 核心特性

| 特性 | 描述 |
|---|---|
| 多层级利润 | 订单 / SKU / 广告活动 / 关键词 / 店铺 / 国家 / 品牌 / 项目 |
| 全成本拆解 | 18 项费用项目精确归集（含跨境手续费、汇率、资金成本） |
| 天级 + 手动更新 | 自动天级 + 用户随时点"重新计算" |
| 异常归因 | AI 主动检测 "漏点" 并给修复建议 |
| 资金周转视角 | 钱压在哪、回本要多久 |
| **现金流时序** | **应收 / 应付 / 在途 / 库存的时间线视图** |
| 库存决策 | 补货 / 滞销 / 跟价均基于利润 |
| **批次管理** | **FIFO / LIFO 可选，按批次匹配采购成本** |
| **多供应商** | **同 SKU 多供应商 + 阶梯价 + 凑单优化** |
| **采购单全流程** | **创建 → 工厂确认 → 生产 → 海运 → 入仓 → 对账** |
| **资金预算优化** | **"本周可投入 ¥X" 的多 SKU 智能分配** |
| **情景模拟** | **改价/改 ACOS/改销量后的利润预测** |
| **跨店铺合并** | **多店铺 / 多国家站统一财务视图** |
| 多币种 + 汇率 | 自动汇率换算 + 损益记账 + 远期跟踪 |
| 历史回查 | 24 个月任意时段重算 |
| **预算管理** | **店铺级 / 项目级 / 团队级多层预算 + 实际对比** |
| **自定义报警** | **用户自定义 KPI 阈值（毛利率/周转/退货等）** |

### 1.3 不做的事

- ❌ 不做记账 / 报税（财务软件做）
- ❌ 不做采购单付款流程（采购管理软件做）
- ❌ 不做物流跟踪（物流系统做）
- ❌ 不做客服 / 邮件管理（领星已成熟）

---

## 2. 用户场景

### 2.1 场景清单

| # | 场景 | 触发 | 频率 |
|---|---|---|---|
| **S1** | 早晨开店看昨日利润 | 每天早上 | 每日 |
| **S2** | 月底对账 | 每月 1 次 | 月度 |
| **S3** | 投广告前看本 SKU 利润空间 | 投广前 | 每周 |
| **S4** | 收到漏点提醒"退货异常" | 异常事件 | 不定期 |
| **S5** | 该不该补货 | 库存低 / 周期到 | 每周 |
| **S6** | 这个 SKU 滞销了怎么办 | 滞销提醒 | 不定期 |
| **S7** | 竞品降价要不要跟 | 跟价提醒 | 不定期 |
| **S8** | 季度复盘 / 给老板汇报 | 每季 | 季度 |
| **S9** | 单笔退款大额，查具体损失 | 退款事件 | 不定期 |
| **S10** | 新员工录入采购成本 | 新品入库 | 不定期 |
| **S11** | 多店铺合并视图看全盘利润 | 大卖每日 | 每日 |
| **S12** | 突然怀疑某个广告在亏钱 | 临时怀疑 | 不定期 |

### 2.2 场景 → 模块入口映射

| 场景 | 入口 |
|---|---|
| S1 | Dashboard 利润卡片 / M2 总览 |
| S2 | M2 总览 → 月报导出 |
| S3 | M3 投广前 → "查看本 SKU 利润空间" |
| S4 | 推送通知 / 漏点中心 |
| S5 | 库存与补货页 |
| S6 | 滞销诊断页 |
| S7 | M4C 竞品作战室 → "跟价测算" |
| S8 | M2 总览 → 趋势分析 + 导出 PDF |
| S9 | 订单详情 → 利润瀑布图 |
| S10 | 商品中心 → 成本配置 |
| S11 | 多店铺切换 + 聚合视图 |
| S12 | 广告活动 → "利润口径分析" |

---

## 3. 用户故事

### 3.1 P0（MVP 必须）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M2-001 | 作为卖家，我希望看到昨日 / 7 日 / 30 日的店铺总净利润和利润率 | 数字精确至 ±2% |
| US-M2-002 | 作为卖家，我希望看到单 SKU 的滚动净利润 + 利润率趋势 | 图表可下钻 |
| US-M2-003 | 作为卖家，我希望对每笔订单都能看到完整成本拆解（14 项费用） | 瀑布图可视 |
| US-M2-004 | 作为卖家，我希望系统主动提醒我"这里漏钱了" | 漏点 ≥ 6 类被监测 |
| US-M2-005 | 作为卖家，我希望对每个漏点能看到"修复后预计每月可省 ¥X" | 量化估算 |
| US-M2-006 | 作为卖家，我希望系统按"利润 ROAS"评估广告，而不是销售 ROAS | 双指标并列 |
| US-M2-007 | 作为卖家，我希望看到每个 SKU 的资金周转天数 | 显示 + 排序 |
| US-M2-008 | 作为卖家，我希望系统给"该不该补 / 补多少"的建议 | 含金额测算 |
| US-M2-009 | 作为卖家，我希望对滞销 SKU 系统给出"继续 / 清库 / 移除"对比 | 三选项含金额 |
| US-M2-010 | 作为卖家，我希望对竞品降价能看到"跟到什么价我还赚" | 价格-利润曲线 |
| US-M2-011 | 作为卖家，我希望随时点"重新计算"立即更新数据 | 30s 内完成 |
| US-M2-012 | 作为卖家，我希望录入采购成本/头程/海运周期支持批量上传 | Excel / CSV |
| US-M2-013 | 作为卖家，我希望成本未填的 SKU 系统用估算 + 标"估算" | 标记清晰 |
| US-M2-014 | 作为卖家，我希望多店铺/多国家站可聚合查看 | 切换+聚合视图 |
| US-M2-015 | 作为卖家，我希望按时段、按广告活动、按关键词分别看利润 | 钻取顺畅 |

### 3.2 P1（增强）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M2-016 | 作为卖家，我希望对汇率波动有损益视图 | 汇率损益专项 |
| US-M2-017 | 作为卖家，我希望知道每个 SKU 的"盈亏平衡点"（保本 ACOS / 保本售价） | 数值显示 |
| US-M2-018 | 作为卖家，我希望对单个 SKU 设置"目标利润率"，低于即报警 | 阈值触发 |
| US-M2-019 | 作为卖家，我希望财务报告可以导出 Excel / PDF | 导出可定制 |
| US-M2-020 | 作为卖家，我希望对接到自己的财务软件（如金蝶） | API/CSV 对接 |
| US-M2-021 | 作为卖家，我希望对漏点修复能"一键修复"（如批量降出价） | 可执行 |
| US-M2-022 | 作为采购，我希望补货建议可以一键生成采购单 | 生成 PO |
| US-M2-023 | 作为卖家，我希望库存预测考虑活动日历（Prime Day 等） | 预测含活动 |
| US-M2-024 | 作为卖家，我希望对每个 SKU 看"假如改价 X，预计利润变化" | 模拟器 |
| US-M2-025 | 作为卖家，我希望看到自动续期类费用（长期仓储费）的预测 | 提前 30 天预警 |

### 3.3 P2（高级 / 大卖）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M2-026 | 作为大卖财务，我希望按品牌 / 项目 / 团队多维度归集利润 | 多维度筛选 |
| US-M2-027 | 作为大卖创始人，我希望按运营人员归集所负责 SKU 的利润 | 人员视图 |
| US-M2-028 | 作为大卖，我希望对每个 SKU 设置专属"目标毛利率"，运营无法低于 | 权限+阈值 |
| US-M2-029 | 作为大卖，我希望年度预算与实际利润对比 | 预算管理 |
| US-M2-030 | 作为大卖，我希望对子团队设置子预算 | 多级预算 |
| US-M2-031 | 作为大卖，我希望全自动模式下设置金额上限护栏 | 安全阀 |
| US-M2-032 | 作为大卖，我希望对每个 SKU 维护多个供应商 + 阶梯价 | 供应商管理 |

### 3.4 新增（深度补充）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M2-033 | 作为卖家，我希望从补货建议"一键创建采购单 (PO)"，并跟踪生命周期（已发出 / 工厂确认 / 生产 / 海运 / 入仓） | 完整 PO 工作流 |
| US-M2-034 | 作为采购，我希望对每个供应商维护：单价 / MOQ / 阶梯价 / 交货周期 / 历史评分 | 供应商画像 |
| US-M2-035 | 作为采购，我希望对同 SKU 多供应商，AI 推荐最优分配（按价格 + 交期 + 风险） | 多供应商优化 |
| US-M2-036 | 作为采购，我希望"凑单优化"——多 SKU 凑同一货柜节省运费 | 凑单计算器 |
| US-M2-037 | 作为卖家，我希望看到现金流时序（应收 / 应付 / 在途 / 库存）的时间线视图 | 现金流瀑布 |
| US-M2-038 | 作为卖家，我希望看到"未来 30 / 60 / 90 天"的应收回款预测 | 回款日历 |
| US-M2-039 | 作为卖家，我希望资金预算优化器："我下周可投 ¥X，AI 给最优补货分配" | 资金分配 |
| US-M2-040 | 作为卖家，我希望批次管理 FIFO / LIFO 可选，每个订单按批次匹配采购成本 | 批次精确归集 |
| US-M2-041 | 作为卖家，我希望多 FBA 仓库的库存调拨建议（哪个仓的滞销移到哪个仓） | 调拨优化 |
| US-M2-042 | 作为卖家，我希望情景模拟器："改价 -5% / ACOS +3% / 销量 +20%"对利润的综合影响 | 多变量模拟 |
| US-M2-043 | 作为大卖，我希望多店铺合并视图（合并 GMV / 利润 / 多币种自动换算） | 合并视图 |
| US-M2-044 | 作为大卖，我希望按"品牌 / 项目 / 团队 / 运营人员" 4 个维度归集 | 4 维归集 |
| US-M2-045 | 作为大卖财务，我希望预算 vs 实际利润 + 偏差归因 | 预算管理 |
| US-M2-046 | 作为大卖财务，我希望提现 / 跨境支付手续费（Payoneer / PingPong / WorldFirst）精确归集 | 支付通道费 |
| US-M2-047 | 作为大卖，我希望汇率风险监测（敏感度分析：汇率 ±5% 对利润影响）| 汇率风险 |
| US-M2-048 | 作为大卖，我希望税务辅助（VAT 申报数据导出、销售税自动归集） | 税务报表 |
| US-M2-049 | 作为卖家，我希望自定义报警阈值（如"毛利率 < 15% 报警"） | 自定义阈值 |
| US-M2-050 | 作为卖家，我希望"利润改善路径建议" — AI 给出按优先级的改善动作清单 | 路径建议 |
| US-M2-051 | 作为采购，我希望采购单到货后系统自动匹配入库 + 入仓批次更新成本 | 自动对账 |
| US-M2-052 | 作为采购，我希望供应商交付质量评分（按时率 / 缺陷率 / 价格稳定性） | 供应商评分 |
| US-M2-053 | 作为卖家，我希望"该不该跟卖申诉"判断 — AI 分析跟卖者风险 + 申诉成功率 | 跟卖处置 |
| US-M2-054 | 作为卖家，我希望按 SKU 计算 LTV（客户生命周期价值），结合复购率 | 复购视角 |

---

## 4. 信息架构

### 4.1 页面树

```
M2 实时利润中枢
├ /profit                            利润总览（默认页）
│  ├ ?range=7d|30d|90d|custom        时间筛选
│  └ ?store=&country=                店铺/国家筛选
├ /profit/skus                       SKU 利润排行
├ /profit/skus/[productId]           单 SKU 利润详情
│  ├ /trend                          趋势分析
│  ├ /breakdown                      费用拆解
│  └ /scenario                       情景模拟器
├ /profit/orders                     订单利润列表
├ /profit/orders/[orderId]           单订单瀑布图
├ /profit/ads                        广告利润视图
│  ├ /campaigns                      Campaign 级
│  └ /keywords                       Keyword 级
├ /profit/leaks                      漏点中心
│  └ /[leakId]                       单漏点详情
├ /profit/cashflow                   现金流时序视图（新）
├ /profit/multi-store                跨店铺合并视图（新）
├ /profit/dimensions                 多维度归集（品牌/项目/团队/运营）（新）
├ /profit/fx                         汇率管理与风险（新）
├ /profit/scenario                   全局情景模拟器（新）
├ /inventory                         库存与补货
│  ├ /reorder                        补货建议
│  ├ /slow-moving                    滞销诊断
│  ├ /forecast                       销量预测
│  ├ /batches                        批次管理 FIFO/LIFO（新）
│  └ /transfers                      跨仓库调拨建议（新）
├ /purchase-orders                   采购单中心（新，完整流程）
│  ├ /list                           PO 列表 + 状态跟踪
│  ├ /[poId]                         单 PO 详情
│  ├ /create                         创建 PO
│  └ /reconcile                      到货对账
├ /suppliers                         供应商管理（新）
│  ├ /list                           供应商列表
│  ├ /[supplierId]                   单供应商详情 + 评分
│  └ /performance                    供应商绩效报告
├ /repricing                         跟价决策
├ /capital-allocator                 资金预算优化器（新）
├ /costs                             成本配置中心
│  ├ /sku-costs                      SKU 成本批量编辑
│  ├ /shipping                       头程/海运周期
│  ├ /vat                            税率配置
│  └ /payment-channels               跨境支付手续费配置（新）
├ /budget                            预算管理（多级预算）
│  ├ /annual                         年度预算
│  ├ /by-brand                       按品牌
│  ├ /by-team                        按团队
│  └ /variance                       预算 vs 实际偏差
├ /alerts/custom                     自定义报警规则（新）
├ /tax                               税务辅助（新）
└ /reports                           导出报表
```

### 4.2 主导航位置

```
左侧导航 → 「经营」 →
  ├ 利润中枢（M2 总览）
  └ 库存与补货
```

---

## 5. 利润计算引擎（核心）

### 5.1 总公式（18 项费用全集）

```
单订单净利润 (Order Net Profit) =
  + 销售收入 (Sale Revenue)
  
  − 销售类费用：
    • Amazon Referral Fee (referral_fee)
    • FBA Fulfillment Fee (fba_fee)
    • Variable Closing Fee (closing_fee)（仅 Media 类目）
    • Per Item Fee（个人卖家）
    • Subscription Fee 分摊（professional 月费）
  
  − 运营类费用：
    • Storage Fee 分摊 (storage_allocation)
    • Long-Term Storage Fee 分摊 (lts_allocation)
    • Inbound Placement Fee 分摊 (inbound_allocation)
    • Removal/Disposal Fee（如有）
    • Returns Processing Fee 分摊
    • FBA Restock Fee 分摊
    • Labels/Polybag/Bubble Wrap 等
  
  − 退款损失（按历史退款率预提）：
    • Refund Provision (refund_provision)
    • Refund Commission Refunded (亚马逊退还部分佣金)
  
  − 广告分摊：
    • SP/SB/SD Ad Spend Allocation (ad_allocation)
    • DSP Allocation（如有，P2）
  
  − 货品成本（按批次匹配 FIFO/LIFO）：
    • Cost of Goods Sold (cogs)  ← 来自批次
    • Inbound Shipping (inbound_freight)  ← 来自批次
    • Customs/Tariff (customs)
    • Inspection/QC Fee（验货费，如有）
  
  − 财务费用：
    • Currency Conversion Loss (fx_loss)
    • Capital Cost / Working Capital Interest (capital_cost)
    • **Cross-border Payment Fee** (Payoneer/PingPong/WorldFirst, ~1-1.5%)
    • **Bank Wire Fee**（如直接电汇）
  
  − 税费：
    • VAT (vat) — EU/UK 站
    • Sales Tax — US 各州（亚马逊代收，但需归集）
    • GST/HST — CA / AU
    • Income Tax 不在此计入（净利润后再扣）
  
  − 其他：
    • Service Subscriptions（M1/M2/M3 等本产品订阅费分摊）
    • Insurance（产品责任险，如有）
    • Sample Cost（样品分摊）
```

### 5.1a 跨境支付通道费精确归集

跨境卖家的"提现损失"是常见漏点：

| 通道 | 费率 | 处理 |
|---|---|---|
| Payoneer | 1.2% + USD 1.5/笔 | 按提现笔次记账 |
| PingPong | 0.7-1.2% | 按月汇总 |
| WorldFirst | 0.5-1% | 按月汇总 |
| 银行电汇 | USD 25-45/笔 + 隐性汇率差 | 按笔记账 + 汇率差归集 |
| Amazon Currency Converter (ACCS) | 隐性 3-4%（坑） | 强烈建议放弃使用，标警告 |

**实现：**
- 用户配置使用的支付通道
- 系统按通道公式计算"提现总成本"
- 分摊到该回款周期的订单

### 5.1b 销售税自动归集（US 多州）

亚马逊代收销售税（Marketplace Facilitator），但每州税率、纳税申报责任、Nexus 状态不同：

- 系统按州自动归集"应纳税额"
- 提示用户哪些州达到 Nexus 阈值（需注册）
- 导出各州申报数据（Avalara / TaxJar 兼容格式）

### 5.2 各项费用归集详解

#### 5.2.1 销售类费用（直接来源 SP-API）

来自：SP-API `Finance API > listFinancialEvents`

事件类型：
- `ShipmentEventList[].ShipmentItemList[].ItemFeeList`：每件的费用
- 字段：`FeeType` ∈ {`Commission`, `FBAPerUnitFulfillmentFee`, `VariableClosingFee`, ...}

**精确归属：**直接归到对应 order_item

**代码模型：**
```python
def parse_shipment_fees(shipment_event):
    for item in shipment_event.ShipmentItemList:
        for fee in item.ItemFeeList:
            yield {
                "order_item_id": item.OrderItemId,
                "fee_type": fee.FeeType,
                "amount": fee.FeeAmount.CurrencyAmount,
                "currency": fee.FeeAmount.CurrencyCode,
                "posted_at": shipment_event.PostedDate
            }
```

#### 5.2.2 仓储费分摊

**来源：** SP-API `Reports API > GET_FBA_STORAGE_FEE_CHARGES_DATA`（月度）

**逻辑：**
```
一笔月度仓储费 → 关联到 ASIN
按"该 ASIN 当月销售订单数"分摊到每笔订单

或更精确：按"日均库存 × 体积 × 天数"分摊
```

**实现：**
- 月报到达后：按 ASIN 总仓储费 ÷ 该 ASIN 当月销量 = 单订单分摊
- 实时估算（月报未到时）：按"上月单订单分摊 × CPI 调整"作为预估

#### 5.2.3 长期仓储费

**来源：** SP-API `Reports API > GET_FBA_FEE_PREVIEW_DATA`（每月 5 号、12 号触发）

**预测：**
- 系统每天检查每个 SKU 的入仓天数
- > 270 天预警"30 天后将触发 LTS"
- 实际触发后归到当月费用

#### 5.2.4 退款预提

**逻辑：**
- 每个 SKU 维护"历史退款率 R"（最近 90 天）
- 每笔新订单：`refund_provision = sale * R * (1 - already_refunded_pct)`
- 实际退款发生时：`refund_provision` 抹平、记入 `actual_refund`

**精确性提升：**
- 类目均值 R 作为 fallback（新 SKU 无历史时）
- 季节性调整（节日季退货率 +5-10%）

#### 5.2.5 广告分摊

**来源：** Ads API `Reports`

**逻辑（默认）：**
```
SKU 当日广告费 ÷ SKU 当日订单数 = 单订单广告分摊
```

**精确口径（高级）：**
- 按搜索词关键词归因到具体订单（亚马逊有 attribution）
- 暂时简化：按 SKU 日均分摊

**多 ASIN 共享 Campaign：**
- 按 SKU impression / sales 比例分摊

#### 5.2.6 采购成本（用户录入）

**字段：**
- `cogs_per_unit`：单件采购成本（含税）
- `cogs_currency`：采购币种（通常 CNY）
- `effective_from` / `effective_until`：成本时段

**未填处理：**
- Step 1：按类目均价估算（Helium 10 的类目数据）
- Step 2：标"估算"，置信度低
- Step 3：周期性提醒用户补充

**版本化：**
- 采购成本随批次变化 → 多版本，按订单日期匹配

#### 5.2.7 头程运费

**字段：**
- `inbound_freight_per_unit`：单件头程
- 或 `inbound_freight_per_batch`：按批次（再除以件数）

**归集：**
- 按 SKU 入库批次匹配订单的销售批次（FIFO 或 LIFO，用户选）

#### 5.2.8 关税

**字段：**
- `customs_duty_per_unit`：单件关税
- 或按 HS code 自动估算

#### 5.2.9 汇率损益

**逻辑：**
- 销售货币 → 结算货币（如 USD → CNY）
- 销售时记录"理论汇率"（亚马逊 SP-API 给的当日汇率）
- 实际结汇时记"实际汇率"
- 差额 = 汇率损益

**简化：**
- 未结汇时：按"历史平均结汇汇率"估算
- 结汇后：抹平差额

#### 5.2.10 资金成本

**逻辑：**
- 用户配置"年化资金成本"（**默认 8%**，可改）
  - 8% 来自中国跨境卖家典型水平（银行 + 自有资金混合）
  - 仅有民间借贷的卖家可调高至 12-15%
  - 财力雄厚 / 自有资金充足者可调低至 5%
- 单订单资金占用周期 = 订单日 - 采购日
- `capital_cost = cogs * annual_rate * (days / 365)`

#### 5.2.11 VAT（EU/UK）

**逻辑：**
- 销售时：含 VAT 价（用户填入是否含税）
- 系统按国家 VAT 率计算
- 默认进项 = 0（保守），用户可配置进项

#### 5.2.12 跨境支付通道费

按通道分别建模（见 5.1a）。每笔提现单独记账，按比例分摊到结算周期内的订单。

#### 5.2.13 销售税（US 多州）

亚马逊代收，但需归集：
- 各州税率不同（系统维护税率表）
- Marketplace Facilitator 责任 vs Nexus 责任
- 系统自动算"应纳"，提示申报

### 5.3a 批次管理（FIFO / LIFO）

#### 5.3a.1 概念

> 用户进货成本随时间变化（汇率/原材料涨跌/换供应商）。每笔订单要"匹配"是哪一批进货的，才能算准成本。

**两种策略：**
- **FIFO (First-In-First-Out)** ← 默认
- **LIFO (Last-In-First-Out)**（特殊会计需求）

#### 5.3a.2 批次模型

```sql
purchase_batches (
  id, product_id, supplier_id, purchase_order_id,
  batch_number,
  ordered_at, arrived_at,
  quantity_purchased, quantity_remaining,
  unit_cost,                  -- 单件采购成本
  unit_freight,               -- 单件头程
  unit_customs,               -- 单件关税
  unit_inspection,            -- 单件验货
  total_unit_cost,            -- 合计
  currency, fx_rate_at_purchase
)
```

#### 5.3a.3 订单 → 批次匹配（伪代码）

```python
def match_order_to_batches(order_item, strategy='FIFO'):
    qty_to_match = order_item.quantity
    batches = get_batches(
        product_id=order_item.product_id,
        order=strategy,           # FIFO=arrived_at ASC, LIFO=DESC
        only_with_remaining=True
    )
    matched = []
    
    for batch in batches:
        if qty_to_match <= 0: break
        match_qty = min(qty_to_match, batch.quantity_remaining)
        matched.append({
            'batch_id': batch.id,
            'qty': match_qty,
            'unit_cost': batch.total_unit_cost,
            'cost_total': match_qty * batch.total_unit_cost
        })
        batch.quantity_remaining -= match_qty
        qty_to_match -= match_qty
    
    if qty_to_match > 0:
        # 账面与实际不符 → 标"批次缺失"，用平均成本兜底
        flag_batch_mismatch(order_item)
    
    return matched
```

#### 5.3a.4 批次 UI 概念

每个 SKU 有"批次时间线"，按入仓时间排列，显示每批数量、剩余、单件成本（含汇率）、关联采购单。订单详情可看到"该订单消耗了 #B-2026-0303 批次的 2 件"。

### 5.2a 求解循环依赖（M2 ↔ M3）

> ⚠️ **M2 计算的"利润"含 M3 广告分摊；M3 用 M2 的"利润 ROAS"做决策**。两者循环依赖，必须明确求解顺序。

#### 5.2a.1 求解顺序（双口径并存）

```
[ 阶段 1：基础口径 ]
  M2 计算"销售口径"利润：仅含已知 SP-API 费用 + 广告费总额
  M3 用"销售 ROAS"做粗判断（生命周期、紧急建议）
  
[ 阶段 2：精确口径 ]
  M2 用 M3 提供的关键词级广告归因，按 SKU/Campaign/Keyword 分摊广告费
  → 生成"利润口径 ROAS"
  M3 用"利润 ROAS"覆盖建议优先级
  
[ 阶段 3：迭代收敛 ]
  M3 自动执行后产生新的广告调整
  → 1 小时后重新触发 M2 → M3 流水线
  迭代上限 3 次（避免抖动）
```

#### 5.2a.2 双 ROAS 在 UI 上的显示

每个 Campaign / Keyword 显示**两个 ROAS**：
- **销售 ROAS**：Sales / Spend（亚马逊原口径）
- **利润 ROAS**：(Sales × Margin - Other Costs) / Spend

颜色编码：
- 利润 ROAS < 1 → 红（亏钱跑广告）
- 销售 ROAS 高但利润 ROAS 低 → 黄（看似在赚，其实没赚）

#### 5.2a.3 防抖机制

- M2 → M3 数据流每小时一次（不能更频繁）
- M3 决策建议生成后冻结 24h（即便 M2 数据微变，建议不重新生成）
- 用户手动"刷新决策"可强制再算

### 5.3 计算分层

```
[ Layer 1：原始数据落地 ]
  - SP-API 财务事件 → financial_events 表
  - Ads API 报告 → ad_metrics_hourly 表
  - 用户录入成本 → product_costs 表

[ Layer 2：单订单聚合 ]
  - JOIN 多源 → order_profit 表
  - 每笔订单完整成本拆解
  - 当日生成 + 月底修正一次

[ Layer 3：维度聚合（ClickHouse 物化视图） ]
  - SKU × Day
  - SKU × Week / Month
  - Campaign × Day
  - Keyword × Day
  - Store × Day

[ Layer 4：实时查询 ]
  - 用户请求 → ClickHouse 查询
  - P95 < 500ms
```

### 5.4 计算时机

| 触发 | 范围 | 频率 |
|---|---|---|
| 数据 ETL 完成（SP-API） | 当日订单 | 每 1 小时 |
| 用户点"重新计算" | 用户选定范围 | 实时（< 30s） |
| 用户更改成本 | 受影响时段 | 异步重算 |
| 月度结算到达 | 当月所有订单 | 月初一次 |
| 退款发生 | 单订单 | 实时 |
| 汇率结算 | 当期订单 | 月底一次 |

### 5.5 精确性等级与暂估/终值双标签（关键设计）

> ⚠️ **跨境电商月度对账误差 5% 是常态**（退款延迟 30 天、月度结算修正、汇率结汇滞后）。系统必须明确区分"暂估"与"终值"。

#### 5.5.1 双标签

每条利润记录有两个状态字段：

```
status_estimation:
  - estimated:   暂估值（含估算项）
  - finalized:   终值（已含全部实际数据 + 月度结算修正）
  
expected_finalization_date:  预计转终值的日期
```

#### 5.5.2 转换规则

```
订单生成（T+0）             → estimated（含退款预提、广告分摊估算）
订单发货（T+1~3）            → estimated
订单结算（Amazon T+14）      → estimated（费用细项落地）
退款窗口结束（T+30）         → estimated → 转 finalized 候选
月度仓储费报告（T+月初）     → finalized 修正
汇率结汇完成（T+月底）       → finalized 完成
```

#### 5.5.3 精确性等级（4 档）

| 等级 | 含义 | 误差范围 | UI 标签 |
|---|---|---|---|
| L1 finalized | 终值（≥ 30 天 + 月报到达 + 结汇完成） | ±2% | 🟢 终值 |
| L2 high-confidence | 高置信暂估（实际数据 ≥ 80%） | ±5% | 🟡 暂估 |
| L3 estimated | 估算（核心成本缺失，用类目均值/历史均值） | ±15% | 🟠 估算 |
| L4 unavailable | 核心数据完全缺失 | — | 🔴 不可用 |

#### 5.5.4 UI 必须做的事

- 总览页 KPI 数字旁显示 "🟡 暂估 / 🟢 终值" 标签
- Hover 时显示 "预计 2026-06-08 转终值"
- 漏点报警基于"暂估"也可触发，但金额估算附置信区间
- 月度对账报告默认仅含 finalized 数据
- "重新计算"按钮可强制重新归集，但不能把 estimated 变 finalized

### 5.6 成本数据源优先级（关键设计）

> 多个成本数据源同时存在时（批次 / 用户录入 / 类目估算），必须明确优先级，否则同一订单算两次。

#### 5.6.1 优先级链（从高到低）

```
1. Batch-matched Cost
   订单 → 通过 order_batch_matches 找到对应 purchase_batches
   优先级最高（最精确，含特定时段汇率与实际头程）

2. SKU-level Recorded Cost (product_costs)
   按订单日期匹配 effective_from <= order_date < effective_until
   兜底用（批次未建立时）

3. Category Average Estimate
   类目均值（来自第三方数据 / 系统积累）
   仅在 1 和 2 都缺失时使用，标 🟠 估算

4. Hard Default
   极端兜底：单件采购成本 = 售价 × 30%（非常粗）
   仅在以上全失败时使用，强烈提示用户补全数据
```

#### 5.6.2 实现伪代码

```python
def resolve_cogs(order_item, order_date):
    # 第 1 优先级
    match = order_batch_matches.get(order_item.id)
    if match:
        return CostRecord(
            unit_cost=match.batch.total_unit_cost,
            source='batch',
            confidence='high'
        )
    
    # 第 2 优先级
    cost = product_costs.find_active(order_item.product_id, order_date)
    if cost and not cost.is_estimated:
        return CostRecord(
            unit_cost=cost.cogs_per_unit + cost.inbound_freight + cost.customs_duty,
            source='product_costs',
            confidence='medium'
        )
    
    # 第 3 优先级
    cat_avg = category_estimates.get(order_item.product.category)
    if cat_avg:
        return CostRecord(
            unit_cost=cat_avg.estimated_cogs,
            source='category_estimate',
            confidence='low',
            warning='Using category average; please input actual cost'
        )
    
    # 第 4 优先级（极端兜底）
    return CostRecord(
        unit_cost=order_item.unit_price * 0.30,
        source='hard_default',
        confidence='very_low',
        warning='No cost data; using 30% of price as crude default'
    )
```

#### 5.6.3 UI 反馈

- 利润瀑布图中"COGS"项 hover 显示来源（batch/recorded/estimated）
- 每个 SKU 有"成本数据完整度"指标（0-100%）
- Dashboard 的"待补数据"卡片：列出 cost 缺失的 SKU 数

---

## 6. 漏点检测系统

### 6.1 漏点类型清单（首批 12 类）

| ID | 类型 | 检测规则 | 严重度 |
|---|---|---|---|
| L1 | 退货率突涨 | 单 SKU 7 日退货率 > μ + 2σ | 高 |
| L2 | 长期仓储费即将触发 | SKU 入仓 ≥ 240 天 | 中 |
| L3 | 广告利润亏损 | 利润 ROAS < 1（连续 3 天） | 高 |
| L4 | 滞销资金占用 | SKU 7 日销量 = 0 且库存 > 30 天 | 中 |
| L5 | 退款率异常 | 单 SKU 退款率 > 类目均值 1.5x | 中 |
| L6 | 价格倒挂 | 售价 < 完全成本 | 极高 |
| L7 | 长期仓储费已扣 | 已扣 LTS 费用 | 中 |
| L8 | 高频小额退款 | 单 SKU 月退款笔数 > 历史均值 2x | 中 |
| L9 | 移除费 / 销毁费 | 已扣移除/销毁费用 | 低 |
| L10 | 入仓配置不合理 | 用户使用 distributed inventory placement 但实际成本更高 | 中 |
| L11 | 关键词广告无效 | 单关键词 30 天 0 转化但持续花费 | 中 |
| L12 | 仓储费 / 销售比异常 | 月仓储费 ÷ 月销售 > 类目均值 2x | 高 |

### 6.2 检测引擎设计

```
[ 输入：每日数据快照 ]
       ↓
[ 12 个并行检测器（rule-based） ]
       ↓
[ 命中规则 → 漏点候选 ]
       ↓
[ AI 复核（Prompt：判断是真漏点还是误报） ]
       ↓
[ 真漏点 → leak_points 表 ]
       ↓
[ AI 生成修复建议（Prompt：输出可执行 action） ]
       ↓
[ 推送到漏点中心 + Dashboard ]
```

### 6.3 单个漏点的数据结构

```json
{
  "leak_id": "uuid",
  "type": "L3",  // 广告利润亏损
  "severity": "high",
  "detected_at": "2026-05-07T10:00:00Z",
  
  "scope": {
    "store_id": "...",
    "sku": "ABC-001",
    "asin": "B0XXXXXXXX",
    "campaign_id": "..."  // 漏点相关上下文
  },
  
  "evidence": {
    "metric": "profit_roas",
    "value": 0.85,
    "threshold": 1.0,
    "duration_days": 5,
    "actual_loss_estimate": 1840.50,
    "currency": "CNY"
  },
  
  "ai_analysis": {
    "summary": "Campaign X 在过去 5 天利润 ROAS 持续 < 1...",
    "root_causes": [
      {"cause": "ACOS 30% 但毛利率仅 25%", "weight": 0.7},
      {"cause": "退货率 8% 高于均值", "weight": 0.3}
    ],
    "confidence": 0.92
  },
  
  "recommendation": {
    "primary_action": {
      "type": "pause_campaign",
      "target": "campaign_id",
      "estimated_saving_per_month": 4200,
      "rationale": "..."
    },
    "alternative_actions": [
      {"type": "reduce_bid", "by_pct": 30, "estimated_saving": 2100},
      {"type": "negative_keyword", "keywords": [...]}
    ]
  },
  
  "status": "pending",  // pending / accepted / rejected / auto_executed / resolved
  "user_action_at": null,
  "resolved_at": null,
  "actual_saving": null  // 修复后跟踪
}
```

### 6.4 漏点中心 UI

```
┌──── 漏点中心 ──────────────────────────────────────┐
│ 总览：8 个漏点 ｜ 估算月可省 ¥17,400              │
│                                                     │
│ 筛选：[ 严重度▾ ] [ 类型▾ ] [ 状态▾ ] [ SKU 搜索 ] │
│                                                     │
│ ─────────────────────────────────────────────────  │
│ 🔴 [高] L3 广告利润亏损  ｜ 月可省 ¥4,200         │
│   Campaign "电源类自动" ｜ ASIN B0AAA              │
│   利润 ROAS 0.85（连续 5 天）                      │
│   AI 建议：暂停 Campaign                            │
│   [立即暂停] [降低出价 30%] [查看详情] [忽略]     │
│ ─────────────────────────────────────────────────  │
│ 🔴 [高] L1 退货率突涨  ｜ 月损失 ¥3,800           │
│   SKU "phone-case-X" 7 日退货率 11%（均值 5%）    │
│   AI 分析：差评显示"按键松动"为主因                │
│   [查看 Review 分析] [改进 Listing] [忽略]        │
│ ─────────────────────────────────────────────────  │
│ 🟡 [中] L2 LTS 即将触发 ｜ 月费用 ¥1,200          │
│   ...                                               │
└─────────────────────────────────────────────────────┘
```

### 6.5 修复闭环跟踪

```
[ 漏点发现 ] → [ 用户操作（采纳/忽略/自定义） ]
                     ↓
            [ 30 天跟踪实际效果 ]
                     ↓
   [ 实际节省金额 vs AI 估算 → 反馈到模型 ]
```

跟踪机制：
- 用户点"采纳建议"或自定义处置后，标记 leak.status = 'accepted' 或 'auto_executed'
- 系统每天对该漏点的 metric 重新评估
- 30 天后：计算"修复后 30 天 vs 修复前 30 天"的对应费用差
- 显示在漏点详情"实际节省 vs 估算节省"

---

## 7. 库存决策（补货）

### 7.1 补货决策核心逻辑

#### 7.1.1 输入数据

| 数据 | 来源 | 用途 |
|---|---|---|
| 历史销量 | SP-API Reports | 销量预测 |
| 当前库存 | SP-API Inventory | 起点 |
| 在途库存 | SP-API Inbound | 加和 |
| 海运周期 | 用户录入 | 决策窗口 |
| 安全库存天数 | 用户录入 | 缓冲 |
| 广告投放计划 | M3 / 用户 | 影响销量 |
| 活动日历 | 用户录入 + 系统预设 | 销量峰值 |
| 季节性 | 历史数据 | 调整因子 |
| 利润率 | M2 自身 | 决策依据 |
| 资金可用 | 用户录入 | 约束 |

#### 7.1.2 销量预测（Forecasting）

**算法选择：**
- 主算法：Prophet（FB 开源，处理季节性 + 节日效果）
- 备选：ARIMA（短周期）/ Random Forest（多特征）
- LLM 复核：将预测曲线 + 上下文喂给 LLM，让其判断"合不合理"

**特征：**
- 历史销量（≥ 90 天）
- 广告花费（影响曲线）
- 价格历史
- 评论数 / 评分变化
- 季节性（年内 / 周内）
- 活动事件（Prime Day / 黑五）
- 假期日历

**输出：**
- 未来 30/60/90 天每日销量预测
- 预测置信区间（如 P10 / P50 / P90）

**精度目标：MAPE ≤ 20%（30 日窗口）**

#### 7.1.3 补货时间点

```python
def reorder_decision(sku):
    current_stock = sku.available_stock
    inbound_stock = sku.inbound_stock
    
    # 销量预测
    daily_demand = forecast_daily_demand(sku, days=90)
    
    # 计算"还能卖多少天"
    days_remaining = (current_stock + inbound_stock) / daily_demand.mean()
    
    # 海运周期 + 安全库存
    lead_time = sku.shipping_lead_time_days
    safety_stock_days = sku.safety_stock_days
    
    reorder_threshold = lead_time + safety_stock_days
    
    if days_remaining < reorder_threshold:
        urgency = "critical" if days_remaining < lead_time else "high"
    elif days_remaining < reorder_threshold + 7:
        urgency = "medium"
    else:
        urgency = "low"
    
    # 建议补货量（考虑下个补货周期 + 销量峰值 + 安全库存）
    recommended_qty = (lead_time + 60 + safety_stock_days) * daily_demand.p75
    
    return {
        "current_stock": current_stock,
        "days_remaining": days_remaining,
        "urgency": urgency,
        "recommended_qty": int(recommended_qty),
        "expected_revenue": recommended_qty * sku.price,
        "expected_profit": recommended_qty * sku.unit_profit,
        "capital_required": recommended_qty * sku.cogs,
        "payback_days": calculate_payback(...)
    }
```

#### 7.1.4 补货决策卡片

```
┌── SKU: B0XXXXXXXX (Phone Case Pro) ──────────────────┐
│                                                        │
│ 当前库存: 245 件 ｜ 在途: 0 ｜ 日均销量: 12 件        │
│ 还能卖: 20 天                                          │
│                                                        │
│ 🔴 立即补货                                            │
│                                                        │
│ ─── 补货建议 ───                                       │
│ 推荐补货量: 600 件                                     │
│ 资金需求: ¥48,000                                      │
│ 预期销售周期: 50 天                                    │
│ 预期毛利: ¥48,000 (毛利率 24%)                         │
│ 资金回收期: 52 天                                      │
│                                                        │
│ ─── 销量预测（含活动） ───                            │
│ [折线图：60 天预测，含 Prime Day 峰值]                │
│ 50% 区间：350-420 件 / 月                              │
│                                                        │
│ ─── 决策模拟 ───                                       │
│ [滑块：补 300 / 600 / 900 / 1200 件]                  │
│ 选 600 → 资金 ¥48k，60 天周转，停销风险 5%            │
│ 选 1200 → 资金 ¥96k，120 天周转，长仓风险 ⚠️         │
│                                                        │
│ [✓ 一键创建采购单]  [自定义]  [推迟决策]             │
└────────────────────────────────────────────────────────┘
```

### 7.2 补货建议聚合页

```
┌── 补货建议总览 ────────────────────────────────────────┐
│                                                          │
│ [筛选：店铺 ▾ ] [紧急度 ▾] [SKU 标签 ▾]                │
│                                                          │
│ 紧急（7 天内）        - 4 个 SKU - 资金需 ¥120k        │
│ 高（14 天内）         - 8 个 SKU - 资金需 ¥220k        │
│ 中（30 天内）         - 12 个 SKU - 资金需 ¥350k       │
│                                                          │
│ ─────────────────────────────────────────              │
│ 紧急 SKU 列表：                                         │
│ ☐ B0AAA  10 天断货  补 600 件 ¥48k  [详情][生成 PO]   │
│ ☐ B0BBB  5 天断货   补 800 件 ¥75k  [详情][生成 PO]   │
│ ...                                                      │
│                                                          │
│ [批量生成采购单] [批量调整]                             │
└──────────────────────────────────────────────────────────┘
```

### 7.3 采购单生成

- 用户选择 N 个 SKU 的补货建议 → 一键"生成采购单"
- 系统按"供应商分组"
- 输出：
  - 采购单 PDF / Excel（含 SKU、数量、单价、总金额、交付日）
  - 推送到用户邮箱 / 微信 / 企业微信
  - 状态跟踪："未发出 / 已发出 / 工厂确认 / 在生产 / 已发货 / 已到仓"

### 7.4 补货决策的高级特性（P1 / P2）

- **多供应商比价**：同一 SKU 多个供应商 → 自动选最优
- **阶梯价**：数量越多单价越低，AI 给"凑量是否划算"建议
- **批次合并**：多个 SKU 凑同一货柜，节省运费
- **资金预算约束**：用户输入"本周可投入 ¥X"，系统优化分配

### 7.5 采购单（PO）完整流程

#### 7.5.1 PO 状态机（双模式：完整 vs 轻量）

> ⚠️ 实际中很多卖家不愿意更新中间状态。系统提供**两种模式**：

##### 模式 A：完整模式（11 状态，适合精细化运营）

```
Draft → Submitted → Confirmed → In Production → Ready to Ship
  → In Transit → At Port → Customs Cleared → Inbound to FBA → Received → Reconciled

异常分支：Cancelled / Disputed / Partially Received
```

每个状态自动检测（基于头程跟踪号 + 入仓数据）+ 用户可手动更新。

##### 模式 B：轻量模式（4 状态，默认推荐）

```
Draft → Ordered → In Transit → Received

异常分支：Cancelled / Disputed
```

只跟踪关键节点：
- **Draft**：创建中，未发出
- **Ordered**：发给供应商，已付定金（合并 Submitted/Confirmed/In Production/Ready to Ship）
- **In Transit**：发货后到入仓前（合并 Shipped/At Port/Customs/Inbound）
- **Received**：FBA 已入仓（合并 Received/Reconciled，对账作为子流程）

用户首次创建 PO 时选择模式（可后期切换）。**默认轻量**。

#### 7.5.2 单 PO 数据

```json
{
  "po_id": "PO-2026-0015",
  "tenant_id": "...",
  "supplier_id": "...",
  "status": "in_transit",
  
  "items": [
    {
      "product_id": "...",
      "sku": "ABC-001",
      "quantity": 600,
      "unit_price_supplier": 8.50,    // 供应商报价
      "currency": "CNY",
      "specifications": "...",
      "moq_satisfied": true
    }
  ],
  
  "totals": {
    "subtotal_cny": 5100,
    "freight": 1200,
    "customs": 510,
    "inspection_fee": 200,
    "total_landed_cost": 7010,
    "currency": "CNY"
  },
  
  "timeline": {
    "created_at": "2026-04-01",
    "confirmed_by_supplier": "2026-04-03",
    "production_start": "2026-04-05",
    "shipped": "2026-04-25",
    "arrived_at_port_estimated": "2026-05-25",
    "fba_inbound_estimated": "2026-06-05",
    "actual_arrived_at_port": null
  },
  
  "tracking": {
    "shipping_method": "ocean_freight",
    "tracking_number": "BL-XXX",
    "carrier": "MSC",
    "container_no": "..."
  },
  
  "payment_terms": "30%_deposit_70%_before_shipment",
  "deposit_paid_at": "2026-04-03",
  "balance_paid_at": null,
  
  "documents": [
    {"type": "PI", "url": "..."},        // Proforma Invoice
    {"type": "CI", "url": "..."},        // Commercial Invoice
    {"type": "Packing List", "url": "..."},
    {"type": "BL", "url": "..."}         // Bill of Lading
  ],
  
  "linked_batches": ["B-2026-0501"],     // 入仓后产生的批次
  
  "reconciliation": {
    "status": "pending",
    "expected_qty": 600,
    "received_qty": null,
    "damaged_qty": null,
    "missing_qty": null,
    "ledger_match": null
  }
}
```

#### 7.5.3 PO 创建：从补货建议一键生成

```
补货建议页 → "选 5 个 SKU" → "生成采购单"
       ↓
[系统按"供应商"自动分组]
  Supplier A 4 个 SKU → PO-2026-0015
  Supplier B 1 个 SKU → PO-2026-0016
       ↓
[草稿状态，用户检查 / 修改]
  - 数量 / 单价 / MOQ 校验
  - 凑单建议（"再加 100 件 SKU-X 可降运费 ¥X"）
       ↓
[确认 → Submitted]
       ↓
导出 PO PDF / Excel 给供应商
推送到供应商邮箱（如配置）
```

#### 7.5.4 PO 跟踪 UI

```
┌── 采购单 PO-2026-0015 ──────────────────────────┐
│ 供应商: 工厂 A (四星)  状态: 🚢 海运中            │
│ ────────────────────────────────────────         │
│ 时间线：                                          │
│   ✓ 04-01 创建                                   │
│   ✓ 04-03 工厂确认 (定金 30% ¥2,103 已付)        │
│   ✓ 04-05 生产开始                               │
│   ✓ 04-25 发货（尾款 ¥4,907 已付）               │
│   ⏳ 05-25 (预计) 到港 → 清关 → FBA 入仓          │
│   ⬜ 06-05 (预计) 入仓完成 → 对账                 │
│                                                   │
│ ─── 商品明细 ───                                  │
│ SKU ABC-001 × 600 @ ¥8.50 = ¥5,100               │
│                                                   │
│ ─── 成本拆解 ───                                  │
│ 货款 ¥5,100 + 海运 ¥1,200 + 关税 ¥510 + 验货 ¥200│
│ = 总到岸成本 ¥7,010                                │
│ 单件到岸成本 ¥11.68                                │
│                                                   │
│ ─── 文档 ───                                      │
│ [PI] [CI] [Packing List] [BL]                    │
│                                                   │
│ ─── 操作 ───                                      │
│ [更新状态] [重新预估到达时间] [关联批次] [对账]   │
└───────────────────────────────────────────────────┘
```

#### 7.5.5 自动对账

PO 状态变 'Received' 后：
1. 系统比对 expected_qty vs received_qty
2. 数量一致 → 自动生成批次（purchase_batches）+ 标 'Reconciled'
3. 数量不一致 → 标 'Disputed'，提示用户处理：
   - 部分接收 + 联系供应商赔偿
   - 创建调整凭证

### 7.6 供应商管理

#### 7.6.1 供应商画像

```json
{
  "supplier_id": "...",
  "name": "深圳工厂 A",
  "contact": {...},
  
  "products": ["ABC-001", "DEF-002", ...],
  
  "performance": {
    "on_time_delivery_rate": 0.92,         // 准时率
    "defect_rate": 0.018,                  // 缺陷率
    "quantity_accuracy_rate": 0.995,       // 数量准确率
    "price_stability_score": 0.85,         // 价格稳定性
    "communication_score": 0.90,
    "overall_rating": 4.2                  // 5 星制
  },
  
  "pricing": {
    "tiered_pricing": [
      {"min_qty": 100, "max_qty": 499, "unit_price": 9.50},
      {"min_qty": 500, "max_qty": 999, "unit_price": 8.50},
      {"min_qty": 1000, "max_qty": 4999, "unit_price": 7.80},
      {"min_qty": 5000, "max_qty": null, "unit_price": 7.20}
    ],
    "currency": "CNY",
    "payment_terms": "30%_deposit_70%_before_shipment",
    "moq": 100
  },
  
  "lead_time": {
    "production_days": 25,
    "shipping_days_ocean": 30,
    "shipping_days_air": 7,
    "buffer_days": 5
  },
  
  "history": {
    "total_orders": 35,
    "total_spend_cny": 580_000,
    "first_order_at": "2024-03-15",
    "last_order_at": "2026-04-01"
  }
}
```

#### 7.6.2 多供应商最优分配

> 同 SKU 有 N 个供应商，AI 按多约束优化分配。

**优化目标：** 最小化总成本（货款 + 风险溢价）

**约束：**
- 总采购量 = 需求量
- 各供应商单笔不低于 MOQ
- 准时率约束（关键 SKU 不全压一个）
- 用户偏好（如"主供应商 70%，备选 30%"）

**算法：**
- 简化为 LP（Linear Programming）问题
- 用 SciPy 的 linprog 或 OR-Tools

**UI：**
```
SKU ABC-001 补货 1500 件
─────────────────────────────────
AI 推荐分配：
  供应商 A（主，五星）: 1000 件 @ ¥7.80 = ¥7,800
  供应商 B（备，四星）: 500 件 @ ¥8.20 = ¥4,100
  总成本: ¥11,900 + 运费 ¥X
  
理由:
  • 供应商 A 准时率 92% (主力)
  • 供应商 B 作为备份 (风险分散)
  • 总成本仅高 ¥150 vs 全 A，但风险大降

[采纳] [全 A] [全 B] [自定义]
```

### 7.7 凑单优化（多 SKU 共柜）

> 多个 SKU 同期补货 → 凑同一货柜 → 节省运费。

**逻辑（粗粒度估算，非 3D 装箱）：**
- 货柜（20' / 40' / 40HQ）已知容积（CBM）+ 载重（kg）
- 每 SKU 已知**单件 CBM + 单件重量**（用户录入或类目均值）
- 简单加和：`Σ (qty × cbm)` ≤ 货柜容积，`Σ (qty × weight)` ≤ 载重
- 装载利用率 = `Σ (qty × cbm) / 容积`

> 不做 3D bin packing（NP-hard 过度设计）。实际海运装柜的精确度在 ±5% 内即可，由货代 / 工厂处理细节。

**UI：**
```
本周补货建议（5 个 SKU）：
─────────────────────────────────
分别发货成本:
  5 个 SKU 各发各的 ¥6,800（每柜不满）

凑单方案:
  方案 A: 4 SKU 凑 1 个 40' 柜 + 1 SKU 单独
    总运费 ¥4,200 (省 ¥2,600)
    柜利用率 91%
  
  方案 B: 5 SKU 凑 1 个 40HQ 柜
    需多补 SKU-X 200 件凑量
    总运费 ¥3,800 (省 ¥3,000)
    占用资金多 ¥1,500
  
AI 推荐: 方案 A (折中)
[选 A] [选 B] [自定义]
```

### 7.8 资金预算优化器

#### 7.8.1 概念

> 用户输入"本周可投入 ¥X"，系统在多 SKU 补货建议中优化分配。

#### 7.8.2 输入

- 可用预算（¥X）
- 紧急度阈值（如"先满足 critical + high"）
- 风险偏好（保守/平衡/激进）

#### 7.8.3 优化目标

```
最大化 30 日总预期利润
约束：
  Σ(资金占用) ≤ 预算
  紧急度 = critical 的 SKU 必满足
  紧急度 = high 的 SKU 优先
  各 SKU 补货量 ≥ MOQ
```

#### 7.8.4 输出

```
预算 ¥200,000
─────────────────────────────────
AI 优化分配:
  ✓ B0AAA 紧急 - 补 600 件 - ¥48k - 30 日利润 +¥35k
  ✓ B0BBB 紧急 - 补 800 件 - ¥75k - 30 日利润 +¥40k
  ✓ B0CCC 高    - 补 400 件 - ¥38k - 30 日利润 +¥18k
  ✗ B0DDD 中    - 暂缓（资金不足）
  ✓ B0EEE 高    - 补 300 件 - ¥35k - 30 日利润 +¥15k
  
预算用 ¥196k / 200k (98%)
预期 30 日总利润提升: +¥108k
风险: 中（B0CCC 历史利润率波动大）

[采纳并批量生成 PO] [调整]
```

### 7.9 跨仓调拨建议（多 FBA 仓）

#### 7.9.1 场景

- 用户多个国家站（US / CA / EU）
- US 仓 SKU-X 滞销，CA 仓 SKU-X 即将断货
- 调拨比新采购更快 / 便宜

#### 7.9.2 逻辑

```python
def transfer_recommendation():
    for sku in skus:
        for warehouse_a in warehouses_with_excess(sku):
            for warehouse_b in warehouses_with_shortage(sku):
                cost_to_transfer = calculate_transfer_cost(a, b, sku)
                cost_to_repurchase = calculate_repurchase_cost(b, sku)
                if cost_to_transfer < cost_to_repurchase:
                    yield Recommendation(
                        from=a, to=b, sku=sku,
                        savings=cost_to_repurchase - cost_to_transfer
                    )
```

#### 7.9.3 限制

- 不同国家间调拨涉及关税 / 重新申报
- 仅经济性 + 政策可行才推荐

---

## 8. 滞销决策

### 8.1 滞销识别

```python
def identify_slow_moving(sku):
    days_no_sale = sku.days_since_last_sale
    in_stock_days = sku.in_stock_days
    
    # 多档识别
    if days_no_sale >= 30 and in_stock_days >= 60:
        return "severe"
    elif days_no_sale >= 14 and in_stock_days >= 30:
        return "moderate"
    elif days_no_sale >= 7 and in_stock_days >= 14:
        return "early_warning"
    return None
```

### 8.2 滞销诊断卡片

```
┌── SKU: B0YYYYYYYY ──────────────────────────────────┐
│                                                       │
│ 库存: 320 件 ｜ 30 日销量: 4 件 ｜ 入仓: 217 天      │
│ 当前售价: $24.99 ｜ 库存价值: ¥38,400                 │
│                                                       │
│ 🟡 滞销诊断                                           │
│                                                       │
│ ─── 真实成本计算 ───                                  │
│ 月仓储费: ¥1,200                                      │
│ 长期仓储费触发倒计时: 30 天 (会再扣 ¥X)               │
│ 资金占用成本: ¥38,400 × 12% = ¥4,608/年              │
│ 按当前销量清完需: 80 个月                             │
│                                                       │
│ ─── 四选项对比（按"心理接受度"排序） ───              │
│ ┌─────────────────────────────────────────────┐    │
│ │ A. 降价促销至 $19.99（-20%）                │    │
│ │    预计 60 天清完                            │    │
│ │    单件毛利 -2.50 → 总损失 ¥2,300           │    │
│ │    释放现金 ¥18,000                          │    │
│ │    [推荐 ⭐]                                 │    │
│ ├─────────────────────────────────────────────┤    │
│ │ B. 配套促销（Coupon + Lightning Deal + 广告）│    │
│ │    预计 90 天清完，损失更小                  │    │
│ │    总损失 ¥1,200                             │    │
│ │    需更多运营投入                            │    │
│ ├─────────────────────────────────────────────┤    │
│ │ C. 移除回国清货（Removal）                   │    │
│ │    退仓费: ¥X                                │    │
│ │    国内清货回款: ¥18,000                     │    │
│ │    总损失 ¥20,400                            │    │
│ ├─────────────────────────────────────────────┤    │
│ │ D. 销毁（最后选项，慎用）                    │    │
│ │    销毁费: ¥0.5/件                           │    │
│ │    总损失 ¥38,560                            │    │
│ │    仅在 A/B/C 都不可行时考虑                 │    │
│ └─────────────────────────────────────────────┘    │
│                                                       │
│ AI 推荐：A，理由：                                    │
│ • 60 天可释放现金最多                                  │
│ • 损失最小                                             │
│ • 避免账户健康分受影响                                 │
│                                                       │
│ [执行 A] [执行 B] [执行 C] [自定义] [继续观察]       │
└───────────────────────────────────────────────────────┘
```

### 8.3 执行动作

| 选项 | 系统行为 |
|---|---|
| A. 降价 | 调用 SP-API ProductPricing 改价 + 启动 Coupon |
| B. 移除 | SP-API CreateRemovalOrder |
| C. 销毁 | SP-API CreateRemovalOrder (Disposal) |
| 自定义 | 用户输入参数 |
| 继续观察 | 标记 SKU，下周重新评估 |

---

## 9. 跟价决策

### 9.1 跟价场景

来自 M4C 竞品作战室的"竞品降价"事件 → 推送到 M2 跟价测算。

### 9.2 跟价决策卡片

```
┌── 跟价决策 ─────────────────────────────────────────┐
│                                                       │
│ 我的 SKU: B0XXXXXXXX  ｜ 当前售价: $22.99            │
│ 竞品 ASIN: B0ZZZZZZZZ ｜ 已降至: $19.99 (-13%)       │
│ 竞品历史价: 平均 $23.50（持续 60 天）                │
│                                                       │
│ ─── 价格-利润曲线 ───                                 │
│ [图：x 轴 = 售价，y 轴 = 单件毛利]                   │
│  $22.99  毛利 ¥35.50 (毛利率 22%)                    │
│  $21.99  毛利 ¥30.20 (毛利率 19%)                    │
│  $20.99  毛利 ¥24.70 (毛利率 12%)                    │
│  $19.99  毛利 ¥18.50 (毛利率 9%)                     │
│  $19.49  毛利 ¥14.20 (毛利率 7%)                     │
│  保本价: $18.85                                       │
│                                                       │
│ ─── 销量弹性测算 ───                                  │
│ 不跟价: 预计销量下降 35%（基于历史价格弹性）          │
│ 跟到 $20.99: 销量保持 / 提升 5%                      │
│ 跟到 $19.99: 销量提升 12%                            │
│                                                       │
│ ─── 30 天总利润预测 ───                              │
│ 不跟价: ¥X (销量降导致)                              │
│ 跟 $20.99: ¥Y (推荐) ⭐                              │
│ 跟 $19.99: ¥Z                                         │
│                                                       │
│ AI 推荐：跟到 $20.99                                  │
│ 理由：                                                 │
│ 1. 30 日总利润最大化                                   │
│ 2. 保留品牌定价权（不完全跟到底）                      │
│ 3. 竞品低价不可持续（毛利已破 5%）                     │
│                                                       │
│ [一键改价 $20.99] [自定义价格] [不跟价]              │
└───────────────────────────────────────────────────────┘
```

### 9.3 价格弹性建模

**数据来源：** 历史价格变化 vs 销量变化（自家 + 竞品）

**算法：**
- 简单线性回归（log-log 模型）
- 类目均值作为先验
- 持续学习（每月更新弹性系数）

---

## 9a. 现金流时序视图

### 9a.1 价值

> **库存利润 ≠ 现金流。** 卖家可能账面利润很好，但货全在海上 + FBA 仓 + 应收，下个月发不出工资。

### 9a.2 现金流四象限

```
                          时间线 ──→
                                
应收（Future Cash In）：
  Amazon 14 天结算（已售未结）
  Amazon 已结算未提现（Available）
  在途回款（Payoneer / PingPong）

应付（Future Cash Out）：
  采购单尾款（30/70 模式的 70%）
  即将到账的费用（仓储 / LTS）
  本产品订阅费

在途资产（Locked）：
  采购在途货物（已付款）
  FBA 在途库存（已发货未入仓）
  FBA 已入仓库存

可用现金（Liquid）：
  各结算账户余额
```

### 9a.3 现金流时序图（90 天）

```
现金流预测 - 未来 90 天
─────────────────────────────────────────────────────
                              5/15      6/01      6/15
当前可用现金 ¥420,000 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                                    │
入金（应收）                                        │
+ 5/12 Payoneer 提现 +¥150,000  ━━┓                │
+ 5/26 Amazon 结算 +¥180,000      ━━━━━━━━━━━━━━━┓ │
+ 6/09 Amazon 结算 +¥220,000                     ━━┓
                                                   │
出金（应付）                                        │
- 5/15 PO-016 尾款 -¥85,000  ━━┓                  │
- 5/20 仓储费 -¥12,000           ━┓                │
- 6/01 PO-018 定金 -¥45,000        ━━━━━┓         │
- 6/15 LTS 费 -¥8,500                    ━━━━━━━━┓│
                                                   ││
预测可用现金:                                      ││
2026-05-15 ¥485,000                              ││
2026-05-26 ¥660,000                              ││
2026-06-15 ¥741,500 ⚠️ 超 80% 在途，建议谨慎大额采购

[导出 Excel] [设置预警阈值]
```

### 9a.4 现金流预警

- 可用现金 < 阈值（用户设）→ P1 通知
- 7 天内将出现负现金流 → P0 通知
- 应收回款延迟（Payoneer 提现失败）→ P1

### 9a.5 现金流改善建议

AI 给出可执行建议：
- "推迟 PO-018 5 天可避免负现金流"
- "提前提现 ¥X 可缓解 5/15 缺口"
- "与供应商谈 60 天账期，资金压力下降 25%"

---

## 10. 资金周转分析

### 10.1 概念

```
资金周转天数 (Days of Working Capital, DWC) = 
  采购到回款的总天数
  
  = 采购到入仓 (lead time) 
    + 入仓到首单售出（库存平均周转日）
    + 售出到结算回款（亚马逊结算 14 天）
```

### 10.2 SKU 级资金周转

```
SKU: B0XXXXXXXX
─────────────────────────────────────
日均销量: 12 件
当前库存: 240 件 → 库存周转日: 20 天
海运周期: 35 天
亚马逊结算: 14 天
─────────────────────────────────────
总资金周转: 35 + 20 + 14 = 69 天
单件资金占用: ¥80 × 69/365 × 12% = ¥1.81
年化资金成本占售价: 1.81 / 24.99 / 6.8 = 1.07%
```

### 10.3 资金视图

```
┌── 资金周转视图 ───────────────────────────────┐
│                                                  │
│ 总资金占用: ¥412,000                            │
│ ├ 在途货物: ¥85,000  (21%)                      │
│ ├ FBA 库存: ¥247,000 (60%)                      │
│ └ 应收回款: ¥80,000  (19%)                      │
│                                                  │
│ 平均周转日: 73 天                                │
│ 年化资金成本: ¥49,440 (按 12%)                   │
│                                                  │
│ ─── SKU 周转排行 ───                             │
│ SKU 名     占用    周转日    年化成本            │
│ B0AAA  ¥85,000   85 天    ¥10,200 ⚠️ 慢       │
│ B0BBB  ¥45,000   42 天    ¥5,400               │
│ ...                                              │
│                                                  │
│ AI 建议：                                        │
│ • B0AAA 周转过慢，建议清减库存或提高广告投入    │
│ • B0CCC 周转最快，可加大补货                    │
└──────────────────────────────────────────────────┘
```

---

## 10a. 情景模拟器

### 10a.1 价值

> 决策前先看"如果我做 X，会发生什么"。

### 10a.2 单 SKU 模拟器

```
┌── B0XXX 情景模拟 ─────────────────────────────────┐
│                                                     │
│ 当前基线:                                           │
│   售价 $24.99 | ACOS 22% | 月销 320 件             │
│   月利润 ¥48,000 | 利润率 17%                      │
│                                                     │
│ 模拟参数（拖动滑块）:                                │
│   售价         $19   $24.99   $30  ← 当前         │
│   ACOS          5%   22%     50%  ← 当前          │
│   月销量量化   100   320     800  (基于价格弹性)  │
│   退货率        0%    5%      15% ← 当前          │
│   采购成本      ¥40   ¥80     ¥120                │
│                                                     │
│ 模拟结果（实时更新）:                                │
│   月销售: ¥X,XXX                                    │
│   月利润: ¥X,XXX                                    │
│   利润率: XX%                                       │
│   ACOS 保本: XX%（不变）                            │
│   售价保本: $XX.XX                                  │
│                                                     │
│ 三场景对比:                                          │
│   保守 / 平衡 / 激进 三套参数预设                    │
│                                                     │
│ [保存方案] [对比基线] [应用]                         │
└─────────────────────────────────────────────────────┘
```

### 10a.3 全店模拟器

输入：
- 全店降价 X%
- 全店广告预算 +X%
- 全店补货 ¥X 投入

输出：
- 30/60/90 日预测利润 / 现金流
- 风险评估

### 10a.4 历史回归

> 用过去真实数据"验证"模拟器准确性。
> 如：3 个月前售价从 $26 降到 $24，模拟器预测销量 +18%，实际 +21%。误差 3%，置信度高。

---

## 10b. 跨店铺合并视图

### 10b.1 场景

> 大卖有 5 个店铺、3 个国家站，每天打开各自后台累成狗。

### 10b.2 合并 KPI

```
┌── 跨店铺合并 - 2026-05 ─────────────────────────┐
│                                                    │
│ 合并 GMV    ¥1,580,000 (↑12% vs 上月)             │
│ 合并净利润  ¥235,000 (↑18%)                       │
│ 合并利润率  14.9%                                  │
│ 合并订单数  18,500                                 │
│                                                    │
│ 各店铺贡献:                                         │
│ ┌──────────────────────────────────────────┐     │
│ │ Store    | 国家 | GMV    | 利润   | 占比  │     │
│ │ STORE-A  | US   | $XXX   | $XX    | 45%   │     │
│ │ STORE-B  | UK   | £XXX   | £XX    | 22%   │     │
│ │ STORE-C  | DE   | €XXX   | €XX    | 18%   │     │
│ │ STORE-D  | CA   | $XXX   | $XX    | 10%   │     │
│ │ STORE-E  | JP   | ¥XXX   | ¥XX    | 5%    │     │
│ └──────────────────────────────────────────┘     │
│                                                    │
│ AI 洞察:                                            │
│ • UK 店利润率最高（17.2%），可加大投入               │
│ • DE 店退货率异常（8.5%），需排查                    │
│ • JP 店占比小但增速最快，关注                       │
│                                                    │
│ [按 SKU 跨店对比] [按品牌] [按项目]                 │
└────────────────────────────────────────────────────┘
```

### 10b.3 跨店 SKU 对比

同 SKU 在多国销售时，对比利润率、ACOS、CVR、退货率，发现机会。

---

## 10c. 多维度归集（品牌 / 项目 / 团队 / 运营）

### 10c.1 维度配置

用户给 SKU 打标签：
- `brand_name`：品牌名（一个团队多品牌时）
- `project`：项目代号
- `team`：归属团队
- `owner_user_id`：负责运营

### 10c.2 多维度看板

```
按品牌:
  Brand A  GMV ¥800k  Profit ¥120k  Margin 15%  SKU 数 20
  Brand B  GMV ¥520k  Profit ¥95k   Margin 18%  SKU 数 12
  ...

按运营:
  张运营  负责 SKU 8 个  GMV ¥320k  Profit ¥58k
  李运营  负责 SKU 15 个 GMV ¥680k  Profit ¥98k
  ...
```

### 10c.3 KPI 对比

各运营 / 各团队 KPI（利润率、增长率、ACOS、CVR 等）排行 + 对比。

---

## 10d. 汇率管理与风险

### 10d.1 汇率视图

```
┌── 汇率管理 ──────────────────────────────────────┐
│                                                    │
│ 当前敞口（按币种）:                                │
│   USD  $48,000  应收 + $25,000 可用 = $73,000     │
│   EUR  €18,000                                    │
│   GBP  £12,000                                    │
│   JPY  ¥800,000                                   │
│                                                    │
│ 总敞口（CNY 等价）: ¥720,000                       │
│                                                    │
│ 30 天 USD/CNY 走势:                                │
│ [折线图：6.85 ─ 6.92 ─ 6.88 ─ ...]                │
│                                                    │
│ 敏感度分析:                                         │
│   汇率 -1%：利润 -¥6,800                          │
│   汇率 -3%：利润 -¥20,400                         │
│   汇率 +1%：利润 +¥6,800                          │
│                                                    │
│ AI 建议:                                            │
│   • USD 敞口偏大，建议提现 50% 锁汇                │
│   • 当前 USD 走势看跌，建议加快提现                │
└────────────────────────────────────────────────────┘
```

### 10d.2 远期跟踪（P2）

用户与银行签远期合约 → 系统记录 → 实际结汇时计算"远期 vs 即期"差异。

### 10d.3 ACCS 警告

如检测到用户用 Amazon Currency Converter（隐性 3-4% 损失）→ 强烈建议改用 Payoneer / PingPong。

---

## 10e. 税务辅助

### 10e.1 VAT 申报数据（EU/UK）

每月 1 号自动生成 VAT 申报数据：
- 销售额（按国家分）
- 销项税
- 进项税（用户上传发票）
- 应纳税额

可导出为 OSS / IOSS 标准格式。

### 10e.2 销售税（US）

- 各州销售额自动归集
- 提示 Nexus 阈值（如 CA $500k / 200 笔）
- 导出为 Avalara / TaxJar 兼容格式

### 10e.3 跨境税务提示

- 关税 HS Code 校验
- 各国进口政策变更预警
- DDP / DDU 模式建议

---

## 10f. 自定义报警

### 10f.1 报警规则配置

```
┌── 自定义报警规则 ──────────────────────────────┐
│                                                  │
│ 规则示例：                                        │
│                                                  │
│ 当 (SKU.profit_margin < 15%) 持续 (3 天)         │
│ 且 (SKU.ad_spend > ¥500/日) 时                   │
│ 通知 (运营负责人) 通过 (微信)                     │
│ 严重度 (P1)                                      │
│ [启用] [测试] [删除]                              │
│                                                  │
│ + 新建规则                                        │
│                                                  │
│ 模板：                                            │
│   - 利润率低于阈值                                │
│   - 退货率突涨                                    │
│   - 库存周转过慢                                  │
│   - 现金流不足                                    │
│   - 单次大额漏点                                  │
│   - ...                                          │
└──────────────────────────────────────────────────┘
```

### 10f.2 规则引擎

```yaml
rules:
  - id: rule_low_margin
    when:
      - condition: "sku.rolling_30d_margin < 0.15"
      - duration: "3d"
      - condition: "sku.ad_spend_30d > 500"
    then:
      - notify: ["sku.owner_user", "tenant.admin"]
        channel: ["wechat", "in_app"]
        severity: "P1"
        message_template: "..."
```

---

## 10g. LTV 与复购视角（P1）

### 10g.1 概念

亚马逊不给买家信息，但能从 Subscribe & Save / Brand Analytics 获得复购信号。

### 10g.2 SKU LTV 估算

- 单买 customer 的"可能复购概率" → 估算 LTV
- 高 LTV 类目（耗材、订阅）：可容忍更高 CAC（含广告）
- 低 LTV 类目（一次性）：必须保住单笔利润

---

## 11. 数据更新策略

### 11.1 各数据更新频率

| 数据 | 频率 | 触发 |
|---|---|---|
| 订单 | 30 分钟 | 自动 |
| 库存 | 4 小时 | 自动 |
| 财务事件（销售费用） | 1 小时 | 自动 |
| 月度结算（仓储/LTS） | 月初一次 | 自动 |
| 广告 | 2 小时 | 自动 |
| 退款 | 30 分钟 | 自动 |
| 采购成本 | 用户编辑时 | 手动 |
| 利润计算 | 数据更新后异步 | 事件驱动 |
| **强制重算** | **任意时刻** | **用户点击** |

### 11.2 用户"重新计算"按钮

**位置：** 利润总览页右上角 + SKU 详情页

**行为：**
1. 触发后台任务（Temporal Workflow）
2. 步骤：
   - 重新拉取 SP-API 最新数据（如有）
   - 重新拉取 Ads API 最新数据
   - 重新执行利润计算（指定时段）
3. 进度展示：进度条 + 步骤说明
4. 完成后：刷新 UI，标"刚刚更新"

**预期时间：** 30 秒内（已优化），最差 2 分钟

### 11.3 数据延迟感知

每个数字旁有"最后更新时间" tooltip：
```
昨日净利润 ¥48,200
最后更新：5 分钟前 ｜ 最新订单：12:31
[ 刷新 ]
```

---

## 12. AI Prompt 设计

### 12.1 Prompt 列表

| ID | 用途 |
|---|---|
| P-M2-LEAK-DETECT-CONFIRM | 漏点候选复核 |
| P-M2-LEAK-RECOMMEND | 漏点修复建议 |
| P-M2-PROFIT-DROP-EXPLAIN | 利润下降归因 |
| P-M2-FORECAST-VALIDATE | 销量预测合理性复核 |
| P-M2-SLOW-MOVING-DECISION | 滞销决策 |
| P-M2-REPRICING-DECISION | 跟价决策 |
| P-M2-ANOMALY-EXPLAIN | 异常解释（订单/SKU 利润突变） |

### 12.2 P-M2-LEAK-RECOMMEND（漏点修复建议）

```
[ROLE]
You are a senior Amazon seller financial analyst. Your job is to recommend 
specific, executable actions to fix profit leaks.

[CONTEXT]
Leak Type: {leak_type}  // e.g., L3 Ad Profit Loss
Severity: {severity}
Scope: {scope_json}  // SKU, ASIN, Campaign, etc.
Evidence: {evidence_json}
  - Metric, Value, Threshold, Duration

Related Data:
  - SKU info: {sku_info}
  - Ad campaign: {campaign_info if applicable}
  - Recent profit trend: {profit_trend}
  - Cost structure: {cost_breakdown}
  
Profit Margin: {profit_margin}%
ACOS: {acos}%

[INSTRUCTION]
1. Confirm if this is a TRUE leak (vs. noise / temporary).
2. Identify ROOT CAUSE(S) with relative weight.
3. Recommend PRIMARY action (most impactful, executable).
4. Recommend 2-3 ALTERNATIVE actions (less aggressive).
5. Estimate monthly_savings for each action.
6. List risks / side effects.

[OUTPUT FORMAT]
JSON:
{
  "is_true_leak": true,
  "confidence": 0.92,
  "root_causes": [
    {"cause": "...", "weight": 0.7, "evidence": "..."}
  ],
  "primary_action": {
    "type": "pause_campaign",  // 标准枚举
    "target_id": "...",
    "details": {...},
    "estimated_monthly_saving": 4200,
    "rationale": "...",
    "risks": [...]
  },
  "alternatives": [...]
}

Action types (enum):
  - pause_campaign / reduce_bid / add_negative_keyword
  - reduce_inventory / increase_inventory / dispose
  - reprice_up / reprice_down / start_coupon
  - change_supplier / negotiate_freight
  - update_listing / fix_listing_error
  - investigate_returns / contact_buyers
```

### 12.3 P-M2-PROFIT-DROP-EXPLAIN（利润下降归因）

```
[ROLE]
You diagnose why profit dropped on Amazon. You analyze multi-factor data 
to give a clear, ranked attribution.

[CONTEXT]
Period A (baseline): {period_a_summary}
  - Sales: $X
  - Net Profit: $Y
  - Margin: Z%
  - Top Cost Items: {...}

Period B (current): {period_b_summary}
  - Sales: $X'
  - Net Profit: $Y' (Δ -15%)
  - Margin: Z'%

Per-Cost-Item Δ:
  - Referral fee: ...
  - FBA fee: ...
  - Ad spend: +30% ⚠️
  - Refund: +20% ⚠️
  - Storage: -5%
  - Cogs: 0%

Volume Δ: +5%
Price Δ: -2%

[INSTRUCTION]
Explain the drop, ranking factors by contribution. Use absolute monetary 
values. Identify if any factor is anomalous (vs. historical pattern).

[OUTPUT]
{
  "summary": "Profit dropped 15% mainly due to ad spend +30% and refund +20%.",
  "factors": [
    {"factor": "ad_spend_increase", "contribution_pct": 45, "amount": -2400, "severity": "high"},
    {"factor": "refund_rate_up", "contribution_pct": 30, "amount": -1600, "severity": "medium"},
    ...
  ],
  "anomalies": [
    {"item": "ad_spend", "is_anomalous": true, "vs_historical": "+150%"}
  ],
  "follow_up_actions": [...]
}
```

### 12.4 P-M2-FORECAST-VALIDATE（预测合理性）

```
[ROLE]
You review a sales forecast for reasonableness. You spot when the model 
is being misled by anomalies.

[CONTEXT]
SKU: {sku}
Historical 90 days: {historical_chart_summary}
Predicted next 30 days (Prophet output): {prediction}
Confidence interval: {ci}

Known Events:
  - Prime Day: 2026-07-15 (10 weeks out)
  - SKU has new ad campaign launched 3 days ago
  - Competitor B0XXX dropped price 7 days ago

[INSTRUCTION]
Evaluate if the forecast is reasonable. Flag concerns. Suggest adjustments.

[OUTPUT]
{
  "verdict": "reasonable_with_adjustments",  // reasonable / too_high / too_low
  "concerns": [
    {"issue": "Forecast doesn't account for new ad campaign launched 3 days ago", "impact": "+15-25%"},
    ...
  ],
  "suggested_adjustments": [
    {"period": "next 14 days", "adjustment_pct": +20, "reason": "..."}
  ]
}
```

---

## 13. 页面与交互设计

### 13.1 P1：利润总览（默认页）

**路径：** `/profit`

```
┌────────────────────────────────────────────────────────────┐
│ 顶栏                                                        │
│  [面包屑]  经营 / 利润中枢                                  │
│  [时间]  昨日 ▾ | 7d | 30d | 90d | 自定义                  │
│  [筛选]  店铺 ▾ | 国家 ▾                                    │
│  [操作]  [重新计算] [导出 PDF / Excel]                     │
├────────────────────────────────────────────────────────────┤
│ 顶部 KPI 卡片（横排 5 个）                                  │
│  GMV ¥XXX,XXX   净利润 ¥XX,XXX  利润率 XX.X%   订单数 XXXX │
│  退款率 X.X%                                                │
│  （每张卡含同比 / 环比箭头）                                 │
├────────────────────────────────────────────────────────────┤
│ 主图：利润趋势 + 成本结构                                   │
│  [折线图] 30 天净利润趋势（与销售双轴）                     │
│  [堆叠图] 成本结构占比（按费用项）                          │
├────────────────────────────────────────────────────────────┤
│ 漏点卡片                                                    │
│  🔴 8 个漏点 ｜ 月可省 ¥17,400                             │
│  [查看详情]                                                 │
├────────────────────────────────────────────────────────────┤
│ SKU 利润排行（前 10）                                       │
│  排名 | SKU | 销量 | 净利润 | 利润率 | 周转日                │
│  ...                                                         │
│  [查看全部 SKU]                                             │
├────────────────────────────────────────────────────────────┤
│ 国家 / 店铺利润分布                                         │
│  [饼图]                                                      │
└────────────────────────────────────────────────────────────┘
```

### 13.2 P2：单 SKU 利润详情

**路径：** `/profit/skus/[productId]`

```
┌──────────────────────────────────────────────────────┐
│ SKU 信息条                                            │
│  [缩略图] B0XXXXXXXX | Phone Case Pro | 电子配件      │
│  ASIN | 店铺 | 上架 | 评分                            │
├──────────────────────────────────────────────────────┤
│ Tab: [概览] [趋势] [费用拆解] [情景模拟]              │
├──────────────────────────────────────────────────────┤
│ 概览 Tab                                              │
│  ┌─ KPI 横排 ─┐                                      │
│  │ 30d 净利润 ¥X | 利润率 Y% | 周转 Z 天 | 库存 W   │
│  └─────────────┘                                      │
│                                                        │
│  ┌─ 利润瀑布图 ─┐                                    │
│  │ 销售 ¥X → -佣金 → -FBA → -广告 → ... → 净利润   │
│  └────────────────┘                                   │
│                                                        │
│  ┌─ 关键指标 ─┐                                       │
│  │ ACOS / 利润 ROAS / 退货率 / LTS 倒计时           │
│  └─────────────┘                                      │
│                                                        │
│  ┌─ 漏点 ─┐                                           │
│  │ 该 SKU 当前漏点 N 个，详情...                      │
│  └─────────┘                                          │
├──────────────────────────────────────────────────────┤
│ 趋势 Tab                                              │
│  [可选时间] 90 天利润 / 销量 / 价格 / ACOS 多线对比  │
│  关联事件标记（启动广告 / 改价 / 评分变化）          │
├──────────────────────────────────────────────────────┤
│ 费用拆解 Tab                                          │
│  按费用项的趋势（堆叠面积图）                         │
│  各费用项的金额 + 占比 + 历史均值对比                 │
│  异常值标红                                            │
├──────────────────────────────────────────────────────┤
│ 情景模拟 Tab（P1）                                    │
│  滑块：售价 / ACOS / 销量 / 退货率                    │
│  实时计算："假如改价 -5%，利润变 -¥X"                │
└──────────────────────────────────────────────────────┘
```

### 13.3 P3：单订单瀑布图

**路径：** `/profit/orders/[orderId]`

```
┌── Order: 123-4567890-1234567 ─────────────────────────┐
│                                                         │
│ SKU: B0XXX | 数量: 2 | 售价: $24.99/件                │
│ 订购日: 2026-05-05 | 发货: 2026-05-06 | 状态: 已结算  │
│                                                         │
│ ─── 利润瀑布图 ───                                     │
│ Sale Revenue              ¥340.00   ▓▓▓▓▓▓▓▓▓▓        │
│ - Referral Fee (15%)      ¥51.00    ▓▓                │
│ - FBA Fee                 ¥48.20    ▓▓                │
│ - Storage Allocation      ¥3.50                       │
│ - LTS Allocation          ¥0                          │
│ - Refund Provision (5%)   ¥17.00                      │
│ - Returns Processing      ¥0                          │
│ - Ad Allocation           ¥18.40    ▓                 │
│ - COGS                    ¥120.00   ▓▓▓▓              │
│ - Inbound Freight         ¥12.00                      │
│ - Customs Duty            ¥8.00                       │
│ - FX Loss                 ¥1.20                       │
│ - Capital Cost            ¥2.80                       │
│ - VAT (US 不适用)         ¥0                          │
│ ────────────────────────                              │
│ Net Profit                ¥57.90    ▓▓                │
│ Margin: 17.0%                                          │
│                                                         │
│ ⚠️ 该订单中：                                          │
│ • 广告分摊偏高（占售价 5.4%，类目均值 3%）              │
│   → 关联 Campaign：[查看]                              │
│                                                         │
│ [查看类似订单] [关联到漏点]                             │
└─────────────────────────────────────────────────────────┘
```

### 13.4 P4：广告利润视图

**路径：** `/profit/ads`

按 Campaign / Keyword 列表，显示：
- Spend
- Sales（销售口径）
- Profit（利润口径）
- Sales ROAS / Profit ROAS（双指标）
- 颜色编码：profit_roas < 1 红，1-1.5 黄，>1.5 绿

每行可点击 → 详细页：
- 该 Campaign 的关键词 / 搜索词利润分布
- 30 天趋势

### 13.5 P5：漏点中心

**路径：** `/profit/leaks`

见第 6.4 节 UI。

### 13.6 P6：补货建议

**路径：** `/inventory/reorder`

见第 7.1.4 + 7.2 节 UI。

### 13.7 P7：滞销诊断

**路径：** `/inventory/slow-moving`

见第 8.2 节 UI。

### 13.8 P8：跟价决策

**路径：** `/repricing`

列表 + 单 SKU 详情（见第 9.2 节）。

### 13.9 P9：成本配置中心

**路径：** `/costs/sku-costs`

```
┌── 成本配置 ──────────────────────────────────────┐
│                                                    │
│ [批量上传 Excel] [下载模板] [筛选未填 SKU]        │
│                                                    │
│ SKU         采购成本  头程  关税  生效日  状态    │
│ B0AAA      ¥45.00   ¥3   ¥2   2026-01  ✓        │
│ B0BBB      [估算]   [估算] [估算] -    🟠 估算   │
│ ...                                                │
│                                                    │
│ [批量编辑] [应用类目均值]                         │
└────────────────────────────────────────────────────┘
```

### 13.10 P10：导出报表

**路径：** `/reports`

- 月度利润报告（PDF）
- 季度财务汇总（PDF）
- 详细订单利润（Excel）
- 单 SKU 损益表（Excel）
- 自定义报表（P2）

---

## 14. 数据模型（DDL）

### 14.1 核心表

```sql
-- 14.1.1 财务事件原始表
CREATE TABLE financial_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id),
  
  event_type VARCHAR(50) NOT NULL,  -- 'shipment', 'refund', 'fee_adjustment', 'storage', 'lts', 'ad_spend', ...
  amazon_order_id VARCHAR(50),
  posted_at TIMESTAMP NOT NULL,
  
  amount DECIMAL(18, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  
  fee_type VARCHAR(80),
  fee_subtype VARCHAR(80),
  
  related_sku VARCHAR(50),
  related_asin VARCHAR(20),
  related_campaign_id VARCHAR(80),
  
  raw_data JSONB,
  
  ingested_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fe_tenant_posted ON financial_events(tenant_id, posted_at);
CREATE INDEX idx_fe_order ON financial_events(amazon_order_id);
CREATE INDEX idx_fe_sku_posted ON financial_events(related_sku, posted_at);
CREATE INDEX idx_fe_type ON financial_events(event_type, fee_type);
```

```sql
-- 14.1.2 SKU 成本（用户录入，含版本）
CREATE TABLE product_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  
  -- 成本组成
  cogs_per_unit DECIMAL(18, 4),      -- 采购成本（含税）
  cogs_currency VARCHAR(3) DEFAULT 'CNY',
  inbound_freight_per_unit DECIMAL(18, 4),
  customs_duty_per_unit DECIMAL(18, 4),
  packaging_per_unit DECIMAL(18, 4),
  other_per_unit DECIMAL(18, 4),
  
  -- 时段
  effective_from DATE NOT NULL,
  effective_until DATE,             -- NULL 表示当前
  
  -- 来源
  source VARCHAR(20),               -- 'manual' / 'imported' / 'estimated'
  is_estimated BOOLEAN DEFAULT FALSE,
  confidence FLOAT,                 -- 0-1
  
  -- 元数据
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  notes TEXT,
  
  CONSTRAINT idx_cost_period UNIQUE (product_id, effective_from)
);

CREATE INDEX idx_cost_product ON product_costs(product_id);
CREATE INDEX idx_cost_effective ON product_costs(effective_from, effective_until);
```

```sql
-- 14.1.3 SKU 海运/库存配置
CREATE TABLE product_logistics_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID UNIQUE NOT NULL REFERENCES products(id),
  
  shipping_lead_time_days INTEGER DEFAULT 35,  -- 海运周期
  safety_stock_days INTEGER DEFAULT 7,
  capital_cost_annual_pct FLOAT DEFAULT 0.12,
  
  -- 供应商
  primary_supplier_name VARCHAR(200),
  primary_supplier_moq INTEGER,
  
  updated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 14.1.4 订单利润（聚合后）
CREATE TABLE order_profits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  amazon_order_id VARCHAR(50) NOT NULL,
  order_item_id VARCHAR(50) NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  
  -- 时间
  ordered_at TIMESTAMP NOT NULL,
  shipped_at TIMESTAMP,
  settled_at TIMESTAMP,
  
  -- 数量与价格
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(18, 4),
  total_revenue DECIMAL(18, 4),
  
  -- 14 项成本（CNY 标准化）
  referral_fee DECIMAL(18, 4),
  fba_fee DECIMAL(18, 4),
  closing_fee DECIMAL(18, 4),
  storage_allocation DECIMAL(18, 4),
  lts_allocation DECIMAL(18, 4),
  refund_provision DECIMAL(18, 4),
  actual_refund DECIMAL(18, 4),
  ad_allocation DECIMAL(18, 4),
  cogs DECIMAL(18, 4),
  inbound_freight DECIMAL(18, 4),
  customs_duty DECIMAL(18, 4),
  fx_loss DECIMAL(18, 4),
  capital_cost DECIMAL(18, 4),
  vat DECIMAL(18, 4),
  other_costs DECIMAL(18, 4),
  
  -- 净利润（计算字段）
  net_profit DECIMAL(18, 4) GENERATED ALWAYS AS (
    total_revenue 
    - COALESCE(referral_fee, 0) 
    - COALESCE(fba_fee, 0) 
    - COALESCE(closing_fee, 0)
    - COALESCE(storage_allocation, 0)
    - COALESCE(lts_allocation, 0)
    - COALESCE(refund_provision, 0)
    - COALESCE(ad_allocation, 0)
    - COALESCE(cogs, 0)
    - COALESCE(inbound_freight, 0)
    - COALESCE(customs_duty, 0)
    - COALESCE(fx_loss, 0)
    - COALESCE(capital_cost, 0)
    - COALESCE(vat, 0)
    - COALESCE(other_costs, 0)
  ) STORED,
  
  profit_margin FLOAT GENERATED ALWAYS AS (
    CASE WHEN total_revenue > 0 
    THEN (net_profit / total_revenue) ELSE 0 END
  ) STORED,
  
  -- 精确性
  confidence_level VARCHAR(20),     -- 'precise' / 'high' / 'estimated' / 'unavailable'
  is_finalized BOOLEAN DEFAULT FALSE,  -- 月底结算后置 true
  
  -- 计算元数据
  computed_at TIMESTAMP DEFAULT NOW(),
  calculator_version VARCHAR(20),
  
  CONSTRAINT idx_op_unique UNIQUE (amazon_order_id, order_item_id)
);

CREATE INDEX idx_op_tenant_date ON order_profits(tenant_id, ordered_at);
CREATE INDEX idx_op_product_date ON order_profits(product_id, ordered_at);
```

```sql
-- 14.1.5 ClickHouse 物化视图（按日聚合）
-- 实际在 ClickHouse 中创建：

CREATE MATERIALIZED VIEW profit_daily_sku
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, product_id, date)
AS SELECT
  tenant_id,
  product_id,
  toDate(ordered_at) AS date,
  sum(total_revenue) AS revenue,
  sum(net_profit) AS net_profit,
  sum(quantity) AS units,
  sum(referral_fee) AS referral_fees,
  sum(fba_fee) AS fba_fees,
  sum(ad_allocation) AS ad_costs,
  sum(refund_provision) AS refund_provisions,
  sum(cogs) AS total_cogs,
  count() AS order_count
FROM order_profits
GROUP BY tenant_id, product_id, date;

-- 类似创建 profit_daily_campaign, profit_daily_keyword, profit_daily_store
```

```sql
-- 14.1.6 漏点
CREATE TABLE leak_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  type VARCHAR(20) NOT NULL,        -- L1, L2, L3, ...
  severity VARCHAR(20) NOT NULL,    -- low / medium / high / critical
  
  scope JSONB NOT NULL,             -- {store_id, sku, asin, campaign_id, ...}
  evidence JSONB NOT NULL,
  
  ai_analysis JSONB,
  recommendation JSONB,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',
    -- pending / accepted / rejected / auto_executed / resolved / expired
  
  -- 时间
  detected_at TIMESTAMP DEFAULT NOW(),
  user_action_at TIMESTAMP,
  resolved_at TIMESTAMP,
  
  -- 跟踪
  estimated_monthly_saving DECIMAL(18, 4),
  actual_saving DECIMAL(18, 4),     -- 30 天后跟踪
  
  -- 操作
  user_action VARCHAR(50),          -- 'accepted' / 'custom_action' / 'ignored'
  user_id UUID REFERENCES users(id),
  
  CONSTRAINT idx_leak_unique 
    UNIQUE (tenant_id, type, scope, detected_at)
);

CREATE INDEX idx_leak_tenant_status ON leak_points(tenant_id, status);
CREATE INDEX idx_leak_severity ON leak_points(severity);
```

```sql
-- 14.1.7 销量预测
CREATE TABLE inventory_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  
  forecast_date DATE NOT NULL,      -- 预测时点
  horizon_days INTEGER NOT NULL,    -- 预测多少天
  
  -- 预测值
  predicted_total INTEGER,
  predicted_p10 INTEGER,
  predicted_p50 INTEGER,
  predicted_p90 INTEGER,
  daily_predictions JSONB,          -- [{date, prediction, p10, p90}]
  
  -- 元数据
  model_name VARCHAR(50),           -- 'prophet' / 'arima' / ...
  model_version VARCHAR(20),
  features_used JSONB,
  mape_30d FLOAT,                   -- 历史 30 天预测的 MAPE
  
  computed_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 14.1.8 补货建议
CREATE TABLE reorder_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  
  current_stock INTEGER,
  inbound_stock INTEGER,
  days_remaining INTEGER,
  
  urgency VARCHAR(20),              -- low / medium / high / critical
  
  recommended_qty INTEGER,
  capital_required DECIMAL(18, 4),
  expected_revenue DECIMAL(18, 4),
  expected_profit DECIMAL(18, 4),
  payback_days INTEGER,
  
  forecast_id UUID REFERENCES inventory_forecasts(id),
  reasoning JSONB,
  
  status VARCHAR(20),               -- pending / accepted / customized / ignored
  
  generated_at TIMESTAMP DEFAULT NOW(),
  user_decision_at TIMESTAMP
);
```

```sql
-- 14.1.9 滞销决策
CREATE TABLE slow_moving_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  
  detected_at TIMESTAMP DEFAULT NOW(),
  severity VARCHAR(20),             -- early_warning / moderate / severe
  
  current_stock INTEGER,
  days_no_sale INTEGER,
  in_stock_days INTEGER,
  
  inventory_value DECIMAL(18, 4),
  monthly_storage_cost DECIMAL(18, 4),
  lts_countdown_days INTEGER,
  capital_lock_cost DECIMAL(18, 4),
  
  -- 三选项分析
  options JSONB,
    -- [{option: 'A_promotion', loss, cash_recovery, days_to_clear, recommended}]
  
  ai_recommendation VARCHAR(20),    -- 'A' / 'B' / 'C' / 'continue'
  ai_reasoning TEXT,
  
  status VARCHAR(20),
  user_choice VARCHAR(20),
  decided_at TIMESTAMP
);
```

```sql
-- 14.1.10 跟价决策
CREATE TABLE repricing_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  competitor_asin VARCHAR(20),
  
  triggered_at TIMESTAMP DEFAULT NOW(),
  triggered_by VARCHAR(50),         -- 'competitor_price_drop' / 'buy_box_loss' / 'manual'
  
  our_price DECIMAL(18, 4),
  competitor_price DECIMAL(18, 4),
  competitor_old_price DECIMAL(18, 4),
  
  break_even_price DECIMAL(18, 4),
  
  price_elasticity FLOAT,           -- 价格弹性系数
  
  scenarios JSONB,
    -- [{price, unit_profit, margin, expected_volume, expected_total_profit_30d}]
  
  ai_recommended_price DECIMAL(18, 4),
  ai_reasoning TEXT,
  
  status VARCHAR(20),
  user_chosen_price DECIMAL(18, 4),
  applied_at TIMESTAMP
);
```

```sql
-- 14.1.11 进货批次
CREATE TABLE purchase_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  
  batch_number VARCHAR(50) NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  
  ordered_at DATE,
  shipped_at DATE,
  arrived_at_port_at DATE,
  arrived_at_fba_at DATE,
  
  quantity_purchased INTEGER NOT NULL,
  quantity_remaining INTEGER NOT NULL,
  
  unit_cost DECIMAL(18, 4),
  unit_freight DECIMAL(18, 4),
  unit_customs DECIMAL(18, 4),
  unit_inspection DECIMAL(18, 4),
  unit_other DECIMAL(18, 4),
  total_unit_cost DECIMAL(18, 4) GENERATED ALWAYS AS (
    COALESCE(unit_cost, 0) + COALESCE(unit_freight, 0) +
    COALESCE(unit_customs, 0) + COALESCE(unit_inspection, 0) +
    COALESCE(unit_other, 0)
  ) STORED,
  
  currency VARCHAR(3) DEFAULT 'CNY',
  fx_rate_at_purchase FLOAT,
  
  status VARCHAR(20),               -- 'in_transit' / 'in_stock' / 'depleted'
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT idx_batch_unique UNIQUE (tenant_id, batch_number)
);

CREATE INDEX idx_batch_product_arrived ON purchase_batches(product_id, arrived_at_fba_at);
CREATE INDEX idx_batch_remaining ON purchase_batches(product_id) WHERE quantity_remaining > 0;
```

```sql
-- 14.1.12 订单与批次的匹配
CREATE TABLE order_batch_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id VARCHAR(50) NOT NULL,
  amazon_order_id VARCHAR(50) NOT NULL,
  product_id UUID NOT NULL,
  batch_id UUID NOT NULL REFERENCES purchase_batches(id),
  
  matched_qty INTEGER NOT NULL,
  unit_cost_at_match DECIMAL(18, 4) NOT NULL,
  total_cost DECIMAL(18, 4) GENERATED ALWAYS AS (matched_qty * unit_cost_at_match) STORED,
  
  match_strategy VARCHAR(10),       -- 'FIFO' / 'LIFO'
  matched_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_obm_order ON order_batch_matches(amazon_order_id, order_item_id);
```

```sql
-- 14.1.13 供应商
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  name VARCHAR(200) NOT NULL,
  contact JSONB,                    -- {name, email, phone, wechat, ...}
  
  default_currency VARCHAR(3) DEFAULT 'CNY',
  default_payment_terms VARCHAR(100),
  default_lead_time_days INTEGER,
  
  -- 评分（auto-computed）
  on_time_delivery_rate FLOAT,
  defect_rate FLOAT,
  quantity_accuracy_rate FLOAT,
  price_stability_score FLOAT,
  communication_score FLOAT,
  overall_rating FLOAT,
  
  -- 历史
  total_orders INTEGER DEFAULT 0,
  total_spend_cny DECIMAL(18, 4),
  first_order_at DATE,
  last_order_at DATE,
  
  status VARCHAR(20) DEFAULT 'active',  -- 'active' / 'paused' / 'blacklisted'
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 供应商-SKU 阶梯价
CREATE TABLE supplier_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  product_id UUID NOT NULL REFERENCES products(id),
  
  tiered_pricing JSONB,
    -- [{min_qty, max_qty, unit_price}, ...]
  moq INTEGER,
  
  effective_from DATE,
  effective_until DATE,
  
  is_primary BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 14.1.14 采购单 (PO)
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  po_number VARCHAR(50) NOT NULL UNIQUE,
  
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
    -- draft / submitted / confirmed / in_production / ready_to_ship /
    -- in_transit / at_port / customs_cleared / inbound_to_fba / received /
    -- reconciled / cancelled / disputed
  
  -- 总额
  subtotal DECIMAL(18, 4),
  freight_cost DECIMAL(18, 4),
  customs_duty DECIMAL(18, 4),
  inspection_fee DECIMAL(18, 4),
  other_costs DECIMAL(18, 4),
  total_landed_cost DECIMAL(18, 4),
  currency VARCHAR(3),
  
  -- 时间线
  created_at TIMESTAMP DEFAULT NOW(),
  submitted_at TIMESTAMP,
  confirmed_by_supplier_at TIMESTAMP,
  production_start_at DATE,
  shipped_at DATE,
  arrived_at_port_estimated DATE,
  arrived_at_port_actual DATE,
  fba_inbound_estimated DATE,
  fba_inbound_actual DATE,
  reconciled_at TIMESTAMP,
  
  -- 跟踪
  shipping_method VARCHAR(20),       -- ocean_freight / air_freight / express
  tracking_number VARCHAR(100),
  carrier VARCHAR(100),
  container_no VARCHAR(50),
  
  -- 付款
  payment_terms VARCHAR(100),
  deposit_amount DECIMAL(18, 4),
  deposit_paid_at TIMESTAMP,
  balance_amount DECIMAL(18, 4),
  balance_paid_at TIMESTAMP,
  
  -- 文档
  documents JSONB,                   -- [{type, url, uploaded_at}]
  
  -- 对账
  reconciliation JSONB,
    -- {expected_qty, received_qty, damaged_qty, missing_qty, disputed_amount}
  
  -- 关联
  source VARCHAR(50),                -- 'manual' / 'from_reorder_recommendation'
  source_id UUID,
  
  notes TEXT,
  created_by UUID REFERENCES users(id)
);

-- PO 明细
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  
  quantity INTEGER NOT NULL,
  unit_price_supplier DECIMAL(18, 4),
  subtotal DECIMAL(18, 4) GENERATED ALWAYS AS (quantity * unit_price_supplier) STORED,
  
  specifications TEXT,
  
  -- 入仓后
  received_quantity INTEGER,
  damaged_quantity INTEGER,
  
  -- 关联批次
  batch_id UUID REFERENCES purchase_batches(id)
);
```

```sql
-- 14.1.15 现金流时序
CREATE TABLE cashflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  event_type VARCHAR(50),           -- 'amazon_settlement' / 'payoneer_withdrawal' / 'po_deposit' / 'po_balance' / 'storage_fee' / 'lts_fee' / ...
  scheduled_at TIMESTAMP,
  occurred_at TIMESTAMP,
  
  amount DECIMAL(18, 4),
  currency VARCHAR(3),
  amount_cny DECIMAL(18, 4),        -- 标准化
  
  direction VARCHAR(10),            -- 'inflow' / 'outflow'
  
  related_entity_type VARCHAR(50),  -- 'order' / 'po' / 'fee_event' / ...
  related_entity_id UUID,
  
  status VARCHAR(20),               -- 'projected' / 'actual'
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cashflow_tenant_time ON cashflow_events(tenant_id, scheduled_at);
```

```sql
-- 14.1.16 跨境支付通道配置
CREATE TABLE payment_channels_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL,
  
  channels JSONB,
    -- [{name: 'payoneer', fee_pct: 0.012, fee_fixed_per_tx: 1.5, currency: 'USD'}, ...]
  
  primary_channel VARCHAR(50),
  
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 提现记录
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  channel VARCHAR(50),              -- payoneer / pingpong / wise / ...
  amount_source DECIMAL(18, 4),     -- 提现金额（源币种）
  source_currency VARCHAR(3),
  fee_amount DECIMAL(18, 4),
  amount_received DECIMAL(18, 4),   -- 实际到账
  fx_rate FLOAT,
  
  occurred_at TIMESTAMP,
  
  -- 关联
  related_amazon_settlement_ids JSONB
);
```

```sql
-- 14.1.17 自定义报警规则
CREATE TABLE custom_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  name VARCHAR(200),
  description TEXT,
  
  conditions JSONB,                 -- 条件 DSL
  actions JSONB,                    -- 通知动作
  
  is_enabled BOOLEAN DEFAULT TRUE,
  severity VARCHAR(10),             -- P0 / P1 / P2
  
  -- 触发统计
  last_triggered_at TIMESTAMP,
  trigger_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);
```

```sql
-- 14.1.18 多维度归集
CREATE TABLE product_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID UNIQUE NOT NULL REFERENCES products(id),
  
  brand_name VARCHAR(100),
  project VARCHAR(100),
  team VARCHAR(100),
  owner_user_id UUID REFERENCES users(id),
  custom_tags JSONB,
  
  updated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 14.1.19 预算
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- 范围
  scope_type VARCHAR(20),           -- 'tenant' / 'store' / 'brand' / 'team'
  scope_id VARCHAR(80),
  
  -- 时段
  period_type VARCHAR(20),          -- 'monthly' / 'quarterly' / 'annual'
  period_start DATE,
  period_end DATE,
  
  -- 预算项
  budget_revenue DECIMAL(18, 4),
  budget_profit DECIMAL(18, 4),
  budget_ad_spend DECIMAL(18, 4),
  budget_inventory_investment DECIMAL(18, 4),
  
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 14.1.20 跨仓调拨建议
CREATE TABLE inventory_transfer_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  
  from_marketplace VARCHAR(10),
  to_marketplace VARCHAR(10),
  
  transfer_qty INTEGER,
  estimated_transfer_cost DECIMAL(18, 4),
  estimated_repurchase_cost DECIMAL(18, 4),
  estimated_savings DECIMAL(18, 4),
  
  status VARCHAR(20),
  generated_at TIMESTAMP DEFAULT NOW()
);
```

### 14.2 索引策略

```sql
-- 高频查询：店铺 30 天利润趋势
CREATE INDEX idx_op_tenant_period ON order_profits(tenant_id, ordered_at DESC) 
  INCLUDE (net_profit, total_revenue);

-- 高频查询：SKU 7/30/90 天滚动
CREATE INDEX idx_op_product_period ON order_profits(product_id, ordered_at DESC);

-- 漏点活跃列表
CREATE INDEX idx_leak_active ON leak_points(tenant_id, status, severity)
  WHERE status IN ('pending', 'accepted');
```

### 14.3 ClickHouse 表设计

```sql
-- 在 ClickHouse 中
CREATE TABLE order_profits_ck
(
  tenant_id UUID,
  amazon_order_id String,
  order_item_id String,
  product_id UUID,
  ordered_at DateTime,
  date Date MATERIALIZED toDate(ordered_at),
  quantity Int32,
  total_revenue Decimal(18, 4),
  -- ... 14 项成本
  net_profit Decimal(18, 4),
  profit_margin Float32
)
ENGINE = ReplacingMergeTree(computed_at)
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, date, product_id, amazon_order_id);

-- 物化视图：日聚合
CREATE MATERIALIZED VIEW profit_daily_sku_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, product_id, date)
POPULATE
AS SELECT
  tenant_id, product_id, date,
  sum(total_revenue) AS revenue,
  sum(net_profit) AS profit,
  count() AS orders
FROM order_profits_ck
GROUP BY tenant_id, product_id, date;
```

---

## 15. API 端点规格

### 15.1 端点总览

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/profit/overview | 利润总览（KPI + 趋势） |
| GET | /api/v1/profit/skus | SKU 利润排行 |
| GET | /api/v1/profit/skus/{productId} | 单 SKU 利润详情 |
| GET | /api/v1/profit/skus/{productId}/breakdown | 费用拆解 |
| GET | /api/v1/profit/skus/{productId}/trend | 趋势数据 |
| POST | /api/v1/profit/skus/{productId}/scenario | 情景模拟 |
| GET | /api/v1/profit/orders | 订单列表 |
| GET | /api/v1/profit/orders/{orderId} | 单订单瀑布 |
| GET | /api/v1/profit/ads/campaigns | 广告活动利润 |
| GET | /api/v1/profit/ads/keywords | 关键词利润 |
| GET | /api/v1/profit/leaks | 漏点列表 |
| GET | /api/v1/profit/leaks/{leakId} | 漏点详情 |
| POST | /api/v1/profit/leaks/{leakId}/action | 漏点处置 |
| POST | /api/v1/profit/recompute | 强制重算 |
| GET | /api/v1/inventory/reorder | 补货建议列表 |
| GET | /api/v1/inventory/reorder/{recId} | 单建议详情 |
| POST | /api/v1/inventory/reorder/{recId}/accept | 采纳生成 PO |
| POST | /api/v1/inventory/reorder/po/batch | 批量生成 PO |
| GET | /api/v1/inventory/slow-moving | 滞销列表 |
| GET | /api/v1/inventory/slow-moving/{decId} | 滞销决策详情 |
| POST | /api/v1/inventory/slow-moving/{decId}/decide | 滞销选项执行 |
| GET | /api/v1/inventory/forecast/{productId} | 销量预测 |
| GET | /api/v1/repricing/decisions | 跟价决策列表 |
| POST | /api/v1/repricing/decisions | 触发跟价测算 |
| POST | /api/v1/repricing/decisions/{decId}/apply | 执行改价 |
| GET | /api/v1/costs/products | 成本配置列表 |
| PUT | /api/v1/costs/products/{productId} | 更新单 SKU 成本 |
| POST | /api/v1/costs/products/import | 批量导入 |
| GET | /api/v1/reports/monthly | 月度报告 |
| POST | /api/v1/reports/export | 自定义导出 |
| GET | /api/v1/inventory/batches | 批次列表（按 SKU） |
| GET | /api/v1/inventory/batches/{id} | 单批次详情 |
| GET | /api/v1/inventory/transfers | 跨仓调拨建议 |
| POST | /api/v1/inventory/transfers/{id}/execute | 执行调拨 |
| GET | /api/v1/suppliers | 供应商列表 |
| POST | /api/v1/suppliers | 新建供应商 |
| GET | /api/v1/suppliers/{id} | 单供应商画像 |
| PUT | /api/v1/suppliers/{id}/pricing | 更新阶梯价 |
| GET | /api/v1/suppliers/{id}/performance | 绩效评分 |
| POST | /api/v1/suppliers/recommend-allocation | 多供应商分配建议 |
| GET | /api/v1/purchase-orders | PO 列表 |
| POST | /api/v1/purchase-orders | 创建 PO |
| GET | /api/v1/purchase-orders/{id} | PO 详情 |
| PUT | /api/v1/purchase-orders/{id} | 更新 PO |
| POST | /api/v1/purchase-orders/{id}/submit | 提交给供应商 |
| POST | /api/v1/purchase-orders/{id}/transition | 状态机转换 |
| POST | /api/v1/purchase-orders/{id}/reconcile | 到货对账 |
| POST | /api/v1/purchase-orders/from-reorder | 从补货建议批量生成 |
| POST | /api/v1/purchase-orders/consolidate | 凑单优化 |
| GET | /api/v1/profit/cashflow | 现金流时序 |
| POST | /api/v1/profit/cashflow/recompute | 重算预测 |
| GET | /api/v1/profit/multi-store | 跨店铺合并 |
| GET | /api/v1/profit/by-dimension | 多维度归集 |
| POST | /api/v1/profit/scenario/single-sku | 单 SKU 模拟 |
| POST | /api/v1/profit/scenario/global | 全店模拟 |
| POST | /api/v1/capital-allocator/optimize | 资金预算优化 |
| GET | /api/v1/profit/fx | 汇率视图 |
| GET | /api/v1/profit/fx/sensitivity | 敏感度分析 |
| POST | /api/v1/profit/withdrawals | 记录提现 |
| GET | /api/v1/budgets | 预算列表 |
| POST | /api/v1/budgets | 新建预算 |
| GET | /api/v1/budgets/{id}/variance | 预算 vs 实际偏差 |
| GET | /api/v1/alerts/custom | 自定义报警规则 |
| POST | /api/v1/alerts/custom | 新建规则 |
| POST | /api/v1/alerts/custom/{id}/test | 测试规则 |
| GET | /api/v1/tax/vat | VAT 数据 |
| GET | /api/v1/tax/sales-tax | 销售税数据 |
| POST | /api/v1/tax/export | 导出税务报表 |

### 15.2 详细规格示例

#### 15.2.1 GET /api/v1/profit/overview

**请求：**
```
GET /api/v1/profit/overview?range=30d&store_id=&country=
Authorization: Bearer <token>
```

**响应：**
```json
{
  "range": {
    "from": "2026-04-08",
    "to": "2026-05-07",
    "days": 30
  },
  "kpis": {
    "gmv": 2_485_000.00,
    "gmv_change_pct": 0.082,
    "net_profit": 412_300.00,
    "net_profit_change_pct": 0.124,
    "profit_margin": 0.166,
    "profit_margin_change_pct": 0.038,
    "order_count": 8421,
    "refund_rate": 0.058,
    "currency": "CNY"
  },
  "trend": {
    "dates": ["2026-04-08", ...],
    "revenue": [82000, ...],
    "profit": [13500, ...],
    "orders": [280, ...]
  },
  "cost_structure": {
    "referral_fee": 372750,
    "fba_fee": 198800,
    "ad_spend": 175000,
    "cogs": 850000,
    "...": "..."
  },
  "leak_summary": {
    "active_count": 8,
    "estimated_monthly_saving": 17400
  },
  "metadata": {
    "computed_at": "2026-05-07T10:00:00Z",
    "confidence_level": "high"
  }
}
```

#### 15.2.2 POST /api/v1/profit/recompute

**请求：**
```json
{
  "scope": {
    "type": "tenant",  // 'tenant' / 'store' / 'sku' / 'order'
    "id": null
  },
  "range": {
    "from": "2026-04-01",
    "to": "2026-05-07"
  }
}
```

**响应：**
```json
{
  "task_id": "uuid",
  "estimated_seconds": 30,
  "poll_url": "/api/v1/tasks/{task_id}"
}
```

#### 15.2.3 POST /api/v1/profit/leaks/{leakId}/action

**请求：**
```json
{
  "action": "accept_primary",
  // or "accept_alternative", "ignore", "custom"
  "alternative_id": null,
  "custom_action": null,
  "notes": "Tried this last week, worked"
}
```

**响应：**
```json
{
  "leak_id": "uuid",
  "new_status": "auto_executed",
  "executed_action": {
    "type": "pause_campaign",
    "amazon_response": {...}
  },
  "tracking_starts_at": "2026-05-07T10:30:00Z",
  "tracking_ends_at": "2026-06-06T10:30:00Z"
}
```

#### 15.2.4 GET /api/v1/inventory/reorder

**请求：**
```
GET /api/v1/inventory/reorder?urgency=critical,high&store_id=
```

**响应：**
```json
{
  "summary": {
    "critical_count": 4,
    "high_count": 8,
    "medium_count": 12,
    "total_capital_required": 690000
  },
  "items": [
    {
      "rec_id": "uuid",
      "product_id": "uuid",
      "asin": "B0XXXXXXXX",
      "title": "Phone Case Pro",
      "current_stock": 245,
      "days_remaining": 20,
      "urgency": "critical",
      "recommended_qty": 600,
      "capital_required": 48000,
      "expected_profit": 48000,
      "payback_days": 52,
      "reasoning": "..."
    },
    ...
  ]
}
```

### 15.3 错误码

| 码 | 含义 | HTTP |
|---|---|---|
| M2_NO_FINANCIAL_DATA | 财务数据未同步 | 503 |
| M2_COSTS_MISSING | 关键成本缺失 | 422 |
| M2_RECOMPUTE_BUSY | 已有重算任务 | 429 |
| M2_FORECAST_INSUFFICIENT_HISTORY | 历史 < 30 天，无法预测 | 422 |
| M2_AMAZON_PRICE_FAILED | 改价失败 | 502 |
| M2_REMOVAL_ORDER_FAILED | 移除订单创建失败 | 502 |
| M2_PO_INVALID_STATE | PO 当前状态不允许此操作 | 422 |
| M2_PO_RECONCILE_MISMATCH | 到货数量与预期不符（争议） | 422 |
| M2_BATCH_INSUFFICIENT | 批次余量不够匹配订单 | 422 |
| M2_SUPPLIER_INACTIVE | 供应商已停用 | 422 |
| M2_BUDGET_INSUFFICIENT | 预算不足 | 422 |
| M2_FX_RATE_UNAVAILABLE | 汇率数据不可用 | 503 |

---

## 16. 业务规则

### 16.1 利润计算规则

1. **币种统一**：所有利润标准化到租户基础货币（默认 CNY）
2. **汇率取值**：用 SP-API 提供的当日汇率，结汇后修正
3. **退款预提**：使用最近 90 天历史退款率，新 SKU 用类目均值
4. **广告分摊**：按 SKU 当日（销售/广告费比例）
5. **仓储分摊**：月报到达前用上月单订单分摊估算
6. **数据精确度**：标记 4 个 level（precise / high / estimated / unavailable）
7. **时间口径**：以"订单日"为口径（非"发货日"或"结算日"）

### 16.2 漏点检测规则

1. **去重**：同一漏点（type + scope）24 小时内只触发一次
2. **过期**：漏点 30 天未处理 → 自动 'expired'
3. **复发**：处理后再次触发 → 新建 leak 记录，关联前次
4. **静音**：用户可对某 SKU + 某类型漏点设置 30 天静音

### 16.3 补货决策规则

1. **唯一性**：每个 SKU 当前仅 1 个 active 补货建议
2. **更新**：用户操作后建议更新（采纳/customized/ignored）
3. **历史保留**：所有建议保留 90 天用于复盘
4. **单 SKU 上限**：建议补货量不超过 365 天预测销量

### 16.4 成本数据规则

1. **缺失处理**：核心成本（cogs）缺失时用类目均值，标置信度
2. **版本化**：成本变更生成新版本，按订单日期匹配
3. **生效**：effective_from <= 订单日 < effective_until
4. **批量上传校验**：Excel 上传时校验字段合法性，错误高亮

---

## 17. 边界条件与异常

### 17.1 数据缺失

| 缺失 | 处理 |
|---|---|
| 采购成本 | 用类目均值，UI 标 🟠 估算 |
| 头程运费 | 按体积估算 |
| 海运周期 | 默认 35 天 |
| 退货率历史 | 用类目均值 |
| 广告费 | 按 0 计算（提示用户授权 Ads API） |
| 月度仓储 | 用上月分摊估算 |

### 17.2 数据冲突

| 冲突 | 处理 |
|---|---|
| 用户后期填了成本，已有订单怎么办 | 重算受影响时段订单 |
| 月度结算修正历史费用 | 重算并更新，UI 显示"已修正" |
| 退款发生（已结算订单） | 单订单利润动态更新 |
| 汇率结算损益 | 按结算月归集，分摊到该月订单 |

### 17.3 极端规模

| 情况 | 处理 |
|---|---|
| 单店日订单 > 1 万 | 异步批处理 + 进度展示 |
| SKU 数 > 5000 | 列表分页 + 索引优化 |
| 时间范围 > 1 年 | 强制走 ClickHouse + 限制返回粒度 |
| 并发"重新计算" | 队列串行化（同租户） |

### 17.4 用户操作异常

| 情况 | 处理 |
|---|---|
| 重算时用户改成本 | 任务取消 + 用户可重新触发 |
| 应用改价时网络失败 | 重试 3 次 + 失败通知 |
| 移除订单创建失败 | 保留草稿 + 显示错误 |
| 多人同时操作同一漏点 | 乐观锁，第二者收冲突 |

---

## 18. 与其他模块集成

### 18.1 接收

| 来源 | 数据 | 用途 |
|---|---|---|
| 数据底座 | 订单、库存、财务、广告 | 利润核算 |
| 用户录入 | 成本、海运周期、安全库存 | 利润核算 |
| M3 广告 | 广告投放变化、ACOS 趋势 | 利润影响 |
| M4A 异常 | 销量异常、库存异常 | 触发漏点检测 |
| M4B Review | 退货归因 | 漏点根因 |
| M4C 竞品 | 竞品价格变化 | 跟价决策 |

### 18.2 输出

| 目标 | 数据 | 用途 |
|---|---|---|
| Dashboard | KPI、漏点 | 卡片显示 |
| M3 广告 | 利润 ROAS、保本 ACOS | 广告决策 |
| M4A 监控 | 价格倒挂、利润异常 | 监控告警 |
| 通知中心 | 漏点、补货、滞销 | 推送 |

### 18.3 跨模块事件

```yaml
M2 触发：
  - 利润 ROAS < 1 持续 3 天 → 创建 L3 漏点 + 通知 M3
  - 价格倒挂 → 创建 L6 漏点（极高） + 通知 M4A
  - 库存即将断货 → 创建 reorder rec + 通知用户
  - 滞销诊断成立 → 创建 slow_moving + 通知用户

M2 接收：
  - M4 检测销量异常 → 重新计算受影响时段
  - M4C 竞品降价 → 触发跟价测算
  - M3 广告大幅调整 → 重新计算广告分摊
  - 用户改成本 → 重算受影响订单
```

---

## 19. 验收测试用例

### 19.1 利润核算精确度

| TC | 用例 | 预期 |
|---|---|---|
| TC-M2-001 | 用 1 个月真实店铺数据 vs Amazon 月度结算单 | 误差 ≤ ±2% |
| TC-M2-002 | 单订单 14 项费用归集完整 | 100% 项目齐全 |
| TC-M2-003 | 多币种订单（US + UK + DE） | 自动汇率换算正确 |
| TC-M2-004 | 退款发生后利润动态更新 | 1 小时内 |
| TC-M2-005 | 月报到达后修正前期估算 | 自动修正 |

### 19.2 漏点检测

| TC | 用例 | 预期 |
|---|---|---|
| TC-M2-006 | 12 类漏点逐个触发场景 | 全部召回 |
| TC-M2-007 | 误报率（已知非漏点情况） | ≤ 10% |
| TC-M2-008 | 漏点修复后 30 天跟踪 | 实际 vs 估算误差 ≤ 30% |
| TC-M2-009 | 漏点静音 | 静音期不再触发 |

### 19.3 库存决策

| TC | 用例 | 预期 |
|---|---|---|
| TC-M2-010 | 销量预测 30 天 MAPE | ≤ 20% |
| TC-M2-011 | 补货建议合理性（人工抽查 50 个 SKU） | ≥ 85% 合理 |
| TC-M2-012 | 滞销三选项金额测算 | 与人工核算一致 |
| TC-M2-013 | 季节性 SKU 预测（Prime Day 前） | 含活动峰值 |

### 19.4 跟价决策

| TC | 用例 | 预期 |
|---|---|---|
| TC-M2-014 | 跟价测算价格-利润曲线 | 计算正确 |
| TC-M2-015 | 价格弹性预测 vs 实际销量变化 | MAPE ≤ 25% |

### 19.5 性能

| TC | 用例 | 目标 |
|---|---|---|
| TC-M2-P1 | 总览页加载（30 天数据） | < 1.5s |
| TC-M2-P2 | SKU 详情加载 | < 1s |
| TC-M2-P3 | "重新计算"完成 | < 30s（30 天数据） |
| TC-M2-P4 | 1000 SKU 列表加载 | < 2s |
| TC-M2-P5 | 100 并发 API 调用 | 错误率 < 1% |

### 19.6 端到端业务验证

| TC | 用例 | 验证 |
|---|---|---|
| TC-M2-E2E-1 | 真实店铺连接 + 30 天数据 | 数字与 Amazon 一致（±2%） |
| TC-M2-E2E-2 | 12 类漏点真实触发 + 处理 + 跟踪 | 全流程闭环 |
| TC-M2-E2E-3 | 5 个 SKU 补货建议 + 执行 + 60 天后效果 | 减少断货且不积压 |
| TC-M2-E2E-4 | 3 个滞销 SKU + 决策执行 + 释放现金 | 实际现金流改善 |
| TC-M2-E2E-5 | 跟价决策应用后 30 天利润对比 | 利润最大化方案确实最优 |
| TC-M2-E2E-6 | PO 完整生命周期（创建 → 入仓 → 对账） | 状态机正确、批次自动生成 |
| TC-M2-E2E-7 | FIFO 批次匹配 100 笔订单 | 单订单成本与批次单价一致 |
| TC-M2-E2E-8 | 多供应商分配建议执行后 90 天 | 总成本符合 AI 预期（±5%） |
| TC-M2-E2E-9 | 凑单优化采纳后实际运费节省 | 与 AI 估算误差 ≤ 10% |
| TC-M2-E2E-10 | 资金预算优化器分配后 30 日利润 | 预测精度（MAPE ≤ 15%） |
| TC-M2-E2E-11 | 现金流预测 90 天 vs 实际 | 总额误差 ≤ 5% |
| TC-M2-E2E-12 | 跨店铺合并视图 5 个店铺 | 数字加和与各店一致 |
| TC-M2-E2E-13 | 自定义报警规则触发 | 100% 按规则触发 |

---

## 20. 性能与扩展

### 20.1 性能目标

| 操作 | P95 目标 |
|---|---|
| 总览页加载 | < 1.5s |
| SKU 详情加载 | < 1s |
| 订单瀑布加载 | < 500ms |
| 重算（30 天） | < 30s |
| 重算（90 天） | < 2 分钟 |
| 重算（24 月） | < 10 分钟（异步） |
| 漏点列表 | < 500ms |
| 补货建议加载 | < 1s |

### 20.2 ClickHouse 优化

- 物化视图按日 / 周 / 月预聚合
- 按 tenant_id 分片
- 冷数据（> 6 月）压缩 + 移到归档分区

### 20.3 PostgreSQL 优化

- order_profits 按月分区（pg_partman）
- financial_events 按月分区
- 慢查询监控（pg_stat_statements）
- 连接池（PgBouncer）

### 20.4 缓存策略

| 数据 | 缓存 | TTL |
|---|---|---|
| 总览 KPI | Redis | 10 分钟 |
| SKU 详情 | Redis | 30 分钟 |
| 漏点列表 | Redis | 5 分钟 |
| 销量预测 | DB（每日重算） | 1 天 |
| 补货建议 | DB | 1 天 |

### 20.5 并发处理

- 重算任务：同租户同时只 1 个，队列串行
- 跨租户：可并行（Worker pool）
- ClickHouse 查询：连接池

### 20.6 成本估算

每个中卖（30 SKU、月 1000 订单）月度后端成本：
- ClickHouse 存储 + 查询：~$10
- LLM 调用（漏点 + 决策）：~$5-15
- 第三方数据：~$5-20
- **合计 $20-45**，对应套餐价 ¥999/月，毛利充裕

---

## 21. 实施 Checklist

开始 M2 开发前必须完成：

- [ ] 数据底座：products / orders / order_items / inventory / financial_events 表
- [ ] SP-API 接入：Orders / Inventory / Reports / Finance
- [ ] Ads API 接入：Reports
- [ ] AI 决策引擎：Prompt 调用与解析
- [ ] ClickHouse：表 + 物化视图
- [ ] 类目均值数据：成本估算用

M2 开发顺序建议：

1. 数据 ETL（订单 / 财务 / 广告 / 库存）
2. 单订单利润计算引擎（核心）
3. SKU / Campaign 聚合（ClickHouse 物化视图）
4. 总览页 + SKU 详情页（前端）
5. 漏点检测 12 类（规则 + AI）
6. 漏点中心 UI
7. 销量预测引擎
8. 补货建议 + 滞销诊断
9. 跟价决策
10. 成本配置中心 + 批量上传
11. 报表导出
12. 全自动模式护栏
13. 5 轮自迭代质量门禁

---

> **本文档是 M2 模块的开发圣经。任何代码、测试、UI 必须以此为准。**
