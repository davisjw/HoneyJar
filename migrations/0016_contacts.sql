create table if not exists contacts (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null default 'merchant',
  phone text not null default '',
  website text not null default '',
  email text not null default '',
  street text not null default '',
  city text not null default '',
  region text not null default '',
  postal text not null default '',
  hours text not null default '',
  notes text not null default ''
);

create index if not exists contacts_user_idx on contacts (user_id, lower(name));
