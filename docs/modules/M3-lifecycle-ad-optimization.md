# M3：生命周期广告优化 — 详细设计

> **状态**：开发就绪规格
> **版本**：v1.0
> **最后更新**：2026-05-07
> **依赖**：数据底座、AI 决策引擎、Ads API、SP-API（业务报告）、M2（利润口径）

---

## 目录

- [1. 模块概述](#1-模块概述)
- [2. 用户场景](#2-用户场景)
- [3. 用户故事](#3-用户故事)
- [4. 信息架构](#4-信息架构)
- [5. 生命周期识别系统](#5-生命周期识别系统)
- [6. 各阶段策略库](#6-各阶段策略库)
- [7. 操作建议引擎](#7-操作建议引擎)
- [8. 自动执行护栏](#8-自动执行护栏)
- [9. AI Prompt 设计](#9-ai-prompt-设计)
- [10. 页面与交互设计](#10-页面与交互设计)
- [11. 数据模型（DDL）](#11-数据模型ddl)
- [12. API 端点规格](#12-api-端点规格)
- [13. 业务规则](#13-业务规则)
- [14. 边界条件与异常](#14-边界条件与异常)
- [15. 与其他模块集成](#15-与其他模块集成)
- [16. 验收测试用例](#16-验收测试用例)
- [17. 性能与扩展](#17-性能与扩展)

---

## 1. 模块概述

### 1.1 价值主张

> **AI 不只优化广告，它先判断这个 SKU 现在在生命周期哪一阶段，再用对应阶段该用的策略。把"AI 当真正的操盘手"，而不是"无脑批量调整工具"。**

### 1.1a M2/M3 循环依赖与求解顺序（关键架构）

> M3 用 M2 的"利润 ROAS"做决策，但 M2 利润含 M3 广告分摊。**双口径并存**避免循环：

| 阶段 | M2 输出 | M3 用 |
|---|---|---|
| 1. 基础口径 | 销售 ROAS（粗算） | 粗判生命周期、生成紧急建议 |
| 2. 精确口径 | 利润 ROAS（含 M3 关键词归因） | 覆盖建议优先级、决定自动暂停 |
| 3. 迭代收敛 | 新广告执行后 1h 重算 | 最多 3 次迭代防抖 |

**UI 始终展示销售 ROAS + 利润 ROAS 双指标**：销售高但利润低 → 黄色"看似在赚"标记。

详细见 M2 §5.2a。

### 1.2 核心特性

| 特性 | 描述 |
|---|---|
| 周期智能识别 | 4 阶段自动识别（新品/成长/成熟/衰退）|
| 策略库 | 每阶段 5-12 条专属策略 |
| 利润口径 | 默认按 M2 利润 ROAS 而非销售 ROAS 评估 |
| 操作清单 | 每日生成可执行清单，按优先级排序 |
| 一键 + 全自动 | 半自动一键批量、全自动按规则护栏 |
| 阶段切换提醒 | 切换瞬间主动提醒"你需要做 X" |
| 推理可见 | 每条建议附完整推理链 |
| 多层级管理 | 店铺 / Campaign / 广告组 / 关键词 / Search Term |
| 时段优化 | 按小时调整出价（活跃时段加成） |
| 位置优化 | 搜索结果首页 / 详情页 / 其他位置分别 bid |
| **结构健康** | **Campaign / AdGroup / Keyword 数量比 + 健康分** |
| **预算分配优化** | **整体预算在多 Campaign 间智能分配** |
| **品牌防御 / 攻击** | **品牌词防御 + 竞品 ASIN 攻击 SD 策略** |
| **创意管理** | **SB Headline/Logo/副图 + SD 创意 A/B** |
| **关键词排名追踪** | **核心关键词的有机 + 广告排名跟踪** |
| **库存联动** | **断货预警自动暂停广告** |
| **预算耗尽预测** | **每日 / 当月预算耗尽时点预测** |
| **促销联动** | **Coupon / Deal / LD 与广告协同** |
| **多变体共享 Campaign** | **变体级利润分摊与归因** |
| **节日 / 活动备战** | **Prime Day / 黑五 / Q4 专属阶段策略** |
| **Search Query Performance** | **接入新 Brand Analytics 数据** |

### 1.3 不做的事

- ❌ 不做 DSP（亚马逊需求方平台），太复杂留 V2
- ❌ 不做 OTT 视频广告
- ❌ 不做亚马逊外部流量（社媒广告）
- ❌ 仅 SP / SB / SD 三类广告

> ✅ **关键词排名追踪**已纳入本模块（见 §7.6h），与 M4 监控的"核心词掉首页"异常协同：M3 负责采集和趋势可视，M4 负责异常预警。

---

## 2. 用户场景

### 2.1 场景清单

| # | 场景 | 触发 | 频率 |
|---|---|---|---|
| **S1** | 早晨拿当日操作清单 | 每日 8:00 推送 | 每日 |
| **S2** | 新品上架启动广告 | 新品创建 | 每月 1-5 次 |
| **S3** | SKU 进入成长期，转手动 | 周期切换事件 | 不定期 |
| **S4** | 成熟期 ACOS 上升，优化 | 异常报警 | 每月 5-10 次 |
| **S5** | 衰退期清库 + 广告策略调整 | 季节末 / 替代品出现 | 季度 |
| **S6** | 单 Campaign 利润亏损排查 | M2 漏点推送 | 不定期 |
| **S7** | 关键词突然涨价（CPC 飙升） | 异常监测 | 不定期 |
| **S8** | Prime Day / 黑五前预算扩张 | 活动前 2 周 | 季度 |
| **S9** | 投后 30 天复盘 | 月底 | 月度 |
| **S10** | 批量否定关键词清理 | 季度 | 季度 |
| **S11** | 新关键词扩展（搜索词报告） | 周/双周 | 周度 |
| **S12** | 竞品广告位变化跟进 | M4C 推送 | 不定期 |

### 2.2 场景 → 入口映射

| 场景 | 入口 |
|---|---|
| S1 | Dashboard 操作清单 / M3 操作清单页 |
| S2 | M3 → "新 SKU 启动广告"向导 |
| S3 | 周期切换通知 → "立即应用建议" |
| S4 | M3 → 异常 Campaign 列表 |
| S5 | M3 → 衰退期 SKU 列表 |
| S6 | M2 漏点详情 → "进入广告优化" |
| S7 | M4A 异常通知 → "查看 Campaign" |
| S8 | M3 → "活动备战" 入口 |
| S9 | M3 → "复盘报告" |
| S10 | M3 → "否词管理" |
| S11 | M3 → "搜索词报告 → 关键词扩展" |
| S12 | M4C → "广告位响应" |

---

## 3. 用户故事

### 3.1 P0（MVP 必须）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M3-001 | 作为运营，我希望系统自动识别每个 SKU 当前处于哪个生命周期阶段 | 4 阶段全覆盖 |
| US-M3-002 | 作为运营，我希望可以手动覆盖 AI 的阶段判断 | 覆盖后所有策略适配 |
| US-M3-003 | 作为运营，我希望每天看到一份"今日广告操作清单" | 高/中/低优先级排序 |
| US-M3-004 | 作为运营，我希望每条建议都附"为什么"的推理 | 可展开查看依据 |
| US-M3-005 | 作为运营，我希望对建议能"采纳/拒绝/批量执行" | 一键操作 |
| US-M3-006 | 作为运营，我希望系统按"利润 ROAS"评估广告，而不仅是销售 ROAS | 双指标显示 |
| US-M3-007 | 作为运营，我希望阶段切换时收到提醒 | 切换 7 天内提醒 |
| US-M3-008 | 作为运营，我希望对每个 Campaign 看到所属阶段的策略目标和容忍 KPI | 直观可见 |
| US-M3-009 | 作为运营，我希望否词管理高效（建议+一键执行） | 30 天 0 转化词识别准确 |
| US-M3-010 | 作为运营，我希望从搜索词报告自动找到"该转手动的关键词" | 推荐准确度 ≥ 80% |
| US-M3-011 | 作为运营，我希望执行一个建议后能跟踪 7-14 天的效果 | 效果显示 |
| US-M3-012 | 作为运营，我希望按时段调整出价（白天/夜晚） | dayparting 可配 |
| US-M3-013 | 作为运营，我希望按位置（首页/详情页）调整 bid | 位置加成可配 |
| US-M3-014 | 作为运营，我希望品牌词防御自动化 | 品牌词 bid 维持 |
| US-M3-015 | 作为运营，我希望对广告活动可标"暂不优化"（如新品保护期） | 标记后系统不推荐 |

### 3.2 P1（增强）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M3-016 | 作为运营，我希望对低 ACOS 关键词自动加预算 | 阈值可配，自动执行 |
| US-M3-017 | 作为运营，我希望对高 ACOS 关键词自动降价 | 阈值可配，自动执行 |
| US-M3-018 | 作为运营，我希望 Prime Day 前 2 周收到"备战"建议 | 包含预算扩张、关键词加投 |
| US-M3-019 | 作为运营，我希望商品定位（PT）建议（攻击哪些竞品 ASIN） | 推荐头部竞品 |
| US-M3-020 | 作为运营，我希望 SB 品牌广告启动建议 | 时机判断准确 |
| US-M3-021 | 作为运营，我希望系统识别"无效的自动广告"（应转手动了） | 30 天后建议转 |
| US-M3-022 | 作为运营，我希望搜索词报告中的高转化长尾词自动加到手动 | 一键执行 |
| US-M3-023 | 作为运营，我希望对 ACOS 趋势 7/30 天滚动可视 | 折线图 |
| US-M3-024 | 作为运营，我希望对每个 Campaign 看到"距离阶段目标的差距" | 差距可视 |
| US-M3-025 | 作为运营，我希望全自动模式下能配置安全阈值（出价变化 ±%） | 阈值可配 |
| US-M3-026 | 作为运营，我希望批量调整时可以预览所有变化再确认 | 预览页 |
| US-M3-027 | 作为运营，我希望对预算可视化（已用/剩余/将耗尽时间） | 实时显示 |

### 3.3 P2（高级 / 大卖）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M3-028 | 作为大卖，我希望按品牌 / 项目分别管理预算 | 多预算池 |
| US-M3-029 | 作为大卖，我希望按运营人员分配 SKU 的广告管理权 | 权限粒度 |
| US-M3-030 | 作为大卖，我希望自定义策略规则（如"夜晚 -30% bid"） | 规则引擎 |
| US-M3-031 | 作为运营，我希望对每个 Campaign 设置"投放结构"健康分（活动/广告组/关键词数量比） | 健康分可视 |
| US-M3-032 | 作为运营，我希望多变体共用 Campaign 时按变体级利润分摊 | 分摊准确 |

### 3.4 新增（深度补充）

| ID | 用户故事 | 验收 |
|---|---|---|
| US-M3-033 | 作为运营，我希望系统给"投放结构健康分"（Campaign / AdGroup / Keyword 数量比合理） | 健康分百分制 |
| US-M3-034 | 作为运营，我希望整体预算在多 Campaign 间智能分配（边际收益最大化） | 自动调度 |
| US-M3-035 | 作为运营，我希望搜索词转手动时 AI 给"用 broad / phrase / exact"建议 | 匹配方式选择 |
| US-M3-036 | 作为运营，我希望否词分多层级（Campaign / AdGroup / 全局） | 多级否词 |
| US-M3-037 | 作为运营，我希望品牌词防御策略可配置（出价上限 / 占位策略 / SD 攻击） | 完整防御 |
| US-M3-038 | 作为运营，我希望 SB / SD 创意 A/B（Headline / Logo / 副图 / 视频） | 创意 A/B |
| US-M3-039 | 作为运营，我希望核心关键词的"有机 + 广告"排名追踪 | 双轨追踪 |
| US-M3-040 | 作为运营，我希望库存即将断货时 AI 自动暂停或降低广告（避免浪费） | 联动 M2 |
| US-M3-041 | 作为运营，我希望预算耗尽预测（如"今日预算 13:30 将耗尽"） | 时点预测 |
| US-M3-042 | 作为运营，我希望 Coupon / Lightning Deal 期间的广告协同策略（加预算/换关键词） | 促销联动 |
| US-M3-043 | 作为运营，我希望对每个 Campaign 看到"流量来源"（搜索 / 详情页 / 同类 / 关联） | 流量画像 |
| US-M3-044 | 作为运营，我希望接入 Brand Analytics 的 Search Query Performance 数据 | SQP 集成 |
| US-M3-045 | 作为运营，我希望节日 / 活动备战策略（Prime Day / 黑五） | 备战包 |
| US-M3-046 | 作为运营，我希望对竞品 ASIN 攻击的 SD / SP Product Targeting 策略库 | 攻击策略 |
| US-M3-047 | 作为运营，我希望分时段策略支持周内不同（周末 vs 工作日） | 7 天 × 24 小时 |
| US-M3-048 | 作为运营，我希望对每个 Campaign 看 "Search Term Impression Share" | 曝光占比 |
| US-M3-049 | 作为运营，我希望"否词清理"建议（移除已不必要的否词，扩大流量） | 双向否词管理 |
| US-M3-050 | 作为运营，我希望对 ASIN 定向（PT）和关键词定向的预算自动平衡 | 双向平衡 |
| US-M3-051 | 作为运营，我希望多变体（父子）共用 Campaign 时变体级 ROAS 归因 | 变体级归因 |
| US-M3-052 | 作为运营，我希望地理定位（按州/城市）的差异化出价（仅 SD 支持） | 地理出价 |
| US-M3-053 | 作为运营，我希望对失效 Campaign 自动归档（连续 30 天 0 spend） | 自动归档 |
| US-M3-054 | 作为大卖，我希望多预算池（按品牌 / 项目分配预算） | 多预算池 |

---

## 4. 信息架构

### 4.1 页面树

```
M3 广告优化
├ /ads                                    操作清单（默认页）
│  ├ ?priority=high|all
│  └ ?status=pending|executed|expired
├ /ads/skus                              SKU 视图（按 SKU 看广告状况）
│  └ /[productId]                       单 SKU 广告详情
├ /ads/campaigns                         Campaign 列表
│  └ /[campaignId]                      Campaign 详情
├ /ads/lifecycle                         周期管理
│  ├ /new                                新品期 SKU
│  ├ /growth                             成长期 SKU
│  ├ /mature                             成熟期 SKU
│  └ /declining                          衰退期 SKU
├ /ads/keywords                          关键词管理
│  ├ /search-terms                       搜索词报告
│  └ /negatives                          否词管理
├ /ads/dayparting                        分时段策略
├ /ads/placements                        位置策略
├ /ads/rules                             自定义规则（P2）
├ /ads/event-prep                        活动备战（Prime Day/黑五）
├ /ads/structure-health                  投放结构健康分（新）
├ /ads/budget-allocator                  整体预算分配优化（新）
├ /ads/budget-forecast                   预算耗尽预测（新）
├ /ads/brand-defense                     品牌词防御策略（新）
├ /ads/competitor-attack                 竞品 ASIN 攻击（新）
├ /ads/creatives                         创意管理（SB Headline/Logo/视频）（新）
│  ├ /list
│  └ /ab-tests                           创意 A/B
├ /ads/keyword-rankings                  关键词排名追踪（新）
├ /ads/sqp                               Search Query Performance（新）
├ /ads/inventory-link                    库存联动（断货保护）（新）
├ /ads/promo-sync                        促销联动（Coupon / LD）（新）
├ /ads/geo                               地理定位（新）
└ /ads/reports                           报告
```

### 4.2 主导航位置

```
左侧导航 → 「优化」 →
  ├ Listing 优化（M1）
  └ 广告优化（M3）
```

---

## 5. 生命周期识别系统

### 5.1 四阶段定义

| 阶段 | 别名 | 典型特征 |
|---|---|---|
| **新品期** | Launch / Infancy | 刚上架，数据少，需起量 + 拿评论 |
| **成长期** | Growth | 销量上升，评论积累，需扩规模 |
| **成熟期** | Maturity | 销量稳定，评论 ≥ 100，守排名 + 利润 |
| **衰退期** | Decline | 销量下滑，需清库 + 减投入 |

### 5.2 自动识别信号（规则 + AI）

#### 5.2.1 主要信号

| 信号 | 数据来源 | 用途 |
|---|---|---|
| 上架时长 | products.launched_at | 区分新品 vs 其他 |
| 评论数 | reviews count | 区分新品 vs 成长 |
| 销量曲线 | order_profits 聚合 | 判断趋势（上升/平稳/下滑）|
| BSR 趋势 | competitor_snapshots（自家也存）| 印证销量趋势 |
| 转化率 | sessions / orders | 健康度 |
| 库存周转 | inventory | 衰退期信号（高库存+低销量）|
| 替代品 | M4C 类目监控 | 衰退期触发 |

#### 5.2.2 规则引擎（初判）

```python
def initial_stage(sku):
    days_listed = (today - sku.launched_at).days
    review_count = sku.review_count
    sales_trend = analyze_sales_trend(sku, days=28)  # 4 周
    bsr_trend = analyze_bsr_trend(sku, days=28)
    
    # 新品期
    if days_listed < 90 or review_count < 30:
        return "launch"
    
    # 衰退期
    if sales_trend.direction == "declining_strong" and bsr_trend.direction == "declining":
        return "decline"
    if sku.in_stock_days > 90 and sales_trend.last_30d < sales_trend.prev_30d * 0.7:
        return "decline"
    
    # 成熟期
    if sales_trend.direction == "stable" and review_count >= 100:
        return "mature"
    
    # 成长期
    if sales_trend.direction == "rising" and review_count >= 30:
        return "growth"
    
    # 兜底
    return "growth"
```

#### 5.2.3 AI 复核（关键边界）

规则给出标签后，调用 LLM 复核（特别是边界情况）：

```
[ROLE] You are an expert in Amazon SKU lifecycle classification.

[CONTEXT]
SKU: {sku_id}, Launched: {date}, Days: {days}, Reviews: {count}
Sales trend (28 days): {chart_summary}
BSR trend: {chart_summary}
CVR: {cvr}, Category avg CVR: {cat_cvr}
Initial rule-based label: {label}

[INSTRUCTION]
Confirm or override the lifecycle stage. Consider:
1. Is the data noisy (recent ad change, holiday)?
2. Does the trend continue or revert?
3. Is there a hidden signal (competitor entry, season)?

[OUTPUT]
{
  "confirmed_stage": "growth",  // launch / growth / mature / decline
  "confidence": 0.85,
  "reasoning": "...",
  "warnings": [...]
}
```

#### 5.2.4 阶段切换检测（含迟滞机制 hysteresis）

每天对所有 SKU 重新评估：
- 标签变化 → 创建 `lifecycle_transition` 事件
- 通知用户 + 推送本阶段策略包

> ⚠️ **迟滞机制（防抖动）**：销量曲线波动可能导致频繁来回切换，影响策略稳定性。

| 切换方向 | 迟滞规则 |
|---|---|
| **新品 → 成长** | 进入后**至少 21 天**不能退回；除非评论数大量减少（如 Vine 取消） |
| **成长 → 成熟** | 进入后**至少 30 天**不能退回；除非销量连续 4 周下降 |
| **成熟 → 衰退** | 仅在销量 4 周连续下降 + 库存周转 > 90 天 同时满足 |
| **任意 → 衰退** | 单方向，进入衰退后回升需"成长期信号" 21 天才能升回成长 |
| **手动覆盖** | 14 天内不会被自动评估覆盖（用户优先） |

#### 5.2.5 用户手动覆盖

- 用户可点"修改阶段" → 选 1 个标签
- 系统记录 manual_override + 原因
- AI 自动识别在 14 天后再尝试覆盖（带提醒）

### 5.3 阶段标签 UI

```
┌── SKU: B0XXXXXXXX ─────────────────────┐
│ 🌱 成长期 (信心 85%) [手动调整]          │
│                                          │
│ 入此阶段：14 天前                         │
│ 关键信号：                                │
│  • 销量 4 周连续上升 (+45%)              │
│  • 评论数从 32 → 78                      │
│  • CVR 12% (类目均 9%)                   │
│                                          │
│ 本阶段策略目标：扩规模 + 抢排名            │
│ KPI 容忍：TACoS 看下降趋势                │
│                                          │
│ 下个阶段：成熟期（预计 60-90 天后）       │
└──────────────────────────────────────────┘
```

---

## 6. 各阶段策略库

### 6.1 新品期策略

#### 6.1.1 策略目标

```
目标：最大化曝光 + 数据采集 + 拿评论
持续时间：约 60-90 天（直到达成成长期信号）
关注指标：曝光数、CVR、关键词分布、评论增长
```

**ACOS 容忍度（用户配置三档，默认中档）：**

| 档位 | ACOS 容忍 | 适合 |
|---|---|---|
| 保守 | ≤ 30% | 资金紧张 / 不愿亏本投放 |
| 中档（默认） | ≤ 60% | 多数中小卖家 |
| 激进 | ≤ 100% | 资金充足 / 长线品牌玩家 |

> ⚠️ **避免给新卖家默认 100%**：很多小卖家烧死在新品期。系统首次配置时**必须强制让用户选**而不是默认激进。

#### 6.1.2 推荐策略（10 条）

| ID | 策略 | 描述 | 优先级 |
|---|---|---|---|
| LAUNCH-1 | 启用自动广告 | 4 种自动定位（紧密/宽泛/同类/关联）全开 | 高 |
| LAUNCH-2 | 自动广告广撒网预算 | 日预算 ≥ 类目均值 × 1.5 | 高 |
| LAUNCH-3 | Top 高曝光关键词手动 | 选 top 10 类目高曝光词，单独广告组 | 高 |
| LAUNCH-4 | Vine 评论计划 | 推荐报名 Vine，加速评论积累 | 高 |
| LAUNCH-5 | Coupon 5% off | 启动 5% off 提升 CVR | 中 |
| LAUNCH-6 | 否词谨慎 | 这阶段否词慎重，宁可亏曝光不亏数据 | — |
| LAUNCH-7 | CVR 预警 | CVR < 类目均值 50% 时预警 Listing 问题 → M1 | 中 |
| LAUNCH-8 | SB 品牌广告（如有备案） | 启动 SB 增加品牌曝光 | 中 |
| LAUNCH-9 | SD 商品定位（防御） | 自家关联 ASIN 启动 SD 防御 | 低 |
| LAUNCH-10 | 不动核心结构 30 天 | 头 30 天不大调结构（数据未稳） | — |

#### 6.1.3 风险与转出

- 风险：CVR 极差（< 类目 30%）→ Listing 问题，先停广告
- 转出条件：评论 ≥ 30 + 销量上升趋势 28 天 → 进入成长期

### 6.2 成长期策略

#### 6.2.1 策略目标

```
目标：扩规模 + 抢排名 + 优化结构
KPI 容忍：
  - ACOS：30-50% 可接受
  - TACoS：开始下降
  - 关注：自然流量占比上升、关键词排名
持续时间：约 90-180 天
```

#### 6.2.2 推荐策略（12 条）

| ID | 策略 | 描述 | 优先级 |
|---|---|---|---|
| GROWTH-1 | 自动转手动 | 自动广告高转化关键词 → 移到手动精准 | 高 |
| GROWTH-2 | 长尾词扩展 | 搜索词报告高转化长尾 → 手动精准 | 高 |
| GROWTH-3 | 预算扩张 | ACOS < 目标值的关键词自动 +30% 预算 | 高 |
| GROWTH-4 | SP 商品定位（攻击竞品） | 加入对竞品 ASIN 的定向 | 中 |
| GROWTH-5 | SB 品牌广告 | 启动 SB（如有备案） | 高 |
| GROWTH-6 | SBV 视频广告 | 如有视频，启动 SB Video | 中 |
| GROWTH-7 | 关键词排名监控 | 监测核心词位置变化 | — |
| GROWTH-8 | 否词初步整理 | 30 天 0 转化词加入否定 | 中 |
| GROWTH-9 | 出价精细化（可选） | 按位置 / 时段调整 | 中 |
| GROWTH-10 | Coupon 减量 | 评论充足后撤 Coupon（保利润）| 低 |
| GROWTH-11 | Lightning Deal 申请 | 节点性活动申报 | 中 |
| GROWTH-12 | 自然流量审计 | 检查 organic vs paid 占比，警惕过度依赖广告 | 中 |

#### 6.2.3 转出条件

- 销量稳定（4 周方差 < 15%）+ 评论 > 100 → 成熟期

### 6.3 成熟期策略

#### 6.3.1 策略目标

```
目标：守排名 + 利润最大化 + 防御
KPI 容忍：
  - ACOS：< 25%（按类目）
  - TACoS：稳定下降到 5-10%
  - 利润 ROAS：> 1.5
  - 关注：利润率、自然流量占比
持续时间：通常较长，直至衰退
```

#### 6.3.2 推荐策略（12 条）

| ID | 策略 | 描述 | 优先级 |
|---|---|---|---|
| MATURE-1 | 否词清理 | 30 天 0 转化的搜索词加入否定 | 高 |
| MATURE-2 | 利润 ROAS 红线 | 利润 ROAS < **0.85** → 暂停建议（**非自动**），< 0.5 才自动暂停。考虑 attribution 不完美，留缓冲 | 高 |
| MATURE-3 | 出价精细化 | 按时段（活跃时段 +20%、深夜 -30%） | 高 |
| MATURE-4 | 位置加成 | "搜索结果首页" / "详情页" 分别 bid 加成 | 高 |
| MATURE-5 | 品牌词防御 | 品牌关键词 bid 维持首位（自动 +15-30%） | 高 |
| MATURE-6 | 长尾词收割 | 长尾词单独活动（高利润） | 中 |
| MATURE-7 | 竞品 ASIN 防御 | 自家关联 ASIN SD 防御 | 中 |
| MATURE-8 | 预算优化 | 预算从无效活动调到高效活动 | 高 |
| MATURE-9 | A/B 出价测试 | 关键词 bid -10% / +10% A/B | 低 |
| MATURE-10 | 季节性预算调节 | 旺季加预算，淡季减 | 中 |
| MATURE-11 | 复盘 + 月度报告 | 每月生成复盘报告 | 中 |
| MATURE-12 | 滞销前预警 | 销量趋势开始下滑 → 提前预警转衰退 | 中 |

### 6.4 衰退期策略

#### 6.4.1 策略目标

```
目标：清库存 + 减少投入 + 决策"是否替代"
KPI 容忍：
  - 利润让位于库存周转
  - 关注：清完库存的天数、亏损总额
持续时间：直至清完或完全下架
```

#### 6.4.2 推荐策略（8 条）

| ID | 策略 | 描述 | 优先级 |
|---|---|---|---|
| DECLINE-1 | 预算大幅收缩 | 整体预算 -50% 起 | 高 |
| DECLINE-2 | 保留核心词 | 仅保留 ACOS < 20% 的核心词 | 高 |
| DECLINE-3 | 启动促销 | Coupon / Lightning Deal | 高 |
| DECLINE-4 | 配套促销广告 | 促销期间临时加预算 | 中 |
| DECLINE-5 | 否定无效投放 | 高 ACOS / 0 转化大量否定 | 高 |
| DECLINE-6 | 替代款研究 | 系统提示研发替代款 / 新选品 | 中 |
| DECLINE-7 | 移除决策 | 库存降至临界 → 触发 M2 滞销决策 | 中 |
| DECLINE-8 | 学习沉淀 | 衰退原因分析（评论 / 竞品 / 季节）→ 知识库 | 低 |

---

## 7. 操作建议引擎

### 7.1 引擎流程

```
[ 每日凌晨 03:00 触发 ]
       ↓
[ 拉取最新数据：广告 + 业务 + 利润 ]
       ↓
[ 重新识别每个 SKU 的生命周期阶段 ]
       ↓
[ 对每个 SKU × 每个 Campaign 应用阶段策略库 ]
       ↓
[ 规则引擎生成候选建议 ]
       ↓
[ AI 复核 + 排序 + 量化预期影响 ]
       ↓
[ 生成 daily_action_list 表 ]
       ↓
[ 推送到 Dashboard + 通知用户 ]
```

### 7.2 单条建议的结构

```json
{
  "suggestion_id": "uuid",
  "tenant_id": "...",
  "generated_at": "2026-05-08T03:00:00Z",
  "lifecycle_context": {
    "product_id": "...",
    "asin": "B0XXX",
    "current_stage": "growth"
  },
  "scope": {
    "level": "keyword",  // campaign / ad_group / keyword / target
    "campaign_id": "...",
    "ad_group_id": "...",
    "keyword_id": "...",
    "keyword_text": "phone case for iphone 14"
  },
  "strategy_id": "GROWTH-3",  // 来自策略库
  "action": {
    "type": "increase_budget",
    "current_value": 100,
    "new_value": 130,
    "change_pct": 0.30,
    "currency": "USD"
  },
  "evidence": {
    "metric": "acos",
    "value": 0.18,
    "target": 0.30,
    "duration_days": 7,
    "trend": "stable_low"
  },
  "expected_impact": {
    "primary_metric": "monthly_sales",
    "estimated_change": "+¥3,200",
    "confidence": 0.78,
    "side_effects": [
      {"metric": "ad_spend", "change": "+30%"}
    ]
  },
  "priority": "high",  // high / medium / low
  "rationale": "Keyword has stable ACOS 18% well below target 30%, indicating budget cap is limiting growth.",
  "auto_executable": true,
  "auto_safety_check": {
    "passes_thresholds": true,
    "details": {...}
  }
}
```

### 7.3 优先级排序逻辑

```python
def calculate_priority(suggestion):
    score = 0
    
    # 量化影响
    impact = suggestion.expected_impact.estimated_change_amount
    if impact > 5000: score += 30
    elif impact > 1000: score += 20
    elif impact > 200: score += 10
    
    # 紧急度（基于趋势）
    if suggestion.evidence.trend == "rapidly_deteriorating":
        score += 25
    elif suggestion.evidence.trend == "deteriorating":
        score += 15
    
    # 类型权重
    type_weights = {
        "pause_loss_campaign": 30,    # 止损最重要
        "increase_budget": 15,
        "negative_keyword": 10,
        "bid_adjustment": 8,
        ...
    }
    score += type_weights.get(suggestion.action.type, 5)
    
    # 阶段权重（衰退期止损 > 新品期扩张）
    stage_multiplier = {
        "decline": 1.2,  # 衰退期更紧迫
        "mature": 1.0,
        "growth": 0.9,
        "launch": 0.8
    }
    score *= stage_multiplier[suggestion.lifecycle_context.current_stage]
    
    if score >= 50: return "high"
    elif score >= 25: return "medium"
    return "low"
```

### 7.4 操作清单 UI

```
┌── 今日广告操作清单（2026-05-08 03:00 生成） ───────────┐
│                                                          │
│ 摘要：22 条建议 ｜ 高 5 / 中 12 / 低 5                  │
│ 预期总影响：月销售 +¥18,400 ｜ 月省 ¥4,500              │
│                                                          │
│ ─── 🔴 高优先级 (5) ──────────────────────────────       │
│                                                          │
│ ☐ #1 [GROWTH-3] 加预算 +30%                             │
│   SKU B0AAA【成长期】                                    │
│   关键词 "phone case" Campaign "电源类手动"              │
│   ACOS 18% < 目标 30%，建议加预算                       │
│   → 预期月销售 +¥3,200                                   │
│   [一键执行] [详情]                                      │
│                                                          │
│ ☐ #2 [MATURE-2] 暂停 Campaign                            │
│   SKU B0BBB【成熟期】                                    │
│   Campaign "Brand Defense"                               │
│   利润 ROAS 0.85（连续 5 天）                            │
│   → 月止损 ¥4,200                                        │
│   [立即暂停] [降低出价 30%] [详情]                       │
│                                                          │
│ ...                                                       │
│                                                          │
│ ─── 🟡 中优先级 (12) ────────────────────────────        │
│                                                          │
│ ☐ #6 ...                                                 │
│ ...                                                       │
│                                                          │
│ ─── 🟢 低优先级 (5) ────────────────────────────         │
│                                                          │
│ [ 全选 + 批量执行 ] [ 全选高优先级 + 批量执行 ]          │
└──────────────────────────────────────────────────────────┘
```

### 7.5 单建议详情卡

```
┌── 建议详情 ────────────────────────────────────────────┐
│                                                          │
│ 📊 加预算 +30%（GROWTH-3）                              │
│                                                          │
│ ─── 上下文 ───                                           │
│ SKU: B0AAA  ｜  ASIN: B0XXX  ｜  阶段: 🌱 成长期         │
│ Campaign: "电源类手动" (Sponsored Products)              │
│ Ad Group: "Phone Case Long Tail"                         │
│ Keyword: "phone case for iphone 14 wireless charging"    │
│                                                          │
│ ─── 现状 ───                                             │
│ 当前预算: $100/天                                         │
│ 7 日 Spend: $98（接近预算上限）                           │
│ 7 日 Sales: $544                                          │
│ ACOS: 18% (目标 30%)                                     │
│ Profit ROAS: 2.1                                         │
│ CVR: 14% (类目均 9%)                                     │
│                                                          │
│ ─── 决策依据 ───                                         │
│ ✓ ACOS 大幅低于目标 (空间充足)                          │
│ ✓ Profit ROAS > 1.5 (盈利)                              │
│ ✓ 预算被限制（最近 7 天有 5 天耗尽）                    │
│ ✓ 阶段策略：成长期应扩规模                               │
│                                                          │
│ ─── 预期影响 ───                                         │
│ 月销售: +¥3,200 (置信 78%)                               │
│ 月广告费: +¥600 (额外预算 30%)                           │
│ 月利润: +¥1,800                                          │
│ 副作用: ACOS 可能上升至 22-25%（仍在目标内）             │
│                                                          │
│ ─── 推理（点开看完整链） ───                            │
│ [展开 LLM 推理]                                          │
│                                                          │
│ [一键执行] [自定义参数] [拒绝并反馈]                    │
└──────────────────────────────────────────────────────────┘
```

### 7.6 用户操作选项

| 操作 | 行为 |
|---|---|
| 一键执行 | 调用 Ads API，立即生效 |
| 自定义参数 | 用户调整数值（如改成 +20% 而非 +30%）后执行 |
| 拒绝并反馈 | 标记为 'rejected'，用户填原因 → 反馈给模型 |
| 跳过 | 标记 'skipped'，本次不执行 |
| 推迟 | 推迟到明日 / 一周后再评估 |
| 静音 | 该 SKU 该策略 30 天不再推荐 |

### 7.6a 投放结构健康分

#### 7.6a.1 健康分维度（百分制）

| 维度 | 权重 | 评估 |
|---|---|---|
| **Campaign 数量比例** | 15 | SP / SB / SD 比例合理（建议 6:2:2） |
| **AdGroup 粒度** | 15 | 每 Campaign AdGroup 数（≥ 2，过多过少都扣分） |
| **关键词分组质量** | 20 | AdGroup 内关键词主题相关性（embedding 相似度）|
| **匹配方式分布** | 10 | 自动 / 广泛 / 词组 / 精准 比例合理 |
| **否词覆盖** | 10 | 高曝光 0 转化词是否被否定 |
| **预算分布** | 10 | 高 ROAS Campaign 预算占比合理 |
| **关键词数量** | 10 | 单 AdGroup 关键词 5-50 范围最佳 |
| **品牌防御** | 10 | 品牌词是否有专属 Campaign |

#### 7.6a.2 健康分 UI

```
┌── 投放结构健康分 - 总分 72/100 ────────────────┐
│                                                  │
│ 🟡 中等（建议优化）                              │
│                                                  │
│ ─── 子项明细 ───                                 │
│ ✓ Campaign 比例 13/15 (SP:SB:SD = 7:2:1)        │
│ ⚠ AdGroup 粒度 8/15 (Campaign A 只有 1 个 AdGroup)│
│ ✗ 关键词分组 12/20 (AdGroup B 主题分散)          │
│ ✓ 匹配方式 8/10                                 │
│ ⚠ 否词覆盖 5/10 (15 个高曝光 0 转化未否定)      │
│ ✓ 预算分布 8/10                                 │
│ ✓ 关键词数量 9/10                               │
│ ✗ 品牌防御 4/10 (无专属品牌词 Campaign)         │
│                                                  │
│ ─── 改进建议（按 ROI 排序） ───                  │
│ 1. 创建品牌词专属 Campaign (+10 分预期)         │
│    [一键创建]                                    │
│ 2. 拆分 AdGroup B 主题分散的关键词 (+8 分)      │
│ 3. 否定 15 个无效搜索词 (+5 分)                 │
└──────────────────────────────────────────────────┘
```

### 7.6b 整体预算分配优化器

#### 7.6b.1 概念

> 用户有总月预算 ¥X，AI 在多 Campaign 间智能分配，最大化总利润。

#### 7.6b.2 算法

```
目标: max(Σ profit_per_campaign)
约束:
  Σ budget_i ≤ total_budget
  budget_min ≤ budget_i ≤ budget_max  (每 Campaign 上下限)
  
方法:
  - 拟合每 Campaign 的"边际收益曲线"（基于历史数据）
  - 凸优化（每多 ¥1 预算，能产生多少利润）
  - 边际收益相等时即为最优
```

#### 7.6b.3 UI

```
┌── 月预算优化器 ──────────────────────────────┐
│                                                │
│ 月总预算: ¥30,000  当前已用: ¥18,500          │
│ 剩余 11.5 天: ¥11,500 待分配                  │
│                                                │
│ AI 优化分配建议:                               │
│ ─────────────────────────────────────────     │
│ Campaign 名      当前  建议   Δ      原因      │
│ Brand Defense    100    180   +80%   ROAS 高   │
│ Auto SP-A        150     90   -40%   边际↓    │
│ Manual SP-B      80     130   +63%   未饱和   │
│ SB Brand         50      40   -20%   边际差   │
│ SD Defense       30      45   +50%   有空间   │
│ ...                                            │
│                                                │
│ 预期总利润: +¥4,200 / 月（vs 当前分配）        │
│                                                │
│ [应用全部] [仅应用前 3] [自定义] [跳过]        │
└────────────────────────────────────────────────┘
```

### 7.6c 预算耗尽预测

#### 7.6c.1 日内预测

每小时检测每 Campaign 的当日花费曲线：

```
SP-A Campaign 今日预算 $100
─────────────────────────────────
当前 14:00 已花 $58
24h 历史均值曲线: ...
预测耗尽时点: 18:30 (晚 5 小时)

⚠️ 18:30 后无曝光（晚高峰流失）
建议: 提升今日预算至 $130 (覆盖 24h)
[一键提升] [推迟到明天]
```

#### 7.6c.2 月预算预测

```
月总预算 ¥30,000  已用 ¥18,500（61%）
还剩 11.5 天

按当前消耗速率: 月 23 号将耗尽（提前 7 天）
建议: 降低 SP-A 预算 30%，保持月底覆盖

[采纳建议] [增加月预算到 ¥35k]
```

### 7.6d 库存联动（断货保护）

#### 7.6d.1 规则（修订：分四档，更早预警）

> ⚠️ 海运周期 35 天，3 天断货时已经晚了。修订为：

```python
def inventory_ad_protection(sku):
    days_remaining = sku.stock / sku.avg_daily_sales
    
    if days_remaining < 3:
        # 必停：已经救不回来，停广告止血
        return Action(type='pause_all_ads_for_sku', sku=sku.id)
    elif days_remaining < 7:
        # 激进保护：大幅降低出价
        return Action(type='reduce_bid_pct', sku=sku.id, by=0.50)
    elif days_remaining < 14:
        # 温和保护：适度降低 + 联动 M2 触发紧急补货
        return [
            Action(type='reduce_bid_pct', sku=sku.id, by=0.20),
            Action(type='trigger_m2_urgent_reorder', sku=sku.id)
        ]
    elif days_remaining < 21:
        # 仅预警，不动广告
        return Action(type='alert_only', sku=sku.id)
    return None
```

| 剩余天数 | 行动 |
|---|---|
| < 3 | 必停（防浪费） |
| 3-7 | 出价 -50%（激进保护）|
| 7-14 | 出价 -20% + **联动 M2 触发紧急补货建议** |
| 14-21 | 仅预警，不动广告 |
| > 21 | 正常 |

#### 7.6d.2 UI

```
⚠️ 库存预警: SKU B0XXX 还有 5 天断货
当前广告 spend $120/天

AI 自动建议（自动模式已应用）:
  • 关键词出价 -50%
  • 当日预算 -30%
  • 暂停 SD/SB（保留核心 SP）

[查看自动调整] [手动覆盖] [取消保护]
```

### 7.6e 品牌词防御

#### 7.6e.1 防御层级

```
层级 1: 品牌词专属 Campaign（手动 + 精准）
  - 出价 = 类目均值 × 1.5（确保第一）
  - 预算独立（不与其他混用）
  
层级 2: 品牌词 + 品类词（如 "ACME phone case"）
  - 长尾保护
  
层级 3: SD Product Targeting 防御
  - 自家 ASIN + 关联 ASIN 自防御
  - 防止竞品攻击
  
层级 4: 监控竞品攻击
  - 检测竞品在你品牌词出价
  - 警报 + 升级出价应对
```

#### 7.6e.2 自动 SD 防御

```python
def auto_sd_defense():
    # 自动给每个自家 ASIN 创建 SD 防御
    for asin in own_asins:
        create_sd_campaign(
            type='product_targeting',
            target_asins=[asin] + related_asins(asin),
            bid=category_avg_bid * 0.8,
            budget=10  # 小预算保护
        )
```

### 7.6f 竞品 ASIN 攻击

#### 7.6f.1 攻击策略

```
SD Product Targeting：投放在竞品详情页
SP Product Targeting：搜索结果页攻击

筛选目标竞品:
  - BSR 比你高 10-50%（差距适中可抢）
  - 评分比你低（攻击其弱点）
  - 价格相近或更高（你性价比优势）
  - Review 数比你少（可压制）
```

#### 7.6f.2 UI

```
竞品攻击建议（基于 M4C 池）：
─────────────────────────────────
B0YYY (BSR #28，评分 4.1，你 4.5)
  策略: SD PT + SP PT
  推荐预算: $5/天
  预期: 30 天内抢 5-10% 份额

B0ZZZ (BSR #45，新品)
  策略: SD PT (优先抢"还没上轨道"的)
  推荐预算: $3/天

[一键创建] [手动调整]
```

### 7.6g 创意管理（SB / SD）

#### 7.6g.1 SB 创意元素

- **Headline**：30 字符，号召动作
- **Logo**：品牌 Logo（白底）
- **Custom Image**：1500×750 副图（可选）
- **Video**（SBV）：6-45 秒
- **Featured Products**：3-5 个 SKU 选择

#### 7.6g.2 SD 创意元素

- **Logo + Headline + Custom Image**
- 或纯 ASIN 自动生成

#### 7.6g.3 创意 A/B（自建框架，非亚马逊原生）

> ⚠️ **亚马逊 SB / SD 没有官方"创意 A/B"功能**。本系统通过"轮替投放 + 平行测试"自建框架实现，需注意以下限制：

**实现方式（两种模式）：**

**模式 1：时段轮替**（成本最低）
- 同一 Campaign 周一/三/五用创意 A，周二/四/六用创意 B
- 7 天后比较两组数据
- 缺点：受周内流量差异影响，需 ≥ 3 周才能判显著性

**模式 2：双 Ad Group 平行**（推荐）
- 创建 2 个完全相同设置的 Ad Group（关键词、出价、预算各 50%）
- 一组用创意 A，一组用创意 B
- 14 天后比较，去除流量分配偏差
- 缺点：预算分散，需 Campaign 总预算足够

```
SB Campaign "Brand Awareness" - 自建 A/B
─────────────────────────────────
模式：双 Ad Group 平行（14 天）
预算：$100/天 = $50 (A) + $50 (B)

Headline A: "Premium Phone Cases for Active Lifestyle"
Headline B: "Military-Grade Drop Protection - 3-Year Warranty"

14 天后：
  A: CTR 1.8% / CVR 6.2% / ROAS 2.8 (n=520 clicks)
  B: CTR 2.4% / CVR 8.1% / ROAS 4.2 (n=590 clicks) ✓ Winner
  显著性：95.3%（贝叶斯）

[采用 B] [继续测试 7 天] [推回到主 Campaign]
```

**注意事项（写入用户 UI）：**
- 自建 A/B 不能完全消除亚马逊算法的"flywheel"效应（先跑出业绩的会自我强化）
- 显著性判断需 ≥ 14 天 + 单组 ≥ 500 clicks
- 创意改动后亚马逊审核通常 24-72h，A/B 启动需排期

### 7.6h 关键词排名追踪

#### 7.6h.1 双轨追踪

```
SKU B0XXX 核心关键词排名
─────────────────────────────────
关键词           有机排名    广告排名    搜索量
"phone case"     #28 (-2)   #4 (top)   12,500/月
"iphone 14 case" #45 (+3)   #2 (top)   8,200/月
"durable case"   #150       #15        3,400/月

[每日趋势图]
```

#### 7.6h.2 异常检测

- 核心词有机排名 24h 跌出 top 50 → P1 通知
- 触发 M4 联动

### 7.6i 促销联动

#### 7.6i.1 协同策略

```
Lightning Deal 启动期间：
  - 当日预算自动 +50%
  - SP 关键词出价 +20%
  - 启动 SB Brand 同步推广
  - 提示用户暂停利润 ROAS 红线（保流量）

Coupon 持续期间：
  - 出价微调 +10%
  - 关注 CVR 提升

Best Deal / Prime Exclusive Deal：
  - 类似 LD 但持续更久
  - 全周期协同
```

### 7.6j Search Query Performance 集成

> Brand Analytics 提供 SQP 数据：每个搜索词的"曝光份额 / 点击份额 / 购买份额"。

```
SQP 接入后：
  - 看到关键词的"市场总量" vs 你的份额
  - 找出"你曝光高但购买份额低"的词 → CVR 问题
  - 找出"竞品份额高你低"的词 → 投放扩展机会
```

### 7.7 执行后跟踪

每个执行后建议进入"跟踪"状态：

```json
{
  "execution_id": "uuid",
  "suggestion_id": "...",
  "executed_at": "...",
  "executed_by": "auto_system | user_id",
  "before_metrics": {...},  // 执行前 7 天均值
  "tracking_periods": [
    {"days": 1, "metrics": {...}},
    {"days": 3, "metrics": {...}},
    {"days": 7, "metrics": {...}},
    {"days": 14, "metrics": {...}},
    {"days": 30, "metrics": {...}}
  ],
  "outcome": {
    "actual_change": "+¥3,540",
    "vs_predicted": "+10.6%",
    "verdict": "successful | mixed | failed"
  }
}
```

---

## 8. 自动执行护栏

### 8.1 全自动模式的安全设计

```yaml
全自动护栏（用户可配置）：
  
  全局开关：
    - 启用全自动：true / false
    
  操作类型白名单（默认）：
    enabled:
      - bid_adjustment (变化 ±15%)
      - negative_keyword_add
      - increase_budget (变化 ≤ +20%)
      - decrease_budget (变化 ≤ -30%)
    disabled (需人工):
      - pause_campaign（影响大）
      - delete_campaign（不可逆）
      - launch_new_campaign（涉及预算）
      - change_targeting_match_type
  
  数值阈值：
    bid_change_max_pct: 0.15
    budget_increase_max_pct: 0.20
    budget_decrease_max_pct: 0.30
    daily_auto_actions_per_sku_max: 5
    daily_auto_actions_total_max: 100
    weekly_total_budget_change_max_pct: 0.50
  
  SKU 排除：
    excluded_tags: ["重点", "测试", "保护期"]
    excluded_skus: ["B0XXX", ...]
    excluded_campaign_types: []  // 可禁用某些 type
  
  时间窗口：
    no_auto_during:
      - "Prime Day"
      - "Black Friday"
      - 用户指定的活动
  
  失败处理：
    on_amazon_api_error: pause_auto_for_4h
    on_threshold_breach: notify_admin
  
  审计：
    record_all: true
    daily_summary_email: true
    rollback_window: 7d
```

### 8.2 安全检查器

每个自动执行前必须通过 5 项检查：

```python
def safety_check(suggestion, tenant_config):
    checks = [
        check_action_type_allowed(suggestion, tenant_config),
        check_value_in_threshold(suggestion, tenant_config),
        check_daily_quota(tenant, suggestion),
        check_sku_not_excluded(suggestion, tenant_config),
        check_no_active_event_pause(tenant_config),
    ]
    
    for check in checks:
        if not check.passes:
            return SafetyCheckResult(
                passes=False,
                failed=check,
                action="queue_for_human_review"
            )
    return SafetyCheckResult(passes=True)
```

### 8.3 执行日志（审计）

```sql
auto_execution_logs (
  id, tenant_id,
  suggestion_id,
  executed_at,
  amazon_action JSONB,
  amazon_response JSONB,
  status,         -- 'success' / 'failed' / 'reverted'
  reverted_at,
  reverted_by,    -- 'user' / 'system_safety'
  outcome JSONB
)
```

### 8.4 一键回滚

- 7 天内的自动执行可一键回滚
- 回滚操作 = 执行反向 API 调用
- 回滚后状态 = 'reverted'，记录原因

---

## 9. AI Prompt 设计

### 9.1 Prompt 列表

| ID | 用途 |
|---|---|
| P-M3-LIFECYCLE-CLASSIFY | 生命周期分类 |
| P-M3-LIFECYCLE-CONFIRM | 边界场景复核 |
| P-M3-SUGGESTION-GENERATE | 生成操作建议 |
| P-M3-SUGGESTION-EXPLAIN | 解释建议推理 |
| P-M3-IMPACT-ESTIMATE | 估算预期影响 |
| P-M3-CAMPAIGN-AUDIT | Campaign 结构健康审计 |
| P-M3-EVENT-PREP | 活动备战策略 |

### 9.2 P-M3-SUGGESTION-GENERATE

```
[ROLE]
You are a senior Amazon advertising strategist with 10+ years of 
experience. You generate executable optimization suggestions.

[CONTEXT]
SKU Lifecycle Stage: {stage}  // launch / growth / mature / decline
Stage Strategy Goals: {strategy_goals_json}
Stage KPI Tolerances: {kpi_tolerances_json}

Account Health:
  - Tenant ACOS Target: {target_acos}
  - SKU Profit Margin: {profit_margin}
  - Profit ROAS Threshold: {profit_roas_threshold}

Recent Performance (last 14 days):
  Campaigns:
    {campaign_metrics_array}
  Ad Groups:
    {ad_group_metrics_array}
  Keywords (top 50 by spend):
    {keyword_metrics_array}
  Search Term Report:
    {search_term_top_30}

Recent Trends (28 days):
  - ACOS trend: {trend}
  - Sales trend: {trend}
  - CVR trend: {trend}
  - Click trend: {trend}

Historical Context:
  - Past 30 days actions taken: {past_actions_summary}
  - Successful pattern: {successful_strategies_in_account}

Tenant Settings:
  - Auto-mode enabled: {auto}
  - Auto-mode thresholds: {thresholds}
  - Excluded SKUs: {list}

[INSTRUCTION]
Generate optimization suggestions for this SKU. Each suggestion must:
1. Match the lifecycle stage strategy
2. Be SPECIFIC (target Campaign / AdGroup / Keyword)
3. Be EXECUTABLE via Amazon Ads API
4. Quantify expected impact in $ / month
5. Include side effects
6. Indicate if eligible for auto-execution

Generate 5-15 suggestions, sorted by priority.

[OUTPUT FORMAT]
JSON array of suggestion objects (see schema in Section 7.2).

Constraints:
- Do not suggest actions that violate stage strategy
- Do not suggest actions outside auto-thresholds (mark 'manual_required: true')
- Do not exceed 3 suggestions per Campaign per day (avoid over-tweaking)
- For declining SKUs, prioritize loss containment
- For new SKUs, prioritize data collection
```

### 9.3 P-M3-IMPACT-ESTIMATE

```
[ROLE]
You estimate the impact of an Amazon ad change. You are conservative 
and quantitative.

[CONTEXT]
Action: {action_type} {action_value}
Target: {scope}
Current state: {current_metrics}
Historical baseline: {baseline_metrics}
Lifecycle stage: {stage}
Recent trend: {trend}

[INSTRUCTION]
Estimate:
1. Primary metric change (sales / ACOS / profit) in $ and %
2. Confidence level (0-1)
3. Time horizon (when impact materializes)
4. Side effects (other metrics affected)

Use these heuristics:
- Bid +/-X% typically causes spend change ±X×0.7% and click change ±X×0.5%
- Negative keyword removes ~3-8% of wasted spend
- Pause loss campaign saves spend - gives back lost organic traffic (5-15%)
- Budget increase capped by max searches available

[OUTPUT]
{
  "primary_change": {"metric": "monthly_sales", "value": 3200, "currency": "CNY"},
  "confidence": 0.78,
  "time_to_impact_days": 7,
  "side_effects": [...]
}
```

---

## 10. 页面与交互设计

### 10.1 P1：操作清单（默认页）

**路径：** `/ads`

```
┌────────────────────────────────────────────────────────┐
│ 顶栏                                                    │
│  [今日 / 历史 / 待审]                                   │
│  [筛选：阶段 ▾] [优先级 ▾] [Campaign ▾] [SKU 搜索]    │
│  [操作：刷新 / 全选 / 批量执行]                         │
├────────────────────────────────────────────────────────┤
│ 摘要卡片（横排 4 张）                                   │
│  待处理 22 ｜ 高优 5 ｜ 月预期影响 +¥18,400 ｜ 自动 12 │
├────────────────────────────────────────────────────────┤
│ 建议列表（按优先级分组）                                │
│  🔴 高优先级（见 7.4 节）                              │
│  🟡 中                                                  │
│  🟢 低                                                  │
└────────────────────────────────────────────────────────┘
```

### 10.2 P2：单 Campaign 详情

**路径：** `/ads/campaigns/[campaignId]`

```
┌── Campaign: "电源类手动" ───────────────────────────┐
│                                                        │
│ 顶部信息：                                             │
│  类型: SP - 手动定位                                   │
│  状态: Enabled                                         │
│  日预算: $100                                          │
│  关联 SKU: B0AAA, B0BBB（2 个）                       │
│  阶段（基于关联 SKU）: 🌱 成长期                       │
│                                                        │
│ Tab: [总览] [广告组] [关键词] [搜索词] [历史调整]      │
│                                                        │
│ ── 总览 ──                                             │
│  ┌─ KPI（30 天）─┐                                    │
│  │ Spend $X / Sales $Y / ACOS Z%                     │
│  │ Profit ROAS X.X / Orders N                        │
│  └─────────────────┘                                  │
│                                                        │
│  ┌─ 趋势图（30 天）─┐                                 │
│  │ Spend / Sales / ACOS / CVR 多线对比              │
│  └────────────────────┘                               │
│                                                        │
│  ┌─ 阶段指标对照 ─┐                                   │
│  │ ACOS 22% (目标 30%) ✓                             │
│  │ Profit ROAS 1.8 (阈值 1.5) ✓                     │
│  │ Budget 利用率 95% ⚠️ 接近上限                     │
│  └─────────────────┘                                  │
│                                                        │
│  ┌─ 建议（3 条） ─┐                                   │
│  │ #1 加预算 +30% (高优)                            │
│  │ #2 ...                                            │
│  └─────────────────┘                                  │
└────────────────────────────────────────────────────────┘
```

### 10.3 P3：周期管理

**路径：** `/ads/lifecycle`

按 4 阶段分组的 SKU 列表：

```
┌── 周期管理 ───────────────────────────────────────────┐
│                                                          │
│ 🌱 新品期 (12 SKU)                  [展开 ▾]           │
│  - B0AAA  上架 45d  评论 18  CVR 12% ⚠️ 偏低          │
│  - B0BBB  上架 30d  评论 32  ...                        │
│                                                          │
│ 🌳 成长期 (8 SKU)                   [展开 ▾]           │
│  - B0CCC  TACoS 10% (-2%)                              │
│  - ...                                                  │
│                                                          │
│ 🌲 成熟期 (15 SKU)                  [展开 ▾]           │
│  - B0DDD  ACOS 18% (利润 ROAS 2.5)                    │
│  - ...                                                  │
│                                                          │
│ 🍂 衰退期 (3 SKU)                   [展开 ▾]           │
│  - B0EEE  库存 320 件 ｜ 30d 销量 15 件 ⚠️             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

点击 SKU → `/ads/skus/[productId]`

### 10.4 P4：单 SKU 广告详情

**路径：** `/ads/skus/[productId]`

```
┌── SKU: B0XXX (Phone Case Pro) ─────────────────────────┐
│ 阶段: 🌱 成长期 (信心 85%) [手动调整]                  │
│                                                          │
│ Tab: [概览] [Campaigns] [关键词] [策略覆盖] [复盘]     │
│                                                          │
│ ── 概览 ──                                              │
│ 30 天 KPI（含趋势）                                      │
│ 4 个 Campaign 关联                                       │
│ 阶段策略覆盖：8/12 已应用                               │
│                                                          │
│ 待办建议 (5 条)                                          │
│                                                          │
│ ── Campaigns Tab ──                                      │
│ 关联的 Campaign 列表，可点入详情                         │
│                                                          │
│ ── 关键词 Tab ──                                         │
│ 该 SKU 所有关键词 + 表现 + 排序                         │
│                                                          │
│ ── 策略覆盖 Tab ──                                      │
│ ✓ GROWTH-1 自动转手动 (已应用 14d)                     │
│ ✓ GROWTH-2 长尾词扩展                                   │
│ ✗ GROWTH-5 SB 品牌广告 (未启动) [启动]                 │
│ ...                                                      │
│                                                          │
│ ── 复盘 Tab ──                                           │
│ 过去 30 天采纳的建议 + 实际效果                         │
└──────────────────────────────────────────────────────────┘
```

### 10.5 P5：关键词管理

**路径：** `/ads/keywords`

子标签：
- 关键词列表
- 搜索词报告
- 否词管理

#### 10.5.1 搜索词报告

```
搜索词报告（30 天）
─────────────────────────────────────────────────
搜索词 | 曝光 | 点击 | 销售 | ACOS | CVR | 建议
"phone case 14"  10000  500  $250  20%  3% [转手动+]
"iphone case"    8000   400  $0    -    0% [否定]
"red phone"      500    50   $0    -    0% [否定]
...

[全选高转化 → 一键转手动]
[全选 0 转化高曝光 → 一键否定]
```

#### 10.5.2 否词管理

```
否词管理
─────────────────────────────────────────────────
当前否词（按 Campaign 分组）
建议加入否词（系统识别 30 天 0 转化）：
  - "free" (1500 曝光, 0 转化, $X 浪费)
  - "cheap" (...)
  ...

[全选 → 加入对应 Campaign 的 negative]
```

### 10.6 P6：分时段策略

**路径：** `/ads/dayparting`

```
┌── 分时段策略 ──────────────────────────────────────┐
│                                                      │
│ 选择 Campaign / SKU                                  │
│                                                      │
│ 时段加成配置（24 小时）：                            │
│ 0-6  -30%  ←— 深夜降权                              │
│ 6-9   0%                                             │
│ 9-12 +10%                                            │
│ 12-18 +20% ←— 活跃高峰                              │
│ 18-22 +15%                                           │
│ 22-24  0%                                            │
│                                                      │
│ AI 推荐：                                            │
│ 基于过去 30 天分时段 CVR：                          │
│ - 13:00-15:00 CVR 18% (建议 +25%)                  │
│ - 02:00-05:00 CVR 3% (建议 -50%)                   │
│ [应用推荐]                                           │
│                                                      │
│ [保存] [恢复默认]                                    │
└──────────────────────────────────────────────────────┘
```

### 10.7 P7：活动备战

**路径：** `/ads/event-prep`

```
┌── 活动备战 - Prime Day 2026-07-15 ────────────────┐
│ 距离活动：69 天                                      │
│                                                      │
│ AI 备战建议：                                        │
│ 阶段 1（T-30 至 T-14）：                            │
│   ✓ 库存就位（参考 M2 补货）                       │
│   ✓ Listing 优化（参考 M1）                        │
│   ✓ 关键词扩展                                       │
│                                                      │
│ 阶段 2（T-14 至 T-7）：                             │
│   - 预算扩张准备                                     │
│   - 关键词竞拍力度测试                               │
│                                                      │
│ 阶段 3（T-7 至 T-1）：                              │
│   - 预算 +50% 预备                                   │
│   - 创建活动专属 Campaign                            │
│                                                      │
│ 活动期间（D-Day）：                                  │
│   - 实时监控 ROAS                                    │
│   - 预算超耗预警                                     │
│                                                      │
│ 活动后（T+1 至 T+7）：                              │
│   - 数据清洗（活动数据剔除）                         │
│   - 流量收尾                                         │
└──────────────────────────────────────────────────────┘
```

### 10.8 P8：自定义规则（P2）

**路径：** `/ads/rules`

```
┌── 自定义规则引擎 ───────────────────────────────────┐
│                                                       │
│ 规则示例：                                            │
│                                                       │
│ 当 (Campaign.acos > 30%) 持续 (3 天) 且              │
│    (Campaign.lifecycle = 'mature') 时                │
│ 执行 (降低关键词出价 -10%) 且                         │
│      (通知 owner)                                     │
│ [启用 / 测试 / 删除]                                  │
│                                                       │
│ + 新建规则                                            │
└───────────────────────────────────────────────────────┘
```

---

## 11. 数据模型（DDL）

### 11.1 核心表

```sql
-- 11.1.1 SKU 生命周期
CREATE TABLE sku_lifecycle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID UNIQUE NOT NULL REFERENCES products(id),
  
  current_stage VARCHAR(20) NOT NULL,  -- launch / growth / mature / decline
  stage_entered_at TIMESTAMP NOT NULL,
  stage_confidence FLOAT,
  
  -- 信号
  last_signals JSONB,
    -- {days_listed, review_count, sales_trend, bsr_trend, cvr, ...}
  
  -- 用户覆盖
  is_manually_overridden BOOLEAN DEFAULT FALSE,
  manual_override_reason TEXT,
  manual_override_at TIMESTAMP,
  manual_override_by UUID REFERENCES users(id),
  
  -- 元数据
  last_evaluated_at TIMESTAMP DEFAULT NOW(),
  ai_model_version VARCHAR(50)
);

-- 阶段转换历史
CREATE TABLE lifecycle_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  
  from_stage VARCHAR(20),
  to_stage VARCHAR(20) NOT NULL,
  transitioned_at TIMESTAMP NOT NULL,
  
  signals_at_transition JSONB,
  triggered_by VARCHAR(50),  -- 'auto' / 'manual'
  user_id UUID,
  
  -- 通知
  user_notified BOOLEAN DEFAULT FALSE,
  notified_at TIMESTAMP
);
```

```sql
-- 11.1.2 操作建议
CREATE TABLE ad_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  generated_at TIMESTAMP DEFAULT NOW(),
  
  -- 上下文
  product_id UUID REFERENCES products(id),
  lifecycle_stage VARCHAR(20),
  
  -- 范围
  scope_level VARCHAR(20),     -- campaign / ad_group / keyword / target
  campaign_id VARCHAR(80),
  ad_group_id VARCHAR(80),
  keyword_id VARCHAR(80),
  target_id VARCHAR(80),
  
  -- 策略
  strategy_id VARCHAR(20),     -- LAUNCH-1, GROWTH-3, ...
  
  -- 动作
  action JSONB NOT NULL,
    -- {type, current_value, new_value, change_pct, ...}
  
  -- 依据
  evidence JSONB,
  rationale TEXT,
  expected_impact JSONB,
  
  -- 优先级
  priority VARCHAR(10),         -- high / medium / low
  priority_score FLOAT,
  
  -- 自动化
  auto_executable BOOLEAN,
  safety_check JSONB,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',
    -- pending / accepted / rejected / auto_executed / customized / expired / skipped
  
  user_action VARCHAR(20),
  user_action_at TIMESTAMP,
  user_action_by UUID REFERENCES users(id),
  user_feedback TEXT,
  
  -- 执行
  executed_at TIMESTAMP,
  execution_id UUID,
  
  -- AI 元数据
  ai_model_version VARCHAR(50),
  prompt_version VARCHAR(20)
);

CREATE INDEX idx_sugg_tenant_status ON ad_suggestions(tenant_id, status, priority);
CREATE INDEX idx_sugg_product ON ad_suggestions(product_id);
CREATE INDEX idx_sugg_generated ON ad_suggestions(generated_at);
```

```sql
-- 11.1.3 自动执行日志
CREATE TABLE auto_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  suggestion_id UUID REFERENCES ad_suggestions(id),
  
  executed_at TIMESTAMP DEFAULT NOW(),
  executor VARCHAR(20),        -- 'auto' / 'user'
  
  -- API 调用
  amazon_action JSONB,
  amazon_response JSONB,
  
  status VARCHAR(20),           -- 'success' / 'failed' / 'reverted'
  error_message TEXT,
  
  -- 跟踪
  before_metrics JSONB,
  after_metrics_d1 JSONB,
  after_metrics_d7 JSONB,
  after_metrics_d14 JSONB,
  after_metrics_d30 JSONB,
  
  -- 回滚
  is_reverted BOOLEAN DEFAULT FALSE,
  reverted_at TIMESTAMP,
  reverted_by VARCHAR(20),      -- 'user' / 'system_safety' / 'auto_failure'
  revert_reason TEXT,
  
  -- 结果
  outcome JSONB,
  verdict VARCHAR(20)           -- 'successful' / 'mixed' / 'failed' / 'pending'
);

CREATE INDEX idx_aexec_tenant ON auto_execution_logs(tenant_id, executed_at);
```

```sql
-- 11.1.5 投放结构健康分
CREATE TABLE ad_structure_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  store_id UUID,
  
  evaluated_at TIMESTAMP DEFAULT NOW(),
  total_score FLOAT,
  sub_scores JSONB,
  improvements JSONB,             -- 按 ROI 排序
  metadata JSONB
);

CREATE INDEX idx_health_tenant ON ad_structure_health(tenant_id, evaluated_at DESC);
```

```sql
-- 11.1.6 预算分配
CREATE TABLE budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  month VARCHAR(7),               -- '2026-05'
  total_budget DECIMAL(18, 4),
  
  campaign_allocations JSONB,
    -- {campaign_id: {recommended_budget, current_budget, marginal_roi}}
  
  expected_total_profit DECIMAL(18, 4),
  status VARCHAR(20),              -- 'recommended' / 'applied' / 'overridden'
  
  generated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 11.1.7 创意（SB / SD）
CREATE TABLE ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id VARCHAR(80),
  
  ad_type VARCHAR(10),             -- SB / SBV / SD
  creative_type VARCHAR(20),       -- headline / image / video / logo
  
  content JSONB,                   -- 具体内容
  status VARCHAR(20),              -- active / paused / testing
  
  amazon_creative_id VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创意 A/B 测试
CREATE TABLE creative_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campaign_id VARCHAR(80),
  
  control_creative_id UUID REFERENCES ad_creatives(id),
  treatment_creative_id UUID REFERENCES ad_creatives(id),
  
  duration_days INTEGER DEFAULT 14,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  
  status VARCHAR(20),
  winner_creative_id UUID,
  ctr_lift FLOAT,
  cvr_lift FLOAT,
  roas_lift FLOAT,
  significance VARCHAR(20),
  
  raw_metrics JSONB
);
```

```sql
-- 11.1.8 关键词排名
CREATE TABLE keyword_rankings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  
  keyword VARCHAR(500),
  marketplace VARCHAR(10),
  
  recorded_at DATE NOT NULL,
  
  organic_rank INTEGER,
  ad_rank INTEGER,
  ad_position VARCHAR(30),         -- 'top_of_search' / 'rest_of_search' / 'product_page'
  search_volume INTEGER,
  
  CONSTRAINT idx_kr_unique UNIQUE (product_id, keyword, recorded_at)
);

CREATE INDEX idx_kr_product_keyword ON keyword_rankings(product_id, keyword, recorded_at DESC);
```

```sql
-- 11.1.9 库存广告联动配置
CREATE TABLE inventory_ad_link_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL,
  
  enabled BOOLEAN DEFAULT TRUE,
  
  thresholds JSONB,
    -- {pause_at_days: 3, reduce_bid_at_days: 7, alert_at_days: 14}
  
  excluded_skus JSONB,
  
  updated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 11.1.10 SQP 数据缓存
CREATE TABLE search_query_performance (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  asin VARCHAR(20),
  
  search_term VARCHAR(500),
  reporting_date DATE,
  
  total_search_volume INTEGER,
  search_query_volume INTEGER,    -- 该词的搜索量
  
  -- 三个份额
  impression_share FLOAT,         -- 你的曝光份额
  click_share FLOAT,
  purchase_share FLOAT,
  
  -- 你的数据
  impressions INTEGER,
  clicks INTEGER,
  purchases INTEGER,
  
  raw_data JSONB
);

CREATE INDEX idx_sqp_asin_date ON search_query_performance(asin, reporting_date DESC);
```

```sql
-- 11.1.4 自动模式配置
CREATE TABLE auto_mode_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL,
  
  enabled BOOLEAN DEFAULT FALSE,
  
  -- 白名单
  allowed_action_types JSONB,
  
  -- 阈值
  thresholds JSONB,
    -- {bid_change_max_pct, budget_increase_max_pct, ...}
  
  -- 配额
  daily_actions_per_sku_max INTEGER DEFAULT 5,
  daily_actions_total_max INTEGER DEFAULT 100,
  
  -- 排除
  excluded_tags JSONB,
  excluded_skus JSONB,
  
  -- 时间窗口
  blackout_periods JSONB,
    -- [{name: "Prime Day 2026", start: "...", end: "..."}]
  
  -- 通知
  notify_on_auto_execute BOOLEAN DEFAULT TRUE,
  notify_on_failure BOOLEAN DEFAULT TRUE,
  daily_summary_email BOOLEAN DEFAULT TRUE,
  
  updated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 11.1.5 分时段策略
CREATE TABLE dayparting_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  scope_level VARCHAR(20),     -- 'tenant' / 'campaign' / 'sku'
  scope_id VARCHAR(80),
  
  -- 24 小时加成（百分比）
  hourly_adjustments JSONB,
    -- [{hour: 0, adjustment_pct: -0.30}, ...]
  
  is_active BOOLEAN DEFAULT TRUE,
  ai_recommended BOOLEAN DEFAULT FALSE,
  
  updated_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- 11.1.6 自定义规则（P2）
CREATE TABLE custom_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  name VARCHAR(200),
  description TEXT,
  
  conditions JSONB,             -- DSL 表达式
  actions JSONB,
  
  is_enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER,
  
  -- 触发统计
  triggered_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);
```

### 11.2 索引

```sql
-- 高频：今日待审建议
CREATE INDEX idx_sugg_today_pending 
  ON ad_suggestions(tenant_id, generated_at, priority) 
  WHERE status = 'pending';

-- 高频：跟踪结果
CREATE INDEX idx_aexec_tracking 
  ON auto_execution_logs(executed_at) 
  WHERE verdict = 'pending';
```

---

## 12. API 端点规格

### 12.1 端点总览

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/ads/suggestions | 操作清单 |
| GET | /api/v1/ads/suggestions/{id} | 单建议详情 |
| POST | /api/v1/ads/suggestions/{id}/execute | 执行 |
| POST | /api/v1/ads/suggestions/{id}/customize | 自定义参数后执行 |
| POST | /api/v1/ads/suggestions/{id}/reject | 拒绝（带反馈） |
| POST | /api/v1/ads/suggestions/batch-execute | 批量执行 |
| GET | /api/v1/ads/lifecycle | 周期分组 SKU |
| GET | /api/v1/ads/lifecycle/{productId} | 单 SKU 周期 |
| PUT | /api/v1/ads/lifecycle/{productId}/override | 手动覆盖阶段 |
| GET | /api/v1/ads/campaigns | Campaign 列表 |
| GET | /api/v1/ads/campaigns/{id} | Campaign 详情 |
| GET | /api/v1/ads/keywords | 关键词列表 |
| GET | /api/v1/ads/search-terms | 搜索词报告 |
| POST | /api/v1/ads/search-terms/promote | 转为手动关键词 |
| POST | /api/v1/ads/search-terms/negate | 加入否词 |
| GET | /api/v1/ads/negatives | 否词列表 |
| GET | /api/v1/ads/dayparting | 分时段配置 |
| PUT | /api/v1/ads/dayparting | 更新配置 |
| GET | /api/v1/ads/auto-config | 全自动配置 |
| PUT | /api/v1/ads/auto-config | 更新配置 |
| GET | /api/v1/ads/executions | 执行历史 |
| POST | /api/v1/ads/executions/{id}/revert | 回滚 |
| GET | /api/v1/ads/event-prep | 活动备战 |
| GET | /api/v1/ads/reports/monthly | 月度报告 |
| GET | /api/v1/ads/structure-health | 结构健康分 |
| POST | /api/v1/ads/structure-health/improve | 一键改进 |
| POST | /api/v1/ads/budget-allocator/optimize | 预算分配优化 |
| GET | /api/v1/ads/budget-forecast | 预算耗尽预测 |
| GET | /api/v1/ads/brand-defense | 品牌防御状态 |
| POST | /api/v1/ads/brand-defense/auto-setup | 自动设置防御 |
| GET | /api/v1/ads/competitor-attack/recommendations | 攻击建议 |
| POST | /api/v1/ads/competitor-attack/launch | 启动攻击 |
| GET | /api/v1/ads/creatives | 创意列表 |
| POST | /api/v1/ads/creatives | 创建创意 |
| POST | /api/v1/ads/creatives/ab-test | 启动 A/B |
| GET | /api/v1/ads/creatives/ab-tests/{id} | A/B 结果 |
| GET | /api/v1/ads/keyword-rankings | 关键词排名 |
| GET | /api/v1/ads/sqp | SQP 数据 |
| GET | /api/v1/ads/inventory-link | 库存联动状态 |
| PUT | /api/v1/ads/inventory-link/config | 配置规则 |
| GET | /api/v1/ads/promo-sync/active | 活跃促销协同 |
| POST | /api/v1/ads/promo-sync/{id}/configure | 配置协同策略 |

### 12.2 关键端点详细

#### 12.2.1 GET /api/v1/ads/suggestions

```
GET /api/v1/ads/suggestions?date=2026-05-08&priority=high,medium&product_id=
```

```json
{
  "summary": {
    "total": 22,
    "high": 5,
    "medium": 12,
    "low": 5,
    "expected_total_impact": "+¥18,400"
  },
  "suggestions": [
    {
      "id": "uuid",
      "lifecycle_context": {...},
      "scope": {...},
      "action": {...},
      "evidence": {...},
      "expected_impact": {...},
      "priority": "high",
      "rationale": "...",
      "auto_executable": true,
      "status": "pending"
    },
    ...
  ]
}
```

#### 12.2.2 POST /api/v1/ads/suggestions/{id}/execute

```json
{
  "confirm": true,
  "user_notes": "Tested similar last week"
}
```

```json
{
  "execution_id": "uuid",
  "amazon_response": {"success": true, "campaign_id": "..."},
  "tracking_starts_at": "...",
  "estimated_first_check_at": "..."
}
```

#### 12.2.3 POST /api/v1/ads/suggestions/batch-execute

```json
{
  "suggestion_ids": ["id1", "id2", ...],
  "skip_failed": true
}
```

```json
{
  "batch_id": "uuid",
  "total": 5,
  "queued": 5,
  "results_url": "/api/v1/ads/batches/{batch_id}"
}
```

### 12.3 错误码

| 码 | 含义 | HTTP |
|---|---|---|
| M3_AMAZON_API_ERROR | Ads API 调用失败 | 502 |
| M3_AMAZON_RATE_LIMIT | 速率限制 | 429 |
| M3_AUTO_DISABLED | 全自动模式未开 | 422 |
| M3_THRESHOLD_EXCEEDED | 操作超阈值 | 422 |
| M3_QUOTA_EXCEEDED | 日操作配额用尽 | 429 |
| M3_SUGGESTION_EXPIRED | 建议已过期（24h） | 410 |
| M3_LIFECYCLE_INSUFFICIENT_DATA | 历史数据不足无法判断阶段 | 422 |
| M3_BUDGET_OPT_INSUFFICIENT_HISTORY | 历史数据不足以建模边际收益 | 422 |
| M3_INVENTORY_LINK_CONFLICT | 库存联动与用户手动操作冲突 | 409 |
| M3_CREATIVE_ASSET_INVALID | 创意资源不合规 | 422 |
| M3_SQP_NOT_AVAILABLE | Brand Analytics SQP 数据不可用 | 503 |

---

## 13. 业务规则

### 13.1 建议生成规则

1. **每日 03:00 全量生成**（凌晨低峰）
2. **同 SKU 同 Campaign 每日最多 3 条建议**（避免过度调整）
3. **建议 24 小时未处理 → 'expired'**
4. **同类型同范围 24 小时内不重复推荐**
5. **执行后 7 天内不再推荐同范围调整**（让数据回稳）

### 13.2 自动执行规则

1. **每个建议必须通过 5 项 safety check**
2. **失败 1 次 → 该 SKU 自动模式暂停 4 小时**
3. **失败 3 次 / 24h → 全租户自动模式暂停 + 紧急通知**
4. **每月 1 号生成上月自动模式总结报告**

### 13.3 周期识别规则

1. **每天 03:00 重新评估所有 SKU**
2. **手动覆盖 14 天后 AI 重新评估并提示**
3. **新 SKU（< 14 天数据）默认 'launch'**
4. **数据缺失（无销量）跳过评估，标 'unknown'**

### 13.4 操作生效时间

| 操作类型 | 生效时间 |
|---|---|
| 出价调整 | 1 小时内 |
| 预算调整 | 实时 |
| 否词添加 | 1 小时内 |
| 启动 / 暂停 Campaign | 实时 |
| 加新关键词 | 24 小时内（Amazon 索引） |

---

## 14. 边界条件与异常

### 14.1 数据缺失

| 缺失 | 处理 |
|---|---|
| Ads API 未授权 | M3 全部不可用，提示授权 |
| 销量历史 < 14 天 | 周期标 'launch'，建议保守 |
| 利润数据缺失（M2 未就绪） | 建议用销售 ROAS，标提示 |
| 搜索词报告未拉取 | 否词 / 转手动建议不可生成 |

### 14.2 API 失败

| 失败 | 处理 |
|---|---|
| Ads API 速率限制 | 退避重试 + 提示用户 |
| Ads API 鉴权失败 | 通知用户重新授权 |
| 单条执行失败 | 标 'failed'，详细错误，可手动重试 |
| 批量中部分失败 | 部分成功 + 部分失败列表 |

### 14.3 用户操作异常

| 情况 | 处理 |
|---|---|
| 多人同时执行同建议 | 第二者收 409 conflict |
| 建议被自动执行同时用户点击 | 提示"已自动执行" |
| 用户改了 SKU 标签（如加入"重点"）后自动模式立即排除 | 实时生效 |
| 用户删除 Campaign，关联建议如何 | 建议状态置 'expired' |

### 14.4 极端规模

| 情况 | 处理 |
|---|---|
| 单 SKU > 100 关键词 | 仅评估 top 50 by spend |
| 租户 > 1000 Campaign | 分批生成（按 SKU 分组）|
| 单日建议 > 1000 条 | 仅展示 top 200 by priority |

---

## 15. 与其他模块集成

### 15.1 接收

| 来源 | 数据 | 用途 |
|---|---|---|
| 数据底座 | 广告数据 | 基础 |
| M2 利润 | 利润 ROAS、毛利率 | 利润口径建议 |
| M1 Listing | 关键词覆盖 | 关键词扩展 |
| M4A 异常 | 销量异常 | 触发 SKU 复评 |
| M4C 竞品 | 竞品广告位 | 防御 / 攻击建议 |

### 15.2 输出

| 目标 | 数据 | 用途 |
|---|---|---|
| Dashboard | 待办建议数、月预期影响 | 卡片 |
| M2 利润 | 广告调整事件 | 重新计算分摊 |
| M1 Listing | 高曝光低转化关键词 | 提示 Listing 问题 |
| 通知 | 高优先级建议、阶段切换 | 推送 |

### 15.3 跨模块事件

```yaml
M3 触发：
  - 利润 ROAS < 1 → 创建 M2 漏点 L3
  - 关键词 CVR 低 → 提示 M1 优化 Listing
  - 自动执行失败连续 3 次 → 紧急通知

M3 接收：
  - M4 销量异常 → 重新生成该 SKU 建议
  - M2 改成本 → 重新计算保本 ACOS
  - M4C 竞品广告位变化 → 触发响应建议
```

---

## 16. 验收测试用例

### 16.1 周期识别

| TC | 用例 | 预期 |
|---|---|---|
| TC-M3-001 | 50 个真实 SKU 人工标 vs AI 标 | 准确率 ≥ 85% |
| TC-M3-002 | 阶段切换 7 天内识别 | 滞后 ≤ 7 天 |
| TC-M3-003 | 手动覆盖生效 | 立即所有策略适配 |
| TC-M3-004 | 数据不足 SKU 处理 | 标 'unknown' 不出错 |

### 16.2 建议生成

| TC | 用例 | 预期 |
|---|---|---|
| TC-M3-005 | 每日生成成功率 | ≥ 99%（除上游故障）|
| TC-M3-006 | 建议合理性人工评审 100 条 | ≥ 80% 合理 |
| TC-M3-007 | 阶段策略覆盖度 | 每个阶段策略库 ≥ 70% 触发过 |
| TC-M3-008 | 同范围 24h 不重复 | 100% |

### 16.3 自动执行

| TC | 用例 | 预期 |
|---|---|---|
| TC-M3-009 | safety_check 通过率 | 95%+ 一次通过 |
| TC-M3-010 | 失败重试 3 次后停 | 100% 触发暂停 |
| TC-M3-011 | 回滚 7 天内可用 | 100% |
| TC-M3-012 | 阈值超出拒绝 | 100% |

### 16.4 端到端

| TC | 用例 | 验证 |
|---|---|---|
| TC-M3-E2E-1 | 30 天真实店铺运行（自动模式） | 利润 ROAS 提升 ≥ 15% |
| TC-M3-E2E-2 | 30 天 ACOS 平均下降（成熟期 SKU） | ≥ 5 个百分点 |
| TC-M3-E2E-3 | 销售额不下降（同期对比） | ≥ 0%（不降）|
| TC-M3-E2E-4 | Prime Day 期间运行 | 备战策略生效，ROAS 高于平日均值 |

### 16.5 性能

| TC | 用例 | 目标 |
|---|---|---|
| TC-M3-P1 | 操作清单加载 | < 1s |
| TC-M3-P2 | 单建议生成响应 | < 5s |
| TC-M3-P3 | 批量执行 50 条 | < 30s |
| TC-M3-P4 | 全租户每日生成（1000 SKU） | < 10 分钟 |

---

## 17. 性能与扩展

### 17.1 性能目标

| 操作 | P95 |
|---|---|
| 操作清单加载 | < 1s |
| 单建议详情 | < 500ms |
| 单建议执行 | < 5s（含 Amazon API） |
| 批量执行 50 条 | < 30s |
| 周期识别（单 SKU） | < 3s |
| 全量周期识别（1000 SKU） | < 10 分钟 |

### 17.2 扩展性

- 建议生成：Worker pool（并行 SKU 处理）
- Amazon Ads API 调用：限流（依官方限制）+ 重试
- 自动执行：单租户串行，跨租户并行
- 历史数据：6 月 + 移到 ClickHouse 归档

### 17.3 成本

每个中卖（30 SKU、5 Campaign）月度后端：
- LLM 调用（每日生成 + 复核）：~$10-20
- ClickHouse / DB：~$5
- **合计 $15-25**

---

## 18. 实施 Checklist

开始 M3 开发前必须完成：

- [ ] Ads API 接入（Reports / Operations）
- [ ] AI 决策引擎
- [ ] M2 利润数据（Profit ROAS 依赖）
- [ ] 数据底座：ad_campaigns / ad_groups / keywords / ad_metrics_hourly
- [ ] 历史 90 天数据回填

M3 开发顺序：

1. Ads API ETL（campaigns / metrics / search terms）
2. 周期识别引擎（规则 + AI）
3. 单 Campaign / SKU 详情页（前端）
4. 操作建议生成器（每日批处理）
5. 操作清单页（前端）
6. 单建议执行 API（含 Amazon Ads API 调用）
7. 自动执行护栏 + safety check
8. 批量执行 + 跟踪
9. 否词 / 转手动管理
10. 分时段 / 位置策略
11. 活动备战
12. 5 轮自迭代质量门禁

---

> **本文档是 M3 模块的开发圣经。任何代码、测试、UI 必须以此为准。**
