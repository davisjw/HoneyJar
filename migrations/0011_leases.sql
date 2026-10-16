create table if not exists leases (
  id text primary key,
  user_id text not null,
  ledger_id text not null,
  tenant text not null,
  email text not null default '',
  address text not null default '',
  city text not null default '',
  region text not null default '',
  postal text not null default '',
  unit text not null default '',
  rent_cents bigint not null,
  due_day integer not null default 1,
  start_on date not null,
  end_on date,
  deposit_cents bigint not null default 0,
  deposit_held_cents bigint not null default 0,
  status text not null default 'active',
  last_invoiced text not null default '',
  notes text not null default ''
);
create index if not exists leases_ledger_idx on leases (user_id, ledger_id);

alter table invoices add column if not exists lease_id text;

create table if not exists realizations (
  id text primary key,
  user_id text not null,
  lot_id text,
  account_id text,
  symbol text not null,
  acquired_on date not null,
  sold_on date not null,
  shares_micros bigint not null,
  basis_cents bigint not null,
  proceeds_cents bigint not null,
  gain_cents bigint not null,
  term text not null
);
create index if not exists realizations_user_idx on realizations (user_id, sold_on);
