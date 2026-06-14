// useM4State.js — M4 监控/评价/申诉/恢复/跟卖/侵权/竞品/通知 composables
//
// 模式（参考 useM1State.js / useAdsState.js）：
//  - 模块作用域 ref + 单飞 promise + 乐观更新
//  - 每个 use* 暴露 { list/data/..., loading, error, fetch, mutations }
//  - mutations 乐观更新 + 失败回滚 / 接 404 时回落空列表
//  - 状态机 transition 辅助函数：canAppealTransition / canRecoveryTransition

import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
// Transition helpers used in-file (useAppeals / useRecovery). Re-exported below for
// existing external import sites; imported here so the local references resolve.
import {
  canAppealTransition,
  allowedAppealActions,
  canRecoveryTransition,
  allowedRecoveryActions,
} from './m4-transitions.js';
import {
  anomaliesApi,
  slaApi,
  resolutionApi,
  postmortemsApi,
  hijackingApi,
  infringementApi,
  reviewsApi,
  appealsApi,
  recoveryApi,
  competitorsApi,
  imageDiffsApi,
  brandDefenseApi,
} from '../api/m4';

// ============================================================================
// 通用 helper: 静默回落（后端 endpoint 404 时返回空数组 / 空对象不报错）
// ============================================================================
function silent(promiseFn, fallback) {
  return promiseFn().catch((e) => {
    if (e?.status === 404 || /not_found|Network Error/i.test(e?.message || '')) {
      return fallback;
    }
    throw e;
  });
}

// ============================================================================
// 状态机辅助 — transition maps + helpers live in a dependency-free module so they are
// unit-testable in plain node (node --test) without pulling in the axios/element-plus
// chain. Re-exported here so existing import sites keep working.
// ============================================================================
// canAppealTransition / allowedAppealActions / canRecoveryTransition /
// allowedRecoveryActions are imported above (used in-file) and re-exported here as local
// bindings; the rest are pure re-exports.
export {
  canAppealTransition,
  allowedAppealActions,
  canRecoveryTransition,
  allowedRecoveryActions,
};
export {
  APPEAL_TRANSITIONS,
  RECOVERY_TRANSITIONS,
  ANOMALY_TRANSITIONS,
  canAnomalyTransition,
  allowedAnomalyActions,
  HIJACKING_TRANSITIONS,
  canHijackingTransition,
  INFRINGEMENT_TRANSITIONS,
  canInfringementTransition,
} from './m4-transitions.js';

// ============================================================================
// 1. useAnomalies — 异常事件列表 + actions
// ============================================================================
const _anomList = ref([]);
const _anomSummary = ref({ totalOpen: 0, p0: 0, p1: 0, p2: 0, breached: 0 });
const _anomLoaded = ref(false);
const _anomLoading = ref(false);
const _anomError = ref(null);
let _anomPromise = null;
// M4-P3-01: the single-flight key carries a stable signature of the params, so a request
// for a different filter (e.g. a new assignee) is NOT deduped onto an in-flight request
// for the old filter. _anomSeq guards against an older response clobbering a newer one.
let _anomPromiseKey = null;
let _anomSeq = 0;

function _paramsKey(params = {}) {
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${k}=${params[k]}`).join('&');
}

async function _fetchAnomalies(params = {}, force = false) {
  const key = _paramsKey(params);
  // Only dedupe when an identical-params request is already in flight.
  if (_anomPromise && _anomPromiseKey === key) return _anomPromise;
  if (_anomLoaded.value && !force && !Object.keys(params).length) return _anomList.value;
  const seq = ++_anomSeq;
  _anomLoading.value = true;
  _anomError.value = null;
  _anomPromiseKey = key;
  _anomPromise = silent(() => anomaliesApi.list(params), { items: [], summary: {} })
    .then((data) => {
      // Drop the result if a newer request has been issued since (avoids stale overwrite).
      if (seq !== _anomSeq) return _anomList.value;
      _anomList.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      if (data?.summary) _anomSummary.value = { ..._anomSummary.value, ...data.summary };
      _anomLoaded.value = true;
      return _anomList.value;
    })
    .catch((e) => {
      if (seq !== _anomSeq) return _anomList.value;
      _anomError.value = e;
      ElMessage.error(`加载异常列表失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      // Only clear the in-flight latch for the latest request.
      if (seq === _anomSeq) {
        _anomLoading.value = false;
        _anomPromise = null;
        _anomPromiseKey = null;
      }
    });
  return _anomPromise;
}

export function useAnomalies() {
  async function refresh(params = {}) { return _fetchAnomalies(params, true); }

  async function assign(id, body) {
    try {
      const updated = await anomaliesApi.assign(id, body);
      _patch(_anomList, id, updated);
      ElMessage.success('已分派');
      return updated;
    } catch (e) { _err(e, '分派失败'); throw e; }
  }
  async function acknowledge(id) {
    try {
      const updated = await anomaliesApi.acknowledge(id);
      _patch(_anomList, id, updated);
      ElMessage.success('已确认');
      return updated;
    } catch (e) { _err(e, '确认失败'); throw e; }
  }
  async function resolve(id, body = {}) {
    try {
      const updated = await anomaliesApi.resolve(id, body);
      _patch(_anomList, id, updated);
      ElMessage.success('已解决');
      return updated;
    } catch (e) { _err(e, '解决失败'); throw e; }
  }
  async function dismiss(id, body) {
    try {
      const updated = await anomaliesApi.dismiss(id, body);
      _patch(_anomList, id, updated);
      ElMessage.success('已忽略');
      return updated;
    } catch (e) { _err(e, '忽略失败'); throw e; }
  }
  async function escalate(id, body) {
    try {
      const updated = await anomaliesApi.escalate(id, body);
      _patch(_anomList, id, updated);
      ElMessage.success('已升级');
      return updated;
    } catch (e) { _err(e, '升级失败'); throw e; }
  }
  async function create(body) {
    try {
      const created = await anomaliesApi.create(body);
      if (created?.id) _anomList.value.unshift(created);
      ElMessage.success('已创建异常');
      return created;
    } catch (e) { _err(e, '创建失败'); throw e; }
  }
  async function getDetail(id) {
    try { return await anomaliesApi.get(id); } catch (e) { _err(e, '加载详情失败'); return null; }
  }

  return {
    list: _anomList,
    summary: _anomSummary,
    loaded: _anomLoaded,
    loading: _anomLoading,
    error: _anomError,
    fetch: _fetchAnomalies,
    refresh,
    assign,
    acknowledge,
    resolve,
    dismiss,
    escalate,
    create,
    getDetail,
  };
}

// ============================================================================
// 2. useSLABoard — SLA 看板（range / events）
// ============================================================================
const _slaBoard = ref(null);
const _slaLoading = ref(false);
const _slaError = ref(null);
let _slaPromise = null;

async function _fetchSLABoard(range = 'today', force = false) {
  if (_slaPromise) return _slaPromise;
  if (_slaBoard.value && !force && _slaBoard.value._range === range) return _slaBoard.value;
  _slaLoading.value = true;
  _slaError.value = null;
  _slaPromise = silent(() => slaApi.board(range), null)
    .then((data) => {
      if (data) data._range = range;
      _slaBoard.value = data || { todayStats: {}, team: [] };
      return _slaBoard.value;
    })
    .catch((e) => {
      _slaError.value = e;
      ElMessage.error(`加载 SLA 看板失败：${e.message || e}`);
      _slaBoard.value = { todayStats: {}, team: [] };
      return _slaBoard.value;
    })
    .finally(() => {
      _slaLoading.value = false;
      _slaPromise = null;
    });
  return _slaPromise;
}

export function useSLABoard() {
  async function loadEvents(anomalyId) {
    try { return await slaApi.events(anomalyId); } catch (e) { _err(e, '加载 SLA 事件失败'); return []; }
  }
  return {
    board: _slaBoard,
    loading: _slaLoading,
    error: _slaError,
    fetch: _fetchSLABoard,
    loadEvents,
  };
}

// ============================================================================
// 3. useResolutionCases — 处置案例库
// ============================================================================
const _caseList = ref([]);
const _caseLoaded = ref(false);
const _caseLoading = ref(false);
const _caseError = ref(null);
let _casePromise = null;

async function _fetchCases(params = {}, force = false) {
  if (_casePromise) return _casePromise;
  if (_caseLoaded.value && !force && !Object.keys(params).length) return _caseList.value;
  _caseLoading.value = true;
  _caseError.value = null;
  _casePromise = silent(() => resolutionApi.list(params), [])
    .then((items) => {
      _caseList.value = Array.isArray(items) ? items : [];
      _caseLoaded.value = true;
      return _caseList.value;
    })
    .catch((e) => {
      _caseError.value = e;
      ElMessage.error(`加载案例失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _caseLoading.value = false;
      _casePromise = null;
    });
  return _casePromise;
}

export function useResolutionCases() {
  async function create(body) {
    try {
      const created = await resolutionApi.create(body);
      if (created?.id) _caseList.value.unshift(created);
      ElMessage.success('已创建案例');
      return created;
    } catch (e) { _err(e, '创建案例失败'); throw e; }
  }
  async function update(id, patch) {
    try {
      const updated = await resolutionApi.update(id, patch);
      _patch(_caseList, id, updated);
      ElMessage.success('已保存');
      return updated;
    } catch (e) { _err(e, '保存失败'); throw e; }
  }
  async function recommend(anomalyId) {
    try { return await resolutionApi.recommend(anomalyId); } catch (e) { _err(e, '推荐失败'); return []; }
  }
  return {
    list: _caseList,
    loaded: _caseLoaded,
    loading: _caseLoading,
    error: _caseError,
    fetch: _fetchCases,
    create,
    update,
    recommend,
  };
}

// ============================================================================
// 4. usePostmortems — 复盘报告
// ============================================================================
const _pmList = ref([]);
const _pmLoaded = ref(false);
const _pmLoading = ref(false);
const _pmError = ref(null);
let _pmPromise = null;

async function _fetchPostmortems(params = {}, force = false) {
  if (_pmPromise) return _pmPromise;
  if (_pmLoaded.value && !force && !Object.keys(params).length) return _pmList.value;
  _pmLoading.value = true;
  _pmError.value = null;
  _pmPromise = silent(() => postmortemsApi.list(params), [])
    .then((items) => {
      _pmList.value = Array.isArray(items) ? items : [];
      _pmLoaded.value = true;
      return _pmList.value;
    })
    .catch((e) => {
      _pmError.value = e;
      ElMessage.error(`加载复盘失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _pmLoading.value = false;
      _pmPromise = null;
    });
  return _pmPromise;
}

export function usePostmortems() {
  async function generate(body) {
    try {
      const created = await postmortemsApi.generate(body);
      if (created?.id) _pmList.value.unshift(created);
      ElMessage.success('已生成复盘');
      return created;
    } catch (e) { _err(e, '生成复盘失败'); throw e; }
  }
  async function update(id, patch) {
    try {
      const updated = await postmortemsApi.update(id, patch);
      _patch(_pmList, id, updated);
      ElMessage.success('已保存');
      return updated;
    } catch (e) { _err(e, '保存失败'); throw e; }
  }
  return {
    list: _pmList,
    loaded: _pmLoaded,
    loading: _pmLoading,
    error: _pmError,
    fetch: _fetchPostmortems,
    generate,
    update,
  };
}

// ============================================================================
// 5. useHijacking — 跟卖处置
// ============================================================================
const _hjList = ref([]);
const _hjLoaded = ref(false);
const _hjLoading = ref(false);
const _hjError = ref(null);
let _hjPromise = null;

async function _fetchHijacking(params = {}, force = false) {
  if (_hjPromise) return _hjPromise;
  if (_hjLoaded.value && !force && !Object.keys(params).length) return _hjList.value;
  _hjLoading.value = true;
  _hjError.value = null;
  _hjPromise = silent(() => hijackingApi.list(params), [])
    .then((items) => {
      _hjList.value = Array.isArray(items) ? items : [];
      _hjLoaded.value = true;
      return _hjList.value;
    })
    .catch((e) => {
      _hjError.value = e;
      ElMessage.error(`加载跟卖失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _hjLoading.value = false;
      _hjPromise = null;
    });
  return _hjPromise;
}

export function useHijacking() {
  async function scan(body = {}) {
    try {
      const r = await hijackingApi.scan(body);
      ElMessage.success(`扫描完成，新增 ${r?.added ?? 0} 条`);
      await _fetchHijacking({}, true);
      return r;
    } catch (e) { _err(e, '扫描失败'); throw e; }
  }
  async function startTestBuy(id, body = {}) {
    try {
      const updated = await hijackingApi.startTestBuy(id, body);
      _patch(_hjList, id, updated);
      ElMessage.success('已开始 Test Buy');
      return updated;
    } catch (e) { _err(e, '操作失败'); throw e; }
  }
  async function uploadProof(id, body) {
    try {
      const updated = await hijackingApi.uploadProof(id, body);
      _patch(_hjList, id, updated);
      ElMessage.success('开箱照已记录');
      return updated;
    } catch (e) { _err(e, '上传失败'); throw e; }
  }
  async function submitAppeal(id, body) {
    try {
      const updated = await hijackingApi.submitAppeal(id, body);
      _patch(_hjList, id, updated);
      ElMessage.success('已提交申诉');
      return updated;
    } catch (e) { _err(e, '提交失败'); throw e; }
  }
  async function close(id, body) {
    try {
      const updated = await hijackingApi.close(id, body);
      _patch(_hjList, id, updated);
      ElMessage.success('已关闭');
      return updated;
    } catch (e) { _err(e, '关闭失败'); throw e; }
  }
  return {
    list: _hjList,
    loaded: _hjLoaded,
    loading: _hjLoading,
    error: _hjError,
    fetch: _fetchHijacking,
    scan,
    startTestBuy,
    uploadProof,
    submitAppeal,
    close,
  };
}

// ============================================================================
// 6. useInfringement — 侵权告警
// ============================================================================
const _infList = ref([]);
const _infLoaded = ref(false);
const _infLoading = ref(false);
const _infError = ref(null);
let _infPromise = null;

async function _fetchInfringement(params = {}, force = false) {
  if (_infPromise) return _infPromise;
  if (_infLoaded.value && !force && !Object.keys(params).length) return _infList.value;
  _infLoading.value = true;
  _infError.value = null;
  _infPromise = silent(() => infringementApi.list(params), [])
    .then((items) => {
      _infList.value = Array.isArray(items) ? items : [];
      _infLoaded.value = true;
      return _infList.value;
    })
    .catch((e) => {
      _infError.value = e;
      ElMessage.error(`加载侵权失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _infLoading.value = false;
      _infPromise = null;
    });
  return _infPromise;
}

export function useInfringement() {
  async function create(body) {
    try {
      const created = await infringementApi.create(body);
      if (created?.id) _infList.value.unshift(created);
      ElMessage.success('已创建');
      return created;
    } catch (e) { _err(e, '创建失败'); throw e; }
  }
  async function draft(id, body) {
    try {
      const updated = await infringementApi.draft(id, body);
      _patch(_infList, id, updated);
      ElMessage.success('草稿已生成');
      return updated;
    } catch (e) { _err(e, '起草失败'); throw e; }
  }
  async function submit(id, body) {
    try {
      const updated = await infringementApi.submit(id, body);
      _patch(_infList, id, updated);
      ElMessage.success('已提交');
      return updated;
    } catch (e) { _err(e, '提交失败'); throw e; }
  }
  async function resolve(id, body) {
    try {
      const updated = await infringementApi.resolve(id, body);
      _patch(_infList, id, updated);
      ElMessage.success('已结案');
      return updated;
    } catch (e) { _err(e, '结案失败'); throw e; }
  }
  return {
    list: _infList,
    loaded: _infLoaded,
    loading: _infLoading,
    error: _infError,
    fetch: _fetchInfringement,
    create,
    draft,
    submit,
    resolve,
  };
}

// ============================================================================
// 7. useReviews — Review 中心
// ============================================================================
const _reviewList = ref([]);
const _reviewSummary = ref({ total: 0, negative: 0, appealCandidates: 0, recoveryPending: 0 });
const _reviewLoaded = ref(false);
const _reviewLoading = ref(false);
const _reviewError = ref(null);
let _reviewPromise = null;

async function _fetchReviews(params = {}, force = false) {
  if (_reviewPromise) return _reviewPromise;
  if (_reviewLoaded.value && !force && !Object.keys(params).length) return _reviewList.value;
  _reviewLoading.value = true;
  _reviewError.value = null;
  _reviewPromise = silent(() => reviewsApi.list(params), { items: [], summary: {} })
    .then((data) => {
      _reviewList.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      if (data?.summary) _reviewSummary.value = { ..._reviewSummary.value, ...data.summary };
      _reviewLoaded.value = true;
      return _reviewList.value;
    })
    .catch((e) => {
      _reviewError.value = e;
      ElMessage.error(`加载评论失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _reviewLoading.value = false;
      _reviewPromise = null;
    });
  return _reviewPromise;
}

export function useReviews() {
  async function sync(body = {}) {
    try {
      const r = await reviewsApi.sync(body);
      ElMessage.success(`已同步 ${r?.added ?? 0} 条新评`);
      await _fetchReviews({}, true);
      return r;
    } catch (e) { _err(e, '同步失败'); throw e; }
  }
  async function markAppealable(id, body) {
    try {
      const updated = await reviewsApi.markAppealable(id, body);
      _patch(_reviewList, id, updated);
      ElMessage.success('已标记');
      return updated;
    } catch (e) { _err(e, '标记失败'); throw e; }
  }
  async function pushM1(id, body = {}) {
    try {
      const r = await reviewsApi.pushM1(id, body);
      ElMessage.success('已推送 M1');
      return r;
    } catch (e) { _err(e, '推送失败'); throw e; }
  }
  return {
    list: _reviewList,
    summary: _reviewSummary,
    loaded: _reviewLoaded,
    loading: _reviewLoading,
    error: _reviewError,
    fetch: _fetchReviews,
    sync,
    markAppealable,
    pushM1,
  };
}

// ============================================================================
// 8. useReviewClusters — 差评聚类
// ============================================================================
const _clList = ref([]);
const _clLoaded = ref(false);
const _clLoading = ref(false);
const _clError = ref(null);
let _clPromise = null;

async function _fetchClusters(params = {}, force = false) {
  if (_clPromise) return _clPromise;
  if (_clLoaded.value && !force && !Object.keys(params).length) return _clList.value;
  _clLoading.value = true;
  _clError.value = null;
  _clPromise = silent(() => reviewsApi.listClusters(params), [])
    .then((items) => {
      _clList.value = Array.isArray(items) ? items : [];
      _clLoaded.value = true;
      return _clList.value;
    })
    .catch((e) => {
      _clError.value = e;
      ElMessage.error(`加载聚类失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _clLoading.value = false;
      _clPromise = null;
    });
  return _clPromise;
}

export function useReviewClusters() {
  async function recompute(body = {}) {
    try {
      const r = await reviewsApi.recomputeClusters(body);
      ElMessage.success('已重算聚类');
      await _fetchClusters({}, true);
      return r;
    } catch (e) { _err(e, '重算失败'); throw e; }
  }
  async function pushClusterM1(id, body) {
    // M4-P3-02: snapshot for rollback, patch with the backend-returned row (not a
    // hardcoded 'pushed' string), and roll back on failure.
    const prev = _clList.value.find((x) => x.id === id);
    const snapshot = prev ? { ...prev } : null;
    try {
      const r = await reviewsApi.pushClusterM1(id, body);
      const patch = (r && typeof r === 'object' && (r.id || r.status)) ? r : { status: r?.status ?? 'pushed', pushedM1TargetId: r?.m1TargetId };
      _patch(_clList, id, patch);
      ElMessage.success('已推送 M1');
      return r;
    } catch (e) {
      if (snapshot) _patch(_clList, id, snapshot);
      _err(e, '推送失败');
      throw e;
    }
  }
  return {
    list: _clList,
    loaded: _clLoaded,
    loading: _clLoading,
    error: _clError,
    fetch: _fetchClusters,
    recompute,
    pushClusterM1,
  };
}

// ============================================================================
// 9. useReviewTrends — 评分趋势
// ============================================================================
const _trList = ref([]);
const _trLoaded = ref(false);
const _trLoading = ref(false);
const _trError = ref(null);
let _trPromise = null;

async function _fetchTrends(params = {}, force = false) {
  if (_trPromise) return _trPromise;
  if (_trLoaded.value && !force && !Object.keys(params).length) return _trList.value;
  _trLoading.value = true;
  _trError.value = null;
  _trPromise = silent(() => reviewsApi.trends.list(params), [])
    .then((items) => {
      _trList.value = Array.isArray(items) ? items : [];
      _trLoaded.value = true;
      return _trList.value;
    })
    .catch((e) => {
      _trError.value = e;
      ElMessage.error(`加载趋势失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _trLoading.value = false;
      _trPromise = null;
    });
  return _trPromise;
}

export function useReviewTrends() {
  async function snapshot(body = {}) {
    try {
      const r = await reviewsApi.trends.snapshot(body);
      ElMessage.success('快照已记录');
      await _fetchTrends({}, true);
      return r;
    } catch (e) { _err(e, '快照失败'); throw e; }
  }
  return {
    list: _trList,
    loaded: _trLoaded,
    loading: _trLoading,
    error: _trError,
    fetch: _fetchTrends,
    snapshot,
  };
}

// ============================================================================
// 10. useAppeals — 申诉中心（状态机）
// ============================================================================
const _apList = ref([]);
const _apSummary = ref({ draft: 0, submitted: 0, accepted: 0, rejected: 0, successRate: 0 });
const _apLoaded = ref(false);
const _apLoading = ref(false);
const _apError = ref(null);
let _apPromise = null;

async function _fetchAppeals(params = {}, force = false) {
  if (_apPromise) return _apPromise;
  if (_apLoaded.value && !force && !Object.keys(params).length) return _apList.value;
  _apLoading.value = true;
  _apError.value = null;
  _apPromise = silent(() => appealsApi.list(params), { items: [], summary: {} })
    .then((data) => {
      _apList.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      if (data?.summary) _apSummary.value = { ..._apSummary.value, ...data.summary };
      _apLoaded.value = true;
      return _apList.value;
    })
    .catch((e) => {
      _apError.value = e;
      ElMessage.error(`加载申诉失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _apLoading.value = false;
      _apPromise = null;
    });
  return _apPromise;
}

export function useAppeals() {
  async function draft(body) {
    try {
      const created = await appealsApi.draft(body);
      if (created?.id) _apList.value.unshift(created);
      ElMessage.success('草稿已生成');
      return created;
    } catch (e) { _err(e, '起草失败'); throw e; }
  }
  async function submit(id, body = {}) {
    const cur = _apList.value.find((a) => a.id === id);
    if (cur && !canAppealTransition(cur.status, 'submitted')) {
      ElMessage.warning(`非法状态跳转：${cur.status} → submitted`);
      return null;
    }
    try {
      const updated = await appealsApi.submit(id, body);
      _patch(_apList, id, updated);
      ElMessage.success('已提交');
      return updated;
    } catch (e) { _err(e, '提交失败'); throw e; }
  }
  async function review(id, body) {
    try {
      const updated = await appealsApi.review(id, body);
      _patch(_apList, id, updated);
      ElMessage.success('已记录裁决');
      return updated;
    } catch (e) { _err(e, '记录失败'); throw e; }
  }
  async function retry(id, body = {}) {
    const cur = _apList.value.find((a) => a.id === id);
    if (cur && cur.status !== 'rejected') {
      ElMessage.warning('仅 rejected 状态可重提');
      return null;
    }
    try {
      const created = await appealsApi.retry(id, body);
      if (created?.id) _apList.value.unshift(created);
      ElMessage.success('已创建重提草稿');
      return created;
    } catch (e) { _err(e, '重提失败'); throw e; }
  }
  return {
    list: _apList,
    summary: _apSummary,
    loaded: _apLoaded,
    loading: _apLoading,
    error: _apError,
    fetch: _fetchAppeals,
    draft,
    submit,
    review,
    retry,
    canTransition: canAppealTransition,
    allowedActions: allowedAppealActions,
  };
}

// ============================================================================
// 11. useRecovery — 挽回邮件（多轮 + 状态机）
// ============================================================================
const _reList = ref([]);
const _reLoaded = ref(false);
const _reLoading = ref(false);
const _reError = ref(null);
let _rePromise = null;

async function _fetchRecovery(params = {}, force = false) {
  if (_rePromise) return _rePromise;
  if (_reLoaded.value && !force && !Object.keys(params).length) return _reList.value;
  _reLoading.value = true;
  _reError.value = null;
  _rePromise = silent(() => recoveryApi.list(params), [])
    .then((items) => {
      _reList.value = Array.isArray(items) ? items : [];
      _reLoaded.value = true;
      return _reList.value;
    })
    .catch((e) => {
      _reError.value = e;
      ElMessage.error(`加载邮件失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _reLoading.value = false;
      _rePromise = null;
    });
  return _rePromise;
}

export function useRecovery() {
  async function draft(body) {
    try {
      const created = await recoveryApi.draft(body);
      if (created?.id) _reList.value.unshift(created);
      ElMessage.success('草稿已生成');
      return created;
    } catch (e) { _err(e, '起草失败'); throw e; }
  }
  // M4-P1-03: this records a MANUAL send (operator sent out-of-band) — it does not
  // dispatch a real message. Requires manual-evidence (channel/sentBy/sentAt).
  async function send(id, body = {}) {
    const cur = _reList.value.find((a) => a.id === id);
    if (cur && !canRecoveryTransition(cur.status, 'marked_sent')) {
      ElMessage.warning(`非法状态跳转：${cur.status} → marked_sent`);
      return null;
    }
    try {
      const updated = await recoveryApi.send(id, body);
      _patch(_reList, id, updated);
      ElMessage.success('已标记为人工发送');
      return updated;
    } catch (e) { _err(e, '标记发送失败'); throw e; }
  }
  async function recordReply(id, body) {
    try {
      const updated = await recoveryApi.recordReply(id, body);
      _patch(_reList, id, updated);
      ElMessage.success('已记录回复');
      return updated;
    } catch (e) { _err(e, '记录失败'); throw e; }
  }
  async function nextRound(id, body = {}) {
    try {
      const created = await recoveryApi.nextRound(id, body);
      if (created?.id) _reList.value.unshift(created);
      ElMessage.success('已创建下一轮草稿');
      return created;
    } catch (e) { _err(e, '创建下一轮失败'); throw e; }
  }
  return {
    list: _reList,
    loaded: _reLoaded,
    loading: _reLoading,
    error: _reError,
    fetch: _fetchRecovery,
    draft,
    send,
    recordReply,
    nextRound,
    canTransition: canRecoveryTransition,
    allowedActions: allowedRecoveryActions,
  };
}

// ============================================================================
// 12. useCompetitors — 竞品作战室
// ============================================================================
const _compList = ref([]);
const _compLoaded = ref(false);
const _compLoading = ref(false);
const _compError = ref(null);
let _compPromise = null;

async function _fetchCompetitors(params = {}, force = false) {
  if (_compPromise) return _compPromise;
  if (_compLoaded.value && !force && !Object.keys(params).length) return _compList.value;
  _compLoading.value = true;
  _compError.value = null;
  _compPromise = silent(() => competitorsApi.list(params), [])
    .then((items) => {
      _compList.value = Array.isArray(items) ? items : [];
      _compLoaded.value = true;
      return _compList.value;
    })
    .catch((e) => {
      _compError.value = e;
      ElMessage.error(`加载竞品失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _compLoading.value = false;
      _compPromise = null;
    });
  return _compPromise;
}

export function useCompetitors() {
  async function add(body) {
    try {
      const created = await competitorsApi.add(body);
      if (created?.id || created?.competitorAsin) _compList.value.unshift(created);
      ElMessage.success('已添加');
      return created;
    } catch (e) { _err(e, '添加失败'); throw e; }
  }
  async function snapshot(body = {}) {
    try {
      const r = await competitorsApi.snapshot(body);
      ElMessage.success('快照已生成');
      await _fetchCompetitors({}, true);
      return r;
    } catch (e) { _err(e, '快照失败'); throw e; }
  }
  async function timeline(asin, params = {}) {
    try { return await competitorsApi.timeline(asin, params); } catch (e) { _err(e, '加载时间线失败'); return []; }
  }
  async function dismissChange(asin, body) {
    try {
      const r = await competitorsApi.dismissChange(asin, body);
      ElMessage.success('已忽略变化');
      return r;
    } catch (e) { _err(e, '忽略失败'); throw e; }
  }
  return {
    list: _compList,
    loaded: _compLoaded,
    loading: _compLoading,
    error: _compError,
    fetch: _fetchCompetitors,
    add,
    snapshot,
    timeline,
    dismissChange,
  };
}

// ============================================================================
// 13. useImageDiffs — 竞品图片差异
// ============================================================================
const _idList = ref([]);
const _idLoaded = ref(false);
const _idLoading = ref(false);
const _idError = ref(null);
let _idPromise = null;

async function _fetchImageDiffs(params = {}, force = false) {
  if (_idPromise) return _idPromise;
  if (_idLoaded.value && !force && !Object.keys(params).length) return _idList.value;
  _idLoading.value = true;
  _idError.value = null;
  _idPromise = silent(() => imageDiffsApi.list(params), [])
    .then((items) => {
      _idList.value = Array.isArray(items) ? items : [];
      _idLoaded.value = true;
      return _idList.value;
    })
    .catch((e) => {
      _idError.value = e;
      ElMessage.error(`加载图片差异失败：${e.message || e}`);
      return [];
    })
    .finally(() => {
      _idLoading.value = false;
      _idPromise = null;
    });
  return _idPromise;
}

export function useImageDiffs() {
  async function scan(body = {}) {
    try {
      const r = await imageDiffsApi.scan(body);
      ElMessage.success(`扫描完成，新增 ${r?.added ?? 0} 条`);
      await _fetchImageDiffs({}, true);
      return r;
    } catch (e) { _err(e, '扫描失败'); throw e; }
  }
  async function pushM1(id, body = {}) {
    // M4-P3-02: patch with the backend-returned object; roll back on failure.
    const idx = _idList.value.findIndex((x) => x.id === id);
    const snapshot = idx >= 0 ? { ..._idList.value[idx] } : null;
    try {
      const r = await imageDiffsApi.pushM1(id, body);
      const patch = (r && typeof r === 'object' && (r.id || r.status)) ? r : { status: r?.status ?? 'pushed', pushedM1TargetId: r?.m1TargetId };
      _patch(_idList, id, patch);
      ElMessage.success('已推送 M1');
      return r;
    } catch (e) {
      if (snapshot) _patch(_idList, id, snapshot);
      _err(e, '推送失败');
      throw e;
    }
  }
  return {
    list: _idList,
    loaded: _idLoaded,
    loading: _idLoading,
    error: _idError,
    fetch: _fetchImageDiffs,
    scan,
    pushM1,
  };
}

// ============================================================================
// 14. useBrandDefense — 品牌词防御
// ============================================================================
const _bdData = ref(null);
const _bdLoading = ref(false);
const _bdError = ref(null);
let _bdPromise = null;

async function _fetchBrandDefense(force = false) {
  if (_bdPromise) return _bdPromise;
  if (_bdData.value && !force) return _bdData.value;
  _bdLoading.value = true;
  _bdError.value = null;
  _bdPromise = silent(() => brandDefenseApi.get(), null)
    .then((data) => {
      _bdData.value = data || { layers: [], brandKeywords: [], brandRegistered: false };
      return _bdData.value;
    })
    .catch((e) => {
      _bdError.value = e;
      ElMessage.error(`加载品牌防御失败：${e.message || e}`);
      _bdData.value = { layers: [], brandKeywords: [], brandRegistered: false };
      return _bdData.value;
    })
    .finally(() => {
      _bdLoading.value = false;
      _bdPromise = null;
    });
  return _bdPromise;
}

export function useBrandDefense() {
  async function enableLayer(layerCode, body = {}) {
    try {
      const r = await brandDefenseApi.enableLayer(layerCode, body);
      await _fetchBrandDefense(true);
      ElMessage.success('已启用');
      return r;
    } catch (e) { _err(e, '启用失败'); throw e; }
  }
  async function disableLayer(layerCode, body) {
    try {
      const r = await brandDefenseApi.disableLayer(layerCode, body);
      await _fetchBrandDefense(true);
      ElMessage.success('已禁用');
      return r;
    } catch (e) { _err(e, '禁用失败'); throw e; }
  }
  async function counter(body) {
    try {
      const r = await brandDefenseApi.counter(body);
      ElMessage.success('反攻击已触发（M3 加价）');
      return r;
    } catch (e) { _err(e, '反攻击失败'); throw e; }
  }
  return {
    data: _bdData,
    loading: _bdLoading,
    error: _bdError,
    fetch: _fetchBrandDefense,
    enableLayer,
    disableLayer,
    counter,
  };
}

// ============================================================================
// 公共 helper
// ============================================================================
function _patch(listRef, id, updated) {
  if (!updated || !id) return;
  const i = listRef.value.findIndex((x) => x.id === id);
  if (i >= 0) listRef.value[i] = { ...listRef.value[i], ...updated };
}

function _err(e, label) {
  if (e?.status === 404) {
    ElMessage.warning(`${label}：后端未实现（404）`);
  } else {
    ElMessage.error(`${label}：${e?.message || e}`);
  }
}

// ============================================================================
// useAdsAction — M3-P1-15: M4 surfaces that enqueue an Ads/LX write (e.g. hijacking
// close → pause competing campaign) must reflect the SERVER's queued/dryRun result and
// never optimistically claim the write executed. The action funnels through the gated
// ad_action_queue boundary (dryRun=1 / needs_review / auditRequired); this composable
// only mirrors the server's honest response.
// ============================================================================
const _adsActionResult = ref(null);
const _adsActionLoading = ref(false);

export function useAdsAction() {
  async function dispatch(apiCall) {
    _adsActionLoading.value = true;
    try {
      const res = await apiCall();
      // Mirror the server truthfully. Defaults are safe (not executed, dryRun on, no real
      // write) when the server omits a field — we never fabricate executed:true.
      _adsActionResult.value = {
        queued: res?.queued === true,
        dryRun: res?.dryRun !== false,
        requiresRealStoreWrite: res?.requiresRealStoreWrite === true,
        guardrailStatus: res?.guardrailStatus ?? res?.status ?? 'needs_review',
        raw: res ?? null,
      };
      return _adsActionResult.value;
    } catch (e) {
      // Clear any optimistic state on failure — the write did not happen, so the
      // reflected adsActionResult = null (no queued/dryRun claim survives a failure).
      _adsActionResult.value = null;
      _err(e, '入队失败');
      throw e;
    } finally {
      _adsActionLoading.value = false;
    }
  }

  return {
    result: _adsActionResult,
    loading: _adsActionLoading,
    dispatch,
  };
}

// ============================================================================
// 重置（供切店时使用）
// ============================================================================
export function resetM4State() {
  _adsActionResult.value = null;
  _anomList.value = []; _anomLoaded.value = false;
  _slaBoard.value = null;
  _caseList.value = []; _caseLoaded.value = false;
  _pmList.value = []; _pmLoaded.value = false;
  _hjList.value = []; _hjLoaded.value = false;
  _infList.value = []; _infLoaded.value = false;
  _reviewList.value = []; _reviewLoaded.value = false;
  _clList.value = []; _clLoaded.value = false;
  _trList.value = []; _trLoaded.value = false;
  _apList.value = []; _apLoaded.value = false;
  _reList.value = []; _reLoaded.value = false;
  _compList.value = []; _compLoaded.value = false;
  _idList.value = []; _idLoaded.value = false;
  _bdData.value = null;
}
