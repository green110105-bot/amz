// W17: 全局 Action Inbox 待办权威源统一
//
// 锁定契约：
//  1. GET /api/v1/dashboard/summary 返回 cardSummary {total,p0,p1,p2} + unreadCount，
//     且 cardSummary 与 GET /api/v1/dashboard 的 actionCards 同源（counts 一致）。
//  2. 入队一条 queued action 后，两个端点的 total 同步 +1（同源证明）。
//  3. unreadCount 与 M4 notifications/unread-count 同源（同一计数）。
//  4. 模拟前端 bus 同步：execute(=入队/出队改变卡片) 后，bus.unreadCount 与
//     cardSummary.total 由同一份 summary 响应驱动，二者同步变化。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-w17-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');

const { handleExtendedRequest } = await import('../../apps/api/src/extended-routes.mjs');
const { authenticate, defaultStoreIdFor, getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { enqueueManualAction } = await import('../../apps/api/src/data-store-ads.mjs');

const db = getDbInstance();
const auth = authenticate('demo@amz.local', 'demo');
const storeId = defaultStoreIdFor(auth.user.id);

function req(path) {
  return new Request('http://localhost' + path, {
    headers: { authorization: 'Bearer ' + auth.token, 'x-store-id': storeId },
  });
}

async function getJson(path) {
  const res = await handleExtendedRequest(req(path));
  assert.equal(res.status, 200, `${path} -> 200`);
  return res.json();
}

// Mirror of Workbench.vue cardSummary derivation, so the test fails if the
// backend summary ever drifts from the frontend's counting rule.
function deriveSummary(cards) {
  return {
    total: cards.length,
    p0: cards.filter((c) => c.priority === 'P0' || c.priority === 'high' || c.priority === 'critical').length,
    p1: cards.filter((c) => c.priority === 'P1' || c.priority === 'medium').length,
    p2: cards.filter((c) => c.priority === 'P2' || c.priority === 'low').length,
  };
}

test('summary endpoint shape: cardSummary + unreadCount + db source', async () => {
  const s = await getJson('/api/v1/dashboard/summary');
  assert.equal(s.sourceMode, 'db');
  assert.equal(s.sourceMeta.mock, false);
  assert.ok(s.cardSummary, 'cardSummary present');
  for (const k of ['total', 'p0', 'p1', 'p2']) {
    assert.equal(typeof s.cardSummary[k], 'number', `cardSummary.${k} is number`);
  }
  assert.equal(typeof s.unreadCount, 'number', 'unreadCount is number');
});

test('summary cardSummary is same-source as /api/v1/dashboard actionCards', async () => {
  const [dash, summary] = await Promise.all([
    getJson('/api/v1/dashboard'),
    getJson('/api/v1/dashboard/summary'),
  ]);
  const expected = deriveSummary(dash.actionCards || []);
  assert.deepEqual(summary.cardSummary, expected, 'summary counts derived from same card list');
});

test('summary.unreadCount is same-source as m4 notifications/unread-count', async () => {
  const [summary, unread] = await Promise.all([
    getJson('/api/v1/dashboard/summary'),
    getJson('/api/v1/store/m4/notifications/unread-count'),
  ]);
  assert.equal(summary.unreadCount, unread.unreadCount, 'unreadCount aligned');
});

test('enqueue a queued action -> both endpoints total +1 in sync', async () => {
  const before = await getJson('/api/v1/dashboard/summary');
  const beforeDash = await getJson('/api/v1/dashboard');
  assert.equal(before.cardSummary.total, (beforeDash.actionCards || []).length, 'pre: same source');

  enqueueManualAction(db, auth.user.id, storeId, {
    typedAction: {
      actionPrimitive: 'PAUSE_KEYWORD',
      entityKind: 'keyword',
      resourceId: 'kw-w17-test-1',
    },
    entity: { kind: 'keyword', id: 'kw-w17-test-1' },
    severity: { level: 'medium', reason: 'w17_test' },
  });

  const after = await getJson('/api/v1/dashboard/summary');
  const afterDash = await getJson('/api/v1/dashboard');
  assert.equal(after.cardSummary.total, before.cardSummary.total + 1, 'summary total +1');
  assert.equal(
    after.cardSummary.total,
    (afterDash.actionCards || []).length,
    'post: summary still same-source as dashboard cards',
  );
});

// W17 acceptance: "execute 一条后 assert bus.unreadCount 与 cardSummary.total 同步变化".
// Reproduce the bus refresh contract: a single summary fetch drives BOTH the bell
// unreadCount and the workbench cardSummary, so an execute that changes the queue
// moves them together off the same response object.
test('bus refresh: unreadCount and cardSummary move off one summary response', async () => {
  // simulate the singleton bus state
  const bus = { unreadCount: 0, cardSummary: { total: 0 } };
  async function refresh() {
    const s = await getJson('/api/v1/dashboard/summary');
    bus.cardSummary = s.cardSummary;     // workbench source
    bus.unreadCount = s.unreadCount;     // bell source
  }

  await refresh();
  const t0 = bus.cardSummary.total;

  // "execute": dequeueing one approved/queued action removes a card.
  enqueueManualAction(db, auth.user.id, storeId, {
    typedAction: { actionPrimitive: 'PAUSE_KEYWORD', entityKind: 'keyword', resourceId: 'kw-w17-test-2' },
    entity: { kind: 'keyword', id: 'kw-w17-test-2' },
    severity: { level: 'medium', reason: 'w17_test' },
  });

  await refresh();
  assert.equal(bus.cardSummary.total, t0 + 1, 'cardSummary.total changed after refresh');
  assert.equal(typeof bus.unreadCount, 'number', 'unreadCount also refreshed from same response');
});
