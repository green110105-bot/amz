<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { useLocalStore } from '../composables/useLocalStore';
import { amazonIntegrationsApi } from '../api/integrations';

const localStore = useLocalStore();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const saving = ref('');
const syncing = ref('');
const oauthLoading = ref('');
const revoking = ref('');
const status = ref(null);
const diagnostics = ref(null);
const oauthConfig = ref(null);
const probeResult = ref(null);
const lastResult = ref(null);
// AUTH-03: marketplaceIds the backend discovered, shown as a read-only hint.
const discoveredMarketplaceIds = ref([]);
const activeStep = ref('credentials');
const selectedStoreId = ref('');
const advancedPanels = ref([]);

const spapiForm = ref({
  refreshToken: '',
  sellingPartnerId: '',
  region: 'NA',
  // AUTH-03: no hardcoded US marketplace default. An EU/JP seller would otherwise be
  // silently filled with the US marketplace and pull the wrong site's data. The
  // placeholder still shows ATVPDKIKX0DER as a hint; discovered values back-fill below.
  marketplaceIds: '',
});
const adsForm = ref({
  refreshToken: '',
  profileId: '',
  region: 'NA',
});
const syncForm = ref({
  since: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
  until: '',
  settlementSince: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  settlementUntil: '',
  asins: '',
  profileId: '',
});

const stores = computed(() => localStore.stores || []);
const currentStore = computed(() => localStore.currentStore || null);
const currentStoreId = computed(() => localStore.currentStoreId || currentStore.value?.id || '');
const providers = computed(() => diagnostics.value?.providers || []);
const providerStatusRows = computed(() => status.value?.providers || []);
const spapiDiag = computed(() => providers.value.find((p) => p.provider === 'spapi') || null);
const adsDiag = computed(() => providers.value.find((p) => p.provider === 'ads') || null);
const spapiReadiness = computed(() => spapiDiag.value?.readiness || providerStatusRows.value.find((p) => p.provider === 'spapi')?.status || 'unknown');
const adsReadiness = computed(() => adsDiag.value?.readiness || providerStatusRows.value.find((p) => p.provider === 'ads')?.status || 'unknown');
const m3Impact = computed(() => diagnostics.value?.m3Impact || {});
// AUTH-15(c): when M3 is reading fixtures (ADS_API_MOCK=1 → m3DataMode
// 'ads_mock_fixture'), real Ads sync is meaningless and must be greyed out so
// fixture data is never mistaken for a real sync result.
const adsMockFixture = computed(() => m3Impact.value?.m3DataMode === 'ads_mock_fixture');
// AUTH-07: a single global sync gate. While ANY sync is running, every sync button
// (single + syncAll) is disabled, so the user cannot fire two concurrent syncs from
// different buttons and trigger quota / token races (the backend has no in_progress
// lock yet — that is carry-forward). syncing is a single string ('' when idle).
const syncBusy = computed(() => !!syncing.value);
// AUTH-07(b): the backend already returns a `steps` array from sync/all; surface it
// as a per-step ok/error checklist instead of dropping it on the floor.
const syncSteps = computed(() => {
  const r = lastResult.value?.result;
  return Array.isArray(r?.steps) ? r.steps : [];
});
const savedAdsProfileId = computed(() => providerStatusRows.value.find((p) => p.provider === 'ads')?.profileId || '');
const oauthProviders = computed(() => oauthConfig.value?.providers || {});
const spapiOAuthReady = computed(() => !!oauthProviders.value.spapi?.ready);
const adsOAuthReady = computed(() => !!oauthProviders.value.ads?.ready);

// AUTH-11: candidates surfaced directly from the OAuth callback redirect, so the
// explicit profile-selection path does NOT depend on a second (easily-timed-out)
// live probe.
const adsProfileSelection = ref([]);

const adsProfileCandidates = computed(() => {
  const probeProviders = probeResult.value?.providers || diagnostics.value?.providers || [];
  const ads = probeProviders.find((p) => p.provider === 'ads');
  const checks = ads?.liveProbe?.checks || [];
  const candidates = checks
    .find((c) => c.name === 'ads_profiles_list')
    ?.profileIdCandidates || [];
  // Merge non-probe (callback) candidates with any probe-derived ones.
  return [...new Set([...adsProfileSelection.value, ...candidates].map((v) => String(v)).filter(Boolean))];
});

const envRows = computed(() => {
  const env = diagnostics.value?.environment || {};
  return [
    {
      key: 'CREDENTIAL_ENC_KEY',
      configured: !!env.credentialEncryption?.ready,
      source: env.credentialEncryption?.requiredEnv || 'CREDENTIAL_ENC_KEY',
      desc: '加密保存 refresh token；未就绪时禁止落库真实凭证。',
    },
    {
      key: 'SPAPI_OAUTH_APPLICATION_ID',
      configured: !!oauthProviders.value.spapi?.appIdConfigured,
      source: oauthProviders.value.spapi?.appIdSource || 'SPAPI_OAUTH_APPLICATION_ID',
      desc: 'Seller Central 公共应用 application_id；一键授权 SP-API 必需。',
    },
    {
      key: 'SPAPI_OAUTH_LOGIN_URI',
      configured: !!oauthProviders.value.spapi?.loginUri,
      source: oauthProviders.value.spapi?.loginUri || 'inferred from request origin',
      desc: 'SP-API 公共应用 Login URI；Amazon 授权中转会回到这里再进入 callback。',
    },
    {
      key: 'SPAPI_OAUTH_REDIRECT_URI',
      configured: !!oauthProviders.value.spapi?.redirectUri,
      source: oauthProviders.value.spapi?.redirectUri || 'inferred from request origin',
      desc: 'SP-API OAuth redirect URI；必须在 Seller Central 应用配置中登记。',
    },
    {
      key: 'SPAPI_LWA_CLIENT_ID',
      configured: !!env.spapi?.clientId?.configured,
      source: env.spapi?.clientId?.source || 'SPAPI_LWA_CLIENT_ID',
      desc: 'SP-API LWA 应用 client id。',
    },
    {
      key: 'SPAPI_LWA_CLIENT_SECRET',
      configured: !!env.spapi?.clientSecret?.configured,
      source: env.spapi?.clientSecret?.source || 'SPAPI_LWA_CLIENT_SECRET',
      desc: 'SP-API LWA 应用 client secret。',
    },
    {
      key: 'ADS_OAUTH_REDIRECT_URI',
      configured: !!oauthProviders.value.ads?.redirectUri,
      source: oauthProviders.value.ads?.redirectUri || 'inferred from request origin',
      desc: 'Amazon Ads/LWA redirect URI；必须在 LWA security profile 中登记。',
    },
    {
      key: 'ADS_LWA_CLIENT_ID / ADS_CLIENT_ID',
      configured: !!env.ads?.clientId?.configured,
      source: env.ads?.clientId?.source || 'ADS_LWA_CLIENT_ID',
      desc: 'Amazon Ads LWA 应用 client id；兼容旧变量 ADS_CLIENT_ID。',
    },
    {
      key: 'ADS_LWA_CLIENT_SECRET / ADS_CLIENT_SECRET',
      configured: !!env.ads?.clientSecret?.configured,
      source: env.ads?.clientSecret?.source || 'ADS_LWA_CLIENT_SECRET',
      desc: 'Amazon Ads LWA 应用 client secret；兼容旧变量 ADS_CLIENT_SECRET。',
    },
  ];
});

watch(currentStoreId, (id) => {
  selectedStoreId.value = id || '';
}, { immediate: true });

function splitList(value) {
  return String(value || '')
    .split(/[\s,，;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function toIsoDateStart(day) {
  return day ? `${day}T00:00:00Z` : undefined;
}
function toIsoDateEnd(day) {
  return day ? `${day}T23:59:59Z` : undefined;
}
// AUTH-02(a): exhaustive readiness → tag-type mapping. NO default fall-through to
// 'success'. live_partial and mock_ready are explicitly WARNING (not green), and
// 'active' is no longer treated as ready-green (it only means a credential row
// exists, which can still be半就绪). Anything unknown is neutral 'info'.
function readinessType(value) {
  if (value === 'ready' || value === 'live_ok') return 'success';
  if (['live_partial', 'mock_ready', 'blocked', 'missing', 'needs_attention'].includes(value)) return 'warning';
  if (value === 'live_error' || value === 'revoked') return 'danger';
  return 'info';
}
function formatJson(value) {
  return JSON.stringify(value || {}, null, 2);
}
function maskValue(value) {
  if (!value) return '-';
  const s = String(value);
  return s.length <= 8 ? s : `${s.slice(0, 4)}***${s.slice(-4)}`;
}
function firstProfileFrom(result) {
  const ads = result?.providers?.find((p) => p.provider === 'ads');
  const checks = ads?.liveProbe?.checks || [];
  return checks.find((c) => c.name === 'ads_profiles_list')?.profileIdCandidates?.[0] || '';
}
function applyStatusToForms(nextStatus) {
  const rows = nextStatus?.providers || [];
  const spapi = rows.find((p) => p.provider === 'spapi');
  const ads = rows.find((p) => p.provider === 'ads');
  if (spapi?.region) spapiForm.value.region = spapi.region;
  // AUTH-03: when the backend has discovered real marketplaceIds, unconditionally
  // overwrite the form value. The previous code AND-ed in a "form field still empty"
  // guard that was永假 here (status load happens after the form may已被填), so a
  // discovered EU/JP site never replaced a stale value. discoveredMarketplaceIds
  // drives a read-only "已自动发现站点" hint in the template.
  if (spapi?.marketplaceIds?.length) {
    spapiForm.value.marketplaceIds = spapi.marketplaceIds.join('\n');
    discoveredMarketplaceIds.value = spapi.marketplaceIds.slice();
  }
  if (ads?.region) adsForm.value.region = ads.region;
  if (ads?.profileId && !adsForm.value.profileId) adsForm.value.profileId = String(ads.profileId);
  if (ads?.profileId && !syncForm.value.profileId) syncForm.value.profileId = String(ads.profileId);
}
async function ensureHydrated() {
  if (!localStore.hydrated) await localStore.hydrate?.();
  selectedStoreId.value = currentStoreId.value || '';
}
async function capture(label, fn) {
  try {
    const result = await fn();
    lastResult.value = { label, ok: true, result, at: new Date().toLocaleString('zh-CN', { hour12: false }) };
    return result;
  } catch (e) {
    lastResult.value = { label, ok: false, error: e?.raw || e?.message || String(e), at: new Date().toLocaleString('zh-CN', { hour12: false }) };
    throw e;
  }
}
async function loadStatus() {
  loading.value = true;
  try {
    await ensureHydrated();
    const [st, diag, cfg] = await Promise.all([
      amazonIntegrationsApi.status().catch((e) => ({ error: e.message, providers: [] })),
      amazonIntegrationsApi.diagnostics({ provider: 'all' }).catch((e) => ({ error: e.message, providers: [] })),
      amazonIntegrationsApi.oauthConfig().catch((e) => ({ error: e.message, providers: {} })),
    ]);
    status.value = st;
    diagnostics.value = diag;
    oauthConfig.value = cfg;
    applyStatusToForms(st);
  } finally {
    loading.value = false;
  }
}
async function switchStore(storeId) {
  if (!storeId || storeId === currentStoreId.value) return;
  await localStore.switchStore(storeId);
  selectedStoreId.value = storeId;
  await loadStatus();
}
async function runProbe() {
  loading.value = true;
  try {
    const result = await capture('真实诊断 liveProbe + apiProbe', () => amazonIntegrationsApi.liveDiagnostics({ provider: 'all', liveProbe: true, apiProbe: true }));
    diagnostics.value = result;
    probeResult.value = result;
    const firstProfile = firstProfileFrom(result);
    if (firstProfile && !adsForm.value.profileId) {
      adsForm.value.profileId = String(firstProfile);
      syncForm.value.profileId = String(firstProfile);
    }
    ElMessage.success(firstProfile ? '真实诊断完成，已填入候选 profileId' : '真实诊断完成，请查看结果');
  } finally {
    loading.value = false;
  }
}
async function startOneClick(provider) {
  if (!currentStoreId.value) {
    ElMessage.warning('请先选择要授权的店铺');
    return;
  }
  const cfg = oauthProviders.value?.[provider];
  if (cfg && !cfg.ready) {
    advancedPanels.value = ['advanced'];
    ElMessage.warning(`服务端还缺少 ${cfg.missing?.join(', ') || 'OAuth 配置'}，已展开高级说明`);
    return;
  }
  oauthLoading.value = provider;
  try {
    const result = await capture(`启动 ${provider === 'spapi' ? 'SP-API' : 'Amazon Ads'} 一键授权`, () => amazonIntegrationsApi.startOAuth(provider, {
      region: provider === 'spapi' ? spapiForm.value.region : adsForm.value.region,
      returnTo: '/settings/amazon-auth',
    }));
    if (!result.authorizationUrl) throw new Error('authorization_url_missing');
    window.location.assign(result.authorizationUrl);
  } finally {
    oauthLoading.value = '';
  }
}
// AUTH-13: map the limited callback error enum to readable Chinese guidance.
// Unknown codes fall back to generic copy; the raw LWA message is never echoed
// in the URL (it is only in the server-side audit log).
const OAUTH_ERROR_TEXT = {
  state_expired: '授权链接已过期，请重新发起一键授权。',
  state_used: '该授权链接已被使用过，请重新发起一键授权。',
  code_missing: '亚马逊未返回授权码，请重试授权。',
  lwa_rejected: '亚马逊拒绝了本次授权（可能未同意授权或应用配置有误），请重试或检查应用配置。',
  invalid_oauth_state: '授权校验失败（state 不匹配），请重新发起授权。',
  spapi_login_state_mismatch: '登录跳转校验失败，请重新发起 SP-API 授权。',
};
function oauthErrorText(code) {
  return OAUTH_ERROR_TEXT[code] || '授权失败，请重试；如反复失败请联系管理员检查服务端配置。';
}
async function handleOAuthReturn() {
  const provider = route.query.oauth;
  const statusValue = route.query.status;
  if (!provider || !statusValue) return;
  // AUTH-01: snapshot the query we need, then clear the URL FIRST — before any await.
  // Previously router.replace ran after two awaits, leaving a replay window where a
  // re-mount (or refresh) would re-run the whole return handler and re-fire probes /
  // toasts. Stripping oauth/status/error/storeId/profileSelection/profileCandidates
  // up front makes the second mount a no-op.
  const justAuthed = statusValue === 'success';
  const boundStoreId = route.query.storeId;
  const needsProfileSelection = provider === 'ads' && route.query.profileSelection === 'required';
  const profileCandidates = String(route.query.profileCandidates || '').split(',').map((x) => x.trim()).filter(Boolean);
  const errorCode = route.query.error;
  router.replace({ path: route.path });

  if (justAuthed) {
    // AUTH-10: the callback now carries the storeId the credential was bound to.
    // If the user drifted to a different store on return, switch back before loading
    // status so they don't see an unrelated store's (empty) state.
    if (boundStoreId && currentStoreId.value && String(boundStoreId) !== String(currentStoreId.value)) {
      ElMessage.warning('授权在另一个店铺发起，已自动切回该店铺查看授权结果');
      try { await localStore.switchStore?.(String(boundStoreId)); } catch {}
      selectedStoreId.value = String(boundStoreId);
    }
    // AUTH-14: 授权成功 ≠ 有数据。文案不再承诺"立即可用/自动诊断"，改为提示去同步。
    ElMessage.success(provider === 'spapi'
      ? 'SP-API 授权成功，去下方"同步真实数据"拉取订单/库存后即可在 M2/M3/M4 使用'
      : 'Amazon Ads 授权成功，去下方"同步真实数据"拉取广告结构后即可在 M3 使用');
    // AUTH-01: success branch only refreshes status (GET status+diagnostics+config).
    // It does NOT fire liveProbe/apiProbe — real diagnostics is only triggered by the
    // explicit "真实诊断" buttons. This stops确定性重复探针/重复 toast/重复配额.
    await loadStatus();
    // AUTH-11: when multiple Ads profiles exist the callback returns
    // profileSelection=required + a profileCandidates list. Enter an explicit
    // selection state from那些 candidates WITHOUT firing a second live probe.
    if (needsProfileSelection && profileCandidates.length) {
      adsProfileSelection.value = profileCandidates;
      await nextTick();
      document.querySelector('.profile-card')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  } else {
    advancedPanels.value = ['advanced'];
    ElMessage.error(`Amazon 授权失败：${oauthErrorText(errorCode)}`);
  }
}
// AUTH-12: a manual save must be bound to an explicitly selected store and confirmed
// against that store's name, mirroring startOneClick's currentStoreId guard. Without
// this, credentials could land on an unexpected store.
async function confirmTargetStore(actionLabel) {
  if (!currentStoreId.value) {
    ElMessage.warning('请先选择要授权的店铺');
    return false;
  }
  const name = currentStore.value?.name || currentStoreId.value;
  try {
    await ElMessageBox.confirm(
      `将把 ${actionLabel} 保存到店铺「${name}」，确认目标店铺无误？`,
      '确认目标店铺',
      { type: 'warning', confirmButtonText: '确认保存', cancelButtonText: '取消' },
    );
    return true;
  } catch {
    return false;
  }
}
async function saveSpapi() {
  const marketplaceIds = splitList(spapiForm.value.marketplaceIds);
  if (!spapiForm.value.refreshToken) return ElMessage.warning('请输入 SP-API refresh token');
  if (!marketplaceIds.length) return ElMessage.warning('请至少填写一个 marketplaceId');
  if (!(await confirmTargetStore('SP-API 凭证'))) return;
  saving.value = 'spapi';
  try {
    await capture('保存 SP-API 凭证', () => amazonIntegrationsApi.saveSpApiCredentials({
      refreshToken: spapiForm.value.refreshToken,
      sellingPartnerId: spapiForm.value.sellingPartnerId || undefined,
      region: spapiForm.value.region || 'NA',
      marketplaceIds,
    }));
    spapiForm.value.refreshToken = '';
    ElMessage.success('SP-API 凭证已加密保存');
    await loadStatus();
  } finally {
    saving.value = '';
  }
}
async function saveAds() {
  if (!adsForm.value.refreshToken) return ElMessage.warning('请输入 Ads refresh token');
  if (!(await confirmTargetStore('Amazon Ads 凭证'))) return;
  saving.value = 'ads';
  try {
    await capture('保存 Amazon Ads 凭证', () => amazonIntegrationsApi.saveAdsCredentials({
      refreshToken: adsForm.value.refreshToken,
      profileId: adsForm.value.profileId || undefined,
      region: adsForm.value.region || 'NA',
    }));
    adsForm.value.refreshToken = '';
    ElMessage.success('Ads 凭证已加密保存');
    await loadStatus();
  } finally {
    saving.value = '';
  }
}
async function saveAdsProfile(profileId = adsForm.value.profileId) {
  if (!profileId) return ElMessage.warning('请先选择或填写 Ads profileId');
  saving.value = 'profile';
  try {
    const result = await capture('保存 Ads profileId', () => amazonIntegrationsApi.saveAdsProfile(profileId));
    adsForm.value.profileId = String(result.profileId || profileId);
    syncForm.value.profileId = adsForm.value.profileId;
    ElMessage.success('Ads profileId 已保存');
    await loadStatus();
  } finally {
    saving.value = '';
  }
}
function useCandidate(profileId) {
  adsForm.value.profileId = String(profileId);
  syncForm.value.profileId = String(profileId);
  ElMessage.success(`已选择 profileId ${profileId}`);
}
// AUTH-06: revoke / unbind an authorization. Hard二次确认 because this clears the
// stored refresh token and flips the provider to 'revoked'.
async function revokeAuthorization(provider) {
  const label = provider === 'spapi' ? 'SP-API' : 'Amazon Ads';
  try {
    await ElMessageBox.confirm(
      `确认撤销当前店铺的 ${label} 授权？撤销后将清除已保存的 refresh token，需要重新授权才能继续同步真实数据。`,
      '撤销授权',
      { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' },
    );
  } catch {
    return; // user cancelled
  }
  revoking.value = provider;
  try {
    await capture(`撤销 ${label} 授权`, () => amazonIntegrationsApi.revoke(provider));
    ElMessage.success(`${label} 授权已撤销`);
    await loadStatus();
    await runProbe?.();
  } catch (err) {
    ElMessage.error(`撤销失败：${err?.message || err}`);
  } finally {
    revoking.value = '';
  }
}
async function syncOrders() {
  syncing.value = 'orders';
  try {
    await capture('同步 SP-API Orders', () => amazonIntegrationsApi.syncOrders({
      since: toIsoDateStart(syncForm.value.since),
      until: toIsoDateEnd(syncForm.value.until),
      includeOrderItems: true,
    }));
    ElMessage.success('订单 / GMV 已触发同步');
    await loadStatus();
  } finally { syncing.value = ''; }
}
async function syncSettlement() {
  if (!syncForm.value.settlementSince) return ElMessage.warning('请先选择结算开始日期');
  syncing.value = 'settlement';
  try {
    await capture('同步 SP-API Settlement', () => amazonIntegrationsApi.syncSettlement({
      since: toIsoDateStart(syncForm.value.settlementSince),
      until: toIsoDateEnd(syncForm.value.settlementUntil),
    }));
    ElMessage.success('结算 / 费用已触发同步');
    await loadStatus();
  } finally { syncing.value = ''; }
}
async function syncInventory() {
  syncing.value = 'inventory';
  try {
    await capture('同步 SP-API Inventory', () => amazonIntegrationsApi.syncInventory({ marketplaceIds: splitList(spapiForm.value.marketplaceIds) }));
    ElMessage.success('库存已触发同步');
    await loadStatus();
  } finally { syncing.value = ''; }
}
async function syncCatalog() {
  const asins = splitList(syncForm.value.asins);
  if (!asins.length) return ElMessage.warning('请至少填写一个 ASIN');
  syncing.value = 'catalog';
  try {
    await capture('同步 SP-API Catalog', () => amazonIntegrationsApi.syncCatalog({ asins, marketplaceIds: splitList(spapiForm.value.marketplaceIds) }));
    ElMessage.success('Catalog / Listing 已触发同步');
    await loadStatus();
  } finally { syncing.value = ''; }
}
async function syncAds() {
  const profileId = syncForm.value.profileId || adsForm.value.profileId || savedAdsProfileId.value;
  if (!profileId) return ElMessage.warning('请先选择或保存 Ads profileId');
  syncing.value = 'ads';
  try {
    await capture('同步 Amazon Ads 层级', () => amazonIntegrationsApi.syncAds({ profileId, region: adsForm.value.region || 'NA' }));
    ElMessage.success('Ads 层级已触发同步');
    await loadStatus();
  } finally { syncing.value = ''; }
}
async function syncAll() {
  syncing.value = 'all';
  try {
    await capture('同步全部真实数据', () => amazonIntegrationsApi.syncAll({
      since: toIsoDateStart(syncForm.value.since),
      until: toIsoDateEnd(syncForm.value.until),
      settlementSince: toIsoDateStart(syncForm.value.settlementSince),
      settlementUntil: toIsoDateEnd(syncForm.value.settlementUntil),
      marketplaceIds: splitList(spapiForm.value.marketplaceIds),
      asins: splitList(syncForm.value.asins),
      profileId: syncForm.value.profileId || adsForm.value.profileId || savedAdsProfileId.value,
      region: adsForm.value.region || 'NA',
    }));
    ElMessage.success('全部真实同步已触发，请在结果面板查看每一步');
    await loadStatus();
  } finally { syncing.value = ''; }
}

onMounted(async () => {
  await loadStatus();
  await handleOAuthReturn();
});
</script>

<template>
  <div class="amazon-auth-page">
    <PageHeader
      title="Amazon 授权接入中心"
      subtitle="把 SP-API、Amazon Ads、profileId 发现和真实同步收在一个页面；不用手敲 curl，也不会开启真实写入。"
    >
      <template #extra>
        <el-select v-model="selectedStoreId" class="store-select" placeholder="选择店铺" @change="switchStore">
          <el-option v-for="s in stores" :key="s.id" :label="`${s.name} · ${s.region || '-'}`" :value="s.id" />
        </el-select>
        <el-button :loading="loading" @click="loadStatus">刷新状态</el-button>
        <el-button type="primary" :loading="loading" @click="runProbe">真实诊断</el-button>
      </template>
    </PageHeader>

    <section class="auth-hero">
      <div>
        <p class="eyebrow">Real Amazon Onboarding</p>
        <h2>运营只需要点一键授权，系统自动拿 token、找站点、找 profileId。</h2>
        <p>
          当前店铺：<strong>{{ currentStore?.name || currentStoreId || '未选择店铺' }}</strong>。
          正常流程会跳到 Amazon 官方授权页，用户同意后自动回到系统；下面的 refresh token 表单只作为高级兜底。
        </p>
      </div>
      <div class="hero-status">
        <span>数据模式</span>
        <strong>{{ status?.mode || 'loading' }}</strong>
        <small>M3 真实写入：{{ m3Impact.realWriteEnabled ? '已开启' : '关闭，仍走审计/干跑保护' }}</small>
      </div>
    </section>

    <section class="one-click-grid mt-16">
      <el-card shadow="never" class="one-click-card spapi">
        <p class="eyebrow">Step 1 · Seller Central</p>
        <h3>一键授权 SP-API</h3>
        <p>授权后自动保存 refresh token，并自动发现 marketplaceId，用于订单、GMV、库存、Catalog 和 M4 日报。</p>
        <div class="auth-state-row">
          <el-tag :type="readinessType(spapiReadiness)">{{ spapiReadiness }}</el-tag>
          <span>{{ spapiOAuthReady ? 'OAuth 已配置' : `还缺：${oauthProviders.spapi?.missing?.join(', ') || '服务器配置'}` }}</span>
          <el-tag v-if="oauthProviders.spapi?.sandbox" type="warning" effect="plain">Sandbox</el-tag>
        </div>
        <div class="oauth-card-actions">
          <el-select v-model="spapiForm.region" placeholder="站点区域">
            <el-option label="NA - 北美" value="NA" />
            <el-option label="EU - 欧洲" value="EU" />
            <el-option label="FE - 远东" value="FE" />
          </el-select>
          <el-button type="primary" size="large" :loading="oauthLoading === 'spapi'" @click="startOneClick('spapi')">
            一键授权 SP-API
          </el-button>
        </div>
        <small v-if="!spapiOAuthReady" class="config-hint">点“一键授权”会直接展开缺失配置，不再让运营猜下一步。</small>
      </el-card>

      <el-card shadow="never" class="one-click-card ads">
        <p class="eyebrow">Step 2 · Advertising</p>
        <h3>一键授权 Amazon Ads</h3>
        <p>授权后自动保存 Ads refresh token，并调用 profiles 接口发现 profileId，用于 M3 广告结构和策略建议。</p>
        <div class="auth-state-row">
          <el-tag :type="readinessType(adsReadiness)">{{ adsReadiness }}</el-tag>
          <span>{{ adsOAuthReady ? 'OAuth 已配置' : `还缺：${oauthProviders.ads?.missing?.join(', ') || '服务器配置'}` }}</span>
          <el-tag v-if="oauthProviders.ads?.mock" type="warning" effect="plain">Ads Mock 仍开启</el-tag>
          <el-tag v-if="oauthProviders.ads?.sandbox" type="warning" effect="plain">Sandbox</el-tag>
        </div>
        <div class="oauth-card-actions">
          <el-select v-model="adsForm.region" placeholder="Ads 区域">
            <el-option label="NA - 北美" value="NA" />
            <el-option label="EU - 欧洲" value="EU" />
            <el-option label="FE - 远东" value="FE" />
          </el-select>
          <el-button type="primary" size="large" :loading="oauthLoading === 'ads'" @click="startOneClick('ads')">
            一键授权 Amazon Ads
          </el-button>
        </div>
        <small v-if="!adsOAuthReady" class="config-hint">点“一键授权”会直接展开缺失配置，不再让运营猜下一步。</small>
      </el-card>
    </section>

    <el-card v-if="adsProfileCandidates.length" shadow="never" class="auth-card mt-16 profile-card">
      <template #header>
        <div class="card-head">
          <h3>请选择 Ads profileId</h3>
          <span class="muted">如果账号下有多个广告 profile，系统不会替你乱选。</span>
        </div>
      </template>
      <div class="profile-list">
        <div v-for="pid in adsProfileCandidates" :key="pid" class="profile-chip">
          <span>{{ maskValue(pid) }}</span>
          <el-button size="small" plain @click="useCandidate(pid)">填入</el-button>
          <el-button size="small" type="primary" :loading="saving === 'profile'" @click="saveAdsProfile(pid)">保存</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="auth-card mt-16 quick-sync-card">
      <template #header>
        <div class="card-head">
          <h3>授权完成后，同步真实数据</h3>
          <span class="muted">只读取和落库，不改 Amazon 店铺或广告账户。</span>
        </div>
      </template>
      <!-- AUTH-14: explicit "去同步真实数据" CTA. Authorization alone leaves M2/M3/M4
           empty; the user must run a sync. This does NOT auto-trigger a first sync
           (auto first-sync is carry-forward, gated on syncBusy + backend 409). -->
      <el-alert
        class="go-sync-cta"
        type="success"
        :closable="false"
        show-icon
        title="授权成功，下一步：手动同步真实数据"
        description="授权完成不代表已有数据。点击下方任一同步按钮拉取订单/库存/广告，同步后才能在 M2/M3/M4 看到真实数据。"
      />
      <div class="sync-grid">
        <el-button :loading="syncing === 'orders'" :disabled="syncBusy && syncing !== 'orders'" @click="syncOrders">同步订单 / GMV</el-button>
        <el-button :loading="syncing === 'settlement'" :disabled="syncBusy && syncing !== 'settlement'" @click="syncSettlement">同步结算 / 费用</el-button>
        <el-button :loading="syncing === 'inventory'" :disabled="syncBusy && syncing !== 'inventory'" @click="syncInventory">同步库存</el-button>
        <el-button :loading="syncing === 'ads'" :disabled="adsMockFixture || (syncBusy && syncing !== 'ads')" @click="syncAds">同步 Ads 层级</el-button>
        <el-button type="primary" :loading="syncing === 'all'" :disabled="adsMockFixture || (syncBusy && syncing !== 'all')" @click="syncAll">同步全部真实数据</el-button>
      </div>
      <!-- AUTH-07(b): render the backend's per-step result checklist. -->
      <div v-if="syncSteps.length" class="sync-steps">
        <strong>同步步骤结果</strong>
        <p v-for="step in syncSteps" :key="step.label || step.name" :class="['sync-step', step.status === 'error' ? 'is-error' : 'is-ok']">
          <el-tag size="small" :type="step.status === 'error' ? 'danger' : 'success'">{{ step.status === 'error' ? '失败' : '成功' }}</el-tag>
          <span>{{ step.label || step.name }}</span>
          <small v-if="step.errorCode || step.errorMessage">{{ step.errorCode }} {{ step.errorMessage }}</small>
        </p>
      </div>
      <el-alert
        v-if="adsMockFixture"
        class="mock-fixture-alert"
        type="warning"
        :closable="false"
        show-icon
        title="数据来源: Mock Fixture (ADS_API_MOCK=1)"
        description="Ads 处于 Mock 固件模式，真实同步按钮已置灰。固件数据不会被标记为真实同步结果。"
      />
      <div class="deep-links">
        <router-link to="/m4/reports/daily">查看 M4 日报</router-link>
        <router-link to="/ads">查看 M3 Control Tower</router-link>
        <router-link to="/m2/workbench">查看 M2 经营利润</router-link>
      </div>
    </el-card>

    <section class="flow-strip">
      <div>
        <span>1</span>
        <strong>点授权</strong>
        <small>跳到 Amazon 官方页面同意授权。</small>
      </div>
      <div>
        <span>2</span>
        <strong>自动配置</strong>
        <small>系统自动换取并加密保存 refresh token。</small>
      </div>
      <div>
        <span>3</span>
        <strong>自动发现</strong>
        <small>自动发现站点和 profileId，多 profile 时让用户确认。</small>
      </div>
      <div>
        <span>4</span>
        <!-- AUTH-14: 授权成功 ≠ 有数据，不再无条件承诺"业务可用/读取真实数据"。 -->
        <strong>同步后可用</strong>
        <small>授权完成后还需手动同步，同步后即可在 M2/M3/M4 使用。</small>
      </div>
    </section>

    <el-collapse v-model="advancedPanels" class="advanced-collapse mt-16">
      <el-collapse-item name="advanced">
        <template #title>
          <strong>高级手动接入 / 排障工具</strong>
          <span class="advanced-title-note">只有 OAuth 应用未配置、回调失败或研发排查时才需要打开。</span>
        </template>
    <el-card shadow="never" class="auth-card">
      <el-tabs v-model="activeStep">
        <el-tab-pane label="1. 环境检查" name="environment">
          <el-table :data="envRows" border>
            <el-table-column label="环境项" prop="key" min-width="220" />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.configured ? 'success' : 'danger'">{{ row.configured ? '已配置' : '缺失' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="来源" prop="source" width="210" />
            <el-table-column label="用途" prop="desc" min-width="320" />
          </el-table>
          <el-alert
            class="mt-16"
            type="warning"
            show-icon
            :closable="false"
            title="服务端 LWA client id / secret 缺失时，页面仍可保存 token，但真实诊断和同步会被阻断。"
          />
        </el-tab-pane>

        <el-tab-pane label="2. 保存凭证" name="credentials">
          <el-row :gutter="16">
            <el-col :xs="24" :md="12">
              <el-card shadow="never" class="inner-card">
                <template #header>
                  <div class="card-head">
                    <h3>SP-API 授权</h3>
                    <el-tag :type="readinessType(spapiReadiness)">{{ spapiReadiness }}</el-tag>
                  </div>
                </template>
                <el-form label-position="top">
                  <el-form-item label="SP-API refresh token">
                    <el-input v-model="spapiForm.refreshToken" type="password" show-password placeholder="Atzr|..." autocomplete="off" />
                  </el-form-item>
                  <el-form-item label="sellingPartnerId（可选，但建议填写）">
                    <el-input v-model="spapiForm.sellingPartnerId" placeholder="A1XXXXXXXXXXXX" />
                  </el-form-item>
                  <el-form-item label="Region">
                    <el-select v-model="spapiForm.region" style="width: 100%">
                      <el-option label="NA - 北美" value="NA" />
                      <el-option label="EU - 欧洲" value="EU" />
                      <el-option label="FE - 远东" value="FE" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="Marketplace IDs（逗号、空格、换行都可以）">
                    <el-input v-model="spapiForm.marketplaceIds" type="textarea" :rows="3" placeholder="ATVPDKIKX0DER" />
                    <!-- AUTH-03(c): read-only hint of what the backend auto-discovered. -->
                    <small v-if="discoveredMarketplaceIds.length" class="discovered-hint">
                      已自动发现站点：{{ discoveredMarketplaceIds.join(', ') }}
                    </small>
                  </el-form-item>
                  <el-button type="primary" :loading="saving === 'spapi'" @click="saveSpapi">保存 SP-API 凭证</el-button>
                </el-form>
              </el-card>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-card shadow="never" class="inner-card">
                <template #header>
                  <div class="card-head">
                    <h3>Amazon Ads 授权</h3>
                    <el-tag :type="readinessType(adsReadiness)">{{ adsReadiness }}</el-tag>
                  </div>
                </template>
                <el-form label-position="top">
                  <el-form-item label="Ads refresh token">
                    <el-input v-model="adsForm.refreshToken" type="password" show-password placeholder="Atzr|..." autocomplete="off" />
                  </el-form-item>
                  <el-form-item label="Ads profileId">
                    <el-input v-model="adsForm.profileId" placeholder="可先留空，真实诊断后选择候选 profileId" />
                  </el-form-item>
                  <el-form-item label="Region">
                    <el-select v-model="adsForm.region" style="width: 100%">
                      <el-option label="NA - 北美" value="NA" />
                      <el-option label="EU - 欧洲" value="EU" />
                      <el-option label="FE - 远东" value="FE" />
                    </el-select>
                  </el-form-item>
                  <div class="button-row">
                    <el-button type="primary" :loading="saving === 'ads'" @click="saveAds">保存 Ads 凭证</el-button>
                    <el-button :loading="saving === 'profile'" @click="saveAdsProfile()">单独保存 profileId</el-button>
                  </div>
                </el-form>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="3. 诊断与 profileId" name="diagnostics">
          <div class="diagnostic-toolbar">
            <div>
              <h3>真实诊断</h3>
              <p>点击右上角“真实诊断”会刷新 LWA token，并只调用安全读取接口：SP-API marketplace participations 与 Ads profiles。</p>
            </div>
            <el-button type="primary" :loading="loading" @click="runProbe">运行真实诊断</el-button>
          </div>
          <div class="provider-grid">
            <div v-for="provider in providers" :key="provider.provider" class="provider-card">
              <div class="card-head">
                <h3>{{ provider.provider === 'spapi' ? 'SP-API' : 'Amazon Ads' }}</h3>
                <el-tag :type="readinessType(provider.readiness)">{{ provider.readiness }}</el-tag>
                <!-- AUTH-02(b): when readiness is live_partial render the first blocker
                     inline so 运营 sees WHY it is only partially ready, not just green. -->
                <span v-if="provider.readiness === 'live_partial' && provider.blockers?.length" class="partial-reason">
                  {{ provider.blockers[0] }}
                </span>
                <!-- AUTH-06: revoke / unbind authorization with二次确认. -->
                <el-button
                  v-if="provider.credential?.exists && provider.readiness !== 'revoked'"
                  size="small" type="danger" plain
                  :loading="revoking === provider.provider"
                  @click="revokeAuthorization(provider.provider)"
                >撤销授权</el-button>
              </div>
              <p>
                凭证：{{ provider.credential?.exists ? '已保存' : '未保存' }}；
                最近同步：{{ provider.recentSyncs?.length || 0 }} 次；
                Token：{{ provider.credential?.accessTokenState || 'missing' }}。
              </p>
              <div v-if="provider.blockers?.length" class="pill-list">
                <el-tag v-for="b in provider.blockers" :key="b" type="danger" effect="plain">{{ b }}</el-tag>
              </div>
              <div v-if="provider.warnings?.length" class="pill-list">
                <el-tag v-for="w in provider.warnings" :key="w" type="warning" effect="plain">{{ w }}</el-tag>
              </div>
              <div v-if="provider.nextActions?.length" class="next-actions">
                <strong>下一步</strong>
                <span v-for="a in provider.nextActions" :key="a">{{ a }}</span>
              </div>
              <div v-if="provider.liveProbe?.checks?.length" class="checks">
                <strong>Live checks</strong>
                <p v-for="check in provider.liveProbe.checks" :key="check.name">
                  {{ check.name }}：{{ check.status }}
                  <span v-if="check.recordsIn !== undefined">（{{ check.recordsIn }} 条）</span>
                  <span v-if="check.message"> - {{ check.message }}</span>
                </p>
              </div>
            </div>
          </div>
          <el-card v-if="adsProfileCandidates.length" shadow="never" class="profile-card mt-16">
            <template #header><h3>候选 Ads profileId</h3></template>
            <div class="profile-list">
              <div v-for="pid in adsProfileCandidates" :key="pid" class="profile-chip">
                <span>{{ maskValue(pid) }}</span>
                <el-button size="small" plain @click="useCandidate(pid)">填入</el-button>
                <el-button size="small" type="primary" :loading="saving === 'profile'" @click="saveAdsProfile(pid)">保存</el-button>
              </div>
            </div>
          </el-card>
          <el-empty v-else description="暂无 profileId 候选；请先保存 Ads refresh token，然后运行真实诊断。" />
        </el-tab-pane>

        <el-tab-pane label="4. 同步真实数据" name="sync">
          <el-row :gutter="16">
            <el-col :xs="24" :md="9">
              <el-card shadow="never" class="inner-card">
                <template #header><h3>同步参数</h3></template>
                <el-form label-position="top">
                  <el-form-item label="订单开始日期">
                    <el-date-picker v-model="syncForm.since" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="订单结束日期（可空）">
                    <el-date-picker v-model="syncForm.until" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="结算开始日期（同步结算时必填）">
                    <el-date-picker v-model="syncForm.settlementSince" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="结算结束日期（可空）">
                    <el-date-picker v-model="syncForm.settlementUntil" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="Catalog ASIN（可多行）">
                    <el-input v-model="syncForm.asins" type="textarea" :rows="4" placeholder="B0XXXXXXX1&#10;B0XXXXXXX2" />
                  </el-form-item>
                  <el-form-item label="Ads profileId">
                    <el-input v-model="syncForm.profileId" placeholder="默认使用已保存或已选择的 profileId" />
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
            <el-col :xs="24" :md="15">
              <el-card shadow="never" class="inner-card sync-actions">
                <template #header><h3>同步动作</h3></template>
                <el-alert type="info" show-icon :closable="false" title="这些按钮只做真实读取和落库，不会修改 Amazon 店铺或广告账户。" />
                <div class="sync-grid">
                  <el-button :loading="syncing === 'orders'" :disabled="syncBusy && syncing !== 'orders'" @click="syncOrders">同步订单 / GMV</el-button>
                  <el-button :loading="syncing === 'settlement'" :disabled="syncBusy && syncing !== 'settlement'" @click="syncSettlement">同步结算 / 费用</el-button>
                  <el-button :loading="syncing === 'inventory'" :disabled="syncBusy && syncing !== 'inventory'" @click="syncInventory">同步库存</el-button>
                  <el-button :loading="syncing === 'catalog'" :disabled="syncBusy && syncing !== 'catalog'" @click="syncCatalog">同步 Catalog / Listing</el-button>
                  <el-button :loading="syncing === 'ads'" :disabled="adsMockFixture || (syncBusy && syncing !== 'ads')" @click="syncAds">同步 Ads 层级</el-button>
                  <el-button type="primary" :loading="syncing === 'all'" :disabled="adsMockFixture || (syncBusy && syncing !== 'all')" @click="syncAll">同步全部真实数据</el-button>
                </div>
                <!-- AUTH-07(b): per-step result checklist for the advanced sync panel. -->
                <div v-if="syncSteps.length" class="sync-steps">
                  <strong>同步步骤结果</strong>
                  <p v-for="step in syncSteps" :key="step.label || step.name" :class="['sync-step', step.status === 'error' ? 'is-error' : 'is-ok']">
                    <el-tag size="small" :type="step.status === 'error' ? 'danger' : 'success'">{{ step.status === 'error' ? '失败' : '成功' }}</el-tag>
                    <span>{{ step.label || step.name }}</span>
                    <small v-if="step.errorCode || step.errorMessage">{{ step.errorCode }} {{ step.errorMessage }}</small>
                  </p>
                </div>
                <el-alert
                  v-if="adsMockFixture"
                  class="mock-fixture-alert"
                  type="warning"
                  :closable="false"
                  show-icon
                  title="数据来源: Mock Fixture (ADS_API_MOCK=1)"
                  description="Ads 处于 Mock 固件模式，真实同步按钮已置灰。"
                />
                <div class="impact-box">
                  <strong>M3 接入影响</strong>
                  <span>{{ m3Impact.m3DataMode || '等待诊断' }}</span>
                  <small>{{ m3Impact.reason || '真实写入仍保持关闭，建议先验证数据新鲜度。' }}</small>
                </div>
                <div class="deep-links">
                  <router-link to="/m4/reports/daily">查看 M4 日报</router-link>
                  <router-link to="/ads">查看 M3 Control Tower</router-link>
                  <router-link to="/m2/workbench">查看 M2 经营利润</router-link>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>
      </el-tabs>
    </el-card>
      </el-collapse-item>
    </el-collapse>

    <el-card shadow="never" class="auth-card mt-16">
      <template #header>
        <div class="card-head">
          <h3>当前店铺授权状态</h3>
          <span class="muted">来自 /api/v1/integrations/status 与 diagnostics；不回显 token。</span>
        </div>
      </template>
      <el-table :data="providerStatusRows" border>
        <el-table-column label="Provider" prop="provider" width="120" />
        <el-table-column label="状态" prop="status" width="120" />
        <el-table-column label="sellingPartnerId" width="170">
          <template #default="{ row }">{{ maskValue(row.sellingPartnerId) }}</template>
        </el-table-column>
        <el-table-column label="profileId" width="150">
          <template #default="{ row }">{{ maskValue(row.profileId) }}</template>
        </el-table-column>
        <el-table-column label="Region" prop="region" width="100" />
        <el-table-column label="Marketplace" min-width="180">
          <template #default="{ row }">{{ row.marketplaceIds?.join(', ') || '-' }}</template>
        </el-table-column>
        <el-table-column label="Last Error" prop="lastError" min-width="260" />
      </el-table>
    </el-card>

    <el-card shadow="never" class="auth-card mt-16 result-card">
      <template #header>
        <div class="card-head">
          <h3>最近执行结果</h3>
          <span class="muted">{{ lastResult?.at || '尚未执行' }}</span>
        </div>
      </template>
      <pre>{{ formatJson(lastResult || { hint: '保存凭证、运行真实诊断或同步后，这里会展示完整返回，便于排查。' }) }}</pre>
    </el-card>
  </div>
</template>

<style scoped>
.amazon-auth-page {
  max-width: 1480px;
  margin: 0 auto;
  --auth-ink: #17231d;
  --auth-green: #2f6b4f;
  --auth-blue: #2b5c8a;
  --auth-amber: #b36c1f;
}
.mt-16 { margin-top: 16px; }
.store-select { width: 240px; }
.auth-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 18px;
  padding: 28px;
  border-radius: 28px;
  border: 1px solid rgba(47, 107, 79, .15);
  background:
    radial-gradient(circle at 90% 8%, rgba(43, 92, 138, .2), transparent 34%),
    linear-gradient(135deg, #eff7ed 0%, #f8f0df 52%, #eaf2f7 100%);
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--auth-green);
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.auth-hero h2 {
  margin: 0;
  color: var(--auth-ink);
  font-size: 28px;
  line-height: 1.2;
  letter-spacing: -0.03em;
}
.auth-hero p { margin: 12px 0 0; color: #5d6960; line-height: 1.7; }
.hero-status {
  display: grid;
  align-content: center;
  padding: 18px;
  border-radius: 20px;
  background: rgba(255,255,255,.74);
  border: 1px solid rgba(47,107,79,.14);
}
.hero-status span,
.hero-status small,
.muted { color: var(--text-muted); }
.hero-status strong { margin: 8px 0; font-size: 26px; color: var(--auth-ink); }
.one-click-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.one-click-card {
  border-radius: 24px;
  border: 1px solid rgba(23, 35, 29, .1);
  background: #fffefa;
}
.one-click-card :deep(.el-card__body) {
  display: grid;
  gap: 14px;
  min-height: 245px;
}
.one-click-card h3 {
  margin: 0;
  font-size: 24px;
  color: var(--auth-ink);
  letter-spacing: -0.03em;
}
.one-click-card p:not(.eyebrow) {
  margin: 0;
  color: #5d6960;
  line-height: 1.7;
}
.one-click-card.spapi {
  background: radial-gradient(circle at 90% 10%, rgba(47, 107, 79, .16), transparent 30%), #fffefa;
}
.one-click-card.ads {
  background: radial-gradient(circle at 90% 10%, rgba(43, 92, 138, .16), transparent 30%), #fbfdff;
}
.auth-state-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: #66736b;
  font-size: 13px;
}
.oauth-card-actions {
  display: grid;
  grid-template-columns: 180px minmax(180px, 1fr);
  gap: 10px;
  align-items: center;
}
.config-hint {
  color: var(--auth-amber);
  font-weight: 700;
}
.quick-sync-card :deep(.el-card__body) { padding-top: 12px; }
.go-sync-cta { margin-bottom: 12px; }
.discovered-hint { display: block; margin-top: 6px; color: var(--auth-green); font-weight: 700; font-size: 12px; }
.sync-steps { margin-top: 14px; display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: #f5faf6; }
.sync-steps strong { color: var(--auth-ink); }
.sync-step { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #425149; }
.sync-step small { color: #b91c1c; }
.sync-step.is-ok small { color: #5d6960; }
.advanced-collapse {
  border: 0;
  border-radius: 20px;
  overflow: hidden;
}
.advanced-collapse :deep(.el-collapse-item__header) {
  min-height: 56px;
  padding: 0 18px;
  border: 1px solid rgba(23,35,29,.1);
  border-radius: 18px;
  background: #fff;
}
.advanced-collapse :deep(.el-collapse-item__wrap) {
  border: 0;
  background: transparent;
}
.advanced-title-note {
  margin-left: 12px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 400;
}
.flow-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.flow-strip div {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  background: #fffdf8;
  border: 1px solid rgba(23, 35, 29, .1);
}
.flow-strip span {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #e8f3e8;
  color: var(--auth-green);
  font-weight: 900;
}
.flow-strip strong { color: var(--auth-ink); }
.flow-strip small { color: #69756c; line-height: 1.5; }
.auth-card,
.inner-card { border-radius: 20px; border-color: rgba(23, 35, 29, .12); }
.card-head,
.diagnostic-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.card-head h3,
.profile-card h3,
.diagnostic-toolbar h3 { margin: 0; font-size: 16px; }
.diagnostic-toolbar p { margin: 6px 0 0; color: #5d6960; }
.button-row,
.sync-grid,
.profile-list,
.deep-links,
.pill-list { display: flex; flex-wrap: wrap; gap: 10px; }
.provider-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
.provider-card { padding: 16px; border: 1px solid rgba(23,35,29,.1); border-radius: 18px; background: #fffdf8; }
.provider-card p { margin: 10px 0; color: #5d6960; }
.next-actions,
.checks { margin-top: 12px; padding: 12px; border-radius: 14px; background: #f5faf6; color: #425149; }
.next-actions { display: grid; gap: 6px; }
.next-actions span { font-size: 12px; color: #5d6960; }
.checks p { margin: 6px 0 0; font-size: 12px; }
.profile-list { align-items: center; }
.profile-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 999px; background: #f5faf6; border: 1px solid rgba(47, 107, 79, .14); }
.profile-chip span { font-weight: 800; color: var(--auth-ink); }
.sync-actions { min-height: 100%; }
.sync-grid { margin-top: 16px; }
.impact-box { display: grid; gap: 6px; margin-top: 18px; padding: 14px; border-radius: 16px; background: #f6f1e6; color: #67543a; }
.impact-box strong { color: var(--auth-amber); }
.impact-box small { line-height: 1.5; }
.deep-links { margin-top: 18px; }
.deep-links a { padding: 8px 12px; border-radius: 999px; background: #eef5ea; color: var(--auth-green); text-decoration: none; font-weight: 800; font-size: 13px; }
.result-card pre { max-height: 420px; overflow: auto; padding: 14px; border-radius: 14px; background: #101815; color: #d6f0df; white-space: pre-wrap; font-size: 12px; line-height: 1.55; }
@media (max-width: 900px) {
  .auth-hero,
  .provider-grid,
  .one-click-grid,
  .flow-strip { grid-template-columns: 1fr; }
  .auth-hero h2 { font-size: 22px; }
  .oauth-card-actions { grid-template-columns: 1fr; }
  .card-head,
  .diagnostic-toolbar { align-items: flex-start; flex-direction: column; }
  .store-select { width: 100%; }
}
</style>
