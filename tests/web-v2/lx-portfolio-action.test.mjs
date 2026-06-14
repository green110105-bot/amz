import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P1-17: LxPortfolioDetail real-write actions prompt ad_action_queue audit with
// dryRun default annotation.
const src = read('apps/web-v2/src/pages/lx/LxPortfolioDetail.vue')

test('pause confirms via audit gate', () => {
  assert.match(src, /confirmAuditAction\(\s*'暂停广告活动'/, 'pause confirms')
  assert.match(src, /import \{[\s\S]*confirmAuditAction[\s\S]*\} from '\.\.\/\.\.\/composables\/useLiveActionGate\.js'/, 'imports gate')
})

test('dryRun mode annotated', () => {
  assert.match(src, /dryrun-banner/, 'shows dryRun banner')
  assert.match(src, /pauseHint/, 'pause button carries audit hint')
})
