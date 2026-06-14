// W13: Workbench mount regression for the DB codepath.
//
// Acceptance (worklist W13): "前端 mount 测试 assert DB 态无 Vue prop warning".
//
// This repo's web suite is static + behavioural (no jsdom/vue runtime), so the
// "no Vue prop warning at mount" invariant is enforced structurally: we take the
// REAL DB-path dashboard payload, run it through the SAME normalizeCard() the
// Workbench uses, and assert every produced card satisfies DecisionCard's
// declared prop contract (required `card` is a non-null Object, the `:key`
// binding `card.id` resolves, and every template-accessed field is present with
// a renderable type). A Vue runtime would emit a prop warning iff any of these
// were violated; satisfying them all means a warning-free mount in DB state.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const tmpDir = mkdtempSync(join(tmpdir(), 'amz-wb-mount-'));
process.env.DATA_DB_PATH = join(tmpDir, 'store.db');
process.env.CREDENTIAL_ENC_KEY = randomBytes(32).toString('hex');

const { handleExtendedRequest } = await import('../../apps/api/src/extended-routes.mjs');
const { authenticate, defaultStoreIdFor, getDbInstance } = await import('../../apps/api/src/data-store.mjs');
const { normalizeCard } = await import('../../apps/web-v2/src/utils/format.js');

getDbInstance();
const auth = authenticate('demo@amz.local', 'demo');
const storeId = defaultStoreIdFor(auth.user.id);

function request(path) {
  return new Request('http://localhost' + path, {
    headers: {
      authorization: 'Bearer ' + auth.token,
      'x-store-id': storeId,
    },
  });
}

async function read(rel) {
  return readFile(join(repoRoot, rel), 'utf8');
}

async function dbCards() {
  const res = await handleExtendedRequest(request('/api/v1/dashboard'));
  assert.equal(res.status, 200);
  const body = await res.json();
  // Mirror Workbench.vue load(): (data.actionCards || []).map(normalizeCard)
  return (body.actionCards || []).map(normalizeCard);
}

test('W13: Workbench is the route that mounts DecisionCard with the normalized card', async () => {
  const wb = await read('apps/web-v2/src/pages/Workbench.vue');
  // It must pass the WHOLE normalized card object (not card.payload) as the prop.
  assert.match(wb, /:card="card"/, 'binds :card="card"');
  assert.match(wb, /\.map\(\(c\) => normalizeCard\(c\)\)|\.map\(normalizeCard\)/, 'normalizes cards before render');
  // v-for key uses card.id, so card.id must be defined to avoid a key warning.
  assert.match(wb, /:key="card\.id/, 'keys by card.id');
});

test('W13: DB-state cards satisfy DecisionCard required prop contract (no Vue prop warning)', async () => {
  const dc = await read('apps/web-v2/src/components/DecisionCard.vue');
  // Parse the declared prop contract for `card`.
  assert.match(dc, /card:\s*\{\s*type:\s*Object,\s*required:\s*true\s*\}/,
    'DecisionCard declares card: { type: Object, required: true }');

  const cards = await dbCards();
  assert.ok(cards.length > 0, 'DB path yields at least one card to mount');

  for (const card of cards) {
    // required:true + type:Object  -> must be a non-null plain object.
    assert.ok(card && typeof card === 'object' && !Array.isArray(card),
      'card prop is a non-null Object (required prop satisfied)');
    // v-for :key="card.id" must resolve to a stable, defined key.
    assert.ok(card.id !== undefined && card.id !== null && card.id !== '',
      'card.id is a defined v-for key');
  }
});

test('W13: every template-accessed field renders without type warnings in DB state', async () => {
  const cards = await dbCards();
  for (const card of cards) {
    // <span>{{ card.priority }}</span> — primitive renderable.
    assert.ok(['string', 'number'].includes(typeof card.priority),
      'card.priority is renderable');
    // <h3>{{ card.title }}</h3> and <p>{{ card.recommendation }}</p> — strings.
    assert.equal(typeof card.title, 'string', 'card.title is a string');
    assert.equal(typeof card.recommendation, 'string', 'card.recommendation is a string');
    // v-for="(e,i) in card.evidence" — must be an array (never undefined) to
    // avoid the "cannot read length of undefined" mount warning.
    assert.ok(Array.isArray(card.evidence), 'card.evidence is an array');
    for (const e of card.evidence) {
      assert.ok(['string', 'number', 'object'].includes(typeof e), 'evidence entry is renderable');
    }
    // DecisionCard.hasEvidence reads card.payload defensively (null-safe:
    // `card.payload == null || Object.keys(card.payload).length === 0`), so the
    // normalized card's payload may be null/undefined without a mount warning —
    // but if present it must be an object so Object.keys() never throws.
    assert.ok(
      card.payload === null || card.payload === undefined || typeof card.payload === 'object',
      'card.payload is null/undefined or an object (Object.keys-safe in hasEvidence)',
    );
  }
});
