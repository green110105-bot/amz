import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseListing, scoreListing, suggestListingImprovements } from '../../packages/domain/src/listing-engine.mjs';

const input = {
  product: { id: 'p1', asin: 'B0P1', title: 'Phone Case' },
  listing: {
    title: 'Phone Case',
    bullets: ['Slim TPU case', 'Wireless charging compatible'],
    description: 'Basic phone case.',
    images: ['main.jpg'],
  },
  searchTerms: [
    { term: 'phone case', impressions: 1000, conversions: 30 },
    { term: 'shockproof case', impressions: 800, conversions: 20 },
  ],
  reviews: [
    { rating: 2, title: 'Too small', body: 'The size is small and corner got loose.' },
  ],
  competitors: [{ asin: 'B0C1' }],
};

test('scoreListing produces weighted score and evidence', () => {
  const score = scoreListing(input);
  assert.ok(score.total > 0);
  assert.ok(score.evidence.missingTerms.includes('shockproof case'));
  assert.ok(score.confidence > 0.45);
});

test('suggestListingImprovements returns low-score dimensions first', () => {
  const improvements = suggestListingImprovements(scoreListing(input));
  assert.ok(improvements.length > 0);
  assert.ok(improvements.some((item) => item.dimension === 'painPointAlignment'));
});

test('diagnoseListing stays manual-only for listing sovereignty', () => {
  const result = diagnoseListing(input);
  assert.equal(result.sovereignty, 'manual_only');
  assert.equal(result.sourceMode, 'mock');
});
