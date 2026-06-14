# M3 最终方案：通用、合理、易用的广告 AI 策略操作系统

- 日期：2026-05-25
- 作者：Codex
- 状态：最终顶层方案 + 2026-05-25 已落地本地 mock/sandbox 可验证闭环。后续 M3 的 AI 策略、产品交互、数据建模、自动化边界，以本文为最高优先级参考。
- 关联：
  - `docs/implementation/M3_ULTIMATE_AI_STRATEGY_OS.md`
  - `docs/implementation/M3_EVOLUTION_AI_STRATEGY_PLAN.md`
  - `docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md`
  - `docs/modules/M3-lifecycle-ad-optimization.md`
  - `docs/M3_SPEC.md`

---

## 0. 最终结论

M3 的最终形态不是“83 条策略展示给用户”，也不是“AI 聊天生成广告建议”，而是一个 **目标驱动的广告 AI 操作系统**。

最终产品心智必须极简：

```text
我想达成什么目标？
系统允许怎么动？
今天需要我批哪些动作？
执行后到底有没有变好？
```

因此，最终 M3 只暴露给普通用户 4 个东西：

1. **目标**：利润优先、扩量优先、排名优先、防御优先、清库存、活动冲刺。
2. **边界**：预算上限、库存红线、品牌词保护、自动化等级、不可动对象。
3. **操盘卡**：每天少量、明确、可执行、可解释、可回滚的动作。
4. **复盘**：AI 做了什么、赚/省了多少、哪里做错、下次怎么改。

底层仍然保留完整复杂度：

- 83 条 M3 策略资产；
- 9 大策略域；
- 35 种动作类型；
- 领星等价 surface/tab/field；
- Ads API、Marketing Stream、M2 利润、M4 竞品、M1 Listing；
- typed action、guardrail、audit、rollback、observation。

但这些复杂度默认不展示给用户。用户看到的是“目标、边界、动作、结果”。

---

## 1. 三轮迭代后的收敛

### 1.1 第一轮：能力最大化方案

第一轮方案把 M3 设计成 Strategy OS：

- 把 83 条策略纳入统一操作系统；
- 九大策略域形成决策栈；
- 35 种动作收敛为 8 类 typed action；
- 加入策略运行、冲突裁决、审计、复盘。

这个方案能力完整，但有一个风险：**对用户来说仍然太像后台规则引擎**。如果 UI 直接展示九大域、决策图、动作原语，普通运营会感觉系统很强但不好用。

第一轮结论：

> 能力架构正确，但不能作为用户心智直接暴露。

### 1.2 第二轮：通用性方案

第二轮重点看通用性：系统不能只适合某一个账号、某个类目、某个广告类型、某个 ERP 页面。

收敛原则：

- 不以 SP/SB/SD 页面为产品入口，而以业务目标为入口。
- 不以领星 URL 为模型核心，而以 `surfaceKey + adProduct + entityKind` 做证据映射。
- 不以 ACOS 单指标做策略判断，而以利润、库存、生命周期、预算、竞品、Listing、评论共同裁决。
- 不以某条策略为主角，而以目标和边界自动编排策略。

第二轮结论：

> 通用性来自“目标/边界/动作/证据”的抽象，而不是来自更多固定策略模板。

### 1.3 第三轮：易用性方案

第三轮只问一个问题：用户每天怎么更省事？

如果用户还需要：

- 看 83 条策略；
- 理解九大域优先级；
- 自己判断哪个 surface 有证据；
- 自己区分哪些动作安全；
- 每天处理几十条建议；

那 M3 仍然失败。

最终易用性原则：

1. 默认不展示策略库，默认展示“今日操盘台”。
2. 每天高优先级动作控制在 5-15 条。
3. 操盘卡必须用人话说明“做什么、为什么、风险、预期、不做会怎样”。
4. 所有复杂解释都可以展开，但不强迫用户先理解。
5. 任何自动化都必须可暂停、可回滚、可追踪。

第三轮结论：

> M3 的终局不是让用户更懂广告系统，而是让用户更少需要钻广告系统。

---

## 2. 最终产品架构

最终架构分 5 层，但用户主要接触前 2 层：

```text
L1 用户心智层：目标 + 边界 + 今日动作 + 复盘
L2 操盘交互层：Control Tower + 操盘卡 + 执行篮 + 观察中
L3 策略编排层：Goal Profile + Strategy Graph + Conflict Judge
L4 数据证据层：领星等价 surface + Ads/M2/M4/M1 数据
L5 安全执行层：typed action + guardrail + audit + rollback
```

### 2.1 L1 用户心智层

普通用户只需要理解：

| 问题 | 产品表达 |
|---|---|
| 我现在想要什么？ | 目标模式 |
| 系统能动到什么程度？ | 自动化等级和边界 |
| 今天我要处理什么？ | 今日操盘卡 |
| AI 做得对吗？ | 复盘和贡献 |

### 2.2 L2 操盘交互层

核心页面：

```text
M3 Control Tower
├─ 今日必须处理
├─ 系统已自动保护
├─ 等待你批准
├─ 正在观察
├─ 本周 AI 贡献
└─ 数据健康
```

### 2.3 L3 策略编排层

这里才使用 83 条策略、九大域、冲突裁决、优先级公式。

用户一般不直接看，只有高级用户进入专家模式。

### 2.4 L4 数据证据层

领星等价页面和深度弹层是证据层，不是默认工作层。

每张操盘卡都能跳到证据：

```text
操盘卡 -> 查看证据 -> 对应 surface/tab/metric
```

### 2.5 L5 安全执行层

所有动作必须走：

```text
typed action -> guardrail -> dry-run/confirm -> audit -> execute -> observation -> rollback
```

---

## 3. 最终用户体验

### 3.1 首次启用只问 5 个问题

不要让用户配置 83 条策略。首次启用 M3 只问：

| 问题 | 示例选项 |
|---|---|
| 你的主要目标是什么？ | 利润优先 / 扩量优先 / 排名优先 / 防御优先 / 清库存 / 活动冲刺 |
| 你的风险偏好是什么？ | 保守 / 平衡 / 激进 |
| 哪些东西绝对不能乱动？ | 品牌词、核心 campaign、战略亏损词、活动 campaign |
| 预算边界是什么？ | 全店日预算、Portfolio 月预算、SKU 上限 |
| 自动化允许到哪一步？ | 只建议 / 批量确认 / 低风险自动 / 紧急保护自动 |

问完后，系统自动生成：

- 目标画像 `GoalProfile`
- 护栏画像 `GuardrailProfile`
- 策略实例 `StrategyInstances`
- 自动化等级 `AutomationLevel`
- 禁区 `ProtectedEntities`

### 3.2 每天默认只看一屏

Control Tower 第一屏：

```text
今天广告建议：

1. 必须确认：6 个动作，预计影响 +$420 利润 / -$180 浪费
2. 已自动保护：3 个风险，避免断货前继续烧广告
3. 正在观察：12 个动作，其中 8 个表现正常，2 个需回滚关注
4. 数据健康：Ads 2h 前，Stream 15m 前，利润 1h 前，竞品 6h 前
```

用户不需要先选择广告活动、不需要先进报表、不需要理解策略库。

### 3.3 操盘卡统一格式

每张卡必须固定：

| 区块 | 内容 |
|---|---|
| 结论 | “建议把 X 的竞价从 1.20 降到 1.02” |
| 原因 | “30 天 260 点击 1 单，利润 ROAS 0.7，且非品牌词” |
| 预期 | “预计每月少花 $80，销售影响小，利润 +$35” |
| 风险 | “可能误伤长尾词；归因窗口仍有 2 天延迟” |
| 证据 | “查看 sp_keyword / userSearchTerms / daily” |
| 操作 | 执行 / 放入执行篮 / 暂缓 / 拒绝 / 修改策略 |
| 回滚 | “7 天内可恢复原竞价” |

### 3.4 执行篮比逐条执行更重要

用户每天不应该点 30 次确认。应有执行篮：

```text
加入执行篮
  -> 系统合并同类动作
  -> 显示总影响
  -> 显示风险清单
  -> 一次确认
  -> 分批执行
  -> 失败自动停止后续同类动作
```

### 3.5 “问 AI”不是聊天框，而是操作解释器

用户可以问：

- 为什么不加预算？
- 为什么这个词不直接否定？
- 如果我更激进，会发生什么？
- 这条策略过去 30 天表现怎么样？
- 我想把成熟品改成利润优先，系统会取消哪些动作？

AI 必须回答到结构化对象，不只是文字。

---

## 4. 最终通用性设计

### 4.1 不绑定领星，但吸收领星深度

领星调研给我们的不是 UI 复制清单，而是数据能力边界：

- campaign 有 timeSeries、overBudget、placement、logs；
- target/keyword 有 daily、compare、hourly、placement、userSearchTerms；
- SD target/audience 有 matchedTargets；
- 不同 surface 的 tab 和字段不一样。

终局系统用 `EvidenceRef` 抽象，不绑定某个页面：

```json
{
  "surfaceKey": "sp_keyword",
  "tabKey": "userSearchTerms",
  "entityKind": "keyword",
  "metricKeys": ["clicks", "orders", "acos", "profitRoas"]
}
```

这样未来可以接：

- 领星等价 UI；
- Amazon Ads API；
- Marketing Stream；
- 自建分析仓库；
- 第三方排名数据。

### 4.2 不绑定广告产品

SP/SB/SD 差异通过能力注册表解决：

```text
surface registry:
  supported_tabs
  supported_metrics
  supported_actions
  source_requirements
  unavailable_reason
```

策略只声明需要什么能力，不声明具体页面。

例如：

```text
策略需要 search term evidence
  SP keyword -> userSearchTerms
  SP product target -> userSearchTerms
  SD product target -> matchedTargets
```

### 4.3 不绑定卖家规模

同一系统支持三类卖家：

| 卖家 | 默认体验 |
|---|---|
| 新手/小卖 | 只看 Control Tower，不看策略库 |
| 成熟运营 | 用执行篮、证据、复盘、目标切换 |
| 大卖/团队 | 进入 Strategy OS，做预算池、权限、回测、自定义策略 |

复杂度按需展开，不一上来压给所有人。

### 4.4 不绑定某个类目

类目差异放进 `CategoryProfile`：

- 平均 CTR/CVR/CPC/ACOS；
- 盈亏平衡 ACOS；
- 季节性；
- 退货率；
- 客单价；
- 促销敏感度；
- 类目竞争强度。

策略只读类目画像，不写死类目阈值。

---

## 5. 最终合理性设计

### 5.1 广告决策必须承认不确定性

广告数据有天然问题：

- 归因延迟；
- 小样本波动；
- 时区差异；
- 预算耗尽导致数据偏差；
- 搜索词和关键词不是一一对应；
- 销售 ROAS 和利润 ROAS可能冲突；
- 活动期数据不能直接外推。

因此每个动作必须有：

```text
confidence = data_confidence × rule_confidence × impact_confidence × reversibility_score
```

低置信动作不应该自动执行。

### 5.2 样本不足时不做激进动作

规则：

| 情况 | 动作 |
|---|---|
| 点击不足 | 只观察，不调价 |
| 订单不足 | 不做否词，只降权或标记 |
| 新品期 | 不用成熟期 ACOS 阈值 |
| 归因窗口未结束 | 降低置信度 |
| 数据源过期 | 不执行真实写动作 |

### 5.3 冷却期比聪明更重要

广告系统最怕频繁改动。

每类动作要有冷却期：

| 动作 | 建议冷却 |
|---|---|
| bid 调整 | 48-72 小时 |
| budget 调整 | 24-72 小时 |
| 否词 | 7 天观察 |
| 新 campaign 结构 | 14 天观察 |
| 活动策略 | 按活动时间线 |
| 暂停/恢复 | 强审计，避免来回抖动 |

### 5.4 扩量和止损不能用同一套判断

终局要先识别目标，再判断动作：

| 目标 | 判断重点 |
|---|---|
| 利润优先 | profit ROAS、净利润、浪费花费 |
| 扩量优先 | 边际 ROI、预算耗尽、库存可承接 |
| 排名优先 | 关键词排名、IS、战略亏损阈值 |
| 防御优先 | 品牌词覆盖、竞品入侵、Buy Box |
| 清库存 | 现金回收、库龄、促销协同 |
| 活动冲刺 | 活动窗口、库存、预算回收计划 |

同一个 ACOS 数字，在不同目标下含义不同。

### 5.5 高风险动作永远不能因“AI 很自信”而自动

高风险动作包括：

- 删除；
- 大批量暂停；
- 创建复杂结构；
- 大幅加预算；
- 品牌词否定；
- 核心 campaign 改结构；
- 竞品攻击大预算。

这些动作最多进入执行篮，不能直接自动。

---

## 6. 最终系统对象

### 6.1 用户可理解对象

| 对象 | 用户理解 |
|---|---|
| Goal Profile | 我现在的广告目标 |
| Guardrail Profile | 系统不能越过的边界 |
| Action Card | 今天建议我做的一件事 |
| Execution Basket | 我准备批量批准的一组动作 |
| Observation | AI 执行后观察结果 |
| AI Contribution | AI 贡献了多少 |

### 6.2 系统内部对象

| 对象 | 系统用途 |
|---|---|
| StrategyTemplate | 内置 83 条策略资产 |
| StrategyInstance | 用户启用后的策略实例 |
| StrategyRun | 某次策略运行 |
| Signal | 检测到的业务信号 |
| ConflictDecision | 冲突裁决 |
| ActionCandidate | 候选动作 |
| TypedAction | 标准执行语言 |
| EvidenceRef | 证据链接 |
| GuardrailResult | 护栏结果 |
| AuditRecord | 审计记录 |
| ObservationResult | 复盘结果 |

---

## 7. 最终自动化等级

不要只说手动/半自动/全自动。最终用 5 档：

| 等级 | 名称 | 用户感受 | 系统行为 |
|---|---|---|---|
| L1 | 只读观察 | 只告诉我 | 只生成异常和报告 |
| L2 | AI 助理 | 我批量确认 | 生成执行篮，用户确认后执行 |
| L3 | 低风险托管 | 小事自动做 | 小幅降 bid、限流、数据同步可自动 |
| L4 | 条件托管 | 中风险先排队 | 加预算、分时、placement 进入审批 |
| L5 | 紧急保护 | 危险时先救火 | 熔断、断货保护、账户风险可自动，但必须通知和可回滚 |

默认建议：

- 新用户默认 L2。
- 有真实凭证但未完成 30 天复盘前，不开 L3。
- L4/L5 必须显示风险协议和回滚能力。

---

## 8. 最终页面结构

### 8.1 M3 首页：Control Tower

必须有：

1. 今日结论。
2. 待批准动作。
3. 自动保护记录。
4. 观察中动作。
5. 数据健康。
6. AI 贡献。

不应默认展示：

- 83 条策略；
- 复杂报表表格；
- 领星式完整广告列表；
- prompt 或模型调用细节。

### 8.2 动作详情页

必须有：

- 业务解释；
- 数据证据；
- 预期影响；
- 风险；
- 护栏；
- 回滚；
- 修改策略入口。

### 8.3 Strategy OS 专家页

只给高级用户：

- 九大域栈；
- 策略启停；
- 回测；
- 冲突裁决；
- 历史胜率；
- 自然语言策略创建；
- 策略版本管理。

### 8.4 领星等价页

定位：

- 查证据；
- 看完整表；
- 做人工深挖；
- 处理复杂异常；
- 查看操作日志。

不是默认日常入口。

---

## 9. 最终实施顺序

这是系统建设顺序，不是策略分批。

### 9.1 先让建议变得“可执行且可信”

必须先做：

- TypedAction；
- EvidenceRef；
- GuardrailResult；
- ImpactEstimate；
- RollbackPlan；
- Confidence。

没有这些，AI 建议只是文字。

### 9.2 再做 Control Tower

把 M3 默认入口改成：

- 今日待批；
- 自动保护；
- 观察中；
- 数据健康；
- AI 贡献。

### 9.3 再做策略运行链路

补：

- StrategyRun；
- Signal；
- ConflictDecision；
- ActionCandidate；
- ActionObservation。

### 9.4 再把 83 条策略迁移成模板/实例

把 `ad_strategies` 拆成：

- 系统内置模板；
- 用户启用实例；
- 用户改动版本；
- 策略历史表现。

### 9.5 再做专家模式 Strategy OS

包括：

- 回测；
- 自然语言建策略；
- 冲突裁决图；
- 胜率/回滚率/误杀率。

### 9.6 最后逐步提高自动化等级

基于真实复盘结果开：

- L3 低风险托管；
- L4 条件托管；
- L5 紧急保护。

---

## 10. 最终验收标准

### 10.1 易用性

- 新用户 5 分钟内完成 M3 启用。
- 每日默认只需处理 5-15 张操盘卡。
- 用户不进入策略库也能完成日常广告优化。
- 每张卡 10 秒内能看懂“做什么”和“为什么”。
- 用户可以一键把同类动作加入执行篮。

### 10.2 通用性

- 同一套策略系统支持 SP/SB/SD。
- 同一套动作 schema 支持 bid、budget、否词、结构、暂停、跨模块任务。
- 同一套 EvidenceRef 可映射领星等价页面、Amazon Ads API、Marketing Stream、M2/M4 数据。
- 同一套 GoalProfile 支持新品、成长、成熟、衰退、活动、清仓、防御。

### 10.3 合理性

- 小样本不自动激进操作。
- 归因未完成时降低置信度。
- 生命周期不同，阈值不同。
- 高风险动作不自动。
- 所有自动动作有冷却期。
- 所有真实写动作有审计。

### 10.4 可学习

- 每个执行动作都有观察窗口。
- 每条策略有采纳率、拒绝率、成功率、回滚率。
- 用户拒绝原因进入策略学习。
- AI 周报能说明自己做对和做错的地方。

---

## 11. 最终一句话

M3 最终方案是：

> 以用户目标为入口，以安全边界为约束，以策略库为底层能力，以领星等价数据为证据，以 typed action 为执行语言，以 Control Tower 为日常界面，以复盘学习为进化机制的广告 AI 操作系统。

它不是策略列表，不是聊天机器人，不是报表系统，也不是领星复制品。

它应该让用户从“每天翻表调广告”变成：

```text
设目标
看今日关键动作
批量确认
看系统保护了什么
看复盘结果
必要时钻到证据页
```

这就是兼顾通用性、合理性和易用性的最终 M3。

---

## 11. 2026-05-25 首轮开发落地记录

本轮不是新增一批策略，而是把最终方案中的“动作契约 + 操盘台心智”先落到系统中，确保以后接入真实 Amazon / 领星数据时不会忘记目标需求。

### 11.1 已落地的后端契约

`apps/api/src/data-store-ads.mjs` 在 `rowToSuggestion()` 兼容式派生以下字段：

| 字段 | 作用 | 当前来源 |
|---|---|---|
| `typedAction` | 将散乱建议收敛为 8 类动作原语，包含实体路径、当前值、建议值、delta、dry-run、审计要求 | legacy suggestion + 规则推断 |
| `evidenceRefs` | 把旧证据映射成 `surfaceKey/tabKey/entityKind/metricKeys`，未来可直连领星等价页、Ads API 或自建仓库 | legacy evidence + surface 推断 |
| `guardrail` | 输出通过/复核/阻断、自动化等级、风险、原因、预算/库存/保护实体 gate | 动作类型 + 置信度 + 严重度 |
| `rollback` / `rollbackPlan` | 给出可回滚性、回滚窗口、回滚方式、是否人工复核 | 动作原语 |
| `impactEstimate` | 标准化 30 天 USD 影响估算，保留 legacy `impact` | legacy impact |
| `sourceMeta` | 标记 mock/seed、新鲜度、证据数量、真实写入状态 | 当前 mock 数据源 |
| `confidenceBreakdown` | 数据、规则、影响、回滚、护栏、最终置信度拆解 | 规则估算 |

关键原则：**不先做破坏性 DB migration**。旧 SQLite 里已有的 `ad_suggestions` 行无需重建，也能返回新契约。真实数据接入后可以再把这些字段持久化为 JSON 列或独立 action 表。

### 11.2 已落地的前端心智

- `AdsHub.vue` 改为 **M3 Control Tower**：今日必须处理、系统已自动保护、等待批准、正在观察、AI 贡献、数据健康。
- `SuggestionCard.vue` 在卡片上直接显示 TypedAction、Guardrail、EvidenceRef 数量、Rollback、Source freshness。
- `SuggestionDrawer.vue` 增加标准动作契约、EvidenceRef 映射、来源与置信度拆解，保留原证据链和替代方案。
- `AdsTimeline.vue` 采纳建议时把 typed action / guardrail / rollback 一并带入审计 payload。

### 11.3 当前仍然保持的边界

- 真实 Amazon Ads 写入仍关闭；本轮所有动作仍是 dry-run / audit-first。
- 当前 `EvidenceRef` 是从 mock evidence 推断，不代表真实领星 URL 已完成逐页深链。
- 当前 `confidenceBreakdown` 是规则估算，不是训练好的模型评分。
- 执行篮在首轮记录时仍是 UI 语义；后续已落为 `ad_action_queue` / `ad_action_runs`，见第 12 节。

### 11.4 验证结果

- `node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs`：164/164 PASS。
- `npm.cmd run build`：PASS。
- `npm run build` 在 PowerShell 被执行策略拦截，不是项目构建错误。

### 11.5 下一步建议

1. 已完成：新增 `ad_action_queue` / `ad_action_runs`，把“加入执行篮”从提示变成可批量确认、dry-run 执行、记录 run、可回滚的真实状态机。
2. 已完成：将 EvidenceRef 与前端 router 参数打通，实现“查看证据”直接跳到对应证据面。
3. 已完成：增加 GoalProfile / GuardrailProfile 雏形，用户只配置目标和边界，不直接配置 83 条策略。
4. 待真实数据接入后：把 `sourceMeta` 从 mock 改为 adapter freshness，并让 `confidenceBreakdown.data` 反映真实数据完整性。

---

## 12. 2026-05-25 可验证闭环落地记录

本节记录最终方案从“设计文档”进入可验证产品闭环后的状态。开发目标不是新增一批策略，而是确保未来接入真实 Amazon Ads / SP-API / 领星等价数据时，M3 仍按“目标、边界、操盘卡、证据、执行、复盘”的目标需求开发。

### 12.1 后端闭环

- `ad_action_queue`：承载执行篮条目，保存 suggestion snapshot、typed action、evidence refs、guardrail、rollback、impact、source 和 confidence。
- `ad_action_runs`：记录每次单条或批量执行结果；当前仅 dry-run / mocked write，不触发真实 Amazon 写入。
- `ad_goal_profiles`：保存店铺级目标档案，字段包括主要目标、风险偏好、自动化等级、保护实体、预算/出价边界、护栏策略、证据策略。
- `GET/PUT /api/v1/store/ads/goal-profile`：用于读取/更新目标档案；即使请求 `realWriteEnabled=true`，后端也强制落为 `false`。
- `GET/POST/DELETE/approve/execute/revert/execute-batch` action queue API：覆盖入篮、批准、移除、执行、批量执行、回滚、run history。
- `rowToSuggestion()` 会按 GoalProfile 重新派生 guardrail：保护对象、动作原语、变化幅度、最低置信度、证据数量都会进入 `guardrail.reasons` / `gates` / `profileSnapshot`。

### 12.2 前端闭环

- `AdsHub.vue`：Control Tower 增加执行篮 KPI、目标档案卡片、利润优先 / 护栏增长快捷配置。
- `AdsTimeline.vue`：增加执行篮卡片、批量 dry-run、刷新闭环；单条“执行此动作”也必须先入篮、必要时批准，再 dry-run 执行后进入观察期。
- `SuggestionDrawer.vue`：EvidenceRef 支持“跳到证据”，使用后端 `routePath/routeQuery` 跳转到对应证据面。
- `useAdsState.js`：新增 `useActionQueue()` 与 `useGoalProfile()` 单例 composable，保持 fetch 单飞、乐观更新、失败回滚。
- `ads-timeline.js`：补齐 action queue 与 goal profile API client。

### 12.3 真实数据接入后的不变契约

真实数据接入时只替换 adapter 与 freshness，不应改变以下契约：

| 契约 | 不变要求 |
|---|---|
| `typedAction` | 所有建议必须转为标准动作原语，不能只给自然语言建议 |
| `EvidenceRef` | 必须指向可追溯证据面，至少包含 surface/tab/entity/metric/router |
| `GoalProfile` | 用户配置目标和边界，策略库在后台动态编排 |
| `Guardrail` | 高风险、低置信、保护实体、超预算/超 bid 幅度必须复核或阻断 |
| `ActionQueue` | 任何写-like 动作先入篮/审计/dry-run，再按权限进入真实适配器 |
| `Rollback` | 每个动作必须说明如何撤销或为什么无需撤销 |
| `Observation` | 执行后进入观察期，避免同类动作重复触发 |

### 12.4 三轮以上测试-证明-修复

| 迭代 | 开发内容 | 证明 |
|---|---|---|
| 1 | 后端 action queue / action runs / dry-run / batch / revert | `node --test --test-concurrency=1 tests/qa/m3-button-level.test.mjs` 166/166 PASS |
| 2 | Timeline + Control Tower 执行篮前端闭环 | `npm.cmd run build` PASS；M3 QA 166/166 PASS |
| 3 | EvidenceRef 深链 + GoalProfile/GuardrailProfile API + guardrail profile snapshot | `npm.cmd run build` PASS；M3 QA 169/169 PASS |
| 4 | Timeline 刷新、单条执行经执行篮、目标档案快捷配置稳定化 | `node --check` PASS；`npm.cmd run build` PASS；M3 QA 169/169 PASS |

### 12.5 当前完成口径

当前 M3 已形成本地 mock/sandbox 下的完整闭环：

```text
GoalProfile
  -> Strategy OS 派生建议契约
  -> EvidenceRef 深链
  -> Guardrail 判定
  -> ActionQueue 入篮/批准/批量 dry-run
  -> AuditLog / ActionRun
  -> Observation / Revert
```

下一步不是再设计策略包，而是接真实 Ads Reporting、Marketing Stream、SP-API、M2 利润/库存、M4 竞品/评论信号，并把这些信号接入同一契约。
