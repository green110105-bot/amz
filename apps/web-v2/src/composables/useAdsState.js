// useAdsState.js — M3 策略库 / 建议流 / 外部更改 composables
//
// 模式：
//  - 每个 use* 函数返回模块作用域 reactive ref（单例）
//  - fetch 方法用 onMounted 拉数；错误统一 ElMessage.error
//  - mutation 方法乐观更新 + 失败回滚
//
// fallback：如后端不可用，调用方可继续以 ref 模式工作；UI 不应崩溃

import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { strategiesApi } from '../api/ads-strategies';
import { suggestionsApi, manualChangesApi } from '../api/ads-timeline';

// ===== Strategies (module-scope singletons) =====
const _strategies = ref([]);
const _strategiesLoaded = ref(false);
let _strategiesPromise = null;

async function _fetchStrategies(force = false) {
  if (_strategiesPromise) return _strategiesPromise;
  if (_strategiesLoaded.value && !force) return _strategies.value;
  _strategiesPromise = strategiesApi
    .list()
    .then((items) => {
      _strategies.value = Array.isArray(items) ? items : [];
      _strategiesLoaded.value = true;
      return _strategies.value;
    })
    .catch((e) => {
      ElMessage.error(`加载策略库失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _strategiesPromise = null;
    });
  return _strategiesPromise;
}

export function useStrategies() {
  const list = _strategies;

  const kpi = computed(() => {
    const arr = list.value || [];
    const valid = arr.filter((s) => s.successRate !== null && s.successRate !== undefined);
    return {
      total: arr.length,
      enabled: arr.filter((s) => s.enabled).length,
      paused: arr.filter((s) => !s.enabled).length,
      totalTriggered: arr.reduce((sum, s) => sum + (s.triggerCount || 0), 0),
      avgSuccessRate: valid.length
        ? valid.reduce((sum, s) => sum + s.successRate, 0) / valid.length
        : 0,
      crossModuleCount: arr.filter((s) => s.crossModule).length,
    };
  });

  async function toggle(s) {
    const prev = s.enabled;
    s.enabled = !prev;
    try {
      await strategiesApi.toggle(s.id, s.enabled);
      ElMessage.success(s.enabled ? `已启用：${s.name}` : `已暂停：${s.name}`);
    } catch (e) {
      s.enabled = prev; // 回滚
      ElMessage.error(`切换失败：${e.message || e}`);
    }
  }

  async function save(patch) {
    if (!patch?.id) {
      try {
        const created = await strategiesApi.create(patch);
        if (created?.id) list.value.unshift(created);
        ElMessage.success('已创建策略');
        return created;
      } catch (e) {
        ElMessage.error(`创建失败：${e.message || e}`);
        throw e;
      }
    }
    const i = list.value.findIndex((x) => x.id === patch.id);
    const prev = i >= 0 ? { ...list.value[i] } : null;
    if (i >= 0) list.value[i] = { ...list.value[i], ...patch };
    try {
      const updated = await strategiesApi.update(patch.id, patch);
      if (i >= 0 && updated) list.value[i] = updated;
      ElMessage.success('已保存');
      return updated;
    } catch (e) {
      if (i >= 0 && prev) list.value[i] = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
      throw e;
    }
  }

  async function remove(id) {
    const i = list.value.findIndex((x) => x.id === id);
    const removed = i >= 0 ? list.value.splice(i, 1)[0] : null;
    try {
      await strategiesApi.remove(id);
      ElMessage.success('已删除');
    } catch (e) {
      if (removed) list.value.splice(i, 0, removed);
      ElMessage.error(`删除失败：${e.message || e}`);
    }
  }

  async function bind(id, campaignIds) {
    try {
      const updated = await strategiesApi.bind(id, campaignIds);
      const i = list.value.findIndex((x) => x.id === id);
      if (i >= 0 && updated) list.value[i] = { ...list.value[i], ...updated };
      ElMessage.success(`已绑定 ${campaignIds.length} 个 Campaign`);
      return updated;
    } catch (e) {
      ElMessage.error(`绑定失败：${e.message || e}`);
      throw e;
    }
  }

  async function getBindings(id) {
    try {
      return await strategiesApi.getBindings(id);
    } catch (e) {
      console.warn('[strategies.getBindings]', e?.message);
      return [];
    }
  }

  function getById(id) {
    return list.value.find((s) => s.id === id);
  }

  return {
    list,
    kpi,
    loaded: _strategiesLoaded,
    fetch: _fetchStrategies,
    toggle,
    save,
    remove,
    bind,
    getBindings,
    getById,
  };
}

// ===== Suggestions =====
const _suggestions = ref([]);
const _suggestionsLoaded = ref(false);
let _suggestionsPromise = null;

async function _fetchSuggestions(force = false) {
  if (_suggestionsPromise) return _suggestionsPromise;
  if (_suggestionsLoaded.value && !force) return _suggestions.value;
  _suggestionsPromise = suggestionsApi
    .list()
    .then((items) => {
      _suggestions.value = Array.isArray(items) ? items : [];
      _suggestionsLoaded.value = true;
      return _suggestions.value;
    })
    .catch((e) => {
      ElMessage.error(`加载 AI 建议失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _suggestionsPromise = null;
    });
  return _suggestionsPromise;
}

export function useSuggestions() {
  const list = _suggestions;

  const kpi = computed(() => {
    const arr = list.value || [];
    return {
      pending: arr.filter((s) => s.state === 'pending').length,
      observing: arr.filter((s) => s.state === 'observing').length,
      accepted: arr.filter((s) => ['accepted', 'observing', 'succeeded'].includes(s.state)).length,
      rejected: arr.filter((s) => s.state === 'rejected').length,
    };
  });

  async function accept(s, payload = {}) {
    const prevState = s.state;
    const prevAcceptedAt = s.acceptedAt;
    s.state = 'observing';
    s.acceptedAt = new Date().toISOString();
    try {
      const updated = await suggestionsApi.accept(s.id, payload);
      if (updated) Object.assign(s, updated);
    } catch (e) {
      s.state = prevState;
      s.acceptedAt = prevAcceptedAt;
      ElMessage.error(`采纳失败：${e.message || e}`);
      throw e;
    }
  }

  async function reject(s, payload = {}) {
    const prevState = s.state;
    const prevRejectedAt = s.rejectedAt;
    const prevReason = s.rejectReason;
    s.state = 'rejected';
    s.rejectedAt = new Date().toISOString();
    s.rejectReason = payload?.reason || '用户手动忽略';
    try {
      const updated = await suggestionsApi.reject(s.id, payload);
      if (updated) Object.assign(s, updated);
    } catch (e) {
      s.state = prevState;
      s.rejectedAt = prevRejectedAt;
      s.rejectReason = prevReason;
      ElMessage.error(`忽略失败：${e.message || e}`);
    }
  }

  async function revert(s, payload = {}) {
    const prev = { state: s.state, acceptedAt: s.acceptedAt, rejectedAt: s.rejectedAt, rejectReason: s.rejectReason };
    s.state = 'pending';
    s.acceptedAt = null;
    s.rejectedAt = null;
    s.rejectReason = null;
    try {
      const updated = await suggestionsApi.revert(s.id, payload);
      if (updated) Object.assign(s, updated);
    } catch (e) {
      Object.assign(s, prev);
      ElMessage.error(`撤销失败：${e.message || e}`);
    }
  }

  return {
    list,
    kpi,
    loaded: _suggestionsLoaded,
    fetch: _fetchSuggestions,
    accept,
    reject,
    revert,
  };
}

// ===== Manual Changes =====
const _manualChanges = ref([]);
const _manualChangesLoaded = ref(false);
let _manualChangesPromise = null;

async function _fetchManualChanges(force = false) {
  if (_manualChangesPromise) return _manualChangesPromise;
  if (_manualChangesLoaded.value && !force) return _manualChanges.value;
  _manualChangesPromise = manualChangesApi
    .list()
    .then((items) => {
      _manualChanges.value = Array.isArray(items) ? items : [];
      _manualChangesLoaded.value = true;
      return _manualChanges.value;
    })
    .catch((e) => {
      ElMessage.error(`加载外部更改失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _manualChangesPromise = null;
    });
  return _manualChangesPromise;
}

export function useManualChanges() {
  const list = _manualChanges;

  async function applyAlternative(c, payload = {}) {
    const prev = { state: c.state, resolvedAt: c.resolvedAt, resolvedAction: c.resolvedAction };
    c.state = 'resolved';
    c.resolvedAt = new Date().toISOString();
    c.resolvedAction = 'accepted-alternative';
    try {
      const updated = await manualChangesApi.applyAlternative(c.id, payload);
      if (updated) Object.assign(c, updated);
    } catch (e) {
      Object.assign(c, prev);
      ElMessage.error(`采纳替代方案失败：${e.message || e}`);
    }
  }

  async function ignore(c, payload = {}) {
    const prev = { state: c.state, resolvedAt: c.resolvedAt, resolvedAction: c.resolvedAction };
    c.state = 'resolved';
    c.resolvedAt = new Date().toISOString();
    c.resolvedAction = 'ignored';
    try {
      const updated = await manualChangesApi.ignore(c.id, payload);
      if (updated) Object.assign(c, updated);
    } catch (e) {
      Object.assign(c, prev);
      ElMessage.error(`忽略失败：${e.message || e}`);
    }
  }

  return {
    list,
    loaded: _manualChangesLoaded,
    fetch: _fetchManualChanges,
    applyAlternative,
    ignore,
  };
}
