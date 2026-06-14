// tests/web/x-p1-source-unknown-rendering.test.mjs
// Batch B4-be-monitor — frontend真假边界 gates (source-level, no Vue build):
//   X-P1-01 sourceMeta poison-default 'mock seed'/'deterministic_mock' -> 'unknown'.
//   M4-P1-01 front-end ANOMALY_TRANSITIONS mirror matches backend exactly.
//   M4-P1-04 Notifications.vue reads deliveryStatus; subtitle drops已发送 multi-channel claim.
//   M4-P1-03 RecoveryEmails/useM4State use marked_sent + manual-evidence copy.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// X-P1-01: no poison-default to mock; unknown is the honest fallback.
// ---------------------------------------------------------------------------
test('X-P1-01: SuggestionCard freshness default is unknown, not mock seed', async () => {
  const src = await read('apps/web-v2/src/components/SuggestionCard.vue');
  assert.match(src, /sourceMeta\?\.freshness \|\| 'unknown'/);
  assert.ok(!/freshness \|\| 'mock seed'/.test(src), 'no mock-seed poison-default');
});

test('X-P1-01: SuggestionDrawer renders unknown warning badge when source/freshness absent', async () => {
  const src = await read('apps/web-v2/src/components/SuggestionDrawer.vue');
  // an explicit isUnknownSource computed, defaulting freshness/source to 'unknown'
  assert.match(src, /isUnknownSource\s*=\s*computed/);
  assert.match(src, /freshnessDisplay\s*=\s*computed\(\(\)\s*=>\s*sourceMeta\.value\?\.freshness \|\| 'unknown'\)/);
  // warning-orange unknown badge, and no 'mock seed' literal anymore
  assert.match(src, /source-unknown-tag/);
  assert.match(src, /type="warning"/);
  assert.ok(!/mock seed/.test(src), 'no mock seed literal remains');
});

test('X-P1-01: AdsHub default freshness/lag is unknown, not mock seed', async () => {
  const src = await read('apps/web-v2/src/pages/AdsHub.vue');
  assert.match(src, /sourceMeta\?\.freshness \|\| 'unknown'/);
  // no 'mock seed' string literal used as a value (comments may mention it)
  assert.ok(!/lag: 'mock seed'/.test(src), 'no mock-seed value literals in AdsHub dataHealth');
  assert.ok(!/freshness \|\| 'mock seed'/.test(src), 'no mock-seed poison-default in AdsHub');
});

test('X-P1-01: GenerationBlock source default is unknown', async () => {
  const src = await read('apps/web-v2/src/components/m1/GenerationBlock.vue');
  assert.match(src, /sourceMeta\.source \|\| 'unknown'/);
  assert.ok(!/'deterministic_mock'/.test(src), 'no deterministic_mock poison-default');
});

test('X-P1-01: ListingWorkbenchPanel sourceLabel default is Unknown, not Mock', async () => {
  const src = await read('apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue');
  assert.match(src, /\|\| source \|\| 'Unknown'/);
});

test('X-P1-01: m1.js gallery missing-image source defaults to unknown', async () => {
  const src = await read('apps/web-v2/src/api/m1.js');
  assert.match(src, /img \? 'api_image' : 'unknown'/);
});

// ---------------------------------------------------------------------------
// N7-w6 (终态): B-3 W6 安全文案永远由 provider 真值驱动
//   (appStore.realWritesEnabled / sourceMeta), 不写死'永远 mock'。
//   - realWritesEnabled===true  -> 红色 danger '真实写入已开启 · 将影响真实店铺',
//                                  且不含'演示'。
//   - false (mock/无凭证)        -> '演示·沙箱模式 · 决策进入审计队列 · 授权真实店铺后由您
//                                  审批执行，不会自动触达亚马逊', 不含'真实写入已开启'。
//   - 随 store 真值自动切换 (同一 v-if/v-else, 无硬编码常量分支)。
// ---------------------------------------------------------------------------
test('N7-w6: DefaultLayout real-write copy is provider-truth driven (danger when armed)', async () => {
  const src = await read('apps/web-v2/src/layouts/DefaultLayout.vue');

  // The armed branch is gated on the store getter (single truth source), is danger,
  // carries the high-risk copy, and contains NO '演示' sandbox wording.
  const armed = src.match(
    /<el-tag v-if="realWritesEnabled"[\s\S]*?<\/el-tag>/,
  );
  assert.ok(armed, 'armed (v-if=realWritesEnabled) tag present');
  assert.match(armed[0], /type="danger"/, 'armed state is red danger');
  assert.match(armed[0], /真实写入已开启 · 将影响真实店铺/, 'armed high-risk copy');
  assert.ok(!/演示/.test(armed[0]), 'armed copy must NOT contain演示 sandbox wording');

  // The disarmed/mock branch carries the full honest sandbox copy and does NOT
  // claim真实写入已开启.
  const sandbox = src.match(/<el-tag v-else[\s\S]*?<\/el-tag>/);
  assert.ok(sandbox, 'disarmed (v-else) tag present');
  assert.match(
    sandbox[0],
    /演示·沙箱模式 · 决策进入审计队列 · 授权真实店铺后由您审批执行，不会自动触达亚马逊/,
    'sandbox honest copy',
  );
  assert.ok(!/真实写入已开启/.test(sandbox[0]), 'sandbox copy must NOT claim真实写入已开启');

  // The branch is driven by the store getter真值 — same v-if/v-else pair.
  assert.match(src, /v-if="realWritesEnabled"/);
  // No hard-coded'永远 mock'claim in the RENDERED copy (el-tag bodies). Comments may
  // document the intent, so scope the check to tag contents only.
  const tagBodies = (src.match(/<el-tag[\s\S]*?<\/el-tag>/g) || []).join('\n');
  assert.ok(!/永远\s*mock|永远\s*real/.test(tagBodies), 'no hard-coded永远 claim in rendered copy');
});

test('N7-w6: realWritesEnabled getter is derived from sourceMeta真值 (auto-switch source)', async () => {
  const store = await read('apps/web-v2/src/stores/app.js');
  // The getter that drives the copy is derived from sourceMeta (provider truth),
  // not a setter-less dead constant. This is what makes the copy auto-switch.
  assert.match(
    store,
    /realWritesEnabled:\s*\(state\)\s*=>\s*state\.sourceMeta\.realWritesEnabled\s*===\s*true/,
  );
  // DefaultLayout populates sourceMeta from /provider/status realWriteGate (true source).
  const layout = await read('apps/web-v2/src/layouts/DefaultLayout.vue');
  assert.match(layout, /realWritesEnabled:\s*st\.realWriteGate\?\.realWriteEnabled\s*===\s*true/);
});

test('N7-w6: Workbench status card real-write line is provider-truth driven', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  // armed copy (driven by appStore.realWritesEnabled真值) keeps high-risk wording.
  assert.match(src, /appStore\.realWritesEnabled\s*\?\s*'已开启 · 将影响真实店铺'/);
  // disarmed copy is the honest演示·沙箱 wording, not a fake'已关闭'-only claim.
  assert.match(src, /'演示·沙箱 · 决策进入审计队列'/);
  // ternary keyed off the store getter -> auto-switches with provider truth.
  assert.match(src, /:class="appStore\.realWritesEnabled \? 'bad' : 'warn'"/);
});

// ---------------------------------------------------------------------------
// M4-P1-01: front-end ANOMALY_TRANSITIONS mirrors backend EXACTLY.
// ---------------------------------------------------------------------------
test('M4-P1-01: front-end ANOMALY_TRANSITIONS mirrors backend definition', async () => {
  const beSrc = await read('apps/api/src/data-store-monitor.mjs');
  // FE ANOMALY_TRANSITIONS is defined once in the shared m4-transitions module and
  // imported by useM4State.js (single source of truth); assert that shared def mirrors BE.
  const feSrc = await read('apps/web-v2/src/composables/m4-transitions.js');

  function extractTransitions(src) {
    const start = src.indexOf('ANOMALY_TRANSITIONS = {');
    assert.ok(start >= 0, 'ANOMALY_TRANSITIONS present');
    const open = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(open + 1, end);
    const out = {};
    const re = /(\w+)\s*:\s*\[([^\]]*)\]/g; let m;
    while ((m = re.exec(body))) {
      const key = m[1];
      const arr = m[2].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean).sort();
      out[key] = arr;
    }
    return out;
  }

  const be = extractTransitions(beSrc);
  const fe = extractTransitions(feSrc);
  assert.deepEqual(fe, be, 'front-end mirror must equal backend ANOMALY_TRANSITIONS');
});

// ---------------------------------------------------------------------------
// M4-P1-04: Notifications honesty.
// ---------------------------------------------------------------------------
test('M4-P1-04: Notifications reads deliveryStatus and drops multi-channel已送达 claim', async () => {
  const src = await read('apps/web-v2/src/pages/Notifications.vue');
  // subtitle no longer claims已通过邮件/微信 multi-channel delivery
  assert.ok(!/站内 \+ 邮件 \+ 微信 多通道/.test(src), 'old multi-channel subtitle removed');
  assert.match(src, /邮件 \/ 微信通道规划中/);
  // reads deliveryStatus per channel + greys queued
  assert.match(src, /deliveryStatus/);
  assert.match(src, /通道未接入（queued）/);
  assert.match(src, /channel-queued/);
});

test('M4-P1-04: notifications bus markRead rolls back on failure (no swallowed 404)', async () => {
  const src = await read('apps/web-v2/src/composables/useNotificationsBus.js');
  // rollback path: re-increment unreadCount + clear local read + reset readAt
  assert.match(src, /_readLocal\.delete\(id\)/);
  assert.match(src, /didOptimisticUnread/);
  assert.match(src, /readAt: null/);
});

// ---------------------------------------------------------------------------
// M4-P1-03: recovery manual-send honesty.
// ---------------------------------------------------------------------------
test('M4-P1-03: RecoveryEmails button reads标记已人工发送 and收集 manual-evidence', async () => {
  const src = await read('apps/web-v2/src/pages/RecoveryEmails.vue');
  assert.match(src, /标记已人工发送/);
  assert.ok(!/通过 Buyer-Seller Messaging/.test(src), 'remove fake BSM delivery claim');
  // send() collects channel/sentBy/sentAt manual evidence
  assert.match(src, /channel,\s*sentBy,\s*sentAt/);
});

test('M4-P1-03: useM4State recovery send uses marked_sent transition + passes body', async () => {
  const src = await read('apps/web-v2/src/composables/useM4State.js');
  assert.match(src, /canRecoveryTransition\(cur\.status, 'marked_sent'\)/);
  assert.match(src, /recoveryApi\.send\(id, body\)/);
});

// ---------------------------------------------------------------------------
// M4-P0-06(5): test_buy_received row renders the appeal button.
// ---------------------------------------------------------------------------
test('M4-P0-06(5): Hijacking renders 记录人工申诉 button for test_buy_received', async () => {
  const src = await read('apps/web-v2/src/pages/Hijacking.vue');
  // the appeal action button is gated on test_buy_received. Per the authoritative M4-P0-02
  // contract (tests/ui-m4-appeals-flow.test.mjs), appeal_drafted is a DEAD status in the
  // hijacking state machine and must NOT gate this button.
  assert.match(src, /row\.status === 'test_buy_received'[^]*?recordAppealSubmission/);
  assert.doesNotMatch(src, /row\.status === 'appeal_drafted'/);
  // and submitAppeal must send the four manual-evidence fields, not a front-end appealId
  assert.match(src, /amazonCaseId:/);
  assert.match(src, /submittedBy:/);
  assert.match(src, /manualSubmittedAt:/);
  assert.match(src, /evidenceAttachment:/);
  assert.ok(!/submitAppeal\(item\.id, \{ appealId:/.test(src), 'no front-end appealId passthrough');
});

// ---------------------------------------------------------------------------
// M4-P2-03: SLABoard default range aligned to 7d.
// ---------------------------------------------------------------------------
test('M4-P2-03: three places default SLA range to 7d', async () => {
  const api = await read('apps/web-v2/src/api/m4.js');
  const page = await read('apps/web-v2/src/pages/SLABoard.vue');
  assert.match(api, /board:\s*\(range = '7d'\)/);
  assert.match(page, /route\.query\.range \|\| '7d'/);
  // backend default already '7d'
  const be = await read('apps/api/src/data-store-monitor.mjs');
  assert.match(be, /function slaBoard\(db, userId, storeId, range = '7d'\)/);
});
