# Secret And Real-Write Safety Defaults

- `MOCK_MODE=true` and `DATA_PROVIDER_MODE=mock` are the default for every environment template.
- `REAL_WRITES_ENABLED=false` is the default in local, sandbox, and production manifests.
- Production deployment is blocked unless `ALLOW_PRODUCTION_DEPLOY=true` comes from an approved secret source.
- Provider credentials must not be committed; local placeholders stay blank or `change-me-local-only`.
- External integrations default to `mock` or `blocked` until contract tests, credentials, and audit approval exist.
- Audit gates cannot be disabled for write-like paths in sandbox or production.
