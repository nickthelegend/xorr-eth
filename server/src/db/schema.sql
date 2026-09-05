-- xorr executor schema. PLAN.md 12.6 / 12.11.
--
-- Two invariants this schema enforces in the database rather than in code, because code that
-- retries is exactly the code that double-spends:
--   1. strategy_runs.period_key is UNIQUE  -> one run per period, ever. (12.8)
--   2. audit_log.prev_hash chains          -> the trail cannot be edited without detection. (12.11)

CREATE TABLE IF NOT EXISTS wallets (
  id            TEXT PRIMARY KEY,
  address       TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('embedded','connected')),
  cluster       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The delegation IS screen 4's four controls. Trade-only, capped, time-boxed, revocable.
CREATE TABLE IF NOT EXISTS delegations (
  id                  TEXT PRIMARY KEY,
  wallet_id           TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  owner_pubkey        TEXT NOT NULL,
  delegate_pubkey     TEXT NOT NULL,
  daily_cap_usd       NUMERIC(14,2) NOT NULL CHECK (daily_cap_usd > 0),
  expires_at          TIMESTAMPTZ NOT NULL,
  venue_allowlist     TEXT[] NOT NULL DEFAULT '{}',
  withdrawal_allowlist TEXT[] NOT NULL DEFAULT '{}',
  revoked             BOOLEAN NOT NULL DEFAULT false,
  -- The on-chain signature that created or revoked it, so the grant is auditable.
  grant_signature     TEXT,
  revoke_signature    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delegations_wallet_idx ON delegations(wallet_id, revoked);

CREATE TABLE IF NOT EXISTS strategies (
  id                    TEXT PRIMARY KEY,
  wallet_id             TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,
  state                 TEXT NOT NULL CHECK (state IN ('draft','watch','live','paused','ended')),
  label                 TEXT NOT NULL,
  symbol                TEXT NOT NULL,
  params                JSONB NOT NULL DEFAULT '{}',
  cadence               TEXT,
  next_run_at           TIMESTAMPTZ,
  daily_allocation_usd  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategies_due_idx ON strategies(state, next_run_at);

-- 12.8: the unique period_key is what makes a retry safe. A second attempt in the same period
-- is rejected by the database, not by a hopeful `if` in the executor.
CREATE TABLE IF NOT EXISTS strategy_runs (
  id            TEXT PRIMARY KEY,
  strategy_id   TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  period_key    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL CHECK (status IN ('pending','filled','failed','blocked','skipped')),
  usd           NUMERIC(14,2),
  units         NUMERIC(24,9),
  price         NUMERIC(20,8),
  signature     TEXT,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS proposals (
  id            TEXT PRIMARY KEY,
  wallet_id     TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  agent         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  decision      TEXT CHECK (decision IN ('approve','skip','expired')),
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12.11: append-only, one row per action AND per non-action, hash-chained.
CREATE TABLE IF NOT EXISTS audit_log (
  seq           BIGSERIAL PRIMARY KEY,
  wallet_id     TEXT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  agent         TEXT NOT NULL,
  action        TEXT NOT NULL,
  detail        TEXT NOT NULL,
  amount        TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL CHECK (kind IN ('trade','risk','block','yield')),
  signature     TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  prev_hash     TEXT NOT NULL,
  hash          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_wallet_idx ON audit_log(wallet_id, seq DESC);

-- Rows are never updated or deleted. Enforced, not merely intended.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- Daily spend, for the rule engine's cap check. One row per wallet per UTC day.
CREATE TABLE IF NOT EXISTS daily_spend (
  wallet_id     TEXT NOT NULL,
  day           DATE NOT NULL,
  spent_usd     NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (wallet_id, day)
);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  wallet_id     TEXT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  author        TEXT NOT NULL,
  type          TEXT NOT NULL,
  agent         TEXT,
  body          JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_wallet_idx ON messages(wallet_id, at);

-- Push device registry — PLAN.md 12.19.
CREATE TABLE IF NOT EXISTS devices (
  token       TEXT PRIMARY KEY,
  wallet_id   TEXT NOT NULL,
  platform    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_wallet_idx ON devices(wallet_id);

-- Positions — built from real fills, not seeded. PLAN.md 12.7.
-- A spot position is an average-cost lot: every fill adds units and moves the average.
CREATE TABLE IF NOT EXISTS positions (
  id            TEXT PRIMARY KEY,
  wallet_id     TEXT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL DEFAULT 'long' CHECK (side IN ('long','short')),
  leverage      NUMERIC(6,2) NOT NULL DEFAULT 1,
  units         NUMERIC(24,9) NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(16,2) NOT NULL DEFAULT 0,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, symbol, side)
);
CREATE INDEX IF NOT EXISTS positions_wallet_idx ON positions(wallet_id);
