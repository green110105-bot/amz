// W13: dashboard contract regression — mock AND db codepaths.
//
// Acceptance (worklist W13):
//   遍历 mock 与 db 两条 codepath：
//     - assert 两者均含 overview && generatedAt && Array.isArray(actionCards)
//     - 每卡 assert 至少含 type && priority && payload 三键，且 payload.id 为稳定值
//     - assert 两路径顶层 key 集合互为超集
//     - 采用「至少含三键」策略以允许合理扩展
//
// Rationale: 将 W1/W2 的同构契约固化为回归，防字段漂移再次导致付费倒挂。
// This locks the invariant that the DB codepath and the MOCK codepath emit the
// SAME top-level dashboard shape, so the frontend (single normalizeCard) never
// silently loses a paid-impact field on one path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-dashboard-contract-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');

const { handleExtendedRequest } = await import('../../apps/api/src/extended-routes.mjs');
const { authenticate, defaultStoreIdFor, getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { buildDashboard } = await import('../../packages/domain/src/dashboard-engine.mjs');
const { sampleStore } = await import('../../packages/mock-data/src/sample-store.mjs');

getDbInstance();
const auth = authenticate('demo@amz.local', 'demo');
const storeId = defaultStoreIdFor(auth.user.id);

function request(path) {
  return new Request('http://localhost' + path, {
    headers: {
      authorization: 'Bearer ' + auth.token,
      'x-store-id': storeId,
    },
  });
}

const CARD_TYPES = new Set(['anomaly', 'profit_leak', 'ad_suggestion', 'inventory']);

// Returns { mock, db } dashboard bodies from the two real codepaths.
async function bothBodies() {
  const mock = buildDashboard(sampleStore);
  const dbRes = await handleExtendedRequest(request('/api/v1/dashboard'));
  assert.equal(dbRes.status, 200);
  const db = await dbRes.json();
  return { mock, db };
}

// Shared per-body contract: overview && generatedAt && Array.isArray(actionCards)
// + every card has >=3 keys (type, priority, payload) with a stable payload.id.
function assertBodyContract(body, label) {
  assert.ok(body.overview, `${label}: overview present`);
  assert.equal(typeof body.generatedAt, 'string', `${label}: generatedAt is string`);
  assert.ok(!Number.isNaN(Date.parse(body.generatedAt)), `${label}: generatedAt parses`);
  assert.ok(Array.isArray(body.actionCards), `${label}: actionCards is array`);

  for (const card of body.actionCards) {
    // 「至少含三键」: type / priority / payload must all be present (extension allowed).
    assert.ok('type' in card, `${label}: card.type present`);
    assert.ok('priority' in card, `${label}: card.priority present`);
    assert.ok('payload' in card, `${label}: card.payload present`);
    assert.ok(CARD_TYPES.has(card.type), `${label}: card.type ${card.type} is valid`);
    assert.ok(card.payload && typeof card.payload === 'object', `${label}: payload is object`);
    // payload.id must be a stable, defined value (used as v-for key / dedupe key).
    assert.ok(
      card.payload.id !== undefined && card.payload.id !== null && card.payload.id !== '',
      `${label}: payload.id is a stable value`,
    );
  }
}

test('W13: mock codepath satisfies overview/generatedAt/actionCards + 三键 contract', async () => {
  const { mock } = await bothBodies();
  assertBodyContract(mock, 'mock');
});

test('W13: db codepath satisfies overview/generatedAt/actionCards + 三键 contract', async () => {
  const { db } = await bothBodies();
  assertBodyContract(db, 'db');
  // DB path must also honestly self-report it is NOT mock.
  assert.equal(db.sourceMode, 'db', 'db path reports sourceMode=db');
  assert.equal(db.sourceMeta?.mock, false, 'db path sourceMeta.mock=false (no mock masquerade)');
});

test('W13: mock 与 db 顶层 key 集合互为超集（同构，无字段漂移）', async () => {
  const { mock, db } = await bothBodies();
  const mockKeys = new Set(Object.keys(mock));
  const dbKeys = new Set(Object.keys(db));
  // mutual superset == equal sets. Assert both directions explicitly so a drift
  // on either path produces a clear failure message.
  for (const k of mockKeys) {
    assert.ok(dbKeys.has(k), `db path missing top-level key present in mock: "${k}"`);
  }
  for (const k of dbKeys) {
    assert.ok(mockKeys.has(k), `mock path missing top-level key present in db: "${k}"`);
  }
});

test('W13: payload.id is stable across repeated DB reads (deterministic key)', async () => {
  const a = await handleExtendedRequest(request('/api/v1/dashboard'));
  const b = await handleExtendedRequest(request('/api/v1/dashboard'));
  const ba = await a.json();
  const bb = await b.json();
  const idsA = ba.actionCards.map((c) => c.payload.id).sort();
  const idsB = bb.actionCards.map((c) => c.payload.id).sort();
  assert.deepEqual(idsA, idsB, 'payload.id set is stable across reads');
});
