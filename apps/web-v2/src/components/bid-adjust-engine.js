// Pure-function bid-adjust engine. Extracted from BidAdjustModal so it can be
// unit-tested without a DOM and reused for other bid-like batch operations
// (e.g. ad-group default bid, placement bid modifier).

export const BID_MODES = ['set', 'add_amount', 'subtract_amount', 'add_percent', 'subtract_percent'];

export const DEFAULT_MIN_BID = 0.02;   // Amazon SP minimum
export const DEFAULT_MAX_BID = 1000;   // Amazon SP maximum

/**
 * Compute a single new bid from a current bid, mode, and operand value.
 * @param {Object} opts
 * @param {number} opts.current      Current bid
 * @param {string} opts.mode         One of BID_MODES
 * @param {number} opts.value        Operand (USD or percent)
 * @param {number} [opts.minBid=0.02]
 * @param {number} [opts.maxBid=1000]
 * @param {boolean} [opts.applyMin=true]
 * @param {boolean} [opts.applyMax=true]
 * @returns {number} New bid, rounded to 2 decimals
 */
export function computeNewBid({ current, mode, value, minBid = DEFAULT_MIN_BID, maxBid = DEFAULT_MAX_BID, applyMin = true, applyMax = true }) {
  const cur = Number(current) || 0;
  const v = Number(value) || 0;
  let n;
  switch (mode) {
    case 'set':              n = v; break;
    case 'add_amount':       n = cur + v; break;
    case 'subtract_amount':  n = cur - v; break;
    case 'add_percent':      n = cur * (1 + v / 100); break;
    case 'subtract_percent': n = cur * (1 - v / 100); break;
    default: throw new Error('invalid bid mode: ' + mode);
  }
  if (applyMin && n < minBid) n = minBid;
  if (applyMax && n > maxBid) n = maxBid;
  return Math.round(n * 100) / 100;
}

/**
 * Compute the full per-row preview rows + summary stats.
 * @param {Object[]} rows  Each must have a numeric `bid` field
 * @param {Object} opts    Same as computeNewBid (mode, value, ...)
 * @returns {{ preview: Array, stats: { total, ups, downs, sames, avgPct } }}
 */
export function computeBidPreview(rows, opts) {
  const preview = rows.map((r) => {
    const cur = Number(r.bid) || 0;
    const next = computeNewBid({ current: cur, ...opts });
    const delta = next - cur;
    const pct = cur > 0 ? (delta / cur) * 100 : 0;
    return {
      id: r.id,
      label: r.term || r.asin || r.category || r.name || r.id,
      cur, next, delta, pct,
      matchType: r.matchType,
      type: r.type,
    };
  });
  const ups = preview.filter((x) => x.delta > 0.005).length;
  const downs = preview.filter((x) => x.delta < -0.005).length;
  const sames = preview.length - ups - downs;
  const avgPct = preview.length > 0
    ? preview.reduce((a, x) => a + (Number.isFinite(x.pct) ? x.pct : 0), 0) / preview.length
    : 0;
  return { preview, stats: { total: preview.length, ups, downs, sames, avgPct } };
}

/**
 * Validate the mode + value pair. Returns null if valid, or an error code.
 */
export function validateBidInput({ mode, value, minBid = DEFAULT_MIN_BID }) {
  const v = Number(value);
  if (!BID_MODES.includes(mode)) return 'invalid_mode';
  if (!Number.isFinite(v)) return 'value_not_finite';
  if (mode === 'set' && v < minBid) return 'set_below_min';
  if (mode.endsWith('_amount') && v <= 0) return 'amount_non_positive';
  if (mode.endsWith('_percent') && (v <= 0 || v > 99)) return 'percent_out_of_range';
  return null;
}
