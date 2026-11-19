#!/usr/bin/env bash
# Local only. Checks 20261119000051_contractor_trueup.sql against rows that existed before it:
#   1. reset the local database to 20261118000050 (the migration before);
#   2. add a firm with an approved bill (expense + contractor lines, with its expense) and a pending
#      bill (contractor line), as the app would have left them;
#   3. snapshot bill totals, updated_at and the P&L (as the firm's admin);
#   4. apply 20261119000051 and snapshot again;
#   5. reset the database to the latest migrations.
# The before and after snapshots must match, and every contractor line must be 'legacy'.
# It resets the SHARED local database: check no other session is mid-test first.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=supabase_db_consulting-app
psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

FIRM=00000000-0000-4000-8000-0000000000f1
ADMIN=00000000-0000-4000-8000-0000000000a9

echo "== reset to 20261118000050"
npx supabase db reset --version 20261118000050 2>&1 | grep -i "finished"

echo "== seed rows as the app left them before the true-up"
psql <<SQL
insert into auth.users (id, instance_id, aud, role, email)
values ('$ADMIN', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'backfill-admin@local.test');
insert into public.firms (id, name) values ('$FIRM', 'Backfill Firm');
insert into public.firm_members (firm_id, user_id, role) values ('$FIRM', '$ADMIN', 'admin');
insert into public.vendors (id, firm_id, name) values ('00000000-0000-4000-8000-0000000000b0', '$FIRM', 'Old Vendor');
insert into public.clients (id, firm_id, name) values ('00000000-0000-4000-8000-0000000000c1', '$FIRM', 'Old Client');

select set_config('app.vendor_bill_internal', 'on', false);
insert into public.vendor_bills (id, firm_id, vendor_id, bill_number, bill_date, due_date, period_start, period_end, status, approved_at)
values
  ('00000000-0000-4000-8000-0000000000b1', '$FIRM', '00000000-0000-4000-8000-0000000000b0', 'OLD-1', '2026-10-15', '2026-11-15', '2026-10-01', '2026-10-31', 'approved', now()),
  ('00000000-0000-4000-8000-0000000000b2', '$FIRM', '00000000-0000-4000-8000-0000000000b0', 'OLD-2', '2026-11-05', '2026-12-05', null, null, 'pending_approval', null);
insert into public.vendor_bill_lines (id, firm_id, bill_id, position, kind, description, amount, category_id, client_id)
values
  ('00000000-0000-4000-8000-0000000000d1', '$FIRM', '00000000-0000-4000-8000-0000000000b1', 1, 'expense', 'Licences', 300,
     (select id from public.expense_categories where firm_id = '$FIRM' order by name limit 1), '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d2', '$FIRM', '00000000-0000-4000-8000-0000000000b1', 2, 'contractor', 'October hours', 900, null, null),
  ('00000000-0000-4000-8000-0000000000d3', '$FIRM', '00000000-0000-4000-8000-0000000000b2', 1, 'contractor', 'November hours', 50, null, null);
insert into public.expenses (firm_id, spent_on, category_id, payee, amount, client_id, notes, vendor_bill_line_id)
select '$FIRM', '2026-10-15', category_id, 'Old Vendor', 300, client_id, 'Bill #OLD-1 – Licences', id
from public.vendor_bill_lines where id = '00000000-0000-4000-8000-0000000000d1';
select set_config('app.vendor_bill_internal', 'off', false);
SQL

snapshot() {
  psql -A -F ' | ' <<SQL
select 'bill', bill_number, status, total, amount_paid, updated_at from public.vendor_bills where firm_id = '$FIRM' order by bill_number;
select 'audit rows on bills', count(*) from public.audit_log where entity_type = 'vendor_bills' and entity_id in (select id from public.vendor_bills where firm_id = '$FIRM');
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '$ADMIN', true);
select 'pnl', group_key, revenue, labour, gross, direct_expenses, overhead, net
from public.pnl_report('$FIRM', '2026-01-01', '2026-12-31', 'month', null, null)
where row_kind = 'total' or labour <> '0.00' or direct_expenses <> '0.00'
order by row_kind, group_key;
commit;
SQL
}

echo "== before (at 050)"
snapshot | tee /tmp/trueup-before.txt

echo "== apply 20261119000051"
npx supabase migration up 2>&1 | grep -i "applying\|applied\|error"

echo "== after (at 051)"
snapshot | tee /tmp/trueup-after.txt
psql -A -F ' | ' -c "select 'line', b.bill_number, l.kind, l.count_mode, l.amount from public.vendor_bill_lines l join public.vendor_bills b on b.id = l.bill_id where l.firm_id = '$FIRM' order by b.bill_number, l.position;"
psql -A -F ' | ' -c "select 'audit rows on lines (backfill)', count(*) from public.audit_log where entity_type = 'vendor_bill_lines' and action = 'update' and entity_id in (select id from public.vendor_bill_lines where firm_id = '$FIRM');"

echo "== before vs after"
if diff /tmp/trueup-before.txt /tmp/trueup-after.txt; then echo "IDENTICAL"; else echo "DIFFERENT"; fi

echo "== the pending legacy bill can't be approved"
psql -A <<SQL || true
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '$ADMIN', true);
select public.approve_vendor_bill('00000000-0000-4000-8000-0000000000b2');
rollback;
SQL

echo "== reset to the latest migrations"
npx supabase db reset 2>&1 | grep -i "finished"
