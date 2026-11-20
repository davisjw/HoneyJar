-- Keyset order for transaction paging (F3a, HJ-030).
-- 0025 is reserved for 0025_external_ids.sql on the F2 branch.
-- 0026 is reserved for F1 connectors (0026_connectors.sql). This index is 0027.
-- Not CONCURRENTLY: both migration runners apply this file inside a transaction.
-- The existing (user_id, posted_on) index stays.
-- Only the SQL TransactionStore (HJ-034) should rely on this index.
create index if not exists transactions_user_posted_id_idx
  on transactions (user_id, posted_on desc, id desc);
