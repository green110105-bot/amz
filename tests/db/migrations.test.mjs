import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

 test('SQL migrations include tenant-scoped core and audit tables', () => {
  const sql = fs.readdirSync(path.join(process.cwd(), 'infra/db/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => fs.readFileSync(path.join(process.cwd(), 'infra/db/migrations', file), 'utf8'))
    .join('\n');
  for (const table of ['tenants', 'products', 'profit_records', 'ai_decisions', 'audit_center_logs', 'resource_locks']) {
    assert.match(sql, new RegExp(`CREATE\\s+TABLE\\s+${table}\\b`, 'i'));
  }
  assert.match(sql, /tenant_id/i);
});
