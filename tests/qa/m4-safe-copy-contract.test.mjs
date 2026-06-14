import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const infringement = readFileSync('apps/web-v2/src/pages/Infringement.vue', 'utf8');
const hijacking = readFileSync('apps/web-v2/src/pages/Hijacking.vue', 'utf8');

test('M4 infringement copy records manual Amazon submission evidence only', () => {
  for (const required of [
    '记录人工提交结果',
    '标记已在 Amazon 提交',
    'Case ID/投诉单号',
    '提交人',
    '提交时间',
    '证据附件',
    '未调用外部 Amazon/legal API',
  ]) {
    assert.match(infringement, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(infringement, /title:\s*['"]提交投诉['"]/);
  assert.doesNotMatch(infringement, /title:\s*['"]侵权投诉已提交['"]/);
  assert.doesNotMatch(infringement, />提交<\/el-button>/);
  assert.doesNotMatch(infringement, /link:\s*['"]\/infringement['"]/);
  assert.match(infringement, /link:\s*['"]\/monitor\/infringement['"]/);
});

test('M4 hijacking copy exposes M3 pause evidence and avoids external-submit wording', () => {
  for (const required of [
    'paused campaign ids',
    '联动编号',
    '预计恢复',
    '误伤恢复/覆盖',
    '记录人工申诉提交',
    '未调用外部 Amazon/legal API',
  ]) {
    assert.match(hijacking, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(hijacking, />提交申诉<\/el-button>/);
  assert.doesNotMatch(hijacking, /label=["']已提交申诉["']/);
  assert.doesNotMatch(hijacking, /link:\s*['"]\/hijacking['"]/);
  assert.match(hijacking, /link:\s*['"]\/monitor\/hijacking['"]/);
});
