# M3 终局版：广告 AI 策略操作系统

- 日期：2026-05-25
- 作者：Codex
- 状态：终局能力架构。已进一步收敛为通用性/合理性/易用性最终方案：`docs/implementation/M3_FINAL_AI_STRATEGY_OS_USABILITY_PLAN.md`。后续用户体验和顶层产品决策以最终方案为准，本文件保留策略操作系统的能力细节。
- 定位：替代“首批/次批策略包”的思路，把现有 M3 策略库整体升级为一个可运行、可解释、可回测、可审计、可自学习的广告 AI 策略操作系统。
- 关联：
  - `apps/web-v2/src/utils/mock-data-strategies.js`
  - `docs/modules/M3-lifecycle-ad-optimization.md`
  - `docs/M3_SPEC.md`
  - `docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md`
  - `docs/implementation/M3_EVOLUTION_AI_STRATEGY_PLAN.md`

---

## 0. 终局判断

不要把 M3 理解成“一组策略”。策略再多，如果只是列表，最终还是运营自己判断。终局版 M3 应该是一个 **广告策略操作系统**：

```text
业务目标
  -> 策略域 Policy Domains
  -> 信号层 Signals
  -> 决策图 Decision Graph
  -> typed actions
  -> 审计执行
  -> 效果复盘
  -> 策略自学习
```

现有 M3 策略库已经不只是 72 条，按源码当前读取是 **83 条策略 × 9 大类 × 35 种动作类型**。这些不应该再分“首批/次批”，而应该全部纳入同一个策略操作系统中，由系统根据目标、阶段、风险和数据置信度动态编排。

终局目标：

> 用户只配置业务目标和边界，M3 自动组合策略库，生成少量高质量操盘动作；每个动作都能追溯到策略、数据、证据页面、护栏、预期影响和复盘结果。

---

## 1. 现有 M3 策略库应被如何理解

### 1.1 九大策略域不是菜单，而是决策栈

当前策略库九大类：

| 域 | 当前数量 | 终局定位 |
|---|---:|---|
| A 生命周期 | 8 | 决定 SKU 当前广告目标：探索、扩量、守利、清退 |
| B 类目 | 5 | 决定类目基准、季节性、容忍阈值 |
| C 出价 | 13 | 对 bid、placement、dayparting、抢位做局部调参 |
| D 预算 | 7 | 在账号、portfolio、campaign 间分配有限预算 |
| E 关键词 | 10 | 管搜索词、关键词、否词、品牌词覆盖 |
| F 竞品攻防 | 6 | 响应竞品价格、库存、评分、BSR、跟卖 |
| G 广告结构 | 14 | 创建、演化、收敛、清理 campaign/adgroup/target 结构 |
| H 跨模块联动 | 8 | 联动 M1/M2/M4：库存、促销、Listing、评论、退款 |
| I 异常护栏 | 12 | 熔断、限流、冻结、跳过、紧急刹车 |

终局里，这九大类有优先级，不是平级：

```text
I 异常护栏
  > H 跨模块风险约束
  > B 类目/季节/市场约束
  > A 生命周期目标
  > D 预算分配
  > G 结构编排
  > E 关键词治理
  > C 出价/广告位/分时调参
  > F 竞品机会动作
```

解释：

- 如果库存不足、账户健康异常、Listing inactive，任何扩量策略都必须被压制。
- 如果生命周期是新品期，可以容忍 ACOS，但不能无限烧预算。
- 如果是成熟期，利润红线优先于排名冲刺。
- 如果是清仓期，广告目标可能不是 ROAS 最优，而是现金回收最大化。

### 1.2 35 种动作类型要收敛成 8 类动作原语

当前动作类型很多：`change_bid`、`change_budget`、`add_negative`、`promote_to_manual`、`create_structure`、`pause_all_for_sku`、`notify`、`clamp` 等。终局不应该让前后端到处处理 35 种散乱动作，而要抽象成 8 类动作原语：

| 动作原语 | 覆盖当前动作 | 风险 |
|---|---|---|
| `ADJUST_BID` | `change_bid`、`dayparting`、`change_placement_bid_adj` | 中 |
| `ADJUST_BUDGET` | `change_budget`、`reallocate_budget` | 中高 |
| `GOVERN_KEYWORD` | `add_negative`、`propagate_negative`、`promote_to_exact`、`promote_to_manual` | 高 |
| `CREATE_OR_EVOLVE_STRUCTURE` | `create_campaign`、`create_sd_campaign`、`create_structure`、`suggest_split` | 高 |
| `PAUSE_OR_THROTTLE` | `pause_all`、`pause_all_for_sku`、`pause_keyword`、`archive` | 高 |
| `SYNC_CONTEXT` | `data_sync`、`threshold_lookup`、`data_aggregate` | 低 |
| `CROSS_MODULE_TASK` | `cross_m1_listing`、`cross_m2_pricing`、`multi_action` | 中高 |
| `GUARDRAIL_ONLY` | `clamp`、`rate_limit`、`skip_all`、`skip_bid_change`、`skip_optimization` | 低到高 |

所有策略最终都必须输出这 8 类 typed action，而不是自由文本。

---

## 2. 终局产品形态

### 2.1 用户不直接管理 83 条策略

用户不应该每天看 83 条策略启停。终局 UI 应该是三层：

```text
第 1 层：业务目标
  利润优先 / 扩量优先 / 排名优先 / 防御优先 / 清库存 / 活动冲刺

第 2 层：策略组合
  系统根据目标自动选中和调权九大策略域

第 3 层：专家模式
  允许高级用户查看、编辑、回测单条策略
```

用户真正要配置的是：

| 配置 | 示例 |
|---|---|
| 全店目标 | 本月广告净利润最大化，ACOS 不超过 35% |
| SKU 目标 | 新品 A 允许亏损换排名；成熟品 B 严格守利润 |
| 风险偏好 | 自动降 bid 可以，自动加预算要确认，否词必须人工确认 |
| 预算池 | 品牌防御预算、增长预算、清仓预算、测试预算 |
| 禁区 | 品牌词不动、战略亏损词不动、活动期不自动暂停 |

### 2.2 默认入口：M3 Control Tower

终局默认页不是“广告总览”，而是 **M3 Control Tower**：

```text
今日结论
├─ 需要你确认的动作 8 个
├─ 已自动保护 3 个风险
├─ 正在观察 12 个动作
├─ 本周 AI 贡献：节省花费 / 增量销售 / 利润变化
└─ 数据健康：Ads 报表、Marketing Stream、M2 利润、M4 竞品
```

Control Tower 第一屏只回答四个问题：

1. 今天最值得做什么？
2. 什么风险已经被挡住？
3. 哪些动作需要我批准？
4. AI 最近做得对不对？

### 2.3 策略库变成 Strategy OS，不再是卡片仓库

策略库页面终局改成：

| 区域 | 功能 |
|---|---|
| 目标面板 | 当前店铺/SKU 的目标权重 |
| 策略栈视图 | 九大域按优先级堆叠，显示谁压制了谁 |
| 决策图 | 某条建议如何从信号一路走到动作 |
| 回测面板 | 过去 30/60/90 天会触发哪些动作 |
| 观察面板 | 该策略历史成功率、误杀率、回滚率 |
| 专家编辑 | 修改触发条件、护栏、观察窗口 |

---

## 3. 终局策略决策图

### 3.1 一条建议如何生成

终局流水线：

```text
1. Context Build
   聚合 SKU / campaign / target / search term / placement / hourly / profit / inventory / competitor

2. Signal Detect
   从九大域检测信号：生命周期、类目、预算、结构、关键词、竞品、跨模块、异常

3. Policy Match
   匹配当前启用策略，生成候选动作

4. Conflict Resolve
   处理扩量 vs 库存不足、抢位 vs 利润亏损、活动冲刺 vs 预算上限等冲突

5. Impact Estimate
   估算花费、销售、利润、风险、机会成本

6. Guardrail Gate
   自动通过、降级人工确认、拒绝、延迟执行

7. LLM Explain/Critic
   LLM 只解释和复核，不直接改金额

8. Publish Action Card
   进入今日操盘台或自动执行队列

9. Execute + Audit
   dry-run / manual / semi / auto，全部写审计

10. Observe + Learn
   3/7/14/30 天复盘，更新策略表现
```

### 3.2 冲突裁决规则

终局必须有“策略法院”。否则 83 条策略会互相打架。

| 冲突 | 裁决 |
|---|---|
| 成长期扩预算 vs 库存 < 14 天 | 库存保护胜出，扩预算降级为补货提醒 |
| 品牌词抢第 1 vs 日预算熔断 | 预算熔断胜出，但保留品牌防御最低预算 |
| 新品宽容期 vs 0 转化否词 | 新品宽容期胜出，只观察不否定 |
| 清仓促销扩量 vs 利润 ROAS 低 | 以现金回收目标重新计算，不用成熟期利润阈值 |
| 竞品攻击机会 vs Listing CVR 低 | 先触发 M1 Listing 修复，再小预算试投 |
| CPC 飙升暂停 vs 关键词抢位 | 异常护栏胜出，暂停或降级人工确认 |
| 活动冲刺加 bid vs 单日操作上限 | 活动策略可提高限额，但需提前配置 |

### 3.3 策略优先级公式

每个候选动作计算：

```text
priority_score =
  expected_profit_delta_weighted
  + risk_reduction_value
  + lifecycle_goal_alignment
  + urgency
  + confidence
  - execution_risk
  - data_staleness_penalty
  - user_fatigue_penalty
```

这能避免一个核心问题：系统生成太多建议，用户疲劳后全部忽略。

---

## 4. AI 在终局中的真正位置

### 4.1 AI 不是出价计算器

出价、预算、否词、暂停不能靠 LLM 直接“猜”。终局分工：

| 工作 | 规则/算法 | LLM |
|---|---|---|
| 计算 bid 改多少 | 主责 | 不直接决定 |
| 预算分配 | 主责 | 解释和发现约束 |
| 否词阈值 | 主责 | 判断语义相关性和误杀风险 |
| 生命周期分类 | 规则初判 | 边界复核 |
| 策略冲突裁决 | 主责 | 输出人话解释 |
| 新策略创建 | schema 约束 | 自然语言转策略草案 |
| 异常归因 | 规则检测 | 多原因解释 |
| 复盘总结 | 数据计算 | 结论归纳和学习建议 |

### 4.2 终局 AI 角色

| 角色 | 作用 | 产物 |
|---|---|---|
| Context Builder | 把领星 surface、Ads、M2、M4 数据打包 | `context_snapshot` |
| Signal Analyst | 找信号和异常 | `signals[]` |
| Strategy Composer | 从 83 条策略组合成方案 | `policy_matches[]` |
| Conflict Judge | 裁决策略冲突 | `conflict_result` |
| Action Writer | 生成 typed action | `action_candidate` |
| Risk Critic | 复核风险和护栏 | `guardrail_result` |
| Operator Explainer | 生成人能读懂的操盘卡 | `explanation` |
| Postmortem Analyst | 执行后复盘 | `observation_verdict` |
| Strategy Coach | 根据反馈优化策略 | `strategy_patch_suggestion` |

其中只有 Explainer / Postmortem / Strategy Coach 强依赖 LLM；其他都应可在无 LLM 时降级运行。

### 4.3 Prompt 终局清单

| Prompt | 终局用途 |
|---|---|
| `P-M3-CONTEXT-SUMMARIZE` | 压缩一个实体的多源数据 |
| `P-M3-SIGNAL-INTERPRET` | 解释检测到的信号是否真的重要 |
| `P-M3-CONFLICT-JUDGE-EXPLAIN` | 把策略冲突裁决解释给用户 |
| `P-M3-ACTION-CARD-WRITE` | 生成操盘卡标题、摘要、风险说明 |
| `P-M3-STRATEGY-AUTHOR` | 用户自然语言创建策略 |
| `P-M3-STRATEGY-REPAIR` | 根据失败复盘修策略 |
| `P-M3-POSTMORTEM` | 执行后复盘 |
| `P-M3-WEEKLY-OPERATOR-REPORT` | 周报/月报 |

所有 prompt 输出必须 JSON schema 化。LLM 输出永远不能直接绕过 typed action 和 guardrail。

---

## 5. 终局数据模型

### 5.1 核心实体

```text
StrategyTemplate
  系统内置策略模板，来自当前 83 条策略库

StrategyInstance
  用户启用后的策略实例，含 scope、目标、护栏、主权档

StrategyRun
  某次策略运行，保存输入快照、版本、状态

Signal
  生命周期、预算、关键词、竞品、库存、异常等信号

ActionCandidate
  候选 typed action，尚未执行

Decision
  冲突裁决和优先级排序结果

ActionExecution
  真实执行或 dry-run 记录

ActionObservation
  执行后效果复盘

StrategyLearning
  策略成功率、失败原因、用户反馈、建议修补
```

### 5.2 关键表建议

```text
ad_strategy_templates
ad_strategy_instances
ad_strategy_runs
ad_signals
ad_action_candidates
ad_action_decisions
ad_action_executions
ad_action_observations
ad_strategy_learning
ad_ai_feedback
ad_context_snapshots
```

现有 `ad_strategies` 可以先承担 `StrategyInstance`，但终局要区分 template 和 instance；否则系统内置策略和用户改过的策略会混在一起。

### 5.3 每个动作必须引用证据

结合领星深度调研，建议每个 `ActionCandidate` 包含：

```json
{
  "evidenceRefs": [
    {
      "surfaceKey": "sp_keyword",
      "tabKey": "daily",
      "metricKeys": ["clicks", "spend", "orders", "acos", "profitRoas"]
    },
    {
      "surfaceKey": "sp_keyword",
      "tabKey": "userSearchTerms",
      "metricKeys": ["searchTerm", "orders", "acos"]
    }
  ]
}
```

证据入口示例：

| 动作 | 证据 surface |
|---|---|
| 降关键词 bid | `sp_keyword` daily/compare/userSearchTerms |
| 商品投放优化 | `sp_product_target` daily/placement/userSearchTerms |
| SD 目标优化 | `sd_product_target` daily/matchedTargets |
| 调整 campaign 预算 | `sp_campaign` timeSeries/overBudget/daily |
| 分时调价 | campaign/keyword hourly |
| 广告位调整 | placement tab |
| 操作复盘 | logs + daily/compare |

---

## 6. 终局策略编排：从“策略列表”到“策略图”

### 6.1 九大域如何协作

```text
I 异常护栏
  - 先判断是否熔断、限流、跳过

H 跨模块
  - 读取库存、利润、Listing、评论、退款、促销

B 类目
  - 给出类目基准和季节因子

A 生命周期
  - 决定当前阶段主目标

D 预算
  - 给出预算池和边际 ROI 分配

G 结构
  - 判断广告结构是否匹配阶段目标

E 关键词
  - 做搜索词收割、否词、品牌词保护

C 出价
  - 做 bid / placement / dayparting 调参

F 竞品攻防
  - 在风险可控时叠加攻击/防御动作
```

注意 F 竞品攻防放在最后，不是因为不重要，而是它最容易烧钱。竞品攻击必须建立在库存、利润、Listing、预算都允许的基础上。

### 6.2 一个 SKU 的终局决策示例

```text
SKU: 成长期
数据：ROAS 高，预算 14 点耗尽，库存 12 天，核心词排名掉到第 5，竞品降价

策略触发：
- A 成长期扩量
- D 预算耗尽 +20%
- C 关键词抢位 top3
- H 库存 <14 天降 bid
- F 对手价格变化跟随

冲突裁决：
- 库存保护压制扩量：不加预算
- 核心词抢位降级为“维持当前 bid，不再提高”
- 竞品降价转交 M2 做价格利润测算
- 生成 M2 补货任务 + M3 观察卡

最终输出：
- 不执行加预算
- 不执行抢位加 bid
- 生成补货/价格联动建议
- 标记“库存恢复后自动重评”
```

这才像操盘手，而不是机械触发“预算耗尽就 +20%”。

---

## 7. 终局自动驾驶模式

不要简单分手动/半自动/全自动。终局应按动作和风险分层授权：

| 模式 | 名称 | 能做什么 |
|---|---|---|
| L0 | 观察员 | 只看数据和异常 |
| L1 | 建议员 | 生成操盘卡，不执行 |
| L2 | 助理 | 用户批量确认后执行 |
| L3 | 托管低风险 | 自动执行低风险动作，如数据同步、限流、部分小幅降 bid |
| L4 | 托管带审批 | 中风险动作先排队，超过阈值人工确认 |
| L5 | 紧急保护 | 熔断类动作可自动执行，但必须立刻通知并可回滚 |

动作默认授权：

| 动作 | 默认 |
|---|---|
| data_sync / notify / threshold_lookup | L3 |
| clamp / rate_limit / skip | L3 |
| 小幅降 bid | L2-L3 |
| 加 bid / 加预算 | L2 |
| dayparting / placement | L2 |
| 否词 | L2，品牌/核心词禁止自动 |
| 创建结构 | L1-L2 |
| 暂停 campaign | L2，紧急场景 L5 |
| 删除 | 禁止自动 |

---

## 8. 终局 UI

### 8.1 Control Tower 第一屏

```text
M3 Control Tower
├─ 今日优先动作：8
├─ 自动保护：3
├─ 观察中：12
├─ 数据健康：Ads 2h / Stream 15m / M2 1h / M4 6h
├─ 本周 AI 贡献：节省 $X / 增量利润 $Y / 避免风险 $Z
└─ 自动驾驶模式：L2 助理
```

### 8.2 单张操盘卡

必须固定结构：

```text
标题：为什么现在要做
动作：具体改什么，从多少到多少
证据：来自哪个 surface/tab
影响：花费、销售、利润、排名、库存
风险：可能误杀/归因延迟/库存不足
护栏：通过了哪些、哪些导致降级
回滚：如何恢复
按钮：执行 / 放入批量篮 / 暂缓 / 拒绝 / 查看证据 / 修改策略
```

### 8.3 Strategy OS 页面

不是策略卡片瀑布流，而是：

```text
左：九大策略域堆栈
中：策略图和冲突裁决
右：当前目标、护栏、自动驾驶等级
下：回测结果和历史胜率
```

### 8.4 “问 AI”不是聊天，而是策略编辑器

用户输入：

> 我希望成熟期 SKU 不要盲目扩量，只有利润 ROAS 大于 1.8 且库存超过 30 天时才允许加预算。

系统输出：

- 解析后的策略实例
- 将影响哪些 SKU/campaign
- 过去 60 天会触发几次
- 预计哪些动作会被取消
- 风险提示
- 默认保存为半自动

---

## 9. 终局实施顺序

这不是“首批策略、次批策略”，而是操作系统建设顺序。

### 9.1 先建策略内核

必须先做：

1. `StrategyTemplate` / `StrategyInstance` 分离。
2. 现有 83 条策略迁移成 template。
3. 8 类 typed action schema。
4. 策略优先级和冲突裁决。
5. Guardrail gate。

### 9.2 再建运行链路

1. `StrategyRun`
2. `Signal`
3. `ActionCandidate`
4. `Decision`
5. `ActionExecution`
6. `ActionObservation`

### 9.3 再改 UI

1. `AdsHub` 改 Control Tower。
2. `StrategyLibrary` 改 Strategy OS。
3. 操盘卡支持证据 deep-link。
4. 批量执行篮。
5. 观察中和复盘入口。

### 9.4 最后接真实自动化

1. Ads API 报表。
2. Marketing Stream 小时数据。
3. M2 利润和库存。
4. M4 竞品/评论/异常。
5. 审计中心二次确认和回滚。
6. 逐步开放 L3-L5。

---

## 10. 判断一个策略是否“终局可用”

每条策略必须满足 12 个问题：

1. 它服务哪个业务目标？
2. 适用哪些生命周期？
3. 需要哪些数据源？
4. 数据延迟时是否可运行？
5. 生成哪类 typed action？
6. 与哪些策略可能冲突？
7. 冲突时谁优先？
8. 最大损失半径是多少？
9. 是否可回滚？
10. 观察窗口是多少？
11. 成功和失败如何判断？
12. 用户拒绝后如何学习？

不能回答这 12 个问题的策略，不应该进入自动化，只能作为人工建议。

---

## 11. 最终答案

终局版 M3 不是“83 条策略全部展示给用户”，也不是“AI 每天写一堆建议”。它应该是：

```text
一个以业务目标为入口、
以 83 条策略库为策略素材、
以领星等价 surface 为证据底座、
以 typed action 为执行语言、
以 guardrail/audit/rollback 为安全边界、
以 observation/learning 为进化机制的广告 AI 操作系统。
```

这套系统最终让运营从“看报表和调参数的人”变成“设目标、审关键动作、看复盘的人”。

M3 的真正护城河不是某一条策略，而是：

- 能把生命周期、利润、库存、Listing、竞品、广告结构、搜索词、预算、异常全部放进同一个决策图；
- 能解释为什么某些策略被触发、被压制、被降级；
- 能在执行后证明自己做对了还是做错了；
- 能从用户拒绝和真实效果里继续学习。

这就是 M3 的终极形态：**广告 AI 策略操作系统，而不是广告策略列表。**
