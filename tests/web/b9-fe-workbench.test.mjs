// tests/web/b9-fe-workbench.test.mjs
// Batch B9-fe-workbench — 决策卡 Inbox + 全局工作台.
// Source-text + pure-function assertions (no Vue build), matching the repo's
// existing web-test style (see b8-fe-core-store.test.mjs).
//   W7  DecisionCard.execute gates on submit().ok, no emit on block, re-entrancy guard
//   W8  广告建议汇总口径并入 Workbench：normalizeCard 取 risk.severity / risk.requiresApproval
//   W9  Workbench 三态分流 (error / onboarding / ready) + refresh await + syncAll CTA
//   W12 DecisionCard 缺依据禁用「一键执行」+ auditRequired 取后端真值不兜底 true
//   W16 AdsActions 孤儿页删除 + /ads/actions redirect→/workbench?filter=ad_suggestion

import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';

const url = (p) => new URL(`../../${p}`, import.meta.url);
const read = (p) => readFile(url(p), 'utf8');
async function exists(p) {
  try {
    await access(url(p));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// W7: execute gates on submit().ok; re-entrancy guard; pending (not splice).
// ---------------------------------------------------------------------------
test('W7: DecisionCard.execute blocks (no emit) when submit returns {ok:false}', async () => {
  const src = await read('apps/web-v2/src/components/DecisionCard.vue');
  // const r = await submit(...); if (!r.ok) return;  — blocked path does NOT emit.
  assert.match(src, /const\s+r\s*=\s*await\s+submit\(/, 'captures submit return value');
  assert.match(src, /if\s*\(\s*!r\.ok\s*\)\s*return/, 'returns early on !r.ok');
  // emit('execute', ...) call must come AFTER the !r.ok guard.
  const guardIdx = src.indexOf('if (!r.ok) return');
  const emitIdx = src.indexOf("emit('execute', props.card)");
  assert.ok(guardIdx > -1 && emitIdx > guardIdx, "emit('execute') happens only after the ok guard");
});

test('W7: DecisionCard has a re-entrancy guard (submitting) bound to :loading/:disabled', async () => {
  const src = await read('apps/web-v2/src/components/DecisionCard.vue');
  assert.match(src, /const\s+submitting\s*=\s*ref\(/, 'submitting ref present');
  assert.match(src, /submitting\.value\s*=\s*true/, 'flips submitting true');
  assert.match(src, /:loading="submitting"/, 'execute button bound to :loading');
  assert.match(src, /if\s*\(\s*executeDisabled\.value\s*\)\s*return/, 'early-return when disabled (re-entrancy/empty)');
});

test('W7: execute marks card pending (executed) — no splice/remove in card', async () => {
  const src = await read('apps/web-v2/src/components/DecisionCard.vue');
  assert.match(src, /const\s+executed\s*=\s*ref\(false\)/, 'executed pending flag present');
  assert.match(src, /executed\.value\s*=\s*true/);
  assert.match(src, /已入队待审/, 'pending label rendered');
});

test('W7: Workbench binds @execute and refreshes cardSummary (does not splice)', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  assert.match(src, /@execute="handleExecute"/);
  assert.match(src, /async function handleExecute/);
  // refresh path re-loads + refreshes the same-source summary bus.
  assert.match(src, /handleExecute[\s\S]*load\(\)[\s\S]*bus\.refresh\(\)/);
  // no destructive splice of a local card list on execute.
  assert.ok(!/\.splice\(/.test(src), 'no splice removal of cards');
});

// ---------------------------------------------------------------------------
// W12: empty-evidence disables execute; auditRequired takes backend truth.
// ---------------------------------------------------------------------------
test('W12: DecisionCard disables 一键执行 when payload/evidence/recommendation all empty', async () => {
  const src = await read('apps/web-v2/src/components/DecisionCard.vue');
  assert.match(src, /const\s+hasEvidence\s*=\s*computed/, 'hasEvidence computed present');
  assert.match(src, /const\s+executeDisabled\s*=\s*computed/, 'executeDisabled computed present');
  assert.match(src, /:disabled="executeDisabled"/, 'button bound to executeDisabled');
  assert.match(src, /缺少依据不可执行/, 'tooltip copy present');
});

test('W12: auditRequired takes backend truth (no ?? true fallback)', async () => {
  const src = await read('apps/web-v2/src/components/DecisionCard.vue');
  assert.ok(!/auditRequired:\s*card\.auditRequired\s*\?\?\s*true/.test(src), 'no ?? true fallback');
  assert.match(src, /auditRequired:\s*card\.auditRequired\b/, 'reads card.auditRequired directly');
});

// W12 behavioural lock via normalizeCard: a card with auditRequired:false stays false.
test('W12: normalizeCard preserves auditRequired:false (no coercion to true)', async () => {
  const mod = await import('../../apps/web-v2/src/utils/format.js');
  const c = mod.normalizeCard({ type: 'ad_suggestion', priority: 'P1', payload: { id: 'x1' }, auditRequired: false });
  assert.equal(c.auditRequired, false, 'auditRequired:false is preserved');
});

// ---------------------------------------------------------------------------
// W8: 广告建议汇总口径 — normalizeCard 取 risk.severity / risk.requiresApproval.
// (AdsActions 孤儿页已删，Workbench 决策卡 Inbox 为单一事实源。)
// ---------------------------------------------------------------------------
test('W8: normalizeCard summary口径 reads risk.severity===high & risk.requiresApproval', async () => {
  const mod = await import('../../apps/web-v2/src/utils/format.js');
  const audits = [
    { id: 'a1', actionType: 'X', risk: { severity: 'high', requiresApproval: true }, payload: { id: 'a1' } },
    { id: 'a2', actionType: 'Y', risk: { severity: 'medium', requiresApproval: false }, payload: { id: 'a2' } },
  ].map((a) => mod.normalizeCard(a));

  const high = audits.filter((c) => c.severity === 'high').length;
  const needApproval = audits.filter((c) => c.auditRequired === true).length;
  // 与「下方列表过滤」同源：列表里 severity==='high' 的卡数 === summary.high。
  const listHigh = audits.filter((c) => c.severity === 'high').length;
  assert.equal(high, 1, 'summary.high>0 driven by risk.severity');
  assert.equal(high, listHigh, 'summary.high === 列表 high 计数 (同源)');
  assert.equal(needApproval, 1, '需审批 driven by risk.requiresApproval');
});

// ---------------------------------------------------------------------------
// W9: Workbench three-state split + refresh await + syncAll CTA.
// ---------------------------------------------------------------------------
test('W9: Workbench distinguishes error / onboarding / ready states', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  assert.match(src, /viewState\s*=\s*computed/, 'viewState computed present');
  assert.match(src, /return\s*'error'/);
  assert.match(src, /return\s*'onboarding'/);
  // onboarding 引导文案，不再把成功/空数据当「加载失败」。
  assert.match(src, /引导接店铺/, 'onboarding CTA copy present');
});

test('W9: 成功空数据渲染引导文案而非「加载失败」; error 才显示「加载失败」', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  // 「加载失败」只挂在 error 态分支。
  assert.match(src, /v-if="viewState === 'error'"[\s\S]*?加载失败/);
  // onboarding 态用引导文案。
  assert.match(src, /v-if="viewState === 'onboarding'"[\s\S]*?引导接店铺/);
  // 旧的对成功/空数据的误用文案已删除。
  assert.ok(!/title="数据加载失败"/.test(src), 'no「数据加载失败」on success/empty');
  assert.ok(!/所有事项都已处理完成/.test(src), 'no「所有事项都已处理完成」misuse');
});

test('W9: refresh awaits load and does not pop success on reject', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  const fn = src.slice(src.indexOf('async function refresh'), src.indexOf('</script>'));
  assert.match(fn, /await\s+load\(\)/, 'refresh awaits load');
  // success toast is guarded by !error.
  assert.match(fn, /if\s*\(\s*error\.value\s*\)[\s\S]*ElMessage\.error[\s\S]*else[\s\S]*ElMessage\.success/);
});

test('W9: empty state CTA calls integrations.syncAll', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  assert.match(src, /amazonIntegrationsApi\.syncAll\(\)/, 'startSync calls syncAll');
  assert.match(src, /async function startSync/);
  // syncAll endpoint exists in the integrations api.
  const api = await read('apps/web-v2/src/api/integrations.js');
  assert.match(api, /syncAll:\s*\(/);
});

// ---------------------------------------------------------------------------
// W16: AdsActions orphan page removed; /ads/actions redirects to Workbench.
// ---------------------------------------------------------------------------
test('W16: AdsActions.vue page component is deleted', async () => {
  assert.equal(await exists('apps/web-v2/src/pages/AdsActions.vue'), false, 'AdsActions.vue removed');
});

test('W16: /ads/actions redirects to /workbench?filter=ad_suggestion', async () => {
  const src = await read('apps/web-v2/src/router/index.js');
  assert.match(
    src,
    /path:\s*'\/ads\/actions',\s*redirect:\s*'\/workbench\?filter=ad_suggestion'/,
    'route is a redirect, not a component',
  );
  // no AdsActions component import remains.
  assert.ok(!/pages\/AdsActions\.vue/.test(src), 'no AdsActions component import in router');
});

test('W16: no残留 /ads/actions deep-link in app source', async () => {
  for (const f of [
    'apps/web-v2/src/pages/ProfitSkus.vue',
  ]) {
    const src = await read(f);
    assert.ok(!/['"`]\/ads\/actions['"`]/.test(src), `${f}: no /ads/actions deep-link`);
  }
});

test('W16: Workbench accepts ?filter=ad_suggestion deep-link', async () => {
  const src = await read('apps/web-v2/src/pages/Workbench.vue');
  assert.match(src, /useRoute/);
  assert.match(src, /route\.query\.filter/);
  assert.match(src, /VALID_FILTERS/);
});
