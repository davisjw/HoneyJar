-- Keyset order for transaction paging (F3a, HJ-030).
-- 0025 is reserved for 0025_external_ids.sql on the F2 branch.
-- The PRD's 0026_connectors.sql (F1) is not in the tree; F1 takes a later number.
-- Not CONCURRENTLY: both migration runners apply this file inside a transaction.
-- The existing (user_id, posted_on) index stays.
-- Only the SQL TransactionStore (HJ-034) should rely on this index.
create index if not exists transactions_user_posted_id_idx
  on transactions (user_id, posted_on desc, id desc);
