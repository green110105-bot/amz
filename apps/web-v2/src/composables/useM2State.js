// useM2State.js — M2 利润 / 库存 / 采购 / 重定价 模块 composables
//
// 风格参考：useM1State.js / useAdsState.js
//  - 模块作用域 ref + 单飞 promise + 乐观更新
//  - 每个 use* 暴露 { list/data, loading, error, fetch, mutations }
//  - mutations 乐观更新 + 失败回滚 + ElMessage 提示
//  - URL query / localStorage 草稿留在各 page 处理

import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import {
  profitApi,
  leaksApi,
  scenariosApi,
  reorderApi,
  slowMovingApi,
  transfersApi,
  poApi,
  suppliersApi,
  repricingApi,
  fxApi,
  paymentChannelsApi,
  taxApi,
  ltvApi,
  alertsApi,
  dimensionsApi,
  inventoryLinkApi,
} from '../api/m2';

// 通用：构造一个 module-scoped fetch 单飞模式
function _createCachedState() {
  return {
    data: ref(null),
    loaded: ref(false),
    loading: ref(false),
    error: ref(null),
    promise: null,
  };
}

// ============================================================================
// useProfit — 利润总览 / SKUs / 订单 / 现金流
// ============================================================================
const _overview = ref(null);
const _overviewLoading = ref(false);
const _overviewError = ref(null);
const _skus = ref([]);
const _skusLoading = ref(false);
const _orders = ref([]);
const _ordersLoading = ref(false);
const _cashflow = ref(null);
const _cashflowLoading = ref(false);

export function useProfit() {
  async function fetchOverview(range = '30d') {
    _overviewLoading.value = true;
    _overviewError.value = null;
    try {
      const res = await profitApi.overview(range);
      _overview.value = res;
      return res;
    } catch (e) {
      _overviewError.value = e;
      ElMessage.error(`加载利润总览失败：${e.message || e}`);
      return null;
    } finally {
      _overviewLoading.value = false;
    }
  }

  async function recompute(range = '30d') {
    try {
      const res = await profitApi.recompute({ range, force: true });
      // M2-P1-02: 同步重算，返回体含 overview（route spread getProfitOverview）；只取 overview 刷新 KPI
      if (res?.overview) _overview.value = { overview: res.overview, topSkus: res.topSkus, trend: res.trend };
      ElMessage.success(`重算完成，共 ${res?.count ?? 0} 个 SKU`);
      return res;
    } catch (e) {
      ElMessage.error(`重算失败：${e.message || e}`);
      throw e;
    }
  }

  async function fetchSkus(params = {}) {
    _skusLoading.value = true;
    try {
      const res = await profitApi.skus(params);
      _skus.value = res?.skus || res?.items || (Array.isArray(res) ? res : []);
      return _skus.value;
    } catch (e) {
      ElMessage.error(`加载 SKU 利润失败：${e.message || e}`);
      return [];
    } finally {
      _skusLoading.value = false;
    }
  }

  async function fetchWaterfall(sku, range = '30d') {
    try {
      return await profitApi.waterfall(sku, range);
    } catch (e) {
      ElMessage.error(`加载瀑布失败：${e.message || e}`);
      return null;
    }
  }

  async function fetchOrders(params = {}) {
    _ordersLoading.value = true;
    try {
      const res = await profitApi.orders(params);
      _orders.value = res?.orders || res?.items || (Array.isArray(res) ? res : []);
      return _orders.value;
    } catch (e) {
      ElMessage.error(`加载订单失败：${e.message || e}`);
      return [];
    } finally {
      _ordersLoading.value = false;
    }
  }

  async function fetchOrderDetail(orderId) {
    try {
      return await profitApi.orderDetail(orderId);
    } catch (e) {
      ElMessage.error(`加载订单详情失败：${e.message || e}`);
      return null;
    }
  }

  async function fetchCashflow(days = 90) {
    _cashflowLoading.value = true;
    try {
      const [timeline, alerts] = await Promise.all([
        profitApi.cashflow(days),
        profitApi.cashflowAlerts().catch(() => ({ alerts: [] })),
      ]);
      _cashflow.value = { ...timeline, alerts: alerts?.alerts || [] };
      return _cashflow.value;
    } catch (e) {
      ElMessage.error(`加载现金流失败：${e.message || e}`);
      return null;
    } finally {
      _cashflowLoading.value = false;
    }
  }

  async function createCashflowEvent(body) {
    try {
      const created = await profitApi.createCashflowEvent(body);
      ElMessage.success('现金流事件已创建');
      return created;
    } catch (e) {
      ElMessage.error(`创建失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    overview: _overview,
    overviewLoading: _overviewLoading,
    overviewError: _overviewError,
    skus: _skus,
    skusLoading: _skusLoading,
    orders: _orders,
    ordersLoading: _ordersLoading,
    cashflow: _cashflow,
    cashflowLoading: _cashflowLoading,
    fetchOverview,
    recompute,
    fetchSkus,
    fetchWaterfall,
    fetchOrders,
    fetchOrderDetail,
    fetchCashflow,
    createCashflowEvent,
  };
}

// ============================================================================
// useLeaks — 利润漏点列表 + CRUD
// ============================================================================
const _leaks = ref([]);
const _leaksLoaded = ref(false);
const _leaksLoading = ref(false);
const _leaksCounts = ref({ total: 0, p0: 0, p1: 0, fixing: 0 });

export function useLeaks() {
  async function fetch(params = {}) {
    _leaksLoading.value = true;
    try {
      const res = await leaksApi.list(params);
      _leaks.value = res?.leaks || res?.items || (Array.isArray(res) ? res : []);
      _leaksCounts.value = res?.counts || {
        total: _leaks.value.length,
        p0: _leaks.value.filter((l) => l.severity === 'P0').length,
        p1: _leaks.value.filter((l) => l.severity === 'P1').length,
        fixing: _leaks.value.filter((l) => l.status === 'fixing').length,
      };
      _leaksLoaded.value = true;
      return _leaks.value;
    } catch (e) {
      ElMessage.error(`加载漏点失败：${e.message || e}`);
      return [];
    } finally {
      _leaksLoading.value = false;
    }
  }

  async function startFix(id) {
    const i = _leaks.value.findIndex((l) => l.id === id);
    const prev = i >= 0 ? _leaks.value[i].status : null;
    if (i >= 0) _leaks.value[i].status = 'fixing';
    try {
      const r = await leaksApi.startFix(id);
      if (i >= 0 && r) _leaks.value[i] = { ..._leaks.value[i], ...r };
      ElMessage.success('已标记为修复中');
      return r;
    } catch (e) {
      if (i >= 0) _leaks.value[i].status = prev;
      ElMessage.error(`操作失败：${e.message || e}`);
      throw e;
    }
  }

  async function markFixed(id, actualSaving) {
    try {
      const r = await leaksApi.markFixed(id, { actualSaving });
      const i = _leaks.value.findIndex((l) => l.id === id);
      if (i >= 0 && r) _leaks.value[i] = { ..._leaks.value[i], ...r };
      ElMessage.success('已标记为已修复');
      return r;
    } catch (e) {
      ElMessage.error(`操作失败：${e.message || e}`);
      throw e;
    }
  }

  async function ignore(id, reason = '') {
    try {
      const r = await leaksApi.ignore(id, { reason });
      const i = _leaks.value.findIndex((l) => l.id === id);
      if (i >= 0) _leaks.value[i].status = 'ignored';
      ElMessage.info('已忽略');
      return r;
    } catch (e) {
      ElMessage.error(`操作失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: _leaks,
    counts: _leaksCounts,
    loaded: _leaksLoaded,
    loading: _leaksLoading,
    fetch,
    startFix,
    markFixed,
    ignore,
  };
}

// ============================================================================
// useScenarios — 情景模拟 preview / save / history
// ============================================================================
const _scenarios = ref([]);
const _scenariosLoading = ref(false);
const _lastSimulated = ref(null);

export function useScenarios() {
  async function preview(body) {
    try {
      const r = await scenariosApi.preview(body);
      _lastSimulated.value = r;
      return r;
    } catch (e) {
      ElMessage.error(`预测失败：${e.message || e}`);
      return null;
    }
  }

  async function save(body) {
    try {
      const r = await scenariosApi.save(body);
      if (r?.id) _scenarios.value.unshift(r);
      ElMessage.success('情景已保存');
      return r;
    } catch (e) {
      ElMessage.error(`保存失败：${e.message || e}`);
      throw e;
    }
  }

  async function fetch(params = {}) {
    _scenariosLoading.value = true;
    try {
      const res = await scenariosApi.list(params);
      _scenarios.value = res?.scenarios || res?.items || (Array.isArray(res) ? res : []);
      return _scenarios.value;
    } catch (e) {
      ElMessage.error(`加载情景失败：${e.message || e}`);
      return [];
    } finally {
      _scenariosLoading.value = false;
    }
  }

  return {
    list: _scenarios,
    loading: _scenariosLoading,
    lastSimulated: _lastSimulated,
    preview,
    save,
    fetch,
  };
}

// ============================================================================
// useReorder — 补货建议 + 生成 PO 草稿
// ============================================================================
const _reorders = ref([]);
const _reordersLoading = ref(false);

export function useReorder() {
  async function fetch(params = {}) {
    _reordersLoading.value = true;
    try {
      const res = await reorderApi.list(params);
      _reorders.value = res?.decisions || res?.items || (Array.isArray(res) ? res : []);
      return _reorders.value;
    } catch (e) {
      ElMessage.error(`加载补货建议失败：${e.message || e}`);
      return [];
    } finally {
      _reordersLoading.value = false;
    }
  }

  async function createPO(id, body) {
    // M2-P0-01: 主键唯一来源 d.reorder.id；乐观态写 d.reorder.status，失败回滚
    const i = _reorders.value.findIndex((d) => (d.reorder?.id) === id);
    const prevStatus = i >= 0 ? _reorders.value[i].reorder?.status : null;
    if (i >= 0 && _reorders.value[i].reorder) _reorders.value[i].reorder.status = 'drafted';
    try {
      const r = await reorderApi.createPO(id, body);
      ElMessage.success(`PO 草稿已生成：${r?.poNumber || r?.id || ''}`);
      return r;
    } catch (e) {
      // 回滚乐观态
      if (i >= 0 && _reorders.value[i].reorder) _reorders.value[i].reorder.status = prevStatus;
      ElMessage.error(`生成 PO 失败：${e.message || e}`);
      throw e;
    }
  }

  async function dismiss(id, reason = '') {
    // M2-P0-01: 软删 — 以服务端返回的 status='dismissed' 覆盖，而非 splice 硬删
    const i = _reorders.value.findIndex((d) => (d.reorder?.id) === id);
    const prevStatus = i >= 0 ? _reorders.value[i].reorder?.status : null;
    if (i >= 0 && _reorders.value[i].reorder) _reorders.value[i].reorder.status = 'dismissed';
    try {
      const res = await reorderApi.dismiss(id, { reason });
      // 服务端权威覆盖（res 为更新后的 reorder 对象）
      if (i >= 0 && _reorders.value[i].reorder && res?.status) {
        _reorders.value[i].reorder.status = res.status;
      }
      ElMessage.success('已忽略');
    } catch (e) {
      if (i >= 0 && _reorders.value[i].reorder) _reorders.value[i].reorder.status = prevStatus;
      ElMessage.error(`操作失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: _reorders,
    loading: _reordersLoading,
    fetch,
    createPO,
    dismiss,
  };
}

// ============================================================================
// useSlowMoving — 滞销决策
// ============================================================================
const _slow = ref([]);
const _slowLoading = ref(false);

export function useSlowMoving() {
  async function fetch(params = {}) {
    _slowLoading.value = true;
    try {
      const res = await slowMovingApi.list(params);
      _slow.value = res?.items || res?.decisions || (Array.isArray(res) ? res : []);
      return _slow.value;
    } catch (e) {
      ElMessage.error(`加载滞销决策失败：${e.message || e}`);
      return [];
    } finally {
      _slowLoading.value = false;
    }
  }

  async function preview(id, option = 'A') {
    return slowMovingApi.preview(id, { option });
  }

  async function execute(id, option, extra = {}) {
    try {
      const r = await slowMovingApi.execute(id, { option, ...extra });
      const i = _slow.value.findIndex((d) => d.id === id);
      if (i >= 0) _slow.value[i] = { ..._slow.value[i], ...r, status: 'executed' };
      // M2-P0-05: 诚实文案 — 仅生成 M1 草稿，待上架生效
      if (option === 'A' && r?.draftStatus) {
        ElMessage.success('已生成 M1 降价草稿，待 M1 上架生效');
      } else {
        ElMessage.success(`已生成选项 ${option} 处置草稿`);
      }
      return r;
    } catch (e) {
      ElMessage.error(`执行失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: _slow,
    loading: _slowLoading,
    fetch,
    preview,
    execute,
  };
}

// ============================================================================
// useTransfers — 跨仓调拨
// ============================================================================
const _transfers = ref([]);
const _transfersLoading = ref(false);

export function useTransfers() {
  async function fetch(params = {}) {
    _transfersLoading.value = true;
    try {
      const res = await transfersApi.list(params);
      _transfers.value = res?.transfers || res?.items || (Array.isArray(res) ? res : []);
      return _transfers.value;
    } catch (e) {
      ElMessage.error(`加载调拨建议失败：${e.message || e}`);
      return [];
    } finally {
      _transfersLoading.value = false;
    }
  }

  async function approve(id) {
    const i = _transfers.value.findIndex((t) => t.id === id);
    const prev = i >= 0 ? _transfers.value[i].status : null;
    // M2-P1-05: approve 真实位移库存后状态进入 in_transit
    if (i >= 0) _transfers.value[i].status = 'in_transit';
    try {
      const r = await transfersApi.approve(id);
      if (i >= 0 && r) _transfers.value[i] = { ..._transfers.value[i], ...r };
      ElMessage.success('调拨已批准，库存已位移（在途）');
      return r;
    } catch (e) {
      if (i >= 0) _transfers.value[i].status = prev;
      ElMessage.error(`批准失败：${e.message || e}`);
      throw e;
    }
  }

  async function receive(id) {
    const i = _transfers.value.findIndex((t) => t.id === id);
    const prev = i >= 0 ? _transfers.value[i].status : null;
    if (i >= 0) _transfers.value[i].status = 'received';
    try {
      const r = await transfersApi.receive(id);
      if (i >= 0 && r) _transfers.value[i] = { ..._transfers.value[i], ...r };
      ElMessage.success('已收货');
      return r;
    } catch (e) {
      if (i >= 0) _transfers.value[i].status = prev;
      ElMessage.error(`收货失败：${e.message || e}`);
      throw e;
    }
  }

  async function cancel(id) {
    const i = _transfers.value.findIndex((t) => t.id === id);
    const prev = i >= 0 ? _transfers.value[i].status : null;
    if (i >= 0) _transfers.value[i].status = 'cancelled';
    try {
      const r = await transfersApi.cancel(id);
      if (i >= 0 && r) _transfers.value[i] = { ..._transfers.value[i], ...r };
      ElMessage.success('已取消');
      return r;
    } catch (e) {
      if (i >= 0) _transfers.value[i].status = prev;
      ElMessage.error(`取消失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: _transfers,
    loading: _transfersLoading,
    fetch,
    approve,
    receive,
    cancel,
  };
}

// ============================================================================
// usePO — 采购单状态机
// ============================================================================
const _pos = ref([]);
const _posLoading = ref(false);
const _poDetailCache = new Map();

export function usePO() {
  async function fetch(params = {}) {
    _posLoading.value = true;
    try {
      const res = await poApi.list(params);
      // Backend returns { pos: [...] } per M2 SPEC. Keep items/purchaseOrders as fallbacks
      // in case the schema ever changes.
      _pos.value = res?.pos || res?.items || res?.purchaseOrders || (Array.isArray(res) ? res : []);
      return _pos.value;
    } catch (e) {
      ElMessage.error(`加载采购单失败：${e.message || e}`);
      return [];
    } finally {
      _posLoading.value = false;
    }
  }

  async function fetchDetail(id, force = false) {
    if (!force && _poDetailCache.has(id)) return _poDetailCache.get(id);
    try {
      const r = await poApi.detail(id);
      _poDetailCache.set(id, r);
      return r;
    } catch (e) {
      ElMessage.error(`加载 PO 详情失败：${e.message || e}`);
      return null;
    }
  }

  async function create(body) {
    try {
      const r = await poApi.create(body);
      if (r?.id) _pos.value.unshift(r);
      ElMessage.success(`PO 已创建：${r?.poNumber || ''}`);
      return r;
    } catch (e) {
      ElMessage.error(`创建 PO 失败：${e.message || e}`);
      throw e;
    }
  }

  async function update(id, patch) {
    try {
      const r = await poApi.update(id, patch);
      const i = _pos.value.findIndex((p) => p.id === id);
      if (i >= 0 && r) _pos.value[i] = { ..._pos.value[i], ...r };
      _poDetailCache.delete(id);
      ElMessage.success('已保存');
      return r;
    } catch (e) {
      ElMessage.error(`保存失败：${e.message || e}`);
      throw e;
    }
  }

  async function transition(id, to, extra = {}) {
    const i = _pos.value.findIndex((p) => p.id === id);
    const prev = i >= 0 ? _pos.value[i].status : null;
    if (i >= 0) _pos.value[i].status = to;
    try {
      const r = await poApi.transition(id, { to, ...extra });
      if (i >= 0 && r) _pos.value[i] = { ..._pos.value[i], ...r };
      _poDetailCache.delete(id);
      ElMessage.success(`已推进至 ${to}`);
      return r;
    } catch (e) {
      if (i >= 0) _pos.value[i].status = prev;
      if (e?.raw?.error === 'invalid_transition') {
        ElMessage.warning('状态机不允许此跳转');
      } else {
        ElMessage.error(`状态推进失败：${e.message || e}`);
      }
      throw e;
    }
  }

  async function payment(id, body) {
    try {
      const r = await poApi.payment(id, body);
      const i = _pos.value.findIndex((p) => p.id === id);
      if (i >= 0 && r) _pos.value[i] = { ..._pos.value[i], ...r };
      _poDetailCache.delete(id);
      ElMessage.success('付款状态已更新');
      return r;
    } catch (e) {
      ElMessage.error(`付款更新失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: _pos,
    loading: _posLoading,
    fetch,
    fetchDetail,
    create,
    update,
    transition,
    payment,
  };
}

// ============================================================================
// useSuppliers — 供应商 CRUD
// ============================================================================
const _suppliers = ref([]);
const _suppliersLoading = ref(false);
const _suppliersLoaded = ref(false);

export function useSuppliers() {
  async function fetch(params = {}, force = false) {
    if (_suppliersLoaded.value && !force && !Object.keys(params).length) {
      return _suppliers.value;
    }
    _suppliersLoading.value = true;
    try {
      const res = await suppliersApi.list(params);
      _suppliers.value = res?.suppliers || res?.items || (Array.isArray(res) ? res : []);
      _suppliersLoaded.value = true;
      return _suppliers.value;
    } catch (e) {
      ElMessage.error(`加载供应商失败：${e.message || e}`);
      return [];
    } finally {
      _suppliersLoading.value = false;
    }
  }

  async function create(body) {
    try {
      const r = await suppliersApi.create(body);
      if (r?.id) _suppliers.value.unshift(r);
      ElMessage.success('供应商已添加');
      return r;
    } catch (e) {
      ElMessage.error(`添加失败：${e.message || e}`);
      throw e;
    }
  }

  async function update(id, patch) {
    const i = _suppliers.value.findIndex((s) => s.id === id);
    const prev = i >= 0 ? { ..._suppliers.value[i] } : null;
    if (i >= 0) _suppliers.value[i] = { ..._suppliers.value[i], ...patch };
    try {
      const r = await suppliersApi.update(id, patch);
      if (i >= 0 && r) _suppliers.value[i] = r;
      ElMessage.success('已保存');
      return r;
    } catch (e) {
      if (i >= 0 && prev) _suppliers.value[i] = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
      throw e;
    }
  }

  async function remove(id) {
    const i = _suppliers.value.findIndex((s) => s.id === id);
    const removed = i >= 0 ? _suppliers.value.splice(i, 1)[0] : null;
    try {
      await suppliersApi.remove(id);
      ElMessage.success('已删除（停用）');
    } catch (e) {
      if (removed) _suppliers.value.splice(i, 0, removed);
      ElMessage.error(`删除失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: _suppliers,
    loading: _suppliersLoading,
    loaded: _suppliersLoaded,
    fetch,
    create,
    update,
    remove,
  };
}

// ============================================================================
// useRepricing — 重定价建议 + apply 联动 M1
// ============================================================================
const _reprice = ref([]);
const _repriceLoading = ref(false);

export function useRepricing() {
  async function fetch(params = {}) {
    _repriceLoading.value = true;
    try {
      const res = await repricingApi.list(params);
      _reprice.value = res?.items || res?.recommendations || (Array.isArray(res) ? res : []);
      return _reprice.value;
    } catch (e) {
      ElMessage.error(`加载跟价建议失败：${e.message || e}`);
      return [];
    } finally {
      _repriceLoading.value = false;
    }
  }

  async function apply(id, price, confirmBelowBreakeven = false) {
    try {
      const body = { price };
      if (confirmBelowBreakeven) body.confirmBelowBreakeven = true;
      const r = await repricingApi.apply(id, body);
      const i = _reprice.value.findIndex((x) => x.id === id);
      if (i >= 0 && r) _reprice.value[i] = { ..._reprice.value[i], ...r, status: 'applied' };
      const m1v = r?.m1VersionId || r?.m1_listing_version_id;
      // M2-P0-04: 仅生成 M1 草稿，需到 M1 上架才真实改价
      ElMessage.success(m1v ? `已生成 M1 调价草稿 (version ${m1v})，待 M1 上架生效` : '已生成调价草稿');
      return r;
    } catch (e) {
      // 透传后端 validation_error（含 breakEvenPrice），供页面分流二次确认
      const data = e?.response?.data;
      if (data?.error === 'validation_error') {
        const err = new Error(data.message || '价格校验失败');
        err.validation = data;
        throw err;
      }
      ElMessage.error(`应用失败：${e.message || e}`);
      throw e;
    }
  }

  // M2-P2-06: 拒绝建议
  async function reject(id, reason = '') {
    const i = _reprice.value.findIndex((x) => x.id === id);
    const prev = i >= 0 ? _reprice.value[i].status : null;
    if (i >= 0) _reprice.value[i].status = 'rejected';
    try {
      const r = await repricingApi.reject(id, { reason });
      if (i >= 0 && r) _reprice.value[i] = { ..._reprice.value[i], ...r };
      ElMessage.success('已拒绝该建议');
      return r;
    } catch (e) {
      if (i >= 0) _reprice.value[i].status = prev;
      ElMessage.error(`拒绝失败：${e.message || e}`);
      throw e;
    }
  }

  async function trigger(body) {
    try {
      const r = await repricingApi.trigger(body);
      if (r?.id) _reprice.value.unshift(r);
      ElMessage.success('已触发新跟价建议');
      return r;
    } catch (e) {
      ElMessage.error(`触发失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    list: _reprice,
    loading: _repriceLoading,
    fetch,
    apply,
    reject,
    trigger,
  };
}

// ============================================================================
// useFx — 汇率敞口 / 走势 / 敏感度
// ============================================================================
const _fxData = ref(null);
const _fxLoading = ref(false);

export function useFx() {
  async function fetch(days = 30) {
    _fxLoading.value = true;
    try {
      const [exposures, rates, sensitivity] = await Promise.all([
        fxApi.exposures().catch(() => ({})),
        fxApi.rates({ base: 'USD', quote: 'CNY', days }).catch(() => ({ rateHistory: [] })),
        fxApi.sensitivity().catch(() => ({ sensitivity: [] })),
      ]);
      _fxData.value = {
        ...(exposures || {}),
        rateHistory: rates?.rateHistory || rates?.history || [],
        sensitivity: sensitivity?.sensitivity || sensitivity?.items || [],
      };
      return _fxData.value;
    } catch (e) {
      ElMessage.error(`加载汇率失败：${e.message || e}`);
      return null;
    } finally {
      _fxLoading.value = false;
    }
  }

  return {
    data: _fxData,
    loading: _fxLoading,
    fetch,
  };
}

// ============================================================================
// usePaymentChannels — 支付通道 CRUD
// ============================================================================
const _channels = ref([]);
const _channelsLoading = ref(false);

export function usePaymentChannels() {
  async function fetch(params = {}) {
    _channelsLoading.value = true;
    try {
      const res = await paymentChannelsApi.list(params);
      _channels.value = res?.items || res?.channels || (Array.isArray(res) ? res : []);
      return _channels.value;
    } catch (e) {
      ElMessage.error(`加载支付通道失败：${e.message || e}`);
      return [];
    } finally {
      _channelsLoading.value = false;
    }
  }

  async function create(body) {
    try {
      const r = await paymentChannelsApi.create(body);
      if (r?.id) _channels.value.unshift(r);
      ElMessage.success('通道已添加');
      return r;
    } catch (e) {
      ElMessage.error(`添加失败：${e.message || e}`);
      throw e;
    }
  }

  async function update(id, patch) {
    const i = _channels.value.findIndex((c) => c.id === id);
    const prev = i >= 0 ? { ..._channels.value[i] } : null;
    if (i >= 0) _channels.value[i] = { ..._channels.value[i], ...patch };
    try {
      const r = await paymentChannelsApi.update(id, patch);
      if (i >= 0 && r) _channels.value[i] = r;
      ElMessage.success('已保存');
      return r;
    } catch (e) {
      if (i >= 0 && prev) _channels.value[i] = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
      throw e;
    }
  }

  async function remove(id) {
    const i = _channels.value.findIndex((c) => c.id === id);
    const removed = i >= 0 ? _channels.value.splice(i, 1)[0] : null;
    try {
      await paymentChannelsApi.remove(id);
      ElMessage.success('已删除');
    } catch (e) {
      if (removed) _channels.value.splice(i, 0, removed);
      if (e?.raw?.error === 'cannot_delete_primary') {
        ElMessage.warning('不能删除主通道');
      } else {
        ElMessage.error(`删除失败：${e.message || e}`);
      }
      throw e;
    }
  }

  return {
    list: _channels,
    loading: _channelsLoading,
    fetch,
    create,
    update,
    remove,
  };
}

// ============================================================================
// useAlerts — 自定义告警 rules + events
// ============================================================================
const _rules = ref([]);
const _rulesLoading = ref(false);
const _events = ref([]);
const _eventsLoading = ref(false);

export function useAlerts() {
  async function fetchRules(params = {}) {
    _rulesLoading.value = true;
    try {
      const res = await alertsApi.rules.list(params);
      _rules.value = res?.items || res?.rules || (Array.isArray(res) ? res : []);
      return _rules.value;
    } catch (e) {
      ElMessage.error(`加载报警规则失败：${e.message || e}`);
      return [];
    } finally {
      _rulesLoading.value = false;
    }
  }

  async function fetchEvents(params = {}) {
    _eventsLoading.value = true;
    try {
      const res = await alertsApi.events.list(params);
      _events.value = res?.items || res?.events || (Array.isArray(res) ? res : []);
      return _events.value;
    } catch (e) {
      ElMessage.error(`加载触发记录失败：${e.message || e}`);
      return [];
    } finally {
      _eventsLoading.value = false;
    }
  }

  async function createRule(body) {
    try {
      const r = await alertsApi.rules.create(body);
      if (r?.id) _rules.value.unshift(r);
      ElMessage.success('规则已创建');
      return r;
    } catch (e) {
      ElMessage.error(`创建失败：${e.message || e}`);
      throw e;
    }
  }

  async function updateRule(id, patch) {
    const i = _rules.value.findIndex((r) => r.id === id);
    const prev = i >= 0 ? { ..._rules.value[i] } : null;
    if (i >= 0) _rules.value[i] = { ..._rules.value[i], ...patch };
    try {
      const r = await alertsApi.rules.update(id, patch);
      if (i >= 0 && r) _rules.value[i] = r;
      ElMessage.success('已保存');
      return r;
    } catch (e) {
      if (i >= 0 && prev) _rules.value[i] = prev;
      ElMessage.error(`保存失败：${e.message || e}`);
      throw e;
    }
  }

  async function removeRule(id) {
    const i = _rules.value.findIndex((r) => r.id === id);
    const removed = i >= 0 ? _rules.value.splice(i, 1)[0] : null;
    try {
      await alertsApi.rules.remove(id);
      ElMessage.success('规则已删除');
    } catch (e) {
      if (removed) _rules.value.splice(i, 0, removed);
      ElMessage.error(`删除失败：${e.message || e}`);
      throw e;
    }
  }

  async function ackEvent(id, ackBy) {
    const i = _events.value.findIndex((e) => e.id === id);
    const prev = i >= 0 ? _events.value[i].acknowledged : null;
    if (i >= 0) _events.value[i].acknowledged = true;
    try {
      const r = await alertsApi.events.ack(id, ackBy ? { ackBy } : {});
      if (i >= 0 && r) _events.value[i] = { ..._events.value[i], ...r };
      ElMessage.success('已确认');
      return r;
    } catch (e) {
      if (i >= 0) _events.value[i].acknowledged = prev;
      ElMessage.error(`确认失败：${e.message || e}`);
      throw e;
    }
  }

  // M2-P3-01: 批量确认
  async function ackBatch(ids, ackBy) {
    try {
      const r = await alertsApi.events.ackBatch(ids, ackBy);
      const set = new Set(ids);
      _events.value = _events.value.map((e) => set.has(e.id) ? { ...e, acknowledged: true } : e);
      ElMessage.success(`已确认 ${r?.acknowledged ?? ids.length} 条`);
      return r;
    } catch (e) {
      ElMessage.error(`批量确认失败：${e.message || e}`);
      throw e;
    }
  }

  // M2-P0-07: 扫描 / 立即测试规则
  async function scan(body = {}) {
    return alertsApi.scan(body);
  }

  return {
    rules: _rules,
    rulesLoading: _rulesLoading,
    events: _events,
    eventsLoading: _eventsLoading,
    fetchRules,
    fetchEvents,
    createRule,
    updateRule,
    removeRule,
    ackEvent,
    ackBatch,
    scan,
  };
}

// ============================================================================
// useDimensions — 多维度归集（M2 共享给 useTax / useLTV / useInventoryLink）
// ============================================================================
const _dimensionsCache = new Map(); // by => { items, loading }

export function useDimensions() {
  async function fetch(by = 'brand', force = false) {
    if (!force && _dimensionsCache.has(by)) return _dimensionsCache.get(by);
    const state = { items: ref([]), loading: ref(true), error: ref(null) };
    _dimensionsCache.set(by, state);
    try {
      const res = await dimensionsApi.aggregate({ by });
      state.items.value = res?.items || res?.dimensions || (Array.isArray(res) ? res : []);
    } catch (e) {
      state.error.value = e;
      ElMessage.error(`加载维度失败：${e.message || e}`);
      state.items.value = [];
    } finally {
      state.loading.value = false;
    }
    return state;
  }
  return { fetch };
}

// ============================================================================
// useTax — 税务摘要 + 记录 + 申报
// ============================================================================
const _taxSummary = ref(null);
const _taxRecords = ref([]);
const _taxLoading = ref(false);

export function useTax() {
  async function fetch(params = {}) {
    _taxLoading.value = true;
    try {
      const [summary, records] = await Promise.all([
        taxApi.summary().catch(() => null),
        taxApi.records(params).catch(() => ({ items: [] })),
      ]);
      _taxSummary.value = summary;
      _taxRecords.value = records?.items || records?.records || (Array.isArray(records) ? records : []);
      return { summary: _taxSummary.value, records: _taxRecords.value };
    } catch (e) {
      ElMessage.error(`加载税务失败：${e.message || e}`);
      return null;
    } finally {
      _taxLoading.value = false;
    }
  }

  async function file(id, filingRef) {
    try {
      const r = await taxApi.file(id, { filingRef });
      const i = _taxRecords.value.findIndex((rec) => rec.id === id);
      if (i >= 0 && r) _taxRecords.value[i] = { ..._taxRecords.value[i], ...r, status: 'filed' };
      ElMessage.success('已标记为已申报');
      return r;
    } catch (e) {
      ElMessage.error(`标记失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    summary: _taxSummary,
    records: _taxRecords,
    loading: _taxLoading,
    fetch,
    file,
  };
}

// ============================================================================
// useLTV — LTV SKU 列表
// ============================================================================
const _ltv = ref([]);
const _ltvLoading = ref(false);

export function useLTV() {
  async function fetch(params = {}) {
    _ltvLoading.value = true;
    try {
      const res = await ltvApi.list(params);
      _ltv.value = res?.items || res?.skus || (Array.isArray(res) ? res : []);
      return _ltv.value;
    } catch (e) {
      ElMessage.error(`加载 LTV 失败：${e.message || e}`);
      return [];
    } finally {
      _ltvLoading.value = false;
    }
  }
  return {
    list: _ltv,
    loading: _ltvLoading,
    fetch,
  };
}

// ============================================================================
// useInventoryLink — 库存联动 config + events
// ============================================================================
const _ilConfig = ref(null);
const _ilEvents = ref([]);
const _ilLoading = ref(false);

export function useInventoryLink() {
  async function fetch(params = {}) {
    _ilLoading.value = true;
    try {
      const [config, events] = await Promise.all([
        inventoryLinkApi.config().catch(() => null),
        inventoryLinkApi.events(params).catch(() => ({ items: [] })),
      ]);
      _ilConfig.value = config;
      _ilEvents.value = events?.items || events?.events || (Array.isArray(events) ? events : []);
      return { config: _ilConfig.value, events: _ilEvents.value };
    } catch (e) {
      ElMessage.error(`加载库存联动失败：${e.message || e}`);
      return null;
    } finally {
      _ilLoading.value = false;
    }
  }

  async function saveConfig(body) {
    try {
      const r = await inventoryLinkApi.saveConfig(body);
      _ilConfig.value = r || body;
      ElMessage.success('配置已保存');
      return r;
    } catch (e) {
      ElMessage.error(`保存失败：${e.message || e}`);
      throw e;
    }
  }

  async function executeEvent(id) {
    try {
      const r = await inventoryLinkApi.execute(id);
      const i = _ilEvents.value.findIndex((ev) => ev.id === id);
      if (i >= 0 && r) _ilEvents.value[i] = { ..._ilEvents.value[i], ...r };
      ElMessage.success('已执行');
      return r;
    } catch (e) {
      ElMessage.error(`执行失败：${e.message || e}`);
      throw e;
    }
  }

  return {
    config: _ilConfig,
    events: _ilEvents,
    loading: _ilLoading,
    fetch,
    saveConfig,
    executeEvent,
  };
}
