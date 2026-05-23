# Backup And Restore Placeholder

This file defines the release contract before real backup tooling exists. Commands are placeholders and must be replaced by environment-specific scripts before production writes are enabled.

## Backup Contract
- Postgres backup captures schema, data, migration version, checksum, started-at, completed-at, and operator.
- ClickHouse backup captures events tables, materialized views, checksum, started-at, completed-at, and operator.
- Backups are required before sandbox promotion and production deployment.
- Backup metadata is attached to the release record and retained per compliance policy.

## Placeholder Commands
```sh
# Postgres placeholder
./infra/deploy/scripts/backup-postgres.sh --env "$APP_ENV" --release "$RELEASE_ID"

# ClickHouse placeholder
./infra/deploy/scripts/backup-clickhouse.sh --env "$APP_ENV" --release "$RELEASE_ID"

# Restore placeholder
./infra/deploy/scripts/restore.sh --env "$APP_ENV" --backup-id "$BACKUP_ID" --dry-run
```

## Restore Checks
- Restore runs in dry-run mode first.
- Restored data is validated by migration, freshness, and deploy smoke tests.
- Production restore requires release owner, data owner, and audit owner approval.
