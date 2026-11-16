-- Vendor payments in bank review (confirm, link, duplicate, candidates, labels) and in the
-- Transactions report. Bill expenses stay in the P&L; the cash report shows the payment instead.

-- ---------------------------------------------------------------------------
-- Confirm a money-out bank line as a payment on an approved vendor bill.
-- ---------------------------------------------------------------------------
create function public.confirm_bank_line_vendor_payment(p_line uuid, p_bill uuid, p_notes text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bank_lines%rowtype;
  v_kind public.bank_account_kind;
  v_id uuid;
begin
  v := public.bank_lock_line(p_line, '{new}');
  if v.amount >= 0 then
    raise exception 'LINE_DIRECTION' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.vendor_bills b where b.id = p_bill and b.firm_id = v.firm_id) then
    raise exception 'BILL_NOT_FOUND' using errcode = 'P0001';
  end if;
  select a.kind into v_kind from public.bank_accounts a where a.id = v.account_id;
  v_id := public.record_vendor_payment(
    p_bill,
    -v.amount,
    v.posted_on,
    (case when v_kind = 'credit_card' then 'card' else 'bank_transfer' end)::public.payment_method,
    left(coalesce(v.bank_ref, v.description), 120),
    p_notes
  );
  update public.bank_lines set vendor_payment_id = v_id, status = 'done' where id = v.id;
  return v_id;
end;
$$;
revoke execute on function public.confirm_bank_line_vendor_payment(uuid, uuid, text) from public, anon;
grant execute on function public.confirm_bank_line_vendor_payment(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Link to an existing entry: client payment, expense or vendor payment.
-- ---------------------------------------------------------------------------
drop function public.link_bank_line(uuid, uuid, uuid);
create function public.link_bank_line(p_line uuid, p_payment uuid, p_expense uuid, p_vendor_payment uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bank_lines%rowtype;
  v_amount numeric;
begin
  v := public.bank_lock_line(p_line, '{new}');
  if num_nonnulls(p_payment, p_expense, p_vendor_payment) <> 1 then
    raise exception 'choose one entry to link' using errcode = '22023';
  end if;

  if p_payment is not null then
    select p.amount into v_amount from public.payments p where p.id = p_payment and p.firm_id = v.firm_id;
    if not found then
      raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_amount <> v.amount then
      raise exception 'LINK_MISMATCH' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.bank_lines l where l.payment_id = p_payment) then
      raise exception 'ALREADY_LINKED' using errcode = 'P0001';
    end if;
    update public.bank_lines set payment_id = p_payment, status = 'done' where id = v.id;
  elsif p_expense is not null then
    select e.amount into v_amount from public.expenses e where e.id = p_expense and e.firm_id = v.firm_id;
    if not found then
      raise exception 'EXPENSE_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_amount <> -v.amount then
      raise exception 'LINK_MISMATCH' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.bank_lines l where l.expense_id = p_expense) then
      raise exception 'ALREADY_LINKED' using errcode = 'P0001';
    end if;
    update public.bank_lines set expense_id = p_expense, status = 'done' where id = v.id;
  else
    select p.amount into v_amount from public.vendor_payments p where p.id = p_vendor_payment and p.firm_id = v.firm_id;
    if not found then
      raise exception 'VENDOR_PAYMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_amount <> -v.amount then
      raise exception 'LINK_MISMATCH' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.bank_lines l where l.vendor_payment_id = p_vendor_payment) then
      raise exception 'ALREADY_LINKED' using errcode = 'P0001';
    end if;
    update public.bank_lines set vendor_payment_id = p_vendor_payment, status = 'done' where id = v.id;
  end if;
end;
$$;
revoke execute on function public.link_bank_line(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.link_bank_line(uuid, uuid, uuid, uuid) to authenticated;

-- Undo also clears a vendor payment link (the payment itself stays).
create or replace function public.reset_bank_line(p_line uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bank_lines%rowtype;
begin
  v := public.bank_lock_line(p_line, '{done,ignored}');
  update public.bank_lines
  set status = 'new', ignore_reason = null, payment_id = null, expense_id = null, other_income_id = null, vendor_payment_id = null
  where id = v.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark as duplicate: money-out lines also consider unmatched vendor payments.
-- ---------------------------------------------------------------------------
create or replace function public.mark_bank_lines_duplicate(p_lines uuid[])
returns table (matched integer, ignored integer, skipped integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bank_lines%rowtype;
  v_id uuid;
  v_exp uuid[];
  v_vp uuid[];
  v_pay uuid[];
  v_matched integer := 0;
  v_ignored integer := 0;
  v_skipped integer := 0;
begin
  if exists (
    select 1 from public.bank_lines l
    where l.id = any (p_lines) and not public.has_role(l.firm_id, '{admin,manager}'::public.firm_role[])
  ) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  for v_id in select x.id from unnest(p_lines) with ordinality as x(id, n) order by x.n loop
    select * into v from public.bank_lines l where l.id = v_id for update;
    if not found or v.status <> 'new' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_pay := null; v_exp := null; v_vp := null;
    if v.amount > 0 then
      select array_agg(p.id) into v_pay
      from public.payments p
      where p.firm_id = v.firm_id and p.amount = v.amount
        and p.paid_on between v.posted_on - 7 and v.posted_on + 7
        and not exists (select 1 from public.bank_lines l where l.payment_id = p.id);
    else
      select array_agg(e.id) into v_exp
      from public.expenses e
      where e.firm_id = v.firm_id and e.amount = -v.amount
        and e.spent_on between v.posted_on - 7 and v.posted_on + 7
        and not exists (select 1 from public.bank_lines l where l.expense_id = e.id);
      select array_agg(p.id) into v_vp
      from public.vendor_payments p
      where p.firm_id = v.firm_id and p.amount = -v.amount
        and p.paid_on between v.posted_on - 7 and v.posted_on + 7
        and not exists (select 1 from public.bank_lines l where l.vendor_payment_id = p.id);
    end if;

    if coalesce(array_length(v_pay, 1), 0) + coalesce(array_length(v_exp, 1), 0) + coalesce(array_length(v_vp, 1), 0) = 1 then
      if v_pay is not null then
        update public.bank_lines set payment_id = v_pay[1], status = 'done' where id = v.id;
      elsif v_exp is not null then
        update public.bank_lines set expense_id = v_exp[1], status = 'done' where id = v.id;
      else
        update public.bank_lines set vendor_payment_id = v_vp[1], status = 'done' where id = v.id;
      end if;
      v_matched := v_matched + 1;
    else
      update public.bank_lines set status = 'ignored', ignore_reason = 'Duplicate' where id = v.id;
      v_ignored := v_ignored + 1;
    end if;
  end loop;

  return query select v_matched, v_ignored, v_skipped;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review list: vendor payments get a label too.
-- ---------------------------------------------------------------------------
drop function public.list_bank_lines(uuid, text);
create function public.list_bank_lines(p_account uuid, p_status text)
returns table (
  id uuid,
  posted_on date,
  amount text,
  description text,
  bank_ref text,
  status text,
  ignore_reason text,
  payment_id uuid,
  expense_id uuid,
  other_income_id uuid,
  vendor_payment_id uuid,
  linked_label text,
  suggested_category_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acct public.bank_accounts%rowtype;
begin
  v_acct := public.bank_account_checked(p_account);
  if p_status is null or p_status not in ('new', 'done', 'ignored') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  return query
  select l.id, l.posted_on, l.amount::text, l.description, l.bank_ref, l.status::text, l.ignore_reason,
         l.payment_id, l.expense_id, l.other_income_id, l.vendor_payment_id,
         coalesce(
           (select coalesce(i.number, 'Payment') from public.payments p
            join public.invoices i on i.firm_id = p.firm_id and i.id = p.invoice_id
            where p.id = l.payment_id),
           (select e.payee from public.expenses e where e.id = l.expense_id),
           (select o.source from public.other_income o where o.id = l.other_income_id),
           (select 'Bill #' || b.bill_number || ' – ' || vd.name
            from public.vendor_payments vp
            join public.vendor_bills b on b.firm_id = vp.firm_id and b.id = vp.bill_id
            join public.vendors vd on vd.firm_id = b.firm_id and vd.id = b.vendor_id
            where vp.id = l.vendor_payment_id)
         ),
         case when l.status = 'new' and l.amount < 0 then (
           select e.category_id
           from public.bank_lines h
           join public.expenses e on e.firm_id = h.firm_id and e.id = h.expense_id
           where h.firm_id = l.firm_id and h.clean_description = l.clean_description and h.expense_id is not null
           order by h.updated_at desc
           limit 1
         ) end
  from public.bank_lines l
  where l.account_id = v_acct.id and l.status = p_status::public.bank_line_status
  order by
    case when p_status = 'new' then l.posted_on end asc,
    case when p_status <> 'new' then l.posted_on end desc,
    l.created_at, l.id
  limit 500;
end;
$$;
revoke execute on function public.list_bank_lines(uuid, text) from public, anon;
grant execute on function public.list_bank_lines(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Candidates: payable bills and unmatched vendor payments for money-out lines.
-- ---------------------------------------------------------------------------
create or replace function public.bank_match_candidates(p_line uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.bank_lines%rowtype;
  v_invoices jsonb := '[]';
  v_payments jsonb := '[]';
  v_expenses jsonb := '[]';
  v_bills jsonb := '[]';
  v_vpay jsonb := '[]';
begin
  select * into v from public.bank_lines l where l.id = p_line;
  if not found then
    raise exception 'LINE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.has_role(v.firm_id, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if v.amount > 0 then
    select coalesce(jsonb_agg(x order by x.number), '[]') into v_invoices
    from (
      select i.id, i.number, c.name as client_name, (i.total - i.amount_paid)::numeric(12, 2)::text as balance_due
      from public.invoices i
      join public.clients c on c.firm_id = i.firm_id and c.id = i.client_id
      where i.firm_id = v.firm_id and i.status in ('issued', 'partly_paid')
      order by i.number
      limit 200
    ) x;

    select coalesce(jsonb_agg(x order by x.paid_on), '[]') into v_payments
    from (
      select p.id, p.paid_on, p.amount::text as amount, i.number as invoice_number, c.name as client_name
      from public.payments p
      join public.invoices i on i.firm_id = p.firm_id and i.id = p.invoice_id
      join public.clients c on c.firm_id = i.firm_id and c.id = i.client_id
      where p.firm_id = v.firm_id
        and p.amount = v.amount
        and p.paid_on between v.posted_on - 7 and v.posted_on + 7
        and not exists (select 1 from public.bank_lines l where l.payment_id = p.id)
      limit 20
    ) x;
  else
    select coalesce(jsonb_agg(x order by x.spent_on), '[]') into v_expenses
    from (
      select e.id, e.spent_on, e.amount::text as amount, e.payee
      from public.expenses e
      where e.firm_id = v.firm_id
        and e.amount = -v.amount
        and e.spent_on between v.posted_on - 7 and v.posted_on + 7
        and not exists (select 1 from public.bank_lines l where l.expense_id = e.id)
      limit 20
    ) x;

    select coalesce(jsonb_agg(x order by x.due_date), '[]') into v_bills
    from (
      select b.id, b.bill_number, vd.name as vendor_name, b.due_date,
             (b.total - b.amount_paid)::numeric(12, 2)::text as balance_due
      from public.vendor_bills b
      join public.vendors vd on vd.firm_id = b.firm_id and vd.id = b.vendor_id
      where b.firm_id = v.firm_id
        and b.status in ('approved', 'partly_paid')
        and (b.total - b.amount_paid) >= -v.amount
      order by b.due_date
      limit 200
    ) x;

    select coalesce(jsonb_agg(x order by x.paid_on), '[]') into v_vpay
    from (
      select p.id, p.paid_on, p.amount::text as amount, b.bill_number, vd.name as vendor_name
      from public.vendor_payments p
      join public.vendor_bills b on b.firm_id = p.firm_id and b.id = p.bill_id
      join public.vendors vd on vd.firm_id = b.firm_id and vd.id = b.vendor_id
      where p.firm_id = v.firm_id
        and p.amount = -v.amount
        and p.paid_on between v.posted_on - 7 and v.posted_on + 7
        and not exists (select 1 from public.bank_lines l where l.vendor_payment_id = p.id)
      limit 20
    ) x;
  end if;

  return jsonb_build_object(
    'invoices', v_invoices, 'payments', v_payments, 'expenses', v_expenses,
    'bills', v_bills, 'vendor_payments', v_vpay
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactions report: vendor payments as money out; bill expenses left out
-- (the payment represents them in this cash view).
-- ---------------------------------------------------------------------------
create or replace function public.transactions_report(
  p_firm uuid,
  p_from date,
  p_to date,
  p_kind text
)
returns table (
  kind text,
  id uuid,
  txn_date date,
  client_name text,
  project_name text,
  invoice_number text,
  method text,
  reference text,
  payee text,
  category text,
  amount text,
  notes text
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
  if p_kind is null or p_kind not in ('all', 'in', 'out') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;

  return query
  select t.kind, t.id, t.txn_date, t.client_name, t.project_name, t.invoice_number,
         t.method, t.reference, t.payee, t.category, t.amount, t.notes
  from (
    select 'payment'::text as kind, p.id, p.paid_on as txn_date, cl.name as client_name, null::text as project_name,
           i.number as invoice_number, p.method::text as method, p.reference, null::text as payee,
           'Client payment'::text as category, p.amount::text as amount, p.notes, p.created_at
    from public.payments p
    join public.invoices i on i.firm_id = p.firm_id and i.id = p.invoice_id
    join public.clients cl on cl.firm_id = i.firm_id and cl.id = i.client_id
    where p.firm_id = p_firm and p_kind in ('all', 'in')
      and (p_from is null or p.paid_on >= p_from) and (p_to is null or p.paid_on <= p_to)
    union all
    select 'expense'::text, e.id, e.spent_on, cl.name, pr.name, null::text, null::text, null::text,
           e.payee, c.name, e.amount::text, e.notes, e.created_at
    from public.expenses e
    join public.expense_categories c on c.firm_id = e.firm_id and c.id = e.category_id
    left join public.clients cl on cl.firm_id = e.firm_id and cl.id = e.client_id
    left join public.projects pr on pr.firm_id = e.firm_id and pr.id = e.project_id
    where e.firm_id = p_firm and p_kind in ('all', 'out') and e.vendor_bill_line_id is null
      and (p_from is null or e.spent_on >= p_from) and (p_to is null or e.spent_on <= p_to)
    union all
    select 'other_income'::text, o.id, o.received_on, null::text, null::text, null::text, null::text, null::text,
           o.source, c.name, o.amount::text, o.notes, o.created_at
    from public.other_income o
    join public.other_income_categories c on c.firm_id = o.firm_id and c.id = o.category_id
    where o.firm_id = p_firm and p_kind in ('all', 'in')
      and (p_from is null or o.received_on >= p_from) and (p_to is null or o.received_on <= p_to)
    union all
    select 'vendor_payment'::text, vp.id, vp.paid_on, null::text, null::text, b.bill_number, vp.method::text, vp.reference,
           vd.name, 'Vendor bill'::text, vp.amount::text, vp.notes, vp.created_at
    from public.vendor_payments vp
    join public.vendor_bills b on b.firm_id = vp.firm_id and b.id = vp.bill_id
    join public.vendors vd on vd.firm_id = b.firm_id and vd.id = b.vendor_id
    where vp.firm_id = p_firm and p_kind in ('all', 'out')
      and (p_from is null or vp.paid_on >= p_from) and (p_to is null or vp.paid_on <= p_to)
  ) t
  order by t.txn_date, t.created_at, t.id;
end;
$$;
