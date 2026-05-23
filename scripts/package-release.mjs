import { createHash } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_INCLUDE_PATHS = [
  'AGENTS.md',
  'PRD.md',
  'PROJECT_STATUS.md',
  'MEMORY.md',
  'README.md',
  '.github',
  'docs',
  'apps',
  'packages',
  'infra',
  'scripts',
  'tests',
  '.env.example',
  'package.json'
];

const EXCLUDED_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'log', 'logs', 'secrets']);
const VIRTUAL_MANIFEST_PATH = 'RELEASE-MANIFEST.json';
const VIRTUAL_SECURITY_PATH = 'SECURITY-NOTES.md';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    dryRun: false,
    root: process.cwd(),
    outputDir: 'dist/release',
    format: 'tar.gz',
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--root') options.root = argv[++index];
    else if (arg.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else if (arg === '--output-dir') options.outputDir = argv[++index];
    else if (arg.startsWith('--output-dir=')) options.outputDir = arg.slice('--output-dir='.length);
    else if (arg === '--format') options.format = argv[++index];
    else if (arg.startsWith('--format=')) options.format = arg.slice('--format='.length);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['tar.gz', 'tgz'].includes(options.format)) {
    throw new Error('Only --format tar.gz is supported without third-party dependencies.');
  }

  return options;
}

export function shouldExclude(relPath) {
  const normalized = normalizePath(relPath);
  if (!normalized || normalized === '.') return false;
  if (normalized !== '.env.example' && posix.basename(normalized).startsWith('.env')) return true;
  if (normalized.endsWith('.log')) return true;
  return normalized.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

export async function buildReleasePlan(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const version = packageJson.version;
  const archiveName = `amz-ai-operator-${version}.tar.gz`;
  const outputDir = resolve(root, options.outputDir ?? 'dist/release');
  const archivePath = join(outputDir, archiveName);
  const files = [];

  for (const includePath of DEFAULT_INCLUDE_PATHS) {
    await collectPath(root, includePath, files);
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = await createChecksumManifest({ root, version, archiveName, files });
  const securityNotes = createSecurityNotes(manifest);

  return {
    packageName: packageJson.name,
    version,
    format: 'tar.gz',
    root,
    outputDir,
    archiveName,
    archivePath,
    includes: DEFAULT_INCLUDE_PATHS,
    excludes: [...EXCLUDED_SEGMENTS, '.env* except .env.example', '*.log'],
    fileCount: files.length,
    files,
    virtualFiles: [
      { path: VIRTUAL_MANIFEST_PATH, content: `${JSON.stringify(manifest, null, 2)}\n` },
      { path: VIRTUAL_SECURITY_PATH, content: securityNotes }
    ],
    manifest,
    dryRunWritesBlocked: Boolean(options.dryRun)
  };
}

export async function run(options = parseArgs()) {
  if (options.help) {
    return { help: usage() };
  }

  const plan = await buildReleasePlan(options);
  if (!options.dryRun) {
    await mkdir(plan.outputDir, { recursive: true });
    await writeTarGz(plan.archivePath, plan.files, plan.virtualFiles);
    const archiveBuffer = await readFile(plan.archivePath);
    plan.archive = {
      path: plan.archivePath,
      sha256: sha256(archiveBuffer),
      bytes: archiveBuffer.length
    };
  }

  return plan;
}

async function collectPath(root, includePath, files) {
  if (shouldExclude(includePath)) return;
  const absolute = join(root, includePath);
  let entry;
  try {
    entry = await stat(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  if (entry.isDirectory()) {
    const children = await readdir(absolute);
    for (const child of children) {
      await collectPath(root, join(includePath, child), files);
    }
    return;
  }

  if (!entry.isFile()) return;
  const relPath = normalizePath(includePath);
  if (shouldExclude(relPath)) return;
  files.push({
    path: relPath,
    absolutePath: absolute,
    mode: executableMode(relPath) ? 0o755 : 0o644,
    size: entry.size,
    mtime: entry.mtime
  });
}

async function createChecksumManifest({ root, version, archiveName, files }) {
  const entries = [];
  for (const file of files) {
    const buffer = await readFile(file.absolutePath);
    entries.push({
      path: file.path,
      bytes: buffer.length,
      sha256: sha256(buffer)
    });
  }

  return {
    schemaVersion: '2026-05-08.release-bundle.v1',
    package: 'amz-ai-operator',
    version,
    archiveName,
    generatedAt: new Date().toISOString(),
    sourceRoot: root,
    mode: 'mock-first-sandbox-safe',
    includes: DEFAULT_INCLUDE_PATHS,
    excludes: [...EXCLUDED_SEGMENTS, '.env* except .env.example', '*.log'],
    safety: {
      realWritesEnabledByDefault: false,
      credentialsIncluded: false,
      productionWritesBlockedUntilApproval: true,
      notes: 'Bundle is source-only and excludes dependency caches, git history, build outputs, logs, secrets, and non-example env files.'
    },
    files: entries
  };
}

function createSecurityNotes(manifest) {
  return `# Release Bundle Security Notes\n\n- Real store writes remain blocked by default; keep REAL_WRITES_ENABLED=false unless a credentialed approval path is completed.\n- The bundle excludes node_modules, .git, dist, log/logs, secrets, *.log, and non-example .env files.\n- External provider approval gates must stay mocked or sandboxed until Amazon, ads, LLM, email/WeCom, payment, and real-store approvals are configured.\n- Verify RELEASE-MANIFEST.json sha256 values before deployment and keep audit review enabled for all write-like actions.\n- Manifest schema: ${manifest.schemaVersion}; package version: ${manifest.version}.\n`;
}

async function writeTarGz(archivePath, files, virtualFiles) {
  await mkdir(dirname(archivePath), { recursive: true });
  const tarStream = Readable.from(tarEntries(files, virtualFiles));
  await pipeline(tarStream, createGzip({ level: 9 }), createWriteStream(archivePath));
}

async function* tarEntries(files, virtualFiles) {
  for (const file of files) {
    const buffer = await readFile(file.absolutePath);
    yield tarHeader(file.path, buffer.length, file.mode, file.mtime);
    yield buffer;
    yield padding(buffer.length);
  }

  for (const file of virtualFiles) {
    const buffer = Buffer.from(file.content, 'utf8');
    yield tarHeader(file.path, buffer.length, 0o644, new Date(0));
    yield buffer;
    yield padding(buffer.length);
  }

  yield Buffer.alloc(1024);
}

function tarHeader(filePath, size, mode, mtime) {
  const header = Buffer.alloc(512, 0);
  const normalized = normalizePath(filePath);
  const nameBytes = Buffer.from(normalized);
  if (nameBytes.length > 100) throw new Error(`tar path is too long for portable header: ${normalized}`);

  writeString(header, normalized, 0, 100);
  writeOctal(header, mode, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, Math.floor(new Date(mtime).getTime() / 1000), 136, 12);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeString(header, 'ustar', 257, 6);
  writeString(header, '00', 263, 2);

  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeOctal(header, checksum, 148, 8);
  return header;
}

function writeString(buffer, value, offset, length) {
  buffer.write(value.slice(0, length), offset, length, 'utf8');
}

function writeOctal(buffer, value, offset, length) {
  const text = value.toString(8).padStart(length - 1, '0').slice(-(length - 1));
  buffer.write(text, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

function padding(size) {
  const remainder = size % 512;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(512 - remainder);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizePath(value) {
  return value.split(sep).join('/').replace(/^\.\//, '');
}

function executableMode(relPath) {
  return relPath.startsWith('scripts/') && relPath.endsWith('.mjs');
}

function usage() {
  return `Usage: node scripts/package-release.mjs [--dry-run] [--format tar.gz] [--output-dir dist/release] [--json]\n\nCreates dist/release/amz-ai-operator-<version>.tar.gz with checksum manifest and security notes. Dry-run prints the plan and never writes archives.\n`;
}

function printablePlan(plan) {
  return {
    package: plan.packageName,
    version: plan.version,
    format: plan.format,
    archivePath: plan.archivePath,
    dryRunWritesBlocked: plan.dryRunWritesBlocked,
    fileCount: plan.fileCount,
    includes: plan.includes,
    excludes: plan.excludes,
    virtualFiles: plan.virtualFiles.map((file) => file.path),
    archive: plan.archive,
    files: plan.files.map((file) => file.path)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((plan) => {
      if (plan.help) {
        console.log(plan.help);
        return;
      }
      const printable = printablePlan(plan);
      console.log(JSON.stringify(printable, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
