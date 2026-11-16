# Receivables and Payables reports — design

Date: 2026-11-16. Status: draft for approval.

## Why

Managers' biggest pain is slow-paying clients and vendor bills sitting unpaid. They chase outside
FirmSync (phone, their own email), so what they need is a clear list of **who to chase** and **what
to pay**, and the ability to download it. This is piece 1 of 3; profitability by consultant (piece 2)
and timesheet delays (piece 3) follow later in the same Reports pattern.

## Goals

- A **Receivables** report: what each client owes, how overdue, and how slowly they usually pay.
- A **Payables** report: what the firm owes each vendor, what is overdue, what falls due soon, and
  what is still waiting for approval.
- Every view downloads as CSV.

## Non-goals

- No reminders, emails or "chased on" notes — chasing happens outside FirmSync.
- No "as of a past date" view; both reports show balances as of today.
- No charts in this piece; tables and totals only.
- No cash forecast (a later piece if wanted).

## Approach (chosen: A)

- **A. Two new reports under Reports, next to P&L and Transactions** — chosen. Same shape as the
  existing reports (filters, totals, table, Download CSV), and pieces 2–3 slot in the same way.
- B. One combined "Cash position" page with tabs — rejected: crowded, muddled downloads.
- C. Add ageing/CSV to the existing Unpaid invoices and Vendor bills lists — rejected: keeps reports
  scattered, no common home for later pieces.

## Who sees it

Admins and managers (same as P&L and Transactions). Consultants do not.

## Receivables — `/f/[firmId]/reports/receivables`

**Counts as owed:** issued invoices with a balance due (total minus payments), as the existing
Unpaid invoices list already defines it. Buckets reuse `src/lib/domain/ageing.ts`
(Not yet due, 1–30, 31–60, 61–90, Over 90), measured from the invoice due date to today.

**Filters:** clients (multi-select, reusing the P&L multi-select), "Overdue only" checkbox.

**Headline totals:** Total owed · Overdue · Over 60 days · Clients with overdue invoices.

**Client summary table** (one row per client with a balance, sorted by overdue amount, largest first):
Client · Not yet due · 1–30 · 31–60 · 61–90 · Over 90 · Total owed · Oldest overdue (days) ·
Avg days to pay · Avg days late · Open invoices. A totals row at the bottom.

**Payment history columns** (last 12 months): over invoices *fully paid* in the last 12 months,
"paid date" = the date of the payment that cleared the balance. Avg days to pay = paid date −
issue date; Avg days late = paid date − due date, floored at 0. Shown as "—" when the client has no
fully paid invoice in the window. Clients with no balance but recent history do not appear (the
report is about who owes now).

**Drill-down:** clicking a client shows its open invoices below the summary (same page,
`?client=<id>`): Invoice number (link) · Issue date · Due date · Total · Paid · Balance · Days
overdue.

**Downloads:** "Download summary (CSV)" and "Download invoices (CSV)" — the latter lists every open
invoice in the current filter (all clients, or the one selected), with the client name on each row.

## Payables — `/f/[firmId]/reports/payables`

**Counts as owed:** vendor bills with status `approved` or `partly_paid`, balance = total minus
vendor payments. Bills `pending_approval` are shown **separately**, never mixed into the aged
amounts. `rejected`, `void`, `paid` are excluded.

**Buckets** (by bill due date): Due in 0–7 days · Due in 8–30 days · Due later · then the overdue
buckets 1–30, 31–60, 61–90, Over 90 (same thresholds as receivables).

**Filters:** vendors (multi-select), "Overdue only" checkbox.

**Headline totals:** Total owed (approved) · Overdue · Due in next 7 days · Awaiting approval
(count and amount).

**Vendor summary table** (sorted by overdue, then due within 7 days): Vendor · Due ≤7 days ·
Due 8–30 · Due later · 1–30 · 31–60 · 61–90 · Over 90 · Total owed · Awaiting approval · Oldest
overdue (days). Totals row.

**Drill-down** (`?vendor=<id>`): open and awaiting-approval bills: Bill number (link) · Status ·
Bill date · Due date · Total · Paid · Balance · Days overdue / due in.

**Downloads:** summary CSV and bills CSV, as for receivables.

## Navigation

Reports menu gains **Receivables** and **Payables**. The existing Unpaid invoices page stays; it
gets a small "See the Receivables report" link.

## How it's built (builder's notes)

- One migration with security-definer report functions in the existing style (`has_role` admin or
  manager, `set search_path = ''`), e.g. `receivables_report(p_firm, p_clients, p_overdue_only)`,
  `receivables_invoices(p_firm, p_clients, p_overdue_only)`, `payables_report(...)`,
  `payables_bills(...)`. Today's date is passed in from the app (`todayIso()`), like the other
  reports, so tests can pin it.
- Modules `src/modules/reports/receivables.ts` and `payables.ts` (params parsing + data), CSV
  builders alongside, CSV routes under each report's `csv/` folder, mirroring Transactions.
- Money is formatted in the firm currency; CSV amounts are plain numbers.

## Left to the builder

Exact column widths and mobile layout (tables scroll horizontally like the existing reports),
function names, CSV file names (e.g. `receivables-summary-2026-11-16.csv`).

## Calls I made (please check)

1. Balances are as of today only (no past "as of" date).
2. Days-to-pay history uses the last 12 months and only fully paid invoices.
3. Pending-approval bills are shown in their own column, not counted in "Total owed".
4. Payables splits "not yet due" into ≤7 / 8–30 / later days, so "what to pay soon" is visible.
5. Clients/vendors with nothing owed are left out of the summary.
