import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterReviews, detectCompetitorChanges } from '../../packages/domain/src/market-intel-engine.mjs';

test('clusterReviews groups negative feedback and recommends actions', () => {
  const clusters = clusterReviews([
    { rating: 2, title: 'Broken', body: 'The product quality is poor and broken.' },
    { rating: 3, title: 'Small size', body: 'Expected large but it was small.' },
    { rating: 1, title: 'Bad package', body: 'Shipping box damaged.' },
  ]);

  assert.ok(clusters.some((item) => item.id === 'quality'));
  assert.ok(clusters.every((item) => item.recommendation));
});

test('detectCompetitorChanges flags price, listing and deal events', () => {
  const changes = detectCompetitorChanges(
    [{ productId: 'p1', asin: 'B0C', price: 25, titleHash: 'a', dealActive: false }],
    [{ productId: 'p1', asin: 'B0C', price: 20, titleHash: 'b', dealActive: true }],
  );

  const types = changes.map((item) => item.type);
  assert.ok(types.includes('PRICE_CHANGE'));
  assert.ok(types.includes('LISTING_COPY_CHANGE'));
  assert.ok(types.includes('DEAL_STARTED'));
});
