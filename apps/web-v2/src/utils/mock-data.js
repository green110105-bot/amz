// 统一 mock 数据源（用于 W2-W4 页面，后端 API 未覆盖时使用）
// 真接 API 优先：组件先 try API，失败才 fallback 此处

export const mockSkus = [
  { id: 'prod-case-001', sku: 'CASE-001', asin: 'B0CASE001', title: 'Phone Case Pro · 红色', brand: 'ACME', category: '电子配件', price: 24.99, stock: 245, daysCover: 4, lifecycle: 'growth', score: 67, reviewCount: 320, rating: 4.5 },
  { id: 'prod-cable-002', sku: 'CABLE-002', asin: 'B0CABLE02', title: 'USB-C 100W 数据线', brand: 'UGREEN', category: '电子配件', price: 19.90, stock: 1280, daysCover: 37, lifecycle: 'mature', score: 78, reviewCount: 1500, rating: 4.6 },
  { id: 'prod-lamp-003', sku: 'LAMP-003', asin: 'B0LAMP003', title: '北欧极简桌面台灯', brand: 'NORDIC', category: '家居', price: 39.50, stock: 320, daysCover: 96, lifecycle: 'decline', score: 52, reviewCount: 89, rating: 3.9 },
  { id: 'prod-pad-004', sku: 'GAMEPAD-G8', asin: 'B0CM3C9HRG', title: 'G8 手机游戏手柄', brand: 'GameSir', category: '电子配件', price: 56.50, stock: 180, daysCover: 15, lifecycle: 'growth', score: 64, reviewCount: 245, rating: 4.3 },
  { id: 'prod-hifi-005', sku: 'HIFI-005', asin: 'B0BM4274QM', title: 'USB-C 音频转接头', brand: 'ddHiFi', category: '电子配件', price: 43.60, stock: 88, daysCover: 22, lifecycle: 'mature', score: 71, reviewCount: 412, rating: 4.4 },
];

export const mockLeaks = [
  { id: 'leak-001', type: 'PRICE_BELOW_FULL_COST', severity: 'P0', sku: 'LAMP-003', asin: 'B0LAMP003', title: '价格低于完全成本', monthlyImpact: 4200, evidence: ['售价 $39.50 但完全成本 $42.10', '连续 14 天净利为负', 'FBA 长期仓储费即将触发'], recommendation: '提价至 $43.00 或暂停销售并调整成本输入', status: 'open' },
  { id: 'leak-002', type: 'STAGNANT_INVENTORY', severity: 'P1', sku: 'LAMP-003', asin: 'B0LAMP003', title: '滞销库存', monthlyImpact: 4000, evidence: ['320 件可用库存', '7 日销量 0', '入仓 217 天'], recommendation: '对比降价 / 移除 / 销毁三选项后选 A：降至 $34.99 配 5% Coupon', status: 'open' },
  { id: 'leak-003', type: 'AD_PROFIT_ROAS_LOW', severity: 'P1', sku: 'LAMP-003', asin: 'B0LAMP003', title: '广告利润 ROAS 过低', monthlyImpact: 540, evidence: ['利润 ROAS 0.85（目标 ≥ 1.5）', '销售 ROAS 1.07 看似正常但实际亏损', '14 天累计花费 $430'], recommendation: '暂停 Campaign Lamp Mature 或降低关键词出价 30%', status: 'open' },
  { id: 'leak-004', type: 'HIGH_RETURN_RATE', severity: 'P1', sku: 'CASE-001', asin: 'B0CASE001', title: '退货率突涨', monthlyImpact: 1840, evidence: ['7 日退货率 8.2%（基线 3.1%）', '退款原因聚类：包装破损 ×4 / 颜色不符 ×2'], recommendation: '审查包装供应商 + 在 Listing 主图增加颜色标定', status: 'open' },
  { id: 'leak-005', type: 'STORAGE_FEE_RATIO_HIGH', severity: 'P2', sku: 'CABLE-002', asin: 'B0CABLE02', title: '仓储费占比异常', monthlyImpact: 280, evidence: ['月仓储费 / 月销售 = 8.4%（类目均值 2.5%）', '入仓 270 天，长期仓储费 30 天后触发'], recommendation: '减少补货量或申请 Removal Order', status: 'open' },
  { id: 'leak-006', type: 'AD_KEYWORD_NO_CONVERSION', severity: 'P2', sku: 'CASE-001', asin: 'B0CASE001', title: '关键词 30 天无转化', monthlyImpact: 180, evidence: ['关键词 "phone case" 30 天 1248 点击 0 订单', '消耗 $186'], recommendation: '加入否定关键词或更换匹配方式', status: 'fixing' },
];

export const mockCashflow = (() => {
  // 90 天每日点
  const days = 90;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const points = [];
  let balance = 420000;
  for (let i = 0; i < days; i++) {
    const date = new Date(start.getTime() + i * 86400000);
    const inflow = i % 14 === 0 ? 180000 : 0; // Amazon 双周结算
    const ppOut = i % 30 === 5 ? 150000 : 0; // PingPong 提现
    const poOut = (i === 7) ? -85000 : (i === 25) ? -45000 : (i === 50) ? -120000 : 0;
    const storageOut = i % 30 === 6 ? -12000 : 0;
    const ltsOut = i === 45 ? -8500 : 0;
    balance += inflow + ppOut + poOut + storageOut + ltsOut;
    points.push({
      date: date.toISOString().slice(0, 10),
      balance,
      inflow,
      outflow: -(poOut + storageOut + ltsOut),
      label: poOut < 0 ? '采购尾款' : ppOut > 0 ? 'PingPong 提现' : inflow > 0 ? 'Amazon 结算' : '',
    });
  }
  return points;
})();

export const mockPurchaseOrders = [
  { id: 'PO-2026-0015', supplier: '深圳工厂 A', status: 'in_transit', items: [{ sku: 'CASE-001', qty: 600 }], totalLanded: 7010, currency: 'CNY', orderedAt: '2026-04-01', expectedAt: '2026-05-25', tracking: 'BL-XXX-001', shippingMethod: 'ocean_freight', deposit: 2103, balance: 4907, depositPaid: true, balancePaid: true },
  { id: 'PO-2026-0018', supplier: '深圳工厂 A', status: 'ordered', items: [{ sku: 'CABLE-002', qty: 1000 }], totalLanded: 9800, currency: 'CNY', orderedAt: '2026-05-01', expectedAt: '2026-06-15', tracking: '', shippingMethod: 'ocean_freight', deposit: 2940, balance: 6860, depositPaid: true, balancePaid: false },
  { id: 'PO-2026-0019', supplier: '东莞工厂 B', status: 'draft', items: [{ sku: 'GAMEPAD-G8', qty: 300 }], totalLanded: 4500, currency: 'CNY', orderedAt: null, expectedAt: null, tracking: '', shippingMethod: 'air_freight', deposit: 0, balance: 0, depositPaid: false, balancePaid: false },
  { id: 'PO-2026-0012', supplier: '深圳工厂 A', status: 'received', items: [{ sku: 'CASE-001', qty: 800 }], totalLanded: 8800, currency: 'CNY', orderedAt: '2026-02-15', expectedAt: '2026-04-10', actualAt: '2026-04-08', tracking: 'BL-XXX-002', shippingMethod: 'ocean_freight', deposit: 2640, balance: 6160, depositPaid: true, balancePaid: true },
];

export const mockSuppliers = [
  { id: 'sup-a', name: '深圳工厂 A', contact: '张师傅 · zhang@factory-a.com', skuCount: 8, totalSpend: 580000, onTimeRate: 0.92, defectRate: 0.018, rating: 4.2, leadDays: 35, status: 'active', lastOrderAt: '2026-05-01' },
  { id: 'sup-b', name: '东莞工厂 B', contact: '李师傅 · li@factory-b.com', skuCount: 3, totalSpend: 145000, onTimeRate: 0.88, defectRate: 0.024, rating: 3.8, leadDays: 30, status: 'active', lastOrderAt: '2026-04-20' },
  { id: 'sup-c', name: '惠州工厂 C', contact: '王师傅 · wang@factory-c.com', skuCount: 2, totalSpend: 92000, onTimeRate: 0.95, defectRate: 0.011, rating: 4.5, leadDays: 28, status: 'active', lastOrderAt: '2026-04-15' },
  { id: 'sup-d', name: '宁波工厂 D', contact: '陈师傅 · chen@factory-d.com', skuCount: 1, totalSpend: 28000, onTimeRate: 0.74, defectRate: 0.045, rating: 3.0, leadDays: 40, status: 'paused', lastOrderAt: '2026-02-10' },
];

export const mockCampaigns = [
  { id: 'camp-launch-sp', name: 'SP Launch Discovery', type: 'SP', stage: '新品期', status: 'enabled', dailyBudget: 50, spend7d: 692, sales7d: 0, orders7d: 0, acos: null, salesRoas: 0, profitRoas: -1.0, cvr: 0, healthScore: 38, sku: 'CASE-001', issues: ['零订单浪费', '否词机会'] },
  { id: 'camp-growth-sp', name: 'SP Growth Exact', type: 'SP', stage: '成长期', status: 'enabled', dailyBudget: 250, spend7d: 1716, sales7d: 8649, orders7d: 267, acos: 0.1985, salesRoas: 5.04, profitRoas: 1.85, cvr: 0.1185, healthScore: 82, sku: 'CABLE-002', issues: ['预算上限 / 晚间加权', '归因滞后'] },
  { id: 'camp-mature-brand', name: 'SP Acme Brand Core', type: 'SP', stage: '成熟期', status: 'enabled', dailyBudget: 150, spend7d: 1053, sales7d: 4368, orders7d: 156, acos: 0.2412, salesRoas: 4.15, profitRoas: 1.62, cvr: 0.0812, healthScore: 71, sku: 'CASE-001', issues: ['品牌防御暴露', '位置浪费'] },
  { id: 'camp-decline-auto', name: 'SP Decline Auto Harvest', type: 'SP', stage: '衰退期', status: 'enabled', dailyBudget: 100, spend7d: 991, sales7d: 440, orders7d: 20, acos: 2.2543, salesRoas: 0.44, profitRoas: -0.26, cvr: 0.0218, healthScore: 22, sku: 'LAMP-003', issues: ['ACOS 异常', '突降异常', '护栏阻断'] },
  { id: 'camp-attack-sd', name: 'SD Competitor Attack', type: 'SD', stage: '竞品攻击', status: 'enabled', dailyBudget: 80, spend7d: 747, sales7d: 2660, orders7d: 76, acos: 0.2809, salesRoas: 3.56, profitRoas: 1.42, cvr: 0.0634, healthScore: 65, sku: 'GAMEPAD-G8', issues: ['竞品攻击', '断货约束', '突增异常'] },
];

export const mockSearchTerms = [
  { term: 'phone case red', impressions: 12500, clicks: 380, sales: 5400, acos: 0.18, cvr: 0.123, recommend: 'promote_to_manual', actionLabel: '转手动 (高转化)' },
  { term: 'iphone 14 case', impressions: 8800, clicks: 220, sales: 2860, acos: 0.22, cvr: 0.118, recommend: 'promote_to_manual', actionLabel: '转手动' },
  { term: 'cheap phone case', impressions: 6200, clicks: 140, sales: 0, acos: null, cvr: 0, recommend: 'add_negative', actionLabel: '加否词 (零转化)' },
  { term: 'free phone case', impressions: 1800, clicks: 95, sales: 0, acos: null, cvr: 0, recommend: 'add_negative', actionLabel: '加否词' },
  { term: 'wireless charging case', impressions: 4400, clicks: 180, sales: 1620, acos: 0.31, cvr: 0.099, recommend: 'observe', actionLabel: '观察' },
];

export const mockReviews = [
  { id: 'rev-001', sku: 'CASE-001', asin: 'B0CASE001', rating: 1, title: 'Buttons came loose after 2 weeks', body: 'I really wanted to like this case but the buttons feel cheap and one came loose. Won\'t buy again.', reviewer: 'Sarah K.', verified: true, postedAt: '2026-05-08', sentiment: 'negative', cluster: '按键易松', appeal: false, recovery: 'pending' },
  { id: 'rev-002', sku: 'CASE-001', asin: 'B0CASE001', rating: 1, title: 'Fake product, never used Apple anything!', body: 'This is a scam. Anonymous review.', reviewer: 'Anonymous_99', verified: false, postedAt: '2026-05-07', sentiment: 'negative', cluster: '恶意评论', appeal: true, recovery: 'n/a' },
  { id: 'rev-003', sku: 'LAMP-003', asin: 'B0LAMP003', rating: 2, title: 'Smaller than expected', body: 'The lamp is much smaller than I thought from the photos.', reviewer: 'Mike T.', verified: true, postedAt: '2026-05-06', sentiment: 'negative', cluster: '尺寸预期', appeal: false, recovery: 'sent' },
  { id: 'rev-004', sku: 'CASE-001', asin: 'B0CASE001', rating: 5, title: 'Great fast charging', body: 'Charges my phone really fast and looks good!', reviewer: 'John D.', verified: true, postedAt: '2026-05-08', sentiment: 'positive', cluster: '充电速度快', appeal: false, recovery: 'n/a' },
  { id: 'rev-005', sku: 'CABLE-002', asin: 'B0CABLE02', rating: 4, title: 'Good cable but data speed unclear', body: 'Power delivery works great, but the listing doesn\'t say if data is USB 2.0 or 3.0.', reviewer: 'Tom W.', verified: true, postedAt: '2026-05-07', sentiment: 'neutral', cluster: '数据速率说明缺失', appeal: false, recovery: 'n/a' },
];

export const mockReviewClusters = [
  { id: 'cluster-001', sku: 'CASE-001', name: '按键易松', count: 11, percent: 0.39, sentiment: 'negative', rootCause: 'product_quality', confidence: 0.88, samples: ['Buttons came loose', 'Buttons broken after week', 'Side button stopped working'], improvements: [{ layer: 'manufacturer', action: '反向供应链：调整按键弹簧规格至 200gf+，要求 50000 次按压测试', estimatedImpact: 'Reduce 70%+ button complaints' }, { layer: 'listing', action: '在 Listing 五点添加"50000 次按压测试"卖点', module: 'M1' }], estimatedRatingLift: 0.2, status: 'pushed' },
  { id: 'cluster-002', sku: 'CASE-001', name: '物流包装破损', count: 6, percent: 0.21, sentiment: 'negative', rootCause: 'packaging', confidence: 0.92, samples: ['Box was crushed', 'Outer box damaged'], improvements: [{ layer: 'packaging', action: '更换防压外箱 + 增加 fragile 标识' }], estimatedRatingLift: 0.1, status: 'new' },
  { id: 'cluster-003', sku: 'CASE-001', name: '说明书中式英语', count: 4, percent: 0.14, sentiment: 'negative', rootCause: 'documentation', confidence: 0.84, samples: ['Manual translation is bad', 'Instructions hard to read'], improvements: [{ layer: 'documentation', action: '重写说明书 PDF（已生成草稿）' }], estimatedRatingLift: 0.05, status: 'fixing' },
  { id: 'cluster-004', sku: 'CASE-001', name: '充电速度快（好评）', count: 38, percent: 0.32, sentiment: 'positive', rootCause: 'highlight', confidence: 0.95, samples: ['Charges really fast', 'Super quick charging'], improvements: [{ layer: 'listing', action: '在 Listing 五点首句突出此卖点（当前未充分体现）', module: 'M1' }], estimatedRatingLift: 0, status: 'new' },
];

export const mockCompetitors = [
  { asin: 'B0YYYY1', title: 'Heavy Duty Case Pro by RIVAL', price: 19.99, originalPrice: 24.99, bsr: 15, rating: 4.3, reviewCount: 520, ourSku: 'CASE-001', changes: [{ dimension: 'price', from: 24.99, to: 19.99, when: '2 小时前', interpretation: '降价 20% + 启动 Lightning Deal', strategy: 'clearance_or_event_prep', linkedActions: ['M2 跟价测算', 'M1 主图改进', 'M3 品牌词加投'] }], adPositions: ['搜索首页 #2', '详情页关联'] },
  { asin: 'B0ZZZZ1', title: 'Premium Phone Case by XYZ', price: 26.99, originalPrice: 26.99, bsr: 45, rating: 4.4, reviewCount: 89, ourSku: 'CASE-001', changes: [{ dimension: 'listing', from: '主图 v1', to: '主图 v2 含 3 年质保角标', when: '昨天', interpretation: '强化质保卖点 + 风格更亲和', strategy: 'positioning_upgrade', linkedActions: ['M1 跟进添加质保角标'] }], adPositions: ['详情页关联'] },
  { asin: 'B0AAAA2', title: 'New ASIN by CompetitorX', price: 22.50, originalPrice: 22.50, bsr: 280, rating: 0, reviewCount: 0, ourSku: 'CASE-001', changes: [{ dimension: 'new_listing', from: null, to: '新 ASIN', when: '3 天前', interpretation: '同店铺新变体（红色 / 黑色 / 蓝色）', strategy: 'variant_expansion', linkedActions: ['M4 加入监控列表'] }], adPositions: [] },
];

export const mockAuditLogs = [
  { id: 'audit-001', sourceModule: 'M3', actionType: 'LOWER_BID_OR_PAUSE', resourceType: 'campaign', resourceId: 'camp-decline-auto', executor: 'auto_system', executedAt: '2026-05-09 03:21', status: 'success', verdict: 'successful', beforeMetrics: { bid: 1.5, acos: 2.25 }, afterMetrics: { bid: 1.05, acos: 1.42 }, monthlySaving: 540, reverted: false, rationale: '利润 ROAS 0.85 < 1，按 MATURE-2 自动降低出价 30%' },
  { id: 'audit-002', sourceModule: 'M2', actionType: 'CREATE_PURCHASE_ORDER_DRAFT', resourceType: 'po', resourceId: 'PO-2026-0019', executor: 'demo', executedAt: '2026-05-09 09:45', status: 'success', verdict: 'pending', beforeMetrics: null, afterMetrics: { qty: 300, capital: 4500 }, monthlySaving: null, reverted: false, rationale: 'GAMEPAD-G8 库存 15 天，按补货决策生成草稿' },
  { id: 'audit-003', sourceModule: 'M3', actionType: 'ADD_NEGATIVE_KEYWORD', resourceType: 'keyword', resourceId: 'cmp-launch-sp:cheap', executor: 'auto_system', executedAt: '2026-05-09 03:25', status: 'success', verdict: 'successful', beforeMetrics: { spend30d: 186 }, afterMetrics: { blocked: true }, monthlySaving: 180, reverted: false, rationale: '"cheap phone case" 30 天 0 转化 / 1248 点击' },
  { id: 'audit-004', sourceModule: 'M4', actionType: 'DRAFT_REVIEW_APPEAL', resourceType: 'review', resourceId: 'rev-002', executor: 'demo', executedAt: '2026-05-08 16:12', status: 'success', verdict: 'pending', beforeMetrics: null, afterMetrics: null, monthlySaving: null, reverted: false, rationale: '匿名评论 + 与产品无关 → 已起草 Seller Support 申诉文案' },
  { id: 'audit-005', sourceModule: 'M3', actionType: 'INCREASE_BUDGET', resourceType: 'campaign', resourceId: 'camp-growth-sp', executor: 'auto_system', executedAt: '2026-05-09 03:22', status: 'success', verdict: 'successful', beforeMetrics: { budget: 200 }, afterMetrics: { budget: 250 }, monthlySaving: -1500, reverted: false, rationale: 'ACOS 19.85% < 30% 目标，预算受限，按 GROWTH-3 +25%' },
  { id: 'audit-006', sourceModule: 'M2', actionType: 'REPRICE_DOWN', resourceType: 'price', resourceId: 'CASE-001', executor: 'demo', executedAt: '2026-05-08 14:30', status: 'reverted', verdict: 'failed', beforeMetrics: { price: 24.99 }, afterMetrics: { price: 22.99 }, monthlySaving: -800, reverted: true, revertedAt: '2026-05-08 18:45', rationale: '跟价决策回滚（用户认为损失利润空间）' },
];

export const mockExperiments = [
  { id: 'exp-001', sku: 'CASE-001', type: 'main_image', status: 'running', startedAt: '2026-05-01', endsAt: '2026-05-15', daysRunning: 8, daysTotal: 14, controlCvr: 0.058, treatmentCvr: 0.062, lift: 0.069, significance: 0.62, winner: null },
  { id: 'exp-002', sku: 'CABLE-002', type: 'a_plus', status: 'completed', startedAt: '2026-04-10', endsAt: '2026-04-24', daysRunning: 14, daysTotal: 14, controlCvr: 0.061, treatmentCvr: 0.073, lift: 0.197, significance: 0.95, winner: 'treatment' },
  { id: 'exp-003', sku: 'GAMEPAD-G8', type: 'main_image', status: 'completed', startedAt: '2026-03-20', endsAt: '2026-04-03', daysRunning: 14, daysTotal: 14, controlCvr: 0.082, treatmentCvr: 0.079, lift: -0.037, significance: 0.31, winner: 'no_difference' },
];

export const mockListingScore = {
  total: 67,
  prevTotal: 62,
  dimensions: [
    { id: 'D1', label: '关键词覆盖', score: 78, weight: 0.25, sub: [{ id: 'D1.1', label: '主词覆盖', score: 85, weight: 12 }, { id: 'D1.2', label: '长尾词', score: 72, weight: 8 }, { id: 'D1.3', label: '否定词避免', score: 100, weight: 5 }] },
    { id: 'D2', label: '卖点清晰度', score: 52, weight: 0.20, sub: [{ id: 'D2.1', label: 'USP 强度', score: 50, weight: 5 }, { id: 'D2.2', label: '实证强度', score: 60, weight: 5 }, { id: 'D2.3', label: '决策因素', score: 60, weight: 5 }, { id: 'D2.4', label: 'vs 竞品', score: 30, weight: 5 }] },
    { id: 'D3', label: '用户痛点对齐', score: 71, weight: 0.20, sub: [{ id: 'D3.1', label: '差评回应', score: 65, weight: 8 }, { id: 'D3.2', label: '好评突出', score: 75, weight: 8 }, { id: 'D3.3', label: '类目共性', score: 80, weight: 4 }] },
    { id: 'D4', label: '视觉与 A+', score: 65, weight: 0.15, sub: [{ id: 'D4.1', label: '主图', score: 70, weight: 4 }, { id: 'D4.2', label: 'Gallery', score: 60, weight: 4 }, { id: 'D4.3', label: 'A+ 模块', score: 70, weight: 4 }, { id: 'D4.4', label: '视频', score: 0, weight: 3 }] },
    { id: 'D5', label: '转化诱因', score: 48, weight: 0.20, sub: [{ id: 'D5.1', label: '社会证明', score: 80, weight: 5 }, { id: 'D5.2', label: '紧迫感', score: 0, weight: 3 }, { id: 'D5.3', label: '风险消除', score: 60, weight: 5 }, { id: 'D5.4', label: '对比表', score: 30, weight: 4 }, { id: 'D5.5', label: 'CTA', score: 60, weight: 3 }] },
  ],
  improvements: [
    { rank: 1, subDim: 'D2.1', location: 'bullet_1', issue: '五点首句"High Quality Phone Case"过于通用', direction: '突出独特卖点（材质/工艺/认证）', expectedLift: 8, type: 'text' },
    { rank: 2, subDim: 'D3.1', location: 'bullet_3', issue: '差评 Top 1"按键易松"在 Listing 中未提及', direction: '增加"经强化按键设计 / 5 万次按压测试"', expectedLift: 6, type: 'text' },
    { rank: 3, subDim: 'D4.1', location: 'main_image', issue: '主图无质保角标，竞品 4/5 都有', direction: 'AI 生成 3 个含质保角标的主图概念稿', expectedLift: 5, type: 'image' },
    { rank: 4, subDim: 'D5.4', location: 'a_plus_4', issue: 'A+ 缺 vs 竞品对比模块', direction: '生成对比表（认证 / 跌落次数 / 质保 / 价格）', expectedLift: 4, type: 'image' },
    { rank: 5, subDim: 'D4.2', location: 'gallery_7', issue: 'Gallery 缺尺寸对比图', direction: 'AI 生成尺寸对比图（产品 vs 手机/手）', expectedLift: 4, type: 'image' },
  ],
};

export const mockProposals = {
  text: [
    { id: 'A', angle: '材质工艺', text: 'Military-Grade Drop Protection Phone Case for iPhone 14 — Made with TPU+PC Dual Layer, MIL-STD-810G Certified, Survives 12ft Drops', rationale: '强调认证 + 跌落数据，回应"是否真的耐摔"决策因素', keywords: ['military-grade', 'drop protection', 'MIL-STD-810G'] },
    { id: 'B', angle: '场景使用', text: 'Designed for Active Lifestyle iPhone 14 Case — Anti-Slip Grip, Ridged Edges, Perfect for Hiking, Sports & Daily Adventures', rationale: '场景化，回应"什么时候用"决策因素', keywords: ['active lifestyle', 'anti-slip', 'hiking'] },
    { id: 'C', angle: '数据实证', text: 'iPhone 14 Case with 360° Protection — Tested 50,000 Times Drop Resistance, 4-Corner Reinforced Bumpers, 1-Year Warranty Included', rationale: '强调测试数据 + 质保', keywords: ['360 protection', '50000 tests', 'warranty'] },
  ],
  image: [
    { id: 'A', style: 'top-left-badge', desc: '左上角"3 YEAR WARRANTY"红色徽章 / 白底 / 产品占比 87%', compliance: { white_bg: true, product_ratio: 0.87, no_text: false, resolution: '2000×2000' }, generated: '2026-05-09' },
    { id: 'B', style: 'right-bottom-circle', desc: '右下圆形徽章"MIL-STD-810G CERTIFIED" / 白底 / 产品占比 86%', compliance: { white_bg: true, product_ratio: 0.86, no_text: false, resolution: '2000×2000' }, generated: '2026-05-09' },
    { id: 'C', style: 'dual-badge', desc: '双角标方案（左上质保 + 右下认证）/ 信息密度高 / 产品占比 85%', compliance: { white_bg: true, product_ratio: 0.85, no_text: false, resolution: '2000×2000', warning: '右下角标稍显拥挤' }, generated: '2026-05-09' },
  ],
};

export const mockKeywordRankings = [
  { keyword: 'phone case', searchVolume: 12500, organicRank: 28, organicChange: -2, adRank: 4, adPosition: 'top_of_search', sku: 'CASE-001' },
  { keyword: 'iphone 14 case', searchVolume: 8200, organicRank: 45, organicChange: 3, adRank: 2, adPosition: 'top_of_search', sku: 'CASE-001' },
  { keyword: 'durable phone case', searchVolume: 3400, organicRank: 150, organicChange: 0, adRank: 15, adPosition: 'rest_of_search', sku: 'CASE-001' },
  { keyword: 'usb c cable 100w', searchVolume: 5800, organicRank: 12, organicChange: 1, adRank: 3, adPosition: 'top_of_search', sku: 'CABLE-002' },
];

export function findSku(id) {
  return mockSkus.find((s) => s.id === id || s.sku === id || s.asin === id) || mockSkus[0];
}

export function urgencyTagType(u) {
  return { critical: 'danger', high: 'warning', P0: 'danger', P1: 'warning', medium: 'primary', P2: '', low: 'info' }[u] || '';
}

export function statusTagType(s) {
  return { open: 'danger', fixing: 'warning', pushed: 'success', resolved: 'success', new: 'primary' }[s] || '';
}
