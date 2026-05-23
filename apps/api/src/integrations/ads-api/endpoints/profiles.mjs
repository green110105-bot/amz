// Ads API: GET /v2/profiles
// Returns the advertiser profiles visible to the LWA refresh token. Each row
// has a profileId required to scope every subsequent Ads API call.

import { adsCall } from '../client.mjs';

export async function listProfiles({ userId, storeId, region }) {
  const { json } = await adsCall({
    userId, storeId, region,
    endpoint: 'ads.profiles.list',
    path: '/v2/profiles',
  });
  return Array.isArray(json) ? json : [];
}
