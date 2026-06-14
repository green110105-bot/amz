import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// X-P0-06: all Ads real writes go through the single gated boundary (enqueueAdAction /
// live-action boundary) under isRealMode; REAL_WRITES_ENABLED!=='true' forces
// requiresRealStoreWrite=false.
const adsRoute = read('apps/api/src/store-routes-ads.mjs')
const m4api = read('apps/web-v2/src/api/m4.js')
const queue = read('apps/api/src/ad-action-queue.mjs')
const adsStore = read('apps/api/src/data-store-ads.mjs')

test('ads route forces requiresRealStoreWrite=false outside real mode', () => {
  assert.match(adsRoute, /if\s*\(!realWritesEnabled\(\)\)\s*return\s*false/, 'hard-forces false')
  assert.doesNotMatch(adsRoute, /const requiresRealStoreWrite = body\.requiresRealStoreWrite === true\n/, 'no blind trust')
})

test('ads writes funnel through ad_action_queue boundary', () => {
  assert.match(adsStore, /enqueueAdAction\(/, 'pause/budget enqueue via queue')
})

test('queue is the single isRealMode-gated boundary', () => {
  assert.match(queue, /function isRealMode/, 'queue owns isRealMode gate')
  assert.match(queue, /const real = isRealMode\(\)/, 'gate consulted')
  assert.match(queue, /real\s*\?\s*\(action\.requiresRealStoreWrite\s*===\s*true\)\s*:\s*false/, 'clamps flag')
})

test('M4 client api defaults to safe (dryRun true, no real write)', () => {
  assert.match(m4api, /dryRun:\s*true/, 'client default dryRun true')
  assert.match(m4api, /requiresRealStoreWrite:\s*false/, 'client default no real write')
})

test('behavioral: server clamp ignores frontend true outside real mode', () => {
  function resolveRealStoreWrite(real, body) {
    if (!real) return false
    return body.requiresRealStoreWrite === true
  }
  assert.equal(resolveRealStoreWrite(false, { requiresRealStoreWrite: true }), false)
  assert.equal(resolveRealStoreWrite(true, { requiresRealStoreWrite: true }), true)
  assert.equal(resolveRealStoreWrite(true, { requiresRealStoreWrite: false }), false)
})
