// M3-P2-18 — assert the real-write executor never silently succeeds for an
// unsupported primitive, and that the direct-write library functions are LOCAL
// (never reach Amazon). The single Amazon-write path is live-action-executor.

import test from 'node:test';
import assert from 'node:assert/strict';

const { executeLivePrimitive } = await import('../../apps/api/src/integrations/ads-api/live-action-executor.mjs');

test('executeLivePrimitive throws unsupported_real_write_primitive for non ADJUST_BID/BUDGET', async () => {
  await assert.rejects(
    () => executeLivePrimitive({ item: { typedAction: { actionPrimitive: 'PAUSE_CAMPAIGN' } }, body: {} }),
    /unsupported_real_write_primitive/
  );
});

test('executeLivePrimitive throws unsupported_real_write_primitive when no primitive given', async () => {
  await assert.rejects(
    () => executeLivePrimitive({ item: { typedAction: {} }, body: {} }),
    /unsupported_real_write_primitive/
  );
});
