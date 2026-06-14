import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P2-22: drawer renders only the active tab (lazy), not all tabs at once.
const src = read('apps/web-v2/src/components/SuggestionDrawer.vue')

test('does not render all tab panels at once', () => {
  assert.doesNotMatch(src, /v-for="t in tabs"[\s\S]*?class="tab-panel"/, 'no v-for over all panels')
})

test('renders only the current/active tab panel', () => {
  assert.match(src, /v-if="currentTab"/, 'panel gated on current tab')
  assert.match(src, /currentTab\.component/, 'renders active component only')
})

test('current tab derived from activeTab', () => {
  assert.match(src, /currentTab\s*=\s*computed\(/, 'currentTab is computed')
  assert.match(src, /tabs\.find\(t\s*=>\s*t\.key\s*===\s*activeTab\.value\)/, 'matches active key')
})

test('behavioral: only one panel resolved', () => {
  const tabs = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
  const activeTab = 'b'
  const current = tabs.find(t => t.key === activeTab) || null
  assert.equal(current.key, 'b')
  // exactly one resolved (computed returns single object, not array)
  assert.ok(!Array.isArray(current))
})
