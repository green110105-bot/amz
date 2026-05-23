import { roundCurrency } from './profit-engine.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AS_OF = '2026-05-01';
const DEFAULT_BASE_CURRENCY = 'CNY';

export const LIGHTWEIGHT_PO_STATES = Object.freeze([
  'draft',
  'ordered',
  'in_transit',
  'received',
  'cancelled',
  'disputed',
]);

const LIGHTWEIGHT_TRANSITIONS = Object.freeze({
  draft: ['ordered', 'cancelled'],
  ordered: ['in_transit', 'received', 'cancelled', 'disputed'],
  in_transit: ['received', 'cancelled', 'disputed'],
  received: ['disputed'],
  disputed: ['ordered', 'in_transit', 'received', 'cancelled'],
  cancelled: [],
});

const TIMELINE_FIELD_BY_STATUS = Object.freeze({
  draft: 'createdAt',
  ordered: 'orderedAt',
  in_transit: 'inTransitAt',
  received: 'receivedAt',
  cancelled: 'cancelledAt',
  disputed: 'disputedAt',
});

const VAT_COUNTRIES = new Set(['AT', 'BE', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'IE', 'IT', 'NL', 'PL', 'SE', 'UK']);

export function getAllowedLightweightPoTransitions(status) {
  return [...(LIGHTWEIGHT_TRANSITIONS[normalizeStatus(status)] || [])];
}

export function validateLightweightPoTransition(poOrStatus, nextStatus) {
  const currentStatus = normalizeStatus(typeof poOrStatus === 'string' ? poOrStatus : poOrStatus?.status);
  const normalizedNext = normalizeStatus(nextStatus);

  if (!LIGHTWEIGHT_PO_STATES.includes(currentStatus)) {
    return {
      allowed: false,
      currentStatus,
      nextStatus: normalizedNext,
      errorCode: 'M2_PO_INVALID_STATE',
      reason: `Unknown current PO status: ${currentStatus}`,
    };
  }

  if (!LIGHTWEIGHT_PO_STATES.includes(normalizedNext)) {
    return {
      allowed: false,
      currentStatus,
      nextStatus: normalizedNext,
      errorCode: 'M2_PO_INVALID_STATE',
      reason: `Unknown next PO status: ${normalizedNext}`,
    };
  }

  if (currentStatus === normalizedNext) {
    return {
      allowed: true,
      noOp: true,
      currentStatus,
      nextStatus: normalizedNext,
      allowedNext: getAllowedLightweightPoTransitions(currentStatus),
    };
  }

  const allowed = getAllowedLightweightPoTransitions(currentStatus).includes(normalizedNext);
  return {
    allowed,
    currentStatus,
    nextStatus: normalizedNext,
    allowedNext: getAllowedLightweightPoTransitions(currentStatus),
    errorCode: allowed ? null : 'M2_PO_INVALID_STATE',
    reason: allowed
      ? 'Transition is allowed.'
      : `Cannot transition lightweight PO from ${currentStatus} to ${normalizedNext}.`,
  };
}

export function transitionLightweightPurchaseOrder(po, nextStatus, options = {}) {
  const validation = validateLightweightPoTransition(po, nextStatus);
  if (!validation.allowed) {
    const error = new Error(validation.reason);
    error.code = validation.errorCode;
    error.validation = validation;
    throw error;
  }

  const at = normalizeDateTime(options.at || po?.updatedAt || po?.createdAt || DEFAULT_AS_OF);
  const timeline = { ...(po.timeline || {}) };
  const timelineField = TIMELINE_FIELD_BY_STATUS[validation.nextStatus];
  if (timelineField && !timeline[timelineField]) {
    timeline[timelineField] = at;
  }

  const event = {
    at,
    from: validation.currentStatus,
    to: validation.nextStatus,
    actor: options.actor || 'system',
    note: options.note || null,
    source: options.source || 'm2_advanced_engine',
  };

  return {
    ...po,
    statusMode: 'lightweight',
    status: validation.nextStatus,
    timeline,
    events: [...(po.events || []), event],
    allowedNextStatuses: getAllowedLightweightPoTransitions(validation.nextStatus),
  };
}

export function reconcileLightweightPurchaseOrder(po, receivedItems = [], options = {}) {
  const status = normalizeStatus(po?.status);
  if (status === 'draft' || status === 'cancelled') {
    const error = new Error(`Cannot reconcile lightweight PO from ${status}.`);
    error.code = 'M2_PO_INVALID_STATE';
    throw error;
  }

  const items = Array.isArray(po.items) ? po.items : [];
  const receivedByKey = normalizeReceivedItems(receivedItems);
  const tolerance = toNumber(options.quantityTolerance, 0);
  const expectedQty = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const itemResults = items.map((item, index) => {
    const key = item.sku || item.productId || item.id || String(index);
    const received = receivedByKey.get(key) || {};
    const receivedQty = toNumber(received.receivedQuantity ?? received.quantity);
    const damagedQty = toNumber(received.damagedQuantity);
    const missingQty = Math.max(0, toNumber(item.quantity) - receivedQty - damagedQty);
    return {
      productId: item.productId || null,
      sku: item.sku || null,
      expectedQuantity: toNumber(item.quantity),
      receivedQuantity: receivedQty,
      damagedQuantity: damagedQty,
      missingQuantity: missingQty,
      matched: missingQty <= tolerance && damagedQty <= tolerance,
    };
  });

  const receivedQty = itemResults.reduce((sum, item) => sum + item.receivedQuantity, 0);
  const damagedQty = itemResults.reduce((sum, item) => sum + item.damagedQuantity, 0);
  const missingQty = itemResults.reduce((sum, item) => sum + item.missingQuantity, 0);
  const matched = itemResults.every((item) => item.matched);
  const nextStatus = matched ? 'received' : 'disputed';
  const transitioned = transitionLightweightPurchaseOrder(po, nextStatus, {
    at: options.at,
    actor: options.actor || 'system',
    note: matched ? 'Auto reconciliation matched expected quantities.' : 'Auto reconciliation found quantity differences.',
  });

  const reconciliation = {
    status: matched ? 'matched' : 'disputed',
    expectedQuantity: expectedQty,
    receivedQuantity: receivedQty,
    damagedQuantity: damagedQty,
    missingQuantity: missingQty,
    itemResults,
    errorCode: matched ? null : 'M2_PO_RECONCILE_MISMATCH',
  };

  return {
    ...transitioned,
    reconciliation,
    linkedBatches: matched ? buildPurchaseBatches(po, itemResults, options) : [],
  };
}

export function buildPurchaseOrderSummary(purchaseOrders = []) {
  const counts = Object.fromEntries(LIGHTWEIGHT_PO_STATES.map((status) => [status, 0]));
  let totalLandedCost = 0;
  let inTransitValue = 0;
  let openValue = 0;

  for (const po of purchaseOrders) {
    const status = normalizeStatus(po.status);
    const value = totalPoCost(po);
    counts[status] = (counts[status] || 0) + 1;
    totalLandedCost += value;
    if (status === 'in_transit') inTransitValue += value;
    if (!['received', 'cancelled'].includes(status)) openValue += value;
  }

  return {
    total: purchaseOrders.length,
    counts,
    openCount: purchaseOrders.filter((po) => !['received', 'cancelled'].includes(normalizeStatus(po.status))).length,
    totalLandedCost: roundCurrency(totalLandedCost),
    inTransitValue: roundCurrency(inTransitValue),
    openValue: roundCurrency(openValue),
    disputedCount: counts.disputed || 0,
  };
}

export function buildCashflow90DayView(input = {}) {
  const asOf = dateOnly(input.asOf || DEFAULT_AS_OF);
  const baseCurrency = input.baseCurrency || DEFAULT_BASE_CURRENCY;
  const rates = input.rates || {};
  const horizonDays = Math.min(90, Math.max(1, Math.trunc(toNumber(input.horizonDays, 90))));
  const startDate = parseDate(asOf);
  const endDate = addDays(startDate, horizonDays);
  const startingCash = roundCurrency(input.startingCash);

  const timeline = (input.events || [])
    .map((event, index) => normalizeCashflowEvent(event, index, baseCurrency, rates))
    .filter((event) => {
      const eventDate = parseDate(event.date);
      return eventDate >= startDate && eventDate <= endDate;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  let runningCash = startingCash;
  let minCash = { date: asOf, amount: startingCash };
  const enrichedTimeline = timeline.map((event) => {
    runningCash = roundCurrency(runningCash + event.signedAmount);
    if (runningCash < minCash.amount) {
      minCash = { date: event.date, amount: runningCash };
    }
    return { ...event, runningCash };
  });

  const windows = [30, 60, 90].map((days) => summarizeCashflowWindow(enrichedTimeline, startingCash, asOf, days));
  const lockedAssets = sumObjectValues(input.lockedAssets || {});
  const totalCapital = Math.max(0, lockedAssets + Math.max(0, windows[2].endingCash));
  const lockedAssetRatio = totalCapital === 0 ? 0 : roundCurrency(lockedAssets / totalCapital, 4);
  const warnings = buildCashflowWarnings({
    timeline: enrichedTimeline,
    asOf,
    minCash,
    warningThreshold: toNumber(input.warningThreshold, 0),
    lockedAssetRatio,
    lockedAssetWarningRatio: toNumber(input.lockedAssetWarningRatio, 0.8),
  });

  return {
    asOf,
    horizonDays,
    baseCurrency,
    startingCash,
    timeline: enrichedTimeline,
    windows,
    summary: {
      projectedEndingCash: windows[2].endingCash,
      minCash,
      totalInflow90d: windows[2].inflow,
      totalOutflow90d: windows[2].outflow,
      netCashflow90d: windows[2].netCashflow,
      lockedAssets: roundCurrency(lockedAssets),
      lockedAssetRatio,
    },
    warnings,
    metadata: {
      sourceMode: 'mock_or_internal',
      confidence: timeline.some((event) => event.estimated) ? 0.82 : 0.92,
    },
  };
}

export function simulateSkuScenario(input = {}) {
  const baselineInput = input.baseline || input;
  const adjustments = input.adjustments || input.scenario || {};
  const horizonDays = Math.max(1, Math.trunc(toNumber(input.horizonDays || adjustments.horizonDays, 30)));
  const baseCurrency = input.baseCurrency || baselineInput.baseCurrency || DEFAULT_BASE_CURRENCY;
  const baseline = computeScenarioCase(baselineInput, {}, { horizonDays, baseCurrency });
  const scenario = computeScenarioCase(baselineInput, adjustments, { horizonDays, baseCurrency });
  const targetMargin = toNumber(input.targetMargin ?? baselineInput.targetMargin, 0.15);

  const riskFlags = [];
  if (scenario.netProfit < 0) {
    riskFlags.push({ code: 'NEGATIVE_PROFIT', severity: 'P0', message: 'Scenario profit is negative.' });
  }
  if (scenario.profitMargin < targetMargin) {
    riskFlags.push({
      code: 'MARGIN_BELOW_TARGET',
      severity: 'P1',
      message: `Scenario margin ${formatPct(scenario.profitMargin)} is below target ${formatPct(targetMargin)}.`,
    });
  }
  if (scenario.acos > scenario.breakEvenAcos) {
    riskFlags.push({ code: 'ACOS_ABOVE_BREAK_EVEN', severity: 'P1', message: 'Scenario ACOS is above break-even ACOS.' });
  }

  return {
    productId: baselineInput.productId || baselineInput.id || null,
    sku: baselineInput.sku || null,
    horizonDays,
    baseCurrency,
    baseline,
    scenario,
    delta: {
      revenue: roundCurrency(scenario.revenue - baseline.revenue),
      netProfit: roundCurrency(scenario.netProfit - baseline.netProfit),
      profitMargin: roundCurrency(scenario.profitMargin - baseline.profitMargin, 4),
      units: roundCurrency(scenario.units - baseline.units, 2),
    },
    riskFlags,
    confidence: scenarioConfidence(baselineInput, adjustments),
  };
}

export function simulateGlobalScenario(input = {}) {
  const adjustments = input.adjustments || {};
  const horizons = input.horizons || [30, 60, 90];
  const skuScenarios = (input.skus || []).map((sku) => simulateSkuScenario({
    baseline: sku,
    adjustments,
    horizonDays: 30,
    baseCurrency: input.baseCurrency || DEFAULT_BASE_CURRENCY,
  }));

  const monthlyRevenue = sumValues(skuScenarios.map((item) => item.scenario.revenue));
  const monthlyProfit = sumValues(skuScenarios.map((item) => item.scenario.netProfit));
  const startingCash = toNumber(input.startingCash);
  const replenishmentInvestment = toNumber(adjustments.replenishmentInvestment ?? input.replenishmentInvestment);

  const horizonResults = horizons.map((days) => {
    const scale = toNumber(days) / 30;
    const invested = replenishmentInvestment * Math.min(1, toNumber(days) / 90);
    return {
      days: toNumber(days),
      revenue: roundCurrency(monthlyRevenue * scale),
      netProfit: roundCurrency(monthlyProfit * scale),
      projectedCash: roundCurrency(startingCash + monthlyProfit * scale - invested),
      replenishmentInvestment: roundCurrency(invested),
    };
  });

  return {
    baseCurrency: input.baseCurrency || DEFAULT_BASE_CURRENCY,
    skuScenarios,
    horizonResults,
    riskFlags: [
      ...skuScenarios.flatMap((item) => item.riskFlags.map((risk) => ({ ...risk, sku: item.sku }))),
      ...horizonResults
        .filter((item) => item.projectedCash < 0)
        .map((item) => ({ code: 'NEGATIVE_PROJECTED_CASH', severity: 'P0', horizonDays: item.days })),
    ],
  };
}

export function assessFxRisk(input = {}) {
  const baseCurrency = input.baseCurrency || DEFAULT_BASE_CURRENCY;
  const rates = input.rates || {};
  const sensitivityPercents = input.sensitivityPercents || [-0.05, -0.03, -0.01, 0.01, 0.03, 0.05];
  const hiddenAccsFeeRate = toNumber(input.hiddenAccsFeeRate, 0.035);
  const exposures = (input.exposures || []).map((exposure, index) => normalizeFxExposure(exposure, index, baseCurrency, rates));
  const exposuresByCurrency = groupFxExposures(exposures);
  const netExposureBase = roundCurrency(exposures.reduce((sum, item) => sum + item.signedAmountBase, 0));
  const grossExposureBase = roundCurrency(exposures.reduce((sum, item) => sum + Math.abs(item.signedAmountBase), 0));
  const sensitivities = sensitivityPercents.map((changePct) => ({
    changePct: roundCurrency(changePct, 4),
    impactBase: roundCurrency(netExposureBase * changePct),
  }));
  const downside = Math.abs(Math.min(0, ...sensitivities.map((item) => item.impactBase)));
  const accsExposureBase = sumValues(exposures
    .filter((item) => item.channel === 'accs' || item.channel === 'amazon_currency_converter')
    .map((item) => Math.abs(item.signedAmountBase)));

  const warnings = [];
  if (downside >= toNumber(input.highRiskAmount, 50000)) {
    warnings.push({ code: 'FX_DOWNSIDE_HIGH', severity: 'P1', amountBase: roundCurrency(downside) });
  } else if (downside >= toNumber(input.mediumRiskAmount, 10000)) {
    warnings.push({ code: 'FX_DOWNSIDE_MEDIUM', severity: 'P2', amountBase: roundCurrency(downside) });
  }
  if (accsExposureBase > 0) {
    warnings.push({
      code: 'ACCS_HIDDEN_FEE_RISK',
      severity: 'P1',
      amountBase: roundCurrency(accsExposureBase * hiddenAccsFeeRate),
    });
  }

  return {
    baseCurrency,
    netExposureBase,
    grossExposureBase,
    exposuresByCurrency,
    sensitivities,
    atRisk: {
      downsideBase: roundCurrency(downside),
      fivePercentDownsideBase: roundCurrency(Math.abs(Math.min(0, netExposureBase * -0.05))),
    },
    warnings,
    suggestions: buildFxSuggestions(exposuresByCurrency, accsExposureBase),
    metadata: { sourceMode: 'mock_or_internal', confidence: exposures.some((item) => item.estimatedRate) ? 0.76 : 0.9 },
  };
}

export function buildTaxAssistant(input = {}) {
  const baseCurrency = input.baseCurrency || DEFAULT_BASE_CURRENCY;
  const rates = input.rates || {};
  const sales = (input.sales || input.salesByJurisdiction || []).map((sale, index) => normalizeTaxSale(sale, index, baseCurrency, rates));
  const purchases = input.purchases || [];
  const vatRates = input.vatRates || {};
  const nexusThresholds = input.nexusThresholds || {};
  const prompts = [];

  const vatSummary = buildVatSummary(sales, purchases, vatRates, prompts);
  const salesTaxSummary = buildSalesTaxSummary(sales, nexusThresholds, prompts);

  for (const purchase of purchases) {
    if (purchase.imported && !purchase.hsCode) {
      prompts.push({
        code: 'HS_CODE_MISSING',
        severity: 'P2',
        message: `Purchase ${purchase.id || purchase.poNumber || 'unknown'} is missing HS code.`,
      });
    }
    if (purchase.country && VAT_COUNTRIES.has(normalizeCountry(purchase.country)) && !purchase.invoiceUploaded) {
      prompts.push({
        code: 'INPUT_VAT_INVOICE_MISSING',
        severity: 'P2',
        message: `Purchase ${purchase.id || purchase.poNumber || 'unknown'} is missing input VAT invoice evidence.`,
      });
    }
  }

  return {
    baseCurrency,
    vatSummary,
    salesTaxSummary,
    prompts: sortBySeverity(prompts),
    disclaimer: 'Tax assistant output is for reconciliation support only and is not tax filing advice.',
    metadata: { sourceMode: 'mock_or_internal', confidence: 0.84 },
  };
}

export function evaluateCustomAlerts(input = {}) {
  const asOf = dateOnly(input.asOf || DEFAULT_AS_OF);
  const rules = input.rules || [];
  const subjects = normalizeAlertSubjects(input.subjects ?? input.metrics);
  const alerts = [];
  let evaluatedCount = 0;
  let skippedDisabled = 0;

  for (const rule of rules) {
    if (rule.isEnabled === false || rule.enabled === false) {
      skippedDisabled += 1;
      continue;
    }

    const normalized = normalizeAlertRule(rule);
    for (const subject of subjects) {
      evaluatedCount += 1;
      const evidence = normalized.conditions.map((condition) => evaluateAlertCondition(subject, condition));
      const currentPass = evidence.every((item) => item.passed);
      const durationStreakDays = currentPass
        ? countAlertDurationDays(subject, normalized.conditions, input.history || {}, asOf)
        : 0;
      const durationMet = durationStreakDays >= normalized.durationDays;

      if (currentPass && durationMet) {
        alerts.push({
          id: `${normalized.id}:${subject.id || subject.sku || subject.name || evaluatedCount}`,
          ruleId: normalized.id,
          name: normalized.name,
          subjectId: subject.id || subject.productId || subject.sku || null,
          sku: subject.sku || null,
          severity: normalized.severity,
          triggeredAt: asOf,
          durationDays: normalized.durationDays,
          evidence,
          actions: normalized.actions,
          message: renderAlertMessage(normalized, subject),
        });
      }
    }
  }

  return {
    asOf,
    triggered: alerts.length > 0,
    alerts: sortBySeverity(alerts),
    evaluatedCount,
    skippedDisabled,
    metadata: { sourceMode: 'mock_or_internal', confidence: 0.88 },
  };
}

export function buildExportReportSummary(input = {}) {
  const asOf = dateOnly(input.asOf || DEFAULT_AS_OF);
  const format = String(input.format || 'xlsx').toLowerCase();
  const cashflow = input.cashflowView || input.cashflow || null;
  const purchaseOrderSummary = input.purchaseOrderSummary || buildPurchaseOrderSummary(input.purchaseOrders || []);
  const fxRisk = input.fxRisk || null;
  const taxAssistant = input.taxAssistant || input.tax || null;
  const alertEvaluation = input.alertEvaluation || null;
  const scenarioResults = input.scenarioResults || input.scenario || null;
  const profitOverview = input.profitOverview || null;

  const sections = [
    makeReportSection('profit_overview', profitRows(profitOverview), profitOverview ? 'ready' : 'empty'),
    makeReportSection('cashflow_90d', cashflow?.timeline?.length || 0, cashflow ? 'ready' : 'empty'),
    makeReportSection('purchase_orders', purchaseOrderSummary.total || 0, purchaseOrderSummary.total ? 'ready' : 'empty'),
    makeReportSection('scenario_simulation', scenarioRows(scenarioResults), scenarioResults ? 'ready' : 'empty'),
    makeReportSection('fx_risk', fxRisk?.exposuresByCurrency?.length || 0, fxRisk ? 'ready' : 'empty'),
    makeReportSection('tax_assistant', taxRows(taxAssistant), taxAssistant ? 'ready' : 'empty'),
    makeReportSection('custom_alerts', alertEvaluation?.alerts?.length || 0, alertEvaluation ? 'ready' : 'empty'),
  ];

  const warnings = [
    ...(cashflow?.warnings || []),
    ...(fxRisk?.warnings || []),
    ...(taxAssistant?.prompts || []),
    ...(alertEvaluation?.alerts || []).map((alert) => ({
      code: 'CUSTOM_ALERT_TRIGGERED',
      severity: alert.severity,
      message: alert.message,
    })),
  ];

  return {
    reportId: `M2-EXPORT-${asOf}-${format.toUpperCase()}`,
    asOf,
    format,
    sections,
    totals: {
      netProfit: roundCurrency(profitOverview?.overview?.netProfit ?? profitOverview?.netProfit),
      projectedCash90d: roundCurrency(cashflow?.summary?.projectedEndingCash),
      purchaseOrderOpenValue: roundCurrency(purchaseOrderSummary.openValue),
      fxDownsideBase: roundCurrency(fxRisk?.atRisk?.downsideBase),
      vatPayableBase: roundCurrency(sumValues((taxAssistant?.vatSummary || []).map((item) => item.payableBase))),
      triggeredAlerts: alertEvaluation?.alerts?.length || 0,
    },
    warnings: sortBySeverity(warnings),
    metadata: {
      sourceMode: 'mock_or_internal',
      generatedAt: asOf,
      deterministic: true,
    },
  };
}

function normalizeStatus(status) {
  return String(status || 'draft').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeDateTime(value) {
  const text = String(value || DEFAULT_AS_OF);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  return new Date(text).toISOString();
}

function normalizeReceivedItems(receivedItems) {
  const map = new Map();
  if (!Array.isArray(receivedItems) && receivedItems && typeof receivedItems === 'object') {
    for (const [key, value] of Object.entries(receivedItems)) {
      map.set(key, typeof value === 'object' ? value : { quantity: value });
    }
    return map;
  }

  for (const item of receivedItems || []) {
    for (const key of [item.sku, item.productId, item.id].filter(Boolean)) {
      map.set(key, item);
    }
  }
  return map;
}

function buildPurchaseBatches(po, itemResults, options) {
  const totalExpected = itemResults.reduce((sum, item) => sum + item.expectedQuantity, 0);
  const unitLandedCost = totalExpected === 0 ? 0 : totalPoCost(po) / totalExpected;
  const poNumber = sanitizeId(po.poNumber || po.id || 'PO');

  return itemResults.map((item, index) => ({
    batchNumber: `${poNumber}-${sanitizeId(item.sku || item.productId || index + 1)}`,
    productId: item.productId,
    sku: item.sku,
    quantityPurchased: item.expectedQuantity,
    quantityRemaining: item.receivedQuantity,
    totalUnitCost: roundCurrency(unitLandedCost, 4),
    currency: po.totals?.currency || po.currency || DEFAULT_BASE_CURRENCY,
    status: 'in_stock',
    arrivedAtFbaAt: dateOnly(options.at || DEFAULT_AS_OF),
  }));
}

function totalPoCost(po = {}) {
  const totals = po.totals || po;
  if (totals.totalLandedCost !== undefined) return roundCurrency(totals.totalLandedCost);
  return sumValues([
    totals.subtotal,
    totals.subtotalCny,
    totals.freight,
    totals.freightCost,
    totals.customs,
    totals.customsDuty,
    totals.inspectionFee,
    totals.inspection_fee,
    totals.otherCosts,
  ]);
}

function normalizeCashflowEvent(event, index, baseCurrency, rates) {
  const rawAmount = toNumber(event.amount ?? event.amountBase ?? event.amountCny);
  const direction = event.direction || (rawAmount < 0 ? 'outflow' : 'inflow');
  const amountBase = roundCurrency(Math.abs(convertToBase(
    event.amountBase ?? event.amountCny ?? rawAmount,
    event.amountBase !== undefined || event.amountCny !== undefined ? baseCurrency : event.currency,
    rates,
    baseCurrency,
    event.fxRate,
  )));
  const signedAmount = direction === 'outflow' ? -amountBase : amountBase;

  return {
    id: String(event.id || `${event.eventType || event.type || 'cashflow'}-${index + 1}`),
    date: dateOnly(event.occurredAt || event.scheduledAt || event.date || DEFAULT_AS_OF),
    eventType: event.eventType || event.type || 'cashflow_event',
    direction,
    amountBase,
    signedAmount,
    currency: event.currency || baseCurrency,
    status: event.status || (event.occurredAt ? 'actual' : 'projected'),
    relatedEntityType: event.relatedEntityType || null,
    relatedEntityId: event.relatedEntityId || null,
    estimated: Boolean(event.estimated),
    label: event.label || event.description || event.eventType || event.type || 'Cashflow event',
  };
}

function summarizeCashflowWindow(timeline, startingCash, asOf, days) {
  const cutoff = dateOnly(addDays(parseDate(asOf), days));
  const events = timeline.filter((event) => event.date <= cutoff);
  const inflow = sumValues(events.filter((event) => event.signedAmount > 0).map((event) => event.signedAmount));
  const outflow = Math.abs(sumValues(events.filter((event) => event.signedAmount < 0).map((event) => event.signedAmount)));
  const netCashflow = roundCurrency(inflow - outflow);
  return {
    days,
    endingDate: cutoff,
    inflow,
    outflow,
    netCashflow,
    endingCash: roundCurrency(startingCash + netCashflow),
  };
}

function buildCashflowWarnings({ timeline, asOf, minCash, warningThreshold, lockedAssetRatio, lockedAssetWarningRatio }) {
  const warnings = [];
  const sevenDayCutoff = dateOnly(addDays(parseDate(asOf), 7));
  const negativeInSevenDays = timeline.find((event) => event.date <= sevenDayCutoff && event.runningCash < 0);
  const negativeAnytime = timeline.find((event) => event.runningCash < 0);

  if (negativeInSevenDays) {
    warnings.push({ code: 'NEGATIVE_CASHFLOW_7D', severity: 'P0', date: negativeInSevenDays.date, amountBase: negativeInSevenDays.runningCash });
  } else if (negativeAnytime) {
    warnings.push({ code: 'NEGATIVE_CASHFLOW_90D', severity: 'P1', date: negativeAnytime.date, amountBase: negativeAnytime.runningCash });
  }
  if (warningThreshold > 0 && minCash.amount < warningThreshold) {
    warnings.push({ code: 'CASH_BELOW_THRESHOLD', severity: 'P1', date: minCash.date, amountBase: minCash.amount });
  }
  if (lockedAssetRatio >= lockedAssetWarningRatio) {
    warnings.push({ code: 'LOCKED_ASSET_RATIO_HIGH', severity: 'P1', ratio: lockedAssetRatio });
  }
  for (const event of timeline) {
    if (event.direction === 'inflow' && event.status === 'delayed') {
      warnings.push({ code: 'RECEIVABLE_DELAYED', severity: 'P1', date: event.date, relatedEntityId: event.relatedEntityId });
    }
  }
  return sortBySeverity(warnings);
}

function computeScenarioCase(baseline, adjustments, context) {
  const baseCurrency = context.baseCurrency;
  const horizonScale = context.horizonDays / 30;
  const rates = baseline.rates || {};
  const fxRate = toNumber(adjustments.fxRate ?? baseline.fxRate, 1);
  const basePrice = toNumber(baseline.price);
  const price = adjustments.price !== undefined
    ? toNumber(adjustments.price)
    : basePrice * (1 + toNumber(adjustments.priceChangePct ?? adjustments.priceDeltaPct));
  const baseMonthlyUnits = toNumber(baseline.monthlyUnits ?? baseline.units ?? baseline.monthlySalesUnits);
  const priceElasticity = toNumber(adjustments.priceElasticity ?? baseline.priceElasticity, -1.2);
  const priceRatio = basePrice > 0 ? price / basePrice : 1;
  const volumeMultiplier = adjustments.monthlyUnits !== undefined
    ? null
    : (1 + toNumber(adjustments.volumeChangePct)) * (1 + toNumber(adjustments.adSpendChangePct) * 0.35);
  const monthlyUnits = adjustments.monthlyUnits !== undefined
    ? toNumber(adjustments.monthlyUnits)
    : Math.max(0, baseMonthlyUnits * Math.pow(priceRatio, priceElasticity) * volumeMultiplier);
  const units = monthlyUnits * horizonScale;

  let acos = adjustments.acos !== undefined ? toNumber(adjustments.acos) : toNumber(baseline.acos);
  acos += toNumber(adjustments.acosDelta);
  acos *= 1 + toNumber(adjustments.acosChangePct);
  acos = clamp(acos, 0, 0.99);

  let returnRate = adjustments.returnRate !== undefined ? toNumber(adjustments.returnRate) : toNumber(baseline.returnRate);
  returnRate += toNumber(adjustments.returnRateDelta);
  returnRate = clamp(returnRate, 0, 0.99);

  const referralFeeRate = clamp(toNumber(adjustments.referralFeeRate ?? baseline.referralFeeRate, 0.15), 0, 0.99);
  const refundLossRate = clamp(toNumber(adjustments.refundLossRate ?? baseline.refundLossRate, 1), 0, 1);
  const taxRate = clamp(toNumber(adjustments.taxRate ?? baseline.taxRate), 0, 0.99);
  const unitCostBase = sumValues([
    convertToBase(baseline.unitCost, baseline.costCurrency, rates, baseCurrency, baseline.costFxRate),
    baseline.unitFreight,
    baseline.unitFulfillmentFee,
    baseline.otherUnitCost,
  ]);
  const fixedCosts = roundCurrency((toNumber(baseline.fixedCosts) + toNumber(adjustments.fixedCostChange)) * horizonScale);
  const priceBase = price * fxRate;
  const revenue = roundCurrency(priceBase * units);
  const adSpend = roundCurrency(revenue * acos);
  const referralFees = roundCurrency(revenue * referralFeeRate);
  const refundProvision = roundCurrency(revenue * returnRate * refundLossRate);
  const tax = roundCurrency(revenue * taxRate);
  const variableCosts = roundCurrency(unitCostBase * units);
  const netProfit = roundCurrency(revenue - adSpend - referralFees - refundProvision - variableCosts - fixedCosts - tax);
  const nonAdCosts = referralFees + refundProvision + variableCosts + fixedCosts + tax;
  const breakEvenAcos = revenue <= 0 ? 0 : clamp((revenue - nonAdCosts) / revenue, 0, 0.99);
  const perUnitFixed = units <= 0 ? 0 : fixedCosts / units;
  const priceDenominator = 1 - referralFeeRate - acos - returnRate * refundLossRate - taxRate;
  const breakEvenPrice = priceDenominator <= 0 || fxRate <= 0
    ? null
    : roundCurrency((unitCostBase + perUnitFixed) / priceDenominator / fxRate);

  return {
    price: roundCurrency(price),
    priceBase: roundCurrency(priceBase),
    units: roundCurrency(units, 2),
    revenue,
    adSpend,
    acos: roundCurrency(acos, 4),
    referralFees,
    refundProvision,
    returnRate: roundCurrency(returnRate, 4),
    variableCosts,
    fixedCosts,
    tax,
    netProfit,
    profitMargin: revenue === 0 ? 0 : roundCurrency(netProfit / revenue, 4),
    breakEvenAcos: roundCurrency(breakEvenAcos, 4),
    breakEvenPrice,
  };
}

function scenarioConfidence(baseline, adjustments) {
  let confidence = toNumber(baseline.historyDays) >= 90 ? 0.82 : 0.68;
  if (adjustments.monthlyUnits !== undefined) confidence += 0.04;
  if (Math.abs(toNumber(adjustments.priceChangePct)) > 0.2) confidence -= 0.08;
  return roundCurrency(clamp(confidence, 0.45, 0.92), 2);
}

function normalizeFxExposure(exposure, index, baseCurrency, rates) {
  const currency = exposure.currency || baseCurrency;
  const kind = exposure.kind || exposure.type || 'receivable';
  const sign = exposure.direction === 'payable' || kind === 'payable' || kind === 'purchase_cost' ? -1 : 1;
  const rate = exposure.fxRate ?? rates[currency] ?? (currency === baseCurrency ? 1 : undefined);
  const estimatedRate = rate === undefined;
  const amountBase = convertToBase(exposure.amount, currency, rates, baseCurrency, exposure.fxRate);
  return {
    id: exposure.id || `fx-${index + 1}`,
    currency,
    kind,
    amount: roundCurrency(exposure.amount),
    signedAmountBase: roundCurrency(amountBase * sign),
    channel: normalizeChannel(exposure.channel),
    estimatedRate,
  };
}

function groupFxExposures(exposures) {
  const grouped = new Map();
  for (const item of exposures) {
    const current = grouped.get(item.currency) || { currency: item.currency, amount: 0, netExposureBase: 0, grossExposureBase: 0 };
    current.amount += item.amount;
    current.netExposureBase += item.signedAmountBase;
    current.grossExposureBase += Math.abs(item.signedAmountBase);
    grouped.set(item.currency, current);
  }
  return [...grouped.values()]
    .map((item) => ({
      currency: item.currency,
      amount: roundCurrency(item.amount),
      netExposureBase: roundCurrency(item.netExposureBase),
      grossExposureBase: roundCurrency(item.grossExposureBase),
      fivePercentImpactBase: roundCurrency(item.netExposureBase * -0.05),
    }))
    .sort((a, b) => Math.abs(b.netExposureBase) - Math.abs(a.netExposureBase) || a.currency.localeCompare(b.currency));
}

function buildFxSuggestions(exposuresByCurrency, accsExposureBase) {
  const suggestions = [];
  const largest = exposuresByCurrency[0];
  if (largest && largest.netExposureBase > 0) {
    suggestions.push({
      code: 'CONVERT_PARTIAL_RECEIVABLES',
      message: `Consider converting part of ${largest.currency} receivables to reduce downside exposure.`,
    });
  } else if (largest && largest.netExposureBase < 0) {
    suggestions.push({
      code: 'NATURAL_HEDGE_PAYABLES',
      message: `Match ${largest.currency} receivables with supplier payables before converting.`,
    });
  }
  if (accsExposureBase > 0) {
    suggestions.push({ code: 'AVOID_ACCS', message: 'Review Amazon Currency Converter usage and compare third-party settlement channels.' });
  }
  return suggestions;
}

function buildVatSummary(sales, purchases, vatRates, prompts) {
  const byCountry = new Map();
  for (const sale of sales) {
    if (!VAT_COUNTRIES.has(sale.country) && vatRates[sale.country] === undefined) continue;
    const current = byCountry.get(sale.country) || {
      country: sale.country,
      salesBase: 0,
      outputVatBase: 0,
      inputVatBase: 0,
      payableBase: 0,
      orderCount: 0,
    };
    const rate = toNumber(sale.vatRate ?? vatRates[sale.country], 0);
    current.salesBase += sale.amountBase;
    current.outputVatBase += sale.taxCollectedBase > 0 ? sale.taxCollectedBase : sale.amountBase * rate;
    current.orderCount += sale.orderCount;
    byCountry.set(sale.country, current);
  }

  for (const purchase of purchases) {
    const country = normalizeCountry(purchase.country);
    if (!byCountry.has(country)) continue;
    const current = byCountry.get(country);
    current.inputVatBase += toNumber(purchase.inputVatBase ?? purchase.inputVat);
  }

  const summary = [...byCountry.values()].map((item) => {
    const outputVatBase = roundCurrency(item.outputVatBase);
    const inputVatBase = roundCurrency(item.inputVatBase);
    const payableBase = roundCurrency(Math.max(0, outputVatBase - inputVatBase));
    if (payableBase > 0) {
      prompts.push({ code: 'VAT_PAYABLE_REVIEW', severity: 'P2', country: item.country, amountBase: payableBase });
    }
    return {
      country: item.country,
      salesBase: roundCurrency(item.salesBase),
      outputVatBase,
      inputVatBase,
      payableBase,
      orderCount: item.orderCount,
      exportFormat: ['OSS', 'IOSS'].includes(item.country) ? item.country : 'OSS_COMPATIBLE',
    };
  });

  return summary.sort((a, b) => a.country.localeCompare(b.country));
}

function buildSalesTaxSummary(sales, nexusThresholds, prompts) {
  const byState = new Map();
  for (const sale of sales.filter((item) => item.country === 'US')) {
    const state = sale.state || 'UNKNOWN';
    const current = byState.get(state) || { state, salesBase: 0, taxCollectedBase: 0, orderCount: 0 };
    current.salesBase += sale.amountBase;
    current.taxCollectedBase += sale.taxCollectedBase;
    current.orderCount += sale.orderCount;
    byState.set(state, current);
  }

  return [...byState.values()]
    .map((item) => {
      const threshold = nexusThresholds[item.state] || {};
      const salesThreshold = toNumber(threshold.sales ?? threshold.amount, Infinity);
      const transactionThreshold = toNumber(threshold.transactions ?? threshold.orders, Infinity);
      const ratio = Math.max(safeRatio(item.salesBase, salesThreshold), safeRatio(item.orderCount, transactionThreshold));
      const nexusStatus = ratio >= 1 ? 'triggered' : ratio >= 0.8 ? 'approaching' : 'below';
      if (nexusStatus !== 'below') {
        prompts.push({
          code: nexusStatus === 'triggered' ? 'SALES_TAX_NEXUS_TRIGGERED' : 'SALES_TAX_NEXUS_APPROACHING',
          severity: nexusStatus === 'triggered' ? 'P1' : 'P2',
          state: item.state,
          ratio: roundCurrency(ratio, 4),
        });
      }
      return {
        state: item.state,
        salesBase: roundCurrency(item.salesBase),
        taxCollectedBase: roundCurrency(item.taxCollectedBase),
        orderCount: item.orderCount,
        nexusStatus,
        thresholdProgress: roundCurrency(ratio, 4),
        exportFormat: 'AVALARA_TAXJAR_COMPATIBLE',
      };
    })
    .sort((a, b) => a.state.localeCompare(b.state));
}

function normalizeTaxSale(sale, index, baseCurrency, rates) {
  const currency = sale.currency || baseCurrency;
  return {
    id: sale.id || `sale-${index + 1}`,
    country: normalizeCountry(sale.country || sale.marketplaceCountry || 'US'),
    state: sale.state || sale.jurisdiction || null,
    amountBase: convertToBase(sale.amount ?? sale.sales ?? sale.grossSales, currency, rates, baseCurrency, sale.fxRate),
    taxCollectedBase: convertToBase(sale.taxCollected ?? sale.salesTaxCollected ?? sale.vatCollected, currency, rates, baseCurrency, sale.fxRate),
    orderCount: toNumber(sale.orderCount ?? sale.orders, 1),
    vatRate: sale.vatRate,
  };
}

function normalizeAlertSubjects(metrics) {
  if (Array.isArray(metrics)) return metrics;
  if (Array.isArray(metrics?.skus)) return metrics.skus;
  if (Array.isArray(metrics?.subjects)) return metrics.subjects;
  return metrics ? [metrics] : [];
}

function normalizeAlertRule(rule) {
  const parsedConditions = [];
  let durationDays = toNumber(rule.durationDays, 1);
  for (const raw of rule.conditions || rule.when || []) {
    if (typeof raw === 'string') {
      parsedConditions.push(parseConditionString(raw));
      continue;
    }
    if (raw.duration || raw.durationDays) {
      durationDays = parseDurationDays(raw.duration || raw.durationDays);
      continue;
    }
    if (raw.condition) {
      parsedConditions.push(parseConditionString(raw.condition));
      continue;
    }
    parsedConditions.push({
      field: raw.field,
      operator: raw.operator || raw.op || '==',
      value: raw.value,
    });
  }

  return {
    id: rule.id || rule.name || 'custom_rule',
    name: rule.name || rule.id || 'Custom alert',
    severity: rule.severity || 'P1',
    durationDays: Math.max(1, durationDays),
    conditions: parsedConditions,
    actions: rule.actions || rule.then || [],
    messageTemplate: rule.messageTemplate || rule.message_template || null,
  };
}

function parseConditionString(condition) {
  const match = String(condition).trim().match(/^([\w.]+)\s*(<=|>=|==|!=|<|>)\s*(.+)$/);
  if (!match) {
    return { field: condition, operator: 'exists', value: true };
  }
  return {
    field: match[1],
    operator: match[2],
    value: parseConditionValue(match[3]),
  };
}

function parseConditionValue(value) {
  const trimmed = String(value).trim().replace(/^['"]|['"]$/g, '');
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

function evaluateAlertCondition(subject, condition) {
  const actual = readPath(subject, condition.field);
  const expected = condition.value;
  const operator = condition.operator || '==';
  let passed = false;
  if (operator === '<') passed = actual < expected;
  else if (operator === '<=') passed = actual <= expected;
  else if (operator === '>') passed = actual > expected;
  else if (operator === '>=') passed = actual >= expected;
  else if (operator === '==') passed = actual === expected;
  else if (operator === '!=') passed = actual !== expected;
  else if (operator === 'between') passed = Array.isArray(expected) && actual >= expected[0] && actual <= expected[1];
  else if (operator === 'in') passed = Array.isArray(expected) && expected.includes(actual);
  else if (operator === 'contains') passed = Array.isArray(actual) ? actual.includes(expected) : String(actual).includes(String(expected));
  else if (operator === 'exists') passed = actual !== undefined && actual !== null;

  return {
    field: condition.field,
    operator,
    expected,
    actual,
    passed,
  };
}

function countAlertDurationDays(subject, conditions, history, asOf) {
  const subjectId = subject.id || subject.productId || subject.sku || subject.name;
  const historyRows = Array.isArray(history)
    ? history.filter((row) => (row.subjectId || row.id || row.sku) === subjectId)
    : history[subjectId] || [];
  const rowsByDate = new Map(historyRows.map((row) => [dateOnly(row.date || row.asOf || DEFAULT_AS_OF), row]));
  rowsByDate.set(asOf, { ...subject, date: asOf });

  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const date = dateOnly(addDays(parseDate(asOf), -offset));
    const row = rowsByDate.get(date);
    if (!row) break;
    const passed = conditions.every((condition) => evaluateAlertCondition(row, condition).passed);
    if (!passed) break;
    streak += 1;
  }
  return streak;
}

function renderAlertMessage(rule, subject) {
  if (!rule.messageTemplate) {
    return `${rule.name} triggered for ${subject.sku || subject.id || subject.name || 'subject'}.`;
  }
  return rule.messageTemplate.replace(/\{([\w.]+)\}/g, (_, path) => String(readPath(subject, path) ?? ''));
}

function readPath(object, path) {
  const direct = readPathStrict(object, path);
  if (direct !== undefined) return direct;
  const stripped = String(path).replace(/^(sku|store|cashflow|fx|tax)\./, '');
  return readPathStrict(object, stripped);
}

function readPathStrict(object, path) {
  return String(path).split('.').reduce((current, key) => (current == null ? undefined : current[key]), object);
}

function makeReportSection(name, rows, status) {
  return {
    name,
    rows,
    status,
    sourceMode: 'mock_or_internal',
  };
}

function profitRows(profitOverview) {
  if (!profitOverview) return 0;
  if (Array.isArray(profitOverview.orders)) return profitOverview.orders.length;
  if (Array.isArray(profitOverview.skus)) return profitOverview.skus.length;
  return 1;
}

function scenarioRows(scenarioResults) {
  if (!scenarioResults) return 0;
  if (Array.isArray(scenarioResults.skuScenarios)) return scenarioResults.skuScenarios.length;
  if (scenarioResults.scenario) return 1;
  return 1;
}

function taxRows(taxAssistant) {
  if (!taxAssistant) return 0;
  return (taxAssistant.vatSummary?.length || 0) + (taxAssistant.salesTaxSummary?.length || 0);
}

function parseDurationDays(value) {
  if (typeof value === 'number') return value;
  const match = String(value).match(/^(\d+)/);
  return match ? Number(match[1]) : 1;
}

function parseDate(value) {
  if (value instanceof Date) return value;
  const text = String(value || DEFAULT_AS_OF);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return new Date(`${DEFAULT_AS_OF}T00:00:00.000Z`);
  return date;
}

function dateOnly(value) {
  return parseDate(value).toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function convertToBase(amount, currency = DEFAULT_BASE_CURRENCY, rates = {}, baseCurrency = DEFAULT_BASE_CURRENCY, explicitRate) {
  const normalizedCurrency = currency || baseCurrency;
  const rate = explicitRate ?? rates[normalizedCurrency] ?? (normalizedCurrency === baseCurrency ? 1 : 1);
  return roundCurrency(toNumber(amount) * toNumber(rate, 1));
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sumValues(values) {
  return roundCurrency(values.reduce((sum, value) => sum + toNumber(value), 0));
}

function sumObjectValues(object) {
  return sumValues(Object.values(object));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeRatio(value, denominator) {
  if (!Number.isFinite(denominator) || denominator === 0) return 0;
  return value / denominator;
}

function sanitizeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function normalizeChannel(channel) {
  return String(channel || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeCountry(country) {
  const normalized = String(country || '').trim().toUpperCase();
  return normalized === 'UK' ? 'GB' : normalized;
}

function formatPct(value) {
  return `${roundCurrency(value * 100, 1)}%`;
}

function sortBySeverity(items) {
  return [...items].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function severityRank(severity) {
  return { P0: 0, P1: 1, P2: 2, P3: 3, info: 4 }[severity] ?? 9;
}
