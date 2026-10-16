create table if not exists invoices (
  id text primary key,
  user_id text not null,
  ledger_id text not null,
  number text not null,
  client text not null,
  issued_on date not null,
  due_on date not null,
  status text not null default 'open',
  notes text not null default '',
  lines_json text not null default '[]',
  account_id text,
  transaction_id text,
  paid_on date
);
create index if not exists invoices_ledger_idx on invoices (user_id, ledger_id);

create table if not exists mileage (
  id text primary key,
  user_id text not null,
  ledger_id text not null,
  trip_on date not null,
  purpose text not null,
  miles_hundredths integer not null
);
create index if not exists mileage_ledger_idx on mileage (user_id, ledger_id);
