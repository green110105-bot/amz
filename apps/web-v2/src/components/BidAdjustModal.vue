<script setup>
import { computed, ref, watch } from 'vue';
import { computeBidPreview, validateBidInput } from './bid-adjust-engine.js';

const props = defineProps({
  modelValue: Boolean,           // open/closed
  rows: { type: Array, default: () => [] },   // [{ id, term/asin, bid, ... }]
  minBid: { type: Number, default: 0.02 },    // Amazon SP minimum
  maxBid: { type: Number, default: 1000 },    // Amazon SP maximum
  title: { type: String, default: '批量调价' },
});

const emit = defineEmits(['update:modelValue', 'confirm']);

// 5 modes — same shape as 领星's "调价" dialog
const MODES = [
  { value: 'set',              label: '设为固定值',  unit: '$', sign: '=',  example: '0.75' },
  { value: 'add_amount',       label: '增加固定金额', unit: '$', sign: '+',  example: '0.10' },
  { value: 'subtract_amount',  label: '减少固定金额', unit: '$', sign: '-',  example: '0.10' },
  { value: 'add_percent',      label: '按比例增加',   unit: '%', sign: '+',  example: '10' },
  { value: 'subtract_percent', label: '按比例减少',   unit: '%', sign: '-',  example: '10' },
];

const mode = ref('set');
const value = ref(0.75);
const applyMin = ref(true);
const applyMax = ref(true);

watch(() => props.modelValue, (open) => {
  if (open) {
    // Sensible default: median of current bids, rounded to nearest cent
    const bids = props.rows.map((r) => Number(r.bid)).filter((n) => Number.isFinite(n));
    if (bids.length > 0 && mode.value === 'set') {
      const sorted = [...bids].sort((a, b) => a - b);
      value.value = Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100;
    }
  }
});

const previewOut = computed(() => computeBidPreview(props.rows, {
  mode: mode.value,
  value: Number(value.value) || 0,
  minBid: props.minBid,
  maxBid: props.maxBid,
  applyMin: applyMin.value,
  applyMax: applyMax.value,
}));
const preview = computed(() => previewOut.value.preview);
const stats = computed(() => previewOut.value.stats);

const valid = computed(() => {
  const err = validateBidInput({ mode: mode.value, value: value.value, minBid: props.minBid });
  if (err) return false;
  return preview.value.length > 0;
});

const currentMode = computed(() => MODES.find((m) => m.value === mode.value));

function close() { emit('update:modelValue', false); }
function confirm() {
  if (!valid.value) return;
  const items = preview.value.map((x) => ({ id: x.id, bid: x.next }));
  emit('confirm', { mode: mode.value, value: Number(value.value), items, stats: stats.value });
  close();
}
</script>

<template>
  <el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :title="title" width="720px" :close-on-click-modal="false">
    <div class="bid-adjust">
      <!-- Mode picker -->
      <el-radio-group v-model="mode" class="mode-group">
        <el-radio-button v-for="m in MODES" :key="m.value" :value="m.value">{{ m.label }}</el-radio-button>
      </el-radio-group>

      <!-- Value input -->
      <div class="value-row">
        <span class="prefix">{{ currentMode?.sign }}</span>
        <el-input-number v-model="value" :precision="mode.endsWith('percent') ? 1 : 2" :step="mode.endsWith('percent') ? 1 : 0.05" :min="0" :controls="true" style="width: 180px" />
        <span class="unit">{{ currentMode?.unit }}</span>
        <span class="example">示例：{{ currentMode?.sign }}{{ currentMode?.example }}{{ currentMode?.unit }}</span>
      </div>

      <!-- Clamp options -->
      <div class="clamp-row">
        <el-checkbox v-model="applyMin">应用最低价 ${{ minBid.toFixed(2) }}</el-checkbox>
        <el-checkbox v-model="applyMax">应用最高价 ${{ maxBid.toFixed(2) }}</el-checkbox>
      </div>

      <!-- Stats banner -->
      <div class="stats">
        <div class="stat"><span class="stat-num">{{ stats.total }}</span><span class="stat-label">受影响</span></div>
        <div class="stat up"><span class="stat-num">{{ stats.ups }}</span><span class="stat-label">上调</span></div>
        <div class="stat down"><span class="stat-num">{{ stats.downs }}</span><span class="stat-label">下调</span></div>
        <div class="stat"><span class="stat-num">{{ stats.sames }}</span><span class="stat-label">不变</span></div>
        <div class="stat"><span class="stat-num">{{ stats.avgPct >= 0 ? '+' : '' }}{{ stats.avgPct.toFixed(1) }}%</span><span class="stat-label">平均变化</span></div>
      </div>

      <!-- Diff preview table -->
      <el-table :data="preview" max-height="320" stripe size="small" class="preview">
        <el-table-column label="投放" min-width="180">
          <template #default="{ row }">
            <div class="label">{{ row.label }}</div>
            <div class="meta" v-if="row.matchType">{{ row.matchType }}</div>
          </template>
        </el-table-column>
        <el-table-column label="当前 bid" width="110" align="right">
          <template #default="{ row }">${{ row.cur.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="" width="40" align="center">→</el-table-column>
        <el-table-column label="新 bid" width="110" align="right">
          <template #default="{ row }">
            <span :class="{ up: row.delta > 0.005, down: row.delta < -0.005 }">${{ row.next.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="变化" width="120" align="right">
          <template #default="{ row }">
            <span v-if="Math.abs(row.delta) < 0.005" class="meta">—</span>
            <span v-else :class="{ up: row.delta > 0, down: row.delta < 0 }">
              {{ row.delta > 0 ? '+' : '' }}${{ row.delta.toFixed(2) }}
              ({{ row.pct > 0 ? '+' : '' }}{{ row.pct.toFixed(1) }}%)
            </span>
          </template>
        </el-table-column>
      </el-table>

      <div class="audit-note">
        <el-icon><InfoFilled /></el-icon>
        所有改动会写入审计日志，可在 Audit 页面一键撤销
      </div>
    </div>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :disabled="!valid" @click="confirm">
        确认调价（{{ stats.total }} 条）
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bid-adjust { padding: 4px 0; }
.mode-group { margin-bottom: 16px; }
.value-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.value-row .prefix { font-size: 20px; font-weight: 600; color: var(--primary); width: 24px; text-align: center; }
.value-row .unit { color: var(--text-muted); font-size: 13px; }
.value-row .example { margin-left: auto; color: var(--text-muted); font-size: 12px; }
.clamp-row { display: flex; gap: 20px; margin-bottom: 16px; font-size: 13px; }

.stats { display: flex; gap: 8px; margin-bottom: 12px; padding: 10px 12px; background: #fafbfc; border-radius: 6px; border: 1px solid #eef0f3; }
.stat { flex: 1; text-align: center; }
.stat-num { display: block; font-size: 18px; font-weight: 600; color: var(--text); }
.stat-label { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.stat.up .stat-num { color: #10b981; }
.stat.down .stat-num { color: #ef4444; }

.preview .label { font-size: 13px; }
.preview .meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.up { color: #10b981; font-weight: 600; }
.down { color: #ef4444; font-weight: 600; }

.audit-note { margin-top: 12px; font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
</style>
