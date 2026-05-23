<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '../components/PageHeader.vue';
import MobileFallback from '../components/MobileFallback.vue';
import { useViewport } from '../composables/useViewport';
import { useLocalStore } from '../composables/useLocalStore';

const { isMobile } = useViewport();

const localStore = useLocalStore();
const tab = ref('stores');

// 真后端店铺
const stores = computed(() => localStore.stores);
const currentStoreId = computed(() => localStore.currentStoreId);

const showAddStore = ref(false);
const newStore = ref({ name: '', region: 'US', currency: 'USD' });

async function addStore() {
  if (!newStore.value.name) return ElMessage.warning('请输入店铺名');
  await localStore.addStore({ ...newStore.value });
  newStore.value = { name: '', region: 'US', currency: 'USD' };
  showAddStore.value = false;
  ElMessage.success('已添加店铺');
}

async function removeStore(s) {
  if (stores.value.length <= 1) return ElMessage.warning('至少保留一个店铺');
  try {
    await ElMessageBox.confirm(`确定解绑 ${s.name}? 该店铺的审计日志/关键词/告警将被清除。`, '解绑店铺', {
      confirmButtonText: '解绑', cancelButtonText: '取消', type: 'warning',
    });
    await localStore.removeStore(s.id);
    ElMessage.success('已解绑');
  } catch {}
}

async function activateStore(s) {
  await localStore.switchStore(s.id);
}

async function authorize(s, kind) {
  await localStore.updateStore(s.id, { [kind]: true });
  ElMessage.success(`${kind === 'spApiAuthorized' ? 'SP-API' : 'Ads API'} 已模拟授权`);
}

onMounted(async () => {
  if (!localStore.hydrated) await localStore.hydrate();
});

// 主权
const sovereigntyConfig = ref({
  global: 'semi',
  m1: 'manual',
  m2: 'semi',
  m3: 'auto',
  m4: 'semi',
  bidChangeMaxPct: 15,
  budgetIncMaxPct: 20,
  budgetDecMaxPct: 30,
  dailyMaxPerSku: 5,
  dailyMaxTotal: 100,
});

// 通知
const notifyConfig = ref({
  channels: { in_app: true, email: true, wechat: false, wecom: false, dingtalk: false },
  email: 'user@example.com',
  p0Channels: ['in_app', 'email'],
  p1Channels: ['in_app', 'email_aggregated'],
  p2Channels: ['email_daily'],
  quietStart: '23:00',
  quietEnd: '07:00',
  quietExceptP0: true,
});

// 团队
const team = ref([
  { id: 'u1', name: '张三', email: 'zhang@demo.com', role: 'admin', stores: '全部' },
  { id: 'u2', name: '李四', email: 'li@demo.com', role: 'operator', stores: 'Mock Store · US' },
  { id: 'u3', name: '王五', email: 'wang@demo.com', role: 'finance', stores: '全部（只读）' },
]);

// stores 已在 setup 顶部从 localStore 取，无需重复定义

function save() {
  // 真持久化到 LocalStorage
  for (const k of ['global', 'm1', 'm2', 'm3', 'm4']) {
    if (sovereigntyConfig.value[k]) localStore.setSovereignty(k, sovereigntyConfig.value[k]);
  }
  localStore.updateSettings({
    notifyChannels: notifyConfig.value.channels,
    quietHoursStart: notifyConfig.value.quietStart,
    quietHoursEnd: notifyConfig.value.quietEnd,
    quietExceptP0: notifyConfig.value.quietExceptP0,
    bidChangeMaxPct: sovereigntyConfig.value.bidChangeMaxPct,
    budgetIncMaxPct: sovereigntyConfig.value.budgetIncMaxPct,
    budgetDecMaxPct: sovereigntyConfig.value.budgetDecMaxPct,
    dailyMaxPerSku: sovereigntyConfig.value.dailyMaxPerSku,
    dailyMaxTotal: sovereigntyConfig.value.dailyMaxTotal,
  });
  ElMessage.success('设置已保存（持久化到本地）');
}
</script>

<template>
  <MobileFallback
    v-if="isMobile"
    page-name="设置"
    reason="设置页含多 tab + 表格 + 宽表单（店铺授权 / 通知偏好 / 团队权限），建议在桌面端操作。"
  >
    <template #readonly>
      <el-card shadow="never" style="margin-top: 12px; text-align: left">
        <h4 style="margin: 0 0 8px">本页用途：</h4>
        <ul style="padding-left: 20px; line-height: 2; margin: 0">
          <li>店铺与授权管理</li>
          <li>主权配置 / 通知偏好</li>
          <li>团队成员与权限</li>
        </ul>
        <el-button type="primary" style="margin-top: 16px; width: 100%" @click="$router.push('/workbench')">返回工作台</el-button>
      </el-card>
    </template>
  </MobileFallback>
  <div v-else>
    <PageHeader title="设置" subtitle="店铺授权 · 主权配置 · 通知偏好 · 团队权限" />

    <el-card shadow="never">
      <el-tabs v-model="tab">

        <!-- 店铺与授权 -->
        <el-tab-pane label="店铺与授权" name="stores">
          <el-alert type="info" :closable="false" show-icon
            title="多店铺数据完全隔离"
            description="审计日志 / 关键词库 / 告警规则 / 主权配置 都按店铺独立存储；通知偏好与团队为账号级。" />

          <h3 class="section-title">已绑定店铺（{{ stores.length }}）</h3>
          <el-table :data="stores" stripe>
            <el-table-column label="店铺名" min-width="220">
              <template #default="{ row }">
                <div style="display:flex; align-items:center; gap:8px">
                  <strong>{{ row.name }}</strong>
                  <el-tag v-if="row.id === currentStoreId" type="success" size="small">当前</el-tag>
                </div>
                <div class="text-muted" style="font-size:11px">{{ row.id }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="region" label="国家站" width="100" />
            <el-table-column prop="currency" label="币种" width="90" />
            <el-table-column label="SP-API" width="160">
              <template #default="{ row }">
                <el-tag v-if="row.spApiAuthorized" type="success" size="small">已授权</el-tag>
                <el-button v-else size="small" type="primary" plain @click="authorize(row, 'spApiAuthorized')">授权 SP-API</el-button>
              </template>
            </el-table-column>
            <el-table-column label="Ads API" width="160">
              <template #default="{ row }">
                <el-tag v-if="row.adsApiAuthorized" type="success" size="small">已授权</el-tag>
                <el-button v-else size="small" type="primary" plain @click="authorize(row, 'adsApiAuthorized')">授权 Ads API</el-button>
              </template>
            </el-table-column>
            <el-table-column label="添加时间" width="140">
              <template #default="{ row }">{{ row.addedAt ? row.addedAt.slice(0, 10) : '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button size="small" link type="primary" :disabled="row.id === currentStoreId" @click="activateStore(row)">激活</el-button>
                <el-button size="small" link type="danger" :disabled="stores.length <= 1" @click="removeStore(row)">解绑</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button type="primary" :icon="'Plus'" style="margin-top: 12px" @click="showAddStore = true">添加店铺</el-button>

          <el-dialog v-model="showAddStore" title="添加店铺" width="420px">
            <el-form label-width="90px" label-position="left">
              <el-form-item label="店铺名">
                <el-input v-model="newStore.name" placeholder="如：My Store · UK" />
              </el-form-item>
              <el-form-item label="国家站">
                <el-select v-model="newStore.region" style="width: 100%">
                  <el-option label="美国 (US)" value="US" />
                  <el-option label="英国 (UK)" value="UK" />
                  <el-option label="德国 (DE)" value="DE" />
                  <el-option label="日本 (JP)" value="JP" />
                  <el-option label="加拿大 (CA)" value="CA" />
                  <el-option label="法国 (FR)" value="FR" />
                  <el-option label="意大利 (IT)" value="IT" />
                  <el-option label="西班牙 (ES)" value="ES" />
                  <el-option label="澳大利亚 (AU)" value="AU" />
                  <el-option label="墨西哥 (MX)" value="MX" />
                </el-select>
              </el-form-item>
              <el-form-item label="币种">
                <el-select v-model="newStore.currency" style="width: 100%">
                  <el-option label="USD" value="USD" />
                  <el-option label="GBP" value="GBP" />
                  <el-option label="EUR" value="EUR" />
                  <el-option label="JPY" value="JPY" />
                  <el-option label="CAD" value="CAD" />
                  <el-option label="AUD" value="AUD" />
                  <el-option label="MXN" value="MXN" />
                </el-select>
              </el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="showAddStore = false">取消</el-button>
              <el-button type="primary" @click="addStore">添加</el-button>
            </template>
          </el-dialog>
        </el-tab-pane>

        <!-- 主权配置 -->
        <el-tab-pane label="AI 主权配置" name="sovereignty">
          <el-alert title="主权决定 AI 决策的执行权限" description="所有自动操作都会进入审计中心，可一键回滚。错误决策不构成法律责任。" type="info" :closable="false" show-icon />

          <h3 class="section-title">全局默认</h3>
          <el-radio-group v-model="sovereigntyConfig.global" size="default">
            <el-radio-button value="manual">手动（仅给建议）</el-radio-button>
            <el-radio-button value="semi">半自动（一键执行）</el-radio-button>
            <el-radio-button value="auto">全自动（按规则）</el-radio-button>
          </el-radio-group>

          <h3 class="section-title">按模块覆盖</h3>
          <el-table :data="[
            { module: 'M1 Listing', key: 'm1', forced: '强制手动（不可改）' },
            { module: 'M2 利润 / 库存', key: 'm2' },
            { module: 'M3 广告', key: 'm3' },
            { module: 'M4 监控', key: 'm4' },
          ]" border>
            <el-table-column prop="module" label="模块" />
            <el-table-column label="主权">
              <template #default="{ row }">
                <el-radio-group v-if="!row.forced" v-model="sovereigntyConfig[row.key]" size="small">
                  <el-radio-button value="manual">手动</el-radio-button>
                  <el-radio-button value="semi">半自动</el-radio-button>
                  <el-radio-button value="auto">全自动</el-radio-button>
                </el-radio-group>
                <el-tag v-else type="info" size="small">{{ row.forced }}</el-tag>
              </template>
            </el-table-column>
          </el-table>

          <h3 class="section-title">全自动护栏</h3>
          <el-form label-width="180px" label-position="left">
            <el-form-item label="出价变化上限">
              <el-input-number v-model="sovereigntyConfig.bidChangeMaxPct" :min="5" :max="50" :step="5" />
              <span style="margin-left: 8px; color: var(--text-muted)">%</span>
            </el-form-item>
            <el-form-item label="预算上调上限">
              <el-input-number v-model="sovereigntyConfig.budgetIncMaxPct" :min="5" :max="50" :step="5" />
              <span style="margin-left: 8px; color: var(--text-muted)">%</span>
            </el-form-item>
            <el-form-item label="预算下调上限">
              <el-input-number v-model="sovereigntyConfig.budgetDecMaxPct" :min="5" :max="50" :step="5" />
              <span style="margin-left: 8px; color: var(--text-muted)">%</span>
            </el-form-item>
            <el-form-item label="单 SKU 日操作上限">
              <el-input-number v-model="sovereigntyConfig.dailyMaxPerSku" :min="1" :max="50" />
            </el-form-item>
            <el-form-item label="单租户日操作上限">
              <el-input-number v-model="sovereigntyConfig.dailyMaxTotal" :min="10" :max="500" :step="10" />
            </el-form-item>
          </el-form>

          <el-button type="primary" @click="save">保存主权配置</el-button>
        </el-tab-pane>

        <!-- 通知偏好 -->
        <el-tab-pane label="通知偏好" name="notify">
          <h3 class="section-title">通道</h3>
          <div class="channel-row">
            <el-checkbox v-model="notifyConfig.channels.in_app">站内消息</el-checkbox>
            <el-checkbox v-model="notifyConfig.channels.email">邮件</el-checkbox>
            <el-input v-model="notifyConfig.email" size="small" style="width: 240px; margin-left: 8px" />
          </div>
          <div class="channel-row">
            <el-checkbox v-model="notifyConfig.channels.wechat">微信（Phase 2，待绑定）</el-checkbox>
            <el-checkbox v-model="notifyConfig.channels.wecom">企业微信</el-checkbox>
            <el-checkbox v-model="notifyConfig.channels.dingtalk">钉钉</el-checkbox>
          </div>

          <h3 class="section-title">严重度路由</h3>
          <el-form label-width="120px" label-position="left">
            <el-form-item label="P0 紧急">
              <el-select v-model="notifyConfig.p0Channels" multiple style="width: 360px" size="default">
                <el-option label="站内（即时）" value="in_app" />
                <el-option label="邮件（即时）" value="email" />
                <el-option label="微信（即时）" value="wechat" />
              </el-select>
            </el-form-item>
            <el-form-item label="P1 重要">
              <el-select v-model="notifyConfig.p1Channels" multiple style="width: 360px" size="default">
                <el-option label="站内" value="in_app" />
                <el-option label="邮件 (15 分钟聚合)" value="email_aggregated" />
              </el-select>
            </el-form-item>
            <el-form-item label="P2 关注">
              <el-select v-model="notifyConfig.p2Channels" multiple style="width: 360px" size="default">
                <el-option label="站内" value="in_app" />
                <el-option label="邮件 (每日摘要)" value="email_daily" />
              </el-select>
            </el-form-item>
          </el-form>

          <h3 class="section-title">静默时段（不打扰）</h3>
          <el-form label-width="120px" label-position="left">
            <el-form-item label="开始时间">
              <el-time-picker v-model="notifyConfig.quietStart" format="HH:mm" value-format="HH:mm" />
            </el-form-item>
            <el-form-item label="结束时间">
              <el-time-picker v-model="notifyConfig.quietEnd" format="HH:mm" value-format="HH:mm" />
            </el-form-item>
            <el-form-item>
              <el-checkbox v-model="notifyConfig.quietExceptP0">P0 紧急仍可打扰</el-checkbox>
            </el-form-item>
          </el-form>

          <el-button type="primary" @click="save">保存通知配置</el-button>
        </el-tab-pane>

        <!-- 团队权限 -->
        <el-tab-pane label="团队权限" name="team">
          <h3 class="section-title">成员（{{ team.length }} 人）</h3>
          <el-table :data="team" stripe>
            <el-table-column prop="name" label="姓名" width="120" />
            <el-table-column prop="email" label="邮箱" />
            <el-table-column label="角色" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="row.role === 'admin' ? 'danger' : 'primary'">
                  {{ ({ admin: '管理员', operator: '运营', buyer: '采购', finance: '财务', viewer: '只读' })[row.role] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="stores" label="店铺权限" />
            <el-table-column label="操作" width="160">
              <template #default>
                <el-button size="small" link type="primary">编辑</el-button>
                <el-button size="small" link type="danger">移除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button type="primary" :icon="'Plus'" style="margin-top: 12px">邀请成员</el-button>
        </el-tab-pane>

      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.section-title { font-size: 14px; font-weight: 600; color: var(--text); margin: 24px 0 12px; }
.section-title:first-of-type { margin-top: 8px; }
.channel-row { display: flex; align-items: center; gap: 16px; padding: 8px 0; flex-wrap: wrap; }
</style>
