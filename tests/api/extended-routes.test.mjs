import test from 'node:test';
import assert from 'node:assert/strict';
import { handleExtendedRequest } from '../../apps/api/src/extended-routes.mjs';

test('extended routes expose listing, review, and competitor endpoints', async () => {
  for (const path of [
    '/api/v1/listings/prod-case-001/diagnosis',
    '/api/v1/reviews/prod-case-001/clusters',
    '/api/v1/competitors/changes',
  ]) {
    const response = await handleExtendedRequest(new Request(`http://localhost${path}`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.sourceMode, 'mock');
  }
});
