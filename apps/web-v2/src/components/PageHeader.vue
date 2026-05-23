<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <div class="page-header">
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div class="page-header-extra">
      <slot name="extra" />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 16px;
}
.page-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text);
  letter-spacing: -0.01em;
}
.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
.page-header-extra {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
