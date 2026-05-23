// Deterministic mock data for ad-drawer tabs. PRNG seeded by entity id so
// each row consistently shows the same numbers across opens / re-renders.

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < (s || '').length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rand(seed, salt = '') {
  return mulberry32(hashStr((seed || '') + ':' + salt));
}
const R2 = (n) => Math.round(n * 100) / 100;

export function generateMockDailyRows(entity, dateRange, salt = '') {
  const r = rand(entity.id || entity.term || 'x', 'daily:' + salt);
  const days = dateRange ? Math.max(1, Math.min(31, Math.round(
    (new Date(dateRange[1]) - new Date(dateRange[0])) / 864e5 + 1
  ))) : 7;
  const out = [];
  const baseDate = dateRange ? new Date(dateRange[1]) : new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(baseDate.getTime() - i * 864e5);
    const impressions = Math.round(500 + r() * 5000);
    const clicks = Math.round(impressions * (0.005 + r() * 0.03));
    const cpc = R2(0.3 + r() * 1.2);
    const spend = R2(clicks * cpc);
    const orders = Math.round(clicks * (r() * 0.15));
    const sales = R2(orders * (15 + r() * 60));
    out.push({
      date: d.toISOString().slice(0, 10),
      impressions, clicks, spend, sales, orders,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc, acos: sales > 0 ? spend / sales : 0,
      cvr: clicks > 0 ? orders / clicks : 0,
    });
  }
  return out;
}

export function generateMockHourlyRows(entity) {
  const r = rand(entity.id || 'x', 'hourly');
  const out = [];
  for (let h = 0; h < 24; h++) {
    // Realistic shape: low at night, peak 10-22
    const dayFactor = h >= 9 && h <= 22 ? 0.4 + 0.6 * Math.sin(((h - 9) / 14) * Math.PI) : 0.08;
    const impressions = Math.round((200 + r() * 800) * dayFactor);
    const clicks = Math.round(impressions * (0.01 + r() * 0.02));
    const cpc = R2(0.4 + r() * 1);
    const spend = R2(clicks * cpc);
    const orders = Math.round(clicks * (r() * 0.18));
    const sales = R2(orders * (20 + r() * 60));
    out.push({
      hour: h,
      impressions, clicks, spend, sales, orders,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc,
      acos: sales > 0 ? spend / sales : 0,
    });
  }
  return out;
}

export function generateMockPlacementRows(entity) {
  const r = rand(entity.id || 'x', 'placement');
  const placements = [
    { placement: '搜索结果首页（top）', share: 0.5, mod: '+25%' },
    { placement: '商品详情页（product）', share: 0.3, mod: '+10%' },
    { placement: '其余结果（rest）', share: 0.2, mod: '0%' },
  ];
  return placements.map((p) => {
    const impressions = Math.round((2000 + r() * 4000) * p.share);
    const clicks = Math.round(impressions * (0.008 + r() * 0.025));
    const cpc = R2(0.5 + r() * 1.5);
    const spend = R2(clicks * cpc);
    const orders = Math.round(clicks * (r() * 0.15));
    const sales = R2(orders * (20 + r() * 60));
    return { placement: p.placement, impressions, clicks, spend, orders, sales, bidModifier: p.mod };
  });
}

export function generateMockSearchTerms(entity) {
  const r = rand(entity.id || 'x', 'ust');
  const base = entity.term || entity.asin || 'product';
  const variations = entity.term
    ? [entity.term, entity.term + ' best', 'cheap ' + entity.term, entity.term + ' 2026', 'ninja ' + entity.term]
    : ['related ' + base, 'best ' + base, 'cheap ' + base];
  return variations.map((s) => {
    const impressions = Math.round(50 + r() * 800);
    const clicks = Math.round(impressions * (0.01 + r() * 0.04));
    const cpc = R2(0.4 + r() * 1.2);
    const spend = R2(clicks * cpc);
    const orders = Math.round(clicks * (r() * 0.2));
    const sales = R2(orders * (20 + r() * 80));
    return {
      searchTerm: s, impressions, clicks, spend, orders, sales,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc,
      acos: sales > 0 ? spend / sales : 0,
    };
  });
}

export function generateMockHistory(entity) {
  const r = rand(entity.id || 'x', 'history');
  const types = ['bid_update', 'budget_update', 'state_toggle', 'create', 'rule_apply'];
  const out = [];
  const n = Math.floor(2 + r() * 6);
  for (let i = 0; i < n; i++) {
    const t = types[Math.floor(r() * types.length)];
    const ts = new Date(Date.now() - Math.floor(r() * 30) * 864e5).toISOString();
    let before = '', after = '';
    if (t === 'bid_update')        { before = '$' + R2(0.5 + r()).toFixed(2); after = '$' + R2(0.5 + r()).toFixed(2); }
    else if (t === 'budget_update'){ before = '$' + Math.round(10 + r() * 100); after = '$' + Math.round(10 + r() * 100); }
    else if (t === 'state_toggle') { before = '启用'; after = '暂停'; }
    else if (t === 'create')       { before = '—'; after = '已创建'; }
    else                          { before = '未应用'; after = '已应用'; }
    out.push({
      ts, operator: r() > 0.4 ? '赵磊' : '自动规则',
      actionType: t, before, after,
      status: r() > 0.05 ? 'ok' : 'failed',
      source: r() > 0.5 ? '手动' : '自动规则',
      reverted: r() < 0.1,
    });
  }
  out.sort((a, b) => b.ts.localeCompare(a.ts));
  return out;
}

export function generateMockOverBudget(entity) {
  const r = rand(entity.id || 'x', 'overbudget');
  const overruns = Math.floor(r() * 5);
  const rows = [];
  for (let i = 0; i < overruns; i++) {
    const day = new Date(Date.now() - (i + 1) * 2 * 864e5).toISOString().slice(0, 10);
    const budget = 30 + Math.round(r() * 70);
    const actualSpend = budget * (1 + r() * 0.3);
    const missedImpressions = Math.round((500 + r() * 2000));
    rows.push({
      day, hourOverrun: '14:00 - 18:00',
      budget, actualSpend: R2(actualSpend), missedImpressions,
      cause: '订单转化峰值时段',
    });
  }
  const totalMissed = rows.reduce((a, r) => a + r.missedImpressions, 0);
  return { rows, overruns, missedImpressions: totalMissed };
}

export function generateMockAttribution(entity) {
  const r = rand(entity.id || 'x', 'attr');
  const windows = [{ k: '1d', label: '1 天' }, { k: '7d', label: '7 天' }, { k: '14d', label: '14 天' }];
  const baseSpend = 100 + r() * 200;
  return windows.map((w, i) => {
    const factor = i === 0 ? 1 : i === 1 ? 1.3 + r() * 0.4 : 1.5 + r() * 0.5;
    const orders = Math.round((5 + r() * 12) * factor);
    const sales = R2(orders * (25 + r() * 50));
    return {
      windowLabel: w.label,
      orders, sales,
      acos: sales > 0 ? baseSpend / sales : 0,
      roas: baseSpend > 0 ? sales / baseSpend : 0,
      cvr: 0.05 + r() * 0.08,
    };
  });
}

export function generateMockTimeSeries(entity, days = 30) {
  const r = rand(entity.id || 'x', 'ts:' + days);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const spend = R2(20 + r() * 80);
    const sales = R2(spend * (3 + r() * 4));
    out.push({
      date: new Date(Date.now() - i * 864e5).toISOString().slice(0, 10),
      spend, sales,
      acos: sales > 0 ? spend / sales : 0,
    });
  }
  return out;
}

export function generateMockKeyKeywords(entity) {
  const r = rand(entity.id || 'x', 'keykw');
  const kws = ['slushie machine', 'ninja slushie', 'margarita machine', 'frozen drink maker', 'ice cream machine'];
  return kws.map((term) => {
    const impressions = Math.round(500 + r() * 5000);
    const clicks = Math.round(impressions * (0.01 + r() * 0.04));
    const cpc = R2(0.5 + r() * 1.2);
    const spend = R2(clicks * cpc);
    const orders = Math.round(clicks * (r() * 0.2));
    const sales = R2(orders * (25 + r() * 60));
    return {
      term, matchType: ['精准', '广泛', '词组'][Math.floor(r() * 3)],
      rank: R2(2 + r() * 30),
      impressions, clicks, spend, sales,
      ctr: impressions > 0 ? clicks / impressions : 0,
      acos: sales > 0 ? spend / sales : 0,
    };
  });
}
