const WRITE_ACTION_ALLOWLIST = new Set([
  // M2 利润 / 库存
  'LOWER_BID_OR_PAUSE',
  'INCREASE_BUDGET',
  'ADD_NEGATIVE_KEYWORD',
  'REDUCE_BUDGET_STOCKOUT_RISK',
  'CREATE_PURCHASE_ORDER_DRAFT',
  'PO_STATE_TRANSITION',
  'INVENTORY_TRANSFER',
  'REPRICE_UP',
  'REPRICE_DOWN',
  'START_PROMOTION',
  'CREATE_REMOVAL_ORDER',
  'CREATE_DISPOSAL_ORDER',
  // M1 商品
  'APPLY_LISTING_TO_AMAZON',
  'LISTING_ROLLBACK',
  'MULTILOCALE_SYNC',
  'MULTILOCALE_PUBLISH',
  'ADOPT_AB_WINNER',
  // M3 广告
  'PROMOTE_TO_MANUAL',
  'STRUCTURE_HEALTH_IMPROVE',
  'ENABLE_DAYPARTING',
  'ADJUST_PLACEMENTS',
  'ENABLE_BRAND_DEFENSE_LAYER',
  'BRAND_COUNTER_ATTACK',
  'LAUNCH_COMPETITOR_ATTACK',
  'ADOPT_CREATIVE_WINNER',
  'APPLY_PLAYBOOK_STRATEGY',
  'CONFIGURE_PROMO_SYNC',
  'LIFECYCLE_OVERRIDE',
  'CAMPAIGN_ACTION',
  'PAUSE_CAMPAIGN',
  'VIEW_HEALTH',
  'PUSH_M1_IMPROVEMENT',
  // M4 监控 / Review
  'DRAFT_REVIEW_APPEAL',
  'DRAFT_RECOVERY_EMAIL',
  'SUBMIT_APPEAL',
  'SEND_RECOVERY_EMAIL',
  'DRAFT_IP_COMPLAINT',
  'GENERATE_POSTMORTEM',
  'GENERIC_DECISION',
]);

export function createAuditAction({ sourceModule, actionType, target, payload = {}, expectedImpact = {}, requestedBy = 'system', sovereignty = 'manual' }) {
  const risk = evaluateActionRisk({ actionType, payload, expectedImpact, sovereignty });
  return {
    id: `${sourceModule}:${actionType}:${target?.id || target?.sku || Date.now()}`,
    sourceModule,
    actionType,
    target,
    payload,
    expectedImpact,
    requestedBy,
    sovereignty,
    risk,
    status: risk.allowed && risk.requiresApproval === false ? 'approved_for_mock_execution' : 'pending_approval',
    createdAt: new Date().toISOString(),
  };
}

export function evaluateActionRisk({ actionType, payload = {}, expectedImpact = {}, sovereignty = 'manual' }) {
  const reasons = [];
  if (!WRITE_ACTION_ALLOWLIST.has(actionType)) {
    reasons.push('Action type is not in the MVP write allowlist.');
  }

  const amount = Math.abs(Number(payload.amount ?? payload.budgetDelta ?? expectedImpact.change ?? 0));
  if (amount > 500) {
    reasons.push('Action exceeds the MVP automatic amount limit of 500.');
  }

  if (payload.requiresRealStoreWrite) {
    reasons.push('Real store write is disabled until credentials and explicit approval are provided.');
  }

  const allowed = reasons.length === 0;
  const requiresApproval = sovereignty !== 'auto' || !allowed;
  return {
    allowed,
    requiresApproval,
    severity: allowed ? (requiresApproval ? 'medium' : 'low') : 'high',
    reasons,
    canRollback: !payload.nonRollbackable,
    executionMode: payload.requiresRealStoreWrite ? 'blocked_real_store' : 'mock',
  };
}

export function mockExecuteAuditAction(action) {
  if (!action.risk.allowed) {
    return { ...action, status: 'blocked', executedAt: null, result: { ok: false, reasons: action.risk.reasons } };
  }
  return {
    ...action,
    status: 'mock_executed',
    executedAt: new Date().toISOString(),
    result: {
      ok: true,
      mode: 'mock',
      message: 'Action was recorded as mock-executed. No external account was touched.',
    },
  };
}
