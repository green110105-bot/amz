<script setup>
import { useViewport } from '../composables/useViewport';
const props = defineProps({ modelValue: Boolean, title: String, width: { default: '500px' } });
const emit = defineEmits(['update:modelValue', 'close']);
const { isMobile } = useViewport();
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="$emit('close')"
    :title="title"
    :width="isMobile ? '92%' : width"
    :fullscreen="false"
    :close-on-click-modal="!isMobile"
    :top="isMobile ? '4vh' : '15vh'"
  >
    <slot />
    <template #footer v-if="$slots.footer">
      <slot name="footer" />
    </template>
  </el-dialog>
</template>
