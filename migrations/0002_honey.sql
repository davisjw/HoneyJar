create table if not exists profiles (
  user_id text primary key,
  display_name text not null default 'My household',
  currency text not null default 'USD',
  filing_status text not null default 'single',
  state_code text not null default '',
  dependents int not null default 0,
  wages_cents bigint not null default 0,
  other_income_cents bigint not null default 0,
  withholding_cents bigint not null default 0,
  estimated_paid_cents bigint not null default 0,
  prior_year_tax_cents bigint not null default 0,
  deduction_mode text not null default 'auto',
  salt_cap_cents bigint not null default 1000000,
  state_rate_bps int not null default 0,
  nav_hidden text not null default '',
  ai_provider text not null default 'grok',
  openai_key text not null default '',
  openai_model text not null default 'gpt-4.1-mini',
  ollama_url text not null default 'http://127.0.0.1:11434',
  ollama_model text not null default 'llama3.1',
  vault_salt text not null default '',
  vault_verifier text not null default '',
  seeded boolean not null default false,
  initialized boolean not null default false,
  month_start_day int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists book_access (
  id serial primary key,
  owner_user_id text not null,
  member_user_id text,
  member_email text not null default '',
  role text not null default 'viewer',
  invite_code text not null unique,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists book_access_owner_idx on book_access (owner_user_id);
create index if not exists book_access_member_idx on book_access (member_user_id);

create table if not exists accounts (
  id text primary key,
  user_id text not null,
  name text not null,
  institution text not null default '',
  kind text not null,
  mask text not null default '',
  balance_cents bigint not null default 0,
  limit_cents bigint,
  apr_bps int,
  connected boolean not null default false,
  archived boolean not null default false,
  opened_on date,
  custom_json text not null default '[]'
);
create index if not exists accounts_user_idx on accounts (user_id);

create table if not exists categories (
  id text primary key,
  user_id text not null,
  name text not null,
  section text not null default 'Everyday',
  flow text not null default 'out',
  tax_schedule text not null default '',
  tax_line text not null default '',
  icon text not null default 'tag',
  monthly_cents bigint not null default 0,
  rollover boolean not null default true,
  sort int not null default 0,
  archived boolean not null default false
);
create index if not exists categories_user_idx on categories (user_id);

create table if not exists rules (
  id text primary key,
  user_id text not null,
  pattern text not null,
  category_id text not null,
  priority int not null default 0
);
create index if not exists rules_user_idx on rules (user_id);

create table if not exists transactions (
  id text primary key,
  user_id text not null,
  account_id text not null,
  category_id text,
  posted_on date not null,
  amount_cents bigint not null,
  merchant text not null default '',
  memo text not null default '',
  pending boolean not null default false,
  tax_schedule text not null default '',
  tax_line text not null default '',
  reviewed boolean not null default true,
  source text not null default 'manual'
);
create index if not exists transactions_user_date_idx on transactions (user_id, posted_on);

create table if not exists bills (
  id text primary key,
  user_id text not null,
  name text not null,
  payee text not null default '',
  kind text not null default 'bill',
  direction text not null default 'out',
  category_id text,
  account_id text,
  debt_account_id text,
  amount_cents bigint not null,
  principal_cents bigint,
  cadence text not null default 'monthly',
  next_due date not null,
  autopay boolean not null default false,
  status text not null default 'active',
  variable boolean not null default false,
  notes text not null default '',
  url text not null default ''
);
create index if not exists bills_user_idx on bills (user_id);

create table if not exists bill_payments (
  id text primary key,
  user_id text not null,
  bill_id text not null,
  paid_on date not null,
  amount_cents bigint not null,
  account_id text,
  transaction_id text,
  status text not null default 'paid'
);
create index if not exists bill_payments_user_idx on bill_payments (user_id);

create table if not exists assets (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null,
  value_cents bigint not null,
  as_of date not null,
  loan_account_id text,
  address text not null default '',
  zillow_url text not null default '',
  zestimate_cents bigint,
  detail text not null default '',
  custom_json text not null default '[]'
);
create index if not exists assets_user_idx on assets (user_id);

create table if not exists valuations (
  id text primary key,
  user_id text not null,
  asset_id text not null,
  as_of date not null,
  value_cents bigint not null,
  source text not null default 'manual'
);
create index if not exists valuations_user_idx on valuations (user_id, asset_id);

create table if not exists snapshots (
  id text primary key,
  user_id text not null,
  as_of date not null,
  assets_cents bigint not null,
  debts_cents bigint not null
);
create index if not exists snapshots_user_idx on snapshots (user_id, as_of);

create table if not exists goals (
  id text primary key,
  user_id text not null,
  name text not null,
  target_cents bigint not null,
  saved_cents bigint not null default 0,
  target_date date,
  monthly_cents bigint not null default 0,
  priority int not null default 0,
  notes text not null default '',
  archived boolean not null default false
);
create index if not exists goals_user_idx on goals (user_id);

create table if not exists contributions (
  id text primary key,
  user_id text not null,
  goal_id text not null,
  amount_cents bigint not null,
  contributed_on date not null,
  note text not null default ''
);
create index if not exists contributions_user_idx on contributions (user_id);

create table if not exists plan_months (
  id text primary key,
  user_id text not null,
  category_id text not null,
  month text not null,
  assigned_cents bigint not null default 0,
  unique (user_id, category_id, month)
);
create index if not exists plan_months_user_idx on plan_months (user_id);

create table if not exists watchlists (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null,
  ref_id text not null default '',
  ref_name text not null default '',
  comparator text not null default 'gt',
  threshold_cents bigint not null default 0,
  enabled boolean not null default true,
  note text not null default ''
);
create index if not exists watchlists_user_idx on watchlists (user_id);

create table if not exists alert_reads (
  user_id text not null,
  alert_key text not null,
  primary key (user_id, alert_key)
);

create table if not exists reminders (
  id text primary key,
  user_id text not null,
  title text not null,
  due_on date not null,
  href text not null default '',
  related_type text not null default '',
  related_id text not null default '',
  done boolean not null default false,
  repeat text not null default 'none',
  notes text not null default ''
);
create index if not exists reminders_user_idx on reminders (user_id);

create table if not exists documents (
  id text primary key,
  user_id text not null,
  title text not null,
  kind text not null default 'other',
  year int,
  related_type text not null default '',
  related_id text not null default '',
  notes text not null default '',
  body text not null default '',
  encrypted boolean not null default false,
  file_name text not null default ''
);
create index if not exists documents_user_idx on documents (user_id);

create table if not exists credit_scores (
  id text primary key,
  user_id text not null,
  bureau text not null,
  score int not null,
  as_of date not null,
  factors text not null default ''
);
create index if not exists credit_scores_user_idx on credit_scores (user_id);

create table if not exists milestones (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null,
  target_cents bigint not null,
  target_date date,
  current_cents bigint not null default 0,
  monthly_cents bigint not null default 0,
  annual_return_bps int not null default 500,
  notes text not null default ''
);
create index if not exists milestones_user_idx on milestones (user_id);

create table if not exists reports (
  id text primary key,
  user_id text not null,
  name text not null,
  metric text not null,
  range_key text not null default 'month',
  group_by text not null default 'category',
  filters_json text not null default '{}'
);
create index if not exists reports_user_idx on reports (user_id);

create table if not exists api_keys (
  id text primary key,
  user_id text not null,
  name text not null,
  prefix text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used timestamptz
);
create index if not exists api_keys_user_idx on api_keys (user_id);

create table if not exists ai_messages (
  id text primary key,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_user_idx on ai_messages (user_id, created_at);
