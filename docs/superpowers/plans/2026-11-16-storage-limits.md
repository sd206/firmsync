# Storage Limits and File Clean-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every firm a storage allowance (5 GB included), show usage and warnings, refuse user uploads at 100%, let admins find and delete files on a Settings › Storage page, and let the platform owner grant extra storage.

**Architecture:** Usage is computed in Postgres from `storage.objects` sizes under `firms/<firmId>/`; the allowance is `storage_included_bytes + 10 GiB × storage_blocks + 1 GiB × storage_grant_gb` on `firms`. Security-definer functions expose status, a per-type breakdown and a paged file list; the existing attachment upload path gains a soft room check; a small alert helper emails admins once when a firm crosses 95%. Part 2 (billing) will later set `storage_blocks`.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres, Storage), Vitest (unit + integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-saas-billing-storage-design.md` — §6 (Part 1), the storage-grant bullet of §9, and §11.8 (quota race).

## Global Constraints

- 1 GB = 1 GiB = 1,073,741,824 bytes. Included allowance default **5 GiB = 5368709120**; a block = **10 GiB = 10737418240**; a grant unit = **1 GiB**.
- Thresholds: notice **≥ 80%**, warning **≥ 95%**, full **≥ 100%** (used ≥ allowance). Email alert re-arms only when usage drops **below 90%**.
- Everything under `firms/<firmId>/` in bucket `firm-files` counts (attachments incl. `incoming-*` holding objects, `invoices/`, `logo/`).
- Refused at 100%: attachment uploads (payment, expense, vendor bill, vendor payment) and logo changes. Never refused: invoice PDFs (issue/regenerate), Bill-inbox mail, moving an inbox file onto a bill.
- Full-storage message, exact: `Your firm has used all of its storage. Delete old files or add storage in Settings › Billing.` (Settings › Billing doesn't exist yet; keep the copy — Part 2 adds the page.)
- Storage page: admins and managers view; **only admins delete**. Invoice PDFs and the logo are listed but not deletable; Bill-inbox files are not deletable there (row links to the inbox item).
- Consultants see no storage UI and get 404 on the Storage page.
- Emails: sent with Resend's sending API only when env `NOTIFY_FROM` (e.g. `FirmSync <alerts@yourdomain>`) and `RESEND_API_KEY` are set; otherwise skipped silently (banner only). Ruling, because Resend only sends from a verified domain and FirmSync has none yet.
- New `firms` columns are **not** granted for update to `authenticated` (only service role / platform-owner function changes them).
- Money/number formatting follows existing helpers; display sizes as `4.1 GB`, `512 MB`, `820 KB`, `0 B` (one decimal for GB, none for MB/KB).

## Review Focus

1. A firm exactly at its allowance (used = allowance) is "full" and a 1-byte upload is refused — boundary in `storageLevel` and `ensureRoomFor` (tests in Tasks 2 and 3).
2. A batch where some declared files fit and the batch total doesn't is refused as a whole, not partly accepted (Task 3 test).
3. A manager (not admin) posting the Storage page's delete action directly is refused, and an admin can't delete an invoice PDF, logo or inbox file by forging its id (Task 5 tests).
4. A firm's file list never shows another firm's files, and `incoming-*` objects count in usage but don't appear in the list (Task 1 tests).
5. The 95% email is sent once per crossing, not on every upload while above 95% (Task 4 test).

---

### Task 1: Schema and storage functions

**Files:**
- Create: `supabase/migrations/20261116000048_storage_limits.sql`
- Modify: `src/lib/supabase/types.ts` (regenerated)
- Test: `tests/integration/storage-limits.test.ts`

**Interfaces:**
- Produces (SQL, all `security definer`, `set search_path=''`, firm functions require `has_role(p_firm,'{admin,manager}')` else 42501):
  - `firms` columns: `storage_included_bytes bigint not null default 5368709120 check (>= 0)`, `storage_blocks integer not null default 0 check (>= 0)`, `storage_grant_gb integer not null default 0 check (>= 0)`, `storage_alert_sent boolean not null default false`.
  - `firm_storage_allowance(p_firm uuid) returns bigint` (internal, not granted to authenticated).
  - `firm_storage_status(p_firm uuid) returns table(used_bytes bigint, allowance_bytes bigint)`.
  - `firm_storage_breakdown(p_firm uuid) returns table(kind text, files integer, bytes bigint)` — kinds: `payment, expense, vendor_bill, vendor_payment, bill_inbox, invoice_pdf, logo, other`; one row per kind present.
  - `firm_storage_files(p_firm uuid, p_kind text, p_sort text, p_limit integer, p_offset integer) returns table(path text, kind text, attachment_id uuid, owner_id uuid, file_name text, size_bytes bigint, created_at timestamptz, label text, total_count bigint)` — `p_kind` null = all; `p_sort` `'largest'` (size desc, path) or `'oldest'` (created_at asc, path); excludes object names starting `incoming-`; `owner_id` is the record id (payment, expense, bill, vendor payment, inbox item, invoice); `file_name` is the attachment's name, `Invoice <number>.pdf` for PDFs, `Logo` for the logo.
  - `platform_set_storage_grant(p_firm uuid, p_gb integer) returns void` — platform owner only (42501), `p_gb` 0..10000.
  - `platform_firms(...)` recreated with two extra columns `used_bytes bigint, allowance_bytes bigint` (same params, same ordering).
  - `storage_alert_check(p_firm uuid) returns boolean` — service role only (revoke from authenticated). Returns true exactly when usage ≥ 95% and `storage_alert_sent` was false (then sets it); sets it false when usage < 90%.
- `label` formats: payment `Payment · <invoice number> · <paid_on>`; expense `Expense · <payee> · <spent_on>`; vendor bill `Bill · <vendor name> <bill_number>`; vendor payment `Vendor payment · <vendor name> · <paid_on>`; inbox `Bill inbox · <subject or "(no subject)">`; invoice PDF `Invoice <number>`; logo `Firm logo`.

- [ ] **Step 1: Write the failing integration tests** in `tests/integration/storage-limits.test.ts`, uploading real small objects with `adminDb().storage.from('firm-files').upload(...)` and attachments through existing fixtures/`finalizeUploads` where an attachment row is needed:
  - `status counts every object under the firm folder, including incoming and PDFs` — after uploading 100 B attachment + 50 B `incoming-<uuid>` + 30 B `firms/<id>/invoices/<inv>/x.pdf`, `used_bytes = 180`, `allowance_bytes = 5368709120`.
  - `allowance adds blocks and grants` — set `storage_blocks=2, storage_grant_gb=3` via adminDb → `allowance_bytes = 5368709120 + 2*10737418240 + 3*1073741824`.
  - `breakdown groups by kind` — expects rows `{kind:'expense', files:1, bytes:100}`, `{kind:'invoice_pdf', files:1, bytes:30}`, `{kind:'other'...}` absent unless present.
  - `files list sorts, filters, pages and hides incoming` — largest first order, `p_kind:'expense'` only expenses, `p_limit:1,p_offset:1` second row, `total_count` = all visible; no row's path contains `/incoming-`.
  - `non-members and consultants are refused` — another firm's manager calling the three firm functions with this firm's id gets 42501; this firm's consultant gets 42501 on all three.
  - `firm users cannot change storage columns` — `f.admin.db.from('firms').update({storage_grant_gb: 99})` errors or changes nothing.
  - `platform owner grants storage` — a non-owner gets 42501; owner sets 4 → status allowance includes 4 GiB; `platform_firms` row has `used_bytes`, `allowance_bytes`.
  - `alert check fires once per crossing` — set `storage_included_bytes=1000`, used 960 → true, then false, then delete down to 800 (<90%) → false and flag reset, back to 960 → true.
  (Use the existing platform-owner helper from `platform-firms.test.ts`.)

- [ ] **Step 2: Run to verify they fail**
  Run: `npx vitest run --project integration tests/integration/storage-limits.test.ts`
  Expected: FAIL (functions/columns don't exist).

- [ ] **Step 3: Write the migration.** Usage = `sum((o.metadata->>'size')::bigint)` from `storage.objects o where o.bucket_id='firm-files' and o.name like 'firms/' || p_firm || '/%'`, coalesced to 0. Kind from the path's folder (`attachments/payments|expenses|vendor-bills|vendor-payments|bill-inbox`, `invoices`, `logo`, else `other`). Join `attachments` on `storage_path = o.name` and `invoices` on `pdf_path = o.name` for names and labels. Revoke all new functions from public/anon; grant firm ones and `platform_set_storage_grant` to authenticated.

- [ ] **Step 4: Apply and regenerate types**
  Run: `npx supabase migration up && npm run db:types`
  Expected: migration applied, `types.ts` contains `firm_storage_files`.

- [ ] **Step 5: Run tests to verify they pass**
  Run: `npx vitest run --project integration tests/integration/storage-limits.test.ts`
  Expected: PASS

- [ ] **Step 6: Commit** — `feat: storage usage, allowance and file list functions`

---

### Task 2: Size and level helpers

**Files:**
- Create: `src/lib/domain/storage.ts`, `src/lib/domain/storage.test.ts`

**Interfaces:**
- Produces: `type StorageLevel = 'ok' | 'notice' | 'warning' | 'full'`; `storageLevel(used: number, allowance: number): StorageLevel`; `formatBytes(n: number): string`; `usagePercent(used: number, allowance: number): number` (integer, floor, 100 when allowance is 0 and used > 0).

- [ ] **Step 1: Write failing unit tests**
```ts
expect(storageLevel(0, 1000)).toBe('ok')
expect(storageLevel(799, 1000)).toBe('ok')
expect(storageLevel(800, 1000)).toBe('notice')
expect(storageLevel(950, 1000)).toBe('warning')
expect(storageLevel(1000, 1000)).toBe('full')
expect(storageLevel(1, 0)).toBe('full')
expect(formatBytes(0)).toBe('0 B')
expect(formatBytes(839_680)).toBe('820 KB')
expect(formatBytes(536_870_912)).toBe('512 MB')
expect(formatBytes(4_402_341_478)).toBe('4.1 GB')
expect(formatBytes(5_368_709_120)).toBe('5 GB')
expect(usagePercent(4_402_341_478, 5_368_709_120)).toBe(82)
```
- [ ] **Step 2: Run** `npx vitest run --project unit src/lib/domain/storage.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `src/lib/domain/storage.ts` (GB drops a trailing `.0`).
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: storage level and size formatting helpers`

---

### Task 3: Storage module and the upload gate

**Files:**
- Create: `src/modules/storage/data.ts`
- Modify: `src/modules/attachments/storage.ts` (`createUploadTargets`), `src/modules/firms/data.ts` (`uploadFirmLogo`)
- Test: `tests/integration/storage-gate.test.ts`

**Interfaces:**
- Consumes: Task 1 functions; Task 2 helpers.
- Produces (`server-only`):
  - `STORAGE_FULL` (the exact Global Constraints message).
  - `getStorageStatus(db, firmId): Promise<Result<{ used: number; allowance: number; level: StorageLevel }>>`
  - `getStorageBreakdown(db, firmId): Promise<Result<{ kind: StorageKind; files: number; bytes: number }[]>>`
  - `listStorageFiles(db, firmId, opts: { kind: StorageKind | null; sort: 'largest' | 'oldest'; page: number }): Promise<Result<{ rows: StorageFile[]; total: number }>>` (page size 50)
  - `type StorageKind = 'payment' | 'expense' | 'vendor_bill' | 'vendor_payment' | 'bill_inbox' | 'invoice_pdf' | 'logo' | 'other'`; `type StorageFile = { path; kind; attachmentId: string | null; ownerId: string | null; fileName; sizeBytes: number; createdAt; label }`
  - `ensureRoomFor(db, firmId, bytes: number): Promise<Result<void>>` — fails `STORAGE_FULL` when `used + bytes > allowance` or already full; a status lookup error fails open (logs, returns ok) so a database hiccup never blocks work.

- [ ] **Step 1: Write failing integration tests**
  - `upload targets are refused when the batch would exceed the allowance` — firm with `storage_included_bytes=1000` and 900 B used; `createUploadTargets(manager, ..., [{name:'a.pdf',size:50},{name:'b.pdf',size:60}])` → `{ ok:false, error: STORAGE_FULL }`; a single 100 B file → ok (900+100 = 1000 not > 1000).
  - `a full firm refuses even a 1-byte upload` — used = allowance → `[{size:1}]` refused.
  - `logo upload is refused when full` — `uploadFirmLogo` returns `STORAGE_FULL`.
  - `invoice PDF still stores when full` — issue an invoice in a full firm (existing fixture) → `pdf_path` set.
- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/storage-gate.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/modules/storage/data.ts`; in `createUploadTargets` call `ensureRoomFor` with the sum of sizes of files that passed the per-file checks, after `ensureOwnerTakesFiles` and before signing any target; in `uploadFirmLogo` call it with the logo's byte length before uploading. Inbox receive and PDF storage are untouched.
- [ ] **Step 4: Run** the new test file and `npx vitest run --project integration tests/integration/payments.test.ts tests/integration/expenses.test.ts tests/integration/vendor-attachments.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: refuse uploads when a firm's storage is full`

---

### Task 4: 95% alert email

**Files:**
- Create: `src/modules/storage/alerts.ts`, `src/modules/storage/alerts.test.ts`
- Modify: `src/modules/attachments/storage.ts` (`finalizeUploads`), `src/modules/firms/data.ts` (`uploadFirmLogo`), `src/modules/bill-inbox/receive.ts`, `src/modules/invoices/pdf/storage.ts`

**Interfaces:**
- Consumes: `storage_alert_check` (Task 1), `getStorageStatus`, `formatBytes`.
- Produces: `afterStore(firmId: string, deps?: { db?: SupabaseClient; send?: SendEmail; env?: Record<string,string|undefined> }): Promise<void>` — never throws; calls `storage_alert_check` with the service-role client; when true and `NOTIFY_FROM`+`RESEND_API_KEY` are set, emails every admin of the firm. `type SendEmail = (msg: { from: string; to: string[]; subject: string; text: string }) => Promise<void>` (default posts to `https://api.resend.com/emails`).
- Email: subject `<Firm name> is using 95% of its FirmSync storage`; body states `<used> of <allowance>`, that uploads stop at 100%, and the link `<NEXT_PUBLIC_SITE_URL>/f/<firmId>/settings/storage`.

- [ ] **Step 1: Write failing unit tests** (fake db rpc + fake send): `sends to all admins when the check returns true`; `sends nothing when the check returns false`; `skips sending when NOTIFY_FROM is unset`; `swallows send and rpc errors` (resolves, logs).
- [ ] **Step 2: Run** `npx vitest run --project unit src/modules/storage/alerts.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `afterStore`, and call it (not awaited in a way that can fail the caller — `await afterStore(...)` inside its own try is fine) after: `finalizeUploads` when `added > 0`, a successful logo upload, each stored inbox item, and a stored invoice PDF.
- [ ] **Step 4: Run** the unit test plus `npx vitest run --project integration tests/integration/storage-limits.test.ts tests/integration/bill-inbox-receive.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: email admins when storage passes 95%`

---

### Task 5: Settings › Storage page and admin delete

**Files:**
- Create: `src/app/f/[firmId]/settings/storage/page.tsx`, `src/app/f/[firmId]/settings/storage/file-table.tsx` (client: checkboxes + confirm), `src/modules/storage/actions.ts`
- Modify: `src/app/f/[firmId]/layout.tsx` (Setup menu: `{ label: 'Storage', path: '/settings/storage', roles: MANAGERS }` after Settings)
- Test: `tests/integration/storage-delete.test.ts`, `tests/e2e/storage.spec.ts`

**Interfaces:**
- Consumes: Task 3 readers, `deleteAttachment` and `Owner` from `modules/attachments/storage`.
- Produces: `deleteStorageFilesAction(firmId: string, attachmentIds: string[]): Promise<Result<{ deleted: number; failed: { name: string; error: string }[] }>>` — `requireFirmRole(firmId, ['admin'])`; at most 100 ids; each id is looked up in `attachments` for this firm; ids whose row has `bill_inbox_item_id`, or that aren't attachments (PDF/logo have no attachment id), are reported failed with `This file can't be deleted here.`; others go through `deleteAttachment` with the owner derived from the row; revalidates the page.

Page (search params `kind`, `sort` = `largest|oldest` default `largest`, `page`):
- Heading `Storage`; bar and text `<used> of <allowance> used (<n>%)`; level message for notice/warning/full.
- Breakdown table: Type · Files · Size (labels: Payment files, Expense receipts, Vendor bill files, Vendor payment files, Bill inbox, Invoice PDFs, Logo, Other).
- File table: [checkbox for admins on deletable rows] · Name (download link via existing `/f/<firmId>/attachments/<id>` route for attachments) · Type · Size · Date · Record (link to the record page; inbox rows link to the inbox item).
- Admins: button `Delete selected`; confirm dialog text `Delete <n> files (<size>)? This can't be undone.`; result line `Deleted <n> files.` (`Deleted 1 file.` for one) plus any failures listed.
- Managers see no checkboxes or button.

- [ ] **Step 1: Write failing integration tests** for the action's data path (call the module function the action wraps, or test via `deleteAttachment` + a small exported `deletableIds` helper in `modules/storage/data.ts`): `manager is refused` (the action's role check — cover in e2e), `inbox file is refused with "This file can't be deleted here."`, `an attachment id from another firm is refused`, `admin deletes two expense files and usage drops by their size`.
- [ ] **Step 2: Write failing e2e tests** in `tests/e2e/storage.spec.ts`: `admin sees usage, sorts largest first and deletes a file` (row disappears, `Deleted 1 file.`); `manager sees the page without delete controls`; `consultant gets 404`; `a nearly full firm shows the warning banner on the dashboard` (set `storage_included_bytes` via adminDb so usage ≥ 95%); `uploading an expense receipt in a full firm shows the full-storage message`.
- [ ] **Step 3: Run** `npx vitest run --project integration tests/integration/storage-delete.test.ts` and `npx playwright test tests/e2e/storage.spec.ts` — Expected: FAIL.
- [ ] **Step 4: Implement** the page, client table and action.
- [ ] **Step 5: Run** both commands — Expected: PASS.
- [ ] **Step 6: Commit** — `feat: storage page with admin file clean-up`

---

### Task 6: Warnings in the app shell

**Files:**
- Create: `src/app/f/[firmId]/storage-banner.tsx`
- Modify: `src/app/f/[firmId]/layout.tsx`, `src/app/f/[firmId]/page.tsx`

**Interfaces:**
- Consumes: `getStorageStatus`, `storageLevel`, `formatBytes`, `usagePercent`.

Behaviour (admins and managers only; consultants: nothing; a status error shows nothing):
- Layout banner on every firm page at `warning`: `Your firm has used <used> of <allowance> of storage. Uploads stop at 100%.` and at `full`: `Storage is full (<used> of <allowance>). Uploads are paused.` Both with a `Free up space` link to `/settings/storage`.
- Dashboard notice at `notice` (and above, under the banner): `You've used <used> of <allowance> of storage (<n>%).` with `Manage storage` link.

- [ ] **Step 1: Add e2e assertions** to `tests/e2e/storage.spec.ts`: `dashboard shows the 80% notice and no banner`; `pages show the full banner with a Free up space link`; `consultant sees no banner on a full firm`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/storage.spec.ts` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the banner (server component) and dashboard notice; fetch status once in the layout alongside `newInboxCount`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: storage notices and banners`

---

### Task 7: Platform owner storage grant

**Files:**
- Modify: `src/app/platform/firms/page.tsx`, `src/modules/firms/actions.ts`, `src/modules/firms/data.ts`
- Create: `src/app/platform/firms/storage-grant-form.tsx`
- Test: `tests/e2e/storage.spec.ts` (platform test)

**Interfaces:**
- Consumes: `platform_firms` new columns, `platform_set_storage_grant`.
- Produces: `setStorageGrantAction(firmId: string, formData: FormData): Promise<FormResult>` — `requireUser()` + platform owner, zod integer 0..10000 named `extraGb`, error message `Enter a whole number of GB from 0 to 10000.`

- [ ] **Step 1: Write failing e2e test** `platform owner gives a firm extra storage` — owner (seeded `owner@local.test`) opens Platform › Firms, sees `Storage: <used> of 5 GB` for a new firm, sets Extra GB to 3, saves, sees `of 8 GB`; the firm's Storage page shows `of 8 GB`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/storage.spec.ts -g "platform owner"` — Expected: FAIL.
- [ ] **Step 3: Implement** the column on each firm row and the small inline form.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: platform owner can grant extra storage`

---

### Task 8: Documentation and full verification

**Files:**
- Modify: `README.md` (new `## Storage` section: allowance, what counts, warnings, what's refused at 100% and what isn't, Storage page roles, `NOTIFY_FROM` env var), `.env.example` (`NOTIFY_FROM=`), `docs/ARCHITECTURE.md` (storage limits in §6 flows and env list)

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Run the full gates**
  Run: `npm run lint && npm run typecheck && npm run test:unit && npm run test:int && npm run test:e2e`
  Expected: all PASS.
- [ ] **Step 3: Commit** — `docs: storage limits`
