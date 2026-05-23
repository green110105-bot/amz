# 移动端响应式 SPEC（p15 Foundation）

适用范围：`apps/web-v2/` Vue 3 + Element Plus。后续 page-migration agent 据此迁移单页。

---

## 1. 断点定义

| 名称 | 宽度 | 用途 |
|---|---|---|
| **mobile** | `< 768px` | 手机竖屏 / 小平板竖屏 |
| **tablet** | `768px – 1023px` | 中等屏 / 平板横屏 |
| **desktop** | `>= 1024px` | 桌面 / 笔电 / 大屏 |

CSS media query：`@media (max-width: 767px) { ... }`

JS 读取：
```js
import { useViewport } from '@/composables/useViewport';
const { isMobile, isTablet, isDesktop, isTouch, breakpoint } = useViewport();
```

`isMobile`、`isTablet`、`isDesktop`、`isTouch` 都是响应式 `Ref<boolean>`。`breakpoint.value` 是 `'mobile' | 'tablet' | 'desktop'`。

---

## 2. 已建立的基础设施

| 文件 | 用途 |
|---|---|
| `index.html` | viewport meta + iOS safe-area + 禁用电话号检测 |
| `src/composables/useViewport.js` | 视口断点 composable |
| `src/styles/mobile.css` | 全局 Element Plus 移动端样式覆盖 |
| `src/main.js` | 注册 `mobile.css` |
| `src/layouts/DefaultLayout.vue` | 桌面 aside / 移动 drawer + 汉堡键 |
| `src/components/ResponsiveTable.vue` | 表格 → 卡片自适应 |
| `src/components/ResponsiveDialog.vue` | Dialog 移动端 92% 宽 |
| `src/components/ResponsiveDrawer.vue` | 移动端底部 bottom sheet |
| `src/components/MobileFallback.vue` | 复杂桌面页的移动 fallback |

**禁止**：page agent 不要再加全局 viewport 处理 / 不要重新装 @vueuse。

---

## 3. 4 个 Wrapper 组件 API

### 3.1 ResponsiveTable

桌面：渲染 `<el-table>` + 透传 default slot 列定义；移动：渲染卡片列表，每行一张卡片。

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `data` | `Array` | `[]` | 表格数据（同 el-table） |
| `mobileColumns` | `Array<{prop,label,formatter?}>` | `null` | 移动卡片字段列表 |
| `rowClickable` | `Boolean` | `false` | 点击卡片触发 `@row-click` |

**Slots**：
- `default` — 桌面 el-table 的列定义（el-table-column）
- `mobile-actions` — 卡片底部操作区（接 `{ row }`）
- `mobile-<prop>` — 单字段自定义渲染（接 `{ row, value }`）

**示例**：
```vue
<ResponsiveTable
  :data="rows"
  :mobile-columns="[
    { prop: 'sku', label: 'SKU' },
    { prop: 'profit', label: '利润', formatter: (v) => `¥${v}` },
    { prop: 'roi', label: 'ROI' }
  ]"
  row-clickable
  @row-click="openDetail"
>
  <el-table-column prop="sku" label="SKU" />
  <el-table-column prop="profit" label="利润" />
  <el-table-column label="操作">
    <template #default="{ row }">
      <el-button size="small" @click="edit(row)">编辑</el-button>
    </template>
  </el-table-column>
  <template #mobile-actions="{ row }">
    <el-button size="small" type="primary" @click.stop="edit(row)">编辑</el-button>
  </template>
</ResponsiveTable>
```

### 3.2 ResponsiveDialog

| Prop | 默认 | 说明 |
|---|---|---|
| `modelValue` | — | v-model |
| `title` | — | 标题 |
| `width` | `'500px'` | 桌面宽度（移动恒为 92%） |

桌面 close-on-click-modal=true，移动 false 防误触。

### 3.3 ResponsiveDrawer

| Prop | 默认 | 说明 |
|---|---|---|
| `modelValue` | — | v-model |
| `title` | — | 标题 |
| `size` | `'500px'` | 桌面尺寸（移动恒为 88% 高底部弹出） |

桌面 rtl 右侧弹出；移动 btt 底部弹出（bottom sheet）。

### 3.4 MobileFallback

| Prop | 默认 | 说明 |
|---|---|---|
| `pageName` | — | 页面名 |
| `reason` | `'此页面包含复杂的多列编辑，建议在桌面端使用。'` | 提示语 |

**Slot**：`readonly` — 移动端只读视图（可空）。

**使用模式**：
```vue
<template>
  <PageHeader title="选品对比" />
  <MobileFallback v-if="isMobile" page-name="选品对比矩阵">
    <template #readonly>
      <ResponsiveTable :data="summaryRows" :mobile-columns="..." />
    </template>
  </MobileFallback>
  <div v-else>
    <!-- 完整桌面交互 -->
  </div>
</template>
```

---

## 4. KPI 网格响应式

所有 KPI 卡片网格用 el-row + el-col 的响应式属性：

```vue
<el-row :gutter="16">
  <el-col v-for="kpi in list" :key="kpi.id" :xs="24" :sm="12" :md="8" :lg="6">
    <KpiCard v-bind="kpi" />
  </el-col>
</el-row>
```

| 屏幕 | 列数 |
|---|---|
| xs (<768) | 1 列（全宽） |
| sm (768-991) | 2 列 |
| md (992-1199) | 3 列 |
| lg (>=1200) | 4 列 |

---

## 5. 表格迁移 Cookbook（el-table → ResponsiveTable）

**4 步走**：

1. **import 替换**
   ```js
   import ResponsiveTable from '@/components/ResponsiveTable.vue';
   ```
2. **抽 mobileColumns**：从原 el-table-column 中挑 3–5 个关键字段（不要全抽，移动端只显示最关键的）。
   ```js
   const mobileCols = [
     { prop: 'sku', label: 'SKU' },
     { prop: 'price', label: '售价', formatter: (v) => `¥${v.toFixed(2)}` },
     { prop: 'stock', label: '库存' },
   ];
   ```
3. **`<el-table>` → `<ResponsiveTable>`**，保留所有 `<el-table-column>`（桌面用），追加 `<template #mobile-actions>` 把表格里的"操作"列搬到卡片底部。
4. **测试**：用 DevTools 切到 375 宽，确认卡片正常、点击行可用、操作按钮可点。

---

## 6. Tier 分类（page agent 据此判断改造力度）

### T1 — 移动一等公民（必须完整移动适配）
- `Workbench`（首页工作台）
- `Notifications`（通知中心）
- `MonitorAnomalies`（异常监控）
- `AdsTimeline`（广告时间线）
- `ProfitOverview`（利润总览）
- `SLABoard`（SLA 看板）
- `Audit`（审计）

→ 用 ResponsiveTable + KPI 响应式网格 + 全部按钮 ≥ 40px。

### T2 — 移动可用（列表型）
- 多数 `*List` / `*Index` 页

→ 用 ResponsiveTable + 关键操作迁到 mobile-actions slot。

### T3 — 桌面优先 + 移动 fallback（复杂多列编辑）
- `ListingOptimize`
- `PurchaseOrders` 详情
- `TaxAssist`
- `ScenarioSimulator`
- `ListingAbCenter`

→ `<MobileFallback v-if="isMobile">` 包关键编辑区，slot=readonly 展示概览。

---

## 7. 强制约束

- **禁止 hover-only 提示**：所有 tooltip 必须 trigger="click" 或同时支持 click（触屏无 hover）。
- **工具栏改图标按钮**：移动端 toolbar 多个按钮挤一行时，用 `circle` + 仅 icon。
- **长文截断**：长 SKU / ASIN / URL 用 `word-break: break-all` 或 `<el-tooltip>` + `.text-truncate`。
- **避免水平滚动**：除非数据表必须，否则页面级别不要 overflow-x。
- **表单**：移动端 inline form 一律改成 block（`label-position="top"` 优先）。
- **按钮间距**：mobile 下相邻按钮 gap ≥ 8px。
- **modal 嵌套**：移动端避免 dialog 内再开 dialog（栈深 ≤ 1）。

---

## 8. 测试 Checklist（page agent 自测）

- [ ] DevTools 切 iPhone 12（390×844）查看
- [ ] DevTools 切 iPad Mini（768×1024）查看
- [ ] 顶部汉堡键打开抽屉，可滑选菜单 → 选中后自动关闭
- [ ] 表格在 mobile 下变卡片
- [ ] dialog 不出屏（宽 92% top 4vh）
- [ ] drawer 从底部弹出
- [ ] 所有按钮可点（≥ 40px tap target）
- [ ] 无水平滚动条
