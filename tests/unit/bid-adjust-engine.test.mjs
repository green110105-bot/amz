// Unit tests for the pure bid-adjust engine (no DOM, no Vue).

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNewBid, computeBidPreview, validateBidInput, BID_MODES } from '../../apps/web-v2/src/components/bid-adjust-engine.js';

test('computeNewBid · set replaces the value', () => {
  assert.equal(computeNewBid({ current: 1.00, mode: 'set', value: 0.75 }), 0.75);
  assert.equal(computeNewBid({ current: 99.99, mode: 'set', value: 0.50 }), 0.50);
});

test('computeNewBid · add_amount adds fixed USD', () => {
  assert.equal(computeNewBid({ current: 1.00, mode: 'add_amount', value: 0.10 }), 1.10);
  assert.equal(computeNewBid({ current: 0.50, mode: 'add_amount', value: 0.25 }), 0.75);
});

test('computeNewBid · subtract_amount subtracts fixed USD', () => {
  assert.equal(computeNewBid({ current: 1.00, mode: 'subtract_amount', value: 0.30 }), 0.70);
  assert.equal(computeNewBid({ current: 2.00, mode: 'subtract_amount', value: 0.50 }), 1.50);
});

test('computeNewBid · add_percent applies percentage increase', () => {
  assert.equal(computeNewBid({ current: 1.00, mode: 'add_percent', value: 20 }), 1.20);
  assert.equal(computeNewBid({ current: 0.50, mode: 'add_percent', value: 50 }), 0.75);
});

test('computeNewBid · subtract_percent applies percentage decrease', () => {
  assert.equal(computeNewBid({ current: 1.00, mode: 'subtract_percent', value: 20 }), 0.80);
  assert.equal(computeNewBid({ current: 2.00, mode: 'subtract_percent', value: 25 }), 1.50);
});

test('computeNewBid · clamps to minBid when value would underflow', () => {
  // 0.30 - 0.50 = -0.20, clamps to 0.02
  assert.equal(computeNewBid({ current: 0.30, mode: 'subtract_amount', value: 0.50 }), 0.02);
  // set 0 → clamped to 0.02
  assert.equal(computeNewBid({ current: 1.00, mode: 'set', value: 0 }), 0.02);
});

test('computeNewBid · clamps to maxBid when value would overflow', () => {
  // 600 + 600 = 1200 → clamped to 1000
  assert.equal(computeNewBid({ current: 600, mode: 'add_amount', value: 600 }), 1000);
  // set 9999 → clamped to 1000
  assert.equal(computeNewBid({ current: 1.00, mode: 'set', value: 9999 }), 1000);
});

test('computeNewBid · applyMin=false allows below-minimum value', () => {
  assert.equal(computeNewBid({ current: 0.30, mode: 'subtract_amount', value: 0.30, applyMin: false }), 0);
});

test('computeNewBid · applyMax=false allows above-maximum value', () => {
  assert.equal(computeNewBid({ current: 999, mode: 'add_amount', value: 100, applyMax: false }), 1099);
});

test('computeNewBid · rounds to 2 decimals', () => {
  // 0.7 * 1.10 = 0.77 (already 2 decimals)
  assert.equal(computeNewBid({ current: 0.7, mode: 'add_percent', value: 10 }), 0.77);
  // 1.23456 * 1.10 = 1.358016 → 1.36
  assert.equal(computeNewBid({ current: 1.23456, mode: 'add_percent', value: 10 }), 1.36);
});

test('computeBidPreview · returns per-row preview + summary stats', () => {
  const rows = [
    { id: 't1', term: 'kw-a', bid: 1.00 },
    { id: 't2', term: 'kw-b', bid: 0.50 },
    { id: 't3', term: 'kw-c', bid: 2.00 },
  ];
  const { preview, stats } = computeBidPreview(rows, { mode: 'add_percent', value: 10 });
  assert.equal(preview.length, 3);
  assert.deepEqual(preview.map((p) => p.next), [1.10, 0.55, 2.20]);
  assert.deepEqual(preview.map((p) => p.id), ['t1', 't2', 't3']);
  assert.equal(stats.total, 3);
  assert.equal(stats.ups, 3);
  assert.equal(stats.downs, 0);
  assert.equal(stats.sames, 0);
  assert.ok(stats.avgPct > 9 && stats.avgPct < 11);
});

test('computeBidPreview · stats correctly categorize ups/downs/sames', () => {
  const rows = [
    { id: '1', bid: 1.00 }, // becomes 1.00 (clamped or same)
    { id: '2', bid: 1.20 }, // becomes 1.00 (down)
    { id: '3', bid: 0.80 }, // becomes 1.00 (up)
  ];
  const { stats } = computeBidPreview(rows, { mode: 'set', value: 1.00 });
  assert.equal(stats.ups, 1);
  assert.equal(stats.downs, 1);
  assert.equal(stats.sames, 1);
});

test('validateBidInput · accepts valid combinations', () => {
  assert.equal(validateBidInput({ mode: 'set', value: 0.50 }), null);
  assert.equal(validateBidInput({ mode: 'add_amount', value: 0.10 }), null);
  assert.equal(validateBidInput({ mode: 'subtract_percent', value: 25 }), null);
});

test('validateBidInput · rejects invalid mode / value', () => {
  assert.equal(validateBidInput({ mode: 'gibberish', value: 1 }), 'invalid_mode');
  assert.equal(validateBidInput({ mode: 'set', value: NaN }), 'value_not_finite');
  assert.equal(validateBidInput({ mode: 'set', value: 0.001 }), 'set_below_min');
  assert.equal(validateBidInput({ mode: 'add_amount', value: 0 }), 'amount_non_positive');
  assert.equal(validateBidInput({ mode: 'subtract_amount', value: -1 }), 'amount_non_positive');
  assert.equal(validateBidInput({ mode: 'add_percent', value: 0 }), 'percent_out_of_range');
  assert.equal(validateBidInput({ mode: 'add_percent', value: 100 }), 'percent_out_of_range');
});

test('BID_MODES enum is exposed and exhaustive', () => {
  assert.equal(BID_MODES.length, 5);
  assert.ok(BID_MODES.includes('set'));
  assert.ok(BID_MODES.includes('add_amount'));
  assert.ok(BID_MODES.includes('subtract_amount'));
  assert.ok(BID_MODES.includes('add_percent'));
  assert.ok(BID_MODES.includes('subtract_percent'));
});
