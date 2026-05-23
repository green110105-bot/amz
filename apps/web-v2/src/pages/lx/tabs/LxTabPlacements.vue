<script setup>
import { onMounted, ref } from 'vue';
import { usePlacements } from '../../../composables/useLxState';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';

const mobileCols = [
  { prop: 'placement', label: '广告位' },
  { prop: 'bidAdj', label: '竞价调整', formatter: (v) => (v ?? 0) + '%' },
  { prop: 'spend', label: '花费', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'sales', label: '销售额', formatter: (v) => '$' + (v ?? 0).toFixed(2) },
  { prop: 'acos', label: 'ACoS', formatter: (v) => v ? (v * 100).toFixed(2) + '%' : '--' },
];

const props = defineProps({ campaign: Object, portfolio: Object });

const { list: rows, fetch, setBidAdj } = usePlacements(props.campaign.id);

onMounted(() => { fetch(); });

const placementFilter = ref('all');
const enterprise = ref(false);
const dateRange = ref([new Date('2026-05-13'), new Date('2026-05-13')]);
const showCompare = ref(false);

async function commitBidAdj(row, newVal) {
  await setBidAdj(row, newVal);
}
</script>

<template>
  <!-- 子工具栏 -->
  <div class="sub-toolbar">
    <el-button :icon="'Sort'">全部位置</el-button>
    <el-button>企业购</el-button>
    <el-date-picker
      v-model="dateRange"
      type="daterange"
      size="default"
      style="width: 240px"
    />
    <el-button :icon="'Filter'">筛选模板</el-button>
    <el-button type="primary">搜索</el-button>
    <span class="spacer" />
    <el-checkbox v-model="showCompare" size="small">环比</el-checkbox>
    <el-button :icon="'Bell'" size="small">对比预警</el-button>
    <el-button :icon="'Operation'" size="small">列配置 ▾</el-button>
    <el-button :icon="'Reading'" size="small" link />
    <el-button :icon="'Download'" size="small" link />
  </div>

  <!-- 表格 -->
  <div class="lx-table">
    <ResponsiveTable :data="rows" :mobile-columns="mobileCols" stripe border size="small">
      <el-table-column label="广告位" prop="placement" min-width="180" fixed>
        <template #default="{ row }">
          <span :class="(row.placement || '').includes('商品页面') ? 'placement-highlight' : ''">{{ row.placement }}</span>
        </template>
      </el-table-column>
      <el-table-column label="广告组合" prop="portfolio" width="180" fixed>
        <template #default="{ row }">
          <a class="link">{{ row.portfolio }}</a>
        </template>
      </el-table-column>
      <el-table-column label="广告活动竞价策略" prop="bidStrategy" width="140">
        <template #default="{ row }">{{ row.bidStrategy }}</template>
      </el-table-column>
      <el-table-column label="竞价调整" width="100">
        <template #default="{ row }">
          <div class="bid-adj">
            <el-input-number
              v-model="row.bidAdj"
              :step="5"
              :min="0"
              :max="100"
              size="small"
              :controls="false"
              style="width: 50px"
              @change="(v) => commitBidAdj(row, v)"
            />
            <span class="pct">%</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="曝光量" prop="impressions" width="90" sortable align="right">
        <template #default="{ row }">{{ (row.impressions ?? 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="点击" prop="clicks" width="80" sortable align="right" />
      <el-table-column label="点击%" prop="clickPct" width="80" sortable align="right">
        <template #default="{ row }">{{ row.clicks ? Math.round((row.clicks / 164) * 100) : 0 }}%</template>
      </el-table-column>
      <el-table-column label="CTR" prop="ctr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.ctr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="CPC" prop="cpc" width="80" sortable align="right">
        <template #default="{ row }">${{ (row.cpc ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="花费" prop="spend" width="90" sortable align="right">
        <template #default="{ row }">${{ (row.spend ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="花费%" prop="spendPct" width="80" sortable align="right">
        <template #default="{ row }">{{ row.spend ? Math.round((row.spend / 51.98) * 100) : 0 }}%</template>
      </el-table-column>
      <el-table-column label="广告销售额" prop="sales" width="110" sortable align="right">
        <template #default="{ row }">${{ (row.sales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="广告销售额%" prop="salesPct" width="100" sortable align="right">
        <template #default="{ row }">{{ row.sales ? 100 : 0 }}%</template>
      </el-table-column>
      <el-table-column label="直接销售额" prop="directSales" width="100" sortable align="right">
        <template #default="{ row }">${{ (row.directSales ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="ACoS" prop="acos" width="80" sortable align="right">
        <template #default="{ row }">
          <span :class="row.acos && row.acos > 0.5 ? 'danger' : row.acos && row.acos < 0.3 ? 'good' : ''">
            {{ row.acos ? (row.acos * 100).toFixed(2) + '%' : '--' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="广告订单" prop="orders" width="90" sortable align="right" />
      <el-table-column label="直接订单" prop="directOrders" width="90" sortable align="right" />
      <el-table-column label="CPA" prop="cpa" width="80" sortable align="right">
        <template #default="{ row }">{{ row.cpa ? '$' + row.cpa.toFixed(2) : '--' }}</template>
      </el-table-column>
      <el-table-column label="CVR" prop="cvr" width="80" sortable align="right">
        <template #default="{ row }">{{ ((row.cvr ?? 0) * 100).toFixed(2) }}%</template>
      </el-table-column>
      <el-table-column label="广告笔单价" prop="adUnitPrice" width="100" sortable align="right">
        <template #default="{ row }">${{ (row.adUnitPrice ?? 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="广告销量" prop="adUnits" width="90" sortable align="right" />
      <el-table-column label="分析" width="120" fixed="right">
        <template #default>
          <el-icon class="tool-icon"><Histogram /></el-icon>
          <el-icon class="tool-icon"><Clock /></el-icon>
          <el-icon class="tool-icon"><DataAnalysis /></el-icon>
          <el-icon class="tool-icon"><More /></el-icon>
        </template>
      </el-table-column>
    </ResponsiveTable>
  </div>

  <!-- 分页 -->
  <div class="footer-bar">
    <span class="meta">共 <strong>{{ rows.length }}</strong> 条</span>
    <el-pagination :total="rows.length" :page-size="25" layout="sizes, prev, pager, next, jumper" background small />
  </div>
</template>

<style scoped>
.sub-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
  flex-wrap: wrap;
}
.spacer { flex: 1; }

.lx-table { overflow-x: auto; }
.lx-table :deep(.el-table) { font-size: 12px; }
.lx-table :deep(.el-table th) {
  background: #fafbfc !important;
  color: #6b7280;
  font-weight: 500;
}

.placement-highlight {
  font-weight: 600;
}
.link { color: var(--primary); cursor: pointer; }
.link:hover { text-decoration: underline; }

.bid-adj { display: flex; align-items: center; gap: 4px; }
.pct { font-size: 12px; color: var(--text-muted); }

.danger { color: #ef4444; font-weight: 600; }
.good { color: #10b981; font-weight: 600; }

.tool-icon {
  margin: 0 3px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
}
.tool-icon:hover { color: var(--primary); }

.footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  font-size: 12px;
  color: var(--text-muted);
}
.footer-bar strong { color: var(--text); }
</style>
