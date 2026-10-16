alter table bills add column if not exists meter_id text;
alter table bills add column if not exists flat_pay boolean not null default false;
alter table bill_payments add column if not exists reading_id text;

create table if not exists utility_meters (
  id text primary key,
  user_id text not null,
  ledger_id text not null default '',
  name text not null,
  unit text not null default 'kWh',
  provider text not null default '',
  parent_id text,
  tiers_json text not null default '[]'
);
create index if not exists utility_meters_ledger_idx on utility_meters (user_id, ledger_id);

create table if not exists utility_columns (
  id text primary key,
  user_id text not null,
  meter_id text not null,
  key text not null,
  label text not null,
  kind text not null,
  unit text not null default '',
  formula text not null default '',
  rollup text not null default '',
  from_children boolean not null default false,
  sort integer not null default 0
);
create index if not exists utility_columns_meter_idx on utility_columns (user_id, meter_id);

create table if not exists utility_readings (
  id text primary key,
  user_id text not null,
  meter_id text not null,
  read_on date not null,
  meter_value double precision,
  amount_cents bigint not null default 0,
  opening boolean not null default false,
  cells_json text not null default '{}'
);
create index if not exists utility_readings_meter_idx on utility_readings (user_id, meter_id, read_on);
