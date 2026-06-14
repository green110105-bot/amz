import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-dashboard-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');

const { handleExtendedRequest } = await import('../../apps/api/src/extended-routes.mjs');
const { authenticate, defaultStoreIdFor, getDbInstance } = await import('../../apps/api/src/data-store.mjs');

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

test('authenticated dashboard uses store DB and W1 unified contract', async () => {
  const res = await handleExtendedRequest(request('/api/v1/dashboard'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.sourceMode, 'db');
  assert.equal(body.sourceMeta.mock, false);
  // overview 由 aggregateProfit 产出
  assert.ok(body.overview, 'overview present');
  for (const k of ['revenue', 'netProfit', 'totalCosts', 'profitMargin', 'orders', 'confidence']) {
    assert.equal(typeof body.overview[k], 'number', `overview.${k} is number`);
  }
  // generatedAt ISO 字符串
  assert.equal(typeof body.generatedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(body.generatedAt)), 'generatedAt parses');
  // actionCards 每卡三键 + payload 稳定 id 等
  assert.ok(Array.isArray(body.actionCards));
  for (const card of body.actionCards) {
    assert.ok(CARD_TYPES.has(card.type), `card.type ${card.type} valid`);
    assert.ok('priority' in card, 'card.priority present');
    assert.ok(card.payload, 'card.payload present');
    assert.ok(card.payload.id, 'payload.id present');
    assert.ok('evidence' in card.payload, 'payload.evidence present');
    assert.ok('expectedImpact' in card.payload, 'payload.expectedImpact present');
    assert.ok('confidence' in card.payload, 'payload.confidence present');
    assert.ok('recommendation' in card.payload, 'payload.recommendation present');
    assert.equal(card.payload.auditRequired, true);
  }
});

test('W1: mock 路径与 DB 路径顶层 key 集合一致', async () => {
  const { buildDashboard } = await import('../../packages/domain/src/dashboard-engine.mjs');
  const { sampleStore } = await import('../../packages/mock-data/src/sample-store.mjs');
  const mockBody = buildDashboard(sampleStore);
  const dbRes = await handleExtendedRequest(request('/api/v1/dashboard'));
  const dbBody = await dbRes.json();
  const mockKeys = Object.keys(mockBody).sort();
  const dbKeys = Object.keys(dbBody).sort();
  assert.deepEqual(dbKeys, mockKeys, `top-level key sets equal: db=${dbKeys} mock=${mockKeys}`);
  // mock 卡片同样满足三键 + payload.id
  for (const card of mockBody.actionCards) {
    assert.ok(CARD_TYPES.has(card.type));
    assert.ok('priority' in card);
    assert.ok(card.payload && card.payload.id);
  }
});
