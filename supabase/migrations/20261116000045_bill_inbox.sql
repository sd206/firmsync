-- Bill inbox: per-firm receiving addresses, received emails (items) and their files.
-- Items are written only by the webhook (service role); people act on them through the functions below.

-- ---------------------------------------------------------------------------
-- Addresses
-- ---------------------------------------------------------------------------
create table public.bill_inbox_addresses (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id),
  code text not null,
  enabled boolean not null default true,
  unknown_sender text not null default 'hold',
  created_at timestamptz not null default now(),
  replaced_at timestamptz,
  constraint bill_inbox_addresses_firm_id_id_key unique (firm_id, id),
  constraint bill_inbox_addresses_code_key unique (code),
  constraint bill_inbox_addresses_code_chk check (code ~ '^[a-z0-9]{10}$'),
  constraint bill_inbox_addresses_unknown_chk check (unknown_sender in ('hold', 'drop'))
);
create unique index bill_inbox_addresses_current_key on public.bill_inbox_addresses (firm_id) where replaced_at is null;

-- ---------------------------------------------------------------------------
-- Items (one per received email per firm)
-- ---------------------------------------------------------------------------
create table public.bill_inbox_items (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id),
  address_id uuid not null,
  resend_email_id text not null,
  from_address text not null,
  to_address text not null,
  subject text not null default '',
  received_at timestamptz not null,
  vendor_id uuid,
  sender_kind text not null,
  forwarded_by text,
  rejected_files jsonb not null default '[]',
  download_failed boolean not null default false,
  status text not null default 'new',
  note text,
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bill_inbox_items_firm_id_id_key unique (firm_id, id),
  constraint bill_inbox_items_email_key unique (firm_id, resend_email_id),
  constraint bill_inbox_items_address_fk foreign key (firm_id, address_id)
    references public.bill_inbox_addresses (firm_id, id),
  constraint bill_inbox_items_vendor_fk foreign key (firm_id, vendor_id)
    references public.vendors (firm_id, id) on delete set null (vendor_id),
  constraint bill_inbox_items_sender_chk check (sender_kind in ('vendor', 'member', 'known', 'unknown')),
  constraint bill_inbox_items_status_chk check (status in ('new', 'bill_created', 'ignored', 'duplicate')),
  constraint bill_inbox_items_note_chk check (note is null or char_length(note) <= 500)
);
create index bill_inbox_items_firm_status_idx on public.bill_inbox_items (firm_id, status, received_at desc);
create index bill_inbox_items_firm_from_idx on public.bill_inbox_items (firm_id, from_address, received_at);

-- ---------------------------------------------------------------------------
-- Files: attachments owned by an item
-- ---------------------------------------------------------------------------
alter table public.attachments
  add column bill_inbox_item_id uuid,
  add constraint attachments_bill_inbox_item_fk foreign key (firm_id, bill_inbox_item_id)
    references public.bill_inbox_items (firm_id, id) on delete cascade,
  drop constraint attachments_owner_chk,
  add constraint attachments_owner_chk
    check (num_nonnulls(payment_id, expense_id, vendor_bill_id, vendor_payment_id, bill_inbox_item_id) = 1),
  add constraint attachments_bill_inbox_path_chk
    check (bill_inbox_item_id is null
           or storage_path like 'firms/' || firm_id::text || '/attachments/bill-inbox/' || bill_inbox_item_id::text || '/%');
create index attachments_bill_inbox_idx on public.attachments (bill_inbox_item_id) where bill_inbox_item_id is not null;

-- Which bill was created from which inbox file.
create table public.bill_inbox_bills (
  firm_id uuid not null references public.firms (id),
  item_id uuid not null,
  attachment_id uuid not null,
  bill_id uuid not null,
  created_at timestamptz not null default now(),
  constraint bill_inbox_bills_pkey primary key (attachment_id),
  constraint bill_inbox_bills_item_fk foreign key (firm_id, item_id)
    references public.bill_inbox_items (firm_id, id) on delete cascade,
  constraint bill_inbox_bills_attachment_fk foreign key (firm_id, attachment_id)
    references public.attachments (firm_id, id) on delete cascade,
  constraint bill_inbox_bills_bill_fk foreign key (firm_id, bill_id)
    references public.vendor_bills (firm_id, id) on delete cascade
);
create index bill_inbox_bills_item_idx on public.bill_inbox_bills (item_id);

-- ---------------------------------------------------------------------------
-- RLS: read for admins and managers; no direct writes from clients.
-- ---------------------------------------------------------------------------
alter table public.bill_inbox_addresses enable row level security;
alter table public.bill_inbox_items enable row level security;
alter table public.bill_inbox_bills enable row level security;
create policy bill_inbox_addresses_select on public.bill_inbox_addresses
  for select to authenticated using (public.has_role(firm_id, '{admin,manager}'));
create policy bill_inbox_items_select on public.bill_inbox_items
  for select to authenticated using (public.has_role(firm_id, '{admin,manager}'));
create policy bill_inbox_bills_select on public.bill_inbox_bills
  for select to authenticated using (public.has_role(firm_id, '{admin,manager}'));

-- ---------------------------------------------------------------------------
-- Address functions (admin only)
-- ---------------------------------------------------------------------------
create function public.bill_inbox_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alpha constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_bytes bytea;
  v_code text;
  i integer;
begin
  loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := '';
    for i in 0..9 loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 36) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.bill_inbox_addresses a where a.code = v_code);
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.bill_inbox_new_code() from public, anon, authenticated;

create function public.bill_inbox_admin(p_firm uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_firm is null or not public.has_role(p_firm, '{admin}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.bill_inbox_admin(uuid) from public, anon, authenticated;

create function public.bill_inbox_enable(p_firm uuid)
returns public.bill_inbox_addresses
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bill_inbox_addresses%rowtype;
begin
  perform public.bill_inbox_admin(p_firm);
  perform pg_advisory_xact_lock(hashtext('bill_inbox:' || p_firm::text));
  update public.bill_inbox_addresses a set enabled = true
  where a.firm_id = p_firm and a.replaced_at is null
  returning a.* into v;
  if not found then
    insert into public.bill_inbox_addresses (firm_id, code, enabled)
    values (p_firm, public.bill_inbox_new_code(), true)
    returning * into v;
  end if;
  return v;
end;
$$;

create function public.bill_inbox_disable(p_firm uuid)
returns public.bill_inbox_addresses
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bill_inbox_addresses%rowtype;
begin
  perform public.bill_inbox_admin(p_firm);
  update public.bill_inbox_addresses a set enabled = false
  where a.firm_id = p_firm and a.replaced_at is null
  returning a.* into v;
  if not found then
    raise exception 'INBOX_NOT_SET_UP' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create function public.bill_inbox_replace(p_firm uuid)
returns public.bill_inbox_addresses
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bill_inbox_addresses%rowtype;
  v_mode text;
begin
  perform public.bill_inbox_admin(p_firm);
  perform pg_advisory_xact_lock(hashtext('bill_inbox:' || p_firm::text));
  update public.bill_inbox_addresses a set replaced_at = now(), enabled = false
  where a.firm_id = p_firm and a.replaced_at is null
  returning a.unknown_sender into v_mode;
  insert into public.bill_inbox_addresses (firm_id, code, enabled, unknown_sender)
  values (p_firm, public.bill_inbox_new_code(), true, coalesce(v_mode, 'hold'))
  returning * into v;
  return v;
end;
$$;

create function public.bill_inbox_set_unknown(p_firm uuid, p_mode text)
returns public.bill_inbox_addresses
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bill_inbox_addresses%rowtype;
begin
  perform public.bill_inbox_admin(p_firm);
  if p_mode is null or p_mode not in ('hold', 'drop') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  update public.bill_inbox_addresses a set unknown_sender = p_mode
  where a.firm_id = p_firm and a.replaced_at is null
  returning a.* into v;
  if not found then
    raise exception 'INBOX_NOT_SET_UP' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Item functions (admin and manager)
-- ---------------------------------------------------------------------------
create function public.bill_inbox_lock_item(p_item uuid)
returns public.bill_inbox_items
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bill_inbox_items%rowtype;
begin
  select * into v from public.bill_inbox_items i where i.id = p_item for update;
  if not found or not public.has_role(v.firm_id, '{admin,manager}'::public.firm_role[]) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return v;
end;
$$;
revoke execute on function public.bill_inbox_lock_item(uuid) from public, anon, authenticated;

create function public.bill_inbox_set_status(p_item uuid, p_status text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bill_inbox_items%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v := public.bill_inbox_lock_item(p_item);
  if p_status is null or p_status not in ('new', 'ignored', 'duplicate', 'bill_created') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'INBOX_NOTE' using errcode = 'P0001';
  end if;
  if p_status = 'new' then
    update public.bill_inbox_items i set status = 'new', note = null, handled_by = null, handled_at = null where i.id = v.id;
    return;
  end if;
  if v.status <> 'new' then
    raise exception 'INBOX_STATE' using errcode = 'P0001';
  end if;
  update public.bill_inbox_items i
  set status = p_status, note = v_note, handled_by = auth.uid(), handled_at = now()
  where i.id = v.id;
end;
$$;
revoke execute on function public.bill_inbox_set_status(uuid, text, text) from public, anon;
grant execute on function public.bill_inbox_set_status(uuid, text, text) to authenticated;

create function public.bill_inbox_link_bill(p_item uuid, p_attachment uuid, p_bill uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.bill_inbox_items%rowtype;
begin
  v := public.bill_inbox_lock_item(p_item);
  if not exists (
    select 1 from public.attachments a where a.id = p_attachment and a.firm_id = v.firm_id and a.bill_inbox_item_id = v.id
  ) then
    raise exception 'ATTACHMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.vendor_bills b where b.id = p_bill and b.firm_id = v.firm_id) then
    raise exception 'BILL_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.bill_inbox_bills (firm_id, item_id, attachment_id, bill_id)
  values (v.firm_id, v.id, p_attachment, p_bill)
  on conflict (attachment_id) do update set bill_id = excluded.bill_id;
  if v.status = 'new' and not exists (
    select 1 from public.attachments a
    where a.bill_inbox_item_id = v.id
      and not exists (select 1 from public.bill_inbox_bills x where x.attachment_id = a.id)
  ) then
    update public.bill_inbox_items i
    set status = 'bill_created', handled_by = auth.uid(), handled_at = now()
    where i.id = v.id;
  end if;
end;
$$;
revoke execute on function public.bill_inbox_link_bill(uuid, uuid, uuid) from public, anon;
grant execute on function public.bill_inbox_link_bill(uuid, uuid, uuid) to authenticated;

-- Grants for the address functions (each checks admin itself).
revoke execute on function public.bill_inbox_enable(uuid) from public, anon;
revoke execute on function public.bill_inbox_disable(uuid) from public, anon;
revoke execute on function public.bill_inbox_replace(uuid) from public, anon;
revoke execute on function public.bill_inbox_set_unknown(uuid, text) from public, anon;
grant execute on function public.bill_inbox_enable(uuid) to authenticated;
grant execute on function public.bill_inbox_disable(uuid) to authenticated;
grant execute on function public.bill_inbox_replace(uuid) to authenticated;
grant execute on function public.bill_inbox_set_unknown(uuid, text) to authenticated;
