import { createCodexLocalDecision } from '../packages/domain/src/ai-decision-engine.mjs';

const cases = [
  {
    name: 'M2 leak recommendation',
    input: {
      module: 'M2',
      promptId: 'P-M2-LEAK-RECOMMEND',
      subject: { id: 'leak-1', type: 'AD_PROFIT_ROAS_LOW', estimatedMonthlyImpact: 320, recommendation: 'Lower bids or pause campaign.' },
      evidence: ['Profit ROAS is below 1', 'Spend increased 30%'],
      constraints: { mockOnly: true },
    },
    expectAction: 'AD_PROFIT_ROAS_LOW',
  },
  {
    name: 'M3 ad suggestion',
    input: {
      module: 'M3',
      promptId: 'P-M3-SUGGESTION-GENERATE',
      subject: { id: 'sug-1', actionType: 'LOWER_BID_OR_PAUSE', expectedImpact: { metric: 'monthly_loss_avoided', change: 200, horizonDays: 30 } },
      evidence: [{ source: 'ads_metrics', value: { profitRoas: 0.8 } }],
    },
    expectAction: 'LOWER_BID_OR_PAUSE',
  },
  {
    name: 'M4 anomaly handling',
    input: {
      module: 'M4',
      promptId: 'P-M4-ANOMALY-RECOMMEND',
      subject: { id: 'ano-1', type: 'BUY_BOX_LOST', severity: 'P0', recommendedAction: 'Check price and hijacker signals immediately.' },
      evidence: ['Buy Box lost for 35 minutes'],
    },
    expectAction: 'BUY_BOX_LOST',
  },
  {
    name: 'M1 manual listing draft',
    input: {
      module: 'M1',
      promptId: 'P-M1-PROPOSE',
      subject: { id: 'imp-1', title: 'Add warranty and shockproof proof point', expectedLift: 8 },
      evidence: ['Missing warranty trigger', 'Competitor highlights 3-year warranty'],
    },
    expectAction: 'DRAFT_LISTING_IMPROVEMENT',
  },
];

for (const testCase of cases) {
  const decision = createCodexLocalDecision(testCase.input);
  if (decision.provider !== 'codex_local') throw new Error(`${testCase.name}: provider mismatch`);
  if (decision.actionType !== testCase.expectAction) throw new Error(`${testCase.name}: expected ${testCase.expectAction}, got ${decision.actionType}`);
  if (!decision.reasoning.evidence.length) throw new Error(`${testCase.name}: missing evidence`);
  if (decision.confidence < 0.35 || decision.confidence > 0.92) throw new Error(`${testCase.name}: bad confidence`);
  console.log(`ai-eval ok ${testCase.name}`);
}
