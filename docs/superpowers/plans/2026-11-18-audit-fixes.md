# Pre-launch audit fixes (checklist item 24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six findings from the UI and accounting audit that the owner approved on 2026-11-18.

**Architecture:** One new migration (`20261118000050_bill_expense_receipts.sql`) changes how the expense list counts receipts; the rest is page-level changes plus one shared date formatter in `src/lib/domain/format-date.ts`.

**Tech Stack:** Next.js 15, Supabase Postgres, Vitest, Playwright.

**Spec:** the item-24 brief (no design doc; the brief says the change is small). Decisions: `launch/decisions.md`, 2026-11-18 "UI and accounting audit".

## Global Constraints

- Don't change P&L or Transactions logic; don't change stored values or CSV exports (CSVs keep ISO dates).
- Don't touch `src/app/layout.tsx`, email-subject code, `CLAUDE.md`, `.claude/`, `launch/`, `marketing/`.
- Date format: `Nov 16, 2026`; date-time: `Nov 16, 2026, 3:04 PM UTC` (UTC kept, labelled).
- Functions: `security definer`, `set search_path = ''`, role check raising `42501`, as existing migrations do.

## Review Focus

- An expense created from a bill that **also** has its own receipt: count is both, never "No receipt".
- A bill with no file at all: its expenses still show "No receipt" and still match the filter.
- `expense_totals` and `list_expenses` must keep agreeing under the "No receipt only" filter.
- Date formatting must not shift a day on a server outside UTC (format `YYYY-MM-DD` as UTC midnight).
- A null or blank date (e.g. a bill without a service period) must not render "Invalid Date".

---

### Task 1: Bill-created expenses count the bill's files

**Files:**
- Create: `supabase/migrations/20261118000050_bill_expense_receipts.sql`
- Modify: `src/modules/expenses/data.ts`, `src/app/f/[firmId]/expenses/page.tsx`, `src/lib/supabase/types.ts` (regenerated)
- Test: `tests/integration/expenses.test.ts`, `tests/e2e/vendor-bills.spec.ts` or `expenses.spec.ts`

**Interfaces:**
- Produces: `public.expense_receipt_count(p_firm uuid, p_expense uuid, p_bill_line uuid) returns integer` (internal helper, not granted); `list_expenses` gains column `vendor_bill_id uuid`; `ExpenseRow.vendorBillId: string | null`.

- [ ] **Step 1: Failing integration test** `bill-created expenses count the bill's files`: save a bill with one expense line, attach a file to the bill (`attachments.vendor_bill_id`), approve; `listExpenses` row has `receiptCount === 1`, `vendorBillId === bill`; with `missingReceipt: true` it is absent and `count` excludes it. A second bill without files: its expense shows `receiptCount 0` and is in the filter.
- [ ] **Step 2:** run `npm run test:int -- expenses.test` → FAIL.
- [ ] **Step 3:** migration: `drop function list_expenses(...)` and recreate with `vendor_bill_id` (from `vendor_bill_lines.bill_id`), receipt count = expense files + bill files; `create or replace expense_totals` with the same missing-receipt rule. Re-grant as before. Regenerate types.
- [ ] **Step 4:** map `vendorBillId` in `listExpenses`; on the expenses page show a "From bill" badge linking to `/f/{firmId}/vendor-bills/{id}`.
- [ ] **Step 5:** tests pass; e2e: approve a bill with a file → the expense row shows "From bill" and no "No receipt". Commit.

### Task 2: Record payment in one click; hide Finish setup when done; Avg days to pay help

**Files:** `src/app/f/[firmId]/invoices/unpaid/page.tsx`, `src/app/f/[firmId]/page.tsx`, `src/app/f/[firmId]/reports/receivables/page.tsx`; tests in `tests/e2e/payments.spec.ts` / `foundation.spec.ts` / `ar-ap-reports.spec.ts`.

- [ ] Unpaid row link → `/f/{firmId}/payments/record?invoice={id}` (e2e: clicking it lands on the record form for that invoice).
- [ ] Dashboard: render "Finish setup" only when any step is not done (e2e: fresh firm shows it; firm with all four done does not).
- [ ] Receivables: header `title` and footnote "Avg days to pay: average days from issue to final payment, for invoices fully paid in the last 12 months." (matches `paid` CTE: `max(paid_on) - issue_date`, status `paid`, last payment within 365 days).
- [ ] Commit.

### Task 3: One date format

**Files:**
- Create: `src/lib/domain/format-date.ts`, `src/lib/domain/format-date.test.ts`
- Modify: every page listed by `grep` for raw ISO dates in JSX, `weeks.ts` (`formatDayLabel` → `Mon, Nov 9`), `invoices/pdf/view-model.ts`, `email-history.tsx`, `bill-inbox/page.tsx`, `bank-deposits.tsx`; e2e specs that assert ISO dates in tables.

**Interfaces:**
- Produces: `formatDate(iso: string | null | undefined): string` (`'2026-11-16'` → `'Nov 16, 2026'`, `''` for null/blank, input unchanged if not a date); `formatDateTime(ts: string): string` (→ `'Nov 16, 2026, 3:04 PM UTC'`).

- [ ] Unit tests first: `formatDate('2026-11-16') === 'Nov 16, 2026'`, `formatDate('2026-09-05') === 'Sep 5, 2026'`, null → `''`; `formatDateTime('2026-11-16T15:04:00Z') === 'Nov 16, 2026, 3:04 PM UTC'`; `formatDayLabel('2026-11-09') === 'Mon, Nov 9'`; `formatPdfDate('2026-11-09') === 'Nov 9, 2026'`.
- [ ] Implement with `Intl.DateTimeFormat('en-US', …, timeZone: 'UTC')`; replace call sites; fix e2e assertions. CSV routes untouched.
- [ ] Commit.

### Task 4: Contractor lines and the P&L (item 6)

- [ ] Confirm against `docs/superpowers/specs/2026-11-15-vendor-bills-design.md` (lines 20-22, 60, 104-105): intentional. Add a README note under Reports. Report the gap (contractors not set up as consultants with hours never reach the P&L) to the owner as a decision.

### Task 5: Gates and review

- [ ] `npm run lint`, `typecheck`, `test:unit`, `test:int`, `test:e2e`, output read. One fresh whole-branch review (reviewer agent). Fix blocking/important findings.
