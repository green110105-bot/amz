export const routeRegistry = [
  {
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    tags: ['System'],
    summary: 'Service health check',
  },
  {
    method: 'get',
    path: '/ready',
    operationId: 'getReadiness',
    tags: ['System'],
    summary: 'Service readiness check including mock/write-safety gates',
  },
  {
    method: 'get',
    path: '/api/v1/dashboard',
    operationId: 'getDashboard',
    tags: ['Dashboard'],
    summary: 'Get global decision dashboard cards',
  },
  {
    method: 'get',
    path: '/api/v1/profit/overview',
    operationId: 'getProfitOverview',
    tags: ['M2 Profit'],
    summary: 'Get profit overview and order profit records',
  },
  {
    method: 'post',
    path: '/api/v1/profit/recompute',
    operationId: 'recomputeProfit',
    tags: ['M2 Profit'],
    summary: 'Queue mock profit recomputation',
  },
  {
    method: 'get',
    path: '/api/v1/inventory/decisions',
    operationId: 'getInventoryDecisions',
    tags: ['M2 Inventory'],
    summary: 'Get reorder, stale inventory, and repricing decisions',
  },
  {
    method: 'get',
    path: '/api/v1/ads/suggestions',
    operationId: 'getAdSuggestions',
    tags: ['M3 Ads'],
    summary: 'Get ad suggestions wrapped as audit actions',
  },
  {
    method: 'get',
    path: '/api/v1/monitor/overview',
    operationId: 'getMonitorOverview',
    tags: ['M4 Monitor'],
    summary: 'Get anomaly overview and mock notifications',
  },
  {
    method: 'get',
    path: '/api/v1/listings/{productId}/diagnosis',
    operationId: 'getListingDiagnosis',
    tags: ['M1 Listing'],
    summary: 'Get Listing score and improvement suggestions',
    parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
  },
  {
    method: 'get',
    path: '/api/v1/reviews/{productId}/clusters',
    operationId: 'getReviewClusters',
    tags: ['M4 Reviews'],
    summary: 'Get review clusters for a product',
    parameters: [{ name: 'productId', in: 'path', required: true, schema: { type: 'string' } }],
  },
  {
    method: 'get',
    path: '/api/v1/competitors/changes',
    operationId: 'getCompetitorChanges',
    tags: ['M4 Competitors'],
    summary: 'Get competitor change events',
  },
  {
    method: 'post',
    path: '/api/v1/audit/mock-execute',
    operationId: 'mockExecuteAuditAction',
    tags: ['Audit'],
    summary: 'Mock execute an audited action without external writes',
  },
  {
    method: 'post',
    path: '/api/v1/ai/decisions',
    operationId: 'createAiDecision',
    tags: ['AI Decision Engine'],
    summary: 'Create a codex-local structured decision from supplied context',
  },
];

export function toOpenApiPath(path) {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}
