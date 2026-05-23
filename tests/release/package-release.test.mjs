import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildReleasePlan, shouldExclude } from '../../scripts/package-release.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('../../scripts/package-release.mjs', import.meta.url));
const policyManifestPath = new URL('../../infra/deploy/release-bundle-manifest.json', import.meta.url);
const docsPath = new URL('../../docs/ops/packaging.md', import.meta.url);

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'amz-release-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'amz-ai-operator', version: '9.8.7' }, null, 2));
  await writeFile(join(root, 'README.md'), '# Fixture\n');
  await writeFile(join(root, 'AGENTS.md'), '# Agents\n');
  await writeFile(join(root, 'PRD.md'), '# PRD\n');
  await writeFile(join(root, 'PROJECT_STATUS.md'), '# Status\n');
  await writeFile(join(root, 'MEMORY.md'), '# Memory\n');
  await writeFile(join(root, '.env.example'), 'REAL_WRITES_ENABLED=false\n');
  await writeFile(join(root, '.env.local'), 'SECRET=do-not-package\n');

  for (const dir of ['.github', 'docs', 'apps', 'packages', 'infra', 'scripts', 'tests']) {
    await mkdir(join(root, dir), { recursive: true });
    await writeFile(join(root, dir, `${dir}.txt`), `${dir}\n`);
  }

  await mkdir(join(root, 'apps', 'node_modules', 'bad'), { recursive: true });
  await writeFile(join(root, 'apps', 'node_modules', 'bad', 'index.js'), 'bad\n');
  await mkdir(join(root, '.git', 'objects'), { recursive: true });
  await writeFile(join(root, '.git', 'HEAD'), 'ref: main\n');
  await mkdir(join(root, 'dist', 'release'), { recursive: true });
  await writeFile(join(root, 'dist', 'release', 'old.tar.gz'), 'old\n');
  await mkdir(join(root, 'log'), { recursive: true });
  await writeFile(join(root, 'log', 'app.log'), 'log\n');
  await mkdir(join(root, 'secrets'), { recursive: true });
  await writeFile(join(root, 'secrets', 'token.txt'), 'token\n');
  await writeFile(join(root, 'docs', 'debug.log'), 'debug\n');

  return root;
}

test('dry-run reports archive plan but does not create release output', async () => {
  const root = await makeFixture();
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, '--root', root, '--dry-run', '--json'], {
    cwd: root,
    maxBuffer: 1024 * 1024
  });
  const result = JSON.parse(stdout);

  assert.equal(result.version, '9.8.7');
  assert.equal(result.dryRunWritesBlocked, true);
  assert.equal(result.archivePath.endsWith('dist\\release\\amz-ai-operator-9.8.7.tar.gz') || result.archivePath.endsWith('dist/release/amz-ai-operator-9.8.7.tar.gz'), true);
  assert.equal(existsSync(join(root, 'dist', 'release', 'amz-ai-operator-9.8.7.tar.gz')), false);
  assert.equal(result.virtualFiles.includes('RELEASE-MANIFEST.json'), true);
  assert.equal(result.virtualFiles.includes('SECURITY-NOTES.md'), true);
});

test('release plan includes delivery roots and excludes dependencies, git, dist, logs, secrets, and env files', async () => {
  const root = await makeFixture();
  const plan = await buildReleasePlan({ root, dryRun: true });
  const paths = plan.files.map((file) => file.path);

  for (const expected of ['AGENTS.md', 'PRD.md', 'PROJECT_STATUS.md', 'MEMORY.md', 'README.md', '.env.example', 'package.json', '.github/.github.txt', 'apps/apps.txt', 'docs/docs.txt', 'packages/packages.txt', 'infra/infra.txt', 'scripts/scripts.txt', 'tests/tests.txt']) {
    assert.ok(paths.includes(expected), `${expected} should be packaged`);
  }

  for (const forbidden of ['apps/node_modules/bad/index.js', '.git/HEAD', 'dist/release/old.tar.gz', 'log/app.log', 'secrets/token.txt', 'docs/debug.log', '.env.local']) {
    assert.equal(paths.includes(forbidden), false, `${forbidden} should be excluded`);
  }

  assert.equal(shouldExclude('packages/node_modules/pkg/index.js'), true);
  assert.equal(shouldExclude('infra/secrets/token.json'), true);
  assert.equal(shouldExclude('docs/debug.log'), true);
  assert.equal(shouldExclude('.env.production'), true);
  assert.equal(shouldExclude('.env.example'), false);
});

test('checksum manifest and security notes describe write blocking and excluded secrets', async () => {
  const root = await makeFixture();
  const plan = await buildReleasePlan({ root, dryRun: true });
  const manifest = plan.manifest;
  const securityNotes = plan.virtualFiles.find((file) => file.path === 'SECURITY-NOTES.md').content;

  assert.equal(manifest.safety.realWritesEnabledByDefault, false);
  assert.equal(manifest.safety.credentialsIncluded, false);
  assert.equal(manifest.safety.productionWritesBlockedUntilApproval, true);
  assert.match(manifest.safety.notes, /excludes dependency caches/i);
  assert.match(securityNotes, /REAL_WRITES_ENABLED=false/);
  assert.match(securityNotes, /provider approval gates/i);
});

test('packaging policy manifest and operations doc cover dry-run and safety rules', async () => {
  const manifest = JSON.parse((await readFile(policyManifestPath, 'utf8')).replace(/^\\uFEFF/, ''));
  const docs = await readFile(docsPath, 'utf8');

  assert.equal(manifest.format, 'tar.gz');
  assert.equal(manifest.safety.dryRunWritesArchive, false);
  assert.equal(manifest.safety.realWritesEnabledDefault, false);
  assert.ok(manifest.includeRoots.includes('PRD.md'));
  assert.ok(manifest.includeRoots.includes('PROJECT_STATUS.md'));
  assert.ok(manifest.includeRoots.includes('.github'));
  assert.ok(manifest.includeRoots.includes('README.md'));
  assert.ok(manifest.includeRoots.includes('.env.example'));
  assert.ok(manifest.excludeRules.includes('node_modules/**'));
  assert.ok(manifest.generatedFilesInBundle.includes('RELEASE-MANIFEST.json'));

  assert.match(docs, /--dry-run --json/);
  assert.match(docs, /dist\/release\/amz-ai-operator-<version>\.tar\.gz/);
  assert.match(docs, /REAL_WRITES_ENABLED=false/);
  assert.match(docs, /node_modules/);
  assert.match(docs, /secrets/);
});

test('actual packaging creates a small tar.gz with release manifest and security notes', async () => {
  const root = await makeFixture();
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, '--root', root, '--json'], {
    cwd: root,
    maxBuffer: 1024 * 1024
  });
  const result = JSON.parse(stdout);
  const archiveStats = await stat(join(root, 'dist', 'release', 'amz-ai-operator-9.8.7.tar.gz'));

  assert.equal(result.archive.bytes, archiveStats.size);
  assert.ok(archiveStats.size > 0);
  assert.ok(archiveStats.size < 256 * 1024, 'fixture archive should stay small');
  assert.match(result.archive.sha256, /^[a-f0-9]{64}$/);
});
