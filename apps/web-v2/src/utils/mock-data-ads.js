// 广告专用 mock 数据：架构树 / 关键词 / 否词 / 创意 / 分时段 / 品牌防御 / 竞品攻击 等

export const mockAdTree = [
  {
    id: 'cmp-launch-sp',
    name: 'SP Launch Discovery',
    type: 'SP',
    targetingType: 'auto',
    state: 'enabled',
    dailyBudget: 50,
    sku: 'CASE-001',
    stage: 'launch',
    healthScore: 38,
    spend7d: 692,
    sales7d: 0,
    issues: ['零订单浪费', '否词机会'],
    adGroups: [
      {
        id: 'ag-launch-discovery',
        name: '探索（自动定位）',
        defaultBid: 0.85,
        autoTargets: [
          { id: 'auto-loose', type: 'loose-match', name: '宽泛匹配', bid: 0.75, status: 'enabled', impressions7d: 8400, clicks7d: 142, sales7d: 0, acos7d: null },
          { id: 'auto-close', type: 'close-match', name: '紧密匹配', bid: 0.95, status: 'enabled', impressions7d: 4200, clicks7d: 96, sales7d: 0, acos7d: null },
          { id: 'auto-substitutes', type: 'substitutes', name: '同类商品', bid: 0.85, status: 'enabled', impressions7d: 1200, clicks7d: 18, sales7d: 0, acos7d: null },
          { id: 'auto-complements', type: 'complements', name: '关联商品', bid: 0.85, status: 'paused', impressions7d: 0, clicks7d: 0, sales7d: 0, acos7d: null },
        ],
        keywords: [],
        productTargets: [],
        negatives: [
          { term: 'free', matchType: 'phrase' },
          { term: 'cheap', matchType: 'exact' },
          { term: 'wholesale', matchType: 'phrase' },
        ],
      },
    ],
  },
  {
    id: 'cmp-growth-sp',
    name: 'SP Growth Exact',
    type: 'SP',
    targetingType: 'manual',
    state: 'enabled',
    dailyBudget: 250,
    sku: 'CABLE-002',
    stage: 'growth',
    healthScore: 82,
    spend7d: 1716,
    sales7d: 8649,
    issues: ['预算上限', '归因滞后'],
    adGroups: [
      {
        id: 'ag-growth-longtail',
        name: '长尾收割（精准）',
        defaultBid: 1.20,
        autoTargets: [],
        keywords: [
          { id: 'kw-1', term: 'usb c cable 100w', matchType: 'exact', bid: 1.45, impressions7d: 5800, clicks7d: 184, sales7d: 3640, acos7d: 0.18, orders7d: 156 },
          { id: 'kw-2', term: 'fast charge cable', matchType: 'phrase', bid: 1.10, impressions7d: 4200, clicks7d: 132, sales7d: 2456, acos7d: 0.21, orders7d: 92 },
          { id: 'kw-3', term: 'usb c data cable', matchType: 'exact', bid: 1.30, impressions7d: 3100, clicks7d: 88, sales7d: 1853, acos7d: 0.19, orders7d: 64 },
          { id: 'kw-4', term: 'macbook charger cable', matchType: 'phrase', bid: 0.95, impressions7d: 2400, clicks7d: 64, sales7d: 700, acos7d: 0.34, orders7d: 28 },
        ],
        productTargets: [
          { id: 'pt-1', asin: 'B0COMP1', name: '竞品 ASIN A', bid: 1.05, impressions7d: 800, clicks7d: 21, sales7d: 412 },
        ],
        negatives: [
          { term: 'phone cable', matchType: 'exact' },
          { term: 'free gift', matchType: 'phrase' },
        ],
      },
    ],
  },
  {
    id: 'cmp-mature-brand',
    name: 'SP Acme Brand Core',
    type: 'SP',
    targetingType: 'manual',
    state: 'enabled',
    dailyBudget: 150,
    sku: 'CASE-001',
    stage: 'mature',
    healthScore: 71,
    spend7d: 1053,
    sales7d: 4368,
    issues: ['品牌防御暴露', '位置浪费'],
    adGroups: [
      {
        id: 'ag-mature-brand',
        name: '品牌词防御',
        defaultBid: 1.50,
        autoTargets: [],
        keywords: [
          { id: 'kw-b1', term: 'acme phone case', matchType: 'exact', bid: 1.60, impressions7d: 3200, clicks7d: 124, sales7d: 2480, acos7d: 0.10, orders7d: 96 },
          { id: 'kw-b2', term: 'acme case', matchType: 'phrase', bid: 1.40, impressions7d: 1800, clicks7d: 78, sales7d: 1102, acos7d: 0.18, orders7d: 42 },
        ],
        productTargets: [],
        negatives: [],
      },
    ],
  },
  {
    id: 'cmp-decline-auto',
    name: 'SP Decline Auto Harvest',
    type: 'SP',
    targetingType: 'auto',
    state: 'enabled',
    dailyBudget: 100,
    sku: 'LAMP-003',
    stage: 'decline',
    healthScore: 22,
    spend7d: 991,
    sales7d: 440,
    issues: ['ACOS 异常 225%', '突降异常', '护栏阻断'],
    adGroups: [
      {
        id: 'ag-decline',
        name: '衰退期（建议暂停）',
        defaultBid: 0.45,
        autoTargets: [
          { id: 'auto-decline-loose', type: 'loose-match', name: '宽泛匹配', bid: 0.45, status: 'enabled', impressions7d: 1200, clicks7d: 36, sales7d: 240, acos7d: 1.85 },
        ],
        keywords: [],
        productTargets: [],
        negatives: [],
      },
    ],
  },
  {
    id: 'cmp-attack-sd',
    name: 'SD Competitor Attack',
    type: 'SD',
    targetingType: 'product',
    state: 'enabled',
    dailyBudget: 80,
    sku: 'GAMEPAD-G8',
    stage: 'mature',
    healthScore: 65,
    spend7d: 747,
    sales7d: 2660,
    issues: ['断货约束', '突增异常'],
    adGroups: [
      {
        id: 'ag-attack',
        name: '竞品攻击（SD-PT）',
        defaultBid: 1.10,
        autoTargets: [],
        keywords: [],
        productTargets: [
          { id: 'pt-c1', asin: 'B0RIVAL1', name: '主竞品 RIVAL Pro', bid: 1.20, impressions7d: 2400, clicks7d: 68, sales7d: 1648 },
          { id: 'pt-c2', asin: 'B0RIVAL2', name: '主竞品 XYZ Premium', bid: 1.05, impressions7d: 1100, clicks7d: 28, sales7d: 712 },
        ],
        negatives: [],
      },
    ],
  },
];

// 自动→手动转化候选（高转化但还在自动 Campaign 跑的搜索词）
export const mockPromotionCandidates = [
  { term: 'phone case red iphone 14', sourceCampaign: 'cmp-launch-sp', orders30d: 28, sales30d: 642, clicks30d: 380, cvr: 0.0737, currentMatch: 'auto', recommendBid: 0.95, recommendMatch: 'exact', confidence: 0.88 },
  { term: 'protective phone case', sourceCampaign: 'cmp-launch-sp', orders30d: 22, sales30d: 502, clicks30d: 320, cvr: 0.0688, currentMatch: 'auto', recommendBid: 0.85, recommendMatch: 'phrase', confidence: 0.82 },
  { term: 'iphone 14 wireless charging case', sourceCampaign: 'cmp-launch-sp', orders30d: 18, sales30d: 411, clicks30d: 240, cvr: 0.0750, currentMatch: 'auto', recommendBid: 1.05, recommendMatch: 'exact', confidence: 0.91 },
  { term: 'shock proof iphone case', sourceCampaign: 'cmp-launch-sp', orders30d: 14, sales30d: 320, clicks30d: 196, cvr: 0.0714, currentMatch: 'auto', recommendBid: 0.90, recommendMatch: 'exact', confidence: 0.85 },
  { term: 'usb c cable 6ft', sourceCampaign: 'cmp-growth-sp', orders30d: 11, sales30d: 280, clicks30d: 148, cvr: 0.0743, currentMatch: 'auto', recommendBid: 0.95, recommendMatch: 'phrase', confidence: 0.79 },
];

// 阶段切换事件（Workbench / Lifecycle 顶部展示）
export const mockStageTransitions = [
  {
    id: 'tr-001',
    sku: 'CASE-001',
    asin: 'B0CASE001',
    fromStage: 'launch',
    toStage: 'growth',
    detectedAt: '2026-05-08',
    daysSince: 2,
    confidence: 0.85,
    signals: ['销量 4 周连续上升 (+45%)', '评论数 32 → 78', 'CVR 12% (类目均 9%)'],
    suggestedStrategies: [
      { id: 'GROWTH-1', label: '自动 → 手动', recommended: true, action: 'promote_to_manual' },
      { id: 'GROWTH-2', label: '长尾词扩展', recommended: true, action: 'expand_longtail' },
      { id: 'GROWTH-3', label: '加预算 +30%', recommended: true, action: 'increase_budget' },
    ],
  },
  {
    id: 'tr-002',
    sku: 'CABLE-002',
    asin: 'B0CABLE02',
    fromStage: 'growth',
    toStage: 'mature',
    detectedAt: '2026-05-06',
    daysSince: 4,
    confidence: 0.78,
    signals: ['销量 4 周方差 < 15%', '评论数 1500 (≥ 100)', 'BSR 稳定'],
    suggestedStrategies: [
      { id: 'MATURE-1', label: '否词清理', recommended: true, action: 'cleanup_negatives' },
      { id: 'MATURE-3', label: '分时段出价', recommended: true, action: 'enable_dayparting' },
      { id: 'MATURE-5', label: '品牌词防御 +15-30%', recommended: true, action: 'brand_defense' },
    ],
  },
  {
    id: 'tr-003',
    sku: 'LAMP-003',
    asin: 'B0LAMP003',
    fromStage: 'mature',
    toStage: 'decline',
    detectedAt: '2026-05-09',
    daysSince: 1,
    confidence: 0.92,
    signals: ['销量 4 周连续下降', '库存周转 217 天 > 90', 'BSR 大幅下滑'],
    suggestedStrategies: [
      { id: 'DECLINE-1', label: '预算 -50%', recommended: true, action: 'reduce_budget' },
      { id: 'DECLINE-3', label: '启动 Coupon / LD', recommended: true, action: 'start_promo' },
      { id: 'DECLINE-7', label: '触发 M2 滞销决策', recommended: true, action: 'trigger_m2_decision' },
    ],
  },
];

// 8 子项健康分（投放结构健康审计）
export const mockStructureHealth = {
  totalScore: 67,
  grade: 'medium',
  subScores: [
    { id: 'D1', label: 'Campaign 数量比例', weight: 15, score: 13, currentValue: 'SP:SB:SD = 7:2:1', standard: '推荐 6:2:2 或 7:2:1', issues: [], improvements: [] },
    { id: 'D2', label: 'AdGroup 粒度', weight: 15, score: 8, currentValue: '部分 Campaign 仅 1 个 AdGroup', standard: '每 Campaign ≥ 2 个 AdGroup（按主题/匹配方式拆分）', issues: ['SP Launch Discovery 仅 1 个 AdGroup'], improvements: [{ action: '拆分 SP Launch Discovery 为"自动探索"+"长尾收割"两个 AdGroup', expectedLift: 7, oneClick: true }] },
    { id: 'D3', label: '关键词分组质量', weight: 20, score: 12, currentValue: 'AdGroup 关键词主题相关性偏低', standard: '同 AdGroup 内关键词 embedding 相似度 ≥ 0.75', issues: ['SP Growth Exact 长尾收割 AdGroup 中混入品牌词'], improvements: [{ action: '把 acme 系关键词移到 SP Acme Brand Core', expectedLift: 8, oneClick: true }] },
    { id: 'D4', label: '匹配方式分布', weight: 10, score: 8, currentValue: 'auto:phrase:exact = 30%:30%:40%', standard: '推荐 20%:30%:50%（精准为主）', issues: [], improvements: [] },
    { id: 'D5', label: '否词覆盖', weight: 10, score: 5, currentValue: '15 个高曝光 0 转化词未否定', standard: '30 天 0 转化词应否定', issues: ['"free phone case"', '"cheap iphone case"', '...'], improvements: [{ action: '批量否定 15 个无效词', expectedLift: 5, oneClick: true }] },
    { id: 'D6', label: '预算分布', weight: 10, score: 8, currentValue: '高 ROAS Campaign 预算占比 65%', standard: '高 ROAS Campaign 预算占比 ≥ 70%', issues: [], improvements: [] },
    { id: 'D7', label: '关键词数量', weight: 10, score: 9, currentValue: '单 AdGroup 关键词数 5-30', standard: '5-50 范围最佳', issues: [], improvements: [] },
    { id: 'D8', label: '品牌防御完整度', weight: 10, score: 4, currentValue: '无品牌词专属 Campaign', standard: '已备案品牌应有专属 Brand Defense Campaign', issues: ['未启动品牌词防御'], improvements: [{ action: '创建品牌词专属 Campaign（自动配置）', expectedLift: 10, oneClick: true }] },
  ],
};

// 预算分配优化器（每个 Campaign 边际收益 vs 当前预算）
export const mockBudgetAllocation = {
  monthBudget: 30000,
  used: 18500,
  daysLeft: 11.5,
  campaigns: [
    { id: 'cmp-mature-brand', name: 'SP Acme Brand Core', currentBudget: 150, recommendedBudget: 270, marginalRoi: 4.2, deltaProfit: 1800 },
    { id: 'cmp-growth-sp', name: 'SP Growth Exact', currentBudget: 250, recommendedBudget: 320, marginalRoi: 2.8, deltaProfit: 1200 },
    { id: 'cmp-launch-sp', name: 'SP Launch Discovery', currentBudget: 50, recommendedBudget: 30, marginalRoi: 0.8, deltaProfit: -100 },
    { id: 'cmp-decline-auto', name: 'SP Decline Auto Harvest', currentBudget: 100, recommendedBudget: 40, marginalRoi: 0.4, deltaProfit: 500 },
    { id: 'cmp-attack-sd', name: 'SD Competitor Attack', currentBudget: 80, recommendedBudget: 120, marginalRoi: 2.2, deltaProfit: 800 },
  ],
  expectedMonthlyProfit: 4200,
};

// 预算耗尽预测（日内 + 月度）
export const mockBudgetForecast = {
  intraDayCampaigns: [
    { id: 'cmp-growth-sp', name: 'SP Growth Exact', dailyBudget: 250, spentSoFar: 184, currentTime: '14:00', estDepleteAt: '17:30', recommendation: '提升今日预算至 $310，覆盖晚高峰' },
    { id: 'cmp-mature-brand', name: 'SP Acme Brand Core', dailyBudget: 150, spentSoFar: 72, currentTime: '14:00', estDepleteAt: '23:55', recommendation: '正常' },
    { id: 'cmp-decline-auto', name: 'SP Decline Auto Harvest', dailyBudget: 100, spentSoFar: 28, currentTime: '14:00', estDepleteAt: 'never', recommendation: '消耗缓慢（与 ACOS 异常一致），建议暂停' },
  ],
  monthly: { used: 18500, total: 30000, daysLeft: 11.5, paceProjection: '5 月 23 日耗尽（提前 7 天）', recommendation: '降低 SP Decline 预算 60%，保持月底覆盖' },
};

// 库存联动（4 档保护）
export const mockInventoryLink = {
  enabled: true,
  thresholds: { stopAt: 3, reduceBidAt: 7, alertAt: 14 },
  affectedCampaigns: [
    { sku: 'CASE-001', asin: 'B0CASE001', daysLeft: 4, action: 'bid_reduce_50', impactCampaigns: ['cmp-launch-sp', 'cmp-mature-brand'], status: 'auto_executed' },
    { sku: 'GAMEPAD-G8', asin: 'B0CM3C9HRG', daysLeft: 12, action: 'bid_reduce_20', impactCampaigns: ['cmp-attack-sd'], status: 'auto_executed' },
    { sku: 'HIFI-005', asin: 'B0BM4274QM', daysLeft: 19, action: 'alert_only', impactCampaigns: [], status: 'monitoring' },
  ],
};

// 品牌词防御（4 层级）
export const mockBrandDefense = {
  brandRegistered: true,
  layers: [
    { id: 'L1', label: '品牌词专属 Campaign（手动 + 精准）', status: 'enabled', detail: 'SP Acme Brand Core · 出价 $1.50 · 7d Spend $1053', config: { campaignId: 'cmp-mature-brand', bidPremium: 1.5 } },
    { id: 'L2', label: '品牌+品类长尾保护', status: 'partial', detail: '已覆盖 5 个长尾，建议扩展 3 个' },
    { id: 'L3', label: 'SD Product Targeting 自防御', status: 'disabled', detail: '建议为自家关联 ASIN 启动 SD 防御（一键创建）' },
    { id: 'L4', label: '竞品反攻击监测', status: 'monitoring', detail: '检测到 2 个竞品在你品牌词出价（B0RIVAL1 / B0RIVAL2），建议提升出价 +15%' },
  ],
  brandKeywords: [
    { term: 'acme phone case', impressions7d: 3200, ourBid: 1.60, ourPosition: 1, competitorBid: 1.30 },
    { term: 'acme case', impressions7d: 1800, ourBid: 1.40, ourPosition: 1, competitorBid: 1.10 },
    { term: 'acme charger', impressions7d: 480, ourBid: 0.85, ourPosition: 3, competitorBid: 1.20 },
  ],
};

// 42 条策略库
export const mockPlaybook = [
  // LAUNCH 10 条
  { id: 'LAUNCH-1', stage: 'launch', name: '启用自动广告（4 类型全开）', priority: 'high', applied: true },
  { id: 'LAUNCH-2', stage: 'launch', name: '日预算 ≥ 类目均值 × 1.5', priority: 'high', applied: true },
  { id: 'LAUNCH-3', stage: 'launch', name: 'Top 10 高曝光关键词单独广告组', priority: 'high', applied: false },
  { id: 'LAUNCH-4', stage: 'launch', name: 'Vine 评论计划', priority: 'high', applied: false },
  { id: 'LAUNCH-5', stage: 'launch', name: 'Coupon 5% off 提升 CVR', priority: 'medium', applied: true },
  { id: 'LAUNCH-6', stage: 'launch', name: '否词谨慎', priority: 'medium', applied: true },
  { id: 'LAUNCH-7', stage: 'launch', name: 'CVR 预警（< 类目均 50% 触发 M1）', priority: 'medium', applied: true },
  { id: 'LAUNCH-8', stage: 'launch', name: 'SB 品牌广告（如已备案）', priority: 'medium', applied: false },
  { id: 'LAUNCH-9', stage: 'launch', name: 'SD 商品定位防御', priority: 'low', applied: false },
  { id: 'LAUNCH-10', stage: 'launch', name: '头 30 天不动核心结构', priority: 'low', applied: true },
  // GROWTH 12 条
  { id: 'GROWTH-1', stage: 'growth', name: '自动转手动（搜索词收割）', priority: 'high', applied: false },
  { id: 'GROWTH-2', stage: 'growth', name: '长尾词扩展', priority: 'high', applied: false },
  { id: 'GROWTH-3', stage: 'growth', name: '低 ACOS 词自动加预算 +30%', priority: 'high', applied: true },
  { id: 'GROWTH-4', stage: 'growth', name: 'SP 商品定位攻击竞品', priority: 'medium', applied: false },
  { id: 'GROWTH-5', stage: 'growth', name: 'SB 品牌广告', priority: 'high', applied: false },
  { id: 'GROWTH-6', stage: 'growth', name: 'SBV 视频广告', priority: 'medium', applied: false },
  { id: 'GROWTH-7', stage: 'growth', name: '关键词排名监控', priority: 'medium', applied: true },
  { id: 'GROWTH-8', stage: 'growth', name: '否词初步整理', priority: 'medium', applied: false },
  { id: 'GROWTH-9', stage: 'growth', name: '出价精细化（位置/时段）', priority: 'medium', applied: false },
  { id: 'GROWTH-10', stage: 'growth', name: 'Coupon 减量（保利润）', priority: 'low', applied: false },
  { id: 'GROWTH-11', stage: 'growth', name: 'Lightning Deal 申请', priority: 'medium', applied: false },
  { id: 'GROWTH-12', stage: 'growth', name: '自然流量审计', priority: 'medium', applied: true },
  // MATURE 12 条
  { id: 'MATURE-1', stage: 'mature', name: '否词清理（30 天 0 转化）', priority: 'high', applied: false },
  { id: 'MATURE-2', stage: 'mature', name: '利润 ROAS 红线 0.85', priority: 'high', applied: true },
  { id: 'MATURE-3', stage: 'mature', name: '分时段出价', priority: 'high', applied: false },
  { id: 'MATURE-4', stage: 'mature', name: '位置加成（首页/详情页）', priority: 'high', applied: false },
  { id: 'MATURE-5', stage: 'mature', name: '品牌词防御 +15-30%', priority: 'high', applied: true },
  { id: 'MATURE-6', stage: 'mature', name: '长尾词收割', priority: 'medium', applied: false },
  { id: 'MATURE-7', stage: 'mature', name: '竞品 ASIN 防御', priority: 'medium', applied: true },
  { id: 'MATURE-8', stage: 'mature', name: '预算优化（无效→高效）', priority: 'high', applied: false },
  { id: 'MATURE-9', stage: 'mature', name: 'A/B 出价测试', priority: 'low', applied: false },
  { id: 'MATURE-10', stage: 'mature', name: '季节性预算调节', priority: 'medium', applied: false },
  { id: 'MATURE-11', stage: 'mature', name: '复盘 + 月度报告', priority: 'medium', applied: false },
  { id: 'MATURE-12', stage: 'mature', name: '滞销前预警', priority: 'medium', applied: true },
  // DECLINE 8 条
  { id: 'DECLINE-1', stage: 'decline', name: '预算大幅收缩 -50%', priority: 'high', applied: false },
  { id: 'DECLINE-2', stage: 'decline', name: '保留 ACOS < 20% 核心词', priority: 'high', applied: false },
  { id: 'DECLINE-3', stage: 'decline', name: '启动促销（Coupon / LD）', priority: 'high', applied: false },
  { id: 'DECLINE-4', stage: 'decline', name: '促销期临时加预算', priority: 'medium', applied: false },
  { id: 'DECLINE-5', stage: 'decline', name: '大量否定无效投放', priority: 'high', applied: false },
  { id: 'DECLINE-6', stage: 'decline', name: '替代款研究', priority: 'medium', applied: false },
  { id: 'DECLINE-7', stage: 'decline', name: '触发 M2 滞销决策', priority: 'medium', applied: true },
  { id: 'DECLINE-8', stage: 'decline', name: '衰退原因学习沉淀', priority: 'low', applied: false },
];

// 分时段策略：7×24 出价加成（百分比，0=不变，+20=+20%）
export function defaultDaypartingMatrix() {
  const matrix = [];
  for (let day = 0; day < 7; day++) {
    const row = [];
    for (let hour = 0; hour < 24; hour++) {
      let mod = 0;
      if (hour >= 0 && hour < 6) mod = -30;
      else if (hour >= 6 && hour < 9) mod = -10;
      else if (hour >= 9 && hour < 12) mod = 5;
      else if (hour >= 12 && hour < 18) mod = 20;
      else if (hour >= 18 && hour < 22) mod = 15;
      else mod = 0;
      // 周末略加成
      if ((day === 0 || day === 6) && hour >= 9 && hour < 22) mod += 5;
      row.push(mod);
    }
    matrix.push(row);
  }
  return matrix;
}

// 位置加成
export const mockPlacements = [
  { campaign: 'SP Growth Exact', topOfSearchSpend: 920, topOfSearchSales: 5800, topOfSearchAcos: 0.16, productPagesSpend: 480, productPagesSales: 1840, productPagesAcos: 0.26, restSpend: 316, restSales: 1009, restAcos: 0.31, recommendation: 'topOfSearch +30% / productPages -10%' },
  { campaign: 'SP Acme Brand Core', topOfSearchSpend: 720, topOfSearchSales: 3680, topOfSearchAcos: 0.20, productPagesSpend: 220, productPagesSales: 488, productPagesAcos: 0.45, restSpend: 113, restSales: 200, restAcos: 0.57, recommendation: 'topOfSearch +25% / productPages 暂停' },
  { campaign: 'SP Decline Auto Harvest', topOfSearchSpend: 380, topOfSearchSales: 220, topOfSearchAcos: 1.73, productPagesSpend: 410, productPagesSales: 180, productPagesAcos: 2.28, restSpend: 201, restSales: 40, restAcos: 5.03, recommendation: '所有位置 -50% 或暂停 Campaign' },
];

// 创意 A/B（自建框架：双 AdGroup 平行 / 时段轮替）
export const mockCreatives = [
  {
    id: 'cv-001',
    campaignId: 'cmp-mature-brand',
    type: 'SB',
    mode: 'parallel_adgroups',
    status: 'running',
    startedAt: '2026-05-01',
    daysRunning: 8,
    daysTotal: 14,
    control: { headline: 'Premium Phone Cases for Active Lifestyle', clicks: 280, ctr: 0.018, cvr: 0.062, roas: 2.8 },
    treatment: { headline: 'Military-Grade Drop Protection - 3-Year Warranty', clicks: 320, ctr: 0.024, cvr: 0.081, roas: 4.2 },
    significance: 0.78,
    winner: null,
  },
  {
    id: 'cv-002',
    campaignId: 'cmp-growth-sp',
    type: 'SBV',
    mode: 'parallel_adgroups',
    status: 'completed',
    startedAt: '2026-04-10',
    daysRunning: 14,
    daysTotal: 14,
    control: { headline: '15s 产品介绍视频 v1', clicks: 480, ctr: 0.026, cvr: 0.071, roas: 3.4 },
    treatment: { headline: '15s 场景使用视频 v2', clicks: 540, ctr: 0.031, cvr: 0.085, roas: 4.6 },
    significance: 0.96,
    winner: 'treatment',
  },
];

// 竞品 ASIN 攻击候选
export const mockCompetitorTargets = [
  { asin: 'B0RIVAL1', title: 'Heavy Duty Case Pro by RIVAL', bsr: 15, rating: 4.3, reviewCount: 520, price: 19.99, attackability: 0.82, expectedShare: 0.08, recommendedBid: 1.20, recommendedBudget: 5, reason: 'BSR 比你高 13%、评分比你低、价格相近' },
  { asin: 'B0RIVAL2', title: 'Premium Phone Case by XYZ', bsr: 45, rating: 4.4, reviewCount: 89, price: 26.99, attackability: 0.75, expectedShare: 0.05, recommendedBid: 1.05, recommendedBudget: 3, reason: 'Review 数比你少（可压制）、价格更高' },
  { asin: 'B0RIVAL3', title: 'Slim Case by NEW Brand', bsr: 280, rating: 0, reviewCount: 0, price: 22.50, attackability: 0.91, expectedShare: 0.12, recommendedBid: 0.85, recommendedBudget: 4, reason: '新品 + 无评论，可优先抢占' },
];

// 促销联动
export const mockPromoSync = [
  { id: 'promo-001', sku: 'CASE-001', type: 'lightning_deal', status: 'scheduled', startsAt: '2026-05-15 09:00', endsAt: '2026-05-15 17:00', linkedActions: ['当日预算 +50%', 'SP 关键词 +20%', '启动 SB 协同'] },
  { id: 'promo-002', sku: 'CABLE-002', type: 'coupon', status: 'active', startsAt: '2026-05-01', endsAt: '2026-05-31', discount: 0.05, linkedActions: ['出价微调 +10%'] },
  { id: 'promo-003', sku: 'LAMP-003', type: 'best_deal', status: 'planning', startsAt: '2026-06-01', endsAt: '2026-06-07', linkedActions: ['配套 SD 推广', '清库存优先'] },
];

// SQP（Search Query Performance）
export const mockSQP = [
  { term: 'phone case', searchVolume: 12500, ourImpressionShare: 0.18, ourClickShare: 0.12, ourPurchaseShare: 0.09, gap: 'click_share_low', recommendation: 'CTR 低 → 优化主图与标题' },
  { term: 'iphone 14 case', searchVolume: 8200, ourImpressionShare: 0.22, ourClickShare: 0.20, ourPurchaseShare: 0.08, gap: 'cvr_low', recommendation: 'CVR 低 → 优化 Listing 转化诱因' },
  { term: 'usb c cable 100w', searchVolume: 5800, ourImpressionShare: 0.34, ourClickShare: 0.31, ourPurchaseShare: 0.28, gap: 'healthy', recommendation: '健康，可加大投放' },
  { term: 'durable phone case', searchVolume: 3400, ourImpressionShare: 0.06, ourClickShare: 0.04, ourPurchaseShare: 0.02, gap: 'impression_share_low', recommendation: '曝光份额低 → 加预算或加关键词' },
];
