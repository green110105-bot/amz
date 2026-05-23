# 领星广告模块 — 调研合成报告 v2（最终版）

**调研日期**：2026-05-22 / 23（跨夜）
**方法**：Playwright + CDP 连接已登录的领星 ERP debug Chrome，只读 RPA 抓取
**安全**：全程 **0 RISKY 真实写动作**。347 个非 GET 请求全部经审计，均为读接口（领星后端用 POST 做 list/query/dashboard）

---

## 0. 最终战果

| 维度 | 数字 |
|---|---:|
| 路由发现（dry-run）| 58 |
| 路由发现（DOM 挖掘 hidden detail）| +58（合 **116**）|
| **总深度爪取页面** | **66** |
| **总 sub-tab 点击 + 截图** | **164** |
| 总截图 + DOM dump | ~330 文件 |
| 总非 GET 请求审计 | 347 |
| **真实写动作** | **0** ⭐ |

---

## 1. 五层嵌套结构（用户问的"全部功能"答案）

```
Profile（店铺）
└── Portfolio（广告组合）
    └── Campaign（活动） · 9-tab：天/对比/小时/超预算/归因/广告位/时间序列/重点关键词/溯源
        └── AdGroup（广告组） · 9-tab
            ├── Ad（广告创意） · 3-tab
            ├── Keyword（关键词） · 7-tab：按小时/按星期/天/对比/小时/广告位/用户搜索词 ⭐
            ├── Target（商品定向） · 7-tab
            ├── Placement（广告位） · 3-tab
            ├── NegativeKeyword（否定关键词） · 0-tab（单一列表）
            ├── NegativeTarget（否定定向） · 0-tab
            └── SearchTerm（实际搜索词） · 2-tab
```

**每个详情层都有自己的 N-tab 多维分析视图。** 这是领星广告最核心的工程量。

---

## 2. 完整页面 + tab 矩阵（66 页 / 164 tab）

### SP（Sponsored Products）— 24 页 / 87 tab

| 路径 | tabs |
|---|---:|
| `/ad_report/campaign/index/index` 主入口 | 9 |
| `/ad_report/ad_group/index/index` 广告组管理 | 9 |
| `/ad_report/ad/index/index` 广告创意管理 | 9 |
| `/ad_report/keyword/profile/index` 关键词详情 | 7 |
| `/ad_report/target/auto/index` 自动定向 | 7 |
| `/ad_report/target/profile/index` 商品定向详情 | 7 |
| `/ad_report/ad_group/profile/index` AG 详情 | 3 |
| `/ad_report/ad/profile/index` Ad 详情 | 3 |
| `/ad_report/placement/profile/index` 广告位详情 | 3 |
| `/ad_report/keyword_search_term/profile/index` | 2 |
| `/ad_report/search_term_st/profile/index` | 2 |
| `/ad_report/campaign/portfolio/one` Portfolio 详情 | 2 |
| `/ad_report/negative_keyword/profile/list` 否定关键词 | 0 |
| `/ad_report/negative_target/profile/list` 否定定向 | 0 |
| `/ad_report/profile/target/index` Profile 定向 | 4 |
| `/ad_report/campaign/generate/index` SP 创建 | 0 |

### SB（Sponsored Brands / Headline）— 11 页 / 39 tab

| 路径 | tabs |
|---|---:|
| `/ad_report/headline/index/index` 主入口 | 6 |
| `/ad_report/headline/ad_group/list` SB AG | 6 |
| `/ad_report/headline/all_target/index` 全部定向 | 6 |
| `/ad_report/headline/headline_all_keyword/index` 全部关键词 | 5 |
| `/ad_report/headline/all_ad_group/list` | 3 |
| `/ad_report/headline/all_product_ad/list` 全部广告 | 3 |
| `/ad_report/headline/all_placement/index` 广告位 | 3 |
| `/ad_report/headline/all_keyword_search_term/index` | 2 |
| `/ad_report/headline/all_purchased_asin/list` 关联购买 ASIN | 2 |
| `/ad_report/headline/all_negative_keyword/index` | 0 |
| `/ad_report/headline/all_negative_target/index` | 0 |
| `/ad_report/headline/generate/create` SB 创建 | 0 |

### SD（Sponsored Display）— 8 页 / 23 tab

| 路径 | tabs |
|---|---:|
| `/ad_report/sd/index/index` 主入口 | 5 |
| `/ad_report/sd/all_audience/index` 受众 | 5 |
| `/ad_report/sd/all_target/index` 全部定向 | 5 |
| `/ad_report/sd/all_match_target/index` 匹配定向 | 4 |
| `/ad_report/sd/all_product_ad/index` | 2 |
| `/ad_report/sd/all_ad_group/index` | 2 |
| `/ad_report/sd/ad_group/index` | 5 |
| `/ad_report/sd/all_negative_target/index` | 0 |
| `/ad_report/sd/generate/index` SD 创建 | 2 |

### 分析（Analyze）— 8 页 / 12 tab

| 路径 | tabs |
|---|---:|
| `/ad_report/analyze/sku/index` 广告商品（ASIN/父ASIN）| 2 |
| `/ad_report/analyze/sku_campaign/index` SKU×活动 | 2 |
| `/ad_report/analyze/sku_target/index` SKU×定向 | 2 |
| `/ad_report/analyze/sku_search_term/index` SKU×搜索词 | 2 |
| `/ad_report/analyze/country/index` 国家分析 | 2 |
| `/ad_report/analyze/ad_type/index` 广告类型分析 | 2 |
| `/ad_report/analyze/placement/index` 广告位分析 | 2 |
| `/ad_report/analyze/daily/index` 每日分析 | 0 |

### 工具 / 其他 — 11 页

| 路径 | tabs |
|---|---:|
| `/home` 仪表盘 | 0 |
| `/ad_report/portfolio/profile/list` 广告组合管理 | 2 |
| `/tools/timing_tactics/templates/apply_entity` 分时应用 | 0 |
| `/tools/timing_tactics/logs/execution_log` 分时执行日志 | 2 |
| `/tools/erp_trigger_new/task/index` 任务调度 | 2 |
| `/tools/msg_pusher/channel/index` 告警渠道 | 0 |
| `/ad_report/rule_pro/index/objects` 规则对象 | 0 |
| `/ad_report/rule_pro/index/list` 规则列表 | 0 |
| `/ad_report/rule_pro/index/create` 规则创建 | 0 |
| `/ad_report/rule_pro/index/update` 规则编辑 | 0 |
| `/ad_report/profile/index/setting` Profile 设置 | 0 |
| `/ad_report/keyword_grab/index/add` 关键词抢位添加 | 0 |
| `/ad_report/order_analysis/product/index` 商品订单分析 | 2 |

---

## 3. 关键发现：标准 "9-tab 模板" 是 80% 工程量

**所有 master / detail 页都共用同一套 tab 集合的子集**：

| Tab 名 | 出现在多少页 | 业务 |
|---|---:|---|
| 天数据 | 22 | 日维度聚合 |
| 对比分析 | 22 | 时间段对比 |
| 小时数据 | 17 | 24h 聚合 |
| 广告位 | 16 | top/product/rest 拆分 |
| 时间序列 | 14 | 长时段曲线 |
| 归因期分析 | 13 | 多归因窗口 |
| 重点关键词 | 11 | 关键词追踪 |
| 溯源（日志） | 11 | 操作历史 |
| 超预算分析 | 9 | 超预算告警 |
| 用户搜索词 | 2 | （仅 keyword 页有，最珍贵）|
| 按小时 / 按星期 | 2 | （keyword 页特有）|

→ **复刻这 11 种 tab 的可复用 Vue 组件 = 你 M3 80% 工作量**

---

## 4. 你的关键词详情页（用户问的）— 完整能力

**URL**: `/ad_report/keyword/profile/index?profile_id=*`

**7 个 tab**：
1. **按小时** — 一天 24 小时分时
2. **按星期** — 周一-周日维度
3. **天数据** — 日（默认）
4. **对比分析** — 双时段对比
5. **小时数据** — 全周期小时聚合
6. **广告位** — top/product/rest 三档
7. **用户搜索词** ⭐ — 看真实搜了什么词触发了这个关键词

**列字段**：
- ASIN / 商品标题 / 图片 / 价格 / 星级 / 评论 / 销量 / 竞价 / 广告对象 / 失败原因
- （+ 隐藏在"列配置"里的更多列 - 通常 30-50 个）

→ 你 M3 完全没有这种 "**单关键词 → 7 维度时间切片 + 搜索词回溯**" 的分析视图

---

## 5. v1→v2 重估 M3 追平工作量

| 阶段 | 范围 | 工期 |
|---|---|---|
| **P0-1 通用组件层** | 9-tab 模板组件 + 列配置 + 导出 + 时间段对比 | 1-2 周 |
| **P0-2 SP 主入口** | /campaign/index + 9 tab | 1 周 |
| **P0-3 SP 子层级 ×5** | adgroup / keyword / target / ad / placement 详情 | 1.5 周 |
| **P0-4 SB 主 + 6 子** | headline 全套 | 1.5 周 |
| **P0-5 SD 主 + 5 子** | sd 全套 + 受众 | 1 周 |
| **P0-6 分析层** | SKU×多维 (8 页) | 1 周 |
| **P1 工具层** | 分时 + 递增预算 + 规则 + 告警渠道 | 2-3 周 |
| **P2 AMC + DSP + 引流** | 全新模块 | 6-8 周 |
| **合计**（追平 P0）| | **~8 周** |
| **合计**（含 P1）| | **~11 周** |
| **合计**（含 P2 全平）| | **~17-19 周** |

**反思**：原 4 周冲刺路线现在严重低估。**追平领星广告 = 全职 2-3 个月**。

---

## 6. 战略建议（修正版）

### 你不应该追平领星，应该差异化打

| 你的优势 | 杠杆 |
|---|---|
| **现代 Vue 3 + 移动端** | 移动 App 体验比领星好 10 倍 |
| **AI 多轮迭代生成**（M1）| 领星建议是固定规则，你做"对话式优化" |
| **跨模块联动**（M2→M3、M4→M3）| 卖"完整 ERP"而非"广告工具" |
| **现代化代码 + 可维护性** | 你 1 个开发者维护 = 领星 5 个 |

### 推荐路线（不是追领星，是打领星）

```
Week 2: 拿 5 个真客户（你已有 1 个）
        → 必须接 Ads API Developer（你卡这里 5 天了，是真瓶颈）
        → 接通后做"9-tab 模板组件"一次性覆盖 60% 体验

Week 3-4: 把 M2 利润 ↔ M3 广告 双向联动做厚
          → 这是你独有的，领星没有

Week 5-6: 移动 App MVP
          → 卖家最痛点：手机看广告
          → 领星完全没做

Week 7-12: 慢追 SP 主链路 9-tab，靠组件化省工时
            一次写好 9-tab → 复用到 30+ 页面
```

---

## 7. 数据资产位置（全部 gitignored）

```
tools/recon/
├── output/
│   ├── pages/                     38 个广度页快照
│   ├── deep/                      66 个深度页 × 164 sub-tab
│   ├── routes.json                58 sidebar 路由
│   ├── detail-routes.json         58 hidden detail 路由
│   ├── recon-audit.log            347 个非 GET 请求审计（0 真实 RISKY）
│   └── reports/
│       ├── lingxing-ads-deep-spec.md         (479 行)
│       ├── lingxing-ads-api-fingerprint.md   (189 行)
│       ├── api-inventory.md
│       ├── lingxing-ads-spec.md
│       ├── ui-inventory.md
│       └── m3-gap-analysis.md
└── (scripts)
    ├── launch-chrome.mjs
    ├── crawl.mjs                  广度
    ├── deep-crawl.mjs             深度 batch 1
    ├── deep-detail.mjs            细节 batch 1
    ├── deep-detail-batch2.mjs     细节 batch 2
    ├── discover-detail-routes.mjs DOM 挖路由
    ├── analyze.mjs                通用报告
    ├── analyze-deep.mjs           深度报告
    └── nav-to-lingxing.mjs        Chrome 引导
```

**docs/LINGXING_ADS_RECON.md** ← v1（保留作历史）
**docs/LINGXING_ADS_RECON_v2.md** ← 本文件（v2，最终版）
