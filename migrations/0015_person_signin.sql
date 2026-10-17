alter table people add column if not exists email text not null default '';
alter table people add column if not exists linked_user_id text;
