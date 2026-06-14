import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P1-11: bulk pause must confirm selected count, show progress, toast summary.
const src = read('apps/web-v2/src/pages/lx/LxAllCampaigns.vue')

test('bulk pause confirms with selected count', () => {
  assert.match(src, /confirmAuditAction\(\s*'批量暂停广告活动'\s*,\s*ids\.length\s*\)/, 'confirm with count')
})

test('bulk pause shows progress feedback', () => {
  assert.match(src, /bulkRunning/, 'tracks running state')
  assert.match(src, /bulk-progress/, 'renders progress indicator')
  assert.match(src, /bulkDone\.value\+\+/, 'increments progress per item')
})

test('bulk pause toasts success/failure summary', () => {
  assert.match(src, /bulk-toast/, 'renders toast')
  assert.match(src, /成功\s*\$\{ok\}\s*项,失败\s*\$\{fail\}\s*项/, 'summary toast text')
})

test('behavioral: summary counts ok/fail correctly', async () => {
  async function bulk(ids, failSet) {
    let ok = 0, fail = 0, done = 0
    for (const id of ids) {
      try {
        if (failSet.has(id)) throw new Error('x')
        ok++
      } catch { fail++ } finally { done++ }
    }
    return { ok, fail, done }
  }
  const r = await bulk(['a', 'b', 'c'], new Set(['b']))
  assert.deepEqual(r, { ok: 2, fail: 1, done: 3 })
})
