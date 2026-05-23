<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockSearchTerms, mockKeywordRankings } from '../utils/mock-data';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();
const mobileTermCols = [
  { prop: 'term', label: '搜索词' },
  { prop: 'impressions', label: '曝光', formatter: (v) => (v ?? 0).toLocaleString() },
  { prop: 'clicks', label: '点击' },
  { prop: 'sales', label: '销售额', formatter: (v) => formatCurrency(v, 'USD') },
  { prop: 'acos', label: 'ACOS', formatter: (v) => v !== null ? formatPercent(v) : '-' },
  { prop: 'actionLabel', label: 'AI 建议' },
];
const mobileRankCols = [
  { prop: 'keyword', label: '关键词' },
  { prop: 'sku', label: 'SKU' },
  { prop: 'searchVolume', label: '月搜索量', formatter: (v) => (v ?? 0).toLocaleString() },
  { prop: 'organicRank', label: '自然排名', formatter: (v) => '#' + v },
  { prop: 'adRank', label: '广告排名', formatter: (v) => '#' + v },
];
import { useAudit } from '../composables/useAudit';
const { submit: submitAudit } = useAudit();

const tab = ref('search-terms');
const selected = ref([]);

function recommendType(r) {
  return { promote_to_manual: 'success', add_negative: 'danger', observe: '' }[r] || '';
}

async function bulkAction(action) {
  if (!selected.value.length) {
    ElMessage.warning('请先选择关键词');
    return;
  }
  const isNegative = action.includes('否') || action.includes('negate');
  await submitAudit({
    sourceModule: 'M3',
    actionType: isNegative ? 'ADD_NEGATIVE_KEYWORD' : 'PROMOTE_TO_MANUAL',
    target: { type: 'keyword_batch' },
    payload: { count: selected.value.length, terms: selected.value.map((s) => s.term) },
    description: `对 ${selected.value.length} 个关键词：${action}`,
  });
  selected.value = [];
}
</script>

<template>
  <div>
    <PageHeader title="关键词与搜索词" subtitle="搜索词报告 · 否词管理 · 排名追踪（有机 + 广告双轨）" />

    <el-card shadow="never">
      <el-tabs v-model="tab">
        <el-tab-pane label="搜索词报告" name="search-terms">
          <div class="bulk-bar" v-if="selected.length">
            已选 {{ selected.length }} 个
            <el-button size="small" type="primary" @click="bulkAction('转手动精准')">转手动精准</el-button>
            <el-button size="small" type="danger" plain @click="bulkAction('加入否词')">加入否词</el-button>
            <el-button size="small" link @click="selected = []">清空</el-button>
          </div>
          <ResponsiveTable :data="mockSearchTerms" :mobile-columns="mobileTermCols" stripe @selection-change="selected = $event">
            <el-table-column type="selection" width="40" />
            <el-table-column prop="term" label="搜索词" min-width="200" />
            <el-table-column label="曝光" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ row.impressions.toLocaleString() }}</span></template></el-table-column>
            <el-table-column label="点击" align="right" width="80"><template #default="{ row }"><span class="tnum">{{ row.clicks }}</span></template></el-table-column>
            <el-table-column label="销售额" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.sales, 'USD') }}</span></template></el-table-column>
            <el-table-column label="ACOS" align="right" width="90"><template #default="{ row }"><span class="tnum">{{ row.acos !== null ? formatPercent(row.acos) : '-' }}</span></template></el-table-column>
            <el-table-column label="CVR" align="right" width="80"><template #default="{ row }"><span class="tnum">{{ formatPercent(row.cvr) }}</span></template></el-table-column>
            <el-table-column label="AI 建议" min-width="160">
              <template #default="{ row }"><el-tag :type="recommendType(row.recommend)" size="small">{{ row.actionLabel }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button v-if="row.recommend === 'promote_to_manual'" size="small" type="primary" plain @click="bulkAction(`转 ${row.term} 为手动`)">转手动</el-button>
                <el-button v-else-if="row.recommend === 'add_negative'" size="small" type="danger" plain @click="bulkAction(`否定 ${row.term}`)">加否词</el-button>
              </template>
            </el-table-column>
            <template #mobile-actions="{ row }">
              <el-button v-if="row.recommend === 'promote_to_manual'" size="small" type="primary" @click="bulkAction(`转 ${row.term} 为手动`)">转手动</el-button>
              <el-button v-else-if="row.recommend === 'add_negative'" size="small" type="danger" @click="bulkAction(`否定 ${row.term}`)">加否词</el-button>
            </template>
          </ResponsiveTable>
        </el-tab-pane>

        <el-tab-pane label="关键词排名（有机+广告）" name="rankings">
          <ResponsiveTable :data="mockKeywordRankings" :mobile-columns="mobileRankCols" stripe>
            <el-table-column prop="keyword" label="关键词" min-width="200" />
            <el-table-column prop="sku" label="SKU" width="120" />
            <el-table-column label="月搜索量" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ row.searchVolume.toLocaleString() }}</span></template></el-table-column>
            <el-table-column label="自然排名" align="right" width="120">
              <template #default="{ row }">
                <span class="tnum">#{{ row.organicRank }}</span>
                <span class="tnum text-muted" style="margin-left: 6px; font-size: 12px">
                  <el-icon v-if="row.organicChange > 0" style="color: var(--danger)"><CaretBottom /></el-icon>
                  <el-icon v-else-if="row.organicChange < 0" style="color: var(--success)"><CaretTop /></el-icon>
                  {{ row.organicChange !== 0 ? Math.abs(row.organicChange) : '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="广告排名" align="right" width="100"><template #default="{ row }"><span class="tnum">#{{ row.adRank }}</span></template></el-table-column>
            <el-table-column label="广告位置" width="160">
              <template #default="{ row }">
                <el-tag :type="row.adPosition === 'top_of_search' ? 'success' : 'info'" size="small" effect="light">
                  {{ row.adPosition === 'top_of_search' ? '搜索首页' : '其它' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default><el-button size="small" link type="primary">趋势图</el-button></template>
            </el-table-column>
            <template #mobile-actions>
              <el-button size="small" type="primary">趋势图</el-button>
            </template>
          </ResponsiveTable>
        </el-tab-pane>

        <el-tab-pane label="否词管理" name="negatives">
          <el-empty description="否词列表 · 编辑功能" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.bulk-bar { background: var(--primary-soft); padding: 10px 14px; margin-bottom: 12px; border-radius: 6px; display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
</style>
