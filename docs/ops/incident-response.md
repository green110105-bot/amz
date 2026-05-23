# Incident Response And Failure Handling

This runbook covers mock and future live operation incidents for M1, M2, M3, M4, audit, and commercial services.

## Triage

1. Classify severity: P0 account/revenue/data risk, P1 material KPI risk, P2 normal degradation.
2. Check whether the incident is mock-only, sandbox, production-read, or production-write.
3. Confirm real-write block status before touching SP-API, Ads API, payment, or messaging adapters.
4. Open or link an audit record for every write-like mitigation.
5. Assign owner and SLA timer.

## Common Failures

| Failure | First Response | Rollback |
|---|---|---|
| SP-API read failure | fall back to last fresh mock/fixture and mark confidence low | no write rollback; refresh credential and retry |
| Ads API profile mismatch | stop M3 execution, remap profile, verify campaign ownership | revert any audited Ads mutation |
| M2 profit drift | freeze automated decisions, compare fee/cost assumptions | re-run scenario and close stale recommendations |
| M4 SLA breach | page owner and escalate severity | reopen case and attach postmortem |
| audit conflict | block execution and request human decision | cancel or revert pending action |
| commercial quota error | switch to safe read-only behavior | restore entitlement only after admin review |

## Postmortem Requirements

- Timeline, customer impact, source data freshness, affected modules, and real-write block status.
- Whether SP-API, Ads API, third-party, or internal mock data was involved.
- Rollback outcome, SLA compliance, privacy/retention impact, and follow-up owner.
- Any required policy or permission changes before re-enabling execution.
