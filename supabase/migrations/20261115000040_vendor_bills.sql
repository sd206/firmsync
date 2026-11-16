-- Vendor bills (accounts payable): bills with the vendor's own invoice number and lines,
-- payments recorded against them, attachments, and a bank-line link.
-- Spec: docs/superpowers/specs/2026-11-15-vendor-bills-design.md

create type public.vendor_bill_status as enum ('pending_approval', 'rejected', 'approved', 'partly_paid', 'paid', 'void');

-- True inside the vendor bill functions (Task 2), which may change locked bills and statuses.
create function public.vendor_bill_internal()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.vendor_bill_internal', true), '') = 'on'
      or coalesce(auth.role(), '') = 'service_role'
$$;

-- ---------------------------------------------------------------------------
-- Bills
-- ---------------------------------------------------------------------------
create table public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id),
  vendor_id uuid not null,
  bill_number text not null,
  bill_date date not null,
  due_date date not null,
  period_start date,
  period_end date,
  notes text,
  total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  status public.vendor_bill_status not null default 'pending_approval',
  rejected_reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint vendor_bills_firm_id_id_key unique (firm_id, id),
  constraint vendor_bills_vendor_fk foreign key (firm_id, vendor_id)
    references public.vendors (firm_id, id) on delete restrict,
  constraint vendor_bills_number_chk check (char_length(btrim(bill_number)) between 1 and 60),
  constraint vendor_bills_due_chk check (due_date >= bill_date),
  constraint vendor_bills_period_chk check (
    (period_start is null and period_end is null) or (period_start is not null and period_end is not null and period_start <= period_end)
  ),
  constraint vendor_bills_paid_chk check (amount_paid >= 0 and amount_paid <= total),
  constraint vendor_bills_rejected_chk check ((status = 'rejected') = (rejected_reason is not null)),
  constraint vendor_bills_reason_len_chk check (rejected_reason is null or char_length(rejected_reason) <= 500),
  constraint vendor_bills_notes_len_chk check (notes is null or char_length(notes) <= 1000)
);
create unique index vendor_bills_vendor_number_key on public.vendor_bills (firm_id, vendor_id, lower(btrim(bill_number)));
create index vendor_bills_firm_status_idx on public.vendor_bills (firm_id, status, due_date);

-- Clients may only edit details of an unapproved bill; status, totals and approval fields
-- belong to the functions. Locked bills (approved and later) cannot be changed or deleted.
create function public.vendor_bills_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.vendor_bill_internal() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending_approval';
    new.total := 0;
    new.amount_paid := 0;
    new.rejected_reason := null;
    new.approved_by := null;
    new.approved_at := null;
    new.bill_number := btrim(new.bill_number);
    new.notes := nullif(btrim(new.notes), '');
    return new;
  end if;
  if old.status not in ('pending_approval', 'rejected') then
    raise exception 'BILL_LOCKED' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.status is distinct from old.status or new.total is distinct from old.total
     or new.amount_paid is distinct from old.amount_paid or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at or new.rejected_reason is distinct from old.rejected_reason
     or new.firm_id is distinct from old.firm_id then
    raise exception 'BILL_STATUS' using errcode = 'P0001';
  end if;
  new.bill_number := btrim(new.bill_number);
  new.notes := nullif(btrim(new.notes), '');
  return new;
end;
$$;
revoke execute on function public.vendor_bills_guard() from public, anon, authenticated;
create trigger vendor_bills_guard
  before insert or update or delete on public.vendor_bills
  for each row execute function public.vendor_bills_guard();
create trigger vendor_bills_set_updated_at before update on public.vendor_bills
  for each row execute function public.set_updated_at();
create trigger vendor_bills_audit
  after insert or update or delete on public.vendor_bills
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Lines
-- ---------------------------------------------------------------------------
create table public.vendor_bill_lines (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id),
  bill_id uuid not null,
  position integer not null default 1,
  kind text not null,
  description text not null,
  amount numeric(12, 2) not null,
  category_id uuid,
  client_id uuid,
  project_id uuid,
  consultant_id uuid,
  created_at timestamptz not null default now(),
  constraint vendor_bill_lines_firm_id_id_key unique (firm_id, id),
  constraint vendor_bill_lines_bill_fk foreign key (firm_id, bill_id)
    references public.vendor_bills (firm_id, id) on delete cascade,
  constraint vendor_bill_lines_category_fk foreign key (firm_id, category_id)
    references public.expense_categories (firm_id, id) on delete restrict,
  constraint vendor_bill_lines_client_fk foreign key (firm_id, client_id)
    references public.clients (firm_id, id) on delete restrict,
  constraint vendor_bill_lines_project_fk foreign key (firm_id, project_id)
    references public.projects (firm_id, id) on delete restrict,
  constraint vendor_bill_lines_consultant_fk foreign key (firm_id, consultant_id)
    references public.consultants (firm_id, id) on delete restrict,
  constraint vendor_bill_lines_kind_chk check (kind in ('expense', 'contractor')),
  constraint vendor_bill_lines_desc_chk check (char_length(btrim(description)) between 1 and 200),
  constraint vendor_bill_lines_amount_chk check (amount > 0),
  constraint vendor_bill_lines_expense_chk check (
    kind <> 'expense' or (category_id is not null and consultant_id is null)
  ),
  constraint vendor_bill_lines_contractor_chk check (
    kind <> 'contractor' or (category_id is null and client_id is null and project_id is null)
  )
);
create index vendor_bill_lines_bill_idx on public.vendor_bill_lines (bill_id, position);

-- Lines follow their bill's lock, and keep the bill total in step.
create function public.vendor_bill_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.vendor_bill_status;
begin
  if not public.vendor_bill_internal() then
    select b.status into v_status from public.vendor_bills b
    where b.firm_id = coalesce(new.firm_id, old.firm_id) and b.id = coalesce(new.bill_id, old.bill_id);
    if found and v_status not in ('pending_approval', 'rejected') then
      raise exception 'BILL_LOCKED' using errcode = 'P0001';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    new.description := btrim(new.description);
    return new;
  end if;
  return old;
end;
$$;
revoke execute on function public.vendor_bill_lines_guard() from public, anon, authenticated;
create trigger vendor_bill_lines_guard
  before insert or update or delete on public.vendor_bill_lines
  for each row execute function public.vendor_bill_lines_guard();

create function public.vendor_bill_lines_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill uuid := coalesce(new.bill_id, old.bill_id);
begin
  perform set_config('app.vendor_bill_internal', 'on', true);
  update public.vendor_bills b
  set total = coalesce((select sum(l.amount) from public.vendor_bill_lines l where l.bill_id = v_bill), 0)
  where b.id = v_bill;
  perform set_config('app.vendor_bill_internal', 'off', true);
  return null;
end;
$$;
revoke execute on function public.vendor_bill_lines_total() from public, anon, authenticated;
create trigger vendor_bill_lines_total
  after insert or update or delete on public.vendor_bill_lines
  for each row execute function public.vendor_bill_lines_total();
create trigger vendor_bill_lines_audit
  after insert or update or delete on public.vendor_bill_lines
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Payments (written only by the functions)
-- ---------------------------------------------------------------------------
create table public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id),
  bill_id uuid not null,
  amount numeric(12, 2) not null,
  paid_on date not null,
  method public.payment_method not null,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint vendor_payments_firm_id_id_key unique (firm_id, id),
  constraint vendor_payments_bill_fk foreign key (firm_id, bill_id)
    references public.vendor_bills (firm_id, id) on delete restrict,
  constraint vendor_payments_amount_chk check (amount > 0),
  constraint vendor_payments_reference_len_chk check (reference is null or char_length(reference) <= 120),
  constraint vendor_payments_notes_len_chk check (notes is null or char_length(notes) <= 1000)
);
create index vendor_payments_bill_idx on public.vendor_payments (bill_id, paid_on);
create trigger vendor_payments_set_updated_at before update on public.vendor_payments
  for each row execute function public.set_updated_at();
create trigger vendor_payments_audit
  after insert or update or delete on public.vendor_payments
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.vendor_bills enable row level security;
alter table public.vendor_bill_lines enable row level security;
alter table public.vendor_payments enable row level security;
revoke all on public.vendor_bills from anon, authenticated;
revoke all on public.vendor_bill_lines from anon, authenticated;
revoke all on public.vendor_payments from anon, authenticated;
grant select, insert, update, delete on public.vendor_bills to authenticated;
grant select, insert, update, delete on public.vendor_bill_lines to authenticated;
grant select on public.vendor_payments to authenticated;

create policy vendor_bills_select on public.vendor_bills
  for select to authenticated using (public.has_role(firm_id, '{admin,manager}'));
create policy vendor_bills_insert on public.vendor_bills
  for insert to authenticated with check (public.has_role(firm_id, '{admin,manager}'));
create policy vendor_bills_update on public.vendor_bills
  for update to authenticated
  using (public.has_role(firm_id, '{admin,manager}') and status in ('pending_approval', 'rejected'))
  with check (public.has_role(firm_id, '{admin,manager}'));
create policy vendor_bills_delete on public.vendor_bills
  for delete to authenticated
  using (public.has_role(firm_id, '{admin,manager}') and status in ('pending_approval', 'rejected'));

create policy vendor_bill_lines_select on public.vendor_bill_lines
  for select to authenticated using (public.has_role(firm_id, '{admin,manager}'));
create policy vendor_bill_lines_insert on public.vendor_bill_lines
  for insert to authenticated with check (public.has_role(firm_id, '{admin,manager}'));
create policy vendor_bill_lines_update on public.vendor_bill_lines
  for update to authenticated
  using (public.has_role(firm_id, '{admin,manager}'))
  with check (public.has_role(firm_id, '{admin,manager}'));
create policy vendor_bill_lines_delete on public.vendor_bill_lines
  for delete to authenticated using (public.has_role(firm_id, '{admin,manager}'));

create policy vendor_payments_select on public.vendor_payments
  for select to authenticated using (public.has_role(firm_id, '{admin,manager}'));

-- ---------------------------------------------------------------------------
-- Expenses created from bill lines
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column vendor_bill_line_id uuid,
  add constraint expenses_vendor_bill_line_fk foreign key (firm_id, vendor_bill_line_id)
    references public.vendor_bill_lines (firm_id, id) on delete restrict;
create unique index expenses_vendor_bill_line_key on public.expenses (vendor_bill_line_id) where vendor_bill_line_id is not null;

-- ---------------------------------------------------------------------------
-- Attachments: the vendor's bill PDF and payment remittance files
-- ---------------------------------------------------------------------------
alter table public.attachments
  add column vendor_bill_id uuid,
  add column vendor_payment_id uuid,
  add constraint attachments_vendor_bill_fk foreign key (firm_id, vendor_bill_id)
    references public.vendor_bills (firm_id, id) on delete cascade,
  add constraint attachments_vendor_payment_fk foreign key (firm_id, vendor_payment_id)
    references public.vendor_payments (firm_id, id) on delete cascade,
  drop constraint attachments_owner_chk,
  add constraint attachments_owner_chk check (num_nonnulls(payment_id, expense_id, vendor_bill_id, vendor_payment_id) = 1);
create index attachments_vendor_bill_idx on public.attachments (vendor_bill_id) where vendor_bill_id is not null;
create index attachments_vendor_payment_idx on public.attachments (vendor_payment_id) where vendor_payment_id is not null;

-- Holding uploads may now also go under attachments/vendor-bills/... and attachments/vendor-payments/...
drop policy firm_files_insert on storage.objects;
create policy firm_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'firm-files'
    and public.storage_firm_id(name) is not null
    and case
      when (storage.foldername(name))[3] = 'logo' then
        public.has_role(public.storage_firm_id(name), '{admin,manager}'::public.firm_role[])
      when (storage.foldername(name))[3] = 'attachments' then
        public.has_role(public.storage_firm_id(name), '{admin,manager}'::public.firm_role[])
        and array_length(storage.foldername(name), 1) = 5
        and (storage.foldername(name))[4] in ('payments', 'expenses', 'vendor-bills', 'vendor-payments')
        and (storage.foldername(name))[5] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and storage.filename(name) ~ '^incoming-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      when (storage.foldername(name))[3] = 'invoices' then
        public.has_role(public.storage_firm_id(name), '{admin,manager}'::public.firm_role[])
      else
        public.has_role(public.storage_firm_id(name), '{admin,manager}'::public.firm_role[])
    end
  );

-- ---------------------------------------------------------------------------
-- Bank lines: a fifth link, to a vendor payment
-- ---------------------------------------------------------------------------
alter table public.bank_lines
  add column vendor_payment_id uuid,
  add constraint bank_lines_vendor_payment_fk foreign key (firm_id, vendor_payment_id)
    references public.vendor_payments (firm_id, id) on delete set null (vendor_payment_id),
  drop constraint bank_lines_one_link_chk,
  drop constraint bank_lines_done_chk,
  add constraint bank_lines_one_link_chk check (num_nonnulls(payment_id, expense_id, other_income_id, vendor_payment_id) <= 1),
  add constraint bank_lines_done_chk check ((status = 'done') = (num_nonnulls(payment_id, expense_id, other_income_id, vendor_payment_id) = 1));
create unique index bank_lines_vendor_payment_key on public.bank_lines (vendor_payment_id) where vendor_payment_id is not null;

create or replace function public.bank_lines_reset_unlinked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and num_nonnulls(new.payment_id, new.expense_id, new.other_income_id, new.vendor_payment_id) = 0 then
    new.status := 'new';
  end if;
  return new;
end;
$$;
