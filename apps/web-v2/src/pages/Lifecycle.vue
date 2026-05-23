<script setup>
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import StageTransitionAlert from '../components/StageTransitionAlert.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { mockSkus } from '../utils/mock-data';
import { useAudit } from '../composables/useAudit';

const { isMobile } = useViewport();
const { submit } = useAudit();

const STAGES = [
  { id: 'launch', label: '🌱 新品期', desc: '起量 + 拿评论 · 容忍 ACOS 30/60/100%（用户选）', color: '#a5b4fc', strategies: 10 },
  { id: 'growth', label: '🌳 成长期', desc: '扩规模 + 抢排名 · 自动转手动 + 长尾词扩展', color: '#22d3ee', strategies: 12 },
  { id: 'mature', label: '🌲 成熟期', desc: '守排名 + 利润 · 否词清理 + 出价精细化', color: '#f59e0b', strategies: 12 },
  { id: 'decline', label: '🍂 衰退期', desc: '清库 + 减投入 · 触发 M2 滞销决策', color: '#fb923c', strategies: 8 },
];

const grouped = computed(() => {
  return STAGES.map((stage) => ({
    ...stage,
    skus: mockSkus.filter((s) => s.lifecycle === stage.id),
  }));
});

async function override(sku, newStage) {
  await submit({
    sourceModule: 'M3',
    actionType: 'LIFECYCLE_OVERRIDE',
    target: { type: 'sku', id: sku.sku, asin: sku.asin },
    payload: { newStage, reason: 'manual_override' },
    description: `${sku.sku} 手动覆盖为：${newStage}（14 天）`,
  });
}
</script>

<template>
  <MobileFallback
    v-if="isMobile"
    page-name="生命周期管理 (深度)"
    reason="本页含 4 阶段并列卡片 + 跨 SKU 切阶段操作，建议在桌面端使用。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <p style="margin: 0">AI 自动识别 4 阶段：新品期 / 成长期 / 成熟期 / 衰退期。</p>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else>
    <PageHeader title="生命周期管理" subtitle="AI 自动识别 4 阶段 · 含迟滞防抖 · 可手动覆盖" />

    <StageTransitionAlert />

    <el-row :gutter="16">
      <el-col v-for="stage in grouped" :key="stage.id" :xs="24" :sm="12" :md="6">
        <el-card shadow="never" class="stage-card" :style="{ borderTopColor: stage.color }">
          <div class="stage-head">
            <h3 class="stage-label">{{ stage.label }}</h3>
            <span class="stage-count">{{ stage.skus.length }} SKU</span>
          </div>
          <p class="stage-desc">{{ stage.desc }}</p>
          <div class="stage-meta">
            <el-tag size="small" effect="plain">{{ stage.strategies }} 条策略</el-tag>
          </div>
          <div class="sku-list">
            <div v-for="sku in stage.skus" :key="sku.id" class="sku-item">
              <div>
                <strong>{{ sku.sku }}</strong>
                <p class="text-muted">{{ sku.title }}</p>
              </div>
              <el-dropdown trigger="click" @command="(c) => override(sku, c)">
                <el-button size="small" plain :icon="'MoreFilled'" circle />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-for="s in STAGES.filter(s => s.id !== stage.id)" :key="s.id" :command="s.label">
                      手动覆盖为 {{ s.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <el-empty v-if="stage.skus.length === 0" description="暂无" :image-size="60" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">迟滞机制说明</h2></template>
      <ul class="rules">
        <li><strong>新品 → 成长</strong>：进入后<strong>至少 21 天</strong>不能退回；除非评论数大量减少（如 Vine 取消）</li>
        <li><strong>成长 → 成熟</strong>：进入后<strong>至少 30 天</strong>不能退回；除非销量连续 4 周下降</li>
        <li><strong>成熟 → 衰退</strong>：仅在销量 4 周连续下降 + 库存周转 &gt; 90 天 同时满足</li>
        <li><strong>任意 → 衰退</strong>：单方向，进入衰退后回升需"成长期信号" 21 天才能升回成长</li>
        <li><strong>手动覆盖</strong>：14 天内不会被自动评估覆盖（用户优先）</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.stage-card {
  border: 1px solid var(--line);
  border-top-width: 3px;
}
.stage-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.stage-label { font-size: 16px; font-weight: 700; margin: 0; }
.stage-count { font-size: 12px; color: var(--text-muted); }
.stage-desc { font-size: 12px; color: var(--text-muted); margin: 0 0 10px; line-height: 1.5; }
.stage-meta { margin-bottom: 12px; }
.sku-list { padding-top: 12px; border-top: 1px dashed var(--line-soft); }
.sku-item { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 1px dashed var(--line-soft); font-size: 13px; }
.sku-item:last-child { border-bottom: none; }
.sku-item strong { display: block; font-size: 13px; }
.sku-item p { margin: 2px 0 0; font-size: 11px; color: var(--text-muted); }
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.rules { font-size: 13px; line-height: 1.8; padding-left: 20px; color: var(--text); }
.rules li { margin-bottom: 4px; }
.rules strong { color: var(--primary); }
</style>
