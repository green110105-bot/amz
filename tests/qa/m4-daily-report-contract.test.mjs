import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const lineWith = (text, needle) => text.split(/\r?\n/).find((line) => line.includes(needle)) || '';

const DAILY_TITLE = '\u6bcf\u65e5\u76d1\u63a7\u65e5\u62a5';

test('M4 daily report has one visible route and one legacy redirect only', () => {
  const router = read('apps/web-v2/src/router/index.js');
  const routeLine = router.split(/\r?\n/).find((line) =>
    line.includes("path: '/m4/reports/daily'") && line.includes("name: 'M4DailyReport'")
  ) || '';
  const legacyLine = lineWith(router, "'/m4/daily-report'");

  assert.match(routeLine, /name:\s*'M4DailyReport'/);
  assert.match(routeLine, /group:\s*'m4-main'/);
  assert.ok(routeLine.includes(`title: '${DAILY_TITLE}'`));
  assert.doesNotMatch(routeLine, /alias:/);
  assert.match(legacyLine, /redirect:\s*'\/m4\/reports\/daily'/);
  assert.doesNotMatch(legacyLine, /meta:|group:/);
});

test('M4 daily report supports store/listing dimensions with source-aware provenance copy', () => {
  const page = read('apps/web-v2/src/pages/M4DailyReport.vue');

  for (const text of [
    'M4 ' + DAILY_TITLE,
    '\u5e97\u94fa\u7ef4\u5ea6',
    '\u94fe\u63a5\u7ef4\u5ea6',
    '\u6309\u5e97\u94fa\u770b',
    '\u6309\u94fe\u63a5\u770b',
    '\u5206\u5e97\u94fa\u65e5\u62a5',
    '\u94fe\u63a5\u65e5\u62a5',
    '\u9500\u91cf',
    'GMV',
    '\u5e7f\u544a\u82b1\u8d39',
    '\u8bc4\u5206',
    // M4-P1-05: '\u7c7b\u76ee\u6392\u540d' renamed to '\u7ade\u54c1 BSR(\u793a\u610f)' (illustrative single-competitor BSR, mock).
    '\u7ade\u54c1 BSR(\u793a\u610f)',
    '\u544a\u8b66',
    '7 \u65e5\u771f\u5b9e\u6570\u636e\u8d8b\u52bf',
    'realDataOnly={{ realDataOnly }}',
    'real/mock/hybrid',
    'sourceMeta',
    'sourceMode(meta)',
  ]) {
    assert.ok(page.includes(text), `missing ${text}`);
  }

  assert.doesNotMatch(page, /mockMultiStore/);
  assert.doesNotMatch(page, /deterministic_mock/);
});

test('M4 daily report links summary metrics to the correct deep tools and BFF', () => {
  const page = read('apps/web-v2/src/pages/M4DailyReport.vue');
  const apiClient = read('apps/web-v2/src/api/m4.js');

  for (const path of ['/ads/reports', '/reviews/trends', '/monitor/anomalies', '/competitors/image-diff']) {
    assert.ok(page.includes(path), `missing deep link ${path}`);
  }
  assert.ok(page.includes('dailyReportsApi'));
  assert.ok(apiClient.includes('/reports/daily'));
});

test('M4 workbench cross-links to the daily report', () => {
  const page = read('apps/web-v2/src/pages/M4OpsWorkbench.vue');
  assert.ok(page.includes('/m4/reports/daily'));
  assert.ok(page.includes(DAILY_TITLE));
});
