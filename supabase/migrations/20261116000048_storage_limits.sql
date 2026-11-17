-- Storage limits: each firm's allowance, its usage (everything under firms/<id>/ in firm-files),
-- a breakdown by kind, a paged file list, the platform owner's storage grant, and the 95% alert latch.

alter table public.firms
  add column storage_included_bytes bigint not null default 5368709120 check (storage_included_bytes >= 0),
  add column storage_blocks integer not null default 0 check (storage_blocks >= 0),
  add column storage_grant_gb integer not null default 0 check (storage_grant_gb >= 0),
  add column storage_alert_sent boolean not null default false;
-- Not granted for update to authenticated: only the platform-owner function and the service role change these.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create function public.firm_storage_allowance(p_firm uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select f.storage_included_bytes
       + f.storage_blocks::bigint * 10737418240
       + f.storage_grant_gb::bigint * 1073741824
  from public.firms f
  where f.id = p_firm;
$$;

create function public.firm_storage_used(p_firm uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'firm-files'
    and o.name like 'firms/' || p_firm::text || '/%';
$$;

-- The kind of a stored object, from its folder.
create function public.storage_kind(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 3) = 'attachments' then
      case split_part(p_name, '/', 4)
        when 'payments' then 'payment'
        when 'expenses' then 'expense'
        when 'vendor-bills' then 'vendor_bill'
        when 'vendor-payments' then 'vendor_payment'
        when 'bill-inbox' then 'bill_inbox'
        else 'other'
      end
    when split_part(p_name, '/', 3) = 'invoices' then 'invoice_pdf'
    when split_part(p_name, '/', 3) = 'logo' then 'logo'
    else 'other'
  end;
$$;

revoke execute on function public.firm_storage_allowance(uuid) from public, anon, authenticated;
revoke execute on function public.firm_storage_used(uuid) from public, anon, authenticated;
revoke execute on function public.storage_kind(text) from public, anon, authenticated;
grant execute on function public.firm_storage_allowance(uuid) to service_role;
grant execute on function public.firm_storage_used(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Firm functions (admins and managers)
-- ---------------------------------------------------------------------------
create function public.firm_storage_status(p_firm uuid)
returns table (used_bytes bigint, allowance_bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query select public.firm_storage_used(p_firm), public.firm_storage_allowance(p_firm);
end;
$$;

create function public.firm_storage_breakdown(p_firm uuid)
returns table (kind text, files integer, bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select public.storage_kind(o.name), count(*)::integer, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
    where o.bucket_id = 'firm-files'
      and o.name like 'firms/' || p_firm::text || '/%'
    group by 1
    order by 1;
end;
$$;

create function public.firm_storage_files(
  p_firm uuid, p_kind text, p_sort text, p_limit integer, p_offset integer
)
returns table (
  path text, kind text, attachment_id uuid, owner_id uuid, record_id uuid, file_name text,
  size_bytes bigint, created_at timestamptz, label text, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  with objs as (
    select o.name, public.storage_kind(o.name) as kind,
           coalesce((o.metadata ->> 'size')::bigint, 0) as size_bytes, o.created_at
    from storage.objects o
    where o.bucket_id = 'firm-files'
      and o.name like 'firms/' || p_firm::text || '/%'
      and split_part(o.name, '/', array_length(string_to_array(o.name, '/'), 1)) not like 'incoming-%'
  ),
  rows as (
    select
      ob.name as path,
      ob.kind,
      a.id as attachment_id,
      case ob.kind
        when 'payment' then a.payment_id
        when 'expense' then a.expense_id
        when 'vendor_bill' then a.vendor_bill_id
        when 'vendor_payment' then a.vendor_payment_id
        when 'bill_inbox' then a.bill_inbox_item_id
        when 'invoice_pdf' then i.id
        else null
      end as owner_id,
      case ob.kind
        when 'payment' then p.invoice_id
        when 'expense' then a.expense_id
        when 'vendor_bill' then a.vendor_bill_id
        when 'vendor_payment' then vp.bill_id
        when 'bill_inbox' then a.bill_inbox_item_id
        when 'invoice_pdf' then i.id
        else null
      end as record_id,
      case
        when a.id is not null then a.file_name
        when i.id is not null then 'Invoice ' || coalesce(i.number, 'draft') || '.pdf'
        when ob.kind = 'logo' then 'Logo'
        else split_part(ob.name, '/', array_length(string_to_array(ob.name, '/'), 1))
      end as file_name,
      ob.size_bytes,
      ob.created_at,
      case ob.kind
        when 'payment' then 'Payment · ' || coalesce(pi.number, '') || ' · ' || coalesce(p.paid_on::text, '')
        when 'expense' then 'Expense · ' || coalesce(e.payee, '') || ' · ' || coalesce(e.spent_on::text, '')
        when 'vendor_bill' then 'Bill · ' || coalesce(bv.name, '') || ' ' || coalesce(b.bill_number, '')
        when 'vendor_payment' then 'Vendor payment · ' || coalesce(pv.name, '') || ' · ' || coalesce(vp.paid_on::text, '')
        when 'bill_inbox' then 'Bill inbox · ' || coalesce(nullif(bi.subject, ''), '(no subject)')
        when 'invoice_pdf' then 'Invoice ' || coalesce(i.number, 'draft')
        when 'logo' then 'Firm logo'
        else 'Other'
      end as label
    from objs ob
    left join public.attachments a on a.firm_id = p_firm and a.storage_path = ob.name
    left join public.invoices i on ob.kind = 'invoice_pdf' and i.firm_id = p_firm and i.pdf_path = ob.name
    left join public.payments p on p.firm_id = p_firm and p.id = a.payment_id
    left join public.invoices pi on pi.firm_id = p_firm and pi.id = p.invoice_id
    left join public.expenses e on e.firm_id = p_firm and e.id = a.expense_id
    left join public.vendor_bills b on b.firm_id = p_firm and b.id = a.vendor_bill_id
    left join public.vendors bv on bv.firm_id = p_firm and bv.id = b.vendor_id
    left join public.vendor_payments vp on vp.firm_id = p_firm and vp.id = a.vendor_payment_id
    left join public.vendor_bills vpb on vpb.firm_id = p_firm and vpb.id = vp.bill_id
    left join public.vendors pv on pv.firm_id = p_firm and pv.id = vpb.vendor_id
    left join public.bill_inbox_items bi on bi.firm_id = p_firm and bi.id = a.bill_inbox_item_id
    where p_kind is null or ob.kind = p_kind
  )
  select r.path, r.kind, r.attachment_id, r.owner_id, r.record_id, r.file_name, r.size_bytes, r.created_at, r.label,
         count(*) over ()
  from rows r
  order by
    case when p_sort = 'oldest' then null else r.size_bytes end desc nulls last,
    case when p_sort = 'oldest' then r.created_at end asc nulls last,
    r.path
  limit least(greatest(coalesce(p_limit, 50), 0), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.firm_storage_status(uuid) from public, anon;
revoke execute on function public.firm_storage_breakdown(uuid) from public, anon;
revoke execute on function public.firm_storage_files(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.firm_storage_status(uuid) to authenticated, service_role;
grant execute on function public.firm_storage_breakdown(uuid) to authenticated, service_role;
grant execute on function public.firm_storage_files(uuid, text, text, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 95% alert latch (service role only): true exactly once per crossing; re-arms below 90%.
-- ---------------------------------------------------------------------------
create function public.storage_alert_check(p_firm uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_used bigint := public.firm_storage_used(p_firm);
  v_allow bigint := public.firm_storage_allowance(p_firm);
  v_sent boolean;
begin
  select f.storage_alert_sent into v_sent from public.firms f where f.id = p_firm for update;
  if not found then
    return false;
  end if;
  if v_used * 100 >= v_allow * 95 then
    if not v_sent then
      update public.firms set storage_alert_sent = true where id = p_firm;
      return true;
    end if;
  elsif v_used * 100 < v_allow * 90 and v_sent then
    update public.firms set storage_alert_sent = false where id = p_firm;
  end if;
  return false;
end;
$$;

revoke execute on function public.storage_alert_check(uuid) from public, anon, authenticated;
grant execute on function public.storage_alert_check(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Platform owner
-- ---------------------------------------------------------------------------
create function public.platform_set_storage_grant(p_firm uuid, p_gb integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_owner() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_gb is null or p_gb < 0 or p_gb > 10000 then
    raise exception 'INVALID_STORAGE_GRANT' using errcode = 'P0001';
  end if;
  update public.firms set storage_grant_gb = p_gb where id = p_firm;
  if not found then
    raise exception 'FIRM_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.platform_set_storage_grant(uuid, integer) from public, anon;
grant execute on function public.platform_set_storage_grant(uuid, integer) to authenticated, service_role;

-- platform_firms gains usage and allowance (return type changes, so drop and recreate).
drop function public.platform_firms(text, integer, integer);
create function public.platform_firms(p_search text, p_limit integer, p_offset integer)
returns table (
  id uuid, name text, created_at timestamptz, admin_emails text[], total_count integer,
  used_bytes bigint, allowance_bytes bigint, storage_grant_gb integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with matched as (
    select f.id, f.name, f.created_at, f.storage_grant_gb
    from public.firms f
    where public.is_platform_owner()
      and (
        nullif(btrim(p_search), '') is null
        or f.name ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
  ),
  page as (
    select m.*, (select count(*)::integer from matched) as total_count
    from matched m
    order by m.created_at desc, m.id
    limit least(greatest(coalesce(p_limit, 50), 0), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    pg.id,
    pg.name,
    pg.created_at,
    array(
      select p.email
      from public.firm_members fm
      join public.profiles p on p.user_id = fm.user_id
      where fm.firm_id = pg.id and fm.role = 'admin'
      order by p.email
    ),
    pg.total_count,
    public.firm_storage_used(pg.id),
    public.firm_storage_allowance(pg.id),
    pg.storage_grant_gb
  from page pg
  order by pg.created_at desc, pg.id;
$$;

revoke execute on function public.platform_firms(text, integer, integer) from public, anon;
grant execute on function public.platform_firms(text, integer, integer) to authenticated, service_role;
