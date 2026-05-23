# M4 监控 / 评价 / 申诉 / 跟卖 / 竞品 / 通知 — 前端 Self-Check 报告

**日期**：2026-05-16
**Phase**：`p2-fe-selfcheck`
**范围**：1 API client + 1 composable 单例 + 1 全局通知总线 + 1 NotificationBell 组件 + 16 页面改造
**目标**：将老 M4 mock 数据替换为 `m4.js` + `useM4State.js`，并在顶栏挂载 `NotificationBell` 通过 `useNotificationsBus` 全局轮询 `/m4/notifications/*`

---

## 1. 完成清单

### 1.1 新建文件（4 个）

| 路径 | 行数 | 角色 |
|---|---|---|
| `apps/web-v2/src/api/m4.js` | 137 | 13 namespace / ~66 endpoints |
| `apps/web-v2/src/composables/useM4State.js` | 1158 | 14 composable |
| `apps/web-v2/src/composables/useNotificationsBus.js` | 175 | 全局通知总线（singleton + 10s 轮询 + 乐观 markRead + pushLocal） |
| `apps/web-v2/src/components/NotificationBell.vue` | 163 | 顶栏铃铛（dot / 数字 badge / 弹层列表 / mark-read / 跳详情） |

### 1.2 改造 16 页面（M4 SPEC §4）

| # | 页面 | LOC | 改造摘要 |
|---|------|-----|---------|
| 1 | `MonitorAnomalies.vue` | 216 | `useAnomalies()` + bus.pushLocal（处置后） |
| 2 | `SLABoard.vue` | 78 | `useSLABoard()` |
| 3 | `ResolutionCases.vue` | 120 | `useResolutionCases()` |
| 4 | `Postmortems.vue` | 140 | `usePostmortems()` + `useAnomalies()` + bus.pushLocal |
| 5 | `Hijacking.vue` | 161 | `useHijacking()` + bus.pushLocal |
| 6 | `Infringement.vue` | 180 | `useInfringement()` + bus.pushLocal |
| 7 | `ReviewList.vue` | 200 | `useReviews()` + bus.pushLocal |
| 8 | `ReviewClusters.vue` | 154 | `useReviewClusters()` + bus.pushLocal |
| 9 | `ReviewTrends.vue` | 117 | `useReviewTrends()` |
| 10 | `Appeals.vue` | 250 | `useAppeals()` + state transitions + bus.pushLocal |
| 11 | `RecoveryEmails.vue` | 205 | `useRecovery()` + 多轮邮件 transitions + bus.pushLocal |
| 12 | `Competitors.vue` | 156 | `useCompetitors()` 9 维监控 |
| 13 | `ImageDiff.vue` | 139 | `useImageDiffs()` + push-M1 + bus.pushLocal |
| 14 | `CompetitorAttack.vue` | 130 | `useCompetitors()` + bus.pushLocal |
| 15 | `BrandDefense.vue` | 117 | **partial**：仍 `import mockBrandDefense`，未接 `brandDefenseApi` |
| 16 | `Notifications.vue` | 85 | **partial**：仍 `import mockNotifications`，未接 `notificationsApi` |

**16 页面 LOC 合计：2448**

---

## 2. API 契约（`src/api/m4.js`）

13 个命名空间，约 66 endpoints。基础路径 `/api/v1/store/m4`。

| Namespace | 端点数 | 主要方法 |
|-----------|--------|---------|
| `anomaliesApi` | 7 | list / get / create / assign / acknowledge / resolve / dismiss / escalate |
| `slaApi` | 2 | board / events |
| `resolutionApi` | 5 | list / get / create / update / recommend |
| `postmortemsApi` | 4 | list / get / generate / update |
| `hijackingApi` | 6 | list / scan / startTestBuy / uploadProof / submitAppeal / close |
| `infringementApi` | 5 | list / create / draft / submit / resolve |
| `reviewsApi` | 12 | list / get / sync / markAppealable / pushM1 + clusters 子（list/recompute/get/pushM1）+ trends.{list,snapshot} |
| `appealsApi` | 5 | list / draft / submit / review / retry |
| `recoveryApi` | 5 | list / draft / send / recordReply / nextRound |
| `competitorsApi` | 5 | list / add / snapshot / timeline / dismissChange |
| `imageDiffsApi` | 3 | list / scan / pushM1 |
| `brandDefenseApi` | 4 | get / enableLayer / disableLayer / counter |
| `notificationsApi` | 5 | list / post / markRead / markAllRead / unreadCount |
| **合计** | **~68** | — |

---

## 3. Composable 清单（`src/composables/useM4State.js`）

14 个 composable + 3 个动作辅助常量导出：

```
useAnomalies         157    + allowedAnomalyActions  (helper)
useSLABoard          262
useResolutionCases   307
usePostmortems       371
useHijacking         431
useInfringement      518
useReviews           598
useReviewClusters    667
useReviewTrends      727
useAppeals           780    + allowedAppealActions / canAppealTransition
useRecovery          871    + allowedRecoveryActions / canRecoveryTransition
useCompetitors       956
useImageDiffs        1028
useBrandDefense      1088
```

每个 composable：模块作用域 reactive ref + 单飞 promise + 乐观更新 + 失败回滚。

`useBrandDefense` 已 export（行 1088），但 `BrandDefense.vue` 页面尚未改造引用 — 见 §8。

---

## 4. NotificationBell 集成位置

**文件**：`apps/web-v2/src/layouts/DefaultLayout.vue`

| 位置 | 行号 | 代码 |
|------|------|------|
| import | 8 | `import NotificationBell from '../components/NotificationBell.vue';` |
| 挂载 | 174 | `<NotificationBell class="topbar-bell" />` |

挂载在顶栏右上角（"Mock 数据已加载" tag 后、用户头像下拉前）。

`NotificationBell.vue`（163 行）调用 `useNotificationsBus()`：
- `onMounted` → `bus.startPolling(10000)`
- `onBeforeUnmount` → `bus.stopPolling()`
- 显示 `unreadCount` badge（>0 红点 / 数字）+ popover 列表 + `markRead(id)` / `markAllRead()` + 跳转 `link`

`useNotificationsBus` export 表（apps/web-v2/src/composables/useNotificationsBus.js:158-175）：
- `list` (ref)
- `unreadCount` (ref)
- `summary` (ref)
- `loaded` / `loading` / `error`
- `refresh()` / `startPolling(intervalMs)` / `stopPolling()`
- `markRead(id)` / `markAllRead()` / `pushLocal(item)` / `reset()`
- `recent` (computed)

打包后 NotificationBell + useNotificationsBus 内联在 `index-*.js` 主包（DefaultLayout 是根布局，无需独立 chunk）。

---

## 5. 16 页面改造状态

| 状态 | 数量 | 页面 |
|------|------|------|
| **done** | 14 | MonitorAnomalies / SLABoard / ResolutionCases / Postmortems / Hijacking / Infringement / ReviewList / ReviewClusters / ReviewTrends / Appeals / RecoveryEmails / Competitors / ImageDiff / CompetitorAttack |
| **partial** | 2 | BrandDefense（仍 `mockBrandDefense`）／ Notifications（仍 `mockNotifications`） |
| blocked | 0 | — |

### 5.1 partial 详情

- `BrandDefense.vue:5` — `import { mockBrandDefense } from '../utils/mock-data-ads'`。Composable `useBrandDefense` 已就绪（useM4State:1088）、API `brandDefenseApi` 已就绪。页面层重写未完成，应替换为 `const bd = useBrandDefense(); onMounted(() => bd.fetch());` + enable/disable/counter 调 `bd.*`。
- `Notifications.vue:5` — `import { mockNotifications } from '../utils/mock-data-extras'`。可改用 `useNotificationsBus().list` 直接渲染全量（去掉 mock），或新建 `useNotificationsCenter` 走 `notificationsApi.list({ paged: true })` 全表。

这两个不阻断 build / 不阻断 NotificationBell 总线工作（铃铛直接走 `notificationsApi`，与 Notifications.vue 中心页相互独立）。

---

## 6. Build 结果

```
npm --prefix apps/web-v2 run build
✓ built in 7.58s
exit=0
```

M4 关键 chunk（dist/assets/）：

| chunk | 大小 |
|-------|------|
| `useM4State-D5bWPaSv.js` | 14.68 kB (gzip 4.30) |
| `MonitorAnomalies-BIf0-k62.js` | 8.88 kB |
| `SLABoard-B4WgGByn.js` | — |
| `ResolutionCases-DxRgJpNi.js` | — |
| `Postmortems-CnEbXtGc.js` | — |
| `Hijacking-d10mHAgD.js` | 7.37 kB |
| `Infringement-YdS9_4LC.js` | 7.38 kB |
| `ReviewList-DN7uLJIQ.js` | 8.48 kB |
| `ReviewClusters-C0KVt8ju.js` | — |
| `ReviewTrends-BGT1kKkd.js` | — |
| `Appeals-DbUNytLw.js` | 10.16 kB |
| `RecoveryEmails-DVl7DzAW.js` | 7.91 kB |
| `Competitors-D0lQ4PMm.js` | — |
| `ImageDiff-0eApCdUj.js` | — |
| `CompetitorAttack-DSeE2av_.js` | — |
| `BrandDefense-5hlYanSR.js` | — |
| `Notifications-BUXXJm8t.js` | — |

NotificationBell + useNotificationsBus 内联 `index-CrmAmAJc.js` 主包（grep 已确认）。无 build error；只有 chunk > 500kB warning（index 1256 kB，ECharts 等共享依赖致），预期内。

---

## 7. 静态校验

### 7.1 mock-data 残留（16 页面）

```bash
grep -E "from.*mock-data|mockData\\s*=|const \\w*[Mm]ock\\w*\\s*=" 16个页面
```

| 文件 | 残留行 |
|------|--------|
| `BrandDefense.vue:5` | `import { mockBrandDefense } from '../utils/mock-data-ads'` |
| `Notifications.vue:5` | `import { mockNotifications } from '../utils/mock-data-extras'` |
| 其他 14 个 | 0 |

合计 **2** 处残留，仅落在 partial 页面。

### 7.2 import 一致性

| 页面 | composable / bus 引用 |
|------|----------------------|
| 14 / 16 | 含 `useM4State` 或 `useNotificationsBus` import |
| 11 / 16 | 含 `useNotificationsBus` import（处置后 pushLocal 触发铃铛）|
| 2 / 16 | 暂无（BrandDefense / Notifications）|

### 7.3 useNotificationsBus 接口签名（spec §5.3 要求）

- `unreadCount` ref ✓
- `markRead(id)` / `markAllRead()` ✓
- `startPolling(ms)` / `stopPolling()` ✓
- `pushLocal({ severity, sourceModule, title, body, link, channels })` ✓
- `recent` computed (前 10 条) ✓
- 404 / Network 静默吞掉（铃铛不报错噪音）✓

---

## 8. 已知问题 / 与 SPEC 偏差

| # | 问题 | 严重度 | 建议处理 |
|---|------|--------|---------|
| 1 | `BrandDefense.vue` 未对接 `useBrandDefense` + `brandDefenseApi`，仍 mock | medium | 下一轮重写（composable / api 已就绪） |
| 2 | `Notifications.vue` 未对接 `notificationsApi` 全量列表，仍 mock | medium | 改用 `notificationsApi.list({ limit: 100 })` 或复用 bus.list |
| 3 | `useNotificationsBus.pushLocal` 仅本地乐观插入，不入库；若用户刷新会丢；M2/M3 业务模块 pushLocal 后建议同时 POST `notificationsApi.post(...)` 持久化 | low | 后端 endpoint 已存在；composable 留接口由调用方决定 |
| 4 | NotificationBell 弹层中"标记全部已读"在后端 404 时会显示成功 toast（实际只本地清零） | low | 已加 try/catch 区分；非 404 错误才警告 |
| 5 | `useM4State` 各 hook 缺统一 reset (切店未 wipe Map)；目前依赖 client.js 注入新 storeId 后下一次 fetch 自动覆盖 | low | 切店时调 bus.reset() 已实现；其他 14 个 hook 暂未提供集中 reset |

无阻塞项。Build PASS，铃铛集成完整，14/16 页面真接口接入。

---

## 9. 验收 checklist

- [x] `npm run build` PASS（exit=0, 7.58s）
- [x] `m4.js` 13 namespace × 66+ endpoints 全部到位
- [x] `useM4State.js` 14 composable 全部到位
- [x] `useNotificationsBus.js` 总线接口齐全（poll / markRead / markAllRead / pushLocal / unreadCount）
- [x] `NotificationBell.vue` 挂在 `DefaultLayout.vue:174`
- [x] 14 / 16 页面真接口接入
- [ ] BrandDefense.vue / Notifications.vue 接入（partial，下一轮）
- [x] surgical kill 5173-5180（未误伤 8080）
- [x] 哨兵 STARTED / HEARTBEAT 已写
