<script setup>
// CompetitorAttack — 竞品 ASIN 攻击 · M4 视图（攻击触发走 M3 后端）
// 该页面属于 M4 视图层；推荐攻击目标来源于 m4 competitors + 攻击执行可通过 M3 strategies
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { useCompetitors } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';
import { useAudit } from '../composables/useAudit';

const comp = useCompetitors();
const bus = useNotificationsBus();
const { submit } = useAudit();
const { isMobile } = useViewport();

onMounted(() => comp.fetch({}, false));

const targets = computed(() => {
  // 从 m4_competitor_snapshots 中筛选可攻击目标
  return (comp.list.value || []).map((c) => {
    const rating = c.rating || 0;
    const reviewCount = c.reviewCount || c.review_count || 0;
    // 简易可攻击度评分（前端展示用）
    const attackability = Math.max(0, Math.min(1, 0.5 + (rating < 4 ? 0.3 : 0) + (reviewCount < 500 ? 0.2 : 0)));
    return {
      asin: c.competitorAsin || c.asin,
      title: c.title || '-',
      bsr: c.bsr || 0,
      rating,
      price: c.price || 0,
      reviewCount,
      attackability,
      recommendedBudget: Math.round(20 + attackability * 30),
      recommendedBid: Math.round((c.price || 30) * 0.04 * 100) / 100,
      expectedShare: attackability * 0.08,
      reason: `BSR #${c.bsr || '-'} · 评分 ${rating || '-'} · ${reviewCount} 评论`,
    };
  }).sort((a, b) => b.attackability - a.attackability);
});

function attackabilityType(a) {
  if (a >= 0.85) return 'success';
  if (a >= 0.7) return 'primary';
  return 'info';
}

async function launch(target) {
  // 攻击启动走 M3 audit + 通知（M3 后端 endpoint 由 M3 spec 规划）
  await submit({
    sourceModule: 'M3',
    actionType: 'LAUNCH_COMPETITOR_ATTACK',
    target: { type: 'competitor', id: target.asin },
    payload: { budget: target.recommendedBudget, bid: target.recommendedBid, attackability: target.attackability },
    expectedImpact: { metric: 'expected_share', change: target.expectedShare, horizonDays: 30 },
    description: `SD-PT 攻击 ${target.asin} · 预算 $${target.recommendedBudget}/天`,
  });
  bus.pushLocal({ severity: 'P2', sourceModule: 'M3', title: `攻击已启动 → ${target.asin}`, body: `预算 $${target.recommendedBudget}/天`, link: '/competitors/attack' });
}
async function batchLaunch() {
  for (const t of targets.value) await launch(t);
  ElMessage.success(`已批量启动 ${targets.value.length} 个攻击`);
}

const mobileCols = [
  { prop: 'asin', label: 'ASIN' },
  { prop: 'title', label: '标题' },
  { prop: 'bsr', label: 'BSR', formatter: (v) => `#${v}` },
  { prop: 'rating', label: '评分', formatter: (v) => v > 0 ? `⭐ ${v}` : '无评论' },
  { prop: 'attackability', label: '可攻击度', formatter: (v) => `${Math.round(v * 100)}%` },
];
</script>

<template>
  <div>
    <PageHeader title="竞品 ASIN 攻击" subtitle="基于 BSR / 评分 / 价格筛选目标 · 推荐预算 + 出价 · SD/SP 商品定位">
      <template #extra><el-button type="primary" :icon="'Aim'" :disabled="!targets.length" @click="batchLaunch">批量启动攻击</el-button></template>
    </PageHeader>

    <el-card shadow="never" v-loading="comp.loading.value">
      <template #header>
        <div class="card-header">
          <h2 class="section-title">推荐攻击目标（按可攻击度排序）</h2>
          <span class="text-muted">来源：m4 竞品快照 · 实时计算可攻击度</span>
        </div>
      </template>
      <EmptyState v-if="!comp.loading.value && targets.length === 0" title="暂无攻击目标" description="先到竞品作战室添加竞品并触发快照" icon="Aim" />
      <ResponsiveTable v-else :data="targets" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="asin" label="ASIN" width="120"><template #default="{ row }"><span class="tnum text-muted">{{ row.asin }}</span></template></el-table-column>
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="BSR" align="right" width="80"><template #default="{ row }"><span class="tnum">#{{ row.bsr }}</span></template></el-table-column>
        <el-table-column label="评分" align="right" width="100">
          <template #default="{ row }">
            <span v-if="row.rating > 0" class="tnum">⭐ {{ row.rating }}</span>
            <span v-else class="text-muted">无评论</span>
          </template>
        </el-table-column>
        <el-table-column label="价格" align="right" width="80"><template #default="{ row }"><span class="tnum">${{ row.price }}</span></template></el-table-column>
        <el-table-column label="可攻击度" align="right" width="120">
          <template #default="{ row }">
            <el-tag :type="attackabilityType(row.attackability)" size="small" effect="plain">
              {{ Math.round(row.attackability * 100) }}%
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="预期份额" align="right" width="100">
          <template #default="{ row }"><span class="tnum text-success">+{{ Math.round(row.expectedShare * 100) }}%</span></template>
        </el-table-column>
        <el-table-column label="推荐配置" width="180">
          <template #default="{ row }">
            <div style="font-size: 12px"><span class="text-muted">预算</span> <strong>${{ row.recommendedBudget }}/天</strong></div>
            <div style="font-size: 12px"><span class="text-muted">出价</span> <strong>${{ row.recommendedBid }}</strong></div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="launch(row)">启动</el-button></template>
        </el-table-column>

        <template #mobile-attackability="{ row }">
          <el-tag :type="attackabilityType(row.attackability)" size="small" effect="plain">
            {{ Math.round(row.attackability * 100) }}%
          </el-tag>
        </template>
        <template #mobile-actions="{ row }">
          <span class="text-muted" style="font-size: 12px">预算 ${{ row.recommendedBudget }}/天 · 出价 ${{ row.recommendedBid }}</span>
          <el-button size="small" type="primary" plain @click="launch(row)">启动</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">推荐目标的"为什么"</h2></template>
      <ul class="reasons">
        <li v-for="t in targets" :key="t.asin">
          <strong class="tnum">{{ t.asin }}</strong>
          <span class="text-muted">— {{ t.reason }}</span>
        </li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.reasons { font-size: 13px; padding-left: 16px; line-height: 1.9; }
.reasons li { margin-bottom: 4px; }
.mt-16 { margin-top: 16px; }
</style>
