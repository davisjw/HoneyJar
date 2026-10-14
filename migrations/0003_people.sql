create table if not exists people (
  id text primary key,
  user_id text not null,
  name text not null,
  relation text not null default 'adult',
  archived boolean not null default false,
  sort int not null default 0
);
create index if not exists people_user_idx on people (user_id);

alter table transactions add column if not exists person_id text;
alter table bills add column if not exists person_id text;
alter table credit_scores add column if not exists person_id text;
create index if not exists transactions_person_idx on transactions (user_id, person_id);
create index if not exists credit_scores_person_idx on credit_scores (user_id, person_id);
