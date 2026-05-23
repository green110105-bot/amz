# Release Packaging

`node scripts/package-release.mjs` creates a source-only release bundle for the mock-first MVP without adding package dependencies.

## Artifact

- Default command: `node scripts/package-release.mjs`
- npm script: `npm run package-release`
- Dry-run command: `node scripts/package-release.mjs --dry-run --json`
- npm dry-run script: `npm run package-release:dry-run`
- Output path: `dist/release/amz-ai-operator-<version>.tar.gz`
- Version source: root `package.json`
- Static policy manifest: `infra/deploy/release-bundle-manifest.json`

The script uses only Node built-ins and writes a gzip-compressed tar archive. Zip is intentionally not produced because portable zip generation would require extra implementation surface or third-party packages; the tar.gz fallback is deterministic enough for local delivery and CI validation.

## Included Content

The bundle includes the repository delivery surface needed to run, inspect, and validate the MVP:

- `README.md`
- `AGENTS.md`
- `PRD.md`
- `PROJECT_STATUS.md`
- `MEMORY.md`
- `.github/`
- `docs/`
- `apps/`
- `packages/`
- `infra/`
- `scripts/`
- `tests/`
- `.env.example`
- `package.json`

The bundle also injects two generated files at archive root:

- `RELEASE-MANIFEST.json` with file size and sha256 checksums.
- `SECURITY-NOTES.md` with mock/sandbox and real-write gate reminders.

## Excluded Content

The script blocks dependency caches, local state, generated artifacts, and sensitive files:

- `node_modules/`
- `.git/`
- `dist/`
- `log/` and `logs/`
- `secrets/`
- `*.log`
- `.env*` files except `.env.example`

Dry-run mode reports the same include/exclude plan but sets `dryRunWritesBlocked=true` and does not create `dist/release` or any archive.

## Safety Notes

- Real Amazon, Ads, LLM, email/WeCom, payment, and store-write actions remain adapter-gated and mocked or sandboxed by default.
- `REAL_WRITES_ENABLED=false`, audit approval, and provider credential blockers must remain in place until explicit release approval is documented.
- The archive is source-only; it must not contain committed credentials, OAuth tokens, payment secrets, raw logs, or local build output.
- Operators must verify `RELEASE-MANIFEST.json` checksums before promoting an artifact.

## Verification

1. Run `node scripts/package-release.mjs --dry-run --json` and confirm expected files are listed while excluded paths are absent.
2. Run the focused test with `node --test tests/release/package-release.test.mjs`.
3. Create an artifact with `node scripts/package-release.mjs` only after dry-run and tests pass.
4. Inspect the generated JSON output for archive path, byte size, and archive sha256.
