<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import KpiCard from '../components/KpiCard.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockKeywordLibrary } from '../utils/mock-data-extras';
import { useLocalStore } from '../composables/useLocalStore';

const { isMobile } = useViewport();

const localStore = useLocalStore();
const search = ref('');
const typeFilter = ref('all');
const categoryFilter = ref('all');
const newTerm = ref('');
const newType = ref('preferred');

// 合并 mock + LocalStorage（用户加的会持久化）
const list = computed({
  get: () => {
    const stored = localStore.state.keywordLibrary || [];
    const merged = [...stored];
    for (const k of mockKeywordLibrary) if (!merged.some((x) => x.term === k.term)) merged.push(k);
    return merged;
  },
  set: () => {},
});

const filtered = computed(() => list.value.filter((k) => {
  if (search.value && !k.term.toLowerCase().includes(search.value.toLowerCase())) return false;
  if (typeFilter.value !== 'all' && k.type !== typeFilter.value) return false;
  if (categoryFilter.value !== 'all' && k.category !== categoryFilter.value && k.category !== '*') return false;
  return true;
}));

const summary = computed(() => ({
  total: list.value.length,
  preferred: list.value.filter((k) => k.type === 'preferred').length,
  banned: list.value.filter((k) => k.type === 'banned').length,
  imported: list.value.filter((k) => k.source === 'imported_from_search_terms').length,
}));

function add() {
  if (!newTerm.value.trim()) return ElMessage.warning('请输入关键词');
  localStore.addKeyword({
    id: 'kw-' + Date.now(),
    term: newTerm.value.trim(),
    type: newType.value,
    category: 'electronics_accessories',
    impressions30d: 0,
    conversions30d: 0,
    source: 'manual',
    addedAt: new Date().toISOString().slice(0, 10),
  });
  newTerm.value = '';
  ElMessage.success('已添加（持久化到本地）');
}

function remove(k) {
  if (k.source === 'system') return ElMessage.warning('系统词不可删');
  localStore.removeKeyword(k.id);
  ElMessage.success(`已移除 "${k.term}"`);
}

function importFromSearchTerms() {
  ElMessage.success('从 M3 搜索词报告导入 12 个高转化关键词');
}

function typeTagType(t) {
  return { preferred: 'success', banned: 'danger', category_required: 'warning' }[t] || '';
}

const mobileCols = [
  { prop: 'term', label: '关键词' },
  { prop: 'type', label: '类型', formatter: (v) => ({ preferred: '主词', banned: '否词', category_required: '类目必备' })[v] || v },
  { prop: 'impressions30d', label: '30d 曝光', formatter: (v) => (v || 0).toLocaleString() },
  { prop: 'conversions30d', label: '30d 转化' },
];
</script>

<template>
  <div>
    <PageHeader title="关键词库" subtitle="主词 / 否词 / 类目必备 · 用于 Listing 评分 D1 + 改写约束">
      <template #extra>
        <el-button :icon="'Download'" @click="importFromSearchTerms">从搜索词导入</el-button>
        <el-button :icon="'Upload'">批量上传</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="总关键词" :value="summary.total" status="default" icon="Search" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="主词" :value="summary.preferred" hint="优先用于 Listing" status="success" icon="StarFilled" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="否词" :value="summary.banned" hint="改写时禁用" status="danger" icon="CircleClose" /></el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6"><KpiCard label="自动导入" :value="summary.imported" hint="来自搜索词报告" status="info" icon="MagicStick" /></el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">关键词列表</h2>
          <div class="filter-row">
            <el-input v-model="search" size="small" placeholder="搜索" :prefix-icon="'Search'" :style="isMobile ? 'width:100%' : 'width:200px'" clearable />
            <el-radio-group v-model="typeFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="preferred">主词</el-radio-button>
              <el-radio-button value="banned">否词</el-radio-button>
            </el-radio-group>
          </div>
        </div>
      </template>

      <div class="add-bar">
        <el-input v-model="newTerm" :size="isMobile ? 'small' : 'default'" placeholder="输入关键词" :style="isMobile ? 'width:100%' : 'width:280px'" />
        <el-radio-group v-model="newType" :size="isMobile ? 'small' : 'default'">
          <el-radio-button value="preferred">主词</el-radio-button>
          <el-radio-button value="banned">否词</el-radio-button>
        </el-radio-group>
        <el-button type="primary" :icon="'Plus'" :size="isMobile ? 'small' : 'default'" @click="add">添加</el-button>
      </div>

      <ResponsiveTable :data="filtered" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="term" label="关键词" min-width="200" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="typeTagType(row.type)" size="small">{{ ({ preferred: '主词', banned: '否词', category_required: '类目必备' })[row.type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类目" width="160">
          <template #default="{ row }">
            <span class="text-muted" style="font-size: 12px">{{ row.category === '*' ? '全部类目' : row.category }}</span>
          </template>
        </el-table-column>
        <el-table-column label="30d 曝光" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ row.impressions30d.toLocaleString() }}</span></template></el-table-column>
        <el-table-column label="30d 转化" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ row.conversions30d }}</span></template></el-table-column>
        <el-table-column label="来源" width="160">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ ({ manual: '手动', imported_from_search_terms: '搜索词导入', system: '系统', user: '用户' })[row.source] || row.source }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="添加时间" width="120"><template #default="{ row }"><span class="tnum text-muted">{{ row.addedAt }}</span></template></el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }"><el-button size="small" link type="danger" @click="remove(row)">移除</el-button></template>
        </el-table-column>
        <template #mobile-type="{ row, value }">
          <el-tag :type="typeTagType(row.type)" size="small">{{ value }}</el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="danger" plain @click.stop="remove(row)">移除</el-button>
        </template>
      </ResponsiveTable>
    </el-card>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: 0; }
.kpi-row > .el-col { margin-bottom: 12px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.filter-row { display: flex; gap: 8px; flex-wrap: wrap; }
.add-bar { display: flex; gap: 8px; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--line-soft); margin-bottom: 12px; flex-wrap: wrap; }
</style>
