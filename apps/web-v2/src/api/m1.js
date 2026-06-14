import { http } from './client';

const BASE = '/api/v1/store/m1';
const DEMO_NOW = '2026-05-25T12:00:00.000+08:00';

function unwrap(r) {
  return r.data?.items ?? r.data ?? [];
}

function toCamel(s) {
  return String(s || '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function pick(obj, key, fallback = '') {
  if (!obj) return fallback;
  return obj[key] ?? obj[toCamel(key)] ?? fallback;
}

function stableHash(input) {
  let h = 2166136261;
  const s = String(input || 'm1-workbench');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededChoice(seed, items) {
  if (!items.length) return '';
  return items[stableHash(seed) % items.length];
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((x) => x !== null && x !== undefined && String(x).trim() !== '');
  if (typeof value === 'string') {
    return value.split(/[,，;；\n\r]+/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function readText(version, key) {
  return pick(version, key, '');
}

function imageUrl(image) {
  return image?.generated_url || image?.generatedUrl || image?.ref_image_url || image?.refImageUrl || image?.url || '';
}

function normalizedSlot(slot) {
  const raw = String(slot || '').toLowerCase();
  if (!raw) return '';
  if (raw === 'main' || raw === 'main_image') return 'MAIN';
  const m = raw.match(/(?:side_|pt)(\d+)/i);
  if (m) return `PT${String(Number(m[1])).padStart(2, '0')}`;
  return raw.toUpperCase();
}

function apiSlot(slot) {
  const upper = normalizedSlot(slot);
  return upper === 'MAIN' ? 'main' : upper.toLowerCase();
}

function imageBySlot(images, slot) {
  const wanted = normalizedSlot(slot);
  return (images || []).find((img) => normalizedSlot(img.slot) === wanted) || null;
}

function unique(items) {
  return [...new Set((items || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function metric(key, value, max, min = 0, keywords = []) {
  const text = String(value || '');
  const lower = text.toLowerCase();
  const risky = ['best', '#1', 'guaranteed', 'cure', 'medical', 'permanent', 'lifetime', '100%'].filter((w) => lower.includes(w));
  const covered = unique(keywords).filter((kw) => lower.includes(String(kw).toLowerCase())).length;
  const coverage = keywords.length ? Math.round((covered / keywords.length) * 100) : 0;
  return {
    key,
    length: text.length,
    max,
    min,
    coverage,
    risks: risky,
    badges: [
      text.length > max ? '超长' : text.length < min ? '偏短' : '长度合格',
      coverage >= 35 ? '覆盖充分' : coverage >= 15 ? '覆盖一般' : '覆盖不足',
      risky.length ? '需合规复核' : '低风险',
    ],
  };
}

const GALLERY_SPEC = [
  { slot: 'MAIN', role: '主图白底', amazonRole: 'Main Image', intent: '先拿到点击', requirement: '纯白背景、主体占画面约 85%、无角标水印、不可出现竞品商标。' },
  { slot: 'PT01', role: '核心卖点图', amazonRole: 'PT01', intent: '3 秒说明为什么买', requirement: '把最强利益点做成手机端可读的一屏，不堆字。' },
  { slot: 'PT02', role: '场景生活图', amazonRole: 'PT02', intent: '让买家代入使用场景', requirement: '真实人群/场景/比例，避免夸张承诺。' },
  { slot: 'PT03', role: '功能拆解图', amazonRole: 'PT03', intent: '解释功能与结构', requirement: '最多 3 个 callout，和五点描述逐项对应。' },
  { slot: 'PT04', role: '尺寸/兼容图', amazonRole: 'PT04', intent: '降低误购和退货', requirement: '型号、尺寸、适配范围必须清楚，避免泛化。' },
  { slot: 'PT05', role: '材质细节图', amazonRole: 'PT05', intent: '支撑价格与质感', requirement: '展示材质、工艺、边缘、接口、包装细节。' },
  { slot: 'PT06', role: '对比/选择图', amazonRole: 'PT06', intent: '帮买家快速决策', requirement: '自有型号/规格对比，不贬低竞品、不抄竞品素材。' },
  { slot: 'PT07', role: '安装/开箱图', amazonRole: 'PT07', intent: '降低上手焦虑', requirement: '3-4 步流程、配件清单、注意事项。' },
  { slot: 'PT08', role: '信任/FAQ 图', amazonRole: 'PT08', intent: '回答最后阻碍', requirement: '售后、保养、常见疑问、品牌承诺必须可兑现。' },
];

const CHECK_LABELS = {
  ownership: ['账号归属', '运营'],
  version: ['版本存在', '运营'],
  title: ['标题长度与结构', '文案'],
  bullets: ['五点完整', '文案'],
  description: ['描述完整', '文案'],
  searchTerms: ['搜索词准备', 'SEO'],
  imageMatrix: ['MAIN + PT01-PT08 图片矩阵', '设计'],
  aPlus: ['A+ 内容准备', '设计'],
  variationAttributes: ['变体/类目属性', '运营'],
  compliance: ['合规风险复核', 'QA'],
  keywordCoverage: ['关键词覆盖', 'SEO'],
};

export const targetsApi = {
  list: (params = {}) => http.get(`${BASE}/targets`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/targets/${id}`).then((r) => r.data),
  create: (body) => http.post(`${BASE}/targets`, body).then((r) => r.data),
  update: (id, patch) => http.put(`${BASE}/targets/${id}`, patch).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/targets/${id}`).then((r) => r.data),
};

export const researchApi = {
  trigger: (body) => http.post(`${BASE}/research/trigger`, body).then((r) => r.data),
  get: (targetId) => http.get(`${BASE}/research/${targetId}`).then((r) => r.data),
  clearCache: (targetId) => http.delete(`${BASE}/research/${targetId}/cache`).then((r) => r.data),
};

export const scoresApi = {
  trigger: (body) => http.post(`${BASE}/scores/trigger`, body).then((r) => r.data),
  get: (targetId) => http.get(`${BASE}/scores/${targetId}`).then((r) => r.data),
};

export const runsApi = {
  create: (body) => http.post(`${BASE}/runs`, body).then((r) => r.data),
  list: (params = {}) => http.get(`${BASE}/runs`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/runs/${id}`).then((r) => r.data),
  rewriteField: (id, body) => http.post(`${BASE}/runs/${id}/rewrite-field`, body).then((r) => r.data),
};

export const versionsApi = {
  list: (params = {}) => http.get(`${BASE}/versions`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/versions/${id}`).then((r) => r.data),
  pin: (id, pinned) => http.post(`${BASE}/versions/${id}/pin`, { pinned }).then((r) => r.data),
  remove: (id) => http.delete(`${BASE}/versions/${id}`).then((r) => r.data),
  diff: (versionAId, versionBId) =>
    http.post(`${BASE}/versions/diff`, { versionAId, versionBId }).then((r) => r.data),
  combinedPick: (targetId, fieldPicks) =>
    http.post(`${BASE}/versions/combined-pick`, { targetId, fieldPicks }).then((r) => r.data),
};

export const imagesApi = {
  generate: (body) => http.post(`${BASE}/images/generate`, body).then((r) => r.data),
  list: (params = {}) => http.get(`${BASE}/images`, { params }).then(unwrap),
  regenerate: (id, body = {}) =>
    http.post(`${BASE}/images/${id}/regenerate`, body).then((r) => r.data),
};

export const workbenchApi = {
  get: (targetId, params = {}) => http.get(`${BASE}/workbench/${targetId}`, { params }).then((r) => r.data),
  readiness: (body) => http.post(`${BASE}/readiness/check`, body).then((r) => r.data),
  assets: (params = {}) => http.get(`${BASE}/assets/matrix`, { params }).then((r) => r.data),
  keywords: (params = {}) => http.get(`${BASE}/keywords/coverage`, { params }).then((r) => r.data),
  compliance: (targetId, params = {}) => http.get(`${BASE}/compliance/${targetId}`, { params }).then((r) => r.data),
};

export const abApi = {
  create: (body) => http.post(`${BASE}/ab`, body).then((r) => r.data),
  list: (params = {}) => http.get(`${BASE}/ab`, { params }).then(unwrap),
  get: (id) => http.get(`${BASE}/ab/${id}`).then((r) => r.data),
  start: (id) => http.post(`${BASE}/ab/${id}/start`).then((r) => r.data),
  abort: (id) => http.post(`${BASE}/ab/${id}/abort`).then((r) => r.data),
  metrics: (id) => http.get(`${BASE}/ab/${id}/metrics`).then((r) => r.data),
  finalize: (id) => http.post(`${BASE}/ab/${id}/finalize`).then((r) => r.data),
  adoptWinner: (id) => http.post(`${BASE}/ab/${id}/adopt-winner`).then((r) => r.data),
};

export function buildMockTargetList() {
  const createdAt = DEMO_NOW;
  return [
    {
      id: 'mock-m1t-case-war-room',
      mode: 'existing',
      product_id: 'CASE-001',
      asin: 'B0MOCKCASE',
      asin_kind: 'own',
      asinKind: 'own',
      status: 'in_progress',
      created_at: createdAt,
      competitor_pool: ['B0COMPCASE', 'B0RIVALCASE'],
      sourceMeta: { source: 'deterministic_mock', confidence: 0.74, reason: 'M1 targets API 不可用时的确定性样例。' },
    },
    {
      id: 'mock-m1t-cable-audit',
      mode: 'existing',
      product_id: 'CABLE-002',
      asin: 'B0MOCKCABLE',
      asin_kind: 'own',
      asinKind: 'own',
      status: 'draft',
      created_at: createdAt,
      competitor_pool: ['B0COMPCABLE'],
      sourceMeta: { source: 'deterministic_mock', confidence: 0.71, reason: 'M1 targets API 不可用时的确定性样例。' },
    },
  ];
}

function normalizeBackendGallery(apiWorkbench) {
  const slots = apiWorkbench?.assets?.gallerySlots || [];
  return GALLERY_SPEC.map((spec) => {
    const backend = slots.find((s) => normalizedSlot(s.slot) === spec.slot) || {};
    const ready = backend.status === 'ready' || backend.status === 'completed';
    return {
      ...spec,
      imageId: backend.assetId || backend.imageId || null,
      url: backend.url || '',
      prompt: backend.prompt || `${spec.role}: ${spec.requirement}`,
      status: ready ? 'ready' : (backend.status || 'missing'),
      source: backend.source || apiWorkbench?.source || 'api',
      confidence: backend.confidence || apiWorkbench?.confidence || 0.8,
      requirements: backend.requirements || [spec.requirement],
    };
  });
}

function normalizeBackendKeywords(apiWorkbench, copyText) {
  const kw = apiWorkbench?.keywords || {};
  const primary = (kw.primary || []).map((item, index) => {
    const term = item.term || item.keyword || String(item);
    return {
      keyword: term,
      intent: index < 3 ? '核心成交词' : '长尾补充词',
      placement: item.fieldHint || (item.present ? 'listing_copy' : 'gap'),
      covered: !!(item.present ?? item.covered ?? String(copyText || '').toLowerCase().includes(String(term).toLowerCase())),
      coverageText: item.present ? `出现 ${item.occurrences || 1} 次` : '缺口',
      priority: index < 3 ? 'P0' : 'P1',
      action: item.present ? '保留自然出现，避免堆砌。' : '补入标题、五点或后台搜索词。',
    };
  });
  const gaps = (kw.competitorGap || []).map((item, index) => ({
    keyword: item.term || item.keyword,
    intent: '竞品缺口',
    placement: item.covered ? 'listing_copy' : 'gap',
    covered: !!item.covered,
    coverageText: item.covered ? '已覆盖' : '竞品常见但本版本缺失',
    priority: index < 2 ? 'P1' : 'P2',
    action: item.covered ? '继续观察转化。' : '评估是否加入卖点图、FAQ 或搜索词。',
  }));
  const rows = unique(primary.map((r) => r.keyword)).length ? primary.concat(gaps) : [];
  const total = kw.summary?.total || primary.length || rows.length;
  const covered = kw.summary?.covered ?? primary.filter((r) => r.covered).length;
  const percent = total ? Math.round((kw.summary?.primaryCoverageRate ?? (covered / total)) * 100) : 0;
  return {
    rows,
    summary: { total, covered, percent, status: kw.summary?.status || (percent >= 70 ? 'pass' : 'blocked') },
    primary: rows.filter((r) => r.priority === 'P0').map((r) => r.keyword).slice(0, 4),
    secondary: rows.filter((r) => r.priority !== 'P0').map((r) => r.keyword).slice(0, 8),
    repeatedStuffing: kw.repeatedStuffing || [],
    negativeConflicts: kw.negativeConflicts || [],
  };
}

function normalizeBackendPreflight(readiness) {
  const checks = readiness?.checks || {};
  return Object.entries(checks).map(([key, check]) => {
    const [label, owner] = CHECK_LABELS[key] || [key, '运营'];
    return {
      key,
      label,
      owner,
      passed: check.status === 'pass',
      status: check.status,
      code: check.code,
      detail: check.length ? `长度 ${check.length}` : check.count ? `数量 ${check.count}` : check.code || '',
    };
  });
}

function normalizeBackendCompliance(apiWorkbench) {
  const risks = apiWorkbench?.compliance?.risks || [];
  return risks.map((risk, index) => ({
    id: `${risk.code || 'risk'}-${index}`,
    severity: risk.severity || 'medium',
    field: risk.field || 'listing',
    issue: `${risk.code || '规则风险'}${risk.evidence ? `：${risk.evidence}` : ''}`,
    fix: risk.guidance || '发布前由运营复核并改写为可证明、可兑现的表达。',
    status: risk.severity === 'high' ? 'open' : 'review',
    code: risk.code,
  }));
}

function normalizeApiWorkbench(apiWorkbench) {
  if (!apiWorkbench) return null;
  if (apiWorkbench.productProfile || apiWorkbench.gallerySlots) {
    return {
      ...apiWorkbench,
      sourceMeta: apiWorkbench.sourceMeta || {
        source: apiWorkbench.source || 'api',
        confidence: apiWorkbench.confidence || 0.9,
        mock: !!apiWorkbench.mock,
        generatedAt: DEMO_NOW,
        reason: '来自 M1 workbench API。',
      },
    };
  }

  const target = apiWorkbench.target || {};
  const version = apiWorkbench.version || {};
  const variation = apiWorkbench.variation || {};
  const child = variation.children?.[0] || {};
  const attrs = child.attributes || {};
  const sourceMeta = {
    source: apiWorkbench.source || 'api',
    confidence: apiWorkbench.confidence || 0.84,
    mock: !!apiWorkbench.mock,
    generatedAt: DEMO_NOW,
    reason: apiWorkbench.mock ? '当前为可替换真实 Amazon 数据的 mock-gated workbench。' : '来自真实 API 聚合。',
  };
  const keywordsFromTarget = asArray(target.new_target_keywords || target.newTargetKeywords);
  const backendSearchTerms = keywordsFromTarget.join(' ');
  const copy = {
    title: version.title || attrs.item_name || target.new_category || target.asin || '',
    bullets: [1, 2, 3, 4, 5].map((n) => version[`bullet_${n}`] || '').filter(Boolean),
    description: version.description || '',
    backendSearchTerms,
  };
  while (copy.bullets.length < 5) copy.bullets.push('');
  const copyText = [copy.title, ...copy.bullets, copy.description, backendSearchTerms].join(' ');
  const keywords = normalizeBackendKeywords(apiWorkbench, copyText);
  const gallerySlots = normalizeBackendGallery(apiWorkbench);
  const aPlusModules = apiWorkbench.assets?.aPlus?.modules || [];
  const complianceRisks = normalizeBackendCompliance(apiWorkbench);
  const preflight = normalizeBackendPreflight(apiWorkbench.readiness);

  return {
    sourceMeta,
    productProfile: {
      targetId: target.id,
      sku: target.product_id || child.sku || target.id,
      asin: target.asin || child.asin || 'PENDING-ASIN',
      mode: target.mode || 'existing',
      status: target.status || 'draft',
      category: target.new_category || attrs.item_type_keyword || variation.variationTheme || '未识别类目',
      priceBand: target.new_price_band || target.newPriceBand || '-',
      targetAudience: target.new_target_audience || target.newTargetAudience || '待补充目标人群',
      brandPositioning: target.new_brand_positioning || target.newBrandPositioning || attrs.brand || '待补充品牌定位',
      physicalSpecs: target.new_physical_specs || target.newPhysicalSpecs || attrs,
      competitorPool: asArray(target.competitor_pool || target.competitorPool),
      readOnly: target.is_competitor_only || target.isCompetitorOnly || target.asin_kind === 'external',
    },
    variants: (variation.children || []).map((v, index) => ({
      id: v.sku || `${target.id}-child-${index}`,
      label: [v.attributes?.color_name, v.attributes?.size_name].filter(Boolean).join(' / ') || (index === 0 ? '当前子体' : `子体 ${index + 1}`),
      sku: v.sku || '-',
      asin: v.asin || '-',
      price: v.attributes?.price || '-',
      status: variation.missingAttributes?.length ? 'needs_attribute' : 'active',
      attributes: Object.entries(v.attributes || {}).filter(([, val]) => val).map(([key, val]) => `${key}: ${val}`),
    })),
    keywords,
    copy,
    copyMetrics: {
      title: metric('title', copy.title, 200, 80, keywords.rows.map((r) => r.keyword)),
      bullets: copy.bullets.map((b, i) => metric(`bullet_${i + 1}`, b, 500, 80, keywords.rows.map((r) => r.keyword))),
      description: metric('description', copy.description, 2000, 200, keywords.rows.map((r) => r.keyword)),
      backendSearchTerms: metric('backend_search_terms', backendSearchTerms, 249, 80, keywords.rows.map((r) => r.keyword)),
    },
    gallerySlots,
    aPlus: {
      modules: aPlusModules.length ? aPlusModules.map((m, i) => ({
        id: m.id || `aplus-${i + 1}`,
        type: m.type || m.moduleType || 'Standard Module',
        title: m.title || m.headline || `A+ 模块 ${i + 1}`,
        status: m.status || apiWorkbench.assets?.aPlus?.status || 'draft',
        brief: m.brief || m.description || m.headline || '根据 Gallery 和卖点继续完善。',
      })) : defaultAPlusModules(),
      video: apiWorkbench.assets?.video || { status: 'placeholder', brief: '15-30 秒短视频：痛点 -> 使用 -> 证据 -> 品牌承诺。' },
      view360: apiWorkbench.assets?.threeSixty || { status: 'placeholder', brief: '适合有结构/外观差异的 SKU，作为可选增强。' },
    },
    complianceRisks,
    preflight,
    readiness: apiWorkbench.readiness,
    raw: apiWorkbench,
    scoreSnapshot: { total: null, topGap: apiWorkbench.readiness?.blockers?.[0]?.code || '待完成发布前检查' },
  };
}

function defaultAPlusModules() {
  return [
    { id: 'brand-story', type: 'Brand Story', title: '品牌故事', status: 'draft', brief: '1 屏解释品牌定位、使用场景和可信承诺。' },
    { id: 'benefit-grid', type: 'Four Image Text', title: '核心利益矩阵', status: 'draft', brief: '把 PT01-PT04 的卖点扩展成图文模块。' },
    { id: 'comparison', type: 'Comparison Chart', title: '规格/型号对比', status: 'needs_data', brief: '对比自有型号、适配范围和选择建议。' },
  ];
}

export function buildM1Workbench({ targetId, target, research, score, versions = [], images = [], apiWorkbench = null } = {}) {
  const normalized = normalizeApiWorkbench(apiWorkbench);
  if (normalized) return normalized;

  const id = target?.id || targetId || 'mock-m1t-workbench';
  const seed = stableHash(id);
  const latest = versions?.[0] || null;
  const targetKeywords = asArray(target?.new_target_keywords || target?.newTargetKeywords);
  const reviewKeywords = parseJson(research?.review_keywords || research?.reviewKeywords, {}) || {};
  const researchKeywords = asArray(reviewKeywords.theme).concat(asArray(reviewKeywords.action));
  const fallbackKeywords = ['phone case', 'magsafe case', 'shockproof case', 'slim case', 'wireless charging case', 'drop protection'];
  const keywordsRaw = unique([...targetKeywords, ...researchKeywords, ...fallbackKeywords]).slice(0, 12);
  const title = readText(latest, 'title') || (target?.new_category
    ? `${target.new_category} High-Converting Amazon Listing Draft`
    : `${target?.product_id || target?.asin || 'M1 Product'} Amazon Listing Optimization Draft`);
  const bullets = [1, 2, 3, 4, 5].map((n) => readText(latest, `bullet_${n}`) || [
    'Built for daily operations with clear benefit-first messaging.',
    'Designed around top competitor patterns and customer objections.',
    'Supports mobile-first shoppers with scannable proof points.',
    'Prepared for image, A+ and video creative handoff.',
    'Backed by preflight checks before any Amazon write action.',
  ][n - 1]);
  const description = readText(latest, 'description') || `Listing workbench draft for ${target?.product_id || target?.asin || target?.new_category || 'selected product'}. Use this copy as an editable operating plan before publish.`;
  const backendSearchTerms = keywordsRaw.slice(0, 8).join(' ');
  const allCopy = [title, ...bullets, description, backendSearchTerms].join(' ').toLowerCase();
  const coveredKeywords = keywordsRaw.filter((kw) => allCopy.includes(String(kw).toLowerCase()));
  const category = target?.new_category || research?.category || seededChoice(seed, ['Phone Case / Mobile Accessories', 'Home Storage', 'Kitchen Tooling']);
  const confidence = images?.length || latest || research || score ? 0.78 : 0.64;

  const gallerySlots = GALLERY_SPEC.map((spec, index) => {
    const img = imageBySlot(images, spec.slot);
    return {
      ...spec,
      imageId: img?.id || null,
      url: imageUrl(img),
      prompt: img?.prompt || `${spec.role} for ${target?.product_id || target?.asin || category}: ${spec.requirement}`,
      status: img ? (img.status === 'completed' ? 'ready' : img.status || 'ready') : (index <= 4 ? 'planned' : 'missing'),
      // X-P1-01: a slot with no image is "not yet generated", not provably mock —
      // default to 'unknown' instead of poison-defaulting to deterministic_mock.
      source: img ? 'api_image' : 'unknown',
      confidence: img ? 0.86 : 0.62,
    };
  });

  const aPlusFromVersion = parseJson(latest?.a_plus_modules || latest?.aPlusModules, []);
  const aPlusModules = (Array.isArray(aPlusFromVersion) && aPlusFromVersion.length ? aPlusFromVersion : defaultAPlusModules()).map((m, i) => ({
    id: m.id || `aplus-${i + 1}`,
    type: m.type || m.moduleType || 'Standard Image Text',
    title: m.title || m.headline || `A+ 模块 ${i + 1}`,
    status: m.status || 'draft',
    brief: m.brief || m.description || '围绕卖点、证据和 FAQ 补充模块内容。',
  }));

  const keywordRows = keywordsRaw.map((kw, index) => {
    const lower = String(kw).toLowerCase();
    const inTitle = title.toLowerCase().includes(lower);
    const inBullets = bullets.join(' ').toLowerCase().includes(lower);
    const inBackend = backendSearchTerms.toLowerCase().includes(lower);
    return {
      keyword: kw,
      intent: index < 3 ? '核心成交词' : index < 7 ? '长尾/场景词' : '补充词',
      placement: inTitle ? 'title' : inBullets ? 'bullets' : inBackend ? 'backend' : 'gap',
      covered: inTitle || inBullets || inBackend,
      coverageText: [inTitle && '标题', inBullets && '五点', inBackend && '后台词'].filter(Boolean).join(' / ') || '缺口',
      priority: index < 3 ? 'P0' : index < 7 ? 'P1' : 'P2',
      action: inTitle || inBullets || inBackend ? '保持自然覆盖，避免堆砌。' : '补入五点、FAQ 或后台搜索词。',
    };
  });

  const copyKeywords = keywordRows.map((r) => r.keyword);
  const copyMetrics = {
    title: metric('title', title, 200, 80, copyKeywords),
    bullets: bullets.map((b, i) => metric(`bullet_${i + 1}`, b, 500, 80, copyKeywords)),
    description: metric('description', description, 2000, 200, copyKeywords),
    backendSearchTerms: metric('backend_search_terms', backendSearchTerms, 249, 80, copyKeywords),
  };

  const risks = [
    { id: 'risk-main-image', severity: gallerySlots[0].url ? 'low' : 'medium', field: 'MAIN', issue: gallerySlots[0].url ? '主图存在，仍需人工确认白底和主体占比。' : '主图缺失。', fix: '补齐白底主图并复核平台规则。', status: gallerySlots[0].url ? 'review' : 'open' },
    { id: 'risk-claims', severity: copyMetrics.title.risks.length ? 'high' : 'low', field: '标题', issue: copyMetrics.title.risks.length ? `存在高风险词：${copyMetrics.title.risks.join(', ')}` : '标题未发现高风险绝对化表达。', fix: '改成可证明的事实表达，避免 best/guaranteed 等词。', status: copyMetrics.title.risks.length ? 'open' : 'passed' },
    { id: 'risk-variant', severity: 'medium', field: '变体', issue: '颜色/尺寸/兼容关系仍需按类目属性确认。', fix: '按 Product Type Definitions 补齐必填属性。', status: 'review' },
  ];

  const preflight = [
    { key: 'title', label: '标题长度与关键词', passed: copyMetrics.title.length <= 200 && copyMetrics.title.coverage >= 15, owner: '文案' },
    { key: 'bullets', label: '5 条 Bullet 完整', passed: bullets.every((b) => String(b).trim().length > 20), owner: '文案' },
    { key: 'gallery', label: 'MAIN + PT01-PT08 图片矩阵', passed: gallerySlots.filter((g) => g.url).length >= 5, owner: '设计' },
    { key: 'aplus', label: 'A+ / 视频 / 360 计划', passed: aPlusModules.length >= 3, owner: '设计' },
    { key: 'compliance', label: '合规风险复核', passed: !risks.some((r) => r.severity === 'high'), owner: 'QA' },
    { key: 'audit', label: '发布动作进入审计中心', passed: true, owner: '运营' },
  ];

  return {
    sourceMeta: {
      source: latest || research || score || images?.length ? 'hybrid_api_plus_deterministic_mock' : 'deterministic_mock',
      confidence,
      generatedAt: DEMO_NOW,
      mock: true,
      reason: 'M1 使用现有 API 数据补齐 Listing 作战室；缺失真实 Amazon 字段时使用确定性 mock 标注。',
    },
    productProfile: {
      targetId: id,
      sku: target?.product_id || target?.productId || `SKU-${String(seed).slice(0, 5)}`,
      asin: target?.asin || 'PENDING-ASIN',
      mode: target?.mode || 'existing',
      status: target?.status || 'draft',
      category,
      priceBand: target?.new_price_band || target?.newPriceBand || research?.price_band || '$15-$25',
      targetAudience: target?.new_target_audience || target?.newTargetAudience || seededChoice(seed, ['Prime mobile shoppers', 'Urban commuters', 'Gift buyers']),
      brandPositioning: target?.new_brand_positioning || target?.newBrandPositioning || 'Reliable, clear-value, Amazon-first',
      physicalSpecs: target?.new_physical_specs || target?.newPhysicalSpecs || { material: 'TBD', size: 'TBD', weight: 'TBD' },
      competitorPool: unique(asArray(target?.competitor_pool || target?.competitorPool).concat(asArray(research?.source_asins || research?.sourceAsins))).slice(0, 5),
      readOnly: target?.is_competitor_only || target?.isCompetitorOnly || target?.asin_kind === 'external',
    },
    variants: [
      { id: `${id}-black`, label: 'Black / 主推色', asin: target?.asin || 'PENDING', sku: `${target?.product_id || 'SKU'}-BLK`, price: '$19.99', status: 'active', attributes: ['主图已同步', '变体关系 OK'] },
      { id: `${id}-clear`, label: 'Clear / 透明色', asin: '待分配', sku: `${target?.product_id || 'SKU'}-CLR`, price: '$18.99', status: 'needs_image', attributes: ['需独立主图', '需确认材质'] },
      { id: `${id}-blue`, label: 'Blue / 扩展色', asin: '待分配', sku: `${target?.product_id || 'SKU'}-BLU`, price: '$20.99', status: 'draft', attributes: ['待上架', '待补图'] },
    ],
    keywords: {
      rows: keywordRows,
      summary: { total: keywordsRaw.length, covered: coveredKeywords.length, percent: keywordsRaw.length ? Math.round((coveredKeywords.length / keywordsRaw.length) * 100) : 0 },
      primary: keywordsRaw.slice(0, 3),
      secondary: keywordsRaw.slice(3, 9),
      repeatedStuffing: [],
      negativeConflicts: [],
    },
    copy: { title, bullets, description, backendSearchTerms },
    copyMetrics,
    gallerySlots,
    aPlus: {
      modules: aPlusModules,
      video: { status: 'planned', brief: '15-30 秒短视频：痛点 -> 使用 -> 证据 -> 品牌承诺。', confidence: 0.62 },
      view360: { status: 'optional', brief: '适合需要展示结构/细节/兼容关系的 SKU。', confidence: 0.58 },
    },
    complianceRisks: risks,
    preflight,
    scoreSnapshot: {
      total: score?.total_score ?? score?.totalScore ?? null,
      topGap: score?.improvement_ranking?.[0]?.dimension || score?.improvementRanking?.[0]?.dimension || '图片矩阵 / 关键词覆盖',
    },
  };
}

export { apiSlot };
