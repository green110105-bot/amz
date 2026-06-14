import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'apps/web-v2/src/api/m1.js',
  'apps/web-v2/src/composables/useM1State.js',
  'apps/web-v2/src/pages/ListingSelect.vue',
  'apps/web-v2/src/pages/ListingOptimize.vue',
  'apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue',
  'apps/web-v2/src/components/m1/ResearchBlock.vue',
  'apps/web-v2/src/components/m1/ScoreBlock.vue',
  'apps/web-v2/src/components/m1/GenerationBlock.vue',
  'apps/web-v2/src/components/m1/VersionBlock.vue',
  'apps/web-v2/src/components/m1/ListingDiff.vue',
];

function text(path) {
  return readFileSync(path, 'utf8');
}

test('M1 frontend production files do not contain garbled replacement labels', () => {
  const bad = /(\?\?\?|�|鈥|鍟|鏍|鐗|浼|寮|妗|瀵|绋)/;
  for (const file of files) {
    assert.equal(bad.test(text(file)), false, `${file} contains mojibake or placeholder markers`);
  }
});

test('M1 workbench exposes production Amazon listing workflow sections', () => {
  const panel = text('apps/web-v2/src/components/m1/ListingWorkbenchPanel.vue');
  for (const label of ['商品作战档案', '变体与类目属性', '关键词覆盖矩阵', 'Amazon 图片槽位', '合规风险', '发布前检查']) {
    assert.ok(panel.includes(label), `missing ${label}`);
  }
});

test('M1 API fallback defines complete Amazon gallery slots MAIN plus PT01-PT08', () => {
  const api = text('apps/web-v2/src/api/m1.js');
  for (const slot of ['MAIN', 'PT01', 'PT02', 'PT03', 'PT04', 'PT05', 'PT06', 'PT07', 'PT08']) {
    assert.ok(api.includes(`slot: '${slot}'`), `missing gallery slot ${slot}`);
  }
});

test('M1 optimize page wires the human operator flow anchors', () => {
  const page = text('apps/web-v2/src/pages/ListingOptimize.vue');
  for (const anchor of ['workbench', 'research', 'score', 'generation', 'assets', 'compliance', 'preflight', 'versions']) {
    assert.ok(page.includes(`key: '${anchor}'`) || page.includes(`id="${anchor}"`), `missing anchor ${anchor}`);
  }
});
