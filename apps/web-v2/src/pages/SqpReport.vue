<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { sqpApi } from '../api/sqp';
import { useAudit } from '../composables/useAudit';
import { useViewport } from '../composables/useViewport';
import ResponsiveTable from '../components/ResponsiveTable.vue';
import MobileFallback from '../components/MobileFallback.vue';

const { isMobile } = useViewport();
const mobileOppCols = [
  { prop: 'query', label: '搜索查询' },
  { prop: 'totalSearchVolume', label: '月搜索量', formatter: (v) => (v ?? 0).toLocaleString() },
  { prop: 'sku', label: '关联 SKU' },
];
const mobileSqpCols = [
  { prop: 'query', label: '查询' },
  { prop: 'totalSearchVolume', label: '搜索量', formatter: (v) => (v ?? 0).toLocaleString() },
  { prop: 'sku', label: 'SKU' },
];

const props = defineProps({
  embedded: { type: Boolean, default: false },
});

const route = useRoute();
const router = useRouter();
const { submit } = useAudit();

const sqpRows = ref([]);

async function load() {
  try {
    const items = await sqpApi.list();
    sqpRows.value = Array.isArray(items) ? items : [];
  } catch (e) {
    ElMessage.error(`加载 SQP 数据失败：${e.message || e}`);
    sqpRows.value = [];
  }
}

onMounted(load);

// ===== 漏斗汇总（所有 query 加权） =====
function funnelSummary(rows) {
  const sumTotal = rows.reduce((acc, r) => ({
    impressions: acc.impressions + (r.total?.impressions || 0),
    clicks: acc.clicks + (r.total?.clicks || 0),
    cartAdds: acc.cartAdds + (r.total?.cartAdds || 0),
    purchases: acc.purchases + (r.total?.purchases || 0),
  }), { impressions: 0, clicks: 0, cartAdds: 0, purchases: 0 });

  const sumYours = rows.reduce((acc, r) => ({
    impressions: acc.impressions + (r.yours?.impressions || 0),
    clicks: acc.clicks + (r.yours?.clicks || 0),
    cartAdds: acc.cartAdds + (r.yours?.cartAdds || 0),
    purchases: acc.purchases + (r.yours?.purchases || 0),
  }), { impressions: 0, clicks: 0, cartAdds: 0, purchases: 0 });

  return {
    total: sumTotal,
    yours: sumYours,
    shares: {
      impression: sumTotal.impressions > 0 ? sumYours.impressions / sumTotal.impressions : 0,
      click: sumTotal.clicks > 0 ? sumYours.clicks / sumTotal.clicks : 0,
      cart: sumTotal.cartAdds > 0 ? sumYours.cartAdds / sumTotal.cartAdds : 0,
      purchase: sumTotal.purchases > 0 ? sumYours.purchases / sumTotal.purchases : 0,
    },
    categoryRates: {
      ctr: sumTotal.impressions > 0 ? sumTotal.clicks / sumTotal.impressions : 0,
      cartRate: sumTotal.clicks > 0 ? sumTotal.cartAdds / sumTotal.clicks : 0,
      closeRate: sumTotal.cartAdds > 0 ? sumTotal.purchases / sumTotal.cartAdds : 0,
    },
    yourRates: {
      ctr: sumYours.clicks / Math.max(sumYours.impressions, 1),
      cartRate: sumYours.cartAdds / Math.max(sumYours.clicks, 1),
      closeRate: sumYours.purchases / Math.max(sumYours.cartAdds, 1),
    },
  };
}

function opportunities(rows) {
  return rows
    .filter((r) => !r.invested && (r.totalSearchVolume || 0) >= 8000 && (r.shares?.impression ?? 0) < 0.05)
    .sort((a, b) => (b.totalSearchVolume || 0) - (a.totalSearchVolume || 0));
}

function diagnosisGroups(rows) {
  return {
    impression: rows.filter((r) => r.diagnosis?.bottleneck === 'impression'),
    click: rows.filter((r) => r.diagnosis?.bottleneck === 'click'),
    cart: rows.filter((r) => r.diagnosis?.bottleneck === 'cart'),
    purchase: rows.filter((r) => r.diagnosis?.bottleneck === 'purchase'),
    healthy: rows.filter((r) => !r.diagnosis?.bottleneck || r.diagnosis.bottleneck === 'none'),
  };
}

const summary = computed(() => funnelSummary(sqpRows.value));
const opps = computed(() => opportunities(sqpRows.value));
const diags = computed(() => diagnosisGroups(sqpRows.value));

// 全表筛选（URL query 同步）
const filterBottleneck = ref(route.query.bottleneck || 'all');
const filterInvested = ref(route.query.inv || 'all');
const searchTerm = ref(route.query.q || '');

watch([filterBottleneck, filterInvested, searchTerm], ([b, inv, q]) => {
  const query = { ...route.query };
  if (b !== 'all') query.bottleneck = b; else delete query.bottleneck;
  if (inv !== 'all') query.inv = inv; else delete query.inv;
  if (q) query.q = q; else delete query.q;
  router.replace({ path: route.path, query });
});

const filteredRows = computed(() => {
  let list = sqpRows.value;
  if (filterBottleneck.value !== 'all') {
    list = list.filter((r) => r.diagnosis?.bottleneck === filterBottleneck.value);
  }
  if (filterInvested.value === 'invested') list = list.filter((r) => r.invested);
  else if (filterInvested.value === 'not_invested') list = list.filter((r) => !r.invested);
  if (searchTerm.value) {
    const k = searchTerm.value.toLowerCase();
    list = list.filter((r) => (r.query || '').toLowerCase().includes(k));
  }
  return list;
});

async function addInvestment(row) {
  try {
    await submit({
      sourceModule: 'M3',
      actionType: 'PROMOTE_TO_MANUAL',
      target: { type: 'sqp_query', term: row.query, sku: row.sku },
      payload: { term: row.query, suggestedBid: 1.2 },
      description: `SQP 机会词 → 加投放：${row.query}（搜索量 ${(row.totalSearchVolume || 0).toLocaleString()} / 你曝光份额 ${(((row.shares?.impression) || 0) * 100).toFixed(2)}%）`,
    });
    await sqpApi.takeAction({ queryId: row.id, action: 'add-targeting', payload: { term: row.query, sku: row.sku, suggestedBid: 1.2 } });
    row.invested = true;
    ElMessage.success(`已加投：${row.query} → 进审计中心`);
  } catch (e) {
    ElMessage.error(`加投失败：${e.message || e}`);
  }
}

// 漏斗图比例
const funnelData = computed(() => {
  const c = summary.value;
  return [
    { stage: '曝光', total: 100, totalRaw: c.total.impressions, yours: c.shares.impression * 100, yoursRaw: c.yours.impressions },
    { stage: '点击', total: c.categoryRates.ctr * 100, totalRaw: c.total.clicks, yours: c.shares.click * 100, yoursRaw: c.yours.clicks, rateLabel: `CTR ${(c.categoryRates.ctr * 100).toFixed(1)}%`, yourRate: `你 ${(c.yourRates.ctr * 100).toFixed(1)}%` },
    { stage: '加购', total: c.categoryRates.cartRate * 100, totalRaw: c.total.cartAdds, yours: c.shares.cart * 100, yoursRaw: c.yours.cartAdds, rateLabel: `加购率 ${(c.categoryRates.cartRate * 100).toFixed(1)}%`, yourRate: `你 ${(c.yourRates.cartRate * 100).toFixed(1)}%` },
    { stage: '购买', total: c.categoryRates.closeRate * 100, totalRaw: c.total.purchases, yours: c.shares.purchase * 100, yoursRaw: c.yours.purchases, rateLabel: `成交率 ${(c.categoryRates.closeRate * 100).toFixed(1)}%`, yourRate: `你 ${(c.yourRates.closeRate * 100).toFixed(1)}%` },
  ];
});

const mainBottleneck = computed(() => {
  const c = summary.value;
  const ctrRatio = c.categoryRates.ctr > 0 ? c.yourRates.ctr / c.categoryRates.ctr : 1;
  const cartRatio = c.categoryRates.cartRate > 0 ? c.yourRates.cartRate / c.categoryRates.cartRate : 1;
  const closeRatio = c.categoryRates.closeRate > 0 ? c.yourRates.closeRate / c.categoryRates.closeRate : 1;
  const stages = [
    { name: 'impression', label: '曝光段', share: c.shares.impression, baseline: 1 },
    { name: 'click', label: '点击段（CTR）', share: ctrRatio, baseline: 1 },
    { name: 'cart', label: '加购段', share: cartRatio, baseline: 1 },
    { name: 'purchase', label: '购买段', share: closeRatio, baseline: 1 },
  ];
  return stages.reduce((min, s) => (s.share < min.share ? s : min), stages[0]);
});

const bottleneckRec = computed(() => {
  return {
    impression: { color: '#ef4444', advice: '加 bid 提升广告曝光 + 改 listing 关键词覆盖以提升自然 SEO' },
    click: { color: '#f59e0b', advice: '改主图 + 标题 / 检查价格 / 评分 — listing 在搜索结果列表里不够吸引点击' },
    cart: { color: '#3b82f6', advice: '改 listing 五点 / A+ / 描述 — 用户点进来后没加购，内容没说服' },
    purchase: { color: '#8b5cf6', advice: '检查价格 / shipping / 缺货 — 加购了没买，最后一步出问题' },
  }[mainBottleneck.value.name];
});
</script>

<template>
  <MobileFallback
    v-if="isMobile && !embedded"
    page-name="SQP 份额报告"
    reason="本页含查询级 funnel 宽表与漏斗诊断图，建议在桌面端查看。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <p style="margin: 0">Brand Analytics · 查询级 funnel 份额 + 机会发现 + 漏斗诊断。</p>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else class="sqp-report">
    <!-- 顶部说明 -->
    <div v-if="!embedded" class="sqp-head">
      <h2>SQP 份额报告 · Brand Analytics</h2>
      <p class="sub">查询级 funnel 份额 + 机会发现 + 漏斗诊断 · 数据周 2026-W19 · {{ sqpRows.length }} 个查询</p>
    </div>

    <!-- 顶部 4 KPI -->
    <div class="kpi-row">
      <div class="kpi-cell">
        <span class="kl">曝光份额</span>
        <strong class="kv">{{ (summary.shares.impression * 100).toFixed(2) }}%</strong>
        <span class="kh">{{ summary.yours.impressions.toLocaleString() }} / {{ summary.total.impressions.toLocaleString() }}</span>
      </div>
      <div class="kpi-cell">
        <span class="kl">点击份额</span>
        <strong class="kv">{{ (summary.shares.click * 100).toFixed(2) }}%</strong>
        <span class="kh">CTR {{ (summary.yourRates.ctr * 100).toFixed(1) }}% · 类目 {{ (summary.categoryRates.ctr * 100).toFixed(1) }}%</span>
      </div>
      <div class="kpi-cell">
        <span class="kl">加购份额</span>
        <strong class="kv">{{ (summary.shares.cart * 100).toFixed(2) }}%</strong>
        <span class="kh">加购率 {{ (summary.yourRates.cartRate * 100).toFixed(1) }}% · 类目 {{ (summary.categoryRates.cartRate * 100).toFixed(1) }}%</span>
      </div>
      <div class="kpi-cell">
        <span class="kl">购买份额</span>
        <strong class="kv success">{{ (summary.shares.purchase * 100).toFixed(2) }}%</strong>
        <span class="kh">成交率 {{ (summary.yourRates.closeRate * 100).toFixed(1) }}% · 类目 {{ (summary.categoryRates.closeRate * 100).toFixed(1) }}%</span>
      </div>
    </div>

    <!-- 漏斗对比可视化 -->
    <section class="section">
      <h3 class="sh">漏斗诊断（你 vs 类目均）</h3>
      <div class="funnel-block">
        <div v-for="(f, i) in funnelData" :key="i" class="funnel-stage">
          <div class="fs-head">
            <strong>{{ f.stage }}</strong>
            <span v-if="f.rateLabel" class="fs-rate">{{ f.rateLabel }} <span class="fs-yr">→ {{ f.yourRate }}</span></span>
          </div>
          <div class="fs-bars">
            <div class="fs-bar-row">
              <span class="bar-label">类目</span>
              <div class="bar bg-cat" :style="{ width: '100%' }">
                <span class="bar-text">{{ f.totalRaw.toLocaleString() }} ({{ f.total.toFixed(1) }}%)</span>
              </div>
            </div>
            <div class="fs-bar-row">
              <span class="bar-label">你</span>
              <div class="bar bg-you" :style="{ width: Math.max(f.yours, 1) + '%' }">
                <span class="bar-text">{{ f.yoursRaw.toLocaleString() }} ({{ f.yours.toFixed(2) }}%)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 漏点诊断结论 -->
        <div class="bottleneck-callout" :style="{ borderLeftColor: bottleneckRec?.color }">
          <strong :style="{ color: bottleneckRec?.color }">🔴 主漏点：{{ mainBottleneck.label }}</strong>
          <p>{{ bottleneckRec?.advice }}</p>
        </div>
      </div>
    </section>

    <!-- 机会发现 -->
    <section class="section">
      <h3 class="sh">⭐ 机会发现 · 高搜索量 + 你曝光份额 < 5%（{{ opps.length }} 个查询）</h3>
      <p class="hint">这些查询整个类目都在卖，但你几乎没出现 — 加投这些词能直接拉高份额。</p>
      <ResponsiveTable :data="opps" :mobile-columns="mobileOppCols" stripe border size="small">
        <el-table-column label="搜索查询" prop="query" min-width="220">
          <template #default="{ row }"><strong>{{ row.query }}</strong></template>
        </el-table-column>
        <el-table-column label="月搜索量" prop="totalSearchVolume" width="120" align="right" sortable>
          <template #default="{ row }">{{ (row.totalSearchVolume ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="你曝光份额" width="120" align="right" sortable>
          <template #default="{ row }">
            <span class="danger">{{ ((row.shares?.impression ?? 0) * 100).toFixed(2) }}%</span>
          </template>
        </el-table-column>
        <el-table-column label="类目总曝光" width="130" align="right">
          <template #default="{ row }">{{ (row.total?.impressions ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="估计错失" width="120" align="right">
          <template #default="{ row }">
            <span class="muted">~{{ Math.round((row.total?.impressions ?? 0) * 0.05 - (row.yours?.impressions ?? 0)).toLocaleString() }} 曝光/周</span>
          </template>
        </el-table-column>
        <el-table-column label="关联 SKU" prop="sku" width="110" />
        <el-table-column label="操作" width="130">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="addInvestment(row)">+ 加投放</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button size="small" type="primary" @click="addInvestment(row)">+ 加投放</el-button>
        </template>
      </ResponsiveTable>
    </section>

    <!-- 漏斗诊断分组 -->
    <section class="section">
      <h3 class="sh">按漏点分组 · 一眼看清各类问题</h3>
      <div class="diag-grid">
        <div class="diag-card imp">
          <span class="diag-emoji">🚫</span>
          <strong>{{ diags.impression.length }}</strong>
          <span class="diag-label">曝光段漏</span>
          <span class="diag-hint">没出现在 SERP</span>
        </div>
        <div class="diag-card click">
          <span class="diag-emoji">📷</span>
          <strong>{{ diags.click.length }}</strong>
          <span class="diag-label">点击段漏</span>
          <span class="diag-hint">主图 / 价格</span>
        </div>
        <div class="diag-card cart">
          <span class="diag-emoji">📝</span>
          <strong>{{ diags.cart.length }}</strong>
          <span class="diag-label">加购段漏</span>
          <span class="diag-hint">listing 内容</span>
        </div>
        <div class="diag-card purchase">
          <span class="diag-emoji">💳</span>
          <strong>{{ diags.purchase.length }}</strong>
          <span class="diag-label">购买段漏</span>
          <span class="diag-hint">最后转化</span>
        </div>
        <div class="diag-card healthy">
          <span class="diag-emoji">✅</span>
          <strong>{{ diags.healthy.length }}</strong>
          <span class="diag-label">健康</span>
          <span class="diag-hint">无明显漏点</span>
        </div>
      </div>
    </section>

    <!-- 完整 SQP 表 -->
    <section class="section">
      <h3 class="sh">完整 SQP 数据（{{ sqpRows.length }} 个查询）</h3>

      <div class="table-filter">
        <el-input v-model="searchTerm" :prefix-icon="'Search'" placeholder="搜索查询" style="width: 240px" clearable />
        <el-radio-group v-model="filterBottleneck" size="default">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="impression">曝光漏</el-radio-button>
          <el-radio-button value="click">点击漏</el-radio-button>
          <el-radio-button value="cart">加购漏</el-radio-button>
          <el-radio-button value="purchase">购买漏</el-radio-button>
          <el-radio-button value="none">健康</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="filterInvested" size="default">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="invested">已投放</el-radio-button>
          <el-radio-button value="not_invested">未投放</el-radio-button>
        </el-radio-group>
      </div>

      <ResponsiveTable :data="filteredRows" :mobile-columns="mobileSqpCols" stripe border size="small">
        <el-table-column label="查询" prop="query" min-width="200" fixed>
          <template #default="{ row }">
            <strong>{{ row.query }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="已投" width="60" fixed>
          <template #default="{ row }">
            <el-tag v-if="row.invested" size="small" type="success" effect="plain">✓</el-tag>
            <el-tag v-else size="small" type="info" effect="plain">—</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="搜索量" prop="totalSearchVolume" width="100" align="right" sortable>
          <template #default="{ row }">{{ (row.totalSearchVolume ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="类目总曝光" width="110" align="right">
          <template #default="{ row }">{{ (row.total?.impressions ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="你曝光" width="100" align="right">
          <template #default="{ row }">{{ (row.yours?.impressions ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="曝光份额" width="100" align="right" sortable
          :sort-method="(a, b) => (a.shares?.impression ?? 0) - (b.shares?.impression ?? 0)">
          <template #default="{ row }">
            <span :class="(row.shares?.impression ?? 0) > 0.1 ? 'good' : (row.shares?.impression ?? 0) < 0.03 ? 'danger' : 'warn'">
              {{ ((row.shares?.impression ?? 0) * 100).toFixed(2) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column label="点击份额" width="100" align="right">
          <template #default="{ row }">{{ ((row.shares?.click ?? 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="加购份额" width="100" align="right">
          <template #default="{ row }">{{ ((row.shares?.cart ?? 0) * 100).toFixed(2) }}%</template>
        </el-table-column>
        <el-table-column label="购买份额" width="100" align="right" sortable
          :sort-method="(a, b) => (a.shares?.purchase ?? 0) - (b.shares?.purchase ?? 0)">
          <template #default="{ row }">
            <span :class="(row.shares?.purchase ?? 0) > 0.08 ? 'good' : (row.shares?.purchase ?? 0) < 0.02 ? 'danger' : 'warn'">
              {{ ((row.shares?.purchase ?? 0) * 100).toFixed(2) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column label="漏点" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.diagnosis?.bottleneck === 'impression'" size="small" type="danger">曝光</el-tag>
            <el-tag v-else-if="row.diagnosis?.bottleneck === 'click'" size="small" type="warning">点击</el-tag>
            <el-tag v-else-if="row.diagnosis?.bottleneck === 'cart'" size="small" type="primary">加购</el-tag>
            <el-tag v-else-if="row.diagnosis?.bottleneck === 'purchase'" size="small" effect="dark" style="background: #8b5cf6; border-color: #8b5cf6">购买</el-tag>
            <el-tag v-else size="small" type="success">健康</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="趋势" width="80">
          <template #default="{ row }">
            <span :class="row.trend === 'up' ? 'good' : row.trend === 'down' ? 'danger' : 'muted'">
              {{ { up: '↑ 涨', down: '↓ 跌', flat: '→ 平' }[row.trend] || '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="SKU" prop="sku" width="110" />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button v-if="!row.invested" size="small" link type="primary" @click="addInvestment(row)">+ 加投放</el-button>
            <el-button v-else size="small" link>查看广告</el-button>
          </template>
        </el-table-column>
        <template #mobile-actions="{ row }">
          <el-button v-if="!row.invested" size="small" type="primary" @click="addInvestment(row)">+ 加投放</el-button>
        </template>
      </ResponsiveTable>
    </section>
  </div>
</template>

<style scoped>
.sqp-report {
  padding-bottom: 24px;
}

.sqp-head {
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line-soft);
}
.sqp-head h2 { font-size: 16px; margin: 0 0 4px; }
.sqp-head .sub { font-size: 12px; color: var(--text-muted); margin: 0; }

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: #e5e7eb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 20px;
}
@media (max-width: 767px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .diag-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .table-filter { flex-wrap: wrap; gap: 6px; }
  .table-filter .el-input { width: 100% !important; }
}
.kpi-cell {
  background: #fff;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kl { font-size: 11px; color: var(--text-muted); }
.kv { font-size: 22px; font-weight: 700; font-family: ui-monospace, monospace; }
.kv.success { color: #10b981; }
.kh { font-size: 11px; color: var(--text-muted); }

.section { margin-bottom: 28px; }
.sh {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text);
}
.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 10px;
}

/* 漏斗 */
.funnel-block {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px 20px;
}
.funnel-stage {
  margin-bottom: 14px;
}
.funnel-stage:last-of-type { margin-bottom: 0; }
.fs-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 6px;
}
.fs-head strong { font-size: 14px; }
.fs-rate {
  font-size: 11px;
  color: var(--text-muted);
}
.fs-yr { color: var(--text); font-weight: 600; }
.fs-bars { display: flex; flex-direction: column; gap: 4px; }
.fs-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar-label {
  font-size: 11px;
  color: var(--text-muted);
  width: 40px;
  text-align: right;
}
.bar {
  height: 22px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  position: relative;
  min-width: 8px;
  transition: width 0.3s;
}
.bar.bg-cat { background: linear-gradient(90deg, #94a3b8, #cbd5e1); }
.bar.bg-you { background: linear-gradient(90deg, #2563eb, #60a5fa); }
.bar-text {
  font-size: 11px;
  color: #fff;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  white-space: nowrap;
}

.bottleneck-callout {
  margin-top: 18px;
  padding: 12px 14px;
  background: #fafbfc;
  border-left: 4px solid;
  border-radius: 0 6px 6px 0;
}
.bottleneck-callout strong { display: block; margin-bottom: 4px; font-size: 13px; }
.bottleneck-callout p { margin: 0; font-size: 12px; color: var(--text); line-height: 1.6; }

/* 诊断分组 */
.diag-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.diag-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 14px 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}
.diag-card.imp { border-left: 3px solid #ef4444; }
.diag-card.click { border-left: 3px solid #f59e0b; }
.diag-card.cart { border-left: 3px solid #3b82f6; }
.diag-card.purchase { border-left: 3px solid #8b5cf6; }
.diag-card.healthy { border-left: 3px solid #10b981; }
.diag-emoji { font-size: 24px; }
.diag-card strong { font-size: 22px; font-weight: 700; font-family: ui-monospace, monospace; line-height: 1; }
.diag-label { font-size: 12px; font-weight: 600; }
.diag-hint { font-size: 10px; color: var(--text-muted); }

/* 表格 */
.table-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.danger { color: #ef4444; font-weight: 600; }
.good { color: #10b981; font-weight: 600; }
.warn { color: #f59e0b; }
.muted { color: var(--text-muted); }
</style>
