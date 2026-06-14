import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('M2 and M4 expose task workbench routes while preserving old deep links', () => {
  const router = read('apps/web-v2/src/router/index.js');

  assert.match(router, /path:\s*'\/m2\/workbench'/);
  assert.match(router, /name:\s*'M2ControlTower'/);
  assert.match(router, /path:\s*'\/m4\/workbench'/);
  assert.match(router, /name:\s*'M4OpsWorkbench'/);

  for (const legacyPath of [
    '/profit/overview',
    '/profit/skus',
    '/inventory/reorder',
    '/inventory/po',
    '/monitor/anomalies',
    '/reviews',
    '/competitors/image-diff',
  ]) {
    assert.match(router, new RegExp(`path:\\s*'${legacyPath.replace(/\//g, '\\/')}'`), `${legacyPath} deep link must remain`);
  }
});

test('Default sidebar is collapsed to one M2 entry and one M4 entry', () => {
  const layout = read('apps/web-v2/src/layouts/DefaultLayout.vue');
  const groupsBlock = layout.slice(layout.indexOf('const groups = ['), layout.indexOf('];', layout.indexOf('const groups = [')) + 2);

  assert.match(groupsBlock, /id:\s*'m2-main'/);
  assert.match(groupsBlock, /label:\s*'利润库存 \(M2\)'/);
  assert.match(groupsBlock, /id:\s*'m4-main'/);
  assert.match(groupsBlock, /label:\s*'运营监控 \(M4\)'/);

  for (const oldGroup of ['m2-profit', 'm2-decisions', 'm2-enterprise', 'm4-monitor', 'm4-review', 'm4-competitors']) {
    assert.doesNotMatch(groupsBlock, new RegExp(oldGroup), `${oldGroup} should not be a top-level nav group`);
  }
});

test('M2 control tower is task-first and keeps old pages as deep tools', () => {
  const page = read('apps/web-v2/src/pages/M2ControlTower.vue');

  for (const text of [
    'M2 利润与库存驾驶舱',
    '今日必须处理',
    '决策队列',
    '利润雷达',
    '资金与采购',
    '高级工具',
    '19 -> 1',
  ]) {
    assert.match(page, new RegExp(text), `missing ${text}`);
  }

  for (const path of ['/profit/skus', '/profit/leaks', '/inventory/reorder', '/inventory/po', '/profit/fx', '/tax']) {
    assert.match(page, new RegExp(path.replace(/\//g, '\\/')), `${path} deep tool link missing`);
  }
});

test('M4 ops workbench unifies risk sources and keeps deep links', () => {
  const page = read('apps/web-v2/src/pages/M4OpsWorkbench.vue');

  for (const text of [
    'M4 运营风险工作台',
    '风险收件箱',
    '客户声音',
    '竞品雷达',
    '处置与复盘',
    'Detect -> Assign -> Resolve -> Learn',
  ]) {
    assert.match(page, new RegExp(text), `missing ${text}`);
  }

  for (const path of ['/monitor/anomalies', '/monitor/hijacking', '/monitor/infringement', '/reviews', '/reviews/appeals', '/competitors/image-diff', '/monitor/postmortems']) {
    assert.match(page, new RegExp(path.replace(/\//g, '\\/')), `${path} deep link missing`);
  }
});
