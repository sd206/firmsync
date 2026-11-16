-- Receivables and Payables reports: who owes the firm, what the firm owes vendors.
-- Only documents with something left to pay count (as in the Unpaid invoices list).
-- Balances are as of p_today (passed in by the app). Admins and managers only.

-- ---------------------------------------------------------------------------
-- Receivables: one row per client with an open balance.
-- ---------------------------------------------------------------------------
create or replace function public.receivables_report(p_firm uuid, p_today date, p_clients uuid[], p_overdue_only boolean)
returns table (
  client_id uuid,
  client_name text,
  not_due text,
  d1_30 text,
  d31_60 text,
  d61_90 text,
  d90_plus text,
  total text,
  oldest_overdue_days integer,
  open_invoices integer,
  avg_days_to_pay text,
  avg_days_late text
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
  with open_inv as (
    select i.client_id, (i.total - i.amount_paid) as bal, (p_today - i.due_date) as late
    from public.invoices i
    where i.firm_id = p_firm
      and i.status in ('issued', 'partly_paid')
      and i.total - i.amount_paid > 0
      and (p_clients is null or i.client_id = any (p_clients))
      and (not coalesce(p_overdue_only, false) or p_today - i.due_date > 0)
  ),
  agg as (
    select o.client_id,
           coalesce(sum(o.bal) filter (where o.late <= 0), 0) as nd,
           coalesce(sum(o.bal) filter (where o.late between 1 and 30), 0) as b1,
           coalesce(sum(o.bal) filter (where o.late between 31 and 60), 0) as b2,
           coalesce(sum(o.bal) filter (where o.late between 61 and 90), 0) as b3,
           coalesce(sum(o.bal) filter (where o.late > 90), 0) as b4,
           sum(o.bal) as tot,
           greatest(max(o.late), 0) as oldest,
           count(*) as n
    from open_inv o
    group by o.client_id
  ),
  paid as (
    select i.client_id,
           (p.last_paid - i.issue_date) as to_pay,
           greatest(p.last_paid - i.due_date, 0) as late
    from public.invoices i
    join (
      select pm.invoice_id, max(pm.paid_on) as last_paid
      from public.payments pm
      where pm.firm_id = p_firm
      group by pm.invoice_id
    ) p on p.invoice_id = i.id
    where i.firm_id = p_firm
      and i.status = 'paid'
      and p.last_paid > p_today - 365
      and p.last_paid <= p_today
  ),
  hist as (
    select h.client_id, avg(h.to_pay) as to_pay, avg(h.late) as late
    from paid h
    group by h.client_id
  )
  select a.client_id, c.name,
         a.nd::numeric(12, 2)::text,
         a.b1::numeric(12, 2)::text,
         a.b2::numeric(12, 2)::text,
         a.b3::numeric(12, 2)::text,
         a.b4::numeric(12, 2)::text,
         a.tot::numeric(12, 2)::text,
         a.oldest::integer,
         a.n::integer,
         round(h.to_pay::numeric, 1)::text,
         round(h.late::numeric, 1)::text
  from agg a
  join public.clients c on c.firm_id = p_firm and c.id = a.client_id
  left join hist h on h.client_id = a.client_id
  order by (a.b1 + a.b2 + a.b3 + a.b4) desc, c.name;
end;
$$;

revoke execute on function public.receivables_report(uuid, date, uuid[], boolean) from public, anon;
grant execute on function public.receivables_report(uuid, date, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Receivables detail: open invoices.
-- ---------------------------------------------------------------------------
create or replace function public.receivables_invoices(p_firm uuid, p_today date, p_clients uuid[], p_overdue_only boolean)
returns table (
  invoice_id uuid,
  number text,
  client_id uuid,
  client_name text,
  issue_date date,
  due_date date,
  total text,
  amount_paid text,
  balance text,
  days_overdue integer
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
  select i.id, i.number, i.client_id, c.name, i.issue_date, i.due_date,
         i.total::numeric(12, 2)::text,
         i.amount_paid::numeric(12, 2)::text,
         (i.total - i.amount_paid)::numeric(12, 2)::text,
         (p_today - i.due_date)::integer
  from public.invoices i
  join public.clients c on c.firm_id = i.firm_id and c.id = i.client_id
  where i.firm_id = p_firm
    and i.status in ('issued', 'partly_paid')
    and i.total - i.amount_paid > 0
    and (p_clients is null or i.client_id = any (p_clients))
    and (not coalesce(p_overdue_only, false) or p_today - i.due_date > 0)
  order by c.name, i.due_date, i.number;
end;
$$;

revoke execute on function public.receivables_invoices(uuid, date, uuid[], boolean) from public, anon;
grant execute on function public.receivables_invoices(uuid, date, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Payables: one row per vendor with an approved balance or a bill awaiting approval.
-- ---------------------------------------------------------------------------
create or replace function public.payables_report(p_firm uuid, p_today date, p_vendors uuid[], p_overdue_only boolean)
returns table (
  vendor_id uuid,
  vendor_name text,
  due_7 text,
  due_8_30 text,
  due_later text,
  d1_30 text,
  d31_60 text,
  d61_90 text,
  d90_plus text,
  total text,
  awaiting_approval text,
  awaiting_count integer,
  oldest_overdue_days integer
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
  with open_bills as (
    select b.vendor_id, (b.total - b.amount_paid) as bal, (p_today - b.due_date) as late,
           (b.status = 'pending_approval') as pending
    from public.vendor_bills b
    where b.firm_id = p_firm
      and b.status in ('approved', 'partly_paid', 'pending_approval')
      and b.total - b.amount_paid > 0
      and (p_vendors is null or b.vendor_id = any (p_vendors))
      and (not coalesce(p_overdue_only, false) or p_today - b.due_date > 0)
  ),
  agg as (
    select o.vendor_id,
           coalesce(sum(o.bal) filter (where not o.pending and o.late between -7 and 0), 0) as s7,
           coalesce(sum(o.bal) filter (where not o.pending and o.late between -30 and -8), 0) as s30,
           coalesce(sum(o.bal) filter (where not o.pending and o.late < -30), 0) as later,
           coalesce(sum(o.bal) filter (where not o.pending and o.late between 1 and 30), 0) as b1,
           coalesce(sum(o.bal) filter (where not o.pending and o.late between 31 and 60), 0) as b2,
           coalesce(sum(o.bal) filter (where not o.pending and o.late between 61 and 90), 0) as b3,
           coalesce(sum(o.bal) filter (where not o.pending and o.late > 90), 0) as b4,
           coalesce(sum(o.bal) filter (where not o.pending), 0) as tot,
           coalesce(sum(o.bal) filter (where o.pending), 0) as aw,
           count(*) filter (where o.pending) as awn,
           greatest(coalesce(max(o.late) filter (where not o.pending), 0), 0) as oldest
    from open_bills o
    group by o.vendor_id
  )
  select a.vendor_id, v.name,
         a.s7::numeric(12, 2)::text,
         a.s30::numeric(12, 2)::text,
         a.later::numeric(12, 2)::text,
         a.b1::numeric(12, 2)::text,
         a.b2::numeric(12, 2)::text,
         a.b3::numeric(12, 2)::text,
         a.b4::numeric(12, 2)::text,
         a.tot::numeric(12, 2)::text,
         a.aw::numeric(12, 2)::text,
         a.awn::integer,
         a.oldest::integer
  from agg a
  join public.vendors v on v.firm_id = p_firm and v.id = a.vendor_id
  order by (a.b1 + a.b2 + a.b3 + a.b4) desc, a.s7 desc, v.name;
end;
$$;

revoke execute on function public.payables_report(uuid, date, uuid[], boolean) from public, anon;
grant execute on function public.payables_report(uuid, date, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Payables detail: approved, partly paid and awaiting-approval bills.
-- ---------------------------------------------------------------------------
create or replace function public.payables_bills(p_firm uuid, p_today date, p_vendors uuid[], p_overdue_only boolean)
returns table (
  bill_id uuid,
  bill_number text,
  vendor_id uuid,
  vendor_name text,
  status text,
  bill_date date,
  due_date date,
  total text,
  amount_paid text,
  balance text,
  days_overdue integer
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
  select b.id, b.bill_number, b.vendor_id, v.name, b.status::text, b.bill_date, b.due_date,
         b.total::numeric(12, 2)::text,
         b.amount_paid::numeric(12, 2)::text,
         (b.total - b.amount_paid)::numeric(12, 2)::text,
         (p_today - b.due_date)::integer
  from public.vendor_bills b
  join public.vendors v on v.firm_id = b.firm_id and v.id = b.vendor_id
  where b.firm_id = p_firm
    and b.status in ('approved', 'partly_paid', 'pending_approval')
    and b.total - b.amount_paid > 0
    and (p_vendors is null or b.vendor_id = any (p_vendors))
    and (not coalesce(p_overdue_only, false) or p_today - b.due_date > 0)
  order by v.name, b.due_date, b.bill_number;
end;
$$;

revoke execute on function public.payables_bills(uuid, date, uuid[], boolean) from public, anon;
grant execute on function public.payables_bills(uuid, date, uuid[], boolean) to authenticated;
