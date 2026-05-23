import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessFxRisk,
  buildCashflow90DayView,
  buildExportReportSummary,
  buildPurchaseOrderSummary,
  buildTaxAssistant,
  evaluateCustomAlerts,
  reconcileLightweightPurchaseOrder,
  simulateGlobalScenario,
  simulateSkuScenario,
  transitionLightweightPurchaseOrder,
  validateLightweightPoTransition,
} from '../../packages/domain/src/m2-advanced-engine.mjs';

test('lightweight purchase order state machine validates transitions and reconciles matched receipts', () => {
  const po = {
    id: 'po-1',
    poNumber: 'PO-2026-001',
    status: 'draft',
    items: [{ productId: 'p1', sku: 'SKU-1', quantity: 100 }],
    totals: { totalLandedCost: 1200, currency: 'CNY' },
    timeline: { createdAt: '2026-05-01T00:00:00.000Z' },
  };

  const ordered = transitionLightweightPurchaseOrder(po, 'ordered', { at: '2026-05-02', actor: 'buyer' });
  assert.equal(ordered.status, 'ordered');
  assert.equal(ordered.timeline.orderedAt, '2026-05-02T00:00:00.000Z');
  assert.ok(ordered.allowedNextStatuses.includes('in_transit'));

  const invalid = validateLightweightPoTransition(ordered, 'draft');
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.errorCode, 'M2_PO_INVALID_STATE');
  assert.throws(
    () => transitionLightweightPurchaseOrder(ordered, 'draft'),
    { code: 'M2_PO_INVALID_STATE' },
  );

  const inTransit = transitionLightweightPurchaseOrder(ordered, 'in_transit', { at: '2026-05-10' });
  const reconciled = reconcileLightweightPurchaseOrder(
    inTransit,
    [{ sku: 'SKU-1', receivedQuantity: 100 }],
    { at: '2026-06-01' },
  );

  assert.equal(reconciled.status, 'received');
  assert.equal(reconciled.reconciliation.status, 'matched');
  assert.equal(reconciled.linkedBatches[0].batchNumber, 'PO-2026-001-SKU-1');
  assert.equal(reconciled.linkedBatches[0].totalUnitCost, 12);

  const summary = buildPurchaseOrderSummary([ordered, reconciled]);
  assert.equal(summary.counts.ordered, 1);
  assert.equal(summary.counts.received, 1);
  assert.equal(summary.openValue, 1200);
});

test('buildCashflow90DayView creates deterministic 30/60/90 day balances and warnings', () => {
  const view = buildCashflow90DayView({
    asOf: '2026-05-01',
    startingCash: 1000,
    warningThreshold: 500,
    lockedAssets: { inTransit: 10000 },
    events: [
      { id: 'po-balance', date: '2026-05-03', direction: 'outflow', amount: 1200, eventType: 'po_balance' },
      { id: 'settlement-1', date: '2026-05-10', direction: 'inflow', amount: 500, eventType: 'amazon_settlement' },
      { id: 'settlement-2', date: '2026-06-15', direction: 'inflow', amount: 2000, eventType: 'amazon_settlement' },
      { id: 'storage', date: '2026-07-20', direction: 'outflow', amount: 300, eventType: 'storage_fee' },
      { id: 'outside-horizon', date: '2026-08-15', direction: 'outflow', amount: 999, eventType: 'ignored' },
    ],
  });

  assert.equal(view.timeline.length, 4);
  assert.equal(view.windows.find((item) => item.days === 30).endingCash, 300);
  assert.equal(view.windows.find((item) => item.days === 60).endingCash, 2300);
  assert.equal(view.windows.find((item) => item.days === 90).endingCash, 2000);
  assert.equal(view.summary.minCash.amount, -200);
  assert.ok(view.warnings.some((warning) => warning.code === 'NEGATIVE_CASHFLOW_7D' && warning.severity === 'P0'));
  assert.ok(view.warnings.some((warning) => warning.code === 'LOCKED_ASSET_RATIO_HIGH'));
});

test('scenario simulator compares baseline with adjusted price, ACOS and volume assumptions', () => {
  const baseline = {
    productId: 'p1',
    sku: 'SKU-1',
    price: 25,
    fxRate: 7,
    monthlyUnits: 100,
    unitCost: 45,
    unitFreight: 5,
    unitFulfillmentFee: 20,
    referralFeeRate: 0.15,
    acos: 0.2,
    returnRate: 0.05,
    fixedCosts: 1000,
    historyDays: 120,
    targetMargin: 0.12,
  };

  const result = simulateSkuScenario({
    baseline,
    adjustments: { priceChangePct: -0.1, acosDelta: 0.05 },
    horizonDays: 30,
  });

  assert.equal(result.scenario.price, 22.5);
  assert.ok(result.scenario.units > result.baseline.units);
  assert.ok(result.delta.netProfit < 0);
  assert.ok(result.scenario.breakEvenPrice > 0);
  assert.ok(result.riskFlags.some((risk) => risk.code === 'MARGIN_BELOW_TARGET'));

  const global = simulateGlobalScenario({
    skus: [baseline],
    adjustments: { priceChangePct: -0.1, replenishmentInvestment: 3000 },
    startingCash: 5000,
  });
  assert.equal(global.horizonResults.length, 3);
  assert.equal(global.horizonResults.find((item) => item.days === 90).replenishmentInvestment, 3000);
});

test('assessFxRisk calculates currency sensitivity and ACCS hidden fee warning', () => {
  const result = assessFxRisk({
    baseCurrency: 'CNY',
    rates: { USD: 7, EUR: 8 },
    highRiskAmount: 3000,
    exposures: [
      { id: 'usd-receivable', currency: 'USD', amount: 10000, kind: 'receivable', channel: 'accs' },
      { id: 'eur-payable', currency: 'EUR', amount: 1000, kind: 'payable' },
    ],
  });

  assert.equal(result.netExposureBase, 62000);
  assert.equal(result.grossExposureBase, 78000);
  assert.equal(result.atRisk.fivePercentDownsideBase, 3100);
  assert.ok(result.warnings.some((warning) => warning.code === 'FX_DOWNSIDE_HIGH'));
  assert.ok(result.warnings.some((warning) => warning.code === 'ACCS_HIDDEN_FEE_RISK' && warning.amountBase === 2450));
  assert.ok(result.suggestions.some((suggestion) => suggestion.code === 'AVOID_ACCS'));
});

test('buildTaxAssistant summarizes VAT, sales tax nexus, and import evidence prompts', () => {
  const result = buildTaxAssistant({
    baseCurrency: 'CNY',
    sales: [
      { country: 'DE', amount: 10000, currency: 'EUR', fxRate: 8, vatRate: 0.19, orderCount: 30 },
      { country: 'US', state: 'CA', amount: 450000, taxCollected: 32000, orderCount: 180 },
    ],
    purchases: [
      { id: 'PO-1', country: 'DE', inputVat: 1000, imported: true, invoiceUploaded: false },
    ],
    nexusThresholds: { CA: { sales: 500000, transactions: 200 } },
  });

  assert.equal(result.vatSummary[0].country, 'DE');
  assert.equal(result.vatSummary[0].outputVatBase, 15200);
  assert.equal(result.vatSummary[0].payableBase, 14200);
  assert.equal(result.salesTaxSummary[0].nexusStatus, 'approaching');
  assert.ok(result.prompts.some((prompt) => prompt.code === 'SALES_TAX_NEXUS_APPROACHING'));
  assert.ok(result.prompts.some((prompt) => prompt.code === 'INPUT_VAT_INVOICE_MISSING'));
});

test('evaluateCustomAlerts triggers duration based custom SKU rules', () => {
  const result = evaluateCustomAlerts({
    asOf: '2026-05-08',
    subjects: [{ id: 's1', sku: 'SKU-1', profit_margin: 0.12, ad_spend_30d: 620, owner: 'ops-1' }],
    history: {
      s1: [
        { date: '2026-05-06', profit_margin: 0.14, ad_spend_30d: 580 },
        { date: '2026-05-07', profit_margin: 0.13, ad_spend_30d: 600 },
      ],
    },
    rules: [
      {
        id: 'low_margin_with_spend',
        name: 'Low margin with spend',
        severity: 'P1',
        conditions: [
          'sku.profit_margin < 0.15',
          { condition: 'sku.ad_spend_30d > 500' },
          { duration: '3d' },
        ],
        actions: [{ notify: ['owner'], channel: ['in_app'] }],
      },
      { id: 'disabled', enabled: false, conditions: ['sku.profit_margin < 1'] },
    ],
  });

  assert.equal(result.triggered, true);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].ruleId, 'low_margin_with_spend');
  assert.equal(result.alerts[0].durationDays, 3);
  assert.equal(result.skippedDisabled, 1);
});

test('buildExportReportSummary includes advanced M2 sections and totals', () => {
  const cashflow = buildCashflow90DayView({
    asOf: '2026-05-08',
    startingCash: 1000,
    events: [{ id: 'fee', date: '2026-05-09', direction: 'outflow', amount: 1200 }],
  });
  const fxRisk = assessFxRisk({
    rates: { USD: 7 },
    exposures: [{ currency: 'USD', amount: 1000, kind: 'receivable' }],
  });
  const taxAssistant = buildTaxAssistant({
    sales: [{ country: 'US', state: 'CA', amount: 1000, taxCollected: 80, orderCount: 5 }],
  });
  const alertEvaluation = evaluateCustomAlerts({
    asOf: '2026-05-08',
    subjects: [{ id: 's1', profit_margin: 0.1 }],
    rules: [{ id: 'margin', conditions: ['profit_margin < 0.15'] }],
  });

  const report = buildExportReportSummary({
    asOf: '2026-05-08',
    format: 'pdf',
    profitOverview: { overview: { netProfit: 1234 }, orders: [{}, {}] },
    cashflowView: cashflow,
    purchaseOrders: [{ status: 'ordered', totals: { totalLandedCost: 500 } }],
    scenarioResults: { skuScenarios: [{ sku: 'SKU-1' }] },
    fxRisk,
    taxAssistant,
    alertEvaluation,
  });

  assert.equal(report.reportId, 'M2-EXPORT-2026-05-08-PDF');
  assert.equal(report.sections.find((section) => section.name === 'profit_overview').rows, 2);
  assert.equal(report.sections.find((section) => section.name === 'cashflow_90d').rows, 1);
  assert.equal(report.totals.netProfit, 1234);
  assert.equal(report.totals.purchaseOrderOpenValue, 500);
  assert.equal(report.totals.triggeredAlerts, 1);
  assert.ok(report.warnings.some((warning) => warning.code === 'CUSTOM_ALERT_TRIGGERED'));
});
