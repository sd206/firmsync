# Vendor Bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enter vendor invoices (with the vendor's invoice number and PDF), have an Admin approve them, and record payments against them, usually by matching money-out bank lines.

**Architecture:** New tables `vendor_bills`, `vendor_bill_lines`, `vendor_payments`, with attachments gaining two owners. All writes that change money go through security-definer SQL functions (role-checked, one transaction each). Approval turns expense lines into rows in `expenses`, so the P&L and expense screens work unchanged; contractor lines don't, since they are already labour. Bank lines gain a `vendor_payment_id` link, and the review screen gains a "Vendor bill payment" option. Pages follow the client invoice and payment pages.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase Postgres (RLS, `search_path ''` definer functions), Tailwind 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-vendor-bills-design.md`

## Global Constraints

- Roles:
  - Admin and Manager: read, enter and edit (only while `pending_approval` or `rejected`), record and match payments.
  - Admin only: approve, reject, void.
  - Consultant: nothing (404 on pages, 42501 from functions).
- Money: `numeric(12,2)`, amounts as text in TypeScript. Statuses: `pending_approval | rejected | approved | partly_paid | paid | void`.
- `bill_number`: 1–60 characters, unique per (firm, vendor) ignoring case and surrounding spaces. Message: "Bill <number> from <vendor> is already entered."
- Line description: 1–200 characters. Line amount: > 0. `notes` ≤ 1000. Payment `reference` ≤ 120.
- Payment method enum: reuse `public.payment_method`. Method from a bank line: `bank_transfer` for bank accounts, `card` for credit-card accounts.
- Expense created on approval:
  - `spent_on` = bill_date, `payee` = vendor name
  - `notes` = `Bill #<number>` (plus the line description when different)
  - `amount` = line amount, `vendor_bill_line_id` = line id
- Migrations: `20261115000040_vendor_bills.sql` (schema), `20261115000041_vendor_bill_functions.sql`, `20261115000042_vendor_payments_bank_reports.sql`.
- Menu (Billing): Invoices, Unpaid invoices, Payments, **Vendor bills**, Expenses, Other income, Bank accounts.

## Review Focus

1. A bank line confirmed as a vendor payment twice at once: one success, one LINE_HANDLED, a single payment. Pinned in Task 3.
2. A payment on an unapproved, rejected or void bill, or above the balance: refused, nothing written. Pinned in Task 2.
3. A bill approved with expense lines appears once in the P&L and once in the Transactions report (as the vendor payment, not also as the expense). Pinned in Task 3.
4. Editing an approved bill must be impossible, including directly through the database. Pinned in Task 1.
5. Deleting a vendor payment linked to a bank line returns the line to New and recalculates the bill. Pinned in Task 2.

---

### Task 1: Schema

**Files:** Create `supabase/migrations/20261115000040_vendor_bills.sql`. Test `tests/integration/vendor-bills-schema.test.ts`.

**Interfaces (produces):**
- `vendor_bills(id, firm_id, vendor_id, bill_number, bill_date, due_date, period_start, period_end, notes, total numeric(12,2) default 0, amount_paid numeric(12,2) default 0, status vendor_bill_status, rejected_reason, approved_by, approved_at, created_*, updated_at)`
  - Unique index on `(firm_id, vendor_id, lower(btrim(bill_number)))`.
  - Checks:
    - `due_date >= bill_date`
    - the period is either both null or `start <= end`
    - `amount_paid <= total`
    - `status = 'rejected'` exactly when `rejected_reason` is set
- `vendor_bill_lines(id, firm_id, bill_id, position int, kind ('expense'|'contractor'), description, amount, category_id, client_id, project_id, consultant_id)`
  - `kind = 'expense'` requires a category and no consultant; `kind = 'contractor'` requires no category, client or project.
  - All foreign keys are composite `(firm_id, …)`.
- `vendor_payments(id, firm_id, bill_id, amount > 0, paid_on, method payment_method, reference, notes, created_*)`
- `expenses.vendor_bill_line_id`: unique, `on delete restrict`.
- `attachments`:
  - New columns `vendor_bill_id` and `vendor_payment_id`, with composite foreign keys and cascade deletes.
  - The owner check becomes `num_nonnulls(payment_id, expense_id, vendor_bill_id, vendor_payment_id) = 1`.
  - Extend the path check so the new owners follow the same `firms/{firm}/attachments/{vendor-bills|vendor-payments}/{owner}/…` rule.
  - Extend the storage insert policy's attachments branch to allow `vendor-bills` and `vendor-payments` as the 4th folder.
- `bank_lines.vendor_payment_id`:
  - Composite foreign key with `on delete set null (vendor_payment_id)`, and a partial unique index.
  - The one-link and done checks are rewritten to include the 4th link.
  - Recreate `bank_lines_reset_unlinked` to count 4 links.
- RLS:
  - Select for admin and manager on all three tables.
  - Insert and update on `vendor_bills` and `vendor_bill_lines` for admin and manager only while the bill is `pending_approval` or `rejected` (lines check the parent bill's status with an `exists`).
  - No direct writes to `vendor_payments`; its writes go through functions.
  - A trigger refuses any update or delete of a bill or line once the status is `approved`, `partly_paid`, `paid` or `void`, except updates made by the Task 2 functions, which set `app.vendor_bill_internal = 'on'` for the transaction.
- An audit trigger on all three tables.

- [ ] **Step 1: Failing tests:**
  - a manager inserts a bill and two lines; a consultant and another firm see nothing
  - a duplicate bill number (different case, extra spaces) gives 23505
  - an expense line without a category, and a contractor line with a category, are refused
  - a direct `update vendor_bills set status='approved'` from a manager changes 0 rows or is refused
  - after the service role sets the bill to approved, a manager's line update and the bill's delete are refused
  - a bank line with two links is refused
- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/vendor-bills-schema.test.ts`. Expect FAIL.
- [ ] **Step 3: Write the migration**, then run `npx supabase migration up` and `npm run db:types`.
- [ ] **Step 4: Run** the same tests and expect PASS. Then run `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(vendor-bills): schema`

### Task 2: Bill workflow and payment functions

**Files:** Create `supabase/migrations/20261115000041_vendor_bill_functions.sql`. Test `tests/integration/vendor-bill-functions.test.ts`. Modify `src/lib/db-errors.ts`.

**Interfaces (produces).** All are security definer:
- `save_vendor_bill(p_bill uuid /* null = new */, p_firm uuid, p_vendor uuid, p_number text, p_bill_date date, p_due_date date, p_period_start date, p_period_end date, p_notes text, p_lines jsonb) returns uuid`
  - Admin or manager only. Allowed while the bill is `pending_approval` or `rejected`, or the bill is new. Saving a rejected bill sets it back to `pending_approval` and clears the reason.
  - Replaces all lines from `p_lines`: an array of `{kind, description, amount, category_id, client_id, project_id, consultant_id}`. Recomputes `total`.
  - Raises `BILL_LOCKED` when the bill isn't editable, and `BILL_EMPTY` when there are no lines.
- `approve_vendor_bill(p_bill) returns void`
  - Admin only. Requires `pending_approval`.
  - Sets `approved` and the approver details, then creates one expense per expense line. A retired category raises `CATEGORY_RETIRED`.
- `reject_vendor_bill(p_bill, p_reason text) returns void`: admin only; requires `pending_approval`; reason 1–500 characters.
- `void_vendor_bill(p_bill) returns void`: admin only; refused when there are payments (`BILL_HAS_PAYMENTS`); deletes the expenses that approval created.
- `record_vendor_payment(p_bill, p_amount, p_paid_on, p_method, p_reference, p_notes) returns uuid`
  - Admin or manager. Locks the bill; status must be `approved` or `partly_paid` (`BILL_NOT_PAYABLE`); `amount_paid + amount <= total` (`VENDOR_PAYMENT_TOO_LARGE`); the date can't be in the future.
  - Then recomputes `amount_paid` and the status (`partly_paid` or `paid`).
- `delete_vendor_payment(p_payment) returns setof text`: returns the storage paths of its attachments to remove; recomputes the bill.
- `add_vendor_attachment(p_owner_kind text /* 'bill'|'payment' */, p_owner uuid, p_storage_path, p_file_name, p_mime, p_size) returns uuid`: same rules as `add_payment_attachment`.
- `vendor_bill_contractor_check(p_bill) returns table(consultant_id, consultant_name, hours text, expected text)`
  - Approved time entries with `work_date` in the bill's period, for consultants of the bill's vendor; `expected = sum(hours × cost_rate_snapshot)`.
  - Empty when there's no period.
- Error messages in `db-errors.ts`:
  - `BILL_LOCKED`: "This bill is approved and can't be changed. Void it and enter a corrected bill."
  - `BILL_EMPTY`: "Add at least one line."
  - `BILL_NOT_PAYABLE`: "Approve the bill before recording a payment."
  - `VENDOR_PAYMENT_TOO_LARGE`: "This payment is more than the balance due."
  - `BILL_HAS_PAYMENTS`: "This bill has payments, so it can't be voided."
  - the unique index's name: "This bill number is already entered for this vendor."

- [ ] **Step 1: Failing tests:**
  - save a new bill with 2 lines and check the total; saving an approved bill gives BILL_LOCKED
  - a manager can't approve (42501); an admin's approval creates 1 expense (payee = vendor, `spent_on` = bill_date, linked to its line), and a contractor line creates none
  - reject with a reason, then save again, gives `pending_approval` with no reason
  - paying a `pending_approval` bill gives BILL_NOT_PAYABLE; an overpayment gives VENDOR_PAYMENT_TOO_LARGE; a partial payment gives `partly_paid`, and paying the rest gives `paid`
  - deleting a payment recomputes the bill back to `approved` or `partly_paid`
  - void with payments gives BILL_HAS_PAYMENTS; void without payments deletes the created expense
  - the contractor check: a vendor consultant with 10 approved hours at a cost snapshot of 90 gives expected 900.00
  - a consultant gets 42501 from every function
- [ ] **Step 2: Run** and expect FAIL. **Step 3: Implement**, then run `migration up` and `db:types`. **Step 4:** expect PASS.
- [ ] **Step 5: Commit** `feat(vendor-bills): approval and payment functions`

### Task 3: Bank matching and reports

**Files:** Create `supabase/migrations/20261115000042_vendor_payments_bank_reports.sql`. Test `tests/integration/vendor-bills-bank.test.ts`.

**Interfaces:**
- `confirm_bank_line_vendor_payment(p_line, p_bill, p_notes) returns uuid`
  - Locks the line (status new, else LINE_HANDLED); amount < 0, else LINE_DIRECTION; the bill must be in the line's firm.
  - Calls `record_vendor_payment` with the method from the account type, the reference from the bank ID or description, and an amount of `-line.amount`.
  - Links `vendor_payment_id`.
- `link_bank_line(p_line, p_payment, p_expense, p_vendor_payment default null)`: recreate it so it accepts a vendor payment. Exactly one of the three; amount = −line.amount; ALREADY_LINKED.
- `bank_match_candidates`: the money-out branch also returns:
  - `bills`: approved or partly-paid bills with `balance_due <= -amount`, giving id, bill_number, vendor_name, balance_due and due_date
  - `vendor_payments`: unlinked payments in ±7 days with the same amount
- `mark_bank_lines_duplicate`: money-out lines also consider unlinked vendor payments. Exactly one candidate across expenses and vendor payments gets linked.
- `list_bank_lines`: `linked_label` covers vendor payments, as "Bill #<number> – <vendor>".
- `transactions_report`: add the branch kind `'vendor_payment'` (paid_on, the vendor as payee, `invoice_number` = bill_number, category `'Vendor bill'`, amount, notes). The expense branch excludes `vendor_bill_line_id is not null`.

- [ ] **Step 1: Failing tests:**
  - confirming a money-out line against an approved bill records the payment and marks the line done; a second concurrent confirm gives LINE_HANDLED
  - confirming against an unapproved bill gives BILL_NOT_PAYABLE and leaves the line new
  - link and duplicate work with a vendor payment, and ALREADY_LINKED applies
  - deleting a linked vendor payment returns the line to new
  - transactions for a period with an approved 300 bill and a 300 vendor payment show exactly one money-out row of −300 (the vendor payment)
  - the P&L's direct expenses include the 300 once
  - candidates rank an exact-balance bill first
- [ ] **Step 2–4: Fail, implement, pass.** **Step 5: Commit** `feat(vendor-bills): bank matching and reports`

### Task 4: Data module, actions and TypeScript report changes

**Files:**
- Create `src/modules/vendor-bills/{data.ts,schemas.ts,actions.ts,schemas.test.ts}`.
- Modify `src/modules/bank/{data.ts,actions.ts,suggest.ts}`.
- Modify `src/modules/reports/transactions.ts` and its test.

**Interfaces:**
- `listBills(db, firmId, {status: 'awaiting'|'unpaid'|'overdue'|'paid'|'all', vendorId, from, to})`: returns rows and totals `{toPay, overdue}`.
- `getBill(db, firmId, id)`: the bill with lines, attachments, payments (with files and the linked bank account) and the contractor check.
- Actions:
  - `saveBillAction`, `approveBillAction`, `rejectBillAction`, `voidBillAction`
  - `recordVendorPaymentAction` and `recordVendorPaymentFromDepositAction` (the latter for a bank line)
  - `deleteVendorPaymentAction`, and attachment upload targets mirroring the payments module
- Schemas: lines are a JSON array of 1–50 items; money is parsed with `parseMoney`; `due >= bill date`.
- `rankBills(description, bills, amount)`, in this order:
  1. exact balance, with the vendor's first word or the bill number in the description
  2. exact balance
  3. the vendor named
  4. the rest, by due date
- Transactions: the kind `'vendor_payment'` describes as `Vendor payment – <vendor>, bill #<number>` and counts as money out.

- [ ] **Step 1: Failing unit tests:**
  - `rankBills` order
  - schema rules: an expense line needs a category; money is 2 decimal places; due before bill date is refused; 0 lines are refused
  - the transactions description and sign for vendor payments
- [ ] **Step 2–4: Fail, implement, pass,** then run `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(vendor-bills): data module and actions`

### Task 5: Screens, menu and end-to-end tests

**Files:**
- Create under `src/app/f/[firmId]/vendor-bills/`:
  - `page.tsx`: list with filters and totals
  - `new/page.tsx` and `bill-form.tsx`: a line editor with Expense or Contractor kind, category, client/project or consultant, and PDF attach
  - `[id]/page.tsx`: detail; the approval box (Admin); contractor check; payments list with Delete and files; Record payment button
  - `[id]/edit/page.tsx`
  - `[id]/record/page.tsx`: bank money-out lines that fit the balance, plus the manual form, reusing the payments components' patterns
- Modify:
  - `src/app/f/[firmId]/bank/[accountId]/line-actions.tsx`: a "Vendor bill payment" mode for money-out lines
  - `src/app/f/[firmId]/layout.tsx`: the menu
- Test `tests/e2e/vendor-bills.spec.ts`.

- [ ] **Step 1: Failing e2e tests:**
  - a manager enters bill "INV-4471" from vendor Acme Staffing (an expense line Software $300 with a PDF, and a contractor line $900) and sees "Awaiting approval"; Approve isn't offered to the manager
  - an admin approves; the expense appears on Billing › Expenses with payee Acme Staffing
  - a statement with `-1200.00 ACME STAFFING INV-4471` is uploaded; in review, Vendor bill payment suggests INV-4471 first; confirming shows the bill as Paid with the bank reference
  - entering INV-4471 again for Acme gives the duplicate message
  - a consultant gets 404 on `/vendor-bills`
- [ ] **Step 2–4: Fail, implement, pass,** then run `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(vendor-bills): screens and menu`

### Task 6: Demo data and full verification

- [ ] Add to `scripts/seed-demo-bank.mjs` (or a new `seed-demo-bills.mjs` called from `seed-demo.mjs`):
  - one approved, unpaid bill from the demo vendor
  - one bill awaiting approval
  - a matching money-out line in Main checking
- [ ] Run `npm run lint && npm run typecheck && npm run test:unit && npm run test:int && npm run test:e2e` and expect everything to pass.
- [ ] Commit `chore(demo): vendor bills in demo data`
