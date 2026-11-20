alter table api_keys add column if not exists scope text not null default 'write';
