<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useTargetings } from '../../../composables/useLxState';
import { tabAiSignals } from '../../../utils/ads-integration';
import { actionQueueApi } from '../../../api/ads-timeline';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';
import BatchActionBar from '../../../components/BatchActionBar.vue';
import BidAdjustModal from '../../../components/BidAdjustModal.vue';
import AdAnalysisDrawer from '../../../components/AdAnalysisDrawer.vue';

const mobileCols = [
  { prop: 'term', label: '投放内容' },
  { prop: 'type', label: '类型' },
  { prop: 'bid', label: 'Bid', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
];

const router = useRouter();
const props = defineProps({ campaign: Object });

const { list: rows, fetch, setBid, toggle } = useTargetings(props.campaign.id);
const aiSignals = computed(() => tabAiSignals(props.campaign.id));

const showCompare = ref(false);
const tabFilter = ref('all'); // all / keyword / product / category
const filteredRows = computed(() => {
  if (tabFilter.value === 'all') return rows.value;
  return rows.value.filter((r) => r.type === tabFilter.value);
});

// ----- batch selection -----
const tableRef = ref(null);
const selected = ref([]);
function onSelectionChange(rows) { selected.value = rows; }
function clearSelection() { tableRef.value?.clearSelection(); selected.value = []; }

// ----- bid adjust modal -----
const showBidModal = ref(false);
function openBidModal() {
  if (selected.value.length === 0) return;
  showBidModal.value = true;
}

async function commitBulkBid({ items }) {
  try {
    await actionQueueApi.enqueue({
      sourceStrategyName: 'LX manual bulk operation',
      entity: { kind: 'targeting_bulk', id: props.campaign.id, name: props.campaign.name },
      typedAction: {
        actionPrimitive: 'BULK_ADJUST_TARGETING_BID',
        sourceSurface: 'lx',
        entityKind: 'targeting',
        currentValue: { selectedCount: items.length },
        recommendedValue: { items },
        dryRun: true,
        auditRequired: true,
      },
      guardrail: { status: 'needs_review', reasons: ['manual_lx_write_requires_action_queue'] },
      rollbackPlan: { method: 'restore_previous_targeting_bids', needsManualReview: true },
      note: 'bulk targeting bid change queued from LX surface',
    });
    ElMessage.success(`Added ${items.length} bid changes to Action Queue`);
    clearSelection();
  } catch (err) {
    ElMessage.error('Queue failed: ' + (err?.message || err));
  }
}

// ----- batch state toggle -----
// M3-P0-06: pass the REAL reactive row to toggle (the composable reads the live value and
// flips it internally). The previous `toggle({ ...row, enabled: !row.enabled })` passed a
// detached copy (so the real table row never changed) AND pre-inverted the desired value
// (so the enqueued value was the opposite of the user's intent). We also drop the
// unconditional success toast — report the real per-row outcome instead.
async function commitBulkState({ enabled }) {
  const targets = selected.value.filter((row) => Boolean(row.enabled) !== enabled);
  if (!targets.length) {
    ElMessage.info(`所选投放均已${enabled ? '启用' : '暂停'}`);
    return;
  }
  let ok = 0, fail = 0;
  for (const row of targets) {
    try {
      await toggle(row); // real reactive row; composable flips current → desired
      ok += 1;
    } catch {
      fail += 1;
    }
  }
  if (fail === targets.length) {
    ElMessage.error(`状态切换失败:${fail} 条均未成功`);
  } else {
    ElMessage({
      message: `已加入执行篮 ${ok} 条(待审核+dry-run)${fail ? ` · ${fail} 条失败` : ''}`,
      type: fail ? 'warning' : 'success',
    });
  }
  clearSelection();
  await fetch();
}

// ----- batch delete -----
async function commitBulkDelete() {
  try {
    await ElMessageBox.confirm(
      `Queue ${selected.value.length} targeting removals for approval and dry-run?`,
      'Queue removal',
      { type: 'warning', confirmButtonText: 'Queue', cancelButtonText: 'Cancel' },
    );
  } catch { return; /* cancelled */ }
  try {
    await actionQueueApi.enqueue({
      sourceStrategyName: 'LX manual bulk operation',
      entity: { kind: 'targeting_bulk', id: props.campaign.id, name: props.campaign.name },
      typedAction: {
        actionPrimitive: 'BULK_REMOVE_TARGETING',
        sourceSurface: 'lx',
        entityKind: 'targeting',
        currentValue: { items: selected.value.map((row) => ({ id: row.id, term: row.term, asin: row.asin, category: row.category })) },
        recommendedValue: { removed: true },
        dryRun: true,
        auditRequired: true,
      },
      guardrail: { status: 'needs_review', reasons: ['manual_lx_write_requires_action_queue'] },
      rollbackPlan: { method: 'restore_removed_targetings', needsManualReview: true },
      note: 'bulk targeting removal queued from LX surface',
    });
    ElMessage.success(`Added ${selected.value.length} removals to Action Queue`);
    clearSelection();
  } catch (err) {
    ElMessage.error('Queue failed: ' + (err?.message || err));
  }
}

onMounted(() => { fetch(); });

// M3-P2-21: front-end CSV export of currently-loaded targeting rows.
function exportCsv() {
  const cols = ['term', 'type', 'bid', 'spend', 'sales', 'acos'];
  const csv = [cols.join(','), ...filteredRows.value.map((r) => cols.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'targetings.csv'; a.click();
  URL.revokeObjectURL(url);
}

async function changeBid(row, val, oldVal) {
  await setBid(row, val, oldVal);
}

async function onSwitch(row, value) {
  await toggle(row, value);
}

// ----- AdAnalysisDrawer (点行打开详情) -----
const drawerVisible = ref(false);
const drawerEntity = ref({});
const drawerInitialTab = ref('daily');

function openAnalysisDrawer(row, tab = 'daily') {
  drawerEntity.value = {
    id: row.id,
    type: row.type === 'keyword' ? 'keyword' : 'target',
    name: row.term || row.asin || row.category,
    term: row.term,
    asin: row.asin,
    matchType: row.matchType,
  };
  drawerInitialTab.value = tab;
  drawerVisible.value = true;
}
</script>

<template>
  <!-- AI 提示横幅 -->
  <div v-if="aiSignals.promote > 0 || aiSignals.bid > 0" class="ai-hint">
    <span class="ai-icon">🤖</span>
    <div class="ai-text">
      <strong>AI 在该 Campaign 的投放上检测到：</strong>
      <span v-if="aiSignals.promote">{{ aiSignals.promote }} 个可升手动 · </span>
      <span v-if="aiSignals.bid">{{ aiSignals.bid }} 个建议调 bid</span>
    </div>
    <el-button size="small" type="primary" :icon="'Right'" @click="router.push('/ads/timeline')">去 Timeline 处理</el-button>
  </div>

  <div class="sub-toolbar">
    <el-radio-group v-model="tabFilter" size="default">
      <el-radio-button value="all">全部 ({{ rows.length }})</el-radio-button>
      <el-radio-button value="keyword">关键词 ({{ rows.filter(r => r.type === 'keyword').length }})</el-radio-button>
      <el-radio-button value="product">商品定位 ({{ rows.filter(r => r.type === 'product').length }})</el-radio-button>
      <el-radio-button value="category">类目定位 ({{ rows.filter(r => r.type === 'category').length }})</el-radio-button>
    </el-radio-group>
    <span class="spacer" />
    <el-button type="primary" :icon="'Plus'" disabled title="即将上线">添加投放</el-button>
    <el-button :icon="'Upload'" disabled title="即将上线">CSV 批量改</el-button>
    <el-checkbox v-model="showCompare" size="small">环比</el-checkbox>
    <el-button :icon="'Operation'" size="small" disabled title="即将上线">列配置 ▾</el-button>
    <el-button :icon="'Download'" size="small" @click="exportCsv" title="导出当前表格为 CSV">导出</el-button>
  </div>

  <div class="lx-table">
    <ResponsiveTable ref="tableRef" :data="filteredRows" :mobile-columns="mobileCols" stripe border size="small" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="40" fixed />
      <el-table-column label="启用" width="55" fixed>
        <template #default="{ row }"><el-switch v-model="row.enabled" size="small" @change="(v) => onSwitch(row, v)" /></template>
      </el-table-column>
      <el-table-column label="类型" width="80" fixed>
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'keyword' ? 'primary' : row.type === 'product' ? 'warning' : 'info'" effect="plain">
            {{ ({ keyword: '关键词', product: '商品', category: '类目' })[row.type] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="投放内容" min-width="220" fixed>
        <template #default="{ row }">
          <a class="link" @click="openAnalysisDrawer(row)">{{ row.term || row.asin || row.category }}</a>
          <div class="ad-meta">
            <span>{{ ({ exact: '精准', phrase: '词组', broad: '广泛', 'asin-exact': 'ASIN 精准', 'category': '类目' })[row.matchType] }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="bid" width="100">
        <template #default="{ row }">
          <el-input-number v-model="row.bid" :precision="2" :step="0.05" :controls="false" size="small" style="width: 80px" @change="(v, old) => changeBid(row, v, old)" />
        </template>
      </el-table-column>
      <el-table-column label="建议出价区间" width="130">
        <template #default="{ row }">
          <span v-if="row.suggestedBidLow" style="font-size: 11px; color: var(--text-muted)">
            ${{ row.suggestedBidLow.toFixed(2) }} - ${{ row.suggestedBidHigh.toFixed(2) }}
          </span>
          <span v-else style="font-size: 11px; color: var(--text-muted)">--</span>
        </template>
      </el-table-column>
      <el-table-column label="位置" prop="position" width="80" sortable align="right">
        <template #default="{ row }">{{ row.position ? '#' + row.position.toFixed(1) : '--' }}</template>
      </el-table-column>
      <el-table-column label="曝光量" prop="impressions" width="90" sortable align="right">
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="点击" prop="clicks" width="80" sortable align="right" />
      <el-table-column label="CTR" prop="ctr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="CPC" prop="cpc" width="80" sortable align="right">
        <template #default="{ row }">${{ (row.cpc ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="花费" prop="spend" width="90" sortable align="right">
        <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="广告销售额" prop="sales" width="110" sortable align="right">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" prop="acos" width="80" sortable align="right">
        <template #default="{ row }">
          <span :class="row.acos && row.acos > 0.5 ? 'danger' : row.acos && row.acos < 0.3 ? 'good' : ''">
            {{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="订单" prop="orders" width="70" sortable align="right" />
      <el-table-column label="CVR" prop="cvr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="分析" width="120" fixed="right">
        <template #default="{ row }">
          <el-icon class="tool-icon" title="天数据" @click="openAnalysisDrawer(row, 'daily')"><Histogram /></el-icon>
          <el-icon class="tool-icon" title="小时数据" @click="openAnalysisDrawer(row, 'hourly')"><Clock /></el-icon>
          <el-icon class="tool-icon" title="对比分析" @click="openAnalysisDrawer(row, 'compare')"><CopyDocument /></el-icon>
        </template>
      </el-table-column>
      <template #mobile-actions="{ row }">
        <el-button size="small" @click="onSwitch(row)">{{ row.enabled ? '暂停' : '启用' }}</el-button>
      </template>
    </ResponsiveTable>
  </div>

  <!-- Floating batch action bar -->
  <BatchActionBar
    :selected="selected"
    :actions="['bid', 'state', 'delete']"
    @action:bid="openBidModal"
    @action:state="commitBulkState"
    @action:delete="commitBulkDelete"
    @clear="clearSelection" />

  <!-- Bulk bid adjust modal -->
  <BidAdjustModal
    v-model="showBidModal"
    :rows="selected"
    title="批量调价"
    @confirm="commitBulkBid" />

  <!-- Ad analysis drawer (lingxing-style 顶部下拉) -->
  <AdAnalysisDrawer
    v-model="drawerVisible"
    :entity="drawerEntity"
    :initial-tab="drawerInitialTab" />
</template>

<style scoped>
.sub-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
  flex-wrap: wrap;
}
.spacer { flex: 1; }

.lx-table { overflow-x: auto; }
.lx-table :deep(.el-table) { font-size: 12px; }
.lx-table :deep(.el-table th) { background: #fafbfc !important; color: #6b7280; font-weight: 500; }

.link { color: var(--primary); cursor: pointer; }
.link:hover { text-decoration: underline; }
.ad-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.danger { color: #ef4444; font-weight: 600; }
.good { color: #10b981; font-weight: 600; }

.tool-icon {
  margin: 0 3px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
}
.tool-icon:hover { color: var(--primary); }

.ai-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #eef2ff 0%, #f5f3ff 100%);
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  margin-bottom: 12px;
}
.ai-icon { font-size: 20px; }
.ai-text { flex: 1; font-size: 12px; color: var(--text); }
.ai-text strong { display: block; margin-bottom: 2px; font-size: 13px; }
</style>
