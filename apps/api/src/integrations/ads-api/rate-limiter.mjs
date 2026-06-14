// Ads-API rate limiter. Reuses the shared token-bucket helper from sp-api
// (acquire / updateFromHeader / snapshot / _resetForTests) and registers
// Ads-specific endpoint defaults. The bucket key namespace is the same
// (userStoreId :: endpoint), but Ads endpoint names are prefixed with
// 'ads.' so they never collide with SP-API entries.

import { _registerDefaults } from '../sp-api/rate-limiter.mjs';

// Conservative defaults — Amazon Ads API publishes per-endpoint TPS but does
// not document burst sizes for v2/sp endpoints. We pre-load 1 rps / burst 5
// for list endpoints (well below quoted ceilings) and let the live
// `x-amzn-RateLimit-Limit` header (Ads also emits this) update the bucket.
const ADS_DEFAULTS = {
  'ads.profiles.list':       { rate: 1.0, burst: 5 },
  'ads.sp.campaigns.list':   { rate: 1.0, burst: 5 },
  'ads.sp.adGroups.list':    { rate: 1.0, burst: 5 },
  'ads.sp.keywords.list':    { rate: 1.0, burst: 5 },
  'ads.sp.productAds.list':  { rate: 1.0, burst: 5 },
  'ads.sp.targets.list':     { rate: 1.0, burst: 5 },
  'ads.sp.negativeKeywords.list': { rate: 1.0, burst: 5 },
  'ads.sp.keywords.update':  { rate: 0.5, burst: 2 },
  'ads.sp.adGroups.update':  { rate: 0.5, burst: 2 },
  'ads.sp.campaigns.update': { rate: 0.5, burst: 2 },
};

_registerDefaults(ADS_DEFAULTS);

export { acquire, updateFromHeader, snapshot, _resetForTests } from '../sp-api/rate-limiter.mjs';
export { ADS_DEFAULTS };
