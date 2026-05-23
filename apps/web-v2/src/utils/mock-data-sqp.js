// SQP (Search Query Performance) · Brand Analytics 数据
// 完整漏斗份额 + 机会词 + 类目基准 + 趋势

// 类目基准（整个类目 funnel 平均）
export const categoryBaseline = {
  ctr: 0.048, // 4.8% 点击/曝光
  cartAddRate: 0.139, // 14% 加购/点击
  purchaseRate: 0.661, // 66% 购买/加购
};

// 单个 (query, ASIN) SQP 行
function makeQuery(opts) {
  const totalImps = opts.totalSearchVolume * 48; // 估算总曝光
  const yourImpShare = opts.yourImpShare;
  const yourImps = Math.round(totalImps * yourImpShare);

  // 类目漏斗 (聚合)
  const totalClicks = Math.round(totalImps * categoryBaseline.ctr);
  const totalCartAdds = Math.round(totalClicks * categoryBaseline.cartAddRate);
  const totalPurchases = Math.round(totalCartAdds * categoryBaseline.purchaseRate);

  // 你的漏斗（CTR/CVR/close 加扰动）
  const yourCtr = categoryBaseline.ctr * (opts.ctrPerf || 1.0);
  const yourCartRate = categoryBaseline.cartAddRate * (opts.cartPerf || 1.0);
  const yourCloseRate = categoryBaseline.purchaseRate * (opts.closePerf || 1.0);
  const yourClicks = Math.round(yourImps * yourCtr);
  const yourCartAdds = Math.round(yourClicks * yourCartRate);
  const yourPurchases = Math.round(yourCartAdds * yourCloseRate);

  // 份额（你 / 总）
  const shareImp = yourImps / totalImps;
  const shareClick = totalClicks > 0 ? yourClicks / totalClicks : 0;
  const shareCart = totalCartAdds > 0 ? yourCartAdds / totalCartAdds : 0;
  const sharePurchase = totalPurchases > 0 ? yourPurchases / totalPurchases : 0;

  // 漏斗诊断
  let bottleneck = 'none', severity = 'low';
  if (shareImp < 0.05 && opts.totalSearchVolume > 10000) {
    bottleneck = 'impression';
    severity = shareImp < 0.02 ? 'high' : 'medium';
  } else if (yourCtr < categoryBaseline.ctr * 0.7) {
    bottleneck = 'click';
    severity = yourCtr < categoryBaseline.ctr * 0.5 ? 'high' : 'medium';
  } else if (yourCartRate < categoryBaseline.cartAddRate * 0.7) {
    bottleneck = 'cart';
    severity = 'medium';
  } else if (yourCloseRate < categoryBaseline.purchaseRate * 0.85) {
    bottleneck = 'purchase';
    severity = yourCloseRate < categoryBaseline.purchaseRate * 0.7 ? 'medium' : 'low';
  }

  // 4 周趋势
  const trend4w = Array.from({ length: 4 }, (_, i) => ({
    week: 18 + i,
    impShare: Math.max(0, shareImp + (Math.random() - 0.5) * 0.02),
    purchaseShare: Math.max(0, sharePurchase + (Math.random() - 0.5) * 0.015),
  }));

  // 趋势方向
  const lastTwo = trend4w.slice(-2);
  const delta = lastTwo[1].impShare - lastTwo[0].impShare;
  const trend = Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? 'up' : 'down';

  return {
    id: `sqp-${opts.id}`,
    query: opts.query,
    sku: opts.sku || 'CASE-001',
    asin: opts.asin || 'B0BQLJBLACK',
    weekStart: '2026-05-12',
    totalSearchVolume: opts.totalSearchVolume,
    searchVolumeIndex: opts.searchVolumeIndex || Math.min(100, Math.round(opts.totalSearchVolume / 400)),
    total: { impressions: totalImps, clicks: totalClicks, cartAdds: totalCartAdds, purchases: totalPurchases },
    yours: { impressions: yourImps, clicks: yourClicks, cartAdds: yourCartAdds, purchases: yourPurchases, ctr: yourCtr, cartRate: yourCartRate, closeRate: yourCloseRate },
    shares: { impression: shareImp, click: shareClick, cart: shareCart, purchase: sharePurchase },
    diagnosis: { bottleneck, severity },
    invested: opts.invested !== false, // 是否已投放该词广告
    trend4w,
    trend,
  };
}

// 30+ queries（覆盖 phone case / lamp / cable 几个 SKU）
export const sqpRows = [
  makeQuery({ id: '001', query: 'phone case', totalSearchVolume: 38200, yourImpShare: 0.123, ctrPerf: 0.95, invested: true }),
  makeQuery({ id: '002', query: 'iphone case', totalSearchVolume: 25400, yourImpShare: 0.082, ctrPerf: 0.92, invested: true }),
  makeQuery({ id: '003', query: 'shockproof phone case', totalSearchVolume: 8200, yourImpShare: 0.085, ctrPerf: 0.62, cartPerf: 0.55, invested: true }),
  makeQuery({ id: '004', query: 'iphone 14 case', totalSearchVolume: 18200, yourImpShare: 0.025, invested: false }),
  makeQuery({ id: '005', query: 'iphone 14 pro case', totalSearchVolume: 12800, yourImpShare: 0.018, invested: false }),
  makeQuery({ id: '006', query: 'magsafe iphone case', totalSearchVolume: 22600, yourImpShare: 0.008, invested: false }),
  makeQuery({ id: '007', query: 'magsafe case', totalSearchVolume: 14200, yourImpShare: 0.015, invested: false }),
  makeQuery({ id: '008', query: 'wireless phone case', totalSearchVolume: 38000, yourImpShare: 0.012, invested: false }),
  makeQuery({ id: '009', query: 'thin phone case', totalSearchVolume: 18000, yourImpShare: 0.025, invested: false }),
  makeQuery({ id: '010', query: 'leather phone case', totalSearchVolume: 8400, yourImpShare: 0.018, invested: false }),
  makeQuery({ id: '011', query: 'rugged phone case', totalSearchVolume: 6200, yourImpShare: 0.05, invested: true }),
  makeQuery({ id: '012', query: 'phone case clear', totalSearchVolume: 14200, yourImpShare: 0.062, invested: true }),
  makeQuery({ id: '013', query: 'phone case kids', totalSearchVolume: 4800, yourImpShare: 0.022, invested: false }),
  makeQuery({ id: '014', query: 'best phone case', totalSearchVolume: 18800, yourImpShare: 0.038, ctrPerf: 0.85, invested: true }),
  makeQuery({ id: '015', query: 'phone case for iphone 15', totalSearchVolume: 12200, yourImpShare: 0.001, invested: false }),
  makeQuery({ id: '016', query: 'protective phone case', totalSearchVolume: 9200, yourImpShare: 0.058, invested: true }),
  makeQuery({ id: '017', query: 'silicone phone case', totalSearchVolume: 7400, yourImpShare: 0.022, invested: false }),
  makeQuery({ id: '018', query: 'phone case glitter', totalSearchVolume: 3800, yourImpShare: 0.005, invested: false }),
  makeQuery({ id: '019', query: 'durable phone case', totalSearchVolume: 5200, yourImpShare: 0.068, cartPerf: 0.65, invested: true }),
  makeQuery({ id: '020', query: 'phone case with stand', totalSearchVolume: 6800, yourImpShare: 0.018, invested: false }),
  // 一些查询是 cable / lamp
  makeQuery({ id: '021', query: 'usb c cable', totalSearchVolume: 42000, yourImpShare: 0.092, sku: 'CABLE-002', asin: 'B0CABLE002', invested: true }),
  makeQuery({ id: '022', query: 'fast charging cable', totalSearchVolume: 28000, yourImpShare: 0.058, sku: 'CABLE-002', asin: 'B0CABLE002', closePerf: 0.78, invested: true }),
  makeQuery({ id: '023', query: 'lightning cable 10ft', totalSearchVolume: 8200, yourImpShare: 0.015, sku: 'CABLE-002', asin: 'B0CABLE002', invested: false }),
  makeQuery({ id: '024', query: 'braided usb cable', totalSearchVolume: 6400, yourImpShare: 0.085, sku: 'CABLE-002', asin: 'B0CABLE002', invested: true }),
  makeQuery({ id: '025', query: 'desk lamp', totalSearchVolume: 18000, yourImpShare: 0.045, sku: 'LAMP-003', asin: 'B0LAMP003', ctrPerf: 0.75, invested: true }),
  makeQuery({ id: '026', query: 'led desk lamp', totalSearchVolume: 12000, yourImpShare: 0.025, sku: 'LAMP-003', asin: 'B0LAMP003', cartPerf: 0.58, invested: true }),
  makeQuery({ id: '027', query: 'reading lamp', totalSearchVolume: 7200, yourImpShare: 0.018, sku: 'LAMP-003', asin: 'B0LAMP003', invested: false }),
  makeQuery({ id: '028', query: 'office lamp', totalSearchVolume: 4800, yourImpShare: 0.012, sku: 'LAMP-003', asin: 'B0LAMP003', invested: false }),
];

// ===== 漏斗汇总（所有 query 加权） =====
export function funnelSummary(rows = sqpRows) {
  const sumTotal = rows.reduce((acc, r) => ({
    impressions: acc.impressions + r.total.impressions,
    clicks: acc.clicks + r.total.clicks,
    cartAdds: acc.cartAdds + r.total.cartAdds,
    purchases: acc.purchases + r.total.purchases,
  }), { impressions: 0, clicks: 0, cartAdds: 0, purchases: 0 });

  const sumYours = rows.reduce((acc, r) => ({
    impressions: acc.impressions + r.yours.impressions,
    clicks: acc.clicks + r.yours.clicks,
    cartAdds: acc.cartAdds + r.yours.cartAdds,
    purchases: acc.purchases + r.yours.purchases,
  }), { impressions: 0, clicks: 0, cartAdds: 0, purchases: 0 });

  return {
    total: sumTotal,
    yours: sumYours,
    shares: {
      impression: sumYours.impressions / sumTotal.impressions,
      click: sumYours.clicks / sumTotal.clicks,
      cart: sumYours.cartAdds / sumTotal.cartAdds,
      purchase: sumYours.purchases / sumTotal.purchases,
    },
    // 类目漏斗的 rate
    categoryRates: {
      ctr: sumTotal.clicks / sumTotal.impressions,
      cartRate: sumTotal.cartAdds / sumTotal.clicks,
      closeRate: sumTotal.purchases / sumTotal.cartAdds,
    },
    yourRates: {
      ctr: sumYours.clicks / Math.max(sumYours.impressions, 1),
      cartRate: sumYours.cartAdds / Math.max(sumYours.clicks, 1),
      closeRate: sumYours.purchases / Math.max(sumYours.cartAdds, 1),
    },
  };
}

// ===== 机会发现：高搜索量 + 你曝光份额 <5% =====
export function opportunities(rows = sqpRows) {
  return rows
    .filter((r) => !r.invested && r.totalSearchVolume >= 8000 && r.shares.impression < 0.05)
    .sort((a, b) => b.totalSearchVolume - a.totalSearchVolume);
}

// ===== 漏斗诊断分组 =====
export function diagnosisGroups(rows = sqpRows) {
  return {
    impression: rows.filter((r) => r.diagnosis.bottleneck === 'impression'),
    click: rows.filter((r) => r.diagnosis.bottleneck === 'click'),
    cart: rows.filter((r) => r.diagnosis.bottleneck === 'cart'),
    purchase: rows.filter((r) => r.diagnosis.bottleneck === 'purchase'),
    healthy: rows.filter((r) => r.diagnosis.bottleneck === 'none'),
  };
}
