-- Inbox files remember which Resend attachment they came from, so a retry stores each one once
-- (even with two files of the same name, or two retries running at the same time).
alter table public.attachments add column bill_inbox_source text;
create unique index attachments_bill_inbox_source_key
  on public.attachments (bill_inbox_item_id, bill_inbox_source)
  where bill_inbox_source is not null;
