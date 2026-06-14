import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-ads-live-gate-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');
// X-P0-03: real Amazon writes are only permitted in 'real' provider mode.
process.env.DATA_PROVIDER_MODE = 'real';
process.env.ADS_API_MOCK = 'false';
process.env.ADS_API_USE_SANDBOX = 'true';
process.env.ADS_LWA_CLIENT_ID = 'live-gate-client-id-secret';
process.env.ADS_LWA_CLIENT_SECRET = 'live-gate-client-secret-secret';
process.env.ADS_REAL_WRITES_ENABLED = 'true';
process.env.ADS_REAL_WRITES_STORE_ALLOWLIST = '*';
process.env.ADS_REAL_WRITES_PROFILE_ALLOWLIST = '12345';
process.env.ADS_REAL_WRITES_ALLOWED_PRIMITIVES = 'ADJUST_BID';
process.env.ADS_REAL_WRITE_MAX_BID_CHANGE_PCT = '0.10';

const realFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  calls.push({ href, method: init.method || 'GET', body: init.body || '' });
  if (href === 'https://api.amazon.com/auth/o2/token') {
    return new Response(JSON.stringify({ access_token: 'Atza|live-gate-access-token', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (href.includes('advertising-api-test.amazon.com/sp/keywords') && init.method === 'PUT') {
    const body = JSON.parse(init.body);
    assert.deepEqual(body, [{ keywordId: 9001, bid: 1.05 }]);
    assert.equal(init.headers['Amazon-Advertising-API-Scope'], '12345');
    return new Response(JSON.stringify([{ code: 'SUCCESS', keywordId: 9001 }]), {
      status: 207,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error('unexpected_fetch_' + href);
};

const { getDbInstance, authenticate, registerUser } = await import('../../apps/api/src/data-store.mjs');
const { upsertAdsCredentials } = await import('../../apps/api/src/integrations/ads-api/credentials.mjs');
const { handleAdsRequest } = await import('../../apps/api/src/store-routes-ads.mjs');

const reg = registerUser({ email: 'adslive@local.test', password: 'pw123456', name: 'Ads Live' });
const userId = reg.user.id;
const token = authenticate('adslive@local.test', 'pw123456').token;
const db = getDbInstance();
const storeId = db.prepare(`SELECT id FROM user_stores WHERE user_id=? LIMIT 1`).get(userId).id;
upsertAdsCredentials({ userId, storeId, refreshToken: 'Atzr|ads-refresh-token-secret', profileId: '12345', region: 'NA' });

function nowIso() { return new Date().toISOString(); }

function seedKeywordAndQueue(id = 'aq-live-keyword') {
  const now = nowIso();
  db.prepare(`INSERT OR REPLACE INTO lx_targetings(
    id,user_id,store_id,campaign_id,ad_group_id,type,term,match_type,bid,enabled,state,metrics,extra,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      '9001', userId, storeId, '7001', '8001', 'keyword', 'test keyword', 'exact', 1.00, 1, 'enabled',
      '{}', '{}', now, now,
    );
  db.prepare(`INSERT OR REPLACE INTO ad_action_queue(
    id,user_id,store_id,suggestion_id,source_strategy_id,source_strategy_name,state,priority_score,severity,entity,
    typed_action,evidence_refs,guardrail,rollback_plan,impact_estimate,source_meta,confidence_breakdown,dry_run,audit_required,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, userId, storeId, null, null, 'live gate test', 'approved', 99, '{"level":"P1"}',
      JSON.stringify({ targetingId: '9001', campaignId: '7001', adGroupId: '8001', keyword: 'test keyword' }),
      JSON.stringify({
        actionPrimitive: 'ADJUST_BID',
        entityPath: { targetingId: '9001', keywordId: '9001', campaignId: '7001', adGroupId: '8001' },
        currentValue: { bid: 1.00 },
        recommendedValue: { bid: 1.05 },
        dryRun: true,
        auditRequired: true,
      }),
      '[]',
      JSON.stringify({ status: 'needs_review', dryRunOnly: false, reasons: [] }),
      JSON.stringify({ method: 'restore_previous_bid', previousValue: { bid: 1.00 } }),
      '{}',
      JSON.stringify({ source: 'ads_api', realWriteEnabled: true }),
      '{}',
      1, 1, null, now, now,
    );
}

function req(path, body) {
  return new Request('http://localhost' + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'x-store-id': storeId,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
}

async function post(path, body) {
  const res = await handleAdsRequest(req(path, body));
  const json = await res.json();
  return { status: res.status, body: json };
}

test('real Ads action gate executes one confirmed keyword bid change and records audit/run', async () => {
  // X-P0-04(1): the 200/PUT success path is ONLY permitted in explicit 'real' mode.
  // Set it at the top of the case so the contract is local & unmistakable.
  process.env.DATA_PROVIDER_MODE = 'real';
  seedKeywordAndQueue('aq-live-keyword');
  const r = await post('/api/v1/store/ads/action-queue/aq-live-keyword/execute', {
    realWriteEnabled: true,
    confirmRealWrite: true,
    riskAccepted: true,
    profileId: '12345',
    keywordId: '9001',
    currentBid: 1.00,
    newBid: 1.05,
    reason: 'integration smoke',
  });

  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'executed');
  assert.equal(r.body.latestRun.status, 'real_write_success');
  assert.equal(r.body.latestRun.dryRun, false);
  assert.equal(r.body.latestRun.responsePayload.realWrite, true);
  assert.equal(r.body.latestRun.responsePayload.mutation.resourceId, '9001');
  assert.equal(db.prepare(`SELECT bid FROM lx_targetings WHERE id='9001'`).get().bid, 1.05);
  assert.ok(calls.some((c) => c.href.includes('/sp/keywords') && c.method === 'PUT'));

  const serialized = JSON.stringify(r.body);
  assert.doesNotMatch(serialized, /Atzr\|ads-refresh-token-secret|Atza\|live-gate-access-token|live-gate-client-id-secret/);

  // X-P2-02: DB row-level redaction — request_payload / response_payload columns
  // must not contain refresh/access tokens.
  const runRow = db.prepare(
    `SELECT request_payload, response_payload FROM ad_action_runs WHERE queue_item_id='aq-live-keyword' ORDER BY created_at DESC LIMIT 1`
  ).get();
  assert.doesNotMatch(runRow.request_payload || '', /Atzr\||Atza\||refresh_token/);
  assert.doesNotMatch(runRow.response_payload || '', /Atzr\||Atza\||refresh_token/);
  const auditRow = db.prepare(
    `SELECT payload FROM audit_logs WHERE resource_id='aq-live-keyword' ORDER BY executed_at DESC LIMIT 1`
  ).get();
  assert.doesNotMatch(auditRow.payload || '', /Atzr\||Atza\||refresh_token/);
});

test('real Ads action gate requires explicit confirmation and risk acceptance', async () => {
  seedKeywordAndQueue('aq-live-blocked');
  const r = await post('/api/v1/store/ads/action-queue/aq-live-blocked/execute', {
    realWriteEnabled: true,
    profileId: '12345',
    keywordId: '9001',
    currentBid: 1.00,
    newBid: 1.05,
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'bad_request');
  assert.match(r.body.message, /confirm_real_write_required/);
});

test('batch real writes stay blocked; use one reviewed action at a time', async () => {
  const r = await post('/api/v1/store/ads/action-queue/execute-batch', {
    realWriteEnabled: true,
    ids: ['aq-live-keyword'],
  });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /batch_real_write_not_supported/);
});

test('X-P0-03: mock/hybrid provider mode blocks real write even with all env gates set', async () => {
  seedKeywordAndQueue('aq-mode-block');
  const prevMode = process.env.DATA_PROVIDER_MODE;
  const callsBefore = calls.filter((c) => c.href.includes('/sp/keywords') && c.method === 'PUT').length;
  process.env.DATA_PROVIDER_MODE = 'hybrid';
  try {
    const r = await post('/api/v1/store/ads/action-queue/aq-mode-block/execute', {
      realWriteEnabled: true,
      confirmRealWrite: true,
      riskAccepted: true,
      profileId: '12345',
      keywordId: '9001',
      currentBid: 1.00,
      newBid: 1.05,
    });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /real_write_requires_real_provider_mode/);
    const callsAfter = calls.filter((c) => c.href.includes('/sp/keywords') && c.method === 'PUT').length;
    assert.equal(callsAfter, callsBefore); // no live PUT issued
  } finally {
    process.env.DATA_PROVIDER_MODE = prevMode;
  }
});

test('X-P0-04: mock AND hybrid modes both block real write with zero live PUT even with full env gates', async () => {
  const prevMode = process.env.DATA_PROVIDER_MODE;
  for (const mode of ['hybrid', 'mock']) {
    seedKeywordAndQueue('aq-mode-block-' + mode);
    const putBefore = calls.filter((c) => c.href.includes('advertising-api-test.amazon.com/sp/keywords') && c.method === 'PUT').length;
    process.env.DATA_PROVIDER_MODE = mode;
    try {
      const r = await post('/api/v1/store/ads/action-queue/aq-mode-block-' + mode + '/execute', {
        realWriteEnabled: true,
        confirmRealWrite: true,
        riskAccepted: true,
        profileId: '12345',
        keywordId: '9001',
        currentBid: 1.00,
        newBid: 1.05,
      });
      assert.notEqual(r.status, 200, `${mode} must not return 200`);
      assert.match(r.body.message, /real_write_requires_real_provider_mode/);
      const putAfter = calls.filter((c) => c.href.includes('advertising-api-test.amazon.com/sp/keywords') && c.method === 'PUT').length;
      assert.equal(putAfter, putBefore, `${mode} must issue zero live keyword PUT`);
      // Contract: serialized response never leaks refresh/access token patterns.
      const serialized = JSON.stringify(r.body);
      assert.doesNotMatch(serialized, /Atzr\||Atza\|/);
    } finally {
      process.env.DATA_PROVIDER_MODE = prevMode;
    }
  }
});

test('X-P2-03: bare storeId in allowlist is rejected; only userId:storeId is honored', async () => {
  process.env.DATA_PROVIDER_MODE = 'real';
  seedKeywordAndQueue('aq-allowlist');
  const prevAllow = process.env.ADS_REAL_WRITES_STORE_ALLOWLIST;
  process.env.ADS_REAL_WRITES_STORE_ALLOWLIST = storeId; // bare storeId only
  try {
    const r = await post('/api/v1/store/ads/action-queue/aq-allowlist/execute', {
      realWriteEnabled: true,
      confirmRealWrite: true,
      riskAccepted: true,
      profileId: '12345',
      keywordId: '9001',
      currentBid: 1.00,
      newBid: 1.05,
    });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /store_not_allowlisted/);
  } finally {
    process.env.ADS_REAL_WRITES_STORE_ALLOWLIST = prevAllow;
  }
});

process.on('exit', () => { globalThis.fetch = realFetch; });
