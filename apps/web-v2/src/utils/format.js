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

// M1-011: an audit entry is only "published to Amazon" if it actually carries an
// Amazon receipt. UPLOAD/PUBLISH-class actions without amazon_receipt/amazonReceiptId
// are drafts that never wrote back to Amazon and must NOT render as '已发布'.
export function isUploadAction(actionType) {
  if (!actionType) return false;
  return /UPLOAD|PUBLISH/i.test(String(actionType));
}

export function hasAmazonReceipt(row) {
  if (!row) return false;
  const r = row.amazon_receipt ?? row.amazonReceiptId ?? row.amazonReceipt ?? row.payload?.amazon_receipt ?? row.payload?.amazonReceiptId;
  return r != null && String(r).trim() !== '';
}

// Returns the publish status label for an audit row. For non-UPLOAD/PUBLISH actions
// returns null (caller falls back to the normal status label).
export function publishStatusLabel(row) {
  if (!row || !isUploadAction(row.actionType)) return null;
  return hasAmazonReceipt(row) ? '已发布' : '草稿 · 未写回 Amazon';
}

// W2: single normalized card schema consumed by DecisionCard.
// Accepts the three real shapes that flow into the workbench inbox:
//   (a) dashboard MOCK card  -> { type, priority, title, payload:{ id, severity, evidence, recommendation, expectedImpact, ... } }
//   (b) dashboard DB card    -> { id, title, module, risk:{ severity }, status, href, auditRequired } (no payload)
//   (c) ads-suggestions audit-> { id, actionType, risk:{ severity, requiresApproval }, target, payload, expectedImpact }
// Output is ONE flat schema so DecisionCard never receives undefined and never
// emits a Vue prop warning regardless of source codepath.
export function normalizeCard(raw) {
  const card = raw || {};
  // dashboard mock cards nest the rich fields under payload; DB/audit cards are flat.
  const p = card.payload && typeof card.payload === 'object' ? card.payload : {};
  const risk = card.risk || p.risk || {};

  const id = p.id || card.id || card.campaignId || card.title || null;
  const severity = card.severity || p.severity || risk.severity || card.priority || p.priority || null;
  const title =
    card.title || p.title || actionLabel(card.actionType || p.actionType) || card.type || p.type || '决策';
  const actionType = card.actionType || p.actionType || card.type || p.type || null;
  const evidence = Array.isArray(p.evidence)
    ? p.evidence
    : Array.isArray(card.evidence)
      ? card.evidence
      : [];
  const recommendation =
    p.recommendation || card.recommendation || p.recommendedAction || card.recommendedAction || p.reason || card.reason || '';
  const expectedImpact = p.expectedImpact || card.expectedImpact || p.estimatedMonthlyImpact || card.estimatedMonthlyImpact || null;
  const auditRequired =
    card.auditRequired ?? p.auditRequired ?? risk.requiresApproval ?? null;

  return {
    id,
    type: card.type || p.type || null,
    priority: card.priority || p.priority || null,
    title,
    subtitle: card.subtitle || p.subtitle || '',
    severity,
    actionType,
    sku: card.sku || p.sku || card.target?.sku || null,
    asin: card.asin || p.asin || card.target?.asin || null,
    campaignId: card.campaignId || p.campaignId || card.target?.id || null,
    keyword: card.keyword || p.keyword || '',
    lifecycleStage: card.lifecycleStage || p.lifecycleStage || '',
    evidence,
    recommendation,
    expectedImpact,
    confidence: card.confidence ?? p.confidence ?? null,
    auditRequired,
    href: card.href || p.href || null,
    sourceMode: card.sourceMode || p.sourceMode || 'mock',
  };
}
