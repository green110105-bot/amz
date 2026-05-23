# Rollback Plan

## Triggers
- Health or readiness failure for api, web, services, db, or clickhouse after deployment.
- Audit center unavailable for write-like operations.
- Unexpected real provider/write activity or secret leakage.
- Data migration mismatch, degraded freshness, or failed smoke tests.

## Steps
1. Freeze deploy pipeline and keep `REAL_WRITES_ENABLED=false`.
2. Route traffic back to the last known-good api/web/services images or manifests.
3. Disable provider credentials by switching provider modes to `mock` or `blocked`.
4. If schema changes were applied, run the matching restore placeholder from `backup-restore.md`.
5. Re-run health checks, deploy tests, and smoke tests with mock mode enabled.
6. Record impact, release ID, backup IDs, and follow-up owners.

## Non-Negotiables
- Do not roll forward into real writes to fix a failed release.
- Do not restore production data into local developer environments.
- Do not bypass audit approval gates during rollback.
