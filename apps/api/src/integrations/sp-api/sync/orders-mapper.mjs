// Pure mapping functions: SP-API Order / OrderItem → m2_orders / m2_order_costs row shapes.
// Cost convention (matches data-store-profit.seedProfitForUser):
//   - All cost rows stored as POSITIVE amounts (referral_fee, fba_fee, shipping, tax, etc.)
//   - Promotions stored as POSITIVE under cost_type='promotion' (treated like a cost vs gross revenue)
//   - revenue = sum of (item_price + shipping_charge + gift_wrap) across items
//   - total_costs = sum(amount) of every emitted cost row
//   - net_profit = revenue - total_costs

import { randomBytes } from 'node:crypto';

function newId(prefix) { return prefix + '-' + randomBytes(4).toString('hex'); }
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function money(x) {
  if (x == null) return 0;
  if (typeof x === 'object') return Number(x.Amount || 0) || 0;
  return Number(x) || 0;
}
function moneyCurrency(x, fallback) {
  if (x && typeof x === 'object' && x.CurrencyCode) return x.CurrencyCode;
  return fallback || 'USD';
}

/**
 * Map an SP-API Order + its items into an m2_orders row object.
 * Items are needed to derive revenue / cost aggregates that match m2_order_costs.
 */
export function mapOrder(spOrder, spItems, userId, storeId) {
  if (!spOrder || !spOrder.AmazonOrderId) throw new Error('order_missing_amazon_order_id');
  const items = Array.isArray(spItems) ? spItems : [];

  const currency = moneyCurrency(spOrder.OrderTotal, 'USD');

  let revenue = 0;
  let qty = 0;
  let unitPriceSum = 0;
  let unitPriceN = 0;
  for (const it of items) {
    const ip = money(it.ItemPrice);
    const sp = money(it.ShippingPrice);
    const gw = money(it.GiftWrapPrice);
    revenue += ip + sp + gw;
    const q = Number(it.QuantityOrdered || 0) || 0;
    qty += q;
    if (q > 0 && ip > 0) {
      unitPriceSum += ip / q;
      unitPriceN += 1;
    }
  }
  if (items.length === 0) {
    // Fall back to OrderTotal when items not available.
    revenue = money(spOrder.OrderTotal);
    qty = Number(spOrder.NumberOfItemsShipped || 0) + Number(spOrder.NumberOfItemsUnshipped || 0);
  }
  revenue = r2(revenue);

  // Costs = tax + promotion + shipping_tax (we treat tax/promotion/shipping_tax as costs against gross revenue).
  let tax = 0, promo = 0, shipTax = 0;
  for (const it of items) {
    tax += money(it.ItemTax);
    shipTax += money(it.ShippingTax);
    promo += money(it.PromotionDiscount);
  }
  const totalCosts = r2(tax + promo + shipTax);
  const netProfit = r2(revenue - totalCosts);
  const margin = revenue > 0 ? r2(netProfit / revenue) : 0;

  const first = items[0] || {};
  const asin = first.ASIN || null;
  const sku = first.SellerSKU || null;
  const unitPrice = unitPriceN > 0 ? r2(unitPriceSum / unitPriceN) : (qty > 0 ? r2(revenue / qty) : null);

  return {
    id: newId('m2o'),
    user_id: userId,
    store_id: storeId,
    order_id: spOrder.AmazonOrderId,
    asin,
    sku,
    product_id: null,
    marketplace: spOrder.MarketplaceId || null,
    currency,
    quantity: qty || 1,
    unit_price: unitPrice,
    revenue,
    total_costs: totalCosts,
    net_profit: netProfit,
    profit_margin: margin,
    accuracy_level: 'estimate',
    confidence: 0.6,
    ordered_at: spOrder.PurchaseDate || null,
    shipped_at: spOrder.EarliestShipDate || null,
    settled_at: spOrder.OrderStatus === 'Shipped' ? (spOrder.LastUpdateDate || null) : null,
    raw: JSON.stringify({ source: 'spapi', orderStatus: spOrder.OrderStatus, salesChannel: spOrder.SalesChannel }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Map an SP-API Order + its items into m2_order_costs row array.
 * Emits one row per non-zero cost component per item, plus order-level totals when items missing.
 */
export function mapOrderCosts(spOrder, spItems, userId, storeId) {
  if (!spOrder || !spOrder.AmazonOrderId) throw new Error('order_missing_amazon_order_id');
  const orderId = spOrder.AmazonOrderId;
  const currency = moneyCurrency(spOrder.OrderTotal, 'USD');
  const items = Array.isArray(spItems) ? spItems : [];
  const now = new Date().toISOString();
  const rows = [];

  function pushRow(costType, amount, detail) {
    const amt = r2(amount);
    if (!Number.isFinite(amt) || amt === 0) return;
    rows.push({
      id: newId('m2c'),
      user_id: userId,
      store_id: storeId,
      order_id: orderId,
      cost_type: costType,
      amount: amt,
      currency,
      accuracy_level: 'estimate',
      source: 'spapi',
      detail: JSON.stringify(detail || {}),
      created_at: now,
    });
  }

  if (items.length === 0) {
    // No items returned; emit order-level placeholders so totals still reconcile.
    pushRow('item_price', money(spOrder.OrderTotal), { source: 'order_total' });
    return rows;
  }

  for (const it of items) {
    const itemRef = it.OrderItemId || it.SellerSKU || null;
    pushRow('item_price', money(it.ItemPrice), { orderItemId: itemRef });
    pushRow('shipping_charge', money(it.ShippingPrice), { orderItemId: itemRef });
    pushRow('gift_wrap', money(it.GiftWrapPrice), { orderItemId: itemRef });
    pushRow('tax', money(it.ItemTax), { orderItemId: itemRef });
    pushRow('shipping_tax', money(it.ShippingTax), { orderItemId: itemRef });
    pushRow('promotion', money(it.PromotionDiscount), { orderItemId: itemRef });
  }
  return rows;
}
