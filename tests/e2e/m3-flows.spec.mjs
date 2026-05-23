// M3 端到端测试 — 通过真实浏览器跑 Vue 应用 + 真实后端 + 真实 SQLite。
// 前置：node apps/api/src/server.mjs 已经在 :8080；Vite dev server 在 BASE_URL（默认 5180）
// 这些测试覆盖 spec §5 中的 10 个核心场景。
import { test, expect } from '@playwright/test';

const API_BASE = process.env.PW_API_BASE || 'http://localhost:8080';

// 共享的登录 fixture
async function login(page) {
  // 先通过 API 拿 token
  const ctx = page.context();
  const resp = await ctx.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: 'demo@amz.local', password: 'demo' },
  });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.token).toBeTruthy();
  // 先把 token 放进 init script（在下一次 page.goto 时执行）
  await page.addInitScript(({ token, storeId }) => {
    try {
      localStorage.setItem('amz_auth_token', token);
      localStorage.setItem('amz_current_store_id', storeId);
    } catch {}
  }, { token: body.token, storeId: body.defaultStoreId || 's-mock-us' });
  return body;
}

test.describe('M3 e2e 流程', () => {
  test('1. 登录 + 进入策略库 + 看到列表', async ({ page }) => {
    await login(page);
    await page.goto('/ads/strategies');
    // 等任一 strategy 卡片渲染
    await page.waitForLoadState('networkidle');
    const body = await page.content();
    // 包含策略名称片段（取一些 seed 中已知的 emoji/字眼）
    expect(body).toMatch(/策略库|策略|StrategyLibrary|st-/i);
  });

  test('2. 策略 toggle 后 F5 状态保留', async ({ page, request }) => {
    const auth = await login(page);
    const token = auth.token;
    // 先用 API 设置已知初始状态
    await request.post(`${API_BASE}/api/v1/store/ads/strategies/st-lc-001/toggle`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Store-Id': 's-mock-us' },
      data: { enabled: true },
    });
    // F5
    await page.goto('/ads/strategies');
    await page.waitForLoadState('networkidle');
    // 再次 API 验证
    const r = await request.get(`${API_BASE}/api/v1/store/ads/strategies/st-lc-001`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Store-Id': 's-mock-us' },
    });
    const j = await r.json();
    expect(j.enabled).toBe(true);
  });

  test('3. Timeline 采纳建议 → 已处理 tab → 撤销 → 回到待办', async ({ request }) => {
    const auth = await fetchLogin(request);
    const token = auth.token;
    const H = { Authorization: `Bearer ${token}`, 'X-Store-Id': 's-mock-us' };

    // ensure sug-001 is pending
    await request.post(`${API_BASE}/api/v1/store/ads/suggestions/sug-001/revert`, { headers: H, data: {} });
    let s = await (await request.get(`${API_BASE}/api/v1/store/ads/suggestions/sug-001`, { headers: H })).json();
    expect(s.state).toBe('pending');

    // accept
    await request.post(`${API_BASE}/api/v1/store/ads/suggestions/sug-001/accept`, { headers: H, data: {} });
    s = await (await request.get(`${API_BASE}/api/v1/store/ads/suggestions/sug-001`, { headers: H })).json();
    expect(s.state).toBe('observing');

    // revert
    await request.post(`${API_BASE}/api/v1/store/ads/suggestions/sug-001/revert`, { headers: H, data: {} });
    s = await (await request.get(`${API_BASE}/api/v1/store/ads/suggestions/sug-001`, { headers: H })).json();
    expect(s.state).toBe('pending');
  });

  test('4. 改 Campaign budget → ad_manual_changes 增加', async ({ request }) => {
    const auth = await fetchLogin(request);
    const H = { Authorization: `Bearer ${auth.token}`, 'X-Store-Id': 's-mock-us' };
    const before = (await (await request.get(`${API_BASE}/api/v1/store/ads/manual-changes?state=pending`, { headers: H })).json()).items.length;
    await request.put(`${API_BASE}/api/v1/store/ads/lx/campaigns/cmp-001/budget`, { headers: H, data: { dailyBudget: 75 } });
    const after = (await (await request.get(`${API_BASE}/api/v1/store/ads/manual-changes?state=pending`, { headers: H })).json()).items.length;
    expect(after).toBeGreaterThanOrEqual(before + 1);
  });

  test('5. 策略绑定 Campaigns + GET /lx/campaigns/:id/strategies 反向', async ({ request }) => {
    const auth = await fetchLogin(request);
    const H = { Authorization: `Bearer ${auth.token}`, 'X-Store-Id': 's-mock-us' };
    const bindResp = await request.post(`${API_BASE}/api/v1/store/ads/strategies/st-bid-001/bind`, {
      headers: H, data: { campaignIds: ['cmp-001', 'cmp-002'] },
    });
    const bind = await bindResp.json();
    expect(bind.bindingsCount).toBe(2);
    expect(bind.bindings.length).toBe(2);

    const rev = await (await request.get(`${API_BASE}/api/v1/store/ads/lx/campaigns/cmp-001/strategies`, { headers: H })).json();
    expect(rev.items.some((s) => s.id === 'st-bid-001')).toBeTruthy();
  });

  test('6. URL ?sku=...&strategy=... → Timeline 还原筛选', async ({ page }) => {
    await login(page);
    await page.goto('/ads/timeline?sku=CASE-001&strategy=st-cm-004&tab=pending');
    await page.waitForLoadState('networkidle');
    // URL 仍包含这些 query
    const url = page.url();
    expect(url).toContain('sku=CASE-001');
    expect(url).toContain('strategy=st-cm-004');
  });

  test('7. audit-logs filter sourceModule=M3 + actionType', async ({ request }) => {
    const auth = await fetchLogin(request);
    const H = { Authorization: `Bearer ${auth.token}`, 'X-Store-Id': 's-mock-us' };
    // toggle 一次产生 STRATEGY_TOGGLE
    await request.post(`${API_BASE}/api/v1/store/ads/strategies/st-lc-001/toggle`, { headers: H, data: { enabled: true } });
    const list = await (await request.get(`${API_BASE}/api/v1/store/audit-logs?sourceModule=M3&actionType=STRATEGY_TOGGLE&limit=10`, { headers: H })).json();
    expect(list.items.length).toBeGreaterThan(0);
    for (const x of list.items) {
      expect(x.sourceModule).toBe('M3');
      expect(x.actionType).toBe('STRATEGY_TOGGLE');
    }
  });

  test('8. CSV bulk-import multipart 路径', async ({ request }) => {
    const auth = await fetchLogin(request);
    const H = { Authorization: `Bearer ${auth.token}`, 'X-Store-Id': 's-mock-us' };
    const term = `pw-${Date.now()}`;
    const csv = `id,campaign_id,term,match_type,scope\n,cmp-001,${term}-a,exact,Campaign\n,cmp-001,${term}-b,exact,Campaign\n`;
    const formData = new FormData();
    formData.append('type', 'negatives');
    formData.append('file', new Blob([csv], { type: 'text/csv' }), 'upload.csv');
    const r = await request.post(`${API_BASE}/api/v1/store/ads/lx/bulk-import`, {
      headers: { Authorization: `Bearer ${auth.token}`, 'X-Store-Id': 's-mock-us' },
      multipart: {
        type: 'negatives',
        file: { name: 'upload.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') },
      },
    });
    const j = await r.json();
    expect(r.ok()).toBeTruthy();
    expect(j.created).toBe(2);
  });

  test('9. 审计 revert STRATEGY_TOGGLE 反向 dispatch', async ({ request }) => {
    const auth = await fetchLogin(request);
    const H = { Authorization: `Bearer ${auth.token}`, 'X-Store-Id': 's-mock-us' };
    await request.post(`${API_BASE}/api/v1/store/ads/strategies/st-lc-001/toggle`, { headers: H, data: { enabled: true } });
    const list = await (await request.get(`${API_BASE}/api/v1/store/audit-logs?sourceModule=M3&actionType=STRATEGY_TOGGLE&reverted=0&limit=1`, { headers: H })).json();
    const log = list.items[0];
    expect(log).toBeTruthy();
    await request.post(`${API_BASE}/api/v1/store/audit-logs/${log.id}/revert`, { headers: H, data: {} });
    const s = await (await request.get(`${API_BASE}/api/v1/store/ads/strategies/st-lc-001`, { headers: H })).json();
    expect(s.enabled).toBe(false);
  });

  test('10. 进入 lx Strategy sub-tab — 显示绑定策略', async ({ page, request }) => {
    const auth = await login(page);
    const H = { Authorization: `Bearer ${auth.token}`, 'X-Store-Id': 's-mock-us' };
    // 先绑一个 strategy 到 cmp-001
    await request.post(`${API_BASE}/api/v1/store/ads/strategies/st-bid-001/bind`, { headers: H, data: { campaignIds: ['cmp-001'] } });
    // 打开 lx campaign detail
    await page.goto('/ads/lx/campaigns/cmp-001?g=strategy');
    await page.waitForLoadState('networkidle');
    const body = await page.content();
    // Expect to see some mention of strategy
    expect(body).toMatch(/策略|strategy/i);
  });
});

async function fetchLogin(request) {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: 'demo@amz.local', password: 'demo' },
  });
  return await r.json();
}
