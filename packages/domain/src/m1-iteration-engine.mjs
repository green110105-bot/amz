import { roundCurrency } from './profit-engine.mjs';
import { scoreListing, suggestListingImprovements } from './listing-engine.mjs';

export const M1_DEFAULT_NOW = '2026-05-07T00:00:00.000Z';
export const M1_SCORING_VERSION = 'm1-local-scoring-v1.0';
export const M1_PROMPT_VERSION = 'm1-local-deterministic-v1';

export const M1_ITERATION_STATES = Object.freeze({
  IDLE: 'idle',
  DIAGNOSING: 'diagnosing',
  DIAGNOSED: 'diagnosed',
  DIAGNOSE_FAILED: 'diagnose_failed',
  PROPOSING: 'proposing',
  PROPOSE_FAILED: 'propose_failed',
  REVIEWING: 'reviewing',
  EDITING: 'editing',
  ROUND_COMPLETE: 'round_complete',
  ITERATION_IN_PROGRESS: 'iteration_in_progress',
  PENDING_APPLY: 'pending_apply',
  APPLYING: 'applying',
  APPLIED: 'applied',
  APPLY_FAILED: 'apply_failed',
  ABANDONED: 'abandoned',
});

export const M1_ITERATION_EVENTS = Object.freeze({
  START_DIAGNOSIS: 'start_diagnosis',
  DIAGNOSIS_SUCCEEDED: 'diagnosis_succeeded',
  DIAGNOSIS_FAILED: 'diagnosis_failed',
  SELECT_IMPROVEMENT: 'select_improvement',
  PROPOSALS_READY: 'proposals_ready',
  PROPOSALS_FAILED: 'proposals_failed',
  ACCEPT: 'accept',
  EDIT_REQUEST: 'edit_request',
  EDIT_SAVED: 'edit_saved',
  REWRITE_REQUEST: 'rewrite_request',
  SKIP: 'skip',
  ROUND_RESCORED: 'round_rescored',
  CONTINUE_ITERATION: 'continue_iteration',
  COMPLETE_ITERATION: 'complete_iteration',
  APPLY_REQUEST: 'apply_request',
  APPLY_SUCCEEDED: 'apply_succeeded',
  APPLY_FAILED: 'apply_failed',
  RETRY_APPLY: 'retry_apply',
  RETURN_TO_EDIT: 'return_to_edit',
  ABANDON: 'abandon',
});

export const M1_ALLOWED_TRANSITIONS = Object.freeze({
  [M1_ITERATION_STATES.IDLE]: {
    [M1_ITERATION_EVENTS.START_DIAGNOSIS]: M1_ITERATION_STATES.DIAGNOSING,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.DIAGNOSING]: {
    [M1_ITERATION_EVENTS.DIAGNOSIS_SUCCEEDED]: M1_ITERATION_STATES.DIAGNOSED,
    [M1_ITERATION_EVENTS.DIAGNOSIS_FAILED]: M1_ITERATION_STATES.DIAGNOSE_FAILED,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.DIAGNOSE_FAILED]: {
    [M1_ITERATION_EVENTS.START_DIAGNOSIS]: M1_ITERATION_STATES.DIAGNOSING,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.DIAGNOSED]: {
    [M1_ITERATION_EVENTS.SELECT_IMPROVEMENT]: M1_ITERATION_STATES.PROPOSING,
    [M1_ITERATION_EVENTS.START_DIAGNOSIS]: M1_ITERATION_STATES.DIAGNOSING,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.PROPOSING]: {
    [M1_ITERATION_EVENTS.PROPOSALS_READY]: M1_ITERATION_STATES.REVIEWING,
    [M1_ITERATION_EVENTS.PROPOSALS_FAILED]: M1_ITERATION_STATES.PROPOSE_FAILED,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.PROPOSE_FAILED]: {
    [M1_ITERATION_EVENTS.SELECT_IMPROVEMENT]: M1_ITERATION_STATES.PROPOSING,
    [M1_ITERATION_EVENTS.REWRITE_REQUEST]: M1_ITERATION_STATES.PROPOSING,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.REVIEWING]: {
    [M1_ITERATION_EVENTS.ACCEPT]: M1_ITERATION_STATES.ROUND_COMPLETE,
    [M1_ITERATION_EVENTS.EDIT_REQUEST]: M1_ITERATION_STATES.EDITING,
    [M1_ITERATION_EVENTS.REWRITE_REQUEST]: M1_ITERATION_STATES.PROPOSING,
    [M1_ITERATION_EVENTS.SKIP]: M1_ITERATION_STATES.ROUND_COMPLETE,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.EDITING]: {
    [M1_ITERATION_EVENTS.EDIT_SAVED]: M1_ITERATION_STATES.REVIEWING,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.ROUND_COMPLETE]: {
    [M1_ITERATION_EVENTS.ROUND_RESCORED]: M1_ITERATION_STATES.ITERATION_IN_PROGRESS,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.ITERATION_IN_PROGRESS]: {
    [M1_ITERATION_EVENTS.CONTINUE_ITERATION]: M1_ITERATION_STATES.DIAGNOSED,
    [M1_ITERATION_EVENTS.SELECT_IMPROVEMENT]: M1_ITERATION_STATES.PROPOSING,
    [M1_ITERATION_EVENTS.COMPLETE_ITERATION]: M1_ITERATION_STATES.PENDING_APPLY,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.PENDING_APPLY]: {
    [M1_ITERATION_EVENTS.APPLY_REQUEST]: M1_ITERATION_STATES.APPLYING,
    [M1_ITERATION_EVENTS.RETURN_TO_EDIT]: M1_ITERATION_STATES.ITERATION_IN_PROGRESS,
    [M1_ITERATION_EVENTS.ABANDON]: M1_ITERATION_STATES.ABANDONED,
  },
  [M1_ITERATION_STATES.APPLYING]: {
    [M1_ITERATION_EVENTS.APPLY_SUCCEEDED]: M1_ITERATION_STATES.APPLIED,
    [M1_ITERATION_EVENTS.APPLY_FAILED]: M1_ITERATION_STATES.APPLY_FAILED,
  },
  [M1_ITERATION_STATES.APPLY_FAILED]: {
    [M1_ITERATION_EVENTS.RETRY_APPLY]: M1_ITERATION_STATES.APPLYING,
    [M1_ITERATION_EVENTS.RETURN_TO_EDIT]: M1_ITERATION_STATES.ITERATION_IN_PROGRESS,
  },
  [M1_ITERATION_STATES.APPLIED]: {},
  [M1_ITERATION_STATES.ABANDONED]: {},
});

export const M1_EXPERIMENT_STATES = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const M1_CATEGORY_TEMPLATES = Object.freeze({
  general: {
    category: 'general',
    marketplace: 'US',
    version: 'v1.0',
    titleTemplate: '[Brand] [Core Keyword] [Differentiator] - [Material/Spec] [Bonus]',
    bulletSkeleton: [
      'Lead with the strongest USP and proof.',
      'Explain compatibility, size, or fit.',
      'Address the top customer pain point.',
      'Show use scenario and care guidance.',
      'Add risk reducer such as warranty or returns.',
    ],
    aPlusRecommendedModules: ['hero', 'feature_callout', 'comparison_table', 'usage_steps'],
    scoringWeights: { D1: 0.25, D2: 0.20, D3: 0.20, D4: 0.15, D5: 0.20 },
    mustHaveElements: [
      {
        id: 'brand_first_title',
        label: 'Brand-led title',
        patterns: ['brand:', ' by ', 'official'],
        penalty: 5,
        severity: 'minor',
      },
      {
        id: 'risk_reducer',
        label: 'Warranty or return reassurance',
        patterns: ['warranty', 'guarantee', 'return', 'refund'],
        penalty: 5,
        severity: 'minor',
      },
    ],
  },
  electronics_accessories: {
    category: 'electronics_accessories',
    marketplace: 'US',
    version: 'v1.0',
    titleTemplate: '[Brand] [Core Keyword] [Compatibility] - [Certification/Power Spec] [Bonus]',
    bulletSkeleton: [
      'State compatibility with exact device models.',
      'Lead with certification, durability, or power proof.',
      'Explain setup and daily-use convenience.',
      'Address heat, loose fit, battery, or signal pain points.',
      'Add warranty and comparison-table support.',
    ],
    aPlusRecommendedModules: ['compatibility_table', 'certification_strip', 'comparison_table', 'dimension_diagram'],
    scoringWeights: { D1: 0.25, D2: 0.25, D3: 0.20, D4: 0.15, D5: 0.15 },
    mustHaveElements: [
      {
        id: 'compatibility_list',
        label: 'Compatibility list',
        patterns: ['compatible', 'iphone', 'galaxy', 'usb-c', 'bluetooth', 'model'],
        penalty: 10,
        severity: 'major',
      },
      {
        id: 'certification_or_standard',
        label: 'At least one certification or tested standard',
        patterns: ['fcc', 'ce', 'rohs', 'bluetooth sig', 'mil-std', 'tested'],
        penalty: 10,
        severity: 'major',
      },
      {
        id: 'technical_spec',
        label: 'Technical spec such as watts, volts, speed, or dimensions',
        patterns: ['w', 'watt', 'v', 'volt', 'gbps', 'mah', 'inch', 'cm', 'mm'],
        penalty: 8,
        severity: 'major',
      },
      {
        id: 'comparison_table',
        label: 'A+ comparison table',
        patterns: ['compare', 'comparison', 'versus', 'vs'],
        penalty: 5,
        severity: 'minor',
      },
    ],
  },
  home_kitchen: {
    category: 'home_kitchen',
    marketplace: 'US',
    version: 'v1.0',
    titleTemplate: '[Brand] [Core Keyword] [Material] - [Size] [Room/Use Scenario]',
    bulletSkeleton: [
      'Lead with material safety and practical benefit.',
      'Show exact dimensions and capacity.',
      'Explain two or more use scenarios.',
      'Add cleaning, care, and storage guidance.',
      'Close with warranty or support.',
    ],
    aPlusRecommendedModules: ['lifestyle_scene', 'dimension_diagram', 'material_callout', 'care_guide'],
    scoringWeights: { D1: 0.25, D2: 0.20, D3: 0.20, D4: 0.20, D5: 0.15 },
    mustHaveElements: [
      {
        id: 'dimensions',
        label: 'Product or package dimensions',
        patterns: ['inch', 'inches', 'cm', 'mm', 'size', 'dimensions'],
        penalty: 10,
        severity: 'major',
      },
      {
        id: 'material',
        label: 'Material statement',
        patterns: ['steel', 'cotton', 'wood', 'silicone', 'plastic', 'bamboo', 'material'],
        penalty: 8,
        severity: 'major',
      },
      {
        id: 'usage_scene',
        label: 'Usage scenario',
        patterns: ['kitchen', 'bathroom', 'bedroom', 'office', 'home', 'countertop'],
        penalty: 6,
        severity: 'minor',
      },
      {
        id: 'care_guide',
        label: 'Cleaning or care guide',
        patterns: ['clean', 'wash', 'wipe', 'dishwasher', 'care'],
        penalty: 5,
        severity: 'minor',
      },
    ],
  },
  baby_products: {
    category: 'baby_products',
    marketplace: 'US',
    version: 'v1.0',
    titleTemplate: '[Brand] [Core Keyword] [Age Range] - [Safety Material] [Use Case]',
    bulletSkeleton: [
      'Lead with age range and supervised-use context.',
      'State safety certification or material standard.',
      'Explain comfort and gentle-use benefit.',
      'Add warning or care note where required.',
      'Avoid absolute safety or medical claims.',
    ],
    aPlusRecommendedModules: ['safety_certification', 'age_fit_guide', 'material_callout', 'care_guide'],
    scoringWeights: { D1: 0.25, D2: 0.15, D3: 0.25, D4: 0.15, D5: 0.20 },
    mustHaveElements: [
      {
        id: 'age_range',
        label: 'Age range',
        patterns: ['0-6m', '6-12m', '12m', 'months', 'years', 'age'],
        penalty: 10,
        severity: 'major',
      },
      {
        id: 'safety_certification',
        label: 'Safety certification or standard',
        patterns: ['cpsc', 'astm', 'en71', 'certified', 'tested'],
        penalty: 10,
        severity: 'major',
      },
      {
        id: 'safe_material',
        label: 'Material safety statement',
        patterns: ['bpa free', 'food grade', 'non-toxic', 'silicone', 'cotton'],
        penalty: 8,
        severity: 'major',
      },
      {
        id: 'warning_note',
        label: 'Warning or supervised-use note',
        patterns: ['warning', 'supervision', 'adult', 'care', 'follow instructions'],
        penalty: 5,
        severity: 'minor',
      },
    ],
    forbiddenClaims: ['100% safe', 'cures', 'prevents disease'],
  },
  apparel: {
    category: 'apparel',
    marketplace: 'US',
    version: 'v1.0',
    titleTemplate: '[Brand] [Core Keyword] [Fit] - [Fabric] [Occasion]',
    bulletSkeleton: [
      'Lead with fit and size guidance.',
      'State fabric composition and feel.',
      'Explain care and washing guidance.',
      'Show model or multi-angle visual need.',
      'Close with occasion and styling cue.',
    ],
    aPlusRecommendedModules: ['size_chart', 'fabric_callout', 'model_gallery', 'care_guide'],
    scoringWeights: { D1: 0.30, D2: 0.15, D3: 0.20, D4: 0.25, D5: 0.10 },
    mustHaveElements: [
      {
        id: 'size_chart',
        label: 'Size chart',
        patterns: ['size chart', 'sizes', 'sizing', 'fit guide', 'waist', 'inseam'],
        penalty: 10,
        severity: 'major',
      },
      {
        id: 'fabric_composition',
        label: 'Fabric composition',
        patterns: ['cotton', 'polyester', 'spandex', 'wool', 'linen', 'fabric'],
        penalty: 8,
        severity: 'major',
      },
      {
        id: 'wash_care',
        label: 'Wash or care guidance',
        patterns: ['wash', 'machine washable', 'dry clean', 'tumble', 'care'],
        penalty: 6,
        severity: 'minor',
      },
      {
        id: 'model_or_angles',
        label: 'Model or multi-angle visual',
        patterns: ['model', 'front view', 'side view', 'back view', 'multi-angle'],
        penalty: 5,
        severity: 'minor',
      },
    ],
  },
});

const DIMENSION_TO_D_CODE = Object.freeze({
  keywordCoverage: 'D1.1',
  sellingPointClarity: 'D2.1',
  painPointAlignment: 'D3.1',
  visualAplus: 'D4.1',
  conversionTriggers: 'D5.3',
});

const SCORE_DIMENSION_MAP = Object.freeze({
  D1: 'keywordCoverage',
  D2: 'sellingPointClarity',
  D3: 'painPointAlignment',
  D4: 'visualAplus',
  D5: 'conversionTriggers',
});

export function transitionIterationState(currentState, event) {
  const transitions = M1_ALLOWED_TRANSITIONS[currentState];
  if (!transitions) {
    throw new Error(`Unknown M1 iteration state: ${currentState}`);
  }
  const to = transitions[event];
  if (!to) {
    throw new Error(`Invalid M1 iteration transition: ${currentState} -> ${event}`);
  }
  return {
    from: currentState,
    event,
    to,
    allowed: true,
  };
}

export function canTransitionIterationState(currentState, event) {
  return Boolean(M1_ALLOWED_TRANSITIONS[currentState]?.[event]);
}

export function createM1Diagnosis(input = {}) {
  const {
    product = {},
    listing = {},
    searchTerms = [],
    reviews = [],
    competitors = [],
    category = product.category || listing.category || 'general',
    preferences = {},
    triggeredBy = 'manual',
    now = M1_DEFAULT_NOW,
  } = input;
  const base = scoreListing({ product, listing, searchTerms, reviews, competitors });
  const template = getCategoryTemplate(category);
  const templateAudit = validateCategoryTemplateRules({ listing, category, preferences });
  const dScores = mapListingScoreToDScores(base.dimensions);
  const weightedTotal = calculateCategoryWeightedScore(dScores, category);
  const baseImprovements = suggestListingImprovements(base).map((item, index) => normalizeImprovement(item, index + 1));
  const templateImprovements = templateAudit.missing.map((missing, index) => normalizeImprovement({
    id: `template-${missing.id}`,
    rank: baseImprovements.length + index + 1,
    dimension: missing.dimension || 'sellingPointClarity',
    sub_dimension: missing.subDimension || 'D2.1',
    location: missing.location || defaultLocationForDimension(missing.dimension || 'sellingPointClarity'),
    issue: `Missing ${missing.label}.`,
    direction: missing.recommendation,
    expected_score_lift: missing.penalty >= 10 ? 7 : 4,
    evidence: [missing.label],
  }, baseImprovements.length + index + 1));
  const improvements = [...baseImprovements, ...templateImprovements]
    .sort((a, b) => b.expectedScoreLift - a.expectedScoreLift || a.rank - b.rank)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    diagnosisId: `m1diag-${stableHash([product.id || listing.productId || 'product', weightedTotal, now]).slice(0, 10)}`,
    productId: product.id || listing.productId || null,
    asin: product.asin || listing.asin || null,
    category: template.category,
    diagnosedAt: now,
    total_score: weightedTotal,
    scores: {
      D1: { value: dScores.D1, reasoning: 'Keyword coverage mapped from deterministic listing score.' },
      D2: { value: dScores.D2, reasoning: 'USP clarity mapped from deterministic listing score plus template gaps.' },
      D3: { value: dScores.D3, reasoning: 'Pain point alignment mapped from review evidence.' },
      D4: { value: dScores.D4, reasoning: 'Visual and A+ score mapped from listing media completeness.' },
      D5: { value: dScores.D5, reasoning: 'Conversion cue score mapped from risk reducers and urgency cues.' },
    },
    improvements,
    templateAudit,
    contextMetadata: {
      ai_model: 'local_deterministic',
      scoring_version: M1_SCORING_VERSION,
      prompt_version: M1_PROMPT_VERSION,
      source_mode: 'mock_deterministic',
      triggered_by: triggeredBy,
    },
    confidence: roundCurrency(Math.min(0.92, base.confidence + (templateAudit.passes ? 0.03 : 0)), 2),
  };
}

export function createIterationSession(input = {}) {
  const {
    tenantId = 'tenant-demo',
    product = {},
    listing = {},
    diagnosis = null,
    category = product.category || listing.category || diagnosis?.category || 'general',
    createdBy = 'user-demo',
    preferences = {},
    now = M1_DEFAULT_NOW,
  } = input;
  const normalizedListing = normalizeListing({ ...listing, productId: listing.productId || product.id });
  const effectiveDiagnosis = diagnosis || createM1Diagnosis({ product, listing: normalizedListing, category, preferences, now });
  const improvements = (effectiveDiagnosis.improvements || []).map((item, index) => normalizeImprovement(item, index + 1));
  const initialScore = extractTotalScore(effectiveDiagnosis);
  const productId = product.id || normalizedListing.productId || effectiveDiagnosis.productId || 'product-demo';
  const initialVersion = createListingVersion({
    tenantId,
    productId,
    asin: product.asin || effectiveDiagnosis.asin || normalizedListing.asin || null,
    listing: normalizedListing,
    previousVersions: [],
    source: 'initial_import',
    status: 'live',
    isCurrent: true,
    scoreSnapshot: { total: initialScore, scoringVersion: M1_SCORING_VERSION },
    versionNumber: 1,
    now,
  });

  return {
    id: `m1iter-${productId}-${stableHash([productId, initialScore, category]).slice(0, 8)}`,
    tenantId,
    productId,
    asin: product.asin || effectiveDiagnosis.asin || null,
    category: getCategoryTemplate(category).category,
    state: M1_ITERATION_STATES.DIAGNOSED,
    status: 'in_progress',
    createdBy,
    startedAt: now,
    lastActiveAt: now,
    completedAt: null,
    appliedAt: null,
    initialScore,
    currentScore: initialScore,
    finalScore: null,
    diagnosis: clone(effectiveDiagnosis),
    currentListing: normalizedListing,
    draftListing: clone(normalizedListing),
    rounds: [],
    remainingImprovements: improvements,
    versions: [initialVersion],
    draftVersionId: null,
    preferences: {
      tone: preferences.tone || preferences.preferredTone || 'professional',
      bannedWords: uniqueStrings([...(preferences.bannedWords || []), ...(preferences.banned_words || [])]),
      lockedFields: uniqueStrings([...(preferences.lockedFields || []), ...(preferences.locked_fields || [])]),
      brandVoice: preferences.brandVoice || preferences.brand_voice || '',
      brandColor: preferences.brandColor || preferences.primary_color || '#C8102E',
    },
    metadata: {
      sourceMode: 'mock_deterministic',
      scoringVersion: M1_SCORING_VERSION,
      promptVersion: M1_PROMPT_VERSION,
    },
  };
}

export function startIterationRound(session, input = {}) {
  const selected = selectImprovement(session.remainingImprovements || [], input);
  if (!selected) {
    throw new Error('M1 improvement not found for selected round');
  }
  transitionIterationState(session.state, M1_ITERATION_EVENTS.SELECT_IMPROVEMENT);
  const proposing = {
    ...clone(session),
    state: M1_ITERATION_STATES.PROPOSING,
    lastActiveAt: input.now || M1_DEFAULT_NOW,
  };
  const proposals = generateThreeProposals({
    product: input.product || { id: session.productId, asin: session.asin, category: session.category },
    listing: proposing.draftListing,
    improvement: selected,
    category: session.category,
    preferences: proposing.preferences,
    searchTerms: input.searchTerms || [],
    sellingPoints: input.sellingPoints || [],
    brandSettings: input.brandSettings || {},
    now: input.now || M1_DEFAULT_NOW,
  });
  transitionIterationState(M1_ITERATION_STATES.PROPOSING, M1_ITERATION_EVENTS.PROPOSALS_READY);
  const roundNumber = proposing.rounds.length + 1;
  const round = {
    id: `${proposing.id}:round-${roundNumber}`,
    roundNumber,
    status: M1_ITERATION_STATES.REVIEWING,
    selectedImprovement: selected,
    proposalType: proposals.proposalType,
    proposals: proposals.proposals,
    proposalBatches: [proposals],
    userAction: null,
    userChoice: null,
    userFeedback: null,
    beforeScore: proposing.currentScore,
    afterScore: null,
    scoreLift: null,
    changes: [],
    startedAt: input.now || M1_DEFAULT_NOW,
    completedAt: null,
  };

  return {
    ...proposing,
    state: M1_ITERATION_STATES.REVIEWING,
    rounds: [...proposing.rounds, round],
    currentRoundId: round.id,
  };
}

export function generateThreeProposals(input = {}) {
  const improvement = normalizeImprovement(input.improvement || {}, input.improvement?.rank || 1);
  const proposalType = inferImprovementType(improvement);
  if (proposalType === 'image') {
    return generateImageCandidates(input);
  }
  return generateTextProposals(input);
}

export function generateTextProposals(input = {}) {
  const {
    product = {},
    listing = {},
    category = product.category || listing.category || 'general',
    searchTerms = [],
    preferences = {},
    feedback = '',
  } = input;
  const improvement = normalizeImprovement(input.improvement || {}, input.improvement?.rank || 1);
  ensureFieldNotLocked(improvement.location, preferences.lockedFields || preferences.locked_fields || []);
  const template = getCategoryTemplate(category);
  const normalizedListing = normalizeListing(listing);
  const field = inferField(improvement.location || improvement.field || defaultLocationForDimension(improvement.dimension));
  const originalText = String(readListingField(normalizedListing, field) || normalizedListing.title || product.title || 'Product');
  const keyword = chooseKeyword(searchTerms, normalizedListing.title || product.title || 'product');
  const brand = product.brand || normalizedListing.brand || firstTitleToken(normalizedListing.title) || 'Brand';
  const bannedWords = uniqueStrings([...(preferences.bannedWords || []), ...(preferences.banned_words || [])]);
  const phrases = deriveProposalPhrases({ improvement, template, product, keyword, feedback });
  const angles = [
    {
      id: 'A',
      angle: 'evidence-driven',
      text: `${brand} ${keyword} with ${phrases.proof}: ${phrases.benefit} for ${phrases.useCase}.`,
      rationale: `Uses proof from ${template.category} rules to make the claim concrete.`,
    },
    {
      id: 'B',
      angle: 'scenario-driven',
      text: `${phrases.useCase} ready ${keyword}: ${phrases.benefit}, simple setup, and clear fit guidance.`,
      rationale: 'Frames the rewrite around the buyer use case and decision context.',
    },
    {
      id: 'C',
      angle: 'comparison-driven',
      text: `Choose ${brand} for ${phrases.benefit}: clearer specs, stronger proof, and less generic copy than standard alternatives.`,
      rationale: 'Differentiates against generic competitor copy without naming a third-party brand.',
    },
  ];

  const proposals = angles.map((proposal) => {
    const text = fitText(sanitizeText(proposal.text, bannedWords), field);
    const complianceCheck = checkTextCompliance({ text, field, category, bannedWords });
    return {
      id: proposal.id,
      angle: proposal.angle,
      proposalType: 'text',
      location: field,
      originalText,
      text,
      rationale: proposal.rationale,
      keywords_included: text.toLowerCase().includes(keyword.toLowerCase()) ? [keyword] : [],
      compliance_check: complianceCheck,
      addresses_feedback: feedback ? `Uses feedback: ${feedback}` : null,
      sourceMode: 'mock_deterministic',
    };
  });

  return {
    proposalType: 'text',
    proposals,
    generatedAt: input.now || M1_DEFAULT_NOW,
    promptVersion: M1_PROMPT_VERSION,
  };
}

export function generateImageCandidates(input = {}) {
  const {
    product = {},
    listing = {},
    category = product.category || listing.category || 'general',
    brandSettings = {},
    sellingPoints = [],
    feedback = '',
    now = M1_DEFAULT_NOW,
  } = input;
  const improvement = normalizeImprovement(input.improvement || {}, input.improvement?.rank || 1);
  const imageType = normalizeImageType(input.imageType || improvement.imageType || inferField(improvement.location));
  const normalizedListing = normalizeListing(listing);
  const template = getCategoryTemplate(category);
  const productId = product.id || normalizedListing.productId || 'product-demo';
  const badgePoints = sellingPoints.length > 0 ? sellingPoints : deriveBadgePoints(improvement, template);
  const brandColor = brandSettings.primary_color || brandSettings.primaryColor || brandSettings.brandColor || '#C8102E';
  const placements = [
    { id: 'A', style: 'clean-minimal', placement: 'top-left badge', productRatio: 0.88 },
    { id: 'B', style: 'proof-forward', placement: 'right-bottom seal', productRatio: 0.86 },
    { id: 'C', style: 'info-dense', placement: 'dual corner badges', productRatio: 0.85 },
  ];
  const candidates = placements.map((candidate) => {
    const imageUrl = `mock://m1-images/${productId}/${imageType}/${stableHash([productId, imageType, candidate.id, badgePoints, feedback]).slice(0, 10)}.jpg`;
    const metadata = {
      imageType,
      format: 'jpg',
      width: 2000,
      height: 2000,
      whiteBackground: imageType === 'main',
      productRatio: candidate.productRatio,
      hasWatermark: false,
      hasLogo: false,
      badgeOnly: true,
      badges: badgePoints,
      textOverlays: imageType === 'main' ? [] : badgePoints,
      peopleCount: 0,
      photographic: true,
      medicalClaims: [],
      thirdPartyBrands: [],
      customerReviewQuotes: [],
      superlativeClaims: [],
    };
    const complianceCheck = checkImageCompliance(metadata, { category, imageType });
    const warnings = candidate.id === 'C' ? [...complianceCheck.warnings, 'Dual badges may feel crowded; review in editor.'] : complianceCheck.warnings;
    return {
      id: candidate.id,
      proposalType: 'image',
      image_type: imageType,
      image_url: imageUrl,
      thumbnail_url: imageUrl.replace('.jpg', '_thumb.jpg'),
      style: candidate.style,
      placement: candidate.placement,
      image_prompt: buildImagePrompt({ product, imageType, candidate, badgePoints, brandColor, template, feedback }),
      negative_prompt: imageType === 'main'
        ? 'watermark, third-party logo, border, people, illustration, cluttered background'
        : 'medical claims, third-party brand names, review quotes, unverified superlatives',
      post_processing: [
        imageType === 'main' ? 'ensure pure white background RGB(255,255,255)' : 'keep brand layout within Amazon A+ safe area',
        `apply ${candidate.placement} with brand color ${brandColor}`,
      ],
      compliance_check: { ...complianceCheck, warnings },
      rationale: `${candidate.placement} preserves product focus while making the selected improvement visible.`,
      addresses_feedback: feedback ? `Regenerated with feedback: ${feedback}` : null,
      generation_time_ms: 18000 + candidate.id.charCodeAt(0) * 10,
      sourceMode: 'mock_deterministic',
    };
  });

  return {
    proposalType: 'image',
    imageType,
    candidates,
    proposals: candidates,
    generatedAt: now,
    promptVersion: M1_PROMPT_VERSION,
    complianceSummary: {
      allPassed: candidates.every((candidate) => candidate.compliance_check.passes),
      failedCandidateIds: candidates.filter((candidate) => !candidate.compliance_check.passes).map((candidate) => candidate.id),
    },
  };
}

export function decideIterationRound(session, decision = {}) {
  const working = clone(session);
  const roundIndex = working.rounds.findIndex((round) => round.id === (decision.roundId || working.currentRoundId));
  const effectiveRoundIndex = roundIndex >= 0 ? roundIndex : working.rounds.length - 1;
  const round = working.rounds[effectiveRoundIndex];
  if (!round) {
    throw new Error('M1 round not found for decision');
  }
  if (working.state !== M1_ITERATION_STATES.REVIEWING) {
    throw new Error(`M1 round decision requires reviewing state, got ${working.state}`);
  }

  const action = normalizeDecisionAction(decision.action);
  if (action === 'rewrite' || action === 'regenerate') {
    transitionIterationState(working.state, M1_ITERATION_EVENTS.REWRITE_REQUEST);
    const proposals = generateThreeProposals({
      product: decision.product || { id: working.productId, asin: working.asin, category: working.category },
      listing: working.draftListing,
      improvement: round.selectedImprovement,
      category: working.category,
      preferences: working.preferences,
      searchTerms: decision.searchTerms || [],
      sellingPoints: decision.sellingPoints || [],
      brandSettings: decision.brandSettings || {},
      feedback: decision.feedback || decision.userFeedback || '',
      now: decision.now || M1_DEFAULT_NOW,
    });
    round.status = M1_ITERATION_STATES.REVIEWING;
    round.userAction = action;
    round.userFeedback = decision.feedback || decision.userFeedback || '';
    round.proposals = proposals.proposals;
    round.proposalBatches = [...(round.proposalBatches || []), proposals];
    working.rounds[effectiveRoundIndex] = round;
    return {
      ...working,
      state: M1_ITERATION_STATES.REVIEWING,
      lastActiveAt: decision.now || M1_DEFAULT_NOW,
    };
  }

  transitionIterationState(working.state, action === 'skip' ? M1_ITERATION_EVENTS.SKIP : M1_ITERATION_EVENTS.ACCEPT);
  let selectedProposal = null;
  let changes = [];
  let draftListing = clone(working.draftListing);
  const beforeScore = Number(round.beforeScore ?? working.currentScore ?? 0);
  let scoreLift = 0;

  if (action !== 'skip') {
    selectedProposal = findProposal(round.proposals, decision.selectedProposalId || decision.candidateId || decision.selected_proposal_id || 'A');
    if (!selectedProposal) {
      throw new Error('M1 selected proposal not found');
    }
    const applied = applyProposalToListing({
      listing: draftListing,
      improvement: round.selectedImprovement,
      proposal: selectedProposal,
      decision,
      category: working.category,
      preferences: working.preferences,
    });
    draftListing = applied.listing;
    changes = applied.changes;
    const expectedLift = Number(round.selectedImprovement.expectedScoreLift || round.selectedImprovement.expected_score_lift || 0);
    scoreLift = estimateScoreLift({ action, expectedLift, selectedProposal, decision });
  }

  const afterScore = roundCurrency(Math.min(100, Math.max(0, beforeScore + scoreLift)), 1);
  const completedRound = {
    ...round,
    status: 'completed',
    userAction: action,
    userChoice: selectedProposal ? {
      proposalId: selectedProposal.id,
      proposalType: selectedProposal.proposalType || round.proposalType,
      edited: action === 'edit' || action === 'upload_own',
      value: extractProposalValue(selectedProposal, decision),
    } : null,
    userFeedback: decision.feedback || decision.userFeedback || null,
    beforeScore,
    afterScore,
    scoreLift: roundCurrency(afterScore - beforeScore, 1),
    changes,
    completedAt: decision.now || M1_DEFAULT_NOW,
  };
  working.rounds[effectiveRoundIndex] = completedRound;
  const remainingImprovements = (working.remainingImprovements || []).filter((item) => item.id !== round.selectedImprovement.id);
  let versions = working.versions || [];
  let draftVersionId = working.draftVersionId || null;

  if (changes.length > 0) {
    const draftVersion = createListingVersion({
      tenantId: working.tenantId,
      productId: working.productId,
      asin: working.asin,
      listing: draftListing,
      previousVersions: versions,
      source: 'ai_iteration',
      status: 'draft',
      isCurrent: false,
      iterationId: working.id,
      scoreSnapshot: { total: afterScore, scoringVersion: M1_SCORING_VERSION },
      changes: collectSessionChanges({ ...working, rounds: working.rounds }, changes),
      now: decision.now || M1_DEFAULT_NOW,
    });
    versions = [...versions, draftVersion];
    draftVersionId = draftVersion.id;
  }

  transitionIterationState(M1_ITERATION_STATES.ROUND_COMPLETE, M1_ITERATION_EVENTS.ROUND_RESCORED);
  return {
    ...working,
    state: M1_ITERATION_STATES.ITERATION_IN_PROGRESS,
    draftListing,
    currentScore: afterScore,
    finalScore: null,
    remainingImprovements,
    versions,
    draftVersionId,
    currentRoundId: null,
    lastActiveAt: decision.now || M1_DEFAULT_NOW,
  };
}

export function finishIteration(session, input = {}) {
  transitionIterationState(session.state, M1_ITERATION_EVENTS.COMPLETE_ITERATION);
  const completedAt = input.now || M1_DEFAULT_NOW;
  return {
    ...clone(session),
    state: M1_ITERATION_STATES.PENDING_APPLY,
    status: 'completed',
    finalScore: Number(session.currentScore ?? session.finalScore ?? session.initialScore ?? 0),
    completedAt,
    lastActiveAt: completedAt,
    applyPreview: buildApplyPreview(session),
  };
}

export function applyIteration(session, input = {}) {
  if (!input.confirm) {
    throw new Error('M1 apply requires explicit confirm=true');
  }
  transitionIterationState(session.state, M1_ITERATION_EVENTS.APPLY_REQUEST);
  const applyingAt = input.now || M1_DEFAULT_NOW;
  const latestDraft = findVersion(session.versions || [], input.versionId || session.draftVersionId) || latestDraftVersion(session.versions || []);
  if (!latestDraft) {
    throw new Error('M1 apply requires a draft version');
  }
  const requiresRealStoreWrite = Boolean(input.requiresRealStoreWrite);
  if (requiresRealStoreWrite) {
    transitionIterationState(M1_ITERATION_STATES.APPLYING, M1_ITERATION_EVENTS.APPLY_FAILED);
    return {
      ...clone(session),
      state: M1_ITERATION_STATES.APPLY_FAILED,
      status: 'apply_failed',
      lastActiveAt: applyingAt,
      applyError: {
        code: 'M1_REAL_STORE_WRITE_BLOCKED',
        message: 'Real store write is disabled until credentials and explicit approval are provided.',
      },
    };
  }
  const hasMainImageChange = (latestDraft.changes || []).some((change) => change.field === 'main_image' || change.field === 'mainImageUrl');
  const published = publishListingVersion(session.versions, latestDraft.id, {
    now: applyingAt,
    appliedBy: input.appliedBy || session.createdBy,
    amazonReviewStatus: hasMainImageChange ? 'pending_review' : 'approved_mock',
    amazonSubmissionId: `mock-sub-${stableHash([session.id, latestDraft.id]).slice(0, 12)}`,
  });
  transitionIterationState(M1_ITERATION_STATES.APPLYING, M1_ITERATION_EVENTS.APPLY_SUCCEEDED);
  return {
    ...clone(session),
    state: M1_ITERATION_STATES.APPLIED,
    status: 'applied',
    versions: published,
    currentListing: clone(latestDraft.listing),
    draftListing: clone(latestDraft.listing),
    appliedAt: applyingAt,
    lastActiveAt: applyingAt,
    applyResult: {
      ok: true,
      mode: 'mock',
      status: 'submitted_to_amazon_mock',
      amazon_submission_id: `mock-sub-${stableHash([session.id, latestDraft.id]).slice(0, 12)}`,
      estimated_review_minutes: hasMainImageChange ? 60 : 5,
      version_id: latestDraft.id,
    },
  };
}

export function abandonIteration(session, input = {}) {
  if (!canTransitionIterationState(session.state, M1_ITERATION_EVENTS.ABANDON)) {
    throw new Error(`Cannot abandon M1 iteration from state ${session.state}`);
  }
  return {
    ...clone(session),
    state: M1_ITERATION_STATES.ABANDONED,
    status: 'abandoned',
    abandonedAt: input.now || M1_DEFAULT_NOW,
  };
}

export function createListingVersion(input = {}) {
  const {
    tenantId = 'tenant-demo',
    productId = input.product?.id || input.listing?.productId || 'product-demo',
    asin = input.product?.asin || input.listing?.asin || null,
    listing = {},
    previousVersions = [],
    source = 'manual_edit',
    status = 'draft',
    isCurrent = false,
    iterationId = null,
    scoreSnapshot = null,
    changes = [],
    appliedBy = null,
    versionNumber = null,
    now = M1_DEFAULT_NOW,
  } = input;
  const normalizedListing = normalizeListing({ ...listing, productId });
  const nextVersionNumber = versionNumber || (maxVersionNumber(previousVersions) + 1);
  return {
    id: `m1ver-${productId}-v${nextVersionNumber}-${stableHash([normalizedListing, source, iterationId]).slice(0, 8)}`,
    tenantId,
    productId,
    asin,
    versionNumber: nextVersionNumber,
    version_number: nextVersionNumber,
    listing: normalizedListing,
    title: normalizedListing.title,
    bullets: normalizedListing.bullets,
    description: normalizedListing.description,
    aPlusModules: normalizedListing.aPlusModules,
    mainImageUrl: normalizedListing.mainImageUrl,
    galleryImages: normalizedListing.galleryImages,
    videoUrl: normalizedListing.videoUrl || null,
    source,
    iterationId,
    status,
    isCurrent,
    is_current: isCurrent,
    scoreSnapshot,
    changes: clone(changes || []),
    amazonSubmissionId: null,
    amazonReviewStatus: status === 'live' ? 'approved_mock' : null,
    amazonReviewMessage: null,
    createdAt: now,
    appliedAt: status === 'live' && isCurrent ? now : null,
    appliedBy,
    archivedAt: null,
    sourceMode: 'mock_deterministic',
  };
}

export function publishListingVersion(versions = [], versionId, input = {}) {
  const now = input.now || M1_DEFAULT_NOW;
  return versions.map((version) => {
    if (version.id === versionId) {
      return {
        ...clone(version),
        status: 'live',
        isCurrent: true,
        is_current: true,
        appliedAt: now,
        appliedBy: input.appliedBy || version.appliedBy || null,
        amazonSubmissionId: input.amazonSubmissionId || version.amazonSubmissionId || `mock-sub-${stableHash([versionId, now]).slice(0, 12)}`,
        amazonReviewStatus: input.amazonReviewStatus || 'approved_mock',
        amazonReviewMessage: 'Mock execution only; no external Amazon account was touched.',
      };
    }
    if (version.isCurrent || version.is_current) {
      return {
        ...clone(version),
        isCurrent: false,
        is_current: false,
        status: version.status === 'live' ? 'archived' : version.status,
        archivedAt: now,
      };
    }
    return clone(version);
  });
}

export function compareListingVersions(fromVersion, toVersion) {
  const fields = ['title', 'bullets', 'description', 'aPlusModules', 'mainImageUrl', 'galleryImages', 'videoUrl'];
  const changes = fields
    .map((field) => ({
      field,
      before: clone(fromVersion[field] ?? fromVersion.listing?.[field] ?? null),
      after: clone(toVersion[field] ?? toVersion.listing?.[field] ?? null),
    }))
    .filter((change) => stableStringify(change.before) !== stableStringify(change.after))
    .map((change) => ({ ...change, changed: true }));
  const fromScore = Number(fromVersion.scoreSnapshot?.total ?? 0);
  const toScore = Number(toVersion.scoreSnapshot?.total ?? 0);
  return {
    fromVersionId: fromVersion.id,
    toVersionId: toVersion.id,
    changedFields: changes.map((change) => change.field),
    changes,
    scoreDelta: roundCurrency(toScore - fromScore, 1),
    sourceMode: 'mock_deterministic',
  };
}

export function rollbackListingVersion(versions = [], targetVersionId, input = {}) {
  const target = findVersion(versions, targetVersionId);
  if (!target) {
    throw new Error('M1 rollback target version not found');
  }
  const current = versions.find((version) => version.isCurrent || version.is_current) || versions[versions.length - 1];
  const changes = current ? compareListingVersions(current, target).changes : [];
  const rollbackVersion = createListingVersion({
    tenantId: target.tenantId,
    productId: target.productId,
    asin: target.asin,
    listing: target.listing || target,
    previousVersions: versions,
    source: 'rollback',
    status: 'draft',
    isCurrent: false,
    scoreSnapshot: target.scoreSnapshot || null,
    changes,
    now: input.now || M1_DEFAULT_NOW,
  });
  return {
    version: rollbackVersion,
    versions: [...versions.map((version) => clone(version)), rollbackVersion],
    auditLog: {
      id: `m1audit-rollback-${stableHash([targetVersionId, input.requestedBy || 'user']).slice(0, 10)}`,
      sourceModule: 'M1',
      actionType: 'ROLLBACK_LISTING_VERSION',
      target: { productId: target.productId, targetVersionId },
      requestedBy: input.requestedBy || 'user-demo',
      status: 'pending_approval',
      executionMode: 'mock',
      canRollback: true,
      createdAt: input.now || M1_DEFAULT_NOW,
    },
  };
}

export function buildApplyPreview(session) {
  const versions = session.versions || [];
  const current = versions.find((version) => version.isCurrent || version.is_current) || versions[0];
  const draft = findVersion(versions, session.draftVersionId) || latestDraftVersion(versions);
  if (!current || !draft) {
    return {
      productId: session.productId,
      changes: [],
      scoreChange: 0,
      warnings: ['No draft version is available.'],
    };
  }
  const comparison = compareListingVersions(current, draft);
  return {
    productId: session.productId,
    fromVersionId: current.id,
    toVersionId: draft.id,
    changes: comparison.changes,
    scoreChange: comparison.scoreDelta,
    warnings: comparison.changedFields.some((field) => field === 'mainImageUrl')
      ? ['Main image changes can trigger Amazon review.']
      : ['Text changes are mock-submitted and remain user-owned.'],
  };
}

export function createAbExperiment(input = {}) {
  const {
    product = {},
    productId = product.id || input.controlVersion?.productId || input.treatmentVersion?.productId || 'product-demo',
    asin = product.asin || input.controlVersion?.asin || input.treatmentVersion?.asin || null,
    experimentType = input.experiment_type || 'main_image',
    controlVersion,
    treatmentVersion,
    durationDays = 14,
    createdBy = 'user-demo',
    now = M1_DEFAULT_NOW,
  } = input;
  const normalizedType = normalizeExperimentType(experimentType);
  if (!['main_image', 'a_plus'].includes(normalizedType)) {
    throw new Error(`Unsupported M1 A/B experiment type: ${experimentType}`);
  }
  if (!controlVersion || !treatmentVersion) {
    throw new Error('M1 A/B experiment requires controlVersion and treatmentVersion');
  }
  return {
    id: `m1ab-${productId}-${normalizedType}-${stableHash([controlVersion.id, treatmentVersion.id, durationDays]).slice(0, 10)}`,
    tenantId: input.tenantId || controlVersion.tenantId || treatmentVersion.tenantId || 'tenant-demo',
    productId,
    asin,
    experimentType: normalizedType,
    experiment_type: normalizedType,
    controlVersionId: controlVersion.id,
    treatmentVersionId: treatmentVersion.id,
    controlVersion: clone(controlVersion),
    treatmentVersion: clone(treatmentVersion),
    durationDays,
    status: M1_EXPERIMENT_STATES.PENDING,
    amazonExperimentId: null,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    daysElapsed: 0,
    winner: null,
    cvr_lift: null,
    confidence: null,
    significance: null,
    raw_results: null,
    createdBy,
    sourceMode: 'mock_deterministic',
  };
}

export function startAbExperiment(experiment, input = {}) {
  if (experiment.status !== M1_EXPERIMENT_STATES.PENDING) {
    throw new Error(`M1 A/B experiment must be pending to start, got ${experiment.status}`);
  }
  const startedAt = input.now || M1_DEFAULT_NOW;
  return {
    ...clone(experiment),
    status: M1_EXPERIMENT_STATES.RUNNING,
    amazonExperimentId: `mock-exp-${stableHash([experiment.id, startedAt]).slice(0, 12)}`,
    startedAt,
  };
}

export function advanceAbExperiment(experiment, input = {}) {
  const running = experiment.status === M1_EXPERIMENT_STATES.PENDING ? startAbExperiment(experiment, input) : clone(experiment);
  if (running.status !== M1_EXPERIMENT_STATES.RUNNING) {
    throw new Error(`M1 A/B experiment must be running or pending to advance, got ${running.status}`);
  }
  const daysElapsed = Math.max(0, Math.min(Number(input.daysElapsed ?? running.daysElapsed ?? 0), Number(running.durationDays || 14)));
  const metrics = normalizeExperimentMetrics(running, input.dailyMetrics || input.metrics, daysElapsed);
  const result = evaluateAbResult(metrics.control, metrics.treatment);
  const completed = daysElapsed >= Number(running.durationDays || 14);
  return {
    ...running,
    status: completed ? M1_EXPERIMENT_STATES.COMPLETED : M1_EXPERIMENT_STATES.RUNNING,
    daysElapsed,
    endedAt: completed ? (input.now || M1_DEFAULT_NOW) : null,
    winner: completed ? result.winner : null,
    cvr_lift: result.cvrLift,
    confidence: result.confidence,
    significance: completed ? result.significance : 'interim',
    raw_results: {
      control: result.control,
      treatment: result.treatment,
      zScore: result.zScore,
      recommendation: completed ? result.recommendation : 'Continue collecting data until the configured duration is reached.',
    },
  };
}

export function cancelAbExperiment(experiment, input = {}) {
  if (![M1_EXPERIMENT_STATES.PENDING, M1_EXPERIMENT_STATES.RUNNING].includes(experiment.status)) {
    throw new Error(`Cannot cancel M1 A/B experiment from state ${experiment.status}`);
  }
  return {
    ...clone(experiment),
    status: M1_EXPERIMENT_STATES.CANCELLED,
    endedAt: input.now || M1_DEFAULT_NOW,
  };
}

export function evaluateAbResult(controlInput = {}, treatmentInput = {}) {
  const control = normalizeMetricTotals(controlInput);
  const treatment = normalizeMetricTotals(treatmentInput);
  const controlCvr = control.sessions === 0 ? 0 : control.conversions / control.sessions;
  const treatmentCvr = treatment.sessions === 0 ? 0 : treatment.conversions / treatment.sessions;
  const cvrLift = controlCvr === 0 ? 0 : (treatmentCvr - controlCvr) / controlCvr;
  const pooled = (control.conversions + treatment.conversions) / Math.max(1, control.sessions + treatment.sessions);
  const standardError = Math.sqrt(Math.max(0, pooled * (1 - pooled) * ((1 / Math.max(1, control.sessions)) + (1 / Math.max(1, treatment.sessions)))));
  const zScore = standardError === 0 ? 0 : (treatmentCvr - controlCvr) / standardError;
  const confidence = roundCurrency(Math.max(0, 1 - (2 * (1 - normalCdf(Math.abs(zScore))))), 4);
  const significant = confidence >= 0.95 && Math.abs(cvrLift) >= 0.02;
  const winner = significant ? (cvrLift > 0 ? 'treatment' : 'control') : 'no_difference';
  return {
    control: { ...control, cvr: roundCurrency(controlCvr, 4) },
    treatment: { ...treatment, cvr: roundCurrency(treatmentCvr, 4) },
    cvrLift: roundCurrency(cvrLift, 4),
    confidence,
    significance: significant ? 'significant' : 'not_significant',
    winner,
    zScore: roundCurrency(zScore, 4),
    recommendation: significant
      ? `Use ${winner} after mock A/B evaluation.`
      : 'Keep the control or collect more data; no statistically significant winner yet.',
  };
}

export function checkImageCompliance(imageMetadata = {}, input = {}) {
  const imageType = normalizeImageType(input.imageType || imageMetadata.imageType || imageMetadata.type || 'main');
  const category = getCategoryTemplate(input.category || imageMetadata.category || 'general').category;
  const metadata = normalizeImageMetadata(imageMetadata);
  const violations = [];
  const warnings = [];
  const autoFixActions = [];

  if (!['jpg', 'jpeg', 'png'].includes(metadata.format)) {
    violations.push({ rule: 'file_format', details: 'Image format must be JPG or PNG.' });
  }
  if (metadata.width < 1600 || metadata.height < 1600) {
    violations.push({ rule: 'resolution', details: 'Image resolution must be at least 1600x1600 px.' });
    autoFixActions.push('upscale_to_1600_square');
  }

  if (imageType === 'main') {
    if (!metadata.whiteBackground) {
      violations.push({ rule: 'white_bg', details: 'Main image must use pure white background.' });
      autoFixActions.push('replace_background_with_rgb_255');
    }
    if (metadata.productRatio < 0.85) {
      violations.push({ rule: 'product_ratio', details: 'Main image product area must be at least 85% of frame.' });
      autoFixActions.push('crop_and_scale_product_to_85_percent');
    }
    if (metadata.hasWatermark) {
      violations.push({ rule: 'watermark', details: 'Watermarks are not allowed on main images.' });
    }
    if (metadata.hasLogo) {
      violations.push({ rule: 'logo', details: 'Logos not on the physical product are not allowed on main images.' });
    }
    if ((metadata.hasText || metadata.textOverlays.length > 0) && !metadata.badgeOnly) {
      violations.push({ rule: 'text_overlay', details: 'Main image text overlays are not allowed unless modeled as product-owned badge metadata.' });
    }
    if (metadata.peopleCount > 0 && category !== 'apparel') {
      violations.push({ rule: 'people', details: 'People are not allowed in main images except apparel-style categories.' });
    }
    if (!metadata.photographic) {
      violations.push({ rule: 'photographic_style', details: 'Main image must be photographic, not a stylized illustration.' });
    }
    if (metadata.productRatio >= 0.85 && metadata.productRatio <= 0.86) {
      warnings.push('Product ratio is compliant but close to the lower bound.');
    }
  } else {
    const claimText = [
      ...metadata.medicalClaims,
      ...metadata.superlativeClaims,
      ...metadata.textOverlays,
    ].join(' ').toLowerCase();
    if (/(cure|treat|heal|medical|prevents disease)/i.test(claimText)) {
      violations.push({ rule: 'medical_claims', details: 'A+ and gallery images must not contain unsupported medical claims.' });
    }
    if (metadata.thirdPartyBrands.length > 0) {
      violations.push({ rule: 'third_party_brand', details: 'Do not mention third-party brands in A+ or gallery image copy.' });
    }
    if (metadata.customerReviewQuotes.length > 0) {
      violations.push({ rule: 'review_quote', details: 'Customer reviews or ratings citations are not allowed in A+ image copy.' });
    }
    if (/(#1|number one|best in the world|guaranteed best)/i.test(claimText)) {
      violations.push({ rule: 'unverified_superlative', details: 'Unverified superlative claims are not allowed.' });
    }
    if (metadata.width < 970 || metadata.height < 300) {
      warnings.push('A+ or gallery image may be too small for high-quality placement.');
    }
  }

  const passes = violations.length === 0;
  return {
    passes,
    violations,
    warnings,
    autoFixAvailable: autoFixActions.length > 0,
    auto_fix_available: autoFixActions.length > 0,
    autoFixActions,
    auto_fix_actions: autoFixActions,
    confidence: roundCurrency(Math.max(0.35, 0.9 - violations.length * 0.12 - warnings.length * 0.03), 2),
    sourceMode: 'mock_deterministic',
  };
}

export function getCategoryTemplate(category = 'general', input = {}) {
  const normalized = normalizeCategory(category);
  const template = M1_CATEGORY_TEMPLATES[normalized] || M1_CATEGORY_TEMPLATES.general;
  return {
    ...clone(template),
    marketplace: input.marketplace || template.marketplace || 'US',
  };
}

export function listCategoryTemplates(input = {}) {
  return Object.keys(M1_CATEGORY_TEMPLATES)
    .filter((category) => input.includeGeneral !== false || category !== 'general')
    .map((category) => getCategoryTemplate(category, input));
}

export function validateCategoryTemplateRules(input = {}) {
  const {
    listing = {},
    product = {},
    category = product.category || listing.category || 'general',
    preferences = {},
  } = input;
  const template = getCategoryTemplate(category);
  const normalizedListing = normalizeListing(listing);
  const text = listingText(normalizedListing).toLowerCase();
  const missing = [];
  const satisfied = [];

  for (const item of template.mustHaveElements || []) {
    const matched = (item.patterns || []).some((pattern) => text.includes(String(pattern).toLowerCase()));
    const result = {
      id: item.id,
      label: item.label,
      severity: item.severity || 'minor',
      penalty: Number(item.penalty || 5),
      recommendation: recommendationForTemplateGap(item, template),
      dimension: item.dimension || categoryGapDimension(item.id),
      subDimension: item.subDimension || categoryGapSubDimension(item.id),
      location: item.location || categoryGapLocation(item.id),
    };
    if (matched) satisfied.push(result);
    else missing.push(result);
  }

  const forbiddenClaims = uniqueStrings([...(template.forbiddenClaims || []), ...(preferences.forbiddenClaims || [])]);
  const forbiddenHits = forbiddenClaims.filter((claim) => text.includes(claim.toLowerCase()));
  const penalty = missing.reduce((sum, item) => sum + item.penalty, 0) + forbiddenHits.length * 10;
  return {
    category: template.category,
    version: template.version,
    passes: missing.length === 0 && forbiddenHits.length === 0,
    satisfied,
    missing,
    forbiddenHits,
    penalty,
    scoreAdjustment: -penalty,
    scoringWeights: template.scoringWeights,
    template: {
      titleTemplate: template.titleTemplate,
      bulletSkeleton: template.bulletSkeleton,
      aPlusRecommendedModules: template.aPlusRecommendedModules,
    },
    confidence: roundCurrency(Math.max(0.5, 0.9 - missing.length * 0.07 - forbiddenHits.length * 0.1), 2),
    sourceMode: 'mock_deterministic',
  };
}

export function applyCategoryTemplate(listing = {}, input = {}) {
  const category = input.category || listing.category || 'general';
  const template = getCategoryTemplate(category);
  const normalizedListing = normalizeListing(listing);
  const audit = validateCategoryTemplateRules({ listing: normalizedListing, category, preferences: input.preferences || {} });
  return {
    category: template.category,
    listing: normalizedListing,
    titleHint: template.titleTemplate,
    bulletPrompts: template.bulletSkeleton.map((prompt, index) => ({
      field: `bullet_${index + 1}`,
      prompt,
      current: normalizedListing.bullets[index] || '',
    })),
    aPlusRecommendedModules: template.aPlusRecommendedModules,
    audit,
    sourceMode: 'mock_deterministic',
  };
}

export function calculateCategoryWeightedScore(dScores = {}, category = 'general') {
  const template = getCategoryTemplate(category);
  const weights = template.scoringWeights || M1_CATEGORY_TEMPLATES.general.scoringWeights;
  return roundCurrency(
    Object.entries(weights).reduce((total, [dimension, weight]) => total + Number(dScores[dimension] || 0) * Number(weight || 0), 0),
    1,
  );
}

export function checkTextCompliance(input = {}) {
  const text = String(input.text || '');
  const field = input.field || 'description';
  const category = normalizeCategory(input.category || 'general');
  const bannedWords = uniqueStrings(input.bannedWords || input.banned_words || []);
  const violations = [];
  const warnings = [];
  const maxLength = fieldMaxLength(field);

  if (text.length > maxLength) {
    violations.push({ rule: 'length', details: `${field} exceeds ${maxLength} characters.` });
  }
  if (bannedWords.some((word) => containsWord(text, word))) {
    violations.push({ rule: 'banned_words', details: 'Text contains a brand-defined banned word.' });
  }
  if (/#1 best|best ever|guaranteed best|100% guaranteed/i.test(text)) {
    violations.push({ rule: 'unverified_superlative', details: 'Text contains an unsupported absolute claim.' });
  }
  if (category === 'baby_products' && /100% safe|cures|prevents disease/i.test(text)) {
    violations.push({ rule: 'category_forbidden_claim', details: 'Baby category copy must avoid absolute safety or medical claims.' });
  }
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 20 && letters === letters.toUpperCase()) {
    violations.push({ rule: 'all_caps', details: 'Listing copy must not be all caps.' });
  }
  if (field === 'title' && !/^[A-Z0-9][A-Za-z0-9'&.-]+/.test(text)) {
    warnings.push('Title should start with a brand or recognizable product family.');
  }

  return {
    passes: violations.length === 0,
    violations,
    warnings,
  };
}

function mapListingScoreToDScores(dimensions = {}) {
  return {
    D1: roundCurrency(Number(dimensions.keywordCoverage || 0), 1),
    D2: roundCurrency(Number(dimensions.sellingPointClarity || 0), 1),
    D3: roundCurrency(Number(dimensions.painPointAlignment || 0), 1),
    D4: roundCurrency(Number(dimensions.visualAplus || 0), 1),
    D5: roundCurrency(Number(dimensions.conversionTriggers || 0), 1),
  };
}

function normalizeImprovement(item = {}, rank = 1) {
  const dimension = item.dimension || dimensionFromSubDimension(item.sub_dimension || item.subDimension) || 'sellingPointClarity';
  const subDimension = item.sub_dimension || item.subDimension || DIMENSION_TO_D_CODE[dimension] || 'D2.1';
  const location = item.location || defaultLocationForDimension(dimension);
  const expectedScoreLift = Number(item.expected_score_lift ?? item.expectedScoreLift ?? item.expectedLift ?? item.expected_lift ?? 5);
  const id = item.id || `m1-improvement-${rank}-${stableHash([dimension, subDimension, location]).slice(0, 6)}`;
  return {
    id,
    rank: Number(item.rank || rank),
    type: item.type || inferImprovementType({ ...item, subDimension, sub_dimension: subDimension, location, dimension }),
    dimension,
    subDimension,
    sub_dimension: subDimension,
    location,
    issue: item.issue || item.title || `Improve ${subDimension}`,
    direction: item.direction || item.title || item.rationale || `Strengthen ${dimension}.`,
    expectedScoreLift,
    expected_score_lift: expectedScoreLift,
    evidence: clone(item.evidence || []),
    currentScore: item.currentScore ?? item.current_score ?? null,
  };
}

function inferImprovementType(item = {}) {
  const type = item.type || item.proposalType;
  if (type === 'image' || type === 'mixed') return 'image';
  const text = `${item.dimension || ''} ${item.subDimension || item.sub_dimension || ''} ${item.location || ''}`.toLowerCase();
  if (text.includes('visual') || text.includes('d4') || text.includes('image') || text.includes('main') || text.includes('gallery') || text.includes('a+')) {
    return 'image';
  }
  return 'text';
}

function dimensionFromSubDimension(subDimension = '') {
  const prefix = String(subDimension).slice(0, 2).toUpperCase();
  return SCORE_DIMENSION_MAP[prefix] || null;
}

function defaultLocationForDimension(dimension = '') {
  if (dimension === 'keywordCoverage') return 'title';
  if (dimension === 'painPointAlignment') return 'bullet_3';
  if (dimension === 'visualAplus') return 'main_image';
  if (dimension === 'conversionTriggers') return 'bullet_5';
  return 'bullet_1';
}

function selectImprovement(improvements = [], input = {}) {
  if (input.improvement) return normalizeImprovement(input.improvement, input.improvement.rank || 1);
  if (input.improvementId) return improvements.find((item) => item.id === input.improvementId);
  if (input.selectedImprovementRank || input.selected_improvement_rank) {
    const rank = Number(input.selectedImprovementRank || input.selected_improvement_rank);
    return improvements.find((item) => Number(item.rank) === rank) || improvements[rank - 1];
  }
  if (input.selectedSubDimension || input.selected_sub_dimension) {
    const subDimension = input.selectedSubDimension || input.selected_sub_dimension;
    return improvements.find((item) => item.subDimension === subDimension || item.sub_dimension === subDimension);
  }
  return improvements[0] || null;
}

function normalizeListing(listing = {}) {
  const images = Array.isArray(listing.images) ? listing.images : [];
  const galleryImages = Array.isArray(listing.galleryImages)
    ? listing.galleryImages
    : Array.isArray(listing.gallery_images)
      ? listing.gallery_images
      : images.map((image) => (typeof image === 'string' ? image : image.url)).filter(Boolean);
  const mainImageUrl = listing.mainImageUrl
    || listing.main_image_url
    || listing.mainImage
    || (typeof images[0] === 'string' ? images[0] : images[0]?.url)
    || galleryImages[0]
    || null;
  return {
    ...clone(listing),
    productId: listing.productId || listing.product_id || null,
    asin: listing.asin || null,
    brand: listing.brand || null,
    title: listing.title || '',
    bullets: Array.isArray(listing.bullets) ? [...listing.bullets] : [],
    description: listing.description || '',
    aPlusModules: Array.isArray(listing.aPlusModules)
      ? clone(listing.aPlusModules)
      : Array.isArray(listing.a_plus_modules)
        ? clone(listing.a_plus_modules)
        : [],
    aPlusHtml: listing.aPlusHtml || listing.a_plus_html || '',
    mainImageUrl,
    galleryImages,
    images: galleryImages,
    videoUrl: listing.videoUrl || listing.video_url || null,
    category: listing.category || null,
  };
}

function extractTotalScore(diagnosis = {}) {
  return roundCurrency(Number(diagnosis.total_score ?? diagnosis.totalScore ?? diagnosis.total ?? diagnosis.score?.total ?? 0), 1);
}

function ensureFieldNotLocked(location, lockedFields = []) {
  const field = inferField(location);
  const locked = uniqueStrings(lockedFields).map((item) => inferField(item));
  if (locked.includes(field)) {
    throw new Error(`M1_LOCKED_FIELD: ${field}`);
  }
}

function inferField(location = '') {
  const value = String(location || '').toLowerCase().replace(/\s+/g, '_');
  if (value.includes('title')) return 'title';
  const bullet = value.match(/bullet[_#-]?(\d)/);
  if (bullet) return `bullet_${bullet[1]}`;
  if (value.includes('description')) return 'description';
  if (value.includes('main')) return 'main_image';
  if (value.includes('gallery')) return 'gallery_images';
  if (value.includes('a_plus') || value.includes('aplus') || value.includes('a+')) return 'a_plus_modules';
  if (value.includes('image')) return 'main_image';
  return value || 'description';
}

function readListingField(listing, field) {
  if (field === 'title') return listing.title;
  if (field.startsWith('bullet_')) {
    return listing.bullets[Number(field.split('_')[1]) - 1] || '';
  }
  if (field === 'description') return listing.description;
  if (field === 'main_image') return listing.mainImageUrl;
  if (field === 'gallery_images') return listing.galleryImages;
  if (field === 'a_plus_modules') return listing.aPlusModules;
  return listing[field];
}

function writeListingField(listing, field, value) {
  const next = clone(listing);
  if (field === 'title') next.title = String(value || '');
  else if (field.startsWith('bullet_')) {
    const index = Number(field.split('_')[1]) - 1;
    next.bullets = Array.isArray(next.bullets) ? [...next.bullets] : [];
    while (next.bullets.length <= index) next.bullets.push('');
    next.bullets[index] = String(value || '');
  } else if (field === 'description') {
    next.description = String(value || '');
  } else if (field === 'main_image') {
    next.mainImageUrl = String(value || '');
    next.galleryImages = Array.isArray(next.galleryImages) ? [...next.galleryImages] : [];
    if (next.galleryImages.length === 0) next.galleryImages.push(next.mainImageUrl);
    else next.galleryImages[0] = next.mainImageUrl;
    next.images = next.galleryImages;
  } else if (field === 'gallery_images') {
    next.galleryImages = Array.isArray(next.galleryImages) ? [...next.galleryImages, String(value || '')] : [String(value || '')];
    next.images = next.galleryImages;
  } else if (field === 'a_plus_modules') {
    next.aPlusModules = Array.isArray(next.aPlusModules) ? [...next.aPlusModules, value] : [value];
  } else {
    next[field] = value;
  }
  return next;
}

function chooseKeyword(searchTerms = [], fallback = 'product') {
  const sorted = [...searchTerms].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0) || Number(b.impressions || 0) - Number(a.impressions || 0));
  const term = sorted.find((item) => item.term)?.term || fallback.split(/\s+/).slice(0, 3).join(' ') || 'product';
  return cleanPhrase(term).toLowerCase();
}

function firstTitleToken(title = '') {
  return String(title).trim().split(/\s+/)[0] || '';
}

function deriveProposalPhrases({ improvement, template, keyword, feedback }) {
  const baseDirection = cleanPhrase(improvement.direction || improvement.issue || 'clear buyer benefit');
  const feedbackPhrase = feedback ? ` with ${cleanPhrase(feedback).toLowerCase()}` : '';
  const proofByCategory = {
    electronics_accessories: 'tested compatibility and clear technical specs',
    home_kitchen: 'material details and size guidance',
    baby_products: 'age guidance and safety-standard language',
    apparel: 'fit guidance, fabric detail, and care instructions',
    general: 'specific proof points and buyer-friendly details',
  };
  const useCaseByCategory = {
    electronics_accessories: 'daily charging, travel, and device protection',
    home_kitchen: 'organized everyday home use',
    baby_products: 'supervised daily care routines',
    apparel: 'everyday wear and easy styling',
    general: 'everyday use',
  };
  return {
    benefit: `${baseDirection.toLowerCase()}${feedbackPhrase}`,
    proof: proofByCategory[template.category] || proofByCategory.general,
    useCase: useCaseByCategory[template.category] || useCaseByCategory.general,
    keyword,
  };
}

function sanitizeText(text, bannedWords = []) {
  let result = String(text || '').replace(/\s+/g, ' ').trim();
  result = result.replace(/#1 best|best ever|guaranteed best/gi, 'trusted');
  for (const word of bannedWords) {
    if (!word) continue;
    result = result.replace(new RegExp(escapeRegExp(word), 'ig'), 'approved');
  }
  return result;
}

function fitText(text, field) {
  const max = fieldMaxLength(field);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}.`;
}

function fieldMaxLength(field) {
  if (field === 'title') return 200;
  if (String(field).startsWith('bullet_')) return 250;
  if (field === 'description') return 2000;
  return 500;
}

function containsWord(text, word) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(String(word).toLowerCase())}([^a-z0-9]|$)`, 'i').test(String(text || '').toLowerCase());
}

function deriveBadgePoints(improvement, template) {
  const direction = cleanPhrase(improvement.direction || improvement.issue || '');
  if (template.category === 'electronics_accessories') return ['Warranty', 'Tested Compatibility'].filter(Boolean);
  if (template.category === 'home_kitchen') return ['Material', 'Easy Care'];
  if (template.category === 'baby_products') return ['Age Guide', 'Tested Standard'];
  if (template.category === 'apparel') return ['Fit Guide', 'Fabric'];
  return direction ? [direction.slice(0, 28)] : ['Warranty'];
}

function normalizeImageType(type = 'main') {
  const value = String(type || 'main').toLowerCase();
  if (value.includes('a_plus') || value.includes('aplus') || value.includes('a+')) return 'a_plus';
  if (value.includes('gallery')) return 'gallery';
  if (value.includes('main')) return 'main';
  if (value === 'main_image') return 'main';
  return value;
}

function buildImagePrompt({ product = {}, imageType, candidate, badgePoints, brandColor, template, feedback }) {
  const productName = product.title || product.name || product.sku || 'product';
  const base = imageType === 'main'
    ? `Studio photograph of ${productName} on pure white seamless background`
    : `Amazon ${imageType} module for ${productName} using ${template.category} best practices`;
  const feedbackText = feedback ? ` Incorporate feedback: ${feedback}.` : '';
  return `${base}; ${candidate.placement}; highlight ${badgePoints.join(', ')}; brand color ${brandColor}; style ${candidate.style}.${feedbackText}`;
}

function normalizeDecisionAction(action = 'accept') {
  const value = String(action || 'accept').toLowerCase();
  if (value === 'adopt') return 'accept';
  if (value === 'micro_edit' || value === 'edit') return 'edit';
  if (value === 'regenerate') return 'regenerate';
  if (value === 'upload_own') return 'upload_own';
  if (['accept', 'rewrite', 'skip'].includes(value)) return value;
  throw new Error(`Unsupported M1 user decision action: ${action}`);
}

function findProposal(proposals = [], proposalId = 'A') {
  return proposals.find((proposal) => proposal.id === proposalId) || null;
}

function applyProposalToListing(input = {}) {
  const { improvement, proposal, decision, category, preferences } = input;
  let listing = clone(input.listing);
  const field = inferField(improvement.location || proposal.location);
  ensureFieldNotLocked(field, preferences.lockedFields || []);
  const before = readListingField(listing, field);
  let after;

  if ((proposal.proposalType || 'text') === 'image' || ['main_image', 'gallery_images', 'a_plus_modules'].includes(field)) {
    const imageMetadata = decision.editedImageMetadata || decision.uploadedImageMetadata || {
      ...(proposal.compliance_check?.metadata || {}),
      imageType: proposal.image_type || normalizeImageType(field),
      imageUrl: proposal.image_url,
      format: 'jpg',
      width: 2000,
      height: 2000,
      whiteBackground: normalizeImageType(field) === 'main',
      productRatio: 0.86,
      photographic: true,
      badgeOnly: true,
    };
    const compliance = checkImageCompliance(imageMetadata, { category, imageType: proposal.image_type || normalizeImageType(field) });
    if (!compliance.passes) {
      throw new Error(`M1_IMG_COMPLIANCE_FAIL: ${compliance.violations.map((item) => item.rule).join(',')}`);
    }
    after = decision.editedImageUrl || decision.uploadedImageUrl || decision.selectedImageUrl || proposal.image_url;
  } else {
    const text = decision.editedText || decision.edited_text || proposal.text;
    const compliance = checkTextCompliance({
      text,
      field,
      category,
      bannedWords: preferences.bannedWords || [],
    });
    if (!compliance.passes) {
      throw new Error(`M1_TEXT_COMPLIANCE_FAIL: ${compliance.violations.map((item) => item.rule).join(',')}`);
    }
    after = text;
  }

  listing = writeListingField(listing, field, after);
  return {
    listing,
    changes: [{
      field,
      old: clone(before),
      new: clone(after),
      rationale: proposal.rationale || improvement.direction,
      improvementId: improvement.id,
      proposalId: proposal.id,
    }],
  };
}

function estimateScoreLift({ action, expectedLift, selectedProposal, decision }) {
  if (action === 'skip') return 0;
  let lift = Number(expectedLift || 0);
  if (action === 'edit' || action === 'upload_own') lift = Math.max(1, lift - 1);
  if (selectedProposal?.compliance_check && selectedProposal.compliance_check.passes === false) lift = Math.max(0, lift - 3);
  if (decision.feedback && action !== 'rewrite') lift += 0.5;
  return roundCurrency(lift, 1);
}

function extractProposalValue(proposal, decision) {
  if ((proposal.proposalType || 'text') === 'image') {
    return decision.editedImageUrl || decision.uploadedImageUrl || decision.selectedImageUrl || proposal.image_url;
  }
  return decision.editedText || decision.edited_text || proposal.text;
}

function collectSessionChanges(session, latestChanges = []) {
  return [
    ...(session.rounds || []).flatMap((round) => round.changes || []),
    ...latestChanges,
  ].filter((change, index, list) => list.findIndex((item) => stableStringify(item) === stableStringify(change)) === index);
}

function maxVersionNumber(versions = []) {
  return versions.reduce((max, version) => Math.max(max, Number(version.versionNumber || version.version_number || 0)), 0);
}

function findVersion(versions = [], versionId) {
  if (!versionId) return null;
  return versions.find((version) => version.id === versionId) || null;
}

function latestDraftVersion(versions = []) {
  return [...versions]
    .filter((version) => version.status === 'draft')
    .sort((a, b) => Number(b.versionNumber || b.version_number || 0) - Number(a.versionNumber || a.version_number || 0))[0] || null;
}

function normalizeExperimentType(type = 'main_image') {
  const value = String(type).toLowerCase();
  if (value === 'main' || value === 'image' || value === 'main_image') return 'main_image';
  if (value === 'aplus' || value === 'a+' || value === 'a_plus') return 'a_plus';
  return value;
}

function normalizeExperimentMetrics(experiment, metrics, daysElapsed) {
  if (metrics?.control && metrics?.treatment) {
    return {
      control: normalizeMetricTotals(metrics.control),
      treatment: normalizeMetricTotals(metrics.treatment),
    };
  }
  if (Array.isArray(metrics)) {
    return metrics.reduce((totals, row) => ({
      control: addMetricTotals(totals.control, row.control || {}),
      treatment: addMetricTotals(totals.treatment, row.treatment || {}),
    }), { control: { sessions: 0, conversions: 0 }, treatment: { sessions: 0, conversions: 0 } });
  }
  return generateMockExperimentMetrics(experiment, daysElapsed);
}

function generateMockExperimentMetrics(experiment, daysElapsed) {
  const seed = Number.parseInt(stableHash(experiment.id).slice(0, 6), 16);
  const days = Math.max(1, Number(daysElapsed || 1));
  const controlSessions = days * (180 + (seed % 40));
  const treatmentSessions = days * (180 + ((seed >> 3) % 40));
  const controlCvr = 0.045 + ((seed % 7) / 1000);
  const controlScore = Number(experiment.controlVersion?.scoreSnapshot?.total || 60);
  const treatmentScore = Number(experiment.treatmentVersion?.scoreSnapshot?.total || controlScore + 5);
  const scoreDelta = Math.max(-15, Math.min(20, treatmentScore - controlScore));
  const treatmentCvr = controlCvr * (1 + (scoreDelta / 100));
  return {
    control: {
      sessions: controlSessions,
      conversions: Math.round(controlSessions * controlCvr),
    },
    treatment: {
      sessions: treatmentSessions,
      conversions: Math.round(treatmentSessions * treatmentCvr),
    },
  };
}

function normalizeMetricTotals(input = {}) {
  return {
    sessions: Number(input.sessions || input.visits || 0),
    conversions: Number(input.conversions || input.orders || 0),
    revenue: Number(input.revenue || input.sales || 0),
  };
}

function addMetricTotals(left = {}, right = {}) {
  const a = normalizeMetricTotals(left);
  const b = normalizeMetricTotals(right);
  return {
    sessions: a.sessions + b.sessions,
    conversions: a.conversions + b.conversions,
    revenue: a.revenue + b.revenue,
  };
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * value);
  const coefficients = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const y = 1 - (((((coefficients[4] * t + coefficients[3]) * t) + coefficients[2]) * t + coefficients[1]) * t + coefficients[0]) * t * Math.exp(-value * value);
  return sign * y;
}

function normalizeImageMetadata(imageMetadata = {}) {
  const width = Number(imageMetadata.width || imageMetadata.w || parseResolution(imageMetadata.resolution).width || 0);
  const height = Number(imageMetadata.height || imageMetadata.h || parseResolution(imageMetadata.resolution).height || 0);
  return {
    format: String(imageMetadata.format || imageMetadata.fileFormat || 'jpg').toLowerCase().replace('.', ''),
    width,
    height,
    whiteBackground: Boolean(imageMetadata.whiteBackground ?? imageMetadata.white_bg ?? imageMetadata.whiteBg ?? false),
    productRatio: Number(imageMetadata.productRatio ?? imageMetadata.product_ratio ?? 0),
    hasWatermark: Boolean(imageMetadata.hasWatermark ?? imageMetadata.watermark ?? false),
    hasLogo: Boolean(imageMetadata.hasLogo ?? imageMetadata.logo ?? false),
    hasText: Boolean(imageMetadata.hasText ?? false),
    badgeOnly: Boolean(imageMetadata.badgeOnly ?? false),
    badges: arrayify(imageMetadata.badges),
    textOverlays: arrayify(imageMetadata.textOverlays || imageMetadata.text_overlays),
    peopleCount: Number(imageMetadata.peopleCount || imageMetadata.people || 0),
    photographic: imageMetadata.photographic === undefined ? true : Boolean(imageMetadata.photographic),
    medicalClaims: arrayify(imageMetadata.medicalClaims || imageMetadata.medical_claims),
    thirdPartyBrands: arrayify(imageMetadata.thirdPartyBrands || imageMetadata.third_party_brands),
    customerReviewQuotes: arrayify(imageMetadata.customerReviewQuotes || imageMetadata.customer_review_quotes),
    superlativeClaims: arrayify(imageMetadata.superlativeClaims || imageMetadata.superlative_claims),
  };
}

function parseResolution(resolution = '') {
  const match = String(resolution).toLowerCase().match(/(\d+)\s*x\s*(\d+)/);
  if (!match) return { width: 0, height: 0 };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function recommendationForTemplateGap(item, template) {
  if (item.id?.includes('compatibility')) return 'Add exact compatible models in title, bullets, or A+ table.';
  if (item.id?.includes('certification')) return 'Add verified certification or tested standard language.';
  if (item.id?.includes('dimension') || item.id?.includes('size')) return 'Add exact dimensions and a gallery or A+ size diagram.';
  if (item.id?.includes('material') || item.id?.includes('fabric')) return 'Add material composition and buyer-safe usage details.';
  if (item.id?.includes('care') || item.id?.includes('wash')) return 'Add cleaning or care instructions.';
  if (item.id?.includes('age')) return 'Add an age range and use context.';
  return `Follow ${template.category} template rule: ${item.label}.`;
}

function categoryGapDimension(id = '') {
  if (/(compatibility|certification|technical|material|fabric|age)/i.test(id)) return 'sellingPointClarity';
  if (/(dimension|size|model|visual)/i.test(id)) return 'visualAplus';
  if (/(risk|warning|care|wash)/i.test(id)) return 'conversionTriggers';
  return 'sellingPointClarity';
}

function categoryGapSubDimension(id = '') {
  if (/(dimension|size|model|visual)/i.test(id)) return 'D4.2';
  if (/(risk|warning|care|wash)/i.test(id)) return 'D5.3';
  if (/(compatibility|technical)/i.test(id)) return 'D2.3';
  return 'D2.1';
}

function categoryGapLocation(id = '') {
  if (/(dimension|size|model|visual)/i.test(id)) return 'gallery_images';
  if (/(risk|warning|care|wash)/i.test(id)) return 'bullet_5';
  return 'bullet_1';
}

function listingText(listing) {
  return [
    listing.title,
    ...(listing.bullets || []),
    listing.description,
    listing.aPlusHtml,
    ...(listing.aPlusModules || []).map((module) => typeof module === 'string' ? module : stableStringify(module)),
  ].filter(Boolean).join(' ');
}

function normalizeCategory(category = 'general') {
  const value = String(category || 'general').toLowerCase().replace(/[\s-]+/g, '_');
  if (value === 'electronics' || value === 'electronic_accessories') return 'electronics_accessories';
  if (value === 'home' || value === 'kitchen' || value === 'home_and_kitchen') return 'home_kitchen';
  if (value === 'baby' || value === 'baby_product') return 'baby_products';
  if (value === 'clothing' || value === 'fashion') return 'apparel';
  return M1_CATEGORY_TEMPLATES[value] ? value : 'general';
}

function cleanPhrase(value = '') {
  return String(value || '')
    .replace(/[_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '');
}

function arrayify(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null).map(String);
  if (value === undefined || value === null || value === false) return [];
  if (value === true) return ['true'];
  return [String(value)];
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function stableHash(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
