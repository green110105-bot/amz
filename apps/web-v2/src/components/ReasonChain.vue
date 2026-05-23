<script setup>
defineProps({
  evidence: { type: Array, default: () => [] },
  keyword: { type: String, default: '' },
  lifecycleStage: { type: String, default: '' },
  actionType: { type: String, default: '' },
  confidence: { type: [Number, String, null], default: null },
  sourceMode: { type: String, default: 'mock' },
});
</script>

<template>
  <div class="reason-chain">
    <div class="reason-section">
      <span class="reason-label">证据</span>
      <ul v-if="evidence?.length" class="reason-list">
        <li v-for="(item, i) in evidence" :key="i">{{ item }}</li>
      </ul>
      <p v-else class="reason-empty">无具体证据</p>
    </div>
    <div class="reason-meta">
      <span v-if="lifecycleStage" class="meta-pill">阶段：{{ lifecycleStage }}</span>
      <span v-if="actionType" class="meta-pill">动作：{{ actionType }}</span>
      <span v-if="keyword" class="meta-pill">关键词：{{ keyword }}</span>
      <span v-if="confidence !== null" class="meta-pill">置信度：{{ Math.round(Number(confidence) * 100) }}%</span>
      <span class="meta-pill source">来源：{{ sourceMode }}</span>
    </div>
  </div>
</template>

<style scoped>
.reason-chain {
  margin-top: 12px;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.reason-section {
  font-size: 13px;
}
.reason-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-soft);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.reason-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text);
}
.reason-list li {
  margin-bottom: 4px;
  line-height: 1.55;
}
.reason-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}
.reason-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  background: #fff;
  color: var(--text-muted);
  border: 1px solid var(--line);
  border-radius: 999px;
  font-family: ui-monospace, monospace;
}
.meta-pill.source {
  background: var(--info-soft);
  color: var(--info);
  border-color: var(--info-soft);
}
</style>
