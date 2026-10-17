create index if not exists transactions_ledger_date_idx on transactions (user_id, ledger_id, posted_on);
