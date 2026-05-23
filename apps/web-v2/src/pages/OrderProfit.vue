<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import WaterfallChart from '../components/WaterfallChart.vue';
import EmptyState from '../components/EmptyState.vue';
import { useViewport } from '../composables/useViewport';
import { useProfit } from '../composables/useM2State';
import { formatCurrency, formatPercent } from '../utils/format';

const { isMobile } = useViewport();

const route = useRoute();
const router = useRouter();
const profit = useProfit();

const orderId = ref(route.query.orderId || '');
const detail = ref(null);
const loading = ref(false);
const candidateOrders = ref([]);

async function loadCandidates() {
  const list = await profit.fetchOrders({ limit: 20 });
  candidateOrders.value = list || [];
  if (!orderId.value && candidateOrders.value.length) {
    orderId.value = candidateOrders.value[0].orderId;
  }
}

async function loadDetail() {
  if (!orderId.value) return;
  loading.value = true;
  try {
    detail.value = await profit.fetchOrderDetail(orderId.value);
  } finally {
    loading.value = false;
  }
}

watch(orderId, (v) => {
  router.replace({ query: { ...route.query, orderId: v || undefined } });
  loadDetail();
});

onMounted(async () => {
  await loadCandidates();
  await loadDetail();
});

const order = computed(() => detail.value?.order || {});
const fees = computed(() => detail.value?.fees || {});
const timeline = computed(() => detail.value?.timeline || []);

const waterfall = computed(() => {
  const o = order.value;
  const f = fees.value;
  if (!o.orderId) return [];
  return [
    { label: '收入', value: o.revenue || 0, type: 'positive' },
    { label: 'Referral Fee', value: -(f.referralFee || 0), type: 'negative' },
    { label: 'FBA Fee', value: -(f.fbaFee || 0), type: 'negative' },
    { label: '退款预提', value: -(f.refundProvision || 0), type: 'negative' },
    { label: '仓储费', value: -(f.storage || 0), type: 'negative' },
    { label: '广告分摊', value: -(f.adAlloc || 0), type: 'negative' },
    { label: 'COGS', value: -(f.cogs || 0), type: 'negative' },
    { label: '头程', value: -(f.freight || 0), type: 'negative' },
    { label: '汇率损失', value: -(f.fxLoss || 0), type: 'negative' },
    { label: '资金成本', value: -(f.capitalCost || 0), type: 'negative' },
    { label: '长期仓储', value: -(f.longTermStorage || 0), type: 'negative' },
    { label: '退货处理', value: -(f.returnProcessing || 0), type: 'negative' },
    { label: '入仓配置', value: -(f.inboundPlacement || 0), type: 'negative' },
    { label: '订阅费', value: -(f.subscription || 0), type: 'negative' },
    { label: '其他', value: -(f.misc || 0), type: 'negative' },
    { label: '净利润', value: o.netProfit || 0, type: 'total' },
  ];
});
</script>

<template>
  <div>
    <PageHeader :title="`订单 ${order.orderId || ''}`" subtitle="单订单完整费用拆解 · 14 项归集">
      <template #extra>
        <el-select v-model="orderId" filterable placeholder="选择订单" size="default" style="width: 280px">
          <el-option v-for="o in candidateOrders" :key="o.orderId" :label="`${o.orderId} (${o.sku || '-'})`" :value="o.orderId" />
        </el-select>
        <el-tag v-if="order.accuracy" :type="order.accuracy === 'final' ? 'success' : 'warning'" effect="plain">
          {{ order.accuracy === 'final' ? '🟢 终值' : '🟡 暂估' }}
        </el-tag>
      </template>
    </PageHeader>

    <div v-loading="loading">
      <EmptyState v-if="!order.orderId && !loading" title="无订单数据" description="后端尚未返回订单详情" />
      <el-row v-else :gutter="16">
        <el-col :xs="24" :sm="24" :md="8" :lg="8"><el-card shadow="never" style="margin-bottom: 16px">
            <template #header><h2 class="section-title">订单基本信息</h2></template>
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="ASIN">{{ order.asin }}</el-descriptions-item>
              <el-descriptions-item label="SKU">{{ order.sku }}</el-descriptions-item>
              <el-descriptions-item label="数量">{{ order.quantity }}</el-descriptions-item>
              <el-descriptions-item label="单价">{{ formatCurrency(order.unitPrice, 'USD') }}</el-descriptions-item>
              <el-descriptions-item label="收入">{{ formatCurrency(order.revenue, 'USD') }}</el-descriptions-item>
              <el-descriptions-item label="净利润">
                <strong :class="order.netProfit > 0 ? 'text-success' : 'text-danger'">{{ formatCurrency(order.netProfit, 'USD') }}</strong>
              </el-descriptions-item>
              <el-descriptions-item label="利润率">{{ formatPercent(order.margin) }}</el-descriptions-item>
              <el-descriptions-item label="置信度">{{ Math.round((order.confidence || 0) * 100) }}%</el-descriptions-item>
            </el-descriptions>

            <h4 class="block-label" style="margin-top: 16px">时间线</h4>
            <el-timeline v-if="timeline.length" size="small">
              <el-timeline-item v-for="(t, i) in timeline" :key="i" :timestamp="t.at || '待结算'" :hollow="!t.at">{{ t.label }}</el-timeline-item>
            </el-timeline>
            <el-timeline v-else size="small">
              <el-timeline-item :timestamp="order.orderedAt" :hollow="!order.shippedAt">下单</el-timeline-item>
              <el-timeline-item :timestamp="order.shippedAt" v-if="order.shippedAt" :hollow="!order.settledAt">发货</el-timeline-item>
              <el-timeline-item :timestamp="order.settledAt || '14 天后'" :hollow="!order.settledAt">{{ order.settledAt ? '已结算' : '待结算' }}</el-timeline-item>
            </el-timeline>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="24" :md="16" :lg="16">
          <el-card shadow="never">
            <template #header><h2 class="section-title">利润瀑布图（14 项费用）</h2></template>
            <WaterfallChart :items="waterfall" :height="isMobile ? 220 : 320" />
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.section-title { font-size: 16px; font-weight: 600; margin: 0; }
.block-label { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 8px; }
</style>
