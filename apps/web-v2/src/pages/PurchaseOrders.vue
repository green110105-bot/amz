<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import ResponsiveDrawer from '../components/ResponsiveDrawer.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { usePO, useSuppliers } from '../composables/useM2State';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const po = usePO();
const suppliers = useSuppliers();

const statusFilter = ref(route.query.status || 'all');
const drawer = ref(false);
const current = ref(null);
const detailLoading = ref(false);

const draftKey = 'm2:draft:po_create';
const createDialog = ref(false);
const draft = ref({
  supplierId: '',
  items: [{ sku: '', qty: 0, unitCost: 0 }],
  shippingMethod: 'ocean_freight',
  notes: '',
});

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey);
    if (v) draft.value = { ...draft.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() { try { localStorage.setItem(draftKey, JSON.stringify(draft.value)); } catch {} }
function clearDraft() { try { localStorage.removeItem(draftKey); } catch {} }

const STATUSES = [
  { id: 'all', label: '全部' },
  { id: 'draft', label: '草稿' },
  { id: 'ordered', label: '已发出' },
  { id: 'in_transit', label: '海运中' },
  { id: 'received', label: '已入仓' },
  { id: 'cancelled', label: '已取消' },
  { id: 'disputed', label: '争议' },
];

const TIMELINE = [
  { id: 'draft', label: '草稿' },
  { id: 'ordered', label: '已发出' },
  { id: 'in_transit', label: '海运中' },
  { id: 'received', label: '已入仓' },
];

async function load() {
  const params = {};
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await po.fetch(params);
  // 若 URL 带 id 参数，自动打开抽屉
  if (route.query.id) {
    await openDetailById(route.query.id);
  }
}

watch(statusFilter, () => {
  router.replace({
    query: { ...route.query, status: statusFilter.value === 'all' ? undefined : statusFilter.value },
  });
  load();
});

watch(draft, saveDraft, { deep: true });

onMounted(async () => {
  loadDraft();
  await load();
  await suppliers.fetch();
});

async function openDetail(p) {
  drawer.value = true;
  detailLoading.value = true;
  router.replace({ query: { ...route.query, id: p.id, tab: 'detail' } });
  try {
    current.value = await po.fetchDetail(p.id) || p;
  } finally {
    detailLoading.value = false;
  }
}
async function openDetailById(id) {
  drawer.value = true;
  detailLoading.value = true;
  try {
    current.value = await po.fetchDetail(id);
  } finally {
    detailLoading.value = false;
  }
}

watch(drawer, (v) => {
  if (!v) {
    const q = { ...route.query };
    delete q.id; delete q.tab;
    router.replace({ query: q });
  }
});

function statusType(s) {
  return { draft: '', ordered: 'primary', in_transit: 'warning', received: 'success', cancelled: 'info', disputed: 'danger' }[s] || '';
}
function statusLabel(s) {
  return { draft: '草稿', ordered: '已发出', in_transit: '海运中', received: '已入仓', cancelled: '已取消', disputed: '争议' }[s] || s;
}

async function transition(p, next, extra = {}) {
  try {
    await ElMessageBox.confirm(`确认将 PO ${p.poNumber || p.id} 推进至 ${statusLabel(next)}?`, '状态推进', { type: 'info' });
    await po.transition(p.id, next, extra);
    if (current.value && current.value.id === p.id) {
      current.value = await po.fetchDetail(p.id) || current.value;
    }
  } catch {}
}

async function markPayment(p, phase) {
  try {
    const r = await po.payment(p.id, { phase, paid: true, paidAt: new Date().toISOString() });
    if (current.value && current.value.id === p.id) {
      current.value = await po.fetchDetail(p.id) || current.value;
    }
  } catch {}
}

function timelineActiveIndex(status) {
  return TIMELINE.findIndex((t) => t.id === status);
}

function addItem() {
  draft.value.items.push({ sku: '', qty: 0, unitCost: 0 });
}
function removeItem(i) {
  draft.value.items.splice(i, 1);
}

async function submitCreate() {
  if (!draft.value.supplierId) { ElMessage.warning('请选择供应商'); return; }
  if (!draft.value.items.length || !draft.value.items[0].sku) { ElMessage.warning('请添加至少一个商品'); return; }
  try {
    const r = await po.create(draft.value);
    createDialog.value = false;
    clearDraft();
    draft.value = {
      supplierId: '',
      items: [{ sku: '', qty: 0, unitCost: 0 }],
      shippingMethod: 'ocean_freight',
      notes: '',
    };
    await load();
    if (r?.id) openDetail(r);
  } catch {}
}

const list = computed(() => po.list.value || []);
const filtered = computed(() => list.value);

const mobileCols = [
  { prop: 'poNumber', label: 'PO 号', formatter: (v, r) => v || r.po_number || r.id },
  { prop: 'supplierName', label: '供应商', formatter: (v, r) => v || r.supplier_name || r.supplier || '-' },
  { prop: 'totalLanded', label: '到岸总额', formatter: (v, r) => formatCurrency(v || r.total_landed) },
  { prop: 'status', label: '状态', formatter: (v) => statusLabel(v) },
  { prop: 'expectedAt', label: '预计到货', formatter: (v, r) => v || r.expected_at || '-' },
];
</script>

<template>
  <div>
    <PageHeader title="采购单" subtitle="PO 全生命周期：草稿 → 已发出 → 海运中 → 已入仓">
      <template #extra>
        <el-button type="primary" :icon="'Plus'" @click="createDialog = true">新建 PO</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <template #header>
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button v-for="s in STATUSES" :key="s.id" :value="s.id">{{ s.label }}</el-radio-button>
        </el-radio-group>
      </template>
      <ResponsiveTable :data="filtered" :mobile-columns="mobileCols" row-clickable v-loading="po.loading.value" stripe @row-click="openDetail" size="default" empty-text="暂无 PO">
        <el-table-column label="PO 号" width="160">
          <template #default="{ row }">
            <strong>{{ row.poNumber || row.po_number || row.id }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="供应商" width="160">
          <template #default="{ row }">{{ row.supplierName || row.supplier_name || row.supplier || '-' }}</template>
        </el-table-column>
        <el-table-column label="商品" min-width="180">
          <template #default="{ row }">
            <span v-for="(it, i) in row.items || []" :key="i">{{ it.sku }} × {{ it.qty }}<br v-if="i < (row.items || []).length - 1" /></span>
            <span v-if="!row.items || !row.items.length" class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="到岸总额" align="right" width="140">
          <template #default="{ row }"><span class="tnum">{{ formatCurrency(row.totalLanded || row.total_landed) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="预计到货" width="120"><template #default="{ row }">{{ row.expectedAt || row.expected_at || '-' }}</template></el-table-column>
        <el-table-column label="跟踪号" width="140"><template #default="{ row }"><span class="tnum text-muted">{{ row.tracking || '-' }}</span></template></el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click.stop="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click.stop="openDetail(row)">详情</el-button>
        </template>
      </ResponsiveTable>
      <EmptyState v-if="!po.loading.value && filtered.length === 0" title="无采购单" description="当前筛选无 PO" />
    </el-card>

    <ResponsiveDrawer v-model="drawer" :title="current ? `PO ${current.poNumber || current.id}` : ''" size="640px">
      <MobileFallback v-if="isMobile && current" page-name="PO 详情编辑" reason="PO 多商品行编辑请在桌面端操作。下方为只读概览。">
        <template #readonly>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="PO 号">{{ current.poNumber || current.po_number || current.id }}</el-descriptions-item>
            <el-descriptions-item label="供应商">{{ current.supplierName || current.supplier_name || current.supplier }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ statusLabel(current.status) }}</el-descriptions-item>
            <el-descriptions-item label="到岸总额">{{ formatCurrency(current.totalLanded || current.total_landed) }}</el-descriptions-item>
            <el-descriptions-item label="定金">{{ formatCurrency(current.deposit) }} · {{ current.depositPaid || current.deposit_paid ? '已付' : '未付' }}</el-descriptions-item>
            <el-descriptions-item label="尾款">{{ formatCurrency(current.balance) }} · {{ current.balancePaid || current.balance_paid ? '已付' : '待付' }}</el-descriptions-item>
            <el-descriptions-item label="预计到货">{{ current.expectedAt || current.expected_at || '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-button style="margin-top: 16px" @click="drawer = false">返回列表</el-button>
        </template>
      </MobileFallback>
      <div v-else-if="current" v-loading="detailLoading">
        <h4 class="detail-title">流转时间线</h4>
        <el-steps :active="timelineActiveIndex(current.status) + 1" finish-status="success" simple>
          <el-step v-for="t in TIMELINE" :key="t.id" :title="t.label" />
        </el-steps>

        <h4 class="detail-title">基本信息</h4>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="供应商">{{ current.supplierName || current.supplier_name || current.supplier }}</el-descriptions-item>
          <el-descriptions-item label="状态"><el-tag :type="statusType(current.status)" size="small">{{ statusLabel(current.status) }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="发运方式">{{ ({ ocean_freight: '海运', air_freight: '空运', express: '快递' })[current.shippingMethod || current.shipping_method] || '-' }}</el-descriptions-item>
          <el-descriptions-item label="跟踪号">{{ current.tracking || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下单日期">{{ current.orderedAt || current.ordered_at || '-' }}</el-descriptions-item>
          <el-descriptions-item label="预计到货">{{ current.expectedAt || current.expected_at || '-' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="detail-title">商品明细</h4>
        <el-table :data="current.items || []" border size="small">
          <el-table-column prop="sku" label="SKU" />
          <el-table-column prop="qty" label="数量" align="right" />
          <el-table-column label="单价" align="right"><template #default="{ row }">{{ formatCurrency(row.unitCost || row.unit_cost, 'USD') }}</template></el-table-column>
          <el-table-column label="小计" align="right"><template #default="{ row }">{{ formatCurrency(row.subtotal || (row.qty * (row.unitCost || row.unit_cost))) }}</template></el-table-column>
        </el-table>

        <h4 class="detail-title">付款</h4>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-card shadow="never">
              <span class="text-muted">定金</span>
              <div class="big tnum">{{ formatCurrency(current.deposit) }}</div>
              <el-tag size="small" :type="current.depositPaid || current.deposit_paid ? 'success' : ''">{{ current.depositPaid || current.deposit_paid ? '已支付' : '未支付' }}</el-tag>
              <el-button v-if="!(current.depositPaid || current.deposit_paid)" size="small" plain style="margin-left: 8px" @click="markPayment(current, 'deposit')">标记已付</el-button>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never">
              <span class="text-muted">尾款</span>
              <div class="big tnum">{{ formatCurrency(current.balance) }}</div>
              <el-tag size="small" :type="current.balancePaid || current.balance_paid ? 'success' : 'warning'">{{ current.balancePaid || current.balance_paid ? '已支付' : '待支付' }}</el-tag>
              <el-button v-if="!(current.balancePaid || current.balance_paid)" size="small" plain style="margin-left: 8px" @click="markPayment(current, 'balance')">标记已付</el-button>
            </el-card>
          </el-col>
        </el-row>

        <h4 class="detail-title">操作</h4>
        <el-button type="primary" v-if="current.status === 'draft'" @click="transition(current, 'ordered')">提交并发给供应商</el-button>
        <el-button type="primary" v-if="current.status === 'ordered'" @click="transition(current, 'in_transit')">标记发运</el-button>
        <el-button type="success" v-if="current.status === 'in_transit'" @click="transition(current, 'received')">标记入仓</el-button>
        <el-button :icon="'Document'" plain>下载 PI / CI / BL</el-button>
      </div>
    </ResponsiveDrawer>

    <ResponsiveDialog v-model="createDialog" title="新建采购单" width="640px">
      <el-form :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'left'">
        <el-form-item label="供应商">
          <el-select v-model="draft.supplierId" placeholder="选择供应商" style="width: 100%">
            <el-option v-for="s in suppliers.list.value" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发运方式">
          <el-radio-group v-model="draft.shippingMethod">
            <el-radio-button value="ocean_freight">海运</el-radio-button>
            <el-radio-button value="air_freight">空运</el-radio-button>
            <el-radio-button value="express">快递</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="商品">
          <div v-for="(item, i) in draft.items" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px">
            <el-input v-model="item.sku" placeholder="SKU" style="flex: 1" />
            <el-input-number v-model="item.qty" :min="1" placeholder="数量" />
            <el-input-number v-model="item.unitCost" :min="0" :precision="2" placeholder="单价" />
            <el-button :icon="'Delete'" plain @click="removeItem(i)" />
          </div>
          <el-button :icon="'Plus'" size="small" @click="addItem">添加商品</el-button>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="draft.notes" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">创建草稿</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.detail-title { font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 24px 0 12px; letter-spacing: 0.04em; text-transform: uppercase; }
.big { font-size: 22px; font-weight: 700; margin: 4px 0 6px; }
</style>
