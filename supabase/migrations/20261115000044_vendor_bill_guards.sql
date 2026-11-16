-- Review fixes for vendor bills:
-- 1. Lines never move between bills or firms, and an approved bill's lines stay locked (old and new bill checked).
-- 2. Expenses created by approving a bill change only through the bill (approve / void).
-- 3. Bank matching ignores bill-created expenses (below).

create or replace function public.vendor_bill_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.vendor_bill_status;
begin
  if not public.vendor_bill_internal() then
    if tg_op = 'UPDATE' and (new.bill_id is distinct from old.bill_id or new.firm_id is distinct from old.firm_id) then
      select b.status into v_status from public.vendor_bills b where b.firm_id = old.firm_id and b.id = old.bill_id;
      if found and v_status not in ('pending_approval', 'rejected') then
        raise exception 'BILL_LOCKED' using errcode = 'P0001';
      end if;
      raise exception 'LINE_MOVE' using errcode = 'P0001';
    end if;
    if tg_op <> 'INSERT' then
      select b.status into v_status from public.vendor_bills b where b.firm_id = old.firm_id and b.id = old.bill_id;
      if found and v_status not in ('pending_approval', 'rejected') then
        raise exception 'BILL_LOCKED' using errcode = 'P0001';
      end if;
    end if;
    if tg_op <> 'DELETE' then
      select b.status into v_status from public.vendor_bills b where b.firm_id = new.firm_id and b.id = new.bill_id;
      if found and v_status not in ('pending_approval', 'rejected') then
        raise exception 'BILL_LOCKED' using errcode = 'P0001';
      end if;
    end if;
  end if;
  if tg_op <> 'DELETE' then
    new.description := btrim(new.description);
    return new;
  end if;
  return old;
end;
$$;

create function public.expenses_bill_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.vendor_bill_internal() then
    return coalesce(new, old);
  end if;
  if (tg_op <> 'INSERT' and old.vendor_bill_line_id is not null)
     or (tg_op <> 'DELETE' and new.vendor_bill_line_id is not null) then
    raise exception 'BILL_EXPENSE' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.expenses_bill_guard() from public, anon, authenticated;
create trigger expenses_bill_guard
  before insert or update or delete on public.expenses
  for each row execute function public.expenses_bill_guard();

-- Void sets the internal flag before removing the bill's expenses.
create or replace function public.void_vendor_bill(p_bill uuid)
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
  perform public.vendor_bill_set_internal();
  delete from public.expenses e
  where e.firm_id = v.firm_id and e.vendor_bill_line_id in (select l.id from public.vendor_bill_lines l where l.bill_id = v.id);
  update public.vendor_bills b set status = 'void', rejected_reason = null where b.id = v.id;
end;
$$;

-- Bank matching never uses an expense created by a bill (the bill is paid by a vendor payment).
create or replace function public.link_bank_line(p_line uuid, p_payment uuid, p_expense uuid, p_vendor_payment uuid default null)
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
    if exists (select 1 from public.expenses e where e.id = p_expense and e.vendor_bill_line_id is not null) then
      raise exception 'BILL_EXPENSE' using errcode = 'P0001';
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
        and e.vendor_bill_line_id is null
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
        and e.vendor_bill_line_id is null
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
