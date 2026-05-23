import { getPrompt } from '../../prompts/src/prompt-registry.mjs';

export function buildDecisionContext({ tenantId = 'tenant-demo', module, promptId, subject = {}, evidence = [], constraints = {} }) {
  const prompt = getPrompt(promptId);
  if (prompt.module !== module) {
    throw new Error(`Prompt ${promptId} belongs to ${prompt.module}, not ${module}`);
  }
  return {
    tenantId,
    module,
    prompt,
    subject,
    evidence,
    constraints,
    builtAt: new Date().toISOString(),
  };
}

export function runCodexLocalDecision(context) {
  const evidence = normalizeEvidence(context.evidence);
  const confidence = computeConfidence(context, evidence);
  const recommendation = recommend(context, evidence, confidence);
  return validateDecision({
    decisionId: `${context.module}:${context.prompt.id}:${stableSubjectId(context.subject)}`,
    module: context.module,
    promptId: context.prompt.id,
    provider: 'codex_local',
    sourceMode: 'codex_assisted_mock',
    recommendation: recommendation.text,
    actionType: recommendation.actionType,
    confidence,
    reasoning: {
      summary: recommendation.reason,
      evidence,
      consideredAlternatives: recommendation.alternatives,
    },
    expectedImpact: recommendation.expectedImpact,
    sovereignty: recommendation.sovereignty || 'manual',
    createdAt: new Date().toISOString(),
  });
}

export function validateDecision(decision) {
  const required = ['decisionId', 'module', 'promptId', 'provider', 'recommendation', 'confidence', 'reasoning', 'expectedImpact'];
  for (const key of required) {
    if (decision[key] === undefined || decision[key] === null) throw new Error(`Decision missing ${key}`);
  }
  if (decision.confidence < 0 || decision.confidence > 1) throw new Error('Decision confidence must be between 0 and 1');
  if (!Array.isArray(decision.reasoning.evidence)) throw new Error('Decision reasoning.evidence must be an array');
  return decision;
}

export function createCodexLocalDecision(input) {
  return runCodexLocalDecision(buildDecisionContext(input));
}

function normalizeEvidence(evidence) {
  return evidence.map((item, index) => {
    if (typeof item === 'string') return { type: 'text', source: `evidence_${index + 1}`, value: item };
    return {
      type: item.type || 'data',
      source: item.source || `evidence_${index + 1}`,
      value: item.value ?? item,
    };
  });
}

function computeConfidence(context, evidence) {
  let confidence = 0.5;
  confidence += Math.min(0.25, evidence.length * 0.05);
  if (context.constraints?.mockOnly) confidence -= 0.05;
  if (context.subject?.accuracy?.confidence) confidence += Number(context.subject.accuracy.confidence) * 0.1;
  return Number(Math.max(0.35, Math.min(0.92, confidence)).toFixed(2));
}

function recommend(context, evidence, confidence) {
  const promptId = context.prompt.id;
  const subject = context.subject || {};
  if (promptId.includes('LEAK')) {
    return {
      text: subject.recommendation || 'Prioritize the leak with the highest monthly impact and keep the action in audit review.',
      actionType: subject.type || 'REVIEW_PROFIT_LEAK',
      reason: `Detected ${subject.type || 'profit leak'} with ${evidence.length} evidence points.`,
      alternatives: [{ option: 'ignore', rejectedBecause: 'Leak may continue to erode profit.' }],
      expectedImpact: { metric: 'monthly_profit_saved', change: subject.estimatedMonthlyImpact || 0, horizonDays: 30 },
      sovereignty: 'manual',
    };
  }
  if (promptId.includes('SUGGESTION')) {
    return {
      text: subject.actionType ? `Review and execute ${subject.actionType} if audit gate approves.` : 'Review generated ad suggestion before execution.',
      actionType: subject.actionType || 'REVIEW_AD_SUGGESTION',
      reason: `Lifecycle-aware ad action generated from ${evidence.length} evidence points.`,
      alternatives: [{ option: 'manual review', rejectedBecause: confidence >= 0.7 ? 'Audit-gated execution is available.' : 'Confidence is below auto threshold.' }],
      expectedImpact: subject.expectedImpact || { metric: 'unknown', change: 0, horizonDays: 14 },
      sovereignty: confidence >= 0.8 ? 'semi_auto' : 'manual',
    };
  }
  if (promptId.includes('ANOMALY')) {
    return {
      text: subject.recommendedAction || 'Open the anomaly, assign an owner, and follow the relevant playbook.',
      actionType: subject.type || 'HANDLE_ANOMALY',
      reason: `Anomaly severity ${subject.severity || 'unknown'} requires SLA-based handling.`,
      alternatives: [{ option: 'daily digest', rejectedBecause: subject.severity === 'P0' ? 'P0 requires immediate routing.' : 'May be acceptable for P2 only.' }],
      expectedImpact: { metric: 'response_time', change: subject.severity === 'P0' ? -5 : -15, horizonDays: 1 },
      sovereignty: 'manual',
    };
  }
  if (promptId.includes('M1')) {
    return {
      text: subject.title || 'Apply listing improvement in draft and keep publication manual-only.',
      actionType: 'DRAFT_LISTING_IMPROVEMENT',
      reason: 'Listing changes can trigger review; keep manual sovereignty.',
      alternatives: [{ option: 'auto publish', rejectedBecause: 'M1 full auto is not allowed by product rules.' }],
      expectedImpact: { metric: 'listing_score', change: subject.expectedLift || 0, horizonDays: 14 },
      sovereignty: 'manual',
    };
  }
  return {
    text: 'Review recommendation with available evidence.',
    actionType: 'REVIEW_DECISION',
    reason: `Codex-local decision built from ${evidence.length} evidence points.`,
    alternatives: [],
    expectedImpact: { metric: 'unknown', change: 0, horizonDays: 14 },
    sovereignty: 'manual',
  };
}

function stableSubjectId(subject) {
  return subject.id || subject.productId || subject.sku || subject.type || 'subject';
}
