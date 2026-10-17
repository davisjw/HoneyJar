alter table api_keys add column if not exists expires_at timestamptz;

create table if not exists recovery_codes (
  user_id text primary key,
  code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key,
  user_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists audit_events_user_idx on audit_events (user_id, created_at desc);
