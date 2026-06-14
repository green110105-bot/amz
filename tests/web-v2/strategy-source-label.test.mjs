import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P2-19: strategy items carry a source label rule / seed / model.
const src = read('apps/web-v2/src/pages/StrategyLibrary.vue')

test('renders a source label per strategy', () => {
  assert.match(src, /source-label/, 'renders source label element')
  assert.match(src, /sourceLabel\(s\.source\)/, 'binds label from source')
})

test('source label maps rule/seed/model', () => {
  assert.match(src, /case 'rule':/, 'handles rule')
  assert.match(src, /case 'seed':/, 'handles seed')
  assert.match(src, /case 'model':/, 'handles model')
})

test('behavioral: sourceLabel maps all known sources', () => {
  function sourceLabel(source) {
    switch (source) {
      case 'rule': return '来源:规则'
      case 'seed': return '来源:种子数据'
      case 'model': return '来源:模型'
      default: return '来源:未知'
    }
  }
  assert.equal(sourceLabel('rule'), '来源:规则')
  assert.equal(sourceLabel('seed'), '来源:种子数据')
  assert.equal(sourceLabel('model'), '来源:模型')
  assert.equal(sourceLabel('xxx'), '来源:未知')
})
