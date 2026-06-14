# M3 整体功能进化与 AI 策略落地方案

- 日期：2026-05-25
- 作者：Codex
- 状态：阶段性演进方案；终局版已沉淀到 `docs/implementation/M3_ULTIMATE_AI_STRATEGY_OS.md`。后续关于“AI 策略系统”的顶层设计以终局版为准，本文件保留实施路线和中间形态参考。
- 关联文档：
  - `docs/modules/M3-lifecycle-ad-optimization.md`
  - `docs/M3_SPEC.md`
  - `docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md`
- 定位：把 M3 从“广告页面 + 策略库 + AI 建议列表”升级为“广告 AI 操盘系统”。本文不写代码，作为后续 M3 需求拆解、数据建模、AI 策略工程和 UI 调整的实施基线。

---

## 1. 结论先行

M3 不能只继续做“领星等价页面”或“更多广告报表”。领星的价值是完整操作面和数据细节；我们的差异化应该是把这些复杂页面压缩成“今天要做什么、为什么、执行后会怎样、错了怎么回滚”。

推荐的 M3 进化方向：

1. **领星等价层做底座**：保留完整广告实体、报表、详情弹层和操作能力，但不把它作为默认工作入口。
2. **AI 操作清单做默认入口**：用户每天进入 M3 第一眼看到“待处理动作”，而不是先钻 Campaign / Keyword / Targeting 表。
3. **策略库升级为 Strategy Studio**：每条策略不是静态卡片，而是可配置、可回测、可 dry-run、可观察、可自动化的“策略配方”。
4. **AI 引擎采用“规则/算法先行，LLM 做解释和编排”**：竞价、预算、否词等不能让 LLM 直接拍脑袋；LLM 负责诊断、排序、生成理由、发现遗漏、把策略变成人能读懂的方案。
5. **所有动作必须是 typed action + audit + rollback**：AI 可以越来越自动，但真实写动作必须先有结构化动作、护栏、审计和回滚能力。

一句话目标：

> M3 应让运营不用每天翻 20 张广告表，而是每天处理 5-15 张高质量 AI 操盘卡；每张卡都能解释、预览、执行、观察、复盘。

---

## 2. 当前 M3 的真实状态

### 2.1 已有优势

当前项目已经有几个很好的地基：

- `AdsHub.vue` 已经形成三层入口：AI 时间线、策略库、领星等价操作面。
- `StrategyLibrary.vue` 已有 9 大类策略概念：生命周期、类目、出价、预算、关键词、竞品、结构、跨模块、异常护栏。
- 后端已有 M3 持久化表：`ad_strategies`、`ad_suggestions`、`ad_manual_changes`、`lx_*` 等。
- `packages/domain/src/m3-advanced-engine.mjs` 已有 deterministic engines：
  - `optimizeBudgetAllocation`
  - `recommendDaypartingBids`
  - `recommendPlacementAdjustments`
  - `buildBrandDefensePlan`
  - `recommendCompetitorAsinAttacks`
  - `evaluateCreativeAbTest`
  - `evaluateAdvancedAutoExecutionGuardrails`
- Ads API 基础接入已具备 mock-gated 层级同步能力。
- 领星广告模块深度调研 v2 已明确真实 surface/tab/字段差异，可反哺 M3 数据模型。

### 2.2 当前主要问题

问题不是“页面不够多”，而是“工作流不够像操盘手”：

| 问题 | 表现 | 后果 |
|---|---|---|
| 默认入口偏报表 | 用户仍要自己判断先看哪个页面 | 不能显著节省运营时间 |
| 策略库偏静态 | 策略像配置清单，不像可运行系统 | 用户不知道启用后到底会发生什么 |
| AI 建议和真实数据 surface 未充分绑定 | 建议没有明确来自哪个详情 tab / 哪个数据源 | 难以接真数据和复盘 |
| 建议缺少生命周期 | pending -> accepted -> observing 有雏形，但缺少生成、预览、执行、观察、复盘全链路 | 无法沉淀策略成功率 |
| LLM prompt 太薄 | 只有 M3 suggestion / impact 两类 | 不足以支持诊断、批判、复盘、策略创建 |
| 自动化边界不够产品化 | 护栏有代码雏形，但 UI 上不像“可放心托管” | 用户不敢开自动 |

---

## 3. 新的 M3 产品架构

建议把 M3 分成五层，而不是一堆平级页面：

```text
M3 广告 AI 操盘系统
├─ L1 今日操盘台：今天该处理什么
├─ L2 策略工作室：长期规则、目标和自动化
├─ L3 领星等价操作面：完整广告结构和报表
├─ L4 复盘与学习：执行后效果、策略胜率、AI 贡献
└─ L5 数据与护栏：来源、新鲜度、权限、审计、回滚
```

### 3.1 L1 今日操盘台

这是 M3 默认页，替代“先看一堆表”的习惯。

核心卡片：

| 区块 | 内容 | 设计目标 |
|---|---|---|
| 今日最重要 5 件事 | 按利润影响和风险排序 | 用户 5 分钟知道今天先干什么 |
| 待审 AI 动作 | 可批量预览/执行/拒绝 | 半自动模式的主工作台 |
| 紧急刹车 | 烧钱、断货、预算耗尽、异常 CPC | 保护账户 |
| 增长机会 | 低 ACOS 扩预算、高转化词收割、竞品攻击 | 找增量 |
| 清理任务 | 否词、失效 campaign、重复关键词 | 降低浪费 |
| 观察中 | 已执行动作的 7/14/30 天结果 | 建立信任 |

每张操盘卡必须包含：

```text
action_type
entity_path: store / portfolio / campaign / ad_group / target / search_term
current_state
recommended_change
expected_impact
evidence
risk
guardrail_result
rollback_plan
source / freshness / confidence
```

### 3.2 L2 策略工作室 Strategy Studio

把策略库从“卡片列表”升级为“可运行配方”。

每条策略由 8 个部分组成：

| 部分 | 说明 |
|---|---|
| 目标 | 提升利润、扩量、止损、保排名、清库存、活动备战 |
| 适用范围 | 店铺、SKU、生命周期、Campaign 类型、广告产品 SP/SB/SD |
| 触发条件 | 指标阈值、趋势、事件、库存、促销、竞品变化 |
| 生成动作 | bid、budget、negative、promote、pause、placement、dayparting |
| 护栏 | 单次幅度、日次数、预算上限、库存、利润底线、黑名单 |
| 执行模式 | 只提示、半自动、自动、自动但高风险转人工 |
| 观察窗口 | 执行后 3/7/14/30 天如何判断成败 |
| 学习规则 | 成功率、误报、拒绝原因如何反哺策略 |

用户需要三个入口：

1. **模板库**：直接启用成熟策略。
2. **向导创建**：用户用自然语言说目标，例如“成熟期 ACOS 超 40% 的词帮我降价或否定”，系统转成策略草案。
3. **回测 / dry-run**：启用前用最近 30/60/90 天数据模拟会触发哪些动作、预计影响多少、风险在哪里。

### 3.3 L3 领星等价操作面

领星等价层不是删掉，而是从“默认入口”退到“证据与执行细节入口”。

后续要按 `LINGXING_AD_MODULE_DEEP_RECON_V2.md` 改造：

- `surfaceKey + adProduct + entityKind -> tabs`
- SP/SB/SD 字段差异
- daily / compare / hourly / placement / searchTerms / matchedTargets / attribution / overBudget / timeSeries / logs
- 每个 tab 显示 source、freshness、confidence、unavailableReason

AI 操盘卡点击“查看证据”时，应该能 deep-link 到对应领星等价 surface 和 tab，例如：

```text
建议：降低 sp_keyword bid 15%
证据入口：sp_keyword -> 天数据 / 对比分析 / 广告位 / 用户搜索词
```

### 3.4 L4 复盘与学习

M3 必须有“投后复盘”，否则 AI 策略不会进化。

建议新增三个视图：

| 视图 | 作用 |
|---|---|
| 动作复盘 | 单个动作执行前后 3/7/14/30 天变化 |
| 策略胜率 | 每条策略触发数、采纳率、成功率、回滚率、净利润贡献 |
| AI 贡献 | 本月 AI 带来的节省、增量销售、利润改善、避免浪费 |

成功判断不能只看 ACOS，需要按动作类型定义：

| 动作类型 | 成功标准 |
|---|---|
| 降 bid | 花费下降，订单不明显下降，利润 ROAS 提升 |
| 加预算 | 预算不再过早耗尽，销售/利润增量超过新增花费 |
| 否词 | 被否搜索词浪费消失，相关有效流量未被误杀 |
| 转手动 | 新手动词带来稳定订单，自动广告冗余下降 |
| 分时 | 低效时段花费下降，高效时段 CVR/ROAS 提升 |
| 广告位调整 | Top of Search 或 Product Page 的边际利润改善 |

### 3.5 L5 数据与护栏

用户信任 AI 的前提不是“解释很漂亮”，而是“数据可信、动作可控”。

每个建议必须展示：

- 数据来源：mock / Ads API / Marketing Stream / SP-API / M2 profit / M4 competitor / external rank
- 新鲜度：最后同步时间、报表日期、是否延迟
- 数据完整性：complete / partial / unavailable
- 置信度：数据置信 + 规则置信 + AI 置信分开
- 护栏结果：通过/降级/拒绝自动执行
- 回滚方式：可回滚/不可回滚/仅可人工恢复

---

## 4. AI 策略引擎落地设计

### 4.1 不让 LLM 直接决策金额

广告动作里最危险的是：

- bid 改多少
- budget 改多少
- pause 哪些对象
- 否定哪些词
- 扩哪些词

这些动作必须由规则和算法先算候选，再由 LLM 做：

1. 检查候选是否遗漏上下文。
2. 给候选排序。
3. 解释为什么。
4. 生成用户可读的操作卡。
5. 对异常和冲突提出问题。

推荐流水线：

```text
Data Snapshot
  -> Signal Detectors
  -> Rule/Algorithm Candidate Generator
  -> Impact Estimator
  -> Guardrail Checker
  -> LLM Reviewer & Explainer
  -> Action Card
  -> Human Review / Auto Executor
  -> Observation & Learning
```

### 4.2 AI 角色拆分

不一定真的要多进程多 Agent，但逻辑上要拆成 5 个角色：

| 角色 | 输入 | 输出 | 是否可用规则替代 |
|---|---|---|---|
| Diagnoser 诊断员 | surface metrics、趋势、异常 | 问题列表和原因假设 | 部分可替代 |
| Planner 策略规划员 | 问题、生命周期、策略库 | 动作候选和优先级 | 部分可替代 |
| Critic 风控员 | 动作候选、护栏、库存、利润 | 通过/降级/拒绝 | 必须规则优先 |
| Explainer 解释员 | 动作和证据 | 用户可读解释 | LLM 适合 |
| Reviewer 复盘员 | 执行前后数据 | 成败判断和学习建议 | 规则 + LLM |

### 4.3 Prompt 注册表扩展

当前 `packages/prompts/src/prompt-registry.mjs` 只有：

- `P-M3-SUGGESTION-GENERATE`
- `P-M3-IMPACT-ESTIMATE`

建议扩展为：

| Prompt ID | 目的 | 输入 | 输出 |
|---|---|---|---|
| `P-M3-CONTEXT-SUMMARIZE` | 把多 surface 数据压缩成上下文包 | entity snapshot | context brief |
| `P-M3-SURFACE-DIAGNOSE` | 诊断一个 campaign/target/search term 的问题 | metrics + lifecycle + profit | diagnoses[] |
| `P-M3-ACTION-PLAN` | 把诊断转成动作候选 | diagnoses + strategy templates | action_candidates[] |
| `P-M3-ACTION-CRITIC` | 从业务角度复核动作风险 | candidates + guardrail result | approved/downgraded/rejected |
| `P-M3-EXPLAIN-CARD` | 生成用户可读操盘卡 | typed action + evidence | title/summary/reason |
| `P-M3-STRATEGY-AUTHOR` | 自然语言创建策略草案 | user goal + schema | strategy draft |
| `P-M3-POST-ACTION-REVIEW` | 执行后复盘 | before/after metrics | verdict/learning |
| `P-M3-WEEKLY-OPERATOR-REPORT` | 周报/月报 | actions + metrics | report |

所有 prompt 输出必须是 JSON schema，不接受自由文本直接落库。

### 4.4 Typed Action Schema

AI 最终不能输出“建议优化一下”，必须输出结构化动作：

```json
{
  "actionId": "act_...",
  "actionType": "ADJUST_BID",
  "surfaceKey": "sp_keyword",
  "adProduct": "SP",
  "entityKind": "keyword",
  "entityId": "target_123",
  "entityPath": {
    "campaignId": "cmp_1",
    "adGroupId": "ag_1",
    "targetId": "kw_1"
  },
  "currentValue": { "bid": 1.2 },
  "recommendedValue": { "bid": 1.02 },
  "delta": { "bidPct": -0.15 },
  "reasonCodes": ["PROFIT_ROAS_BELOW_TARGET", "ENOUGH_CLICKS"],
  "evidenceRefs": [
    { "surfaceKey": "sp_keyword", "tabKey": "daily" },
    { "surfaceKey": "sp_keyword", "tabKey": "userSearchTerms" }
  ],
  "expectedImpact": {
    "spendDelta": -80,
    "salesDelta": -15,
    "profitDelta": 35
  },
  "guardrail": {
    "status": "needs_review",
    "reasons": ["bid_change_within_15pct", "inventory_ok"]
  },
  "rollback": {
    "reversible": true,
    "windowDays": 7
  }
}
```

### 4.5 Strategy Run 生命周期

建议新增“策略运行”概念，不要只存最终建议：

```text
strategy_run
├─ context_snapshot
├─ detected_signals
├─ candidate_actions
├─ impact_estimates
├─ guardrail_results
├─ llm_review
├─ published_action_cards
├─ execution_records
└─ observation_results
```

这能解决三个问题：

1. 为什么这条建议出现，可追溯。
2. 用户拒绝后，知道是规则错、数据错还是解释不清楚。
3. 策略胜率可以按真实运行数据计算。

---

## 5. 重点 AI 策略包

下面是建议优先落地的 10 个策略包。每个都应能模板化、dry-run、半自动执行、复盘。

### 5.1 新品 14 天冷启动包

| 项 | 内容 |
|---|---|
| 目标 | 快速拿到关键词/搜索词/ASIN 数据，不急于压 ACOS |
| 触发 | SKU 上架 < 30 天，评论少，广告数据不足 |
| 动作 | 自动广告四类定位、核心词 broad/phrase、预算保护、搜索词收集 |
| AI 作用 | 判断类目竞争强度、生成启动结构、解释为什么暂不强压 ACOS |
| 护栏 | 单日预算上限、库存天数、Listing 未达标则提示先做 M1 |
| 成功指标 | 有效搜索词数量、首单时间、可转手动候选数 |

### 5.2 自动转手动收割包

| 项 | 内容 |
|---|---|
| 目标 | 把自动广告中已验证搜索词迁移到手动精准/词组 |
| 触发 | 搜索词 N 点击 / N 单 / ACoS 低于目标 |
| 动作 | promote search term、建 exact/phrase、降低自动广告重复流量 |
| AI 作用 | 判断 match type、避免重复关键词、给出迁移理由 |
| 护栏 | 不删除原自动，先观察 7-14 天 |
| 成功指标 | 新手动词订单稳定，自动广告浪费下降 |

### 5.3 利润止血包

| 项 | 内容 |
|---|---|
| 目标 | 防止“销售 ROAS 看似正常但利润亏损” |
| 触发 | M2 profit ROAS < 1 或广告毛利为负 |
| 动作 | 降 bid、降预算、加否词、高风险暂停建议 |
| AI 作用 | 解释利润口径、识别是否归因延迟/库存/价格导致 |
| 护栏 | 暂停默认人工确认；bid/budget 自动幅度受限 |
| 成功指标 | 利润 ROAS 回升，销售不发生不可接受下滑 |

### 5.4 预算再分配包

| 项 | 内容 |
|---|---|
| 目标 | 总预算不变时，把钱从低边际利润 campaign 转到高边际利润 campaign |
| 触发 | 多 campaign 同时启用，预算受限或低效浪费 |
| 动作 | 调整 campaign daily budget / portfolio budget cap |
| AI 作用 | 解释预算转移逻辑，识别战略保护 campaign |
| 护栏 | 预算池上限、单周变化上限、活动期禁自动大幅调整 |
| 成功指标 | 总利润提升，预算耗尽时间改善 |

### 5.5 分时段和广告位优化包

| 项 | 内容 |
|---|---|
| 目标 | 按小时和 placement 调整出价 |
| 触发 | Marketing Stream 小时数据或 placement 数据足够 |
| 动作 | dayparting bid、placement bid adjustment |
| AI 作用 | 把 7x24 热力图解释成少数操作窗口 |
| 护栏 | 数据不足不自动；SB/SD 能力差异按产品限制 |
| 成功指标 | 无效时段花费下降，高效时段利润 ROAS 提升 |

### 5.6 品牌防御包

| 项 | 内容 |
|---|---|
| 目标 | 防止自有品牌词被竞品抢走 |
| 触发 | 品牌词排名下降、竞品出现、品牌词 ACOS 可控 |
| 动作 | SP exact、SB、SD 自家 ASIN 防御、预算保护 |
| AI 作用 | 判断哪些词是真品牌词，哪些只是泛词 |
| 护栏 | bid cap、品牌词名单人工确认 |
| 成功指标 | 品牌词展示/点击份额稳定，ACOS 在防御阈值内 |

### 5.7 竞品 ASIN 攻击包

| 项 | 内容 |
|---|---|
| 目标 | 对评分差、价格高、断货、Listing 弱的竞品发起 PT/SD 攻击 |
| 触发 | M4 竞品监控发现机会 |
| 动作 | SP product targeting、SD product targeting、竞品分组 |
| AI 作用 | 判断攻击理由和优先级，避免攻击强势竞品烧钱 |
| 护栏 | 小预算试投、观察期、ASIN 黑名单 |
| 成功指标 | 竞品 ASIN 流量转化、可接受 ACOS、增量订单 |

### 5.8 搜索词治理包

| 项 | 内容 |
|---|---|
| 目标 | 每周清理浪费词、收割好词、修复误否词 |
| 触发 | search term report / keyword detail / target detail |
| 动作 | add negative、promote keyword、remove negative candidate |
| AI 作用 | 区分无关词、低意图词、归因滞后词、品牌防御词 |
| 护栏 | 否词默认人工确认；品牌词/核心词禁止自动否定 |
| 成功指标 | 浪费花费下降，有效搜索词覆盖增加 |

### 5.9 库存保护包

| 项 | 内容 |
|---|---|
| 目标 | 断货前降低广告浪费，补货后恢复投放 |
| 触发 | M2 daysCover / inbound / sales velocity |
| 动作 | 降预算、降 bid、暂停扩量策略、恢复提醒 |
| AI 作用 | 解释为什么“卖得好也要降广告” |
| 护栏 | 清库期反向逻辑；新品期需人工确认 |
| 成功指标 | 断货浪费下降，补货后恢复速度 |

### 5.10 活动备战包

| 项 | 内容 |
|---|---|
| 目标 | Prime Day、黑五、Coupon、Deal 前后广告协同 |
| 触发 | 活动日历、促销创建、季节性 |
| 动作 | 预算扩张、核心词加投、活动后回收预算 |
| AI 作用 | 生成 T-14/T-7/T-1/T+1/T+7 时间表 |
| 护栏 | 库存、利润、预算池、活动后自动撤回 |
| 成功指标 | 活动期间销售/利润增长，活动后不继续烧钱 |

---

## 6. 数据模型调整建议

结合领星 v2 调研和 AI 策略落地，建议新增或升级以下逻辑表。SQLite 阶段可以先 JSON 化，后续再拆分析仓库。

### 6.1 surface 与证据

```text
ad_analysis_surfaces
- surface_key
- ad_product
- entity_kind
- supported_tabs
- supported_metrics
- source_requirements

ad_context_snapshots
- id
- entity_path
- surface_key
- date_range
- metrics_json
- source_json
- freshness_json
- confidence
```

### 6.2 策略运行

```text
ad_strategy_runs
- id
- strategy_id
- scope
- started_at
- finished_at
- status
- context_snapshot_ids
- detector_version
- prompt_versions
- summary

ad_action_candidates
- id
- run_id
- action_type
- entity_path
- current_json
- recommended_json
- evidence_refs_json
- impact_json
- guardrail_json
- llm_review_json
- state
```

### 6.3 执行与复盘

```text
ad_action_executions
- id
- candidate_id
- audit_id
- dry_run
- executor
- external_request_json
- external_response_json
- status
- executed_at
- rollback_json

ad_action_observations
- id
- execution_id
- window_days
- before_metrics_json
- after_metrics_json
- verdict
- profit_delta
- learned_notes
```

### 6.4 用户反馈与学习

```text
ad_ai_feedback
- id
- action_candidate_id
- user_id
- feedback_type: useful / wrong / too_risky / already_done / not_now
- reason
- created_at
```

---

## 7. UI/交互调整建议

### 7.1 M3 默认页重做为“今日操盘台”

当前 `AdsHub.vue` 的三体结构可以保留，但建议改为：

1. 顶部：今日需要处理的总数、预期利润影响、最高风险、数据新鲜度。
2. 第一屏：5 张最高优先级操盘卡。
3. 第二屏：策略运行状态、观察中动作、异常刹车。
4. 第三屏：进入策略工作室和领星等价操作面。

### 7.2 建议卡交互标准

每张建议卡固定 6 个按钮/入口：

| 入口 | 作用 |
|---|---|
| 预览变化 | 看 before/after diff |
| 查看证据 | deep-link 到分析 surface/tab |
| 执行 | 半自动确认后写入 audit |
| 批量加入执行篮 | 同类动作一起处理 |
| 暂缓/静音 | 不再重复骚扰 |
| 为什么 | AI 解释 + 数据依据 |

### 7.3 策略详情页重构

策略详情 drawer 建议分 6 个 tab：

1. 概览：目标、启用状态、主权等级、适用范围。
2. 触发条件：规则和数据源。
3. 动作模板：会生成什么 typed actions。
4. 护栏：自动化边界。
5. 回测：最近 N 天会触发什么。
6. 效果：触发数、采纳率、成功率、净利润贡献。

### 7.4 自然语言策略创建

新增入口：

```text
“告诉 AI 你想怎么管广告”
例如：
- 成熟期 ACOS 超过 35% 且 14 天没有订单的词，先建议降价，不要直接否定。
- 库存少于 10 天时，自动把非品牌词广告预算降 50%。
- Prime Day 前 7 天，给高转化词预算加 30%，但单 SKU 不超过 $100/天。
```

系统输出策略草案，必须经过：

1. 字段解析。
2. 风险提示。
3. dry-run。
4. 用户确认。
5. 默认半自动，不直接全自动。

---

## 8. 实施路线图

### Phase 1：先把“建议”变成标准动作

目标：不改大 UI，先补数据契约。

- 定义 `TypedAction` schema。
- `ad_suggestions` 增加或旁挂 `action_json`、`evidence_refs_json`、`guardrail_json`、`impact_json`。
- 所有现有 accept/reject/revert 继续可用。
- AI 卡片开始显示 source/freshness/confidence。

验收：

- 任意 M3 建议都能定位到实体、动作、证据、预期影响、护栏结果。

### Phase 2：引入 Strategy Run

目标：让策略不是静态，而是可运行。

- 新增 `ad_strategy_runs` 和 `ad_action_candidates`。
- 先用 mock/SQLite 数据跑 deterministic strategy。
- 每次策略运行生成候选动作，再发布为用户可见 suggestions。
- 保存 prompt version / engine version / context snapshot。

验收：

- 能回答“这条建议是哪条策略、哪次运行、基于哪些数据生成的”。

### Phase 3：改造 M3 首页和策略详情

目标：让系统更方便。

- `AdsHub` 改为“今日操盘台”。
- `StrategyLibrary` 增加策略详情 6 tab。
- 支持批量执行篮、预览、证据 deep-link。
- 已观察中动作集中展示。

验收：

- 用户从进入 M3 到处理完高优先级动作，不需要打开 Campaign 表。

### Phase 4：AI 策略工作室

目标：AI 不只给建议，还能帮助用户创建策略。

- 增加 `P-M3-STRATEGY-AUTHOR`。
- 自然语言生成策略草案。
- 生成 dry-run 结果。
- 默认半自动，禁止直接全自动。

验收：

- 用户能用一句话创建一个可运行策略，并看到过去 30 天模拟触发结果。

### Phase 5：接真实数据闭环

目标：从 mock-gated 走向真实可信。

- 接 Ads Reporting daily facts。
- 接 Marketing Stream hourly facts。
- 接 SP-API/M2 profit facts。
- 接 M4 competitor signals。
- 建 action observations 和 strategy success metrics。

验收：

- 每条执行过的 AI 动作都有 7/14/30 天复盘。

### Phase 6：逐步开放自动驾驶

目标：让用户敢托管。

建议按动作风险分级开放：

| 等级 | 动作 | 默认模式 |
|---|---|---|
| L1 | 生成报告、标记异常、建议清单 | 自动 |
| L2 | 降 bid 小于 10%、低风险预算下调 | 半自动，可配置自动 |
| L3 | 加预算、placement 调整、dayparting | 半自动 |
| L4 | 否词、暂停 campaign、创建新 campaign | 人工确认 |
| L5 | 删除、批量大改、真实结构迁移 | 禁止自动 |

---

## 9. 优先级建议

如果只做一个月，建议不要分散做页面，而是按这个顺序：

1. **TypedAction + EvidenceRefs**：让建议可执行、可解释、可追踪。
2. **今日操盘台**：让用户觉得“真的方便了”。
3. **Strategy Run**：让策略从静态配置变成可运行系统。
4. **领星 surface registry 接入**：避免后续真数据 tab/字段错。
5. **AI 策略工作室 MVP**：自然语言创建策略 + dry-run。
6. **执行后复盘**：用真实结果提升用户信任。

短期不要优先做：

- 更多静态报表页面。
- 复杂自定义规则 DSL。
- 全自动真实写操作。
- 没有数据闭环的“AI 大段文字分析”。

---

## 10. 验收指标

产品层：

- 用户每日处理 M3 的时间下降 50%。
- 每日高优先级建议数量控制在 5-15 条。
- 建议采纳率 > 40%，拒绝原因可分类。
- 用户点击“查看证据”的路径能落到正确 surface/tab。

业务层：

- 浪费花费下降。
- 利润 ROAS 提升。
- 预算耗尽时间改善。
- 断货前广告浪费下降。
- AI 动作 7/14/30 天复盘中成功率逐步提升。

安全层：

- 真实写动作 100% 有 audit。
- 高风险动作 100% 人工确认。
- 自动动作 100% 可追踪到策略运行和护栏结果。
- 支持回滚的动作 100% 展示回滚入口。

AI 层：

- LLM 输出 JSON schema 合法率 > 99%。
- LLM 不直接生成无护栏金额改动。
- 每个 prompt 有 version、输入摘要、输出、失败降级。
- 用户反馈能进入策略成功率和 prompt 评估。

---

## 11. 最终判断

M3 的下一阶段不应该是“把领星每个页面都照抄得更像”，而应该是：

1. 用领星等价层保证数据和操作深度；
2. 用策略工作室承载可配置的运营经验；
3. 用 AI 操盘台把复杂度压缩成每日少量高质量动作；
4. 用 typed action / guardrail / audit / rollback 保证可控；
5. 用执行后复盘让 AI 策略越来越准。

这样 M3 才能从“广告管理工具”进化成真正的“亚马逊广告 AI 操盘手”。
