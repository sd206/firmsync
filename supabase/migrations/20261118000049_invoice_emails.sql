-- Emailing invoices (checklist item 22; design 2026-11-17-email-invoices-design.md).
-- invoice_emails is the send history. Rows are written only by invoice_email_start
-- (before the app sends) and invoice_email_finish (after), which check roles,
-- invoice status, recipients and rate limits. The firm's default wording lives in
-- two nullable firms columns (null = the app's built-in default).
-- Billing Part 3 (read-only firms) must add its read-only refusal to invoice_email_start.

create type public.invoice_email_status as enum ('sending', 'sent', 'failed');

create table public.invoice_emails (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id),
  invoice_id uuid not null,
  to_addresses text[] not null,
  cc_addresses text[] not null default '{}',
  reply_to text,
  subject text not null,
  body text not null,
  pdf_path text not null,
  status public.invoice_email_status not null default 'sending',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (user_id) on delete set null,
  sent_at timestamptz,
  constraint invoice_emails_firm_id_id_key unique (firm_id, id),
  constraint invoice_emails_invoice_fk foreign key (firm_id, invoice_id)
    references public.invoices (firm_id, id) on delete cascade,
  constraint invoice_emails_to_chk check (cardinality(to_addresses) between 1 and 5),
  constraint invoice_emails_cc_chk check (cardinality(cc_addresses) between 0 and 5),
  constraint invoice_emails_subject_chk check (
    length(btrim(subject)) between 1 and 200 and subject !~ '[\r\n]'
  ),
  constraint invoice_emails_body_chk check (length(btrim(body)) between 1 and 5000),
  constraint invoice_emails_sent_chk check ((status = 'sent') = (sent_at is not null)),
  constraint invoice_emails_error_chk check (error is null or length(error) <= 500)
);
create index invoice_emails_invoice_idx on public.invoice_emails (firm_id, invoice_id, created_at desc);
create index invoice_emails_firm_created_idx on public.invoice_emails (firm_id, created_at);
create index invoice_emails_created_by_idx on public.invoice_emails (created_by);

create trigger invoice_emails_audit
  after insert or update or delete on public.invoice_emails
  for each row execute function public.audit_row();

alter table public.invoice_emails enable row level security;
revoke all on public.invoice_emails from anon, authenticated;
grant select on public.invoice_emails to authenticated;

create policy invoice_emails_select on public.invoice_emails
  for select to authenticated using (public.has_role(firm_id, '{admin,manager}'));

-- ---------------------------------------------------------------------------
-- Firm default wording (admins and managers edit firm settings, migration 039).
-- ---------------------------------------------------------------------------
alter table public.firms
  add column invoice_email_subject text,
  add column invoice_email_body text,
  add constraint firms_invoice_email_subject_chk check (
    invoice_email_subject is null
    or (length(btrim(invoice_email_subject)) between 1 and 200 and invoice_email_subject !~ '[\r\n]')
  ),
  add constraint firms_invoice_email_body_chk check (
    invoice_email_body is null or length(btrim(invoice_email_body)) between 1 and 5000
  );

grant update (invoice_email_subject, invoice_email_body) on public.firms to authenticated;

-- ---------------------------------------------------------------------------
-- Address check, mirrored by EMAIL_RE in src/lib/email/addresses.ts.
-- ---------------------------------------------------------------------------
create function public.is_valid_email(p_address text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_address is not null
    and length(p_address) <= 254
    and p_address ~ '^[^@[:space:]<>,;"]+@[^@[:space:]<>,;"]+\.[^@[:space:]<>,;"]+$'
$$;

revoke execute on function public.is_valid_email(text) from public, anon;
grant execute on function public.is_valid_email(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Start a send: checks, rate limits, history row in 'sending'. Returns its id,
-- which the app also uses as the provider's idempotency key.
-- ---------------------------------------------------------------------------
create function public.invoice_email_start(
  p_invoice uuid,
  p_to text[],
  p_cc text[],
  p_reply_to text,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_same_invoice_gap constant interval := interval '60 seconds';
  c_per_invoice_day constant integer := 10;
  c_per_firm_hour constant integer := 50;
  c_per_firm_day constant integer := 200;
  v_firm uuid;
  v_status public.invoice_status;
  v_pdf text;
  v_cc text[] := coalesce(p_cc, '{}');
  v_id uuid;
begin
  select i.firm_id into v_firm from public.invoices i where i.id = p_invoice;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_role(v_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- Serialise sends per firm (rate limits) and hold the invoice's status steady.
  perform pg_advisory_xact_lock(hashtextextended('invoice_email:' || v_firm::text, 0));
  select i.status, i.pdf_path into v_status, v_pdf
  from public.invoices i where i.id = p_invoice
  for no key update;

  if v_status not in ('issued', 'partly_paid', 'paid') then
    raise exception 'INVOICE_NOT_SENDABLE' using errcode = 'P0001';
  end if;
  if v_pdf is null then
    raise exception 'INVOICE_NO_PDF' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_to, '{}') || v_cc) a where not public.is_valid_email(a)
  ) or (p_reply_to is not null and not public.is_valid_email(p_reply_to)) then
    raise exception 'EMAIL_ADDRESS_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.invoice_emails e
    where e.firm_id = v_firm and e.invoice_id = p_invoice and e.created_at > now() - c_same_invoice_gap
  )
  or (
    select count(*) from public.invoice_emails e
    where e.firm_id = v_firm and e.invoice_id = p_invoice and e.created_at > now() - interval '1 day'
  ) >= c_per_invoice_day
  or (
    select count(*) from public.invoice_emails e
    where e.firm_id = v_firm and e.created_at > now() - interval '1 hour'
  ) >= c_per_firm_hour
  or (
    select count(*) from public.invoice_emails e
    where e.firm_id = v_firm and e.created_at > now() - interval '1 day'
  ) >= c_per_firm_day then
    raise exception 'EMAIL_RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.invoice_emails (
    firm_id, invoice_id, to_addresses, cc_addresses, reply_to, subject, body, pdf_path
  )
  values (v_firm, p_invoice, coalesce(p_to, '{}'), v_cc, p_reply_to, p_subject, p_body, v_pdf)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.invoice_email_start(uuid, text[], text[], text, text, text) from public, anon;
grant execute on function public.invoice_email_start(uuid, text[], text[], text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Finish a send: 'sending' -> 'sent' or 'failed', once.
-- ---------------------------------------------------------------------------
create function public.invoice_email_finish(
  p_id uuid,
  p_ok boolean,
  p_provider_id text,
  p_error text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_firm uuid;
  v_status public.invoice_email_status;
begin
  select e.firm_id into v_firm from public.invoice_emails e where e.id = p_id;
  if not found then
    raise exception 'EMAIL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_role(v_firm, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  select e.status into v_status from public.invoice_emails e where e.id = p_id for update;
  if v_status <> 'sending' then
    raise exception 'EMAIL_STATE' using errcode = 'P0001';
  end if;

  update public.invoice_emails e
  set status = case when p_ok then 'sent'::public.invoice_email_status else 'failed'::public.invoice_email_status end,
      sent_at = case when p_ok then now() end,
      provider_message_id = left(p_provider_id, 200),
      error = case when p_ok then null else left(coalesce(p_error, 'Unknown error'), 500) end
  where e.id = p_id;
end;
$$;

revoke execute on function public.invoice_email_finish(uuid, boolean, text, text) from public, anon;
grant execute on function public.invoice_email_finish(uuid, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Latest successful send per invoice (invoice list marker, invoice page line).
-- Security invoker: row-level security limits it to admins and managers.
-- ---------------------------------------------------------------------------
create function public.invoice_last_emails(p_firm uuid)
returns table (invoice_id uuid, sent_at timestamptz, to_addresses text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (e.invoice_id) e.invoice_id, e.sent_at, e.to_addresses
  from public.invoice_emails e
  where e.firm_id = p_firm and e.status = 'sent'
  order by e.invoice_id, e.sent_at desc
$$;

revoke execute on function public.invoice_last_emails(uuid) from public, anon;
grant execute on function public.invoice_last_emails(uuid) to authenticated;
