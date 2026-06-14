#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function arg(name, fallback = null) {
  const idx = process.argv.indexOf('--' + name);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

function compactProvider(p) {
  return {
    provider: p.provider,
    readiness: p.readiness,
    blockers: p.blockers,
    warnings: p.warnings,
    credential: {
      exists: p.credential.exists,
      status: p.credential.status,
      hasRefreshToken: p.credential.hasRefreshToken,
      hasAccessToken: p.credential.hasAccessToken,
      accessTokenState: p.credential.accessTokenState,
      accessTokenExpiresAt: p.credential.accessTokenExpiresAt,
      marketplaceCount: p.credential.marketplaceCount,
      sellingPartnerIdConfigured: p.credential.sellingPartnerIdConfigured,
      profileIdConfigured: p.credential.profileIdConfigured,
    },
    recentSyncs: p.recentSyncs,
    liveProbe: p.liveProbe,
  };
}

loadDotEnv(arg('env', '.env'));

const { buildAmazonAuthorizationDiagnostics } = await import('../apps/api/src/integrations/authorization-diagnostics.mjs');

const userId = arg('user-id', process.env.AMZ_DIAG_USER_ID || 'u-demo');
const storeId = arg('store-id', process.env.AMZ_DIAG_STORE_ID || 's-my-us');
const provider = arg('provider', 'all');
const liveProbe = process.argv.includes('--live-probe');
const apiProbe = process.argv.includes('--api-probe');

const result = await buildAmazonAuthorizationDiagnostics({
  userId,
  storeId,
  provider,
  liveProbe,
  apiProbe,
});

console.log(JSON.stringify({
  ok: result.ok,
  generatedAt: result.generatedAt,
  userId: result.userId,
  storeId: result.storeId,
  mode: result.mode,
  requested: result.requested,
  environment: result.environment,
  providers: result.providers.map(compactProvider),
  m3Impact: result.m3Impact,
}, null, 2));
