// useM1State.js — M1 商品 Listing 优化模块 composables
//
// 模式（参考 useAdsState.js）：
//  - 模块作用域 ref + 单飞 promise + 乐观更新
//  - 每个 use* 暴露 { list/data/..., loading, error, fetch, mutations }
//  - mutations 乐观更新 + 失败回滚

import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import {
  targetsApi,
  researchApi,
  scoresApi,
  runsApi,
  versionsApi,
  imagesApi,
  abApi,
} from '../api/m1';

// ============================================================================
// useTargets — 优化目标列表 (Flow 1)
// ============================================================================
const _targets = ref([]);
const _targetsLoaded = ref(false);
const _targetsLoading = ref(false);
const _targetsError = ref(null);
let _targetsPromise = null;

async function _fetchTargets(params = {}, force = false) {
  if (_targetsPromise) return _targetsPromise;
  if (_targetsLoaded.value && !force && !Object.keys(params).length) return _targets.value;
  _targetsLoading.value = true;
  _targetsError.value = null;
  _targetsPromise = targetsApi
    .list(params)
    .then((items) => {
      _targets.value = Array.isArray(items) ? items : [];
      _targetsLoaded.value = true;
      return _targets.value;
    })
    .catch((e) => {
      _targetsError.value = e;
      ElMessage.error(`加载优化目标失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _targetsLoading.value = false;
      _targetsPromise = null;
    });
  return _targetsPromise;
}

export function useTargets() {
  const list = _targets;

  const kpi = computed(() => {
    const arr = list.value || [];
    return {
      total: arr.length,
      existing: arr.filter((t) => t.mode === 'existing').length,
      asinInput: arr.filter((t) => t.mode === 'asin_input').length,
      newListing: arr.filter((t) => t.mode === 'new_listing').length,
      competitorOnly: arr.filter((t) => t.is_competitor_only || t.isCompetitorOnly).length,
    };
  });

  async function create(body) {
    try {
      const created = await targetsApi.create(body);
      if (created?.id) list.value.unshift(created);
      ElMessage.success('已创建优化目标');
      return created;
    } catch (e) {
      ElMessage.error(`创建失败：${e.message || e}`);
      throw e;
    }
  }

  async function update(id, patch) {
    const i = list.value.findIndex((t) => t.id === id);
    const prev = i >= 0 ? { ...list.value[i] } : null;
    if (i >= 0) list.value[i] = { ...list.value[i], ...patch };
    try {
      const updated = await targetsApi.update(id, patch);
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
    const i = list.value.findIndex((t) => t.id === id);
    const removed = i >= 0 ? list.value.splice(i, 1)[0] : null;
    try {
      await targetsApi.remove(id);
      ElMessage.success('已删除');
    } catch (e) {
      if (removed) list.value.splice(i, 0, removed);
      ElMessage.error(`删除失败：${e.message || e}`);
      throw e;
    }
  }

  function getById(id) {
    return list.value.find((t) => t.id === id);
  }

  return {
    list,
    kpi,
    loaded: _targetsLoaded,
    loading: _targetsLoading,
    error: _targetsError,
    fetch: _fetchTargets,
    create,
    update,
    remove,
    getById,
  };
}

// ============================================================================
// useTargetFlow(targetId) — 单 target 全部相关数据 (Flow 2 核心)
// ============================================================================
// 用 Map 缓存 targetId → reactive state；避免每次 useTargetFlow(id) 重建
const _flowCache = new Map();

function _createFlowState() {
  return {
    target: ref(null),
    research: ref(null),
    score: ref(null),
    runs: ref([]),
    versions: ref([]),
    images: ref([]),
    loading: ref(false),
    error: ref(null),
  };
}

export function useTargetFlow(targetId) {
  if (!_flowCache.has(targetId)) {
    _flowCache.set(targetId, _createFlowState());
  }
  const s = _flowCache.get(targetId);

  async function fetch(force = false) {
    if (s.loading.value && !force) return;
    s.loading.value = true;
    s.error.value = null;
    try {
      const [target, research, score, runs, versions] = await Promise.all([
        targetsApi.get(targetId).catch(() => null),
        researchApi.get(targetId).catch(() => null),
        scoresApi.get(targetId).catch(() => null),
        runsApi.list({ targetId }).catch(() => []),
        versionsApi.list({ targetId }).catch(() => []),
      ]);
      s.target.value = target;
      s.research.value = research;
      s.score.value = score;
      s.runs.value = Array.isArray(runs) ? runs : [];
      s.versions.value = Array.isArray(versions) ? versions : [];
      // 拉取最新 version 的图片
      const latest = s.versions.value[0];
      if (latest?.id) {
        const images = await imagesApi.list({ versionId: latest.id }).catch(() => []);
        s.images.value = Array.isArray(images) ? images : [];
      } else {
        s.images.value = [];
      }
    } catch (e) {
      s.error.value = e;
      ElMessage.error(`加载优化数据失败：${e.message || e}`);
    } finally {
      s.loading.value = false;
    }
  }

  async function triggerResearch(competitorAsins = []) {
    try {
      const r = await researchApi.trigger({ targetId, competitorAsins });
      s.research.value = r;
      ElMessage.success('调研报告已生成');
      return r;
    } catch (e) {
      ElMessage.error(`调研失败：${e.message || e}`);
      throw e;
    }
  }

  async function clearResearchCache() {
    try {
      await researchApi.clearCache(targetId);
      s.research.value = null;
      ElMessage.info('已清除调研缓存，将下次重新生成');
    } catch (e) {
      ElMessage.error(`清缓存失败：${e.message || e}`);
    }
  }

  async function triggerScore() {
    try {
      const r = await scoresApi.trigger({ targetId });
      s.score.value = r;
      ElMessage.success('打分完成');
      return r;
    } catch (e) {
      if (e?.raw?.error === 'scoring_not_applicable') {
        ElMessage.warning('该 Mode 不支持打分');
      } else {
        ElMessage.error(`打分失败：${e.message || e}`);
      }
      throw e;
    }
  }

  async function createRun(body) {
    try {
      const run = await runsApi.create({ targetId, ...body });
      s.runs.value.unshift(run);
      // 新轮可能产出新 version
      if (run?.version_id || run?.versionId) {
        const newVer = await versionsApi.get(run.version_id || run.versionId).catch(() => null);
        if (newVer) s.versions.value.unshift(newVer);
        const images = await imagesApi.list({ versionId: run.version_id || run.versionId }).catch(() => []);
        if (Array.isArray(images)) s.images.value = images;
      }
      ElMessage.success(`第 ${run?.round_no || run?.roundNo || ''} 轮生成完成`);
      return run;
    } catch (e) {
      if (e?.raw?.error === 'external_asin_cannot_optimize') {
        ElMessage.warning('外部 ASIN 仅作对标，不能直接生成优化');
      } else {
        ElMessage.error(`生成失败：${e.message || e}`);
      }
      throw e;
    }
  }

  async function rewriteField(runId, field, feedback = '') {
    try {
      const updated = await runsApi.rewriteField(runId, { field, feedback });
      ElMessage.success(`已重写 ${field}`);
      // 刷新当前 run + 最新 version
      const i = s.runs.value.findIndex((r) => r.id === runId);
      if (i >= 0 && updated) s.runs.value[i] = updated;
      return updated;
    } catch (e) {
      ElMessage.error(`重写失败：${e.message || e}`);
      throw e;
    }
  }

  async function generateImage(body) {
    try {
      const img = await imagesApi.generate({ targetId, ...body });
      if (img?.id) s.images.value.unshift(img);
      ElMessage.success('图片生成中…');
      return img;
    } catch (e) {
      ElMessage.error(`图片生成失败：${e.message || e}`);
      throw e;
    }
  }

  async function regenerateImage(id, body = {}) {
    try {
      const img = await imagesApi.regenerate(id, body);
      const i = s.images.value.findIndex((x) => x.id === id);
      if (i >= 0 && img) s.images.value[i] = img;
      ElMessage.success('已重新生成');
      return img;
    } catch (e) {
      ElMessage.error(`重新生成失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    target: s.target,
    research: s.research,
    score: s.score,
    runs: s.runs,
    versions: s.versions,
    images: s.images,
    loading: s.loading,
    error: s.error,
    fetch,
    triggerResearch,
    clearResearchCache,
    triggerScore,
    createRun,
    rewriteField,
    generateImage,
    regenerateImage,
  };
}

// ============================================================================
// useVersions(targetId) — 版本管理 + diff + pin + combined-pick
// ============================================================================
const _versionsCache = new Map();

function _createVersionsState() {
  return {
    list: ref([]),
    loading: ref(false),
    error: ref(null),
    loaded: ref(false),
  };
}

export function useVersions(targetId) {
  if (!_versionsCache.has(targetId)) {
    _versionsCache.set(targetId, _createVersionsState());
  }
  const s = _versionsCache.get(targetId);

  async function fetch(force = false, includeArchived = false) {
    if (s.loaded.value && !force) return s.list.value;
    s.loading.value = true;
    s.error.value = null;
    try {
      const items = await versionsApi.list({ targetId, includeArchived });
      s.list.value = Array.isArray(items) ? items : [];
      s.loaded.value = true;
      return s.list.value;
    } catch (e) {
      s.error.value = e;
      ElMessage.error(`加载版本失败：${e.message || e}`);
      return [];
    } finally {
      s.loading.value = false;
    }
  }

  async function pin(id, pinned) {
    const i = s.list.value.findIndex((v) => v.id === id);
    const prev = i >= 0 ? s.list.value[i].is_pinned ?? s.list.value[i].isPinned : null;
    if (i >= 0) {
      s.list.value[i].is_pinned = pinned ? 1 : 0;
      s.list.value[i].isPinned = pinned;
    }
    try {
      const updated = await versionsApi.pin(id, pinned);
      if (i >= 0 && updated) s.list.value[i] = updated;
      ElMessage.success(pinned ? '已置顶' : '已取消置顶');
    } catch (e) {
      if (i >= 0) {
        s.list.value[i].is_pinned = prev;
        s.list.value[i].isPinned = !!prev;
      }
      ElMessage.error(`操作失败：${e.message || e}`);
      throw e;
    }
  }

  async function remove(id) {
    const i = s.list.value.findIndex((v) => v.id === id);
    const removed = i >= 0 ? s.list.value.splice(i, 1)[0] : null;
    try {
      await versionsApi.remove(id);
      ElMessage.success('已删除版本');
    } catch (e) {
      if (removed) s.list.value.splice(i, 0, removed);
      if (e?.raw?.error === 'cannot_delete_baseline') {
        ElMessage.warning('不能删除初始版本（round_no=1）');
      } else {
        ElMessage.error(`删除失败：${e.message || e}`);
      }
      throw e;
    }
  }

  async function diff(versionAId, versionBId) {
    try {
      return await versionsApi.diff(versionAId, versionBId);
    } catch (e) {
      ElMessage.error(`diff 失败：${e.message || e}`);
      throw e;
    }
  }

  async function combinedPick(fieldPicks) {
    try {
      const r = await versionsApi.combinedPick(targetId, fieldPicks);
      if (r?.id) s.list.value.unshift(r);
      ElMessage.success('已生成组合版本');
      return r;
    } catch (e) {
      ElMessage.error(`组合失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: s.list,
    loading: s.loading,
    error: s.error,
    loaded: s.loaded,
    fetch,
    pin,
    remove,
    diff,
    combinedPick,
  };
}

// ============================================================================
// useAbTests — A/B 测试列表 + create/start/metrics/adoptWinner (Flow 3)
// ============================================================================
const _abList = ref([]);
const _abLoaded = ref(false);
const _abLoading = ref(false);
const _abError = ref(null);
let _abPromise = null;

async function _fetchAb(params = {}, force = false) {
  if (_abPromise) return _abPromise;
  if (_abLoaded.value && !force && !Object.keys(params).length) return _abList.value;
  _abLoading.value = true;
  _abError.value = null;
  _abPromise = abApi
    .list(params)
    .then((items) => {
      _abList.value = Array.isArray(items) ? items : [];
      _abLoaded.value = true;
      return _abList.value;
    })
    .catch((e) => {
      _abError.value = e;
      ElMessage.error(`加载 A/B 测试失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _abLoading.value = false;
      _abPromise = null;
    });
  return _abPromise;
}

export function useAbTests() {
  const list = _abList;

  const kpi = computed(() => {
    const arr = list.value || [];
    return {
      total: arr.length,
      running: arr.filter((t) => t.status === 'running').length,
      completed: arr.filter((t) => t.status === 'completed').length,
      manualRequired: arr.filter((t) => t.status === 'manual_required').length,
      draft: arr.filter((t) => t.status === 'draft').length,
    };
  });

  async function create(body) {
    try {
      const r = await abApi.create(body);
      if (r?.id) list.value.unshift(r);
      if (r?.status === 'manual_required') {
        ElMessage.warning('该测试类型需手动执行，已生成 manual guidance');
      } else {
        ElMessage.success('已创建 A/B 测试');
      }
      return r;
    } catch (e) {
      if (e?.raw?.error === 'manual_required') {
        ElMessage.warning('该测试类型需手动执行');
      } else {
        ElMessage.error(`创建失败：${e.message || e}`);
      }
      throw e;
    }
  }

  async function start(id) {
    const i = list.value.findIndex((t) => t.id === id);
    const prev = i >= 0 ? list.value[i].status : null;
    if (i >= 0) list.value[i].status = 'running';
    try {
      const r = await abApi.start(id);
      if (i >= 0 && r) list.value[i] = r;
      ElMessage.success('已启动');
    } catch (e) {
      if (i >= 0 && prev) list.value[i].status = prev;
      ElMessage.error(`启动失败：${e.message || e}`);
      throw e;
    }
  }

  async function abort(id) {
    const i = list.value.findIndex((t) => t.id === id);
    const prev = i >= 0 ? list.value[i].status : null;
    if (i >= 0) list.value[i].status = 'aborted';
    try {
      const r = await abApi.abort(id);
      if (i >= 0 && r) list.value[i] = r;
      ElMessage.info('已中止');
    } catch (e) {
      if (i >= 0 && prev) list.value[i].status = prev;
      ElMessage.error(`中止失败：${e.message || e}`);
      throw e;
    }
  }

  async function metrics(id) {
    try {
      return await abApi.metrics(id);
    } catch (e) {
      ElMessage.error(`加载 metrics 失败：${e.message || e}`);
      return null;
    }
  }

  async function adoptWinner(id) {
    try {
      const r = await abApi.adoptWinner(id);
      const i = list.value.findIndex((t) => t.id === id);
      if (i >= 0 && r) list.value[i] = r;
      ElMessage.success('已采用 Winner');
      return r;
    } catch (e) {
      ElMessage.error(`采用 Winner 失败：${e.message || e}`);
      throw e;
    }
  }

  function getById(id) {
    return list.value.find((t) => t.id === id);
  }

  return {
    list,
    kpi,
    loaded: _abLoaded,
    loading: _abLoading,
    error: _abError,
    fetch: _fetchAb,
    create,
    start,
    abort,
    metrics,
    adoptWinner,
    getById,
  };
}
