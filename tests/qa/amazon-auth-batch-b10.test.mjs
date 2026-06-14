// Batch B10-fe-auth regression baseline (AUTH-01 / AUTH-03 / AUTH-07 / AUTH-14).
//
// The web-v2 workspace has no vue/jsdom test runtime, so — like the other qa/*
// contract tests in this repo — we assert against the .vue source text. These lock
// the corrected contracts so a future edit cannot silently regress them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPONENT = readFileSync(
  join(__dirname, '../../apps/web-v2/src/pages/AmazonAuthCenter.vue'),
  'utf8',
);

function sliceFn(name) {
  const start = COMPONENT.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  // crude function body slice: up to the next top-level "async function " / "function "
  const rest = COMPONENT.slice(start + 1);
  const nextA = rest.indexOf('\nasync function ');
  const nextB = rest.indexOf('\nfunction ');
  const ends = [nextA, nextB].filter((n) => n !== -1);
  const end = ends.length ? Math.min(...ends) : rest.length;
  return rest.slice(0, end);
}

// ---------------------------------------------------------------------------
// AUTH-01: OAuth return stops auto-probe + clears query before any await.
// ---------------------------------------------------------------------------
test('AUTH-01: handleOAuthReturn does NOT auto-call runProbe in success path', () => {
  const body = sliceFn('handleOAuthReturn');
  assert.ok(!/runProbe\s*\(/.test(body), 'handleOAuthReturn must not call runProbe()');
  assert.ok(!/liveDiagnostics\s*\(/.test(body), 'handleOAuthReturn must not call liveDiagnostics()');
});

test('AUTH-01: router.replace runs before the first await in handleOAuthReturn', () => {
  const body = sliceFn('handleOAuthReturn');
  const replaceIdx = body.indexOf('router.replace');
  const awaitIdx = body.indexOf('await ');
  assert.notEqual(replaceIdx, -1, 'must call router.replace');
  assert.notEqual(awaitIdx, -1, 'handler has awaits');
  assert.ok(replaceIdx < awaitIdx, 'router.replace must precede the first await (no replay window)');
});

test('AUTH-01: success path still refreshes status once via loadStatus', () => {
  const body = sliceFn('handleOAuthReturn');
  assert.ok(body.includes('await loadStatus()'), 'success branch must call loadStatus()');
});

// ---------------------------------------------------------------------------
// AUTH-03: marketplaceIds no longer hardcoded; back-fill is unconditional.
// ---------------------------------------------------------------------------
test('AUTH-03: spapiForm.marketplaceIds initial value is empty string', () => {
  // The ref initializer must not carry the hardcoded US marketplace.
  const formBlock = COMPONENT.slice(
    COMPONENT.indexOf('const spapiForm = ref('),
    COMPONENT.indexOf('const adsForm = ref('),
  );
  assert.ok(formBlock.includes("marketplaceIds: ''"), 'marketplaceIds must default to empty string');
  assert.ok(!/marketplaceIds:\s*'ATVPDKIKX0DER'/.test(formBlock), 'must not hardcode ATVPDKIKX0DER as default');
});

test('AUTH-03: textarea placeholder still shows ATVPDKIKX0DER hint', () => {
  assert.ok(COMPONENT.includes('placeholder="ATVPDKIKX0DER"'), 'placeholder hint retained');
});

test('AUTH-03: applyStatusToForms overwrites marketplaceIds unconditionally (guard removed)', () => {
  const body = COMPONENT.slice(
    COMPONENT.indexOf('function applyStatusToForms'),
    COMPONENT.indexOf('async function ensureHydrated'),
  );
  assert.ok(
    body.includes('if (spapi?.marketplaceIds?.length) {'),
    'back-fill condition must be length-only',
  );
  assert.ok(
    !body.includes('!spapiForm.value.marketplaceIds'),
    'the永假 !marketplaceIds guard must be removed',
  );
});

// ---------------------------------------------------------------------------
// AUTH-07: global sync busy gate + steps rendering.
// ---------------------------------------------------------------------------
test('AUTH-07: syncBusy computed exists and derives from syncing', () => {
  assert.ok(
    /const syncBusy = computed\(\(\) => !!syncing\.value\)/.test(COMPONENT),
    'syncBusy must be a computed over syncing',
  );
});

test('AUTH-07: every sync button binds :disabled to syncBusy (cross-button gate)', () => {
  // Count sync action buttons vs. how many include the syncBusy disabled gate.
  const syncBtnLines = COMPONENT.split('\n').filter((l) => /@click="sync(Orders|Settlement|Inventory|Catalog|Ads|All)"/.test(l));
  assert.ok(syncBtnLines.length >= 9, `expected the two sync grids (>=9 buttons), got ${syncBtnLines.length}`);
  for (const l of syncBtnLines) {
    assert.ok(l.includes('syncBusy'), `sync button missing syncBusy disabled gate: ${l.trim()}`);
  }
});

test('AUTH-07(b): syncSteps computed + step checklist rendered', () => {
  assert.ok(COMPONENT.includes('const syncSteps = computed('), 'syncSteps computed must exist');
  assert.ok(COMPONENT.includes('v-for="step in syncSteps"'), 'steps must be rendered');
  assert.ok(COMPONENT.includes("step.status === 'error'"), 'step status drives ok/error styling');
});

// ---------------------------------------------------------------------------
// AUTH-14: success-page copy收口 + 去同步 CTA, no auto first-sync.
// ---------------------------------------------------------------------------
test('AUTH-14: flow-strip 4th cell no longer over-promises "业务可用/读取真实数据"', () => {
  assert.ok(!COMPONENT.includes('<strong>业务可用</strong>'), 'over-promise heading removed');
  assert.ok(
    !COMPONENT.includes('M2 利润、M3 广告、M4 日报读取真实数据。'),
    'over-promise body removed',
  );
  assert.ok(COMPONENT.includes('同步后即可在 M2/M3/M4 使用'), 'honest "同步后才可用" copy present');
});

test('AUTH-14: prominent 去同步真实数据 CTA exists', () => {
  assert.ok(COMPONENT.includes('go-sync-cta'), 'CTA banner present');
  assert.ok(COMPONENT.includes('手动同步真实数据'), 'CTA prompts手动同步');
});

test('AUTH-14: no auto first-sync wired on OAuth return', () => {
  const body = sliceFn('handleOAuthReturn');
  // must not call any sync* function automatically on return
  assert.ok(!/syncAll\s*\(/.test(body), 'must not auto syncAll on return');
  assert.ok(!/syncOrders\s*\(/.test(body), 'must not auto syncOrders on return');
});
