// useLocalStore — 真后端 DB + LocalStorage 缓存 + 多店铺切换
// 写操作通过 storeApi 调后端；读操作优先内存 reactive。
// 当前店铺：保存在 localStorage(amz_current_store_id)，所有 API 自动带 X-Store-Id。
// 接口保持向后兼容：原页面调用方法 / getter 不变。

import { ref, watch } from 'vue';
import { storeApi, storesApi, authApi } from '../api/store';
import { getToken, setToken, clearToken, getCurrentStoreId, setCurrentStoreId } from '../api/client';
import { ElMessage } from 'element-plus';

const CACHE_KEY = 'amz_web_v2_cache';

function defaultState() {
  return {
    user: null,
    auth: { loggedIn: false, loginAt: null },
    stores: [],
    currentStoreId: '',
    auditLogs: [],
    customAlerts: [],
    keywordLibrary: [],
    notifications: { read: [] },
    sovereignty: { global: 'semi', m1: 'manual', m2: 'semi', m3: 'auto', m4: 'semi' },
    settings: {
      notifyChannels: { in_app: true, email: true, wechat: false },
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
      brandColor: '#2563eb',
    },
    _hydrated: false,
  };
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch { return defaultState(); }
}

const _state = ref(loadCache());

watch(_state, (v) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch {}
}, { deep: true });

let _hydratePromise = null;

async function loadStoresAndPickCurrent() {
  const stores = await storesApi.list().catch(() => []);
  _state.value.stores = stores;
  // 选当前 store：缓存里的优先，否则首个
  let cur = getCurrentStoreId();
  if (!cur || !stores.find((s) => s.id === cur)) {
    cur = stores[0]?.id || '';
    setCurrentStoreId(cur);
  }
  _state.value.currentStoreId = cur;
  return cur;
}

async function hydrateScopedCollections() {
  // 当前店铺范围内的 4 类数据 + 用户级 settings/notifications
  const [auditLogs, keywords, alerts, notifRead, settings, sov] = await Promise.all([
    storeApi.listAuditLogs().catch(() => []),
    storeApi.listKeywords().catch(() => []),
    storeApi.listAlerts().catch(() => []),
    storeApi.listNotificationsRead().catch(() => ({})),
    storeApi.getSettings().catch(() => ({})),
    storeApi.getSovereignty().catch(() => null),
  ]);
  _state.value.auditLogs = auditLogs;
  _state.value.keywordLibrary = keywords;
  _state.value.customAlerts = alerts;
  _state.value.notifications = { read: Object.keys(notifRead || {}) };
  _state.value.settings = { ..._state.value.settings, ...(settings || {}) };
  if (sov) _state.value.sovereignty = { ..._state.value.sovereignty, ...sov };
}

async function hydrateFromBackend() {
  if (!getToken()) return;
  if (_hydratePromise) return _hydratePromise;
  _hydratePromise = (async () => {
    try {
      const me = await authApi.me().catch(() => null);
      if (me) {
        _state.value.user = me;
        _state.value.auth = { loggedIn: true, loginAt: _state.value.auth.loginAt || new Date().toISOString() };
      }
      await loadStoresAndPickCurrent();
      await hydrateScopedCollections();
      _state.value._hydrated = true;
    } catch (e) {
      console.warn('[useLocalStore] hydrate failed:', e?.message || e);
    } finally {
      _hydratePromise = null;
    }
  })();
  return _hydratePromise;
}

export function useLocalStore() {
  return {
    get state() { return _state.value; },
    get user() { return _state.value.user; },
    get auth() { return _state.value.auth; },
    get stores() { return _state.value.stores; },
    get currentStoreId() { return _state.value.currentStoreId; },
    get currentStore() { return _state.value.stores.find((s) => s.id === _state.value.currentStoreId) || null; },
    get auditLogs() { return _state.value.auditLogs; },
    get hydrated() { return _state.value._hydrated; },

    hydrate: hydrateFromBackend,

    // ===== Store switching =====
    async switchStore(storeId) {
      if (!storeId || storeId === _state.value.currentStoreId) return;
      const target = _state.value.stores.find((s) => s.id === storeId);
      if (!target) return;
      _state.value.currentStoreId = storeId;
      setCurrentStoreId(storeId);
      // 重新拉取该店铺范围内的数据
      try {
        await hydrateScopedCollections();
        ElMessage.success(`已切换到 ${target.name}`);
      } catch (e) {
        ElMessage.warning(`切换店铺数据加载失败：${e.message || e}`);
      }
    },

    async addStore(s) {
      const created = await storesApi.add(s);
      _state.value.stores.push(created);
      return created;
    },
    async updateStore(id, patch) {
      const r = await storesApi.update(id, patch);
      const i = _state.value.stores.findIndex((x) => x.id === id);
      if (i >= 0 && r) _state.value.stores[i] = r;
      return r;
    },
    async removeStore(id) {
      await storesApi.remove(id);
      const i = _state.value.stores.findIndex((x) => x.id === id);
      if (i >= 0) _state.value.stores.splice(i, 1);
      // 若删的是当前店铺，切到首个
      if (_state.value.currentStoreId === id) {
        const next = _state.value.stores[0]?.id || '';
        _state.value.currentStoreId = next;
        setCurrentStoreId(next);
        if (next) await hydrateScopedCollections();
      }
    },

    // ===== Audit Logs =====
    async addAuditLog(log) {
      _state.value.auditLogs.unshift(log);
      if (_state.value.auditLogs.length > 200) _state.value.auditLogs.pop();
      try {
        const persisted = await storeApi.appendAuditLog(log);
        const idx = _state.value.auditLogs.findIndex((x) => x.id === log.id);
        if (idx >= 0 && persisted?.id) _state.value.auditLogs[idx] = persisted;
      } catch (e) { console.warn('[audit-log persist failed]', e?.message); }
    },

    async revertAuditLog(id, reason = 'user_revert') {
      const log = _state.value.auditLogs.find((l) => l.id === id);
      if (log) {
        log.reverted = true;
        log.status = 'reverted';
        log.revertedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        log.revertReason = reason;
      }
      try { await storeApi.revertAuditLog(id, reason); }
      catch (e) { console.warn('[revert persist failed]', e?.message); }
    },

    // ===== Keywords =====
    async addKeyword(kw) {
      const tmp = { ...kw, id: kw.id || `kw-tmp-${Date.now()}` };
      _state.value.keywordLibrary.unshift(tmp);
      try {
        const persisted = await storeApi.addKeyword(kw);
        const i = _state.value.keywordLibrary.findIndex((x) => x.id === tmp.id);
        if (i >= 0 && persisted?.id) _state.value.keywordLibrary[i] = persisted;
      } catch (e) { console.warn('[kw persist failed]', e?.message); }
    },
    async removeKeyword(id) {
      const i = _state.value.keywordLibrary.findIndex((k) => k.id === id);
      if (i >= 0) _state.value.keywordLibrary.splice(i, 1);
      try { await storeApi.removeKeyword(id); }
      catch (e) { console.warn('[kw delete failed]', e?.message); }
    },

    // ===== Alerts =====
    async addAlertRule(rule) {
      const tmp = { ...rule, id: rule.id || `rule-tmp-${Date.now()}` };
      _state.value.customAlerts.unshift(tmp);
      try {
        const persisted = await storeApi.addAlert(rule);
        const i = _state.value.customAlerts.findIndex((x) => x.id === tmp.id);
        if (i >= 0 && persisted?.id) _state.value.customAlerts[i] = persisted;
      } catch (e) { console.warn('[alert persist failed]', e?.message); }
    },
    async updateAlertRule(id, patch) {
      const r = _state.value.customAlerts.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
      try { await storeApi.updateAlert(id, patch); }
      catch (e) { console.warn('[alert update failed]', e?.message); }
    },
    async removeAlertRule(id) {
      const i = _state.value.customAlerts.findIndex((x) => x.id === id);
      if (i >= 0) _state.value.customAlerts.splice(i, 1);
      try { await storeApi.removeAlert(id); }
      catch (e) { console.warn('[alert delete failed]', e?.message); }
    },

    // ===== Notifications =====
    async markNotificationRead(id) {
      if (!_state.value.notifications.read.includes(id)) _state.value.notifications.read.push(id);
      try { await storeApi.markNotificationRead(id); }
      catch (e) { console.warn('[notif read failed]', e?.message); }
    },
    isNotificationRead(id) { return _state.value.notifications.read.includes(id); },

    // ===== Sovereignty / Settings =====
    async setSovereignty(scope, value) {
      _state.value.sovereignty[scope] = value;
      try { await storeApi.setSovereignty({ [scope]: value }); }
      catch (e) { console.warn('[sov persist failed]', e?.message); }
    },
    async updateSettings(patch) {
      Object.assign(_state.value.settings, patch);
      try { await storeApi.updateSettings(patch); }
      catch (e) { console.warn('[settings persist failed]', e?.message); }
    },

    // ===== Auth =====
    async login({ email, password }) {
      try {
        const { token, user, stores, defaultStoreId } = await authApi.login(email, password);
        setToken(token);
        if (defaultStoreId) setCurrentStoreId(defaultStoreId);
        _state.value.user = user;
        _state.value.stores = stores || [];
        _state.value.currentStoreId = defaultStoreId || '';
        _state.value.auth = { loggedIn: true, loginAt: new Date().toISOString() };
        await hydrateScopedCollections();
        _state.value._hydrated = true;
        return { ok: true, user };
      } catch (e) {
        ElMessage.error(`登录失败：${e.message || e}`);
        return { ok: false, error: e };
      }
    },

    async logout() {
      try { await authApi.logout(); } catch {}
      clearToken();
      setCurrentStoreId('');
      _state.value = defaultState();
      try { localStorage.removeItem(CACHE_KEY); } catch {}
    },

    reset() {
      _state.value = defaultState();
      try { localStorage.removeItem(CACHE_KEY); } catch {}
    },
  };
}

if (typeof window !== 'undefined' && getToken()) {
  hydrateFromBackend();
}
