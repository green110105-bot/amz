// Maps entity type → ordered list of tab keys to show in AdAnalysisDrawer.
// Mirrors 领星's MCompare drawer tab sets we captured in
// docs/LINGXING_ADS_RECON_v3.md §2.

export const ALL_TAB_KEYS = [
  'daily',          // 天数据
  'compare',        // 对比分析
  'hourly',         // 小时数据
  'overBudget',    // 超预算分析（campaign only）
  'attribution',    // 归因期分析（campaign only）
  'placement',      // 广告位
  'timeSeries',     // 时间序列（campaign only）
  'keyKeywords',    // 重点关键词（campaign only）
  'userSearchTerms',// 用户搜索词（keyword only; target uses a 4-tab Lingxing drawer）
  'history',        // 溯源（日志）
];

export const TAB_META = {
  daily:           { label: '天数据',       desc: '日维度聚合 + 总计' },
  compare:         { label: '对比分析',     desc: '双时段并列对比' },
  hourly:          { label: '小时数据',     desc: '24h 折线 + 明细' },
  overBudget:      { label: '超预算分析',   desc: '超预算时段 + 跑超活动' },
  attribution:     { label: '归因期分析',   desc: '1d / 7d / 14d 归因窗口' },
  placement:       { label: '广告位',       desc: 'Top / Product / Rest 拆分' },
  timeSeries:      { label: '时间序列',     desc: '长时段曲线（30/90/180 天）' },
  keyKeywords:     { label: '重点关键词',   desc: '跟踪自定义 KW 集' },
  userSearchTerms: { label: '用户搜索词',   desc: '实际用户查询' },
  history:         { label: '溯源（日志）', desc: '操作历史' },
};

export const ENTITY_TYPE_LABEL = {
  campaign:  '广告活动',
  adgroup:   '广告组',
  ad:        '广告',
  keyword:   '关键词',
  target:    '商品定向',
  placement: '广告位',
  portfolio: 'Portfolio',
};

// Per-entity tab matrix. The target drawer follows the verified all_target
// Lingxing contract: daily / compare / hourly / placement only.
export const TABS_BY_ENTITY = {
  campaign:  ['daily', 'compare', 'hourly', 'overBudget', 'attribution', 'placement', 'timeSeries', 'keyKeywords', 'history'],
  keyword:   ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms'],
  target:    ['daily', 'compare', 'hourly', 'placement'],
  adgroup:   ['daily', 'compare', 'hourly'],
  ad:        ['daily', 'compare', 'hourly'],
  placement: ['daily', 'compare', 'hourly'],
  portfolio: ['daily', 'compare'],
};

export function tabsForEntity(entityType) {
  return TABS_BY_ENTITY[entityType] || ['daily'];
}

export function isCampaignOnlyTab(tabKey) {
  return ['overBudget', 'attribution', 'timeSeries', 'keyKeywords'].includes(tabKey);
}
