-- Contractor bill true-up (checklist item 28).
-- Design: docs/superpowers/specs/2026-11-19-contractor-trueup-design.md
--
-- Contractor cost stays counted on approved hours x cost rate (labour). When a contractor bill is
-- approved, each contractor line's difference from the approved hours it covers is counted as a
-- contractor cost adjustment on the bill date. Computed live, never stored, so later approvals,
-- reopened timesheets and re-approvals at a new rate keep labour + adjustment = the bill.
--
-- 1. vendor_bill_lines.count_mode for contractor lines:
--      trueup  a consultant is named: the line covers their approved hours in the bill period
--              (on one project, or all projects when none is named)
--      full    "Not on timesheets": no hours; the whole line counts, against its client or project
--      legacy  lines entered before this release: never counted; block approval until edited
--    Derived by the line trigger (callers can't choose it). Contractor lines may now carry a
--    project (client taken from it) or, when not on timesheets, a client.
-- 2. save_vendor_bill / approve_vendor_bill enforce (BILL_PERIOD_REQUIRED, BILL_CONSULTANT,
--    BILL_CONTRACTOR_TARGET, BILL_LINES_OVERLAP within a bill, BILL_CONTRACTOR_OVERLAP with the
--    other bill's number in the details, BILL_CONTRACTOR_LEGACY): a named consultant needs a bill period and must
--    come from the bill's vendor; not-on-timesheets lines need a client or project; trueup lines
--    may not overlap (same consultant, overlapping period, overlapping project scope) on the same
--    bill or with an approved / part-paid / paid bill.
-- 3. contractor_line_costs: expected cost and adjustment per line and project share.
-- 4. pnl_facts gains measure contractor_adjustment; pnl_report and pnl_breakdown gain
--    contractor_adj (after labour) and subtract it in gross, net and margin.
-- 5. vendor_bill_contractor_check is replaced by contractor_line_costs but kept, deprecated, so the
--    app version live before this release keeps working between db push and the deploy. A later
--    migration drops it.
-- Also: a not-on-timesheets line whose client isn't its project's client is refused (BILL_LINE_CLIENT).

-- ---------------------------------------------------------------------------
-- 1. Lines
-- ---------------------------------------------------------------------------
alter table public.vendor_bill_lines add column count_mode text;

-- Existing contractor lines can't be matched to hours (no consultant was ever recorded): legacy.
-- Totals don't change, so the total trigger is off for the backfill: bills aren't rewritten (no
-- updated_at bump, no bill audit rows). Each line's own change is still audited, once per line.
alter table public.vendor_bill_lines disable trigger vendor_bill_lines_total;
do $$
begin
  perform set_config('app.vendor_bill_internal', 'on', true);
  update public.vendor_bill_lines set count_mode = 'legacy' where kind = 'contractor';
  perform set_config('app.vendor_bill_internal', 'off', true);
end;
$$;
alter table public.vendor_bill_lines enable trigger vendor_bill_lines_total;

alter table public.vendor_bill_lines
  drop constraint vendor_bill_lines_contractor_chk,
  add constraint vendor_bill_lines_mode_chk check (
    (kind = 'expense' and count_mode is null)
    or (kind = 'contractor' and count_mode in ('trueup', 'full', 'legacy'))
  ),
  add constraint vendor_bill_lines_contractor_chk check (
    kind <> 'contractor' or (
      category_id is null and (
        (count_mode = 'trueup' and consultant_id is not null)
        or (count_mode = 'full' and consultant_id is null and num_nonnulls(client_id, project_id) >= 1)
        or count_mode = 'legacy'
      )
    )
  );
create index vendor_bill_lines_consultant_idx on public.vendor_bill_lines (firm_id, consultant_id)
  where kind = 'contractor' and consultant_id is not null;

-- As before (20261115000044), plus: count_mode is derived, and a contractor line's client follows
-- its project (a named consultant's line has no client of its own without a project). The bill
-- row is read with a lock, so a direct line write waits for an approval in flight and then sees
-- the bill as approved (locked), instead of slipping an unchecked line onto it.
create or replace function public.vendor_bill_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.vendor_bill_status;
  v_client uuid;
begin
  if not public.vendor_bill_internal() then
    if tg_op = 'UPDATE' and (new.bill_id is distinct from old.bill_id or new.firm_id is distinct from old.firm_id) then
      select b.status into v_status from public.vendor_bills b where b.firm_id = old.firm_id and b.id = old.bill_id for no key update;
      if found and v_status not in ('pending_approval', 'rejected') then
        raise exception 'BILL_LOCKED' using errcode = 'P0001';
      end if;
      raise exception 'LINE_MOVE' using errcode = 'P0001';
    end if;
    if tg_op <> 'INSERT' then
      select b.status into v_status from public.vendor_bills b where b.firm_id = old.firm_id and b.id = old.bill_id for no key update;
      if found and v_status not in ('pending_approval', 'rejected') then
        raise exception 'BILL_LOCKED' using errcode = 'P0001';
      end if;
    end if;
    if tg_op <> 'DELETE' then
      select b.status into v_status from public.vendor_bills b where b.firm_id = new.firm_id and b.id = new.bill_id for no key update;
      if found and v_status not in ('pending_approval', 'rejected') then
        raise exception 'BILL_LOCKED' using errcode = 'P0001';
      end if;
    end if;
  end if;
  if tg_op <> 'DELETE' then
    new.description := btrim(new.description);
    -- Only this migration (internal) may keep a stored mode such as legacy.
    if tg_op = 'INSERT' or not public.vendor_bill_internal() then
      new.count_mode := case
        when new.kind <> 'contractor' then null
        when new.consultant_id is not null then 'trueup'
        else 'full'
      end;
    end if;
    if new.kind = 'contractor' then
      if new.project_id is not null then
        v_client := (select p.client_id from public.projects p where p.firm_id = new.firm_id and p.id = new.project_id);
        -- Someone not on timesheets names the client and project together: they must agree.
        if new.consultant_id is null and new.client_id is not null and new.client_id is distinct from v_client then
          raise exception 'BILL_LINE_CLIENT' using errcode = 'P0001';
        end if;
        new.client_id := v_client;
      elsif new.consultant_id is not null then
        new.client_id := null;
      end if;
    end if;
    return new;
  end if;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Overlap, save and approve
-- ---------------------------------------------------------------------------
-- The first trueup line that shares hours with one on p_bill: on the same bill, or (with
-- p_other_bills) on an approved, part-paid or paid bill. Returns that bill's number, or null.
create function public.vendor_bill_contractor_overlap(p_bill uuid, p_other_bills boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ob.bill_number
  from public.vendor_bill_lines a
  join public.vendor_bills ab on ab.firm_id = a.firm_id and ab.id = a.bill_id
  join public.vendor_bill_lines o
    on o.firm_id = a.firm_id and o.consultant_id = a.consultant_id and o.id <> a.id
   and o.kind = 'contractor' and o.count_mode = 'trueup'
  join public.vendor_bills ob on ob.firm_id = o.firm_id and ob.id = o.bill_id
  where a.bill_id = p_bill
    and a.kind = 'contractor' and a.count_mode = 'trueup'
    and (ob.id = ab.id or (p_other_bills and ob.status in ('approved', 'partly_paid', 'paid')))
    and ab.period_start <= ob.period_end and ob.period_start <= ab.period_end
    and (a.project_id is null or o.project_id is null or a.project_id = o.project_id)
  order by (ob.id = ab.id) desc, ob.bill_number
  limit 1
$$;
revoke execute on function public.vendor_bill_contractor_overlap(uuid, boolean) from public, anon, authenticated;

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
    select 1 from jsonb_array_elements(p_lines) as e(j)
    where nullif(e.j->>'consultant_id', '') is not null and not exists (
      select 1 from public.consultants c
      where c.firm_id = p_firm and c.id = nullif(e.j->>'consultant_id', '')::uuid and c.vendor_id = p_vendor
    )
  ) then
    raise exception 'BILL_CONSULTANT' using errcode = 'P0001';
  end if;
  -- A named consultant is matched to approved hours in the bill period.
  if (p_period_start is null or p_period_end is null) and exists (
    select 1 from jsonb_array_elements(p_lines) as e(j)
    where e.j->>'kind' = 'contractor' and nullif(e.j->>'consultant_id', '') is not null
  ) then
    raise exception 'BILL_PERIOD_REQUIRED' using errcode = 'P0001';
  end if;
  -- Someone not on timesheets is counted against a client or project.
  if exists (
    select 1 from jsonb_array_elements(p_lines) as e(j)
    where e.j->>'kind' = 'contractor' and nullif(e.j->>'consultant_id', '') is null
      and nullif(e.j->>'client_id', '') is null and nullif(e.j->>'project_id', '') is null
  ) then
    raise exception 'BILL_CONTRACTOR_TARGET' using errcode = 'P0001';
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

  if public.vendor_bill_contractor_overlap(v_id, false) is not null then
    raise exception 'BILL_LINES_OVERLAP' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

create or replace function public.approve_vendor_bill(p_bill uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.vendor_bills%rowtype;
  v_vendor text;
  v_conflict text;
begin
  v := public.vendor_bill_lock(p_bill, '{admin}'::public.firm_role[]);
  if v.status <> 'pending_approval' then
    raise exception 'BILL_NOT_PENDING' using errcode = 'P0001';
  end if;

  -- Lines may also be written directly (RLS allows it while pending), so re-check here.
  if exists (select 1 from public.vendor_bill_lines l where l.bill_id = v.id and l.count_mode = 'legacy') then
    raise exception 'BILL_CONTRACTOR_LEGACY' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.vendor_bill_lines l where l.bill_id = v.id and l.count_mode = 'trueup') then
    if v.period_start is null or v.period_end is null then
      raise exception 'BILL_PERIOD_REQUIRED' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.vendor_bill_lines l
      where l.bill_id = v.id and l.count_mode = 'trueup' and not exists (
        select 1 from public.consultants c where c.firm_id = v.firm_id and c.id = l.consultant_id and c.vendor_id = v.vendor_id
      )
    ) then
      raise exception 'BILL_CONSULTANT' using errcode = 'P0001';
    end if;
    -- Serialise approvals that could overlap: lock the named consultants, in id order.
    -- (no key update: enough to serialise approvals without blocking foreign-key checks.)
    perform 1 from public.consultants c
    where c.firm_id = v.firm_id
      and c.id in (select l.consultant_id from public.vendor_bill_lines l where l.bill_id = v.id and l.count_mode = 'trueup')
    order by c.id
    for no key update;
    if public.vendor_bill_contractor_overlap(v.id, false) is not null then
      raise exception 'BILL_LINES_OVERLAP' using errcode = 'P0001';
    end if;
    v_conflict := public.vendor_bill_contractor_overlap(v.id, true);
    if v_conflict is not null then
      raise exception 'BILL_CONTRACTOR_OVERLAP' using errcode = 'P0001', detail = v_conflict;
    end if;
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

-- ---------------------------------------------------------------------------
-- 3. Expected cost and adjustment per contractor line (and project share)
-- ---------------------------------------------------------------------------
-- p_bill null: lines on approved, part-paid and paid bills dated p_from..p_to (the P&L).
-- p_bill given: that bill's lines whatever its status (the bill page), none for a void bill;
-- p_from / p_to are ignored.
-- trueup: expected = sum(hours x cost_rate_snapshot) of the consultant's approved entries in the
--   bill period (on the line's project, if any), exactly as labour counts them. The adjustment
--   (amount - expected) is split over those projects by expected cost (by hours if that is 0);
--   shares are rounded to 4 places and the largest share takes the remainder. With no matching
--   hours the whole amount is one row on the line's project/client (or unallocated).
-- full: one row, expected 0, adjustment = amount, on the line's client/project.
create function public.contractor_line_costs(p_firm uuid, p_from date, p_to date, p_bill uuid)
returns table (
  line_id uuid,
  bill_id uuid,
  bill_date date,
  count_mode text,
  consultant_id uuid,
  client_id uuid,
  project_id uuid,
  hours numeric,
  expected numeric,
  amount numeric,
  adjustment numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  with ln as (
    -- A line's client is its project's client now (projects can move between clients), as for
    -- hours; the stored client matters only for a client-only line.
    select l.id, l.bill_id, b.bill_date, l.count_mode, l.consultant_id,
           coalesce(lp.client_id, l.client_id) as client_id, l.project_id,
           l.amount::numeric as amount, b.period_start, b.period_end
    from public.vendor_bill_lines l
    join public.vendor_bills b on b.firm_id = l.firm_id and b.id = l.bill_id
    left join public.projects lp on lp.firm_id = l.firm_id and lp.id = l.project_id
    where l.firm_id = p_firm
      and l.kind = 'contractor'
      and l.count_mode in ('trueup', 'full')
      and case
            when p_bill is null then b.status in ('approved', 'partly_paid', 'paid') and b.bill_date between p_from and p_to
            else b.id = p_bill and b.status <> 'void'
          end
  ),
  hrs as (
    select ln.id as line_id, te.project_id, pr.client_id,
           sum(te.hours) as h,
           coalesce(sum(te.hours * te.cost_rate_snapshot), 0) as e
    from ln
    join public.timesheets ts
      on ts.firm_id = p_firm and ts.consultant_id = ln.consultant_id and ts.status = 'approved'
     and ts.week_start between ln.period_start - 6 and ln.period_end
    join public.time_entries te on te.firm_id = ts.firm_id and te.timesheet_id = ts.id
    join public.projects pr on pr.firm_id = te.firm_id and pr.id = te.project_id
    where ln.count_mode = 'trueup'
      and te.work_date between ln.period_start and ln.period_end
      and (ln.project_id is null or te.project_id = ln.project_id)
    group by ln.id, te.project_id, pr.client_id
  ),
  w as (
    select hrs.*, ln.amount,
           sum(hrs.e) over (partition by hrs.line_id) as te_total,
           case when sum(hrs.e) over (partition by hrs.line_id) <> 0 then hrs.e else hrs.h end as wt,
           case when sum(hrs.e) over (partition by hrs.line_id) <> 0
                then sum(hrs.e) over (partition by hrs.line_id)
                else sum(hrs.h) over (partition by hrs.line_id) end as wtot
    from hrs
    join ln on ln.id = hrs.line_id
  ),
  ranked as (
    select w.*, row_number() over (partition by w.line_id order by w.wt desc, w.project_id) as rk
    from w
  ),
  sh as (
    select r.*, r.amount - r.te_total as d,
           case when r.rk = 1 then null else round((r.amount - r.te_total) * r.wt / r.wtot, 4) end as share0
    from ranked r
  ),
  shares as (
    select sh.line_id, sh.project_id, sh.client_id, sh.h, sh.e,
           coalesce(sh.share0, sh.d - coalesce(sum(sh.share0) over (partition by sh.line_id), 0)) as adj
    from sh
  )
  select ln.id, ln.bill_id, ln.bill_date, ln.count_mode, ln.consultant_id, s.client_id, s.project_id,
         s.h, s.e, s.e + s.adj, s.adj
  from ln
  join shares s on s.line_id = ln.id
  union all
  select ln.id, ln.bill_id, ln.bill_date, ln.count_mode, ln.consultant_id, ln.client_id, ln.project_id,
         0::numeric, 0::numeric, ln.amount, ln.amount
  from ln
  where not exists (select 1 from hrs where hrs.line_id = ln.id);
end;
$$;
revoke execute on function public.contractor_line_costs(uuid, date, date, uuid) from public, anon;
grant execute on function public.contractor_line_costs(uuid, date, date, uuid) to authenticated;

-- vendor_bill_contractor_check (20261115000041) stays, unchanged and DEPRECATED: the app no longer
-- calls it, but the previous app version does until the deploy that follows this migration.
-- Drop it in a later migration, once this release is deployed.
comment on function public.vendor_bill_contractor_check(uuid) is
  'DEPRECATED (20261119000051): use contractor_line_costs. Kept for the app version live before that release; drop in a later migration.';

-- ---------------------------------------------------------------------------
-- 4. P&L
-- ---------------------------------------------------------------------------
-- As 20261109000025, plus contractor_adjustment: per contractor line share, by bill date.
create or replace function public.pnl_facts(p_firm uuid, p_from date, p_to date)
returns table (fact_date date, client_id uuid, project_id uuid, measure text, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  with hours as (
    select te.work_date, p.client_id, te.project_id, te.hours,
           te.client_rate_snapshot, te.cost_rate_snapshot
    from public.time_entries te
    join public.timesheets ts on ts.firm_id = te.firm_id and ts.id = te.timesheet_id
    join public.projects p on p.firm_id = te.firm_id and p.id = te.project_id
    where te.firm_id = p_firm
      and ts.status = 'approved'
      and te.work_date between p_from and p_to
  ),
  inv as (
    select i.id, i.issue_date, i.client_id, i.subtotal, i.discount_amount
    from public.invoices i
    where i.firm_id = p_firm
      and i.status in ('issued', 'partly_paid', 'paid')
      and i.issue_date between p_from and p_to
  )
  select h.work_date, h.client_id, h.project_id, 'revenue_hours'::text,
         h.hours * h.client_rate_snapshot
  from hours h
  union all
  select h.work_date, h.client_id, h.project_id, 'labour'::text,
         h.hours * h.cost_rate_snapshot
  from hours h
  union all
  select inv.issue_date, inv.client_id, null::uuid, 'revenue_fees'::text, l.amount
  from inv
  join public.invoice_lines l on l.firm_id = p_firm and l.invoice_id = inv.id
  where l.kind = 'manual'
  union all
  select inv.issue_date, inv.client_id, null::uuid, 'discount'::text, inv.discount_amount::numeric
  from inv
  union all
  select inv.issue_date, inv.client_id, null::uuid, 'invoiced'::text,
         (inv.subtotal - inv.discount_amount)::numeric
  from inv
  union all
  select pay.paid_on, i.client_id, null::uuid, 'collected'::text,
         round(pay.amount * (i.total - i.tax_amount) / i.total, 2)
  from public.payments pay
  join public.invoices i on i.firm_id = pay.firm_id and i.id = pay.invoice_id
  where pay.firm_id = p_firm
    and i.status <> 'void'
    and i.total > 0
    and pay.paid_on between p_from and p_to
  union all
  select e.spent_on, e.client_id, e.project_id,
         case when e.client_id is null and e.project_id is null
              then 'overhead' else 'direct_expense' end::text,
         e.amount::numeric
  from public.expenses e
  where e.firm_id = p_firm
    and e.spent_on between p_from and p_to
  union all
  select c.bill_date, c.client_id, c.project_id, 'contractor_adjustment'::text, c.adjustment
  from public.contractor_line_costs(p_firm, p_from, p_to, null) c;
end;
$$;

-- pnl_report: as 20261110000028 plus contractor_adj after labour. Gross, net and margin subtract
-- it. An adjustment with no client (unallocated) is shown in the Unallocated overhead row under
-- client/project grouping, as overhead is; in period rows it is part of the period.
drop function public.pnl_report(uuid, date, date, text, uuid[], uuid[]);

create function public.pnl_report(
  p_firm uuid,
  p_from date,
  p_to date,
  p_group text,
  p_clients uuid[],
  p_projects uuid[]
)
returns table (
  row_kind text,
  group_key text,
  label text,
  sort_key text,
  revenue_hours text,
  fees text,
  discounts text,
  revenue text,
  labour text,
  contractor_adj text,
  gross text,
  direct_expenses text,
  overhead text,
  net text,
  margin text,
  invoiced text,
  collected text,
  client_label text,
  project_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_periodic boolean := p_group in ('month', 'quarter');
  v_unit text := case when p_group = 'quarter' then 'quarter' else 'month' end;
  v_step interval := case when p_group = 'quarter' then interval '3 months' else interval '1 month' end;
  v_unallocated boolean := p_group in ('client', 'project') and p_clients is null and p_projects is null;
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if p_group is null or p_group not in ('month', 'quarter', 'client', 'project') then
    raise exception 'PNL_GROUP_INVALID' using errcode = 'P0001';
  end if;

  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + interval '3 years' then
    raise exception 'PNL_RANGE_INVALID' using errcode = 'P0001';
  end if;

  return query
  with fk as (
    select x.measure, x.amount, x.client_id, x.project_id,
           case
             when v_periodic then to_char(date_trunc(v_unit, x.fact_date::timestamp), 'YYYY-MM-DD')
             when p_group = 'client' then x.client_id::text
             else coalesce(x.project_id::text, 'client:' || x.client_id::text)
           end as gkey
    from public.pnl_facts(p_firm, p_from, p_to) x
    where (p_clients is null or x.client_id = any (p_clients))
      and (p_projects is null or x.project_id = any (p_projects))
  ),
  periods as (
    select to_char(d, 'YYYY-MM-DD') as gkey,
           case when p_group = 'month' then to_char(d, 'Mon YYYY') else to_char(d, 'YYYY "Q"Q') end as label,
           case when p_group = 'month' then to_char(d, 'YYYY-MM') else to_char(d, 'YYYY-"Q"Q') end as sort_key
    from generate_series(date_trunc(v_unit, p_from::timestamp), p_to::timestamp, v_step) d
    where v_periodic
  ),
  -- Clients / projects with any fact; k1..k7 give the display order.
  named as (
    select c.id::text as gkey, c.name::text as label,
           lower(c.name) as k1, c.name as k2, c.id::text as k3,
           0 as k4, ''::text as k5, ''::text as k6, ''::text as k7,
           null::text as cl, null::text as pl
    from public.clients c
    where p_group = 'client'
      and c.firm_id = p_firm
      and exists (select 1 from fk where fk.client_id = c.id)
    union all
    select p.id::text, c.name || ' — ' || p.name,
           lower(c.name), c.name, c.id::text, 0, lower(p.name), p.name, p.id::text,
           c.name::text, p.name::text
    from public.projects p
    join public.clients c on c.firm_id = p.firm_id and c.id = p.client_id
    where p_group = 'project'
      and p.firm_id = p_firm
      and exists (select 1 from fk where fk.project_id = p.id)
    union all
    select 'client:' || c.id::text, c.name || ' — no project',
           lower(c.name), c.name, c.id::text, 1, '', '', '',
           c.name::text, 'no project'::text
    from public.clients c
    where p_group = 'project'
      and c.firm_id = p_firm
      and exists (select 1 from fk where fk.project_id is null and fk.client_id = c.id)
  ),
  heads as (
    select 1 as kind_ord, periods.gkey, periods.label, periods.sort_key,
           null::text as cl, null::text as pl
    from periods
    union all
    select 1, n.gkey, n.label,
           lpad((row_number() over (order by n.k1, n.k2, n.k3, n.k4, n.k5, n.k6, n.k7))::text, 6, '0'),
           n.cl, n.pl
    from named n
    union all
    select 2, 'overhead', 'Unallocated overhead', null::text, null::text, null::text where v_unallocated
    union all
    select 3, 'total', 'Total', null::text, null::text, null::text
  ),
  keyed as (
    select 1 as kind_ord, fk.gkey, fk.measure, fk.amount from fk where fk.gkey is not null
    union all
    select 2, 'overhead', fk.measure, fk.amount from fk
    where v_unallocated
      and (fk.measure = 'overhead' or (fk.measure = 'contractor_adjustment' and fk.client_id is null))
    union all
    select 3, 'total', fk.measure, fk.amount from fk
  ),
  sums as (
    select h.kind_ord, h.gkey, h.label, h.sort_key, h.cl, h.pl,
           coalesce(sum(k.amount) filter (where k.measure = 'revenue_hours'), 0) as rh,
           coalesce(sum(k.amount) filter (where k.measure = 'revenue_fees'), 0) as fe,
           coalesce(sum(k.amount) filter (where k.measure = 'discount'), 0) as di,
           coalesce(sum(k.amount) filter (where k.measure = 'labour'), 0) as la,
           coalesce(sum(k.amount) filter (where k.measure = 'contractor_adjustment'), 0) as ca,
           coalesce(sum(k.amount) filter (where k.measure = 'direct_expense'), 0) as de,
           coalesce(sum(k.amount) filter (where k.measure = 'overhead'), 0) as ov,
           coalesce(sum(k.amount) filter (where k.measure = 'invoiced'), 0) as iv,
           coalesce(sum(k.amount) filter (where k.measure = 'collected'), 0) as co
    from heads h
    left join keyed k on k.kind_ord = h.kind_ord and k.gkey = h.gkey
    group by h.kind_ord, h.gkey, h.label, h.sort_key, h.cl, h.pl
  ),
  r as (
    select s.*,
           round(s.rh, 2) as rh2, round(s.fe, 2) as fe2, round(s.di, 2) as di2,
           round(s.la, 2) as la2, round(s.ca, 2) as ca2, round(s.de, 2) as de2, round(s.ov, 2) as ov2,
           round(s.iv, 2) as iv2, round(s.co, 2) as co2,
           s.rh + s.fe - s.di as rev_exact,
           s.rh + s.fe - s.di - s.la - s.ca - s.de - s.ov as net_exact
    from sums s
  )
  select case r.kind_ord when 1 then 'group' when 2 then 'overhead' else 'total' end,
         r.gkey,
         r.label,
         r.sort_key,
         r.rh2::numeric(14, 2)::text,
         r.fe2::numeric(14, 2)::text,
         r.di2::numeric(14, 2)::text,
         (r.rh2 + r.fe2 - r.di2)::numeric(14, 2)::text,
         r.la2::numeric(14, 2)::text,
         r.ca2::numeric(14, 2)::text,
         (r.rh2 + r.fe2 - r.di2 - r.la2 - r.ca2)::numeric(14, 2)::text,
         r.de2::numeric(14, 2)::text,
         r.ov2::numeric(14, 2)::text,
         (r.rh2 + r.fe2 - r.di2 - r.la2 - r.ca2 - r.de2 - r.ov2)::numeric(14, 2)::text,
         case when (r.rh2 + r.fe2 - r.di2) <= 0 then null
              else round(r.net_exact / r.rev_exact * 100, 1)::text end,
         r.iv2::numeric(14, 2)::text,
         r.co2::numeric(14, 2)::text,
         r.cl,
         r.pl
  from r
  order by r.kind_ord, r.sort_key collate "C";
end;
$$;

revoke execute on function public.pnl_report(uuid, date, date, text, uuid[], uuid[]) from public, anon;
grant execute on function public.pnl_report(uuid, date, date, text, uuid[], uuid[]) to authenticated;

-- pnl_breakdown: as 20261110000028 plus contractor_adj after labour.
drop function public.pnl_breakdown(uuid, date, date, text, uuid[], uuid[], boolean);

create function public.pnl_breakdown(
  p_firm uuid,
  p_from date,
  p_to date,
  p_group text,
  p_clients uuid[],
  p_projects uuid[],
  p_split_project boolean
)
returns table (
  group_key text,
  client_id uuid,
  client_label text,
  project_id uuid,
  project_label text,
  sort_key text,
  revenue_hours text,
  fees text,
  discounts text,
  revenue text,
  labour text,
  contractor_adj text,
  gross text,
  direct_expenses text,
  overhead text,
  net text,
  margin text,
  invoiced text,
  collected text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_periodic boolean := p_group in ('month', 'quarter');
  v_unit text := case when p_group = 'quarter' then 'quarter' else 'month' end;
  -- Client grouping always splits by project; that is its only breakdown.
  v_by_project boolean := p_group = 'client' or coalesce(p_split_project, false);
begin
  if not public.has_role(p_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if p_group is null or p_group not in ('month', 'quarter', 'client') then
    raise exception 'PNL_GROUP_INVALID' using errcode = 'P0001';
  end if;

  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + interval '3 years' then
    raise exception 'PNL_RANGE_INVALID' using errcode = 'P0001';
  end if;

  return query
  with fk as (
    select x.measure, x.amount, x.client_id as cid,
           case when v_by_project then x.project_id end as pid,
           case when v_periodic then date_trunc(v_unit, x.fact_date::timestamp) end as pstart
    from public.pnl_facts(p_firm, p_from, p_to) x
    where (p_clients is null or x.client_id = any (p_clients))
      and (p_projects is null or x.project_id = any (p_projects))
      -- Under client grouping, facts with no client (overhead, unallocated contractor
      -- adjustments) belong to pnl_report's Unallocated overhead row, not to a client.
      and (v_periodic or x.client_id is not null)
  ),
  sums as (
    select fk.pstart, fk.cid, fk.pid,
           coalesce(sum(fk.amount) filter (where fk.measure = 'revenue_hours'), 0) as rh,
           coalesce(sum(fk.amount) filter (where fk.measure = 'revenue_fees'), 0) as fe,
           coalesce(sum(fk.amount) filter (where fk.measure = 'discount'), 0) as di,
           coalesce(sum(fk.amount) filter (where fk.measure = 'labour'), 0) as la,
           coalesce(sum(fk.amount) filter (where fk.measure = 'contractor_adjustment'), 0) as ca,
           coalesce(sum(fk.amount) filter (where fk.measure = 'direct_expense'), 0) as de,
           coalesce(sum(fk.amount) filter (where fk.measure = 'overhead'), 0) as ov,
           coalesce(sum(fk.amount) filter (where fk.measure = 'invoiced'), 0) as iv,
           coalesce(sum(fk.amount) filter (where fk.measure = 'collected'), 0) as co
    from fk
    group by fk.pstart, fk.cid, fk.pid
    having bool_or(fk.amount <> 0)
  ),
  r as (
    select s.*,
           c.name::text as cname, p.name::text as pname,
           round(s.rh, 2) as rh2, round(s.fe, 2) as fe2, round(s.di, 2) as di2,
           round(s.la, 2) as la2, round(s.ca, 2) as ca2, round(s.de, 2) as de2, round(s.ov, 2) as ov2,
           round(s.iv, 2) as iv2, round(s.co, 2) as co2,
           s.rh + s.fe - s.di as rev_exact,
           s.rh + s.fe - s.di - s.la - s.ca - s.de - s.ov as net_exact
    from sums s
    left join public.clients c on c.firm_id = p_firm and c.id = s.cid
    left join public.projects p on p.firm_id = p_firm and p.id = s.pid
  ),
  ordered as (
    select r.*,
           row_number() over (
             order by r.pstart,
                      (r.cid is null), lower(r.cname), r.cname, r.cid::text,
                      (r.pid is null), lower(r.pname), r.pname, r.pid::text
           ) as ord
    from r
  )
  select case when v_periodic then to_char(o.pstart, 'YYYY-MM-DD') else o.cid::text end,
         o.cid,
         case when o.cid is null then 'Overhead' else o.cname end,
         o.pid,
         case when not v_by_project or o.cid is null then null
              when o.pid is null then 'no project'
              else o.pname end,
         lpad(o.ord::text, 6, '0'),
         o.rh2::numeric(14, 2)::text,
         o.fe2::numeric(14, 2)::text,
         o.di2::numeric(14, 2)::text,
         (o.rh2 + o.fe2 - o.di2)::numeric(14, 2)::text,
         o.la2::numeric(14, 2)::text,
         o.ca2::numeric(14, 2)::text,
         (o.rh2 + o.fe2 - o.di2 - o.la2 - o.ca2)::numeric(14, 2)::text,
         o.de2::numeric(14, 2)::text,
         o.ov2::numeric(14, 2)::text,
         (o.rh2 + o.fe2 - o.di2 - o.la2 - o.ca2 - o.de2 - o.ov2)::numeric(14, 2)::text,
         case when (o.rh2 + o.fe2 - o.di2) <= 0 then null
              else round(o.net_exact / o.rev_exact * 100, 1)::text end,
         o.iv2::numeric(14, 2)::text,
         o.co2::numeric(14, 2)::text
  from ordered o
  order by o.ord;
end;
$$;

revoke execute on function public.pnl_breakdown(uuid, date, date, text, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.pnl_breakdown(uuid, date, date, text, uuid[], uuid[], boolean) to authenticated;
