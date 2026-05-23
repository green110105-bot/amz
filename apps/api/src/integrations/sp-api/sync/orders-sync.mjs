// SP-API Orders → m2_orders / m2_order_costs persistence layer.
// Strategy:
//   - Iterate Amazon Orders v0 by LastUpdatedAfter (incremental).
//   - For each order: fetch all OrderItems, map to row shapes, then upsert in a transaction.
//   - On error for a single order: log to errors[], continue with next order.
//   - Emit one appendAuditLog row at the end of the batch with aggregate stats.

import { getSpApiCredentials } from '../credentials.mjs';
import { iterOrders, getAllOrderItems } from '../endpoints/orders.mjs';
import { mapOrder, mapOrderCosts } from './orders-mapper.mjs';
import { getDbInstance, appendAuditLog } from '../../../data-store.mjs';

const ORDER_INSERT_SQL = `
  INSERT INTO m2_orders (
    id, user_id, store_id, order_id, asin, sku, product_id, marketplace, currency,
    quantity, unit_price, revenue, total_costs, net_profit, profit_margin,
    accuracy_level, confidence, ordered_at, shipped_at, settled_at, raw,
    created_at, updated_at
  ) VALUES (
    @id, @user_id, @store_id, @order_id, @asin, @sku, @product_id, @marketplace, @currency,
    @quantity, @unit_price, @revenue, @total_costs, @net_profit, @profit_margin,
    @accuracy_level, @confidence, @ordered_at, @shipped_at, @settled_at, @raw,
    @created_at, @updated_at
  )
  ON CONFLICT(user_id, store_id, order_id) DO UPDATE SET
    asin = excluded.asin,
    sku = excluded.sku,
    product_id = excluded.product_id,
    marketplace = excluded.marketplace,
    currency = excluded.currency,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    revenue = excluded.revenue,
    total_costs = excluded.total_costs,
    net_profit = excluded.net_profit,
    profit_margin = excluded.profit_margin,
    accuracy_level = excluded.accuracy_level,
    confidence = excluded.confidence,
    ordered_at = excluded.ordered_at,
    shipped_at = excluded.shipped_at,
    settled_at = excluded.settled_at,
    raw = excluded.raw,
    created_at = COALESCE(m2_orders.created_at, excluded.created_at),
    updated_at = excluded.updated_at
`;

const COST_INSERT_SQL = `
  INSERT INTO m2_order_costs (
    id, user_id, store_id, order_id, cost_type, amount, currency,
    accuracy_level, source, detail, created_at
  ) VALUES (
    @id, @user_id, @store_id, @order_id, @cost_type, @amount, @currency,
    @accuracy_level, @source, @detail, @created_at
  )
`;

const COST_DELETE_SQL = `DELETE FROM m2_order_costs WHERE user_id=? AND store_id=? AND order_id=?`;

function persistOrder(db, orderRow, costRows) {
  const orderStmt = db.prepare(ORDER_INSERT_SQL);
  const costDel = db.prepare(COST_DELETE_SQL);
  const costIns = db.prepare(COST_INSERT_SQL);
  const tx = db.transaction(() => {
    orderStmt.run(orderRow);
    costDel.run(orderRow.user_id, orderRow.store_id, orderRow.order_id);
    for (const c of costRows) costIns.run(c);
  });
  tx();
}

/**
 * Sync Amazon Orders into m2_orders / m2_order_costs.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.storeId
 * @param {string} [opts.since]   ISO 8601; passed as LastUpdatedAfter for incremental sync.
 * @param {string} [opts.until]   ISO 8601; passed as LastUpdatedBefore.
 * @param {boolean} [opts.includeOrderItems=true]
 * @returns {Promise<{ordersProcessed:number,itemsProcessed:number,durationMs:number,errors:Array}>}
 */
export async function syncOrders({ userId, storeId, since, until, includeOrderItems = true }) {
  if (!userId || !storeId) throw new Error('user_and_store_required');
  const t0 = Date.now();
  const errors = [];
  let ordersProcessed = 0;
  let itemsProcessed = 0;
  let pages = 0;

  const creds = getSpApiCredentials(userId, storeId);
  if (!creds) throw new Error('no_spapi_credentials');
  const marketplaceIds = creds.marketplaceIds;
  if (!Array.isArray(marketplaceIds) || marketplaceIds.length === 0) {
    throw new Error('no_marketplace_ids');
  }

  const db = getDbInstance();

  try {
    for await (const page of iterOrders({
      userId, storeId, marketplaceIds,
      lastUpdatedAfter: since,
      lastUpdatedBefore: until,
    })) {
      pages += 1;
      for (const spOrder of page.orders) {
        const aoid = spOrder?.AmazonOrderId;
        if (!aoid) {
          errors.push({ orderId: null, error: 'missing_amazon_order_id' });
          continue;
        }
        try {
          let items = [];
          if (includeOrderItems) {
            items = await getAllOrderItems({ userId, storeId, amazonOrderId: aoid });
          }
          const orderRow = mapOrder(spOrder, items, userId, storeId);
          const costRows = mapOrderCosts(spOrder, items, userId, storeId);
          persistOrder(db, orderRow, costRows);
          ordersProcessed += 1;
          itemsProcessed += items.length;
        } catch (e) {
          errors.push({ orderId: aoid, error: e?.message || String(e) });
        }
      }
    }
  } catch (e) {
    errors.push({ orderId: null, error: 'page_iter_failed: ' + (e?.message || String(e)) });
  }

  const durationMs = Date.now() - t0;
  try {
    appendAuditLog(userId, storeId, {
      sourceModule: 'SPAPI',
      actionType: 'orders_sync_batch',
      resourceType: 'm2_orders',
      resourceId: null,
      status: errors.length === 0 ? 'success' : 'partial',
      payload: {
        since: since || null,
        until: until || null,
        pages,
        ordersProcessed,
        itemsProcessed,
        errorCount: errors.length,
        durationMs,
      },
    });
  } catch {}

  return { ordersProcessed, itemsProcessed, durationMs, errors };
}
