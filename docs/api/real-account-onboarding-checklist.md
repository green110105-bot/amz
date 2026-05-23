# Real Account Onboarding Checklist

Current implementation is mock completed. Real validation remains blocked until the following account, authorization, and policy items are satisfied.

## Amazon SP-API

- [ ] Developer account approved and app registered.
- [ ] OAuth consent tested with a non-production seller where possible.
- [ ] Seller, marketplace, region, and role mappings documented.
- [ ] Orders, reports, catalog, inventory, fees, and notifications scopes approved.
- [ ] Restricted data token workflow approved if buyer/order PII is required.
- [ ] Read-only validation completed before any write scope is enabled.

## Amazon Ads API

- [ ] Ads API access approved.
- [ ] OAuth client configured and refresh token rotation tested.
- [ ] Advertiser profiles mapped to tenant stores.
- [ ] Reporting scopes validated separately from mutation scopes.
- [ ] Campaign/bid/budget mutation allowlist reviewed with audit and rollback.

## Production Write Approval

- [ ] Real-write block remains enabled by default.
- [ ] Each write action has business owner, approver, audit id, rollback plan, SLA, and blast-radius limit.
- [ ] M1 listing publish, M3 Ads API mutation, M4 buyer-facing messaging, and commercial payment actions require explicit approval.
- [ ] Dry-run payload compared with Amazon console/API state before execution.

## Commercial And Legal

- [ ] Tenant commercial plan and quota confirmed.
- [ ] Payment provider stays sandbox until billing go-live.
- [ ] Privacy, retention, DPA, and data processing locations approved.
- [ ] Support escalation contacts and incident SLA accepted.
