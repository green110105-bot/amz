<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { useAlerts } from '../composables/useM2State';

const { isMobile } = useViewport();
const mobileRuleCols = [
  { prop: 'name', label: '规则' },
  { prop: 'severity', label: '严重度' },
  { prop: 'enabled', label: '状态', formatter: (v) => v ? '启用' : '禁用' },
];
const mobileEventCols = [
  { prop: 'ruleName', label: '规则', formatter: (v, r) => v || r.rule_name || r.ruleId || r.rule_id },
  { prop: 'severity', label: '严重度' },
  { prop: 'message', label: '消息' },
  { prop: 'acknowledged', label: '状态', formatter: (v) => v ? '已确认' : '未确认' },
];

const route = useRoute();
const router = useRouter();
const alerts = useAlerts();

const tab = ref(route.query.tab || 'rules');
const ruleIdFilter = ref(route.query.ruleId || '');
const ackFilter = ref(route.query.acknowledged || 'all');

const dialog = ref(false);
const editing = ref(null);

const draftKey = 'm2:draft:alert_rule';
// M2-P0-07: 结构化条件构造器（指标 + 运算符 + 阈值 + duration）替代自由文本
const METRIC_OPTIONS = [
  { value: 'sku.margin', label: 'SKU 利润率' },
  { value: 'sku.days_cover', label: 'SKU 可售天数' },
  { value: 'campaign.acos', label: '广告 ACOS' },
  { value: 'cashflow.balance', label: '现金流余额' },
];
const OP_OPTIONS = [
  { value: '<', label: '小于 <' },
  { value: '<=', label: '小于等于 ≤' },
  { value: '>', label: '大于 >' },
  { value: '>=', label: '大于等于 ≥' },
  { value: '==', label: '等于 =' },
];
function defaultCondition() {
  return { field: 'sku.margin', op: '<', value: 0.15, duration_days: 0 };
}
function defaultDraft() {
  return {
    name: '',
    conditions: [defaultCondition()],
    severity: 'P1',
    notifyChannels: ['in_app'],
    cooldownHours: 6,
    enabled: true,
  };
}
const draft = ref(defaultDraft());

function addCondition() { draft.value.conditions.push(defaultCondition()); }
function removeCondition(i) {
  draft.value.conditions.splice(i, 1);
  if (!draft.value.conditions.length) draft.value.conditions.push(defaultCondition());
}

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey);
    if (v) draft.value = { ...draft.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() { try { localStorage.setItem(draftKey, JSON.stringify(draft.value)); } catch {} }
function clearDraft() { try { localStorage.removeItem(draftKey); } catch {} }

async function load() {
  await alerts.fetchRules();
  if (tab.value === 'events') {
    const params = {};
    if (ruleIdFilter.value) params.ruleId = ruleIdFilter.value;
    if (ackFilter.value !== 'all') params.acknowledged = ackFilter.value;
    await alerts.fetchEvents(params);
  }
}

watch([tab, ruleIdFilter, ackFilter], () => {
  router.replace({
    query: {
      ...route.query,
      tab: tab.value,
      ruleId: ruleIdFilter.value || undefined,
      acknowledged: ackFilter.value === 'all' ? undefined : ackFilter.value,
    },
  });
  load();
});

watch(draft, saveDraft, { deep: true });

onMounted(() => {
  loadDraft();
  load();
});

function severityType(s) {
  return { P0: 'danger', P1: 'warning', P2: 'info' }[s] || '';
}

function openCreate() {
  editing.value = null;
  // M2-P0-07/P2 卫生：openCreate 先重置 draft 为默认，不残留上次编辑字段
  draft.value = defaultDraft();
  dialog.value = true;
}
function normalizeConditions(c) {
  let arr = c;
  if (typeof c === 'string') { try { arr = JSON.parse(c); } catch { arr = []; } }
  if (!Array.isArray(arr) || !arr.length) return [defaultCondition()];
  return arr.map((x) => ({
    field: x.field || 'sku.margin', op: x.op || '<',
    value: Number(x.value) || 0, duration_days: Number(x.duration_days || x.durationDays || 0),
  }));
}
function openEdit(rule) {
  editing.value = rule;
  // 仅挑白名单字段，禁止写 id / 计算列
  draft.value = {
    name: rule.name,
    conditions: normalizeConditions(rule.conditions),
    severity: rule.severity,
    notifyChannels: Array.isArray(rule.notifyChannels || rule.notify_channels) ? (rule.notifyChannels || rule.notify_channels) : [],
    cooldownHours: rule.cooldownHours || rule.cooldown_hours || 6,
    enabled: !!rule.enabled,
  };
  dialog.value = true;
}

async function submit() {
  if (!draft.value.name) { ElMessage.warning('请填写规则名称'); return; }
  // 结构化条件直接发送（无 JSON.parse 静默吞）
  const body = {
    name: draft.value.name,
    conditions: draft.value.conditions.map((c) => ({
      field: c.field, op: c.op, value: Number(c.value),
      duration_days: Number(c.duration_days) || 0,
    })),
    severity: draft.value.severity,
    notifyChannels: draft.value.notifyChannels,
    cooldownHours: draft.value.cooldownHours,
    enabled: draft.value.enabled,
  };
  try {
    if (editing.value) {
      await alerts.updateRule(editing.value.id, body);
    } else {
      await alerts.createRule(body);
    }
    dialog.value = false;
    clearDraft();
    draft.value = defaultDraft();
  } catch {}
}

// M2-P0-07: 立即测试规则 — 调 scan 后刷新 events
async function testScan(ruleId) {
  try {
    const r = await alerts.scan(ruleId ? { ruleId } : {});
    ElMessage.success(`扫描完成：新增 ${r?.created ?? 0} 条事件`);
    tab.value = 'events';
    await alerts.fetchEvents(ruleId ? { ruleId } : {});
  } catch (e) {
    ElMessage.error(`扫描失败：${e.message || e}`);
  }
}

async function toggle(rule) {
  try {
    await alerts.updateRule(rule.id, { enabled: !rule.enabled });
  } catch {}
}

async function remove(rule) {
  try {
    await ElMessageBox.confirm(`确认删除规则 ${rule.name}？`, '提示', { type: 'warning' });
    await alerts.removeRule(rule.id);
  } catch {}
}

async function ackEvent(ev) {
  try {
    await alerts.ackEvent(ev.id);
  } catch {}
}

// M2-P3-01: 批量确认
const selectedEventIds = ref([]);
function onEventSelectionChange(rows) {
  selectedEventIds.value = (rows || []).map((r) => r.id);
}
async function ackSelected() {
  if (!selectedEventIds.value.length) { ElMessage.warning('请先勾选事件'); return; }
  try {
    await alerts.ackBatch(selectedEventIds.value);
    selectedEventIds.value = [];
  } catch {}
}

const rules = computed(() => alerts.rules.value || []);
const events = computed(() => alerts.events.value || []);
</script>

<template>
  <div>
    <PageHeader title="自定义报警规则" subtitle="按你的业务定义触发条件 + 通知通道">
      <template #extra>
        <el-button v-if="tab === 'rules'" :icon="'VideoPlay'" @click="testScan()">立即测试全部规则</el-button>
        <el-button v-if="tab === 'rules'" type="primary" :icon="'Plus'" @click="openCreate">新建规则</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <el-tabs v-model="tab">
        <el-tab-pane name="rules" label="规则">
          <ResponsiveTable :data="rules" :mobile-columns="mobileRuleCols" v-loading="alerts.rulesLoading.value" stripe empty-text="暂无报警规则">
            <el-table-column prop="name" label="规则名称" min-width="180"><template #default="{ row }"><strong>{{ row.name }}</strong></template></el-table-column>
            <el-table-column label="触发条件" min-width="280">
              <template #default="{ row }">
                <span class="text-muted" style="font-size: 12px">{{ typeof row.conditions === 'string' ? row.conditions : JSON.stringify(row.conditions) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="严重度" width="100">
              <template #default="{ row }"><el-tag :type="severityType(row.severity)" size="small">{{ row.severity }}</el-tag></template>
            </el-table-column>
            <el-table-column label="通道" width="200">
              <template #default="{ row }">
                <el-tag v-for="(c, i) in (row.notifyChannels || row.notify_channels || [])" :key="i" size="small" effect="plain" style="margin: 0 4px 4px 0">{{ ({ in_app: '站内', email: '邮件', wechat: '微信', wecom: '企微' })[c] || c }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-switch :model-value="!!row.enabled" @change="toggle(row)" />
              </template>
            </el-table-column>
            <el-table-column label="触发记录" width="140">
              <template #default="{ row }">
                <span class="tnum">{{ row.triggerCount || row.trigger_count || 0 }} 次</span>
                <small class="text-muted block">{{ row.lastTriggered || row.last_triggered || '从未触发' }}</small>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200">
              <template #default="{ row }">
                <el-button size="small" link @click="testScan(row.id)">测试</el-button>
                <el-button size="small" link @click="openEdit(row)">编辑</el-button>
                <el-button size="small" link type="danger" @click="remove(row)">删除</el-button>
              </template>
            </el-table-column>
            <template #mobile-actions="{ row }">
              <el-button size="small" @click.stop="testScan(row.id)">测试</el-button>
              <el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
              <el-button size="small" type="danger" plain @click.stop="remove(row)">删除</el-button>
            </template>
          </ResponsiveTable>
          <EmptyState v-if="!alerts.rulesLoading.value && !rules.length" title="暂无规则" description="新建首个报警规则" />
        </el-tab-pane>

        <el-tab-pane name="events" label="触发记录">
          <div style="display: flex; gap: 12px; margin-bottom: 12px">
            <el-select v-model="ruleIdFilter" placeholder="全部规则" size="default" clearable style="width: 200px">
              <el-option v-for="r in rules" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
            <el-radio-group v-model="ackFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="0">未确认</el-radio-button>
              <el-radio-button value="1">已确认</el-radio-button>
            </el-radio-group>
            <el-button size="small" type="primary" plain :disabled="!selectedEventIds.length" @click="ackSelected">批量确认 ({{ selectedEventIds.length }})</el-button>
          </div>
          <ResponsiveTable :data="events" :mobile-columns="mobileEventCols" v-loading="alerts.eventsLoading.value" stripe empty-text="暂无触发记录" @selection-change="onEventSelectionChange">
            <el-table-column type="selection" width="44" />
            <el-table-column label="规则" min-width="160">
              <template #default="{ row }">
                <strong>{{ row.ruleName || row.rule_name || row.ruleId || row.rule_id }}</strong>
                <el-tag v-if="row.isSimulated" size="small" type="info" effect="plain" style="margin-left: 6px">模拟</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="严重度" width="100">
              <template #default="{ row }"><el-tag :type="severityType(row.severity)" size="small">{{ row.severity }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="message" label="消息" min-width="260" />
            <el-table-column label="触发时间" width="180">
              <template #default="{ row }">{{ row.triggeredAt || row.triggered_at }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.acknowledged" type="success" size="small">已确认</el-tag>
                <el-tag v-else type="warning" size="small">未确认</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button v-if="!row.acknowledged" size="small" link @click="ackEvent(row)">确认</el-button>
              </template>
            </el-table-column>
            <template #mobile-actions="{ row }">
              <el-button v-if="!row.acknowledged" size="small" type="primary" @click.stop="ackEvent(row)">确认</el-button>
            </template>
          </ResponsiveTable>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <ResponsiveDialog v-model="dialog" :title="editing ? '编辑规则' : '新建规则'" width="600px">
      <el-form :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'left'">
        <el-form-item label="规则名称">
          <el-input v-model="draft.name" placeholder="如：低利润率报警" />
        </el-form-item>
        <el-form-item label="触发条件">
          <div style="width: 100%">
            <div v-for="(c, i) in draft.conditions" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; align-items: center">
              <el-select v-model="c.field" placeholder="指标" style="width: 150px">
                <el-option v-for="m in METRIC_OPTIONS" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
              <el-select v-model="c.op" placeholder="运算符" style="width: 120px">
                <el-option v-for="o in OP_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-input-number v-model="c.value" :controls="false" placeholder="阈值" style="width: 110px" />
              <el-input-number v-model="c.duration_days" :min="0" :max="30" placeholder="持续天" style="width: 110px" />
              <el-button size="small" link type="danger" @click="removeCondition(i)">删除</el-button>
            </div>
            <el-button size="small" plain :icon="'Plus'" @click="addCondition">添加条件</el-button>
            <div class="text-muted" style="font-size: 12px; margin-top: 4px">阈值按比例填小数（如利润率 0.15）；持续天=0 表示即时触发。多条件为 AND 关系。</div>
          </div>
        </el-form-item>
        <el-form-item label="严重度">
          <el-radio-group v-model="draft.severity">
            <el-radio-button value="P0">P0</el-radio-button>
            <el-radio-button value="P1">P1</el-radio-button>
            <el-radio-button value="P2">P2</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="通知通道">
          <el-checkbox-group v-model="draft.notifyChannels">
            <el-checkbox value="in_app">站内</el-checkbox>
            <el-checkbox value="email">邮件</el-checkbox>
            <el-checkbox value="wechat">微信</el-checkbox>
            <el-checkbox value="wecom">企微</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="冷却时长 (小时)">
          <el-input-number v-model="draft.cooldownHours" :min="0" :max="72" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="draft.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">{{ editing ? '保存' : '创建' }}</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.block { display: block; margin-top: 2px; }
</style>
