-- External bank ids for idempotent import.
-- The source column is free text. This file does not name any adapter.
--
-- Additive. Existing rows keep the empty-string default. There is no backfill.
-- The partial unique index ignores external_id = '', so hand entry and CSV
-- imports are not constrained. A non-empty id is unique per household,
-- account, and source.
--
-- scripts/migrate.mjs wraps each file in BEGIN/COMMIT. The PGLite applier
-- (src/lib/db.ts) runs each file inside pg.transaction. CREATE INDEX
-- CONCURRENTLY is illegal inside a transaction block, and it is not
-- supported by PGLite, so this file uses a plain CREATE INDEX on both
-- engines. That takes a ShareLock on transactions: reads continue, writes
-- wait until the build finishes.
--
-- Expected build time, measured Oct 31, 2026 on this workspace (local disk,
-- one connection, table already loaded). Figures are for the index build
-- after the two columns exist. Column adds with a constant default were
-- about 1 ms at both sizes (metadata-only on Postgres 11+).
--
--   rows | external ids        | PGLite 0.5 | Postgres 16
--   100k | all still ''        | 17 ms      | 14 ms
--   100k | distinct, non-empty | 305 ms     | 113 ms
--   1M   | all still ''        |            | 60 ms
--   1M   | distinct, non-empty |            | 1.3 s
--
-- The 1M rows were measured on Postgres only. That is the engine a large
-- book runs on. A household book is far smaller than 100k rows. Treat a
-- write pause as a concern only when one database already holds on the
-- order of a million transactions, and then only if those rows already
-- have external ids. An upgrade of existing rows (ids still '') stays
-- under a tenth of a second at a million rows.

alter table transactions add column if not exists external_source text not null default '';
alter table transactions add column if not exists external_id text not null default '';

create unique index if not exists transactions_external_id_idx
  on transactions (user_id, account_id, external_source, external_id)
  where external_id <> '';
