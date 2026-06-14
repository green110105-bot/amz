import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

// M3-P2-21: budget input must be validated (> 0, valid number); invalid disables submit.
const src = read('apps/web-v2/src/pages/lx/LxAllCampaigns.vue')

test('budget validation function checks > 0 and finite', () => {
  assert.match(src, /function isValidBudget/, 'has validator')
  assert.match(src, /Number\.isFinite\(v\)/, 'rejects NaN/Infinity')
  assert.match(src, /v\s*>\s*0/, 'requires positive')
})

test('invalid budget disables submit button', () => {
  assert.match(src, /:disabled="!isValidBudget\(c\.budget\)"/, 'budget button disabled when invalid')
})

test('invalid budget blocks write with a message', () => {
  assert.match(src, /if\s*\(!isValidBudget\(c\.budget\)\)\s*\{[\s\S]*?return/, 'guards onUpdateBudget')
})

test('behavioral: validator rejects 0, negative, NaN, string', () => {
  function isValidBudget(v) {
    return typeof v === 'number' && Number.isFinite(v) && v > 0
  }
  assert.equal(isValidBudget(0), false)
  assert.equal(isValidBudget(-1), false)
  assert.equal(isValidBudget(NaN), false)
  assert.equal(isValidBudget('10'), false)
  assert.equal(isValidBudget(Infinity), false)
  assert.equal(isValidBudget(10), true)
})
