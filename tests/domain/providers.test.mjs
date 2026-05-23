import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderRegistry, providerResult, realWriteBlocked } from '../../packages/domain/src/providers.mjs';
import { createMockProviderRegistry } from '../../packages/mock-data/src/mock-providers.mjs';

test('ProviderRegistry resolves mock providers', async () => {
  const registry = createMockProviderRegistry();
  assert.ok(registry.list().includes('spapi'));
  const result = await registry.get('spapi').getProducts();
  assert.equal(result.sourceMode, 'mock');
  assert.ok(result.data.length > 0);
});

test('realWriteBlocked documents blocked external writes', () => {
  const blocked = realWriteBlocked('ads', 'updateCampaign');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.sourceMode, 'mock');
});

test('providerResult includes trace metadata', () => {
  const result = providerResult('x', { ok: true }, { confidence: 0.9 });
  assert.equal(result.provider, 'x');
  assert.equal(result.confidence, 0.9);
});
