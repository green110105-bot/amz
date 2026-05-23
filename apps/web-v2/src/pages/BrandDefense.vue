<script setup>
// BrandDefense — 4 层级品牌词防御 + 竞品监测
// M4 真后端 · 通过 useBrandDefense() 拉数据 / enableLayer / counter
// T1 移动一等公民：ResponsiveTable 保留
import { computed, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useBrandDefense } from '../composables/useM4State';
import { useAudit } from '../composables/useAudit';

const { submit } = useAudit();
const { isMobile } = useViewport();
const bd = useBrandDefense();

const data = computed(() => bd.data.value || { layers: [], brandKeywords: [], brandRegistered: false });
const layers = computed(() => data.value.layers || []);
const brandKeywords = computed(() => data.value.brandKeywords || []);

onMounted(() => bd.fetch());

function statusType(s) {
  return { enabled: 'success', partial: 'warning', disabled: 'info', monitoring: 'primary' }[s] || '';
}
function statusLabel(s) {
  return { enabled: '已启用', partial: '部分启用', disabled: '未启用', monitoring: '监测中' }[s] || s;
}

// 兼容：后端可能返回 layerCode（标准），也可能返回 id
function layerCodeOf(layer) {
  return layer.layerCode || layer.id || '';
}

async function activate(layer) {
  const code = layerCodeOf(layer);
  if (!code) return;
  await bd.enableLayer(code, {});
  await submit({
    sourceModule: 'M3',
    actionType: 'ENABLE_BRAND_DEFENSE_LAYER',
    target: { type: 'brand_defense', id: code },
    payload: { layer: layer.label },
    description: `启用品牌防御 ${code}: ${layer.label}`,
  });
}

async function counter(termOrSet) {
  await bd.counter({ keywordSet: termOrSet, bidIncrease: 0.15 });
  await submit({
    sourceModule: 'M3',
    actionType: 'BRAND_COUNTER_ATTACK',
    target: { type: 'keyword_set', id: termOrSet },
    payload: { bidIncrease: 0.15 },
    description: `对 ${termOrSet} 反攻击：品牌词出价 +15%`,
  });
}

const mobileCols = [
  { prop: 'term', label: '品牌词' },
  { prop: 'impressions7d', label: '7d 曝光', formatter: (v) => (v || 0).toLocaleString() },
  { prop: 'ourBid', label: '我方出价', formatter: (v) => `$${v}` },
  { prop: 'ourPosition', label: '位置', formatter: (v) => `#${v}` },
  { prop: 'competitorBid', label: '竞品出价', formatter: (v) => `$${v}` },
];
</script>

<template>
  <div v-loading="bd.loading.value">
    <PageHeader title="品牌词防御" subtitle="4 层级防御体系：专属 Campaign · 长尾保护 · SD 自防御 · 反攻击监测">
      <template #extra>
        <el-tag :type="data.brandRegistered ? 'success' : 'warning'" effect="plain">
          {{ data.brandRegistered ? '✓ Brand Registry 已备案' : 'Brand Registry 未备案' }}
        </el-tag>
      </template>
    </PageHeader>

    <el-row :gutter="16">
      <el-col v-for="layer in layers" :key="layerCodeOf(layer)" :xs="24" :sm="24" :md="12" :lg="12">
        <el-card shadow="never" class="layer-card" :class="`layer-${layer.status}`">
          <div class="layer-head">
            <div>
              <strong class="layer-id">{{ layerCodeOf(layer) }}</strong>
              <h3 class="layer-label">{{ layer.label }}</h3>
            </div>
            <el-tag :type="statusType(layer.status)" size="default">{{ statusLabel(layer.status) }}</el-tag>
          </div>
          <p class="layer-detail">{{ layer.detail }}</p>
          <div class="layer-foot">
            <el-button v-if="layer.status === 'disabled'" type="primary" size="small" @click="activate(layer)">立即启用</el-button>
            <el-button v-if="layer.status === 'partial'" size="small" plain @click="activate(layer)">补全配置</el-button>
            <el-button v-if="layer.status === 'monitoring'" type="warning" size="small" @click="counter('B0RIVAL1 / B0RIVAL2')">反攻击</el-button>
            <el-button v-if="layer.status === 'enabled'" size="small" link>详情</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">品牌词监测</h2>
          <span class="text-muted">检测竞品在你品牌词上的出价</span>
        </div>
      </template>
      <ResponsiveTable :data="brandKeywords" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="term" label="品牌词" min-width="200" />
        <el-table-column label="7d 曝光" align="right" width="100"><template #default="{ row }"><span class="tnum">{{ (row.impressions7d || 0).toLocaleString() }}</span></template></el-table-column>
        <el-table-column label="我方出价" align="right" width="100"><template #default="{ row }"><span class="tnum">${{ row.ourBid }}</span></template></el-table-column>
        <el-table-column label="我方位置" align="right" width="100">
          <template #default="{ row }">
            <el-tag :type="row.ourPosition === 1 ? 'success' : row.ourPosition <= 3 ? 'warning' : 'danger'" size="small">#{{ row.ourPosition }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="竞品最高出价" align="right" width="120">
          <template #default="{ row }">
            <span class="tnum" :class="row.competitorBid > row.ourBid ? 'text-danger' : 'text-success'">${{ row.competitorBid }}</span>
            <el-icon v-if="row.competitorBid > row.ourBid" style="color: var(--danger); margin-left: 4px"><WarningFilled /></el-icon>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button v-if="row.competitorBid > row.ourBid" size="small" type="warning" plain @click="counter(row.term)">+ 出价</el-button>
            <el-button v-else size="small" link>详情</el-button>
          </template>
        </el-table-column>

        <template #mobile-ourPosition="{ row }">
          <el-tag :type="row.ourPosition === 1 ? 'success' : row.ourPosition <= 3 ? 'warning' : 'danger'" size="small">#{{ row.ourPosition }}</el-tag>
        </template>
        <template #mobile-competitorBid="{ row }">
          <span class="tnum" :class="row.competitorBid > row.ourBid ? 'text-danger' : 'text-success'">${{ row.competitorBid }}</span>
        </template>
        <template #mobile-actions="{ row }">
          <el-button v-if="row.competitorBid > row.ourBid" size="small" type="warning" plain @click="counter(row.term)">+ 出价</el-button>
          <el-button v-else size="small" link>详情</el-button>
        </template>
      </ResponsiveTable>
    </el-card>
  </div>
</template>

<style scoped>
.layer-card { margin-bottom: 16px; border-left: 3px solid var(--line); }
.layer-card.layer-enabled { border-left-color: var(--success); }
.layer-card.layer-partial { border-left-color: var(--warning); }
.layer-card.layer-disabled { border-left-color: var(--danger); }
.layer-card.layer-monitoring { border-left-color: var(--primary); }

.layer-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.layer-id { display: inline-block; font-size: 12px; color: var(--primary); padding: 2px 8px; background: var(--primary-soft); border-radius: 4px; margin-bottom: 4px; }
.layer-label { font-size: 15px; margin: 0; }
.layer-detail { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0 0 12px; }
.layer-foot { display: flex; gap: 8px; }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.mt-16 { margin-top: 16px; }
</style>
