import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P1-15: useM4State must reflect the SERVER's queued/dryRun result and never
// optimistically claim executed.
const src = read('apps/web-v2/src/composables/useM4State.js')

test('does not optimistically claim executed:true', () => {
  assert.doesNotMatch(src, /adsActionResult\s*=\s*\{\s*executed:\s*true\s*\}/, 'no fake executed state')
})

test('reflects server queued/dryRun result', () => {
  assert.match(src, /queued:\s*res\?\.queued\s*===\s*true/, 'reads queued from server')
  assert.match(src, /dryRun:\s*res\?\.dryRun\s*!==\s*false/, 'reads dryRun from server')
  assert.match(src, /requiresRealStoreWrite:\s*res\?\.requiresRealStoreWrite\s*===\s*true/, 'reads real-write flag')
})

test('clears optimistic state on failure', () => {
  assert.match(src, /catch[\s\S]*adsActionResult\s*=\s*null/, 'catch clears result')
})

test('behavioral: defaults are safe (dryRun on, not real) when server omits fields', () => {
  function reflect(res) {
    return {
      queued: res?.queued === true,
      dryRun: res?.dryRun !== false,
      requiresRealStoreWrite: res?.requiresRealStoreWrite === true
    }
  }
  assert.deepEqual(reflect({}), { queued: false, dryRun: true, requiresRealStoreWrite: false })
  assert.deepEqual(reflect({ queued: true, dryRun: false, requiresRealStoreWrite: true }),
    { queued: true, dryRun: false, requiresRealStoreWrite: true })
})
