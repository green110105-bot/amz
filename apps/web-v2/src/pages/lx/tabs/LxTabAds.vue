<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Histogram } from '@element-plus/icons-vue';
import { adsApi, adGroupsApi } from '../../../api/lx';
import { actionQueueApi } from '../../../api/ads-timeline';
import { ElMessage } from 'element-plus';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';
import AdAnalysisDrawer from '../../../components/AdAnalysisDrawer.vue';

const props = defineProps({ campaign: Object });
const mobileCols = [
  { prop: 'asin', label: 'ASIN' },
  { prop: 'sku', label: 'SKU' },
  { prop: 'adGroupName', label: '广告组' },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
];

const adGroups = ref([]);
const ads = ref([]);

const rows = computed(() =>
  ads.value.map((a) => {
    const ag = adGroups.value.find((x) => x.id === a.adGroupId);
    return { ...a, adGroupName: ag?.name || '—' };
  }),
);

async function load() {
  try {
    const ags = await adGroupsApi.list({ campaignId: props.campaign.id });
    adGroups.value = Array.isArray(ags) ? ags : [];
    if (!adGroups.value.length) {
      ads.value = [];
      return;
    }
    const lists = await Promise.all(
      adGroups.value.map((ag) => adsApi.list({ adGroupId: ag.id }).catch(() => [])),
    );
    ads.value = lists.flat();
  } catch (e) {
    ElMessage.error(`加载广告失败：${e.message || e}`);
  }
}

onMounted(load);
watch(() => props.campaign?.id, () => load());

// ----- AdAnalysisDrawer -----
const drawerVisible = ref(false);
const drawerEntity = ref({});
const drawerInitialTab = ref('daily');
function openAnalysisDrawer(row, tab = 'daily') {
  drawerEntity.value = {
    id: row.id,
    type: 'ad',
    name: row.asin,
    asin: row.asin,
    campaignName: props.campaign?.name,
    adGroupName: row.adGroupName,
  };
  drawerInitialTab.value = tab;
  drawerVisible.value = true;
}

async function onSwitch(row, value) {
  const desired = typeof value === 'boolean' ? value : !Boolean(row.enabled);
  const prev = typeof value === 'boolean' ? !desired : Boolean(row.enabled);
  row.enabled = prev;
  try {
    await actionQueueApi.enqueue({
      sourceStrategyName: 'LX manual operation',
      entity: { kind: 'ad', id: row.id, name: row.asin || row.sku || row.id },
      typedAction: {
        actionPrimitive: 'TOGGLE_AD',
        sourceSurface: 'lx',
        entityKind: 'ad',
        resourceId: row.id,
        currentValue: { enabled: prev },
        recommendedValue: { enabled: desired },
        dryRun: true,
        auditRequired: true,
      },
      guardrail: { status: 'needs_review', reasons: ['manual_lx_write_requires_action_queue'] },
      rollbackPlan: { method: 'restore_previous_ad_state', needsManualReview: true },
      note: 'ad state change queued from LX surface',
    });
    ElMessage.success('Added to Action Queue. Approval and dry-run are required before any write.');
  } catch (e) {
    row.enabled = prev;
    ElMessage.error(`Queue failed: ${e.message || e}`);
  }
}
</script>

<template>
  <div class="sub-toolbar">
    <el-button type="primary" :icon="'Plus'">添加广告</el-button>
    <span class="spacer" />
    <el-button :icon="'Operation'" size="small">列配置 ▾</el-button>
    <el-button :icon="'Download'" size="small" link />
  </div>

  <div class="lx-table">
    <ResponsiveTable :data="rows" :mobile-columns="mobileCols" stripe border size="small">
      <el-table-column type="selection" width="40" fixed />
      <el-table-column label="启用" width="55" fixed>
        <template #default="{ row }"><el-switch v-model="row.enabled" size="small" @change="(v) => onSwitch(row, v)" /></template>
      </el-table-column>
      <el-table-column label="主图" width="80" fixed>
        <template #default>
          <div class="ad-thumb">
            <el-icon><Picture /></el-icon>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="ASIN / SKU" min-width="200" fixed>
        <template #default="{ row }">
          <el-icon class="quick-analysis-icon" @click.stop="openAnalysisDrawer(row)" title="快速分析"><Histogram /></el-icon>
          <strong style="cursor: pointer;" @click.stop="openAnalysisDrawer(row)">{{ row.asin }}</strong>
          <div class="sub-text">{{ row.sku }}</div>
        </template>
      </el-table-column>
      <el-table-column label="标题/创意" prop="headline" min-width="200" />
      <el-table-column label="广告组" prop="adGroupName" min-width="200" />
      <el-table-column label="曝光" prop="impressions" width="90" sortable align="right">
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="点击" prop="clicks" width="80" sortable align="right" />
      <el-table-column label="CTR" prop="ctr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="花费" prop="spend" width="90" sortable align="right">
        <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="销售额" prop="sales" width="100" sortable align="right">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" prop="acos" width="80" sortable align="right">
        <template #default="{ row }">{{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default>
          <el-button link size="small">A/B 测试</el-button>
          <el-button link type="danger" size="small">归档</el-button>
        </template>
      </el-table-column>
      <template #mobile-actions="{ row }">
        <el-button size="small" type="primary">A/B 测试</el-button>
        <el-button size="small" @click="onSwitch(row)">{{ row.enabled ? '暂停' : '启用' }}</el-button>
      </template>
    </ResponsiveTable>
  </div>

  <AdAnalysisDrawer v-model="drawerVisible" :entity="drawerEntity" :initial-tab="drawerInitialTab" />
</template>

<style scoped>
.sub-toolbar { display: flex; gap: 8px; padding: 0 0 12px; flex-wrap: wrap; }
.quick-analysis-icon { margin-right: 6px; color: var(--text-muted, #909399); cursor: pointer; vertical-align: middle; font-size: 14px; }
.quick-analysis-icon:hover { color: var(--primary, #3b82f6); }
.spacer { flex: 1; }
.lx-table { overflow-x: auto; }
.lx-table :deep(.el-table) { font-size: 12px; }
.lx-table :deep(.el-table th) { background: #fafbfc !important; color: #6b7280; font-weight: 500; }
.ad-thumb {
  width: 50px;
  height: 50px;
  background: #f3f4f6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cbd5e1;
}
.sub-text { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
</style>
