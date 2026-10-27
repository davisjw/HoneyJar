alter table utility_meters add column if not exists postal text not null default '';

-- A household ZIP saved before this was per meter. Copy it onto meters that have none.
update utility_meters as m
set postal = left(p.postal, 5)
from profiles as p
where m.user_id = p.user_id
  and m.postal = ''
  and length(p.postal) >= 5;
