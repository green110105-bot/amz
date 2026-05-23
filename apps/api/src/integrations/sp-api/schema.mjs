// SP-API per-(user, store) credential storage + sync state.
// All sensitive tokens (refresh_token, access_token) stored AES-256-GCM encrypted
// via integrations/crypto/token-cipher.mjs. Plaintext NEVER hits disk.

export function initSpApiSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_credentials (
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      selling_partner_id TEXT,
      region TEXT,
      marketplace_ids TEXT,
      refresh_token_enc TEXT,
      access_token_enc TEXT,
      access_token_expires_at TEXT,
      scope TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      last_refreshed_at TEXT,
      last_error TEXT,
      last_error_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      PRIMARY KEY(user_id, store_id, provider)
    );
    CREATE INDEX IF NOT EXISTS idx_store_creds_status ON store_credentials(provider, status);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      records_in INTEGER DEFAULT 0,
      records_out INTEGER DEFAULT 0,
      error_code TEXT,
      error_message TEXT,
      cursor_before TEXT,
      cursor_after TEXT,
      meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_runs_us ON sync_runs(user_id, store_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_runs_ep ON sync_runs(provider, endpoint, started_at DESC);
  `);
}
