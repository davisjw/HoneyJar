create table if not exists ledgers (
  id text primary key,
  user_id text not null,
  name text not null,
  tax_form text not null default 'C',
  activity text not null default '',
  archived boolean not null default false,
  sort int not null default 0
);
create index if not exists ledgers_user_idx on ledgers (user_id);

create table if not exists draws (
  id text primary key,
  user_id text not null,
  ledger_id text not null,
  posted_on date not null,
  direction text not null,
  amount_cents bigint not null,
  biz_account_id text not null,
  home_account_id text not null,
  biz_txn_id text not null,
  home_txn_id text not null
);
create index if not exists draws_user_idx on draws (user_id, ledger_id);

alter table accounts add column if not exists ledger_id text not null default '';
alter table categories add column if not exists ledger_id text not null default '';
alter table transactions add column if not exists ledger_id text not null default '';
alter table bills add column if not exists ledger_id text not null default '';
create index if not exists accounts_ledger_idx on accounts (user_id, ledger_id);
create index if not exists transactions_ledger_idx on transactions (user_id, ledger_id);
