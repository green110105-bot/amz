// B12-fe-m2 regression locks for M2-P1-04 (TaxAssist 真实性整改) and
// M2-P2-01 (M2 死代码清理: repricingApi.detail + useM2State detail()).
//
// These frontend modules (.vue / .js importing axios+vue+element-plus) cannot be
// imported by node:test directly, so we lock the contract via source-string
// assertions (the established pattern in tests/web/*.test.mjs) plus a
// self-contained replication of the days_left algorithm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

const TAX = 'apps/web-v2/src/pages/TaxAssist.vue';
const M2_API = 'apps/web-v2/src/api/m2.js';
const M2_STATE = 'apps/web-v2/src/composables/useM2State.js';

// ===========================================================================
// M2-P1-04 — TaxAssist 真实性整改
// ===========================================================================

test('M2-P1-04: 删除伪装“已导出 CSV”的成功 toast', () => {
  const src = read(TAX);
  assert.doesNotMatch(src, /申报数据已导出\s*CSV/, '不得保留伪装已导出的 toast 文案');
  assert.doesNotMatch(src, /\bfunction exportData\b/, 'exportData 函数应被移除');
  assert.doesNotMatch(src, /@click="exportData/, '导出按钮不得再绑定 exportData 点击');
});

test('M2-P1-04: 三个导出按钮均被禁用(disabled)', () => {
  const src = read(TAX);
  // 三处导出按钮(全部 / VAT OSS-IOSS / 美国销售税 Avalara)均应 disabled
  const disabledExportBtns = src.match(/导出[^<]*<\/el-button>/g) || [];
  // 取出所有“导出”按钮，确保每个所在的 el-button 标签带 disabled
  const exportButtonTags = src.match(/<el-button[^>]*>[^<]*导出[^<]*<\/el-button>/g) || [];
  assert.equal(exportButtonTags.length, 3, '应有 3 个导出按钮');
  for (const tag of exportButtonTags) {
    assert.match(tag, /\bdisabled\b/, `导出按钮应 disabled: ${tag}`);
  }
  assert.ok(disabledExportBtns.length >= 3);
});

test('M2-P1-04: fileTax 弹窗文案明确“不提交税局/不向税局…提交”', () => {
  const src = read(TAX);
  assert.match(src, /不向税局/, 'fileTax 文案需包含“不向税局…提交”');
  // 与真实税局申报区分：成功提示也需注明未提交税局
  assert.match(src, /未向税局\s*\/?\s*Avalara\s*提交|不向税局/);
  assert.doesNotMatch(src, /confirmButtonText:\s*'提交'/, '确认按钮不应再写“提交”(易误解为提交税局)');
});

test('M2-P1-04: 状态文案与真实税局申报区分(本地已标记)', () => {
  const src = read(TAX);
  assert.match(src, /本地已标记/, 'filed 状态应展示为“本地已标记”而非“已申报”');
  assert.match(src, /本地标记申报/, '操作按钮应为“本地标记申报”');
});

test('M2-P1-04: days_left 改为基于到期日实时计算(非 seed 静态)', () => {
  const src = read(TAX);
  assert.match(src, /function daysUntil/, '应存在实时计算函数 daysUntil');
  assert.match(src, /new Date\(/, '应使用当前日期参与计算');
  // 不再直接渲染未经计算的静态 days_left 兜底
  assert.doesNotMatch(src, /row\.daysLeft\s*\|\|\s*row\.days_left/, '剩余天数不得回退到静态 seed 值显示');
});

// 自包含复现 daysUntil 算法，锁定“随当前日期变化”的正确契约。
function daysUntil(today, dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((startOfDue - startOfToday) / MS_PER_DAY);
}

test('M2-P1-04: daysUntil 随当前日期变化', () => {
  const due = '2026-06-30';
  const onMay30 = daysUntil(new Date('2026-05-30T10:00:00'), due);
  const onJun20 = daysUntil(new Date('2026-06-20T10:00:00'), due);
  assert.equal(onMay30, 31);
  assert.equal(onJun20, 10);
  assert.notEqual(onMay30, onJun20, '不同当前日期应得到不同剩余天数(非静态)');
  // 逾期为负数
  assert.equal(daysUntil(new Date('2026-07-05T10:00:00'), due), -5);
  // 缺失/非法日期安全返回 null
  assert.equal(daysUntil(new Date('2026-05-30'), null), null);
  assert.equal(daysUntil(new Date('2026-05-30'), 'not-a-date'), null);
});

// ===========================================================================
// M2-P2-01 — M2 死代码清理
// ===========================================================================

test('M2-P2-01: repricingApi 不再含死接口 detail (GET /repricing/:id)', () => {
  const src = read(M2_API);
  assert.doesNotMatch(src, /\/repricing\/\$\{id\}`\)\.then/, '不得保留 GET /repricing/:id 调用');
  // repricing 区块内不得再出现 detail key
  const block = src.slice(src.indexOf('export const repricingApi'), src.indexOf('export const fxApi'));
  assert.doesNotMatch(block, /\bdetail:/, 'repricingApi 不得再导出 detail');
  // 合法的同名 detail(poApi/suppliersApi)不受影响
  assert.match(src, /\/purchase-orders\/\$\{id\}`\)\.then/, 'poApi.detail 保留');
  assert.match(src, /\/suppliers\/\$\{id\}`\)\.then/, 'suppliersApi.detail 保留');
});

test('M2-P2-01: useRepricing 不再含/导出 detail() 死代码', () => {
  const src = read(M2_STATE);
  assert.doesNotMatch(src, /repricingApi\.detail/, '不得再调用 repricingApi.detail');
  // useRepricing 区块内不得再有 detail() 或返回 detail
  const ret = src.slice(src.indexOf('export function useRepricing'), src.indexOf('export function useTax'));
  assert.doesNotMatch(ret, /async function detail\b/, 'useRepricing 内 detail() 应删除');
  assert.doesNotMatch(ret, /^\s*detail,\s*$/m, 'useRepricing 返回块不得再导出 detail');
  // 详情数据来源唯一为 list 内联 scenarios（page 端读 current.scenarios）
  assert.match(ret, /repricingApi\.list/, 'list 仍是唯一数据来源');
});

test('M2-P2-01: repricing 详情从 list 内联 scenarios 读取 + 空态分流', () => {
  const page = read('apps/web-v2/src/pages/RepricingDecision.vue');
  assert.doesNotMatch(page, /\.detail\(/, '页面不得调用已删除的 detail()');
  // current 由 list 内联派生，scenarios 直接读 current.scenarios
  assert.match(page, /repricing\.list\.value\.find/, 'current 由 list 内联派生');
  assert.match(page, /current\.value\.scenarios/, '详情直接读 current 内联 scenarios');
  // 空态分流：无 current 时 EmptyState（含筛选/无筛选两种文案）
  assert.match(page, /<EmptyState[\s\S]*v-if="!current/, '无 current 时渲染 EmptyState 空态');
  assert.match(page, /暂无重定价建议/, '无筛选空态文案');
  // scenarios 为空时图表安全降级（!sc.length 分支）
  assert.match(page, /!sc\.length/, 'scenarios 为空时图表安全降级');
});
