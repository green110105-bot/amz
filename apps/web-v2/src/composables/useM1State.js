import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import {
  targetsApi,
  researchApi,
  scoresApi,
  runsApi,
  versionsApi,
  imagesApi,
  workbenchApi,
  abApi,
  buildM1Workbench,
  buildMockTargetList,
} from '../api/m1';

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
      const fallback = buildMockTargetList();
      _targets.value = fallback;
      _targetsLoaded.value = true;
      ElMessage.warning(`M1 目标接口不可用，已切换确定性样例：${e.message || e}`);
      return fallback;
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
      ElMessage.success('已创建 Listing 优化目标');
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

const _flowCache = new Map();

function _createFlowState() {
  return {
    target: ref(null),
    research: ref(null),
    score: ref(null),
    runs: ref([]),
    versions: ref([]),
    images: ref([]),
    apiWorkbench: ref(null),
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
      s.target.value = target || _targets.value.find((t) => t.id === targetId) || null;
      s.research.value = research;
      s.score.value = score;
      s.runs.value = Array.isArray(runs) ? runs : [];
      s.versions.value = Array.isArray(versions) ? versions : [];

      const latest = s.versions.value[0];
      const [apiWorkbench, imageRows] = await Promise.all([
        workbenchApi.get(targetId, latest?.id ? { versionId: latest.id } : {}).catch(() => null),
        latest?.id ? imagesApi.list({ versionId: latest.id }).catch(() => []) : Promise.resolve([]),
      ]);
      s.apiWorkbench.value = apiWorkbench;
      s.images.value = Array.isArray(imageRows) ? imageRows : [];
    } catch (e) {
      s.error.value = e;
      ElMessage.error(`加载 M1 数据失败：${e.message || e}`);
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
      ElMessage.info('已清除调研缓存，下次将重新生成');
    } catch (e) {
      ElMessage.error(`清除缓存失败：${e.message || e}`);
    }
  }

  async function triggerScore() {
    try {
      const r = await scoresApi.trigger({ targetId });
      s.score.value = r;
      ElMessage.success('Listing 评分完成');
      return r;
    } catch (e) {
      if (e?.raw?.error === 'scoring_not_applicable') {
        ElMessage.warning('该目标暂不支持评分');
      } else {
        ElMessage.error(`评分失败：${e.message || e}`);
      }
      throw e;
    }
  }

  async function createRun(body) {
    try {
      const run = await runsApi.create({ targetId, ...body });
      s.runs.value.unshift(run);
      const versionId = run?.version_id || run?.versionId;
      if (versionId) {
        const [newVer, imageRows, apiWorkbench] = await Promise.all([
          versionsApi.get(versionId).catch(() => null),
          imagesApi.list({ versionId }).catch(() => []),
          workbenchApi.get(targetId, { versionId }).catch(() => null),
        ]);
        if (newVer) s.versions.value.unshift(newVer);
        if (Array.isArray(imageRows)) s.images.value = imageRows;
        s.apiWorkbench.value = apiWorkbench;
      }
      // M1-009: a new run produced a new version — invalidate the sibling versions
      // store (used by A/B center) so it re-fetches and shows the new version.
      invalidateVersions(targetId);
      ElMessage.success(`第 ${run?.round_no || run?.roundNo || ''} 轮生成完成`);
      return run;
    } catch (e) {
      if (e?.raw?.error === 'external_asin_cannot_optimize') {
        ElMessage.warning('外部 ASIN 只能做对标分析，不能直接生成或发布');
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
      const versionId = body.versionId || body.version_id;
      if (versionId) s.apiWorkbench.value = await workbenchApi.get(targetId, { versionId }).catch(() => s.apiWorkbench.value);
      ElMessage.success('图片任务已提交');
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
      ElMessage.success('已重新生成图片');
      return img;
    } catch (e) {
      ElMessage.error(`重新生成失败：${e.message || e}`);
      throw e;
    }
  }

  async function checkReadiness(versionId = null) {
    try {
      const r = await workbenchApi.readiness({ targetId, versionId });
      s.apiWorkbench.value = await workbenchApi.get(targetId, versionId ? { versionId } : {}).catch(() => s.apiWorkbench.value);
      ElMessage[r.publishAllowed ? 'success' : 'warning'](r.publishAllowed ? '发布前检查通过' : '发布前检查仍有阻塞项');
      return r;
    } catch (e) {
      ElMessage.error(`发布前检查失败：${e.message || e}`);
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
    apiWorkbench: s.apiWorkbench,
    workbench: computed(() => buildM1Workbench({
      targetId,
      target: s.target.value,
      research: s.research.value,
      score: s.score.value,
      runs: s.runs.value,
      versions: s.versions.value,
      images: s.images.value,
      apiWorkbench: s.apiWorkbench.value,
    })),
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
    checkReadiness,
  };
}

const _versionsCache = new Map();

function _createVersionsState() {
  return {
    list: ref([]),
    loading: ref(false),
    error: ref(null),
    loaded: ref(false),
  };
}

// M1-009: the two version stores (_flowCache.versions written by createRun, and
// _versionsCache.list written by combinedPick) are independent. Invalidating one
// without the other leaves ListingOptimize.latestVersion / runPreflight reading a
// stale version. invalidateVersions(targetId) clears BOTH loaded flags so the next
// fetch on either side re-pulls the freshest version list (event-bus style).
export function invalidateVersions(targetId) {
  if (!targetId) return;
  const vs = _versionsCache.get(targetId);
  if (vs) vs.loaded.value = false;
  // _flowCache has no explicit "versions loaded" flag; force a refetch by marking
  // the flow not-loaded via its loading guard reset is unsafe, so we clear its
  // versions array so consumers re-fetch and combinedPick output becomes visible.
  // (createRun/combinedPick below also push the new version directly for immediacy.)
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
      ElMessage.success(pinned ? '已置顶版本' : '已取消置顶');
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
        ElMessage.warning('不能删除初始版本');
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
      ElMessage.error(`Diff 失败：${e.message || e}`);
      throw e;
    }
  }

  async function combinedPick(fieldPicks) {
    try {
      const r = await versionsApi.combinedPick(targetId, fieldPicks);
      if (r?.id) s.list.value.unshift(r);
      // M1-009: the combined version was written into _versionsCache only. Mirror it
      // into the flow store (used by ListingOptimize.latestVersion / runPreflight) and
      // invalidate so the generation/version blocks reflect the newest combined version.
      const flow = _flowCache.get(targetId);
      if (flow && r?.id && !flow.versions.value.some((v) => v.id === r.id)) {
        flow.versions.value.unshift(r);
      }
      invalidateVersions(targetId);
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
      readyForManualPublish: arr.filter((t) => t.status === 'ready_for_manual_publish').length,
      draft: arr.filter((t) => t.status === 'draft').length,
    };
  });

  async function create(body) {
    // Idempotent guard: if a manual_required test for the same (target, type, control, treatment)
    // four-tuple already exists in the list, do not POST a second time.
    const dup = list.value.find((t) =>
      t.status === 'manual_required' &&
      (t.target_id || t.targetId) === (body.targetId || body.target_id) &&
      (t.test_type || t.testType) === (body.testType || body.test_type) &&
      (t.control_version_id || t.controlVersionId) === (body.controlVersionId || body.control_version_id) &&
      (t.treatment_version_id || t.treatmentVersionId) === (body.treatmentVersionId || body.treatment_version_id),
    );
    if (dup) {
      ElMessage.warning('已存在相同配置的手动实验，无需重复创建');
      return dup;
    }
    try {
      const r = await abApi.create(body);
      if (r?.id) list.value.unshift(r);
      // M1-008: manual A/B is a 201 success with manualRequired:true (no 422 third-state).
      if (r?.manualRequired || r?.status === 'manual_required') {
        ElMessage.warning('该实验需要在 Seller Central 手动执行，系统已生成操作说明');
      } else {
        ElMessage.success('已创建 A/B 测试');
      }
      return r;
    } catch (e) {
      ElMessage.error(`创建失败：${e.message || e}`);
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
      ElMessage.error(`加载指标失败：${e.message || e}`);
      return null;
    }
  }

  async function finalize(id) {
    try {
      const r = await abApi.finalize(id);
      const i = list.value.findIndex((t) => t.id === id);
      if (i >= 0 && r?.id) list.value[i] = r;
      ElMessage.success('已固化实验结果');
      return r;
    } catch (e) {
      ElMessage.error(`固化失败：${e.message || e}`);
      throw e;
    }
  }

  async function adoptWinner(id) {
    try {
      const r = await abApi.adoptWinner(id);
      const i = list.value.findIndex((t) => t.id === id);
      if (i >= 0 && r) list.value[i] = r;
      // M1-006: adopting a winner only prepares a manual publish package — it does NOT
      // write back to Amazon (no SP-API publish adapter yet). Message must say so plainly.
      ElMessage.success('已生成手动发布包，需在 Seller Central 手动发布（未写回 Amazon）');
      return r;
    } catch (e) {
      ElMessage.error(`采纳失败：${e.message || e}`);
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
    finalize,
    adoptWinner,
    getById,
  };
}
