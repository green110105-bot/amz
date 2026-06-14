import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M4-P0-05: M4 -> Ads writes MUST go through ad_action_queue; when REAL_WRITES_ENABLED
// !=='true' dryRun is forced and requiresRealStoreWrite is forced false.
const store = read('apps/api/src/data-store-monitor.mjs')
const routes = read('apps/api/src/store-routes-monitor.mjs')

test('M4 ads action routes through ad_action_queue (no direct execution)', () => {
  assert.match(store, /import \{ enqueueAdAction \} from '\.\/ad-action-queue\.mjs'/, 'imports queue')
  assert.match(store, /enqueueAdAction\(/, 'calls enqueueAdAction')
  assert.doesNotMatch(store, /executed:\s*true,\s*\n\s*requiresRealStoreWrite/, 'no direct executed result')
  assert.doesNotMatch(store, /directly executed \(no queue\)/, 'removed direct-execute path')
})

test('forces dryRun and requiresRealStoreWrite=false when not real mode', () => {
  assert.match(store, /real\s*\?\s*\(payload\.requiresRealStoreWrite\s*===\s*true\)\s*:\s*false/, 'clamps real-write flag')
  assert.match(store, /dryRun:\s*real\s*\?\s*payload\.dryRun\s*!==\s*false\s*:\s*true/, 'forces dryRun when not real')
})

test('route does not trust frontend body for real-write flag', () => {
  assert.match(routes, /realWritesEnabled\(\)\s*\?\s*body\.requiresRealStoreWrite\s*===\s*true\s*:\s*false/, 'route clamps flag')
})

test('behavioral: clamp forces safe values when not real', () => {
  function clamp(real, payload) {
    return {
      requiresRealStoreWrite: real ? payload.requiresRealStoreWrite === true : false,
      dryRun: real ? payload.dryRun !== false : true
    }
  }
  assert.deepEqual(clamp(false, { requiresRealStoreWrite: true, dryRun: false }),
    { requiresRealStoreWrite: false, dryRun: true })
  assert.deepEqual(clamp(true, { requiresRealStoreWrite: true, dryRun: false }),
    { requiresRealStoreWrite: true, dryRun: false })
})
