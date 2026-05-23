// Ads API additive schema. Reuses sp-api's store_credentials + sync_runs tables.
// Adds a profile_id column for Amazon Advertising profile (distinct from SP-API
// selling_partner_id). ALTER is wrapped in a guard so re-runs are idempotent
// and SP-API rows are unaffected (column is NULL-able).

export function initAdsApiSchema(db) {
  const cols = db.prepare(`PRAGMA table_info(store_credentials)`).all();
  const have = new Set(cols.map((c) => c.name));
  if (!have.has('profile_id')) {
    db.exec(`ALTER TABLE store_credentials ADD COLUMN profile_id TEXT`);
  }
  if (!have.has('country_code')) {
    db.exec(`ALTER TABLE store_credentials ADD COLUMN country_code TEXT`);
  }
}
