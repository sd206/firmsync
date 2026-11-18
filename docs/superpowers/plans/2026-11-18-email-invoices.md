# Email Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins and managers email an issued invoice (stored PDF attached) to the client from the invoice page, with a send history, resending, a firm-editable template and rate limits.

**Architecture:** A `security definer` function records each send as `sending` (role, status, PDF, validation and rate limits checked in the database), the server action sends through a small mail module (Resend in production, local Mailpit's HTTP API in development and e2e), then a second function marks it `sent` or `failed`. History lives in `invoice_emails`; the firm's default wording in two nullable `firms` columns.

**Tech Stack:** Next.js 15 server actions, Supabase Postgres (RLS, plpgsql), zod 4, Vitest, Playwright, Resend HTTP API, Mailpit v1.31 `/api/v1/send`.

**Spec:** `docs/superpowers/specs/2026-11-17-email-invoices-design.md` (approved 2026-11-17, all five recommendations).

## Global Constraints

- Sendable statuses: `issued`, `partly_paid`, `paid`. Never `draft` or `void`. Requires `invoices.pdf_path`.
- Roles: admin and manager only, checked in the action (`requireFirmRole`) and in every database function (`has_role(..., '{admin,manager}')` → `42501`).
- Recipients: To 1–5, CC 0–5, ≤ 10 total after case-insensitive de-duplication; separators `,` `;` newline; each address ≤ 254 chars, matches `^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$` (no control characters).
- Subject 1–200 chars, single line (CR/LF replaced by a space). Message 1–5,000 chars.
- Rate limits: same invoice not within 60 s; 10 per invoice per 24 h; 50 per firm per hour; 200 per firm per 24 h. Failed sends count.
- From: `"<firm name cleaned> via <PRODUCT_NAME>" <address>`; address = `INVOICE_EMAIL_FROM`, else the address in `NOTIFY_FROM`. Firm name cleaned: remove `"` `<` `>` `,` `;` `\` and control characters, collapse spaces, trim, max 60 chars.
- Reply-To: `firms.contact_email`, else the sender's login email.
- Plain text only. Always the stored PDF, never re-rendered. Attachment filename `<invoice number>.pdf` with characters outside `[A-Za-z0-9._-]` replaced by `-`.
- `PRODUCT_NAME = 'FirmSync'` in `src/lib/brand.ts` is the only place the product name is written in `src/`.
- Not configured → no throw, no row written; message: "Emailing invoices isn't set up yet. Download the PDF and attach it to your own email."
- Mailpit transport only when `EMAIL_TRANSPORT=mailpit` and `MAILPIT_URL` (default `http://127.0.0.1:54424`) has host `127.0.0.1` or `localhost`.
- Test data: fictional only ("Demo Consulting", `*.test` addresses).
- Don't touch billing/Stripe, `launch/`, `marketing/`. Don't push or apply migrations to production.

## Review Focus

1. Double click on Send → exactly one email (60 s rule under the invoice row lock) — Task 4 integration test "second start within 60 seconds is refused".
2. Header injection through subject or addresses (`\r\nBcc:`) → stripped or refused — Task 1 unit tests and Task 4 database check.
3. Resend down / times out → history row `failed`, user told nothing was delivered, can retry after 60 s — Task 5 orchestration test.
4. Server dies between start and finish → row shows "Unknown" after 10 min, resend still allowed — Task 5 `historyStatus` unit test.
5. A firm name with quotes or angle brackets breaking the From header — Task 1 `cleanDisplayName` test.

---

### Task 1: Brand constant and address helpers

**Files:**
- Create: `src/lib/brand.ts`, `src/lib/email/addresses.ts`, `src/lib/email/addresses.test.ts`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/login/login-form.tsx`, `src/modules/storage/alerts.ts` (use `PRODUCT_NAME`)

**Interfaces — Produces:**
- `PRODUCT_NAME: string`
- `EMAIL_RE: RegExp`; `isValidEmail(s: string): boolean`
- `parseAddressList(raw: string): string[]` — split on `,` `;` `\n`, trim, lowercase, drop empties, de-duplicate keeping order.
- `validateRecipients(to: string[], cc: string[]): Result<{ to: string[]; cc: string[] }>` — removes CC entries already in To; messages: "Add at least one recipient.", "Up to 5 addresses in To.", "Up to 5 addresses in CC.", "<addr> isn't a valid email address."
- `cleanDisplayName(name: string): string`
- `addressOf(from: string): string | null` — `"Name <a@b.c>"` or bare `a@b.c` → `a@b.c`; invalid → null.
- `formatFrom(displayName: string, address: string): string` → `"Demo Consulting via FirmSync" <invoices@x.test>`
- `singleLine(s: string): string` — CR/LF/tab → space, collapse, trim.

- [ ] Step 1: tests — `parseAddressList('A@x.test; b@x.test,\na@x.test')` → `['a@x.test','b@x.test']`; `isValidEmail` false for `a@b`, `a b@x.test`, `a@x.test\r\nBcc: e@x.test`, `<a@x.test>`, 255-char address; `validateRecipients` limits and CC de-dup; `cleanDisplayName('"Evil" <Co>, Ltd\r\n')` → `Evil Co Ltd`; 80-char name → 60 chars; `addressOf('FirmSync <alerts@x.test>')` → `alerts@x.test`; `formatFrom` output above; `singleLine('a\r\nBcc: b')` → `a Bcc: b`.
- [ ] Step 2: run `npx vitest run --project unit src/lib/email` → FAIL (module missing).
- [ ] Step 3: implement; replace the four "FirmSync" literals with `PRODUCT_NAME` (storage alert test still expects "…its FirmSync storage").
- [ ] Step 4: run → PASS. Step 5: commit `feat(email): brand constant and address helpers`.

### Task 2: Mail module (config + transports), storage alert moved onto it

**Files:**
- Create: `src/lib/email/send.ts`, `src/lib/email/send.test.ts`
- Modify: `src/modules/storage/alerts.ts`, `src/modules/storage/alerts.test.ts`

**Interfaces — Produces:**
```ts
export type MailAttachment = { filename: string; content: Uint8Array; contentType: string }
export type MailMessage = { from: string; to: string[]; cc?: string[]; replyTo?: string; subject: string; text: string; attachments?: MailAttachment[]; idempotencyKey?: string }
export type SendEmail = (msg: MailMessage) => Promise<{ id: string | null }>
export type EmailConfig = { ok: true; transport: 'resend' | 'mailpit'; fromAddress: string | null } | { ok: false }
export function emailConfig(env: Record<string, string | undefined>): EmailConfig   // ok when a transport exists; fromAddress = INVOICE_EMAIL_FROM ?? addressOf(NOTIFY_FROM)
export function invoiceEmailReady(env): boolean   // config ok && fromAddress !== null
export function createSender(env, fetchImpl = fetch): SendEmail | null
```
- Resend: `POST https://api.resend.com/emails`, headers `Authorization: Bearer <key>`, `Idempotency-Key` when given; body `{from,to,cc,reply_to,subject,text,attachments:[{filename,content:<base64>}]}`; returns `{id}`.
- Mailpit: `POST <MAILPIT_URL>/api/v1/send`; body `{From:{Email,Name},To:[{Email}],Cc:[{Email}],ReplyTo:[{Email}],Subject,Text,Attachments:[{Filename,Content:<base64>,ContentType}]}`; returns `{ID}`. Name/Email split from `from` with a small parser.
- 15 s timeout (`AbortSignal.timeout(15000)`); non-2xx → `Error('<transport> send failed: <status>')` — never includes the API key or request body; response text truncated to 200 chars.
- Transport precedence: `EMAIL_TRANSPORT=mailpit` (with local host check) else `RESEND_API_KEY`.
- `afterStore` keeps its behaviour and signature, but sends via `createSender` (its `deps.send` type becomes the new `SendEmail`); still needs `NOTIFY_FROM`.

- [ ] Step 1: tests with a fake fetch: config matrix (no vars → `{ok:false}`; key only → resend, fromAddress null; key + NOTIFY_FROM → address parsed; INVOICE_EMAIL_FROM wins; mailpit with `http://10.0.0.5:54424` → not mailpit); Resend payload/headers incl. base64 attachment and Idempotency-Key; Mailpit payload; 500 response → rejects with message not containing the key; returned ids.
- [ ] Step 2: FAIL. Step 3: implement, refit `alerts.ts`/test. Step 4: `npx vitest run --project unit src/lib/email src/modules/storage` PASS. Step 5: commit.

### Task 3: Template rendering

**Files:** Create `src/modules/invoice-emails/template.ts`, `template.test.ts`

**Interfaces — Produces:**
- `DEFAULT_SUBJECT = 'Invoice {invoice_number} from {firm_name}'`
- `DEFAULT_BODY` — exactly the design §8 body.
- `PLACEHOLDERS: readonly { key: string; label: string }[]` — the nine keys of §8.
- `type TemplateValues = Record<'firm_name'|'client_name'|'client_contact'|'invoice_number'|'invoice_total'|'amount_due'|'issue_date'|'due_date'|'subject', string>`
- `renderTemplate(template: string, values: TemplateValues): string` — single pass `/\{([a-z_]+)\}/g`; unknown keys left as typed.
- `unknownPlaceholders(template: string): string[]`
- `templateValues(input: { firmName; clientName; contactName: string|null; number; total; amountPaid; balanceDue; currency; issueDate; dueDate; subject: string|null }): TemplateValues` — money via `formatMoneyCode`, dates via `formatPdfDate`, contact falls back to client name.

- [ ] Step 1: tests — default subject renders `Invoice INV-2026-0012 from Demo Consulting`; body contains `for USD 1,200.00` (match whatever `formatMoneyCode` produces for the PDF) and the due date as on the PDF; value `{firm_name}` inside client name not re-substituted; `{unknown}` kept and reported; missing contact → client name.
- [ ] Steps 2–5: FAIL, implement, PASS, commit.

### Task 4: Database — table, firm columns, start/finish functions, limits

**Files:**
- Create: `supabase/migrations/20261118000049_invoice_emails.sql`, `tests/integration/invoice-emails.test.ts`
- Modify: `src/lib/db-errors.ts`, `src/lib/supabase/types.ts` (via `npm run db:types`)

**Schema:** as design §13, plus checks: `cardinality(to_addresses) between 1 and 5`, `cardinality(cc_addresses) between 0 and 5`, `length(subject) between 1 and 200`, `length(body) between 1 and 5000`, `(status = 'sent') = (sent_at is not null)`. `firms.invoice_email_subject` (≤ 200, single line check) and `firms.invoice_email_body` (≤ 5000) nullable. RLS select admin/manager; no write grants; `audit_row()` trigger.

**Functions** (`security definer`, `set search_path = ''`, execute granted to `authenticated` only):
- `invoice_email_start(p_invoice uuid, p_to text[], p_cc text[], p_reply_to text, p_subject text, p_body text) returns uuid` — order: invoice lookup (`INVOICE_NOT_FOUND`), role (`42501`), lock invoice `for no key update`, status (`INVOICE_NOT_SENDABLE`), pdf (`INVOICE_NO_PDF`), each address matches pattern and ≤ 254 (`EMAIL_ADDRESS_INVALID`), subject has no CR/LF, limits (`EMAIL_RATE_LIMITED`), insert with `pdf_path` copied from invoice.
- `invoice_email_finish(p_id uuid, p_ok boolean, p_provider_id text, p_error text) returns void` — row lookup (`EMAIL_NOT_FOUND`), role, only `sending` rows change (`EMAIL_STATE`), error trimmed to 500 chars.
- `invoice_last_emails(p_firm uuid) returns table(invoice_id uuid, sent_at timestamptz, to_addresses text[])` — `security invoker`, `stable`; latest `sent` row per invoice (`distinct on`).

**db-errors:** `INVOICE_NOT_SENDABLE` → "Only issued, partly paid or paid invoices can be emailed."; `INVOICE_NO_PDF` → "This invoice has no PDF yet. Use Regenerate PDF first."; `EMAIL_ADDRESS_INVALID` → "One of the email addresses isn't valid."; `EMAIL_RATE_LIMITED` → "Too many invoice emails. Try again in a few minutes."; `EMAIL_STATE` → "This email was already recorded."; `EMAIL_NOT_FOUND` → "Email not found."; `invoice_emails_` checks → "Check the recipients, subject and message."

- [ ] Step 1: integration tests (use `newFirm`, `issueManualInvoice`, set `pdf_path` with `adminDb()` to `firms/<firm>/invoices/<id>/x.pdf`): manager and admin start+finish → `sent`, `sent_at` set; consultant start → 42501 and select returns 0 rows; other firm's admin → 42501; draft → NOT_SENDABLE; void → NOT_SENDABLE; no pdf → NO_PDF; bad address / 6 To / CR in subject → refused; second start within 60 s → RATE_LIMITED; 10/day per invoice (backdate rows by `adminDb` update of `created_at` to > 60 s ago); firm hourly 50 (insert 50 backdated rows via `adminDb`); failed sends count; finish twice → EMAIL_STATE; finish by other firm → 42501; direct insert by manager refused; audit_log has insert + update rows for the email; manager can update `firms.invoice_email_body`, consultant can't; `invoice_last_emails` returns the latest sent only.
- [ ] Step 2: `npm run test:int -- invoice-emails` FAIL. Step 3: write migration, `npx supabase migration up`, `npm run db:types`, db-errors. Step 4: PASS. Step 5: commit.

### Task 5: Send orchestration, data readers and actions

**Files:**
- Create: `src/modules/invoice-emails/data.ts`, `schemas.ts`, `send.ts`, `send.test.ts`, `history.ts`, `history.test.ts`, `actions.ts`
- Modify: `src/modules/firms/data.ts` (`Firm` gains `invoiceEmailSubject: string | null`, `invoiceEmailBody: string | null`)

**Interfaces — Produces:**
- `data.ts`: `startInvoiceEmail(db, input: { invoiceId; to; cc; replyTo; subject; body }): Promise<Result<string>>`, `finishInvoiceEmail(db, id, r: { ok: boolean; providerId: string | null; error: string | null }): Promise<Result<void>>`, `listInvoiceEmails(db, firmId, invoiceId): Promise<Result<InvoiceEmailRow[]>>` (`{ id; createdAt; sentAt; status; to; cc; subject; body; senderEmail: string | null; error: string | null }`, newest first, sender via `profiles(email)`), `lastEmails(db, firmId): Promise<Result<Map<string, { sentAt: string; to: string[] }>>>`, `saveEmailTemplate(db, firmId, { subject: string | null; body: string | null }): Promise<Result<void>>` (0 rows → "You don't have permission to do that.").
- `history.ts`: `historyStatus(row: { status; createdAt }, now: Date): 'Sent' | 'Failed' | 'Sending' | 'Unknown'` (sending > 10 min → Unknown).
- `send.ts`: `sendInvoiceEmail(deps: { db; env; send?: SendEmail; readPdf?: (path) => Promise<Result<Uint8Array>> }, input: { firmId; invoiceId; senderEmail; to: string; cc: string; copyMe: boolean; subject; body }): Promise<FormResult<{ to: string[] }>>` — config check (not-configured message, nothing written) → load invoice (`getInvoice`) + firm (`name, contact_email`) → `validateRecipients(parseAddressList(...))` (+ sender when `copyMe`) → `singleLine(subject)` → start → read stored PDF → send with `idempotencyKey = id`, From/Reply-To per Global Constraints, attachment → finish ok/failed. Send failure message: "The email couldn't be sent. Nothing was delivered; you can try again in a minute." PDF read failure → finish failed, same message.
- `schemas.ts`: `emailTemplateSchema` (subject ≤ 200, body ≤ 5000; blank → null) and `sendFormSchema` (subject 1–200, body 1–5000).
- `actions.ts`: `sendInvoiceEmailAction(firmId, invoiceId, formData)` (fields `to`, `cc`, `copyMe`, `subject`, `body`; revalidates the invoice and list), `saveEmailTemplateAction(firmId, formData)`, `resetEmailTemplateAction(firmId)`.
- Prefill helper in `send.ts`: `composeDefaults({ invoice, firm, clientBillingEmail, clientContactName }): { to: string; subject: string; body: string; replyTo: string | null; from: string | null }`.

- [ ] Step 1: unit tests with fakes: happy path order start → readPdf → send → finish(ok) and message fields (From display name, Reply-To fallback to sender, CC includes sender with copyMe, attachment filename, idempotency key); not configured → no rpc; invalid recipients → no rpc; start refused → no send; send throws → finish(failed) and failure message; `historyStatus` cases incl. 10-minute boundary.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS (+ `npm run typecheck`). Step 5: commit.

### Task 6: UI — invoice page, invoices list, Settings

**Files:**
- Create: `src/app/f/[firmId]/invoices/[id]/email-invoice.tsx` (client: button + inline panel form), `src/app/f/[firmId]/invoices/[id]/email-history.tsx` (server table), `src/app/f/[firmId]/settings/email-template-form.tsx`
- Modify: invoice `page.tsx` (load defaults, history, readiness; "Emailed <date> to <addresses>" line under status for the latest sent), invoices `page.tsx` (Status cell shows "Issued · Emailed" when emailed, via `lastEmails`), settings `page.tsx` (new "Invoice email" section)

UI copy: button "Email invoice"; panel fields labelled "To", "CC", "Send me a copy", "Subject", "Message"; read-only lines "From: …", "Replies go to: …", "Attached: <number>.pdf"; buttons "Send", "Cancel"; success `role="status"` "Invoice <number> sent to <addresses>."; history heading "Emails", columns When, From (sender), To, Subject, Status; disabled button with the not-configured message; no-PDF message. Settings: heading "Invoice email", fields "Email subject", "Email message", placeholder list, "Unknown placeholder {x}" warnings, buttons "Save email" and "Reset to default"; empty fields show the defaults as values (saving text equal to the default stores null).

- [ ] Step 1: implement components. Step 2: `npm run lint && npm run typecheck`. Step 3: manual check in the dev server with Mailpit. Step 4: commit.

### Task 7: End-to-end, docs, full verification

**Files:**
- Create: `tests/e2e/invoice-email.spec.ts`
- Modify: `playwright.config.ts` (`EMAIL_TRANSPORT ??= 'mailpit'`, `INVOICE_EMAIL_FROM ??= 'invoices@firmsync.test'`), `.env.example`, `README.md` (Invoicing: emailing; env vars), `docs/ARCHITECTURE.md` (Resend outbound, `invoice_emails`, env vars, migration count)

- [ ] Step 1: e2e — manager issues invoice for client "Demo Client" with billing email `ap-<uuid>@demo-client.test`, opens Email invoice, sees To prefilled, sends, sees success and history row "Sent"; Mailpit API `GET /api/v1/search?query=to:<addr>` finds one message whose `From.Name` is "<firm> via FirmSync", `ReplyTo[0].Address` is the firm contact email, `Attachments[0].FileName` ends `.pdf`, and `/api/v1/message/<ID>` attachment ContentType `application/pdf`; immediate resend → rate-limit message; invoices list shows "Emailed"; draft has no Email invoice button; consultant 404 on invoice URL; Settings template edit appears in the panel, Reset restores default.
- [ ] Step 2: run all: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e` — read output.
- [ ] Step 3: commit; then one fresh whole-branch review (reviewer agent) and fix findings.

Not covered by e2e: the not-configured state (server env is fixed per run) — covered by Task 2 and Task 5 unit tests.
