<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { mockAdTree, defaultDaypartingMatrix } from '../utils/mock-data-ads';
import { actionQueueApi } from '../api/ads-timeline';

const { isMobile } = useViewport();

const selectedCampaign = ref('cmp-mature-brand');
const matrix = ref(defaultDaypartingMatrix());
const saving = ref(false);

const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const hours = Array.from({ length: 24 }, (_, i) => i);

function cellColor(v) {
  if (v >= 20) return '#059669';
  if (v >= 10) return '#10b981';
  if (v >= 0) return '#f3f4f6';
  if (v >= -20) return '#fef3c7';
  return '#fee2e2';
}

function applyAiRecommend() {
  // M3-P0-05: removed the unsupported "30-day CVR" data claim — this 是 demo 推荐矩阵，
  // 无真实历史数据支撑，不得宣称.
  matrix.value = defaultDaypartingMatrix();
  ElMessage.success('✓ 已应用推荐矩阵（演示数据，仅本地预览）');
}
function reset() {
  matrix.value = Array(7).fill(null).map(() => Array(24).fill(0));
}
// M3-P0-05/M3-P0-08: dayparting save must NOT use the audit-submit bypass. It goes
// through actionQueueApi.enqueue (needs_review + dryRun=1 in ad_action_queue). Nothing
// is "saved" locally as success unless enqueue succeeds.
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const item = await actionQueueApi.enqueue({
      sourceStrategyName: 'Dayparting (manual)',
      entity: { kind: 'campaign', id: selectedCampaign.value, name: selectedCampaign.value },
      typedAction: {
        actionPrimitive: 'SET_DAYPARTING_MATRIX',
        sourceSurface: 'dayparting',
        entityKind: 'campaign',
        resourceId: selectedCampaign.value,
        recommendedValue: { matrix: matrix.value },
        dryRun: true,
        auditRequired: true,
      },
      guardrail: { status: 'needs_review', reasons: ['manual_dayparting_write_requires_action_queue'] },
      rollbackPlan: { method: 'manual_revert_required', needsManualReview: true },
      note: `分时段策略保存到 ${selectedCampaign.value}`,
    });
    if (!item) { ElMessage.warning('入队失败，分时段策略未提交'); return; }
    // A duplicate (queued:false) is already surfaced as info by the api layer; do not
    // claim a fresh enqueue.
    if (item.queued === false) return;
    ElMessage.success('已加入执行篮（待审核 + dry-run，未触达 Amazon）');
  } catch (e) {
    ElMessage.error(`入队失败：${e?.message || e}`);
  } finally {
    saving.value = false;
  }
}

function updateCell(d, h, v) {
  matrix.value[d][h] = Number(v);
}
</script>

<template>
  <div>
    <PageHeader title="分时段策略（7 × 24）" subtitle="按周内每小时调整出价加成（活跃时段加成 / 深夜降权）">
      <template #extra>
        <el-select v-model="selectedCampaign" size="default" style="width: 240px">
          <el-option v-for="c in mockAdTree" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-button :icon="'MagicStick'" @click="applyAiRecommend">应用 AI 推荐</el-button>
        <el-button @click="reset">重置</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </PageHeader>

    <MobileFallback v-if="isMobile" page-name="分时段策略 7×24 矩阵" reason="该矩阵在窄屏不可读，请在桌面端编辑出价加成。" />

    <el-card v-else shadow="never">
      <div class="legend">
        <span>出价加成：</span>
        <span class="legend-item" style="background: #fee2e2">-30%</span>
        <span class="legend-item" style="background: #fef3c7">-10%</span>
        <span class="legend-item" style="background: #f3f4f6">0%</span>
        <span class="legend-item" style="background: #10b981; color: #fff">+10%</span>
        <span class="legend-item" style="background: #059669; color: #fff">+20%</span>
      </div>

      <table class="dp-grid">
        <thead>
          <tr>
            <th></th>
            <th v-for="h in hours" :key="h">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, di) in days" :key="d">
            <th>{{ d }}</th>
            <td v-for="h in hours" :key="h" :style="{ background: cellColor(matrix[di][h]) }" :title="`${d} ${h}:00 ${matrix[di][h] > 0 ? '+' : ''}${matrix[di][h]}%`">
              <input type="number" :value="matrix[di][h]" @change="updateCell(di, h, $event.target.value)" class="cell-input" min="-50" max="50" step="5" />
            </td>
          </tr>
        </tbody>
      </table>
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">AI 推荐说明</h2></template>
      <ul class="explain">
        <li><strong>13:00-15:00 CVR 18%</strong>（高于均值 9%）→ 建议加成 +25%</li>
        <li><strong>02:00-05:00 CVR 3%</strong>（低于均值）→ 建议 -50%</li>
        <li><strong>周末 9:00-22:00</strong> 转化高于工作日 8% → 周末加成 +5%</li>
        <li>具体加成请按本店铺真实数据调整，不同类目差异大</li>
      </ul>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.legend { display: flex; gap: 6px; align-items: center; margin-bottom: 12px; font-size: 12px; color: var(--text-muted); }
.legend-item { padding: 2px 8px; border-radius: 4px; }

.dp-grid { width: 100%; border-collapse: collapse; font-size: 11px; font-family: ui-monospace, monospace; }
.dp-grid th { background: #f9fafb; color: var(--text-muted); font-weight: 500; padding: 6px 4px; text-align: center; border: 1px solid var(--line-soft); width: auto; }
.dp-grid th:first-child { width: 60px; text-align: right; }
.dp-grid td { padding: 0; border: 1px solid var(--line-soft); text-align: center; transition: background 0.15s; }

.cell-input {
  width: 100%;
  padding: 6px 4px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  outline: none;
  cursor: text;
}
.cell-input:focus { background: #fff; }

.explain { font-size: 13px; color: var(--text-muted); padding-left: 20px; line-height: 1.8; }
.explain strong { color: var(--text); }
</style>
