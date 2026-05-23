// Settlement report sync.
// Runs GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2, parses TSV, and writes one
// m2_order_costs row per (order_id, cost_type = amount-type + amount-description).
// Idempotent for a given (userId, storeId, since, until): existing settlement
// rows in that range are DELETEd first.

import { randomBytes } from 'node:crypto';
import { runReportSync } from '../endpoints/reports.mjs';
import { getDbInstance, appendAuditLog } from '../../../data-store.mjs';

const REPORT_TYPE = 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2';
const SOURCE_TAG = 'spapi.settlement';

function nowIso() { return new Date().toISOString(); }
function newId() { return 'm2c-' + randomBytes(4).toString('hex'); }

function parseAmount(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}

/**
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.storeId
 * @param {string} args.since        ISO 8601, maps to dataStartTime
 * @param {string} args.until        ISO 8601, maps to dataEndTime
 * @param {string[]} [args.marketplaceIds]
 * @param {Object} [args.injectRows] DI hook for tests — skip network and use pre-parsed rows
 */
export async function syncSettlement(args) {
  const { userId, storeId, since, until, marketplaceIds = [], injectRows } = args;
  if (!userId || !storeId) throw new Error('user_and_store_required');
  if (!since || !until) throw new Error('since_and_until_required');

  let rows;
  let reportId = null;
  let reportDocumentId = null;
  if (Array.isArray(injectRows)) {
    rows = injectRows;
  } else {
    const r = await runReportSync({
      userId, storeId,
      reportType: REPORT_TYPE,
      marketplaceIds,
      since, until,
      parse: 'tsv',
    });
    rows = r.rows || [];
    reportId = r.reportId;
    reportDocumentId = r.reportDocumentId;
  }

  const db = getDbInstance();
  // Idempotency: wipe any previously-written settlement rows for this exact range.
  const rangeKey = `range:${since}|${until}`;
  const wipe = db.prepare(`DELETE FROM m2_order_costs
                            WHERE user_id=? AND store_id=? AND source=?
                              AND detail LIKE ?`);
  wipe.run(userId, storeId, SOURCE_TAG, `%${rangeKey}%`);

  const ins = db.prepare(`INSERT INTO m2_order_costs
    (id,user_id,store_id,order_id,cost_type,amount,currency,accuracy_level,source,detail,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  let written = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const orderId = pick(row, 'amazon-order-item-code', 'order-id', 'amazon-order-id');
      if (!orderId) continue;
      const amountType = pick(row, 'amount-type');
      const amountDesc = pick(row, 'amount-description');
      const costType = [amountType, amountDesc].filter(Boolean).join(':') || 'other';
      const amount = parseAmount(pick(row, 'amount'));
      if (amount === 0 && !amountType && !amountDesc) continue;
      const currency = pick(row, 'currency') || 'USD';
      const detail = JSON.stringify({
        rangeKey,
        sku: pick(row, 'sku'),
        postedDate: pick(row, 'posted-date', 'posted-date-time'),
        transactionType: pick(row, 'transaction-type'),
      });
      ins.run(
        newId(), userId, storeId, String(orderId),
        costType, amount, currency,
        'actual', SOURCE_TAG, detail, nowIso(),
      );
      written += 1;
    }
  });
  tx();

  try {
    appendAuditLog(userId, storeId, {
      sourceModule: 'spapi.settlement',
      actionType: 'sync',
      resourceType: 'm2_order_costs',
      status: 'success',
      written, since, until, reportId, reportDocumentId,
    });
  } catch {}

  return { written, reportId, reportDocumentId, rangeKey };
}
