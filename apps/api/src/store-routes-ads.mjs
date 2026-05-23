// store-routes-ads.mjs — M3 广告模块 HTTP 路由
// 所有路径前缀 /api/v1/store/ads/...
// 需要 Bearer token (Authorization 头) + X-Store-Id 头

import { securityHeaders } from './security.mjs';
import { whoAmI, defaultStoreIdFor, getDbInstance } from './data-store.mjs';
import {
  // strategies
  listStrategies, getStrategy, createStrategy, updateStrategy, deleteStrategy,
  toggleStrategy, bindStrategy, getStrategiesByCampaign,
  // bulk-mutation helpers (M3 fix #4)
  copyCampaign, bulkChangeBudget, promoteToManual,
  // suggestions
  listSuggestions, getSuggestion, acceptSuggestion, rejectSuggestion, revertSuggestion,
  // manual changes
  listManualChanges, applyManualChangeAlternative, ignoreManualChange,
  // portfolios
  listPortfolios, getPortfolio, createPortfolio, updatePortfolio, deletePortfolio,
  togglePortfolio, updatePortfolioBudget,
  // campaigns
  listCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  toggleCampaign, updateCampaignBudget, updateCampaignBidStrategy,
  // ad-groups
  listAdGroups, getAdGroup, createAdGroup, updateAdGroup, deleteAdGroup, updateAdGroupBid,
  // ads
  listAds, createAd, updateAd, deleteAd, toggleAd,
  // targetings
  listTargetings, getTargeting, createTargeting, updateTargeting, deleteTargeting,
  updateTargetingBid, toggleTargeting, bulkUpdateTargetingBids,
  // negatives
  listNegatives, createNegative, deleteNegative,
  // user search terms
  listUserSearchTerms, promoteUserSearchTerm, negateUserSearchTerm,
  // op log + daily
  listOpLogs, listDaily,
  // kw-grabbing
  listKwGrabbing, createKwGrabbing, updateKwGrabbing, deleteKwGrabbing, applyKwGrabbingBid,
  // placements
  listPlacements, updatePlacement,
  // amc
  listAmcAudiences, createAmcAudience, deleteAmcAudience,
  // reports / sqp
  listSearchTermReports, listSqp, listCampaignReports, takeSqpAction,
  // bulk
  bulkCreateCampaigns, bulkImport,
} from './data-store-ads.mjs';

function getDb() {
  return getDbInstance();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...securityHeaders() },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

// Minimal multipart/form-data parser (text-mode fields + raw file content)
async function readMultipart(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.startsWith('multipart/form-data')) return null;
  const m = ct.match(/boundary=(.+?)(?:;|$)/i);
  if (!m) return null;
  const boundary = '--' + m[1].trim();
  const buf = Buffer.from(await request.arrayBuffer());
  const parts = {};
  // split on boundary
  let i = 0;
  const sep = Buffer.from(boundary);
  const tail = Buffer.from(boundary + '--');
  let start = buf.indexOf(sep);
  while (start !== -1) {
    start += sep.length;
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2; // CRLF
    const next = buf.indexOf(sep, start);
    if (next === -1) break;
    const block = buf.slice(start, next - 2); // strip trailing CRLF
    // headers / body split: \r\n\r\n
    const hdrEnd = block.indexOf(Buffer.from('\r\n\r\n'));
    if (hdrEnd !== -1) {
      const hdrText = block.slice(0, hdrEnd).toString('utf8');
      const body = block.slice(hdrEnd + 4);
      const nameMatch = hdrText.match(/name="([^"]+)"/i);
      const fileMatch = hdrText.match(/filename="([^"]*)"/i);
      if (nameMatch) {
        const name = nameMatch[1];
        if (fileMatch) {
          parts[name] = { filename: fileMatch[1], content: body, text: body.toString('utf8') };
        } else {
          parts[name] = body.toString('utf8');
        }
      }
    }
    start = next;
    // detect tail boundary
    if (buf.slice(next, next + tail.length).equals(tail)) break;
  }
  return parts;
}

// Naive CSV parser (no quoted commas required by template export)
function parseCsv(text) {
  const stripBom = text.replace(/^﻿/, '');
  const lines = stripBom.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { header: [], rows: [] };
  const header = lines[0].split(',').map((s) => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((s) => s.trim());
    const row = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }
  return { header, rows };
}

// Map CSV row → entity body based on entity type
function csvRowToEntity(type, row) {
  if (type === 'campaigns' || type === 'campaign') {
    return {
      id: row.id || undefined, name: row.name,
      dailyBudget: row.budget ? Number(row.budget) : (row.dailyBudget ? Number(row.dailyBudget) : undefined),
      bidStrategy: row.bid_strategy || row.bidStrategy,
      enabled: !row.state || row.state === 'enabled' || row.state === '启用',
    };
  }
  if (type === 'targetings' || type === 'targeting' || type === 'keyword' || type === 'product_targeting') {
    return {
      id: row.id || undefined,
      campaignId: row.campaign_id || row.campaignId,
      adGroupId: row.adgroup_id || row.adGroupId,
      type: row.asin ? 'product' : 'keyword',
      term: row.term, asin: row.asin,
      matchType: row.match_type || row.matchType || 'exact',
      bid: row.bid ? Number(row.bid) : undefined,
      enabled: !row.state || row.state === 'enabled' || row.state === '启用',
    };
  }
  if (type === 'negatives' || type === 'negative') {
    return {
      id: row.id || undefined,
      campaignId: row.target || row.campaign_id || row.campaignId,
      term: row.term,
      matchType: row.match_type || row.matchType || 'exact',
      scope: row.scope || 'Campaign',
    };
  }
  return null;
}

function requireAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return { error: json({ error: 'unauthorized' }, 401) };
  const u = whoAmI(token);
  if (!u) return { error: json({ error: 'unauthorized' }, 401) };
  const storeId = request.headers.get('x-store-id') || defaultStoreIdFor(u.id) || '';
  return { user: u, storeId, userId: u.id };
}

function notFound() { return json({ error: 'not_found' }, 404); }
function validationError(message) { return json({ error: 'validation_error', message }, 400); }

export async function handleAdsRequest(request) {
  try {
    return await _handleAdsRequestImpl(request);
  } catch (err) {
    // SQLite UNIQUE / PK conflict → 409
    const msg = String(err && err.message || err);
    if (/UNIQUE constraint|PRIMARY KEY|SQLITE_CONSTRAINT/i.test(msg)) {
      return json({ error: 'conflict', message: msg }, 409);
    }
    // validation-ish errors → 400
    if (err && err.name === 'TypeError') {
      return json({ error: 'bad_request', message: msg }, 400);
    }
    // log + 500
    try { console.error('[ads-route]', request.method, request.url, msg); } catch {}
    return json({ error: 'internal_error', message: msg }, 500);
  }
}

async function _handleAdsRequestImpl(request) {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;
  const method = (request.method || 'GET').toUpperCase();
  if (!path.startsWith('/api/v1/store/ads/')) return null;

  const a = requireAuth(request);
  if (a.error) return a.error;
  const { userId, storeId } = a;
  const db = getDb();
  const params = url.searchParams;

  // ============================================================
  // 3.1 Strategies
  // ============================================================
  if (path === '/api/v1/store/ads/strategies') {
    if (method === 'GET') {
      const filters = {
        category: params.get('category'),
        status: params.get('status'),
        sov: params.get('sov'),
        scope: params.get('scope'),
        q: params.get('q'),
      };
      return json({ items: listStrategies(db, userId, storeId, filters) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createStrategy(db, userId, storeId, body);
      if (!r) return validationError('name and category required');
      return json(r, 201);
    }
  }
  let m;
  m = path.match(/^\/api\/v1\/store\/ads\/strategies\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') {
      const r = getStrategy(db, userId, storeId, id);
      return r ? json(r) : notFound();
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateStrategy(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') {
      const ok = deleteStrategy(db, userId, storeId, id);
      return ok ? json({ ok: true }) : notFound();
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/strategies\/([\w-]+)\/toggle$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    if (typeof body.enabled !== 'boolean') return validationError('enabled (boolean) required');
    const r = toggleStrategy(db, userId, storeId, m[1], body.enabled);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/strategies\/([\w-]+)\/bind$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = bindStrategy(db, userId, storeId, m[1], body.campaignIds || []);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.2 Suggestions
  // ============================================================
  if (path === '/api/v1/store/ads/suggestions' && method === 'GET') {
    return json({ items: listSuggestions(db, userId, storeId, {
      state: params.get('state'), sku: params.get('sku'), strategy: params.get('strategy'),
    }) });
  }
  m = path.match(/^\/api\/v1\/store\/ads\/suggestions\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getSuggestion(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/suggestions\/([\w-]+)\/accept$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = acceptSuggestion(db, userId, storeId, m[1], body);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/suggestions\/([\w-]+)\/reject$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = rejectSuggestion(db, userId, storeId, m[1], body);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/suggestions\/([\w-]+)\/revert$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = revertSuggestion(db, userId, storeId, m[1], body);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.3 Manual changes
  // ============================================================
  if (path === '/api/v1/store/ads/manual-changes' && method === 'GET') {
    return json({ items: listManualChanges(db, userId, storeId, { state: params.get('state') }) });
  }
  m = path.match(/^\/api\/v1\/store\/ads\/manual-changes\/([\w-]+)\/apply-alternative$/);
  if (m && method === 'POST') {
    const r = applyManualChangeAlternative(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/manual-changes\/([\w-]+)\/ignore$/);
  if (m && method === 'POST') {
    const r = ignoreManualChange(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.4 LX entities
  // ============================================================
  // Portfolios
  if (path === '/api/v1/store/ads/lx/portfolios') {
    if (method === 'GET') return json({ items: listPortfolios(db, userId, storeId) });
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createPortfolio(db, userId, storeId, body);
      return r ? json(r, 201) : validationError('name required');
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/portfolios\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') { const r = getPortfolio(db, userId, storeId, id); return r ? json(r) : notFound(); }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updatePortfolio(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') { const ok = deletePortfolio(db, userId, storeId, id); return ok ? json({ ok: true }) : notFound(); }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/portfolios\/([\w-]+)\/toggle$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    if (typeof body.enabled !== 'boolean') return validationError('enabled required');
    const r = togglePortfolio(db, userId, storeId, m[1], body.enabled);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/portfolios\/([\w-]+)\/budget$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    const body = await readJson(request);
    if (body.budgetCap == null) return validationError('budgetCap required');
    const r = updatePortfolioBudget(db, userId, storeId, m[1], body.budgetCap);
    return r ? json(r) : notFound();
  }

  // Campaigns
  if (path === '/api/v1/store/ads/lx/campaigns') {
    if (method === 'GET') return json({ items: listCampaigns(db, userId, storeId, { portfolioId: params.get('portfolioId') }) });
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createCampaign(db, userId, storeId, body);
      return r ? json(r, 201) : validationError('name required');
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/campaigns\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') { const r = getCampaign(db, userId, storeId, id); return r ? json(r) : notFound(); }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateCampaign(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') { const ok = deleteCampaign(db, userId, storeId, id); return ok ? json({ ok: true }) : notFound(); }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/campaigns\/([\w-]+)\/toggle$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    if (typeof body.enabled !== 'boolean') return validationError('enabled required');
    const r = toggleCampaign(db, userId, storeId, m[1], body.enabled);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/campaigns\/([\w-]+)\/budget$/);
  if (m && (method === 'PUT' || method === 'PATCH' || method === 'POST')) {
    const body = await readJson(request);
    if (body.dailyBudget == null) return validationError('dailyBudget required');
    const r = updateCampaignBudget(db, userId, storeId, m[1], body.dailyBudget, body.source || 'our-tool');
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/campaigns\/([\w-]+)\/bid-strategy$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    const body = await readJson(request);
    if (!body.bidStrategy) return validationError('bidStrategy required');
    const r = updateCampaignBidStrategy(db, userId, storeId, m[1], body.bidStrategy);
    return r ? json(r) : notFound();
  }
  // Strategies bound to a campaign (M3 fix #3)
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/campaigns\/([\w-]+)\/strategies$/);
  if (m && method === 'GET') {
    const items = getStrategiesByCampaign(db, userId, storeId, m[1]);
    return json({ items });
  }
  // Copy a campaign (M3 fix #4: COPY_CAMPAIGN)
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/campaigns\/([\w-]+)\/copy$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = copyCampaign(db, userId, storeId, m[1], body || {});
    return r ? json(r, 201) : notFound();
  }
  // Bulk change budget across multiple campaigns (M3 fix #4: BULK_CHANGE_BUDGET)
  if (path === '/api/v1/store/ads/lx/campaigns/bulk-budget' && method === 'POST') {
    const body = await readJson(request);
    const arr = Array.isArray(body) ? body : (body.items || []);
    const r = bulkChangeBudget(db, userId, storeId, arr);
    return json(r, 200);
  }
  // Promote user search term to manual exact (M3 fix #4: PROMOTE_TO_MANUAL)
  if (path === '/api/v1/store/ads/lx/promote-to-manual' && method === 'POST') {
    const body = await readJson(request);
    if (!body.term || !body.manualCampaignId || !body.manualAdGroupId) {
      return validationError('term, manualCampaignId, manualAdGroupId required');
    }
    const r = promoteToManual(db, userId, storeId, body);
    return r ? json(r, 201) : notFound();
  }

  // Ad groups
  if (path === '/api/v1/store/ads/lx/ad-groups') {
    if (method === 'GET') return json({ items: listAdGroups(db, userId, storeId, { campaignId: params.get('campaignId') }) });
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createAdGroup(db, userId, storeId, body);
      return r ? json(r, 201) : validationError('name required');
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/ad-groups\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') { const r = getAdGroup(db, userId, storeId, id); return r ? json(r) : notFound(); }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateAdGroup(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') { const ok = deleteAdGroup(db, userId, storeId, id); return ok ? json({ ok: true }) : notFound(); }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/ad-groups\/([\w-]+)\/bid$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    const body = await readJson(request);
    if (body.defaultBid == null) return validationError('defaultBid required');
    const r = updateAdGroupBid(db, userId, storeId, m[1], body.defaultBid);
    return r ? json(r) : notFound();
  }

  // Ads
  if (path === '/api/v1/store/ads/lx/ads') {
    if (method === 'GET') return json({ items: listAds(db, userId, storeId, { adGroupId: params.get('adGroupId') }) });
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createAd(db, userId, storeId, body);
      return r ? json(r, 201) : validationError('invalid ad');
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/ads\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateAd(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') { const ok = deleteAd(db, userId, storeId, id); return ok ? json({ ok: true }) : notFound(); }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/ads\/([\w-]+)\/toggle$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    if (typeof body.enabled !== 'boolean') return validationError('enabled required');
    const r = toggleAd(db, userId, storeId, m[1], body.enabled);
    return r ? json(r) : notFound();
  }

  // Targetings
  if (path === '/api/v1/store/ads/lx/targetings') {
    if (method === 'GET') return json({ items: listTargetings(db, userId, storeId, {
      campaignId: params.get('campaignId'), adGroupId: params.get('adGroupId'),
    }) });
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createTargeting(db, userId, storeId, body);
      return r ? json(r, 201) : validationError('invalid targeting');
    }
  }
  if (path === '/api/v1/store/ads/lx/targetings/bulk-bid' && method === 'POST') {
    const body = await readJson(request);
    const arr = Array.isArray(body) ? body : (body.items || []);
    const updated = bulkUpdateTargetingBids(db, userId, storeId, arr);
    return json({ updated: updated.length, items: updated });
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/targetings\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') { const r = getTargeting(db, userId, storeId, id); return r ? json(r) : notFound(); }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateTargeting(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') { const ok = deleteTargeting(db, userId, storeId, id); return ok ? json({ ok: true }) : notFound(); }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/targetings\/([\w-]+)\/bid$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    const body = await readJson(request);
    if (body.bid == null) return validationError('bid required');
    const r = updateTargetingBid(db, userId, storeId, m[1], body.bid);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/targetings\/([\w-]+)\/toggle$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    if (typeof body.enabled !== 'boolean') return validationError('enabled required');
    const r = toggleTargeting(db, userId, storeId, m[1], body.enabled);
    return r ? json(r) : notFound();
  }

  // Negatives
  if (path === '/api/v1/store/ads/lx/negatives') {
    if (method === 'GET') return json({ items: listNegatives(db, userId, storeId, { campaignId: params.get('campaignId') }) });
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createNegative(db, userId, storeId, body);
      return r ? json(r, 201) : validationError('invalid negative');
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/negatives\/([\w-]+)$/);
  if (m && method === 'DELETE') {
    const ok = deleteNegative(db, userId, storeId, m[1]);
    return ok ? json({ ok: true }) : notFound();
  }

  // User search terms
  if (path === '/api/v1/store/ads/lx/user-search-terms' && method === 'GET') {
    return json({ items: listUserSearchTerms(db, userId, storeId, { campaignId: params.get('campaignId') }) });
  }
  if (path === '/api/v1/store/ads/lx/user-search-terms/promote' && method === 'POST') {
    const body = await readJson(request);
    if (!body.term) return validationError('term required');
    const r = promoteUserSearchTerm(db, userId, storeId, body);
    return json(r, 201);
  }
  if (path === '/api/v1/store/ads/lx/user-search-terms/negate' && method === 'POST') {
    const body = await readJson(request);
    if (!body.term) return validationError('term required');
    const r = negateUserSearchTerm(db, userId, storeId, body);
    return json(r, 201);
  }

  // Op log
  if (path === '/api/v1/store/ads/lx/op-log' && method === 'GET') {
    return json({ items: listOpLogs(db, userId, storeId, {
      campaignId: params.get('campaignId'), limit: params.get('limit'),
    }) });
  }
  // Daily
  if (path === '/api/v1/store/ads/lx/daily' && method === 'GET') {
    return json({ items: listDaily(db, userId, storeId, { campaignId: params.get('campaignId') }) });
  }

  // KW grabbing
  if (path === '/api/v1/store/ads/lx/kw-grabbing') {
    if (method === 'GET') return json({ items: listKwGrabbing(db, userId, storeId, { campaignId: params.get('campaignId') }) });
    if (method === 'POST') {
      const body = await readJson(request);
      if (!body.keyword) return validationError('keyword required');
      const r = createKwGrabbing(db, userId, storeId, body);
      return json(r, 201);
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/kw-grabbing\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateKwGrabbing(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') { const ok = deleteKwGrabbing(db, userId, storeId, id); return ok ? json({ ok: true }) : notFound(); }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/kw-grabbing\/([\w-]+)\/apply-bid$/);
  if (m && method === 'POST') {
    const r = applyKwGrabbingBid(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }

  // Placements
  if (path === '/api/v1/store/ads/lx/placements' && method === 'GET') {
    return json({ items: listPlacements(db, userId, storeId, { campaignId: params.get('campaignId') }) });
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/placements\/([\w-]+)$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    const body = await readJson(request);
    const r = updatePlacement(db, userId, storeId, m[1], body);
    return r ? json(r) : notFound();
  }

  // AMC audiences
  if (path === '/api/v1/store/ads/lx/amc-audiences') {
    if (method === 'GET') return json({ items: listAmcAudiences(db, userId, storeId) });
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createAmcAudience(db, userId, storeId, body);
      return json(r, 201);
    }
  }
  m = path.match(/^\/api\/v1\/store\/ads\/lx\/amc-audiences\/([\w-]+)$/);
  if (m && method === 'DELETE') {
    const ok = deleteAmcAudience(db, userId, storeId, m[1]);
    return ok ? json({ ok: true }) : notFound();
  }

  // ============================================================
  // 3.5 Reports / SQP
  // ============================================================
  if (path === '/api/v1/store/ads/reports/search-terms' && method === 'GET') {
    return json({ items: listSearchTermReports(db, userId, storeId, {
      campaignId: params.get('campaignId'), period: params.get('period'),
    }) });
  }
  if (path === '/api/v1/store/ads/reports/search-terms/promote' && method === 'POST') {
    const body = await readJson(request);
    if (!body.term) return validationError('term required');
    const r = promoteUserSearchTerm(db, userId, storeId, body);
    return json(r, 201);
  }
  if (path === '/api/v1/store/ads/reports/search-terms/negate' && method === 'POST') {
    const body = await readJson(request);
    if (!body.term) return validationError('term required');
    const r = negateUserSearchTerm(db, userId, storeId, body);
    return json(r, 201);
  }
  if (path === '/api/v1/store/ads/reports/campaigns' && method === 'GET') {
    return json({ items: listCampaignReports(db, userId, storeId, { period: params.get('period') }) });
  }
  if (path === '/api/v1/store/ads/sqp' && method === 'GET') {
    return json({ items: listSqp(db, userId, storeId, {
      asin: params.get('asin'), from: params.get('from'), to: params.get('to'),
    }) });
  }
  if (path === '/api/v1/store/ads/sqp/take-action' && method === 'POST') {
    const body = await readJson(request);
    if (!body.queryId || !body.action) return validationError('queryId and action required');
    const r = takeSqpAction(db, userId, storeId, body);
    if (!r) return notFound();
    if (r.conflict) return json({ error: 'conflict', existing: r.existing }, 409);
    return json(r, 201);
  }

  // ============================================================
  // 3.6 Bulk
  // ============================================================
  if (path === '/api/v1/store/ads/lx/bulk-create-campaigns' && method === 'POST') {
    const body = await readJson(request);
    const r = bulkCreateCampaigns(db, userId, storeId, body);
    return json(r, 201);
  }
  if (path === '/api/v1/store/ads/lx/bulk-import' && method === 'POST') {
    const ct = request.headers.get('content-type') || '';
    let body;
    if (ct.startsWith('multipart/form-data')) {
      // Multipart: { file: {text}, type: 'campaigns'|'targetings'|'negatives' }
      const parts = await readMultipart(request);
      if (!parts) return validationError('invalid multipart');
      const type = parts.type || 'campaigns';
      const file = parts.file;
      if (!file || !file.text) return validationError('file field required');
      const { rows: rawRows } = parseCsv(file.text);
      const rows = rawRows.map((r) => csvRowToEntity(type, r)).filter(Boolean);
      body = { type, rows };
    } else {
      body = await readJson(request);
    }
    const r = bulkImport(db, userId, storeId, body);
    return json(r, 201);
  }

  return null;
}
