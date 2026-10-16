create table if not exists lots (
  id text primary key,
  user_id text not null,
  account_id text,
  symbol text not null,
  name text not null default '',
  acquired_on date not null,
  shares_micros bigint not null,
  cost_cents bigint not null,
  closed_on date,
  notes text not null default ''
);
create index if not exists lots_user_idx on lots (user_id);

create table if not exists prices (
  id text primary key,
  user_id text not null,
  symbol text not null,
  as_of date not null,
  price_cents bigint not null
);
create index if not exists prices_user_idx on prices (user_id, symbol, as_of);

create table if not exists portfolio_flows (
  id text primary key,
  user_id text not null,
  lot_id text,
  account_id text,
  symbol text not null default '',
  kind text not null,
  posted_on date not null,
  amount_cents bigint not null,
  external boolean not null default true,
  transaction_id text,
  memo text not null default ''
);
create index if not exists portfolio_flows_user_idx on portfolio_flows (user_id, posted_on);

create table if not exists retirement_sketches (
  id text primary key,
  user_id text not null,
  name text not null,
  monthly_cents bigint not null default 0,
  annual_return_bps int not null default 500,
  years int not null default 30,
  target_cents bigint not null default 0,
  use_portfolio boolean not null default true,
  start_cents bigint not null default 0
);
create index if not exists retirement_sketches_user_idx on retirement_sketches (user_id);
