import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P1-14: applying a strategy shows a dryRun preview (affected entities / expected
// change) BEFORE enqueuing; only confirm enqueues into ad_action_queue.
const src = read('apps/web-v2/src/pages/StrategyLibrary.vue')

test('apply shows dryRun preview, does not write directly', () => {
  assert.match(src, /dryrun-preview/, 'renders dryRun preview')
  assert.match(src, /affectedEntities/, 'preview shows affected entity count')
  assert.match(src, /expectedChange/, 'preview shows expected change')
  assert.doesNotMatch(src, /alert\('已应用/, 'must not apply directly via alert')
})

test('preview confirmation enqueues with dryRun and no real write', () => {
  assert.match(src, /confirmApply/, 'has confirm handler')
  assert.match(src, /triggerAdsAction/, 'enqueues through Ads action API')
  assert.match(src, /dryRun:\s*true/, 'enqueues with dryRun true')
  assert.match(src, /requiresRealStoreWrite:\s*false/, 'does not request real store write')
})

test('preview notes audit flow', () => {
  assert.match(src, /ad_action_queue/, 'preview mentions ad_action_queue')
  assert.match(src, /needs_review/, 'preview mentions needs_review')
})
