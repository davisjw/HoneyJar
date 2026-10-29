insert into utility_columns (id, user_id, meter_id, key, label, kind, unit, formula, rollup, from_children, sort)
select
  'bd_' || m.id,
  m.user_id,
  m.id,
  'read_on',
  'Bill date',
  'date',
  '',
  '',
  'readDate',
  false,
  coalesce((select min(c.sort) from utility_columns c where c.user_id = m.user_id and c.meter_id = m.id), 1) - 1
from utility_meters m
where exists (
  select 1 from utility_columns c
  where c.user_id = m.user_id and c.meter_id = m.id and c.key = 'subscription'
)
and exists (
  select 1 from utility_columns c
  where c.user_id = m.user_id and c.meter_id = m.id and c.key = 'add_ons'
)
and not exists (
  select 1 from utility_columns c
  where c.user_id = m.user_id and c.meter_id = m.id and (c.rollup = 'readDate' or c.key = 'read_on')
);
