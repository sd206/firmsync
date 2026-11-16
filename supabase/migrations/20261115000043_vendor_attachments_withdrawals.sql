-- Vendor bill and payment files in delete_attachment, and bank money-out lines for a bill.
-- delete_attachment also handles vendor bill and vendor payment files.
-- Bill files can be removed until the bill is void; payment files while the payment exists.
create or replace function public.delete_attachment(p_attachment uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_att public.attachments%rowtype;
  v_pay public.payments%rowtype;
  v_exp public.expenses%rowtype;
  v_status public.vendor_bill_status;
begin
  select * into v_att from public.attachments a where a.id = p_attachment;
  if not found then
    raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_role(v_att.firm_id, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if v_att.vendor_bill_id is not null then
    select b.status into v_status from public.vendor_bills b
    where b.id = v_att.vendor_bill_id and b.firm_id = v_att.firm_id
    for update;
    if not found then
      raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if v_status = 'void' then
      raise exception 'BILL_LOCKED' using errcode = 'P0001';
    end if;
    delete from public.attachments a
    where a.id = v_att.id and a.vendor_bill_id = v_att.vendor_bill_id
    returning a.* into v_att;
    if not found then
      raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    return v_att.storage_path;
  end if;

  if v_att.vendor_payment_id is not null then
    perform 1 from public.vendor_payments p
    where p.id = v_att.vendor_payment_id and p.firm_id = v_att.firm_id
    for update;
    if not found then
      raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    delete from public.attachments a
    where a.id = v_att.id and a.vendor_payment_id = v_att.vendor_payment_id
    returning a.* into v_att;
    if not found then
      raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    return v_att.storage_path;
  end if;

  if v_att.expense_id is not null then
    select * into v_exp from public.expenses e
    where e.id = v_att.expense_id and e.firm_id = v_att.firm_id
    for update;
    if not found then
      raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    delete from public.attachments a
    where a.id = v_att.id and a.firm_id = v_exp.firm_id and a.expense_id = v_exp.id
    returning a.* into v_att;
    if not found then
      raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
    end if;
    return v_att.storage_path;
  end if;

  v_pay := public.payment_lock(v_att.payment_id, 'ATTACHMENT_NOT_FOUND');
  delete from public.attachments a
  where a.id = v_att.id and a.firm_id = v_pay.firm_id and a.payment_id = v_pay.id
  returning a.* into v_att;
  if not found then
    raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  return v_att.storage_path;
end;
$$;

-- New money-out bank lines that could pay this bill (the bill page's Record payment).
create function public.bill_bank_withdrawals(p_bill uuid)
returns table (
  line_id uuid,
  posted_on date,
  amount text,
  description text,
  account_name text,
  account_kind text,
  exact_match boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bill public.vendor_bills%rowtype;
  v_balance numeric;
  v_word text;
begin
  select * into v_bill from public.vendor_bills b where b.id = p_bill;
  if not found or not public.has_role(v_bill.firm_id, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_balance := v_bill.total - v_bill.amount_paid;
  select upper(split_part(btrim(vd.name), ' ', 1)) into v_word
  from public.vendors vd where vd.firm_id = v_bill.firm_id and vd.id = v_bill.vendor_id;

  return query
  select l.id, l.posted_on, l.amount::text, l.description, a.name, a.kind::text, -l.amount = v_balance
  from public.bank_lines l
  join public.bank_accounts a on a.firm_id = l.firm_id and a.id = l.account_id
  where l.firm_id = v_bill.firm_id
    and l.status = 'new'
    and l.amount < 0
    and -l.amount <= v_balance
    and l.posted_on >= current_date - 90
  order by
    (-l.amount = v_balance) desc,
    (coalesce(v_word, '') <> '' and position(v_word in upper(l.description)) > 0) desc,
    l.posted_on desc,
    l.created_at desc,
    l.id
  limit 20;
end;
$$;

revoke execute on function public.bill_bank_withdrawals(uuid) from public, anon;
grant execute on function public.bill_bank_withdrawals(uuid) to authenticated;
