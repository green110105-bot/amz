import test from 'node:test';
import assert from 'node:assert/strict';
import {
  M4_ANOMALY_RULES,
  applyAdaptiveThreshold,
  assessReviewAppeal,
  buildM4Runbook,
  buildM4SlaBoard,
  detectM4AdvancedAnomalies,
  dispatchM4Anomalies,
  draftRecoveryEmail,
  draftReviewAppeal,
  evaluateM4AdvancedOperations,
  generateM4PostmortemReport,
  getM4PlaybookCatalog,
  getM4RuleCatalog,
  groupRelatedAnomalies,
  routeM4Notifications,
} from '../../packages/domain/src/m4-advanced-engine.mjs';

const NOW = '2026-05-08T10:23:00.000Z';

test('M4 advanced rule catalog covers all 22 anomaly classes with runbooks', () => {
  const catalog = getM4RuleCatalog();
  const playbooks = getM4PlaybookCatalog();

  assert.equal(M4_ANOMALY_RULES.length, 22);
  assert.equal(catalog.length, 22);
  assert.deepEqual(catalog.map((item) => item.id), Array.from({ length: 22 }, (_, index) => `A${index + 1}`));
  assert.equal(playbooks.length, 22);
  assert.ok(playbooks.every((item) => item.steps.length >= 4));
  assert.ok(playbooks.every((item) => item.source.mode === 'mock' && item.source.confidence > 0));
  assert.ok(buildM4Runbook('A15').safeguards.some((item) => item.includes('never places buyer orders')));
});

test('detectM4AdvancedAnomalies triggers deterministic events for all 22 M4 classes', () => {
  const anomalies = detectM4AdvancedAnomalies(fullSignalInput());
  const types = anomalies.map((item) => item.type).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  assert.deepEqual(types, Array.from({ length: 22 }, (_, index) => `A${index + 1}`));
  assert.equal(anomalies.filter((item) => item.severity === 'P0').length, 7);
  assert.equal(anomalies.filter((item) => item.severity === 'P1').length, 10);
  assert.equal(anomalies.filter((item) => item.severity === 'P2').length, 5);
  assert.ok(anomalies.every((item) => item.recommendations.length > 0));
  assert.ok(anomalies.every((item) => item.source.mode === 'mock' && item.source.confidence > 0));

  const buyBox = anomalies.find((item) => item.type === 'A4');
  assert.equal(buyBox.slaMinutes, 5);
  assert.equal(buyBox.evidence.durationMinutes, 35);
  assert.equal(buyBox.dueAt, '2026-05-08T10:28:00.000Z');
});

test('evaluateM4AdvancedOperations groups related anomalies, dispatches SLA, and routes notifications', () => {
  const overview = evaluateM4AdvancedOperations({
    ...fullSignalInput(),
    team: [
      { id: 'u-ops', name: 'Olivia Ops', roles: ['ops'] },
      { id: 'u-legal', name: 'Liam Legal', roles: ['legal'] },
      { id: 'u-finance', name: 'Fiona Finance', roles: ['finance'] },
      { id: 'u-manager', name: 'Mia Manager', roles: ['manager'] },
      { id: 'u-founder', name: 'Fran Founder', roles: ['founder'] },
    ],
    notificationPreferences: {
      channels: { wechat: true },
    },
  });

  assert.equal(overview.ruleCoverage.complete, true);
  assert.equal(overview.summary.totalOpen, 22);
  assert.ok(overview.groups.some((group) => group.rootCause === 'Buy Box and pricing pressure'));
  assert.ok(overview.assignments.some((item) => item.type === 'A15' && item.assignees.some((assignee) => assignee.role === 'legal')));
  assert.equal(overview.slaBoard.bySeverity.P0, 7);
  assert.ok(overview.notifications.some((item) => item.severity === 'P0' && item.dispatchMode === 'immediate'));
  assert.ok(overview.notifications.some((item) => item.severity === 'P1' && item.dispatchMode === 'aggregate_15m'));
  assert.ok(overview.notifications.some((item) => item.severity === 'P2' && item.dispatchMode === 'daily_digest'));
});

test('routeM4Notifications applies P0/P1/P2 routing plus dedupe and throttle rules', () => {
  const routed = routeM4Notifications({
    now: NOW,
    preferences: {
      channels: { wechat: true },
      severityRoutes: { P0: ['in_app', 'email', 'wechat'], P1: ['in_app', 'email'], P2: ['in_app', 'email'] },
    },
    anomalies: [
      anomaly('a-p0', 'A4', 'P0', 'SKU-N1'),
      anomaly('a-p1', 'A8', 'P1', 'SKU-N2'),
      anomaly('a-p2', 'A22', 'P2', null),
    ],
  });

  const p0 = routed.notifications.find((item) => item.anomalyId === 'a-p0');
  const p1 = routed.notifications.find((item) => item.anomalyId === 'a-p1');
  const p2 = routed.notifications.find((item) => item.anomalyId === 'a-p2');

  assert.equal(p0.dispatchMode, 'immediate');
  assert.deepEqual(p0.channels, ['in_app', 'email', 'wechat']);
  assert.equal(p0.sendAt, NOW);
  assert.equal(p1.dispatchMode, 'aggregate_15m');
  assert.equal(p1.sendAt, '2026-05-08T10:30:00.000Z');
  assert.equal(p2.dispatchMode, 'daily_digest');
  assert.equal(p2.sendAt, '2026-05-09T08:00:00.000Z');

  const suppressed = routeM4Notifications({
    now: NOW,
    anomalies: [anomaly('a-dedupe', 'A4', 'P0', 'SKU-N3'), anomaly('a-throttle', 'A8', 'P1', 'SKU-N4')],
    history: [
      { anomalyId: 'a-dedupe', type: 'A4', sku: 'SKU-N3', sentAt: '2026-05-08T09:00:00.000Z' },
      { anomalyId: 'old-1', type: 'A8', sku: 'SKU-N4', sentAt: '2026-05-08T10:00:00.000Z' },
      { anomalyId: 'old-2', type: 'A8', sku: 'SKU-N4', sentAt: '2026-05-08T10:05:00.000Z' },
      { anomalyId: 'old-3', type: 'A8', sku: 'SKU-N4', sentAt: '2026-05-08T10:10:00.000Z' },
    ],
  });

  assert.ok(suppressed.suppressed.some((item) => item.anomalyId === 'a-dedupe' && item.reason === 'dedup_24h'));
  assert.ok(suppressed.suppressed.some((item) => item.anomalyId === 'a-throttle' && item.reason === 'throttle_1h_3_per_sku_type'));
});

test('dispatchM4Anomalies assigns owners and computes SLA board status', () => {
  const assignments = dispatchM4Anomalies({
    now: '2026-05-08T10:26:00.000Z',
    anomalies: [anomaly('a-hijacker', 'A15', 'P0', 'SKU-SLA', '2026-05-08T10:23:00.000Z')],
    team: [
      { id: 'u-ops', name: 'Olivia Ops', roles: ['ops'] },
      { id: 'u-legal', name: 'Liam Legal', roles: ['legal'] },
      { id: 'u-manager', name: 'Mia Manager', roles: ['manager'] },
      { id: 'u-founder', name: 'Fran Founder', roles: ['founder'] },
    ],
  });

  assert.equal(assignments[0].mode, 'team_assignment');
  assert.deepEqual(assignments[0].requiredRoles, ['ops', 'legal']);
  assert.ok(assignments[0].assignees.some((assignee) => assignee.role === 'ops'));
  assert.ok(assignments[0].assignees.some((assignee) => assignee.role === 'legal'));
  assert.equal(assignments[0].dueAt, '2026-05-08T10:28:00.000Z');
  assert.equal(assignments[0].status, 'due_soon');
  assert.deepEqual(assignments[0].escalations.map((item) => item.notifyRole), ['manager', 'founder']);

  const board = buildM4SlaBoard(assignments, '2026-05-08T10:26:00.000Z');
  assert.equal(board.totalOpen, 1);
  assert.equal(board.byStatus.due_soon, 1);
  assert.equal(board.nextDue[0].minutesRemaining, 2);
});

test('appeal and recovery drafts are policy-gated deterministic drafts only', () => {
  const review = {
    id: 'rv-1',
    asin: 'B0TEST',
    rating: 1,
    reviewerName: 'Buyer A',
    postedAt: '2026-05-08',
    title: 'Late delivery',
    body: 'Shipping late and the driver left the box at the wrong door.',
    verifiedPurchase: true,
    orderId: '111-222',
  };

  const assessment = assessReviewAppeal(review);
  const appeal = draftReviewAppeal({ review, product: { asin: 'B0TEST' }, seller: { name: 'Demo Seller' } });
  const recovery = draftRecoveryEmail({
    now: NOW,
    review,
    customer: { id: 'c-1', firstName: 'Ava' },
    product: { name: 'Phone Case Pro' },
    seller: { name: 'Demo Seller', brandName: 'Demo Brand' },
  });
  const duplicateRecovery = draftRecoveryEmail({
    now: NOW,
    review,
    customer: { id: 'c-1', firstName: 'Ava' },
    previousDrafts: [{ reviewId: 'rv-1', customerId: 'c-1', createdAt: '2026-05-08T09:00:00.000Z' }],
  });

  assert.equal(assessment.eligible, true);
  assert.equal(assessment.violationType, 'fulfillment_not_product');
  assert.equal(appeal.draft.submitMode, 'manual_review_only');
  assert.ok(appeal.draft.body.includes('request a review'));
  assert.equal(recovery.eligible, true);
  assert.equal(recovery.draft.sendMode, 'manual_review_only');
  assert.ok(recovery.draft.body.includes('We are not asking for a positive review'));
  assert.equal(duplicateRecovery.eligible, false);
  assert.equal(duplicateRecovery.reason, 'recovery_email_24h_dedupe');
});

test('postmortem reports and case archive summarize major events', () => {
  const anomalies = [
    anomaly('a-buybox', 'A4', 'P0', 'SKU-PM', '2026-05-08T10:23:00.000Z', {
      evidence: { estimatedLossPerHour: 3200, currency: 'CNY' },
      aiAnalysis: { summary: 'Buy Box lost for SKU-PM.', rootCauses: [{ cause: 'Competitor price drop.', weight: 0.7 }] },
    }),
    anomaly('a-price', 'A12', 'P0', 'SKU-PM', '2026-05-08T10:24:00.000Z'),
    anomaly('a-sales', 'A1', 'P1', 'SKU-PM', '2026-05-08T10:25:00.000Z'),
  ];

  const groups = groupRelatedAnomalies(anomalies, { now: '2026-05-08T12:00:00.000Z' });
  const report = generateM4PostmortemReport({
    now: '2026-05-08T12:00:00.000Z',
    incident: { id: 'inc-1', title: 'SKU-PM Buy Box incident' },
    anomalies,
    actions: [{ at: '2026-05-08T10:26:00.000Z', action: 'draft_price_follow' }],
    outcome: { resolved: true, resolvedAt: '2026-05-08T11:05:00.000Z', lessons: ['Price floor was current.'] },
  });

  assert.equal(groups[0].rootCause, 'Buy Box and pricing pressure');
  assert.equal(report.major, true);
  assert.equal(report.responseEvaluation.withinSla, true);
  assert.equal(report.estimatedLoss.amount, 3200);
  assert.equal(report.archiveCase.result, 'resolved');
  assert.ok(report.improvementActions.some((item) => item.includes('Buy Box')));
});

test('adaptive threshold and feedback mute reduce noisy anomaly rules', () => {
  assert.equal(applyAdaptiveThreshold(3, { falsePositiveCount: 3 }), 3.75);
  assert.equal(applyAdaptiveThreshold(3, { validFastActionCount: 5 }), 2.7);

  const input = {
    tenantId: 'tenant-demo',
    storeId: 'store-demo',
    marketplace: 'US',
    now: NOW,
    signals: {
      sales: [{ sku: 'SKU-MUTE', sales24h: 10, avgSales24h: 50, stdDevSales24h: 10 }],
    },
    feedbackByRuleScope: {
      'A1:SKU-MUTE': {
        falsePositiveCount: 3,
        lastFalsePositiveAt: '2026-05-07T10:23:00.000Z',
      },
    },
  };

  assert.equal(detectM4AdvancedAnomalies(input).length, 0);
});

function fullSignalInput() {
  return {
    tenantId: 'tenant-demo',
    storeId: 'store-demo',
    marketplace: 'US',
    selfSellerId: 'SELLER-SELF',
    now: NOW,
    currency: 'CNY',
    products: [{ id: 'p1', sku: 'SKU-1', asin: 'B0SKU1' }],
    signals: {
      sales: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', sales24h: 10, avgSales24h: 50, stdDevSales24h: 10 }],
      bsr: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', currentPercentile: 0.25, previousPercentile: 0.1, topPercentThreshold: 0.2 }],
      keywordRanks: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', keyword: 'phone case', currentRank: 25, previousRank: 8 }],
      buyBox: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', lost: true, lostMinutes: 35, winnerSellerId: 'SELLER-OTHER', estimatedLossPerHour: 3200, currency: 'CNY' }],
      listingChanges: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', previousHash: 'listing-old', currentHash: 'listing-new', changedFields: ['title', 'images'] }],
      inventory: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', fbaInboundDelayDays: 8, lostUnits: 1, damagedUnits: 0 }],
      campaigns: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', campaignId: 'cmp-1', hourlySpend: 600, avgHourlySpend: 100 }],
      refunds: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', refundRate24h: 0.12, refundCount24h: 4 }],
      reviews: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', negativeReviews24h: 3, avgRating7d: 4.1 }],
      policyWarnings: [{ active: true, policyArea: 'battery', message: 'Category policy update requires review.' }],
      accountHealth: [{ odr: 0.02, lateShipmentRate: 0.01, cancellationRate: 0.01, validTrackingRate: 0.98 }],
      pricing: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', ownPrice: 25, competitivePrice: 20, highPriceFlag: true }],
      capacity: [{ ipiScore: 390, previousIpiScore: 430, capacityLimited: false }],
      contentReviews: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', contentType: 'A+', status: 'rejected', reason: 'Image claim rejected.' }],
      offers: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', nonOwnerSellerIds: ['SELLER-HIJACK'], lowestHijackerPrice: 19.99 }],
      ipAlerts: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', active: true, ipType: 'trademark', brandRegistry: true }],
      categoryBsr: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', category: 'Phone Cases', top100ChangePct: 0.35 }],
      refundReasons: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', reason: 'damaged', currentShare: 0.3, baselineShare: 0.1, count30d: 4 }],
      storage: [{ utilization: 0.87, used: 8700, limit: 10000 }],
      b2bOrders: [{ productId: 'p1', sku: 'SKU-1', asin: 'B0SKU1', isB2B: true, amount: 1200, quantity: 10, orderId: 'b2b-1' }],
      messages: [{ oldestUnrepliedHours: 26, unrepliedCount: 5 }],
      vat: [{ country: 'DE', daysToDeadline: 5, deadline: '2026-05-13' }],
    },
  };
}

function anomaly(id, type, severity, sku = 'SKU-X', detectedAt = NOW, overrides = {}) {
  return {
    anomalyId: id,
    tenantId: 'tenant-demo',
    type,
    anomalyType: type,
    title: `${type} test anomaly`,
    severity,
    detectedAt,
    slaMinutes: severity === 'P0' ? 5 : severity === 'P1' ? 15 : 1440,
    scope: {
      storeId: 'store-demo',
      marketplace: 'US',
      sku,
      asin: sku ? `B0${sku.replace(/[^A-Z0-9]/g, '')}` : null,
    },
    evidence: {},
    aiAnalysis: {
      summary: `${type} summary`,
      rootCauses: [{ cause: `${type} cause`, weight: 0.7 }],
      confidence: 0.8,
    },
    recommendations: [{ action: 'open_detail', label: 'Open detail' }],
    source: { mode: 'mock', confidence: 0.8 },
    ...overrides,
  };
}
