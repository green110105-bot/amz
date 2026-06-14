# 领星广告模块真实行为复核与未来真数据开发需求报告（Codex）

- 日期：2026-05-25
- 状态：v1 纠偏报告；已由 `docs/implementation/LINGXING_AD_MODULE_DEEP_RECON_V2.md` 扩展为覆盖 SP/SB/SD 多 surface 的深度基线。后续开发以 v2 为准，v1 保留用于追踪 `a1/a2` 初始纠偏过程。
- 范围：仅限领星左侧栏“广告”模块；重点是截图 `a1` 红色箭头 1 所在模块，以及红色箭头 2 行级“分析/柱状图”入口弹出的 `a2` 详情层。
- 非范围：不研究“店铺 / 词 / 工具 / 分析 / DSP / 结构 / 实时 / 商机 / AMC”等其它左侧模块；不触发真实账号写操作。
- 安全结论：本轮只读复核，点击范围限于分析入口、详情 tab、粒度控件；未点击调价保存、启停、批量操作、创建、删除、导入、添加到抢位等写入口。抓取证据中 `risk=0`。
- 证据目录：`D:\amz\tmp\keyscreen\`、`D:\amz\tmp\recon-ad-only\target-row-analysis\`、`D:\amz\tmp\recon-ad-only\target-full-network\`、`D:\amz\tmp\recon-ad-only\six-surface-sweep\`。

---

## 1. 报告目标

这份报告不是“页面截图说明”，而是为了以后真正接入 Amazon Ads API / Amazon Marketing Stream / SP-API 等真实数据后，开发团队仍然记得要复刻什么能力、按什么数据口径建模、哪些地方不能只做 UI 假壳。

目标包括：

1. 固化领星广告模块内“行级分析详情”的真实结构和字段。
2. 修正 Claude 旧 recon 中和当前实证不一致的结论。
3. 把“当前可观察的领星行为”转成我们自己的产品需求、数据契约和验收标准。
4. 明确哪些数据来自 Amazon Ads 报表，哪些需要 Marketing Stream，哪些需要我们自己记录或第三方补充。
5. 避免后续接真数据时把“指标少、tab 错、粒度错、实体身份错”的 mock 版本误当成最终目标。

---

## 2. 最关键事实：a1/a2 到底是什么

### 2.1 a1 当前页面

截图 `D:\amz\tmp\keyscreen\a1.png` 显示的页面是领星广告模块中的“全部投放”：

- URL：`/ad_report/profile/target/index?profile_id=...`
- 顶部模块：广告模块。
- 当前主 tab：`投放`。
- 子范围：可在 SP / SB / SD 广告下切换不同广告对象，但本轮只关注当前截图所在的广告模块投放列表。
- 主表行对象：一个具体投放对象，例如关键词 `slushie machine`。

### 2.2 红色箭头 2 的含义

红色箭头 2 指向主表右侧“分析”列里的行级柱状图图标。它不是：

- 不是全局图表入口；
- 不是左侧“分析”模块；
- 不是简单的 tooltip；
- 不是独立跳转页；
- 不是“用户搜索词”入口。

它是当前行投放对象的详情分析入口，DOM 上对应 `to-compare-data-list`，title 近似为“天数据和对比”。点击后弹出 `a2`。

### 2.3 a2 真实形态

截图 `D:\amz\tmp\keyscreen\a2.png` 显示：

- 标题：`投放详情 slushie machine`。
- 形态：页面上方居中的大弹层 / modal；背景列表变暗；URL 不变。
- 默认 tab：`天数据`。
- 当前实体身份：不是整个 campaign，而是某个投放对象，示例为 SP 关键词投放 `slushie machine`。
- 关键身份参数由网络请求证明：`profile_id`、`campaign_id`、`ad_group_id`、`record_id`、`record_key`、`sub_title`、`data_type=keyword`、`target_type=keyword`、`sponsored_type=sp`。

---

## 3. 与 Claude 旧结论的修正

旧文档 `docs/LINGXING_ADS_RECON_v3.md` 对“抽屉 tab 集”的大方向有价值，但至少在当前用户截图对应的“投放详情”上存在关键偏差。

| 项目 | Claude 旧理解 | 本轮实证结论 | 开发影响 |
|---|---|---|---|
| `投放`行级详情 | 类似 keyword/target，含 5 个 tab，包含`用户搜索词` | 当前真实 `投放详情`只有 4 个 tab：`天数据 / 对比分析 / 小时数据 / 广告位` | 不能把 `userSearchTerms` 放进当前“投放详情”的 tab 集 |
| `用户搜索词` | 可作为 keyword/target 抽屉 tab | 当前广告模块里它是单独顶层页，其行级详情只有`天数据 / 对比分析` | 应建成独立实体/页面详情，不是投放详情的内嵌 tab |
| 抽屉形态 | 曾误判过侧边/顶部下拉 | 当前 `a2` 是 modal 覆盖层，URL 不变 | 我们复刻时应支持“列表上下文不丢失”的弹层体验 |
| 研究方法 | 旧阶段偏 DOM 猜测 | 本轮以截图 + Playwright CDP + Network 复核 | 以后需求变更必须保留截图/请求证据 |

---

## 4. 广告模块内已核实的页面与详情矩阵

本轮在广告模块内验证了 6 个顶层表面。它们是当前应优先复刻的“广告核心对象”。

| 顶层页 | 领星 URL 形态 | 行级详情标题 | 已验证 tab | 备注 |
|---|---|---|---|---|
| 广告组合 | `/ad_report/portfolio/profile/list` | 广告组合详情 | 天数据、对比分析 | 最简详情，偏组合聚合 |
| 广告活动 | `/ad_report/profile/campaign/index` | 广告活动详情 | 天数据、对比分析、小时数据、超预算分析、归因期分析、广告位、时间序列、重点关键词、溯源（日志） | 最复杂，是后续深挖重点 |
| 广告组 | `/ad_report/ad_group/profile/index` | 广告组详情 | 天数据、对比分析、小时数据 | 含默认竞价维度 |
| 广告 | `/ad_report/ad/profile/index` | 广告详情 | 天数据、对比分析、小时数据 | 商品广告/素材维度 |
| 投放 | `/ad_report/profile/target/index` | 投放详情 | 天数据、对比分析、小时数据、广告位 | 当前 `a1/a2` 的重点；不是 5 tab |
| 用户搜索词 | `/ad_report/search_term_st/profile/index` | 用户搜索词详情 | 天数据、对比分析 | 独立顶层页，不是投放详情 tab |

---

## 5. “投放”主列表需求（a1）

### 5.1 顶部导航与筛选

`投放`页不是一个单表裸列表，而是“广告对象 + 时间 + 状态 + 类型 + 标签 + 模糊搜索”的综合分析表。

必须支持：

- 店铺 / profile 切换：按 Amazon Ads profile 隔离数据。
- 广告产品范围：SP、SB、SD 子导航。
- 日期范围：主列表指标按 `report_date` 聚合。
- 分类筛选：如全部、标准、有成效、有点击无成效、高曝光无点击、无曝光等。
- 对象筛选：广告活动、广告组合、投放类型、匹配方式、投放状态、标签、关键词搜索。
- 排序：主表支持按花费、点击、曝光、ACoS 等指标排序。
- 指标卡片：点击、花费、广告销售额、ACoS，并支持“添加指标”。
- 折线图/趋势图：上方大图按选中指标显示。

### 5.2 投放主表字段

当前截图和抓取中，投放主表字段至少包括：

- 状态类：有效、类型、服务状态、匹配方式、标签。
- 对象类：投放、广告活动/广告组、广告组合、搜索排行。
- 竞价类：建议竞价、竞价。
- 核心指标：曝光量、点击、点击%、CTR、CPC、花费、花费%、广告销售额、广告销售额%、直接销售额、ACoS、广告订单、直接订单、CPA、CVR、广告笔单价、广告销量。
- 品牌新客：品牌新客订单、品牌新客销售额、品牌新客销量。
- 操作列：分析图标、更多操作、策略/规则相关图标。

### 5.3 主表的写入口必须隔离

主表中有竞价输入框、启停开关、批量调价、改标签、用策略、添加到词库等入口。这些不能混入本报告的只读分析开发。

开发要求：

- 读接口和写接口完全分离。
- 所有写动作必须进入审计中心，支持确认、回滚、权限、dry-run。
- 接真 Amazon 数据之前，所有真实写动作默认禁用或沙盒化。
- UI 中“分析详情”必须可用，但“应用 / 保存 / 批量执行”必须受权限和环境开关控制。

---

## 6. `投放详情`需求（a2，最高优先级）

这是本轮用户明确指出 Claude 做得不好的核心。后续开发必须先把它做对。

### 6.1 弹层通用行为

- 从投放主列表某一行点击“分析”图标打开。
- URL 不改变，保持列表筛选上下文。
- 背景置灰，弹层可关闭。
- 标题包含实体类型和实体名称：例如 `投放详情 slushie machine`。
- 详情请求必须携带当前行的实体身份，不允许只按 campaign 聚合冒充。
- 默认展示 `天数据`。
- `投放详情`固定 4 个 tab：`天数据 / 对比分析 / 小时数据 / 广告位`。

### 6.2 `天数据` tab

用途：回答“这个投放对象每天/每周/每月表现如何，是否值得调价/否定/扩词”。

控件：

- 日期范围，示例：`2026-05-19 - 2026-05-25`。
- 粒度按钮：`天 / 周 / 月`。
- 图表指标选择：曝光量、点击、点击%、CTR、CPC、花费、花费%、广告销售额、广告销售额%、直接销售额、ACoS、广告订单、直接订单、CPA、CVR、广告笔单价、品牌新客订单、品牌新客销售额、品牌新客销量、广告销量、竞价、建议竞价。
- 导出按钮。

表格字段：

| 字段 | 说明 | 数据要求 |
|---|---|---|
| 日期 | 日/周/月粒度的时间键 | 必须支持汇总行和明细行 |
| 备注 | 用户备注或系统备注 | 可为空 |
| 竞价($) | 当日/当前投放 bid | 需要记录历史快照，否则不能回看 |
| 建议竞价 | Amazon/领星建议 bid | 需要独立来源和更新时间 |
| 曝光量 | impressions | 原始指标 |
| 点击 | clicks | 原始指标 |
| 点击% | 当前行点击占总点击比例 | 派生指标，分母为当前详情汇总 |
| CTR | clicks / impressions | 派生指标 |
| CPC | spend / clicks | 派生指标或报表字段 |
| 花费 | cost/spend | 原始指标 |
| 花费% | 当前行花费占总花费比例 | 派生指标 |
| 广告销售额 | attributed sales | 原始/报表指标 |
| 广告销售额% | 当前行销售额占总销售额比例 | 派生指标 |
| 直接销售额 | advertised/direct attributed sales | 需按来源区分 |
| ACoS | spend / sales | 派生指标 |
| 广告订单 | attributed orders/purchases | 原始/报表指标 |
| 直接订单 | direct orders | 需按来源区分 |
| CPA | spend / orders | 派生指标 |
| CVR | orders / clicks | 派生指标 |
| 广告笔单价 | sales / orders | 派生指标，订单为 0 时显示 `--` |
| 广告销量 | attributed units | 原始/报表指标 |
| 品牌新客订单 | new-to-brand orders | 仅数据源支持时展示 |
| 品牌新客销售额 | new-to-brand sales | 仅数据源支持时展示 |
| 品牌新客销量 | new-to-brand units | 仅数据源支持时展示 |

验收点：

- 必须有 `汇总` 行。
- 日期明细行的百分比列必须相对当前详情汇总计算。
- 缺失数据统一显示 `--`，不能用 0 冒充。
- 天/周/月切换必须重新聚合，而不是只改 label。

### 6.3 `对比分析` tab

用途：回答“当前周期相比上一周期/去年同期是否变好，变化来自点击、转化还是客单价”。

控件和结构：

- 区块：`环比分析`、`同比分析`。
- 日期范围选择。
- 统计口径下拉，已观察到 `数据按总和统计`。
- `自定义时段对比`复选框。
- `分析`按钮和`导出`按钮。
- 表格为两个时间段并列字段，后续还应展示差值/变化率。

字段要求：

- 第一周期：时间周期、建议竞价、曝光量、点击、CTR、CPC、花费、广告销售额、直接销售额、ACoS、广告订单、直接订单、CPA、CVR、广告笔单价、广告销量、品牌新客订单、品牌新客销售额、品牌新客销量。
- 第二周期：同一组字段。
- 派生：绝对变化、百分比变化，至少在 API 层保留。

验收点：

- 周期比较必须使用同一实体、同一归因窗口、同一币种、同一时区。
- 若某周期没有数据，变化率不能除以 0；显示 `--` 并保留原因。

### 6.4 `小时数据` tab

用途：回答“这个投放在一天中的哪些小时烧钱/转化好，是否适合分时调价”。

领星页面提示：小时数据来自 Amazon Marketing Stream，授权后才提供；Amazon 会修正数据，因此小时数据和天数据可能存在差异。

控件和结构：

- 日期范围。
- 星期筛选。
- 二级按钮：`小时汇总`、`小时明细`。
- 导出。

字段：

- 小时段、曝光量、点击、点击%、CTR、CPC、花费、花费%、广告销售额、广告销售额%、直接销售额、ACoS、广告订单、直接订单、CPA、CVR、广告笔单价、广告销量、品牌新客订单、品牌新客销售额、品牌新客销量。

验收点：

- 未授权 Marketing Stream 时，必须显示“未授权/不可用/数据源缺失”，不能用日数据平摊伪造小时数据。
- 小时汇总和小时明细是两种视图：汇总按 0-23 小时聚合，明细按日期+小时展开。
- 小时数据允许与天数据不完全一致，但必须显示数据更新时间和来源。

### 6.5 `广告位` tab

用途：回答“同一个投放在哪些展示位置花钱、转化、ACoS 不同，是否需要调整位置策略”。

控件和结构：

- 二级按钮：`广告位`、`广告商品`、`广告位+广告商品`。
- 日期范围。
- `分析`按钮和`导出`按钮。

已观察到的广告位行：

- 搜索结果顶部（首页）
- 搜索结果其余位置
- 商品页面
- OFF AMAZON

字段：

- 广告位、曝光量、点击、点击%、CTR、CPC、花费、花费%、广告销售额、广告销售额%、直接销售额、ACoS、广告订单、直接订单、CPA、CVR、广告笔单价、品牌新客订单、品牌新客销售额、品牌新客销量、广告销量。

验收点：

- `广告位`视图按 placement 聚合。
- `广告商品`视图按 advertised ASIN/SKU 聚合。
- `广告位+广告商品`视图按 placement + ASIN/SKU 复合维度聚合。
- 位置名称必须保持 Amazon/领星语义，不能简单翻译成不一致的枚举。

---

## 7. 其它已验证详情页需求

### 7.1 广告活动详情：9 tab，是复杂度最高的对象

`广告活动详情` tab：

1. 天数据
2. 对比分析
3. 小时数据
4. 超预算分析
5. 归因期分析
6. 广告位
7. 时间序列
8. 重点关键词
9. 溯源（日志）

重点需求：

- `天数据`比投放多了`预算($)`字段。
- `超预算分析`包含小时柱状图和表格，字段包括小时段、预算调整次数、超预算天数、近 7 天广告商品店铺销量；还存在`按时段 / 超预算记录 / 告警`切换。
- `归因期分析`按当天成交、7 天成交（默认）、14 天成交、30 天成交对比广告订单、占比、销售额、点击、销量、花费、ACoS、CPA、CVR；页面提示归因有滞后。
- `广告位`比投放详情多了广告组合、广告活动竞价策略、竞价调整等字段。
- `时间序列`是 campaign 专属重视图：包含点击、曝光、花费、销售额、直接销售额、订单、销量、店铺订单、店铺销售额等指标卡；图表叠加日累计花费、预算、预算使用比例、超预算时段、操作日志等。
- `重点关键词`用于分析当前广告活动正在抢位/监控的关键词；没有监控关键词时显示空状态。
- `溯源（日志）`是操作日志表，字段包括操作时间、操作员、广告活动、广告组、操作对象、对象详情、功能来源、操作类型、操作前的数据、操作后的数据、备注、是否成功。

### 7.2 广告组合详情

- tab：`天数据 / 对比分析`。
- 字段不含竞价/预算，偏 portfolio 聚合。
- 适合做跨 campaign 的预算、销售和 ACoS 观察。

### 7.3 广告组详情

- tab：`天数据 / 对比分析 / 小时数据`。
- `天数据`含`竞价($)`，说明广告组默认竞价需要历史快照。

### 7.4 广告详情

- tab：`天数据 / 对比分析 / 小时数据`。
- 主列表含图片、ASIN、MSKU、可售库存、SPV 视频等商品广告字段。
- 需要和 SP-API 商品/库存数据打通，不能只依赖 Ads 报表。

### 7.5 用户搜索词详情

- 顶层页是`用户搜索词`。
- 行级详情只有`天数据 / 对比分析`。
- 主表字段包括用户搜索词、投放、匹配方式、投放建议竞价、投放竞价、广告组合、广告活动、广告组、搜索排行和核心指标。
- 它不是 `投放详情` 的第五个 tab。

---

## 8. 网络接口证据与未来 API 抽象

### 8.1 领星真实请求形态

当前 `投放详情`的网络请求包括：

| 功能 | 领星接口路径 | 关键参数 |
|---|---|---|
| 投放主表 | `POST /ad_report/profile/target/index` | `profile_id`、`report_date`、`target_type`、筛选、排序、fields |
| 天数据 | `POST /ad_report/profile/target/detail` | `profile_id`、`campaign_id`、`ad_group_id`、`record_id`、`record_key`、`date_key`、`is_daily` |
| 对比分析 | `POST /ad_report/profile/target/comparision_new` | 同实体身份 + `tb_date_key`、`comparison_type` |
| 同期对比 | `POST /ad_report/profile/target/comparewithsameperiod` | 同实体身份 + `tb_date_key` |
| 小时数据 | `POST /ad_report/profile/target/hour_data` | 同实体身份 + `record_type=total`、`report_dates` |
| 广告位 | `POST /ad_report/profile/target/placement_hour` | 同实体身份 + `record_type=placement`、`report_dates` |

其它对象也有同构接口：

- campaign：`/ad_report/profile/campaign/detail`、`comparision_new`、`hour_data`、`attributed`、`get_sequence`、`/tools/over_budget/...`、`/ad_report/api_log/profile/list`。
- ad group：`/ad_report/ad_group/profile/detail`、`comparision_new`、`hour_data`。
- ad：`/ad_report/ad/profile/detail`、`comparision_new`、`hour_data`。
- portfolio：`/ad_report/portfolio/profile/detail`、`comparision_new`。
- search term：`/ad_report/search_term_st/profile/detail`、`comparision_new`。

### 8.2 我们自己的 API 不应照抄领星路径

建议用稳定语义抽象，而不是把领星路径照搬：

- `GET /api/v1/store/ads/lx/entities/:entityType`：主列表，支持筛选、排序、分页。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/daily`：天/周/月数据。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/compare`：环比/同比。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/hourly`：小时数据。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/placement`：广告位拆分。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/attribution`：归因期，仅 campaign 等支持。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/over-budget`：超预算，仅 campaign 支持。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/time-series`：时间序列，仅 campaign 支持。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/key-keywords`：重点关键词，仅 campaign 支持。
- `GET /api/v1/store/ads/lx/analysis/:entityType/:entityId/logs`：操作日志。

---

## 9. 指标口径字典

### 9.1 原始指标

| 指标 | 建议内部字段 | 说明 |
|---|---|---|
| 曝光量 | `impressions` | 广告展示次数 |
| 点击 | `clicks` | 点击次数 |
| 花费 | `spend` / `cost` | 广告消耗，按 profile 币种 |
| 广告销售额 | `sales` | 广告归因销售额 |
| 直接销售额 | `direct_sales` | 直接归因到广告商品/目标商品的销售额；源不支持时为空 |
| 广告订单 | `orders` | 广告归因订单/购买数 |
| 直接订单 | `direct_orders` | 直接归因订单；源不支持时为空 |
| 广告销量 | `ad_units` / `units` | 广告归因销量 |
| 品牌新客订单 | `new_to_brand_orders` | 数据源支持时展示 |
| 品牌新客销售额 | `new_to_brand_sales` | 数据源支持时展示 |
| 品牌新客销量 | `new_to_brand_units` | 数据源支持时展示 |
| 竞价 | `bid` | 当前 bid 或历史快照 bid |
| 建议竞价 | `suggested_bid` / `suggested_bid_low/high` | 需保存建议来源和更新时间 |
| 预算 | `daily_budget` | campaign 级字段 |
| 搜索排行 | `search_rank` | 可能来自搜索排名/第三方/抓取，不是 Ads 基础报表字段 |

### 9.2 派生指标

| 指标 | 计算 |
|---|---|
| CTR | `clicks / impressions` |
| CPC | `spend / clicks` |
| ACoS | `spend / sales` |
| ROAS | `sales / spend`，领星主界面未必展示，但网络字段存在，应保留 |
| CPA | `spend / orders` |
| CVR | `orders / clicks` |
| 广告笔单价 | `sales / orders`，订单为 0 显示 `--` |
| 点击% | 当前行点击 / 当前详情汇总点击 |
| 花费% | 当前行花费 / 当前详情汇总花费 |
| 广告销售额% | 当前行广告销售额 / 当前详情汇总广告销售额 |

### 9.3 重要口径要求

- 所有金额必须带 currency 和 profile 时区。
- 不能把缺失值当 0；`--` 和 `0` 含义不同。
- 同一页面比较必须保证同一 attribution window。
- 小时数据和天数据可能因修正/归因滞后不一致，需要显示数据更新时间和来源。
- 品牌新客字段只在 Amazon 广告产品/报表支持时展示；不支持时显示缺失原因。

---

## 10. 真实亚马逊数据源需求

### 10.1 Amazon Ads API

Amazon Ads API 应承担：

- 广告账号 profile、campaign、ad group、ad/product ad、targeting、negative、portfolio 等实体同步。
- 报表数据同步：按日期、实体、广告产品、投放对象、搜索词、广告位等维度聚合。
- 预算、竞价、状态等写操作的沙盒/生产通道，但所有写动作必须进入审计中心。

官方页面确认 Amazon Ads API 可用于 programmatic campaign management 和 reporting，也可用于自定义 dashboard、bid/keyword optimization、budget optimization 等能力。

### 10.2 Amazon Marketing Stream

Amazon Marketing Stream 应承担：

- 小时级广告指标。
- campaign changes / budget consumption / near real-time signals。
- `小时数据`、`超预算分析`、`时间序列`中的日内曲线和预算耗尽判断。

官方页面明确 Marketing Stream 提供 near real-time hourly campaign metrics 和 campaign change information，并通过 Amazon Ads API 推送。

### 10.3 SP-API / 店铺经营数据

SP-API 或内部订单/库存数据应承担：

- 可售库存、MSKU、商品信息。
- 店铺订单、店铺销售额、店铺销量。
- 广告活动时间序列中的“店铺订单/店铺销售额”和库存/利润联动。
- M2 利润中枢所需的利润、成本、库存天数、清仓策略。

### 10.4 第三方/额外来源

以下字段不是基础 Ads 报表天然完整提供，需单独来源：

- 搜索排行：可能来自搜索排名抓取、SellerSprite、Helium 10、Keepa 或自建 RPA。
- 建议竞价：可能来自 Ads API bid recommendations 或其它 provider；必须保存来源。
- 操作员级别的历史日志：Amazon 未必能给完整“谁在网页上改了什么”的可读日志；我们至少要记录自己系统内的所有写动作，并可通过 sync-diff 识别外部更改。
- 重点关键词监控：需要用户配置或自动策略产出，并定期采集排名/坑位。

---

## 11. 数据模型需求

当前已有 `lx_daily_data`、`lx_placements`、`lx_user_search_terms`、`lx_operation_logs` 等表，但要完整支撑领星式详情，现有模型不够。尤其 `lx_daily_data` 只有 `campaign_id + date + metrics JSON`，无法准确承载 ad group、ad、target、search term、placement、hour、attribution window 等维度。

建议新增或扩展为以下逻辑模型。

### 11.1 实体快照

`ad_entity_snapshots`

- `user_id`, `store_id`, `profile_id`, `marketplace_id`
- `entity_type`: `portfolio | campaign | ad_group | ad | target | search_term`
- `entity_id`
- `parent_campaign_id`, `parent_ad_group_id`, `portfolio_id`
- `sponsored_type`: `SP | SB | SD`
- `target_type`: `keyword | product | auto | audience | ...`
- `name`, `state`, `service_state`, `enabled`
- `bid`, `daily_budget`, `bid_strategy`, `match_type`
- `asin`, `sku`, `msku`, `image_url`
- `tags`, `extra`
- `snapshot_at`, `source`, `confidence`

### 11.2 日/周/月指标事实表

`ad_metric_daily`

- 主键维度：`profile_id + entity_type + entity_id + report_date + attribution_window + sponsored_type`
- 父维度：`campaign_id`, `ad_group_id`, `ad_id`, `target_id`, `search_term_id`
- 细分维度：`target_type`, `match_type`, `placement`, `asin`, `sku`
- 原始指标：impressions, clicks, spend, sales, direct_sales, orders, direct_orders, units, new_to_brand_*。
- 快照字段：bid, suggested_bid, daily_budget。
- 派生字段可物化也可查询时算：ctr, cpc, acos, cpa, cvr, unit_price。
- 元数据：currency, timezone, data_source, source_updated_at, confidence。

### 11.3 小时指标事实表

`ad_metric_hourly`

- 维度：`profile_id + entity_type + entity_id + report_date + hour + sponsored_type`
- 可选维度：placement、asin/sku、weekday。
- 指标：同核心指标，但允许字段不完整。
- 元数据：Marketing Stream subscription id、message received time、source event time。

### 11.4 广告位事实表

`ad_metric_placement`

- 维度：`entity_type`, `entity_id`, `report_date`, `placement`, 可选 `asin/sku`。
- 支持三种查询：placement、advertised product、placement + advertised product。

### 11.5 对比/归因/超预算派生模型

这些可以优先由查询层派生：

- `compare_view`：由 daily facts 聚合两个周期生成。
- `attribution_view`：按 attribution window 聚合。
- `over_budget_view`：由 hourly facts + budget snapshots + campaign status/events 生成。
- `time_sequence_view`：由 hourly spend、budget snapshots、operation logs、store orders/sales 合成。

### 11.6 操作日志

`ad_operation_logs`

- `operation_time`, `operator`, `source`
- `entity_type`, `entity_id`, `campaign_id`, `ad_group_id`
- `action_type`: update/create/delete/toggle/bid/budget/strategy/import 等。
- `before_data`, `after_data`, `remark`, `success`
- `audit_id`, `revert_id`
- `source`: `our_app | amazon_api | lingxing_import | sync_diff | manual`

要求：所有我们系统内产生的写操作必须写入该表，并进入全局审计中心。

---

## 12. 前端需求

### 12.1 Tab 配置必须按实证修正

当前目标配置：

```js
campaign:   ['daily', 'compare', 'hourly', 'overBudget', 'attribution', 'placement', 'timeSeries', 'keyKeywords', 'history']
portfolio:  ['daily', 'compare']
adgroup:    ['daily', 'compare', 'hourly']
ad:         ['daily', 'compare', 'hourly']
target:     ['daily', 'compare', 'hourly', 'placement']
searchTerm: ['daily', 'compare']
```

注意：

- 当前 `target` 不应包含 `userSearchTerms`。
- `placement` 不应继续被当成和 ad/adgroup 同级的 3-tab 详情，除非后续在领星中重新证实该顶层页存在于当前广告模块范围。
- `userSearchTerms` 应改造成单独顶层页或搜索词详情，不应挂在投放详情里。

### 12.2 UI 组件需求

- `AdAnalysisDrawer.vue` 当前名称可以保留，但行为应更接近 modal/overlay。
- 每个 tab 组件必须支持：loading、empty、unauthorized、stale、mock 标记。
- 每个数据块都要显示 source/confidence/freshness，符合项目“mock-backed feature metadata”要求。
- 表格字段必须按实体差异配置，不可用一套浅字段覆盖所有 tab。
- 导出按钮可以先禁用或导出 mock，但必须标明数据源。

### 12.3 行身份传递

打开详情时必须传递完整实体上下文：

```js
{
  profileId,
  entityType,
  entityId,
  sponsoredType,
  campaignId,
  adGroupId,
  adId,
  targetId,
  searchTermId,
  targetType,
  matchType,
  title,
  dateRange,
  currency,
  timezone
}
```

不能只传 `campaignId`，否则会把投放详情错误聚合成广告活动详情。

---

## 13. 后端/同步需求

### 13.1 同步分层

1. 实体同步：profiles、portfolios、campaigns、adGroups、ads、targets、negatives、search terms。
2. 日报同步：按实体类型和报表类型落 daily facts。
3. 小时同步：Marketing Stream 消息落 hourly facts。
4. 派生构建：比较、归因、超预算、时间序列。
5. 审计日志：所有本系统写动作实时记录；外部变动通过 sync-diff 记录。

### 13.2 Freshness 要求

- 日数据：显示 Amazon 报表生成时间、下载时间、归因窗口。
- 小时数据：显示 Marketing Stream event time 和接收时间。
- 实体快照：显示最近同步时间。
- 数据修正：支持同一日期重跑覆盖或版本化，不能假设报表永不变化。

### 13.3 Mock 策略

在真实授权前可以继续 mock，但必须：

- 每个接口返回 `source: 'mock' | 'amazon_ads_api' | 'marketing_stream' | ...`。
- 每个响应返回 `confidence`。
- UI 显示 mock 标识。
- mock 字段必须覆盖真实目标字段，不允许只 mock 少数字段导致 UI 需求被遗忘。

---

## 14. 验收标准

### 14.1 结构验收

- 投放详情只有 4 个 tab：天数据、对比分析、小时数据、广告位。
- 用户搜索词详情只有 2 个 tab：天数据、对比分析。
- 广告活动详情有 9 个 tab。
- 广告组/广告详情有 3 个 tab。
- 广告组合详情有 2 个 tab。

### 14.2 字段验收

- `投放详情 / 天数据`必须包含竞价、建议竞价、点击%、花费%、广告销售额%、直接销售额、直接订单、CPA、广告笔单价、广告销量、品牌新客字段。
- `投放详情 / 小时数据`必须明确依赖 Marketing Stream，不允许伪造小时数据。
- `投放详情 / 广告位`必须支持 placement、advertised product、placement+product 三个视角。
- `广告活动详情 / 溯源日志`必须有操作前/后数据和是否成功。

### 14.3 数据口径验收

- CTR/CPC/ACoS/CPA/CVR/广告笔单价公式一致。
- 百分比列有明确分母。
- `--` 与 `0` 区分。
- 同周期比较使用同一时区、币种、归因窗口。
- 小时数据和天数据不一致时显示解释和更新时间。

### 14.4 安全验收

- 所有写动作都默认走审计中心。
- 未接真实凭证时，写动作只能 mock/sandbox。
- 真实 Amazon Ads API 写入必须有二次确认、dry-run、回滚记录、权限控制。

---

## 15. 建议实施阶段

### Phase 0：文档和配置纠偏

- 固化本报告为需求基线。
- 修正 `target` tab 映射，不再包含 `userSearchTerms`。
- 为 `searchTerm` 增加独立详情类型。
- 扩展 mock 字段，先让 UI 目标完整。

### Phase 1：只读数据模型和 API

- 建立通用 analysis API。
- 扩展 daily/hourly/placement/log 数据模型。
- 所有接口返回 source/confidence/freshness。
- UI 完整展示 mock 但字段按真实目标。

### Phase 2：Amazon Ads API 日报接入

- 实体同步。
- campaign/adGroup/ad/target/searchTerm/placement 报表同步。
- 对比分析、天/周/月聚合。

### Phase 3：Marketing Stream 接入

- 小时数据。
- 超预算分析。
- campaign 时间序列。
- 日内预算使用和策略建议。

### Phase 4：审计写操作闭环

- 调价、预算、启停、否定、扩词等动作进入审计中心。
- 支持 dry-run、执行、回滚、外部变动识别。

---

## 16. 本轮证据索引

### 用户截图

- `D:\amz\tmp\keyscreen\a1.png`：投放主列表，红色箭头 1/2。
- `D:\amz\tmp\keyscreen\a2.png`：点击分析后的投放详情。
- `D:\amz\tmp\keyscreen\a2_modal_tabs.png`：投放详情 tab 区。
- `D:\amz\tmp\keyscreen\a2_table_header*.png`：投放详情天数据字段。

### Focused recon

- `D:\amz\tmp\recon-ad-only\target-row-analysis\SUMMARY.json`：目标行、真实 row links、tab 列表、risk=0。
- `D:\amz\tmp\recon-ad-only\target-row-analysis\03-tab-01-天数据.png`
- `D:\amz\tmp\recon-ad-only\target-row-analysis\03-tab-02-对比分析.png`
- `D:\amz\tmp\recon-ad-only\target-row-analysis\03-tab-03-小时数据.png`
- `D:\amz\tmp\recon-ad-only\target-row-analysis\03-tab-04-广告位.png`

### 六页面 sweep

- `D:\amz\tmp\recon-ad-only\six-surface-sweep\SUMMARY.json`：六个广告内页面的矩阵汇总。
- `D:\amz\tmp\recon-ad-only\six-surface-sweep\campaign_all\03-tab-09-溯源（日志）.png`
- `D:\amz\tmp\recon-ad-only\six-surface-sweep\campaign_all\03-tab-07-时间序列.png`
- `D:\amz\tmp\recon-ad-only\six-surface-sweep\campaign_all\03-tab-04-超预算分析.png`
- `D:\amz\tmp\recon-ad-only\six-surface-sweep\target_all\03-tab-04-广告位.png`

### Network

- `D:\amz\tmp\recon-ad-only\target-full-network\events.json`：投放详情接口与请求参数。

### 官方参考（用于未来真实数据接入方向）

- Amazon Ads API：`https://advertising.amazon.com/about-api`
- Amazon Marketing Stream：`https://advertising.amazon.com/solutions/products/amazon-marketing-stream`
- Amazon Ads Reports / Unified reporting 帮助页：`https://advertising.amazon.com/help/GBYSPTSLR337JMLH`、`https://advertising.amazon.com/help/GMH8A8AJSH4ATV6T`

---

## 17. 结论

如果后续要把本项目做成真正可用的“亚马逊广告操盘手”，不能只复刻一个抽屉样式。必须以“实体身份 + 时间粒度 + 归因窗口 + 数据源 + 指标口径”为核心建模。

本轮最重要的产品基线是：

1. 当前截图对应的是`投放详情`，不是 campaign 详情。
2. `投放详情`只有 4 个 tab：`天数据 / 对比分析 / 小时数据 / 广告位`。
3. `用户搜索词`是独立顶层页和独立详情，不是当前投放详情的第 5 个 tab。
4. 小时数据必须依赖 Marketing Stream 或明确不可用，不能伪造。
5. 未来所有真实写动作必须经过审计中心；本报告只定义只读分析需求和未来数据基础。
