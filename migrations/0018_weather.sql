alter table profiles add column if not exists postal text not null default '';

create table if not exists weather_months (
  user_id text not null,
  postal text not null,
  month text not null,
  avg_f int not null,
  primary key (user_id, postal, month)
);
