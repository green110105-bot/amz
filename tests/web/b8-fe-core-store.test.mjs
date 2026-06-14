// tests/web/b8-fe-core-store.test.mjs
// Batch B8-fe-core-store — front-end core store + trust-anchor + audit-bypass gates.
// Source-text assertions (no Vue build), matching the repo's existing web-test style.
//   W2     normalizeCard single schema + Workbench passes whole normalized card
//   W4     useAudit requiresRealStoreWrite driven by appStore (not hard-coded false)
//   W5     appStore sourceMeta + setSourceMeta; Workbench writes it back
//   W6     top-bar + Workbench status card store-driven; real-write danger banner
//   W18    top-bar search box is live (@keyup.enter -> router.push)
//   M1-011 publish status guard (amazon_receipt) + single adopt actionType
//   M3-P0-05 BudgetAllocator/Dayparting use actionQueueApi.enqueue, gate on success
//   M3-P0-08 AdsTimeline/Budget/Dayparting: no mutation-actionType useAudit().submit
//   X-P0-02 Audit revert blocked-state on dispatchedInverse===false, no swallow catch
//   X-P0-07 misleading 已执行/已挽回/可回滚 copy carries 模拟/预估 qualifier
//   X-P1-03 top-bar 3-state badge from /provider/status; no dead Pinia constants

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// W5 / X-P1-03: app store single-truth source.
// ---------------------------------------------------------------------------
test('W5: app.js exposes sourceMeta state + setSourceMeta action, realWritesEnabled is a getter', async () => {
  const src = await read('apps/web-v2/src/stores/app.js');
  assert.match(src, /sourceMeta:\s*\{/, 'sourceMeta state object present');
  assert.match(src, /sourceMode:/);
  assert.match(src, /setSourceMeta\s*\(/, 'setSourceMeta action present');
  assert.match(src, /getters:\s*\{[\s\S]*realWritesEnabled:\s*\(state\)/, 'realWritesEnabled is a derived getter');
  // X-P1-03: dead constants removed — no top-level realWritesEnabled state field and
  // no hard-coded mock currentStore. (sourceMeta.realWritesEnabled is the truth source.)
  assert.ok(!/^\s{4}realWritesEnabled:\s*false,/m.test(src), 'no top-level setter-less realWritesEnabled:false state');
  assert.ok(!/currentStore:\s*\{\s*id:\s*'mock-store-us'/.test(src), 'no hard-coded mock currentStore constant');
});

test('W5: Workbench writes dashboard sourceMeta back into appStore on load', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  assert.match(src, /appStore\.setSourceMeta\(/);
  assert.match(src, /sourceMode:/);
  assert.match(src, /realWritesEnabled:/);
});

// ---------------------------------------------------------------------------
// W4: requiresRealStoreWrite driven by appStore (testable gate), not hard-coded.
// ---------------------------------------------------------------------------
test('W4: useAudit requiresRealStoreWrite reads appStore.realWritesEnabled', async () => {
  const src = await read('apps/web-v2/src/composables/useAudit.js');
  assert.match(src, /requiresRealStoreWrite:\s*appStore\.realWritesEnabled\s*===\s*true/);
  assert.ok(!/requiresRealStoreWrite:\s*false\b/.test(src), 'no hard-coded false');
  assert.match(src, /useAppStore/);
});

// ---------------------------------------------------------------------------
// W2: normalizeCard single schema + Workbench passes the whole normalized card.
// ---------------------------------------------------------------------------
test('W2: format.js exports normalizeCard unifying dashboard/db/audit shapes', async () => {
  const src = await read('apps/web-v2/src/utils/format.js');
  assert.match(src, /export function normalizeCard\(/);
  // pulls severity from card/payload/risk and falls back to priority
  assert.match(src, /risk\.severity/);
  assert.match(src, /card\.payload/);
});

test('W2: Workbench passes the whole normalized card (not card.payload)', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  assert.match(src, /normalizeCard/);
  assert.match(src, /:card="card"/, 'passes whole card');
  assert.ok(!/:card="card\.payload"/.test(src), 'no card.payload prop binding');
});

// ---------------------------------------------------------------------------
// W6 / X-P1-03: top-bar + status card store-driven; danger banner when armed.
// ---------------------------------------------------------------------------
test('W6: DefaultLayout real-write tag is store-driven danger banner', async () => {
  const src = await read('apps/web-v2/src/layouts/DefaultLayout.vue');
  assert.match(src, /v-if="realWritesEnabled"[\s\S]*type="danger"/);
  assert.match(src, /真实写入已开启/);
  // 3-state source badge from provider status, no hard-coded false-claim literals
  assert.match(src, /sourceBadge/);
  assert.ok(!/Mock 数据已加载/.test(src), 'no「Mock 数据已加载」literal');
  assert.ok(!/'真实数据'|>真实数据</.test(src), 'no bare「真实数据」claim literal');
});

test('X-P1-03: DefaultLayout derives badge from /provider/status (amazonIntegrationsApi.status)', async () => {
  const src = await read('apps/web-v2/src/layouts/DefaultLayout.vue');
  assert.match(src, /amazonIntegrationsApi\.status\(\)/);
  assert.match(src, /realWriteGate/);
  assert.match(src, /success.*真实|real.*success|type:\s*'success'/);
});

test('X-P1-03: listProviderStatus surfaces realWriteGate', async () => {
  const src = await read('apps/api/src/integrations/provider-mode.mjs');
  assert.match(src, /realWriteGate:\s*getRealWriteGateState\(\)/);
});

test('W6: Workbench status card real-write line is store-driven', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  assert.match(src, /appStore\.realWritesEnabled/);
  assert.match(src, /将影响真实店铺/);
});

// ---------------------------------------------------------------------------
// W18: top-bar search is a live control.
// ---------------------------------------------------------------------------
test('W18: top-bar search box has @keyup.enter that routes', async () => {
  const src = await read('apps/web-v2/src/layouts/DefaultLayout.vue');
  assert.match(src, /@keyup\.enter="onSearch"/);
  assert.match(src, /function onSearch\(\)/);
  assert.match(src, /router\.push\(\{\s*path:\s*'\/listings\/select'/);
});

// ---------------------------------------------------------------------------
// M1-011: publish status guard + single adopt actionType.
// ---------------------------------------------------------------------------
test('M1-011: publishStatusLabel renders 已发布 only with amazon_receipt', async () => {
  const mod = await import('../../apps/web-v2/src/utils/format.js');
  // UPLOAD without receipt -> draft
  assert.equal(mod.publishStatusLabel({ actionType: 'M1_LISTING_UPLOAD' }), '草稿 · 未写回 Amazon');
  // UPLOAD with receipt -> published
  assert.equal(
    mod.publishStatusLabel({ actionType: 'M1_LISTING_UPLOAD', amazon_receipt: 'AMZ-123' }),
    '已发布',
  );
  // PUBLISH with empty receipt -> draft
  assert.equal(mod.publishStatusLabel({ actionType: 'MULTILOCALE_PUBLISH', amazonReceiptId: '' }), '草稿 · 未写回 Amazon');
  // non-upload action -> null (fall back to normal status)
  assert.equal(mod.publishStatusLabel({ actionType: 'STRATEGY_TOGGLE' }), null);
});

test('M1-011: Audit.vue uses publishStatusLabel guard for upload/publish rows', async () => {
  const src = await read('apps/web-v2/src/pages/Audit.vue');
  assert.match(src, /publishStatusLabel/);
});

test('M1-011: ListingAbCenter adopt produces a single actionType (no frontend pre-write)', async () => {
  const src = await read('apps/web-v2/src/pages/ListingAbCenter.vue');
  assert.ok(!/ADOPT_AB_WINNER/.test(src), 'frontend ADOPT_AB_WINNER pre-write removed');
  assert.match(src, /async function onAdoptWinner[\s\S]*await adoptWinner\(row\.id\)/);
});

// ---------------------------------------------------------------------------
// M3-P0-05: BudgetAllocator/Dayparting -> actionQueueApi.enqueue, gate on success.
// ---------------------------------------------------------------------------
test('M3-P0-05: BudgetAllocator uses actionQueueApi.enqueue, not useAudit().submit', async () => {
  const src = await read('apps/web-v2/src/pages/BudgetAllocator.vue');
  assert.match(src, /actionQueueApi\.enqueue/);
  assert.ok(!/useAudit/.test(src), 'no useAudit bypass');
  assert.ok(!/INCREASE_BUDGET/.test(src), 'no INCREASE_BUDGET direct-write actionType');
  // gate local mutation on a TRUE enqueue: item present AND not a duplicate (queued!==false).
  // A 409/duplicate must not optimistically mutate the local budget.
  assert.match(src, /if \(item && item\.queued !== false\) \{ c\.currentBudget = c\.recommendedBudget/);
});

test('M3-P0-05: Dayparting uses actionQueueApi.enqueue and drops the 30-day CVR claim', async () => {
  const src = await read('apps/web-v2/src/pages/Dayparting.vue');
  assert.match(src, /actionQueueApi\.enqueue/);
  assert.ok(!/useAudit/.test(src), 'no useAudit bypass');
  assert.ok(!/基于过去 30 天分时段 CVR/.test(src), 'unsupported 30-day CVR copy removed');
});

// ---------------------------------------------------------------------------
// M3-P0-08: no mutation-actionType useAudit().submit in the three pages.
// ---------------------------------------------------------------------------
test('M3-P0-08: AdsTimeline/Budget/Dayparting have no TIMELINE_REVERT/INCREASE_BUDGET/分时段 submit', async () => {
  for (const f of [
    'apps/web-v2/src/pages/AdsTimeline.vue',
    'apps/web-v2/src/pages/BudgetAllocator.vue',
    'apps/web-v2/src/pages/Dayparting.vue',
  ]) {
    const src = await read(f);
    // No useAudit().submit call carrying a mutation actionType.
    assert.ok(!/submit\(\{[\s\S]*?actionType:\s*'TIMELINE_REVERT'/.test(src), `${f}: no TIMELINE_REVERT submit`);
    assert.ok(!/submit\(\{[\s\S]*?actionType:\s*'INCREASE_BUDGET'/.test(src), `${f}: no INCREASE_BUDGET submit`);
    assert.ok(!/submit\(\{[\s\S]*?actionType:\s*'ENABLE_DAYPARTING'/.test(src), `${f}: no dayparting submit`);
  }
});

// ---------------------------------------------------------------------------
// X-P0-02: pessimistic revert; blocked-state on dispatchedInverse===false.
// ---------------------------------------------------------------------------
test('X-P0-02: Audit.vue renders blocked-state copy on no auto inverse dispatch', async () => {
  const src = await read('apps/web-v2/src/pages/Audit.vue');
  assert.match(src, /dispatchedInverse === false/);
  assert.match(src, /本地已标记, Amazon 端未自动回滚, 需人工处理/);
  // no empty swallow catch around revert
  assert.ok(!/} catch \{\}\s*\n}/.test(src.slice(src.indexOf('async function revert'))),
    'no empty swallow catch in revert');
});

test('X-P0-02: useLocalStore.revertAuditLog does not flip reverted before await / on dispatchedInverse false', async () => {
  const src = await read('apps/web-v2/src/composables/useLocalStore.js');
  const fn = src.slice(src.indexOf('async revertAuditLog'), src.indexOf('// ===== Keywords'));
  // The first reverted assignment must come AFTER the await storeApi.revertAuditLog call.
  const awaitIdx = fn.indexOf('await storeApi.revertAuditLog');
  const flipIdx = fn.indexOf('log.reverted = true');
  assert.ok(awaitIdx > -1 && flipIdx > awaitIdx, 'reverted flips only after the network await');
  assert.match(fn, /dispatchedInverse === false/);
});

// ---------------------------------------------------------------------------
// X-P0-07: B方案 honest mock copy — no unqualified real-side-effect claims.
// ---------------------------------------------------------------------------
test('X-P0-07: Audit.vue side-effect copy carries 模拟/预估 qualifiers', async () => {
  const src = await read('apps/web-v2/src/pages/Audit.vue');
  // KPI labels no longer claim plain 已挽回/已执行 without qualifier
  assert.ok(!/label="本月已挽回"/.test(src), 'no unqualified 已挽回 KPI');
  assert.ok(!/label="成功执行"/.test(src), 'no unqualified 已执行 KPI');
  assert.match(src, /预估可挽回|模拟执行|未触达 Amazon/);
});

test('X-P0-07: SuggestionDrawer execute button is honest dry-run/mock', async () => {
  const src = await read('apps/web-v2/src/components/SuggestionDrawer.vue');
  assert.match(src, /dry-run · 模拟|模拟|dry-run/);
});
