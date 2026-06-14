import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const lineWith = (text, needle) => text.split(/\r?\n/).find((line) => line.includes(needle)) || '';

test('M1 resources collapse to one practical hub in the main M1 navigation', () => {
  const router = read('apps/web-v2/src/router/index.js');
  const layout = read('apps/web-v2/src/layouts/DefaultLayout.vue');
  const groupsBlock = layout.slice(layout.indexOf('const groups = ['), layout.indexOf('];', layout.indexOf('const groups = [')) + 2);

  assert.match(router, /path:\s*'\/listings\/resources'/);
  assert.match(router, /name:\s*'M1ResourceHub'/);
  assert.match(lineWith(router, "'/listings/resources'"), /group:\s*'m1-main'/);

  assert.doesNotMatch(groupsBlock, /m1-resources/);
  assert.doesNotMatch(groupsBlock, /商品 · 资源库/);
});

test('Deprecated M1 resource pages are removed from workflow and redirected', () => {
  const router = read('apps/web-v2/src/router/index.js');
  const heatmapLine = lineWith(router, "'/listings/keyword-heatmap'");
  const localeLine = lineWith(router, "'/listings/multi-locale'");

  assert.match(heatmapLine, /redirect:\s*\{\s*path:\s*'\/listings\/resources'/);
  assert.match(heatmapLine, /retired:\s*'keyword-heatmap'/);
  assert.match(localeLine, /redirect:\s*\{\s*path:\s*'\/listings\/resources'/);
  assert.match(localeLine, /retired:\s*'multi-locale'/);

  assert.doesNotMatch(router, /name:\s*'KeywordHeatmap'/);
  assert.doesNotMatch(router, /name:\s*'MultiLocale'/);
  assert.doesNotMatch(router, /title:\s*'关键词热力图',\s*group:/);
  assert.doesNotMatch(router, /title:\s*'多语言母版',\s*group:/);
});

test('Useful M1 resource tools stay as deep links from the hub, not sidebar clutter', () => {
  const router = read('apps/web-v2/src/router/index.js');

  for (const routePath of ['/listings/keywords-library', '/listings/templates', '/listings/category-pains', '/listings/calibration']) {
    const routeLine = lineWith(router, `'${routePath}'`);
    assert.ok(routeLine, `${routePath} route must remain`);
    assert.doesNotMatch(routeLine, /group:\s*'m1-resources'/, `${routePath} must not be in old resource nav`);
    assert.doesNotMatch(routeLine, /group:\s*'m1-main'/, `${routePath} should be opened from hub, not sidebar`);
  }
});

test('M1 resource hub explains the operational replacement model', () => {
  const page = read('apps/web-v2/src/pages/M1ResourceHub.vue');

  for (const text of [
    'M1 素材规则中心',
    '关键词护栏',
    '类目发布规则',
    'VOC 痛点库',
    '评分规则校准',
    '日常用法',
    '素材如何进入 Listing 作战室',
    '已下线，不再占用主导航',
    '关键词热力图',
    '多语言母版',
  ]) {
    assert.ok(page.includes(text), `missing ${text}`);
  }

  assert.doesNotMatch(page, /\/listings\/keyword-heatmap/);
  assert.doesNotMatch(page, /\/listings\/multi-locale/);
});
