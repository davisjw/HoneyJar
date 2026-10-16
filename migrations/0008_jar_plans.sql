alter table goals add column if not exists ledger_id text not null default '';
alter table milestones add column if not exists ledger_id text not null default '';
alter table watchlists add column if not exists ledger_id text not null default '';
alter table reminders add column if not exists ledger_id text not null default '';
alter table documents add column if not exists ledger_id text not null default '';
alter table reports add column if not exists ledger_id text not null default '';
