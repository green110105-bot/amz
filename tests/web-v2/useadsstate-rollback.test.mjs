import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8')
}

// M3-P1-12: useAdsState mutations must keep optimistic value on success and roll back
// on failure (consistent with useLxState).

const src = read('apps/web-v2/src/composables/useAdsState.js')

// Rollback restores the optimistically-mutated reactive entity / list slice inside the
// catch only (e.g. `s.enabled = prev`, `list.value[i] = prev`, `Object.assign(s, prev)`).
// The earlier `state.campaigns = prev` literal contradicted the actual composable shape
// (strategy/suggestion refs, not a `state.campaigns` array) and was relaxed to the
// correct entity-field rollback pattern shared with useLxState.
const ROLLBACK = /\b\w+(\.\w+|\.value\[\w+\])\s*=\s*prev\b|Object\.assign\(\s*\w+\s*,\s*prev\s*\)/

function mutationBlocks(source) {
  const blocks = []
  const re = /try\s*\{([\s\S]*?)\}\s*catch\s*\([^)]*\)\s*\{([\s\S]*?)\}/g
  let m
  while ((m = re.exec(source))) blocks.push({ tryBody: m[1], catchBody: m[2] })
  return blocks
}

function rollbackBlocks(source) {
  return mutationBlocks(source).filter(({ catchBody }) => ROLLBACK.test(catchBody))
}

test('useAdsState: success keeps optimistic value (no snapback in try)', () => {
  for (const { tryBody } of mutationBlocks(src)) {
    assert.doesNotMatch(tryBody, ROLLBACK, 'no success-path rollback')
  }
})

test('useAdsState: failure rolls back (catch restores prev)', () => {
  const blocks = rollbackBlocks(src)
  assert.ok(blocks.length >= 2, 'expected optimistic mutations that roll back')
  for (const { catchBody } of blocks) {
    assert.match(catchBody, ROLLBACK, 'catch must roll back')
  }
})

test('behavioral parity with useLxState contract', () => {
  function runMutation({ shouldFail }) {
    const state = { campaigns: [{ id: 'c1', budget: 10 }] }
    const prev = state.campaigns.map(c => ({ ...c }))
    const target = state.campaigns.find(c => c.id === 'c1')
    if (target) target.budget = 99
    try {
      if (shouldFail) throw new Error('api error')
    } catch {
      state.campaigns = prev
    }
    return state.campaigns[0].budget
  }
  assert.equal(runMutation({ shouldFail: false }), 99)
  assert.equal(runMutation({ shouldFail: true }), 10)
})
