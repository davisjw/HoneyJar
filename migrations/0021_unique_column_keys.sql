-- Two columns on one meter can end up with the same key. The calculated one
-- then overwrites the typed one. Keep the key on the column that holds a
-- stored value (a rollup, otherwise a non-calculated column) and rename the rest.
with ranked as (
  select
    id,
    user_id,
    meter_id,
    key,
    row_number() over (
      partition by user_id, meter_id, key
      order by
        case when rollup <> '' then 0 else 1 end,
        case when kind = 'calculated' then 1 else 0 end,
        sort,
        id
    ) as n
  from utility_columns
)
update utility_columns as c
set key = left(r.key, 36) || '_' || r.n::text
from ranked as r
where c.id = r.id
  and r.n > 1
  and not exists (
    select 1
    from utility_columns as other
    where other.user_id = r.user_id
      and other.meter_id = r.meter_id
      and other.id <> c.id
      and other.key = left(r.key, 36) || '_' || r.n::text
  );
