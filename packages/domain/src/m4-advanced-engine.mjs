const DEFAULT_NOW = '2026-05-08T00:00:00.000Z';
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const SEVERITY_RANK = Object.freeze({ P0: 0, P1: 1, P2: 2 });
const DEFAULT_THRESHOLD_FEEDBACK = Object.freeze({
  falsePositiveCount: 0,
  validFastActionCount: 0,
});

const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  channels: {
    in_app: true,
    email: true,
    wechat: false,
    wecom: false,
    dingtalk: false,
    webhook: false,
  },
  severityRoutes: {
    P0: ['in_app', 'email', 'wechat'],
    P1: ['in_app', 'email'],
    P2: ['in_app', 'email'],
  },
  quietHours: {
    enabled: false,
    start: '23:00',
    end: '07:00',
    allowP0: true,
  },
  p1AggregationMinutes: 15,
  p2DigestTime: '08:00',
});

const ROLE_BY_RULE = Object.freeze({
  A1: ['ops'],
  A2: ['ops'],
  A3: ['ops'],
  A4: ['ops'],
  A5: ['ops', 'manager'],
  A6: ['procurement', 'ops'],
  A7: ['ops'],
  A8: ['ops', 'qc'],
  A9: ['ops', 'support'],
  A10: ['founder', 'manager'],
  A11: ['founder'],
  A12: ['ops'],
  A13: ['procurement', 'ops'],
  A14: ['ops'],
  A15: ['ops', 'legal'],
  A16: ['legal', 'founder'],
  A17: ['ops'],
  A18: ['ops', 'qc'],
  A19: ['procurement', 'ops'],
  A20: ['ops', 'finance'],
  A21: ['support', 'ops'],
  A22: ['finance'],
});

export const M4_ANOMALY_RULES = Object.freeze([
  {
    id: 'A1',
    type: 'SALES_ANOMALY',
    label: 'Sales anomaly',
    description: 'Single SKU 24h sales deviates from baseline by at least 3 sigma.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'sales_24h_z_score',
    baseThreshold: 3,
  },
  {
    id: 'A2',
    type: 'BSR_ANOMALY',
    label: 'BSR anomaly',
    description: 'Single SKU BSR falls out of the configured top category band.',
    severity: 'P2',
    slaMinutes: 24 * 60,
    metric: 'bsr_percentile',
    baseThreshold: 0.2,
  },
  {
    id: 'A3',
    type: 'KEYWORD_RANK_DROP',
    label: 'Keyword rank drop',
    description: 'A core keyword drops out of page one.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'keyword_rank',
    baseThreshold: 16,
  },
  {
    id: 'A4',
    type: 'BUY_BOX_LOST',
    label: 'Buy Box lost',
    description: 'Buy Box is not won by the seller for at least 30 minutes.',
    severity: 'P0',
    slaMinutes: 5,
    metric: 'buy_box_lost_minutes',
    baseThreshold: 30,
  },
  {
    id: 'A5',
    type: 'LISTING_CHANGED',
    label: 'Listing changed',
    description: 'Title, bullets, images, or A+ content changed outside the approved version flow.',
    severity: 'P0',
    slaMinutes: 5,
    metric: 'listing_hash_changed',
    baseThreshold: true,
  },
  {
    id: 'A6',
    type: 'INVENTORY_EXCEPTION',
    label: 'Inventory exception',
    description: 'FBA inbound delay, lost units, or damaged units crossed the watch threshold.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'fba_inbound_exception',
    baseThreshold: 7,
  },
  {
    id: 'A7',
    type: 'AD_SPEND_SPIKE',
    label: 'Ad spend spike',
    description: 'Campaign 1h spend is greater than 5x the 24h hourly baseline.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'campaign_hourly_spend_ratio',
    baseThreshold: 5,
  },
  {
    id: 'A8',
    type: 'REFUND_SPIKE',
    label: 'Refund spike',
    description: 'Single SKU 24h refund rate is above 10% with at least 3 refunds.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'refund_rate_24h',
    baseThreshold: 0.1,
  },
  {
    id: 'A9',
    type: 'NEGATIVE_REVIEW_SPIKE',
    label: 'Negative review spike',
    description: 'Single SKU receives at least 3 new 1-3 star reviews in 24h.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'negative_reviews_24h',
    baseThreshold: 3,
  },
  {
    id: 'A10',
    type: 'POLICY_WARNING',
    label: 'Policy warning',
    description: 'Category policy update or account performance warning requires immediate attention.',
    severity: 'P0',
    slaMinutes: 5,
    metric: 'policy_warning',
    baseThreshold: true,
  },
  {
    id: 'A11',
    type: 'ACCOUNT_HEALTH_RISK',
    label: 'Account health risk',
    description: 'ODR, late shipment, cancellation, or VTR is near or past Amazon account-health limits.',
    severity: 'P0',
    slaMinutes: 5,
    metric: 'account_health',
    baseThreshold: true,
  },
  {
    id: 'A12',
    type: 'PRICING_HEALTH_RISK',
    label: 'Pricing health risk',
    description: 'Pricing Health flags the SKU as high price or the offer is materially above competitive price.',
    severity: 'P0',
    slaMinutes: 5,
    metric: 'pricing_health',
    baseThreshold: 0.1,
  },
  {
    id: 'A13',
    type: 'CAPACITY_LIMIT_RISK',
    label: 'Capacity limit risk',
    description: 'IPI score is falling or storage capacity is restricted.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'ipi_or_capacity_limit',
    baseThreshold: true,
  },
  {
    id: 'A14',
    type: 'CONTENT_REVIEW_REJECTED',
    label: 'Content review rejected',
    description: 'A+, video, or Listing submission is rejected.',
    severity: 'P2',
    slaMinutes: 24 * 60,
    metric: 'content_review_status',
    baseThreshold: true,
  },
  {
    id: 'A15',
    type: 'HIJACKER_DETECTED',
    label: 'Hijacker detected',
    description: 'A new non-owned seller offer appears on the seller Listing.',
    severity: 'P0',
    slaMinutes: 5,
    metric: 'non_owner_offer_count',
    baseThreshold: 1,
  },
  {
    id: 'A16',
    type: 'INFRINGEMENT_ALERT',
    label: 'Infringement alert',
    description: 'Brand, patent, copyright, or counterfeit alert is detected.',
    severity: 'P0',
    slaMinutes: 5,
    metric: 'ip_alert',
    baseThreshold: true,
  },
  {
    id: 'A17',
    type: 'CATEGORY_BSR_CHANGE',
    label: 'Category BSR market change',
    description: 'Top-100 movement in the SKU subcategory suggests a market structure change.',
    severity: 'P2',
    slaMinutes: 24 * 60,
    metric: 'category_top100_change_pct',
    baseThreshold: 0.3,
  },
  {
    id: 'A18',
    type: 'REFUND_REASON_ANOMALY',
    label: 'Refund reason anomaly',
    description: 'One refund reason category spikes versus its 30d baseline.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'refund_reason_share_ratio',
    baseThreshold: 2,
  },
  {
    id: 'A19',
    type: 'STORAGE_OVER_80',
    label: 'Storage utilization over 80%',
    description: 'FBA storage utilization is above 80%.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'fba_storage_utilization',
    baseThreshold: 0.8,
  },
  {
    id: 'A20',
    type: 'B2B_LARGE_ORDER',
    label: 'B2B large order',
    description: 'A large business order may be an opportunity or an operational risk.',
    severity: 'P2',
    slaMinutes: 24 * 60,
    metric: 'b2b_order_amount',
    baseThreshold: 1000,
  },
  {
    id: 'A21',
    type: 'CUSTOMER_SERVICE_SLA',
    label: 'Customer service SLA risk',
    description: 'Buyer-Seller Messaging has unreplied messages older than 24h.',
    severity: 'P1',
    slaMinutes: 15,
    metric: 'oldest_unreplied_hours',
    baseThreshold: 24,
  },
  {
    id: 'A22',
    type: 'VAT_DEADLINE',
    label: 'VAT filing deadline',
    description: 'Country VAT filing deadline is within 7 days.',
    severity: 'P2',
    slaMinutes: 24 * 60,
    metric: 'days_to_vat_deadline',
    baseThreshold: 7,
  },
]);

const RULE_BY_ID = new Map(M4_ANOMALY_RULES.map((rule) => [rule.id, rule]));

const RULE_DETECTORS = Object.freeze({
  A1: detectSalesAnomalies,
  A2: detectBsrAnomalies,
  A3: detectKeywordRankDrops,
  A4: detectBuyBoxLost,
  A5: detectListingChanged,
  A6: detectInventoryExceptions,
  A7: detectAdSpendSpikes,
  A8: detectRefundSpikes,
  A9: detectNegativeReviewSpikes,
  A10: detectPolicyWarnings,
  A11: detectAccountHealthRisks,
  A12: detectPricingHealthRisks,
  A13: detectCapacityLimitRisks,
  A14: detectContentReviewRejections,
  A15: detectHijackers,
  A16: detectInfringementAlerts,
  A17: detectCategoryBsrChanges,
  A18: detectRefundReasonAnomalies,
  A19: detectStorageOver80,
  A20: detectB2bLargeOrders,
  A21: detectCustomerServiceSlaRisks,
  A22: detectVatDeadlines,
});

export function getM4RuleCatalog() {
  return M4_ANOMALY_RULES.map((rule) => ({
    ...rule,
    ownerRoles: ROLE_BY_RULE[rule.id] || ['ops'],
    runbookId: `runbook:${rule.id}`,
    source: {
      mode: 'mock',
      confidence: 0.8,
      reference: 'docs/modules/M4-daily-ops-monitoring.md#6.1',
    },
  }));
}

export function applyAdaptiveThreshold(baseThreshold, feedback = DEFAULT_THRESHOLD_FEEDBACK) {
  if (typeof baseThreshold !== 'number') return baseThreshold;
  let threshold = baseThreshold;
  if (Number(feedback.falsePositiveCount || 0) >= 3) threshold *= 1.25;
  if (Number(feedback.validFastActionCount || 0) >= 5) threshold *= 0.9;
  return Number(threshold.toFixed(4));
}

export function detectM4AdvancedAnomalies(input = {}) {
  const now = toIso(input.now);
  const candidates = [];
  for (const rule of M4_ANOMALY_RULES) {
    const detector = RULE_DETECTORS[rule.id];
    if (!detector) continue;
    candidates.push(...detector(input, rule, now));
  }

  const mutedAnomalies = [];
  const openCandidates = [];
  for (const anomaly of mergeSameScopeCandidates(candidates)) {
    if (isMuted(anomaly, input, now)) {
      mutedAnomalies.push({ ...anomaly, status: 'muted' });
    } else {
      openCandidates.push(enrichEscalation(anomaly, input, now));
    }
  }

  return openCandidates
    .sort(sortAnomalies)
    .map((anomaly) => ({
      ...anomaly,
      mutedCandidates: undefined,
    }));
}

export function evaluateM4AdvancedOperations(input = {}) {
  const now = toIso(input.now);
  const detected = detectM4AdvancedAnomalies({ ...input, now });
  const groups = groupRelatedAnomalies(detected, { now });
  const assignments = dispatchM4Anomalies({
    anomalies: detected,
    team: input.team || [],
    assignmentRules: input.assignmentRules || {},
    skuOwners: input.skuOwners || {},
    now,
  });
  const routed = routeM4Notifications({
    anomalies: detected,
    groups,
    preferences: input.notificationPreferences,
    history: input.notificationHistory || [],
    now,
  });

  return {
    sourceMode: 'mock',
    generatedAt: now,
    ruleCoverage: {
      expectedRules: 22,
      implementedRules: M4_ANOMALY_RULES.length,
      complete: M4_ANOMALY_RULES.length === 22,
    },
    summary: summarizeAnomalies(detected),
    anomalies: detected,
    groups,
    assignments,
    slaBoard: buildM4SlaBoard(assignments, now),
    notifications: routed.notifications,
    suppressedNotifications: routed.suppressed,
    playbooks: getM4PlaybookCatalog(),
  };
}

export function groupRelatedAnomalies(anomalies = [], options = {}) {
  const now = toIso(options.now);
  const groups = [];
  const byScope = new Map();

  for (const anomaly of anomalies) {
    const key = anomaly.scope.sku || anomaly.scope.asin || anomaly.scope.storeId || 'store';
    const current = byScope.get(key) || [];
    current.push(anomaly);
    byScope.set(key, current);
  }

  for (const [scopeKey, scoped] of byScope.entries()) {
    const recent = scoped.filter((item) => Math.abs(new Date(now) - new Date(item.detectedAt)) <= MS_PER_DAY);
    const root = inferGroupRootCause(recent);
    if (!root || recent.length < 2) continue;
    const members = recent.filter((item) => root.types.includes(item.type));
    if (members.length < 2) continue;
    const severity = highestSeverity(members);
    groups.push({
      groupId: `group:${scopeKey}:${root.id}`,
      scopeKey,
      severity,
      memberIds: members.map((item) => item.anomalyId).sort(),
      types: [...new Set(members.map((item) => item.type))].sort(),
      rootCause: root.label,
      confidence: Number(Math.min(0.92, 0.62 + members.length * 0.08).toFixed(2)),
      recommendation: root.recommendation,
      notificationMode: 'merged',
      source: {
        mode: 'mock',
        confidence: 0.78,
        method: 'time_window_scope_type_correlation',
      },
    });
  }

  return groups.sort((a, b) => severityCompare(a.severity, b.severity) || a.groupId.localeCompare(b.groupId));
}

export function routeM4Notifications({ anomalies = [], groups = [], preferences, history = [], now = DEFAULT_NOW } = {}) {
  const effective = mergeNotificationPreferences(preferences);
  const generatedAt = toIso(now);
  const suppressed = [];
  const notifications = [];
  const eventThrottleCounts = new Map();
  const groupByMemberId = new Map();

  for (const group of groups) {
    for (const memberId of group.memberIds) groupByMemberId.set(memberId, group);
  }

  for (const anomaly of anomalies.sort(sortAnomalies)) {
    const dedupeHit = history.find((item) => item.anomalyId === anomaly.anomalyId && withinMs(item.sentAt, generatedAt, MS_PER_DAY));
    if (dedupeHit) {
      suppressed.push({
        anomalyId: anomaly.anomalyId,
        reason: 'dedup_24h',
        lastSentAt: toIso(dedupeHit.sentAt),
      });
      continue;
    }

    const throttleKey = `${anomaly.scope.sku || anomaly.scope.asin || anomaly.scope.storeId || 'store'}:${anomaly.type}`;
    const historyCount = history.filter((item) => {
      const itemKey = `${item.sku || item.asin || item.scopeKey || 'store'}:${item.type}`;
      return itemKey === throttleKey && withinMs(item.sentAt, generatedAt, MS_PER_HOUR);
    }).length;
    const currentCount = eventThrottleCounts.get(throttleKey) || 0;
    if (historyCount + currentCount >= 3) {
      suppressed.push({
        anomalyId: anomaly.anomalyId,
        reason: 'throttle_1h_3_per_sku_type',
        throttleKey,
      });
      continue;
    }
    eventThrottleCounts.set(throttleKey, currentCount + 1);

    const group = groupByMemberId.get(anomaly.anomalyId);
    const routed = buildNotificationForAnomaly(anomaly, group, effective, generatedAt);
    if (routed.channels.length === 0) {
      suppressed.push({
        anomalyId: anomaly.anomalyId,
        reason: 'no_enabled_channel',
      });
      continue;
    }
    notifications.push(routed);
  }

  return {
    generatedAt,
    notifications,
    suppressed,
    routing: {
      P0: 'immediate',
      P1: 'aggregate_15m',
      P2: 'daily_digest',
    },
  };
}

export function dispatchM4Anomalies({ anomalies = [], team = [], assignmentRules = {}, skuOwners = {}, now = DEFAULT_NOW } = {}) {
  const generatedAt = toIso(now);
  return anomalies.map((anomaly) => {
    const requiredRoles = assignmentRules[anomaly.type] || ROLE_BY_RULE[anomaly.type] || ['ops'];
    const assignees = resolveAssignees({ anomaly, team, skuOwners, requiredRoles });
    const dueAt = addMinutes(anomaly.detectedAt || generatedAt, anomaly.slaMinutes);
    return {
      dispatchId: `dispatch:${anomaly.anomalyId}`,
      anomalyId: anomaly.anomalyId,
      type: anomaly.type,
      severity: anomaly.severity,
      mode: team.length >= 2 ? 'team_assignment' : 'single_user_notification',
      requiredRoles,
      assignees,
      slaMinutes: anomaly.slaMinutes,
      detectedAt: anomaly.detectedAt,
      dueAt,
      minutesRemaining: diffMinutes(generatedAt, dueAt),
      status: slaStatus(generatedAt, dueAt),
      escalations: buildEscalations(anomaly, assignees),
      source: {
        mode: 'mock',
        confidence: assignees.some((item) => item.id === 'unassigned') ? 0.45 : 0.86,
      },
    };
  }).sort((a, b) => severityCompare(a.severity, b.severity) || a.dueAt.localeCompare(b.dueAt));
}

export function buildM4SlaBoard(assignments = [], now = DEFAULT_NOW) {
  const generatedAt = toIso(now);
  const bySeverity = { P0: 0, P1: 0, P2: 0 };
  const byStatus = { overdue: 0, due_soon: 0, on_track: 0 };
  for (const assignment of assignments) {
    bySeverity[assignment.severity] += 1;
    byStatus[slaStatus(generatedAt, assignment.dueAt)] += 1;
  }
  return {
    generatedAt,
    totalOpen: assignments.length,
    bySeverity,
    byStatus,
    nextDue: assignments
      .slice()
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, 5)
      .map((item) => ({
        anomalyId: item.anomalyId,
        severity: item.severity,
        dueAt: item.dueAt,
        minutesRemaining: diffMinutes(generatedAt, item.dueAt),
        assignees: item.assignees.map((assignee) => assignee.name),
      })),
  };
}

export function assessReviewAppeal(review = {}) {
  const rating = Number(review.rating || 0);
  if (rating <= 0 || rating > 3) {
    return {
      eligible: false,
      confidence: 0,
      violationType: 'not_low_star_review',
      reasons: ['Only 1-3 star reviews are assessed for appeal.'],
    };
  }

  const text = normalizedText(`${review.title || ''} ${review.body || review.text || ''}`);
  const reasons = [];
  let violationType = 'insufficient_policy_signal';
  let confidence = 0.55;

  if (review.wrongAsin || includesAny(text, ['wrong product', 'different product', 'not this item', 'another asin'])) {
    violationType = 'wrong_product_page';
    confidence = 0.86;
    reasons.push('Review appears to discuss a different product or ASIN.');
  } else if (review.duplicateOf || includesAny(text, ['same review again', 'duplicate review'])) {
    violationType = 'duplicate_content';
    confidence = 0.84;
    reasons.push('Review appears to duplicate another review.');
  } else if (includesAny(text, ['competitor', 'buy from', 'use my coupon', 'promo code', 'www.', 'http'])) {
    violationType = 'competitor_or_promotional_content';
    confidence = 0.78;
    reasons.push('Review appears to include competitor or promotional content.');
  } else if (includesAny(text, ['shipping late', 'delivery late', 'driver', 'warehouse lost', 'box was late'])) {
    violationType = 'fulfillment_not_product';
    confidence = 0.76;
    reasons.push('Review focuses on fulfillment rather than the product.');
  } else if (includesAny(text, ['hate speech', 'idiot seller', 'stupid seller', 'violent threat'])) {
    violationType = 'abusive_or_hateful_language';
    confidence = 0.82;
    reasons.push('Review includes abusive or inappropriate language.');
  } else if (includesAny(text, ['i work for', 'former employee', 'paid tester', 'review club'])) {
    violationType = 'conflict_of_interest';
    confidence = 0.75;
    reasons.push('Review suggests a conflict of interest.');
  }

  return {
    eligible: confidence >= 0.7,
    confidence: Number(confidence.toFixed(2)),
    violationType,
    reasons: reasons.length ? reasons : ['No high-confidence Community Guidelines violation found.'],
  };
}

export function draftReviewAppeal({ review = {}, product = {}, seller = {} } = {}) {
  const assessment = assessReviewAppeal(review);
  const reviewId = review.id || review.reviewId || 'unknown-review';
  const asin = product.asin || review.asin || 'UNKNOWN_ASIN';
  if (!assessment.eligible) {
    return {
      reviewId,
      asin,
      eligible: false,
      assessment,
      draft: null,
      source: {
        mode: 'mock',
        confidence: assessment.confidence,
      },
    };
  }

  const sellerName = seller.name || seller.sellerName || 'Seller';
  const body = [
    'Hello Amazon Team,',
    '',
    `I am writing to request a review of a customer review on ASIN ${asin} that appears to violate Amazon Community Guidelines.`,
    '',
    `Review ID: ${reviewId}`,
    `Reviewer: ${review.reviewerName || 'Unknown'}`,
    `Date: ${review.postedAt || 'Unknown'}`,
    `Star Rating: ${review.rating || 'Unknown'}`,
    `Content: "${safeLine(review.body || review.text || review.title || '')}"`,
    '',
    `Specific Violation: ${assessment.violationType}`,
    '',
    'Reasoning:',
    ...assessment.reasons.map((reason) => `- ${reason}`),
    '',
    'Please review this content and remove it if Amazon determines it violates the applicable policy.',
    '',
    'Order details:',
    `- Order ID: ${review.orderId || 'Not available'}`,
    `- Verified Purchase: ${review.verifiedPurchase ? 'Yes' : 'No'}`,
    '',
    'Thank you for your time and consideration.',
    '',
    `Best regards,`,
    sellerName,
  ].join('\n');

  return {
    reviewId,
    asin,
    eligible: true,
    assessment,
    draft: {
      channel: 'amazon_seller_support',
      submitMode: 'manual_review_only',
      subject: `Request to review inappropriate review for ASIN ${asin}`,
      body,
      guardrails: [
        'Draft only; user must review and submit manually.',
        'No automatic Amazon case submission is performed.',
      ],
    },
    source: {
      mode: 'mock',
      confidence: assessment.confidence,
    },
  };
}

export function draftRecoveryEmail({ review = {}, customer = {}, product = {}, seller = {}, previousDrafts = [], now = DEFAULT_NOW } = {}) {
  const generatedAt = toIso(now);
  const reviewId = review.id || review.reviewId || 'unknown-review';
  const rating = Number(review.rating || 0);
  const customerId = customer.id || review.customerId || review.reviewerName || 'unknown-customer';

  if (rating <= 0 || rating > 3) {
    return blockedRecovery(reviewId, 'only_1_to_3_star_reviews_are_eligible');
  }
  if (review.verifiedPurchase === false) {
    return blockedRecovery(reviewId, 'verified_purchase_required');
  }

  const duplicate = previousDrafts.find((item) => {
    const sameReview = item.reviewId === reviewId;
    const sameCustomer = customerId !== 'unknown-customer' && item.customerId === customerId;
    return (sameReview || sameCustomer) && withinMs(item.createdAt, generatedAt, MS_PER_DAY);
  });
  if (duplicate) {
    return blockedRecovery(reviewId, 'recovery_email_24h_dedupe', duplicate.createdAt);
  }

  const sellerName = seller.name || seller.sellerName || 'Customer Care Team';
  const brandName = seller.brandName || product.brandName || 'our brand';
  const productName = product.name || review.productName || 'your product';
  const issue = inferReviewIssue(review);
  const body = [
    `Dear ${customer.firstName || 'Customer'},`,
    '',
    `Thank you for sharing feedback about ${productName}. I am sorry that the experience did not meet your expectations, especially regarding ${issue}.`,
    '',
    'We would like to make this right through Amazon Buyer-Seller Messaging. If you reply to this message, we can help with the appropriate next step such as troubleshooting, replacement guidance, or refund support through Amazon policies.',
    '',
    'We are not asking for a positive review or offering anything in exchange for a review change. Your feedback is your choice; our goal is to resolve the product experience.',
    '',
    'Thank you for being our customer.',
    '',
    'Sincerely,',
    sellerName,
    brandName,
  ].join('\n');

  return {
    reviewId,
    customerId,
    eligible: true,
    createdAt: generatedAt,
    draft: {
      channel: 'amazon_buyer_seller_messaging',
      sendMode: 'manual_review_only',
      subject: `We are sorry about your ${productName} experience`,
      body,
      guardrails: [
        'Default mode is draft only; user must approve before sending.',
        'No incentive for review changes is included.',
        '24h dedupe is enforced by review/customer.',
      ],
    },
    source: {
      mode: 'mock',
      confidence: 0.82,
    },
  };
}

export function buildM4Runbook(ruleId) {
  const rule = RULE_BY_ID.get(ruleId);
  if (!rule) throw new Error(`Unknown M4 anomaly rule ${ruleId}`);
  const override = RUNBOOK_OVERRIDES[ruleId] || {};
  return {
    id: `runbook:${rule.id}`,
    ruleId: rule.id,
    type: rule.type,
    title: override.title || `${rule.label} playbook`,
    severity: rule.severity,
    slaMinutes: rule.slaMinutes,
    objective: override.objective || `Confirm ${rule.label}, identify the root cause, and close the anomaly with evidence.`,
    steps: override.steps || [
      'Open the anomaly detail and validate the evidence.',
      'Assign an owner based on the SLA dispatch rule.',
      'Check related M1/M2/M3 signals before taking action.',
      'Record the action and mark the anomaly resolved only after follow-up evidence is available.',
    ],
    safeguards: [
      'No external account write is performed by this engine.',
      'Real Amazon, email, or store actions remain draft/mock until credentials and approval are provided.',
      ...(override.safeguards || []),
    ],
    relatedModules: override.relatedModules || relatedModulesFor(rule.id),
    source: {
      mode: 'mock',
      confidence: 0.82,
    },
  };
}

export function getM4PlaybookCatalog() {
  return M4_ANOMALY_RULES.map((rule) => buildM4Runbook(rule.id));
}

export function buildResolutionCase({ anomaly = {}, actions = [], outcome = {}, now = DEFAULT_NOW } = {}) {
  const generatedAt = toIso(now);
  const type = anomaly.type || 'UNKNOWN';
  const sku = anomaly.scope?.sku || anomaly.scope?.asin || anomaly.scopeKey || 'store';
  const result = outcome.result || (outcome.resolved ? 'resolved' : 'needs_follow_up');
  return {
    caseId: `case:${type}:${sku}:${datePart(generatedAt)}`,
    type,
    severity: anomaly.severity || 'P2',
    scope: anomaly.scope || { sku },
    scenario: anomaly.aiAnalysis?.summary || anomaly.title || 'Operational anomaly handling case.',
    actionSummary: actions.map((item) => item.action || item.label || String(item)).join(' + ') || 'No action recorded.',
    result,
    impact: outcome.impact || {},
    reusableLessons: outcome.lessons || lessonsForRule(type),
    archivedAt: generatedAt,
    source: {
      mode: 'mock',
      confidence: outcome.resolved ? 0.84 : 0.62,
    },
  };
}

export function generateM4PostmortemReport({ incident = {}, anomalies = [], timeline = [], actions = [], outcome = {}, now = DEFAULT_NOW } = {}) {
  const generatedAt = toIso(now);
  const sortedAnomalies = anomalies.slice().sort(sortAnomalies);
  const severity = sortedAnomalies.length ? highestSeverity(sortedAnomalies) : (incident.severity || 'P2');
  const primary = sortedAnomalies[0] || {};
  const normalizedTimeline = normalizeTimeline({ incident, anomalies: sortedAnomalies, timeline, actions, outcome, now: generatedAt });
  const firstDetectedAt = normalizedTimeline[0]?.at || primary.detectedAt || generatedAt;
  const firstActionAt = firstActionTime(normalizedTimeline);
  const withinSla = firstActionAt
    ? diffMinutes(firstDetectedAt, firstActionAt) <= Number(primary.slaMinutes || ruleSla(primary.type) || 24 * 60)
    : false;

  const report = {
    reportId: `postmortem:${incident.id || primary.anomalyId || 'incident'}:${datePart(generatedAt)}`,
    title: `Incident review - ${incident.title || primary.scope?.sku || primary.scope?.asin || 'M4 event'} - ${datePart(generatedAt)}`,
    generatedAt,
    severity,
    major: Boolean(incident.major || severity === 'P0' || sortedAnomalies.length >= 3),
    anomalyIds: sortedAnomalies.map((item) => item.anomalyId),
    timeline: normalizedTimeline,
    estimatedLoss: outcome.estimatedLoss || estimateLoss(sortedAnomalies),
    rootCause: incident.rootCause || inferPostmortemRootCause(sortedAnomalies),
    responseEvaluation: {
      withinSla,
      effective: Boolean(outcome.resolved),
      notes: [
        withinSla ? 'First action occurred within SLA.' : 'First action did not occur within SLA or was not recorded.',
        outcome.resolved ? 'Outcome is marked resolved.' : 'Outcome needs follow-up evidence.',
      ],
    },
    improvementActions: buildImprovementActions(sortedAnomalies, outcome),
    archiveCase: buildResolutionCase({
      anomaly: primary,
      actions,
      outcome,
      now: generatedAt,
    }),
    source: {
      mode: 'mock',
      confidence: sortedAnomalies.length ? 0.83 : 0.58,
    },
  };

  return report;
}

function detectSalesAnomalies(input, rule, now) {
  return collectSignals(input, 'sales', 'salesMetrics').flatMap((record) => {
    const feedback = feedbackFor(input, rule.id, record);
    const threshold = applyAdaptiveThreshold(rule.baseThreshold, feedback);
    const zScore = numberOr(record.zScore, zScoreFrom(record.sales24h ?? record.currentSales24h, record.avgSales24h ?? record.baselineSales24h, record.stdDevSales24h ?? record.salesStdDev24h));
    if (Math.abs(zScore) < threshold || isFeedbackMuted(feedback, now)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        currentValue: numberOr(record.sales24h, record.currentSales24h),
        baseline: numberOr(record.avgSales24h, record.baselineSales24h),
        zScore: Number(zScore.toFixed(2)),
        threshold,
        direction: zScore < 0 ? 'down' : 'up',
      },
      rootCauses: [
        weightedCause('Advertising, price, rank, or Buy Box changed recently.', 0.42),
        weightedCause('Known promotion or seasonality should be excluded before action.', 0.23),
      ],
      confidence: record.knownEvent ? 0.58 : 0.78,
    });
  });
}

function detectBsrAnomalies(input, rule, now) {
  return collectSignals(input, 'bsr', 'bsrMetrics').flatMap((record) => {
    const threshold = numberOr(record.topPercentThreshold, rule.baseThreshold);
    const current = numberOr(record.currentPercentile, record.bsrPercentile);
    const previous = numberOr(record.previousPercentile, record.previousBsrPercentile, 0);
    const currentRank = numberOr(record.currentBsr, record.bsrRank);
    const topRank = numberOr(record.categoryTopRank, record.topRankThreshold);
    const triggered = (current > threshold && previous <= threshold) || (topRank > 0 && currentRank > topRank);
    if (!triggered) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        currentPercentile: current,
        previousPercentile: previous,
        currentRank,
        topRank,
        threshold,
      },
      confidence: 0.68,
    });
  });
}

function detectKeywordRankDrops(input, rule, now) {
  return collectSignals(input, 'keywordRanks', 'keywordRankSignals').flatMap((record) => {
    const threshold = numberOr(record.pageOneRankThreshold, rule.baseThreshold);
    const current = numberOr(record.currentRank, record.rank);
    const previous = numberOr(record.previousRank, record.baselineRank, threshold);
    if (!(current > threshold && previous <= threshold)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        keyword: record.keyword || 'core_keyword',
        currentRank: current,
        previousRank: previous,
        threshold,
      },
      confidence: 0.76,
    });
  });
}

function detectBuyBoxLost(input, rule, now) {
  return collectSignals(input, 'buyBox', 'buyBoxSignals').flatMap((record) => {
    const lostMinutes = numberOr(record.lostMinutes, record.buyBoxLostMinutes, record.durationMinutes);
    const threshold = applyAdaptiveThreshold(rule.baseThreshold, feedbackFor(input, rule.id, record));
    const lost = record.winnerSellerId && input.selfSellerId ? record.winnerSellerId !== input.selfSellerId : Boolean(record.lost || record.buyBoxLost);
    if (!(lost && lostMinutes >= threshold)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        durationMinutes: lostMinutes,
        winnerSellerId: record.winnerSellerId || 'unknown',
        selfSellerId: input.selfSellerId || record.selfSellerId || 'self',
        estimatedLossPerHour: numberOr(record.estimatedLossPerHour, 0),
        currency: record.currency || input.currency || 'USD',
      },
      rootCauses: [
        weightedCause('Offer price or delivery promise is less competitive than the Buy Box winner.', 0.55),
        weightedCause('Hijacker or inventory pressure may be reducing Buy Box eligibility.', 0.25),
      ],
      confidence: 0.88,
    });
  });
}

function detectListingChanged(input, rule, now) {
  return collectSignals(input, 'listingChanges', 'listingSignals').flatMap((record) => {
    const changed = Boolean(record.changed || record.listingChanged || hashChanged(record.previousHash, record.currentHash) || hashChanged(record.previousImageHash, record.currentImageHash));
    if (!changed) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        changedFields: record.changedFields || changedListingFields(record),
        previousHash: record.previousHash,
        currentHash: record.currentHash,
        authorized: Boolean(record.authorized),
      },
      rootCauses: [
        weightedCause(record.authorized ? 'Approved internal change detected.' : 'Unauthorized Amazon or third-party edit is possible.', record.authorized ? 0.35 : 0.72),
      ],
      confidence: record.authorized ? 0.56 : 0.86,
    });
  });
}

function detectInventoryExceptions(input, rule, now) {
  return collectSignals(input, 'inventory', 'inventorySignals').flatMap((record) => {
    const delay = numberOr(record.fbaInboundDelayDays, record.inboundDelayDays);
    const lost = numberOr(record.lostUnits, 0);
    const damaged = numberOr(record.damagedUnits, 0);
    if (!(delay > rule.baseThreshold || lost > 0 || damaged > 0)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        inboundDelayDays: delay,
        lostUnits: lost,
        damagedUnits: damaged,
      },
      confidence: 0.8,
    });
  });
}

function detectAdSpendSpikes(input, rule, now) {
  return collectSignals(input, 'campaigns', 'adMetrics').flatMap((record) => {
    const hourlySpend = numberOr(record.hourlySpend, record.spend1h);
    const baseline = numberOr(record.avgHourlySpend, record.baselineHourlySpend);
    const ratio = baseline > 0 ? hourlySpend / baseline : 0;
    if (ratio <= rule.baseThreshold) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        campaignId: record.campaignId,
        hourlySpend,
        avgHourlySpend: baseline,
        ratio: Number(ratio.toFixed(2)),
      },
      confidence: 0.81,
    });
  });
}

function detectRefundSpikes(input, rule, now) {
  return collectSignals(input, 'refunds', 'refundMetrics').flatMap((record) => {
    const refundRate = numberOr(record.refundRate24h, record.refundRate);
    const refundCount = numberOr(record.refundCount24h, record.refundCount);
    if (!(refundRate > rule.baseThreshold && refundCount >= 3)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        refundRate24h: refundRate,
        refundCount24h: refundCount,
      },
      confidence: 0.8,
    });
  });
}

function detectNegativeReviewSpikes(input, rule, now) {
  return collectSignals(input, 'reviews', 'reviewMetrics').flatMap((record) => {
    const negative = numberOr(record.negativeReviews24h, record.lowStarCount24h);
    if (negative < rule.baseThreshold) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        negativeReviews24h: negative,
        avgRating7d: numberOr(record.avgRating7d, record.rating7d),
      },
      confidence: 0.82,
    });
  });
}

function detectPolicyWarnings(input, rule, now) {
  return collectSignals(input, 'policyWarnings', 'policySignals').flatMap((record) => {
    if (!(record.active || record.policyWarning || record.accountPerformanceWarning)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        policyArea: record.policyArea || record.category || 'account_or_category',
        message: record.message || 'Policy or account performance warning is active.',
      },
      confidence: 0.84,
      scopeOverride: { sku: record.sku || null, asin: record.asin || null },
    });
  });
}

function detectAccountHealthRisks(input, rule, now) {
  return collectSignals(input, 'accountHealth', 'accountHealthSignals').flatMap((record) => {
    const odr = numberOr(record.odr, record.orderDefectRate);
    const late = numberOr(record.lateShipmentRate);
    const cancel = numberOr(record.cancellationRate);
    const vtr = numberOr(record.validTrackingRate, 1);
    const triggered = Boolean(record.atRisk || record.accountHealthAtRisk || odr > 0.01 || late > 0.04 || cancel > 0.025 || vtr < 0.95);
    if (!triggered) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        odr,
        lateShipmentRate: late,
        cancellationRate: cancel,
        validTrackingRate: vtr,
        reason: record.reason || record.accountHealthReason,
      },
      confidence: 0.89,
      scopeOverride: { sku: record.sku || null, asin: record.asin || null },
    });
  });
}

function detectPricingHealthRisks(input, rule, now) {
  return collectSignals(input, 'pricing', 'pricingSignals').flatMap((record) => {
    const ownPrice = numberOr(record.ownPrice, record.price);
    const competitivePrice = numberOr(record.competitivePrice, record.buyBoxPrice);
    const premium = competitivePrice > 0 ? (ownPrice - competitivePrice) / competitivePrice : 0;
    const triggered = Boolean(record.pricingHealthFlag || record.highPriceFlag || premium > rule.baseThreshold);
    if (!triggered) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        ownPrice,
        competitivePrice,
        premiumPct: Number((premium * 100).toFixed(2)),
        flag: record.pricingHealthFlag || record.highPriceFlag || 'high_price',
      },
      confidence: 0.86,
    });
  });
}

function detectCapacityLimitRisks(input, rule, now) {
  return collectSignals(input, 'capacity', 'capacitySignals').flatMap((record) => {
    const ipi = numberOr(record.ipiScore, record.ipi);
    const previousIpi = numberOr(record.previousIpiScore, record.previousIpi, ipi);
    const falling = previousIpi > 0 && ipi > 0 && previousIpi - ipi >= 25;
    const limited = Boolean(record.capacityLimited || record.storageRestricted);
    if (!(falling || limited)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        ipiScore: ipi,
        previousIpiScore: previousIpi,
        capacityLimited: limited,
      },
      confidence: 0.78,
    });
  });
}

function detectContentReviewRejections(input, rule, now) {
  return collectSignals(input, 'contentReviews', 'contentSignals').flatMap((record) => {
    const status = String(record.status || record.contentStatus || '').toLowerCase();
    if (!(record.rejected || status === 'rejected' || status === 'suppressed')) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        contentType: record.contentType || 'listing_content',
        status: record.status || record.contentStatus || 'rejected',
        reason: record.reason,
      },
      confidence: 0.79,
    });
  });
}

function detectHijackers(input, rule, now) {
  return collectSignals(input, 'offers', 'offerSignals').flatMap((record) => {
    const sellers = record.nonOwnerSellerIds || record.hijackerSellerIds || [];
    const count = numberOr(record.nonOwnerOfferCount, sellers.length);
    if (!(record.hijackerDetected || count >= rule.baseThreshold)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        nonOwnerOfferCount: count,
        sellerIds: sellers,
        lowestHijackerPrice: numberOr(record.lowestHijackerPrice, record.hijackerPrice),
      },
      rootCauses: [
        weightedCause('A non-owned seller appeared on the offer list and may compete for Buy Box.', 0.7),
      ],
      confidence: 0.9,
    });
  });
}

function detectInfringementAlerts(input, rule, now) {
  return collectSignals(input, 'ipAlerts', 'infringementSignals').flatMap((record) => {
    if (!(record.active || record.infringementAlert || record.ipAlert)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        ipType: record.ipType || record.type || 'unknown_ip_type',
        source: record.alertSource || record.source || 'mock_monitor',
        brandRegistry: Boolean(record.brandRegistry),
      },
      confidence: record.brandRegistry ? 0.88 : 0.74,
    });
  });
}

function detectCategoryBsrChanges(input, rule, now) {
  return collectSignals(input, 'categoryBsr', 'categorySignals').flatMap((record) => {
    const changePct = Math.abs(numberOr(record.top100ChangePct, record.categoryTop100ChangePct));
    if (changePct < rule.baseThreshold) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        category: record.category || 'category',
        top100ChangePct: changePct,
      },
      confidence: 0.66,
    });
  });
}

function detectRefundReasonAnomalies(input, rule, now) {
  return collectSignals(input, 'refundReasons', 'refundReasonSignals').flatMap((record) => {
    const currentShare = numberOr(record.currentShare, record.reasonShare);
    const baselineShare = numberOr(record.baselineShare, record.baselineReasonShare);
    const ratio = baselineShare > 0 ? currentShare / baselineShare : 0;
    const count = numberOr(record.count30d, record.reasonCount30d, 0);
    if (!(ratio >= rule.baseThreshold && currentShare >= 0.15 && count >= 3)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        reason: record.reason || 'unknown_refund_reason',
        currentShare,
        baselineShare,
        ratio: Number(ratio.toFixed(2)),
        count30d: count,
      },
      confidence: 0.78,
    });
  });
}

function detectStorageOver80(input, rule, now) {
  return collectSignals(input, 'storage', 'storageSignals').flatMap((record) => {
    const utilization = numberOr(record.utilization, record.fbaStorageUtilization);
    if (utilization <= rule.baseThreshold) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        utilization,
        used: numberOr(record.used, record.usedCubicFeet),
        limit: numberOr(record.limit, record.limitCubicFeet),
      },
      confidence: 0.85,
      scopeOverride: { sku: record.sku || null, asin: record.asin || null },
    });
  });
}

function detectB2bLargeOrders(input, rule, now) {
  return collectSignals(input, 'b2bOrders', 'b2bOrderSignals').flatMap((record) => {
    const amount = numberOr(record.amount, record.orderAmount);
    const quantity = numberOr(record.quantity, record.units);
    const threshold = numberOr(record.largeOrderThreshold, rule.baseThreshold);
    if (!(record.isB2B && (amount >= threshold || quantity >= numberOr(record.quantityThreshold, 50)))) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        orderId: record.orderId,
        amount,
        quantity,
        threshold,
        buyerType: 'B2B',
      },
      confidence: 0.73,
    });
  });
}

function detectCustomerServiceSlaRisks(input, rule, now) {
  return collectSignals(input, 'messages', 'messageSignals').flatMap((record) => {
    const oldestHours = numberOr(record.oldestUnrepliedHours, record.oldestMessageAgeHours);
    const unresponded = numberOr(record.unrepliedCount, record.unrespondedCount, oldestHours >= rule.baseThreshold ? 1 : 0);
    if (!(oldestHours >= rule.baseThreshold && unresponded > 0)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        oldestUnrepliedHours: oldestHours,
        unrepliedCount: unresponded,
      },
      confidence: 0.84,
      scopeOverride: { sku: record.sku || null, asin: record.asin || null },
    });
  });
}

function detectVatDeadlines(input, rule, now) {
  return collectSignals(input, 'vat', 'vatSignals').flatMap((record) => {
    const days = numberOr(record.daysToDeadline, record.daysToVatDeadline);
    if (!(days >= 0 && days <= rule.baseThreshold)) return [];
    return makeAnomaly(input, rule, record, now, {
      evidence: {
        metric: rule.metric,
        country: record.country || record.marketplace || 'unknown_country',
        deadline: record.deadline,
        daysToDeadline: days,
      },
      confidence: 0.82,
      scopeOverride: { sku: record.sku || null, asin: record.asin || null },
    });
  });
}

function makeAnomaly(input, rule, record, now, options = {}) {
  const detectedAt = toIso(record.detectedAt || input.detectedAt || now);
  const scope = {
    storeId: record.storeId || input.store?.id || input.storeId || 'store-demo',
    marketplace: record.marketplace || input.store?.marketplace || input.marketplace || 'US',
    productId: record.productId || record.id || null,
    sku: options.scopeOverride?.sku ?? record.sku ?? productFor(input, record)?.sku ?? null,
    asin: options.scopeOverride?.asin ?? record.asin ?? productFor(input, record)?.asin ?? null,
  };
  const severity = options.severity || rule.severity;
  const anomalyId = record.anomalyId || stableAnomalyId({
    tenantId: input.tenantId || 'tenant-demo',
    scope,
    type: rule.id,
  });
  const evidence = {
    ...options.evidence,
    points: evidencePoints(options.evidence),
  };
  const confidence = Number(numberOr(record.confidence, options.confidence, defaultConfidence(rule)).toFixed(2));
  const summary = summaryFor(rule, scope, evidence);

  return {
    anomalyId,
    tenantId: input.tenantId || 'tenant-demo',
    type: rule.id,
    anomalyType: rule.type,
    title: rule.label,
    severity,
    originalSeverity: severity,
    status: record.status || 'pending',
    detectedAt,
    slaMinutes: rule.slaMinutes,
    dueAt: addMinutes(detectedAt, rule.slaMinutes),
    scope,
    evidence,
    aiAnalysis: {
      summary,
      rootCauses: options.rootCauses || rootCausesFor(rule.id, evidence),
      confidence,
      method: 'deterministic_rule_analysis',
    },
    recommendations: recommendationsFor(rule.id, evidence, record),
    runbookId: `runbook:${rule.id}`,
    source: {
      mode: 'mock',
      adapter: 'm4_advanced_rule_engine',
      confidence,
      freshness: record.freshness || input.freshness || 'mock_snapshot',
    },
  };
}

function collectSignals(input, primaryKey, fallbackKey) {
  const signals = input.signals || {};
  const primary = asArray(signals[primaryKey] ?? input[primaryKey]);
  const fallback = asArray(input[fallbackKey]);
  if (primary.length || fallback.length) return [...primary, ...fallback];

  const productRecords = asArray(input.products)
    .filter((product) => hasProductSignal(product, primaryKey, fallbackKey))
    .map((product) => ({ ...product, productId: product.id || product.productId }));
  return productRecords;
}

function hasProductSignal(product, primaryKey, fallbackKey) {
  const aliases = {
    sales: ['sales24h', 'currentSales24h', 'zScore'],
    bsr: ['bsrPercentile', 'currentBsr'],
    keywordRanks: ['currentRank', 'keywordRanks'],
    buyBox: ['buyBoxLostMinutes', 'lostMinutes', 'buyBoxLost'],
    listingChanges: ['listingChanged', 'previousHash', 'currentHash'],
    inventory: ['fbaInboundDelayDays', 'lostUnits', 'damagedUnits'],
    campaigns: ['hourlySpend', 'spend1h'],
    refunds: ['refundRate24h', 'refundCount24h'],
    reviews: ['negativeReviews24h', 'lowStarCount24h'],
    pricing: ['pricingHealthFlag', 'ownPrice', 'competitivePrice'],
    capacity: ['ipiScore', 'capacityLimited'],
    storage: ['fbaStorageUtilization', 'utilization'],
  };
  return [...(aliases[primaryKey] || []), fallbackKey].some((key) => product[key] !== undefined);
}

function mergeSameScopeCandidates(candidates) {
  const byId = new Map();
  for (const candidate of candidates) {
    const existing = byId.get(candidate.anomalyId);
    if (!existing) {
      byId.set(candidate.anomalyId, candidate);
      continue;
    }
    byId.set(candidate.anomalyId, {
      ...existing,
      severity: highestSeverity([existing, candidate]),
      originalSeverity: existing.originalSeverity,
      evidence: {
        ...existing.evidence,
        mergedEvidenceCount: numberOr(existing.evidence.mergedEvidenceCount, 1) + 1,
        points: [...(existing.evidence.points || []), ...(candidate.evidence.points || [])].slice(0, 12),
      },
      aiAnalysis: {
        ...existing.aiAnalysis,
        confidence: Math.max(existing.aiAnalysis.confidence, candidate.aiAnalysis.confidence),
      },
    });
  }
  return [...byId.values()];
}

function enrichEscalation(anomaly, input, now) {
  const lastStatusAt = anomaly.acknowledgedAt || anomaly.detectedAt;
  let severity = anomaly.severity;
  let escalationReason = null;
  if (severity === 'P1' && (numberOr(anomaly.unhandledOccurrences24h, 0) >= 10 || ageMs(lastStatusAt, now) >= MS_PER_DAY)) {
    severity = 'P0';
    escalationReason = 'p1_unhandled_escalated_to_p0';
  } else if (severity === 'P2' && ageMs(lastStatusAt, now) >= 7 * MS_PER_DAY) {
    severity = 'P1';
    escalationReason = 'p2_unhandled_7d_escalated_to_p1';
  }
  if (severity === anomaly.severity) return anomaly;
  const rule = RULE_BY_ID.get(anomaly.type);
  const slaMinutes = severity === 'P0' ? 5 : severity === 'P1' ? 15 : (rule?.slaMinutes || 24 * 60);
  return {
    ...anomaly,
    severity,
    slaMinutes,
    dueAt: addMinutes(anomaly.detectedAt, slaMinutes),
    escalationReason,
  };
}

function isMuted(anomaly, input, now) {
  const explicit = asArray(input.muteRules).some((rule) => {
    const typeMatch = !rule.type || rule.type === anomaly.type;
    const skuMatch = !rule.sku || rule.sku === anomaly.scope.sku;
    const asinMatch = !rule.asin || rule.asin === anomaly.scope.asin;
    const scopeMatch = skuMatch && asinMatch;
    const active = !rule.until || new Date(toIso(rule.until)) > new Date(now);
    return typeMatch && scopeMatch && active;
  });
  if (explicit) return true;
  return isFeedbackMuted(feedbackFor(input, anomaly.type, anomaly.scope), now);
}

function isFeedbackMuted(feedback, now) {
  if (Number(feedback.falsePositiveCount || 0) < 3) return false;
  const lastAt = feedback.lastFalsePositiveAt || feedback.updatedAt;
  if (!lastAt) return true;
  return ageMs(lastAt, now) <= 30 * MS_PER_DAY;
}

function feedbackFor(input, ruleId, record) {
  const feedback = input.feedbackByRuleScope || {};
  const scopeKeys = [
    `${ruleId}:${record.sku || ''}`,
    `${ruleId}:${record.asin || ''}`,
    `${ruleId}:${record.productId || record.id || ''}`,
    ruleId,
  ];
  for (const key of scopeKeys) {
    if (feedback[key]) return feedback[key];
  }
  return DEFAULT_THRESHOLD_FEEDBACK;
}

function buildNotificationForAnomaly(anomaly, group, preferences, now) {
  const configuredChannels = preferences.severityRoutes[anomaly.severity] || [];
  const channels = configuredChannels.filter((channel) => preferences.channels[channel]);
  let dispatchMode = 'immediate';
  let sendAt = now;

  if (anomaly.severity === 'P1') {
    dispatchMode = 'aggregate_15m';
    sendAt = nextInterval(now, preferences.p1AggregationMinutes || 15);
  } else if (anomaly.severity === 'P2') {
    dispatchMode = 'daily_digest';
    sendAt = nextDailyDigest(now, preferences.p2DigestTime || '08:00');
  }

  if (preferences.quietHours?.enabled && isInQuietHours(now, preferences.quietHours) && !(anomaly.severity === 'P0' && preferences.quietHours.allowP0)) {
    dispatchMode = 'deferred_quiet_hours';
    sendAt = quietHoursEnd(now, preferences.quietHours);
  }

  return {
    notificationId: `notif:${anomaly.anomalyId}`,
    anomalyId: anomaly.anomalyId,
    groupId: group?.groupId || null,
    type: anomaly.type,
    severity: anomaly.severity,
    sku: anomaly.scope.sku,
    asin: anomaly.scope.asin,
    channels,
    dispatchMode,
    sendAt,
    title: `${anomaly.severity} ${anomaly.title}${anomaly.scope.sku ? ` on ${anomaly.scope.sku}` : ''}`,
    body: group
      ? `${group.rootCause}: ${group.types.join(', ')}. ${group.recommendation}`
      : anomaly.aiAnalysis.summary,
    actionRequired: anomaly.severity !== 'P2',
    actionButtons: actionButtonsFor(anomaly.type),
    source: {
      mode: 'mock',
      confidence: anomaly.source.confidence,
    },
  };
}

function mergeNotificationPreferences(preferences = {}) {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...preferences,
    channels: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
      ...(preferences.channels || {}),
    },
    severityRoutes: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.severityRoutes,
      ...(preferences.severityRoutes || {}),
    },
    quietHours: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours,
      ...(preferences.quietHours || {}),
    },
  };
}

function resolveAssignees({ anomaly, team, skuOwners, requiredRoles }) {
  const normalizedTeam = team.map((member) => ({
    id: member.id,
    name: member.name || member.id,
    roles: asArray(member.roles || member.role).map((role) => String(role).toLowerCase()),
    manager: Boolean(member.manager),
  }));
  if (normalizedTeam.length === 0) {
    return [{ id: 'unassigned', name: 'Unassigned', role: requiredRoles[0] || 'ops' }];
  }
  if (normalizedTeam.length === 1) {
    return [{ id: normalizedTeam[0].id, name: normalizedTeam[0].name, role: normalizedTeam[0].roles[0] || 'owner' }];
  }

  const skuOwnerId = skuOwners[anomaly.scope.sku] || skuOwners[anomaly.scope.asin];
  const selected = [];
  if (skuOwnerId) {
    const owner = normalizedTeam.find((member) => member.id === skuOwnerId);
    if (owner) selected.push({ id: owner.id, name: owner.name, role: 'sku_owner' });
  }

  for (const role of requiredRoles) {
    const member = normalizedTeam.find((candidate) => candidate.roles.includes(role.toLowerCase()));
    if (member && !selected.some((item) => item.id === member.id)) {
      selected.push({ id: member.id, name: member.name, role });
    }
  }

  if (selected.length === 0) selected.push({ id: 'unassigned', name: 'Unassigned', role: requiredRoles[0] || 'ops' });
  return selected;
}

function buildEscalations(anomaly, assignees) {
  if (anomaly.severity === 'P0') {
    return [
      {
        at: addMinutes(anomaly.detectedAt, 5),
        condition: 'not_acknowledged',
        notifyRole: 'manager',
      },
      {
        at: addMinutes(anomaly.detectedAt, 15),
        condition: 'not_resolved',
        notifyRole: 'founder',
      },
    ];
  }
  if (anomaly.severity === 'P1') {
    return [
      {
        at: addMinutes(anomaly.detectedAt, 24 * 60),
        condition: 'not_resolved',
        notifyRole: 'manager',
      },
    ];
  }
  return [
    {
      at: addMinutes(anomaly.detectedAt, 7 * 24 * 60),
      condition: 'not_resolved',
      notifyRole: 'ops',
    },
  ];
}

const RUNBOOK_OVERRIDES = Object.freeze({
  A4: {
    title: 'Buy Box lost playbook',
    objective: 'Stop Buy Box loss, validate price/inventory/hijacker root cause, and track recovery.',
    steps: [
      'Confirm the Buy Box winner and duration from offer evidence.',
      'Compare own price, landed price, delivery promise, stock, and seller health.',
      'If price gap is small, draft a price-follow action for audit review.',
      'If hijacker evidence exists, open the hijacker playbook and prepare Test Buy guidance.',
      'Track Buy Box every 5 minutes and close only after recovery evidence is recorded.',
    ],
    relatedModules: ['M2_PRICE_FOLLOW', 'M4_HIJACKER'],
  },
  A5: {
    title: 'Listing changed playbook',
    steps: [
      'Open the approved Listing snapshot and compare title, bullets, images, and A+ hashes.',
      'Classify the change as authorized, Amazon edit, or suspected third-party edit.',
      'Draft a Seller Support case if the change is unauthorized.',
      'Restore only through audit-gated manual or Brand Registry flows.',
      'Monitor the same ASIN for repeated edits for 24 hours.',
    ],
    relatedModules: ['M1_LISTING_VERSIONING', 'AUDIT_CENTER'],
  },
  A11: {
    title: 'Account health risk playbook',
    steps: [
      'Open Account Health evidence and identify the metric that crossed threshold.',
      'List affected orders and operational causes.',
      'Draft a Plan of Action with root cause, corrective actions, and prevention.',
      'User must manually review and submit any POA.',
    ],
    safeguards: ['POA and account-health responses are never auto-submitted.'],
    relatedModules: ['AUDIT_CENTER'],
  },
  A15: {
    title: 'Hijacker response playbook',
    steps: [
      'Capture the non-owned seller offer, price, and seller ID.',
      'Prepare Test Buy guidance; the user places any buyer order manually.',
      'If Brand Registry is available, draft an infringement or counterfeit complaint.',
      'If the offer is only price competition, route to M2 price-follow simulation.',
      'Track offer removal or Buy Box recovery before closing.',
    ],
    safeguards: ['This engine never places buyer orders or uses buyer accounts.'],
    relatedModules: ['M2_PRICE_FOLLOW', 'BRAND_REGISTRY_DRAFT'],
  },
  A16: {
    title: 'IP infringement playbook',
    steps: [
      'Classify the alert as trademark, patent, copyright, or counterfeit.',
      'Collect ownership evidence and screenshots.',
      'Draft a complaint for Brand Registry when registered; otherwise draft Seller Support copy.',
      'Recommend legal counsel for complex trademark, patent, or copyright disputes.',
    ],
    safeguards: ['Draft text is not legal advice. User or counsel must review before submission.'],
    relatedModules: ['BRAND_REGISTRY_DRAFT', 'AUDIT_CENTER'],
  },
  A19: {
    title: 'Storage over 80% playbook',
    steps: [
      'Confirm utilization, used capacity, limit, and storage type.',
      'Ask M2 for stale inventory candidates and removal impact.',
      'Pause large low-profit replenishment drafts until capacity risk drops.',
      'Track utilization daily until below threshold.',
    ],
    relatedModules: ['M2_STALE_INVENTORY', 'M2_REPLENISHMENT'],
  },
  A21: {
    title: 'Buyer-Seller Messaging SLA playbook',
    steps: [
      'List unreplied messages older than 24 hours.',
      'Draft replies by intent and assign support owner.',
      'Send only after user review unless a pre-approved template is configured.',
      'Record the reply timestamp to protect account-health evidence.',
    ],
    safeguards: ['Customer-service replies default to draft-only mode.'],
    relatedModules: ['ACCOUNT_HEALTH', 'SUPPORT_TEMPLATES'],
  },
});

function recommendationsFor(ruleId, evidence, record = {}) {
  const commonManual = {
    autoExecutable: false,
    sovereignty: 'manual',
    auditRequired: true,
  };
  const map = {
    A1: [
      action('open_root_cause', 'Check ad, price, rank, Buy Box, and known events.', commonManual),
      action('notify_m2_m3', 'Ask M2/M3 to recalculate price and ad pressure.', commonManual),
    ],
    A2: [action('review_bsr_trend', 'Review category rank trend and competitor moves.', commonManual)],
    A3: [action('send_to_m1', 'Send keyword drop to M1 Listing optimization.', commonManual)],
    A4: [
      action('draft_price_follow', 'Draft a price-follow action for audit review.', { ...commonManual, autoExecutable: Boolean(record.smallPriceGapWhitelisted), sovereignty: record.smallPriceGapWhitelisted ? 'semi_auto' : 'manual' }),
      action('start_coupon_draft', 'Draft coupon option if price floor blocks direct matching.', commonManual),
    ],
    A5: [
      action('compare_snapshot', 'Compare current Listing with approved snapshot.', commonManual),
      action('draft_support_case', 'Draft Seller Support case for unauthorized change.', commonManual),
    ],
    A6: [action('open_fba_case', 'Draft FBA investigation case and notify procurement.', commonManual)],
    A7: [action('pause_or_reduce_budget_draft', 'Draft budget/bid guardrail action for audit review.', commonManual)],
    A8: [action('trigger_review_and_qc', 'Trigger Review analysis, Listing expectation check, and QC task.', commonManual)],
    A9: [action('cluster_reviews', 'Cluster new 1-3 star reviews and draft appeal/recovery if eligible.', commonManual)],
    A10: [action('prepare_policy_response', 'Summarize policy impact and assign manager/founder.', commonManual)],
    A11: [action('draft_poa', 'Draft Plan of Action; user must review before submitting.', commonManual)],
    A12: [action('run_price_health_math', 'Run M2 price-floor and Buy Box recovery math.', commonManual)],
    A13: [action('review_capacity', 'Review IPI/capacity constraints and replenishment plan.', commonManual)],
    A14: [action('fix_content_submission', 'Inspect rejection reason and send to M1 content revision.', commonManual)],
    A15: [
      action('prepare_test_buy_guidance', 'Prepare Test Buy instructions; user places any order manually.', commonManual),
      action('draft_hijacker_appeal', 'Draft hijacker or infringement complaint if evidence supports it.', commonManual),
    ],
    A16: [action('draft_ip_complaint', 'Draft IP complaint with Brand Registry/Seller Support path.', commonManual)],
    A17: [action('watch_market_structure', 'Review top-100 movers and competitor event feed.', commonManual)],
    A18: [action('map_refund_reason_to_owner', 'Route damaged to packaging/QC; description mismatch to M1.', commonManual)],
    A19: [action('open_stale_inventory_plan', 'Open M2 stale inventory removal and capacity release plan.', commonManual)],
    A20: [action('confirm_b2b_order', 'Confirm inventory, fraud risk, and fulfillment capacity.', commonManual)],
    A21: [action('draft_bulk_reply', 'Draft buyer messages; send only after approval or pre-approved template.', commonManual)],
    A22: [action('assign_vat_filing', 'Assign VAT filing reminder to finance with documents checklist.', commonManual)],
  };
  return map[ruleId] || [action('review_anomaly', 'Review anomaly and assign owner.', commonManual)];
}

function action(actionType, label, extra) {
  return {
    action: actionType,
    label,
    expectedOutcome: expectedOutcomeFor(actionType),
    risk: riskForAction(actionType),
    ...extra,
  };
}

function expectedOutcomeFor(actionType) {
  const outcomes = {
    draft_price_follow: 'Recover Buy Box without real-store write until audit/user approval.',
    start_coupon_draft: 'Improve offer competitiveness while preserving price floor.',
    draft_poa: 'Prepare account-health response faster without auto-submission.',
    draft_hijacker_appeal: 'Shorten complaint preparation time after evidence is confirmed.',
    draft_ip_complaint: 'Create a policy-aligned complaint draft for manual review.',
    draft_bulk_reply: 'Reduce support SLA exposure while keeping user control.',
  };
  return outcomes[actionType] || 'Reduce response time and improve closure evidence.';
}

function riskForAction(actionType) {
  if (actionType.includes('price')) return 'Price changes can reduce margin and must pass M2/audit guardrails.';
  if (actionType.includes('appeal') || actionType.includes('complaint') || actionType.includes('poa')) return 'Policy/legal drafts must be reviewed by the user before submission.';
  if (actionType.includes('reply')) return 'Customer replies can affect account health and remain draft-first.';
  return 'Low operational risk in mock/draft mode.';
}

function rootCausesFor(ruleId, evidence) {
  const map = {
    A8: [weightedCause('Product quality, expectation mismatch, or logistics issue may be driving refunds.', 0.64)],
    A9: [weightedCause('Recent negative feedback may indicate product, Listing, packaging, or support issue.', 0.67)],
    A12: [weightedCause('Offer price is high versus competitive or Buy Box reference price.', 0.74)],
    A18: [weightedCause(`Refund reason ${evidence.reason || 'category'} increased versus baseline.`, 0.72)],
    A21: [weightedCause('Unreplied buyer messages are approaching account-health risk.', 0.78)],
    A22: [weightedCause('Finance deadline is within the reminder window.', 0.8)],
  };
  return map[ruleId] || [weightedCause('Rule threshold crossed with mock-backed deterministic evidence.', 0.7)];
}

function weightedCause(cause, weight) {
  return { cause, weight };
}

function summaryFor(rule, scope, evidence) {
  const target = scope.sku || scope.asin || scope.storeId || 'store';
  const metric = evidence.metric || rule.metric;
  return `${rule.label} detected for ${target} on ${metric}.`;
}

function evidencePoints(evidence = {}) {
  return Object.entries(evidence)
    .filter(([key, value]) => key !== 'points' && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({ key, value }));
}

function summarizeAnomalies(anomalies) {
  return {
    totalOpen: anomalies.length,
    p0: anomalies.filter((item) => item.severity === 'P0').length,
    p1: anomalies.filter((item) => item.severity === 'P1').length,
    p2: anomalies.filter((item) => item.severity === 'P2').length,
    byType: anomalies.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {}),
  };
}

function inferGroupRootCause(anomalies) {
  const typeSet = new Set(anomalies.map((item) => item.type));
  const roots = [
    {
      id: 'buy_box_price_pressure',
      types: ['A1', 'A4', 'A12', 'A15'],
      label: 'Buy Box and pricing pressure',
      recommendation: 'Handle as one incident: stop Buy Box loss, run M2 price math, and check hijacker evidence.',
    },
    {
      id: 'quality_expectation_issue',
      types: ['A8', 'A9', 'A18'],
      label: 'Quality or expectation mismatch',
      recommendation: 'Cluster reviews/refunds, assign QC, and send expectation mismatch to M1.',
    },
    {
      id: 'capacity_inventory_risk',
      types: ['A6', 'A13', 'A19'],
      label: 'Inventory and capacity risk',
      recommendation: 'Coordinate procurement with M2 stale inventory and replenishment decisions.',
    },
    {
      id: 'account_policy_risk',
      types: ['A10', 'A11', 'A21'],
      label: 'Account and policy health risk',
      recommendation: 'Prioritize account-health remediation and founder/manager notification.',
    },
  ];
  return roots.find((root) => root.types.filter((type) => typeSet.has(type)).length >= 2);
}

function inferPostmortemRootCause(anomalies) {
  const group = inferGroupRootCause(anomalies);
  if (group) return group.label;
  const first = anomalies[0];
  if (!first) return 'Root cause not available.';
  return first.aiAnalysis?.rootCauses?.[0]?.cause || `${first.title} crossed threshold.`;
}

function buildImprovementActions(anomalies, outcome) {
  const actions = [];
  const types = new Set(anomalies.map((item) => item.type));
  if (types.has('A4')) actions.push('Add monitored competitor to high-sensitivity Buy Box and price watch.');
  if (types.has('A8') || types.has('A9') || types.has('A18')) actions.push('Create recurring Review/refund cluster review with QC and M1 owners.');
  if (types.has('A15') || types.has('A16')) actions.push('Keep Test Buy/IP evidence checklist ready for repeat cases.');
  if (types.has('A21')) actions.push('Approve safe support templates for common Buyer-Seller Messaging intents.');
  if (outcome.nextActions) actions.push(...asArray(outcome.nextActions));
  if (actions.length === 0) actions.push('Document threshold, owner, action, and follow-up metric for the next similar anomaly.');
  return actions;
}

function normalizeTimeline({ incident, anomalies, timeline, actions, outcome, now }) {
  const entries = [];
  for (const anomaly of anomalies) {
    entries.push({
      at: anomaly.detectedAt || now,
      event: `Detected ${anomaly.type} ${anomaly.title || ''}`.trim(),
      source: 'anomaly',
    });
  }
  for (const item of timeline) {
    entries.push({
      at: toIso(item.at || item.time || now),
      event: item.event || item.label || item.action || 'Timeline event',
      source: item.source || 'timeline',
    });
  }
  for (const item of actions) {
    entries.push({
      at: toIso(item.at || item.executedAt || now),
      event: `Action: ${item.action || item.label || 'operator action'}`,
      source: 'action',
    });
  }
  if (outcome.resolvedAt || outcome.resolved) {
    entries.push({
      at: toIso(outcome.resolvedAt || now),
      event: outcome.resolved ? 'Incident resolved with follow-up evidence.' : 'Outcome updated.',
      source: 'outcome',
    });
  }
  if (incident.startedAt && entries.length === 0) {
    entries.push({ at: toIso(incident.startedAt), event: incident.title || 'Incident started.', source: 'incident' });
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

function firstActionTime(timeline) {
  const action = timeline.find((item) => item.source === 'action');
  return action?.at || null;
}

function estimateLoss(anomalies) {
  const perHour = anomalies.reduce((sum, item) => sum + numberOr(item.evidence?.estimatedLossPerHour, 0), 0);
  if (perHour <= 0) return { amount: 0, currency: 'USD', method: 'not_enough_loss_evidence' };
  return {
    amount: Number((perHour * 1).toFixed(2)),
    currency: anomalies.find((item) => item.evidence?.currency)?.evidence.currency || 'USD',
    method: 'one_hour_loss_proxy',
  };
}

function lessonsForRule(type) {
  const lessons = {
    A4: ['Keep price floor and competitor watch current.', 'Track Buy Box recovery every 5 minutes after action.'],
    A15: ['Prepare Test Buy evidence before filing complaints.', 'Distinguish counterfeit risk from normal price competition.'],
    A16: ['Keep IP ownership evidence ready.', 'Use Brand Registry path when available.'],
    A21: ['Use approved templates for routine support intents.', 'Record response timestamp for account-health evidence.'],
  };
  return lessons[type] || ['Record evidence, owner, action, result, and follow-up metric.'];
}

function relatedModulesFor(ruleId) {
  if (['A1', 'A4', 'A12', 'A20'].includes(ruleId)) return ['M2', 'M3'];
  if (['A3', 'A5', 'A9', 'A14', 'A18'].includes(ruleId)) return ['M1', 'M4_REVIEW'];
  if (['A6', 'A13', 'A19'].includes(ruleId)) return ['M2_INVENTORY'];
  if (['A7'].includes(ruleId)) return ['M3_ADS'];
  if (['A10', 'A11', 'A15', 'A16', 'A21', 'A22'].includes(ruleId)) return ['AUDIT_CENTER'];
  return ['M4'];
}

function actionButtonsFor(ruleId) {
  const buttons = {
    A4: ['open_detail', 'draft_price_follow', 'ignore'],
    A5: ['compare_snapshot', 'draft_case', 'ignore'],
    A9: ['cluster_reviews', 'draft_appeal', 'draft_recovery'],
    A15: ['test_buy_guidance', 'draft_appeal', 'm2_price_math'],
    A16: ['draft_ip_complaint', 'legal_checklist'],
    A21: ['draft_bulk_reply', 'assign_support'],
  };
  return buttons[ruleId] || ['open_detail', 'assign_owner', 'ignore'];
}

function productFor(input, record) {
  const products = asArray(input.products);
  return products.find((product) => {
    return [record.productId, record.id].filter(Boolean).includes(product.id || product.productId)
      || (record.sku && product.sku === record.sku)
      || (record.asin && product.asin === record.asin);
  });
}

function stableAnomalyId({ tenantId, scope, type }) {
  const target = scope.sku || scope.asin || scope.productId || scope.storeId || 'store';
  return `${tenantId}:${scope.storeId}:${scope.marketplace}:${target}:${type}`;
}

function hashChanged(previousHash, currentHash) {
  return previousHash && currentHash && previousHash !== currentHash;
}

function changedListingFields(record) {
  const fields = [];
  if (hashChanged(record.previousTitleHash, record.currentTitleHash)) fields.push('title');
  if (hashChanged(record.previousBulletHash, record.currentBulletHash)) fields.push('bullets');
  if (hashChanged(record.previousImageHash, record.currentImageHash)) fields.push('images');
  if (hashChanged(record.previousAplusHash, record.currentAplusHash)) fields.push('a_plus');
  if (fields.length === 0 && hashChanged(record.previousHash, record.currentHash)) fields.push('listing');
  return fields;
}

function defaultConfidence(rule) {
  if (rule.severity === 'P0') return 0.84;
  if (rule.severity === 'P1') return 0.78;
  return 0.68;
}

function highestSeverity(items) {
  return items.reduce((highest, item) => {
    const severity = typeof item === 'string' ? item : item.severity;
    return severityCompare(severity, highest) < 0 ? severity : highest;
  }, 'P2');
}

function severityCompare(a, b) {
  return (SEVERITY_RANK[a] ?? 9) - (SEVERITY_RANK[b] ?? 9);
}

function sortAnomalies(a, b) {
  return severityCompare(a.severity, b.severity)
    || a.detectedAt.localeCompare(b.detectedAt)
    || a.anomalyId.localeCompare(b.anomalyId);
}

function slaStatus(now, dueAt) {
  const minutesRemaining = diffMinutes(now, dueAt);
  if (minutesRemaining < 0) return 'overdue';
  if (minutesRemaining <= 5) return 'due_soon';
  return 'on_track';
}

function ruleSla(ruleId) {
  return RULE_BY_ID.get(ruleId)?.slaMinutes;
}

function blockedRecovery(reviewId, reason, duplicateAt = null) {
  return {
    reviewId,
    eligible: false,
    reason,
    duplicateAt,
    draft: null,
    source: {
      mode: 'mock',
      confidence: 0.8,
    },
  };
}

function inferReviewIssue(review) {
  const text = normalizedText(`${review.title || ''} ${review.body || review.text || ''}`);
  if (includesAny(text, ['broken', 'defect', 'scratch', 'quality', 'stopped working'])) return 'product quality';
  if (includesAny(text, ['small', 'large', 'size', 'different', 'expected'])) return 'expectation mismatch';
  if (includesAny(text, ['package', 'box', 'shipping', 'damaged'])) return 'packaging or delivery';
  if (includesAny(text, ['instruction', 'manual', 'setup', 'confusing'])) return 'setup instructions';
  return 'the issue you described';
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function normalizedText(text) {
  return String(text || '').toLowerCase();
}

function safeLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function zScoreFrom(current, average, stdDev) {
  const c = Number(current);
  const avg = Number(average);
  const sd = Number(stdDev);
  if (!Number.isFinite(c) || !Number.isFinite(avg) || !Number.isFinite(sd) || sd <= 0) return 0;
  return (c - avg) / sd;
}

function numberOr(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function toIso(value = DEFAULT_NOW) {
  const date = new Date(value || DEFAULT_NOW);
  if (Number.isNaN(date.getTime())) return DEFAULT_NOW;
  return date.toISOString();
}

function addMinutes(value, minutes) {
  return new Date(new Date(toIso(value)).getTime() + minutes * MS_PER_MINUTE).toISOString();
}

function diffMinutes(from, to) {
  return Math.floor((new Date(toIso(to)).getTime() - new Date(toIso(from)).getTime()) / MS_PER_MINUTE);
}

function ageMs(from, to) {
  return new Date(toIso(to)).getTime() - new Date(toIso(from)).getTime();
}

function withinMs(value, now, ms) {
  if (!value) return false;
  const delta = new Date(toIso(now)).getTime() - new Date(toIso(value)).getTime();
  return delta >= 0 && delta <= ms;
}

function nextInterval(now, minutes) {
  const date = new Date(toIso(now));
  const intervalMs = minutes * MS_PER_MINUTE;
  return new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs).toISOString();
}

function nextDailyDigest(now, hhmm) {
  const date = new Date(toIso(now));
  const [hour, minute] = hhmm.split(':').map((part) => Number(part));
  const digest = new Date(date);
  digest.setUTCHours(hour, minute, 0, 0);
  if (digest.getTime() < date.getTime()) digest.setUTCDate(digest.getUTCDate() + 1);
  return digest.toISOString();
}

function isInQuietHours(now, quietHours) {
  const date = new Date(toIso(now));
  const currentMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const start = minutesOfDay(quietHours.start);
  const end = minutesOfDay(quietHours.end);
  if (start === end) return false;
  if (start < end) return currentMinutes >= start && currentMinutes < end;
  return currentMinutes >= start || currentMinutes < end;
}

function quietHoursEnd(now, quietHours) {
  const date = new Date(toIso(now));
  const end = minutesOfDay(quietHours.end);
  const endDate = new Date(date);
  endDate.setUTCHours(Math.floor(end / 60), end % 60, 0, 0);
  if (endDate.getTime() <= date.getTime()) endDate.setUTCDate(endDate.getUTCDate() + 1);
  return endDate.toISOString();
}

function minutesOfDay(hhmm) {
  const [hour, minute] = String(hhmm || '00:00').split(':').map((part) => Number(part));
  return hour * 60 + minute;
}

function datePart(iso) {
  return toIso(iso).slice(0, 10);
}
