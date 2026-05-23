# Release Checklist

Release is blocked by default until every item is checked by the release owner.

## Preflight
- Confirm `.env.example` defaults keep `MOCK_MODE=true`, `DATA_PROVIDER_MODE=mock`, and `REAL_WRITES_ENABLED=false`.
- Confirm production deploy remains blocked unless `ALLOW_PRODUCTION_DEPLOY=true` is supplied from an approved secret source.
- Run unit, contract, deploy, migration, and health-check suites against the target build.
- Confirm provider blockers are either mocked or have sandbox credentials and signed contracts.
- Confirm audit center is required for every write-like operation.

## Data Safety
- Capture database and ClickHouse backups before sandbox or production promotion.
- Store backup IDs, checksums, operator, and retention expiry in the release record.
- Verify restore placeholders or dry-run procedures are current for both stores.

## Go/No-Go
- API, web, services, db, clickhouse, and provider boundary readiness are green.
- No real Amazon, ads, payment, email, or WeCom writes are enabled without explicit approval.
- Rollback owner and communication channel are named.
- Release notes list mock-backed features with source and confidence metadata.
