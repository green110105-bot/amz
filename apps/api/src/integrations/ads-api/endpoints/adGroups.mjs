// Ads API: GET /sp/adGroups (Sponsored Products v2)

import { adsCall } from '../client.mjs';

export async function listAdGroups({
  userId, storeId, profileId, region,
  stateFilter = 'enabled,paused',
  campaignIdFilter,
  adGroupIdFilter,
}) {
  if (!profileId) throw new Error('profile_id_required');
  const query = { stateFilter };
  if (campaignIdFilter) query.campaignIdFilter = campaignIdFilter;
  if (adGroupIdFilter) query.adGroupIdFilter = adGroupIdFilter;
  const { json } = await adsCall({
    userId, storeId, region, profileId,
    endpoint: 'ads.sp.adGroups.list',
    path: '/sp/adGroups',
    query,
  });
  return Array.isArray(json) ? json : [];
}
