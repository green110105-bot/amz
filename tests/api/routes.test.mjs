import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../../apps/api/src/routes.mjs';

test('api routes return dashboard and suggestions', async () => {
  const dashboardResponse = await handleRequest(new Request('http://localhost/api/v1/dashboard'));
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboard.sourceMode, 'mock');
  assert.ok(dashboard.actionCards.length > 0);

  const suggestionsResponse = await handleRequest(new Request('http://localhost/api/v1/ads/suggestions'));
  assert.equal(suggestionsResponse.status, 200);
  const suggestions = await suggestionsResponse.json();
  assert.equal(suggestions.sourceMode, 'mock');
  assert.ok(suggestions.audits.length > 0);
});
