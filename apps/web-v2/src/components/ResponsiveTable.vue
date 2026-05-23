<script setup>
import { computed, useSlots } from 'vue';
import { useViewport } from '../composables/useViewport';

const props = defineProps({
  data: { type: Array, default: () => [] },
  // mobileColumns: [{ prop, label, formatter?, slot? }, ...]
  // 若不传，自动从 default slot 的 el-table-column 提取（fallback）
  mobileColumns: { type: Array, default: null },
  // 点击行回调（移动端）
  rowClickable: { type: Boolean, default: false },
});

const emit = defineEmits(['row-click']);
const slots = useSlots();
const { isMobile } = useViewport();

function getValue(row, prop, formatter) {
  let v = row;
  for (const p of (prop || '').split('.')) v = v?.[p];
  if (typeof formatter === 'function') return formatter(v, row);
  return v ?? '-';
}
</script>

<template>
  <el-table v-if="!isMobile" :data="data" v-bind="$attrs">
    <slot />
  </el-table>
  <div v-else class="rt-mobile">
    <div
      v-for="(row, i) in data"
      :key="row.id ?? i"
      class="rt-card"
      :class="{ 'rt-card--clickable': rowClickable }"
      @click="rowClickable && emit('row-click', row)"
    >
      <div v-for="col in (mobileColumns || [])" :key="col.prop" class="rt-row">
        <div class="rt-label">{{ col.label }}</div>
        <div class="rt-value">
          <slot :name="`mobile-${col.prop}`" :row="row" :value="getValue(row, col.prop, col.formatter)">
            {{ getValue(row, col.prop, col.formatter) }}
          </slot>
        </div>
      </div>
      <div v-if="slots['mobile-actions']" class="rt-actions">
        <slot name="mobile-actions" :row="row" />
      </div>
    </div>
    <div v-if="data.length === 0" class="rt-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.rt-mobile { display: flex; flex-direction: column; gap: 12px; }
.rt-card { background: #fff; border-radius: 8px; padding: 12px; border: 1px solid #ebeef5; }
.rt-card--clickable { cursor: pointer; }
.rt-card--clickable:active { background: #f5f7fa; }
.rt-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 14px; }
.rt-row:not(:last-child) { border-bottom: 1px dashed #ebeef5; }
.rt-label { color: #909399; flex-shrink: 0; min-width: 80px; }
.rt-value { color: #303133; text-align: right; word-break: break-all; }
.rt-actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.rt-empty { text-align: center; color: #909399; padding: 24px 0; }
</style>
