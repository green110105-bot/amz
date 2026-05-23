<script setup>
// 用户搜索词 — 实际用户查询表（仅 keyword / target row 出现）
// 支持两个操作（基于已有 backend endpoints）：
//   · 升投放 (Promote): POST /lx/user-search-terms/promote → 把搜索词升级为 keyword
//   · 加否定 (Negate):  POST /lx/user-search-terms/negate → 加为否定关键词
import { computed, ref, watchEffect } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userSearchTermsApi } from '../../api/lx';
import { generateMockSearchTerms } from './_mock-data.js';

const props = defineProps({ entity: Object, dateRange: Array, active: Boolean });

const rows = ref([]);
const loading = ref(false);

watchEffect(async () => {
  if (!props.active || !props.entity?.id) return;
  loading.value = true;
  try {
    // Try real API first; fall back to mock for entities without sync'd data
    const r = await userSearchTermsApi.list({ campaignId: props.entity.campaignId, keywordId: props.entity.id }).catch(() => []);
    rows.value = Array.isArray(r) && r.length > 0 ? r : generateMockSearchTerms(props.entity);
  } finally { loading.value = false; }
});

async function promote(row) {
  try {
    await ElMessageBox.confirm(
      `把搜索词 "${row.searchTerm}" 升级为新关键词？(精准匹配 / 起始 bid $0.5)`,
      '升投放',
      { confirmButtonText: '升投放', cancelButtonText: '取消', type: 'info' },
    );
  } catch { return; }
  try {
    await userSearchTermsApi.promote({
      term: row.searchTerm,
      campaignId: props.entity.campaignId,
      adGroupId: props.entity.adGroupId,
      matchType: 'exact',
      bid: 0.5,
    });
    ElMessage.success(`已把 "${row.searchTerm}" 升为精准关键词`);
    row._promoted = true;
  } catch (e) {
    ElMessage.error(`升投放失败：${e.message || e}`);
  }
}

async function negate(row) {
  try {
    await ElMessageBox.confirm(
      `把搜索词 "${row.searchTerm}" 加为否定关键词？后续不再被该搜索词触发。`,
      '加否定',
      { confirmButtonText: '加否定', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  try {
    await userSearchTermsApi.negate({
      term: row.searchTerm,
      campaignId: props.entity.campaignId,
      adGroupId: props.entity.adGroupId,
      matchType: 'negativeExact',
    });
    ElMessage.success(`已加 "${row.searchTerm}" 为否定关键词`);
    row._negated = true;
  } catch (e) {
    ElMessage.error(`加否定失败：${e.message || e}`);
  }
}
</script>

<template>
  <div class="tab-ust">
    <div class="meta" v-if="entity?.term || entity?.asin">
      投放: <strong>{{ entity.term || entity.asin }}</strong>
      <span v-if="entity.matchType"> · {{ entity.matchType }}</span>
    </div>

    <el-table v-loading="loading" :data="rows" stripe border size="small" max-height="380" empty-text="此投放暂无用户搜索词数据">
      <el-table-column prop="searchTerm" label="用户搜索词" min-width="240">
        <template #default="{ row }">
          <a :href="'https://www.amazon.com/s?k=' + encodeURIComponent(row.searchTerm)" target="_blank" class="link">{{ row.searchTerm }}</a>
        </template>
      </el-table-column>
      <el-table-column prop="impressions" label="曝光" align="right" sortable>
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="clicks" label="点击" align="right" sortable />
      <el-table-column label="CTR" align="right">
        <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="CPC" align="right">
        <template #default="{ row }">${{ (row.cpc ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="花费" align="right" sortable prop="spend">
        <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="orders" label="订单" align="right" />
      <el-table-column label="销售额" align="right">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" align="right">
        <template #default="{ row }">{{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button v-if="!row._promoted" size="small" link type="primary" @click="promote(row)" title="升级为关键词">升投放</el-button>
          <span v-else style="font-size: 11px; color: var(--text-muted)">已升投放</span>
          <el-divider direction="vertical" />
          <el-button v-if="!row._negated" size="small" link type="danger" @click="negate(row)" title="加为否定">加否定</el-button>
          <span v-else style="font-size: 11px; color: var(--text-muted)">已否定</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.tab-ust { padding: 8px 0; }
.meta { font-size: 13px; color: var(--text-muted); margin-bottom: 12px; }
.meta strong { color: var(--text); }
.link { color: var(--primary, #3b82f6); }
.link:hover { text-decoration: underline; }
:deep(.el-table) { font-size: 12px; }
</style>
