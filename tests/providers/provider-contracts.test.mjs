import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAmazonAdsApiProvider,
  createAmazonSpApiProvider,
  createBillingProvider,
  createHelium10Provider,
  createKeepaProvider,
  createLlmProvider,
  createNotificationProvider,
  createProviderContracts,
  createSellerSpriteProvider,
  providerModes,
} from '../../packages/providers/src/index.mjs';

const providerFactories = [
  ['amazon-sp-api', createAmazonSpApiProvider, 'listCatalogItems'],
  ['amazon-ads-api', createAmazonAdsApiProvider, 'getCampaignMetrics'],
  ['keepa', createKeepaProvider, 'getProductHistory'],
  ['sellersprite', createSellerSpriteProvider, 'getKeywordResearch'],
  ['helium10', createHelium10Provider, 'getKeywordResearch'],
  ['llm', createLlmProvider, 'complete'],
  ['notification', createNotificationProvider, 'getTemplates'],
  ['billing', createBillingProvider, 'getSubscription'],
];

test('mock providers pull deterministic fixtures with source confidence and lineage', async () => {
  for (const [expectedProvider, factory, readMethod] of providerFactories) {
    const provider = factory({ mode: providerModes.mock });
    const result = await provider[readMethod]();

    assert.equal(result.ok, true, `${expectedProvider} pull should succeed`);
    assert.equal(result.provider, expectedProvider);
    assert.equal(result.mode, providerModes.mock);
    assert.match(result.source, new RegExp(`^${expectedProvider}:mock:fixture$`));
    assert.equal(result.fetchedAt, '2026-05-08T00:00:00.000Z');
    assert.equal(typeof result.confidence, 'number');
    assert.ok(result.confidence > 0 && result.confidence <= 1);
    assert.equal(result.lineage.provider, expectedProvider);
    assert.equal(result.lineage.operation, readMethod);
    assert.equal(result.lineage.fixtureVersion, 'providers.v1');
  }
});

test('provider registry exposes every MVP integration contract', () => {
  const providers = createProviderContracts({ mode: providerModes.sandbox });
  assert.deepEqual(Object.keys(providers).sort(), [
    'ads',
    'billing',
    'helium10',
    'keepa',
    'llm',
    'notification',
    'sellersprite',
    'spapi',
  ]);
  assert.ok(providers.spapi.capabilities.includes('listings:write-blocked'));
  assert.ok(providers.billing.capabilities.includes('checkout:write-blocked'));
});

test('read results include deterministic rate limit and backoff metadata', async () => {
  const ads = createAmazonAdsApiProvider({ mode: providerModes.mock });
  const result = await ads.getCampaignMetrics();

  assert.equal(result.rateLimit.limit, 10);
  assert.equal(result.rateLimit.remaining, 8);
  assert.equal(result.rateLimit.backoff.strategy, 'exponential-jitter-disabled');
  assert.equal(result.rateLimit.backoff.deterministic, true);
  assert.equal(result.rateLimit.backoff.nextDelayMs, 250);
});

test('real reads are blocked with audit explanation when credentials are missing', async () => {
  const spapi = createAmazonSpApiProvider({ mode: providerModes.real, credentials: {} });
  const result = await spapi.getOrders();

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, 'REAL_CREDENTIALS_MISSING');
  assert.equal(result.mode, providerModes.real);
  assert.deepEqual(result.requiredCredentials, ['lwaClientId', 'lwaClientSecret', 'refreshToken', 'roleArn']);
  assert.equal(result.audit.decision, 'blocked');
  assert.match(result.audit.explanation, /No network call/);
  assert.equal(result.source, 'amazon-sp-api:real:blocked');
  assert.equal(result.confidence, 1);
  assert.equal(result.lineage.dataset, 'credential-check');
});

test('real credentials allow deterministic sandboxed pull without network mutation', async () => {
  const keepa = createKeepaProvider({ mode: providerModes.real, credentials: { apiKey: 'test-key' } });
  const result = await keepa.getBuyBox('B0CASE001');

  assert.equal(result.ok, true);
  assert.equal(result.mode, providerModes.real);
  assert.equal(result.data.asin, 'B0CASE001');
  assert.equal(result.source, 'keepa:real:fixture');
  assert.equal(result.lineage.upstreamIds[0], 'B0CASE001');
});

test('all real write-like operations are blocked and audit explainable', async () => {
  const writeCases = [
    [createAmazonSpApiProvider({ mode: providerModes.real }), 'patchListing', { sku: 'CASE-001', title: 'Unsafe mutation' }],
    [createAmazonAdsApiProvider({ mode: providerModes.real }), 'updateCampaignBudget', { campaignId: 'camp-case-growth', budget: 999 }],
    [createAmazonAdsApiProvider({ mode: providerModes.real }), 'addNegativeKeyword', { campaignId: 'camp-case-growth', keyword: 'bad term' }],
    [createNotificationProvider({ mode: providerModes.real }), 'sendEmail', { templateId: 'profit-alert', to: 'ops@example.test' }],
    [createNotificationProvider({ mode: providerModes.real }), 'sendWeCom', { templateId: 'stockout-alert', webhookUrl: 'secret-url' }],
    [createBillingProvider({ mode: providerModes.real }), 'createCheckoutSession', { tenantId: 'tenant-demo', plan: 'operator', secretKey: 'sk_live_nope' }],
  ];

  for (const [provider, method, payload] of writeCases) {
    const result = await provider[method](payload);
    assert.equal(result.ok, false, `${provider.name}.${method} must be blocked`);
    assert.equal(result.reasonCode, 'REAL_WRITE_BLOCKED');
    assert.equal(result.audit.decision, 'blocked');
    assert.match(result.audit.explanation, new RegExp(provider.name));
    assert.equal(result.confidence, 1);
    assert.equal(result.lineage.dataset, 'write-guard');
    assert.equal(result.source, `${provider.name}:real:write-blocked`);
  }
});

test('blocked write payloads redact credential-shaped fields', async () => {
  const billing = createBillingProvider({ mode: providerModes.real });
  const result = await billing.createCheckoutSession({ tenantId: 'tenant-demo', secretKey: 'sk_live_nope', apiToken: 'token' });

  assert.equal(result.attemptedPayload.secretKey, '[redacted]');
  assert.equal(result.attemptedPayload.apiToken, '[redacted]');
  assert.equal(result.attemptedPayload.tenantId, 'tenant-demo');
});
