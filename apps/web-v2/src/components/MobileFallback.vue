<script setup>
defineProps({ pageName: String, reason: { default: '此页面包含复杂的多列编辑，建议在桌面端使用。' } });
</script>
<template>
  <div class="mfb">
    <el-icon class="mfb-icon"><Monitor /></el-icon>
    <h3 class="mfb-title">{{ pageName || '该页面' }} · 桌面端推荐</h3>
    <p class="mfb-reason">{{ reason }}</p>
    <slot name="readonly" />
  </div>
</template>
<style scoped>
.mfb { padding: 32px 16px; text-align: center; }
.mfb-icon { font-size: 48px; color: #909399; }
.mfb-title { font-size: 16px; margin: 12px 0 4px; color: #303133; }
.mfb-reason { font-size: 13px; color: #606266; margin-bottom: 16px; }
</style>
