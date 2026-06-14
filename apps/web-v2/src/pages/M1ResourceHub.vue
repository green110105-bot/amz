<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { mockCalibration, mockCategoryPains, mockCategoryTemplates, mockKeywordLibrary } from '../utils/mock-data-extras';

const route = useRoute();
const router = useRouter();

const retiredMessages = {
  'keyword-heatmap': {
    title: '关键词热力图已从日常工作流下线',
    body: '热力图脱离具体 Listing 字段后容易变成好看的图，真正有用的是作战室里的关键词覆盖矩阵、缺口、否词冲突和 stuffing 风险。',
  },
  'multi-locale': {
    title: '多语言母版已从日常工作流下线',
    body: '没有真实站点、类目属性和本地化审核状态时，母版只会变成翻译表。后续应并入单个 ASIN 的多站点版本管理，而不是单独占导航。',
  },
};

const retiredNotice = computed(() => retiredMessages[route.query.retired] || null);

const keywordStats = computed(() => ({
  preferred: mockKeywordLibrary.filter((k) => k.type === 'preferred').length,
  banned: mockKeywordLibrary.filter((k) => k.type === 'banned').length,
  required: mockKeywordLibrary.filter((k) => k.type === 'category_required').length,
}));

const painStats = computed(() => ({
  total: mockCategoryPains.length,
  urgent: mockCategoryPains.filter((p) => ['critical', 'high'].includes(p.severity)).length,
}));

const toolCards = computed(() => [
  {
    key: 'keywords',
    title: '关键词护栏',
    tag: '搜索词 -> Listing',
    metric: `${keywordStats.value.preferred}/${keywordStats.value.banned}`,
    metricLabel: '主词 / 否词',
    route: '/listings/keywords-library',
    tone: 'green',
    description: '保留能直接约束标题、五点、A+ 的主词、否词、类目必备词；导入 M3 搜索词后先进入这里做人工确认。',
    bullets: ['主词必须覆盖到具体字段', '否词禁止被 AI 改写带入', '类目必备词进入发布前检查'],
  },
  {
    key: 'templates',
    title: '类目发布规则',
    tag: '类目 -> 图片/属性',
    metric: String(mockCategoryTemplates.length),
    metricLabel: '可用类目',
    route: '/listings/templates',
    tone: 'blue',
    description: '把每个类目的标题公式、必填属性、图片槽位、认证和 A+ 模块做成规则，而不是泛泛的文案模板。',
    bullets: ['MAIN + PT01-PT08 图片要求', '变体/兼容性/认证必填', '类目评分权重可追溯'],
  },
  {
    key: 'pains',
    title: 'VOC 痛点库',
    tag: 'Review -> 预防',
    metric: `${painStats.value.urgent}/${painStats.value.total}`,
    metricLabel: '高优先级痛点',
    route: '/listings/category-pains',
    tone: 'orange',
    description: '只沉淀同类目高频差评和买家顾虑，并要求转成五点、图片或 A+ 的预防性表达。',
    bullets: ['来自 Review/竞品聚类', '按严重度进入作战室', '每条痛点都要有解决表达'],
  },
  {
    key: 'calibration',
    title: '评分规则校准',
    tag: '人工经验 -> AI',
    metric: mockCalibration.phaseC.currentVersion,
    metricLabel: '当前评分版本',
    route: '/listings/calibration',
    tone: 'purple',
    description: '校准五维评分与资深运营判断、A/B CVR lift 的相关性，避免 AI 只给漂亮分数。',
    bullets: ['人工盲评做基线', 'A/B 数据验证 lift', '每次调权保留版本'],
  },
]);

const operatingFlow = [
  {
    step: '01',
    title: '先收口素材',
    body: '运营只维护关键词护栏、类目规则、VOC 痛点、评分校准四类素材；其它图表一律不进主导航。',
  },
  {
    step: '02',
    title: '再进入作战室',
    body: '选择 SKU 后，系统把这些素材映射到标题、五点、图片槽位、A+、合规和发布前检查。',
  },
  {
    step: '03',
    title: '最后用真实结果反哺',
    body: '上线后用搜索词、转化、退货、Review、A/B 结果回写素材与评分，不让规则长期失真。',
  },
];

const mappings = [
  { source: '关键词护栏', target: 'D1 关键词覆盖、标题/五点改写、否词冲突检查', owner: '运营 + M3 搜索词' },
  { source: '类目发布规则', target: '变体属性、9 槽图片矩阵、认证、A+ 必备模块', owner: '类目负责人' },
  { source: 'VOC 痛点库', target: '卖点优先级、图片脚本、FAQ、预防性五点', owner: 'Review/竞品分析' },
  { source: '评分规则校准', target: '五维评分权重、AI 生成门槛、发布前合格线', owner: '资深运营 + 数据' },
];

function go(path) {
  router.push(path);
}
</script>

<template>
  <div class="m1-resource-hub">
    <PageHeader
      title="M1 素材规则中心"
      subtitle="资源库不再堆页面，只保留能直接喂给 Listing 作战室的关键词、类目、VOC 和评分规则。"
    >
      <template #extra>
        <el-button :icon="'MagicStick'" type="primary" @click="go('/listings/select')">进入 Listing 作战室</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="retiredNotice"
      class="retired-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="retiredNotice.title"
      :description="retiredNotice.body"
    />

    <section class="hero-card">
      <div class="hero-copy">
        <el-tag effect="dark" class="hero-tag">M1 Resource Hub</el-tag>
        <h2>从“资料陈列柜”改成“作战室补给线”<span class="hero-placeholder">未联动（占位）</span></h2>
        <p>
          人类运营不需要再打开一堆孤立页面找灵感。这里的每条素材都必须回答：
          它会约束哪个 Listing 字段、触发哪个检查、上线后用什么真实数据校准。
          （注：关键词 / VOC 自动注入作战室尚未联动，当前为占位说明，下方数字为示例。）
        </p>
      </div>
      <div class="hero-actions">
        <div class="signal">
          <strong>4</strong>
          <span>保留入口（示例）</span>
        </div>
        <div class="signal muted">
          <strong>2</strong>
          <span>下线入口（示例）</span>
        </div>
      </div>
    </section>

    <section class="tool-grid">
      <el-card v-for="tool in toolCards" :key="tool.key" shadow="never" class="tool-card" :class="`tool-card--${tool.tone}`">
        <div class="tool-head">
          <div>
            <el-tag size="small" effect="plain">{{ tool.tag }}</el-tag>
            <h3>{{ tool.title }}</h3>
          </div>
          <div class="tool-metric">
            <strong>{{ tool.metric }}</strong>
            <span>{{ tool.metricLabel }}</span>
          </div>
        </div>
        <p class="tool-desc">{{ tool.description }}</p>
        <div class="bullet-list">
          <span v-for="item in tool.bullets" :key="item">{{ item }}</span>
        </div>
        <div class="tool-foot">
          <el-button type="primary" plain :icon="'Right'" @click="go(tool.route)">进入维护</el-button>
        </div>
      </el-card>
    </section>

    <el-row :gutter="16" class="mt-16">
      <el-col :xs="24" :sm="24" :md="10" :lg="9">
        <el-card shadow="never" class="flow-card">
          <template #header>
            <h2 class="section-title">日常用法</h2>
          </template>
          <div v-for="item in operatingFlow" :key="item.step" class="flow-step">
            <span>{{ item.step }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.body }}</p>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="14" :lg="15">
        <el-card shadow="never" class="mapping-card">
          <template #header>
            <div class="card-header">
              <h2 class="section-title">素材如何进入 Listing 作战室</h2>
              <el-button size="small" :icon="'Select'" @click="go('/listings/select')">选择优化目标</el-button>
            </div>
          </template>
          <el-table :data="mappings" border class="mapping-table">
            <el-table-column prop="source" label="素材" width="150" />
            <el-table-column prop="target" label="作用到哪里" min-width="260" />
            <el-table-column prop="owner" label="来源/负责人" width="170" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="mt-16 retired-card">
      <template #header>
        <h2 class="section-title">已下线，不再占用主导航</h2>
      </template>
      <div class="retired-grid">
        <div class="retired-item">
          <strong>关键词热力图</strong>
          <p>独立热力图容易把运营带到“看覆盖颜色”的伪工作。有效部分已并入作战室的关键词覆盖矩阵和 D1 评分。</p>
        </div>
        <div class="retired-item">
          <strong>多语言母版</strong>
          <p>跨站点本地化需要真实 Catalog、类目属性和审核状态；当前独立母版会误导成翻译表，后续应作为单 ASIN 多站点版本能力。</p>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.m1-resource-hub {
  --hub-ink: #172033;
  --hub-soft: #f5f1e8;
  --hub-line: rgba(23, 32, 51, 0.1);
}
.retired-alert {
  margin-bottom: 16px;
}
.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
  border: 1px solid rgba(36, 51, 80, 0.12);
  border-radius: 20px;
  background:
    radial-gradient(circle at 18% 20%, rgba(244, 163, 76, 0.24), transparent 28%),
    linear-gradient(135deg, #172033 0%, #263b4f 52%, #efe3cd 100%);
  color: #fff;
  overflow: hidden;
}
.hero-copy {
  max-width: 720px;
}
.hero-tag {
  border: 0;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}
.hero-placeholder {
  display: inline-block;
  margin-left: 10px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  vertical-align: middle;
  border-radius: 999px;
  background: rgba(244, 163, 76, 0.28);
  color: #ffe7c2;
}
.hero-copy h2 {
  margin: 14px 0 10px;
  font-size: 28px;
  line-height: 1.2;
  letter-spacing: -0.03em;
}
.hero-copy p {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.8;
}
.hero-actions {
  display: grid;
  grid-template-columns: repeat(2, 104px);
  gap: 12px;
  align-content: end;
}
.signal {
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(10px);
}
.signal strong {
  display: block;
  font-size: 30px;
  line-height: 1;
}
.signal span {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}
.signal.muted {
  background: rgba(0, 0, 0, 0.16);
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.tool-card {
  border-radius: 18px;
  border-color: var(--hub-line);
}
.tool-card :deep(.el-card__body) {
  min-height: 310px;
  display: flex;
  flex-direction: column;
}
.tool-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.tool-head h3 {
  margin: 10px 0 0;
  font-size: 19px;
}
.tool-metric {
  text-align: right;
}
.tool-metric strong {
  display: block;
  color: var(--hub-ink);
  font-size: 24px;
  line-height: 1;
}
.tool-metric span {
  color: var(--text-muted);
  font-size: 11px;
}
.tool-desc {
  min-height: 76px;
  margin: 16px 0 12px;
  color: var(--text-muted);
  line-height: 1.65;
  font-size: 13px;
}
.bullet-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.bullet-list span {
  padding: 6px 9px;
  border-radius: 999px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
}
.tool-foot {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px dashed var(--hub-line);
}
.tool-card--green {
  background: linear-gradient(180deg, #f4fbf6, #fff);
}
.tool-card--blue {
  background: linear-gradient(180deg, #f1f7ff, #fff);
}
.tool-card--orange {
  background: linear-gradient(180deg, #fff7ed, #fff);
}
.tool-card--purple {
  background: linear-gradient(180deg, #f8f5ff, #fff);
}
.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}
.card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.flow-card,
.mapping-card,
.retired-card {
  border-radius: 16px;
}
.flow-step {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px dashed var(--hub-line);
}
.flow-step:last-child {
  border-bottom: 0;
}
.flow-step > span {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--hub-ink);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
}
.flow-step strong {
  display: block;
  margin-bottom: 4px;
}
.flow-step p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.6;
  font-size: 13px;
}
.mapping-table {
  width: 100%;
}
.retired-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.retired-item {
  padding: 16px;
  border: 1px solid var(--hub-line);
  border-radius: 14px;
  background: #fafafa;
}
.retired-item strong {
  display: block;
  margin-bottom: 8px;
}
.retired-item p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.7;
  font-size: 13px;
}
@media (max-width: 1180px) {
  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .hero-card {
    flex-direction: column;
    padding: 20px;
  }
  .hero-copy h2 {
    font-size: 22px;
  }
  .hero-actions,
  .tool-grid,
  .retired-grid {
    grid-template-columns: 1fr;
  }
  .tool-card :deep(.el-card__body) {
    min-height: auto;
  }
}
</style>
