import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P3-24: Ads copy unified (Chinese primary) with i18n key placeholders.
const src = read('apps/web-v2/src/pages/AdsHub.vue')

test('title unified to Chinese (no mixed EN identifier in heading)', () => {
  assert.match(src, /<h1>广告中心<\/h1>/, 'title is Chinese only')
  assert.doesNotMatch(src, /<h1>广告中心 AdsHub<\/h1>/, 'no mixed EN/CN heading')
})

test('i18n key placeholders present', () => {
  assert.match(src, /i18n: ads\.hub\.title/, 'title i18n key placeholder')
  assert.match(src, /i18n: ads\.hub\./, 'has ads.hub.* i18n placeholders')
})
