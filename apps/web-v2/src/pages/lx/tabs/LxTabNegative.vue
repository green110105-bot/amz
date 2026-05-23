<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useNegatives } from '../../../composables/useLxState';
import { tabAiSignals } from '../../../utils/ads-integration';
import ResponsiveTable from '../../../components/ResponsiveTable.vue';
import ResponsiveDialog from '../../../components/ResponsiveDialog.vue';

const mobileCols = [
  { prop: 'term', label: '否定内容' },
  { prop: 'type', label: '类型' },
  { prop: 'matchType', label: '匹配' },
  { prop: 'scope', label: '范围' },
  { prop: 'addedBy', label: '添加方' },
];

const router = useRouter();
const props = defineProps({ campaign: Object });
const aiSignals = computed(() => tabAiSignals(props.campaign.id));
const { list: rows, fetch, create, remove } = useNegatives(props.campaign.id);

onMounted(() => { fetch(); });

const subtype = ref('all'); // all / keyword / product

const filteredRows = computed(() => {
  if (subtype.value === 'all') return rows.value;
  return rows.value.filter((r) => r.type === subtype.value);
});

const showAdd = ref(false);
const newNeg = ref({ term: '', matchType: 'exact', scope: 'AdGroup', type: 'keyword' });

async function doAdd() {
  if (!newNeg.value.term) return ElMessage.warning('请输入');
  await create({
    campaignId: props.campaign.id,
    adGroupId: null,
    ...newNeg.value,
    addedBy: 'admin',
    addedAt: new Date().toISOString().slice(0, 10),
  });
  newNeg.value = { term: '', matchType: 'exact', scope: 'AdGroup', type: 'keyword' };
  showAdd.value = false;
}

async function onRemove(row) {
  await remove(row.id);
}
</script>

<template>
  <!-- AI 提示横幅 -->
  <div v-if="aiSignals.negative > 0" class="ai-hint">
    <span class="ai-icon">🤖</span>
    <div class="ai-text">
      <strong>AI 推荐再否定 {{ aiSignals.negative }} 个搜索词</strong>
      <span>基于"0 转化 200 点击自动否定" + "类目错配自动否定"等策略</span>
    </div>
    <el-button size="small" type="primary" :icon="'Right'" @click="router.push('/ads/timeline')">去 Timeline 处理</el-button>
  </div>

  <div class="sub-toolbar">
    <el-radio-group v-model="subtype" size="default">
      <el-radio-button value="all">全部 ({{ rows.length }})</el-radio-button>
      <el-radio-button value="keyword">否定关键词 ({{ rows.filter(r => r.type === 'keyword').length }})</el-radio-button>
      <el-radio-button value="product">否定商品 ({{ rows.filter(r => r.type === 'product').length }})</el-radio-button>
    </el-radio-group>
    <span class="spacer" />
    <el-button :icon="'Upload'">CSV 批量导入</el-button>
    <el-button type="primary" :icon="'Plus'" @click="showAdd = true">添加否定</el-button>
  </div>

  <div class="lx-table">
    <ResponsiveTable :data="filteredRows" :mobile-columns="mobileCols" stripe border size="small">
      <el-table-column type="selection" width="40" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'keyword' ? 'danger' : 'warning'" effect="plain">
            {{ row.type === 'keyword' ? '否定 KW' : '否定 ASIN' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="否定内容" min-width="220">
        <template #default="{ row }">
          <strong>{{ row.term || row.asin }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="匹配类型" width="120">
        <template #default="{ row }">
          {{ ({ exact: '完全否定', phrase: '词组否定', 'asin-exact': 'ASIN 精确' })[row.matchType] }}
        </template>
      </el-table-column>
      <el-table-column label="生效范围" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="row.scope === 'Account' ? 'danger' : row.scope === 'Campaign' ? 'warning' : 'info'" effect="plain">
            {{ row.scope }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="添加方" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="row.addedBy === 'AI 自动' ? 'success' : 'info'">{{ row.addedBy }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="添加日期" prop="addedAt" width="130" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link size="small">编辑</el-button>
          <el-button link type="danger" size="small" @click="onRemove(row)">移除</el-button>
        </template>
      </el-table-column>
      <template #mobile-actions="{ row }">
        <el-button size="small" type="danger" @click="onRemove(row)">移除</el-button>
      </template>
    </ResponsiveTable>
  </div>

  <ResponsiveDialog v-model="showAdd" title="添加否定" width="500px">
    <el-form label-width="100px">
      <el-form-item label="类型">
        <el-radio-group v-model="newNeg.type">
          <el-radio value="keyword">否定关键词</el-radio>
          <el-radio value="product">否定 ASIN</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="内容">
        <el-input v-model="newNeg.term" :placeholder="newNeg.type === 'keyword' ? '搜索词 / 关键词' : 'ASIN'" />
      </el-form-item>
      <el-form-item label="匹配">
        <el-radio-group v-model="newNeg.matchType">
          <el-radio value="exact">完全否定</el-radio>
          <el-radio value="phrase" v-if="newNeg.type === 'keyword'">词组否定</el-radio>
          <el-radio value="asin-exact" v-if="newNeg.type === 'product'">ASIN 精确</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="生效范围">
        <el-radio-group v-model="newNeg.scope">
          <el-radio value="AdGroup">AdGroup 级</el-radio>
          <el-radio value="Campaign">Campaign 级</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAdd = false">取消</el-button>
      <el-button type="primary" @click="doAdd">添加</el-button>
    </template>
  </ResponsiveDialog>
</template>

<style scoped>
.sub-toolbar { display: flex; align-items: center; gap: 8px; padding: 0 0 12px; flex-wrap: wrap; }
@media (max-width: 767px) {
  .ai-hint { flex-direction: column; align-items: stretch; gap: 8px; }
}
.spacer { flex: 1; }
.lx-table { overflow-x: auto; }
.lx-table :deep(.el-table) { font-size: 12px; }
.lx-table :deep(.el-table th) { background: #fafbfc !important; color: #6b7280; font-weight: 500; }

.ai-hint {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(90deg, #eef2ff 0%, #f5f3ff 100%);
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  margin-bottom: 12px;
}
.ai-icon { font-size: 20px; }
.ai-text { flex: 1; font-size: 12px; color: var(--text); }
.ai-text strong { display: block; margin-bottom: 2px; font-size: 13px; }
</style>
