// useNotificationsBus.js — 全局通知总线（singleton）
//
// 职责：
//  1. 周期性拉取 /api/v1/store/m4/notifications/unread-count + 列表（10s 默认）
//  2. 暴露 unreadCount / list / markRead / markAllRead / pushLocal
//  3. 跨模块（M1/M2/M3）写操作完成后可调 bus.pushLocal() 添加本地乐观项
//  4. 切店时 reset
//
// 风格参考 useM1State.js（模块作用域 ref + 单例 fetch）

import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { notificationsApi } from '../api/m4';
import { dashboardApi } from '../api/dashboard';

// ---- 单例 reactive state ----
const _list = ref([]);             // 通知数组（最近 N 条）
const _unreadCount = ref(0);
const _loaded = ref(false);
const _loading = ref(false);
const _error = ref(null);
const _summary = ref({ unread: 0, p0: 0, p1: 0, p2: 0 });
// W17: 决策卡 Inbox 同源摘要（来自 GET /api/v1/dashboard/summary）。
// Workbench cardSummary 与顶栏角标共用此引用，二者计数永远同步。
const _cardSummary = ref({ total: 0, p0: 0, p1: 0, p2: 0 });
let _pollTimer = null;
let _pollIntervalMs = 10000;
let _pollPromise = null;
const _readLocal = new Set(); // 本地乐观标记已读（在 markRead 写后端前先同步 UI）

// ---- 静默拉取（不弹错；铃铛后端 404 不报噪音）----
async function _silentList(params = {}) {
  try {
    const data = await notificationsApi.list(params);
    return data;
  } catch (e) {
    if (e?.status === 404 || /Network/i.test(e?.message || '')) return { items: [], summary: {} };
    throw e;
  }
}
async function _silentUnread() {
  try {
    const data = await notificationsApi.unreadCount();
    return data;
  } catch (e) {
    if (e?.status === 404 || /Network/i.test(e?.message || '')) return { unreadCount: 0 };
    throw e;
  }
}
// W17: 决策卡摘要静默拉取（端点缺失/未登录时返回空摘要，不弹噪音）。
async function _silentSummary() {
  try {
    const data = await dashboardApi.summary();
    return data;
  } catch (e) {
    if (e?.status === 404 || /Network/i.test(e?.message || '')) {
      return { cardSummary: { total: 0, p0: 0, p1: 0, p2: 0 }, unreadCount: null };
    }
    throw e;
  }
}

async function _refresh() {
  if (_pollPromise) return _pollPromise;
  _loading.value = true;
  _pollPromise = (async () => {
    try {
      const [unreadResp, listResp, summaryResp] = await Promise.all([
        _silentUnread(), _silentList({ limit: 20 }), _silentSummary(),
      ]);
      const items = Array.isArray(listResp?.items) ? listResp.items : (Array.isArray(listResp) ? listResp : []);
      // 合并本地乐观已读
      _list.value = items.map((it) => ({
        ...it,
        readAt: it.readAt || (_readLocal.has(it.id) ? new Date().toISOString() : null),
      }));
      _unreadCount.value = unreadResp?.unreadCount ?? (listResp?.summary?.unread ?? items.filter((x) => !x.readAt).length);
      _summary.value = listResp?.summary || _summary.value;
      // W17: 决策卡 Inbox 摘要同源刷新（与 Workbench cardSummary 共用此引用）。
      if (summaryResp?.cardSummary) _cardSummary.value = summaryResp.cardSummary;
      _loaded.value = true;
      _error.value = null;
    } catch (e) {
      _error.value = e;
    } finally {
      _loading.value = false;
      _pollPromise = null;
    }
  })();
  return _pollPromise;
}

function _startPolling(intervalMs) {
  if (intervalMs && intervalMs > 0) _pollIntervalMs = intervalMs;
  if (_pollTimer) return;
  _refresh(); // 立即一次
  _pollTimer = setInterval(_refresh, _pollIntervalMs);
}

function _stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

// ---- markRead：写后端 + 同步本地（失败回滚）----
async function _markRead(id) {
  if (!id) return;
  // 乐观：本地立即更新
  _readLocal.add(id);
  const i = _list.value.findIndex((x) => x.id === id);
  let didOptimisticUnread = false;
  if (i >= 0 && !_list.value[i].readAt) {
    _list.value[i] = { ..._list.value[i], readAt: new Date().toISOString() };
    if (_unreadCount.value > 0) { _unreadCount.value--; didOptimisticUnread = true; }
  }
  try {
    await notificationsApi.markRead(id);
  } catch (e) {
    // M4-P2-01: a 404 (e.g. cross-store / deleted notif) must NOT be swallowed.
    // Roll back the optimistic read state so the UI stays truthful.
    _readLocal.delete(id);
    if (i >= 0) {
      _list.value[i] = { ..._list.value[i], readAt: null };
    }
    if (didOptimisticUnread) _unreadCount.value++;
    ElMessage.warning(`标记已读失败：${e?.status === 404 ? '通知不存在或不属于当前店铺' : (e.message || e)}`);
  }
}

async function _markAllRead() {
  // 乐观清零
  for (const n of _list.value) {
    if (!n.readAt) {
      _readLocal.add(n.id);
      n.readAt = new Date().toISOString();
    }
  }
  _unreadCount.value = 0;
  try {
    await notificationsApi.markAllRead();
    ElMessage.success('已全部标记为已读');
  } catch (e) {
    if (e?.status !== 404) {
      ElMessage.warning(`批量已读失败：${e.message || e}`);
    }
  }
}

// ---- pushLocal：跨模块写操作完成后本地乐观插入一条（不入库）----
function _pushLocal(item) {
  const now = new Date().toISOString();
  const localId = item.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const evt = {
    id: localId,
    severity: item.severity || 'P2',
    sourceModule: item.sourceModule || 'local',
    title: item.title || '未命名事件',
    body: item.body || '',
    link: item.link || '',
    channels: item.channels || ['in_app'],
    createdAt: now,
    readAt: null,
    _local: true,
    ...item,
  };
  _list.value.unshift(evt);
  _unreadCount.value++;
}

// ---- reset（切店）----
function _reset() {
  _list.value = [];
  _unreadCount.value = 0;
  _loaded.value = false;
  _readLocal.clear();
  _summary.value = { unread: 0, p0: 0, p1: 0, p2: 0 };
  _cardSummary.value = { total: 0, p0: 0, p1: 0, p2: 0 };
}

// ============================================================================
// public API
// ============================================================================
export function useNotificationsBus() {
  return {
    list: _list,
    unreadCount: _unreadCount,
    summary: _summary,
    cardSummary: _cardSummary,
    loaded: _loaded,
    loading: _loading,
    error: _error,
    refresh: _refresh,
    startPolling: _startPolling,
    stopPolling: _stopPolling,
    markRead: _markRead,
    markAllRead: _markAllRead,
    pushLocal: _pushLocal,
    reset: _reset,
    recent: computed(() => _list.value.slice(0, 10)),
  };
}
