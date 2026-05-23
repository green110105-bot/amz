<script setup>
import { useViewport } from '../composables/useViewport';
const props = defineProps({ modelValue: Boolean, title: String, size: { default: '500px' } });
const emit = defineEmits(['update:modelValue', 'close']);
const { isMobile } = useViewport();
</script>
<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="$emit('close')"
    :title="title"
    :direction="isMobile ? 'btt' : 'rtl'"
    :size="isMobile ? '88%' : size"
  >
    <slot />
  </el-drawer>
</template>
