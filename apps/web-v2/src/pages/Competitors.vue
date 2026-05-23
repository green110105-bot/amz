<script setup>
// Competitors — 9 维监控 + snapshot 按钮 + linkedActions 跳转
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { formatCurrency } from '../utils/format';
import { useCompetitors } from '../composables/useM4State';

const route = useRoute();
const router = useRouter();
const comp = useCompetitors();
const { isMobile } = useViewport();

const asinFilter = ref(route.query.asin || '');

watch(asinFilter, () => {
  router.replace({ query: asinFilter.value ? { asin: asinFilter.value } : {} });
  load();
});

async function load() {
  const params = {};
  if (asinFilter.value) params.asin = asinFilter.value;
  await comp.fetch(params, true);
}
onMounted(load);

const competitors = computed(() => comp.list.value || []);

function jumpAction(action) {
  if (typeof action !== 'string') {
    if (action.path) {
      router.push(action.path);
      return;
    }
    return;
  }
  if (action.includes('跟价')) router.push('/repricing');
  else if (action.includes('M2')) router.push('/profit/skus');
  else if (action.includes('M1')) router.push('/listings');
  else if (action.includes('M3') || action.includes('品牌词')) router.push('/ads/brand-defense');
  else if (action.includes('M4')) ElMessage.info('已加入监控列表');
  else ElMessage.info(action);
}

function strategyLabel(s) {
  return {
    clearance_or_event_prep: '清库存 / 备战活动',
    positioning_upgrade: '定位升级',
    variant_expansion: '变体扩展',
    aggressive_attack: '主动攻击',
  }[s] || s;
}

async function addCompetitor() {
  try {
    const { value } = await ElMessageBox.prompt('竞品 ASIN', '添加竞品', { confirmButtonText: '添加' });
    if (!value) return;
    await comp.add({ competitorAsin: value });
  } catch (_) {}
}

async function snapshot() {
  await comp.snapshot({});
}

async function dismissChange(asin, idx, reason) {
  await comp.dismissChange(asin, { changeIdx: idx, reason: reason || '人工忽略' });
  await load();
}
</script>

<template>
  <div>
    <PageHeader title="竞品作战室" subtitle="9 维监控 + AI 解读 + 关联响应（跨模块跳转）">
      <template #extra>
        <div class="toolbar">
          <el-input v-model="asinFilter" placeholder="ASIN" size="default" class="tb-input" clearable />
          <el-button :icon="'Refresh'" @click="snapshot" :loading="comp.loading.value">快照</el-button>
          <el-button type="primary" :icon="'Plus'" @click="addCompetitor">添加竞品</el-button>
        </div>
      </template>
    </PageHeader>

    <div v-loading="comp.loading.value">
      <EmptyState v-if="!comp.loading.value && competitors.length === 0" title="暂无竞品" description="点击添加 + 快照" icon="DataAnalysis" />
      <el-row :gutter="16">
        <el-col v-for="c in competitors" :key="c.competitorAsin || c.asin" :span="24">
          <el-card shadow="never" class="comp-card">
            <div class="comp-head">
              <div class="comp-info">
                <div class="comp-asin">{{ c.competitorAsin || c.asin }}</div>
                <h3 class="comp-title">{{ c.title || '-' }}</h3>
                <div class="comp-meta">
                  <span class="metric"><b class="tnum">{{ formatCurrency(c.price, 'USD') }}</b><small>当前价</small></span>
                  <span class="metric"><b class="tnum">#{{ c.bsr || '-' }}</b><small>BSR</small></span>
                  <span class="metric"><b class="tnum">⭐ {{ c.rating || '-' }}</b><small>{{ c.reviewCount || c.review_count || 0 }} 评论</small></span>
                  <span v-if="c.adPositions?.length || c.ad_positions?.length" class="metric"><b>{{ (c.adPositions || c.ad_positions).length }}</b><small>广告位</small></span>
                </div>
              </div>
              <div class="comp-img-placeholder">
                <el-icon :size="40" color="#cbd5e1"><Picture /></el-icon>
              </div>
            </div>

            <div class="comp-changes" v-if="(c.changes || c.listingChanges || c.listing_changes || []).length">
              <div v-for="(change, i) in (c.changes || c.listingChanges || c.listing_changes || [])" :key="i" class="change-item">
                <div class="change-time">
                  <el-icon :size="14" color="#fbbf24"><WarningFilled /></el-icon>
                  <span>{{ change.when || change.at || '-' }}</span>
                </div>
                <div class="change-content">
                  <div class="change-head">
                    <strong>{{ ({ price: '价格变化', listing: 'Listing 变化', new_listing: '新品上架', bsr: 'BSR 变化', review: '评论变化' })[change.dimension] || change.dimension }}</strong>
                    <el-tag size="small" effect="plain">{{ strategyLabel(change.strategy) }}</el-tag>
                  </div>
                  <p class="change-detail">
                    <span v-if="change.from !== null && change.from !== undefined">从 <strong>{{ typeof change.from === 'number' ? formatCurrency(change.from, 'USD') : change.from }}</strong> → </span>
                    <span><strong>{{ typeof change.to === 'number' ? formatCurrency(change.to, 'USD') : change.to }}</strong></span>
                  </p>
                  <p class="ai-interp">🤖 AI 解读：{{ change.interpretation }}</p>
                  <div class="linked-actions">
                    <el-button v-for="(la, j) in (change.linkedActions || [])" :key="j" size="small" type="primary" plain @click="jumpAction(la)">
                      <el-icon><Right /></el-icon>{{ typeof la === 'string' ? la : la.label }}
                    </el-button>
                    <el-button size="small" link @click="dismissChange(c.competitorAsin || c.asin, i, '人工忽略')">忽略</el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.comp-card { margin-bottom: 16px; }
.comp-head { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px dashed var(--line-soft); }
.comp-asin { font-family: ui-monospace, monospace; color: var(--text-muted); font-size: 12px; }
.comp-title { margin: 4px 0 8px; font-size: 16px; }
.comp-meta { display: flex; gap: 24px; }
.comp-meta .metric { display: flex; flex-direction: column; }
.comp-meta .metric b { font-size: 16px; font-weight: 700; }
.comp-meta .metric small { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.comp-img-placeholder { width: 100px; height: 100px; background: #f9fafb; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.comp-changes { margin-top: 12px; }
.change-item { display: grid; grid-template-columns: 120px 1fr; gap: 16px; padding: 12px 0; border-bottom: 1px dashed var(--line-soft); }
.change-item:last-child { border-bottom: none; }
.change-time { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
.change-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.change-detail { margin: 0 0 6px; font-size: 13px; }
.ai-interp { margin: 6px 0 10px; padding: 8px 10px; font-size: 13px; background: #eff6ff; border-left: 3px solid var(--primary); border-radius: 4px; color: var(--text); }
.linked-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tb-input { width: 140px; }
@media (max-width: 767px) {
  .toolbar { width: 100%; }
  .tb-input { width: 100%; }
  .comp-head { flex-direction: column; }
  .comp-img-placeholder { width: 80px; height: 80px; align-self: flex-end; }
  .comp-meta { flex-wrap: wrap; gap: 12px 16px; }
  .change-item { grid-template-columns: 1fr; gap: 4px; }
  .change-time { font-size: 11px; }
}
</style>
