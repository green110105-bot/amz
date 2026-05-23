// 领星等价完整层级 mock 数据
// 层级: Portfolio → Campaign → AdGroup → Ad / Targeting (KW/Product) / Negative / SearchTerm
// 复现 lx1-lx4 屏幕所有字段，含 22 列指标

function rand(min, max) { return min + Math.random() * (max - min); }
function pickInt(min, max) { return Math.floor(rand(min, max)); }
function isoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function timeStr(daysAgo, hour = 14, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ===== 22 列完整指标生成器 =====
export function makeMetrics(opts = {}) {
  const impressions = opts.impressions ?? pickInt(500, 30000);
  const ctr = opts.ctr ?? rand(0.005, 0.025);
  const clicks = opts.clicks ?? Math.round(impressions * ctr);
  const cpc = opts.cpc ?? rand(0.2, 1.5);
  const spend = opts.spend ?? Math.round(clicks * cpc * 100) / 100;
  const cvr = opts.cvr ?? rand(0.005, 0.06);
  const orders = opts.orders ?? Math.max(0, Math.round(clicks * cvr));
  const aov = opts.aov ?? rand(10, 30);
  const sales = opts.sales ?? Math.round(orders * aov * 100) / 100;
  const directOrders = opts.directOrders ?? Math.round(orders * 0.6);
  const directSales = opts.directSales ?? Math.round(directOrders * aov * 100) / 100;
  const acos = sales > 0 ? spend / sales : null;
  const cpa = orders > 0 ? spend / orders : null;
  const adUnitPrice = orders > 0 ? sales / orders : 0;
  const adUnits = opts.adUnits ?? orders;

  return {
    impressions,
    clicks,
    clickPct: 100, // 占比，按行业内分组占比；此处单行视为 100%
    ctr,
    cpc: Math.round(cpc * 100) / 100,
    spend,
    spendPct: 100,
    sales,
    salesPct: 100,
    directSales,
    acos,
    orders,
    directOrders,
    cpa,
    cvr,
    adUnitPrice: Math.round(adUnitPrice * 100) / 100,
    adUnits,
  };
}

// ===== 广告组合 (Portfolios) - 顶层 =====
export const portfolios = [
  {
    id: 'pf-001',
    name: '冰淇凌机-单杯- black',
    state: '启用',
    serviceState: '正在投放',
    budgetCap: null, // 无预算上限
    msku: 'BQLJ-Black',
    asin: 'B0BQLJBLACK',
    sku: 'CASE-001',
    region: 'US',
    store: '亚马逊-G店铺-US',
    campaignCount: 7,
    activeCampaignCount: 4,
    ...makeMetrics({ impressions: 25268, clicks: 316, ctr: 0.0125, cpc: 0.29, spend: 92.31, sales: 247.96, orders: 2, directOrders: 0, directSales: 0 }),
  },
  {
    id: 'pf-002',
    name: '冰淇凌机-双杯- white',
    state: '启用',
    serviceState: '正在投放',
    budgetCap: 800,
    msku: 'BQLJ-White-2',
    asin: 'B0BQLJWHITE',
    sku: 'CASE-002',
    region: 'US',
    store: '亚马逊-G店铺-US',
    campaignCount: 5,
    activeCampaignCount: 3,
    ...makeMetrics({ impressions: 18420, clicks: 245, spend: 156.40, sales: 580.20, orders: 24, directOrders: 14, directSales: 332.80 }),
  },
  {
    id: 'pf-003',
    name: '快充数据线-3pack',
    state: '启用',
    serviceState: '正在投放',
    budgetCap: 600,
    msku: 'CABLE-3PK',
    asin: 'B0CABLE002',
    sku: 'CABLE-002',
    region: 'US',
    store: '亚马逊-G店铺-US',
    campaignCount: 4,
    activeCampaignCount: 3,
    ...makeMetrics({ impressions: 12800, clicks: 180, spend: 88.30, sales: 412.50, orders: 28, directOrders: 16, directSales: 234.20 }),
  },
  {
    id: 'pf-004',
    name: '台式 LED 灯 - 衰退期',
    state: '启用',
    serviceState: '正在投放',
    budgetCap: 400,
    msku: 'LAMP-003',
    asin: 'B0LAMP003',
    sku: 'LAMP-003',
    region: 'US',
    store: '亚马逊-G店铺-US',
    campaignCount: 3,
    activeCampaignCount: 2,
    ...makeMetrics({ impressions: 8200, clicks: 88, spend: 65.40, sales: 60.20, orders: 3, directOrders: 1, directSales: 18.40 }),
  },
  {
    id: 'pf-005',
    name: '品牌词防御',
    state: '启用',
    serviceState: '正在投放',
    budgetCap: 300,
    msku: '全 SKU',
    asin: '—',
    sku: '—',
    region: 'US',
    store: '亚马逊-G店铺-US',
    campaignCount: 3,
    activeCampaignCount: 3,
    ...makeMetrics({ impressions: 6800, clicks: 132, spend: 28.40, sales: 248.60, orders: 18, directOrders: 12, directSales: 168.20 }),
  },
];

// ===== 广告活动 (Campaigns) - 每个 Portfolio 下多个 =====
function makeCampaign(opts) {
  return {
    id: opts.id,
    portfolioId: opts.portfolioId,
    name: opts.name,
    type: opts.type, // SP / SB / SD / ST
    targetingType: opts.targetingType, // 自动 / 手动 / 商品定位
    state: opts.state || '启用',
    serviceState: opts.serviceState || '正在投放', // 正在投放 / 广告活动超预算 / 已暂停 / 广告活动已暂停
    serviceStateColor: opts.serviceStateColor || '#10b981',
    enabled: opts.enabled !== false,
    dailyBudget: opts.dailyBudget,
    startedAt: opts.startedAt || isoDate(opts.daysOld || 30),
    bidStrategy: opts.bidStrategy || '动态竞价 - 仅降低', // 动态竞价 - 仅降低 / 动态竞价 - 提高和降低 / 固定竞价
    lifecycleStage: opts.lifecycleStage || 'growth',
    tags: opts.tags || [],
    ...makeMetrics(opts.metrics || {}),
  };
}

export const campaigns = [
  // pf-001 下的 7 个活动
  makeCampaign({
    id: 'cmp-001', portfolioId: 'pf-001',
    name: 'Sp-BQLJ-Manu-Phrase-4.10', type: 'SP', targetingType: '手动',
    dailyBudget: 50, serviceState: '广告活动超预算', serviceStateColor: '#f59e0b',
    daysOld: 35,
    metrics: { impressions: 15474, clicks: 165, ctr: 0.0107, cpc: 0.32, spend: 52.25, sales: 247.96, orders: 2, directOrders: 0, directSales: 0 },
    tags: ['核心词组'],
  }),
  makeCampaign({
    id: 'cmp-002', portfolioId: 'pf-001',
    name: 'Sp-BQLJ- Auto-(except close)-4.10', type: 'SP', targetingType: '自动',
    dailyBudget: 20, serviceState: '广告活动超预算', serviceStateColor: '#f59e0b',
    daysOld: 35,
    metrics: { impressions: 6382, clicks: 94, ctr: 0.0147, cpc: 0.21, spend: 20.08, sales: 0, orders: 0 },
    tags: ['探索'],
  }),
  makeCampaign({
    id: 'cmp-003', portfolioId: 'pf-001',
    name: 'Sp-BQLJ-Manu-ASIN定投-1.17', type: 'SP', targetingType: '商品定位',
    dailyBudget: 20, serviceState: '广告活动超预算', serviceStateColor: '#f59e0b',
    daysOld: 28,
    metrics: { impressions: 3412, clicks: 57, ctr: 0.0167, cpc: 0.35, spend: 19.98, sales: 0, orders: 0 },
    tags: ['竞品攻击'],
  }),
  makeCampaign({
    id: 'cmp-004', portfolioId: 'pf-001', enabled: false,
    name: 'Sp-BQLJ-Auto-Close-TES1-1.10', type: 'SP', targetingType: '自动',
    dailyBudget: 30, serviceState: '广告活动已暂停', serviceStateColor: '#94a3b8',
    daysOld: 80,
    metrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 },
  }),
  makeCampaign({
    id: 'cmp-005', portfolioId: 'pf-001', enabled: false,
    name: 'Sp-BQLJ-Auto-Substitute-TES1-1.10', type: 'SP', targetingType: '自动',
    dailyBudget: 30, serviceState: '广告活动已暂停', serviceStateColor: '#94a3b8',
    daysOld: 80,
    metrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 },
  }),
  makeCampaign({
    id: 'cmp-006', portfolioId: 'pf-001', enabled: false,
    name: 'Sp-BQLJ-Manu-ASIN定投-1.10', type: 'SP', targetingType: '商品定位',
    dailyBudget: 50, serviceState: '广告活动已暂停', serviceStateColor: '#94a3b8',
    daysOld: 90,
    metrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 },
  }),
  makeCampaign({
    id: 'cmp-007', portfolioId: 'pf-001',
    name: 'Sb-BQLJ-Brand-Headline-4.20', type: 'SB', targetingType: '关键词',
    dailyBudget: 35, serviceState: '正在投放',
    daysOld: 24,
    metrics: { impressions: 5400, clicks: 132, cpc: 0.55, spend: 72.6, sales: 188.4, orders: 8 },
    tags: ['品牌词']
  }),

  // pf-002
  makeCampaign({ id: 'cmp-021', portfolioId: 'pf-002', name: 'Sp-Cup2-Manu-Exact-2.05', type: 'SP', targetingType: '手动', dailyBudget: 40, daysOld: 60, lifecycleStage: 'mature', metrics: { impressions: 8200, clicks: 105, cpc: 0.78, spend: 81.9, sales: 322.6, orders: 14 } }),
  makeCampaign({ id: 'cmp-022', portfolioId: 'pf-002', name: 'Sp-Cup2-Auto-2.05', type: 'SP', targetingType: '自动', dailyBudget: 30, daysOld: 60, metrics: { impressions: 6400, clicks: 88, cpc: 0.42, spend: 36.96, sales: 142.5, orders: 8 } }),
  makeCampaign({ id: 'cmp-023', portfolioId: 'pf-002', name: 'Sd-Cup2-ASIN-Attack-2.20', type: 'SD', targetingType: 'ASIN 定位', dailyBudget: 25, daysOld: 45, metrics: { impressions: 3820, clicks: 52, cpc: 0.72, spend: 37.54, sales: 115.1, orders: 2 } }),

  // pf-003
  makeCampaign({ id: 'cmp-031', portfolioId: 'pf-003', name: 'Sp-Cable-Manu-Exact-3.01', type: 'SP', targetingType: '手动', dailyBudget: 35, lifecycleStage: 'launch', daysOld: 18, metrics: { impressions: 4200, clicks: 80, cpc: 0.55, spend: 44.0, sales: 195.8, orders: 14 } }),
  makeCampaign({ id: 'cmp-032', portfolioId: 'pf-003', name: 'Sp-Cable-Auto-3.01', type: 'SP', targetingType: '自动', dailyBudget: 25, lifecycleStage: 'launch', daysOld: 18, metrics: { impressions: 3800, clicks: 62, cpc: 0.41, spend: 25.42, sales: 102.4, orders: 8 } }),

  // pf-004 LAMP - 衰退期
  makeCampaign({ id: 'cmp-041', portfolioId: 'pf-004', name: 'Sp-Lamp-Manu-Decline-4.30', type: 'SP', targetingType: '手动', dailyBudget: 20, lifecycleStage: 'decline', daysOld: 280, serviceState: '广告活动超预算', serviceStateColor: '#ef4444', metrics: { impressions: 4500, clicks: 50, cpc: 0.95, spend: 47.5, sales: 39.8, orders: 2 } }),
  makeCampaign({ id: 'cmp-042', portfolioId: 'pf-004', name: 'Sp-Lamp-Clearance-5.01', type: 'SP', targetingType: '手动', dailyBudget: 15, lifecycleStage: 'decline', daysOld: 12, metrics: { impressions: 1800, clicks: 22, cpc: 0.85, spend: 18.7, sales: 19.9, orders: 1 } }),
];

// ===== 广告组 (AdGroups) - 每个 Campaign 下多个 =====
function makeAdGroup(opts) {
  return {
    id: opts.id,
    campaignId: opts.campaignId,
    name: opts.name,
    enabled: opts.enabled !== false,
    state: opts.state || '启用',
    defaultBid: opts.defaultBid,
    bidAdj: opts.bidAdj || 0, // 总体加价
    ...makeMetrics(opts.metrics || {}),
  };
}

export const adGroups = [
  // cmp-001 (Manu-Phrase) 下的广告组
  makeAdGroup({ id: 'ag-001', campaignId: 'cmp-001', name: 'AG-Ice-Cream-Maker-Phrase-1', defaultBid: 1.20, metrics: { impressions: 8200, clicks: 92, spend: 28.4, sales: 145.6, orders: 6 } }),
  makeAdGroup({ id: 'ag-002', campaignId: 'cmp-001', name: 'AG-Ice-Cream-Machine-Phrase-1', defaultBid: 1.10, metrics: { impressions: 4800, clicks: 48, spend: 14.3, sales: 76.0, orders: 4 } }),
  makeAdGroup({ id: 'ag-003', campaignId: 'cmp-001', name: 'AG-Frozen-Yogurt-Phrase-1', defaultBid: 0.95, metrics: { impressions: 2474, clicks: 25, spend: 9.55, sales: 26.36, orders: 1 } }),

  // cmp-002 (Auto) 下的广告组
  makeAdGroup({ id: 'ag-004', campaignId: 'cmp-002', name: 'AG-Auto-All-4.10', defaultBid: 0.65, metrics: { impressions: 6382, clicks: 94, spend: 20.08, sales: 0, orders: 0 } }),
];

// ===== 广告 (Ads / Creatives) =====
export const ads = [
  { id: 'ad-001', adGroupId: 'ag-001', asin: 'B0BQLJBLACK', sku: 'BQLJ-Black', enabled: true, state: '启用', headline: '冰淇凌机 - 单杯 - 黑', imageUrl: 'main.jpg', ...makeMetrics({ impressions: 5200, clicks: 62, spend: 18.5, sales: 92.6 }) },
  { id: 'ad-002', adGroupId: 'ag-001', asin: 'B0BQLJBLACK', sku: 'BQLJ-Black', enabled: true, state: '启用', headline: '冰淇凌机 - 单杯 - 黑 (副创意)', imageUrl: 'lifestyle.jpg', ...makeMetrics({ impressions: 3000, clicks: 30, spend: 9.9, sales: 53.0 }) },
];

// ===== 广告位 (Placements) - lx4 的核心 4 行 =====
export function placementsFor(campaignId) {
  return [
    {
      id: `${campaignId}-pl-1`, placement: '搜索结果顶部（首页）', portfolio: '冰淇凌机-单杯- black',
      bidStrategy: '固定竞价', bidAdj: 20,
      ...makeMetrics({ impressions: 35, clicks: 0, ctr: 0, spend: 0, sales: 0, orders: 0 }),
    },
    {
      id: `${campaignId}-pl-2`, placement: '搜索结果的其余位置', portfolio: '冰淇凌机-单杯- black',
      bidStrategy: '固定竞价', bidAdj: 10,
      ...makeMetrics({ impressions: 4515, clicks: 65, ctr: 0.0144, cpc: 0.38, spend: 24.89, sales: 0, orders: 0 }),
    },
    {
      id: `${campaignId}-pl-3`, placement: '商品页面', portfolio: '冰淇凌机-单杯- black',
      bidStrategy: '固定竞价', bidAdj: 0,
      ...makeMetrics({ impressions: 10997, clicks: 90, ctr: 0.0082, cpc: 0.27, spend: 24.12, sales: 247.96, orders: 2 }),
    },
    {
      id: `${campaignId}-pl-4`, placement: 'OFF AMAZON', portfolio: '冰淇凌机-单杯- black',
      bidStrategy: '固定竞价', bidAdj: 0,
      ...makeMetrics({ impressions: 9, clicks: 9, ctr: 1.0, cpc: 0.33, spend: 2.97, sales: 0, orders: 0 }),
    },
  ];
}

// ===== 投放 (关键词 + 商品定位) =====
export const targetings = [
  // 关键词类型
  { id: 't-001', campaignId: 'cmp-001', adGroupId: 'ag-001', type: 'keyword', term: 'ice cream maker', matchType: 'phrase', bid: 1.25, suggestedBidLow: 0.95, suggestedBidHigh: 1.85, enabled: true, state: '启用', position: 3.2, ...makeMetrics({ impressions: 4200, clicks: 52, cpc: 0.95, spend: 49.4, sales: 168.4, orders: 8 }) },
  { id: 't-002', campaignId: 'cmp-001', adGroupId: 'ag-001', type: 'keyword', term: 'ice cream machine', matchType: 'phrase', bid: 1.15, suggestedBidLow: 0.90, suggestedBidHigh: 1.50, enabled: true, state: '启用', position: 4.5, ...makeMetrics({ impressions: 2800, clicks: 35, cpc: 0.88, spend: 30.8, sales: 79.6 }) },
  { id: 't-003', campaignId: 'cmp-001', adGroupId: 'ag-001', type: 'keyword', term: 'mini ice cream maker', matchType: 'exact', bid: 1.05, suggestedBidLow: 0.80, suggestedBidHigh: 1.30, enabled: true, state: '启用', position: 2.8, ...makeMetrics({ impressions: 1500, clicks: 28, cpc: 0.95, spend: 26.6, sales: 92.4 }) },
  { id: 't-004', campaignId: 'cmp-001', adGroupId: 'ag-002', type: 'keyword', term: 'frozen yogurt maker', matchType: 'phrase', bid: 0.95, suggestedBidLow: 0.70, suggestedBidHigh: 1.20, enabled: true, state: '启用', position: 5.5, ...makeMetrics({ impressions: 1200, clicks: 18, cpc: 0.72, spend: 12.96, sales: 22.5 }) },
  // 商品定位（ASIN）
  { id: 't-101', campaignId: 'cmp-003', adGroupId: 'ag-005', type: 'product', asin: 'B0RIVAL1', matchType: 'asin-exact', bid: 1.30, enabled: true, state: '启用', ...makeMetrics({ impressions: 1800, clicks: 32, cpc: 1.05, spend: 33.6, sales: 0 }) },
  { id: 't-102', campaignId: 'cmp-003', adGroupId: 'ag-005', type: 'product', asin: 'B0RIVAL2', matchType: 'asin-exact', bid: 1.20, enabled: true, state: '启用', ...makeMetrics({ impressions: 800, clicks: 14, cpc: 0.92, spend: 12.88, sales: 0 }) },
  // 自动定位 - 类目
  { id: 't-201', campaignId: 'cmp-002', adGroupId: 'ag-004', type: 'category', category: 'Ice Cream Makers', matchType: 'category', bid: 0.65, enabled: true, state: '启用', ...makeMetrics({ impressions: 3200, clicks: 48, cpc: 0.32, spend: 15.36, sales: 0 }) },
];

// ===== 否定投放 (Negative Targeting) =====
export const negativeTargetings = [
  { id: 'nt-001', campaignId: 'cmp-001', adGroupId: 'ag-001', type: 'keyword', term: 'samsung phone case', matchType: 'exact', scope: 'AdGroup', addedAt: isoDate(3), addedBy: 'AI 自动' },
  { id: 'nt-002', campaignId: 'cmp-001', adGroupId: null, type: 'keyword', term: 'free phone case', matchType: 'phrase', scope: 'Campaign', addedAt: isoDate(7), addedBy: 'admin' },
  { id: 'nt-003', campaignId: 'cmp-002', adGroupId: 'ag-004', type: 'keyword', term: 'wireless charger', matchType: 'exact', scope: 'AdGroup', addedAt: isoDate(1), addedBy: 'AI 自动' },
  { id: 'nt-004', campaignId: 'cmp-001', adGroupId: null, type: 'product', asin: 'B0CHEAP', matchType: 'asin-exact', scope: 'Campaign', addedAt: isoDate(14), addedBy: 'operator' },
];

// ===== 用户搜索词 (Search Term Report) =====
export const userSearchTerms = [
  { id: 'st-001', campaignId: 'cmp-001', adGroupId: 'ag-001', userQuery: 'ice cream maker', matchedKw: 'ice cream maker', matchType: 'phrase', state: 'matched', ...makeMetrics({ impressions: 4200, clicks: 52, spend: 49.4, sales: 168.4, orders: 8 }), signal: 'normal' },
  { id: 'st-002', campaignId: 'cmp-001', adGroupId: 'ag-001', userQuery: 'small ice cream machine for home', matchedKw: 'ice cream machine', matchType: 'phrase', state: 'matched', ...makeMetrics({ impressions: 1200, clicks: 28, spend: 22.4, sales: 95.6, orders: 5 }), signal: 'harvest' },
  { id: 'st-003', campaignId: 'cmp-001', adGroupId: 'ag-001', userQuery: 'samsung ice cube tray', matchedKw: 'ice cream maker', matchType: 'phrase', state: 'matched', ...makeMetrics({ impressions: 800, clicks: 18, spend: 14.4, sales: 0, orders: 0 }), signal: 'waste' },
  { id: 'st-004', campaignId: 'cmp-001', adGroupId: 'ag-001', userQuery: 'mini ice cream maker', matchedKw: 'mini ice cream maker', matchType: 'exact', state: 'matched', ...makeMetrics({ impressions: 1500, clicks: 28, spend: 26.6, sales: 92.4 }), signal: 'normal' },
  { id: 'st-005', campaignId: 'cmp-002', adGroupId: 'ag-004', userQuery: 'frozen yogurt maker electric', matchedKw: 'auto-discovered', matchType: 'auto', state: 'matched', ...makeMetrics({ impressions: 600, clicks: 12, spend: 7.8, sales: 28.4, orders: 2 }), signal: 'harvest' },
  { id: 'st-006', campaignId: 'cmp-002', adGroupId: 'ag-004', userQuery: 'cheap ice cream', matchedKw: 'auto-discovered', matchType: 'auto', state: 'matched', ...makeMetrics({ impressions: 1800, clicks: 35, spend: 10.5, sales: 0, orders: 0 }), signal: 'waste' },
];

// ===== 操作日志 =====
export const operationLogs = [
  { id: 'op-001', campaignId: 'cmp-001', time: timeStr(0, 14, 25), operator: 'admin', action: '修改预算', detail: '日预算 $40 → $50', source: '本工具' },
  { id: 'op-002', campaignId: 'cmp-001', time: timeStr(0, 9, 12), operator: 'AI 自动调价', action: '修改 bid', detail: 'kw "ice cream maker" $1.20 → $1.25', source: '自动规则' },
  { id: 'op-003', campaignId: 'cmp-001', time: timeStr(1, 18, 5), operator: 'admin', action: '加否定关键词', detail: '"samsung phone case" exact, AdGroup 级', source: '本工具' },
  { id: 'op-004', campaignId: 'cmp-001', time: timeStr(2, 11, 30), operator: 'operator', action: '修改预算', detail: '日预算 $35 → $40', source: 'Amazon 后台' },
  { id: 'op-005', campaignId: 'cmp-001', time: timeStr(3, 9, 12), operator: 'AI 自动调价', action: '修改竞价调整', detail: '广告位"商品页面" 0% → +5%', source: '自动规则' },
  { id: 'op-006', campaignId: 'cmp-001', time: timeStr(7, 14, 0), operator: 'admin', action: '创建广告组', detail: 'AG-Ice-Cream-Machine-Phrase-1', source: '本工具' },
  { id: 'op-007', campaignId: 'cmp-001', time: timeStr(7, 13, 50), operator: 'admin', action: '创建活动', detail: 'Sp-BQLJ-Manu-Phrase-4.10, 日预算 $30', source: '本工具' },
];

// ===== 天数据 (按天逐日) =====
export const dailyData = Array.from({ length: 14 }, (_, i) => ({
  id: `dd-${i}`,
  campaignId: 'cmp-001',
  date: isoDate(13 - i),
  ...makeMetrics({
    impressions: pickInt(800, 2200),
    clicks: pickInt(8, 32),
  }),
})).reverse();

// ===== 广告策略 (规则) =====
export const adStrategies = [
  { id: 's-001', name: 'ACOS > 80% 自动降 bid 15%', target: 'cmp-001 全 AdGroup', enabled: true, condition: 'ACOS_7d > 0.8 AND clicks_7d >= 10', action: 'bid × 0.85', frequency: '每日 09:00', lastFired: isoDate(1), fireCount: 3 },
  { id: 's-002', name: '0 转化 200 点击自动否定', target: 'cmp-001 全 AdGroup', enabled: true, condition: 'clicks_30d >= 200 AND orders_30d = 0', action: 'add negative-exact', frequency: '每日 09:00', lastFired: isoDate(7), fireCount: 1 },
  { id: 's-003', name: '预算耗尽 14:00 前 +20%', target: 'cmp-001', enabled: false, condition: 'budget_exhausted_hour < 14:00', action: 'daily_budget × 1.20', frequency: '每日 09:00 + 12:00', lastFired: null, fireCount: 0 },
];

// ===== AMC 人群包 (mock 较简) =====
export const amcAudiences = [
  { id: 'amc-001', name: '近 30 天点击未购买用户', size: 12400, source: 'AMC' },
  { id: 'amc-002', name: '类目浏览者', size: 87000, source: 'AMC' },
  { id: 'amc-003', name: '竞品 ASIN 购买者', size: 4200, source: 'AMC' },
];

// ===== 辅助查询 =====
export function getPortfolio(id) {
  return portfolios.find((p) => p.id === id);
}
export function getCampaign(id) {
  return campaigns.find((c) => c.id === id);
}
export function campaignsByPortfolio(portfolioId) {
  return campaigns.filter((c) => c.portfolioId === portfolioId);
}
export function adGroupsByCampaign(campaignId) {
  return adGroups.filter((ag) => ag.campaignId === campaignId);
}
export function adsByAdGroup(adGroupId) {
  return ads.filter((a) => a.adGroupId === adGroupId);
}
export function targetingsByCampaign(campaignId) {
  return targetings.filter((t) => t.campaignId === campaignId);
}
export function negativeTargetingsByCampaign(campaignId) {
  return negativeTargetings.filter((nt) => nt.campaignId === campaignId);
}
export function userSearchTermsByCampaign(campaignId) {
  return userSearchTerms.filter((u) => u.campaignId === campaignId);
}
export function opLogByCampaign(campaignId) {
  return operationLogs.filter((o) => o.campaignId === campaignId);
}
export function dailyDataByCampaign(campaignId) {
  return dailyData.filter((d) => d.campaignId === campaignId);
}

// 用于场景下拉
export const STORES = [
  '亚马逊-G店铺-US',
  '亚马逊-G店铺-UK',
  '亚马逊-G店铺-DE',
];
