export const promptRegistry = {
  'P-M2-LEAK-RECOMMEND': {
    module: 'M2',
    version: 1,
    purpose: 'Recommend how to fix a detected profit leak.',
    requiredContext: ['leak', 'product', 'profit'],
  },
  'P-M2-PROFIT-DROP-EXPLAIN': {
    module: 'M2',
    version: 1,
    purpose: 'Explain a SKU or store-level profit drop.',
    requiredContext: ['profitTrend', 'fees', 'ads', 'inventory'],
  },
  'P-M3-SUGGESTION-GENERATE': {
    module: 'M3',
    version: 1,
    purpose: 'Generate lifecycle-aware ad suggestions.',
    requiredContext: ['product', 'lifecycle', 'adMetrics', 'profit'],
  },
  'P-M3-IMPACT-ESTIMATE': {
    module: 'M3',
    version: 1,
    purpose: 'Estimate the impact of an ad action.',
    requiredContext: ['suggestion', 'history', 'profit'],
  },
  'P-M4-ANOMALY-RECOMMEND': {
    module: 'M4',
    version: 1,
    purpose: 'Recommend handling for an operational anomaly.',
    requiredContext: ['anomaly', 'product', 'recentSignals'],
  },
  'P-M4-REVIEW-CLUSTER-IMPROVEMENT': {
    module: 'M4',
    version: 1,
    purpose: 'Turn review clusters into product/listing/supply-chain actions.',
    requiredContext: ['clusters', 'product'],
  },
  'P-M4-COMPETITOR-INTERPRET': {
    module: 'M4',
    version: 1,
    purpose: 'Interpret competitor changes and route actions to M1/M2/M3.',
    requiredContext: ['changes', 'ourProduct', 'profit', 'ads'],
  },
  'P-M1-DIAGNOSE': {
    module: 'M1',
    version: 1,
    purpose: 'Diagnose listing score and prioritize improvements.',
    requiredContext: ['listing', 'searchTerms', 'reviews', 'competitors'],
  },
  'P-M1-PROPOSE': {
    module: 'M1',
    version: 1,
    purpose: 'Generate three listing rewrite proposals for an improvement point.',
    requiredContext: ['listing', 'improvement', 'categoryRules'],
  },
  'P-M1-IMG-COMPLIANCE': {
    module: 'M1',
    version: 1,
    purpose: 'Check listing image concepts against Amazon and product policy constraints.',
    requiredContext: ['imageMetadata', 'categoryRules'],
  },
};

export function getPrompt(promptId) {
  const prompt = promptRegistry[promptId];
  if (!prompt) throw new Error(`Unknown prompt: ${promptId}`);
  return { id: promptId, ...prompt };
}

export function listPrompts() {
  return Object.entries(promptRegistry).map(([id, prompt]) => ({ id, ...prompt }));
}
