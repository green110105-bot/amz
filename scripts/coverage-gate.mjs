import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const matrixPath = path.join(root, 'docs/implementation/FULL_REQUIREMENTS_MATRIX.json');
if (!fs.existsSync(matrixPath)) {
  throw new Error('FULL_REQUIREMENTS_MATRIX.json is missing. Run npm run requirements first.');
}

const items = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
const requiredSources = [
  'PRD.md',
  'docs/cross-module/audit-center.md',
  'docs/modules/M1-listing-optimization.md',
  'docs/modules/M2-realtime-profit-inventory.md',
  'docs/modules/M3-lifecycle-ad-optimization.md',
  'docs/modules/M4-daily-ops-monitoring.md',
];

for (const source of requiredSources) {
  if (!items.some((item) => item.source.startsWith(`${source}:`))) {
    throw new Error(`No traceability items found for ${source}`);
  }
}

const storyCount = items.filter((item) => item.type === 'USER_STORY').length;
const sectionCount = items.filter((item) => item.type === 'SECTION').length;
const checklistCount = items.filter((item) => item.type === 'CHECKLIST').length;

if (storyCount < 60) throw new Error(`Expected at least 60 user stories, got ${storyCount}`);
if (sectionCount < 120) throw new Error(`Expected at least 120 sections, got ${sectionCount}`);
if (checklistCount < 20) throw new Error(`Expected at least 20 checklist items, got ${checklistCount}`);

const withoutOwner = items.filter((item) => item.type !== 'SECTION' && (!item.implementation || !item.tests));
if (withoutOwner.length > 0) {
  throw new Error(`${withoutOwner.length} non-section items are missing implementation/test ownership.`);
}

console.log(`coverage ok: ${items.length} items, ${storyCount} stories, ${sectionCount} sections, ${checklistCount} checklist items`);
