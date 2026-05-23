<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { mockStageTransitions } from '../utils/mock-data-ads';

const props = defineProps({
  compact: { type: Boolean, default: false },
});

const router = useRouter();
const transitions = ref([...mockStageTransitions]);
const expanded = ref(true);

function stageEmoji(s) {
  return { launch: '🌱', growth: '🌳', mature: '🌲', decline: '🍂' }[s] || '';
}
function stageLabel(s) {
  return { launch: '新品期', growth: '成长期', mature: '成熟期', decline: '衰退期' }[s] || s;
}

function applyStrategy(transition, strategy) {
  if (strategy.action === 'promote_to_manual') {
    router.push('/ads/promote-to-manual');
    return;
  }
  if (strategy.action === 'trigger_m2_decision') {
    router.push('/inventory/reorder');
    return;
  }
  ElMessage.success(`✓ ${transition.sku} · ${strategy.id} ${strategy.label} 已应用（已提交审计中心）`);
}

function applyAll(transition) {
  ElMessage.success(`✓ ${transition.sku} 已应用 ${transition.suggestedStrategies.length} 条 ${stageLabel(transition.toStage)} 策略`);
}
</script>

<template>
  <el-card v-if="transitions.length" shadow="never" class="alert-card">
    <template #header>
      <div class="alert-head">
        <div>
          <h2 class="title"><el-icon style="color: var(--warning)"><WarningFilled /></el-icon> 阶段切换提醒</h2>
          <p class="subtitle">{{ transitions.length }} 个 SKU 检测到生命周期切换，AI 已识别推荐策略</p>
        </div>
        <el-button v-if="!compact" link @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</el-button>
      </div>
    </template>

    <div v-if="expanded" class="trans-list">
      <div v-for="t in transitions" :key="t.id" class="trans-item">
        <div class="trans-arrow">
          <span class="big-emoji">{{ stageEmoji(t.fromStage) }}</span>
          <el-icon><Right /></el-icon>
          <span class="big-emoji">{{ stageEmoji(t.toStage) }}</span>
        </div>
        <div class="trans-body">
          <div class="trans-title">
            <strong>SKU {{ t.sku }} 已进入{{ stageLabel(t.toStage) }}</strong>
            <el-tag size="small" effect="plain">置信度 {{ Math.round(t.confidence * 100) }}%</el-tag>
            <span class="text-muted">{{ t.daysSince }} 天前检测</span>
          </div>
          <div class="trans-signals">
            <span class="signal-label">信号：</span>
            <el-tag v-for="(sig, i) in t.signals" :key="i" size="small" effect="plain" type="info" style="margin: 0 4px 4px 0">{{ sig }}</el-tag>
          </div>
          <div class="trans-strategies">
            <span class="signal-label">推荐策略：</span>
            <el-button v-for="s in t.suggestedStrategies" :key="s.id" size="small" type="primary" plain @click="applyStrategy(t, s)">
              {{ s.id }} · {{ s.label }}
            </el-button>
            <el-button size="small" :icon="'CircleCheck'" @click="applyAll(t)">全部应用</el-button>
          </div>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.alert-card { border-left: 3px solid var(--warning); margin-bottom: 16px; }
.alert-head { display: flex; justify-content: space-between; align-items: flex-start; }
.title { font-size: 16px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 6px; }
.subtitle { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }

.trans-list { display: flex; flex-direction: column; gap: 12px; }
.trans-item { display: grid; grid-template-columns: 100px 1fr; gap: 16px; padding: 14px 0; border-bottom: 1px dashed var(--line-soft); }
.trans-item:last-child { border-bottom: none; }
.trans-arrow { display: flex; align-items: center; gap: 4px; font-size: 24px; }
.big-emoji { font-size: 28px; }

.trans-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.trans-title strong { font-size: 14px; }
.trans-signals { margin-bottom: 8px; font-size: 12px; }
.signal-label { font-size: 12px; color: var(--text-muted); margin-right: 4px; }
.trans-strategies { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
</style>
