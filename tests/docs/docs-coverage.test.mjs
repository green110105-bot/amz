import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredDocs = [
  'docs/user/user-manual.md',
  'docs/ops/runbook.md',
  'docs/ops/prelaunch-checklist.md',
  'docs/ops/incident-response.md',
  'docs/ops/compliance-data-retention-permissions.md',
  'docs/api/integration-guide.md',
  'docs/api/real-account-onboarding-checklist.md',
];

const requiredTerms = [
  'M1',
  'M2',
  'M3',
  'M4',
  'audit',
  'commercial',
  'SP-API',
  'Ads API',
  'real-write block',
  'rollback',
  'SLA',
  'privacy/retention',
];

test('required user, ops, and api docs exist', async () => {
  for (const file of requiredDocs) {
    const content = await readFile(file, 'utf8');
    assert.ok(content.trim().length > 200, `${file} should contain runbook content`);
  }
});

test('docs cover critical MVP, integration, safety, and compliance terms', async () => {
  const corpus = (await Promise.all(requiredDocs.map((file) => readFile(file, 'utf8')))).join('\n');

  for (const term of requiredTerms) {
    assert.match(corpus, new RegExp(escapeRegExp(term), 'i'), `docs should include ${term}`);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
