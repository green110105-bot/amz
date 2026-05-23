<script setup>
// Top-down drawer that mirrors 领星's MCompare panel.
// One component, N tab configurations driven by entity type.
//
// Props:
//   modelValue   : v-model open/closed
//   entity       : { type, id, name, ... }
//                  type ∈ campaign | keyword | target | adgroup | ad | placement | portfolio
//   dateRange    : [start, end] ISO date strings (optional)
//   initialTab   : tab key to open on first show
//
// Emits:
//   update:modelValue
//   tab-change

import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { FullScreen, Refresh } from '@element-plus/icons-vue';
import { tabsForEntity, TAB_META, ENTITY_TYPE_LABEL } from '../utils/ad-drawer-config.js';
import { useViewport } from '../composables/useViewport';

// Lazy-load tab components so the initial chunk only ships drawer shell.
// Each tab JS payload is ~3-5 KB minified — when user opens drawer, only the
// active tab's chunk is fetched.
const TAB_COMPONENTS = {
  daily:           defineAsyncComponent(() => import('./ad-drawer-tabs/TabDaily.vue')),
  compare:         defineAsyncComponent(() => import('./ad-drawer-tabs/TabCompare.vue')),
  hourly:          defineAsyncComponent(() => import('./ad-drawer-tabs/TabHourly.vue')),
  placement:       defineAsyncComponent(() => import('./ad-drawer-tabs/TabPlacement.vue')),
  userSearchTerms: defineAsyncComponent(() => import('./ad-drawer-tabs/TabUserSearchTerms.vue')),
  history:         defineAsyncComponent(() => import('./ad-drawer-tabs/TabHistory.vue')),
  overBudget:      defineAsyncComponent(() => import('./ad-drawer-tabs/TabOverBudget.vue')),
  attribution:     defineAsyncComponent(() => import('./ad-drawer-tabs/TabAttribution.vue')),
  timeSeries:      defineAsyncComponent(() => import('./ad-drawer-tabs/TabTimeSeries.vue')),
  keyKeywords:     defineAsyncComponent(() => import('./ad-drawer-tabs/TabKeyKeywords.vue')),
};

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  entity: { type: Object, default: () => ({}) },
  dateRange: { type: Array, default: () => null },
  initialTab: { type: String, default: 'daily' },
});

const emit = defineEmits(['update:modelValue', 'tab-change']);

const { isMobile } = useViewport();

const visibleTabKeys = computed(() => tabsForEntity(props.entity?.type));
const activeTab = ref(props.initialTab);

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const internalDateRange = ref(props.dateRange || [daysAgo(6), today()]);

watch(() => props.modelValue, (open) => {
  if (open) {
    const target = props.initialTab && visibleTabKeys.value.includes(props.initialTab)
      ? props.initialTab
      : visibleTabKeys.value[0];
    activeTab.value = target;
    if (props.dateRange) internalDateRange.value = props.dateRange;
  }
});

watch(activeTab, (k) => emit('tab-change', k));

const entityTypeLabel = computed(() => ENTITY_TYPE_LABEL[props.entity?.type] || '实体');

const subTitle = computed(() => {
  return props.entity?.name || props.entity?.term || props.entity?.asin || props.entity?.id || '';
});

const breadcrumb = computed(() => {
  const e = props.entity || {};
  const parts = [];
  if (e.portfolioName) parts.push(e.portfolioName);
  if (e.campaignName)  parts.push(e.campaignName);
  if (e.adGroupName)   parts.push(e.adGroupName);
  return parts;
});

const tagType = computed(() => {
  const t = props.entity?.type;
  if (t === 'campaign')  return 'primary';
  if (t === 'keyword')   return 'success';
  if (t === 'target')    return 'warning';
  if (t === 'adgroup')   return 'info';
  if (t === 'ad')        return 'info';
  if (t === 'placement') return '';
  return '';
});

const PRESET_RANGES = [
  { label: '今天',    days: 0 },
  { label: '近 7 天', days: 6 },
  { label: '近 30 天', days: 29 },
];
function applyPreset(days) {
  internalDateRange.value = [daysAgo(days), today()];
}
function refreshData() {
  // Trigger re-fetch by toggling a key. Tabs watch activeTab so we
  // briefly switch and switch back to force re-render.
  const k = activeTab.value;
  activeTab.value = '__refresh__';
  setTimeout(() => { activeTab.value = k; }, 0);
}

// Global Escape handler as belt-and-suspenders fallback —
// el-drawer's built-in close-on-press-escape only fires when its overlay has focus.
function onKeydown(e) {
  if (props.modelValue && e.key === 'Escape') {
    emit('update:modelValue', false);
  }
}
onMounted(() => { window.addEventListener('keydown', onKeydown); });
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown); });
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :direction="isMobile ? 'btt' : 'ttb'"
    :size="isMobile ? '95%' : '62%'"
    :destroy-on-close="false"
    :show-close="false"
    :close-on-press-escape="true"
    :close-on-click-modal="true"
    class="ad-analysis-drawer"
    :with-header="true">

    <template #header>
      <div class="header-wrapper">
        <div class="drawer-header">
          <div class="header-left">
            <el-tag :type="tagType" size="default" class="entity-tag">{{ entityTypeLabel }}</el-tag>
            <span class="entity-name" :title="subTitle">{{ subTitle || '—' }}</span>
            <span v-if="entity?.matchType" class="entity-meta">· {{ entity.matchType }}</span>
          </div>

          <div class="header-right">
            <el-radio-group v-model="internalDateRange" size="small" class="preset-group">
              <el-radio-button v-for="p in PRESET_RANGES" :key="p.days"
                :value="[daysAgo(p.days), today()]">{{ p.label }}</el-radio-button>
            </el-radio-group>
            <el-date-picker v-model="internalDateRange" type="daterange" size="small"
                           value-format="YYYY-MM-DD" style="width: 240px" />
            <el-button :icon="Refresh" size="small" circle @click="refreshData" title="刷新" />
            <el-button :icon="FullScreen" size="small" circle title="全屏（即将上线）" disabled />
            <el-button size="small" @click="emit('update:modelValue', false)">关闭</el-button>
          </div>
        </div>
        <div v-if="breadcrumb.length > 0" class="header-breadcrumb">
          <span v-for="(b, i) in breadcrumb" :key="i">
            <span class="bc-sep" v-if="i > 0"> / </span>{{ b }}
          </span>
        </div>
      </div>
    </template>

    <el-tabs v-model="activeTab" class="ad-tabs" type="card">
      <el-tab-pane
        v-for="key in visibleTabKeys"
        :key="key"
        :name="key"
        :label="TAB_META[key]?.label || key">
        <KeepAlive>
          <component
            :is="TAB_COMPONENTS[key]"
            :entity="entity"
            :date-range="internalDateRange"
            :active="activeTab === key" />
        </KeepAlive>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<style scoped>
.header-wrapper { width: 100%; display: flex; flex-direction: column; gap: 4px; }
.drawer-header {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  width: 100%;
}
.header-left {
  display: flex; align-items: center; gap: 10px;
  min-width: 0; flex: 1 1 auto;
}
.entity-tag { font-weight: 500; flex-shrink: 0; }
.entity-name {
  font-size: 18px; font-weight: 600; color: var(--text, #303133);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 0 1 auto; min-width: 0; max-width: 600px;
}
.entity-meta { font-size: 13px; color: var(--text-muted, #909399); flex-shrink: 0; margin-right: auto; }

.header-right {
  display: flex; align-items: center; gap: 6px;
  flex-shrink: 0;
}
.preset-group :deep(.el-radio-button__inner) { padding: 4px 8px; font-size: 12px; }

.header-breadcrumb {
  width: 100%; padding-top: 4px;
  font-size: 12px; color: var(--text-muted, #909399);
}
.bc-sep { color: #c0c4cc; margin: 0 2px; }

.ad-tabs { padding: 0 20px; }
.ad-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
.ad-tabs :deep(.el-tabs__item) { font-size: 13px; padding: 0 14px; height: 36px; line-height: 36px; }

:deep(.el-drawer__header) { padding: 16px 24px 12px; margin-bottom: 0; border-bottom: 1px solid #eef0f3; }
:deep(.el-drawer__body) { padding: 0; }

@media (max-width: 1400px) {
  /* Hide preset row to save horizontal space; keep date picker */
  .preset-group { display: none; }
}
@media (max-width: 1000px) {
  /* Even tighter: hide date picker too; user can use refresh + tab dates */
  .header-right .el-date-editor { display: none; }
}
@media (max-width: 768px) {
  .ad-tabs :deep(.el-tabs__nav-wrap) { overflow-x: auto; }
  .drawer-header { flex-wrap: wrap; gap: 8px; }
  .header-right { flex-wrap: wrap; }
  .entity-name { font-size: 16px; }
}
</style>
