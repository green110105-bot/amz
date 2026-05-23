<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { strategiesApi } from '../api/ads-strategies';
import { useCampaigns } from '../composables/useLxState';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  strategy: { type: Object, default: null },
});
const emit = defineEmits(['update:modelValue', 'toggle', 'edit']);
const router = useRouter();

const { getById: getCampaignById } = useCampaigns();

const s = computed(() => props.strategy);

// 真实绑定列表（来自策略实体 + 通过 campaigns 缓存 lookup）
// 后端契约里 bind() 写绑定；当前实体上 bindings 字段为 campaignIds 数组或 [{id, name, type, portfolioId}]
const bindings = ref([]);

watch(s, async (strat) => {
  if (!strat) { bindings.value = []; return; }
  // 优先使用 strat.bindings (若后端返回结构化数据)
  if (Array.isArray(strat.bindings) && strat.bindings.length && typeof strat.bindings[0] === 'object') {
    bindings.value = strat.bindings;
    return;
  }
  // 否则尝试拿 campaignIds + lookup
  const ids = Array.isArray(strat.bindings) ? strat.bindings : (strat.campaignIds || []);
  if (!ids.length) {
    // 兜底：若 strat.bindingsCount > 0 但没有数据，尝试从详情拉取
    if ((strat.bindingsCount || 0) > 0 && strat.id) {
      try {
        const detail = await strategiesApi.get(strat.id);
        const detailIds = Array.isArray(detail?.bindings) ? detail.bindings : (detail?.campaignIds || []);
        bindings.value = detailIds.map((id) => {
          const cmp = getCampaignById(id);
          return cmp ? { id, name: cmp.name, type: cmp.type, portfolioId: cmp.portfolioId } : { id, name: id, type: '?', portfolioId: null };
        });
      } catch {
        bindings.value = [];
      }
    } else {
      bindings.value = [];
    }
    return;
  }
  bindings.value = ids.map((id) => {
    const cmp = getCampaignById(id);
    return cmp ? { id, name: cmp.name, type: cmp.type, portfolioId: cmp.portfolioId } : { id, name: id, type: '?', portfolioId: null };
  });
}, { immediate: true });

function close() { emit('update:modelValue', false); }

function gotoSuggestion() {
  router.push({ path: '/ads/timeline', query: { strategy: s.value?.id } });
  close();
}

function gotoCampaign(cmpId) {
  router.push(`/ads/lx/campaigns/${cmpId}?g=ad-groups`);
  close();
}

const sovereigntyMeta = computed(() => ({
  manual: { color: '#6b7280', label: '手动 · 仅建议' },
  semi: { color: '#3b82f6', label: '半自动 · 建议 + 一键执行' },
  auto: { color: '#10b981', label: '全自动 · 自动执行' },
})[s.value?.sovereignty] || { color: '#6b7280', label: '—' });

const sparklineBars = computed(() => {
  const data = s.value?.triggerHistory || [];
  if (!data.length) return [];
  const max = Math.max(...data, 1);
  return data.map((v, i) => ({
    x: (i / (data.length - 1)) * 540,
    height: (v / max) * 60,
    value: v,
  }));
});
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    direction="rtl"
    size="720px"
    :with-header="false"
  >
    <div v-if="s" class="sd-drawer">
      <!-- 头部 -->
      <div class="sd-head">
        <div class="sd-head-left">
          <el-tag size="default" :style="{ background: s.categoryColor + '20', color: s.categoryColor, borderColor: 'transparent' }">
            {{ s.categoryEmoji }} {{ s.categoryLabel }}
          </el-tag>
          <el-tag size="small" :type="s.enabled ? 'success' : 'info'" effect="dark">
            {{ s.enabled ? '● 启用中' : '○ 已暂停' }}
          </el-tag>
          <el-tag v-if="s.crossModule" size="small" type="warning" effect="dark">🔗 跨 {{ s.crossModule }}</el-tag>
        </div>
        <el-button :icon="'Close'" circle plain size="small" @click="close" />
      </div>

      <h2 class="sd-title">{{ s.name }}</h2>
      <p class="sd-desc">{{ s.description }}</p>

      <!-- 主权说明 -->
      <div class="sd-sovereign" :style="{ borderColor: sovereigntyMeta.color }">
        <el-icon :size="18" :style="{ color: sovereigntyMeta.color }"><Lock /></el-icon>
        <div>
          <strong :style="{ color: sovereigntyMeta.color }">{{ sovereigntyMeta.label }}</strong>
          <div class="sd-sov-desc">作用范围：<strong>{{ s.scopeLabel }}</strong> · 已绑定 <strong>{{ s.bindingsCount || 0 }}</strong> 个实体</div>
        </div>
      </div>

      <!-- 触发条件 -->
      <section class="sd-section" v-if="s.trigger">
        <h3 class="sh">📋 触发条件</h3>
        <div class="cond-block">
          <div class="cond-row"><span class="cl">当</span><code>{{ s.trigger.condition }}</code></div>
          <div class="cond-row"><span class="cl">频率</span><strong>{{ s.trigger.frequency }}</strong></div>
          <div class="cond-row" v-if="s.trigger.cooldownHours > 0">
            <span class="cl">冷却</span><strong>{{ s.trigger.cooldownHours }}h（同实体不重复触发）</strong>
          </div>
        </div>
      </section>

      <!-- 动作 -->
      <section class="sd-section" v-if="s.action">
        <h3 class="sh">⚡ 动作</h3>
        <div class="action-block">
          <code class="action-code">{{ s.action.desc }}</code>
        </div>

        <!-- 结构创建型策略：显示将创建的 Campaign 列表 -->
        <div v-if="s.action.previewCampaigns?.length" class="preview-campaigns">
          <h4 class="pc-h">📦 将创建的 Campaign（{{ s.action.previewCampaigns.length }} 个）</h4>
          <el-table :data="s.action.previewCampaigns" stripe border size="small">
            <el-table-column label="类型" width="70">
              <template #default="{ row }">
                <el-tag size="small" :type="row.type === 'SP' ? 'primary' : row.type === 'SB' ? 'success' : 'warning'">{{ row.type }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="投放方式" prop="mode" width="100" />
            <el-table-column label="Campaign 名" prop="name" min-width="200" />
            <el-table-column label="预算" prop="budget" width="70" align="right">
              <template #default="{ row }">${{ row.budget }}</template>
            </el-table-column>
            <el-table-column label="bid" prop="bid" width="70" align="right">
              <template #default="{ row }">${{ row.bid }}</template>
            </el-table-column>
            <el-table-column label="备注" prop="note" min-width="160" />
          </el-table>
          <div class="pc-total">
            合计日预算 <strong>${{ s.action.previewCampaigns.reduce((sum, c) => sum + c.budget, 0) }}</strong>
            · {{ s.action.previewCampaigns.length }} 个 Campaign 一键创建
          </div>
        </div>

        <!-- 关联自动启用策略 -->
        <div v-if="s.action.autoActivateStrategies?.length" class="auto-strategies">
          <h4 class="pc-h">🔗 同时自动启用 {{ s.action.autoActivateStrategies.length }} 条相关策略</h4>
          <ul class="auto-list">
            <li v-for="(item, i) in s.action.autoActivateStrategies" :key="i">✓ {{ item }}</li>
          </ul>
        </div>
      </section>

      <!-- 护栏 -->
      <section class="sd-section" v-if="s.guardrails && (s.guardrails.maxBidChangePct || s.guardrails.maxDailyOps || s.guardrails.skipTags?.length)">
        <h3 class="sh">🛡 护栏</h3>
        <div class="guard-block">
          <div v-if="s.guardrails.maxBidChangePct" class="guard-row">
            <el-tag size="small" effect="plain">单次 bid 变化上限 {{ s.guardrails.maxBidChangePct }}%</el-tag>
          </div>
          <div v-if="s.guardrails.maxDailyOps" class="guard-row">
            <el-tag size="small" effect="plain">日操作上限 {{ s.guardrails.maxDailyOps }}</el-tag>
          </div>
          <div v-if="s.guardrails.skipTags?.length" class="guard-row">
            <span class="cl">跳过标签</span>
            <el-tag v-for="t in s.guardrails.skipTags" :key="t" size="small" type="warning" effect="plain">{{ t }}</el-tag>
          </div>
        </div>
      </section>

      <!-- 历史触发 sparkline -->
      <section class="sd-section" v-if="(s.triggerHistory || []).length">
        <h3 class="sh">📊 历史触发（最近 14 天）</h3>
        <div class="sparkline-block">
          <svg viewBox="0 0 540 100" class="spark-chart">
            <g class="grid">
              <line x1="0" y1="20" x2="540" y2="20" />
              <line x1="0" y1="50" x2="540" y2="50" />
              <line x1="0" y1="80" x2="540" y2="80" />
            </g>
            <g class="bars">
              <rect
                v-for="(b, i) in sparklineBars"
                :key="i"
                :x="b.x - 8"
                :y="80 - b.height"
                width="16"
                :height="b.height"
                fill="#3b82f6"
                opacity="0.7"
                rx="2"
              />
            </g>
          </svg>
          <div class="spark-stats">
            <div class="spark-stat">
              <span class="spark-stat-label">14d 触发</span>
              <strong>{{ s.triggerHistory.reduce((a, b) => a + b, 0) }} 次</strong>
            </div>
            <div class="spark-stat">
              <span class="spark-stat-label">累计触发</span>
              <strong>{{ s.triggerCount || 0 }} 次</strong>
            </div>
            <div class="spark-stat" v-if="s.successRate !== null && s.successRate !== undefined">
              <span class="spark-stat-label">成功率</span>
              <strong :style="{ color: s.successRate > 0.7 ? '#10b981' : s.successRate > 0.4 ? '#f59e0b' : '#ef4444' }">
                {{ Math.round(s.successRate * 100) }}%
                <span class="spark-trend">{{ { up: '↑', down: '↓', flat: '→' }[s.successTrend] }}</span>
              </strong>
            </div>
            <div class="spark-stat" v-if="s.lastTriggered">
              <span class="spark-stat-label">最近触发</span>
              <strong>{{ new Date(s.lastTriggered).toLocaleString('zh-CN') }}</strong>
            </div>
          </div>
        </div>
      </section>

      <!-- 真实绑定 Campaign 列表 -->
      <section v-if="bindings.length" class="sd-section">
        <h3 class="sh">🔗 绑定 Campaign ({{ bindings.length }} 个)</h3>
        <div class="binding-list">
          <div
            v-for="b in bindings"
            :key="b.id"
            class="binding-row"
            @click="gotoCampaign(b.id)"
          >
            <el-tag size="small" effect="plain" :type="b.type === 'SP' ? 'primary' : b.type === 'SB' ? 'success' : 'warning'">{{ b.type }}</el-tag>
            <strong class="binding-name">{{ b.name }}</strong>
            <span class="binding-action">在 lx 查看 →</span>
          </div>
        </div>
      </section>

      <!-- 关联建议 -->
      <section class="sd-section" v-if="(s.recentSuggestions || []).length">
        <h3 class="sh">🎯 关联建议（最近 {{ s.recentSuggestions.length }} 条）</h3>
        <div class="sug-list">
          <div
            v-for="sug in s.recentSuggestions"
            :key="sug.id"
            class="sug-row"
            @click="gotoSuggestion(sug)"
          >
            <span class="sug-time">{{ new Date(sug.time).toLocaleDateString('zh-CN') }}</span>
            <span class="sug-entity">
              <code>{{ sug.entity?.sku }}</code> ·
              <code class="kw">"{{ sug.entity?.keyword }}"</code>
            </span>
            <span class="sug-action">{{ sug.action }}</span>
            <el-tag size="small" :type="sug.accepted ? 'success' : 'info'" effect="plain">
              {{ sug.accepted ? '已采纳' : '已忽略' }}
            </el-tag>
          </div>
        </div>
        <el-button link type="primary" size="small" style="margin-top: 8px" @click="router.push('/ads/timeline'); close()">
          在 Timeline 查看完整历史 →
        </el-button>
      </section>

      <!-- 底部操作 -->
      <div class="sd-foot">
        <el-button size="default" @click="emit('toggle', s)">{{ s.enabled ? '暂停' : '启用' }}</el-button>
        <el-button size="default">编辑</el-button>
        <el-button size="default">复制</el-button>
        <el-button size="default" link type="danger">归档</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.sd-drawer {
  padding: 0 24px 100px;
}

.sd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0 12px;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}
.sd-head-left { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }

.sd-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 8px;
}

.sd-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
}

.sd-sovereign {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: #f9fafb;
  border-left: 3px solid;
  border-radius: 0 6px 6px 0;
  margin-bottom: 18px;
}
.sd-sov-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.sd-sov-desc strong { color: var(--text); }

.sd-section {
  margin-bottom: 22px;
}
.sh {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 10px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.cond-block {
  background: #f9fafb;
  border-radius: 6px;
  padding: 12px 14px;
}
.cond-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 13px;
}
.cond-row:last-child { margin-bottom: 0; }
.cl {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 50px;
  padding-top: 2px;
}
.cond-row code {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--text);
  background: #fff;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--line);
  line-height: 1.6;
  flex: 1;
}

.action-block {
  background: #eff6ff;
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  padding: 12px 14px;
}
.action-code {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  color: #3b82f6;
  font-weight: 500;
}

.preview-campaigns {
  margin-top: 14px;
}
.pc-h {
  font-size: 12px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text);
}
.pc-total {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fef3c7;
  border-radius: 4px;
  font-size: 12px;
  color: #92400e;
}
.pc-total strong {
  font-family: ui-monospace, monospace;
  font-weight: 700;
  color: #b45309;
}

.auto-strategies {
  margin-top: 14px;
}
.auto-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 4px;
  padding: 10px 14px;
}
.auto-list li {
  padding: 4px 0;
  font-size: 12px;
  color: var(--text);
}

.guard-block { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.guard-row { display: flex; align-items: center; gap: 6px; }

.sparkline-block {
  background: #fff;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  padding: 12px 14px;
}
.spark-chart { width: 100%; height: 100px; }
.spark-chart .grid line { stroke: #f3f4f6; stroke-width: 1; }
.spark-stats {
  display: flex;
  gap: 24px;
  padding-top: 10px;
  border-top: 1px dashed var(--line-soft);
  margin-top: 4px;
  flex-wrap: wrap;
}
.spark-stat { display: flex; flex-direction: column; gap: 2px; }
.spark-stat-label { font-size: 11px; color: var(--text-muted); }
.spark-stat strong { font-size: 14px; font-weight: 600; font-family: ui-monospace, monospace; }
.spark-trend { font-size: 10px; }

.sug-list { display: flex; flex-direction: column; gap: 4px; }
.sug-row {
  display: grid;
  grid-template-columns: 90px 1fr 1fr 70px;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  background: #fafbfc;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.sug-row:hover { background: #f0f7ff; }
.sug-time { color: var(--text-muted); font-family: ui-monospace, monospace; }
.sug-entity code { background: #fff; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
.sug-entity code.kw { color: var(--primary); }
.sug-action { color: var(--text); font-weight: 500; }

.binding-list { display: flex; flex-direction: column; gap: 4px; }
.binding-row {
  display: grid;
  grid-template-columns: 50px 1fr 90px;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}
.binding-row:hover { background: #dbeafe; }
.binding-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.binding-action {
  color: var(--primary);
  font-size: 11px;
  text-align: right;
}

.sd-foot {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 24px;
  background: #fff;
  border-top: 1px solid var(--line);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
