#!/usr/bin/env bash
# Local only. Checks the backfill in 20261119000052_consultant_pay.sql against rows that existed
# before it:
#   1. reset the local database to 20261119000051 (the migration before);
#   2. add a firm with a vendor contractor (approved week + submitted week) and a directly-paid
#      employee (approved week), as the app would have left them;
#   3. apply 20261119000052;
#   4. check approved_vendor_id: the vendor on the contractor's approved week only, null elsewhere;
#   5. reset the database to the latest migrations.
# It resets the SHARED local database: check no other session is mid-test first.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=supabase_db_consulting-app
psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

FIRM=00000000-0000-4000-8000-0000000000f2
VENDOR=00000000-0000-4000-8000-0000000000b9
CONTRACTOR=00000000-0000-4000-8000-0000000000c8
EMPLOYEE=00000000-0000-4000-8000-0000000000c9

echo "== reset to 20261119000051"
npx supabase db reset --version 20261119000051 2>&1 | grep -i "finished"

echo "== seed rows as the app left them before item 29"
psql <<SQL
insert into public.firms (id, name) values ('$FIRM', 'Pay Backfill Firm');
insert into public.vendors (id, firm_id, name) values ('$VENDOR', '$FIRM', 'Northwind Staffing');
insert into public.consultants (id, firm_id, name, email, type, vendor_id) values
  ('$CONTRACTOR', '$FIRM', 'Dana Brooks', 'dana@demo.test', 'vendor', '$VENDOR'),
  ('$EMPLOYEE', '$FIRM', 'Sam Lee', 'sam@demo.test', 'employee', null);
insert into public.timesheets (firm_id, consultant_id, week_start, status) values
  ('$FIRM', '$CONTRACTOR', '2026-10-05', 'approved'),
  ('$FIRM', '$CONTRACTOR', '2026-10-12', 'submitted'),
  ('$FIRM', '$EMPLOYEE', '2026-10-05', 'approved');
SQL

echo "== apply 20261119000052"
npx supabase migration up 2>&1 | grep -i "applying\|applied\|error"

echo "== check"
psql -A -F ' | ' <<SQL
select c.name, t.week_start, t.status, coalesce(v.name, '(paid directly)')
from public.timesheets t
join public.consultants c on c.id = t.consultant_id
left join public.vendors v on v.id = t.approved_vendor_id
where t.firm_id = '$FIRM'
order by c.name, t.week_start;
do \$\$
begin
  if (select approved_vendor_id from public.timesheets
      where consultant_id = '$CONTRACTOR' and week_start = '2026-10-05') is distinct from '$VENDOR'::uuid
     or exists (select 1 from public.timesheets
                where firm_id = '$FIRM' and approved_vendor_id is not null
                  and not (consultant_id = '$CONTRACTOR' and week_start = '2026-10-05')) then
    raise exception 'BACKFILL WRONG';
  end if;
  raise notice 'BACKFILL OK';
end
\$\$;
SQL

echo "== reset to the latest migrations"
npx supabase db reset 2>&1 | grep -i "finished"
