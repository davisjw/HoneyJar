alter table transactions add column if not exists tags text not null default '[]';
