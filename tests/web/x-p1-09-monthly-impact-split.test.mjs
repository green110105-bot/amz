import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { splitMonthlyImpact } from '../../apps/web-v2/src/utils/audit-impact.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

// X-P1-09: 本月已挽回 reduce 语义修正
// (1) 拆 已节省/已投入 两个分账字段, 禁止对正负 monthlySaving 净加
// (2) KPI 卡标题改 预估可挽回(模拟) + 橙色水印, 移除 累计自动节省 真实功效暗示

test('splitMonthlyImpact 拆分正负为 已节省/已投入 而非净加 (spec case)', () => {
  // 给定 logs 含 monthlySaving=[-1500,800,2000]
  const logs = [
    { monthlySaving: -1500 },
    { monthlySaving: 800 },
    { monthlySaving: 2000 },
  ];
  const { saved, invested } = splitMonthlyImpact(logs);
  // 已节省 = 正值汇总 800 + 2000 = 2800
  assert.equal(saved, 2800);
  // 已投入 = 负值绝对值汇总 = 1500
  assert.equal(invested, 1500);
  // 关键回归: 绝不能净加为 1300
  assert.notEqual(saved, 1300);
  assert.notEqual(saved - invested, 1300 - 1300); // 不依赖净加结果
  // 净加值 (旧 bug) 应为 1300, 我们的 saved/invested 都不等于它
  const oldNetSum = logs.reduce((s, l) => s + (l.monthlySaving || 0), 0);
  assert.equal(oldNetSum, 1300);
  assert.notEqual(saved, oldNetSum);
  assert.notEqual(invested, oldNetSum);
});

test('splitMonthlyImpact 忽略缺失/非数值/零值', () => {
  const { saved, invested } = splitMonthlyImpact([
    {},
    { monthlySaving: 0 },
    { monthlySaving: 'x' },
    { monthlySaving: null },
    { monthlySaving: 500 },
    { monthlySaving: -200 },
  ]);
  assert.equal(saved, 500);
  assert.equal(invested, 200);
});

test('splitMonthlyImpact 空输入安全', () => {
  assert.deepEqual(splitMonthlyImpact([]), { saved: 0, invested: 0 });
  assert.deepEqual(splitMonthlyImpact(undefined), { saved: 0, invested: 0 });
});

test('Audit.vue KPI 文案为 预估可挽回(模拟) + 模拟/预估 水印, 不再净加 reduce', () => {
  const src = read('apps/web-v2/src/pages/Audit.vue');
  // KPI 标题改为 预估可挽回(模拟)
  assert.match(src, /预估可挽回\(模拟\)/);
  // 含 模拟/预估 限定词水印
  assert.match(src, /模拟\/预估/);
  // 橙色水印: 该 KPI 卡 status 为 warning (KpiCard warning => 橙色左条)
  assert.match(src, /label="预估可挽回\(模拟\)"[\s\S]*?status="warning"/);
  // 不再出现误导性 累计自动节省 文案
  assert.doesNotMatch(src, /累计自动节省/);
  // 不再对 monthlySaving 做净加 reduce
  assert.doesNotMatch(src, /reduce\([^)]*monthlySaving/);
  // 使用分账 helper
  assert.match(src, /splitMonthlyImpact/);
});
