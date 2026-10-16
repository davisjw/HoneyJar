alter table invoices add column if not exists client_email text not null default '';
alter table invoices add column if not exists client_address text not null default '';
alter table invoices add column if not exists client_city text not null default '';
alter table invoices add column if not exists client_region text not null default '';
alter table invoices add column if not exists client_postal text not null default '';

alter table mileage add column if not exists destination text not null default '';
alter table mileage add column if not exists use_type text not null default 'business';
alter table mileage add column if not exists parking_cents integer not null default 0;
alter table mileage add column if not exists tolls_cents integer not null default 0;
