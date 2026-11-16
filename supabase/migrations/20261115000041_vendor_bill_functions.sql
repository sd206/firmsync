-- Vendor bill workflow: save, approve (admin), reject (admin), void (admin), payments,
-- attachments and the contractor check. All role-checked; each runs in one transaction.

create function public.vendor_bill_set_internal()
returns void
language sql
set search_path = ''
as $$
  select set_config('app.vendor_bill_internal', 'on', true);
$$;
revoke execute on function public.vendor_bill_set_internal() from public, anon, authenticated;

-- Lock a bill and check the caller's role on its firm. Internal.
create function public.vendor_bill_lock(p_bill uuid, p_roles public.firm_role[])
returns public.vendor_bills
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
begin
  select * into v from public.vendor_bills b where b.id = p_bill for update;
  if not found then
    raise exception 'BILL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.has_role(v.firm_id, p_roles) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return v;
end;
$$;
revoke execute on function public.vendor_bill_lock(uuid, public.firm_role[]) from public, anon, authenticated;

-- Recompute amount_paid and the paid status from payments. Internal.
create function public.vendor_bill_apply_payments(p_bill uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paid numeric;
begin
  perform public.vendor_bill_set_internal();
  select coalesce(sum(p.amount), 0) into v_paid from public.vendor_payments p where p.bill_id = p_bill;
  update public.vendor_bills b
  set amount_paid = v_paid,
      status = case when v_paid = 0 then 'approved'::public.vendor_bill_status
                    when v_paid >= b.total then 'paid'::public.vendor_bill_status
                    else 'partly_paid'::public.vendor_bill_status end
  where b.id = p_bill and b.status in ('approved', 'partly_paid', 'paid');
end;
$$;
revoke execute on function public.vendor_bill_apply_payments(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Save (new or edit while pending/rejected). Replaces all lines; resubmits a rejected bill.
-- p_lines: [{kind, description, amount, category_id, client_id, project_id, consultant_id}]
-- ---------------------------------------------------------------------------
create or replace function public.save_vendor_bill(
  p_bill uuid, p_firm uuid, p_vendor uuid, p_number text, p_bill_date date, p_due_date date,
  p_period_start date, p_period_end date, p_notes text, p_lines jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
  v_id uuid;
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'BILL_EMPTY' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'BILL_TOO_MANY_LINES' using errcode = 'P0001';
  end if;
  -- Contractor lines may only name consultants supplied by this vendor.
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as l(consultant_id uuid)
    where l.consultant_id is not null and not exists (
      select 1 from public.consultants c where c.firm_id = p_firm and c.id = l.consultant_id and c.vendor_id = p_vendor
    )
  ) then
    raise exception 'BILL_CONSULTANT' using errcode = 'P0001';
  end if;

  if p_bill is null then
    insert into public.vendor_bills (firm_id, vendor_id, bill_number, bill_date, due_date, period_start, period_end, notes)
    values (p_firm, p_vendor, p_number, p_bill_date, p_due_date, p_period_start, p_period_end, p_notes)
    returning id into v_id;
  else
    v := public.vendor_bill_lock(p_bill, '{admin,manager}'::public.firm_role[]);
    if v.firm_id <> p_firm then
      raise exception 'BILL_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v.status not in ('pending_approval', 'rejected') then
      raise exception 'BILL_LOCKED' using errcode = 'P0001';
    end if;
    perform public.vendor_bill_set_internal();
    update public.vendor_bills b
    set vendor_id = p_vendor, bill_number = btrim(p_number), bill_date = p_bill_date, due_date = p_due_date,
        period_start = p_period_start, period_end = p_period_end, notes = nullif(btrim(p_notes), ''),
        status = 'pending_approval', rejected_reason = null
    where b.id = v.id;
    delete from public.vendor_bill_lines l where l.bill_id = v.id;
    v_id := v.id;
  end if;

  insert into public.vendor_bill_lines (firm_id, bill_id, position, kind, description, amount, category_id, client_id, project_id, consultant_id)
  select p_firm, v_id, e.n::integer, e.j->>'kind', e.j->>'description', round((e.j->>'amount')::numeric, 2),
         nullif(e.j->>'category_id', '')::uuid, nullif(e.j->>'client_id', '')::uuid,
         nullif(e.j->>'project_id', '')::uuid, nullif(e.j->>'consultant_id', '')::uuid
  from jsonb_array_elements(p_lines) with ordinality as e(j, n);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve (admin): expense lines become expenses on the bill date.
-- ---------------------------------------------------------------------------
create function public.approve_vendor_bill(p_bill uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
  v_vendor text;
begin
  v := public.vendor_bill_lock(p_bill, '{admin}'::public.firm_role[]);
  if v.status <> 'pending_approval' then
    raise exception 'BILL_NOT_PENDING' using errcode = 'P0001';
  end if;
  select name into v_vendor from public.vendors where firm_id = v.firm_id and id = v.vendor_id;
  perform public.vendor_bill_set_internal();
  update public.vendor_bills b
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where b.id = v.id;

  insert into public.expenses (firm_id, spent_on, category_id, payee, amount, client_id, project_id, notes, vendor_bill_line_id)
  select v.firm_id, v.bill_date, l.category_id, left(v_vendor, 200), l.amount, l.client_id, l.project_id,
         left('Bill #' || v.bill_number || ' – ' || l.description, 1000), l.id
  from public.vendor_bill_lines l
  where l.bill_id = v.id and l.kind = 'expense'
  order by l.position;
end;
$$;

create function public.reject_vendor_bill(p_bill uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
begin
  v := public.vendor_bill_lock(p_bill, '{admin}'::public.firm_role[]);
  if v.status <> 'pending_approval' then
    raise exception 'BILL_NOT_PENDING' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    raise exception 'REJECT_REASON' using errcode = 'P0001';
  end if;
  perform public.vendor_bill_set_internal();
  update public.vendor_bills b set status = 'rejected', rejected_reason = btrim(p_reason) where b.id = v.id;
end;
$$;

-- Void (admin): only without payments; removes the expenses approval created.
create function public.void_vendor_bill(p_bill uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
begin
  v := public.vendor_bill_lock(p_bill, '{admin}'::public.firm_role[]);
  if v.status = 'void' then
    raise exception 'BILL_STATE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.vendor_payments p where p.bill_id = v.id) then
    raise exception 'BILL_HAS_PAYMENTS' using errcode = 'P0001';
  end if;
  delete from public.expenses e
  where e.firm_id = v.firm_id and e.vendor_bill_line_id in (select l.id from public.vendor_bill_lines l where l.bill_id = v.id);
  perform public.vendor_bill_set_internal();
  update public.vendor_bills b set status = 'void', rejected_reason = null where b.id = v.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create function public.record_vendor_payment(
  p_bill uuid, p_amount numeric, p_paid_on date, p_method public.payment_method, p_reference text, p_notes text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
  v_amount numeric := round(p_amount, 2);
  v_id uuid;
begin
  v := public.vendor_bill_lock(p_bill, '{admin,manager}'::public.firm_role[]);
  if v.status not in ('approved', 'partly_paid') then
    raise exception 'BILL_NOT_PAYABLE' using errcode = 'P0001';
  end if;
  if p_paid_on > current_date then
    raise exception 'PAYMENT_FUTURE' using errcode = 'P0001';
  end if;
  if v_amount > 0 and v.amount_paid + v_amount > v.total then
    raise exception 'VENDOR_PAYMENT_TOO_LARGE' using errcode = 'P0001';
  end if;
  insert into public.vendor_payments (firm_id, bill_id, amount, paid_on, method, reference, notes)
  values (v.firm_id, v.id, v_amount, p_paid_on, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''))
  returning id into v_id;
  perform public.vendor_bill_apply_payments(v.id);
  return v_id;
end;
$$;

-- Deletes a payment; returns its attachment storage paths for the caller to remove.
create function public.delete_vendor_payment(p_payment uuid)
returns setof text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_bill uuid;
  v public.vendor_bills%rowtype;
begin
  select p.bill_id into v_bill from public.vendor_payments p where p.id = p_payment;
  if not found then
    raise exception 'VENDOR_PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  v := public.vendor_bill_lock(v_bill, '{admin,manager}'::public.firm_role[]);
  return query select a.storage_path from public.attachments a where a.vendor_payment_id = p_payment;
  delete from public.vendor_payments p where p.id = p_payment;
  perform public.vendor_bill_apply_payments(v.id);
end;
$$;

-- Records an uploaded file against a bill ('bill') or a payment ('payment').
create function public.add_vendor_attachment(
  p_owner_kind text, p_owner uuid, p_storage_path text, p_file_name text, p_mime text, p_size integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_firm uuid;
  v_prefix text;
  v_rest text;
  v_id uuid;
begin
  if p_owner_kind = 'bill' then
    select b.firm_id into v_firm from public.vendor_bills b where b.id = p_owner;
    v_prefix := 'firms/' || v_firm::text || '/attachments/vendor-bills/' || p_owner::text || '/';
  elsif p_owner_kind = 'payment' then
    select p.firm_id into v_firm from public.vendor_payments p where p.id = p_owner;
    v_prefix := 'firms/' || v_firm::text || '/attachments/vendor-payments/' || p_owner::text || '/';
  else
    raise exception 'invalid owner kind' using errcode = '22023';
  end if;
  if v_firm is null then
    raise exception 'BILL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.has_role(v_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_rest := substr(p_storage_path, length(v_prefix) + 1);
  if p_storage_path is null or left(p_storage_path, length(v_prefix)) <> v_prefix
     or v_rest !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|heic)$' then
    raise exception 'attachments_path_chk: path is outside the bill folder' using errcode = '23514';
  end if;
  insert into public.attachments (firm_id, vendor_bill_id, vendor_payment_id, storage_path, file_name, mime_type, size_bytes)
  values (v_firm,
          case when p_owner_kind = 'bill' then p_owner end,
          case when p_owner_kind = 'payment' then p_owner end,
          p_storage_path, left(btrim(p_file_name), 120), p_mime, p_size)
  returning id into v_id;
  return v_id;
end;
$$;

-- Approved hours x cost rate for the vendor's consultants in the bill's service period.
create function public.vendor_bill_contractor_check(p_bill uuid)
returns table (consultant_id uuid, consultant_name text, hours text, expected text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
begin
  select * into v from public.vendor_bills b where b.id = p_bill;
  if not found then
    raise exception 'BILL_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.has_role(v.firm_id, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v.period_start is null then
    return;
  end if;
  return query
  select c.id, c.name,
         sum(te.hours)::numeric(12, 2)::text,
         sum(round(te.hours * coalesce(te.cost_rate_snapshot, 0), 2))::numeric(12, 2)::text
  from public.time_entries te
  join public.timesheets ts on ts.firm_id = te.firm_id and ts.id = te.timesheet_id
  join public.consultants c on c.firm_id = ts.firm_id and c.id = ts.consultant_id
  where ts.firm_id = v.firm_id
    and ts.status = 'approved'
    and c.vendor_id = v.vendor_id
    and te.work_date between v.period_start and v.period_end
  group by c.id, c.name
  order by c.name;
end;
$$;

revoke execute on function public.save_vendor_bill(uuid, uuid, uuid, text, date, date, date, date, text, jsonb) from public, anon;
grant execute on function public.save_vendor_bill(uuid, uuid, uuid, text, date, date, date, date, text, jsonb) to authenticated;
revoke execute on function public.approve_vendor_bill(uuid) from public, anon;
grant execute on function public.approve_vendor_bill(uuid) to authenticated;
revoke execute on function public.reject_vendor_bill(uuid, text) from public, anon;
grant execute on function public.reject_vendor_bill(uuid, text) to authenticated;
revoke execute on function public.void_vendor_bill(uuid) from public, anon;
grant execute on function public.void_vendor_bill(uuid) to authenticated;
revoke execute on function public.record_vendor_payment(uuid, numeric, date, public.payment_method, text, text) from public, anon;
grant execute on function public.record_vendor_payment(uuid, numeric, date, public.payment_method, text, text) to authenticated;
revoke execute on function public.delete_vendor_payment(uuid) from public, anon;
grant execute on function public.delete_vendor_payment(uuid) to authenticated;
revoke execute on function public.add_vendor_attachment(text, uuid, text, text, text, integer) from public, anon;
grant execute on function public.add_vendor_attachment(text, uuid, text, text, text, integer) to authenticated;
revoke execute on function public.vendor_bill_contractor_check(uuid) from public, anon;
grant execute on function public.vendor_bill_contractor_check(uuid) to authenticated;
