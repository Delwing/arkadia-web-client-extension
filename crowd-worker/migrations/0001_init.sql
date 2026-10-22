-- D1 counts every index entry a write touches as a row written, and the free
-- plan allows 100k a day. So: WITHOUT ROWID wherever the primary key is the
-- lookup (the key is the table, no second b-tree), and no index that only a
-- rare manual operation would use.

-- A contributor is an anonymous install that opted in. The id names it, the
-- secret proves it; only the secret's SHA-256 is kept.
CREATE TABLE contributors (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    -- 1 drops everything this contributor sent from the snapshot. Set by hand;
    -- see README.md for the command, which also marks the export stale.
    banned INTEGER NOT NULL DEFAULT 0,
    -- SHA-256 of the registering IP plus the UTC day. Lets registration be
    -- rate limited per day without keeping anything that links days together.
    registered_from TEXT NOT NULL,
    -- Daily submission quota: the UTC day it counts, and items accepted on it.
    quota_day TEXT NOT NULL DEFAULT '',
    quota_used INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
-- Written once per registration, read once per registration: cheap either way.
CREATE INDEX contributors_registered_from ON contributors (registered_from);

-- One row per distinct version of a record. `key` is what versions compete
-- over: an item's opis, or a mianownik. The hash covers kind and payload, so
-- two players who saw the same thing produce the same row. No index on
-- (kind, key): only the export groups by it, and it reads the whole table.
CREATE TABLE variants (
    hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Who has seen which version. Capped per variant (MAX_CONFIRMATIONS): past
-- that a version is settled, and more rows would only spend the write quota.
CREATE TABLE confirmations (
    hash TEXT NOT NULL,
    contributor TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (hash, contributor)
) WITHOUT ROWID;

-- Bookkeeping for the scheduled export: `last_write` moves on every accepted
-- submission, `last_export` when the export last ran. The export only reads
-- the big tables when the first is newer than the second.
CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
) WITHOUT ROWID;
