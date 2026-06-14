# 领星广告模块完整深度调研与真实数据开发需求报告 v2（Codex）

- 日期：2026-05-25
- 作者：Codex，只读调研
- 范围：领星左侧栏“广告”模块内的广告组合、广告活动、广告组、广告、投放、SP/SB/SD 子页面、用户搜索词、否定对象、预算上限等页面；重点仍以行级“分析/柱状图”入口打开的详情弹层为核心。
- 非范围：不研究左侧栏其它模块（店铺、词、工具、分析、DSP、结构、实时、商机、AMC）；不执行任何真实广告写操作。
- 本报告定位：完整调研版 v2，补充并修正 `docs/implementation/LINGXING_AD_MODULE_REQUIREMENTS_CODEX.md` 的 v1 结论。v1 对 `a1/a2` 的纠偏仍有效，但 v2 增加了 SP/SB/SD 子页面差异、更多详情类型、行级入口风险地图和未来真实数据建模要求。

---

## 0. 安全与证据

### 0.1 只读原则

本轮调研只执行以下动作：

- 页面跳转到领星广告模块内的只读列表页。
- 点击行级“分析/柱状图”入口打开详情弹层。
- 点击详情弹层内的 tab、只读子 tab（如天/周/月、小时汇总/小时明细、广告位/广告商品/广告位+广告商品、按时段/超预算记录/告警等）。
- 读取 DOM、截图、Network 请求参数和响应字段摘要。

本轮未点击：

- 保存竞价、应用建议竞价、启停、批量调价、创建广告、删除、导入、上传、应用策略、应用规则、添加到抢位、添加到词库等写入口。

风险结果：

- `deep-complete` 每页 `riskyDelta=0`。
- `deep-complete-remaining` Network 风险复核 `remaining risky = 0`。
- 本轮继续保持真实广告账号 0 写操作。

### 0.2 证据目录

- 用户截图：`D:\amz\tmp\keyscreen\a1.png`、`D:\amz\tmp\keyscreen\a2.png`
- 第一轮核心证据：`D:\amz\tmp\recon-ad-only\target-row-analysis\`
- 六页面 sweep：`D:\amz\tmp\recon-ad-only\six-surface-sweep\`
- 本轮完整页面 sweep：`D:\amz\tmp\recon-ad-only\deep-complete\FULL_SUMMARY.json`
- 本轮补充页面 sweep：`D:\amz\tmp\recon-ad-only\deep-complete-remaining\SUMMARY.json`
- 本轮 Network 重点复核：`D:\amz\tmp\recon-ad-only\deep-network-key\SUMMARY.json`
- 行级图标风险地图：`D:\amz\tmp\recon-ad-only\deep-complete\ICON_RISK_MAP.md`
- 自动汇总文本：`D:\amz\tmp\recon-ad-only\deep-complete\ANALYSIS_SUMMARY_UTF8.md`

### 0.3 覆盖声明

本报告中的“完整”指：在领星左侧栏“广告”模块内，完成 35 个广告相关 surface 的只读进入、列表识别、行级分析入口识别、可点击分析弹层 tab 识别，并对重点 surface 做 Network 复核。

它不包含以下高风险动作的真实执行：保存竞价、应用预算、启停、创建、删除、导入、上传、批量修改、应用规则、应用策略、添加到词库、添加到抢位。文中“未观察到行级详情”的页面，含义是本轮已经进入该广告页面并检查列表/首行入口，但没有观察到与 `to-compare-data-list` 同类的可用 MCompare 分析弹层；这不是说这些页面不属于广告模块，而是说它们应按列表/设置/管理能力建模，不应强行套详情弹层。

仍需在真实 Amazon 数据接入后复核的部分：

- 指标计算口径是否与 Amazon Ads Reporting / Marketing Stream / SP-API 最终字段完全一致。
- 归因窗口、时区、币种、数据延迟与领星当前展示是否逐项对齐。
- 写动作工作流只能在 sandbox、dry-run、审计、回滚能力完成后再验证。

---

## 1. 总结论

### 1.1 不能再用“一个 target 类型”概括所有投放详情

领星广告模块的详情 tab 不是只由实体类型决定，而是由以下维度共同决定：

1. 顶层页面/route family：例如 `/profile/target/index`、`/keyword/profile/index`、`/target/profile/index`、`/sd/all_target/index`。
2. 广告产品：SP、SB、SD。
3. 实体类型：campaign、ad group、ad、keyword、product target、auto target、search term、placement、audience 等。
4. 详情入口所在主表：同样叫“投放”，在“全部投放”和“SP 商品投放”中 tab 不同。

因此我们自己的前端不能只写：

```js
target: ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms']
```

更准确的设计应是：

```js
surfaceKey + adProduct + entityKind -> tabs
```

例如：

- `all_target`：`天数据 / 对比分析 / 小时数据 / 广告位`
- `sp_keyword`：`天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词`
- `sp_product_target`：`天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词`
- `sp_auto_target`：`天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词`
- `sb_keyword`：`天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词`
- `sd_product_target`：`天数据 / 对比分析 / 匹配的目标`
- `sd_audience`：`天数据 / 对比分析 / 匹配的目标`

### 1.2 v1 纠偏仍成立，但要加限定词

v1 中最重要的纠偏是：用户截图 `a1/a2` 对应的是“全部投放”页的 `投放详情`，它只有 4 个 tab，没有 `用户搜索词`。

v2 补充：

- “全部投放”的 `投放详情`确实只有 4 tab。
- 但 SP 关键词、SP 商品投放、SP 自动定位组、SB 关键词这些子页面的详情确实有 `用户搜索词` tab。
- 所以后续代码不能简单说“target 没有用户搜索词”，也不能简单说“target 都有用户搜索词”；必须按 surface 区分。

### 1.3 SP/SB/SD 三套广告产品差异很大

- SP：最完整，campaign 有 9 tab；关键词/商品投放/自动定位组有 5 tab。
- SB：campaign 是 6 tab，含小时和超预算，但没有本轮观察到的归因期、时间序列、重点关键词；关键词有 5 tab；指标多品牌新客、视频、品牌搜索。
- SD：campaign 是 5 tab，但没有小时数据、超预算、广告位；SD ad/ad group 只有 2 tab；SD 商品投放/受众是 3 tab，第三 tab 是`匹配的目标`，不是广告位或用户搜索词；指标多可见次数、vCPM、触达、频次、VTR/vCTR。

---

## 2. 广告模块导航全貌

### 2.1 顶层“全部”入口

在 `a1` 所在广告模块中，顶部第一层包括：

| 入口 | URL family | 说明 |
|---|---|---|
| 广告组合 | `/ad_report/portfolio/profile/list` | Portfolio 聚合 |
| 广告活动 | `/ad_report/profile/campaign/index` | 全部广告活动，混合 SP/SB/SD |
| 广告组 | `/ad_report/ad_group/profile/index` | 全部广告组 |
| 广告 | `/ad_report/ad/profile/index` | 全部广告/商品广告 |
| 投放 | `/ad_report/profile/target/index` | 全部投放，`a1/a2` 所在页 |
| 用户搜索词 | `/ad_report/search_term_st/profile/index` | ST 维度入口 |

### 2.2 SP 广告子入口

| 入口 | URL family | 行级详情 |
|---|---|---|
| 广告活动 | `/ad_report/campaign/index/index` | 9 tab |
| 广告组 | `/ad_report/ad_group/profile/index` | 3 tab |
| 广告位 | `/ad_report/placement/profile/index` | 3 tab |
| 广告 | `/ad_report/ad/profile/index` | 3 tab |
| 自动投放 | `/ad_report/target/auto/index` | 5 tab |
| 关键词 | `/ad_report/keyword/profile/index` | 5 tab |
| 商品投放 | `/ad_report/target/profile/index` | 5 tab |
| 否定词 | `/ad_report/negative_keyword/profile/list` | 未观察到行级分析详情；有操作日志类图标 |
| 否定投放 | `/ad_report/negative_target/profile/list` | 未观察到行级分析详情 |
| 用户搜索词 | `/ad_report/search_term_st/profile/index` 等子页 | 2 tab |
| 预算上限 | `/ad_report/profile/index/setting` | 偏设置页，本轮只读进入，不点保存 |

### 2.3 SB 广告子入口

| 入口 | URL family | 行级详情 |
|---|---|---|
| 广告活动 | `/ad_report/headline/index/index` | 6 tab |
| 广告组 | `/ad_report/headline/all_ad_group/list` | 3 tab |
| 广告创意 | `/ad_report/headline/all_product_ad/list` | 3 tab |
| 广告位 | `/ad_report/headline/all_placement/index` | 3 tab |
| 关键词 | `/ad_report/headline/headline_all_keyword/index` | 5 tab |
| 商品投放 | `/ad_report/headline/all_target/index` | 本轮列表有分析列，但未观察到可点击详情入口 |
| 否定词 | `/ad_report/headline/all_negative_keyword/index` | 未观察到行级分析详情 |
| 否定投放 | `/ad_report/headline/all_negative_target/index` | 未观察到行级分析详情 |
| 用户搜索词 | `/ad_report/headline/all_keyword_search_term/index` | 2 tab |
| 归因于广告的购买 | `/ad_report/headline/all_purchased_asin/list` | 未观察到行级分析详情 |

### 2.4 SD 广告子入口

| 入口 | URL family | 行级详情 |
|---|---|---|
| 广告活动 | `/ad_report/sd/index/index` | 5 tab |
| 广告组 | `/ad_report/sd/all_ad_group/index` | 2 tab |
| 广告 | `/ad_report/sd/all_product_ad/index` | 2 tab |
| 商品投放 | `/ad_report/sd/all_target/index` | 3 tab |
| 否定投放 | `/ad_report/sd/all_negative_target/index` | 未观察到行级分析详情 |
| 受众浏览 | `/ad_report/sd/all_audience/index` | 3 tab |
| 匹配的目标 | `/ad_report/sd/all_match_target/index` | 未观察到行级分析详情，是明细列表页 |

---

## 3. 完整详情 tab 矩阵

| 页面 key | 详情标题 | 已验证 tab |
|---|---|---|
| `all_portfolio` | 广告组合详情 | 天数据 / 对比分析 |
| `all_campaign` | 广告活动详情 | 天数据 / 对比分析 / 小时数据 / 超预算分析 / 归因期分析 / 广告位 / 时间序列 / 重点关键词 / 溯源（日志） |
| `all_adgroup` | 广告组详情 | 天数据 / 对比分析 / 小时数据 |
| `all_ad` | 广告详情 | 天数据 / 对比分析 / 小时数据 |
| `all_target` | 投放详情 | 天数据 / 对比分析 / 小时数据 / 广告位 |
| `all_search_term_st` | 用户搜索词详情 | 天数据 / 对比分析 |
| `sp_campaign` | 广告活动详情 | 天数据 / 对比分析 / 小时数据 / 超预算分析 / 归因期分析 / 广告位 / 时间序列 / 重点关键词 / 溯源（日志） |
| `sp_placement` | 广告位详情 | 天数据 / 对比分析 / 小时数据 |
| `sp_auto_target` | 自动定位组 | 天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词 |
| `sp_keyword` | 关键词详情 | 天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词 |
| `sp_product_target` | 商品投放详情 | 天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词 |
| `sp_search_term_asin` | 用户搜索词详情 | 天数据 / 对比分析 |
| `sp_keyword_search_term` | 用户搜索词详情 | 天数据 / 对比分析 |
| `sp_product_target_st` | 用户搜索词详情 | 天数据 / 对比分析 |
| `sp_auto_search_term` | 用户搜索词详情 | 天数据 / 对比分析 |
| `sb_campaign` | SB广告活动详情 | 天数据 / 对比分析 / 小时数据 / 超预算分析 / 广告位 / 溯源（日志） |
| `sb_adgroup` | 广告组详情 | 天数据 / 对比分析 / 小时数据 |
| `sb_creative` | 广告详情 | 天数据 / 对比分析 / 小时数据 |
| `sb_placement` | 广告位详情 | 天数据 / 对比分析 / 小时数据 |
| `sb_keyword` | Sponsored Brands Keyword | 天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词 |
| `sb_search_term` | 用户搜索词详情 | 天数据 / 对比分析 |
| `sd_campaign` | SD广告活动详情 | 天数据 / 对比分析 / 归因期分析 / 时间序列 / 溯源（日志） |
| `sd_adgroup` | 广告组详情 | 天数据 / 对比分析 |
| `sd_ad` | 广告详情 | 天数据 / 对比分析 |
| `sd_product_target` | 商品投放详情 | 天数据 / 对比分析 / 匹配的目标 |
| `sd_audience` | 商品投放详情 | 天数据 / 对比分析 / 匹配的目标 |

未观察到行级详情的页面：

- `sp_negative_keyword`
- `sp_negative_target`
- `sp_budget_setting`
- `sb_product_target`
- `sb_negative_keyword`
- `sb_negative_target`
- `sb_purchased_asin`
- `sd_negative_target`
- `sd_match_target`

说明：这些页面不是没有价值，而是本轮未观察到和 `to-compare-data-list` 同类的行级分析弹层。它们仍需作为列表/设置/否定对象管理能力纳入广告模块，但不应强行套用 MCompare 弹层。

---

## 4. a1/a2：全部投放 `投放详情`最终结论

### 4.1 页面身份

用户截图 `a1` 对应：

- 页面：`all_target`
- URL family：`/ad_report/profile/target/index`
- 行对象：混合投放对象，如 SP keyword、SB keyword 等。
- 详情标题：`投放详情`
- tab：`天数据 / 对比分析 / 小时数据 / 广告位`

### 4.2 为什么它不是 SP 关键词详情

虽然示例行是 `slushie machine` 关键词，但入口来自“全部投放”页 `/profile/target/index`，而不是 SP 子页 `/keyword/profile/index`。

区别：

| 页面 | URL | 详情标题 | tab |
|---|---|---|---|
| 全部投放 | `/ad_report/profile/target/index` | 投放详情 | 4 tab，无用户搜索词 |
| SP 关键词 | `/ad_report/keyword/profile/index` | 关键词详情 | 5 tab，有用户搜索词 |
| SP 商品投放 | `/ad_report/target/profile/index` | 商品投放详情 | 5 tab，有用户搜索词 |
| SP 自动投放 | `/ad_report/target/auto/index` | 自动定位组 | 5 tab，有用户搜索词 |

### 4.3 开发要求

`all_target` 必须作为独立 surface 建模：

```js
all_target: ['daily', 'compare', 'hourly', 'placement']
```

不能把它和 `sp_keyword`、`sp_product_target`、`sp_auto_target` 合并成一个 `target` 配置。

---

## 5. Campaign 详情深挖

### 5.1 SP / 全部广告活动：9 tab

SP campaign 和“全部广告活动”中打开的 SP 行，本轮均观察到 9 tab：

1. 天数据
2. 对比分析
3. 小时数据
4. 超预算分析
5. 归因期分析
6. 广告位
7. 时间序列
8. 重点关键词
9. 溯源（日志）

#### 天数据

字段：日期、备注、预算、竞价策略（SP 子页有）、IS（SP 子页有）、曝光量、点击、点击%、CTR、CPC、花费、花费%、广告销售额、广告销售额%、直接销售额、ACoS、广告订单、直接订单、CPA、CVR、广告笔单价、广告销量。

控件：日期范围、天/周/月、导出。

开发要求：

- campaign 日维度必须保存预算快照和竞价策略快照。
- `IS` 不是所有 campaign 页面都有，但 SP 子页有，应作为可选字段。
- 天/周/月是重新聚合，不是前端改标签。

#### 对比分析

字段分两段周期展示，并支持环比/同比：曝光、点击、CTR、CPC、花费、销售额、直接销售额、ACoS、订单、直接订单、CPA、CVR、笔单价、销量等。

控件：统计口径（总和/日均/有曝光天数平均）、自定义时段对比、分析、导出。

开发要求：

- 两段数据必须保证相同实体、相同币种、相同归因窗口、相同时区。
- 变化率分母为 0 时必须显示 `--`。

#### 小时数据

字段：小时段、曝光、点击、点击%、CTR、CPC、花费、花费%、销售额、销售额%、直接销售额、ACoS、订单、直接订单、CPA、CVR、笔单价、销量。

控件：小时汇总 / 小时明细。

开发要求：

- 依赖 Amazon Marketing Stream 或同等小时数据源。
- 不允许用日数据平均到 24 小时伪造。

#### 超预算分析

字段：小时段、预算调整次数、超预算天数、近 7 天广告商品店铺销量。

控件：只查看超预算的、按时段、超预算记录、告警、导出。

开发要求：

- 超预算不是单纯 `spend > budget`，还要结合“预算耗尽时间/超预算状态/预算调整事件”。
- 需要 Marketing Stream 的小时花费、campaign budget snapshot、状态事件、店铺销量。
- `告警`是读视图入口，本轮只点击 tab，不创建告警。

#### 归因期分析

字段：时期、广告订单、广告订单占比、销售额、点击、销量、花费、ACoS、CPA、CVR。

时期包括：当天成交、7 天成交、14 天成交、30 天成交。

开发要求：

- 需要报表支持多 attribution window，或者同步不同归因窗口数据。
- 页面明确存在归因滞后，不能把当天数据当最终值。

#### 广告位

字段：广告位、广告组合、广告活动竞价策略、竞价调整、曝光、点击、点击%、CTR、CPC、花费、销售额、直接销售额、ACoS、订单、CPA、CVR、笔单价、销量。

控件：位置筛选、企业购。

开发要求：

- campaign 的广告位不是只看 placement 结果，还要带 bid strategy / placement bid adjustment。

#### 时间序列

截图显示它是 campaign 专属重视图：

- 顶部指标卡：点击、曝光、花费、广告销售额、直接销售额、订单、直接订单、广告销量、直接销量、店铺订单、店铺销售额等。
- 图上叠加：日累计花费、预算、预算使用比例、超预算时段、操作日志。
- 有时间轴缩放。

开发要求：

- 需要小时级 spend、budget snapshot、操作日志、店铺订单/销售额。
- 是“预算诊断 + 日内节奏 + 操作影响”视图，不是普通折线图。

#### 重点关键词

观察到：

- SP campaign 有图形/表格切换。
- 展示一组被监控/抢位/重点跟踪的关键词，例如 slushie machine 等。
- 若无监控关键词，会显示空状态。

开发要求：

- 重点关键词不是广告报表天然字段，需要来自用户配置、抢位策略、AI 策略或监控任务。
- 需要关联排名/坑位/搜索词表现。

#### 溯源（日志）

字段：操作时间(US)、操作员、广告活动、广告组、操作对象、对象详情、功能来源、操作类型、操作前的数据、操作后的数据、备注、是否成功。

控件：领星 / 亚马逊、日期、操作来源、操作类型、显示下级对象的记录、显示图表、调整前后数据对比。

开发要求：

- 我们系统内所有写动作必须落审计中心和操作日志。
- 外部改动通过 sync-diff 识别，标记为 Amazon/外部来源。
- 操作前/后数据必须结构化保存，不能只保存字符串。

### 5.2 SB campaign：6 tab

SB campaign 详情为：

1. 天数据
2. 对比分析
3. 小时数据
4. 超预算分析
5. 广告位
6. 溯源（日志）

差异：

- 没有观察到归因期分析、时间序列、重点关键词 tab。
- 指标增加品牌新客、视频和品牌搜索：品牌新客订单/销售额/销量、视频完播次数、5 秒观看次数、VTR、vCTR、品牌搜索次数。
- 小时数据页面提示：Amazon Stream 仅提供 SB2 类型的数据，非 SB2 类型暂无法提供小时数据。

开发要求：

- SB 小时数据要按 campaign/ad type 能力判断，不是所有 SB 都可用。
- SB 数据模型必须支持 video metrics 和 branded search metrics。

### 5.3 SD campaign：5 tab

SD campaign 详情为：

1. 天数据
2. 对比分析
3. 归因期分析
4. 时间序列
5. 溯源（日志）

差异：

- 没有观察到小时数据、超预算分析、广告位、重点关键词。
- 指标增加可见次数、vCPM、VTR、vCTR、品牌搜索次数、累计触达用户、平均触达次数。
- SD campaign 的时间序列仍存在，但字段体系偏 display/触达。

开发要求：

- SD 不能套 SP/SB 的 hourly/placement 模型。
- SD 必须支持 viewability/reach/frequency 指标。

---

## 6. 投放/关键词/商品投放/自动投放详情

### 6.1 全部投放 `all_target`：4 tab

字段族：

- 天数据：竞价、建议竞价、曝光、点击、点击%、CTR、CPC、花费、花费%、广告销售额、销售额%、直接销售额、ACoS、订单、直接订单、CPA、CVR、笔单价、销量、品牌新客。
- 对比分析：两周期同字段对比。
- 小时数据：小时汇总/明细，依赖 Marketing Stream。
- 广告位：广告位/广告商品/广告位+广告商品。

Network：

- `/ad_report/profile/target/detail`
- `/ad_report/profile/target/comparision_new`
- `/ad_report/profile/target/comparewithsameperiod`
- `/ad_report/profile/target/hour_data`
- `/ad_report/profile/target/placement_hour`

### 6.2 SP 关键词 `sp_keyword`：5 tab

详情标题：关键词详情。

Tab：天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词。

字段特点：

- 主表和详情包含匹配方式、建议竞价、竞价、搜索排行、IS。
- 用户搜索词 tab 在详情内展示由该关键词触发的用户搜索词表现。

Network：

- `/ad_report/keyword/profile/detail`
- `/ad_report/keyword/profile/comparision_new`
- `/ad_report/keyword/profile/comparewithsameperiod`
- `/ad_report/keyword/index/hour_data`
- `/ad_report/keyword/index/placement_hour`
- `/ad_report/keyword_search_term/profile/index`

### 6.3 SP 商品投放 `sp_product_target`：5 tab

详情标题：商品投放详情。

Tab：天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词。

字段特点：

- 选中行是 ASIN/category target，例如 `asin="B0..."`。
- 某些视图字段比关键词更精简，可能与当前列配置/对象类型有关，例如只显示订单、花费、销售额、ACoS。
- 用户搜索词 tab 仍存在，可分析商品投放产生的搜索词。

Network：

- `/ad_report/target/profile/detail`
- `/ad_report/target/profile/trend`
- `/ad_report/target/profile/comparision_new`
- `/ad_report/target/profile/comparewithsameperiod`
- `/ad_report/target/index/hour_data`
- `/ad_report/target/index/placement_hour`
- `/ad_report/target/search_term/index`

### 6.4 SP 自动投放 `sp_auto_target`：5 tab

详情标题：自动定位组。

Tab：天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词。

对象示例：紧密匹配、宽泛匹配、同类商品、关联商品等自动定位组。

Network：

- `/ad_report/target/auto/detail`
- `/ad_report/target/auto/trend`
- `/ad_report/target/auto/comparision_new`
- `/ad_report/target/auto/comparewithsameperiod`
- `/ad_report/target/auto/hour_data`
- `/ad_report/target/auto/placement_hour`
- `/ad_report/target/search_term/index`

### 6.5 SB 关键词 `sb_keyword`：5 tab

详情标题：Sponsored Brands Keyword。

Tab：天数据 / 对比分析 / 小时数据 / 广告位 / 用户搜索词。

字段特点：

- 继承 SB 的品牌新客、视频、品牌搜索字段。
- 小时数据同样受 SB2/Stream 能力限制。

Network：

- `/ad_report/headline/headline_all_keyword/detail`
- `/ad_report/headline/headline_all_keyword/comparision_new`
- `/ad_report/headline/headline_all_keyword/comparewithsameperiod`
- `/ad_report/headline/headline_all_keyword/hour_data`
- `/ad_report/headline/headline_all_keyword/placement_hour`
- `/ad_report/headline/keyword_search_term/index`

### 6.6 SD 商品投放 / 受众：3 tab

SD 商品投放和 SD 受众浏览的详情都观察到：

- 天数据
- 对比分析
- 匹配的目标

它们没有观察到小时数据、广告位、用户搜索词。

Network：

- `/ad_report/sd/all_target/detail`
- `/ad_report/sd/all_target/comparision_new`
- `/ad_report/sd/all_target/comparewithsameperiod`
- `/ad_report/sd/all_match_target/index`
- `/ad_report/sd/all_audience/detail`
- `/ad_report/sd/all_audience/comparision_new`
- `/ad_report/sd/all_audience/comparewithsameperiod`

开发要求：

- SD 的第三 tab 应建模为 `matchedTargets`，不是 `placement` 或 `userSearchTerms`。
- SD target/audience 字段必须支持 view_impressions、vCPM、VTR/vCTR、reach/frequency。

---

## 7. 用户搜索词详情

用户搜索词相关页面包括：

- `all_search_term_st`
- `sp_search_term_asin`
- `sp_keyword_search_term`
- `sp_product_target_st`
- `sp_auto_search_term`
- `sb_search_term`

这些页面的行级详情均观察到：

- 天数据
- 对比分析

含义：

- 用户搜索词是独立列表和独立详情类型。
- 它也可以作为 SP/SB keyword/target/auto 详情内的子 tab 出现。
- 两者都要支持，但不是同一个 surface。

开发要求：

- 需要 `searchTermSurface` 区分：独立搜索词详情 vs 父对象详情内的用户搜索词 tab。
- 用户搜索词可产生后续动作：加关键词、否定、加入词库、加入策略；这些都是写动作，必须审计。

---

## 8. 否定对象、预算上限、归因购买、匹配目标

这些页面本轮未观察到 MCompare 弹层，但仍属于广告模块：

### 8.1 否定词 / 否定投放

字段包括：有效/状态、否定关键词或否定内容、服务状态、否定类型、广告组合、广告活动、广告组、创建时间、花费、ACoS、广告销售额、广告订单等。

要求：

- 列表要支持读；新增/删除/批量否定是写动作，必须审计。
- SP 否定词页面观察到操作日志类图标，日志可读，但不要点击删除/修改。

### 8.2 预算上限

是设置型页面，本轮只进入页面不操作。

要求：

- 未来可作为 budget guardrail / profile budget cap 的设置页。
- 所有保存必须进审计中心。

### 8.3 SB 归因于广告的购买

字段包括：已购买 ASIN、广告活动、广告组、引流类型、14 天总销售额、14 天总订单数、14 天总件数、14 天新客户订单销售额/订单/件数。

要求：

- 这是 SB 归因购买结果列表，不应误建成普通用户搜索词。
- 可作为广告后续购买 ASIN 分析能力。

### 8.4 SD 匹配的目标

字段包括：匹配的目标、投放、投放建议竞价、投放竞价、广告组合、广告活动、广告组、成本类型、曝光、可见次数、vCPM、点击、花费、销售额、直接销售额、ACoS、订单、CPA、CVR、销量、VTR、vCTR。

要求：

- 它是 SD 投放/受众详情中 `匹配的目标` tab 的落地列表。
- 不应被建模为 SP/SB 用户搜索词。

---

## 9. 行级图标与风险地图

### 9.1 安全只读入口

| 类/入口 | 含义 | 处理 |
|---|---|---|
| `to-compare-data-list` | 天数据和对比，主详情入口 | 只读，可点击 |
| `to-compare-vs-list` | 环比&同比 deep link，多数隐藏 | 只读，但可由详情 tab 替代 |
| `to-show-cst` | 查看用户搜索词 | 只读跳转/详情，但可能离开当前页 |
| `to-operate-log` / `to-show-log` | 操作日志 | 只读，可纳入日志能力 |
| `JS-show-searchrank` | 搜索排行 | 只读，但可能来自外部排名数据 |
| Amazon 搜索/ASIN 链接 | 跳 Amazon 搜索或商品页 | 外部只读链接 |

### 9.2 写/配置/高风险入口

| 类/入口 | 风险 |
|---|---|
| `Js-bid-save` | 保存竞价，真实写操作 |
| `JS-apply-suggest-budget` | 应用建议预算，真实写操作 |
| `to-time-sharing` | 分时策略配置/应用，写或策略配置 |
| `to-apply-rule` | 自动规则配置/应用，写或策略配置 |
| `fa-edit` | 编辑 portfolio / 对象 |
| 启停开关 | 启用/暂停真实广告 |
| 批量调整竞价、批量操作、创建广告、添加到词库 | 写操作 |
| 导入/上传 | 写操作，可能批量改变结构 |

开发要求：

- 所有高风险入口必须 disabled-by-default，直到真实凭证和审计闭环完成。
- 即便未来开放，也要二次确认、dry-run、权限、审计日志、回滚能力。
- 当前调研和测试脚本必须继续禁止点击这些入口。

### 9.3 “更多”图标说明

`to-show-more` 在多页存在，但本轮未稳定观察到可见 popover；DOM 显示部分隐藏入口（如环比同比、用户搜索词、操作日志）本身已经存在于行内，只是带 `hide` 类。开发上不应依赖一个“更多菜单”的视觉假设，而应按 row actions schema 显式建模。

---

## 10. Network 规律与我们自己的 API 抽象

### 10.1 领星接口规律

领星详情接口大体遵循：

- 列表：`/{routeFamily}/index`
- 天数据：`/{routeFamily}/detail`
- 对比：`/{routeFamily}/comparision_new`
- 同期：`/{routeFamily}/comparewithsameperiod`
- 小时：`/{routeFamily}/hour_data` 或 `/index/hour_data`
- 广告位：`/{routeFamily}/placement_hour` 或 `/index/placement_hour`
- 用户搜索词：独立 search term route
- SD 匹配目标：`/ad_report/sd/all_match_target/index`
- 日志：`/ad_report/api_log/profile/list`

关键参数：

- `profile_id`
- `report_date` / `report_dates`
- `campaign_id`
- `ad_group_id`
- `record_id`
- `record_key`
- `sub_title`
- `sponsored_type`
- `target_type`
- `data_type`
- `date_key`
- `is_daily`
- `tb_date_key`
- `comparison_type`
- `record_type`
- `attribution_period_cost_type`
- `fields[]`

### 10.2 我们自己的 API 不要照抄领星路径

建议抽象：

```text
GET /api/v1/store/ads/lx/surfaces/:surfaceKey/list
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/daily
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/compare
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/hourly
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/placement
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/search-terms
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/matched-targets
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/attribution
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/over-budget
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/time-series
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/key-keywords
GET /api/v1/store/ads/lx/analysis/:surfaceKey/:entityId/logs
```

`surfaceKey` 比 `entityType` 更重要。

---

## 11. 指标族与数据源

### 11.1 通用广告指标

- impressions / 曝光量
- clicks / 点击
- click share / 点击%
- CTR
- CPC
- spend / cost / 花费
- spend share / 花费%
- sales / 广告销售额
- sales share / 广告销售额%
- direct_sales / 直接销售额
- ACoS
- orders / 广告订单
- direct_orders / 直接订单
- CPA
- CVR
- unit_price / 广告笔单价
- ad_units / 广告销量

### 11.2 Bid / Budget / Rank

- bid / 竞价
- suggested_bid / 建议竞价
- suggested_bid_low/high
- daily_budget / 预算
- suggestion_budget / 建议预算
- avg_over_budget_time / 平均超预算时长
- bid_strategy / 竞价策略
- search_rank / 搜索排行
- top_of_search_impression_share / IS

### 11.3 SB 指标

- new-to-brand orders/sales/units
- complete_views / 视频完播次数
- video_5second_views / 5 秒观看次数
- VTR
- vCTR
- branded_search / 品牌搜索次数

### 11.4 SD 指标

- view_impressions / 可见次数
- vCPM
- complete_views
- VTR
- vCTR
- branded_search
- cumulative_reach / 累计触达用户
- avg_impressions_frequency / 平均触达次数

### 11.5 数据源分工

| 数据 | 主要来源 | 备注 |
|---|---|---|
| 实体结构 | Amazon Ads API | profile/campaign/ad group/ad/target/negative/portfolio |
| 日报指标 | Amazon Ads Reporting | 多 report type + 多 attribution window |
| 小时指标 | Amazon Marketing Stream | 不能伪造；SB 还要区分 SB2 支持情况 |
| 预算耗尽/超预算 | Marketing Stream + campaign budget + 状态事件 | 需要小时 spend 和 budget snapshot |
| 店铺订单/销售/库存 | SP-API / 内部 ERP | 时间序列和超预算中会用 |
| 搜索排行 | 第三方或自建采集 | Ads API 不一定提供 |
| 建议竞价/建议预算 | Ads API recommendation 或第三方 | 要保存来源和更新时间 |
| 操作日志 | 我们系统审计 + Amazon/外部 sync diff | 领星展示“领星/亚马逊”来源切换 |

---

## 12. 数据模型升级需求

当前 `lx_daily_data` 只有 `campaign_id + date + metrics JSON`，不能支撑完整领星结构。至少需要以下逻辑模型。

### 12.1 surface registry

记录每个页面/视图的能力：

```text
surface_key, ad_product, entity_kind, route_family, title, supported_tabs, supported_metrics, source_requirements
```

示例：

- `all_target`：SP/SB/SD mixed，entityKind=target，tabs=daily/compare/hourly/placement
- `sp_keyword`：SP，entityKind=keyword，tabs=daily/compare/hourly/placement/searchTerms
- `sd_product_target`：SD，entityKind=productTarget，tabs=daily/compare/matchedTargets

### 12.2 entity identity

每次打开详情必须携带：

```text
profile_id, marketplace_id, store_id, surface_key, ad_product, entity_kind, entity_id,
campaign_id, ad_group_id, ad_id, target_id, search_term_id,
record_key, record_id, target_type, match_type, sub_title, currency, timezone
```

### 12.3 metric facts

`ad_metric_daily`：日/周/月聚合基础。

`ad_metric_hourly`：Marketing Stream 小时事实。

`ad_metric_placement`：placement / advertised product / placement+product。

`ad_metric_search_term`：用户搜索词，既可独立页，也可作为父详情 tab。

`ad_metric_matched_target`：SD 匹配目标。

`ad_attribution_window_metrics`：当天/7天/14天/30天。

`ad_time_sequence_events`：预算、累计花费、预算使用比例、超预算区间、操作日志。

`ad_operation_logs`：结构化操作日志。

### 12.4 operation logs

必须结构化：

```text
operation_time, operator, source, entity_type, entity_id,
campaign_id, ad_group_id, action_type, before_data_json, after_data_json,
remark, success, audit_id, external_event_id, reversible
```

---

## 13. 前端实现要求

### 13.1 Tab 配置按 surfaceKey

建议：

```js
export const TABS_BY_SURFACE = {
  all_portfolio: ['daily', 'compare'],
  all_campaign: ['daily', 'compare', 'hourly', 'overBudget', 'attribution', 'placement', 'timeSeries', 'keyKeywords', 'history'],
  all_adgroup: ['daily', 'compare', 'hourly'],
  all_ad: ['daily', 'compare', 'hourly'],
  all_target: ['daily', 'compare', 'hourly', 'placement'],
  all_search_term_st: ['daily', 'compare'],

  sp_campaign: ['daily', 'compare', 'hourly', 'overBudget', 'attribution', 'placement', 'timeSeries', 'keyKeywords', 'history'],
  sp_placement: ['daily', 'compare', 'hourly'],
  sp_auto_target: ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms'],
  sp_keyword: ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms'],
  sp_product_target: ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms'],

  sb_campaign: ['daily', 'compare', 'hourly', 'overBudget', 'placement', 'history'],
  sb_adgroup: ['daily', 'compare', 'hourly'],
  sb_creative: ['daily', 'compare', 'hourly'],
  sb_placement: ['daily', 'compare', 'hourly'],
  sb_keyword: ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms'],
  sb_search_term: ['daily', 'compare'],

  sd_campaign: ['daily', 'compare', 'attribution', 'timeSeries', 'history'],
  sd_adgroup: ['daily', 'compare'],
  sd_ad: ['daily', 'compare'],
  sd_product_target: ['daily', 'compare', 'matchedTargets'],
  sd_audience: ['daily', 'compare', 'matchedTargets'],
};
```

### 13.2 Metric schema 按 adProduct

- SP：基础 sales/order/bid/placement/search term。
- SB：增加 new-to-brand、video、branded search。
- SD：增加 viewability、vCPM、reach/frequency、VTR/vCTR。

UI 表格不能一套列打天下，必须由 `surfaceKey + tabKey + adProduct` 决定字段。

### 13.3 数据状态

每个 tab 必须显示：

- source：mock / amazon_ads_api / marketing_stream / sp_api / external_rank / sync_diff
- freshness：同步时间、报表日期、事件时间
- confidence：mock、partial、complete
- unavailableReason：未授权、广告产品不支持、数据延迟、报表未生成

---

## 14. 后端和同步要求

### 14.1 同步层级

1. Profile/store 同步。
2. Ads 实体同步。
3. 日报按 surface/entity/adProduct 同步。
4. Marketing Stream 小时数据同步。
5. 归因窗口报表同步。
6. SP-API/ERP 店铺订单和库存同步。
7. 操作日志与外部变动 sync-diff。
8. 派生视图：compare、overBudget、timeSeries、keyKeywords。

### 14.2 Mock 要先补齐字段

即使真实 Amazon 数据未接入，mock 也必须覆盖真实目标字段。否则 UI 会误以为领星只有少数指标。

要求：

- mock 每行带 `source='mock'`、`confidence`、`freshness`。
- mock schema 覆盖 SP/SB/SD 差异。
- 小时数据 mock 必须标明“模拟 Marketing Stream”，不能冒充真实。

---

## 15. 验收标准

### 15.1 结构验收

- `all_target` 必须 4 tab，不能出现用户搜索词。
- `sp_keyword` / `sp_product_target` / `sp_auto_target` / `sb_keyword` 必须 5 tab，包含用户搜索词。
- `sd_product_target` / `sd_audience` 必须有 `匹配的目标`，不能用用户搜索词或广告位替代。
- `sb_campaign` 是 6 tab，`sd_campaign` 是 5 tab，不能套 SP campaign 的 9 tab。

### 15.2 字段验收

- SP campaign 要支持预算、竞价策略、IS、超预算、归因期、广告位、时间序列、重点关键词、日志。
- SB 要支持品牌新客、视频、品牌搜索、SB2 小时数据限制。
- SD 要支持可见次数、vCPM、触达、频次、VTR/vCTR。
- 搜索词独立详情和父详情内用户搜索词 tab 都要支持。

### 15.3 安全验收

- 写入口全部进审计中心。
- 未接生产凭证时写动作不可执行。
- 所有调价/预算/启停/否定/扩词/规则/策略都要 dry-run、确认、审计、回滚。

---

## 16. 与当前项目的差距

已知当前代码风险：

- `apps/web-v2/src/utils/ad-drawer-config.js` 仍按粗粒度 entity type 映射，不足以表达 surfaceKey 差异。
- 当前 `target` 配置不能同时正确表达 `all_target`、`sp_product_target`、`sd_product_target`。
- `TabDaily.vue` 字段太浅，缺少点击%、花费%、销售额%、直接销售、直接订单、CPA、笔单价、品牌新客、竞价/建议竞价、SB/SD 专属字段。
- 当前 `_mock-data.js` 未覆盖完整 SP/SB/SD 指标族。
- SQLite `lx_daily_data` 维度不足，不能支持 surface/entity/hour/placement/searchTerm/matchedTarget/attribution window。

---

## 17. 建议实施顺序

1. 不直接写 UI，先改需求/设计：引入 `surfaceKey` 概念。
2. 扩展 mock schema，让所有 tab 和字段先能完整展示。
3. 改前端 tab 配置和字段配置。
4. 改后端只读 analysis API。
5. 扩展 SQLite facts 表。
6. 接 Amazon Ads API 日报。
7. 接 Marketing Stream 小时数据。
8. 接 SP-API/ERP 店铺订单/库存。
9. 最后开放写动作，必须走审计中心。

---

## 18. 最终判断

这次补调研后，可以更准确地说：

- 领星广告模块的“行级分析详情”不是一个抽屉配置，而是一套按广告产品、页面 surface、实体类型共同决定的分析系统。
- `a1/a2` 的“全部投放详情”只是其中一个 surface，且它和 SP 关键词/商品投放/自动投放详情不同。
- 如果未来接真实 Amazon 数据，开发目标不是“做一个类似弹窗”，而是要支撑：
  - 多 surface tab matrix；
  - SP/SB/SD 指标差异；
  - 日/周/月、对比、小时、广告位、搜索词、匹配目标、归因期、超预算、时间序列、重点关键词、日志；
  - 真实数据来源、同步新鲜度、归因窗口和审计闭环。

本报告应作为后续 M3 广告模块接真数据和复刻领星分析能力的需求基线 v2。
