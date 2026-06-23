// 领星签名算法回归测试 — 锁定与官方 Python SDK 等价的确定性结果。
// 该签名已对真实领星 API 验证可拿到真实 TikTok 数据(2026-06,见对接文档)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSign, formatParams, stableStringify } from '../../apps/api/src/integrations/lingxing/sign.mjs';

test('formatParams: 升序、跳过空值、对象数组无空格序列化', () => {
  const s = formatParams({ b: 2, a: 1, empty: '', nul: null, arr: [3, 1, 2], obj: { z: 1, a: 2 } });
  // 注意: 领星不对数组/对象内部再排序值, 只排顶层 key + dict 内 key 有序
  assert.equal(s, 'a=1&arr=[3,1,2]&b=2&obj={"a":2,"z":1}');
});

test('stableStringify: 对象按 key 升序、无空格', () => {
  assert.equal(stableStringify({ z: 1, a: 2 }), '{"a":2,"z":1}');
  assert.equal(stableStringify([3, 1, 2]), '[3,1,2]');
});

test('generateSign: 确定性已知答案 (AES-128-ECB + MD5 + Base64)', () => {
  const key = '1234567890abcdef'; // 16 bytes
  const params = { app_key: key, access_token: 'tok-x', timestamp: '1700000000', b: 2, a: 1, arr: [3, 1, 2], obj: { z: 1, a: 2 } };
  // 该值由复刻算法对固定输入算出, 作为防回退锚点 (改算法会立刻红)。
  assert.equal(generateSign(key, params), 'PdCbLYbwmg5Rz3hWi7mGFODe/3htEvHZPK4T7y/1wagC3sVlLAIV+Tr2nwCfD21Y');
});

test('generateSign: 不同参数 -> 不同签名', () => {
  const key = '1234567890abcdef';
  const a = generateSign(key, { app_key: key, timestamp: '1' });
  const b = generateSign(key, { app_key: key, timestamp: '2' });
  assert.notEqual(a, b);
});
