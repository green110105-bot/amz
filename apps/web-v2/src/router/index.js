import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/workbench' },

  { path: '/workbench', name: 'Workbench', component: () => import('../pages/Workbench.vue'), meta: { title: '工作台', icon: 'Monitor', group: 'main' } },

  // M1 商品 - 主流程（重构为 3-Flow 工作流）
  { path: '/listings', redirect: '/listings/select' },
  { path: '/listings/select', name: 'ListingSelect', component: () => import('../pages/ListingSelect.vue'), meta: { title: '优化目标选择', group: 'm1-main', icon: 'Select' } },
  { path: '/listings/optimize/:id?', name: 'ListingOptimize', component: () => import('../pages/ListingOptimize.vue'), meta: { title: '优化室 ⭐', group: 'm1-main', icon: 'MagicStick' } },
  { path: '/listings/ab', name: 'ListingAbCenter', component: () => import('../pages/ListingAbCenter.vue'), meta: { title: 'A/B 测试中心', group: 'm1-main', icon: 'TrendCharts' } },
  // 老路由 → 重定向到新路由（兼容外部链接）
  { path: '/listings/experiments', redirect: '/listings/ab' },
  // M1 - 素材规则中心：只保留一个导航入口，旧资源页作为深链工具由中心页进入
  { path: '/listings/resources', name: 'M1ResourceHub', component: () => import('../pages/M1ResourceHub.vue'), meta: { title: '素材规则中心', group: 'm1-main', icon: 'Collection' } },
  { path: '/listings/keywords-library', name: 'KeywordLibrary', component: () => import('../pages/KeywordLibrary.vue'), meta: { title: '关键词护栏', icon: 'Collection' } },
  { path: '/listings/templates', name: 'CategoryTemplates', component: () => import('../pages/CategoryTemplates.vue'), meta: { title: '类目发布规则', icon: 'Files' } },
  { path: '/listings/category-pains', name: 'CategoryPains', component: () => import('../pages/CategoryPains.vue'), meta: { title: 'VOC 痛点库', icon: 'WarningFilled' } },
  { path: '/listings/calibration', name: 'ScoringCalibration', component: () => import('../pages/ScoringCalibration.vue'), meta: { title: '评分规则校准', icon: 'Operation' } },
  { path: '/listings/keyword-heatmap', redirect: { path: '/listings/resources', query: { retired: 'keyword-heatmap' } } },
  { path: '/listings/multi-locale', redirect: { path: '/listings/resources', query: { retired: 'multi-locale' } } },

  // M2 收口主入口：旧 19 个页面保留深链，但不再作为主导航平铺
  { path: '/m2', redirect: '/m2/workbench' },
  { path: '/m2/workbench', name: 'M2ControlTower', component: () => import('../pages/M2ControlTower.vue'), meta: { title: '经营利润工作台', group: 'm2-main', icon: 'Wallet' } },
  // M2 利润
  { path: '/profit/overview', name: 'ProfitOverview', component: () => import('../pages/ProfitOverview.vue'), meta: { title: '利润总览', group: 'm2-profit', icon: 'Wallet' } },
  { path: '/profit/skus', name: 'ProfitSkus', component: () => import('../pages/ProfitSkus.vue'), meta: { title: '单 SKU 利润', group: 'm2-profit', icon: 'Coin' } },
  { path: '/profit/orders/sample', name: 'OrderProfit', component: () => import('../pages/OrderProfit.vue'), meta: { title: '单订单瀑布', group: 'm2-profit', icon: 'TakeawayBox' } },
  { path: '/profit/leaks', name: 'ProfitLeaks', component: () => import('../pages/ProfitLeaks.vue'), meta: { title: '漏点中心', group: 'm2-profit', icon: 'Warning' } },
  { path: '/profit/cashflow', name: 'ProfitCashflow', component: () => import('../pages/ProfitCashflow.vue'), meta: { title: '现金流', group: 'm2-profit', icon: 'Refresh' } },
  { path: '/profit/scenario', name: 'ScenarioSimulator', component: () => import('../pages/ScenarioSimulator.vue'), meta: { title: '情景模拟器', group: 'm2-profit', icon: 'Operation' } },
  // M2 决策
  { path: '/inventory/reorder', name: 'InventoryReorder', component: () => import('../pages/InventoryReorder.vue'), meta: { title: '补货建议', group: 'm2-decisions', icon: 'Box' } },
  { path: '/inventory/slow-moving', name: 'SlowMovingDecision', component: () => import('../pages/SlowMovingDecision.vue'), meta: { title: '滞销决策', group: 'm2-decisions', icon: 'CircleClose' } },
  { path: '/repricing', name: 'RepricingDecision', component: () => import('../pages/RepricingDecision.vue'), meta: { title: '跟价决策', group: 'm2-decisions', icon: 'PriceTag' } },
  { path: '/inventory/po', name: 'PurchaseOrders', component: () => import('../pages/PurchaseOrders.vue'), meta: { title: '采购单', group: 'm2-decisions', icon: 'Document' } },
  { path: '/inventory/suppliers', name: 'Suppliers', component: () => import('../pages/Suppliers.vue'), meta: { title: '供应商', group: 'm2-decisions', icon: 'Connection' } },
  { path: '/inventory/transfers', name: 'InventoryTransfers', component: () => import('../pages/InventoryTransfers.vue'), meta: { title: '跨仓调拨', group: 'm2-decisions', icon: 'Switch' } },
  // M2 大卖
  { path: '/profit/multi-store', name: 'MultiStore', component: () => import('../pages/MultiStore.vue'), meta: { title: '多店铺合并', group: 'm2-enterprise', icon: 'OfficeBuilding' } },
  { path: '/profit/dimensions', name: 'Dimensions', component: () => import('../pages/Dimensions.vue'), meta: { title: '多维度归集', group: 'm2-enterprise', icon: 'Grid' } },
  { path: '/profit/fx', name: 'FxRisk', component: () => import('../pages/FxRisk.vue'), meta: { title: '汇率管理', group: 'm2-enterprise', icon: 'TrendCharts' } },
  { path: '/costs/payment-channels', name: 'PaymentChannels', component: () => import('../pages/PaymentChannels.vue'), meta: { title: '跨境支付通道', group: 'm2-enterprise', icon: 'CreditCard' } },
  { path: '/tax', name: 'TaxAssist', component: () => import('../pages/TaxAssist.vue'), meta: { title: 'VAT / 销售税', group: 'm2-enterprise', icon: 'Document' } },
  { path: '/profit/ltv', name: 'LTV', component: () => import('../pages/LTV.vue'), meta: { title: 'LTV 复购视角', group: 'm2-enterprise', icon: 'User' } },
  { path: '/alerts/custom', name: 'CustomAlerts', component: () => import('../pages/CustomAlerts.vue'), meta: { title: '自定义报警', group: 'm2-enterprise', icon: 'Bell' } },

  // ===== M3 广告 (重构后) =====
  // ---- 主入口 (sidebar 显示) ----
  { path: '/ads', name: 'AdsHub', component: () => import('../pages/AdsHub.vue'), meta: { title: '总览', group: 'm3-main', icon: 'House' } },
  { path: '/ads/timeline', name: 'AdsTimeline', component: () => import('../pages/AdsTimeline.vue'), meta: { title: 'AI 时间线 ⭐', group: 'm3-main', icon: 'Clock' } },
  { path: '/ads/strategies', name: 'StrategyLibrary', component: () => import('../pages/StrategyLibrary.vue'), meta: { title: '策略库 ⭐', group: 'm3-main', icon: 'MagicStick' } },

  // 领星等价 wrapper（含 11 子页）— 主入口由 portfolios 露出
  {
    path: '/ads/lx',
    component: () => import('../layouts/LxAdsLayout.vue'),
    meta: { title: '广告组合 (领星等价)', icon: 'OfficeBuilding' },
    children: [
      { path: '', redirect: '/ads/lx/portfolios' },
      { path: 'portfolios', name: 'LxPortfolios', component: () => import('../pages/lx/LxPortfolios.vue'), meta: { title: '广告组合 (领星核心) ⭐', group: 'm3-main', icon: 'OfficeBuilding' } },
      { path: 'portfolios/:id', name: 'LxPortfolioDetail', component: () => import('../pages/lx/LxPortfolioDetail.vue'), meta: { title: '广告组合详情' } },
      { path: 'campaigns/:id', name: 'LxCampaignDetail', component: () => import('../pages/lx/LxCampaignDetail.vue'), meta: { title: '广告活动详情' } },
      { path: 'all-campaigns', name: 'LxAllCampaigns', component: () => import('../pages/lx/LxAllCampaigns.vue'), meta: { title: '全部活动' } },
      { path: 'sp', name: 'LxSP', component: () => import('../pages/lx/LxAllCampaigns.vue'), meta: { title: 'SP广告' } },
      { path: 'sb', name: 'LxSB', component: () => import('../pages/lx/LxAllCampaigns.vue'), meta: { title: 'SB广告' } },
      { path: 'sd', name: 'LxSD', component: () => import('../pages/lx/LxAllCampaigns.vue'), meta: { title: 'SD广告' } },
      { path: 'st', name: 'LxST', component: () => import('../pages/lx/LxAllCampaigns.vue'), meta: { title: 'ST广告' } },
      { path: 'purchased', name: 'LxPurchased', component: () => import('../pages/lx/LxStubPage.vue'), meta: { title: '已购商品' } },
      { path: 'op-log', name: 'LxOpLog', component: () => import('../pages/lx/LxStubPage.vue'), meta: { title: '操作日志' } },
      { path: 'download', name: 'LxDownload', component: () => import('../pages/lx/LxStubPage.vue'), meta: { title: '下载中心' } },
    ],
  },

  // ---- 报表中心 (单一入口在主入口组内) ----
  { path: '/ads/reports', name: 'ReportsCenter', component: () => import('../pages/ReportsCenter.vue'), meta: { title: '报表中心', group: 'm3-main', icon: 'DataAnalysis' } },
  // 单独报表路由保留 (深度链接 + 旧 URL 兼容)，但不在 sidebar
  { path: '/ads/reports/search-terms', name: 'SearchTermReport', component: () => import('../pages/SearchTermReport.vue'), meta: { title: '搜索词报告' } },
  { path: '/ads/reports/campaigns', name: 'CampaignReport', component: () => import('../pages/CampaignReport.vue'), meta: { title: '广告活动报表' } },
  { path: '/ads/reports/sqp', name: 'SqpReport', component: () => import('../pages/SqpReport.vue'), meta: { title: 'SQP 份额' } },

  // ---- 不进 sidebar 但保留路由 (深度页 / 旧页归档) ----
  { path: '/ads/playbook', name: 'Playbook', component: () => import('../pages/Playbook.vue'), meta: { title: '策略库 (旧版 42 条)' } },
  // W16: 孤儿页「操作清单(旧)」并入 Workbench 单一 Inbox（待 W1/W10 DB 分支补齐后删页）。
  { path: '/ads/actions', redirect: '/workbench?filter=ad_suggestion' },
  { path: '/ads/campaigns', name: 'Campaigns', component: () => import('../pages/Campaigns.vue'), meta: { title: 'Campaign 架构（深度）' } },
  { path: '/ads/keywords', name: 'Keywords', component: () => import('../pages/Keywords.vue'), meta: { title: '关键词与搜索词（深度）' } },
  { path: '/ads/lifecycle', name: 'Lifecycle', component: () => import('../pages/Lifecycle.vue'), meta: { title: '周期管理（深度）' } },
  { path: '/ads/promote-to-manual', name: 'PromoteToManual', component: () => import('../pages/PromoteToManual.vue'), meta: { title: '自动 → 手动向导' } },
  { path: '/ads/structure-health', name: 'StructureHealth', component: () => import('../pages/StructureHealth.vue'), meta: { title: '结构健康分' } },
  { path: '/ads/budget-allocator', name: 'BudgetAllocator', component: () => import('../pages/BudgetAllocator.vue'), meta: { title: '预算分配优化' } },
  { path: '/ads/budget-forecast', name: 'BudgetForecast', component: () => import('../pages/BudgetForecast.vue'), meta: { title: '预算耗尽预测' } },
  { path: '/ads/dayparting', name: 'Dayparting', component: () => import('../pages/Dayparting.vue'), meta: { title: '分时段策略' } },
  { path: '/ads/placements', name: 'Placements', component: () => import('../pages/Placements.vue'), meta: { title: '位置加成' } },
  { path: '/ads/inventory-link', name: 'InventoryLink', component: () => import('../pages/InventoryLink.vue'), meta: { title: '库存联动' } },
  { path: '/ads/promo-sync', name: 'PromoSync', component: () => import('../pages/PromoSync.vue'), meta: { title: '促销联动' } },
  { path: '/ads/brand-defense', name: 'BrandDefense', component: () => import('../pages/BrandDefense.vue'), meta: { title: '品牌词防御' } },
  { path: '/ads/competitor-attack', name: 'CompetitorAttack', component: () => import('../pages/CompetitorAttack.vue'), meta: { title: '竞品 ASIN 攻击' } },
  { path: '/ads/creatives', name: 'Creatives', component: () => import('../pages/Creatives.vue'), meta: { title: '创意 A/B' } },

  // M4 收口主入口：旧风险/Review/竞品页面保留深链，但不再作为主导航平铺
  { path: '/m4', redirect: '/m4/workbench' },
  { path: '/m4/daily-report', redirect: '/m4/reports/daily' },
  { path: '/m4/reports/daily', name: 'M4DailyReport', component: () => import('../pages/M4DailyReport.vue'), meta: { title: '每日监控日报', group: 'm4-main', icon: 'DataAnalysis' } },
  { path: '/m4/reports/tiktok', name: 'M4TikTokReport', component: () => import('../pages/M4TikTokReport.vue'), meta: { title: 'TikTok 日报', group: 'm4-main', icon: 'VideoCamera' } },
  { path: '/m4/workbench', name: 'M4OpsWorkbench', component: () => import('../pages/M4OpsWorkbench.vue'), meta: { title: '运营风险工作台', group: 'm4-main', icon: 'WarningFilled' } },
  // M4 监控
  { path: '/monitor/anomalies', name: 'MonitorAnomalies', component: () => import('../pages/MonitorAnomalies.vue'), meta: { title: '异常列表', group: 'm4-monitor', icon: 'WarningFilled' } },
  { path: '/monitor/sla', name: 'SLABoard', component: () => import('../pages/SLABoard.vue'), meta: { title: 'SLA 看板', group: 'm4-monitor', icon: 'Stopwatch' } },
  { path: '/monitor/cases', name: 'ResolutionCases', component: () => import('../pages/ResolutionCases.vue'), meta: { title: '处置案例库', group: 'm4-monitor', icon: 'Reading' } },
  { path: '/monitor/postmortems', name: 'Postmortems', component: () => import('../pages/Postmortems.vue'), meta: { title: '复盘报告', group: 'm4-monitor', icon: 'Document' } },
  { path: '/monitor/hijacking', name: 'Hijacking', component: () => import('../pages/Hijacking.vue'), meta: { title: '跟卖处置', group: 'm4-monitor', icon: 'Hide' } },
  { path: '/monitor/infringement', name: 'Infringement', component: () => import('../pages/Infringement.vue'), meta: { title: '侵权告警', group: 'm4-monitor', icon: 'Lock' } },
  // M4 Review
  { path: '/reviews', name: 'ReviewList', component: () => import('../pages/ReviewList.vue'), meta: { title: 'Review 列表', group: 'm4-review', icon: 'StarFilled' } },
  { path: '/reviews/clusters', name: 'ReviewClusters', component: () => import('../pages/ReviewClusters.vue'), meta: { title: '差评聚类', group: 'm4-review', icon: 'Histogram' } },
  { path: '/reviews/trends', name: 'ReviewTrends', component: () => import('../pages/ReviewTrends.vue'), meta: { title: '评分趋势', group: 'm4-review', icon: 'TrendCharts' } },
  { path: '/reviews/appeals', name: 'Appeals', component: () => import('../pages/Appeals.vue'), meta: { title: '申诉中心', group: 'm4-review', icon: 'DocumentChecked' } },
  { path: '/reviews/recovery', name: 'RecoveryEmails', component: () => import('../pages/RecoveryEmails.vue'), meta: { title: '挽回邮件', group: 'm4-review', icon: 'Message' } },
  // M4 竞品
  { path: '/competitors', name: 'Competitors', component: () => import('../pages/Competitors.vue'), meta: { title: '竞品作战室', group: 'm4-competitors', icon: 'View' } },
  { path: '/competitors/image-diff', name: 'ImageDiff', component: () => import('../pages/ImageDiff.vue'), meta: { title: '竞品图像变化', group: 'm4-competitors', icon: 'Picture' } },

  // 通知
  { path: '/notifications', name: 'Notifications', component: () => import('../pages/Notifications.vue'), meta: { title: '通知中心', group: 'main', icon: 'BellFilled' } },
  { path: '/settings/amazon-auth', name: 'AmazonAuthCenter', component: () => import('../pages/AmazonAuthCenter.vue'), meta: { title: 'Amazon 授权接入', group: 'main', icon: 'Connection' } },

  // 其它
  { path: '/audit', name: 'Audit', component: () => import('../pages/Audit.vue'), meta: { title: '审计中心', group: 'main', icon: 'Lock' } },
  { path: '/settings', name: 'Settings', component: () => import('../pages/Settings.vue'), meta: { title: '设置', group: 'main', icon: 'Setting' } },

  // 登录（不进入侧边栏导航）
  { path: '/login', name: 'Login', component: () => import('../pages/Login.vue'), meta: { title: '登录', public: true } },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 路由守卫：未登录（无 token）跳转 /login
router.beforeEach((to, from, next) => {
  if (to.meta?.public) return next();
  try {
    const token = localStorage.getItem('amz_auth_token');
    if (!token) return next({ path: '/login', query: { redirect: to.fullPath } });
  } catch {}
  next();
});

router.afterEach((to) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} · amz`;
  }
});

export default router;
