<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useTransfers } from '../composables/useM2State';
import { formatCurrency } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const transfers = useTransfers();

const statusFilter = ref(route.query.status || 'all');

async function load() {
  const params = {};
  if (statusFilter.value !== 'all') params.status = statusFilter.value;
  await transfers.fetch(params);
}

watch(statusFilter, () => {
  router.replace({ query: { ...route.query, status: statusFilter.value === 'all' ? undefined : statusFilter.value } });
  load();
});

onMounted(load);

async function approve(t) {
  try {
    await ElMessageBox.confirm(`确认批准 ${t.sku} ${t.transferQty} 件 ${t.fromWarehouse || t.from}→${t.toWarehouse || t.to}？`, '调拨', { type: 'info' });
    await transfers.approve(t.id);
  } catch {}
}

async function cancel(t) {
  try {
    await ElMessageBox.confirm('确认取消此调拨？', '提示', { type: 'warning' });
    await transfers.cancel(t.id);
  } catch {}
}

function statusType(s) {
  return { recommended: '', approved: 'primary', in_transit: 'warning', received: 'success', cancelled: 'info' }[s] || 'info';
}
function statusLabel(s) {
  return { recommended: '已推荐', approved: '已批准', in_transit: '在途', received: '已入仓', cancelled: '已取消' }[s] || s;
}

const list = computed(() => transfers.list.value || []);
const mobileCols = [
  { prop: 'sku', label: 'SKU' },
  { prop: 'from', label: '路径', formatter: (v, r) => `${v || r.fromWarehouse} → ${r.to || r.toWarehouse}` },
  { prop: 'transferQty', label: '数量' },
  { prop: 'savings', label: '节省', formatter: (v) => formatCurrency(v) },
  { prop: 'status', label: '状态', formatter: (v) => statusLabel(v) },
];
</script>

<template>
  <div>
    <PageHeader title="跨仓调拨建议" subtitle="多 FBA 仓 滞销→缺货 调拨优化（vs 重新采购）">
      <template #extra>
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="recommended">推荐</el-radio-button>
          <el-radio-button value="approved">已批准</el-radio-button>
          <el-radio-button value="in_transit">在途</el-radio-button>
          <el-radio-button value="received">已收</el-radio-button>
        </el-radio-group>
        <el-button :icon="'Refresh'" @click="load" :loading="transfers.loading.value">重新扫描</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">推荐调拨</h2>
          <span class="text-muted">仅推荐"调拨成本 &lt; 重新采购成本"的方案</span>
        </div>
      </template>
      <ResponsiveTable :data="list" :mobile-columns="mobileCols" v-loading="transfers.loading.value" stripe empty-text="无调拨建议">
        <el-table-column prop="sku" label="SKU" width="120" />
        <el-table-column label="路径" width="180">
          <template #default="{ row }">
            <strong>{{ row.from || row.fromWarehouse }}</strong>
            <el-icon style="margin: 0 6px"><Right /></el-icon>
            <strong>{{ row.to || row.toWarehouse }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="调拨数量" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ row.transferQty }}</span></template></el-table-column>
        <el-table-column label="调拨成本" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.transferCost) }}</span></template></el-table-column>
        <el-table-column label="重新采购成本" align="right" width="120"><template #default="{ row }"><span class="tnum text-muted">{{ formatCurrency(row.repurchaseCost) }}</span></template></el-table-column>
        <el-table-column label="节省" align="right" width="120"><template #default="{ row }"><strong class="tnum text-success">{{ formatCurrency(row.savings) }}</strong></template></el-table-column>
        <el-table-column prop="reason" label="原因" min-width="200" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain :disabled="row.status !== 'recommended'" @click="approve(row)">批准</el-button>
            <el-button size="small" plain :disabled="row.status === 'cancelled' || row.status === 'received'" @click="cancel(row)">取消</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" :disabled="row.status !== 'recommended'" @click.stop="approve(row)">批准</el-button>
          <el-button size="small" :disabled="row.status === 'cancelled' || row.status === 'received'" @click.stop="cancel(row)">取消</el-button>
        </template>
      </ResponsiveTable>
      <EmptyState v-if="!transfers.loading.value && list.length === 0" title="无调拨建议" description="当前无符合经济性的调拨方案" />
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">调拨注意</h2></template>
      <ul class="explain">
        <li>不同国家间调拨涉及关税 / 重新申报，仅经济性 + 政策可行才推荐</li>
        <li>调拨周期通常 7-14 天，不适合"明天就要补"的紧急场景</li>
        <li>系统每周扫描一次，结合滞销 / 断货数据生成建议</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.explain { font-size: 13px; line-height: 1.8; padding-left: 18px; color: var(--text-muted); }
</style>
