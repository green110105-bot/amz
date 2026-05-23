CREATE TABLE audit_center_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_module TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_approval',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE resource_locks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  owner_action_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auto_operation_quotas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  module TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 50,
  daily_used INTEGER NOT NULL DEFAULT 0,
  amount_limit NUMERIC(14,2) NOT NULL DEFAULT 500,
  reset_at TIMESTAMPTZ NOT NULL
);
