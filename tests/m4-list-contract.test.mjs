// tests/m4-list-contract.test.mjs
// M4-P3-02: M4 list endpoints must return a { items, summary?, total? } envelope.
// unwrapList/unwrapItems must surface contract drift as an explicit throw rather than
// silently falling back through a chain of `??`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unwrapList, unwrapItems, unwrapSub } from '../apps/web-v2/src/api/m4-unwrap.js';

test('unwrapList accepts the canonical { items, summary, total } envelope', () => {
  const out = unwrapList({ data: { items: [{ id: 'a' }], summary: { total: 1 }, total: 1 } });
  assert.deepEqual(out.items, [{ id: 'a' }]);
  assert.deepEqual(out.summary, { total: 1 });
  assert.equal(out.total, 1);
});

test('unwrapList tolerates a missing summary/total (optional keys)', () => {
  const out = unwrapList({ data: { items: [] } });
  assert.deepEqual(out.items, []);
  assert.equal(out.summary, undefined);
  assert.equal(out.total, undefined);
});

test('unwrapList throws on a bare array (contract drift, no silent fallback)', () => {
  assert.throws(() => unwrapList({ data: [{ id: 'a' }] }), /contract drift/);
});

test('unwrapList throws when items[] is missing (contract drift)', () => {
  assert.throws(() => unwrapList({ data: { rows: [] } }), /contract drift/);
  assert.throws(() => unwrapList({ data: null }), /contract drift/);
  assert.throws(() => unwrapList({}), /contract drift/);
});

test('unwrapItems returns the typed array from the envelope', () => {
  assert.deepEqual(unwrapItems({ data: { items: [1, 2, 3] } }), [1, 2, 3]);
});

test('unwrapItems throws on drift instead of returning []', () => {
  assert.throws(() => unwrapItems({ data: [] }), /contract drift/);
});

test('unwrapSub returns bare arrays for sub-resource endpoints', () => {
  assert.deepEqual(unwrapSub({ data: [1, 2] }), [1, 2]);
  assert.deepEqual(unwrapSub({ data: { items: [3] } }), [3]);
  assert.deepEqual(unwrapSub({ data: null }), []);
});
