<script setup>
// Postmortems — 复盘报告（选多 anomaly 生成 / verdict / improvements 可编辑）
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { formatCurrency } from '../utils/format';
import { usePostmortems, useAnomalies } from '../composables/useM4State';
import { useNotificationsBus } from '../composables/useNotificationsBus';

const route = useRoute();
const router = useRouter();
const pm = usePostmortems();
const anom = useAnomalies();
const bus = useNotificationsBus();
const { isMobile } = useViewport();

const verdictFilter = ref(route.query.verdict || 'all');
const showGenerate = ref(false);
const formTitle = ref('');
const formAnomalyIds = ref([]);

watch(verdictFilter, (v) => {
  router.replace({ query: v === 'all' ? {} : { verdict: v } });
  load();
}, { deep: false });

async function load() {
  const params = {};
  if (verdictFilter.value !== 'all') params.verdict = verdictFilter.value;
  await pm.fetch(params, true);
}
async function loadAnomalies() {
  await anom.fetch({}, false);
}
onMounted(() => { load(); loadAnomalies(); });

const list = computed(() => pm.list.value || []);
const anomChoices = computed(() => (anom.list.value || []).filter((a) => a.severity === 'P0' || a.severity === 'P1'));

async function onGenerate() {
  if (!formAnomalyIds.value.length) {
    ElMessage.warning('请至少选择 1 条异常');
    return;
  }
  const created = await pm.generate({ anomalyIds: formAnomalyIds.value, title: formTitle.value || undefined });
  if (created?.id) {
    showGenerate.value = false;
    formAnomalyIds.value = [];
    formTitle.value = '';
    bus.pushLocal({ severity: 'P2', sourceModule: 'M4A', title: `复盘报告已生成`, body: created.title });
  }
}

async function updateVerdict(p, verdict) {
  await pm.update(p.id, { verdict });
}
</script>

<template>
  <div>
    <PageHeader title="复盘报告" subtitle="P0 异常 / 重大事件后自动生成 · 时间线 + 根因 + 改进建议">
      <template #extra>
        <el-radio-group v-model="verdictFilter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="successful">成功</el-radio-button>
          <el-radio-button value="partial">部分</el-radio-button>
          <el-radio-button value="failed">失败</el-radio-button>
          <el-radio-button value="draft">草稿</el-radio-button>
        </el-radio-group>
        <el-button type="primary" :icon="'Plus'" @click="showGenerate = true">生成复盘</el-button>
      </template>
    </PageHeader>

    <div v-loading="pm.loading.value">
      <EmptyState v-if="!pm.loading.value && list.length === 0" title="暂无复盘" description="可选择 P0/P1 异常生成复盘" icon="Document" />
      <el-card v-for="p in list" :key="p.id" shadow="never" class="pm-card">
        <div class="pm-head">
          <div>
            <h3 class="pm-title">{{ p.title }}</h3>
            <span class="text-muted">{{ p.eventDate || p.event_date || (p.createdAt || p.created_at || '').slice(0, 10) }}</span>
          </div>
          <el-select :model-value="p.verdict" size="small" style="width: 120px" @change="(v) => updateVerdict(p, v)">
            <el-option label="✓ 成功" value="successful" />
            <el-option label="部分成功" value="partial" />
            <el-option label="失败" value="failed" />
            <el-option label="草稿" value="draft" />
          </el-select>
        </div>

        <el-row :gutter="12" class="mt-12">
          <el-col :xs="24" :sm="8"><div class="m-cell"><span>损失估算</span><strong class="tnum text-warning">{{ formatCurrency(p.lossEstimate || p.loss_estimate) }}</strong></div></el-col>
          <el-col :xs="12" :sm="8"><div class="m-cell"><span>关联异常</span><strong class="tnum">{{ (p.anomalyIds || p.anomaly_ids || []).length }}</strong></div></el-col>
          <el-col :xs="12" :sm="8"><div class="m-cell"><span>改进项</span><strong class="tnum">{{ (p.improvements || []).length }}</strong></div></el-col>
        </el-row>

        <h4 class="block-label">根因分析</h4>
        <p class="block-text">{{ p.rootCause || p.root_cause || '-' }}</p>

        <h4 class="block-label">处置方案</h4>
        <p class="block-text">{{ p.resolution || '-' }}</p>

        <h4 class="block-label">改进建议</h4>
        <ul class="improvements">
          <li v-for="(imp, i) in (p.improvements || [])" :key="i">{{ imp }}</li>
        </ul>
      </el-card>
    </div>

    <ResponsiveDialog v-model="showGenerate" title="生成复盘报告" width="600px">
      <el-form :label-width="isMobile ? '0' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="标题">
          <el-input v-model="formTitle" placeholder="例如：BB 丢失复盘" />
        </el-form-item>
        <el-form-item label="关联异常">
          <el-select v-model="formAnomalyIds" multiple style="width: 100%" placeholder="选择 P0/P1 异常">
            <el-option v-for="a in anomChoices" :key="a.id" :label="`[${a.severity}] ${a.title}`" :value="a.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerate = false">取消</el-button>
        <el-button type="primary" @click="onGenerate">生成</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.pm-card { margin-bottom: 16px; }
.pm-head { display: flex; justify-content: space-between; align-items: flex-start; }
.pm-title { font-size: 16px; margin: 0 0 4px; }
.m-cell { padding: 12px 8px; background: #f9fafb; border-radius: 6px; text-align: center; }
.m-cell span { font-size: 11px; color: var(--text-muted); display: block; }
.m-cell strong { font-size: 18px; margin-top: 2px; display: block; }
.block-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 16px 0 6px; }
.block-text { margin: 0; font-size: 13px; line-height: 1.7; padding: 8px 12px; background: #f9fafb; border-radius: 4px; }
.improvements { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.8; }
.mt-12 { margin-top: 12px; }
</style>
