import fs from 'node:fs';
import path from 'node:path';

const requiredTables = [
  'tenants', 'users', 'stores', 'products', 'listings', 'search_terms', 'orders', 'order_items',
  'financial_events', 'profit_records', 'ad_campaigns', 'inventory_snapshots', 'reviews',
  'competitor_products', 'competitor_snapshots', 'ai_decisions', 'anomalies', 'notifications',
  'audit_center_logs', 'resource_locks', 'auto_operation_quotas',
];

const migrationDir = path.join(process.cwd(), 'infra/db/migrations');
const sql = fs.readdirSync(migrationDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => fs.readFileSync(path.join(migrationDir, file), 'utf8'))
  .join('\n');

for (const table of requiredTables) {
  const pattern = new RegExp(`CREATE\\s+TABLE\\s+${table}\\b`, 'i');
  if (!pattern.test(sql)) throw new Error(`Missing migration table ${table}`);
}

const tenantScoped = ['users', 'stores', 'products', 'orders', 'financial_events', 'profit_records', 'ad_campaigns', 'reviews', 'competitor_products', 'ai_decisions', 'anomalies', 'notifications'];
for (const table of tenantScoped) {
  const block = sql.match(new RegExp(`CREATE\\s+TABLE\\s+${table}\\s*\\(([\\s\\S]*?)\\);`, 'i'))?.[1] || '';
  if (!/tenant_id/i.test(block)) throw new Error(`Table ${table} must include tenant_id`);
}

console.log(`db schema ok: ${requiredTables.length} required tables`);
