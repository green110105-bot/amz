# Launch Readiness Checklist

Use this checklist before any beta, production-read, or production-write milestone. Current state: mock completed; real validation is blocked by missing seller credentials and external approvals.

## Product Scope

- [ ] M1 listing diagnosis, version compare, rollback planning, image compliance, and A/B plan reviewed.
- [ ] M2 profit, inventory, cashflow, leak, PO, tax/FX prompts, and commercial margin checks reviewed.
- [ ] M3 Ads API suggestion loop, budget optimizer, dayparting, placement, brand defense, and guardrails reviewed.
- [ ] M4 anomaly detection, review center, competitor events, notifications, postmortem, and SLA board reviewed.
- [ ] audit center approval, quotas, conflict detection, circuit breakers, rollback, and immutable logs reviewed.
- [ ] commercial entitlement, quota, onboarding, usage metering, and payment mocks reviewed.

## External Account Gate

- [ ] Amazon SP-API app approved, OAuth flow verified, seller authorized, restricted roles approved if needed.
- [ ] Amazon Ads API developer access approved, profiles mapped, read/write scopes separated.
- [ ] Keepa/SellerSprite/Helium 10 contracts and API keys approved if used.
- [ ] LLM provider key, budget ceiling, data processing agreement, and prompt logging policy approved.
- [ ] Email/WeCom/notification templates approved.
- [ ] Payment provider remains sandbox until commercial go-live.

## Real-Write Block

- [ ] Default real-write block enabled in all environments.
- [ ] Production-write requires explicit action allowlist, audit approval, rollback, and SLA monitoring.
- [ ] No background job can perform listing, Ads, buyer message, payment, or store operation writes by default.

## Compliance

- [ ] Privacy notice covers seller, Ads, order, buyer, and audit data.
- [ ] Retention periods documented and deletion/export procedures tested.
- [ ] RBAC and least-privilege permissions verified.
- [ ] Incident response and rollback drills completed.
