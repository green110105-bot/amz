// M2 smoke test — runs against http://localhost:18080
// Login -> X-Store-Id discover -> exercise each M2 endpoint
import http from 'node:http';

const BASE = process.env.API_BASE || 'http://localhost:18080';
const EMAIL = 'demo@amz.local';
const PASSWORD = 'demo';

function rq(method, path, { body, token, storeId } = {}) {
  const url = new URL(path, BASE);
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  if (storeId) headers['x-store-id'] = storeId;
  return new Promise((resolve, reject) => {
    const req = http.request({
      method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
}

async function main() {
  // 1) login
  const login = await rq('POST', '/api/v1/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  if (login.status !== 200) { console.error('login failed', login); process.exit(2); }
  const token = login.body.token;
  // 2) stores
  const stores = await rq('GET', '/api/v1/store/stores', { token });
  const storeId = (stores.body && stores.body[0] && stores.body[0].id) || 's-mock-us';

  const G = (path) => rq('GET', path, { token, storeId });
  const P = (path, body) => rq('POST', path, { token, storeId, body });
  const PT = (path, body) => rq('PUT', path, { token, storeId, body });
  const D = (path) => rq('DELETE', path, { token, storeId });

  // 1. profit overview
  let r = await G('/api/v1/store/m2/profit/overview?range=30d');
  record('GET /profit/overview', r.status === 200 && r.body?.overview, `revenue=${r.body?.overview?.revenue} orders=${r.body?.overview?.orders}`);

  // 2. profit/recompute
  r = await P('/api/v1/store/m2/profit/recompute', { range: '30d' });
  record('POST /profit/recompute', r.status === 200 && r.body?.queued, `jobId=${r.body?.jobId}`);

  // 3. profit/skus
  r = await G('/api/v1/store/m2/profit/skus?range=30d');
  record('GET /profit/skus', r.status === 200 && Array.isArray(r.body?.skus), `count=${r.body?.skus?.length}`);

  // 4. profit/skus/:sku/waterfall
  r = await G('/api/v1/store/m2/profit/skus/CASE-001/waterfall?range=30d');
  record('GET /profit/skus/CASE-001/waterfall', r.status === 200 && Array.isArray(r.body?.items), `items=${r.body?.items?.length}`);

  // 5. orders
  r = await G('/api/v1/store/m2/orders?limit=20');
  record('GET /orders', r.status === 200 && Array.isArray(r.body?.orders), `count=${r.body?.orders?.length}`);
  const firstOrderId = r.body?.orders?.[0]?.orderId;

  // 6. orders/:id/profit
  if (firstOrderId) {
    r = await G(`/api/v1/store/m2/orders/${firstOrderId}/profit`);
    record('GET /orders/:id/profit', r.status === 200 && r.body?.fees, `keys=${Object.keys(r.body?.fees || {}).length}`);
  }

  // 7. leaks
  r = await G('/api/v1/store/m2/profit/leaks?severity=all');
  record('GET /profit/leaks', r.status === 200 && Array.isArray(r.body?.leaks), `count=${r.body?.leaks?.length}`);
  const leakId = r.body?.leaks?.[0]?.id;

  // 8. cashflow timeline
  r = await G('/api/v1/store/m2/cashflow/timeline?days=30');
  record('GET /cashflow/timeline', r.status === 200 && Array.isArray(r.body?.points), `points=${r.body?.points?.length}`);

  // 9. cashflow alerts
  r = await G('/api/v1/store/m2/cashflow/alerts');
  record('GET /cashflow/alerts', r.status === 200, `alerts=${r.body?.alerts?.length}`);

  // 10. cashflow events POST
  r = await P('/api/v1/store/m2/cashflow/events', { event_date: '2026-06-01', label: 'Test event', outflow: 1234, source: 'manual' });
  record('POST /cashflow/events', r.status === 201 && r.body?.id, `id=${r.body?.id}`);

  // 11. leak start-fix
  if (leakId) {
    r = await P(`/api/v1/store/m2/leaks/${leakId}/start-fix`);
    record('POST /leaks/:id/start-fix', r.status === 200 && r.body?.status === 'fixing', `status=${r.body?.status}`);
  }

  // 12. scenarios preview
  r = await P('/api/v1/store/m2/scenarios/preview', {
    sku: 'CASE-001',
    baseline: { price: 22.99, acos: 0.22, monthlyVolume: 320, returnRate: 0.05, unitCost: 8.4 },
    variables: { priceDelta: -10, acosDelta: 5, volumeDelta: 30, returnDelta: 1 },
  });
  record('POST /scenarios/preview', r.status === 200 && r.body?.simulated, `delta=${r.body?.delta}`);

  // 13. scenarios save
  r = await P('/api/v1/store/m2/scenarios', {
    name: 'Smoke 情景', sku: 'CASE-001',
    baseline: { price: 22.99 }, variables: { priceDelta: -5 },
    result: {}, preset: 'custom',
  });
  record('POST /scenarios', r.status === 201 && r.body?.id, `id=${r.body?.id}`);

  // 14. scenarios list
  r = await G('/api/v1/store/m2/scenarios?sku=CASE-001');
  record('GET /scenarios', r.status === 200 && Array.isArray(r.body?.scenarios), `count=${r.body?.scenarios?.length}`);

  // 15. reorder list
  r = await G('/api/v1/store/m2/inventory/reorder');
  record('GET /inventory/reorder', r.status === 200 && Array.isArray(r.body?.decisions), `count=${r.body?.decisions?.length}`);
  const reorderId = r.body?.decisions?.[0]?.reorder?.id;

  // 16. reorder create-po
  if (reorderId) {
    r = await P(`/api/v1/store/m2/inventory/reorder/${reorderId}/create-po`, { shippingMethod: 'ocean_freight' });
    record('POST /inventory/reorder/:id/create-po', r.status === 201 && r.body?.poId, `poNumber=${r.body?.poNumber}`);
  }

  // 17. slow-moving list
  r = await G('/api/v1/store/m2/inventory/slow-moving');
  record('GET /inventory/slow-moving', r.status === 200 && Array.isArray(r.body?.items), `count=${r.body?.items?.length}`);
  const slowId = r.body?.items?.[0]?.id;

  // 18. slow-moving execute (option A → triggers M1 listing version)
  let m1VersionId = null;
  if (slowId) {
    r = await P(`/api/v1/store/m2/inventory/slow-moving/${slowId}/execute`, { option: 'A' });
    record('POST /inventory/slow-moving/:id/execute', r.status === 200 && r.body?.status === 'executed', `m1VersionId=${r.body?.m1VersionId}`);
    m1VersionId = r.body?.m1VersionId;
  }

  // 19. transfers list
  r = await G('/api/v1/store/m2/inventory/transfers');
  record('GET /inventory/transfers', r.status === 200 && Array.isArray(r.body?.transfers), `count=${r.body?.transfers?.length}`);
  const transferId = r.body?.transfers?.[0]?.id;

  // 20. transfers approve
  if (transferId) {
    r = await P(`/api/v1/store/m2/inventory/transfers/${transferId}/approve`);
    record('POST /inventory/transfers/:id/approve', r.status === 200 && r.body?.status === 'approved', `status=${r.body?.status}`);
  }

  // 21. purchase-orders list
  r = await G('/api/v1/store/m2/purchase-orders');
  record('GET /purchase-orders', r.status === 200 && Array.isArray(r.body?.pos), `count=${r.body?.pos?.length}`);
  const poId = r.body?.pos?.find((p) => p.status === 'draft')?.id;

  // 22. purchase-orders/:id
  if (poId) {
    r = await G(`/api/v1/store/m2/purchase-orders/${poId}`);
    record('GET /purchase-orders/:id', r.status === 200 && r.body?.items, `items=${r.body?.items?.length}`);
  }

  // 23. purchase-orders POST
  r = await P('/api/v1/store/m2/purchase-orders', {
    items: [{ sku: 'CASE-001', qty: 100, unitCost: 8.4 }],
    shippingMethod: 'ocean_freight',
  });
  record('POST /purchase-orders', r.status === 201 && r.body?.id, `poNumber=${r.body?.poNumber}`);
  const newPoId = r.body?.id;

  // 24. purchase-orders PUT
  if (newPoId) {
    r = await PT(`/api/v1/store/m2/purchase-orders/${newPoId}`, { notes: 'updated by smoke' });
    record('PUT /purchase-orders/:id', r.status === 200, `updated`);
  }

  // 25. purchase-orders transition
  if (newPoId) {
    r = await P(`/api/v1/store/m2/purchase-orders/${newPoId}/transition`, { to: 'ordered' });
    record('POST /purchase-orders/:id/transition', r.status === 200 && r.body?.status === 'ordered', `status=${r.body?.status}`);
  }

  // 26. purchase-orders payment
  if (newPoId) {
    r = await P(`/api/v1/store/m2/purchase-orders/${newPoId}/payment`, { phase: 'deposit', paid: true });
    record('POST /purchase-orders/:id/payment', r.status === 200, `depositPaid=${r.body?.depositPaid}`);
  }

  // 27. suppliers list
  r = await G('/api/v1/store/m2/suppliers');
  record('GET /suppliers', r.status === 200 && Array.isArray(r.body?.suppliers), `count=${r.body?.suppliers?.length}`);
  const supId = r.body?.suppliers?.[0]?.id;

  // 28. suppliers POST
  r = await P('/api/v1/store/m2/suppliers', { name: 'Smoke Supplier', region: '广东深圳', rating: 4.3 });
  record('POST /suppliers', r.status === 201 && r.body?.id, `id=${r.body?.id}`);

  // 29. suppliers PUT
  if (supId) {
    r = await PT(`/api/v1/store/m2/suppliers/${supId}`, { rating: 4.9 });
    record('PUT /suppliers/:id', r.status === 200 && r.body?.rating === 4.9, `rating=${r.body?.rating}`);
  }

  // 30. repricing list
  r = await G('/api/v1/store/m2/repricing');
  record('GET /repricing', r.status === 200 && Array.isArray(r.body?.items), `count=${r.body?.items?.length}`);
  const rpId = r.body?.items?.find((x) => x.status === 'pending')?.id;

  // 31. repricing trigger
  r = await P('/api/v1/store/m2/repricing/trigger', { sku: 'CASE-001', manual: true });
  record('POST /repricing/trigger', r.status === 201 && r.body?.id, `id=${r.body?.id}`);

  // 32. repricing apply -> M1 联动
  let crossModuleM1 = null;
  if (rpId) {
    r = await P(`/api/v1/store/m2/repricing/${rpId}/apply`, { price: 21.99 });
    record('POST /repricing/:id/apply', r.status === 200 && r.body?.status === 'applied', `m1VersionId=${r.body?.m1VersionId}`);
    crossModuleM1 = r.body?.m1VersionId;
  }

  // 33. fx exposures
  r = await G('/api/v1/store/m2/fx/exposures');
  record('GET /fx/exposures', r.status === 200 && Array.isArray(r.body?.exposures), `count=${r.body?.exposures?.length}`);

  // 34. fx rates
  r = await G('/api/v1/store/m2/fx/rates?base=USD&quote=CNY&days=30');
  record('GET /fx/rates', r.status === 200 && Array.isArray(r.body?.rateHistory), `count=${r.body?.rateHistory?.length}`);

  // 35. fx sensitivity
  r = await G('/api/v1/store/m2/fx/sensitivity');
  record('GET /fx/sensitivity', r.status === 200 && Array.isArray(r.body?.sensitivity), `count=${r.body?.sensitivity?.length}`);

  // 36. payment-channels list
  r = await G('/api/v1/store/m2/payment-channels');
  record('GET /payment-channels', r.status === 200 && Array.isArray(r.body?.channels), `count=${r.body?.channels?.length}`);
  const pcId = r.body?.channels?.find((c) => !c.isPrimary)?.id;

  // 37. payment-channels POST
  r = await P('/api/v1/store/m2/payment-channels', { name: 'Smoke Channel', provider: 'pingpong' });
  record('POST /payment-channels', r.status === 201 && r.body?.id, `id=${r.body?.id}`);

  // 38. payment-channels PUT
  if (pcId) {
    r = await PT(`/api/v1/store/m2/payment-channels/${pcId}`, { feePct: 0.009 });
    record('PUT /payment-channels/:id', r.status === 200 && r.body?.feePct === 0.009, `fee=${r.body?.feePct}`);
  }

  // 39. tax summary
  r = await G('/api/v1/store/m2/tax/summary');
  record('GET /tax/summary', r.status === 200 && r.body?.vat, `totalDue=${r.body?.vat?.totalDue}`);

  // 40. tax records
  r = await G('/api/v1/store/m2/tax/records?type=vat');
  record('GET /tax/records', r.status === 200 && Array.isArray(r.body?.records), `count=${r.body?.records?.length}`);
  const taxId = r.body?.records?.[0]?.id;

  // 41. tax file
  if (taxId) {
    r = await P(`/api/v1/store/m2/tax/records/${taxId}/file`, { filingRef: 'SMOKE-2026-Q2' });
    record('POST /tax/records/:id/file', r.status === 200 && r.body?.status === 'filed', `status=${r.body?.status}`);
  }

  // 42. ltv
  r = await G('/api/v1/store/m2/ltv/skus');
  record('GET /ltv/skus', r.status === 200 && Array.isArray(r.body?.items), `count=${r.body?.items?.length}`);

  // 43. alert rules
  r = await G('/api/v1/store/m2/alerts/rules');
  record('GET /alerts/rules', r.status === 200 && Array.isArray(r.body?.rules), `count=${r.body?.rules?.length}`);

  // 44. alert rule POST
  r = await P('/api/v1/store/m2/alerts/rules', { name: 'Smoke 规则', conditions: [{ field: 'margin', op: '<', value: 0.1 }], severity: 'P1', notifyChannels: ['in_app'] });
  record('POST /alerts/rules', r.status === 201 && r.body?.id, `id=${r.body?.id}`);
  const newRuleId = r.body?.id;

  // 45. alert rule PUT
  if (newRuleId) {
    r = await PT(`/api/v1/store/m2/alerts/rules/${newRuleId}`, { enabled: false });
    record('PUT /alerts/rules/:id (toggle)', r.status === 200 && r.body?.enabled === false, `enabled=${r.body?.enabled}`);
  }

  // 46. alert events
  r = await G('/api/v1/store/m2/alerts/events');
  record('GET /alerts/events', r.status === 200 && Array.isArray(r.body?.events), `count=${r.body?.events?.length}`);
  const evId = r.body?.events?.[0]?.id;

  // 47. alert event ack
  if (evId) {
    r = await P(`/api/v1/store/m2/alerts/events/${evId}/ack`, { by: 'smoke' });
    record('POST /alerts/events/:id/ack', r.status === 200 && r.body?.acknowledged === true, `ackBy=${r.body?.acknowledgedBy}`);
  }

  // 48. dimensions
  r = await G('/api/v1/store/m2/dimensions?by=brand');
  record('GET /dimensions', r.status === 200 && Array.isArray(r.body?.items), `count=${r.body?.items?.length}`);
  const dimId = r.body?.items?.[0]?.id;
  if (dimId) {
    r = await PT(`/api/v1/store/m2/dimensions/${dimId}`, { metrics: { skus: 99, gmv: 1, profit: 1, margin: 1 } });
    record('PUT /dimensions/:id', r.status === 200, `updated`);
  }

  // 49. inventory-link config
  r = await G('/api/v1/store/m2/inventory-link/config');
  record('GET /inventory-link/config', r.status === 200 && r.body?.stopAt, `enabled=${r.body?.enabled}`);
  r = await PT('/api/v1/store/m2/inventory-link/config', { thresholds: { stopAt: 4, reduce50At: 8, reduce20At: 16, alertAt: 25 } });
  record('PUT /inventory-link/config', r.status === 200 && r.body?.stopAt === 4, `stopAt=${r.body?.stopAt}`);

  // 50. inventory-link events
  r = await G('/api/v1/store/m2/inventory-link/events');
  record('GET /inventory-link/events', r.status === 200 && Array.isArray(r.body?.events), `count=${r.body?.events?.length}`);
  const ileId = r.body?.events?.find((e) => e.status === 'pending')?.id;

  // 51. inventory-link execute -> M3 联动
  let crossModuleM3 = null;
  if (ileId) {
    r = await P(`/api/v1/store/m2/inventory-link/events/${ileId}/execute`);
    record('POST /inventory-link/events/:id/execute', r.status === 200 && r.body?.status === 'auto_executed', `impactCount=${(r.body?.impactCampaigns || []).length}`);
    crossModuleM3 = r.body?.impactCampaigns;
  }

  // 52. cross-refresh persistence: re-read overview
  r = await G('/api/v1/store/m2/profit/overview?range=30d');
  record('GET /profit/overview (re-read)', r.status === 200 && r.body?.overview?.orders >= 1, `revenue=${r.body?.overview?.revenue}`);

  // 53. audit/recent module=M2
  r = await G('/api/v1/audit/recent?module=M2&limit=50');
  // depending on routes, audit recent may be under different path; try alt
  if (r.status !== 200) {
    r = await G('/api/v1/store/audits?module=M2&limit=50');
  }
  if (r.status !== 200) {
    r = await G('/api/v1/store/audit/logs?sourceModule=M2&limit=50');
  }
  record('GET audit logs (module=M2)', r.status === 200, `status=${r.status}`);

  const pass = results.filter((x) => x.ok).length;
  const fail = results.filter((x) => !x.ok).length;
  console.log('\n========== Summary ==========');
  console.log(`PASS: ${pass} / FAIL: ${fail}  Total=${results.length}`);
  console.log(`crossModuleM1 (repricing -> M1 version): ${crossModuleM1}`);
  console.log(`crossModuleM3 (inv-link -> M3 campaigns): ${JSON.stringify(crossModuleM3)}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Smoke crashed:', e); process.exit(2); });
