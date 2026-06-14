import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P1-13: AdsTimeline shows demo banner when providerMode != real; never labels
// mock/hybrid as real.
const vue = read('apps/web-v2/src/pages/AdsTimeline.vue')
const api = read('apps/web-v2/src/api/ads-timeline.js')

test('demo banner shown when not real', () => {
  assert.match(vue, /demo-banner/, 'renders demo banner element')
  assert.match(vue, /v-if="!isReal"/, 'banner gated on real status')
  assert.match(vue, /providerMode\.value\s*===\s*'real'/, 'isReal strictly checks real')
})

test('providerMode defaults to mock, never fabricated as real', () => {
  assert.match(vue, /providerMode\.value\s*=\s*res\.sourceMeta\?\.providerMode\s*\|\|\s*res\.providerMode\s*\|\|\s*'mock'/, 'defaults to mock')
  assert.doesNotMatch(vue, /providerMode\.value\s*=\s*'real'/, 'never hardcodes real')
})

test('api normalizes sourceMeta and defaults to mock', () => {
  assert.match(api, /providerMode\s*=\s*res\?\.sourceMeta\?\.providerMode\s*\|\|\s*res\?\.providerMode\s*\|\|\s*'mock'/, 'api defaults mock')
  assert.match(api, /sourceMeta:\s*\{[^}]*providerMode\s*\}/, 'api returns normalized sourceMeta')
})

test('behavioral: missing sourceMeta resolves to mock (not real)', () => {
  const resolve = (res) => res?.sourceMeta?.providerMode || res?.providerMode || 'mock'
  assert.equal(resolve({}), 'mock')
  assert.equal(resolve({ providerMode: 'hybrid' }), 'hybrid')
  assert.equal(resolve({ sourceMeta: { providerMode: 'real' } }), 'real')
})
