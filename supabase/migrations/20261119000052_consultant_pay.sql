-- Consultant pay rate and "My hours and pay" (checklist item 29).
-- Design: docs/superpowers/specs/2026-11-19-consultant-pay-design.md
--
-- 1. The cost rate is called the pay rate in the app; the columns keep their names.
-- 2. timesheets.approved_vendor_id records, at approval, the vendor that employed the consultant
--    (null = paid directly), so a later change of Type never changes how past weeks read.
--    approve_timesheet sets it, reopen_timesheet clears it.
-- 3. consultant_pay_weeks / consultant_pay_months / my_consultant_id: read functions for the
--    "My hours and pay" page. A consultant reads only their own rows; admins and managers read any
--    consultant in their firm. Rates and amounts are returned only for approved, directly-paid
--    weeks, to every caller.
-- Additive and safe on a live database: one nullable column, constraints added NOT VALID then
-- validated, a backfill of approved timesheets, and replaced/new functions.

comment on column public.consultant_cost_rates.hourly_cost is
  'The consultant''s pay rate per hour (shown as "Pay rate"); labour cost in the P&L.';
comment on column public.time_entries.cost_rate_snapshot is
  'The consultant''s pay rate frozen on approval (shown as "Pay rate").';

-- ---------------------------------------------------------------------------
-- 1. Paid through, recorded per approved week
-- ---------------------------------------------------------------------------
alter table public.timesheets add column approved_vendor_id uuid;
comment on column public.timesheets.approved_vendor_id is
  'Set on approval: the vendor that employed the consultant then (null = paid directly).';

alter table public.timesheets
  add constraint timesheets_approved_vendor_fk foreign key (firm_id, approved_vendor_id)
    references public.vendors (firm_id, id) on delete restrict not valid;
alter table public.timesheets
  add constraint timesheets_approved_vendor_chk
    check (approved_vendor_id is null or status = 'approved') not valid;

update public.timesheets t
set approved_vendor_id = c.vendor_id
from public.consultants c
where c.firm_id = t.firm_id
  and c.id = t.consultant_id
  and t.status = 'approved'
  and c.vendor_id is not null;

alter table public.timesheets validate constraint timesheets_approved_vendor_fk;
alter table public.timesheets validate constraint timesheets_approved_vendor_chk;

create index timesheets_approved_vendor_idx on public.timesheets (firm_id, approved_vendor_id)
  where approved_vendor_id is not null;

-- ---------------------------------------------------------------------------
-- 2. approve / reopen (bodies from 20261109000012 / 20261109000011, plus approved_vendor_id)
-- ---------------------------------------------------------------------------
create or replace function public.approve_timesheet(p_timesheet uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ts public.timesheets%rowtype;
begin
  select * into v_ts from public.timesheets t where t.id = p_timesheet for update;
  if not found then
    raise exception 'TIMESHEET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_role(v_ts.firm_id, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if v_ts.status <> 'submitted' then
    raise exception 'TIMESHEET_STATE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.time_entries e
    where e.firm_id = v_ts.firm_id
      and e.timesheet_id = v_ts.id
      and not exists (
        select 1 from public.project_assignments a
        where a.firm_id = e.firm_id
          and a.project_id = e.project_id
          and a.consultant_id = v_ts.consultant_id
          and a.effective_from <= e.work_date
          and (a.effective_to is null or a.effective_to >= e.work_date)
      )
  ) then
    raise exception 'NO_ASSIGNMENT' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.time_entries e
    where e.firm_id = v_ts.firm_id
      and e.timesheet_id = v_ts.id
      and not exists (
        select 1 from public.consultant_cost_rates r
        where r.firm_id = e.firm_id
          and r.consultant_id = v_ts.consultant_id
          and r.effective_from <= e.work_date
      )
  ) then
    raise exception 'COST_RATE_MISSING' using errcode = 'P0001';
  end if;

  -- project_assignments_no_overlap guarantees at most one assignment per
  -- (project, consultant, day), so the client-rate subquery is single-row.
  update public.time_entries e
  set
    client_rate_snapshot = (
      select a.client_rate from public.project_assignments a
      where a.firm_id = e.firm_id
        and a.project_id = e.project_id
        and a.consultant_id = v_ts.consultant_id
        and a.effective_from <= e.work_date
        and (a.effective_to is null or a.effective_to >= e.work_date)
    ),
    cost_rate_snapshot = (
      select r.hourly_cost from public.consultant_cost_rates r
      where r.firm_id = e.firm_id
        and r.consultant_id = v_ts.consultant_id
        and r.effective_from <= e.work_date
      order by r.effective_from desc
      limit 1
    )
  where e.firm_id = v_ts.firm_id and e.timesheet_id = v_ts.id;

  if exists (
    select 1 from public.time_entries e
    where e.firm_id = v_ts.firm_id
      and e.timesheet_id = v_ts.id
      and e.client_rate_snapshot is null
  ) then
    raise exception 'NO_ASSIGNMENT' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.time_entries e
    where e.firm_id = v_ts.firm_id
      and e.timesheet_id = v_ts.id
      and e.cost_rate_snapshot is null
  ) then
    raise exception 'COST_RATE_MISSING' using errcode = 'P0001';
  end if;

  update public.timesheets
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_comment = null,
      approved_vendor_id = (
        select c.vendor_id from public.consultants c
        where c.firm_id = v_ts.firm_id and c.id = v_ts.consultant_id
      )
  where id = v_ts.id;
end;
$$;

create or replace function public.reopen_timesheet(p_timesheet uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ts public.timesheets%rowtype;
begin
  select * into v_ts from public.timesheets t where t.id = p_timesheet for update;
  if not found then
    raise exception 'TIMESHEET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_role(v_ts.firm_id, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if v_ts.status <> 'approved' then
    raise exception 'TIMESHEET_STATE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.time_entries e
    where e.firm_id = v_ts.firm_id
      and e.timesheet_id = v_ts.id
      and e.invoice_line_id is not null
  ) then
    raise exception 'TIMESHEET_INVOICED' using errcode = 'P0001';
  end if;

  update public.time_entries e
  set client_rate_snapshot = null, cost_rate_snapshot = null
  where e.firm_id = v_ts.firm_id and e.timesheet_id = v_ts.id;

  update public.timesheets
  set status = 'draft', submitted_at = null, decided_by = null, decided_at = null,
      decision_comment = null, approved_vendor_id = null
  where id = v_ts.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Read functions for "My hours and pay"
-- ---------------------------------------------------------------------------

-- The caller's own consultant record in p_firm (still a member), or null.
create function public.my_consultant_id(p_firm uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.consultants c
  where c.firm_id = p_firm
    and c.user_id = auth.uid()
    and public.is_member(p_firm)
$$;
revoke execute on function public.my_consultant_id(uuid) from public, anon;
grant execute on function public.my_consultant_id(uuid) to authenticated;

-- One row per timesheet whose week starts in [p_from, p_to], newest first. Rates and gross only
-- for approved weeks paid directly; employer_name only for approved weeks paid by a vendor.
create function public.consultant_pay_weeks(p_firm uuid, p_consultant uuid, p_from date, p_to date)
returns table (
  week_start date,
  status text,
  decision_comment text,
  hours numeric,
  pay_rates numeric[],
  gross numeric(12, 2),
  employer_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can_edit_consultant_time(p_firm, p_consultant) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  select
    t.week_start,
    t.status::text,
    t.decision_comment,
    coalesce((select sum(e.hours) from public.time_entries e
              where e.firm_id = t.firm_id and e.timesheet_id = t.id), 0)::numeric,
    case when t.status = 'approved' and t.approved_vendor_id is null then
      (select array_agg(distinct e.cost_rate_snapshot order by e.cost_rate_snapshot)
       from public.time_entries e
       where e.firm_id = t.firm_id and e.timesheet_id = t.id)
    end,
    case when t.status = 'approved' and t.approved_vendor_id is null then
      (select round(coalesce(sum(e.hours * e.cost_rate_snapshot), 0), 2)
       from public.time_entries e
       where e.firm_id = t.firm_id and e.timesheet_id = t.id)::numeric(12, 2)
    end,
    case when t.status = 'approved' then v.name end
  from public.timesheets t
  left join public.vendors v on v.firm_id = t.firm_id and v.id = t.approved_vendor_id
  where t.firm_id = p_firm
    and t.consultant_id = p_consultant
    and t.week_start between p_from and p_to
  order by t.week_start desc;
end;
$$;
revoke execute on function public.consultant_pay_weeks(uuid, uuid, date, date) from public, anon;
grant execute on function public.consultant_pay_weeks(uuid, uuid, date, date) to authenticated;

-- Approved hours by calendar month of the work date in [p_from, p_to], one row per month and
-- Paid through. gross only for directly-paid rows.
create function public.consultant_pay_months(p_firm uuid, p_consultant uuid, p_from date, p_to date)
returns table (month date, hours numeric, gross numeric(12, 2), employer_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can_edit_consultant_time(p_firm, p_consultant) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  select
    date_trunc('month', e.work_date)::date,
    sum(e.hours)::numeric,
    case when t.approved_vendor_id is null
      then round(sum(e.hours * e.cost_rate_snapshot), 2)::numeric(12, 2) end,
    v.name
  from public.timesheets t
  join public.time_entries e on e.firm_id = t.firm_id and e.timesheet_id = t.id
  left join public.vendors v on v.firm_id = t.firm_id and v.id = t.approved_vendor_id
  where t.firm_id = p_firm
    and t.consultant_id = p_consultant
    and t.status = 'approved'
    and e.work_date between p_from and p_to
  group by date_trunc('month', e.work_date), t.approved_vendor_id, v.name
  order by 1, 4 nulls first;
end;
$$;
revoke execute on function public.consultant_pay_months(uuid, uuid, date, date) from public, anon;
grant execute on function public.consultant_pay_months(uuid, uuid, date, date) to authenticated;
