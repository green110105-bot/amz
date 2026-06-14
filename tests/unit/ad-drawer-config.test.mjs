import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TAB_KEYS, TAB_META, TABS_BY_ENTITY, tabsForEntity, isCampaignOnlyTab,
} from '../../apps/web-v2/src/utils/ad-drawer-config.js';

test('ALL_TAB_KEYS is the 10-tab universe and matches v3 recon', () => {
  assert.equal(ALL_TAB_KEYS.length, 10);
  for (const k of ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms', 'history',
                   'overBudget', 'attribution', 'timeSeries', 'keyKeywords']) {
    assert.ok(ALL_TAB_KEYS.includes(k), 'missing key: ' + k);
  }
});

test('TAB_META has label + desc for every key', () => {
  for (const k of ALL_TAB_KEYS) {
    assert.ok(TAB_META[k]?.label, 'missing label for ' + k);
    assert.ok(TAB_META[k]?.desc, 'missing desc for ' + k);
  }
});

test('TABS_BY_ENTITY: campaign has full 9 tabs (matches Lingxing v3 §2)', () => {
  const tabs = TABS_BY_ENTITY.campaign;
  assert.equal(tabs.length, 9);
  assert.deepEqual(tabs, ['daily', 'compare', 'hourly', 'overBudget', 'attribution', 'placement', 'timeSeries', 'keyKeywords', 'history']);
});

test('TABS_BY_ENTITY: keyword has 5 tabs incl userSearchTerms', () => {
  const tabs = TABS_BY_ENTITY.keyword;
  assert.equal(tabs.length, 5);
  assert.ok(tabs.includes('userSearchTerms'));
  assert.ok(tabs.includes('placement'));
});

test('TABS_BY_ENTITY: target has verified 4-tab Lingxing all_target drawer', () => {
  assert.deepEqual(TABS_BY_ENTITY.target, ['daily', 'compare', 'hourly', 'placement']);
  assert.equal(TABS_BY_ENTITY.target.includes('userSearchTerms'), false);
});

test('TABS_BY_ENTITY: adgroup / ad / placement all have 3 tabs (daily/compare/hourly)', () => {
  for (const t of ['adgroup', 'ad', 'placement']) {
    assert.equal(TABS_BY_ENTITY[t].length, 3);
    assert.deepEqual(TABS_BY_ENTITY[t], ['daily', 'compare', 'hourly']);
  }
});

test('TABS_BY_ENTITY: portfolio is the simplest (2 tabs)', () => {
  assert.deepEqual(TABS_BY_ENTITY.portfolio, ['daily', 'compare']);
});

test('tabsForEntity returns default for unknown entity type', () => {
  assert.deepEqual(tabsForEntity('unknown'), ['daily']);
  assert.deepEqual(tabsForEntity(null), ['daily']);
  assert.deepEqual(tabsForEntity('campaign'), TABS_BY_ENTITY.campaign);
});

test('isCampaignOnlyTab identifies the 4 campaign-only tabs', () => {
  for (const k of ['overBudget', 'attribution', 'timeSeries', 'keyKeywords']) {
    assert.equal(isCampaignOnlyTab(k), true, k + ' should be campaign-only');
  }
  for (const k of ['daily', 'compare', 'hourly', 'placement', 'userSearchTerms', 'history']) {
    assert.equal(isCampaignOnlyTab(k), false, k + ' should NOT be campaign-only');
  }
});

test('campaign-only tabs do not appear in non-campaign entity tabs', () => {
  for (const entityType of ['keyword', 'target', 'adgroup', 'ad', 'placement', 'portfolio']) {
    const tabs = TABS_BY_ENTITY[entityType];
    for (const k of tabs) {
      assert.equal(isCampaignOnlyTab(k), false,
        `${entityType} should not contain campaign-only tab ${k}`);
    }
  }
});
