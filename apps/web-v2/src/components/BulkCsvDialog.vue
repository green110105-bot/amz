<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useAudit } from '../composables/useAudit';
import { campaignsApi } from '../api/lx';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  defaultEntity: { type: String, default: 'campaign' }, // campaign / keyword / negative / placement
});
const emit = defineEmits(['update:modelValue']);

const { submit } = useAudit();

const tab = ref('download'); // download / upload

// === 下载模板 ===
const downloadEntity = ref(props.defaultEntity);
const downloadFields = ref(['id', 'name', 'bid', 'budget', 'state', 'acos_7d']);
const dateRange = ref([new Date('2026-05-07'), new Date('2026-05-13')]);

const entityOptions = [
  { id: 'campaign', label: 'Campaign', fields: ['id', 'name', 'state', 'budget', 'bid_strategy', 'spend_7d', 'sales_7d', 'acos_7d', 'orders_7d'] },
  { id: 'adgroup', label: 'AdGroup', fields: ['id', 'campaign_id', 'name', 'default_bid', 'state'] },
  { id: 'keyword', label: '关键词', fields: ['id', 'campaign_id', 'adgroup_id', 'term', 'match_type', 'bid', 'state', 'orders_30d', 'acos_30d'] },
  { id: 'negative', label: '否定关键词', fields: ['id', 'scope', 'target', 'term', 'match_type', 'added_at'] },
  { id: 'placement', label: '广告位加成', fields: ['campaign_id', 'placement', 'bid_adj_pct'] },
  { id: 'product_targeting', label: '商品定位', fields: ['id', 'campaign_id', 'adgroup_id', 'asin', 'bid', 'state'] },
];

const currentEntityFields = computed(() => {
  const e = entityOptions.find((e) => e.id === downloadEntity.value);
  return e?.fields || [];
});

function selectAll() {
  downloadFields.value = [...currentEntityFields.value];
}
function clearAll() {
  downloadFields.value = [];
}

function doDownload() {
  if (!downloadFields.value.length) return ElMessage.warning('请选择至少 1 列');
  const entity = entityOptions.find((e) => e.id === downloadEntity.value);
  const header = downloadFields.value.join(',');
  const rows = Array.from({ length: 5 }, (_, i) => {
    return downloadFields.value.map((f) => {
      if (f.includes('id')) return `${downloadEntity.value}-${i + 1}`;
      if (f.includes('name')) return `示例 ${entity.label} ${i + 1}`;
      if (f.includes('bid')) return (0.5 + Math.random() * 1.5).toFixed(2);
      if (f.includes('budget')) return (20 + i * 10).toFixed(2);
      if (f.includes('state')) return 'enabled';
      if (f.includes('acos')) return (0.2 + Math.random() * 0.3).toFixed(3);
      if (f.includes('spend')) return (50 + Math.random() * 100).toFixed(2);
      if (f.includes('sales')) return (200 + Math.random() * 300).toFixed(2);
      if (f.includes('orders')) return Math.floor(Math.random() * 30);
      return '';
    }).join(',');
  });
  const csv = '﻿' + header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entity.label}_模板_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success(`已下载 ${entity.label} CSV 模板（含 5 行示例数据）`);
}

// === 上传变更 ===
const uploadEntity = ref(props.defaultEntity);
const uploadFile = ref(null);
const fileText = ref('');
const previewRows = ref([]);
const previewVisible = ref(false);

// CSV 解析（简单实现：不支持引号包裹的逗号）
function parseCsvText(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((s) => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((s) => s.trim());
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cols[j] ?? '';
    rows.push(row);
  }
  return rows;
}

function inferRiskAndDisplay(row, entity) {
  // Build a row-display for preview based on entity type
  if (entity === 'keyword' || entity === 'product_targeting' || entity === 'targeting' || entity === 'targetings') {
    const bid = parseFloat(row.bid) || null;
    const risk = bid != null && bid > 2 ? 'high' : 'normal';
    return { id: row.id || row.term || '—', name: row.term || row.asin || '—', field: 'bid', oldValue: '—', newValue: bid ? `$${bid.toFixed(2)}` : '—', delta: '—', risk };
  }
  if (entity === 'campaign' || entity === 'campaigns') {
    const budget = parseFloat(row.budget) || null;
    return { id: row.id || '—', name: row.name || '—', field: 'budget', oldValue: '—', newValue: budget ? `$${budget.toFixed(0)}` : '—', delta: '—', risk: 'normal' };
  }
  if (entity === 'negative' || entity === 'negatives') {
    return { id: row.id || '—', name: row.term || '—', field: 'state', oldValue: '—', newValue: 'negative-exact', delta: '—', risk: 'normal' };
  }
  return { id: row.id || '—', name: row.name || row.term || '—', field: '—', oldValue: '—', newValue: '—', delta: '—', risk: 'normal' };
}

async function handleFile(file) {
  uploadFile.value = file;
  // FileReader to extract text
  const raw = file?.raw;
  if (!raw) {
    previewRows.value = [];
    previewVisible.value = false;
    return false;
  }
  // size check
  const sizeKB = raw.size / 1024;
  if (sizeKB > 1024) {
    ElMessage.warning(`文件 ${sizeKB.toFixed(0)} KB > 1MB，建议拆批上传`);
  }
  const text = await raw.text();
  fileText.value = text;
  const parsed = parseCsvText(text);
  if (!parsed.length) {
    ElMessage.warning('CSV 解析为空');
    previewRows.value = [];
    previewVisible.value = false;
    return false;
  }
  previewRows.value = parsed.map((r) => inferRiskAndDisplay(r, uploadEntity.value));
  previewVisible.value = true;
  ElMessage.success(`已解析 ${parsed.length} 行变更 · 请在下方确认`);
  return false; // prevent upload
}

async function confirmUpload() {
  if (!previewRows.value.length) return;
  try {
    await submit({
      sourceModule: 'M3',
      actionType: 'BULK_CSV_UPLOAD',
      target: { type: uploadEntity.value, count: previewRows.value.length },
      payload: { entity: uploadEntity.value, count: previewRows.value.length },
      description: `CSV 批量变更 ${previewRows.value.length} 行 · ${entityOptions.find(e => e.id === uploadEntity.value)?.label}`,
    });
    // 后端真上传：优先 multipart；如果服务端不支持自动 fallback 到 JSON
    let result;
    const typeMap = {
      campaign: 'campaigns', keyword: 'targetings', product_targeting: 'targetings',
      negative: 'negatives', placement: 'placements', adgroup: 'campaigns',
    };
    const serverType = typeMap[uploadEntity.value] || uploadEntity.value;
    if (uploadFile.value?.raw) {
      const formData = new FormData();
      formData.append('file', uploadFile.value.raw);
      formData.append('type', serverType);
      try {
        result = await campaignsApi.bulkImport(formData);
      } catch (e) {
        console.warn('[bulk import multipart]', e?.message);
      }
    }
    if (!result) {
      // Fallback: parse client-side, send JSON
      const rawRows = parseCsvText(fileText.value);
      const rows = rawRows.map((r) => {
        if (serverType === 'campaigns') return { id: r.id || undefined, name: r.name, dailyBudget: r.budget ? Number(r.budget) : undefined };
        if (serverType === 'targetings') return { id: r.id || undefined, campaignId: r.campaign_id, adGroupId: r.adgroup_id, term: r.term, asin: r.asin, matchType: r.match_type || 'exact', bid: r.bid ? Number(r.bid) : undefined };
        if (serverType === 'negatives') return { id: r.id || undefined, campaignId: r.target || r.campaign_id, term: r.term, matchType: r.match_type || 'exact', scope: r.scope || 'Campaign' };
        return r;
      });
      try {
        result = await campaignsApi.bulkImport({ type: serverType, rows });
      } catch (e) {
        throw e;
      }
    }
    ElMessage.success(`已应用 ${result?.created ?? previewRows.value.length} 行（${result?.errors ?? 0} 失败）· 已进审计中心`);
    uploadFile.value = null;
    fileText.value = '';
    previewRows.value = [];
    previewVisible.value = false;
    emit('update:modelValue', false);
  } catch (e) {
    ElMessage.error(`应用失败：${e.message || e}`);
  }
}

function close() {
  emit('update:modelValue', false);
  uploadFile.value = null;
  previewRows.value = [];
  previewVisible.value = false;
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    title="CSV 批量操作"
    width="780px"
    @close="close"
  >
    <el-tabs v-model="tab">
      <el-tab-pane label="下载模板" name="download">
        <el-form label-width="100px" label-position="left">
          <el-form-item label="实体类型">
            <el-radio-group v-model="downloadEntity">
              <el-radio v-for="e in entityOptions" :key="e.id" :value="e.id">{{ e.label }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="时间范围">
            <el-date-picker v-model="dateRange" type="daterange" size="default" style="width: 280px" />
          </el-form-item>
          <el-form-item label="包含列">
            <div class="cols-pick">
              <el-button size="small" link @click="selectAll">全选</el-button>
              <el-button size="small" link @click="clearAll">清空</el-button>
              <el-checkbox-group v-model="downloadFields" style="margin-top: 8px">
                <el-checkbox v-for="f in currentEntityFields" :key="f" :value="f" border style="margin: 4px 6px 4px 0">
                  {{ f }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </el-form-item>
        </el-form>
        <div class="dl-foot">
          <span class="muted">将生成 CSV，含表头 + 5 行示例数据，用于 Excel 编辑后上传</span>
          <el-button type="primary" :icon="'Download'" @click="doDownload">下载模板 CSV</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="上传变更" name="upload">
        <el-form label-width="100px" label-position="left">
          <el-form-item label="实体类型">
            <el-select v-model="uploadEntity" style="width: 200px">
              <el-option v-for="e in entityOptions" :key="e.id" :label="e.label" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="选择 CSV">
            <el-upload
              :on-change="(file) => handleFile(file)"
              :auto-upload="false"
              :show-file-list="false"
              accept=".csv,.xlsx"
            >
              <el-button :icon="'Upload'" size="default">选择文件...</el-button>
              <template #tip>
                <span class="muted">支持 CSV / Excel · 必须含与模板一致的列头</span>
              </template>
            </el-upload>
          </el-form-item>
        </el-form>

        <!-- 预览 -->
        <div v-if="previewVisible" class="preview-block">
          <h4 class="ph">变更预览（{{ previewRows.length }} 行）</h4>
          <el-table :data="previewRows" stripe border size="small">
            <el-table-column label="ID" prop="id" width="100" />
            <el-table-column label="名称" prop="name" min-width="180" />
            <el-table-column label="字段" prop="field" width="80" />
            <el-table-column label="原值" prop="oldValue" width="100" />
            <el-table-column label="新值" prop="newValue" width="100" />
            <el-table-column label="变化" prop="delta" width="80">
              <template #default="{ row }">
                <span :class="row.delta.startsWith('+') ? 'good' : row.delta.startsWith('-') ? 'danger' : ''">{{ row.delta }}</span>
              </template>
            </el-table-column>
            <el-table-column label="风险" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.risk === 'critical' ? 'danger' : row.risk === 'high' ? 'warning' : 'success'">
                  {{ { critical: '高', high: '中', normal: '低' }[row.risk] }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div class="up-foot">
            <span class="muted">所有变更将进入审计中心，可回滚</span>
            <el-button type="primary" :icon="'Check'" @click="confirmUpload">确认应用 {{ previewRows.length }} 行变更</el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped>
.cols-pick {
  background: #f9fafb;
  padding: 10px;
  border-radius: 6px;
  width: 100%;
}
.dl-foot, .up-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px dashed var(--line-soft);
  margin-top: 12px;
}
.muted { font-size: 11px; color: var(--text-muted); }
.preview-block { margin-top: 16px; }
.ph { font-size: 13px; margin: 0 0 10px; }
.good { color: #10b981; }
.danger { color: #ef4444; }
</style>
