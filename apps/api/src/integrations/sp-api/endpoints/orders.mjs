// SP-API Orders v0 endpoints.
// Day 2 will add: persistence into m2_orders + m2_order_costs.
// This file currently exports thin wrappers + auto-pagination iterator.

import { spapiCall } from '../client.mjs';

/**
 * Iterate orders by date range (CreatedAfter / LastUpdatedAfter).
 * Yields one page (Orders[]) at a time. Caller decides how to persist.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.storeId
 * @param {string[]} args.marketplaceIds
 * @param {string} [args.createdAfter]    ISO 8601 (preferred for incremental sync)
 * @param {string} [args.createdBefore]
 * @param {string} [args.lastUpdatedAfter]
 * @param {string} [args.lastUpdatedBefore]
 * @param {string[]} [args.orderStatuses]
 * @param {number} [args.maxResultsPerPage=100]
 */
export async function* iterOrders(args) {
  const { userId, storeId, marketplaceIds } = args;
  if (!Array.isArray(marketplaceIds) || marketplaceIds.length === 0) {
    throw new Error('marketplace_ids_required');
  }
  let nextToken = null;
  let pages = 0;
  do {
    const query = nextToken
      ? { NextToken: nextToken, MarketplaceIds: marketplaceIds }
      : {
          MarketplaceIds: marketplaceIds,
          CreatedAfter: args.createdAfter,
          CreatedBefore: args.createdBefore,
          LastUpdatedAfter: args.lastUpdatedAfter,
          LastUpdatedBefore: args.lastUpdatedBefore,
          OrderStatuses: args.orderStatuses,
          MaxResultsPerPage: args.maxResultsPerPage || 100,
        };
    const { json, nextToken: tok } = await spapiCall({
      userId, storeId,
      endpoint: 'orders.getOrders',
      path: '/orders/v0/orders',
      query,
      cursorBefore: nextToken,
    });
    const orders = json?.payload?.Orders || [];
    yield { orders, page: ++pages, nextToken: tok };
    nextToken = tok;
  } while (nextToken);
}

export async function getOrder({ userId, storeId, amazonOrderId }) {
  if (!amazonOrderId) throw new Error('amazon_order_id_required');
  const { json } = await spapiCall({
    userId, storeId,
    endpoint: 'orders.getOrder',
    path: `/orders/v0/orders/${encodeURIComponent(amazonOrderId)}`,
  });
  return json?.payload || null;
}

export async function getOrderItems({ userId, storeId, amazonOrderId, nextToken }) {
  if (!amazonOrderId) throw new Error('amazon_order_id_required');
  const { json, nextToken: tok } = await spapiCall({
    userId, storeId,
    endpoint: 'orders.getOrderItems',
    path: `/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/orderItems`,
    query: nextToken ? { NextToken: nextToken } : undefined,
  });
  return { items: json?.payload?.OrderItems || [], nextToken: tok };
}

/**
 * Helper: load ALL items for one order, exhausting pagination.
 */
export async function getAllOrderItems({ userId, storeId, amazonOrderId }) {
  const out = [];
  let nextToken = null;
  do {
    const { items, nextToken: tok } = await getOrderItems({ userId, storeId, amazonOrderId, nextToken });
    out.push(...items);
    nextToken = tok;
  } while (nextToken);
  return out;
}
