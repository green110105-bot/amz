export function formatCurrency(value, currency = 'CNY', digits = 2) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return '-';
  const formatted = n.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (currency === 'USD') return `$${formatted}`;
  return `¥${formatted}`;
}

export function formatPercent(value, digits = 1) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return '-';
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatNumber(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString('zh-CN');
}

export function severityColor(severity) {
  const map = {
    P0: '#fa4441',
    P1: '#ffb020',
    P2: '#2563eb',
    high: '#fa4441',
    medium: '#ffb020',
    low: '#909399',
    critical: '#fa4441',
  };
  return map[severity] || '#909399';
}

export function severityLabel(severity) {
  const map = { P0: '紧急', P1: '重要', P2: '关注', high: '高', medium: '中', low: '低', critical: '紧急' };
  return map[severity] || severity || '-';
}

const ACTION_TYPE_LABELS = {
  LOWER_BID_OR_PAUSE: '降低出价或暂停',
  REDUCE_BUDGET_STOCKOUT_RISK: '降预算·防断货',
  ADD_NEGATIVE_KEYWORD: '添加否定关键词',
  INCREASE_BUDGET: '提升预算',
  CREATE_PURCHASE_ORDER_DRAFT: '创建采购草稿',
  DRAFT_REVIEW_APPEAL: '起草差评申诉',
  BUY_BOX_LOST: 'Buy Box 丢失',
  LISTING_CHANGED: '商品页被改',
  ACCOUNT_HEALTH_RISK: '账户健康风险',
  LOW_INVENTORY: '库存不足',
  AD_SPEND_SPIKE: '广告异常烧钱',
  PRICE_BELOW_FULL_COST: '价格低于完全成本',
  STAGNANT_INVENTORY: '滞销库存',
  AD_PROFIT_ROAS_LOW: '广告利润 ROAS 过低',
};

export function actionLabel(actionType) {
  return ACTION_TYPE_LABELS[actionType] || actionType || '-';
}
