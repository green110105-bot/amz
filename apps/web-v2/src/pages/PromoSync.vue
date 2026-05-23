<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import { useViewport } from '../composables/useViewport';
import { mockPromoSync } from '../utils/mock-data-ads';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'sku', label: 'SKU' },
  { prop: 'type', label: '类型' },
  { prop: 'startsAt', label: '开始' },
  { prop: 'endsAt', label: '结束' },
  { prop: 'status', label: '状态' },
];
const { submit } = useAudit();

const data = ref([...mockPromoSync]);

function typeLabel(t) {
  return { lightning_deal: '⚡ Lightning Deal', coupon: '🎫 Coupon', best_deal: '💎 Best Deal', prime_exclusive: '👑 Prime Exclusive' }[t] || t;
}
function statusType(s) {
  return { active: 'success', scheduled: 'warning', planning: '', completed: 'info' }[s] || '';
}
async function configure(p) {
  await submit({
    sourceModule: 'M3',
    actionType: 'CONFIGURE_PROMO_SYNC',
    target: { type: 'promo', id: p.id, sku: p.sku },
    payload: { type: p.type, linkedActions: p.linkedActions },
    description: `${p.id} 促销联动配置（${p.type}）`,
  });
}
</script>

<template>
  <div>
    <PageHeader title="促销联动" subtitle="Coupon / Lightning Deal / Best Deal 期间的广告自动协同">
      <template #extra><el-button type="primary" :icon="'Plus'">关联新促销</el-button></template>
    </PageHeader>

    <el-card shadow="never">
      <ResponsiveTable :data="data" :mobile-columns="mobileCols" stripe>
        <el-table-column prop="sku" label="SKU" width="120" />
        <el-table-column label="类型" width="180">
          <template #default="{ row }"><strong>{{ typeLabel(row.type) }}</strong></template>
        </el-table-column>
        <el-table-column label="时间" width="280">
          <template #default="{ row }">
            <div class="tnum text-muted" style="font-size: 12px">{{ row.startsAt }}</div>
            <div class="tnum text-muted" style="font-size: 12px">→ {{ row.endsAt }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ ({ active: '进行中', scheduled: '已排期', planning: '规划中', completed: '已结束' })[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="联动广告动作" min-width="280">
          <template #default="{ row }">
            <el-tag v-for="(a, i) in row.linkedActions" :key="i" size="small" effect="plain" style="margin: 2px 4px 2px 0">{{ a }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }"><el-button size="small" type="primary" plain @click="configure(row)">配置</el-button></template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click="configure(row)">配置</el-button>
        </template>
      </ResponsiveTable>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">联动策略说明</h2></template>
      <ul class="explain">
        <li><strong>Lightning Deal 启动期间：</strong>当日预算自动 +50% / SP 关键词出价 +20% / 同步 SB 协同推广 / 暂停利润 ROAS 红线（保流量）</li>
        <li><strong>Coupon 持续期间：</strong>出价微调 +10% / 关注 CVR 提升幅度</li>
        <li><strong>Best Deal / Prime Exclusive：</strong>类似 LD 但持续更久 / 全周期协同</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.explain { font-size: 13px; line-height: 1.8; padding-left: 18px; color: var(--text-muted); }
.explain strong { color: var(--text); }
</style>
