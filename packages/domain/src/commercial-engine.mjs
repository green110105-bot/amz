export const PLAN_ENTITLEMENTS = {
  starter: { stores: 1, skus: 50, members: 1, aiQuota: 500, thirdPartyData: false, apiAccess: false },
  growth: { stores: 3, skus: 500, members: 5, aiQuota: 5000, thirdPartyData: 'keepa_basic', apiAccess: false },
  operator: { stores: 10, skus: 5000, members: 20, aiQuota: 30000, thirdPartyData: 'keepa_sellersprite', apiAccess: true },
  enterprise: { stores: Infinity, skus: Infinity, members: Infinity, aiQuota: Infinity, thirdPartyData: 'custom', apiAccess: true },
};

export const ROLE_PERMISSIONS = {
  admin: ['*'],
  operations_manager: ['dashboard:view', 'm1:*', 'm2:*', 'm3:*', 'm4:*', 'audit:view', 'team:assign'],
  operator: ['dashboard:view', 'm1:write', 'm2:view', 'm3:write', 'm4:write', 'audit:view'],
  purchasing: ['dashboard:view', 'm2:inventory', 'm2:purchase_order', 'm4:view'],
  finance: ['dashboard:view', 'm2:profit', 'm2:export', 'billing:view'],
  readonly: ['dashboard:view', 'm1:view', 'm2:view', 'm3:view', 'm4:view', 'audit:view'],
};

export function getPlanEntitlements(plan = 'growth') {
  return PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS.growth;
}

export function evaluateQuotaUsage({ plan = 'growth', stores = 0, skus = 0, members = 0, aiUsed = 0 }) {
  const entitlements = getPlanEntitlements(plan);
  const checks = [
    quotaCheck('stores', stores, entitlements.stores),
    quotaCheck('skus', skus, entitlements.skus),
    quotaCheck('members', members, entitlements.members),
    quotaCheck('aiQuota', aiUsed, entitlements.aiQuota),
  ];
  return {
    plan,
    entitlements,
    checks,
    allowed: checks.every((check) => check.allowed),
    warnings: checks.filter((check) => check.ratio >= 0.8 && check.allowed).map((check) => `${check.name} is above 80% of plan limit`),
  };
}

export function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes('*') || permissions.includes(permission) || permissions.some((item) => item.endsWith(':*') && permission.startsWith(item.slice(0, -1)));
}

export function buildOnboardingPlan({ hasSpApi = false, hasAdsApi = false, hasCostUpload = false, hasThirdParty = false, products = 0 }) {
  const steps = [
    { id: 'account', label: 'Create account and tenant', status: 'done', etaMinutes: 0 },
    { id: 'spapi', label: 'Connect Amazon SP-API', status: hasSpApi ? 'done' : 'mocked_waiting_credentials', etaMinutes: 5 },
    { id: 'ads', label: 'Connect Amazon Ads API', status: hasAdsApi ? 'done' : 'mocked_waiting_credentials', etaMinutes: 10 },
    { id: 'costs', label: 'Upload purchase and freight costs', status: hasCostUpload ? 'done' : 'optional_missing_estimated', etaMinutes: 10 },
    { id: 'third_party', label: 'Connect competitor/review data provider', status: hasThirdParty ? 'done' : 'mocked_waiting_credentials', etaMinutes: 30 },
  ];

  let readiness = 'basic_mock';
  if (hasSpApi && products > 0) readiness = 'basic_real_read';
  if (hasSpApi && hasAdsApi && hasCostUpload) readiness = 'decision_ready';
  if (hasSpApi && hasAdsApi && hasCostUpload && hasThirdParty) readiness = 'full_data_ready';

  return {
    readiness,
    steps,
    firstValueTimeline: [
      { window: '0-5m', value: 'Basic dashboard shell and mock KPI overview' },
      { window: '5-30m', value: 'Single-SKU profit/listing quick diagnosis when SP-API or fixture data exists' },
      { window: '30m-4h', value: 'Sales, ads, and inventory overview after reports land' },
      { window: '24-72h', value: 'Full competitor/review-enriched recommendations' },
    ],
  };
}

export function meterUsage(events = []) {
  const counters = { aiDecisions: 0, imageGenerations: 0, thirdPartyCalls: 0, writeActions: 0 };
  for (const event of events) {
    if (event.type === 'ai_decision') counters.aiDecisions += Number(event.units || 1);
    if (event.type === 'image_generation') counters.imageGenerations += Number(event.units || 1);
    if (event.type === 'third_party_call') counters.thirdPartyCalls += Number(event.units || 1);
    if (event.type === 'write_action') counters.writeActions += Number(event.units || 1);
  }
  return counters;
}

function quotaCheck(name, used, limit) {
  const allowed = limit === Infinity || used <= limit;
  const ratio = limit === Infinity ? 0 : Number((used / limit).toFixed(3));
  return { name, used, limit, ratio, allowed };
}
