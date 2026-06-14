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

// CORRECT CONTRACT (replaces the legacy placeholder that allowed direct writes):
// Ads real writes must go through ad_action_queue with dryRun defaulting ON, and the
// server must never trust the frontend requiresRealStoreWrite flag.

test('ads api: pause/budget send dryRun (never implies real write from client)', () => {
  const src = read('apps/web-v2/src/api/ads.js')
  assert.match(src, /pause`,\s*\{\s*dryRun:\s*true/s, 'pause must send dryRun: true')
  assert.match(src, /budget`,\s*\{[^}]*dryRun:\s*true/s, 'budget must send dryRun: true')
})

test('ads route: server forces requiresRealStoreWrite=false when REAL_WRITES_ENABLED!=true', () => {
  const src = read('apps/api/src/store-routes-ads.mjs')
  assert.match(src, /if\s*\(!realWritesEnabled\(\)\)\s*return\s*false/, 'route must hard-force false when not real mode')
  assert.doesNotMatch(
    src,
    /requiresRealStoreWrite\s*=\s*body\.requiresRealStoreWrite\s*===\s*true\s*$/m,
    'route must NOT unconditionally trust the frontend body flag'
  )
})

test('enqueueAdAction: dryRun defaults to 1 and clamps requiresRealStoreWrite outside real mode', () => {
  const src = read('apps/api/src/ad-action-queue.mjs')
  assert.match(src, /audit_required:\s*1/, 'audit_required must default to 1')
  assert.match(src, /guardrail_status:\s*'needs_review'/, "guardrail status must default to needs_review")
  // dryRun is 1 unless real mode + explicit dryRun===false
  assert.match(src, /real\s*&&\s*action\.dryRun\s*===\s*false\s*\?\s*0\s*:\s*1/, 'dryRun must default to 1')
  // requiresRealStoreWrite clamped to false when not real
  assert.match(src, /real\s*\?\s*\(action\.requiresRealStoreWrite\s*===\s*true\)\s*:\s*false/, 'requiresRealStoreWrite clamped')
})
