# Consultant pay rate and "My hours and pay" — design

Checklist item 29. Owner decision of 2026-11-19 in `launch/decisions.md` ("Consultant pay rate and
'My hours and pay'"). Status: **design, waiting for the owner's approval.** No plan or code yet.

## Intent

Consultants want to see their own hours and what those hours earn them. Today they see only their
timesheet and projects. The owner decided:

- each consultant has one **pay rate**: today's cost rate, renamed. It stays the P&L cost and is
  frozen when a timesheet is approved;
- each consultant has a **Paid through** setting: paid directly by the firm, or by their employer
  (a vendor);
- consultants get a **"My hours and pay"** page. Consultants paid directly see their frozen pay rate
  and gross amount; vendor-employed consultants see hours and "Billed by <employer>", never an amount.

**Goals:** rename in the UI and docs; a Paid through setting admins can see; a consultant-facing page
that is safe by construction (enforced in the database, not only in the page).

**Non-goals (owner's "not now"):** preparing or exporting pay runs, marking pay as paid, payroll
processing, payslips, tax or deductions.

**Anti-goals (a failure even if it works):**
- a consultant can see another consultant's rows, a client rate, an invoice, a margin, or what the
  firm pays a vendor;
- the page reads like a payslip or a payment record, so someone thinks money was sent;
- the P&L, invoicing or the contractor true-up (item 28) change their numbers.

## How it works today (what this builds on)

- `consultants.type` is an enum `employee | independent | vendor`. A database check
  (`consultants_vendor_required_chk`) already enforces `type = 'vendor'` ⇔ `vendor_id is not null`.
  Only Admins create or edit consultants (migration 38); Managers can read them.
- `consultant_cost_rates(consultant_id, hourly_cost, effective_from)`: dated rates, one per start
  date, no end date (a rate applies until the next one starts). Admins add or delete rates; there
  is no edit. Admins and Managers can read them; consultants cannot (RLS).
- `approve_timesheet` (latest body in migration 12) copies the rate in force on each entry's
  `work_date` into `time_entries.cost_rate_snapshot` (and the client rate into
  `client_rate_snapshot`), refusing with `COST_RATE_MISSING` if none. `reopen_timesheet`
  (approved → **draft**, only while nothing is invoiced) clears both snapshots. Adding or deleting a
  rate never changes an approved entry.
- Timesheet status: `draft | submitted | approved | rejected`. Reject is from submitted and needs a
  comment. **There is no "reopened" status:** a reopened week is a draft again, and its decision
  comment is cleared.
- Consultants read their own `timesheets` rows (RLS) but not `time_entries`; they read entries
  through `timesheet_entries()`, which hides the rates. They cannot read `vendors`.
- P&L labour = Σ hours × `cost_rate_snapshot` over approved entries by work date. The item 28
  true-up compares a contractor line with Σ hours × `cost_rate_snapshot` of the consultant's approved
  entries, matching consultants by their **current** `vendor_id`.
- Managers already see the frozen cost rate on the timesheet review page
  (`timesheets/[id]/page.tsx`, column "Cost rate").

## Approaches considered

| | Pay rate | Paid through | Page data |
|---|---|---|---|
| **A. Rename in the UI, derive Paid through, snapshot it on approval (recommended)** | Keep the table and columns; change labels and docs. | Derived from `type`: `vendor` → Their employer, otherwise Paid directly. The vendor in force is recorded on each timesheet when it is approved. | Two `security definer` read functions that return only what the caller may see. |
| B. Rename the database too | Rename `consultant_cost_rates` / `hourly_cost` / `cost_rate_snapshot`. | As A. | As A. |
| C. New `paid_through` column | As A. | New enum column on `consultants` with its own check against `vendor_id`. | As A. |

- **B** touches about ten functions (P&L, true-up, vendor bills, invoicing) and the item 28 files
  another session is editing right now, for no user-visible gain. Not clearly safe; rejected.
- **C** duplicates what `type` + `vendor_id` already say and adds a way for them to disagree
  (an "employee" paid through an employer). Rejected unless the owner wants Paid through to be
  independent of type (decision 2).
- Without the snapshot in A, the page would label every past week by today's setting. A contractor
  who moves from an agency to the firm's payroll would then see the agency's old hourly amount
  multiplied out — exactly the vendor amount the decision forbids. Hence the snapshot (decision 3).

## Design

### 1. Pay rate (rename only)

- **Database:** unchanged. `consultant_cost_rates.hourly_cost` and `time_entries.cost_rate_snapshot`
  keep their names; a comment on each says "the consultant's pay rate". The error code stays
  `COST_RATE_MISSING`; only its message changes.
- **Still the P&L cost, still frozen on approval:** nothing in approval, reopen, P&L or the true-up
  changes. The page reads `cost_rate_snapshot` — the same number the P&L and the true-up use.
- **Effective dates and history:** keep as they are (dated rows, add or delete, frozen copies on
  entries). Nothing needs to change: a rate change only affects weeks approved afterwards, and a
  past week only changes if it is reopened and approved again, which is already how client rates
  behave. The page shows each week's frozen rate, so history is visible to the consultant without
  exposing the rate table.
- **UI and docs wording:**

  | Where | Today | New |
  |---|---|---|
  | Consultant page, section | Cost rates / Hourly cost / Add a cost rate | Pay rates / Hourly pay rate / Add a pay rate |
  | New consultant form | Initial hourly cost (optional) / Cost effective from | Starting pay rate (optional) / Pay rate starts on |
  | Consultants list column | Current cost / hour | Current pay rate / hour |
  | Timesheet review page column | Cost rate | Pay rate |
  | `COST_RATE_MISSING` message | "…has no cost rate for a day worked…" | "…has no pay rate for a day worked. Add a pay rate starting on or before that day, then approve." |
  | Success / delete labels | "Cost rate added", "Delete cost rate" | "Pay rate added", "Delete pay rate" |
  | README, ARCHITECTURE | cost rate | pay rate (P&L keeps the heading "Labour cost": the pay rate *is* the cost) |

  Helper text under the pay-rate form: "What the firm pays per hour for this consultant. For
  someone paid through their employer, the hourly amount you expect the employer to bill. Used as
  labour cost in Profit & loss and frozen on each week when it's approved."
- **Not in this item:** wording inside vendor-bill and true-up screens ("approved hours × cost
  rate"). Those files belong to the item 28 follow-up session; rename them after it merges (a
  one-line follow-up).

### 2. Paid through

- **Derived, not stored on the consultant** (decision 2): `type = 'vendor'` → **Their employer**
  (the vendor); `employee` or `independent` → **Paid directly**.
- **Validation:** already in the database. "Their employer" requires a vendor
  (`consultants_vendor_required_chk`; the form already drops `vendorId` for other types). Nothing new.
- **Label** (decision 1): the owner's note says "Payroll", but independent contractors are paid
  directly without being on payroll. Recommended label: **Paid directly**. If the owner prefers
  "Payroll", it's a text change.
- **Consultant form:** keep the Type field, with clearer options and a read-only line:
  - "Employee — paid directly (payroll)"
  - "Independent contractor — paid directly"
  - "Contractor through a vendor — paid by their employer" (then the vendor picker, as today)
  - below: "Paid through: Paid directly" or "Paid through: <vendor name>".
- **Remember it per approved week** (decision 3): new nullable column
  `timesheets.approved_vendor_id uuid`, FK `(firm_id, approved_vendor_id)` → `vendors (firm_id, id)`
  **on delete restrict** (never `set null`, which would turn a vendor week into a directly-paid one).
  - `approve_timesheet` sets it to the consultant's `vendor_id` at the moment of approval (null =
    paid directly). `reopen_timesheet` clears it. Both are `create or replace` of the migration 12
    bodies with one extra assignment each.
  - Check: `approved_vendor_id is null or status = 'approved'`.
  - Changing a consultant's type later does not change any approved week.
  - The true-up is **not** switched to this column in this item (see section 6).

### 3. "My hours and pay" page

**Route and menu:** `/f/[firmId]/my-pay`, menu "Work → My hours and pay", for every role (like "My
timesheet"; an Admin or Manager linked to a consultant record sees their own). A login with no
consultant record sees the same "not linked" message the timesheet page shows.

**Layout** (one calendar year at a time; year picker, default this year):

```
My hours and pay                                     [2026 ▾]   [Print]
Paid through: Paid directly            (or: Paid through: Northwind Staffing)

By month (approved hours, by date worked)
  Month      Approved hours   Gross amount
  Oct 2026            152.00      $12,160.00
  Nov 2026             80.00       $6,800.00
  Total               232.00      $18,960.00

By week
  Week of     Status                 Hours   Pay rate   Gross amount
  Nov 16      Waiting for approval   40.00       —            —
  Nov 9       Approved               40.00     $85.00     $3,400.00
  Nov 2       Returned for changes   38.00       —            —
              "Please split Friday between the two projects."
  Oct 26      Approved               40.00     $80.00 / $85.00   $3,280.00
  ...

Gross amount = approved hours × your pay rate on each day, before tax and deductions.
This is not a payslip and doesn't show whether you've been paid. For payment questions, contact <firm name>.
```

For a consultant paid through their employer, the amount and rate columns are replaced by one column:

```
  Week of     Status        Hours   Billed by
  Nov 9       Approved      40.00   Northwind Staffing
Your hours are billed to <firm name> by Northwind Staffing. Your pay comes from Northwind Staffing.
```

Rules:
- **Weekly rows** for every timesheet that exists in the year (week start in the year), any status.
  Weeks with no timesheet aren't shown. Each week links to the timesheet page for that week.
- **Monthly summary** counts **approved entries only**, by work date (a week that spans two months is
  split correctly). Weekly rows are what consultants recognise; monthly totals are what pay periods
  usually look like, so both are shown (my call).
- **Status wording:** draft → "Not submitted"; submitted → "Waiting for approval"; rejected →
  "Returned for changes" with the comment; approved → "Approved". A reopened week shows as "Not
  submitted" (there's no reopened status, and adding one isn't worth it).
- **Amounts appear only for approved weeks paid directly**, from the frozen rates. Unapproved weeks
  show hours and "—": there is no frozen rate yet, and showing today's rate would be a guess.
- **Pay rate column:** the distinct frozen rates in the week, oldest first ("$80.00 / $85.00" when a
  rate change falls mid-week).
- **No "paid" anything.** The column is "Gross amount", never "Pay" or "Paid"; the footnote above is
  always shown, and printed.
- **Mixed weeks:** if a consultant's Paid through changed, each approved week follows its own
  snapshot; a month can show both a directly-paid row and a "Billed by" row.
- **Rounding:** each displayed amount is `round(Σ hours × frozen rate, 2)` over the entries it
  covers, the same arithmetic as P&L labour. Weekly amounts can differ from the monthly total by a
  cent per week; the monthly total is the one to trust (footnote not needed at this size; builder's
  call).
- **Download** (decision 6): none now. The page has a print stylesheet and a Print button (browser
  print). A CSV is cheap later using the reports CSV route pattern.
- **Empty state:** "No timesheets in 2026 yet."

**Admins and Managers** (decision 4): the same page for any consultant at
`/f/[firmId]/hours-and-pay/[consultantId]`, read-only, linked from the consultant page ("View hours
and pay") and from the consultant's name on the timesheet review page. It renders exactly what the
consultant sees (no extra columns), so it doubles as "what does Dana see?".

### 4. Permissions and enforcement (database)

Two read functions, `language sql stable security definer set search_path = ''`, granted to
`authenticated` only, revoked from `public, anon`:

- `consultant_pay_weeks(p_firm uuid, p_consultant uuid, p_from date, p_to date)` →
  `week_start, status, decision_comment, hours, pay_rates numeric[], gross numeric(12,2),
   employer_name text`
- `consultant_pay_months(p_firm uuid, p_consultant uuid, p_from date, p_to date)` →
  `month date, hours numeric, gross numeric(12,2), employer_name text`
  (one row per month and Paid through; directly-paid rows have `employer_name` null)

Plus `my_consultant_id(p_firm uuid) returns uuid` (the caller's linked, active-membership
consultant id or null) so the self page needs no id from the URL.

Access rule inside both functions (raises `42501` otherwise): the consultant is in `p_firm` **and**
either `consultants.user_id = auth.uid()` and `is_member(p_firm)`, or `has_role(p_firm,
'{admin,manager}')`. This is the rule of the existing `can_edit_consultant_time`; reuse it.

What the functions return, regardless of caller:
- `pay_rates` and `gross` are **null unless** the week is approved **and** `approved_vendor_id is
  null`. So a vendor-employed week never returns a rate or amount, even to an Admin through this
  function (Admins see those numbers on their own pages already).
- `employer_name` = vendor name from `approved_vendor_id`, only for approved weeks.
- Never: client rate, project or client amounts, invoices, margins, other consultants, vendor bills.
- `decision_comment` is already readable by the consultant through `timesheets` RLS.

Unchanged: consultants still can't read `consultant_cost_rates`, `time_entries` or `vendors`
directly; there is no new RLS policy and no widening of an existing one. The page calls only these
functions.

### 5. What changes for Admins and Managers

- Consultant page and forms: the wording in section 1, the clearer Type options and "Paid through"
  line in section 2, and a "View hours and pay" link. Who can edit is unchanged (Admins).
- Timesheet review: "Cost rate" → "Pay rate"; consultant name links to their hours-and-pay page.
- Approval behaves the same; it also records the vendor in force. Reopen clears it.
- Changing a consultant's Type no longer rewrites how their past approved weeks look.

### 6. Interaction with item 28 (contractor true-up)

- The true-up keeps using `time_entries.cost_rate_snapshot` (= the frozen pay rate). Same number,
  new name in the UI only. No change to `contractor_line_costs`, `pnl_facts` or vendor-bill
  functions, and none of the item 28 files are touched.
- The true-up matches consultants by their **current** `vendor_id`. If a contractor moves vendors
  or onto payroll, old bills from their previous vendor would stop matching their hours. Item 29
  doesn't change that; `approved_vendor_id` makes a later fix easy (match on the snapshot). Flagged
  as a follow-up for the launch manager, not built here.
- An integration test asserts that the true-up figures for the existing item 28 fixtures are
  unchanged after this migration.

### 7. Migration safety (live database)

One migration, additive, safe while the app runs:
1. `alter table timesheets add column approved_vendor_id uuid` (nullable, no default: metadata only).
2. Add the FK and check as `not valid`, then `validate constraint` (small tables; no long lock).
3. Backfill: for approved timesheets, `approved_vendor_id = consultants.vendor_id`. Before launch,
   today's link is the best record available. The update fires the existing audit trigger and bumps
   `updated_at` on those rows; both are acceptable (logged as a system change).
4. `create or replace` `approve_timesheet` and `reopen_timesheet` (copy migration 12's bodies, add
   one assignment each), and create the three read functions with grants.
5. Comments on `hourly_cost` / `cost_rate_snapshot` ("pay rate").

Production: `npx supabase db push --linked --dry-run`, show the owner, apply only on their yes. The
app change and migration can ship together: old app code ignores the new column; the new page
needs the functions.

### 8. Tests

- **Unit:** status labels; pay-rate list formatting ("$80.00 / $85.00"); Type option labels and
  Paid-through derivation; `COST_RATE_MISSING` message.
- **Integration (local Supabase):**
  - a consultant gets their own weeks and months; passing another consultant's id → `42501`;
    another firm's id → `42501`; anon → denied; a removed member → denied;
  - Admin and Manager can read any consultant in their firm (per decision 4);
  - unapproved weeks: hours present, rates and gross null;
  - vendor weeks: rates and gross null for every caller; `employer_name` set;
  - approve sets `approved_vendor_id`; reopen clears it; changing Type afterwards leaves past weeks
    as they were (the switching-contractor case);
  - monthly gross equals P&L labour for the same consultant and month (same arithmetic);
  - month split for a week spanning two months;
  - backfill sets the vendor on approved weeks only;
  - consultants still cannot select `consultant_cost_rates`, `time_entries` or `vendors`;
  - item 28 true-up fixtures give the same numbers.
- **E2E (Playwright, demo data):** a directly-paid consultant submits, a manager approves, the
  consultant sees hours, rate and gross with the footnote; a vendor consultant sees "Billed by
  <vendor>" and no currency amount anywhere in the page; the menu item appears; the Admin opens a
  consultant's hours-and-pay page; renamed labels on the consultant and review pages.
- Gates as usual: lint, typecheck, unit, integration, e2e. A Reviewer pass is required (money and
  permissions).

## Decisions for the owner

1. **Label for the directly-paid option: "Paid directly" (recommended) or "Payroll".** Independent
   contractors aren't on payroll. *If wrong:* a text change.
2. **Paid through is derived from Type, not a new setting (recommended).** Type already says it, and
   the database already requires a vendor for vendor contractors. *If wrong:* adding a separate
   field later is a small migration plus a form field.
3. **Remember Paid through on each approved week (recommended).** *If we don't:* a contractor who
   moves from an agency to the firm would see the agency's hourly amount on their old weeks —
   the vendor amount the decision says they must never see.
4. **Admins and Managers can open any consultant's "hours and pay" page, read-only (recommended).**
   Managers already see these frozen rates when approving. *If wrong:* remove a route and one access
   branch; no data changes.
5. **Show only the frozen rates on approved weeks, not the current or upcoming pay rate
   (recommended).** Keeps the rate table private and avoids showing a rate before it's final.
   *If wrong:* consultants ask "what's my rate?"; adding a "Current pay rate" line is small.
6. **No download for now; a printable page instead (recommended).** *If wrong:* a CSV is about half
   a day using the existing report CSV pattern.

## Left to the builder

Exact function SQL (following migration 12's style), component structure, the year picker control,
print stylesheet details, where the "not linked" message lives, and test fixture names — all within
the rules above.
