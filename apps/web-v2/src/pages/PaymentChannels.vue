<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import ResponsiveDialog from '../components/ResponsiveDialog.vue';
import { useViewport } from '../composables/useViewport';
import { usePaymentChannels } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();
const mobileCols = [
  { prop: 'name', label: '通道' },
  { prop: 'feePct', label: '费率', formatter: (v, r) => formatPercent(v ?? r.fee_pct) },
  { prop: 'currency', label: '币种' },
  { prop: 'monthlyCost', label: '月成本', formatter: (v, r) => formatCurrency(v ?? r.monthly_cost, 'USD') },
];

const channels = usePaymentChannels();
const dialog = ref(false);
const editing = ref(null);

const draftKey = 'm2:draft:payment_channel';
const draft = ref({
  name: '',
  provider: 'payoneer',
  feePct: 0.012,
  feeFixedPerTx: 0,
  currency: 'USD',
  isPrimary: false,
  enabled: true,
});

function loadDraft() {
  try {
    const v = localStorage.getItem(draftKey);
    if (v) draft.value = { ...draft.value, ...JSON.parse(v) };
  } catch {}
}
function saveDraft() { try { localStorage.setItem(draftKey, JSON.stringify(draft.value)); } catch {} }
function clearDraft() { try { localStorage.removeItem(draftKey); } catch {} }

onMounted(() => {
  loadDraft();
  channels.fetch();
});

const list = computed(() => channels.list.value || []);

function openCreate() {
  editing.value = null;
  dialog.value = true;
}
function openEdit(row) {
  editing.value = row;
  draft.value = { ...draft.value, ...row };
  dialog.value = true;
}

async function submit() {
  if (!draft.value.name) { ElMessage.warning('请填写通道名称'); return; }
  try {
    if (editing.value) {
      await channels.update(editing.value.id, draft.value);
    } else {
      await channels.create(draft.value);
    }
    dialog.value = false;
    clearDraft();
    draft.value = {
      name: '', provider: 'payoneer', feePct: 0.012, feeFixedPerTx: 0,
      currency: 'USD', isPrimary: false, enabled: true,
    };
  } catch {}
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除通道 ${row.name}？`, '提示', { type: 'warning' });
    await channels.remove(row.id);
  } catch {}
}
</script>

<template>
  <div>
    <PageHeader title="跨境支付通道配置" subtitle="Payoneer / PingPong / WorldFirst 等 · 按通道精确归集提现成本">
      <template #extra>
        <el-button type="primary" :icon="'Plus'" @click="openCreate">添加通道</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <ResponsiveTable :data="list" :mobile-columns="mobileCols" v-loading="channels.loading.value" stripe empty-text="暂无支付通道">
        <el-table-column label="通道" min-width="200">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <el-tag v-if="row.isPrimary || row.is_primary" size="small" type="primary" style="margin-left: 6px">主要</el-tag>
            <el-tag v-if="row.warning" size="small" type="danger" style="margin-left: 6px">警告</el-tag>
            <el-tag v-if="!row.enabled" size="small" type="info" style="margin-left: 6px">已禁用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="费率 %" align="right" width="100"><template #default="{ row }"><span class="tnum" :class="(row.feePct || row.fee_pct) > 0.02 ? 'text-danger' : ''">{{ formatPercent(row.feePct || row.fee_pct) }}</span></template></el-table-column>
        <el-table-column label="单笔固定" align="right" width="120"><template #default="{ row }"><span class="tnum">{{ (row.feeFixedPerTx || row.fee_fixed_per_tx) > 0 ? `$${row.feeFixedPerTx || row.fee_fixed_per_tx}` : '-' }}</span></template></el-table-column>
        <el-table-column label="支持币种" width="120"><template #default="{ row }">{{ row.currency }}</template></el-table-column>
        <el-table-column label="月提现额" align="right" width="140"><template #default="{ row }"><span class="tnum">{{ formatCurrency(row.monthlyVolume || row.monthly_volume, 'USD') }}</span></template></el-table-column>
        <el-table-column label="月成本" align="right" width="120">
          <template #default="{ row }"><span class="tnum text-warning">{{ formatCurrency(row.monthlyCost || row.monthly_cost, 'USD') }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" @click.stop="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click.stop="remove(row)">删除</el-button>
        </template>
      </ResponsiveTable>
      <EmptyState v-if="!channels.loading.value && !list.length" title="暂无通道" description="添加首个跨境支付通道" />
    </el-card>

    <el-card shadow="never" class="mt-16">
      <template #header><h2 class="section-title">⚠️ 关于 Amazon Currency Converter (ACCS)</h2></template>
      <el-alert type="warning" show-icon :closable="false">
        <template #title>ACCS 隐性 3-4% 损失</template>
        <template #default>
          亚马逊自带的"Currency Converter for Sellers"看起来"免手续费"，但汇率比 Payoneer / PingPong 差 3-4%。
          如果月提现 $100,000，差值 = <strong>$3,000-4,000/月</strong>。强烈建议改用第三方通道。
        </template>
      </el-alert>
    </el-card>

    <ResponsiveDialog v-model="dialog" :title="editing ? '编辑通道' : '添加通道'" width="480px">
      <el-form :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'left'">
        <el-form-item label="名称">
          <el-input v-model="draft.name" placeholder="如：Payoneer 主账户" />
        </el-form-item>
        <el-form-item label="服务商">
          <el-select v-model="draft.provider" style="width: 100%">
            <el-option label="Payoneer" value="payoneer" />
            <el-option label="PingPong" value="pingpong" />
            <el-option label="WorldFirst" value="worldfirst" />
            <el-option label="LianLian" value="lianlian" />
            <el-option label="ACCS (慎用)" value="accs" />
          </el-select>
        </el-form-item>
        <el-form-item label="费率 (小数)">
          <el-input-number v-model="draft.feePct" :min="0" :max="0.1" :step="0.001" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item label="单笔固定 ($)">
          <el-input-number v-model="draft.feeFixedPerTx" :min="0" :step="0.5" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="主要通道">
          <el-switch v-model="draft.isPrimary" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="draft.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">{{ editing ? '保存' : '添加' }}</el-button>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
</style>
