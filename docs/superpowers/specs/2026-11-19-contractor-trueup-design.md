# Contractor bill true-up in the P&L: design

Status: approved by the owner, 2026-11-19 ("Approve all six"). Checklist item 28.
Owner's decision: `launch/decisions.md`, 2026-11-19 "Contractor cost: count on approved time, true up on the bill".

## Why

Revenue is counted when hours are approved, so contractor cost is too: approved hours × the cost rate
frozen on approval. That stays. But the P&L never sees the contractor's bill itself, so item 24 found
two gaps:

1. A contractor with no timesheets (a designer billed by the job, a freelancer not set up in
   VeriTreo) never appears in the P&L at all.
2. When a bill differs from hours × cost rate (overtime, a rate change, a missed timesheet), the
   difference is shown to the approver and then lost.

The owner decided: when the contractor's bill is approved, the difference is counted as a
**contractor cost adjustment** on the bill date, against the bill's project or client. Lines for
contractors without timesheets count in full on approval.

**Goal:** after a contractor bill is approved, the P&L's contractor cost for the work it covers equals
what the bill says, never more, never less, however hours move later.

**Non-goals:** changing how revenue, invoices, expense lines, Transactions (cash) or Payables work;
vendor credit notes; partial approval; cash-basis P&L.

**Anti-goals (a failure even if it "works"):** any case where the same contractor hour is counted
twice; client invoices or time entries changed by a bill; old months moving because of this release
alone.

## How things work today (what this changes)

- `vendor_bill_lines.kind = 'contractor'` lines: `consultant_id` is optional in the database, but the
  bill form never sets it (`ContractorLine` in `src/modules/vendor-bills/schemas.ts` has only
  description and amount). The constraint `vendor_bill_lines_contractor_chk` **forbids** a client or
  project on a contractor line.
- The bill has an optional service period (`period_start`, `period_end`).
- `vendor_bill_contractor_check(bill)` shows approved hours × cost rate for **all of the vendor's
  consultants** in the bill period, summed per entry after rounding each to cents. It has no idea
  which line is for whom, or which project.
- `approve_vendor_bill` turns expense lines into expenses; contractor lines go nowhere.
- `pnl_facts` emits `labour` = hours × `cost_rate_snapshot` (exact, up to 4 decimals) per approved
  entry, dated by work date. Everything in `pnl_facts` is computed live from source rows; nothing is
  stored.
- Timesheets are weekly; `reopen_timesheet` clears the frozen rates and is refused once any entry is
  invoiced.

**So the link from a bill line to hours is not reliable today.** With two consultants from one vendor,
or a line covering only one project, or no period, there is nothing to match against. A bill line
needs an explicit consultant, a period and (optionally) a project.

## Approaches

| | How | Trade-off |
|---|---|---|
| **A. Computed live (recommended)** | `pnl_facts` gains a measure `contractor_adjustment` = line amount − approved hours × cost rate *as they are now* for that line's consultant, period and project. Nothing stored. | Always right: late approvals, reopened timesheets and re-approvals at a new rate are absorbed automatically, so total cost always equals the bill. Matches how every other P&L figure works. Cost: the adjustment in the bill's month can change after the fact when hours move, as labour in past months already does when late timesheets are approved. |
| B. Stored rows, maintained by triggers | Approval writes adjustment rows; triggers on timesheet approve/reopen rewrite them. | Same numbers as A, frozen in a table you can audit, but every timesheet path must remember to update it. A missed path means double counting. More code, more risk, no benefit to the user. |
| C. Expense for the difference | Approval creates an expense (category Contractors) for bill − expected. | Simplest, but frozen: hours approved after the bill are then counted on top (double counting); a reopened timesheet leaves a hole. It also pollutes expense lists and the Transactions exclusion logic. Ruled out. |

Recommendation: **A**. The rest of this design assumes it.

## 1. How a contractor bill line relates to approved hours

Each contractor line says **who**, **when** and **for what**:

- **Who** (required choice on the form):
  - one of the vendor's consultants (as today, only consultants with `vendor_id` = the bill's
    vendor), or
  - **"Not on timesheets"**: someone billed without timesheets in VeriTreo.
- **When:** the bill's service period. It becomes **required** when any contractor line names a
  consultant. (One period per bill. A bill spanning October and November uses Oct 1 – Nov 30; the
  adjustment is dated on the bill date either way.)
- **For what** (optional): a project, or a client. The project's client is used for a project.
  - Consultant + no project: the line covers **all** of that consultant's approved hours in the
    period, on every project.
  - Consultant + project: only that consultant's hours on that project in the period.
  - "Not on timesheets": a client or project is required (see decision 4), since there are no hours
    to say where the cost belongs.

The line's **expected cost** is the exact sum of `hours × cost_rate_snapshot` over the matching
approved entries (same filter as `labour` in `pnl_facts`: timesheet `approved`, `work_date` in the
period, the consultant's timesheets, the project if one is named). For "Not on timesheets" it is 0.

Database changes:
- `vendor_bill_lines` gains `count_mode text not null` with values `trueup` (consultant named),
  `full` ("Not on timesheets"), `legacy` (lines that existed before this release; see Migration).
- `vendor_bill_lines_contractor_chk` is replaced: a contractor line has no category; it may have a
  client and/or project (project must belong to the client if both are given; client is filled from
  the project when only the project is given); `trueup` requires `consultant_id`; `full` requires
  `consultant_id is null` and a client or project; expense lines have `count_mode` null.
- `save_vendor_bill` accepts `consultant_id`, `project_id`, `client_id` and `count_mode` on contractor
  lines, keeps the vendor check on consultants, and refuses a `trueup` line when the bill has no
  period (`BILL_PERIOD_REQUIRED`).

## 2. The adjustment

For each contractor line on a bill with status `approved`, `partly_paid` or `paid`:

```
adjustment = line amount − expected cost (live, as defined above)
```

- **Dated** on the bill date. **Measure:** `contractor_adjustment` in `pnl_facts`, filtered by bill
  date in the report range like any other fact.
- **Against:**
  - a line with a project: that project (and its client);
  - a line with only a client: that client, no project;
  - a `trueup` line with no project: split across the projects where the matching hours fall, in
    proportion to each project's expected cost. Each share is rounded to 4 decimals (the precision
    `labour` already has) and the project with the largest share takes the remainder, so the shares
    add up exactly to the line's adjustment. If there are no matching hours, the whole line goes to
    the line's client if it has one, otherwise to **Unallocated** (see Edge cases).
- **`full` lines:** expected = 0, so the adjustment is the whole amount, against the line's client or
  project. This is "contractors without timesheets count in full on approval".
- **`legacy` lines:** emit nothing (unchanged from today).

A shared SQL function, `contractor_line_costs(p_firm uuid, p_bill uuid default null)`, returns one
row per (line, project) with `bill_date, client_id, project_id, amount_share, expected, adjustment`.
`pnl_facts` uses it for the new measure; the bill page uses it for the contractor check, so the bill
page and the P&L can never disagree.

### In the P&L

A new column **Contractor adj.**, right after **Labour**, in `pnl_report`, `pnl_breakdown`, the page
and the CSV. **Gross** becomes revenue − labour − contractor adj.; net and margin follow. It appears
on every view: by month (in the bill date's month), by quarter, by client and by project, and in the
breakdown rows under each. My call: the page hides the column when every row is 0.00, so firms
without contractors see no change; the CSV always has it, so its layout is stable.

Adjustments with no client and no project are counted in the **Unallocated overhead** row's
Contractor adj. cell under client/project grouping (today a fact with no client simply drops out of
group rows there and only reaches the total), and in the period row under month/quarter grouping.

### On the bill page

The contractor check becomes per line:

> Dana Brooks · Nov 1–30 · all projects
> Approved hours: 70 h × $180 = **$12,600.00** · This line: **$12,900.00**
> Contractor cost adjustment: **+$300.00** (counted on the bill date, Nov 30)

For a `full` line: "Not on timesheets — counted in full: $2,000.00 against Acme Corp — Website".
Before approval it reads "will be counted"; after, "counted". Expected cost is the exact sum rounded
once to cents (today's check rounds each entry first; it changes to match the P&L).

## 3. Contractors without timesheets

Choose "Not on timesheets" on the line and pick a client or project. On approval the whole line is
contractor cost on the bill date against that client or project. No hours are looked at.

## 4. No double counting: the proof

For one `trueup` line with consultant *c*, period *P* and project scope *S*:

- Labour counts each matching approved entry once: Σ hours × rate = **E** (expected cost).
- The adjustment counts **amount − E**, computed from the same entries at the same moment (both are
  live reads of the same rows in the same query).
- Total contractor cost for that scope = E + (amount − E) = **amount**, exactly, whatever E is.

The only way to break this is two approved lines whose scopes share an hour: each would subtract the
same E. So **overlapping lines are refused** (decision 3): two contractor lines on approved (or
paid / part-paid) bills, or on the same bill, may not have the same consultant, overlapping periods,
and overlapping project scope (either line covers all projects, or both name the same project).
`approve_vendor_bill` checks this (`BILL_CONTRACTOR_OVERLAP`, naming the other bill number), as does
`save_vendor_bill` within a bill. To make the check safe under two admins approving at once, approval
locks the named consultants' rows (`select … for update` on `consultants`, in id order) before
checking.

Hours outside every line's scope keep counting as plain labour, as today.

### Worked example (the brief's)

Dana Brooks, Nov 1–30, project Website, cost rate $80.

| Step | Labour (Nov) | Contractor adj. (bill date Nov 30) | Total cost |
|---|---|---|---|
| 10 h approved | 10 × $80 = **$800.00** | — | $800.00 |
| Bill #4471 for $1,100, line: Dana, Nov 1–30, all projects; approved | $800.00 | 1,100 − 800 = **+$300.00** | **$1,100.00** |

### The same example when things move

| What happens | Labour | Adj. | Total |
|---|---|---|---|
| Only 6 h approved when the bill is approved | $480.00 | +$620.00 | $1,100.00 |
| …then the other 4 h are approved on Dec 2 | $800.00 | +$300.00 | $1,100.00 |
| The timesheet is reopened (rates cleared) | $0.00 | +$1,100.00 | $1,100.00 |
| …and re-approved after Dana's cost rate changed to $85 | $850.00 | +$250.00 | $1,100.00 |
| Bill was for $700 instead | $800.00 | −$100.00 | $700.00 |
| Bill is voided | $800.00 | — | $800.00 |

### Several projects

Dana, Nov, all projects: 50 h on Website and 20 h on Audit at $180. E = 9,000 + 3,600 = 12,600; bill
$12,900; adjustment $300. Audit: 300 × 3,600 / 12,600 = 85.7143; Website (largest) takes the rest,
214.2857. Website total 9,214.2857, Audit 3,685.7143: together $12,900.00.

## 5. Edge cases

- **A bill covering several projects:** one line with no project (split by expected cost, above), or
  one line per project. A line per project is better when the vendor itemises by project.
- **A bill covering several periods:** one bill period spanning them. If the vendor bills each month
  separately on one bill, enter one bill per month, since a bill has one period. My call: no
  per-line periods for now (YAGNI); revisit if firms ask.
- **Hours approved after the bill:** absorbed; the adjustment shrinks and the total stays the bill
  amount. The bill date's month figure changes, just as past months' labour already changes when a
  late timesheet is approved.
- **Hours reopened or changed after the bill:** same. Reopening is already refused once hours are
  invoiced, so invoiced hours can't move.
- **Partial bills** (the vendor bills Nov 1–15, then Nov 16–30): two bills with non-overlapping
  periods; each trues up its own half.
- **Multiple bills for the same period:** refused as overlapping. A supplementary charge for a period
  already billed (a late overtime bill, an expense the vendor passes on) is entered as a
  "Not on timesheets" line against the project, or as an expense line; it then counts in full and
  touches no hours. If the first bill was simply wrong: void it (only possible before payment, as
  today) and enter the corrected one.
- **Voiding a bill:** the adjustment disappears; labour stays. Nothing stored to clean up.
- **Rejected or pending bills:** no adjustment until approved.
- **A bill lower than expected:** a negative adjustment; total cost = the bill.
- **Invoices already issued for those hours:** untouched. The adjustment is cost only; it never
  changes time entries, client rates, invoices or revenue.
- **A `trueup` line whose hours all disappear later** (reopened) **and has no project or client:**
  the adjustment (now the whole amount) goes to Unallocated. Rare; shown on the bill page as
  "No approved hours in this period: counted as unallocated cost".
- **A consultant named on a line whose project has none of their hours:** expected 0; the whole line
  counts against that project.
- **Rounding:** expected and adjustment use the same exact products as `labour` (up to 4 decimals);
  the report rounds each cell once, as today, so a row's labour + adj. may show a cent off the bill
  amount on screen while the exact total is right. Split shares are 4 decimals with the remainder on
  the largest share, so they add up exactly.
- **Consultant moved to another vendor later:** the line keeps its consultant; the save-time vendor
  check is not re-run on approved bills.

## 6. Reports

- **P&L:** the new Contractor adj. column; gross, net and margin include it.
- **Transactions (cash), Payables, Receivables, ageing, bank review:** unchanged. Transactions already
  shows the vendor payment as money out, which is the cash side of the same bill, so nothing is
  missing there.

## 7. Migration and existing data

Existing contractor lines have no consultant and no project (the form never set them), so they can't
be matched to hours.

Recommended (decision 2): **no retroactive adjustments.**
- Every existing contractor line gets `count_mode = 'legacy'`. On approved, paid and void bills this
  keeps the P&L for every past month exactly as it is today.
- On pending or rejected bills, legacy lines block approval (`BILL_CONTRACTOR_LEGACY`: "Choose who
  each contractor line is for"); the bill form opens them with the "Who" field empty so an Admin or
  Manager picks it and saves.
- The bill page shows legacy lines on approved bills as "Approved before contractor true-up: not in
  the P&L."

Effect: past P&L unchanged; nothing double counts; pending bills need one edit. The alternative
(guessing the consultant when a vendor has exactly one, and adding adjustments on old bill dates)
would change historic months silently and could double count a vendor's second, unrecorded person.

The migration: add the column (default `legacy` for existing contractor rows, null for expense rows),
then drop the default and add the new checks; replace `save_vendor_bill`, `approve_vendor_bill`,
`vendor_bill_contractor_check`; add `contractor_line_costs`; replace `pnl_facts`; drop and re-create
`pnl_report` and `pnl_breakdown` (new return column) with their grants. Production: dry run first,
then the owner's yes, per the charter.

## 8. Tests

- **Unit (Vitest):** the bill form schema (contractor line needs "Who"; "Not on timesheets" needs a
  client or project; a named consultant needs a bill period); P&L CSV gains the column in the right
  place; the page hides the column when all zero.
- **Integration (local Supabase):**
  - the worked example: 10 h × $80 approved, bill $1,100 → labour 800, adj. +300, gross reflects
    1,100;
  - every row of "when things move": late approval, reopen, re-approval at a new rate, lower bill,
    void, pending and rejected bills count nothing;
  - multi-project split adds up exactly; per-project line only touches that project;
  - "Not on timesheets" counts in full against its client/project;
  - overlap refused across bills and within a bill; non-overlapping halves accepted; concurrent
    approvals of overlapping bills: one succeeds;
  - legacy lines: excluded from the P&L; block approval until edited;
  - `pnl_report` and `pnl_breakdown`: column present in month, quarter, client and project views,
    totals foot, filters behave as for other measures, unallocated adjustment lands in the overhead
    row;
  - the bill page's check (`contractor_line_costs`) equals the P&L's figures;
  - roles: Manager can save lines with consultants and projects, can't approve; consultants can't
    read any of it; cross-firm consultant or project on a line refused;
  - Transactions and Payables return exactly what they did before (regression).
- **End-to-end (Playwright, Demo Consulting data):** a Manager enters a bill with a line for a vendor
  consultant; an Admin approves it; the P&L for that month shows the Contractor adj. and the expected
  gross; a "Not on timesheets" line shows in full against its project.

## 9. Help article (support writer to place)

> When you approve a contractor's bill, VeriTreo compares each contractor line with the approved hours
> it covers (hours × cost rate) and counts the difference as a **contractor cost adjustment** on the
> bill date, so your P&L shows exactly what the contractor charged. If hours are approved or changed
> after the bill, the adjustment updates itself; the total always matches the bill. For someone who
> doesn't fill in timesheets, choose "Not on timesheets" and the whole line is counted when you approve.

## Builder's calls (made while building, 2026-11-19)

- A line naming a consultant may name a **project only**; its client comes from the project. A client
  without a project is offered only for "Not on timesheets". So a consultant's line with no project and
  no matching hours is counted as unallocated cost (Unallocated overhead row), not against a client.
- Overlap within one bill is refused as `BILL_LINES_OVERLAP` ("Two contractor lines on this bill
  cover…"); overlap with another approved bill as `BILL_CONTRACTOR_OVERLAP`, naming that bill.
- `count_mode` is set by the line trigger from whether a consultant is named; callers can't choose
  it, and only the migration could set `legacy`.
- `vendor_bill_contractor_check` is replaced by `contractor_line_costs`, which the bill page and the
  P&L both use.

## 10. Also to update when built

- `README.md` P&L note (lines 113–118 say contractor lines never reach the P&L).
- `docs/ARCHITECTURE.md`: the new measure and `contractor_line_costs`.
- The vendor-bills design's "Contractor check" and "Reports" sections point to this design.

## Decisions for the owner

**Owner's answers, 2026-11-19 ("Approve all six"), relayed by the launch manager:** all six
recommendations below are approved as written.
1. Computed live (approach A).
2. No retroactive adjustments: existing contractor lines become `legacy`; pending bills need "Who"
   chosen before approval.
3. Overlapping contractor lines are refused.
4. "Not on timesheets" lines must name a client or project.
5. A separate "Contractor adj." column next to Labour, included in gross, hidden on screen when every
   row is zero (always in the CSV).
6. The CPA check is the owner's; no design change.

The recommendations as originally put:

1. **Adjustment computed live, not frozen at approval.** Recommended: live (approach A). Total cost
   always equals the bill. *If wrong:* a closed month's contractor adj. can move when hours for that
   bill are approved or reopened later. That is the same behaviour labour already has; freezing it
   instead would double count late hours.
2. **No retroactive adjustments for bills approved before this release.** Recommended. *If wrong:*
   pre-launch bills keep today's gaps in historic P&L (contractors without timesheets, bill
   differences missing). Little real data exists before go-live, so the gap is small; the other way
   changes past months and risks double counting.
3. **Overlapping contractor lines refused** (same consultant, overlapping period and project).
   Recommended. *If wrong:* a vendor's second bill for an already-billed period must be entered as a
   "Not on timesheets" or expense line, or the first bill voided and re-entered. Allowing overlap
   would need pooling rules and is where double counting would creep in.
4. **"Not on timesheets" lines must name a client or project.** Recommended (matches "against the
   bill's project or client"). *If wrong:* firms that buy general contractor help (an internal IT
   contractor) can't record it as overhead on a contractor line; they'd use an expense line in the
   Contractors category instead, which already works.
5. **P&L shows a separate "Contractor adj." column next to Labour**, included in gross. Recommended,
   so the true-up is visible and explainable. *If wrong:* one more column on a wide report; the
   alternative (folding it into Labour) is tidier but hides why labour no longer equals hours × rate.
6. **Ask the CPA** (already in the decision log): this is accrual cost on the bill date. If the firm
   files on cash basis, the Transactions report remains the cash view. No design change needed
   either way.
