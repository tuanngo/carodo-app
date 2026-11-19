-- Carodo backend, D1 baseline (DRAFT for review, carodo-ios ADR 0010, 0011).
-- The server holds only what is public or shared, and encrypted backups it cannot read.
--
-- Constraints (owner, 2026-11-15, after linkto): an account and what it owns are tied by foreign
-- keys with ON DELETE CASCADE, so erasing the account row erases the rest; an auxiliary table
-- (policies, caches, logs) has none. CHECK only on a system job table's status. Every other fixed
-- set is lowercase text ('anonymous', 'rain') checked by its service (ADR 0003).
-- Every foreign key column on the child side has an index: deleting an account cascades through
-- them, and without one SQLite reads the whole child table (test/workers/setup.ts catches it).
-- Naming: plural snake_case tables; `_id` references, `_at` instants as INTEGER Unix ms,
-- `_m` / `_s` units, booleans as INTEGER 0/1, JSON as TEXT.
-- Indexes `<table>_on_<columns>`; each one serves a query named beside it (D1 bills rows read).
-- Server ids are UUIDv7 (time-ordered), except a Feed item's (random); trip ids are the device's UUIDs.
-- Tables arrive with the slice that uses them; none is created ahead of its code.

-- ── Identity ────────────────────────────────────────────────────────────────

CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- lowercase (ADR 0008); 'deleted:<id>' once deleted
  display_name  TEXT,                                 -- unused in Feed V1
  avatar_key    TEXT,                                 -- unused in Feed V1
  secret_hash   TEXT NOT NULL,                        -- SHA-256 of the account secret
  feed_opt_in   INTEGER NOT NULL DEFAULT 0,           -- Sharing.sharing: publishes car drives to the Feed
  display_as    TEXT NOT NULL DEFAULT 'anonymous',    -- Sharing.displayAs: 'anonymous' | 'username'
  show_vehicle  INTEGER NOT NULL DEFAULT 1,           -- Sharing.showVehicle
  live_opt_in   INTEGER NOT NULL DEFAULT 0,           -- unused in Feed V1
  region_code   TEXT,                                 -- unused in Feed V1
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER                               -- erased within 30 days
);

-- App Attest keys (Secure Enclave). Never linked to analytics or an installation id.
CREATE TABLE app_keys (
  id           TEXT PRIMARY KEY,                      -- App Attest key id
  public_key   BLOB NOT NULL,
  counter      INTEGER NOT NULL DEFAULT 0,            -- assertions must raise it (no replay)
  environment  TEXT NOT NULL,                         -- 'production' | 'development'
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
  app_key_id   TEXT NOT NULL REFERENCES app_keys (id), -- tokens are bound to an attested key
  family_id    TEXT NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);
CREATE INDEX sessions_on_account_id ON sessions (account_id);  -- revoke on deletion, erase
CREATE INDEX sessions_on_family_id ON sessions (family_id);    -- refresh reuse: revoke the family
-- A family is one device's session: its live row is the one an access token is checked against.
CREATE UNIQUE INDEX sessions_on_live_family_id ON sessions (family_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_on_expires_at ON sessions (expires_at);                                -- prune

-- A deleted account's username, and a renamed account's old one, held 90 days so nobody can take
-- it at once to impersonate (specs/account.md). Linked to nothing: an HMAC of the lowercase name
-- under a key derived from SECRET_KEY, so a copy of the table cannot be read back with a list of names.
CREATE TABLE username_holds (
  name_hash   TEXT PRIMARY KEY,
  released_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX username_holds_on_released_at ON username_holds (released_at);  -- prune

-- Username changes, for the limit of 3 in 30 days (contract PUT /v1/me/profile); pruned after 30 days.
CREATE TABLE username_changes (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  changed_at INTEGER NOT NULL
);
CREATE INDEX username_changes_on_account_id ON username_changes (account_id, changed_at);  -- the limit, erase
CREATE INDEX username_changes_on_changed_at ON username_changes (changed_at);              -- prune

-- Names nobody may claim, beside the reserved words in code (services/accounts/usernames.ts). Auxiliary: no key.
-- Filled from seeds/username-policies.sql (idempotent upsert; linkto's slug_policies).
--   kind: 'reserved' | 'profane' (the refusal's reason); match: 'exact' (the whole name, without
--   '.' and '_') | 'contains' (anywhere in it).
CREATE TABLE username_policies (
  name       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  match      TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- ── Feed (ADR 0007: how, never where) ───────────────────────────────────────

-- A car drive the person published to the Feed: its public summary, never a route or a place.
-- Times follow ADR 0007 and P9: when it happened comes from the device, already coarse (ended_at,
-- local_date, local_start_hour, part_of_day); no exact time of a drive is ever received or kept.
-- published_at, updated_at and unpublished_at are exact server times of what the server received:
-- audit only, never in a response, never an order (owner, 2026-11-19). A change counts only with a
-- higher revision; unpublishing keeps the row as a tombstone (trip and revision, no summary) while
-- it is in the Feed's 7 days, so a late, older PUT cannot publish it again. Stop sharing and account
-- deletion delete the rows; moderation sets hidden_at. A drive is visible when both are NULL.
CREATE TABLE drives (
  trip_id       TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- Its Feed item: the author's local day. NULL for a tombstone.
  item_id       TEXT REFERENCES feed_items (id) ON DELETE CASCADE,
  vehicle_kind  TEXT NOT NULL DEFAULT 'car',          -- unused in Feed V1 (car drives only)
  vehicle_make  TEXT,
  vehicle_model TEXT,
  distance_m    REAL NOT NULL,                        -- GPS-estimated, never the odometer (P2)
  moving_duration_s  REAL NOT NULL,
  elapsed_duration_s REAL NOT NULL,
  ranked        INTEGER NOT NULL DEFAULT 1,           -- unused in Feed V1
  tags          TEXT NOT NULL DEFAULT '[]',           -- unused in Feed V1
  -- The only time of a drive: its end as the device sent it, on a quarter hour (P9). Every time in
  -- a response is computed from it in services/shared/coarse-time.ts (carodo-ios ADR 0007).
  ended_at      INTEGER NOT NULL,
  -- When others may first see it, a quarter hour fixed when the server received it
  -- (services/shared/coarse-time.ts visibleAt): never the moment of arrival.
  visible_at    INTEGER NOT NULL,
  local_date    TEXT NOT NULL,                        -- 'YYYY-MM-DD' in the drive's own zone: its item
  local_start_hour INTEGER,                           -- 0–23 local: only the busiest-hour statistic
  region_code   TEXT,                                 -- unused in Feed V1
  area_name     TEXT,                                 -- unused in Feed V1
  area_country  TEXT,                                 -- unused in Feed V1
  part_of_day   TEXT,                                 -- 'early_morning' … 'late_night' (contract PartOfDay)
  weather       TEXT,                                 -- 'rain' | 'clear' | 'unknown', from the device
  shape         TEXT,                                 -- DriveShape JSON as the device sent it
  revision      INTEGER NOT NULL,                     -- the trip's revision on the device; only a higher one is applied
  published_at  INTEGER NOT NULL,                     -- server time of the first publish
  updated_at    INTEGER NOT NULL,                     -- server time of the last applied change
  unpublished_at INTEGER,                             -- server time of the unpublish: a tombstone
  hidden_at     INTEGER                               -- moderation
);
CREATE INDEX drives_on_item_id ON drives (item_id);              -- a Feed page's drives, an item's refresh
CREATE INDEX drives_on_account_id ON drives (account_id, local_date);  -- Stop sharing, deletion, erase, the day's cap
CREATE INDEX drives_on_ended_at ON drives (ended_at);  -- community numbers over the window; hourly deletion
CREATE INDEX drives_on_visible_at ON drives (visible_at);  -- the quarter-hour job: drives others may now see

-- A Feed item: one person's car drives on one local day. Its id is random and kept for the item's
-- life, also when a drive joins or leaves it, so its reactions stay on it; nothing links it to the
-- account in a response. last_ended_at is the ended_at of its newest drive others may see (visible_at
-- reached, set at that quarter by the feed.release job); NULL when none (then it is not on the Feed). created_at is server time, never in a response.
CREATE TABLE feed_items (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  local_date    TEXT NOT NULL,
  last_ended_at INTEGER,
  created_at    INTEGER NOT NULL,
  UNIQUE (account_id, local_date)                     -- a drive's item; refresh, Stop sharing, erase
);
-- The Feed: newest first by quarter, then by the random id, so the order tells no finer time (keyset pages).
CREATE INDEX feed_items_on_feed ON feed_items (last_ended_at DESC, id DESC) WHERE last_ended_at IS NOT NULL;
CREATE INDEX feed_items_on_local_date ON feed_items (local_date);  -- hourly deletion

-- One reaction per reader per item (contract Reaction: 'fire' | 'coffee' | 'clap' | 'road' | 'party').
-- Who reacted is never returned, only the counts.
CREATE TABLE reactions (
  item_id    TEXT NOT NULL REFERENCES feed_items (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  reaction   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, account_id)                   -- a page's counts, PUT and DELETE
) WITHOUT ROWID;
CREATE INDEX reactions_on_account_id ON reactions (account_id, item_id);  -- the reader's own, deletion, erase

-- ── Jobs (linkto ADR 0017, 0018) ────────────────────────────────────────────

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
  job         TEXT PRIMARY KEY,                       -- 'account.erase', …
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

-- Not in D1 on purpose: rate limits (the Rate Limiting binding), counters (Analytics Engine),
-- blobs (R2), any GPS fix in readable form (never).
