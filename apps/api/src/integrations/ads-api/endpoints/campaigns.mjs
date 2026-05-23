// Ads API: GET /sp/campaigns (Sponsored Products v2)
// Lists campaigns under the given Ads profile.

import { adsCall } from '../client.mjs';

export async function listCampaigns({
  userId, storeId, profileId, region,
  stateFilter = 'enabled,paused',
  campaignIdFilter,
  startIndex, count,
}) {
  if (!profileId) throw new Error('profile_id_required');
  const query = { stateFilter };
  if (campaignIdFilter) query.campaignIdFilter = campaignIdFilter;
  if (startIndex !== undefined) query.startIndex = startIndex;
  if (count !== undefined) query.count = count;
  const { json } = await adsCall({
    userId, storeId, region, profileId,
    endpoint: 'ads.sp.campaigns.list',
    path: '/sp/campaigns',
    query,
  });
  return Array.isArray(json) ? json : [];
}
