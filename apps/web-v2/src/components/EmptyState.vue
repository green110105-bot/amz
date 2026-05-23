<script setup>
defineProps({
  title: { type: String, default: '暂无数据' },
  description: { type: String, default: '' },
  icon: { type: String, default: 'DocumentRemove' },
});
</script>

<template>
  <div class="empty-state">
    <el-icon :size="40" class="empty-icon"><component :is="icon" /></el-icon>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  background: #fff;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  color: var(--text-muted);
}
.empty-icon {
  color: var(--text-soft);
  margin-bottom: 12px;
}
.empty-title {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 4px;
  color: var(--text);
}
.empty-desc {
  margin: 0;
  font-size: 13px;
  text-align: center;
  max-width: 360px;
}
</style>
