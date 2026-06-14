// store-routes-listings.mjs — M1 Listing 优化模块 HTTP 路由
// 所有路径前缀 /api/v1/store/m1/...
// Bearer + X-Store-Id 必需；写操作走 appendAuditLog (sourceModule='M1')。

import { securityHeaders } from './security.mjs';
import { whoAmI, defaultStoreIdFor, getDbInstance, resolveStoreScope } from './data-store.mjs';
import {
  listTargets, getTarget, createTarget, updateTarget, deleteTarget,
  getResearch, triggerResearch, clearResearchCache,
  getScore, triggerScore,
  listRuns, getRun, createRun, rewriteRunField,
  listVersions, getVersion, pinVersion, deleteVersion, diffVersions, combinedPick,
  listImages, generateImage, regenerateImage,
  listAbTests, getAbTest, createAbTest, startAbTest, abortAbTest,
  getAbMetrics, finalizeAbTest, adoptAbWinner,
  getListingWorkbench, checkListingReadiness, getAssetMatrix, getKeywordCoverage, getComplianceReport,
} from './data-store-listings.mjs';

function getDb() { return getDbInstance(); }

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...securityHeaders() },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function requireAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return { error: json({ error: 'unauthorized' }, 401) };
  const u = whoAmI(token);
  if (!u) return { error: json({ error: 'unauthorized' }, 401) };
  const scope = resolveStoreScope(u.id, request.headers.get('x-store-id'));
  if (scope.error) return { error: json({ error: 'store_not_owned' }, 403) };
  return { user: u, storeId: scope.storeId, userId: u.id };
}

function notFound() { return json({ error: 'not_found' }, 404); }
function validationError(message) { return json({ error: 'validation_failed', message }, 400); }

export async function handleListingsRequest(request) {
  try {
    return await _impl(request);
  } catch (err) {
    const msg = String(err && err.message || err);
    if (/UNIQUE constraint|PRIMARY KEY|SQLITE_CONSTRAINT/i.test(msg)) {
      return json({ error: 'conflict', message: msg }, 409);
    }
    try { console.error('[m1-route]', request.method, request.url, msg); } catch {}
    return json({ error: 'internal_error', message: msg }, 500);
  }
}

async function _impl(request) {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;
  const method = (request.method || 'GET').toUpperCase();
  if (!path.startsWith('/api/v1/store/m1/')) return null;

  const a = requireAuth(request);
  if (a.error) return a.error;
  const { userId, storeId } = a;
  const db = getDb();
  const params = url.searchParams;
  let m;

  // ============================================================
  // 3.0 Production-readiness workbench (read-only/mock-gated)
  // ============================================================
  m = path.match(/^\/api\/v1\/store\/m1\/workbench\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getListingWorkbench(db, userId, storeId, m[1], params.get('versionId'));
    return r ? json(r) : notFound();
  }
  if (path === '/api/v1/store/m1/readiness/check' && method === 'POST') {
    const body = await readJson(request);
    if (!body.targetId) return validationError('targetId required');
    const r = checkListingReadiness(db, userId, storeId, body.targetId, body.versionId || body.version_id || null);
    return r ? json(r) : notFound();
  }
  if (path === '/api/v1/store/m1/assets/matrix' && method === 'GET') {
    const targetId = params.get('targetId');
    if (!targetId) return validationError('targetId required');
    const r = getAssetMatrix(db, userId, storeId, targetId, params.get('versionId'));
    return r ? json(r) : notFound();
  }
  if (path === '/api/v1/store/m1/keywords/coverage' && method === 'GET') {
    const targetId = params.get('targetId');
    if (!targetId) return validationError('targetId required');
    const r = getKeywordCoverage(db, userId, storeId, targetId, params.get('versionId'));
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m1\/compliance\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getComplianceReport(db, userId, storeId, m[1], params.get('versionId'));
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.1 Targets
  // ============================================================
  if (path === '/api/v1/store/m1/targets') {
    if (method === 'GET') {
      return json({ items: listTargets(db, userId, storeId, {
        status: params.get('status'), mode: params.get('mode'),
      }) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createTarget(db, userId, storeId, body);
      if (r && r.error) return json(r, 400);
      return json(r, 201);
    }
  }
  m = path.match(/^\/api\/v1\/store\/m1\/targets\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') {
      const r = getTarget(db, userId, storeId, id);
      return r ? json(r) : notFound();
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = await readJson(request);
      const r = updateTarget(db, userId, storeId, id, body);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') {
      const ok = deleteTarget(db, userId, storeId, id);
      return ok ? json({ ok: true }) : notFound();
    }
  }

  // ============================================================
  // 3.2 Research
  // ============================================================
  if (path === '/api/v1/store/m1/research/trigger' && method === 'POST') {
    const body = await readJson(request);
    if (!body.targetId) return validationError('targetId required');
    const r = triggerResearch(db, userId, storeId, body.targetId, body);
    if (!r) return notFound();
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m1\/research\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getResearch(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m1\/research\/([\w-]+)\/cache$/);
  if (m && method === 'DELETE') {
    const ok = clearResearchCache(db, userId, storeId, m[1]);
    return ok ? json({ ok: true }) : json({ ok: false }, 200);
  }

  // ============================================================
  // 3.3 Scores
  // ============================================================
  if (path === '/api/v1/store/m1/scores/trigger' && method === 'POST') {
    const body = await readJson(request);
    if (!body.targetId) return validationError('targetId required');
    const r = triggerScore(db, userId, storeId, body.targetId);
    if (r && r.error === 'scoring_not_applicable') {
      return json(r, 400);
    }
    if (r && r.error === 'not_found') return notFound();
    return json(r, 201);
  }
  m = path.match(/^\/api\/v1\/store\/m1\/scores\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getScore(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.4 Runs
  // ============================================================
  if (path === '/api/v1/store/m1/runs') {
    if (method === 'GET') {
      return json({ items: listRuns(db, userId, storeId, { targetId: params.get('targetId') }) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createRun(db, userId, storeId, body);
      if (r && r.error === 'external_asin_cannot_optimize') return json(r, 422);
      if (r && r.error === 'validation_failed') return json(r, 400);
      if (r && r.error === 'not_found') return notFound();
      return json(r, 201);
    }
  }
  m = path.match(/^\/api\/v1\/store\/m1\/runs\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getRun(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m1\/runs\/([\w-]+)\/rewrite-field$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = rewriteRunField(db, userId, storeId, m[1], body);
    if (r && r.error === 'validation_failed') return json(r, 400);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.5 Versions
  // ============================================================
  if (path === '/api/v1/store/m1/versions/diff' && method === 'POST') {
    const body = await readJson(request);
    if (!body.versionAId || !body.versionBId) return validationError('versionAId, versionBId required');
    const r = diffVersions(db, userId, storeId, body.versionAId, body.versionBId);
    return r ? json(r) : notFound();
  }
  if (path === '/api/v1/store/m1/versions/combined-pick' && method === 'POST') {
    const body = await readJson(request);
    if (!body.targetId || !body.fieldPicks) return validationError('targetId, fieldPicks required');
    const r = combinedPick(db, userId, storeId, body.targetId, body.fieldPicks);
    if (r && r.error === 'external_asin_cannot_optimize') return json(r, 422);
    if (r && r.error === 'validation_failed') return json(r, 422);
    return r ? json(r, 201) : notFound();
  }
  if (path === '/api/v1/store/m1/versions' && method === 'GET') {
    return json({ items: listVersions(db, userId, storeId, {
      targetId: params.get('targetId'),
      includeArchived: params.get('includeArchived') === 'true' || params.get('includeArchived') === '1',
    }) });
  }
  m = path.match(/^\/api\/v1\/store\/m1\/versions\/([\w-]+)$/);
  if (m) {
    const id = m[1];
    if (method === 'GET') {
      const r = getVersion(db, userId, storeId, id);
      return r ? json(r) : notFound();
    }
    if (method === 'DELETE') {
      const r = deleteVersion(db, userId, storeId, id);
      if (r && r.error === 'cannot_delete_baseline') return json(r, 400);
      if (r && r.error === 'version_referenced_by_ab') return json(r, 409);
      if (r && r.error === 'not_found') return notFound();
      return json({ ok: true });
    }
  }
  m = path.match(/^\/api\/v1\/store\/m1\/versions\/([\w-]+)\/pin$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const pinned = body.pinned === true || body.pinned === 1;
    const r = pinVersion(db, userId, storeId, m[1], pinned);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.6 Images
  // ============================================================
  if (path === '/api/v1/store/m1/images/generate' && method === 'POST') {
    const body = await readJson(request);
    const r = generateImage(db, userId, storeId, body);
    if (r && r.error === 'validation_failed') return json(r, 400);
    // Note: generateImage returns raw row; wrap to object form
    return json({
      id: r.id, target_id: r.target_id, version_id: r.version_id, slot: r.slot,
      prompt: r.prompt, ref_image_url: r.ref_image_url, style_ref_asin: r.style_ref_asin,
      model: r.model, resolution: r.resolution, status: r.status,
      generated_url: r.generated_url, generatedUrl: r.generated_url,
      post_processed: !!r.post_processed, generation_time_ms: r.generation_time_ms,
      created_at: r.created_at, completed_at: r.completed_at,
    }, 201);
  }
  if (path === '/api/v1/store/m1/images' && method === 'GET') {
    return json({ items: listImages(db, userId, storeId, {
      versionId: params.get('versionId'),
      targetId: params.get('targetId'),
    }) });
  }
  m = path.match(/^\/api\/v1\/store\/m1\/images\/([\w-]+)\/regenerate$/);
  if (m && method === 'POST') {
    const body = await readJson(request);
    const r = regenerateImage(db, userId, storeId, m[1], body);
    return r ? json(r) : notFound();
  }

  // ============================================================
  // 3.7 A/B
  // ============================================================
  if (path === '/api/v1/store/m1/ab') {
    if (method === 'GET') {
      return json({ items: listAbTests(db, userId, storeId, {
        status: params.get('status'), targetId: params.get('targetId'),
      }) });
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const r = createAbTest(db, userId, storeId, body);
      if (r && r.error === 'external_asin_cannot_optimize') return json(r, 422);
      if (r && r.error === 'validation_failed') return json(r, 422);
      if (r && r.error === 'not_found') return notFound();
      if (r && r._manualRequired) {
        // M1-008: manual A/B is a single success contract — 201 + manualRequired:true.
        // The row IS persisted (manual_required status) so the operator can see it and follow
        // the manual guidance; no 422 third-state.
        const clean = { ...r };
        delete clean._manualRequired;
        return json({ ...clean, manualRequired: true, manualGuidance: clean.manual_guidance }, 201);
      }
      return json(r, 201);
    }
  }
  m = path.match(/^\/api\/v1\/store\/m1\/ab\/([\w-]+)$/);
  if (m && method === 'GET') {
    const r = getAbTest(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m1\/ab\/([\w-]+)\/start$/);
  if (m && method === 'POST') {
    const r = startAbTest(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m1\/ab\/([\w-]+)\/abort$/);
  if (m && method === 'POST') {
    const r = abortAbTest(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m1\/ab\/([\w-]+)\/metrics$/);
  if (m && method === 'GET') {
    const r = getAbMetrics(db, userId, storeId, m[1]);
    return r ? json(r) : notFound();
  }
  m = path.match(/^\/api\/v1\/store\/m1\/ab\/([\w-]+)\/finalize$/);
  if (m && method === 'POST') {
    const r = finalizeAbTest(db, userId, storeId, m[1]);
    if (!r) return notFound();
    if (r.error === 'not_running') return json(r, 409);
    if (r.error === 'insufficient_data') return json(r, 409);
    return json(r);
  }
  m = path.match(/^\/api\/v1\/store\/m1\/ab\/([\w-]+)\/adopt-winner$/);
  if (m && method === 'POST') {
    const r = adoptAbWinner(db, userId, storeId, m[1]);
    if (!r) return notFound();
    if (r.error === 'not_finalized') return json(r, 409);
    return json(r);
  }

  return null;
}
