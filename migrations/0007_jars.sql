alter table ledgers add column if not exists kind text not null default 'business';
alter table rules add column if not exists ledger_id text not null default '';
alter table plan_months add column if not exists ledger_id text not null default '';
create index if not exists rules_ledger_idx on rules (user_id, ledger_id);
create index if not exists plan_months_ledger_idx on plan_months (user_id, ledger_id);
