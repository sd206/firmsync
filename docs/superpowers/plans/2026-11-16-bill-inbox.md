# Bill Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor bills emailed to a firm's address land in Billing › Bill inbox with their files, where a manager can Create bill, Ignore or Mark duplicate.

**Architecture:**
- **Receiving:** Resend posts `email.received` to a Next.js route handler. The handler verifies the Svix signature, routes the email to a firm by the address code, downloads the attachments through Resend's Receiving API, and stores them with the service role.
- **Data:** inbox addresses and items live in new tables. Status changes go through security-definer functions. Item files are rows in the existing `attachments` table, as a new owner kind.
- **Create bill:** reuses the existing bill form. After the bill is saved, the inbox file is copied to the bill's folder.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres, RLS, storage), Zod, Vitest (unit and integration projects), Playwright. No new npm dependency: Svix verification is HMAC-SHA256 with `node:crypto`, and Resend is called with `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-16-bill-inbox-design.md`

## Global Constraints

- **Address:** `bills-<code>@<domain>`, where the code is 10 characters of `[a-z0-9]`, random, unique and never reused.
- **Domain:** the address shown uses the first entry of `INBOUND_DOMAINS` (comma-separated). Every listed domain is accepted.
- **Environment:** `RESEND_API_KEY` (server only), `RESEND_INBOUND_SECRET` and `INBOUND_DOMAINS`.
  - If any is missing, the webhook answers 503.
  - If any is missing, Settings shows "Bill inbox isn't set up on this server yet."
- **Webhook signature:** if the signature is missing or invalid, the webhook answers 401 and does nothing else.
- **Unroutable mail:**
  - Applies to an unknown, disabled or replaced address, and to an unknown sender when the firm has chosen Drop.
  - The webhook answers 200, stores nothing, and logs one line with the code and the Resend email id. It never logs the content.
- **Resend retries:** the same Resend email id for the same firm never creates a second item. Different emails are never merged, even if they look identical.
- **Files:** existing attachment rules apply (`validateAttachment`, `MAX_ATTACHMENT_BYTES`), with at most 10 accepted files per email. Rejected files are listed on the item as `{ name, reason }`.
- **Statuses:** `new`, `bill_created`, `ignored`, `duplicate`. Ignored and duplicate items can be restored to `new` at any time.
- **Duplicate hint:** "Possible duplicate" appears when either of these is true. It is never blocking.
  - The same sender sent a file with the same name, case-insensitive, within 60 days before this item.
  - A file name contains the bill number of an existing bill from the matched vendor. The comparison ignores case, spaces, `-` and `_`, and only applies to bill numbers of 3 or more characters.
- **Access:**
  - Admins and managers can see and act on the inbox.
  - Changing the address settings is admin-only.
  - Consultants get 404.
- **Known senders:**
  - Matching is on the bare `from` address, case-insensitive.
  - Exactly one vendor with that email: that vendor is matched.
  - Several vendors with that email: known, no vendor matched.
  - A firm member's email: known, shown as "Forwarded by <display name or email>".
  - Anything else is unknown: held with the label "Unknown sender" (default) or dropped, per the firm's setting.

## Review Focus

1. **One email addressed to two firms' bill addresses (to/cc):** each firm gets its own item, and neither sees the other's. Pinned in Task 3.
2. **A sender written as `"Acme AP" <AP@Acme.com>`:** the address is parsed and compared case-insensitively. Pinned in Task 2.
3. **Create bill fails** (for example, a duplicate bill number): the inbox item stays New, and no file is copied. Pinned in Task 5.
4. **An email with more than 10 attachments:** the first 10 good files are stored, and the rest are listed as not accepted ("Too many files in one email"). Pinned in Task 3.
5. **A file link from another firm's inbox, passed in the new-bill URL:** refused as "File not found." Pinned in Task 4.

---

### Task 1: Schema and functions

**Files:**
- Create: `supabase/migrations/20261116000045_bill_inbox.sql`
- Test: `tests/integration/bill-inbox-schema.test.ts`
- Run `npm run db:types` after `npx supabase migration up`.

**Interfaces (produces):**
- Table `bill_inbox_addresses`:
  - columns: `id`, `firm_id`, `code text unique`, `enabled bool`, `unknown_sender text check in ('hold','drop') default 'hold'`, `created_at`, `replaced_at timestamptz null`
  - at most one row per firm with `replaced_at is null` (partial unique index)
- Table `bill_inbox_items`:
  - columns: `id`, `firm_id`, `address_id`, `resend_email_id text`, `from_address text`, `to_address text`, `subject text`, `received_at timestamptz`, `vendor_id uuid null`, `sender_kind text check in ('vendor','member','known','unknown')`, `forwarded_by text null`, `rejected_files jsonb default '[]'`, `download_failed bool default false`, `status text check in ('new','bill_created','ignored','duplicate') default 'new'`, `note text null`, `handled_by uuid null`, `handled_at timestamptz null`, `created_at`
  - unique `(firm_id, resend_email_id)`
  - composite foreign keys `(firm_id, vendor_id)` and `(firm_id, address_id)`
- Table `bill_inbox_bills`:
  - columns: `firm_id`, `item_id`, `attachment_id uuid unique`, `bill_id`, `created_at`
  - composite foreign keys; `on delete cascade` from the item
- `attachments.bill_inbox_item_id`:
  - a composite foreign key to items, `on delete cascade`
  - `attachments_owner_chk` recreated with 5 owners
  - `storage_path` must start with `firms/<firm>/attachments/bill-inbox/<item>/`
- RLS:
  - select for admin/manager on all three tables
  - no insert, update or delete for `authenticated`
  - inbox rows are written by the service role, or by the functions below
- Admin-only functions (raise 42501 otherwise). Each returns `bill_inbox_addresses`.
  - `bill_inbox_enable(p_firm uuid)`: creates the address with a new code, or re-enables the current one.
  - `bill_inbox_disable(p_firm uuid)`
  - `bill_inbox_replace(p_firm uuid)`: sets `replaced_at` on the current address and creates a new enabled one.
  - `bill_inbox_set_unknown(p_firm uuid, p_mode text)`
  - The code comes from `gen_random_bytes`, mapped to `[a-z0-9]`. Retry if the code already exists.
- Admin/manager functions:
  - `bill_inbox_set_status(p_item uuid, p_status text, p_note text) returns void`
    - `p_status` must be one of `ignored`, `duplicate`, `new` or `bill_created`.
    - `new` is allowed from any status; the others are allowed only from `new`. Otherwise raise `INBOX_STATE`.
    - The note may be up to 500 characters; `INBOX_NOTE` if longer.
    - Sets `handled_by` and `handled_at`. Restoring to `new` clears them and the note.
  - `bill_inbox_link_bill(p_item uuid, p_attachment uuid, p_bill uuid) returns void`
    - Checks that the item, the attachment (owned by the item) and the bill are all in the same firm.
    - Inserts the link. When every attachment of the item has a link, sets the status to `bill_created`.
- Service-role function (execute revoked from `authenticated`):
  - `bill_inbox_add_attachment(p_item, p_storage_path, p_file_name, p_mime, p_size) returns uuid`
  - Checks the path prefix as above.

- [ ] **Step 1: Write the failing integration tests in `bill-inbox-schema.test.ts`.** One `it` per behaviour:
  - admin enable, disable, replace: the code matches `/^[a-z0-9]{10}$/`, and after replace the old row has `replaced_at` and the new code is different
  - a manager calling `bill_inbox_enable` gets 42501
  - a manager can't `insert` into `bill_inbox_items`: an RLS error
  - another firm's manager can't select or set the status of an item: 0 rows, and `bill_inbox_set_status` raises 42501
  - set-status rules: ignored then new (restore) is fine; ignored then duplicate raises `INBOX_STATE`
  - `bill_inbox_link_bill` with two attachments: after one link the status is still `new`; after the second it is `bill_created`
  - `bill_inbox_link_bill` with a bill from another firm raises `BILL_NOT_FOUND`
  - Items are seeded with the service role through a `tests/integration/bill-inbox-fixtures.ts` helper: `seedInboxItem(f, { from, files: number })`. It inserts the item and attachment rows with valid paths, and no storage objects.
- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/bill-inbox-schema.test.ts`. Expected: FAIL (the tables don't exist).
- [ ] **Step 3: Write the migration**, then run `npx supabase migration up && npm run db:types`.
- [ ] **Step 4: Run again.** Expected: PASS. Also run `tests/integration/vendor-attachments.test.ts` (attachments check still passes).
- [ ] **Step 5: Add `db-errors.ts` messages**:
  - `INBOX_STATE`: "This email has already been handled. The page has been refreshed."
  - `INBOX_NOTE`: "Keep the note to 500 characters or fewer."
- [ ] **Step 6: Commit** `feat(bill-inbox): schema and functions`.

### Task 2: Pure helpers (routing, senders, hint, signature)

**Files:**
- Create: `src/modules/bill-inbox/route-mail.ts`
- Create: `src/modules/bill-inbox/svix.ts`
- Test: `src/modules/bill-inbox/route-mail.test.ts`
- Test: `src/modules/bill-inbox/svix.test.ts`

**Interfaces (produces):**
- `inboundDomains(env: string | undefined): string[]`: lowercased, trimmed, empty entries dropped.
- `bareAddress(raw: string): string | null`: turns `"Acme AP" <AP@Acme.com>` into `ap@acme.com`. Returns null when the input isn't an address.
- `codesFor(recipients: string[], domains: string[]): string[]`: unique codes from addresses `bills-<code>@<domain>`, with the code matching `[a-z0-9]{10}`.
- `classifySender(from: string, vendors: {id: string; email: string | null}[], members: {email: string; name: string | null}[])`. It returns one of:
  - `{ kind: 'vendor', vendorId }`
  - `{ kind: 'known' }` (several vendors share the address)
  - `{ kind: 'member', forwardedBy }`
  - `{ kind: 'unknown' }`
- `possibleDuplicate(item: {fromAddress, receivedAt, fileNames: string[], vendorId}, history: {fromAddress, receivedAt, fileNames}[], billNumbers: string[]): boolean`. This implements the Global Constraints rule.
- `verifySvix(secret: string, headers: {id, timestamp, signature}, body: string, now?: number): boolean`. Its rules:
  - The secret is `whsec_<base64>`.
  - The signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the decoded key, base64.
  - The `signature` header holds space-separated `v1,<sig>` entries; any one matching is enough. Compare with `timingSafeEqual`.
  - Reject if the timestamp is more than 5 minutes away from `now`.

- [ ] **Step 1: Write the failing tests.**
  - `codesFor(['Bills-AbC123xyz9@X.resend.app', 'other@x.resend.app', 'bills-abc123xyz9@evil.com'], ['x.resend.app'])` returns `['abc123xyz9']`.
  - `bareAddress('"Acme AP" <AP@Acme.com>') === 'ap@acme.com'`
  - `bareAddress('nope') === null`
  - `classifySender` gives:
    - a vendor match
    - `known` when two vendors share the email
    - a member gives `forwardedBy` (name, or the email if there is no name)
    - `unknown` otherwise
  - `possibleDuplicate`:
    - true for the same sender and same file name 59 days earlier
    - false at 61 days
    - true when the file name is `inv_4471.pdf` and the bill numbers include `INV-4471`
    - false when the bill number is `12` (too short)
  - `verifySvix`:
    - The test builds a valid signature with `createHmac`, and true is expected.
    - False for a tampered body, a wrong secret, or a timestamp 6 minutes old.
    - True when the header lists `v1,bad v1,<good>`.
- [ ] **Step 2: Run** `npx vitest run --project unit src/modules/bill-inbox`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(bill-inbox): routing, sender and signature helpers`.

### Task 3: Webhook (receive and store)

**Files:**
- Create: `src/modules/bill-inbox/resend.ts`. This is a thin `fetch` client, `ResendReceiving`:
  - `getEmail(id): Promise<{from, to: string[], received_for?: string[], subject, created_at}>`
  - `listAttachments(id): Promise<{id, filename, content_type, size?, download_url}[]>`
  - The Resend API base is `https://api.resend.com`, with `Authorization: Bearer RESEND_API_KEY`.
- Create: `src/modules/bill-inbox/receive.ts`
- Create: `src/app/api/inbound/resend/route.ts`
- Test: `tests/integration/bill-inbox-receive.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and `bill_inbox_add_attachment`, and the Task 2 helpers.
- Produces: `receiveInbound(deps: { db: SupabaseClient /* service role */; resend: ResendReceiving; domains: string[]; fetchFile: (url) => Promise<Uint8Array>; log: (line: string) => void }, event: { email_id: string; from: string; to: string[]; received_for?: string[]; subject: string; created_at: string; attachments: {id, filename, content_type}[] }): Promise<{ stored: number }>`.
  - `stored` is the number of items created (0 or more; one per routed firm).
  - Storage uploads use the service-role storage client, at `firms/<firm>/attachments/bill-inbox/<item>/<uuid>.<ext>`.
  - The item row is inserted first, with `on conflict (firm_id, resend_email_id) do nothing`. If it already existed, the step is skipped.
  - A download error sets `download_failed = true` and keeps the item.
- The route reads the raw body with `await req.text()`, then:
  - returns 503 if the env is missing
  - returns 401 if `verifySvix` fails
  - ignores events other than `email.received` (200)
  - calls `receiveInbound` and answers 200
  - answers 500 only on an unexpected error, so that Resend retries
  - uses `export const runtime = 'nodejs'` and `export const maxDuration = 60`

- [ ] **Step 1: Write the failing integration tests.** They call `receiveInbound` with a fake `resend` and a fake `fetchFile` that returns the bytes of `tests/e2e/fixtures/remittance.pdf`, and use real local Supabase and storage. One `it` each:
  - Routes to the firm by code. The item has the sender, subject and `received_at`, with one attachment row whose file exists in storage.
  - Calling it twice with the same `email_id` still gives one item.
  - Two calls with different email ids and the same content give two items.
  - A disabled or replaced address: `stored: 0`, and `log` was called with a line containing the code and the email id.
  - Unknown sender: a firm in `hold` mode gets `sender_kind 'unknown'`; a firm in `drop` mode gets `stored: 0`.
  - A vendor email match gives `vendor_id`; a member gives `forwarded_by`.
  - A fake file whose bytes are `not a pdf` is in `rejected_files`; 12 attachments give 10 stored and 2 rejected with reason "Too many files in one email".
  - `fetchFile` throwing gives an item with `download_failed = true`.
  - One email to two firms' codes gives one item in each firm, and each firm's manager sees only its own item.
- [ ] **Step 2: Add unit tests for the route** in `src/app/api/inbound/resend/route.test.ts`. They import `POST` with `receiveInbound` mocked through `vi.mock`:
  - no env: 503
  - bad signature: 401
  - a non-`email.received` event: 200, and `receiveInbound` not called
  - a valid event: 200
- [ ] **Step 3: Run both test files.** Expected: FAIL.
- [ ] **Step 4: Implement** `resend.ts`, `receive.ts` and `route.ts`.
- [ ] **Step 5: Run again.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(bill-inbox): receive webhook`.

### Task 4: Data module and actions

**Files:**
- Create: `src/modules/bill-inbox/data.ts`
- Create: `src/modules/bill-inbox/actions.ts`
- Modify: `src/modules/attachments/storage.ts`. Add owner kind `bill_inbox_item`, with folder `bill-inbox`, table `bill_inbox_items` and column `bill_inbox_item_id`. No uploads come from users for this kind.
- Modify: `src/modules/vendor-bills/actions.ts`. `saveBillAction` takes an optional `inboxFileId` from the form.
- Test: `tests/integration/bill-inbox-data.test.ts`

**Interfaces (produces):**
- `getInboxSettings(db, firmId): Promise<Result<{ configured: boolean; address: string | null; enabled: boolean; unknownSender: 'hold' | 'drop' }>>`
- Settings actions: `enableInboxAction(firmId)`, `disableInboxAction(firmId)`, `replaceInboxAction(firmId)` and `setUnknownSenderAction(firmId, mode)`.
  - These are admin-only, through `requireFirmRole(firmId, ['admin'])`.
- `listInbox(db, firmId, tab: 'new' | 'bill_created' | 'ignored' | 'duplicate'): Promise<Result<InboxRow[]>>`
  - Rows are newest first, limit 200.
  - `InboxRow = { id; receivedAt; fromAddress; senderKind; vendorId; vendorName; forwardedBy; subject; files: {id, fileName, billId: string | null, billNumber: string | null}[]; rejectedFiles: {name, reason}[]; downloadFailed; possibleDuplicate: boolean; note; status }`
  - `possibleDuplicate` is computed with Task 2's `possibleDuplicate` against items from the last 60 days and the matched vendor's bill numbers.
- `newInboxCount(db, firmId): Promise<number>`
- Item actions:
  - `setInboxStatusAction(firmId, itemId, status, note)`
  - `retryDownloadAction(firmId, itemId)`: re-runs the download part of `receiveInbound` for that item through Resend and clears `download_failed` on success.
- `inboxFileForBill(db, firmId, attachmentId): Promise<Result<{ attachmentId; fileName; itemId; vendorId: string | null }>>`
  - Returns "File not found." unless the attachment is owned by an inbox item in this firm.
- In `saveBillAction`, when `inboxFileId` is present and the save succeeded:
  - Copy the storage object to the bill's `vendor-bills/<bill>/<uuid>.<ext>`, using the service role after the firm check.
  - Register it with `add_vendor_attachment`.
  - Call `bill_inbox_link_bill`.
  - If the copy fails after the bill was saved, return ok with a warning ("The bill was saved, but the inbox file couldn't be attached. Add it on the bill page."). The inbox item stays New.

- [ ] **Step 1: Write the failing integration tests.**
  - Settings round-trip as admin. A manager calling `enableInboxAction`'s data function gets 42501.
  - `listInbox` tabs and `possibleDuplicate` true for a seeded pair.
  - `inboxFileForBill` with another firm's attachment id: "File not found."
  - Saving a bill with `inboxFileId` gives:
    - a vendor-bill attachment that exists in storage
    - the inbox link row
    - item status `bill_created` (single-file item)
  - Saving a bill with a duplicate number and `inboxFileId` returns the duplicate error. Afterwards there is no link row and the item is still `new`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run again** with `npm run typecheck && npm run lint`. Expected: PASS and clean.
- [ ] **Step 5: Commit** `feat(bill-inbox): data module and actions`.

### Task 5: Screens, menu and end-to-end tests

**Files:**
- Create under `src/app/f/[firmId]/bill-inbox/`:
  - `page.tsx`: tabs and rows, as in the spec's sketch
  - `inbox-actions.tsx`:
    - Create bill links to `/vendor-bills/new?inboxFile=<attachmentId>`
    - Ignore and Mark duplicate, each with an optional note in a small form
    - Restore
    - "Mark bills created" for an item with several files
    - Try again (shown when downloads failed)
- Modify: `src/app/f/[firmId]/vendor-bills/new/page.tsx` and `bill-form.tsx`:
  - Read `inboxFile` and load it with `inboxFileForBill`.
  - Preselect the vendor.
  - Show "Attached from Bill inbox: <file name>" with a link to open it.
  - Send `inboxFileId` in the form.
- Modify: `src/app/f/[firmId]/layout.tsx` (Billing). Add "Bill inbox" after "Vendor bills" for managers and admins, with the count from `newInboxCount` when it's above 0 (e.g. "Bill inbox (3)").
- Modify: `src/app/f/[firmId]/settings/page.tsx` and `settings-forms.tsx`. Add a "Bill inbox" section:
  - Admins see: the address with a Copy button, Turn on/Turn off, Replace address (with confirmation: "The old address stops working immediately."), and the Unknown senders choice.
  - Managers see the address and Copy only.
  - When not configured, it shows the not-set-up message.
- Test: `tests/e2e/bill-inbox.spec.ts`

- [ ] **Step 1: Write the failing e2e tests.** Items are seeded with `seedInboxItem`, extended to upload the fixture PDF to storage.
  1. An admin turns the inbox on in Settings and sees `bills-` plus 10 characters `@` the test domain. Tests set `INBOUND_DOMAINS=test.resend.app` in `.env.test.local` for the build.
  2. A manager opens Billing › Bill inbox. The menu shows "Bill inbox (1)". The row shows "Acme Staffing ✓", the subject and the file link.
  3. The manager clicks Create bill. On the form, the vendor is "Acme Staffing" and the notice "Attached from Bill inbox" is shown. They fill in the number, dates and one line, then save. On the bill page, the file link `remittance.pdf` is shown. Back in the inbox, the row is under Bills created, with link text "Bill <number> created".
  4. On a second seeded item, the manager clicks Ignore and enters the note "spam". The item moves to Ignored. They click Restore, and it is back in New. They click Mark duplicate, and it moves to Duplicates.
  5. A consultant gets 404 on `/bill-inbox`.
  6. A manager doesn't see Turn on or Replace in Settings.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/bill-inbox.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the screens.**
- [ ] **Step 4: Run** the spec plus `vendor-bills.spec.ts` and `settings.spec.ts`. Expected: PASS. Then run `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(bill-inbox): screens, settings and menu`.

### Task 6: Setup docs and full verification

- [ ] **Add a "Bill inbox (Resend)" section to `README.md`.** It has the spec's setup steps, the three env vars, and the steps for switching domains.
- [ ] **Run** `npm run lint && npm run typecheck && npm run test:unit && npm run test:int && npm run test:e2e`. Expected: all pass.
- [ ] **Commit** `docs: bill inbox setup`.
