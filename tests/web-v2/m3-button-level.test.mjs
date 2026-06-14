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

// CORRECT CONTRACT (replaces legacy placeholder that locked "button always enabled"):
// Real-write buttons must, when REAL_WRITES_ENABLED!=='true', either be disabled or
// surface an audit/ticket hint, and the shared gate must drive that behaviour.

test('live-action gate exposes realWritesEnabled / realWriteDisabled', () => {
  const src = read('apps/web-v2/src/composables/useLiveActionGate.js')
  assert.match(src, /export function realWritesEnabled/, 'must export realWritesEnabled')
  assert.match(src, /VITE_REAL_WRITES_ENABLED\s*===\s*'true'/, 'gate keyed on REAL_WRITES_ENABLED flag')
  assert.match(src, /export function realWriteDisabled/, 'must export realWriteDisabled')
  assert.match(src, /return\s*!realWritesEnabled\(\)/, 'disabled when not real mode')
})

test('AdsHub real-write button shows audit/ticket hint and dryRun banner', () => {
  const src = read('apps/web-v2/src/pages/AdsHub.vue')
  assert.match(src, /confirmAuditAction/, 'pause must confirm via audit gate')
  assert.match(src, /dryrun-banner/, 'must render dryRun banner when not real mode')
  assert.match(src, /pauseHint/, 'pause button must carry an audit/ticket hint')
  assert.match(src, /v-if="!realWrites"/, 'banner gated on real-write state')
})

test('LxAllCampaigns / LxPortfolioDetail real writes confirm via audit gate', () => {
  const lx = read('apps/web-v2/src/pages/lx/LxAllCampaigns.vue')
  const pd = read('apps/web-v2/src/pages/lx/LxPortfolioDetail.vue')
  assert.match(lx, /confirmAuditAction/, 'LxAllCampaigns pause/budget confirm')
  assert.match(pd, /confirmAuditAction/, 'LxPortfolioDetail pause confirm')
  assert.match(lx, /dryrun-banner/, 'LxAllCampaigns dryRun banner')
  assert.match(pd, /dryrun-banner/, 'LxPortfolioDetail dryRun banner')
})

test('confirm message names ad_action_queue + needs_review + auditRequired + dryRun', () => {
  const gate = read('apps/web-v2/src/composables/useLiveActionGate.js')
  assert.match(gate, /ad_action_queue/, 'confirm mentions ad_action_queue')
  assert.match(gate, /needs_review/, 'confirm mentions needs_review')
  assert.match(gate, /auditRequired/, 'confirm mentions auditRequired')
  assert.match(gate, /dryRun/, 'confirm mentions dryRun')
})
