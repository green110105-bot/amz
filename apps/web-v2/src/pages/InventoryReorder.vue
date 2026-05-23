<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { useReorder, useSuppliers } from '../composables/useM2State';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'sku', label: 'SKU', formatter: (v, r) => v || r.productId },
  { prop: 'reorder.urgency', label: '紧急度', formatter: (v, r) => v || r.urgency || '-' },
  { prop: 'reorder.recommendedQty', label: '建议量', formatter: (v, r) => v ?? r.recommendedQty ?? '-' },
  { prop: 'reorder.daysRemaining', label: '可卖天数', formatter: (v, r) => `${v ?? r.daysRemaining ?? '-'} 天` },
];

const route = useRoute();
const router = useRouter();
const reorder = useReorder();
const suppliers = useSuppliers();

const urgencyFilter = ref(route.query.urgency || 'all');
const statusFilter = ref(route.query.status || 'all');
const draftKey = 'm2:draft:reorder_po';

const draft = ref({ supplierId: '', shippingMethod: 'ocean_freight', notes: '' });
const draftRowId = ref(null);
const draftDialog = ref(false);

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey);
    if (v) draft.value = { ...draft.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() {
  try { localStorage.setItem(draftKey, JSON.stringify(draft.value)); } catch {}
}
function clearDraft() { try { localStorage.removeItem(draftKey); } catch {} }

async function load() {
  const params = {};
  if (urgencyFilter.value !== 'all') params.urgency = urgencyFilter.value;
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await reorder.fetch(params);
}

watch([urgencyFilter, statusFilter], () => {
  router.replace({
    query: {
      ...route.query,
      urgency: urgencyFilter.value === 'all' ? undefined : urgencyFilter.value,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    },
  });
  load();
});

watch(draft, saveDraft, { deep: true });

onMounted(async () => {
  loadDraft();
  await load();
  await suppliers.fetch();
});

function openPoDialog(row) {
  draftRowId.value = row.id || row.productId;
  if (row.reorder?.supplierId) draft.value.supplierId = row.reorder.supplierId;
  draftDialog.value = true;
}

async function submitPO() {
  try {
    const r = await reorder.createPO(draftRowId.value, {
      supplierId: draft.value.supplierId,
      shippingMethod: draft.value.shippingMethod,
      notes: draft.value.notes,
    });
    draftDialog.value = false;
    clearDraft();
    draft.value = { supplierId: '', shippingMethod: 'ocean_freight', notes: '' };
    if (r?.poId || r?.id) {
      ElMessageBox.confirm(`PO ${r.poNumber || r.id} 已创建，跳转到采购单？`, '提示', { confirmButtonText: '去查看', cancelButtonText: '留在此页' })
        .then(() => router.push({ path: '/inventory/po', query: { id: r.poId || r.id } }))
        .catch(() => {});
    }
    await load();
  } catch {}
}

async function dismiss(row) {
  try {
    await ElMessageBox.confirm('确认忽略此补货建议？', '提示', { type: 'warning' });
    await reorder.dismiss(row.id || row.productId);
    await load();
  } catch {}
}

const list = computed(() => reorder.list.value || []);
const urgencyTag = (u) => ({ critical: 'danger', high: 'warning', medium: 'info', low: 'success' }[u] || 'info');
</script>

<template>
  <div>
    <PageHeader title="库存与补货" subtitle="基于销量预测 + 利润率 + 海运周期的补货决策">
      <template #extra>
        <el-select v-model="urgencyFilter" size="default" style="width: 130px">
          <el-option label="全部紧急" value="all" />
          <el-option label="critical" value="critical" />
          <el-option label="high" value="high" />
          <el-option label="medium" value="medium" />
          <el-option label="low" value="low" />
        </el-select>
        <el-select v-model="statusFilter" size="default" style="width: 130px">
          <el-option label="全部状态" value="all" />
          <el-option label="待处理" value="pending" />
          <el-option label="草稿已建" value="drafted" />
          <el-option label="已下单" value="ordered" />
        </el-select>
        <el-button :icon="'Refresh'" @click="load" :loading="reorder.loading.value">刷新</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <h2 class="section-title">补货建议</h2>
          <span class="text-muted">{{ list.length }} 个 SKU</span>
        </div>
      </template>
      <ResponsiveTable :data="list" :mobile-columns="mobileCols" v-loading="reorder.loading.value" stripe size="default" empty-text="无数据">
        <el-table-column label="SKU / Product" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.sku || row.productId }}</strong>
            <span v-if="row.asin" class="text-muted" style="margin-left: 6px">{{ row.asin }}</span>
          </template>
        </el-table-column>
        <el-table-column label="紧急度" width="100">
          <template #default="{ row }">
            <el-tag :type="urgencyTag(row.reorder?.urgency || row.urgency)" size="small" effect="light">{{ row.reorder?.urgency || row.urgency || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="建议补货量" width="140" align="right">
          <template #default="{ row }">
            <span class="tnum">{{ row.reorder?.recommendedQty ?? row.recommendedQty ?? '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="资金需求" width="140" align="right">
          <template #default="{ row }">
            <span class="tnum">{{ (row.reorder?.capitalRequired || row.capitalRequired) ? formatCurrency(row.reorder?.capitalRequired || row.capitalRequired) : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="可卖天数" width="120" align="right">
          <template #default="{ row }">
            <span class="tnum">{{ row.reorder?.daysRemaining ?? row.daysRemaining ?? '-' }} 天</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'drafted' ? 'success' : row.status === 'ordered' ? 'primary' : 'info'">{{ row.status || 'pending' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain :disabled="row.status === 'drafted' || row.status === 'ordered'" @click="openPoDialog(row)">生成 PO 草稿</el-button>
            <el-button size="small" plain @click="dismiss(row)">忽略</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" :disabled="row.status === 'drafted' || row.status === 'ordered'" @click.stop="openPoDialog(row)">PO 草稿</el-button>
          <el-button size="small" @click.stop="dismiss(row)">忽略</el-button>
        </template>
      </ResponsiveTable>
      <EmptyState v-if="!reorder.loading.value && list.length === 0" title="无补货建议" description="当前无 SKU 触发补货阈值" />
    </el-card>

    <ResponsiveDialog v-model="draftDialog" title="生成 PO 草稿" width="480px">
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
        <el-form-item label="备注">
          <el-input v-model="draft.notes" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="draftDialog = false">取消</el-button>
        <el-button type="primary" @click="submitPO">创建草稿</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
</style>
