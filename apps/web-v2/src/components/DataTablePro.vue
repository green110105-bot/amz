<script setup>
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps({
  title: { type: String, default: '' },
  data: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  // 批量操作配置 [{ label, type, icon, handler }]
  bulkActions: { type: Array, default: () => [] },
  // 顶部时间范围
  timeRanges: { type: Array, default: () => ['今日', '昨日', '7d', '14d', '30d', '自定义'] },
  // 默认时间范围
  defaultTimeRange: { type: String, default: '7d' },
  // 行点击是否打开抽屉（通过 emit row-click 由父级处理）
  rowClickable: { type: Boolean, default: false },
  // 显示对比期
  showCompare: { type: Boolean, default: false },
  // 是否显示导出
  showExport: { type: Boolean, default: true },
  // 单元格内编辑
  inlineEdit: { type: Boolean, default: false },
  // 是否多选
  selectable: { type: Boolean, default: true },
});

const emit = defineEmits(['row-click', 'cell-edit', 'export']);

const search = ref('');
const timeRange = ref(props.defaultTimeRange);
const compareMode = ref(false);
const selectedRows = ref([]);
const sortBy = ref('');
const sortOrder = ref('descending');
const currentPage = ref(1);
const pageSize = ref(20);

// 列显示控制
const visibleCols = ref(props.columns.filter((c) => !c.defaultHidden).map((c) => c.prop));
const showColSettings = ref(false);

const displayColumns = computed(() => {
  return props.columns.filter((c) => visibleCols.value.includes(c.prop));
});

// 筛选数据
const filteredData = computed(() => {
  let list = [...props.data];
  if (search.value) {
    const k = search.value.toLowerCase();
    list = list.filter((row) => {
      return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(k));
    });
  }
  return list;
});

// 排序
const sortedData = computed(() => {
  if (!sortBy.value) return filteredData.value;
  const arr = [...filteredData.value];
  arr.sort((a, b) => {
    const va = a[sortBy.value];
    const vb = b[sortBy.value];
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortOrder.value === 'ascending' ? va - vb : vb - va;
    }
    const sa = String(va ?? '');
    const sb = String(vb ?? '');
    return sortOrder.value === 'ascending' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });
  return arr;
});

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return sortedData.value.slice(start, start + pageSize.value);
});

function handleSelectionChange(rows) {
  selectedRows.value = rows;
}

function handleSortChange({ prop, order }) {
  sortBy.value = prop;
  sortOrder.value = order || 'descending';
}

function handleRowClick(row) {
  if (props.rowClickable) emit('row-click', row);
}

async function runBulkAction(action) {
  if (!selectedRows.value.length) {
    return ElMessage.warning('请先选择行');
  }
  if (action.confirm) {
    try {
      await ElMessageBox.confirm(
        `确定对选中的 ${selectedRows.value.length} 条执行「${action.label}」？`,
        '批量操作',
        { confirmButtonText: '执行', cancelButtonText: '取消', type: 'warning' },
      );
    } catch { return; }
  }
  await action.handler(selectedRows.value);
  ElMessage.success(`已对 ${selectedRows.value.length} 条执行：${action.label}`);
  selectedRows.value = [];
}

function exportCSV() {
  const cols = displayColumns.value;
  const headers = cols.map((c) => c.label).join(',');
  const rows = sortedData.value.map((row) =>
    cols.map((c) => {
      const v = row[c.prop];
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[,\n"]/.test(s) ? `"${s}"` : s;
    }).join(','),
  );
  const csv = '﻿' + headers + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${props.title || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  emit('export', sortedData.value);
  ElMessage.success(`已导出 ${sortedData.value.length} 行`);
}

const totalCount = computed(() => filteredData.value.length);
</script>

<template>
  <div class="dtp">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="tb-left">
        <el-input
          v-model="search"
          :prefix-icon="'Search'"
          placeholder="搜索 (跨所有列模糊匹配)"
          size="default"
          clearable
          style="width: 280px"
        />
        <el-radio-group v-model="timeRange" size="default" style="margin-left: 8px">
          <el-radio-button v-for="r in timeRanges" :key="r" :value="r">{{ r }}</el-radio-button>
        </el-radio-group>
        <el-checkbox v-if="showCompare" v-model="compareMode" style="margin-left: 8px">对比期</el-checkbox>
        <slot name="toolbar-extra" />
      </div>
      <div class="tb-right">
        <el-popover
          v-model:visible="showColSettings"
          placement="bottom-end"
          width="240"
          trigger="click"
        >
          <template #reference>
            <el-button :icon="'Operation'" plain>列管理</el-button>
          </template>
          <div class="col-mgr">
            <div class="col-mgr-title">显示哪些列</div>
            <el-checkbox-group v-model="visibleCols">
              <el-checkbox
                v-for="c in columns"
                :key="c.prop"
                :value="c.prop"
                style="display: block; margin: 4px 0"
              >{{ c.label }}</el-checkbox>
            </el-checkbox-group>
          </div>
        </el-popover>
        <el-button v-if="showExport" :icon="'Download'" plain @click="exportCSV">导出 CSV</el-button>
        <slot name="toolbar-right" />
      </div>
    </div>

    <!-- 批量操作栏（仅多选时出现）-->
    <transition name="bulk-fade">
      <div v-if="selectable && selectedRows.length > 0 && bulkActions.length > 0" class="bulk-bar">
        <span class="bulk-info">
          <el-icon><CircleCheckFilled /></el-icon>
          已选 <strong>{{ selectedRows.length }}</strong> 行
        </span>
        <span class="spacer" />
        <el-button
          v-for="(a, i) in bulkActions"
          :key="i"
          :type="a.type || 'primary'"
          :icon="a.icon"
          size="small"
          @click="runBulkAction(a)"
        >{{ a.label }}</el-button>
        <el-button link type="info" size="small" @click="selectedRows = []">取消选择</el-button>
      </div>
    </transition>

    <!-- 表格主体 -->
    <el-table
      :data="pagedData"
      stripe
      border
      style="width: 100%"
      :row-class-name="(row) => (rowClickable ? 'clickable' : '')"
      @selection-change="handleSelectionChange"
      @sort-change="handleSortChange"
      @row-click="handleRowClick"
      :default-sort="sortBy ? { prop: sortBy, order: sortOrder } : undefined"
    >
      <el-table-column v-if="selectable" type="selection" width="44" fixed />

      <el-table-column
        v-for="col in displayColumns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :width="col.width"
        :min-width="col.minWidth"
        :sortable="col.sortable === false ? false : 'custom'"
        :fixed="col.fixed"
        :align="col.align || 'left'"
      >
        <template #default="{ row }">
          <slot :name="`col-${col.prop}`" :row="row" :col="col">
            <span v-if="col.type === 'money'" class="tnum">${{ Number(row[col.prop] || 0).toFixed(2) }}</span>
            <span v-else-if="col.type === 'percent'" class="tnum" :class="col.signal && col.signal(row) ? `signal-${col.signal(row)}` : ''">
              {{ ((row[col.prop] || 0) * 100).toFixed(1) }}%
            </span>
            <span v-else-if="col.type === 'int'" class="tnum">{{ Number(row[col.prop] || 0).toLocaleString() }}</span>
            <el-tag v-else-if="col.type === 'tag'" :type="col.tagType?.(row) || 'info'" size="small" effect="plain">
              {{ col.tagLabel ? col.tagLabel(row) : row[col.prop] }}
            </el-tag>
            <span v-else>{{ row[col.prop] }}</span>
          </slot>
        </template>
      </el-table-column>

      <template #empty>
        <slot name="empty">
          <div style="padding: 40px 0; color: #9ca3af; text-align: center">暂无数据</div>
        </slot>
      </template>
    </el-table>

    <!-- 分页 -->
    <div class="footer">
      <span class="meta">
        共 <strong>{{ totalCount }}</strong> 条
        <span v-if="search">（已按 "{{ search }}" 筛选）</span>
        <span v-if="selectable && selectedRows.length"> · 已选 {{ selectedRows.length }}</span>
      </span>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="totalCount"
        layout="sizes, prev, pager, next, jumper"
        background
        small
      />
    </div>
  </div>
</template>

<style scoped>
.dtp {
  background: #fff;
  border-radius: 6px;
  border: 1px solid var(--line);
  overflow: hidden;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line-soft);
  background: #fafbfc;
  flex-wrap: wrap;
  gap: 8px;
}
.tb-left, .tb-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #eff6ff 0%, #ede9fe 100%);
  border-bottom: 1px solid #c7d2fe;
  color: var(--text);
}
.bulk-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.bulk-info strong {
  color: var(--primary);
  font-size: 15px;
}
.spacer { flex: 1; }

.bulk-fade-enter-active, .bulk-fade-leave-active {
  transition: all 0.2s ease;
}
.bulk-fade-enter-from, .bulk-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.col-mgr-title {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--line-soft);
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-top: 1px solid var(--line-soft);
  background: #fafbfc;
  font-size: 12px;
  color: var(--text-muted);
}
.meta strong { color: var(--text); }

:deep(.clickable) {
  cursor: pointer;
}
:deep(.clickable:hover td) {
  background: #f0f7ff !important;
}

.signal-good { color: #10b981; }
.signal-bad { color: #ef4444; }
.signal-warn { color: #f59e0b; }
</style>
