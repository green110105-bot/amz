// FBA inventory snapshot sync.
// Runs GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA, parses TSV, upserts
// m2_inventory_snapshots (one row per sku, warehouse='FBA').

import { randomBytes } from 'node:crypto';
import { runReportSync } from '../endpoints/reports.mjs';
import { getDbInstance, appendAuditLog } from '../../../data-store.mjs';

const REPORT_TYPE = 'GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA';

function nowIso() { return new Date().toISOString(); }
function newId() { return 'm2i-' + randomBytes(4).toString('hex'); }

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}
function asInt(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
}

export async function syncInventory(args) {
  const { userId, storeId, marketplaceIds = [], injectRows } = args;
  if (!userId || !storeId) throw new Error('user_and_store_required');

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
      parse: 'tsv',
    });
    rows = r.rows || [];
    reportId = r.reportId;
    reportDocumentId = r.reportDocumentId;
  }

  const db = getDbInstance();
  // Upsert by (user_id, store_id, sku, warehouse). schema lacks a unique key, so
  // wipe FBA rows for this store first then insert fresh — this is a SNAPSHOT.
  const wipe = db.prepare(`DELETE FROM m2_inventory_snapshots
                            WHERE user_id=? AND store_id=? AND warehouse='FBA'`);
  wipe.run(userId, storeId);

  const ins = db.prepare(`INSERT INTO m2_inventory_snapshots
    (id,user_id,store_id,sku,asin,product_id,warehouse,on_hand,reserved,inbound,available,unit_cost,daily_velocity,days_cover,in_stock_days,lts_countdown_days,snapshot_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  let written = 0;
  const ts = nowIso();
  const tx = db.transaction(() => {
    for (const row of rows) {
      const sku = pick(row, 'sku', 'seller-sku');
      if (!sku) continue;
      const asin = pick(row, 'asin') || null;
      // Common field names in FBA MYI report.
      const onHand = asInt(pick(row, 'afn-fulfillable-quantity', 'quantity-available', 'available'));
      const reserved = asInt(pick(row, 'afn-reserved-quantity', 'reserved-quantity'));
      const inbound = asInt(
        pick(row, 'afn-inbound-receiving-quantity', 'afn-inbound-shipped-quantity', 'inbound-quantity'),
      );
      const available = onHand;
      ins.run(
        newId(), userId, storeId, String(sku), asin, null, 'FBA',
        onHand, reserved, inbound, available,
        null, null, null, null, null, ts,
      );
      written += 1;
    }
  });
  tx();

  try {
    appendAuditLog(userId, storeId, {
      sourceModule: 'spapi.inventory',
      actionType: 'sync',
      resourceType: 'm2_inventory_snapshots',
      status: 'success',
      written, reportId, reportDocumentId,
    });
  } catch {}

  return { written, reportId, reportDocumentId };
}
