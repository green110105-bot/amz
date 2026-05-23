// 29 个新页的 mock 数据集中放这里

// =========== M1 ===========

export const mockListingVersions = [
  { id: 'v5', n: 5, sku: 'CASE-001', source: 'ai_iteration', score: 79, prevScore: 67, lift: 12, appliedAt: '2026-05-09 14:22', appliedBy: 'demo', amazonStatus: 'live', changes: [{ field: 'bullet_1', from: 'High Quality Phone Case', to: 'Military-Grade Drop Protection — MIL-STD-810G' }, { field: 'bullet_3', from: 'Premium Material', to: 'TPU+PC Dual Layer with 50,000 Drop Tests' }, { field: 'a_plus_4', from: '(无对比表)', to: '+ 对比表（vs 竞品）' }] },
  { id: 'v4', n: 4, sku: 'CASE-001', source: 'manual_edit', score: 67, prevScore: 64, lift: 3, appliedAt: '2026-04-15 10:30', appliedBy: 'demo', amazonStatus: 'live', changes: [{ field: 'title', from: '...', to: '...（手动小改）' }] },
  { id: 'v3', n: 3, sku: 'CASE-001', source: 'ai_iteration', score: 64, prevScore: 56, lift: 8, appliedAt: '2026-03-10 16:45', appliedBy: 'demo', amazonStatus: 'archived', changes: [{ field: 'bullet_2', from: '...', to: '...' }, { field: 'a_plus_2', from: '...', to: '...' }] },
  { id: 'v2', n: 2, sku: 'CASE-001', source: 'manual_edit', score: 56, prevScore: 50, lift: 6, appliedAt: '2026-02-05 09:00', appliedBy: 'demo', amazonStatus: 'archived', changes: [] },
  { id: 'v1', n: 1, sku: 'CASE-001', source: 'initial_import', score: 50, prevScore: null, lift: null, appliedAt: '2026-01-01 12:00', appliedBy: 'system', amazonStatus: 'archived', changes: [] },
];

export const mockKeywordLibrary = [
  { id: 'kw-1', term: 'phone case red', type: 'preferred', category: 'electronics_accessories', impressions30d: 12500, conversions30d: 28, source: 'imported_from_search_terms', addedAt: '2026-04-12' },
  { id: 'kw-2', term: 'iphone 14 case', type: 'preferred', category: 'electronics_accessories', impressions30d: 8800, conversions30d: 22, source: 'manual', addedAt: '2026-04-10' },
  { id: 'kw-3', term: 'free', type: 'banned', category: '*', impressions30d: 0, conversions30d: 0, source: 'system', addedAt: '2026-01-01' },
  { id: 'kw-4', term: 'cheap', type: 'banned', category: '*', impressions30d: 0, conversions30d: 0, source: 'system', addedAt: '2026-01-01' },
  { id: 'kw-5', term: 'wholesale', type: 'banned', category: '*', impressions30d: 0, conversions30d: 0, source: 'manual', addedAt: '2026-03-20' },
  { id: 'kw-6', term: 'protective phone case', type: 'preferred', category: 'electronics_accessories', impressions30d: 4200, conversions30d: 18, source: 'imported_from_search_terms', addedAt: '2026-04-15' },
  { id: 'kw-7', term: 'mil-std certified', type: 'preferred', category: 'electronics_accessories', impressions30d: 1200, conversions30d: 14, source: 'manual', addedAt: '2026-04-22' },
  { id: 'kw-8', term: 'usb c data cable', type: 'preferred', category: 'electronics_accessories', impressions30d: 5800, conversions30d: 64, source: 'imported_from_search_terms', addedAt: '2026-04-08' },
];

export const mockCategoryTemplates = [
  { id: 'electronics_accessories', name: '电子配件', skuCount: 18, weights: { D1: 0.25, D2: 0.25, D3: 0.20, D4: 0.15, D5: 0.15 }, mustHave: ['兼容性列表', 'FCC / CE / RoHS 认证', '输出参数', 'A+ 对比表'], titleTemplate: '[Brand] [Core Keyword] [Differentiator] - [Material] [Spec] [Bonus]', isActive: true },
  { id: 'home_kitchen', name: '家居用品', skuCount: 6, weights: { D1: 0.25, D2: 0.20, D3: 0.20, D4: 0.20, D5: 0.15 }, mustHave: ['尺寸图', '材质说明', '使用场景图', '清洁/保养指南'], titleTemplate: '[Brand] [Product] [Material] [Size] [Use Case]', isActive: true },
  { id: 'baby_products', name: '母婴', skuCount: 4, weights: { D1: 0.25, D2: 0.15, D3: 0.25, D4: 0.15, D5: 0.20 }, mustHave: ['年龄段', '安全认证（CPSC）', '材质（无毒/食品级/BPA Free）', '警告事项'], titleTemplate: '[Brand] [Product] [Age Group] [Safety Cert] [Material]', isActive: true },
  { id: 'apparel', name: '服装', skuCount: 2, weights: { D1: 0.30, D2: 0.15, D3: 0.20, D4: 0.25, D5: 0.10 }, mustHave: ['尺码表', '面料成分', '洗涤指南', '模特上身图（多角度）'], titleTemplate: '[Brand] [Style] [Material] [Size Range] [Color]', isActive: true },
];

export const mockCategoryPains = [
  { id: 'cp-1', category: 'electronics_accessories', painPoint: '兼容性不清楚', frequency: 0.42, severity: 'high', preemptiveStrategy: '在 Listing 五点添加详细兼容设备列表（具体型号）+ A+ 对比表' },
  { id: 'cp-2', category: 'electronics_accessories', painPoint: '数据传输速率不明确', frequency: 0.28, severity: 'medium', preemptiveStrategy: '明确说明 USB 2.0/3.0 数据速率 + 视频传输能力（4K/60Hz）' },
  { id: 'cp-3', category: 'electronics_accessories', painPoint: '认证缺失/不可信', frequency: 0.18, severity: 'medium', preemptiveStrategy: '展示 FCC / CE / RoHS 认证证书图或编号' },
  { id: 'cp-4', category: 'home_kitchen', painPoint: '尺寸与照片不符', frequency: 0.51, severity: 'high', preemptiveStrategy: 'Gallery 添加尺寸对比图（与日常物体）+ 尺寸标注图' },
  { id: 'cp-5', category: 'home_kitchen', painPoint: '材质不安全 / 异味', frequency: 0.34, severity: 'high', preemptiveStrategy: '主图展示材质细节 + 五点提供食品级 / 无毒认证' },
  { id: 'cp-6', category: 'baby_products', painPoint: '材质安全顾虑', frequency: 0.62, severity: 'critical', preemptiveStrategy: '突出 BPA Free / 无毒认证 + CPSC 测试通过 + A+ 展示测试报告' },
];

export const mockCalibration = {
  phaseA: { samples: 100, humanScored: 100, aiScored: 100, correlation: 0.83, target: 0.80, status: 'passed' },
  phaseB: { skuCount: 32, withCvrData: 28, correlationLift: 0.56, target: 0.50, status: 'passed' },
  phaseC: { weeklyAdjustments: 12, lastVersionChange: 'v2.3', currentVersion: 'v2.3' },
  dimensionAccuracy: [
    { dim: 'D1 关键词覆盖', humanAvg: 76, aiAvg: 78, gap: 2 },
    { dim: 'D2 卖点清晰度', humanAvg: 55, aiAvg: 52, gap: -3 },
    { dim: 'D3 用户痛点对齐', humanAvg: 68, aiAvg: 71, gap: 3 },
    { dim: 'D4 视觉与 A+', humanAvg: 62, aiAvg: 65, gap: 3 },
    { dim: 'D5 转化诱因', humanAvg: 50, aiAvg: 48, gap: -2 },
  ],
};

export const mockMultiLocale = [
  { sku: 'CASE-001', master: 'US', locales: [{ code: 'US', status: 'live', score: 79, lastSync: '2026-05-09', isMaster: true }, { code: 'UK', status: 'live', score: 76, lastSync: '2026-05-09', isMaster: false }, { code: 'DE', status: 'translating', score: null, lastSync: null, isMaster: false }, { code: 'CA', status: 'pending', score: null, lastSync: null, isMaster: false }] },
  { sku: 'CABLE-002', master: 'US', locales: [{ code: 'US', status: 'live', score: 78, lastSync: '2026-04-30', isMaster: true }, { code: 'UK', status: 'live', score: 75, lastSync: '2026-04-30', isMaster: false }, { code: 'DE', status: 'live', score: 73, lastSync: '2026-04-30', isMaster: false }] },
];

export const mockKeywordHeatmap = {
  sku: 'CASE-001',
  keywords: [
    { term: 'phone case', impressions: 12500, covered: { title: true, bullets: true, description: true, a_plus: true } },
    { term: 'iphone 14 case', impressions: 8800, covered: { title: true, bullets: true, description: true, a_plus: false } },
    { term: 'protective phone case', impressions: 4200, covered: { title: false, bullets: true, description: true, a_plus: true } },
    { term: 'mil-std certified', impressions: 1200, covered: { title: false, bullets: false, description: false, a_plus: false } },
    { term: 'wireless charging case', impressions: 4400, covered: { title: false, bullets: true, description: true, a_plus: false } },
    { term: 'shock proof case', impressions: 2200, covered: { title: false, bullets: false, description: true, a_plus: false } },
    { term: 'iphone 14 wireless charging', impressions: 1100, covered: { title: false, bullets: false, description: false, a_plus: false } },
    { term: 'durable phone case', impressions: 3400, covered: { title: false, bullets: true, description: false, a_plus: false } },
  ],
};

// =========== M2 ===========

export const mockSlowMovingOptions = {
  sku: 'LAMP-003',
  asin: 'B0LAMP003',
  inventory: 320,
  daysNoSale: 30,
  inStockDays: 217,
  inventoryValue: 38400,
  monthlyStorageCost: 1200,
  ltsCountdownDays: 30,
  capitalLockCostYearly: 4608,
  options: [
    { id: 'A', label: '降价促销至 $19.99', daysToClose: 60, totalLoss: -2300, cashRecovery: 18000, recommended: true, reason: '60 天可释放现金最多 / 损失最小 / 避免账户健康影响' },
    { id: 'B', label: '配套促销（Coupon + Lightning Deal + 广告）', daysToClose: 90, totalLoss: -1200, cashRecovery: 19000, recommended: false, reason: '需更多运营投入，损失更小' },
    { id: 'C', label: '移除回国清货（Removal）', daysToClose: 14, totalLoss: -20400, cashRecovery: 18000, recommended: false, reason: '快速清空但损失大，仅在仓储压力极大时考虑' },
    { id: 'D', label: '销毁（最后选项）', daysToClose: 7, totalLoss: -38560, cashRecovery: 0, recommended: false, reason: '立即停损但损失最大，仅在 A/B/C 都不可行时考虑' },
  ],
};

export const mockRepricing = {
  sku: 'CASE-001',
  asin: 'B0CASE001',
  ourPrice: 22.99,
  competitorAsin: 'B0YYYY1',
  competitorPrice: 19.99,
  competitorOldPrice: 24.99,
  triggeredAt: '2026-05-09 10:23',
  breakEvenPrice: 18.85,
  priceElasticity: -1.6,
  scenarios: [
    { price: 22.99, unitProfit: 5.62, margin: 0.244, expectedVolume30d: 280, expectedTotalProfit30d: 1573, recommended: false, label: '保持现价' },
    { price: 21.99, unitProfit: 4.91, margin: 0.223, expectedVolume30d: 320, expectedTotalProfit30d: 1571, recommended: false, label: '小幅跟价' },
    { price: 20.99, unitProfit: 4.20, margin: 0.200, expectedVolume30d: 380, expectedTotalProfit30d: 1596, recommended: true, label: '中等跟价（AI 推荐）' },
    { price: 19.99, unitProfit: 3.49, margin: 0.175, expectedVolume30d: 460, expectedTotalProfit30d: 1605, recommended: false, label: '完全跟到底' },
    { price: 19.49, unitProfit: 3.10, margin: 0.159, expectedVolume30d: 510, expectedTotalProfit30d: 1581, recommended: false, label: '低于竞品' },
    { price: 18.85, unitProfit: 0, margin: 0, expectedVolume30d: 580, expectedTotalProfit30d: 0, recommended: false, label: '保本价' },
  ],
};

export const mockMultiStore = {
  storesAggregate: { gmv: 1580000, profit: 235000, profitRate: 0.149, orders: 18500 },
  stores: [
    { id: 's-us', name: 'STORE-A · US', gmv: 712000, profit: 105800, profitRate: 0.149, orders: 8200, currency: 'USD', region: 'US' },
    { id: 's-uk', name: 'STORE-B · UK', gmv: 348000, profit: 60000, profitRate: 0.172, orders: 4100, currency: 'GBP', region: 'UK' },
    { id: 's-de', name: 'STORE-C · DE', gmv: 285000, profit: 42000, profitRate: 0.147, orders: 3000, currency: 'EUR', region: 'DE' },
    { id: 's-ca', name: 'STORE-D · CA', gmv: 158000, profit: 21000, profitRate: 0.133, orders: 2200, currency: 'CAD', region: 'CA' },
    { id: 's-jp', name: 'STORE-E · JP', gmv: 77000, profit: 6200, profitRate: 0.081, orders: 1000, currency: 'JPY', region: 'JP' },
  ],
  insights: [
    'UK 店利润率最高（17.2%），可加大投入',
    'DE 店退货率异常（8.5%），需排查',
    'JP 店占比小但增速最快，关注',
  ],
};

export const mockDimensions = {
  byBrand: [
    { name: 'ACME', skus: 8, gmv: 480000, profit: 72000, margin: 0.150 },
    { name: 'NORDIC', skus: 4, gmv: 280000, profit: 38000, margin: 0.136 },
    { name: 'GameSir', skus: 2, gmv: 180000, profit: 32000, margin: 0.178 },
    { name: 'ddHiFi', skus: 3, gmv: 220000, profit: 41000, margin: 0.186 },
  ],
  byTeam: [
    { name: '团队 A', members: 3, skus: 12, gmv: 680000, profit: 98000, margin: 0.144 },
    { name: '团队 B', members: 2, skus: 5, gmv: 320000, profit: 58000, margin: 0.181 },
  ],
  byOwner: [
    { name: '张运营', skus: 8, gmv: 320000, profit: 58000, margin: 0.181 },
    { name: '李运营', skus: 15, gmv: 680000, profit: 98000, margin: 0.144 },
    { name: '王运营', skus: 4, gmv: 160000, profit: 24000, margin: 0.150 },
  ],
};

export const mockTransfers = [
  { id: 't-1', sku: 'CASE-001', from: 'US', to: 'CA', transferQty: 200, transferCost: 320, repurchaseCost: 1280, savings: 960, reason: 'US 仓滞销 + CA 仓断货风险' },
  { id: 't-2', sku: 'CABLE-002', from: 'US', to: 'UK', transferQty: 500, transferCost: 850, repurchaseCost: 4250, savings: 3400, reason: 'US 仓库存 60 天 + UK 14 天断货' },
];

export const mockCustomAlerts = [
  { id: 'rule-1', name: '低利润率报警', conditions: 'sku.rolling_30d_margin < 15% 且 ad_spend > $500/日 持续 3 天', severity: 'P1', notifyChannels: ['in_app', 'email'], enabled: true, lastTriggered: '2026-05-08', triggerCount: 3 },
  { id: 'rule-2', name: '退货率突涨', conditions: 'sku.7d_return_rate > 历史均 +2σ', severity: 'P1', notifyChannels: ['in_app', 'wechat'], enabled: true, lastTriggered: '2026-05-09', triggerCount: 1 },
  { id: 'rule-3', name: '现金流不足', conditions: 'available_cash < ¥200,000 持续 5 天', severity: 'P0', notifyChannels: ['email', 'wechat'], enabled: true, lastTriggered: null, triggerCount: 0 },
  { id: 'rule-4', name: '库存周转过慢', conditions: 'sku.inventory_turnover > 90 天', severity: 'P2', notifyChannels: ['in_app'], enabled: false, lastTriggered: '2026-04-15', triggerCount: 5 },
];

export const mockFx = {
  exposures: [
    { currency: 'USD', amountSource: 73000, cnyEquivalent: 510000, share: 0.72 },
    { currency: 'EUR', amountSource: 18000, cnyEquivalent: 142000, share: 0.20 },
    { currency: 'GBP', amountSource: 12000, cnyEquivalent: 110000, share: 0.15 },
    { currency: 'JPY', amountSource: 800000, cnyEquivalent: 38000, share: 0.05 },
  ],
  totalExposureCny: 720000,
  rateHistory: [{ date: '2026-04-10', usdCny: 6.85 }, { date: '2026-04-20', usdCny: 6.92 }, { date: '2026-04-30', usdCny: 6.88 }, { date: '2026-05-09', usdCny: 6.90 }],
  sensitivity: [
    { delta: -3, profitImpactCny: -20400 },
    { delta: -1, profitImpactCny: -6800 },
    { delta: 1, profitImpactCny: 6800 },
    { delta: 3, profitImpactCny: 20400 },
  ],
  recommendations: [
    'USD 敞口偏大（72%），建议提现 50% 锁汇',
    '当前 USD/CNY 走势看跌，建议加快提现',
    'ACCS（Amazon Currency Converter）隐性 3-4% 损失，强烈建议改用 PingPong / Payoneer',
  ],
};

export const mockPaymentChannels = [
  { id: 'payoneer', name: 'Payoneer', feePct: 0.012, feeFixedPerTx: 1.5, currency: 'USD', monthlyVolume: 285000, monthlyCost: 3420, isPrimary: true },
  { id: 'pingpong', name: 'PingPong', feePct: 0.009, feeFixedPerTx: 0, currency: 'USD/EUR', monthlyVolume: 120000, monthlyCost: 1080, isPrimary: false },
  { id: 'worldfirst', name: 'WorldFirst', feePct: 0.008, feeFixedPerTx: 0, currency: 'GBP', monthlyVolume: 45000, monthlyCost: 360, isPrimary: false },
  { id: 'accs', name: '⚠️ Amazon Currency Converter', feePct: 0.038, feeFixedPerTx: 0, currency: '*', monthlyVolume: 0, monthlyCost: 0, isPrimary: false, warning: '隐性高费率（3-4%），强烈不推荐' },
];

export const mockTax = {
  vat: { totalDue: 28400, byCountry: [{ country: 'GB', sales: 348000, vatRate: 0.20, output: 58000, input: 12000, due: 46000 }, { country: 'DE', sales: 285000, vatRate: 0.19, output: 45580, input: 8200, due: 37380 }] },
  salesTax: { totalCollected: 18200, byState: [{ state: 'CA', sales: 152000, taxRate: 0.075, collected: 11400, threshold: 500000, nexus: false }, { state: 'NY', sales: 88000, taxRate: 0.08, collected: 7040, threshold: 500000, nexus: false }, { state: 'TX', sales: 64000, taxRate: 0.0625, collected: 4000, threshold: 500000, nexus: false }] },
  upcomingDeadlines: [{ name: 'UK VAT Q2 申报', dueAt: '2026-07-31', daysLeft: 82 }, { name: 'DE VAT 2026 年报', dueAt: '2026-12-31', daysLeft: 235 }],
};

export const mockLTV = [
  { sku: 'CABLE-002', firstOrderCount: 4200, repeatRate: 0.32, avgRepeats: 1.8, avgOrderValue: 19.90, ltv: 35.82, cacBreakeven: 35.82, ad30dAcos: 0.20, status: 'high_ltv' },
  { sku: 'CASE-001', firstOrderCount: 2800, repeatRate: 0.08, avgRepeats: 1.1, avgOrderValue: 24.99, ltv: 27.49, cacBreakeven: 27.49, ad30dAcos: 0.22, status: 'low_ltv' },
  { sku: 'LAMP-003', firstOrderCount: 380, repeatRate: 0.05, avgRepeats: 1.05, avgOrderValue: 39.50, ltv: 41.48, cacBreakeven: 41.48, ad30dAcos: 0.45, status: 'low_ltv' },
];

export const mockOrderProfit = {
  orderId: '111-0000001-0000001',
  asin: 'B0CASE001',
  sku: 'CASE-001',
  quantity: 2,
  unitPrice: 24.99,
  revenue: 49.98,
  fees: { referralFee: 7.50, fbaFee: 8.05, refundProvision: 2.00, refundProcessing: 0, storage: 0.43, lts: 0, adAlloc: 4.92, cogs: 18.27, freight: 2.94, customs: 0, paymentFee: 0.58, vat: 0, fxLoss: 0.22, capitalCost: 0.51, other: 0 },
  totalCosts: 45.42,
  netProfit: 4.56,
  margin: 0.0913,
  accuracy: 'estimate',
  confidence: 0.62,
  orderedAt: '2026-05-05',
  shippedAt: '2026-05-06',
  settledAt: null,
  status: 'estimated',
};

// =========== M4 ===========

export const mockAppeals = [
  { id: 'ap-001', reviewId: 'rev-002', sku: 'CASE-001', author: 'Anonymous_99', rating: 1, body: 'Fake product, never used Apple anything!', violationType: 'unrelated_to_product', confidence: 0.88, draftedAt: '2026-05-08', status: 'submitted', amazonCaseId: 'CASE-2026-0508-001', submittedAt: '2026-05-08 14:22', amazonResponse: null },
  { id: 'ap-002', reviewId: 'rev-005', sku: 'LAMP-003', author: 'Mike_T', rating: 1, body: 'I work for the seller, this is fake quality', violationType: 'conflict_of_interest', confidence: 0.75, draftedAt: '2026-05-07', status: 'draft', amazonCaseId: null, submittedAt: null, amazonResponse: null },
  { id: 'ap-003', reviewId: 'rev-008', sku: 'CASE-001', author: 'Buyer123', rating: 1, body: 'Wrong product delivered', violationType: 'logistics_unrelated', confidence: 0.82, draftedAt: '2026-04-20', status: 'accepted', amazonCaseId: 'CASE-2026-0420-007', submittedAt: '2026-04-20 09:30', amazonResponse: 'Removed' },
  { id: 'ap-004', reviewId: 'rev-009', sku: 'CABLE-002', author: 'X', rating: 2, body: '...', violationType: 'duplicate', confidence: 0.65, draftedAt: '2026-04-15', status: 'rejected', amazonCaseId: 'CASE-2026-0415-002', submittedAt: '2026-04-15 16:00', amazonResponse: 'Insufficient evidence' },
];

export const mockRecoveryEmails = [
  { id: 're-001', reviewId: 'rev-001', sku: 'CASE-001', author: 'Sarah K.', rating: 1, status: 'pending', subject: 'We\'re sorry about your experience - Let\'s make it right', preview: 'Thank you for taking the time to share your feedback...', draftedAt: '2026-05-08', sentAt: null, replied: false },
  { id: 're-002', reviewId: 'rev-003', sku: 'LAMP-003', author: 'Mike T.', rating: 2, status: 'sent', subject: 'About your recent purchase', preview: 'I\'m sorry the product didn\'t meet your expectations...', draftedAt: '2026-05-06', sentAt: '2026-05-06 18:30', replied: true, reviewUpdated: true, newRating: 4 },
  { id: 're-003', reviewId: 'rev-006', sku: 'CASE-001', author: 'JK', rating: 3, status: 'draft', subject: '...', preview: '...', draftedAt: '2026-05-09', sentAt: null, replied: false },
];

export const mockHijacking = [
  { id: 'hj-001', asin: 'B0CASE001', sku: 'CASE-001', hijackerSeller: 'CheapSeller888', hijackerPrice: 18.99, ourPrice: 24.99, detectedAt: '2026-05-09 11:15', durationMin: 45, type: 'price_competition', estimatedLossPerHour: 3200, status: 'pending_test_buy' },
  { id: 'hj-002', asin: 'B0CABLE02', sku: 'CABLE-002', hijackerSeller: 'FakeBrand_Z', hijackerPrice: 9.99, ourPrice: 19.90, detectedAt: '2026-05-08 09:00', durationMin: 1800, type: 'counterfeit_suspect', estimatedLossPerHour: 1800, status: 'test_buy_in_transit', testBuyOrderId: '111-TEST-2025-001' },
  { id: 'hj-003', asin: 'B0LAMP003', sku: 'LAMP-003', hijackerSeller: 'Hijacker_X', hijackerPrice: 35.00, ourPrice: 39.50, detectedAt: '2026-05-01 14:00', durationMin: 11520, type: 'counterfeit_confirmed', estimatedLossPerHour: 800, status: 'appeal_submitted', appealCaseId: 'CASE-2026-0501-A' },
];

export const mockNotifications = [
  { id: 'n-001', severity: 'P0', source: 'M4A', title: 'Buy Box 丢失 - CASE-001', body: '已丢失 35 分钟，估算损失 ¥1,600', createdAt: '2026-05-10 09:30', readAt: null, channels: ['in_app', 'email'] },
  { id: 'n-002', severity: 'P0', source: 'M4A', title: '账户健康警告 - ODR 1.2%', body: 'ODR 触线，建议起草 POA', createdAt: '2026-05-10 08:45', readAt: null, channels: ['in_app', 'email', 'wechat'] },
  { id: 'n-003', severity: 'P1', source: 'M4B', title: '新 1 星差评 - CASE-001', body: 'Buttons came loose...', createdAt: '2026-05-09 22:15', readAt: '2026-05-10 09:00', channels: ['in_app', 'email'] },
  { id: 'n-004', severity: 'P1', source: 'M2', title: '广告利润亏损 - LAMP-003', body: '利润 ROAS 0.85 持续 5 天', createdAt: '2026-05-09 18:00', readAt: '2026-05-09 19:30', channels: ['in_app'] },
  { id: 'n-005', severity: 'P2', source: 'M4C', title: '竞品价格变化 - B0YYYY1', body: '降价 -20% + 启动 LD', createdAt: '2026-05-09 14:23', readAt: null, channels: ['in_app'] },
  { id: 'n-006', severity: 'P2', source: 'M2', title: '滞销库存预警 - LAMP-003', body: '入仓 217 天，30 天后触发 LTS', createdAt: '2026-05-08 10:00', readAt: '2026-05-08 11:00', channels: ['in_app', 'email'] },
];

export const mockReviewTrends = [
  { sku: 'CASE-001', asin: 'B0CASE001', avgRating: 4.5, totalReviews: 320, last7d: { added: 12, avg: 4.3 }, last30d: { added: 38, avg: 4.4 }, trend: 'declining', trendDelta: -0.2, ratingDistribution: { 5: 198, 4: 58, 3: 26, 2: 16, 1: 22 } },
  { sku: 'CABLE-002', asin: 'B0CABLE02', avgRating: 4.6, totalReviews: 1500, last7d: { added: 22, avg: 4.7 }, last30d: { added: 88, avg: 4.6 }, trend: 'stable', trendDelta: 0.0, ratingDistribution: { 5: 1080, 4: 270, 3: 90, 2: 30, 1: 30 } },
  { sku: 'LAMP-003', asin: 'B0LAMP003', avgRating: 3.9, totalReviews: 89, last7d: { added: 4, avg: 2.5 }, last30d: { added: 12, avg: 3.0 }, trend: 'declining_strong', trendDelta: -0.4, ratingDistribution: { 5: 32, 4: 18, 3: 14, 2: 12, 1: 13 } },
];

export const mockResolutionCases = [
  { id: 'rc-001', anomalyType: 'A4 BB 丢失', scenario: 'BB 丢失 / 价格高于竞品 13%', action: '跟价至 $20.99（不到底）+ 启 Coupon 5%', outcome: '30 分钟拿回 BB，30 天利润 +¥X', date: '2026-04-15', status: 'successful' },
  { id: 'rc-002', anomalyType: 'A4 BB 丢失', scenario: 'BB 丢失 / 跟卖低价', action: 'Test Buy + 申诉假货', outcome: '7 天后跟卖被踢，BB 自动恢复', date: '2026-03-22', status: 'successful' },
  { id: 'rc-003', anomalyType: 'A8 退款激增', scenario: '24h 退款率 15% / 包装破损为主', action: '换防压外箱 + 部分订单主动退款挽回', outcome: '退款率回归 5%', date: '2026-03-10', status: 'successful' },
  { id: 'rc-004', anomalyType: 'A11 账户健康 ODR', scenario: 'ODR 突破 1%', action: '逐个订单分析 + POA 申诉', outcome: '7 天恢复', date: '2026-02-20', status: 'successful' },
  { id: 'rc-005', anomalyType: 'A15 跟卖出现', scenario: '低价跟卖（非假货）', action: '直接跟价至 BB 价', outcome: '跟卖者退出', date: '2026-02-15', status: 'successful' },
];

export const mockSLA = {
  todayStats: { p0Total: 2, p0Avg: 4, p0Sla: 5, p1Total: 8, p1Avg: 18, p1Sla: 15, escalations: 1 },
  team: [
    { user: '张运营', anomaliesAssigned: 12, avgResponseMin: 8, withinSla: 11, escalated: 1, slaRate: 0.92 },
    { user: '李运营', anomaliesAssigned: 8, avgResponseMin: 22, withinSla: 6, escalated: 2, slaRate: 0.75 },
    { user: '王运营', anomaliesAssigned: 5, avgResponseMin: 4, withinSla: 5, escalated: 0, slaRate: 1.0 },
  ],
};

export const mockInfringement = [
  { id: 'inf-001', asin: 'B0CASE001', type: 'trademark', source: 'amazon_brand_registry', reportedBy: 'BrandX Inc.', description: '商标 "ACME" 注册号 #US123456 涉嫌侵权', severity: 'high', status: 'investigating', detectedAt: '2026-05-08' },
  { id: 'inf-002', asin: 'B0CABLE02', type: 'patent', source: 'third_party_monitor', reportedBy: 'IP Accelerator', description: '专利 USB-C 100W 数据传输 #US10234567 涉嫌侵权', severity: 'medium', status: 'pending_legal_review', detectedAt: '2026-05-05' },
  { id: 'inf-003', asin: 'B0LAMP003', type: 'counterfeit', source: 'manual', reportedBy: 'demo', description: '疑似仿制品在售', severity: 'medium', status: 'submitted', appealId: 'IP-2026-001', detectedAt: '2026-04-20' },
];

export const mockPostmortems = [
  { id: 'pm-001', title: 'B0CASE001 销量异常事件复盘', date: '2026-05-08', anomalyIds: ['A1-001', 'A4-001'], lossEstimate: 2800, rootCause: '竞品 B0YYYY1 大幅降价', resolution: '跟价 + Coupon 30 分钟内拿回 BB，24h 销量恢复', verdict: 'successful', improvements: ['竞品 B0YYYY1 已列入高敏感监控', 'BB 丢失自动跟价规则启用'] },
  { id: 'pm-002', title: 'LAMP-003 滞销诊断复盘', date: '2026-04-30', anomalyIds: ['L4-005'], lossEstimate: 18000, rootCause: '类目衰退 + 替代品涌入', resolution: '降价促销至 $34.99 + 60 天清完', verdict: 'partial', improvements: ['类目趋势监控加强', '滞销 SKU 提前 30 天触发降价规则'] },
];

export const mockImageDiff = [
  { competitorAsin: 'B0YYYY1', imageRole: 'main', detectedAt: '2026-05-09', changeType: '加角标 + 重打光', aiAnalysis: '主图右下角新增"3 YEAR WARRANTY"红色徽章；整体打光从冷色调改为暖色调；产品角度调整（正面 → 3/4 视角）', strategyInferred: '强化质保卖点 + 风格更亲和', impactOnUs: '我方主图缺质保角标，建议 M1 优化' },
  { competitorAsin: 'B0YYYY1', imageRole: 'gallery_3', detectedAt: '2026-05-07', changeType: '替换为对比图', aiAnalysis: '原使用场景图替换为"vs 竞品"对比表（含我方品牌 ACME）', strategyInferred: '主动攻击我方品牌', impactOnUs: '建议 M3 提升品牌词出价反击' },
  { competitorAsin: 'B0ZZZZ1', imageRole: 'a_plus_2', detectedAt: '2026-05-05', changeType: 'A+ 新增模块', aiAnalysis: '新增"30 天免费试用"承诺模块', strategyInferred: '降低购买决策门槛', impactOnUs: '我方可考虑添加退换政策模块' },
];
