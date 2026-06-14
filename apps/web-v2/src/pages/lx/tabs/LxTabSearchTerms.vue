<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useUserSearchTerms } from '../../../composables/useLxState';
import { useAudit } from '../../../composables/useAudit';
import { tabAiSignals } from '../../../utils/ads-integration';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';

const mobileCols = [
  { prop: 'userQuery', label: '搜索词' },
  { prop: 'matchedKw', label: '匹配词' },
  { prop: 'signal', label: '信号' },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
];

const { submit } = useAudit();
const router = useRouter();
const props = defineProps({ campaign: Object });

const { list: rows, fetch, promote, negate } = useUserSearchTerms(props.campaign.id);

onMounted(() => { fetch(); });

const aiSignals = computed(() => tabAiSignals(props.campaign.id));

const signalFilter = ref('all');
const filtered = computed(() => signalFilter.value === 'all' ? rows.value : rows.value.filter((r) => r.signal === signalFilter.value));

const selected = ref([]);
function onSelect(rows) { selected.value = rows; }

// M3-P2-21: front-end CSV export of currently-loaded search terms.
function exportCsv() {
  const cols = ['userQuery', 'matchedKw', 'signal', 'spend', 'sales', 'acos'];
  const csv = [cols.join(','), ...filtered.value.map((r) => cols.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'search-terms.csv'; a.click();
  URL.revokeObjectURL(url);
}

// M3-P3-24: promote needs a valid cpc to derive a non-zero suggested bid. A missing /
// zero / NaN cpc would enqueue an abnormal (zero) bid, so the promote control is disabled
// for such rows.
function hasValidCpc(row) {
  const v = Number(row?.cpc);
  return Number.isFinite(v) && v > 0;
}

async function harvest(row) {
  if (!hasValidCpc(row)) {
    ElMessage.warning('该搜索词缺少有效 CPC,无法生成出价,暂不可升手动');
    return;
  }
  await submit({
    sourceModule: 'M3', actionType: 'PROMOTE_TO_MANUAL',
    target: { type: 'search_term', term: row.userQuery },
    payload: { term: row.userQuery, suggestedBid: (row.cpc ?? 0) * 1.1 },
    description: `升手动：${row.userQuery}`,
  });
  await promote(row, { suggestedBid: (row.cpc ?? 0) * 1.1 });
}

async function negateTerm(row) {
  // M3-P3-24: a single negate (GOVERN_KEYWORD) gets a light confirmation so a mis-click
  // does not silently bury a term.
  try {
    await ElMessageBox.confirm(
      `确定将搜索词 "${row.userQuery}" 加为否定(exact)？`,
      '加否定',
      { confirmButtonText: '加否定', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  await submit({
    sourceModule: 'M3', actionType: 'ADD_NEGATIVE_KEYWORD',
    target: { type: 'search_term', term: row.userQuery },
    payload: { term: row.userQuery, matchType: 'exact', scope: 'AdGroup' },
    description: `加 negative-exact "${row.userQuery}"`,
  });
  await negate(row, { matchType: 'exact', scope: 'AdGroup' });
  ElMessage({ message: `已加否定 "${row.userQuery}"`, type: 'success' });
}

async function bulkHarvest() {
  await ElMessageBox.confirm(`确定升 ${selected.value.length} 个搜索词为手动精准？`, '批量升手动', { type: 'warning' });
  for (const r of selected.value) await harvest(r);
}

async function bulkNegate() {
  await ElMessageBox.confirm(`确定否定 ${selected.value.length} 个搜索词？`, '批量加否定', { type: 'warning' });
  for (const r of selected.value) await negateTerm(r);
}
</script>

<template>
  <!-- AI 提示横幅 -->
  <div v-if="aiSignals.promote > 0 || aiSignals.negative > 0" class="ai-hint">
    <span class="ai-icon">🤖</span>
    <div class="ai-text">
      <strong>AI 在该 Campaign 关联 SKU 上检测到：</strong>
      <span v-if="aiSignals.promote">{{ aiSignals.promote }} 个搜索词可升手动 · </span>
      <span v-if="aiSignals.negative">{{ aiSignals.negative }} 个搜索词建议加否定 · </span>
      <span>总待办 {{ aiSignals.total }} 条</span>
    </div>
    <el-button size="small" type="primary" :icon="'Right'" @click="router.push('/ads/timeline')">去 Timeline 处理</el-button>
  </div>

  <div class="sub-toolbar">
    <el-radio-group v-model="signalFilter" size="default">
      <el-radio-button value="all">全部</el-radio-button>
      <el-radio-button value="waste">💸 浪费</el-radio-button>
      <el-radio-button value="harvest">⭐ 可升手动</el-radio-button>
      <el-radio-button value="normal">常规</el-radio-button>
    </el-radio-group>
    <span class="spacer" />
    <el-button :icon="'Download'" size="small" @click="exportCsv" title="导出当前表格为 CSV">导出</el-button>
  </div>

  <transition name="bulk">
    <div v-if="selected.length" class="bulk-bar">
      已选 <strong>{{ selected.length }}</strong> 行
      <span class="spacer" />
      <el-button type="primary" size="small" @click="bulkHarvest">⭐ 一键升手动</el-button>
      <el-button type="danger" size="small" @click="bulkNegate">💸 一键加否定</el-button>
    </div>
  </transition>

  <div class="lx-table">
    <ResponsiveTable :data="filtered" :mobile-columns="mobileCols" stripe border size="small" @selection-change="onSelect">
      <el-table-column type="selection" width="40" fixed />
      <el-table-column label="用户搜索词" prop="userQuery" min-width="240" fixed>
        <template #default="{ row }">
          <strong>{{ row.userQuery }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="匹配关键词" prop="matchedKw" min-width="160" />
      <el-table-column label="匹配类型" prop="matchType" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="({ exact: 'success', phrase: 'warning', broad: 'info', auto: 'primary' })[row.matchType]" effect="plain">
            {{ ({ exact: '精准', phrase: '词组', broad: '广泛', auto: '自动' })[row.matchType] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="信号" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.signal === 'waste'" type="danger" size="small">💸 浪费</el-tag>
          <el-tag v-else-if="row.signal === 'harvest'" type="success" size="small">⭐ 可升手动</el-tag>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="曝光" prop="impressions" width="90" sortable align="right">
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
      <el-table-column label="订单" prop="orders" width="70" sortable align="right" />
      <el-table-column label="销售额" prop="sales" width="100" sortable align="right">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" prop="acos" width="80" sortable align="right">
        <template #default="{ row }">
          <span :class="row.acos && row.acos > 0.5 ? 'danger' : row.acos && row.acos < 0.3 ? 'good' : ''">
            {{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="CVR" prop="cvr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.signal === 'harvest'" type="primary" link size="small" :disabled="!hasValidCpc(row)" :title="hasValidCpc(row) ? '' : '缺少有效 CPC,无法生成出价'" @click="harvest(row)">⭐ 升手动</el-button>
          <el-button v-if="row.signal === 'waste'" type="danger" link size="small" @click="negateTerm(row)">💸 加否定</el-button>
          <el-button link size="small">详情</el-button>
        </template>
      </el-table-column>
      <template #mobile-actions="{ row }">
        <el-button v-if="row.signal === 'harvest'" size="small" type="primary" @click="harvest(row)">升手动</el-button>
        <el-button v-if="row.signal === 'waste'" size="small" type="danger" @click="negateTerm(row)">加否定</el-button>
      </template>
    </ResponsiveTable>
  </div>
</template>

<style scoped>
.sub-toolbar { display: flex; align-items: center; gap: 8px; padding: 0 0 12px; flex-wrap: wrap; }
@media (max-width: 767px) {
  .ai-hint { flex-direction: column; align-items: stretch; gap: 8px; }
  .bulk-bar { flex-wrap: wrap; }
}
.spacer { flex: 1; }
.text-muted { color: var(--text-muted); }

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #eff6ff 0%, #ede9fe 100%);
  border: 1px solid #c7d2fe;
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 13px;
}
.bulk-bar strong { color: var(--primary); font-size: 15px; }

.bulk-enter-active, .bulk-leave-active { transition: all 0.2s; }
.bulk-enter-from, .bulk-leave-to { opacity: 0; transform: translateY(-4px); }

.lx-table { overflow-x: auto; }
.lx-table :deep(.el-table) { font-size: 12px; }
.lx-table :deep(.el-table th) { background: #fafbfc !important; color: #6b7280; font-weight: 500; }

.danger { color: #ef4444; font-weight: 600; }
.good { color: #10b981; font-weight: 600; }

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
