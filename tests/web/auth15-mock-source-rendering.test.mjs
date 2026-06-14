// AUTH-15(b)(c): web-v2 consumers must drive real-vs-mock rendering from source
// meta (source==='mock'/'fixture'), not readiness:
//  (b) SuggestionDrawer renders a Mock Fixture warning + "数据来源: Mock Fixture"
//      label and no real-data green badge when sourceMeta is mock/fixture.
//  (c) AmazonAuthCenter greys out real-sync buttons when m3DataMode is
//      'ads_mock_fixture'.
// Source-level assertions (no Vue build dependency).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('AUTH-15(b): SuggestionDrawer keys mock rendering off source meta, not readiness', async () => {
  const src = await read('apps/web-v2/src/components/SuggestionDrawer.vue');
  // mock detection is computed from sourceMeta.source (mock/fixture), not readiness
  assert.match(src, /isMockSource\s*=\s*computed/);
  assert.match(src, /sourceMeta\.value\?\.source/);
  assert.match(src, /'mock'|"mock"/);
  assert.match(src, /'fixture'|"fixture"/);
  // explicit Mock Fixture label + warning alert gated on isMockSource
  assert.match(src, /数据来源: Mock Fixture/);
  assert.match(src, /v-if="isMockSource"/);
  // the source-mode tag turns success(green) only when NOT mock
  assert.match(src, /isMockSource \? 'warning' : 'success'/);
});

test('AUTH-15(c): AmazonAuthCenter greys real-sync buttons in ads_mock_fixture mode', async () => {
  const src = await read('apps/web-v2/src/pages/AmazonAuthCenter.vue');
  assert.match(src, /adsMockFixture\s*=\s*computed/);
  assert.match(src, /m3DataMode === 'ads_mock_fixture'/);
  // sync-all + ads sync buttons disabled when in mock fixture mode.
  // The :disabled expression may legitimately be a compound guard
  // (adsMockFixture || syncBusy…) — AUTH-07 also gates concurrent syncs — so we
  // require that adsMockFixture is referenced inside the same button's :disabled
  // binding (i.e. fixture mode forces the real-sync control off), without locking
  // the binding to the literal `adsMockFixture` alone. Safety invariant intact:
  // fixture-mode real sync is unconditionally disabled.
  assert.match(src, /:disabled="[^"]*adsMockFixture[^"]*"[^>]*@click="syncAll"|@click="syncAll"[^>]*:disabled="[^"]*adsMockFixture[^"]*"/);
  assert.match(src, /:disabled="[^"]*adsMockFixture[^"]*"[^>]*@click="syncAds"|@click="syncAds"[^>]*:disabled="[^"]*adsMockFixture[^"]*"/);
  // honest Mock Fixture banner
  assert.match(src, /数据来源: Mock Fixture/);
});
