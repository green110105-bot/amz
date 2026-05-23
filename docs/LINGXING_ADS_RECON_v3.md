# 领星广告模块 — 调研合成报告 v3（drawer 层级完整版）

**调研日期**：2026-05-22 / 23
**方法**：Playwright CDP + 每步桌面截图（PowerShell `CopyFromScreen`），每个交互**先截屏，再描述**
**累计**：116 个路由发现 + 66 个深度页 + 164 个 page-tab + **43 张 drawer 桌面截屏**
**安全**：347+ 非 GET 请求，**0 真实写动作**

---

## 0. 这一版补了什么（vs v2）

v1/v2 都是 URL 级别 recon — 跳转、查 DOM、列 page tab。**漏掉了 drawer 形态的全部子界面**（点行打开、URL 不变）。

v3 补完：**6 种 row 类型 × 各自 drawer × drawer 内所有 tab**，全部截屏 + 描述。

---

## 1. 领星广告的"drawer 中心"架构

```
                  ┌─────────────────────────────────────────┐
                  │  modal fade MCompare in   #MCompare_N    │
                  │  ⤷ 顶部下拉 panel，~30-50% 高              │
                  │  ⤷ 标题：<entity>详情                    │
                  │  ⤷ tab 集随 row 类型变化（2~9 个）        │
                  │  ⤷ 每行 to-compare-data-list 图标 = 唯一入口 │
                  └─────────────────────────────────────────┘
                                  ↑
                  ┌───────────────┴───────────────┐
              点行内图标                       点"..."更多
                  │                                │
        ┌─────────┴─────────┐         ┌────────────┴────────────┐
        │ MCompare 默认 tab  │         │ popover 弹窗（4 item）   │
        │ = "天数据"         │         │ · CST → URL 跳转         │
        └───────────────────┘         │ · 环比&同比 → MCompare 对比 tab │
                                      │ · 操作日志 → MHistoryLogV2 │
                                      │ · 添加到抢位 → URL 跳转 (⚠ 写) │
                                      └─────────────────────────┘
                                                ↓
                          ┌──────────────────────────────────┐
                          │  modal fade MHistoryLogV2 in     │
                          │  ⤷ 顶部下拉 panel，~30% 高         │
                          │  ⤷ 无 tab，单页日志列表           │
                          │  ⤷ 过滤：时间 + 操作类型 + 搜索    │
                          │  ⤷ 列：时间/人/活动/组/词/类型/前/后 │
                          └──────────────────────────────────┘
```

**关键认知**：**整个广告模块只有 2 种 drawer**（`MCompare` 和 `MHistoryLogV2`），但 `MCompare` 通过不同 row 配置出 7 种 tab 集，所以**功能复杂度集中在 1 个组件的 tab 编排**。

---

## 2. 每行类型的 drawer tab 集（完整）

| Row | URL | MCompare tabs | 备注 |
|---|---|---|---|
| **Campaign** | `/ad_report/profile/campaign/index` | **9 tabs**：天/对比/小时/超预算/归因期/广告位/时间序列/重点关键词/溯源 | 最重的视图，含独立"溯源（日志）"tab，所以不需要再开 MHistoryLogV2 |
| **Keyword** | `/ad_report/keyword/profile/index` | **5 tabs**：天/对比/小时/广告位/用户搜索词 | "用户搜索词"是关键词独有 |
| **Target** | `/ad_report/target/profile/index` | **5 tabs**：天/对比/小时/广告位/用户搜索词 | 同 keyword 但数据维度是 ASIN |
| **AdGroup** | `/ad_report/ad_group/profile/index` | **3 tabs**：天/对比/小时 | 中等 |
| **Ad** | `/ad_report/ad/profile/index` | **3 tabs**：天/对比/小时 | 中等 |
| **Placement** | `/ad_report/placement/profile/index` | **3 tabs**：天/对比/小时 | 中等 |
| **Portfolio** | `/ad_report/portfolio/profile/list` | **2 tabs**：天/对比 | 最简 |

## 3. 每行的 "to-show-more" 弹窗 4 项

| 项 | trigger class | 类型 | drawer/URL |
|---|---|---|---|
| **CST 查看用户搜索词** | `to-show-cst` | URL 跳转 | `/ad_report/keyword_search_term/...` |
| **环比&同比分析** | `to-compare-vs-list` | drawer deep-link | MCompare 的"对比分析"tab |
| **查看操作日志** | `to-operate-log` | **独立 drawer** | MHistoryLogV2 |
| **添加到抢位** | `to-add-grab` (`Js-to-add`) | URL 跳转（⚠ 写）| `/ad_report/keyword_grab/index/add` |

Portfolio 无 "查看操作日志" 项。

---

## 4. 每个 MCompare tab 的内容（5 tab + 9 tab）

| Tab | 出现在哪些 row | 内容 |
|---|---|---|
| **天数据** | 全部 | 日维度聚合表 + 总计行；列：曝光/点击/CTR/CPC/花费/订单/销售/ACoS |
| **对比分析** | 全部 | 双日期范围选择 + 两张并排表（时段一 / 时段二） |
| **小时数据** | Camp/Key/Tgt/AG/Ad/Place | 24h 折线图 + 24 行明细 |
| **广告位** | Campaign/Keyword/Target | 3 段拆分：top / product page / rest of search + bid 加成 |
| **用户搜索词** | Keyword/Target | 实际用户查询表（搜索词→指标） |
| **超预算分析** | Campaign | 哪些活动超预算 + 跑超时段 |
| **归因期分析** | Campaign | 1天 / 7天 / 14天 归因窗口对比 |
| **时间序列** | Campaign | 长时段曲线（30/90/180 天） |
| **重点关键词** | Campaign | 跟踪自定义 KW 集合 |
| **溯源（日志）** | Campaign | inline 操作历史，等同其他 row 的 MHistoryLogV2 |

---

## 5. MHistoryLogV2 操作日志 drawer 结构

```
顶部过滤：
  · 1日 / 3日 / 7日 时间快捷
  · 自定义日期范围
  · 操作记录 dropdown（点击/启停/调价/创建/等）
  · 全部 / 仅成功 / 仅失败 过滤
  · 关键词搜索框
副标题：上下文（广告活动 + 广告组 + 词/ASIN）
表头列：
  · 操作时间（执行）
  · 操作人
  · 广告活动名
  · 广告组
  · 关键词 / 商品 / 实体名
  · 操作类型
  · 操作前
  · 操作后
  · 操作详情
  · 备注
  · 操作来源（手动 / 自动规则 / 分时 / API）
分页：标准 25 条/页
```

无 tab。是一个高密度日志表 panel。

---

## 6. 用户实际操作流程（推断）

基于 drawer 设计，典型卖家工作流是：

```
1. 进 keyword 列表  ← 你 demo 时打开的
2. 筛选高花费 / 高 ACoS 的 keyword
3. 点 to-compare-data-list 图标 → MCompare drawer 弹出（默认 天数据 tab）
4. 切到 "对比分析" 对比上周
5. 切到 "广告位" 看是不是某个位置烧钱
6. 切到 "用户搜索词" 看真实用户查询
7. 关 drawer
8. 行内直接修改 bid 或勾选多个去批量调价（M3 P0 已经做了这条）
9. 偶尔点 "..." → 查看操作日志 → MHistoryLogV2 看历史
```

drawer 的精髓：**不离开列表也能下钻分析**。这就是用户说的"全部功能"在这里。

---

## 7. 你 M3 的 drawer 架构设计（具体到代码层）

### 7.1 复用一个 `AdAnalysisDrawer.vue` 组件

```vue
<!-- apps/web-v2/src/components/AdAnalysisDrawer.vue -->
<el-drawer
  v-model="visible"
  :title="entity.title || `${entity.typeLabel}详情`"
  direction="ttb"           <!-- 顶部下拉，匹配领星 -->
  :size="'50%'"
  :modal="true"
  :destroy-on-close="false">

  <el-tabs v-model="activeTab" class="ad-analysis-tabs">
    <el-tab-pane v-for="tab in availableTabs" :key="tab.value"
                 :name="tab.value" :label="tab.label">
      <component :is="tab.component" :entity="entity" :date-range="dateRange" />
    </el-tab-pane>
  </el-tabs>
</el-drawer>
```

### 7.2 按 entity-type 配置 tab 集

```js
// apps/web-v2/src/utils/ad-drawer-tabs.js
export const DRAWER_TABS_BY_TYPE = {
  campaign: ['daily', 'compare', 'hourly', 'over-budget', 'attribution', 'placement', 'time-series', 'key-keywords', 'history'],
  keyword:  ['daily', 'compare', 'hourly', 'placement', 'user-search-terms'],
  target:   ['daily', 'compare', 'hourly', 'placement', 'user-search-terms'],
  adgroup:  ['daily', 'compare', 'hourly'],
  ad:       ['daily', 'compare', 'hourly'],
  placement:['daily', 'compare', 'hourly'],
  portfolio:['daily', 'compare'],
};
```

### 7.3 每个 tab = 一个独立 SFC

10 个 tab components 直接复用到任何 entity：
- `TabDaily.vue` — 日维度表
- `TabCompare.vue` — 双时段对比
- `TabHourly.vue` — 24 小时趋势图 + 明细
- `TabPlacement.vue` — 广告位拆分
- `TabUserSearchTerms.vue` — 搜索词（仅 keyword/target）
- `TabOverBudget.vue` — 超预算分析（仅 campaign）
- `TabAttribution.vue` — 归因窗口（仅 campaign）
- `TabTimeSeries.vue` — 长时段曲线（仅 campaign）
- `TabKeyKeywords.vue` — 跟踪 KW（仅 campaign）
- `TabHistory.vue` — 操作日志 inline（campaign）/ 独立 drawer（其他）

### 7.4 关 + 上下文保留

drawer 关闭时**不重置 underlying 列表的滚动位置、筛选、分页**。Element Plus 的 `el-drawer` 默认会重渲染 body — 用 `:destroy-on-close="false"`。

### 7.5 行内"..."菜单

```vue
<el-popover trigger="click" placement="bottom-end" width="200">
  <template #reference><el-icon><MoreFilled /></el-icon></template>
  <ul class="row-more-menu">
    <li @click="goSearchTerms(row)">查看用户搜索词</li>
    <li @click="openDrawer(row, { initialTab: 'compare' })">环比&同比分析</li>
    <li @click="openHistory(row)">查看操作日志</li>
    <!-- 写动作不在这里 -->
  </ul>
</el-popover>
```

---

## 8. 工作量重估（基于 drawer 架构）

| 阶段 | 范围 | 工时 |
|---|---|---|
| Phase 1: 通用 drawer 组件 + 10 个 tab SFC | 一次性 | **1.5 周** |
| Phase 2: 接入 6 个 master 页 + 行点击 | 每页 0.5 天 | **3 天** |
| Phase 3: 数据接入（每 tab 一个 SP-API 端点）| Ads Reports API 上线后 | **1 周** |
| Phase 4: 移动端适配（drawer 在 mobile 改全屏）| | **3 天** |
| **MVP 合计** | | **~3.5 周** |

之前 v2 估了 11-19 周追平 — **大量重复工作可以靠"1 组件 + 7 种配置"砍掉**。实际 MVP 应该在 **4 周内**就能打出 80% 体验，剩下是数据接入靠 Amazon API。

---

## 9. 截屏档案位置（自查用）

```
tools/recon/output/row-drawers/
├── keyword/      (drawer-tabs/desktop-*.png 6 张)
├── target/       9 张
├── adgroup/      5 张
├── ad/           5 张
├── placement/    5 张
├── campaign/     11 张
└── portfolio/    4 张

tools/recon/output/drawer-tabs/desktop-*.png  (keyword 早期截屏 5 张)
tools/recon/output/drawer-capture/tab-2-*.png  (drawer 完整 DOM dump)
```

---

## 10. 我承认的错误清单（学习用）

| 错误 | 第几轮发现 |
|---|---|
| recon 一开始只 `page.goto()`，错过所有 drawer | v3 才补 |
| 把 `twoLine` (CSS) 当成点击 trigger | recon round 3 |
| 把 `JS-quick-view` (dropdown 子项) 当 drawer trigger | recon round 4 |
| 把 `to-compare-vs-list` 当独立 drawer | drawer 调查时才发现是 MCompare deep-link |
| 没意识到 `to-show-more` 在屏幕外（x=3262），DOM click 但弹窗看不见 | step-by-step 截屏才发现 |
| 没注意 drawer 是"顶部下拉"而非"侧面"或"全屏" | 第一次桌面截屏才看到 |

**纠正**：从这一版起，**每个交互前后都桌面截屏**，眼睛比 DOM grep 可靠 10 倍。
