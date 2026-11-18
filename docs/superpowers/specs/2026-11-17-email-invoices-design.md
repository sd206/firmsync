# Email invoices from the app — design

Checklist item 22. Status: **approved by the owner on 2026-11-17** with all five recommended answers (section 12).

## 1. Why

Today a firm issues an invoice in FirmSync, downloads the PDF and attaches it to an email by hand. FreshBooks, Zoho, Harvest and Clockify all send the invoice from the app, so its absence is a visible gap on the comparison pages. The owner decided on 2026-11-17 to close it before launch.

Success: an admin or manager opens an issued invoice, presses **Email invoice**, checks the prefilled recipients and message, presses **Send**, and the client receives an email from the firm with the PDF attached. The invoice shows when it was sent, by whom and to whom, and it can be sent again.

## 2. Goals, non-goals, anti-goals

**Goals**
- Send an issued, partly paid or paid invoice by email, with its stored PDF attached.
- Prefilled, editable recipients, subject and message; a firm-wide default message.
- A send history on the invoice, and resending.
- Safe when email isn't configured; testable locally without a Resend account.

**Non-goals** (later, separately): payment reminders and overdue chasers, online payment links, recurring invoices, open/click tracking, bounce and complaint webhooks, HTML/branded email designs, emailing statements or receipts, per-client default CC lists.

Open/click tracking is *not* trivial here: it needs a Resend webhook route, signature checking and per-message state, and tracking pixels hurt deliverability for B2B mail. Left out.

**Anti-goals** (failure even if it "works")
- Mail that looks like it comes from FirmSync rather than the firm, or that the client can't reply to.
- The platform's sending domain getting a spam reputation because one firm (or a stolen manager login) blasts mail through it.
- A client receiving a PDF that doesn't match the issued invoice (re-rendered with changed firm details, a draft, a voided invoice).
- A send that silently half-happened: the history says "sent" when it wasn't, or the client gets two copies from one click.
- Consultants seeing any of it.

## 3. Constraints

- Next.js 15 server actions, Supabase RLS + `security definer` functions with `set search_path = ''`; the database enforces the rules (ARCHITECTURE §2).
- No queue or background jobs (ARCHITECTURE §9). Work runs inline in the request.
- Outbound mail goes through Resend's HTTP API, as `modules/storage/alerts` does. Resend only sends from a verified domain; production sending waits on checklist item 11 (verified domain, `NOTIFY_FROM`).
- The product name may change (FINSYNC trademark). Customer-facing mail leads with the **firm's** name; the product name comes from one config value.
- Public material and tests use the fictional "Demo Consulting" firm only.
- Don't touch billing/Stripe. Read-only mode (billing Part 3) isn't built yet; this design must slot into it.

## 4. Approaches considered

**A. Send inline from a server action, with a send-log row written first (chosen).**
A database function records the send as `sending` (checking role, invoice status and rate limits), the server action calls Resend with the stored PDF, then a second function marks it `sent` or `failed`. Matches every existing flow (issue → PDF is already "database step, then outside work, then record the result"). One request, a few hundred ms to a couple of seconds. *Cost:* if the server dies between the two steps the row stays `sending`; handled by showing it as "Unknown" after 10 minutes (section 7).

**B. Queue the send and deliver from a cron job.** Survives crashes and retries automatically, but the app has no scheduler yet (billing Part 3 will add a daily Vercel Cron, too slow for this) and the user wouldn't see success or failure when they press Send. Not worth new infrastructure for a few sends a day per firm.

**C. Send from the database (Supabase Edge Function or `pg_net` triggered by an insert).** Keeps the send next to the data, but splits the code across two runtimes, puts the Resend key in Supabase as well as Vercel, and is much harder to test with the existing Vitest/Playwright setup. No benefit at this size.

## 5. Who can do what

| | Admin | Manager | Consultant |
|---|---|---|---|
| See **Email invoice** and the send history | Yes | Yes | No (invoice pages are already a 404) |
| Send / resend | Yes | Yes | No |
| Edit the firm's default email in Settings | Yes | Yes *(our call: managers already edit firm settings and invoice templates, migration 039)* | No |

Enforced twice, as everywhere: `requireFirmRole(firmId, ['admin','manager'])` in the action, and `has_role(firm, '{admin,manager}')` inside the database functions and the RLS select policy.

## 6. Which invoices can be sent

- `issued`, `partly_paid`, `paid`: yes. A paid invoice can be sent as a copy (clients ask for these for their records).
- `draft`: no. The button isn't shown; the database refuses with `INVOICE_NOT_SENDABLE`.
- `void`: no. Same. Its earlier send history stays visible.
- An invoice with no stored PDF (PDF failed at issue): the dialog says "This invoice has no PDF yet. Use Regenerate PDF first." and Send is disabled. The database refuses too (`INVOICE_NO_PDF`).

Always the **stored** PDF (`invoices.pdf_path`) — the exact document made at issue — never a fresh render. If the firm used Regenerate PDF, the regenerated one is what's stored and sent.

## 7. The send, step by step

1. **Open the dialog** (client component on the invoice page). Prefilled from the server:
   - **To:** the client's *current* `billing_email` (so a corrected address is used when resending), falling back to the email frozen on the invoice (`bill_to_email`). Empty if neither exists, with a hint "Add a billing email to this client to fill this in next time."
   - **CC:** empty, plus a "Send me a copy" checkbox (adds the sender's login email to CC).
   - **Subject** and **Message:** the firm's template (section 8) with the invoice's values filled in, editable for this send only.
   - Read-only lines: "From: Demo Consulting via FirmSync <invoices@…>", "Replies go to: billing@demo-consulting.test", "Attached: INV-2026-0012.pdf (84 KB)".
2. **Validate** (zod in the action, mirrored in the database):
   - To: 1–5 addresses; CC: 0–5; at most 10 in total after removing duplicates (case-insensitive). Commas, semicolons or new lines separate addresses.
   - Each address: a practical email pattern (one `@`, a dot in the domain, no spaces, no control characters or `<>`, ≤ 254 characters).
   - Subject: 1–200 characters, one line (new lines removed — stops header injection).
   - Message: 1–5,000 characters.
3. **Start** — `invoice_email_start(p_invoice, p_to text[], p_cc text[], p_subject, p_body)`, `security definer`:
   - `has_role(firm, '{admin,manager}')` else `42501`.
   - Locks the invoice row (`for no key update`) so two clicks serialise.
   - Status must be issued / partly paid / paid; `pdf_path` must be set.
   - Re-validates counts, lengths and the address pattern (database is the source of truth).
   - Rate limits (section 10) else `EMAIL_RATE_LIMITED`.
   - (When billing Part 3 lands: refuses for a read-only firm, like every write path.)
   - Inserts an `invoice_emails` row with status `sending` and the PDF path, and returns its id.
4. **Send** (server action, Node runtime): reads the stored PDF (`readStoredPdf`), builds the message (section 9) and calls the mail sender with a 15-second timeout. The `invoice_emails.id` is passed as Resend's `Idempotency-Key`, so a retried request can't produce a second email.
5. **Finish** — `invoice_email_finish(p_id, p_ok boolean, p_provider_id text, p_error text)` sets `sent` (with `sent_at` and Resend's message id) or `failed` (with a short error, never the API key or full response). Only moves a row out of `sending`; callable by admin/manager of that firm.
6. **Tell the user:** "Invoice INV-2026-0012 sent to ap@client.test." or "The email couldn't be sent: <reason>. Nothing was delivered; you can try again." The page revalidates and the history updates.

A row left in `sending` for more than 10 minutes (server crashed mid-send) is shown as **"Unknown — check with the client before resending"**. It doesn't block resending.

## 8. The email template

**Firm default, editable in Settings** (new "Invoice email" section on the Settings page) — *subject to owner decision Q3*. Two new nullable columns on `firms`: `invoice_email_subject`, `invoice_email_body`. Null means "use the built-in default", so improving the default later reaches every firm that never customised it. A **Reset to default** button sets them back to null.

Built-in default:

```
Subject: Invoice {invoice_number} from {firm_name}

Hi {client_contact},

Please find attached invoice {invoice_number} for {invoice_total}, due on {due_date}.
Amount due: {amount_due}.

If you have any questions, just reply to this email.

Thank you,
{firm_name}
```

Placeholders (listed beside the editor; unknown `{words}` are left as typed and flagged in Settings with "Unknown placeholder {x}"):

| Placeholder | Value |
|---|---|
| `{firm_name}` | Firm name |
| `{client_name}` | Client name (frozen on the invoice) |
| `{client_contact}` | Billing contact name, or the client name if none |
| `{invoice_number}` | e.g. INV-2026-0012 |
| `{invoice_total}` | Total with currency code, as on the PDF |
| `{amount_due}` | Balance due with currency code |
| `{issue_date}`, `{due_date}` | Dates in the same format as the PDF |
| `{subject}` | The invoice's own subject line, or empty |

Rendering is a pure function (`renderInvoiceEmail(template, values)`), unit-tested, single left-to-right pass so substituted text is never re-read as a placeholder (same rule as invoice numbers).

**Plain text only** *(our call)*. It's what an accountant expects from a small firm, renders everywhere, can't be used to smuggle HTML or tracking, and needs no email-design work. Firm branding is on the attached PDF. A styled HTML version is a later, separate piece.

No product footer in the body *(our call — see Q1 for the "via" display name, which is where the product name appears)*.

## 9. Sender, reply-to and the product name

- **Product name** comes from one constant, `PRODUCT_NAME` in `src/lib/brand.ts` (new). This item uses it for invoice mail; existing uses ("FirmSync" in the layout title, login card and storage alert subject) are switched to it in the same change, since they're four lines. *(Our call; a rename then touches one line.)*
- **From address:** the platform's verified domain. New optional env `INVOICE_EMAIL_FROM` (bare address, e.g. `invoices@<domain>`); if unset, the address part of `NOTIFY_FROM` is used. One verified domain covers both.
- **From display name:** the firm's name, built in code, never typed by the user: `"Demo Consulting via FirmSync" <invoices@…>` — *owner decision Q1*. The firm name is cleaned for the header (quotes, `<>`, commas and control characters removed, trimmed to 60 characters).
- **Reply-To:** the firm's contact email from Settings › Firm details (`firms.contact_email`); if that's empty, the sending user's login email — *owner decision Q2*. Shown in the dialog, not editable there.
- The client's own mail never goes to FirmSync: replies, out-of-office and "please send to AP" answers all reach the firm.

**Mail sender module** (`src/lib/email/`, new): one `sendEmail(msg)` interface with attachments, CC, reply-to and an idempotency key, and two transports chosen from the environment:
- **Resend** (`RESEND_API_KEY` set): `POST https://api.resend.com/emails`, attachment as base64.
- **Mailpit** (`EMAIL_TRANSPORT=mailpit`, local only): `POST http://127.0.0.1:54424/api/v1/send` — the Mailpit bundled with local Supabase (v1.31) accepts mail with attachments over HTTP, so local and e2e testing need no Resend account and no new npm package.
The storage alert is moved onto the same module *(our call; small, and keeps one Resend client)*.

## 10. Rate limits and abuse protection

The danger is the platform's shared sending domain: if mail from it is reported as spam, every firm's invoices start landing in junk. Limits are generous for real invoicing and tight for misuse:

| Limit | Value *(our call)* | Why |
|---|---|---|
| Same invoice, again | not within 60 seconds | Stops double-clicks and accidental repeats |
| Same invoice, per day | 10 sends | Real resends are a handful |
| Per firm, per hour | 50 sends | A month-end batch for a 50-person firm fits |
| Per firm, per day | 200 sends | Far above a small firm's daily invoices |
| Recipients per send | 10 (To ≤ 5, CC ≤ 5) | No mailing-list use |

Counted from `invoice_emails` (index on `firm_id, created_at`), enforced inside `invoice_email_start`, so they can't be bypassed from the browser. Failed sends count too (a broken loop can't hammer Resend). Message: "Too many invoice emails. Try again in a few minutes." Constants live in one SQL function so they can be changed by a migration.

Other protections: only signed-in admins/managers of a paying firm; only real issued invoices; plain text body; every send is audited with full recipients and text; Resend's own suppression list stops repeated sends to bounced or complaining addresses. **Kill switch:** unsetting `INVOICE_EMAIL_FROM`/`NOTIFY_FROM` turns sending off platform-wide with an environment change and redeploy, no code change.

"Paying firm" holds once Stripe billing is live; until then any firm the platform owner created can send.

Bounce/complaint webhooks and a platform-owner view of send volumes are left for later (non-goal).

## 11. Behaviour in other situations

**Email not configured** (no `RESEND_API_KEY`, or no from address; or locally no `EMAIL_TRANSPORT=mailpit`):
- The invoice page still shows **Email invoice**, disabled, with "Emailing invoices isn't set up yet. Download the PDF and attach it to your own email." *(our call: hiding it would make firms think the feature doesn't exist.)*
- Settings › Invoice email can still be edited, with a note that sending isn't set up.
- The action checks again and returns the same message; nothing is written to `invoice_emails`; nothing throws.

**Storage limits:** none. Sending reads the existing PDF and stores nothing new, so it isn't gated and doesn't trigger `afterStore`. A firm at 100% can still email invoices (consistent with "invoice PDFs are never gated").

**Read-only firms (billing Part 3, not built yet):** sending is a write (it creates a history row and sends on the firm's behalf), so `invoice_email_start` will refuse for a read-only firm with the standard read-only error. The Part 3 work adds that check to this function with the others; the plan will leave a note.

**Voiding after sending:** allowed as today; the history stays. (A "this invoice was voided" email to the client is a later feature.)

**Client deleted / renamed:** the history keeps the recipients and subject as sent.

**Audit:** `invoice_emails` gets the standard `audit_row()` trigger, so the audit log holds who sent what to whom, when, and the start→sent/failed update. The invoice row itself is not changed by sending (unless Q4 says otherwise), so no extra invoice audit noise.

## 12. Decisions for the owner

**Decided 2026-11-17 (owner: "Approve all five"):**
1. Sender display name: "<Firm name> via <PRODUCT_NAME>", e.g. "Demo Consulting via FirmSync".
2. Reply-To: the firm's contact email from Settings, falling back to the sender's login email.
3. Editable wording: a firm default in Settings (with Reset to default) plus per-send edits.
4. No new "sent" invoice status: "Emailed <date> to <address>" on the invoice and an Emailed marker in the invoices list.
5. Attach the stored PDF; no link.

The options as they were put to the owner:

1. **Sender display name.** Recommended: **"Demo Consulting via FirmSync"** — leads with the firm, is honest about who's sending (the address is on our domain, not theirs), and is the pattern Stripe/FreshBooks use. Alternative: **"Demo Consulting"** alone — cleaner, but a client may wonder why the address isn't the firm's own, and the product gets no mention. Either way the product part is the one `PRODUCT_NAME` value.
2. **Reply-to.** Recommended: the firm's contact email from Settings, falling back to the sender's own login email. Alternative: always the sender's login email (replies go to whoever pressed Send, not the shared billing address).
3. **Can firms edit the email template?** Recommended: **yes — a firm default in Settings plus per-send edits** (≈ half a day extra). Alternatives: per-send edits only, with a fixed default; or no editing at all (fastest, but firms can't add bank details or a personal note).
4. **Mark the invoice "sent"?** Recommended: **no new status.** Invoice status follows payments (issued → partly paid → paid) and feeds reports and ageing; adding "sent" would tangle that. Instead show **"Emailed 17 Nov to ap@client.test"** on the invoice and an **Emailed** marker in the invoices list. Alternative: a real `sent` status between issued and paid (touches payments, reports, bank matching, more risk).
5. **Attachment or link?** Recommended: **attach the PDF.** Accounts-payable inboxes and tools expect an attachment, the client needs no account or click-through, and the files are small (typically under 200 KB; Resend allows 40 MB). A link would need a new public, unauthenticated download route with expiring tokens — a new attack surface and an extra click. Alternative: link only, or both.

## 13. Data model (for the plan)

```sql
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
  -- plus checks: 1–5 to, 0–5 cc, subject/body lengths, status ⇔ sent_at/error consistency
);
create index invoice_emails_invoice_idx on public.invoice_emails (firm_id, invoice_id, created_at desc);
create index invoice_emails_firm_created_idx on public.invoice_emails (firm_id, created_at);
```

- RLS: select for `has_role(firm_id, '{admin,manager}')`; no insert/update/delete grants (functions only). Audit trigger.
- `firms.invoice_email_subject text`, `firms.invoice_email_body text` (nullable, length checks), written through the existing firm-settings update path.
- Invoice drafts are deleted, never issued-then-deleted, so `on delete cascade` only matters for whole-firm deletion (billing Part 3).

## 14. Tests at each layer

**Unit (Vitest)**
- `renderInvoiceEmail`: every placeholder, missing contact fallback, unknown placeholders left alone, no re-substitution, money and date formats match the PDF.
- Recipient parsing and validation: separators, duplicates, case, bad addresses, header-injection attempts (`\r\n`, `<>`), limits.
- From/reply-to building: display-name cleaning, `INVOICE_EMAIL_FROM` vs `NOTIFY_FROM` fallback, reply-to fallback.
- Config detection: each combination of env vars → configured / not configured / mailpit.
- Transports with a fake `fetch`: Resend payload shape (base64 attachment, CC, reply_to, Idempotency-Key header), Mailpit payload shape, timeout and non-2xx → error without leaking the key.
- Send action orchestration with fakes: start → send → finish(sent); send fails → finish(failed); start refused → no send.

**Integration (local Supabase)**
- Admin and manager can start/finish; consultant and another firm's admin get `42501`; consultants can't select `invoice_emails`; no direct insert/update.
- Draft and void refused; missing PDF refused.
- Validation in the database (counts, lengths, bad addresses).
- Each rate limit, including the 60-second same-invoice rule and that failed sends count.
- `finish` only moves `sending` rows, only in the caller's firm.
- Audit rows written for insert and update.
- Firm template columns: managers can update, consultants can't.

**End-to-end (Playwright, `EMAIL_TRANSPORT=mailpit`)**
- A manager issues an invoice for Demo Consulting, opens Email invoice, sees the client's billing email prefilled, sends; the message arrives in Mailpit (read via Mailpit's API) with the right subject, Reply-To, From display name and the PDF attachment; the history shows Sent with the recipient.
- Resend within 60 seconds shows the rate-limit message.
- Draft invoice has no Email button; consultant gets 404.
- With email not configured (a test-only server env), the button is disabled with the explanation.
- Settings: edit the template, see it used in the dialog, reset to default.

## 15. Left to the builder

Exact component layout of the dialog and history table, date formatting helper reuse, error code → message mapping in `db-errors.ts`, how the e2e suite switches email config off for one test, and whether the history lives in its own component file.
