<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { aiActivityForSku } from '../utils/ads-integration';
import { formatCurrency } from '../utils/format';

const props = defineProps({
  sku: { type: String, required: true },
  scope: { type: String, default: 'campaign' }, // campaign / portfolio / row
  compact: { type: Boolean, default: false },
});

const router = useRouter();
const activity = computed(() => aiActivityForSku(props.sku));

const scopeLabel = computed(() => ({
  campaign: '本 Campaign',
  portfolio: '本 Portfolio',
  row: '该 Portfolio',
})[props.scope] || '该实体');

function gotoTimeline() {
  router.push({ path: '/ads/timeline', query: { sku: props.sku } });
}
</script>

<template>
  <!-- 紧凑模式（用于表格行） -->
  <div v-if="compact" class="ai-mini" :class="{ active: activity.pending > 0 }">
    <span class="ai-mini-icon">🤖</span>
    <strong v-if="activity.pending > 0" class="ai-mini-count">{{ activity.pending }}</strong>
    <span v-else class="ai-mini-zero">—</span>
  </div>

  <!-- 完整 banner 模式 -->
  <div v-else class="ai-banner" :class="{ 'no-pending': activity.pending === 0 }" @click="gotoTimeline">
    <div class="ab-left">
      <span class="ab-icon">🤖</span>
      <div class="ab-text">
        <strong v-if="activity.pending > 0">
          {{ scopeLabel }}有 <span class="ab-num">{{ activity.pending }}</span> 条待处理 AI 建议
        </strong>
        <strong v-else>{{ scopeLabel }}暂无新 AI 建议</strong>
        <div class="ab-stats">
          <span v-if="activity.observing > 0">观察期 {{ activity.observing }} 条</span>
          <span v-if="activity.rejected > 0">· 已忽略 {{ activity.rejected }} 条</span>
          <span v-if="activity.totalImpact > 0">· 待捕获影响 <strong>+{{ formatCurrency(activity.totalImpact, 'USD') }}</strong>/月</span>
        </div>
      </div>
    </div>

    <div class="ab-preview" v-if="activity.topPending.length">
      <div
        v-for="s in activity.topPending.slice(0, 3)"
        :key="s.id"
        class="ab-prev-item"
      >
        <span class="prev-sev" :style="{ background: s.severity.color }">{{ s.severity.label }}</span>
        <span class="prev-title">{{ s.title.replace('建议：', '') }}</span>
      </div>
    </div>

    <el-button type="primary" size="small" :icon="'Right'" @click.stop="gotoTimeline">
      去 Timeline 处理
    </el-button>
  </div>
</template>

<style scoped>
.ai-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: linear-gradient(90deg, #eef2ff 0%, #f5f3ff 100%);
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  margin-bottom: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.ai-banner:hover {
  border-color: #8b5cf6;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.1);
}
.ai-banner.no-pending {
  background: #fafbfc;
  border-color: #e5e7eb;
}
.ai-banner.no-pending .ab-num { color: var(--text-muted); }

.ab-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}
.ab-icon { font-size: 24px; }
.ab-text strong {
  display: block;
  font-size: 13px;
  margin-bottom: 2px;
}
.ab-num {
  font-size: 18px;
  color: #6366f1;
  font-weight: 700;
}
.ab-stats {
  font-size: 11px;
  color: var(--text-muted);
}
.ab-stats strong { color: #10b981; font-family: ui-monospace, monospace; }

.ab-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ab-prev-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.prev-sev {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 2px;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  flex-shrink: 0;
}
.prev-title {
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* compact 模式 */
.ai-mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f3f4f6;
  font-size: 12px;
  min-width: 36px;
  justify-content: center;
}
.ai-mini.active {
  background: linear-gradient(90deg, #eef2ff 0%, #ede9fe 100%);
  border: 1px solid #c7d2fe;
}
.ai-mini-icon { font-size: 12px; }
.ai-mini-count {
  font-weight: 700;
  color: #6366f1;
  font-family: ui-monospace, monospace;
}
.ai-mini-zero { color: #cbd5e1; }
</style>
