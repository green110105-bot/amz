// useLxState.js — 领星等价 (lx) 体系 composables
//
// 顶层 portfolios 用模块作用域单例。下层（campaigns / adGroups / targetings 等）
// 按 父 ID（campaignId 或 portfolioId）做缓存，避免重复请求。
//
// 错误统一 ElMessage.error；mutation 乐观更新 + 失败回滚。

import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import {
  portfoliosApi,
  campaignsApi,
  adGroupsApi,
  adsApi,
  targetingsApi,
  negativesApi,
  userSearchTermsApi,
  opLogApi,
  dailyApi,
  kwGrabbingApi,
  placementsApi,
  amcApi,
} from '../api/lx';

// ====== 通用：按 key 缓存的 reactive 列表 ======
function makeKeyedStore() {
  const store = ref({}); // { [key]: array }
  const loaded = ref({});
  const inflight = {};

  function getList(key) {
    return store.value[key] || [];
  }

  async function fetch(key, fetcher, force = false) {
    if (!key && key !== 'all') return [];
    const cacheKey = key || 'all';
    if (inflight[cacheKey]) return inflight[cacheKey];
    if (loaded.value[cacheKey] && !force) return store.value[cacheKey] || [];
    inflight[cacheKey] = fetcher()
      .then((items) => {
        const arr = Array.isArray(items) ? items : [];
        store.value[cacheKey] = arr;
        loaded.value[cacheKey] = true;
        return arr;
      })
      .catch((e) => {
        ElMessage.error(`加载失败：${e.message || e}`);
        store.value[cacheKey] = store.value[cacheKey] || [];
        return store.value[cacheKey];
      })
      .finally(() => {
        delete inflight[cacheKey];
      });
    return inflight[cacheKey];
  }

  function setList(key, items) {
    store.value[key || 'all'] = items;
    loaded.value[key || 'all'] = true;
  }

  return { store, loaded, getList, fetch, setList };
}

// ====== Portfolios (单例) ======
const _portfolios = ref([]);
const _portfoliosLoaded = ref(false);
let _portfoliosPromise = null;

async function _fetchPortfolios(force = false) {
  if (_portfoliosPromise) return _portfoliosPromise;
  if (_portfoliosLoaded.value && !force) return _portfolios.value;
  _portfoliosPromise = portfoliosApi
    .list()
    .then((items) => {
      _portfolios.value = Array.isArray(items) ? items : [];
      _portfoliosLoaded.value = true;
      return _portfolios.value;
    })
    .catch((e) => {
      ElMessage.error(`加载广告组合失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _portfoliosPromise = null;
    });
  return _portfoliosPromise;
}

export function usePortfolios() {
  const list = _portfolios;

  async function toggle(p) {
    const prev = p.enabled;
    p.enabled = !prev;
    try {
      await portfoliosApi.toggle(p.id, p.enabled);
    } catch (e) {
      p.enabled = prev;
      ElMessage.error(`切换失败：${e.message || e}`);
    }
  }

  async function setBudget(p, budgetCap) {
    const prev = p.budgetCap;
    p.budgetCap = budgetCap;
    try {
      await portfoliosApi.setBudget(p.id, budgetCap);
      ElMessage.success('已保存预算上限');
    } catch (e) {
      p.budgetCap = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  function getById(id) {
    return list.value.find((p) => p.id === id);
  }

  return { list, loaded: _portfoliosLoaded, fetch: _fetchPortfolios, toggle, setBudget, getById };
}

// ====== Campaigns (按 portfolioId 缓存 + 全表) ======
const _campaignsStore = makeKeyedStore();

export function useCampaigns(portfolioId = null) {
  const key = portfolioId || 'all';

  const list = computed(() => _campaignsStore.getList(key));

  async function fetch(force = false) {
    const params = portfolioId ? { portfolioId } : {};
    return _campaignsStore.fetch(key, () => campaignsApi.list(params), force);
  }

  async function fetchAll(force = false) {
    return _campaignsStore.fetch('all', () => campaignsApi.list({}), force);
  }

  function getById(id) {
    // 跨所有缓存查
    for (const k of Object.keys(_campaignsStore.store.value)) {
      const arr = _campaignsStore.store.value[k] || [];
      const found = arr.find((c) => c.id === id);
      if (found) return found;
    }
    return null;
  }

  async function toggle(c) {
    const prev = c.enabled;
    c.enabled = !prev;
    try {
      await campaignsApi.toggle(c.id, c.enabled);
    } catch (e) {
      c.enabled = prev;
      ElMessage.error(`切换失败：${e.message || e}`);
    }
  }

  async function setBudget(c, dailyBudget) {
    const prev = c.dailyBudget;
    c.dailyBudget = dailyBudget;
    try {
      await campaignsApi.setBudget(c.id, dailyBudget);
    } catch (e) {
      c.dailyBudget = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  async function setBidStrategy(c, bidStrategy) {
    const prev = c.bidStrategy;
    c.bidStrategy = bidStrategy;
    try {
      await campaignsApi.setBidStrategy(c.id, bidStrategy);
    } catch (e) {
      c.bidStrategy = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  async function update(c, patch) {
    const prev = { ...c };
    Object.assign(c, patch);
    try {
      const updated = await campaignsApi.update(c.id, patch);
      if (updated) Object.assign(c, updated);
    } catch (e) {
      Object.assign(c, prev);
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  // M3 fix #3: get strategies bound to a campaign
  async function getStrategies(campaignId) {
    try {
      return await campaignsApi.getStrategies(campaignId);
    } catch (e) {
      console.warn('[campaigns.getStrategies]', e?.message);
      return [];
    }
  }

  return {
    list,
    fetch,
    fetchAll,
    toggle,
    setBudget,
    setBidStrategy,
    update,
    getById,
    getStrategies,
  };
}

// ====== AdGroups ======
const _adGroupsStore = makeKeyedStore();

export function useAdGroups(campaignId = null) {
  const key = campaignId || 'all';
  const list = computed(() => _adGroupsStore.getList(key));

  async function fetch(force = false) {
    const params = campaignId ? { campaignId } : {};
    return _adGroupsStore.fetch(key, () => adGroupsApi.list(params), force);
  }

  async function setBid(ag, defaultBid) {
    const prev = ag.defaultBid;
    ag.defaultBid = defaultBid;
    try {
      await adGroupsApi.setBid(ag.id, defaultBid);
    } catch (e) {
      ag.defaultBid = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  async function toggle(ag) {
    const prev = ag.enabled;
    ag.enabled = !prev;
    try {
      await adGroupsApi.update(ag.id, { enabled: ag.enabled });
    } catch (e) {
      ag.enabled = prev;
      ElMessage.error(`切换失败：${e.message || e}`);
    }
  }

  return { list, fetch, setBid, toggle };
}

// ====== Ads ======
const _adsStore = makeKeyedStore();

export function useAds(adGroupId = null) {
  const key = adGroupId || 'all';
  const list = computed(() => _adsStore.getList(key));

  async function fetch(force = false) {
    const params = adGroupId ? { adGroupId } : {};
    return _adsStore.fetch(key, () => adsApi.list(params), force);
  }

  async function toggle(ad) {
    const prev = ad.enabled;
    ad.enabled = !prev;
    try {
      await adsApi.toggle(ad.id, ad.enabled);
    } catch (e) {
      ad.enabled = prev;
      ElMessage.error(`切换失败：${e.message || e}`);
    }
  }

  return { list, fetch, toggle };
}

// ====== Targetings ======
const _targetingsStore = makeKeyedStore();

export function useTargetings(campaignId = null, adGroupId = null) {
  const key = adGroupId ? `ag:${adGroupId}` : campaignId ? `c:${campaignId}` : 'all';
  const list = computed(() => _targetingsStore.getList(key));

  async function fetch(force = false) {
    const params = {};
    if (campaignId) params.campaignId = campaignId;
    if (adGroupId) params.adGroupId = adGroupId;
    return _targetingsStore.fetch(key, () => targetingsApi.list(params), force);
  }

  async function setBid(t, bid) {
    const prev = t.bid;
    t.bid = bid;
    try {
      await targetingsApi.setBid(t.id, bid);
      ElMessage.success(`已改 bid 为 $${(+bid).toFixed(2)}`);
    } catch (e) {
      t.bid = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  async function toggle(t) {
    const prev = t.enabled;
    t.enabled = !prev;
    try {
      await targetingsApi.toggle(t.id, t.enabled);
    } catch (e) {
      t.enabled = prev;
      ElMessage.error(`切换失败：${e.message || e}`);
    }
  }

  async function create(body) {
    try {
      const created = await targetingsApi.create(body);
      if (created?.id) {
        const arr = _targetingsStore.getList(key);
        _targetingsStore.setList(key, [created, ...arr]);
      }
      return created;
    } catch (e) {
      ElMessage.error(`创建失败：${e.message || e}`);
      throw e;
    }
  }

  return { list, fetch, setBid, toggle, create };
}

// ====== Negatives ======
const _negativesStore = makeKeyedStore();

export function useNegatives(campaignId = null) {
  const key = campaignId || 'all';
  const list = computed(() => _negativesStore.getList(key));

  async function fetch(force = false) {
    const params = campaignId ? { campaignId } : {};
    return _negativesStore.fetch(key, () => negativesApi.list(params), force);
  }

  async function create(body) {
    const tmp = { ...body, id: `nt-tmp-${Date.now()}` };
    const arr = _negativesStore.getList(key);
    _negativesStore.setList(key, [tmp, ...arr]);
    try {
      const created = await negativesApi.create(body);
      if (created?.id) {
        const cur = _negativesStore.getList(key);
        const idx = cur.findIndex((x) => x.id === tmp.id);
        if (idx >= 0) {
          cur[idx] = created;
          _negativesStore.setList(key, cur);
        }
      }
      ElMessage.success('已添加否定');
      return created;
    } catch (e) {
      const cur = _negativesStore.getList(key);
      _negativesStore.setList(key, cur.filter((x) => x.id !== tmp.id));
      ElMessage.error(`添加失败：${e.message || e}`);
      throw e;
    }
  }

  async function remove(id) {
    const cur = _negativesStore.getList(key);
    const i = cur.findIndex((x) => x.id === id);
    const removed = i >= 0 ? cur[i] : null;
    if (i >= 0) _negativesStore.setList(key, cur.filter((x, idx) => idx !== i));
    try {
      await negativesApi.remove(id);
    } catch (e) {
      if (removed) {
        const after = _negativesStore.getList(key);
        after.splice(i, 0, removed);
        _negativesStore.setList(key, after);
      }
      ElMessage.error(`删除失败：${e.message || e}`);
    }
  }

  return { list, fetch, create, remove };
}

// ====== User Search Terms ======
const _userSearchTermsStore = makeKeyedStore();

export function useUserSearchTerms(campaignId = null) {
  const key = campaignId || 'all';
  const list = computed(() => _userSearchTermsStore.getList(key));

  async function fetch(force = false) {
    const params = campaignId ? { campaignId } : {};
    return _userSearchTermsStore.fetch(key, () => userSearchTermsApi.list(params), force);
  }

  async function promote(row, payload = {}) {
    try {
      await userSearchTermsApi.promote({ id: row.id, term: row.userQuery, ...payload });
      ElMessage.success(`已升手动：${row.userQuery}`);
    } catch (e) {
      ElMessage.error(`升手动失败：${e.message || e}`);
    }
  }

  async function negate(row, payload = {}) {
    try {
      await userSearchTermsApi.negate({ id: row.id, term: row.userQuery, ...payload });
      ElMessage.success(`已加否定：${row.userQuery}`);
    } catch (e) {
      ElMessage.error(`加否定失败：${e.message || e}`);
    }
  }

  return { list, fetch, promote, negate };
}

// ====== Operation Log ======
const _opLogStore = makeKeyedStore();

export function useOpLog(campaignId = null) {
  const key = campaignId || 'all';
  const list = computed(() => _opLogStore.getList(key));

  async function fetch(params = {}, force = false) {
    const merged = campaignId ? { campaignId, ...params } : params;
    return _opLogStore.fetch(key, () => opLogApi.list(merged), force);
  }

  return { list, fetch };
}

// ====== Daily Data ======
const _dailyStore = makeKeyedStore();

export function useDailyData(campaignId = null) {
  const key = campaignId || 'all';
  const list = computed(() => _dailyStore.getList(key));

  async function fetch(force = false) {
    const params = campaignId ? { campaignId } : {};
    return _dailyStore.fetch(key, () => dailyApi.list(params), force);
  }

  return { list, fetch };
}

// ====== Keyword Grabbing ======
const _kwGrabbingStore = makeKeyedStore();

export function useKwGrabbing(campaignId = null) {
  const key = campaignId || 'all';
  const list = computed(() => _kwGrabbingStore.getList(key));

  async function fetch(force = false) {
    const params = campaignId ? { campaignId } : {};
    return _kwGrabbingStore.fetch(key, () => kwGrabbingApi.list(params), force);
  }

  async function create(body) {
    const tmp = { ...body, id: `kw-g-tmp-${Date.now()}` };
    const arr = _kwGrabbingStore.getList(key);
    _kwGrabbingStore.setList(key, [tmp, ...arr]);
    try {
      const created = await kwGrabbingApi.create(body);
      if (created?.id) {
        const cur = _kwGrabbingStore.getList(key);
        const idx = cur.findIndex((x) => x.id === tmp.id);
        if (idx >= 0) {
          cur[idx] = created;
          _kwGrabbingStore.setList(key, cur);
        }
      }
      ElMessage.success('已添加抢位词');
      return created;
    } catch (e) {
      const cur = _kwGrabbingStore.getList(key);
      _kwGrabbingStore.setList(key, cur.filter((x) => x.id !== tmp.id));
      ElMessage.error(`添加失败：${e.message || e}`);
      throw e;
    }
  }

  async function applyBid(row) {
    const prev = row.currentBid;
    row.currentBid = row.suggestedBid;
    try {
      await kwGrabbingApi.applyBid(row.id);
      ElMessage.success('已应用建议 bid');
    } catch (e) {
      row.currentBid = prev;
      ElMessage.error(`应用失败：${e.message || e}`);
    }
  }

  async function update(row, patch) {
    const prev = { ...row };
    Object.assign(row, patch);
    try {
      const updated = await kwGrabbingApi.update(row.id, patch);
      if (updated) Object.assign(row, updated);
    } catch (e) {
      Object.assign(row, prev);
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  return { list, fetch, create, applyBid, update };
}

// ====== Placements ======
const _placementsStore = makeKeyedStore();

export function usePlacements(campaignId = null) {
  const key = campaignId || 'all';
  const list = computed(() => _placementsStore.getList(key));

  async function fetch(force = false) {
    const params = campaignId ? { campaignId } : {};
    return _placementsStore.fetch(key, () => placementsApi.list(params), force);
  }

  async function setBidAdj(row, bidAdj) {
    const prev = row.bidAdj;
    row.bidAdj = bidAdj;
    try {
      await placementsApi.update(row.id, { bidAdj });
      ElMessage.success(`已修改 ${row.placement} 竞价调整为 ${bidAdj}%`);
    } catch (e) {
      row.bidAdj = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
    }
  }

  return { list, fetch, setBidAdj };
}

// ====== AMC Audiences ======
const _amcAudiences = ref([]);
const _amcLoaded = ref(false);
let _amcPromise = null;

async function _fetchAmcAudiences(force = false) {
  if (_amcPromise) return _amcPromise;
  if (_amcLoaded.value && !force) return _amcAudiences.value;
  _amcPromise = amcApi
    .list()
    .then((items) => {
      _amcAudiences.value = Array.isArray(items) ? items : [];
      _amcLoaded.value = true;
      return _amcAudiences.value;
    })
    .catch((e) => {
      ElMessage.error(`加载 AMC 人群包失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _amcPromise = null;
    });
  return _amcPromise;
}

export function useAmcAudiences() {
  const list = _amcAudiences;
  return { list, loaded: _amcLoaded, fetch: _fetchAmcAudiences };
}
