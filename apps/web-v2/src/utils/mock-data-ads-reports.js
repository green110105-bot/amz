// 领星等价的广告报表 mock 数据
// 覆盖搜索词报告 / Campaign 报表 / 关键词报表 / 否定关键词 / Portfolios / 自动调价规则

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function isoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ===== 搜索词报告（领星核心页）=====
const SEARCH_TERMS_BASE = [
  // SKU CASE-001 相关
  { term: 'phone case', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },
  { term: 'iphone case', sku: 'CASE-001', asin: 'B0CASE001', match: 'exact', campaign: 'SP-CASE-Growth', adGroup: 'AG-Manual-Exact' },
  { term: 'shockproof phone case', sku: 'CASE-001', asin: 'B0CASE001', match: 'phrase', campaign: 'SP-CASE-Growth', adGroup: 'AG-Manual-Phrase' },
  { term: 'samsung phone case', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },
  { term: 'phone case for iphone 14', sku: 'CASE-001', asin: 'B0CASE001', match: 'phrase', campaign: 'SP-CASE-Growth', adGroup: 'AG-Manual-Phrase' },
  { term: 'magsafe case', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },
  { term: 'iphone 14 pro case', sku: 'CASE-001', asin: 'B0CASE001', match: 'phrase', campaign: 'SP-CASE-Growth', adGroup: 'AG-Manual-Phrase' },
  { term: 'iphone case clear', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },
  { term: 'thin phone case', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },
  { term: 'rugged phone case', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },
  { term: 'phone case for kids', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },
  { term: 'leather phone case', sku: 'CASE-001', asin: 'B0CASE001', match: 'broad', campaign: 'SP-CASE-Auto', adGroup: 'AG-Auto-Discovery' },

  // SKU CABLE-002 相关
  { term: 'usb c cable', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'exact', campaign: 'SP-CABLE-Manual', adGroup: 'AG-Cable-Exact' },
  { term: 'fast charging cable', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'phrase', campaign: 'SP-CABLE-Auto', adGroup: 'AG-Cable-Auto' },
  { term: 'lightning cable', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'broad', campaign: 'SP-CABLE-Auto', adGroup: 'AG-Cable-Auto' },
  { term: 'usb cable 6ft', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'phrase', campaign: 'SP-CABLE-Auto', adGroup: 'AG-Cable-Auto' },
  { term: 'usb c cable 10ft', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'phrase', campaign: 'SP-CABLE-Auto', adGroup: 'AG-Cable-Auto' },
  { term: 'braided usb cable', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'broad', campaign: 'SP-CABLE-Auto', adGroup: 'AG-Cable-Auto' },
  { term: 'wireless charger', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'broad', campaign: 'SP-CABLE-Auto', adGroup: 'AG-Cable-Auto' },
  { term: 'usb c charger cable', sku: 'CABLE-002', asin: 'B0CABLE002', match: 'phrase', campaign: 'SP-CABLE-Auto', adGroup: 'AG-Cable-Auto' },

  // SKU LAMP-003 相关
  { term: 'desk lamp', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'exact', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Exact' },
  { term: 'led desk lamp', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'phrase', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Phrase' },
  { term: 'office lamp', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'broad', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Broad' },
  { term: 'reading lamp', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'broad', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Broad' },
  { term: 'study lamp for desk', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'phrase', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Phrase' },
  { term: 'bedside lamp', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'broad', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Broad' },
  { term: 'desk lamp with usb port', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'phrase', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Phrase' },
  { term: 'desk lamp clip on', sku: 'LAMP-003', asin: 'B0LAMP003', match: 'broad', campaign: 'SP-LAMP-Mature', adGroup: 'AG-Lamp-Broad' },
];

// 给每条添加性能指标，控制好正负样本分布
function enrich(base, i) {
  const impressions = Math.round(rand(80, 5000));
  const ctrBase = rand(0.005, 0.025);
  const clicks = Math.round(impressions * ctrBase);
  const cvrBase = rand(0.005, 0.08);
  const orders = Math.max(0, Math.round(clicks * cvrBase));
  const cpc = rand(0.3, 2.0);
  const spend = Math.round(clicks * cpc * 100) / 100;
  const aov = rand(8, 25);
  const sales = Math.round(orders * aov * 100) / 100;
  const acos = sales > 0 ? spend / sales : null;
  const ctr = clicks / Math.max(impressions, 1);
  const cvr = orders / Math.max(clicks, 1);
  const roas = spend > 0 ? sales / spend : 0;

  // 故意造一些极端样本
  let signal = 'normal';
  if (clicks > 30 && orders === 0) signal = 'waste'; // 浪费词
  else if (orders >= 5 && acos !== null && acos < 0.3) signal = 'harvest'; // 应升手动
  else if (acos !== null && acos > 0.8) signal = 'high_acos';

  return {
    id: `st-${i}-${Math.random().toString(36).slice(2, 6)}`,
    ...base,
    impressions,
    clicks,
    cpc: Math.round(cpc * 100) / 100,
    spend,
    orders,
    sales,
    acos,
    ctr,
    cvr,
    roas: Math.round(roas * 10) / 10,
    clickShare: Math.round(rand(0.05, 0.3) * 100) / 100,
    signal,
    period: '7d',
  };
}

export const searchTermsReport = SEARCH_TERMS_BASE.map((b, i) => enrich(b, i));

// 手工固定几条用作 demo 的有意义样本
searchTermsReport[3].clicks = 215;
searchTermsReport[3].orders = 0;
searchTermsReport[3].spend = 42.0;
searchTermsReport[3].sales = 0;
searchTermsReport[3].acos = null;
searchTermsReport[3].ctr = 0.011;
searchTermsReport[3].cvr = 0;
searchTermsReport[3].roas = 0;
searchTermsReport[3].signal = 'waste'; // samsung phone case (错配)

searchTermsReport[13].clicks = 142;
searchTermsReport[13].orders = 8;
searchTermsReport[13].spend = 78.5;
searchTermsReport[13].sales = 198.4;
searchTermsReport[13].acos = 0.395;
searchTermsReport[13].ctr = 0.038;
searchTermsReport[13].cvr = 0.056;
searchTermsReport[13].roas = 2.5;
searchTermsReport[13].signal = 'harvest'; // fast charging cable

// ===== 广告活动报表 =====
export const campaignReport = [
  { id: 'cmp-001', name: 'SP-CASE-Auto', type: 'SP', targetingType: '自动', state: '启用', stage: 'growth', dailyBudget: 50, spend: 312, sales: 1108, orders: 48, clicks: 168, impressions: 8200, acos: 0.282, roas: 3.55, ctr: 0.0205, cvr: 0.286 },
  { id: 'cmp-002', name: 'SP-CASE-Growth', type: 'SP', targetingType: '手动', state: '启用', stage: 'growth', dailyBudget: 80, spend: 456, sales: 1620, orders: 71, clicks: 240, impressions: 11400, acos: 0.281, roas: 3.55, ctr: 0.021, cvr: 0.296 },
  { id: 'cmp-003', name: 'SP-CABLE-Manual', type: 'SP', targetingType: '手动', state: '启用', stage: 'launch', dailyBudget: 40, spend: 218, sales: 510, orders: 38, clicks: 95, impressions: 4100, acos: 0.427, roas: 2.34, ctr: 0.023, cvr: 0.40 },
  { id: 'cmp-004', name: 'SP-CABLE-Auto', type: 'SP', targetingType: '自动', state: '启用', stage: 'launch', dailyBudget: 30, spend: 178, sales: 386, orders: 28, clicks: 80, impressions: 3500, acos: 0.461, roas: 2.17, ctr: 0.023, cvr: 0.35 },
  { id: 'cmp-005', name: 'SP-LAMP-Mature', type: 'SP', targetingType: '手动', state: '启用', stage: 'decline', dailyBudget: 40, spend: 430, sales: 460, orders: 23, clicks: 88, impressions: 6800, acos: 0.935, roas: 1.07, ctr: 0.013, cvr: 0.261 },
  { id: 'cmp-006', name: 'SD-CASE-Display', type: 'SD', targetingType: 'ASIN 定位', state: '启用', stage: 'growth', dailyBudget: 25, spend: 142, sales: 528, orders: 22, clicks: 65, impressions: 9200, acos: 0.269, roas: 3.72, ctr: 0.007, cvr: 0.338 },
  { id: 'cmp-007', name: 'SB-CASE-Brand', type: 'SB', targetingType: '品牌词', state: '启用', stage: 'mature', dailyBudget: 35, spend: 198, sales: 940, orders: 41, clicks: 132, impressions: 5400, acos: 0.211, roas: 4.75, ctr: 0.0244, cvr: 0.311 },
  { id: 'cmp-008', name: 'SP-CASE-Defense', type: 'SP', targetingType: '品牌词防御', state: '启用', stage: 'mature', dailyBudget: 20, spend: 96, sales: 380, orders: 17, clicks: 48, impressions: 2200, acos: 0.253, roas: 3.96, ctr: 0.0218, cvr: 0.354 },
  { id: 'cmp-009', name: 'SP-LAMP-Decline', type: 'SP', targetingType: '手动', state: '已暂停', stage: 'decline', dailyBudget: 15, spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0, acos: null, roas: 0, ctr: 0, cvr: 0 },
  { id: 'cmp-010', name: 'SD-Attack-Rival', type: 'SD', targetingType: '竞品 ASIN', state: '启用', stage: 'launch', dailyBudget: 30, spend: 124, sales: 380, orders: 14, clicks: 72, impressions: 5800, acos: 0.326, roas: 3.06, ctr: 0.0124, cvr: 0.194 },
];

// ===== 关键词报表 =====
export const keywordReport = [
  { id: 'kw-001', term: 'iphone case', match: 'exact', sku: 'CASE-001', campaign: 'SP-CASE-Growth', state: '启用', bid: 1.4, suggestedBidLow: 1.1, suggestedBidHigh: 1.85, impressions: 4200, clicks: 92, cpc: 1.32, spend: 121.5, orders: 28, sales: 642, acos: 0.189, ctr: 0.0219, cvr: 0.304, position: 3.2 },
  { id: 'kw-002', term: 'shockproof phone case', match: 'phrase', sku: 'CASE-001', campaign: 'SP-CASE-Growth', state: '启用', bid: 1.40, suggestedBidLow: 1.20, suggestedBidHigh: 2.10, impressions: 1850, clicks: 41, cpc: 1.45, spend: 59.6, orders: 3, sales: 76.5, acos: 0.779, ctr: 0.0222, cvr: 0.073, position: 5.1 },
  { id: 'kw-003', term: 'usb c cable', match: 'exact', sku: 'CABLE-002', campaign: 'SP-CABLE-Manual', state: '启用', bid: 0.85, suggestedBidLow: 0.65, suggestedBidHigh: 1.15, impressions: 2200, clicks: 58, cpc: 0.82, spend: 47.5, orders: 18, sales: 235, acos: 0.202, ctr: 0.0264, cvr: 0.310, position: 2.8 },
  { id: 'kw-004', term: 'desk lamp', match: 'exact', sku: 'LAMP-003', campaign: 'SP-LAMP-Mature', state: '启用', bid: 0.95, suggestedBidLow: 0.45, suggestedBidHigh: 1.30, impressions: 3400, clicks: 44, cpc: 1.05, spend: 46.2, orders: 2, sales: 39.8, acos: 1.161, ctr: 0.0129, cvr: 0.045, position: 8.2 },
  { id: 'kw-005', term: 'phone case', match: 'broad', sku: 'CASE-001', campaign: 'SP-CASE-Auto', state: '启用', bid: 0.95, suggestedBidLow: 0.80, suggestedBidHigh: 1.40, impressions: 5800, clicks: 118, cpc: 0.92, spend: 108.4, orders: 32, sales: 712, acos: 0.152, ctr: 0.0203, cvr: 0.271, position: 4.5 },
  { id: 'kw-006', term: 'fast charging cable', match: 'phrase', sku: 'CABLE-002', campaign: 'SP-CABLE-Auto', state: '启用', bid: 0.75, suggestedBidLow: 0.55, suggestedBidHigh: 1.00, impressions: 1620, clicks: 42, cpc: 0.78, spend: 32.8, orders: 8, sales: 105.2, acos: 0.312, ctr: 0.0259, cvr: 0.190, position: 4.0 },
  { id: 'kw-007', term: 'led desk lamp', match: 'phrase', sku: 'LAMP-003', campaign: 'SP-LAMP-Mature', state: '启用', bid: 0.85, suggestedBidLow: 0.65, suggestedBidHigh: 1.15, impressions: 1800, clicks: 22, cpc: 0.95, spend: 21.0, orders: 1, sales: 19.9, acos: 1.055, ctr: 0.0122, cvr: 0.045, position: 9.5 },
];

// ===== 否定关键词列表 =====
export const negativeKeywords = [
  { id: 'nk-001', term: 'samsung phone case', match: 'exact', scope: 'AdGroup', target: 'AG-Auto-Discovery', campaign: 'SP-CASE-Auto', sku: 'CASE-001', addedBy: 'AI 自动', addedAt: isoDate(3), savedSpend: 42, status: '已应用' },
  { id: 'nk-002', term: 'free phone case', match: 'phrase', scope: 'Campaign', target: 'SP-CASE-Auto', campaign: 'SP-CASE-Auto', sku: 'CASE-001', addedBy: 'admin', addedAt: isoDate(7), savedSpend: 18, status: '已应用' },
  { id: 'nk-003', term: 'lightning cable', match: 'exact', scope: 'AdGroup', target: 'AG-Cable-Auto', campaign: 'SP-CABLE-Auto', sku: 'CABLE-002', addedBy: 'AI 自动', addedAt: isoDate(2), savedSpend: 12, status: '已应用' },
  { id: 'nk-004', term: 'iphone 12 case', match: 'exact', scope: 'Campaign', target: 'SP-CASE-Growth', campaign: 'SP-CASE-Growth', sku: 'CASE-001', addedBy: 'operator', addedAt: isoDate(14), savedSpend: 35, status: '已应用' },
  { id: 'nk-005', term: 'cheap', match: 'phrase', scope: 'Account', target: '全账号', campaign: '—', sku: '—', addedBy: 'admin', addedAt: isoDate(30), savedSpend: 220, status: '已应用' },
  { id: 'nk-006', term: 'kid', match: 'phrase', scope: 'AdGroup', target: 'AG-Cable-Auto', campaign: 'SP-CABLE-Auto', sku: 'CABLE-002', addedBy: 'AI 自动', addedAt: isoDate(5), savedSpend: 8, status: '已应用' },
  { id: 'nk-007', term: 'used', match: 'exact', scope: 'Campaign', target: 'SP-LAMP-Mature', campaign: 'SP-LAMP-Mature', sku: 'LAMP-003', addedBy: 'admin', addedAt: isoDate(45), savedSpend: 64, status: '已应用' },
  { id: 'nk-008', term: 'wireless charger', match: 'exact', scope: 'Campaign', target: 'SP-CABLE-Auto', campaign: 'SP-CABLE-Auto', sku: 'CABLE-002', addedBy: 'AI 自动', addedAt: isoDate(1), savedSpend: 0, status: '待审核' },
];

// ===== Portfolios 投放组合 =====
export const portfolios = [
  { id: 'pf-001', name: 'CASE-001 全产品', sku: 'CASE-001', campaignCount: 4, monthlyCap: 4500, currentSpend: 2840, percentUsed: 0.631, salesMTD: 9420, acos: 0.301, state: 'In Budget' },
  { id: 'pf-002', name: 'CABLE-002 launch', sku: 'CABLE-002', campaignCount: 2, monthlyCap: 2000, currentSpend: 1180, percentUsed: 0.590, salesMTD: 3150, acos: 0.375, state: 'In Budget' },
  { id: 'pf-003', name: 'LAMP-003 衰退期', sku: 'LAMP-003', campaignCount: 2, monthlyCap: 1200, currentSpend: 1080, percentUsed: 0.900, salesMTD: 920, acos: 1.174, state: 'Over Budget Risk' },
  { id: 'pf-004', name: '品牌防御', sku: '全 SKU', campaignCount: 3, monthlyCap: 800, currentSpend: 462, percentUsed: 0.578, salesMTD: 2640, acos: 0.175, state: 'In Budget' },
];

// ===== 自动调价规则 =====
export const bidRules = [
  { id: 'rule-001', name: 'ACOS > 80% 自动降 bid 15%', scope: 'AdGroup 关键词', condition: 'ACOS_7d > 0.8 AND clicks_7d >= 10', action: 'bid × 0.85', frequency: '每日 09:00', enabled: true, lastTriggered: isoDate(1), triggerCount: 14 },
  { id: 'rule-002', name: '0 转化 200 点击自动否定', scope: 'AdGroup', condition: 'clicks_30d >= 200 AND orders_30d = 0', action: 'add negative-exact', frequency: '每日 09:00', enabled: true, lastTriggered: isoDate(2), triggerCount: 6 },
  { id: 'rule-003', name: '高 ROAS + 缺曝光，自动加 bid', scope: 'AdGroup 关键词', condition: 'ROAS_7d > 4 AND impressions_7d < expected × 0.7', action: 'bid × 1.15 (max +30%)', frequency: '每日 09:00', enabled: true, lastTriggered: isoDate(3), triggerCount: 8 },
  { id: 'rule-004', name: '预算耗尽 14:00 前自动 +20%', scope: 'Campaign', condition: 'budget_exhausted_hour < 14:00', action: 'daily_budget × 1.20 (max +50%)', frequency: '每日 09:00 + 12:00', enabled: false, lastTriggered: null, triggerCount: 0 },
  { id: 'rule-005', name: '断货保护：库存 < 7d 自动暂停', scope: 'Campaign', condition: 'sku_inventory_days < 7', action: 'pause campaign', frequency: '每小时', enabled: true, lastTriggered: isoDate(0), triggerCount: 2 },
  { id: 'rule-006', name: '新品宽容期：launch < 30d 不调价', scope: '全部', condition: 'sku.days_listed < 30', action: 'skip all bid changes', frequency: '常驻', enabled: true, lastTriggered: null, triggerCount: null },
];

// ===== 广告位报表 =====
export const placementReport = [
  { id: 'pl-001', campaign: 'SP-CASE-Growth', placement: 'Top of Search (第一页顶部)', spend: 280, sales: 1245, orders: 56, acos: 0.225, roas: 4.45, currentBidAdj: 0, suggestedBidAdj: 0.30 },
  { id: 'pl-002', campaign: 'SP-CASE-Growth', placement: 'Product Pages (商品详情页)', spend: 121, sales: 280, orders: 12, acos: 0.432, roas: 2.31, currentBidAdj: 0, suggestedBidAdj: -0.10 },
  { id: 'pl-003', campaign: 'SP-CASE-Growth', placement: 'Rest of Search (其他位置)', spend: 55, sales: 95, orders: 3, acos: 0.579, roas: 1.73, currentBidAdj: 0, suggestedBidAdj: -0.30 },
  { id: 'pl-004', campaign: 'SP-CABLE-Auto', placement: 'Top of Search', spend: 92, sales: 218, orders: 16, acos: 0.422, roas: 2.37, currentBidAdj: 0.15, suggestedBidAdj: 0.10 },
  { id: 'pl-005', campaign: 'SP-CABLE-Auto', placement: 'Product Pages', spend: 65, sales: 140, orders: 9, acos: 0.464, roas: 2.15, currentBidAdj: 0, suggestedBidAdj: 0 },
  { id: 'pl-006', campaign: 'SP-CABLE-Auto', placement: 'Rest of Search', spend: 21, sales: 28, orders: 3, acos: 0.750, roas: 1.33, currentBidAdj: 0, suggestedBidAdj: -0.20 },
];
