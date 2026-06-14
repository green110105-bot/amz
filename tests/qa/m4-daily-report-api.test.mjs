import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TMP_DIR = mkdtempSync(join(tmpdir(), 'qa-m4-daily-'));
process.env.DATA_DB_PATH = join(TMP_DIR, 'store.db');
process.env.CREDENTIAL_ENC_KEY = process.env.CREDENTIAL_ENC_KEY || 'qa-m4-daily-test-key';
process.env.ADS_API_MOCK = 'true';

globalThis.fetch = async () => {
  throw new Error('network blocked in M4 daily report API test');
};

const { handleMonitorRequest } = await import('../../apps/api/src/store-routes-monitor.mjs');
const dataStore = await import('../../apps/api/src/data-store.mjs');
const { authenticate, registerUser, defaultStoreIdFor, listAuditLogs } = dataStore;

const BASE = 'http://localhost';
let TOKEN = null;
let USER_ID = null;
let STORE_ID = null;

function setup() {
  if (TOKEN) return;
  const email = `qa-m4-daily-${Date.now()}@example.com`;
  const reg = registerUser({ email, password: 'pass1234', name: 'QA M4 Daily', role: 'operator' });
  assert.ok(reg.user, 'registerUser must succeed');
  USER_ID = reg.user.id;
  const auth = authenticate(email, 'pass1234');
  assert.ok(auth?.token, 'authenticate must yield token');
  TOKEN = auth.token;
  STORE_ID = defaultStoreIdFor(USER_ID);
  assert.ok(STORE_ID, 'default store must exist');
}

async function call(method, path, { noAuth = false } = {}) {
  setup();
  const req = new Request(BASE + path, {
    method,
    headers: {
      ...(noAuth ? {} : { authorization: `Bearer ${TOKEN}` }),
      'x-store-id': STORE_ID,
    },
  });
  const res = await handleMonitorRequest(req);
  assert.ok(res, `handler returned null for ${method} ${path}`);
  return { status: res.status, body: await res.json() };
}

test('M4 daily report API requires auth', async () => {
  const res = await call('GET', '/api/v1/store/m4/reports/daily?storeIds=all', { noAuth: true });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'unauthorized');
});

test('M4 daily report API returns a read-only daily operating snapshot', async () => {
  setup();
  const beforeAuditCount = listAuditLogs(USER_ID, STORE_ID, {}).length;
  const res = await call('GET', '/api/v1/store/m4/reports/daily?storeIds=all&date=2026-05-26&snapshot=latest');
  const afterAuditCount = listAuditLogs(USER_ID, STORE_ID, {}).length;

  assert.equal(res.status, 200);
  assert.equal(res.body.reportDate, '2026-05-26');
  assert.equal(res.body.triggerType, 'on_demand');
  assert.ok(Array.isArray(res.body.stores));
  assert.ok(res.body.stores.length >= 1);
  assert.ok(Array.isArray(res.body.availableStores));
  assert.ok(Array.isArray(res.body.availableLinks));
  assert.ok(Array.isArray(res.body.links));
  assert.equal(res.body.trends.length, 7);
  assert.equal(beforeAuditCount, afterAuditCount, 'daily report must not create write/audit side effects');
  assert.equal(res.body.filters.realDataOnly, false, 'mock/hybrid fixtures must not be reported as real-only');

  for (const key of ['unitsSold', 'gmv', 'adSpend', 'avgRating', 'alerts']) {
    assert.ok(Object.hasOwn(res.body.summary, key), `missing summary.${key}`);
  }
  for (const key of ['sales', 'gmv', 'adSpend', 'rating', 'categoryRank', 'alerts']) {
    assert.ok(Object.hasOwn(res.body.sourceMeta, key), `missing sourceMeta.${key}`);
    assert.equal(typeof res.body.sourceMeta[key].mock, 'boolean', `sourceMeta.${key} must expose mock provenance`);
  }
  for (const key of ['ads', 'reviews', 'anomalies', 'competitors']) {
    assert.ok(res.body.deepLinks[key], `missing deepLinks.${key}`);
  }
});

test('M4 daily report API supports link dimension filtering', async () => {
  const first = await call('GET', '/api/v1/store/m4/reports/daily?storeIds=all&snapshot=latest');
  assert.equal(first.status, 200);
  const link = first.body.availableLinks[0];
  assert.ok(link?.id, 'seeded DB should expose at least one link option');

  const res = await call('GET', `/api/v1/store/m4/reports/daily?storeIds=${encodeURIComponent(link.storeId)}&linkId=${encodeURIComponent(link.id)}&snapshot=latest`);
  assert.equal(res.status, 200);
  assert.equal(res.body.filters.linkId, link.id);
  assert.ok(res.body.links.length <= 1);
  if (res.body.links.length) {
    assert.equal(res.body.links[0].linkId, link.id);
  }
});

test.after(() => {
  try { dataStore.reset?.(); } catch {}
  rmSync(TMP_DIR, { recursive: true, force: true });
});
