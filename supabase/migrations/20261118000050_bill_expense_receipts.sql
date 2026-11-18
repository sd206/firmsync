-- Expenses created by approving a vendor bill (expenses.vendor_bill_line_id) have the
-- vendor's PDF on the bill (attachments.vendor_bill_id), not on the expense. Count those
-- files as the expense's receipts, so such rows don't show "No receipt" or match the
-- "No receipt only" filter. list_expenses also returns the bill, so the list can link to it.
-- P&L and Transactions are unchanged.

-- Files on the expense itself plus, for a bill-created expense, files on its bill.
-- Internal helper: called only from the security-definer functions below.
create function public.expense_receipt_count(p_firm uuid, p_expense uuid, p_bill_line uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.attachments a where a.firm_id = p_firm and a.expense_id = p_expense)
    + coalesce((
        select count(*)
        from public.vendor_bill_lines l
        join public.attachments a on a.firm_id = l.firm_id and a.vendor_bill_id = l.bill_id
        where p_bill_line is not null and l.firm_id = p_firm and l.id = p_bill_line
      ), 0)
  )::integer;
$$;

revoke execute on function public.expense_receipt_count(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.expense_totals(
  p_firm uuid,
  p_from date,
  p_to date,
  p_category uuid,
  p_client uuid,
  p_project uuid,
  p_missing_receipt boolean
)
returns table (total text, expense_count integer)
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
  select coalesce(sum(e.amount), 0)::numeric(12, 2)::text,
         count(*)::integer
  from public.expenses e
  where e.firm_id = p_firm
    and (p_from is null or e.spent_on >= p_from)
    and (p_to is null or e.spent_on <= p_to)
    and (p_category is null or e.category_id = p_category)
    and (p_client is null or e.client_id = p_client)
    and (p_project is null or e.project_id = p_project)
    and (
      p_missing_receipt is not true
      or public.expense_receipt_count(e.firm_id, e.id, e.vendor_bill_line_id) = 0
    );
end;
$$;

-- The return type gains vendor_bill_id, so the function is dropped and recreated.
drop function public.list_expenses(uuid, date, date, uuid, uuid, uuid, boolean, integer, integer);

create function public.list_expenses(
  p_firm uuid,
  p_from date,
  p_to date,
  p_category uuid,
  p_client uuid,
  p_project uuid,
  p_missing_receipt boolean,
  p_limit integer,
  p_offset integer
)
returns table (
  id uuid,
  spent_on date,
  category_id uuid,
  category_name text,
  payee text,
  amount text,
  client_id uuid,
  client_name text,
  project_id uuid,
  project_name text,
  receipt_count integer,
  vendor_bill_id uuid
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
  select e.id,
         e.spent_on,
         e.category_id,
         c.name,
         e.payee,
         e.amount::text,
         e.client_id,
         cl.name,
         e.project_id,
         pr.name,
         public.expense_receipt_count(e.firm_id, e.id, e.vendor_bill_line_id),
         bl.bill_id
  from public.expenses e
  join public.expense_categories c on c.firm_id = e.firm_id and c.id = e.category_id
  left join public.clients cl on cl.firm_id = e.firm_id and cl.id = e.client_id
  left join public.projects pr on pr.firm_id = e.firm_id and pr.id = e.project_id
  left join public.vendor_bill_lines bl on bl.firm_id = e.firm_id and bl.id = e.vendor_bill_line_id
  where e.firm_id = p_firm
    and (p_from is null or e.spent_on >= p_from)
    and (p_to is null or e.spent_on <= p_to)
    and (p_category is null or e.category_id = p_category)
    and (p_client is null or e.client_id = p_client)
    and (p_project is null or e.project_id = p_project)
    and (
      p_missing_receipt is not true
      or public.expense_receipt_count(e.firm_id, e.id, e.vendor_bill_line_id) = 0
    )
  order by e.spent_on desc, e.created_at desc, e.id
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
end;
$$;

revoke execute on function public.list_expenses(uuid, date, date, uuid, uuid, uuid, boolean, integer, integer)
  from public, anon;
grant execute on function public.list_expenses(uuid, date, date, uuid, uuid, uuid, boolean, integer, integer)
  to authenticated;
