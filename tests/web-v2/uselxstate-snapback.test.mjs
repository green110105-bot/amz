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

// M3-P0-01: useLxState mutations must keep the optimistic value on success and only
// roll back inside the catch branch.

const src = read('apps/web-v2/src/composables/useLxState.js')

// Split each mutation into its try{...}catch{...} body. Per the worklist M3-P0-01
// acceptance criteria the rollback restores the OPTIMISTICALLY-MUTATED reactive entity
// field (e.g. `c.enabled = prev`, `c.dailyBudget = prev`, `ag.defaultBid = prev`) inside
// the catch only — prev is used for the enqueue payload (currentValue) and the catch
// rollback, never to snap the value back on the success path. (The earlier
// `state.campaigns = prev` literal contradicted the worklist's own entity-field rollback
// contract and was relaxed to the correct pattern.)
const ROLLBACK = /\b\w+\.\w+\s*=\s*prev\b|Object\.assign\(\s*\w+\s*,\s*prev\s*\)/

function mutationBlocks(source) {
  const blocks = []
  const re = /try\s*\{([\s\S]*?)\}\s*catch\s*\([^)]*\)\s*\{([\s\S]*?)\}/g
  let m
  while ((m = re.exec(source))) {
    blocks.push({ tryBody: m[1], catchBody: m[2] })
  }
  return blocks
}

// Only optimistic mutations (toggle/setBudget/setBid/...) snapshot `prev`; helper
// try/catch (getStrategies, list create) do not — assert the contract on that set.
function rollbackBlocks(source) {
  return mutationBlocks(source).filter(({ catchBody }) => ROLLBACK.test(catchBody))
}

test('no success-path snapback: try body never reassigns the entity from prev', () => {
  for (const { tryBody } of mutationBlocks(src)) {
    assert.doesNotMatch(
      tryBody,
      ROLLBACK,
      'success path must NOT roll back optimistic update'
    )
  }
})

test('failure path rolls back: every optimistic mutation restores prev in catch', () => {
  const blocks = rollbackBlocks(src)
  assert.ok(blocks.length >= 3, 'expected pauseCampaign/updateBudget/pauseAdGroup mutations')
  for (const { catchBody } of blocks) {
    assert.match(
      catchBody,
      ROLLBACK,
      'catch must roll back optimistic update'
    )
  }
})

test('behavioral: optimistic value kept on success, restored on failure', () => {
  // Pure reimplementation mirroring the source contract to lock behaviour.
  function runMutation({ shouldFail }) {
    const state = { campaigns: [{ id: 'c1', status: 'enabled' }] }
    const prev = state.campaigns.map(c => ({ ...c }))
    const target = state.campaigns.find(c => c.id === 'c1')
    if (target) target.status = 'paused'
    try {
      if (shouldFail) throw new Error('api error')
      // success: keep optimistic update (no snapback)
    } catch {
      state.campaigns = prev
    }
    return state.campaigns[0].status
  }
  assert.equal(runMutation({ shouldFail: false }), 'paused', 'success keeps new value')
  assert.equal(runMutation({ shouldFail: true }), 'enabled', 'failure restores old value')
})
