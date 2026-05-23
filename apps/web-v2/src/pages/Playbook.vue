<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { mockPlaybook } from '../utils/mock-data-ads';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'id', label: 'ID' },
  { prop: 'name', label: '策略名' },
  { prop: 'stage', label: '阶段' },
  { prop: 'priority', label: '优先级' },
];
const { submit } = useAudit();

const stageFilter = ref('all');
const search = ref('');

const filtered = computed(() => {
  return mockPlaybook.filter((p) => {
    if (stageFilter.value !== 'all' && p.stage !== stageFilter.value) return false;
    if (search.value && !`${p.id} ${p.name}`.toLowerCase().includes(search.value.toLowerCase())) return false;
    return true;
  });
});

const summary = computed(() => {
  const arr = mockPlaybook;
  return {
    total: arr.length,
    applied: arr.filter((p) => p.applied).length,
    launch: arr.filter((p) => p.stage === 'launch').length,
    growth: arr.filter((p) => p.stage === 'growth').length,
    mature: arr.filter((p) => p.stage === 'mature').length,
    decline: arr.filter((p) => p.stage === 'decline').length,
  };
});

function stageColor(s) {
  return { launch: '#a5b4fc', growth: '#22d3ee', mature: '#f59e0b', decline: '#fb923c' }[s] || '#9ca3af';
}
function stageLabel(s) {
  return { launch: '🌱 新品', growth: '🌳 成长', mature: '🌲 成熟', decline: '🍂 衰退' }[s] || s;
}
function priorityType(p) {
  return { high: 'danger', medium: 'warning', low: '' }[p] || '';
}

async function apply(item) {
  item.applied = true;
  await submit({
    sourceModule: 'M3',
    actionType: 'APPLY_PLAYBOOK_STRATEGY',
    target: { type: 'strategy', id: item.id },
    payload: { strategy: item.name, stage: item.stage },
    description: `应用策略 ${item.id} · ${item.name}`,
  });
}
</script>

<template>
  <div>
    <PageHeader title="策略库（42 条）" subtitle="按生命周期分类的所有自动化策略 · 已应用 / 未应用 · 一键启用">
      <template #extra>
        <el-input v-model="search" placeholder="搜策略 ID / 名称" :prefix-icon="'Search'" size="default" style="width: 240px" clearable />
      </template>
    </PageHeader>

    <el-row :gutter="12">
      <el-col :xs="12" :sm="6"><div class="stat-card stat-launch"><span>新品期</span><strong>{{ summary.launch }}</strong></div></el-col>
      <el-col :xs="12" :sm="6"><div class="stat-card stat-growth"><span>成长期</span><strong>{{ summary.growth }}</strong></div></el-col>
      <el-col :xs="12" :sm="6"><div class="stat-card stat-mature"><span>成熟期</span><strong>{{ summary.mature }}</strong></div></el-col>
      <el-col :xs="12" :sm="6"><div class="stat-card stat-decline"><span>衰退期</span><strong>{{ summary.decline }}</strong></div></el-col>
    </el-row>

    <MobileFallback v-if="isMobile" page-name="42 条策略库（旧版）" reason="旧版 42 条策略库为大数据表，建议桌面端查看完整列。" style="margin-top: 16px" />

    <el-card v-if="!isMobile" shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">{{ summary.applied }} / {{ summary.total }} 已应用</h2>
          <el-radio-group v-model="stageFilter" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="launch">新品期 (10)</el-radio-button>
            <el-radio-button value="growth">成长期 (12)</el-radio-button>
            <el-radio-button value="mature">成熟期 (12)</el-radio-button>
            <el-radio-button value="decline">衰退期 (8)</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <ResponsiveTable :data="filtered" :mobile-columns="mobileCols" stripe size="default">
        <el-table-column label="ID" width="120">
          <template #default="{ row }"><strong class="tnum">{{ row.id }}</strong></template>
        </el-table-column>
        <el-table-column label="阶段" width="100">
          <template #default="{ row }">
            <el-tag :color="stageColor(row.stage)" :style="{ color: stageColor(row.stage), borderColor: stageColor(row.stage) }" size="small" effect="light">{{ stageLabel(row.stage) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="策略名称" min-width="280" />
        <el-table-column label="优先级" width="100">
          <template #default="{ row }">
            <el-tag :type="priorityType(row.priority)" size="small" effect="plain">{{ ({ high: '高', medium: '中', low: '低' })[row.priority] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.applied ? 'success' : 'info'" size="small">{{ row.applied ? '✓ 已应用' : '未应用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="!row.applied" size="small" type="primary" plain @click="apply(row)">应用</el-button>
            <el-button v-else size="small" link>详情</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button v-if="!row.applied" size="small" type="primary" @click="apply(row)">应用</el-button>
        </template>
      </ResponsiveTable>
    </el-card>
  </div>
</template>

<style scoped>
.stat-card { padding: 14px 16px; background: #fff; border: 1px solid var(--line); border-left-width: 3px; border-radius: 8px; }
.stat-card span { display: block; font-size: 12px; color: var(--text-muted); }
.stat-card strong { display: block; font-size: 24px; font-weight: 700; margin-top: 4px; }
.stat-card.stat-launch { border-left-color: #a5b4fc; }
.stat-card.stat-growth { border-left-color: #22d3ee; }
.stat-card.stat-mature { border-left-color: #f59e0b; }
.stat-card.stat-decline { border-left-color: #fb923c; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
