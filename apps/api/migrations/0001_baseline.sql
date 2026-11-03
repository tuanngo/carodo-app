-- Carodo backend, D1 baseline (DRAFT for review, carodo-ios ADR 0010, 0011).
-- The server holds only what is public or shared, and encrypted backups it cannot read.
--
-- Naming: plural snake_case tables; `_id` references, `_at` instants as INTEGER Unix ms,
-- `_m` / `_s` units, booleans as INTEGER 0/1, JSON as TEXT checked with json_valid().
-- Indexes `<table>_on_<columns>`; each one serves a query named beside it (D1 bills rows read).
-- Server ids are UUIDv7 (time-ordered); trip ids are the device's UUIDs.

-- ── Identity ────────────────────────────────────────────────────────────────

CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- [a-z0-9_.]{3,20} (ADR 0008)
  display_name  TEXT,
  avatar_key    TEXT,                                 -- R2 object key
  secret_hash   TEXT NOT NULL,                        -- SHA-256 of the account secret
  feed_opt_in   INTEGER NOT NULL DEFAULT 0,
  live_opt_in   INTEGER NOT NULL DEFAULT 0,
  region_cell   TEXT,                                 -- coarse, computed on the device (Nearby)
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER                               -- erased within 30 days
);

-- App Attest keys (Secure Enclave). Never linked to analytics or an installation id.
CREATE TABLE app_keys (
  id           TEXT PRIMARY KEY,                      -- App Attest key id
  public_key   BLOB NOT NULL,
  counter      INTEGER NOT NULL DEFAULT 0,            -- assertions must raise it (no replay)
  environment  TEXT NOT NULL CHECK (environment IN ('production', 'development')),
  attested_at  INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE TABLE auth_challenges (
  id         TEXT PRIMARY KEY,                        -- the challenge, single use
  expires_at INTEGER NOT NULL
);
CREATE INDEX auth_challenges_on_expires_at ON auth_challenges (expires_at);  -- prune

-- One per device; refresh tokens rotate, a reused one revokes its family.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  app_key_id   TEXT NOT NULL REFERENCES app_keys (id),  -- tokens are bound to an attested key
  family_id    TEXT NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);
CREATE INDEX sessions_on_account_id ON sessions (account_id);  -- sign out everywhere
CREATE INDEX sessions_on_family_id ON sessions (family_id);    -- refresh reuse

CREATE TABLE apple_links (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  apple_sub  TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- ── Feed and leaderboard (ADR 0007: how, never where) ───────────────────────

CREATE TABLE published_drives (
  trip_id       TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  vehicle_make  TEXT,
  vehicle_model TEXT,
  distance_m    REAL NOT NULL,
  duration_s    REAL NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  drove_at      INTEGER NOT NULL,                     -- rounded to the hour: no exact time
  region_cell   TEXT,
  published_at  INTEGER NOT NULL,
  hidden_at     INTEGER
);
-- Feed: visible drives, newest first, all regions or one.
CREATE INDEX published_drives_on_feed ON published_drives (drove_at DESC) WHERE hidden_at IS NULL;
CREATE INDEX published_drives_on_region_feed ON published_drives (region_cell, drove_at DESC) WHERE hidden_at IS NULL;
CREATE INDEX published_drives_on_account_id ON published_drives (account_id, drove_at);  -- profile, rollup

-- Precomputed by cron as sums (a re-run lands on the same rows); read one page by rank.
CREATE TABLE leaderboard_rows (
  period       TEXT NOT NULL CHECK (period IN ('week', 'month')),
  period_start TEXT NOT NULL,                         -- '2026-11-02' (Monday / 1st, UTC)
  scope        TEXT NOT NULL,                         -- 'global' or a region cell
  metric       TEXT NOT NULL CHECK (metric IN ('distance', 'duration')),
  account_id   TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  value        REAL NOT NULL,
  rank         INTEGER NOT NULL,
  computed_at  INTEGER NOT NULL,
  PRIMARY KEY (period, period_start, scope, metric, account_id)
) WITHOUT ROWID;
CREATE INDEX leaderboard_rows_on_rank ON leaderboard_rows (period, period_start, scope, metric, rank);

-- Community stats over 72 h, one row an hour (rolled up from Analytics Engine and drives).
CREATE TABLE stats_hourly (
  hour_at    INTEGER PRIMARY KEY,
  drivers    INTEGER NOT NULL,
  distance_m REAL NOT NULL,
  duration_s REAL NOT NULL
);

-- ── Sharing ─────────────────────────────────────────────────────────────────

CREATE TABLE shares (
  token         TEXT PRIMARY KEY,                     -- unguessable, in the public link
  trip_id       TEXT NOT NULL,
  account_id    TEXT REFERENCES accounts (id) ON DELETE CASCADE,
  route         BLOB NOT NULL,                        -- privacy-trimmed on the device
  distance_m    REAL NOT NULL,
  duration_s    REAL NOT NULL,
  vehicle_make  TEXT,
  vehicle_model TEXT,
  image_key     TEXT,                                 -- R2 preview image
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER
);
CREATE INDEX shares_on_account_id ON shares (account_id, created_at);  -- revoke on delete

-- ── Encrypted backups (ADR 0011): ciphertext in R2, metadata here ───────────

CREATE TABLE backups (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  trip_id    TEXT NOT NULL,
  revision   INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  object_key TEXT NOT NULL,                           -- R2: backups/<account_id>/<trip_id>
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, trip_id)
) WITHOUT ROWID;
CREATE INDEX backups_on_updated_at ON backups (account_id, updated_at, trip_id);  -- list ?after=

CREATE TABLE backup_keys (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  kdf        TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  salt       BLOB NOT NULL,
  wrapped    BLOB NOT NULL,                           -- useless without the recovery code
  updated_at INTEGER NOT NULL
);

CREATE TABLE web_sessions (
  id           TEXT PRIMARY KEY,
  public_key   BLOB NOT NULL,                         -- the browser's ephemeral P-256 key
  poll_hash    TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'ended')),
  account_id   TEXT REFERENCES accounts (id) ON DELETE CASCADE,
  sealed_key   BLOB,                                  -- relayed once, cleared after pickup
  token_hash   TEXT UNIQUE,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  approved_at  INTEGER
);
CREATE INDEX web_sessions_on_account_id ON web_sessions (account_id) WHERE status = 'approved';  -- list, end
CREATE INDEX web_sessions_on_expires_at ON web_sessions (expires_at);                          -- prune

-- ── Safety (App Store 1.2) ──────────────────────────────────────────────────

CREATE TABLE reports (
  id                  TEXT PRIMARY KEY,
  reporter_account_id TEXT REFERENCES accounts (id) ON DELETE SET NULL,
  target_account_id   TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  reason              TEXT NOT NULL,
  note                TEXT,
  created_at          INTEGER NOT NULL,
  resolved_at         INTEGER
);
CREATE INDEX reports_on_open ON reports (created_at) WHERE resolved_at IS NULL;  -- moderation queue

CREATE TABLE blocks (
  account_id         TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  blocked_account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at         INTEGER NOT NULL,
  PRIMARY KEY (account_id, blocked_account_id)
) WITHOUT ROWID;

-- ── Jobs (linkto ADR 0017, 0018) ────────────────────────────────────────────

-- Facts already true, published once to each consumer (push, moderation, rollups).
CREATE TABLE outbox_events (
  id             TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,                       -- 'account', 'drive', 'share'
  aggregate_id   TEXT NOT NULL,
  event_type     TEXT NOT NULL,                       -- 'drive.published', 'share.revoked', …
  payload        TEXT NOT NULL CHECK (json_valid(payload)),
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  created_at     INTEGER NOT NULL,
  published_at   INTEGER
);
CREATE INDEX outbox_events_on_unpublished ON outbox_events (created_at) WHERE published_at IS NULL;  -- drain

-- Work still owed, coalesced per target (an R2 delete after an account is erased).
CREATE TABLE pending_ops (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  target          TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  UNIQUE (kind, target)
);
CREATE INDEX pending_ops_on_next_attempt_at ON pending_ops (next_attempt_at);  -- due work

CREATE TABLE job_states (
  job         TEXT PRIMARY KEY,                       -- 'leaderboard.rollup', …
  cursor      TEXT,
  lease_until INTEGER,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE job_runs (
  id          TEXT PRIMARY KEY,
  job         TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER,
  status      TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
  detail      TEXT
);
CREATE INDEX job_runs_on_job ON job_runs (job, started_at DESC);

-- Not in D1 on purpose: live status and rate limits (Durable Objects), counters
-- (Analytics Engine), blobs (R2), any GPS fix in readable form (never).
