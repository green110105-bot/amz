<script setup>
import { computed } from 'vue';

const props = defineProps({
  workbench: { type: Object, required: true },
});

const profile = computed(() => props.workbench?.productProfile || {});
const sourceMeta = computed(() => props.workbench?.sourceMeta || {});
const keywordSummary = computed(() => props.workbench?.keywords?.summary || { total: 0, covered: 0, percent: 0 });
const variants = computed(() => props.workbench?.variants || []);
const risks = computed(() => props.workbench?.complianceRisks || []);
const preflight = computed(() => props.workbench?.preflight || []);
const primaryKeywords = computed(() => props.workbench?.keywords?.primary || []);
const keywordRows = computed(() => props.workbench?.keywords?.rows || []);
const gallerySlots = computed(() => props.workbench?.gallerySlots || []);
const readyGallery = computed(() => gallerySlots.value.filter((g) => g.url || g.status === 'ready').length);
const preflightPassed = computed(() => preflight.value.filter((x) => x.passed).length);
const blockers = computed(() => preflight.value.filter((x) => !x.passed));

function severityType(severity) {
  return ({ high: 'danger', medium: 'warning', low: 'success' })[severity] || 'info';
}

function statusType(status) {
  return ({
    active: 'success',
    draft: 'info',
    ready: 'success',
    planned: 'warning',
    missing: 'info',
    needs_image: 'warning',
    needs_attribute: 'warning',
    open: 'danger',
    review: 'warning',
    passed: 'success',
  })[status] || 'info';
}

function sourceLabel(source) {
  // X-P1-01: unknown/absent source must NOT poison-default to 'Mock'.
  return ({
    api: 'API',
    deterministic_mock: 'Mock',
    hybrid_api_plus_deterministic_mock: 'API + Mock',
    'mock.m1_listing_ops.v1': 'Mock Workbench',
    unknown: 'Unknown',
  })[source] || source || 'Unknown';
}
</script>

<template>
  <section class="workbench-panel" id="workbench">
    <div class="hero-card">
      <div class="hero-copy">
        <div class="eyebrow">M1 Listing War Room</div>
        <h1>{{ profile.sku || profile.asin || 'M1 Listing' }}</h1>
        <p>{{ profile.category }} · {{ profile.priceBand }} · {{ profile.targetAudience }}</p>
        <div class="source-row">
          <el-tag effect="dark" type="info">{{ sourceLabel(sourceMeta.source) }}</el-tag>
          <el-tag type="success" effect="plain">Confidence {{ Math.round((sourceMeta.confidence || 0) * 100) }}%</el-tag>
          <el-tag v-if="profile.readOnly" type="warning" effect="plain">只读竞品 ASIN</el-tag>
          <span>{{ sourceMeta.reason }}</span>
        </div>
      </div>
      <div class="hero-metrics">
        <div class="metric-tile">
          <strong>{{ keywordSummary.percent }}%</strong>
          <span>关键词覆盖</span>
        </div>
        <div class="metric-tile">
          <strong>{{ readyGallery }}/9</strong>
          <span>Gallery 槽位</span>
        </div>
        <div class="metric-tile">
          <strong>{{ preflightPassed }}/{{ preflight.length }}</strong>
          <span>发布前检查</span>
        </div>
      </div>
    </div>

    <div class="ops-strip">
      <div class="step-card active"><span>01</span><strong>真实快照</strong><p>ASIN / SKU / 变体 / 类目属性</p></div>
      <div class="step-card active"><span>02</span><strong>竞品与 VOC</strong><p>标题结构、差评痛点、关键词缺口</p></div>
      <div class="step-card active"><span>03</span><strong>文案改写</strong><p>标题、五点、描述、后台词</p></div>
      <div class="step-card active"><span>04</span><strong>素材矩阵</strong><p>MAIN + PT01-PT08 + A+ + Video</p></div>
      <div class="step-card"><span>05</span><strong>合规闸门</strong><p>绝对化、医疗、商标、保修承诺</p></div>
      <div class="step-card"><span>06</span><strong>版本实验</strong><p>Diff、组合版本、A/B 复盘</p></div>
    </div>

    <div class="ops-grid">
      <el-card shadow="never" class="ops-card profile-card">
        <template #header><h2>商品作战档案</h2></template>
        <dl class="profile-list">
          <div><dt>ASIN</dt><dd>{{ profile.asin }}</dd></div>
          <div><dt>模式</dt><dd>{{ profile.mode }}</dd></div>
          <div><dt>状态</dt><dd><el-tag size="small" :type="statusType(profile.status)">{{ profile.status }}</el-tag></dd></div>
          <div><dt>定位</dt><dd>{{ profile.brandPositioning }}</dd></div>
          <div><dt>竞品池</dt><dd>{{ (profile.competitorPool || []).join(' / ') || '待补充' }}</dd></div>
        </dl>
      </el-card>

      <el-card shadow="never" class="ops-card variants-card">
        <template #header><h2>变体与类目属性</h2></template>
        <div class="variant-list">
          <div v-for="v in variants" :key="v.id" class="variant-row">
            <div>
              <strong>{{ v.label }}</strong>
              <p>{{ v.sku }} · {{ v.asin }} · {{ v.price }}</p>
            </div>
            <el-tag size="small" :type="statusType(v.status)">{{ v.status }}</el-tag>
          </div>
          <div v-if="!variants.length" class="empty-line">暂无变体数据，真实 SP-API 接入后从 Listings Items / PTD 补齐。</div>
        </div>
      </el-card>

      <el-card shadow="never" class="ops-card keyword-card">
        <template #header>
          <div class="card-head">
            <h2>关键词覆盖矩阵</h2>
            <el-progress :percentage="keywordSummary.percent" :stroke-width="8" style="width: 150px" />
          </div>
        </template>
        <div class="keyword-cloud">
          <el-tag v-for="kw in primaryKeywords" :key="kw" type="primary" effect="dark">{{ kw }}</el-tag>
        </div>
        <div class="keyword-table">
          <div v-for="row in keywordRows.slice(0, 8)" :key="row.keyword" class="kw-row">
            <span class="kw-priority">{{ row.priority }}</span>
            <strong>{{ row.keyword }}</strong>
            <span>{{ row.coverageText }}</span>
            <el-tag size="small" :type="row.covered ? 'success' : 'warning'">{{ row.covered ? 'covered' : 'gap' }}</el-tag>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="ops-card gallery-card">
        <template #header><h2>Amazon 图片槽位</h2></template>
        <div class="gallery-mini">
          <div v-for="slot in gallerySlots" :key="slot.slot" class="mini-slot" :class="{ ready: slot.url || slot.status === 'ready' }">
            <div class="thumb"><img v-if="slot.url" :src="slot.url" :alt="slot.role" /><span v-else>{{ slot.slot }}</span></div>
            <strong>{{ slot.role }}</strong>
            <small>{{ slot.intent }}</small>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="ops-card risk-card" id="compliance">
        <template #header><h2>合规风险</h2></template>
        <div class="risk-list">
          <div v-for="risk in risks" :key="risk.id" class="risk-row">
            <el-tag size="small" :type="severityType(risk.severity)">{{ risk.severity }}</el-tag>
            <div>
              <strong>{{ risk.field }} · {{ risk.issue }}</strong>
              <p>{{ risk.fix }}</p>
            </div>
          </div>
          <div v-if="!risks.length" class="empty-line">未发现高风险表达，发布前仍需人工复核。</div>
        </div>
      </el-card>

      <el-card shadow="never" class="ops-card preflight-card" id="preflight">
        <template #header>
          <div class="card-head">
            <h2>发布前检查</h2>
            <el-tag :type="blockers.length ? 'warning' : 'success'">{{ blockers.length ? `${blockers.length} 项阻塞` : '可进入审计' }}</el-tag>
          </div>
        </template>
        <div class="check-grid">
          <div v-for="item in preflight" :key="item.key" class="check-item" :class="{ passed: item.passed }">
            <span class="check-mark">{{ item.passed ? '✓' : '!' }}</span>
            <div>
              <strong>{{ item.label }}</strong>
              <p>Owner: {{ item.owner }} <span v-if="item.code">· {{ item.code }}</span></p>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </section>
</template>

<style scoped>
.workbench-panel { margin-bottom: 16px; scroll-margin-top: 80px; }
.hero-card {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 18px;
  padding: 22px;
  border: 1px solid #dbeafe;
  border-radius: 18px;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 36%),
    linear-gradient(135deg, #f8fafc 0%, #eef6ff 52%, #fff7ed 100%);
  margin-bottom: 16px;
}
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; color: #0f766e; text-transform: uppercase; }
.hero-copy h1 { margin: 6px 0; font-size: 28px; line-height: 1.2; color: #0f172a; }
.hero-copy p { margin: 0; color: #475569; }
.source-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; font-size: 12px; color: #64748b; }
.hero-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; align-content: center; }
.metric-tile { padding: 16px 12px; background: rgba(255, 255, 255, 0.72); border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 14px; text-align: center; }
.metric-tile strong { display: block; font-size: 26px; color: #0f766e; }
.metric-tile span { font-size: 12px; color: #64748b; }
.ops-strip { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.step-card { padding: 12px; border-radius: 14px; border: 1px dashed #cbd5e1; background: #fff; }
.step-card.active { border-style: solid; border-color: #99f6e4; background: #f0fdfa; }
.step-card span { font-size: 11px; color: #0f766e; font-weight: 800; }
.step-card strong { display: block; margin: 4px 0; color: #0f172a; font-size: 13px; }
.step-card p { margin: 0; color: #64748b; font-size: 11px; line-height: 1.45; }
.ops-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 14px; }
.ops-card { border-radius: 14px; }
.ops-card :deep(.el-card__header) { padding: 14px 16px; }
h2 { margin: 0; font-size: 15px; font-weight: 700; color: #0f172a; }
.profile-card, .variants-card { grid-column: span 4; }
.keyword-card { grid-column: span 8; }
.gallery-card { grid-column: span 12; }
.risk-card { grid-column: span 5; }
.preflight-card { grid-column: span 7; }
.profile-list { margin: 0; display: grid; gap: 10px; }
.profile-list div { display: grid; grid-template-columns: 88px 1fr; gap: 8px; }
dt { color: #64748b; font-size: 12px; }
dd { margin: 0; color: #0f172a; font-size: 13px; word-break: break-word; }
.variant-list, .risk-list { display: grid; gap: 10px; }
.variant-row { display: flex; justify-content: space-between; gap: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 12px; }
.variant-row strong, .risk-row strong, .check-item strong { font-size: 13px; color: #0f172a; }
.variant-row p, .risk-row p, .check-item p { margin: 4px 0 0; color: #64748b; font-size: 12px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.keyword-cloud { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.keyword-table { display: grid; gap: 6px; }
.kw-row { display: grid; grid-template-columns: 42px minmax(120px, 1fr) minmax(100px, 160px) 70px; gap: 8px; align-items: center; padding: 8px 10px; background: #f8fafc; border-radius: 10px; font-size: 12px; }
.kw-priority { color: #0f766e; font-weight: 700; }
.gallery-mini { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 8px; }
.mini-slot { padding: 8px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; display: grid; gap: 5px; }
.mini-slot.ready { border-style: solid; border-color: #99f6e4; background: #f0fdfa; }
.thumb { aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: #e2e8f0; color: #0f766e; font-weight: 800; font-size: 12px; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.mini-slot strong { font-size: 12px; color: #0f172a; }
.mini-slot small { color: #64748b; line-height: 1.35; }
.risk-row { display: grid; grid-template-columns: 70px 1fr; gap: 10px; align-items: start; padding: 10px; border: 1px solid #fee2e2; border-radius: 12px; background: #fff7ed; }
.check-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.check-item { display: grid; grid-template-columns: 30px 1fr; gap: 10px; padding: 10px; border: 1px solid #fde68a; background: #fffbeb; border-radius: 12px; }
.check-item.passed { border-color: #bbf7d0; background: #f0fdf4; }
.check-mark { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: #f59e0b; color: #fff; font-weight: 800; }
.check-item.passed .check-mark { background: #16a34a; }
.empty-line { padding: 14px; border-radius: 12px; background: #f8fafc; color: #64748b; font-size: 12px; }
@media (max-width: 1100px) {
  .ops-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gallery-mini { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .hero-card { grid-template-columns: 1fr; padding: 16px; }
  .hero-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ops-grid { grid-template-columns: 1fr; }
  .profile-card, .variants-card, .keyword-card, .gallery-card, .risk-card, .preflight-card { grid-column: auto; }
  .kw-row { grid-template-columns: 36px 1fr; }
  .kw-row > span:nth-child(3), .kw-row > .el-tag { justify-self: start; }
  .check-grid { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .hero-metrics, .ops-strip, .gallery-mini { grid-template-columns: 1fr; }
  .hero-copy h1 { font-size: 22px; }
  .profile-list div { grid-template-columns: 1fr; }
}
</style>
