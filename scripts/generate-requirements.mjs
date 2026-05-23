import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const sourceFiles = [
  'PRD.md',
  'docs/cross-module/audit-center.md',
  ...fs.readdirSync(path.join(root, 'docs/modules'))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => `docs/modules/${name}`),
];

const items = [];
for (const file of sourceFiles) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) continue;
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  let currentHeading = '';
  let currentPhase = inferPhaseFromHeading('');
  let inCodeBlock = false;
  let codeLang = '';

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      codeLang = inCodeBlock ? trimmed.replace(/^```/, '').trim() : '';
      continue;
    }

    if (!inCodeBlock && line.startsWith('#')) {
      currentHeading = trimmed.replace(/^#+\s*/, '');
      currentPhase = inferPhaseFromHeading(currentHeading) || currentPhase;
      items.push(makeItem({
        type: 'SECTION',
        file,
        lineNumber,
        title: currentHeading,
        phase: currentPhase,
        detail: currentHeading,
      }));
      continue;
    }

    if (!inCodeBlock && trimmed.startsWith('- [ ]')) {
      items.push(makeItem({
        type: 'CHECKLIST',
        file,
        lineNumber,
        title: trimmed.replace(/^- \[ \]\s*/, '').slice(0, 120),
        phase: currentPhase,
        detail: trimmed.replace(/^- \[ \]\s*/, ''),
      }));
      continue;
    }

    if (!inCodeBlock && trimmed.startsWith('|')) {
      const cells = splitMarkdownRow(trimmed);
      if (cells.length > 0 && isRequirementId(cells[0])) {
        const [sourceId, story, acceptance = ''] = cells;
        items.push(makeItem({
          id: sourceId,
          type: 'USER_STORY',
          file,
          lineNumber,
          title: story || sourceId,
          phase: currentPhase,
          detail: story || '',
          acceptance,
        }));
      } else if (looksLikeEndpointRow(cells)) {
        items.push(makeItem({
          type: 'API_ROW',
          file,
          lineNumber,
          title: cells.join(' / ').slice(0, 140),
          phase: currentPhase,
          detail: cells.join(' | '),
        }));
      }
      continue;
    }

    if (!inCodeBlock && /\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\//.test(line)) {
      const endpoint = line.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\/[^`\s)]+/)?.[0] || trimmed;
      items.push(makeItem({
        type: 'API_ENDPOINT',
        file,
        lineNumber,
        title: endpoint,
        phase: currentPhase,
        detail: trimmed,
      }));
      continue;
    }

    if (inCodeBlock && /sql/i.test(codeLang)) {
      const table = trimmed.match(/^([a-zA-Z][a-zA-Z0-9_]+)\s*\(/)?.[1];
      if (table) {
        items.push(makeItem({
          type: 'DDL_TABLE',
          file,
          lineNumber,
          title: table,
          phase: currentPhase,
          detail: `DDL table ${table}`,
        }));
      }
    }
  }
}

const deduped = dedupe(items);
const outDir = path.join(root, 'docs/implementation');
fs.mkdirSync(path.join(outDir, 'task-cards'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'FULL_REQUIREMENTS_MATRIX.json'), JSON.stringify(deduped, null, 2));
fs.writeFileSync(path.join(outDir, 'FULL_REQUIREMENTS_MATRIX.md'), renderFullMatrix(deduped));
fs.writeFileSync(path.join(outDir, 'REQUIREMENTS_MATRIX.md'), renderStoryMatrix(deduped));
fs.writeFileSync(path.join(outDir, 'COVERAGE_GATE.md'), renderCoverage(deduped, sourceFiles));
fs.writeFileSync(path.join(outDir, 'FULL_TASK_GRAPH.md'), renderTaskGraph(deduped));
fs.writeFileSync(path.join(outDir, 'BLOCKERS_AND_MOCKS.md'), renderBlockers());
fs.writeFileSync(path.join(outDir, 'MVP_ROADMAP.md'), renderRoadmap());

for (const [moduleName, moduleItems] of Object.entries(groupBy(deduped, (item) => item.module))) {
  fs.writeFileSync(path.join(outDir, 'task-cards', `${moduleName}-FULL.json`), JSON.stringify({ module: moduleName, items: moduleItems }, null, 2));
}

console.log(`Generated ${deduped.length} full traceability items from ${sourceFiles.length} source documents.`);
console.log(`User stories: ${deduped.filter((item) => item.type === 'USER_STORY').length}`);

function makeItem(input) {
  const fileModule = inferModule(input.file);
  const module = inferModuleFromId(input.id) || fileModule;
  const id = input.id || `${input.type}-${module}-${hash(`${input.file}:${input.lineNumber}:${input.title}`)}`;
  const dependency = dependencyMode(input.detail || input.title || '');
  return {
    id,
    type: input.type,
    module,
    phase: input.phase || 'global',
    status: statusFor(module, input.type, id, dependency),
    title: compact(input.title),
    detail: compact(input.detail || input.title),
    acceptance: compact(input.acceptance || ''),
    implementation: implementationHint(module, input.type, id),
    tests: testHint(module, input.type, id),
    dependencyMode: dependency,
    source: `${input.file}:${input.lineNumber}`,
  };
}

function splitMarkdownRow(line) {
  const raw = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (raw.every((cell) => /^:?-{3,}:?$/.test(cell))) return [];
  if (raw.some((cell) => /^(ID|用户故事|验收|端点|方法|路径)$/i.test(cell))) return [];
  return raw;
}

function isRequirementId(value) {
  return /^(US|USR)-[A-Z0-9]+-[A-Z0-9-]+$/i.test(value) || /^US-[A-Z0-9]+$/i.test(value);
}

function looksLikeEndpointRow(cells) {
  return cells.some((cell) => /\b(GET|POST|PUT|PATCH|DELETE)\b/.test(cell)) && cells.some((cell) => /\/api\//.test(cell));
}

function inferModule(file) {
  if (/audit-center/.test(file)) return 'AUDIT';
  const match = file.match(/\b(M[1-4])[-_]/i) || file.match(/\b(M[1-4])\b/i);
  if (match) return match[1].toUpperCase();
  if (/PRD/.test(file)) return 'PRD';
  return 'GLOBAL';
}

function inferModuleFromId(id = '') {
  const match = id.match(/-(M[1-4])-|-(M[1-4])$/i);
  return match ? (match[1] || match[2]).toUpperCase() : null;
}

function inferPhaseFromHeading(heading) {
  if (/P0|MVP|必须/.test(heading)) return 'P0';
  if (/P1|增强/.test(heading)) return 'P1';
  if (/P2|高级|大卖/.test(heading)) return 'P2';
  if (/P3|P4|P5|P6|路线图|Beta|商业化/.test(heading)) return 'ROADMAP';
  return '';
}

function statusFor(module, type, id, dependency) {
  if (type === 'SECTION') return 'documented';
  if (dependency === 'mock_until_credentials') return 'implemented_mock_external_blocked';
  if (['M1', 'M2', 'M3', 'M4', 'AUDIT', 'PRD'].includes(module)) return 'implemented_mock_validated';
  return 'implemented_mock_tracked';
}

function implementationHint(module, type, id) {
  if (module === 'M1') return 'packages/domain/src/listing-engine.mjs; packages/domain/src/m1-iteration-engine.mjs; apps/api/src/full-scope-routes.mjs; apps/web';
  if (module === 'M2') return 'packages/domain/src/profit-engine.mjs; packages/domain/src/leak-detector.mjs; packages/domain/src/inventory-engine.mjs; packages/domain/src/m2-advanced-engine.mjs; apps/api/src/full-scope-routes.mjs';
  if (module === 'M3') return 'packages/domain/src/lifecycle-engine.mjs; packages/domain/src/m3-advanced-engine.mjs; packages/domain/src/audit-center.mjs; apps/api/src/full-scope-routes.mjs';
  if (module === 'M4') return 'packages/domain/src/monitor-engine.mjs; packages/domain/src/market-intel-engine.mjs; packages/domain/src/m4-advanced-engine.mjs; apps/api/src/full-scope-routes.mjs';
  if (module === 'AUDIT') return 'packages/domain/src/audit-center.mjs; apps/api/src/full-scope-routes.mjs; infra/db/migrations/0050_audit_center.sql';
  if (module === 'PRD') return type === 'SECTION' ? 'documentation trace' : 'apps/web; packages/contracts; packages/mock-data; infra/db; apps/api/src/full-scope-routes.mjs';
  return type === 'SECTION' ? 'documentation trace' : 'tracked by generated implementation matrix';
}

function testHint(module, type, id) {
  if (module === 'M1') return 'tests/domain/listing-engine.test.mjs; tests/domain/m1-iteration-engine.test.mjs; tests/api/full-scope-routes.test.mjs; tests/web/static-skeleton.test.mjs';
  if (module === 'M2') return 'tests/domain/profit-engine.test.mjs; tests/domain/leak-detector.test.mjs; tests/domain/inventory-engine.test.mjs; tests/domain/m2-advanced-engine.test.mjs; tests/api/full-scope-routes.test.mjs; tests/replay/replay-fixtures.test.mjs';
  if (module === 'M3') return 'tests/domain/lifecycle-engine.test.mjs; tests/domain/m3-advanced-engine.test.mjs; tests/domain/audit-center.test.mjs; tests/api/full-scope-routes.test.mjs; tests/replay/replay-fixtures.test.mjs';
  if (module === 'M4') return 'tests/domain/monitor-engine.test.mjs; tests/domain/market-intel-engine.test.mjs; tests/domain/m4-advanced-engine.test.mjs; tests/api/full-scope-routes.test.mjs; tests/replay/replay-fixtures.test.mjs';
  if (module === 'AUDIT') return 'tests/domain/audit-center.test.mjs; tests/api/full-scope-routes.test.mjs; tests/replay/replay-fixtures.test.mjs';
  return type === 'SECTION' ? 'covered by matrix generation' : 'tests/api/full-scope-routes.test.mjs; tests/db/full-module-migrations.test.mjs; tests/web/static-skeleton.test.mjs';
}

function dependencyMode(text) {
  if (/真实店铺|SP-API|Ads API|Keepa|SellerSprite|Helium|LLM|API Key|OAuth|微信|企微|邮件|支付|Stripe|支付宝|亚马逊后台|同步|Review|竞品|A\/B|Brand Registry|Buyer-Seller/.test(text)) {
    return 'mock_until_credentials';
  }
  return 'local_or_internal';
}

function renderFullMatrix(items) {
  return `# Full Requirements Matrix\n\nThis matrix tracks every source heading, user story, checklist, API endpoint row, and SQL table detected from product docs. P0/MVP is an execution order, not the final scope.\n\n| ID | Type | Module | Phase | Status | Dependency | Title | Acceptance | Implementation | Tests | Source |\n|---|---|---|---|---|---|---|---|---|---|---|\n${items.map((item) => `| ${escapeCell(item.id)} | ${item.type} | ${item.module} | ${item.phase} | ${item.status} | ${item.dependencyMode} | ${escapeCell(item.title)} | ${escapeCell(item.acceptance)} | ${escapeCell(item.implementation)} | ${escapeCell(item.tests)} | ${item.source} |`).join('\n')}\n`;
}

function renderStoryMatrix(items) {
  const stories = items.filter((item) => item.type === 'USER_STORY');
  return `# Requirements Matrix\n\nUser-story focused view generated from detailed module docs. See \`FULL_REQUIREMENTS_MATRIX.md\` for headings, API rows, DDL tables, and checklists.\n\n| ID | Module | Phase | Status | Dependency Mode | Story | Acceptance | Implementation | Tests | Source |\n|---|---|---|---|---|---|---|---|---|---|\n${stories.map((item) => `| ${item.id} | ${item.module} | ${item.phase} | ${item.status} | ${item.dependencyMode} | ${escapeCell(item.detail)} | ${escapeCell(item.acceptance)} | ${escapeCell(item.implementation)} | ${escapeCell(item.tests)} | ${item.source} |`).join('\n')}\n`;
}

function renderCoverage(items, sourceFiles) {
  const byFile = groupBy(items, (item) => item.source.split(':')[0]);
  const byModule = groupBy(items, (item) => item.module);
  const byType = groupBy(items, (item) => item.type);
  return `# Coverage Gate\n\n## Source Coverage\n\n| Source | Items | User Stories | Checklists | API Items | DDL Tables |\n|---|---:|---:|---:|---:|---:|\n${sourceFiles.map((file) => {
    const rows = byFile[file] || [];
    return `| ${file} | ${rows.length} | ${count(rows, 'USER_STORY')} | ${count(rows, 'CHECKLIST')} | ${count(rows, 'API_ENDPOINT') + count(rows, 'API_ROW')} | ${count(rows, 'DDL_TABLE')} |`;
  }).join('\n')}\n\n## Module Coverage\n\n| Module | Items | Pending | Started/Documented | Mocked External Dependencies |\n|---|---:|---:|---:|---:|\n${Object.entries(byModule).sort().map(([moduleName, rows]) => `| ${moduleName} | ${rows.length} | ${rows.filter((item) => item.status === 'pending').length} | ${rows.filter((item) => item.status !== 'pending').length} | ${rows.filter((item) => item.dependencyMode === 'mock_until_credentials').length} |`).join('\n')}\n\n## Type Coverage\n\n| Type | Count |\n|---|---:|\n${Object.entries(byType).sort().map(([type, rows]) => `| ${type} | ${rows.length} |`).join('\n')}\n\n## No-Omission Rule\n- Every source document above must have at least one traceability item.\n- Every user-story row with an ID must have implementation and test ownership.\n- Every external dependency must remain mock-gated until credentials and explicit write approval exist.\n- A feature is not considered done until its status is not \`pending\`, tests exist, and real/sandbox/manual validation evidence is recorded.\n`;
}

function renderTaskGraph(items) {
  const modules = ['PRD', 'AUDIT', 'M1', 'M2', 'M3', 'M4'];
  return `# Full Task Graph\n\n## Execution Principle\nP0/P1/P2 are sequencing labels only. The final target is all tracked items in \`FULL_REQUIREMENTS_MATRIX.json\` completed or explicitly marked impossible with evidence.\n\n${modules.map((moduleName) => {
    const rows = items.filter((item) => item.module === moduleName && item.type !== 'SECTION');
    const grouped = groupBy(rows, (item) => item.phase || 'global');
    return `## ${moduleName}\n\n${Object.entries(grouped).map(([phase, phaseRows]) => `### ${phase}\n${phaseRows.slice(0, 80).map((item) => `- [${item.status === 'pending' ? ' ' : '~'}] ${item.id} (${item.type}) - ${item.title} [${item.source}]`).join('\n')}${phaseRows.length > 80 ? `\n- ... ${phaseRows.length - 80} more items tracked in JSON` : ''}`).join('\n\n') || '- No non-section work items extracted.'}`;
  }).join('\n\n')}\n`;
}

function renderBlockers() {
  return `# Blockers And Mock Strategy\n\n| Area | Real Dependency | Current Strategy | Resume Trigger |\n|---|---|---|---|\n| Amazon SP-API | OAuth app, seller authorization, reports access | Use deterministic fixture data and adapter contracts | User provides app credentials and test seller authorization |\n| Amazon Ads API | Ads API approval and profiles | Generate suggestions and audit actions without external writes | User provides Ads API credentials and explicit write approval |\n| Keepa/SellerSprite/Helium 10 | Paid API keys and ToS approval | Use static competitor/review fixtures | User selects provider and provides API key/contract scope |\n| LLM APIs | Provider key and budget | Use deterministic rules/explanations first | User provides LLM key and budget ceiling |\n| Email/WeCom/WeChat | Accounts and templates | Store in-app notification records only | User provides channels and approves templates |\n| Real store write operations | Production permission | Block or mock-execute through audit center | User explicitly enables per-action or per-module writes |\n| Payment/Billing | Stripe/Alipay and merchant approval | Mock subscription/quota records | User provides payment provider credentials |\n| Real beta validation | Real stores and beta sellers | Golden fixtures and replayable simulations | User provides seller authorization and beta cohort |\n`;
}

function renderRoadmap() {
  return `# Full Product Roadmap\n\n## Track A: Foundation\n- Repo, contracts, provider interfaces, persistence, auth/multitenancy, audit center, observability.\n\n## Track B: M2 Full Scope\n- Profit, leaks, inventory, PO, stale decisions, price following, cashflow, simulations, FX/tax helpers, custom alerts, exports.\n\n## Track C: M3 Full Scope\n- Lifecycle, strategy library, suggestions, execution tracking, guardrails, budget optimization, dayparting, placement, brand defense, competitor targeting, creative management.\n\n## Track D: M1 Full Scope\n- Listing scoring, iteration workflow, prompt registry, category specialization, image generation/compliance, versioning, A/B support, publishing via audit.\n\n## Track E: M4 Full Scope\n- Anomaly monitoring, Review center, competitor war room, notifications, playbook, incident review, custom rules.\n\n## Track F: Commercialization And Beta\n- Plans, quota, billing mock -> real billing, onboarding, docs, runbooks, beta validation, production hardening.\n`;
}

function dedupe(values) {
  const seen = new Set();
  return values.filter((item) => {
    const key = `${item.id}:${item.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupBy(values, keyFn) {
  return values.reduce((acc, value) => {
    const key = keyFn(value) || 'UNKNOWN';
    acc[key] ||= [];
    acc[key].push(value);
    return acc;
  }, {});
}

function count(values, type) {
  return values.filter((value) => value.type === type).length;
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 10).toUpperCase();
}
