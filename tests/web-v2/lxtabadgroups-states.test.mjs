import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P2-20: LxTabAdGroups must render loading and empty states.
const src = read('apps/web-v2/src/pages/lx/tabs/LxTabAdGroups.vue')

test('renders loading state', () => {
  assert.match(src, /loading-state/, 'has loading state element')
  assert.match(src, /v-if="loading"/, 'gated on loading')
})

test('renders empty state', () => {
  assert.match(src, /empty-state/, 'has empty state element')
  assert.match(src, /adGroups\.length\s*===\s*0/, 'empty when no ad groups')
  assert.match(src, /暂无广告组数据/, 'empty copy present')
})

test('table only when data present', () => {
  assert.match(src, /v-else>/, 'table rendered in v-else branch')
})
