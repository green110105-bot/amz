// ads-timeline.js — M3 AI 建议流 + 外部更改 + Action Queue API 客户端
import { http } from './client';
import { ElMessage } from 'element-plus';

const SUG_BASE = '/api/v1/store/ads/suggestions';
const MC_BASE = '/api/v1/store/ads/manual-changes';
const TL_BASE = '/api/v1/store/ads/timeline';
const AQ_BASE = '/api/v1/store/ads/action-queue';

export const suggestionsApi = {
  list: (params = {}) => http.get(SUG_BASE, { params }).then((r) => r.data.items ?? r.data ?? []),
  get: (id) => http.get(`${SUG_BASE}/${id}`).then((r) => r.data),
  accept: (id, payload = {}) =>
    http.post(`${SUG_BASE}/${id}/accept`, payload).then((r) => r.data),
  reject: (id, payload = {}) =>
    http.post(`${SUG_BASE}/${id}/reject`, payload).then((r) => r.data),
  revert: (id, payload = {}) =>
    http.post(`${SUG_BASE}/${id}/revert`, payload).then((r) => r.data),
};

export const manualChangesApi = {
  list: (params = {}) => http.get(MC_BASE, { params }).then((r) => r.data.items ?? r.data ?? []),
  applyAlternative: (id, payload = {}) =>
    http.post(`${MC_BASE}/${id}/apply-alternative`, payload).then((r) => r.data),
  ignore: (id, payload = {}) =>
    http.post(`${MC_BASE}/${id}/ignore`, payload).then((r) => r.data),
  // M3-P0-07: the manual-change revert endpoint is owned by the backend (which writes the
  // audit + actually reverts). The frontend MUST NOT double-write a TIMELINE_REVERT audit.
  revert: (id, payload = {}) =>
    http.post(`${MC_BASE}/${id}/revert`, payload).then((r) => r.data),
};

// M3-P1-13: timeline reads normalize sourceMeta so provider mode is never fabricated as
// 'real'. Missing sourceMeta defaults to 'mock' — we never optimistically claim real.
export const timelineApi = {
  list: (params = {}) =>
    http.get(TL_BASE, { params }).then((r) => {
      const res = r.data ?? {};
      const providerMode = res?.sourceMeta?.providerMode || res?.providerMode || 'mock';
      const items = res.items ?? (Array.isArray(res) ? res : []);
      return { items, sourceMeta: { providerMode } };
    }),
};

// M3-P1-11: enqueue wrapper. The server is the single gated boundary (ad_action_queue,
// dryRun=1, needs_review, auditRequired). This wrapper:
//  - downgrades a benign duplicate (res.duplicate===true) or HTTP 409 to ElMessage.info
//    ('已在执行篮中') instead of a scary error;
//  - returns the server's queued/dryRun/requiresRealStoreWrite truthfully (no faking).
export const actionQueueApi = {
  async enqueue(action) {
    try {
      const res = await http.post(`${AQ_BASE}/enqueue`, action).then((r) => r.data);
      if (res?.duplicate === true) {
        ElMessage.info('已在执行篮中');
      }
      return res;
    } catch (e) {
      const status = e?.response?.status ?? e?.status;
      if (status === 409) {
        ElMessage.info('已在执行篮中');
        return { ...(e?.response?.data || {}), duplicate: true, queued: false };
      }
      throw e;
    }
  },
  list: (params = {}) => http.get(AQ_BASE, { params }).then((r) => r.data.items ?? r.data ?? []),
  // Look up the active queued action for an entity (used to render pending badges).
  activeFor: (entityKind, entityId) =>
    http
      .get(`${AQ_BASE}/active`, { params: { entityKind, entityId } })
      .then((r) => r.data)
      .catch(() => null),
};
