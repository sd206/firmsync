# Contractor bill true-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a contractor bill is approved, the P&L's contractor cost for the work it covers equals the bill: approved hours × cost rate as labour, plus a live "Contractor adj." for the difference.

**Architecture:** One migration adds `vendor_bill_lines.count_mode` (`trueup` / `full` / `legacy`), lets contractor lines name a consultant and a project or client, and adds `contractor_line_costs()`, which computes each approved line's expected cost and adjustment live from approved hours. `pnl_facts` emits it as measure `contractor_adjustment`; `pnl_report` and `pnl_breakdown` gain a `contractor_adj` column included in gross. The bill form gets a "Who" choice and the bill page shows the per-line true-up from the same function.

**Tech Stack:** Postgres (Supabase migrations, plpgsql), Next.js 15 server components and actions, zod, Vitest (unit + integration on local Supabase), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-contractor-trueup-design.md` (approved 2026-11-19, all six recommendations).

## Global Constraints

- Money exact: `numeric` in SQL; labour precision is up to 4 decimals and adjustments use the same exact products; split shares round to 4 decimals with the remainder on the largest share.
- Security-definer functions use `set search_path = ''`, check `has_role(firm, '{admin,manager}')`, revoke from `public, anon`, grant to `authenticated`.
- Adjustment counts only for bills in `approved`, `partly_paid`, `paid`; dated on `bill_date`.
- `legacy` lines never count and block approval; existing contractor rows become `legacy`; past P&L unchanged.
- Overlap = same consultant, overlapping bill periods, and project scope overlapping (either line has no project, or same project), between `trueup` lines on the same bill or on approved/partly_paid/paid bills.
- "Not on timesheets" (`full`) lines must name a client or project; `trueup` lines may name a project only (client derived) — my call: client-only scope is not offered for a named consultant.
- P&L column header "Contractor adj.", right after Labour; page hides it when every row is 0.00; CSV always has it ("Contractor cost adjustment" header after "Labour cost").
- No push, merge or PR; nothing applied to hosted databases; don't touch `CLAUDE.md`, `.claude/`, `launch/`, `marketing/`.
- Only one e2e run at a time: check port 3000 is free before `npm run test:e2e`.

## Review Focus

1. A bill whose contractor line names a consultant with hours on two projects at different cost rates over a rate change: shares must add up exactly to the line's adjustment (test in Task 1: multi-project split with uneven weights).
2. Two admins approving overlapping bills at once must not both succeed (Task 1: concurrent approval test, one gets `BILL_CONTRACTOR_OVERLAP`).
3. A manager inserting contractor lines straight into `vendor_bill_lines` (RLS allows it) must not bypass the rules: count_mode is derived by trigger, `legacy` can't be set by a client, approval re-checks period, vendor and overlap (Task 1: direct-insert test).
4. Unallocated adjustments (no client, no project) must not vanish from client/project grouping: they appear in the Unallocated overhead row's Contractor adj. (Task 2 test).
5. Editing a pending legacy bill in the form must show "Who" empty and refuse to save until chosen (Task 3 schema test + Task 4 e2e).

---

### Task 1: Migration — lines, rules and `contractor_line_costs`

**Files:**
- Create: `supabase/migrations/20261119000051_contractor_trueup.sql`
- Modify: `tests/integration/vendor-bill-fixtures.ts` (contractor lines with no consultant/client/project get a per-firm fixture client, so existing bank/payables/inbox tests keep working)
- Modify: `tests/integration/vendor-bill-functions.test.ts`, `tests/integration/vendor-bills-schema.test.ts` (direct calls that save target-less contractor lines)
- Create: `tests/integration/contractor-trueup.test.ts`

**Interfaces — Produces:**
- `vendor_bill_lines.count_mode text` (`'trueup' | 'full' | 'legacy' | null` for expense lines).
- Trigger `vendor_bill_lines_guard` (replaced): on INSERT, and on UPDATE when not internal, sets `count_mode` = `trueup` if `consultant_id` not null else `full` for contractor lines, null for expense lines; for contractor lines with a project, sets `client_id` from the project.
- Constraint `vendor_bill_lines_contractor_chk` (replaced): contractor ⇒ category null and count_mode not null; trueup ⇒ consultant not null; full ⇒ consultant null and num_nonnulls(client_id, project_id) ≥ 1. New `vendor_bill_lines_mode_chk`: expense ⇒ count_mode null.
- `save_vendor_bill(...)` same signature; new errors `BILL_PERIOD_REQUIRED`, `BILL_CONTRACTOR_TARGET`, `BILL_CONTRACTOR_OVERLAP`.
- `approve_vendor_bill(p_bill uuid)` same signature; new errors `BILL_CONTRACTOR_LEGACY`, `BILL_PERIOD_REQUIRED`, `BILL_CONSULTANT`, `BILL_CONTRACTOR_OVERLAP` (details = the other bill's number). Locks named consultants' rows `for update` in id order before the overlap check.
- Internal `vendor_bill_contractor_overlap(p_bill uuid, p_other_bills boolean) returns text` (conflicting bill number or null).
- `contractor_line_costs(p_firm uuid, p_from date, p_to date, p_bill uuid) returns table (line_id uuid, bill_id uuid, bill_date date, count_mode text, consultant_id uuid, client_id uuid, project_id uuid, hours numeric, expected numeric, amount numeric, adjustment numeric)` — one row per (line, project share). `p_bill` null: approved/partly_paid/paid bills with bill_date in range. `p_bill` given: that bill (dates ignored, nothing for void), role-checked on its firm.
- `vendor_bill_contractor_check` dropped (replaced by the above).

- [ ] **Step 1: Write failing integration tests** in `contractor-trueup.test.ts` (a vendor consultant via `seedApprovedHours` + `beforeApprove` setting `type: 'vendor', vendor_id`), calling `contractor_line_costs(firm, from, to, null)` and summing `adjustment`:
  - worked example: 10 h × $80, line $1,100 (consultant, Nov period) → expected 800, adjustment 300; pending bill → no rows; after approve → one row.
  - lower bill $700 → −100; void → no rows.
  - late approval: 6 h approved, approve bill → +620; approve another week's 4 h → +300.
  - reopen → +1100; re-approve after cost rate change to 85 → +250.
  - multi-project (50 h Website + 20 h Audit at 180, line 12,900, no project) → Audit 85.7143, Website 214.2857, sum 300; uneven rates add up exactly.
  - per-project line → only that project's hours.
  - `full` line with project → whole amount against project/client; `full` with neither → `BILL_CONTRACTOR_TARGET` on save.
  - trueup without period → `BILL_PERIOD_REQUIRED` on save.
  - overlap: same consultant/period/all-projects on two bills → second approve `BILL_CONTRACTOR_OVERLAP` with first number in details; non-overlapping halves both approve; two lines for different projects on one bill fine; same bill all-projects + project line → save refused; concurrent approvals of two overlapping bills → exactly one succeeds.
  - legacy: an existing-style row (set via admin + internal flag) on an approved bill gives no rows; on a pending bill approval fails `BILL_CONTRACTOR_LEGACY`.
  - direct insert by manager of a contractor line with `count_mode: 'legacy'` and a consultant → stored as `trueup`.
  - consultant role: `contractor_line_costs` → 42501.
- [ ] **Step 2:** Run `npx supabase db reset` then `npx vitest run --project integration tests/integration/contractor-trueup.test.ts` — expect failures (function missing).
- [ ] **Step 3: Write the migration.** Existing contractor rows: `update ... set count_mode = 'legacy'` with `app.vendor_bill_internal` on, before adding the constraints. Allocation algorithm for a trueup line with matching hours: weight per project = expected cost (hours if the line's total expected is 0); `share_p = round(D × w_p / W, 4)` except the largest weight (ties by project id) gets `D − Σ others`; `expected_p` as computed; `adjustment_p = share_p`. No matching hours → one row with the line's project/client, expected 0, adjustment = amount.
- [ ] **Step 4:** Update fixtures and the existing tests listed above; replace the old contractor-check test with an equivalent `contractor_line_costs` assertion.
- [ ] **Step 5:** `npx supabase db reset` and `npm run test:int` — all pass.
- [ ] **Step 6:** Commit `feat(db): contractor bill lines name who, true-up costs computed live`.

### Task 2: P&L — measure, report and breakdown columns

**Files:**
- Modify: `supabase/migrations/20261119000051_contractor_trueup.sql` (same migration: `pnl_facts` replaced; `pnl_report` and `pnl_breakdown` dropped and re-created with `contractor_adj text` after `labour`; grants)
- Modify: `src/modules/reports/pnl.ts` (`PnlRow.contractorAdj: string`, mapped from `contractor_adj`)
- Modify: `src/modules/reports/pnl-csv.ts`, `src/modules/reports/pnl-csv.test.ts`
- Modify: `src/app/f/[firmId]/reports/pnl/page.tsx`
- Modify: `src/lib/supabase/types.ts` (regenerate with `npm run db:types`)
- Test: `tests/integration/pnl.test.ts` (new describe block)

**Interfaces — Consumes:** `contractor_line_costs` from Task 1. **Produces:** `pnl_report(...)` and `pnl_breakdown(...)` rows gain `contractor_adj`; gross = revenue − labour − contractor_adj; net and margin follow; unallocated adjustments (client null) go to the overhead row under client/project grouping.

- [ ] **Step 1: Failing tests** in `pnl.test.ts`: worked example by month (Nov row labour 800.00, contractor_adj 300.00, gross = revenue − 1100.00); by client and by project (adjustment on the project row); breakdown by month split project carries it; an unallocated adjustment (trueup line, no project, hours later reopened) sits in the overhead row `contractor_adj`; total row foots. Unit: CSV header has "Contractor cost adjustment" after "Labour cost" and the value in the right column.
- [ ] **Step 2:** Run them — fail.
- [ ] **Step 3:** Implement the SQL and TS. Page: `showAdj = rows.some(r => Number(r.contractorAdj) !== 0)`; when true a "Contractor adj." column after Labour cost; footnote sentence "Contractor adj. is the difference between approved contractor bills and their approved hours at cost, counted on the bill date." shown only with the column.
- [ ] **Step 4:** Reset DB, `npm run db:types`, run unit + integration — pass.
- [ ] **Step 5:** Commit `feat(pnl): contractor cost adjustment column`.

### Task 3: Bill form, bill page and errors

**Files:**
- Modify: `src/modules/vendor-bills/schemas.ts`, `schemas.test.ts`
- Modify: `src/modules/vendor-bills/data.ts` (lines carry `consultantId`, `consultantName`, `countMode`; `contractorCheck` replaced by `contractorCosts`; new `listVendorConsultants`)
- Modify: `src/app/f/[firmId]/vendor-bills/bill-form.tsx`, `form-options.ts`, `new/page.tsx`, `[id]/edit/page.tsx`, `[id]/page.tsx`
- Modify: `src/lib/db-errors.ts` (+ `db-errors.test.ts`)

**Interfaces:**
- `ContractorLine = { kind: 'contractor'; description; amount; consultant_id: string | null; client_id: string | null; project_id: string | null }`.
- Form JSON for contractor lines: `{ kind, description, amount, who, clientId, projectId }` where `who` is a consultant uuid, `'none'`, or `''`.
- `listVendorConsultants(db, firmId): Promise<Result<{ id: string; name: string; vendorId: string }[]>>`.
- `BillDetail.contractorCosts: { lineId; description; who: string /* consultant name or 'Not on timesheets' or 'Not chosen' */; mode: 'trueup'|'full'|'legacy'; hours: string; expected: string; amount: string; adjustment: string; parts: { clientName: string|null; projectName: string|null; adjustment: string }[] }[]` (empty array when the bill has no contractor lines).

- [ ] **Step 1: Failing unit tests** (`schemas.test.ts`): contractor line without `who` → "Line 1: Choose who this line is for."; `who: 'none'` without client/project → "Line 1: Choose a client or project for someone not on timesheets."; consultant line with no period → periodStart issue "Enter the service period: contractor lines are matched to approved hours in it."; valid consultant line maps to `consultant_id`, ignores clientId, keeps projectId. `db-errors.test.ts`: `BILL_CONTRACTOR_OVERLAP` with details `B-7` → "A contractor line overlaps bill B-7 for the same consultant, period and project."; `BILL_CONTRACTOR_LEGACY`, `BILL_PERIOD_REQUIRED`, `BILL_CONTRACTOR_TARGET` messages.
- [ ] **Step 2:** Run unit tests — fail.
- [ ] **Step 3:** Implement schema, error messages, data loading, form (vendor select becomes controlled; "Who" select lists the chosen vendor's consultants plus "Not on timesheets"; consultant → project select "All their projects" + projects; none → client + project selects), bill page section "Contractor cost true-up" per line with the copy in design §2.
- [ ] **Step 4:** `npm run test:unit`, `npm run typecheck`, `npm run lint` — pass.
- [ ] **Step 5:** Commit `feat(bills): choose who each contractor line is for; true-up on the bill page`.

### Task 4: End-to-end and docs

**Files:**
- Create: `tests/e2e/contractor-trueup.spec.ts`
- Modify: `README.md` (P&L contractor note), `docs/ARCHITECTURE.md` (measure + function), `docs/superpowers/specs/2026-11-15-vendor-bills-design.md` (pointer to the new design)

- [ ] **Step 1:** E2E (Demo-style fictional data): seed a vendor consultant with 10 approved hours at $80 in a past month; a Manager enters a bill in the UI choosing the consultant, period, $1,100; an Admin approves; the bill page shows "+$300.00"; the P&L for that month shows the Contractor adj. column with $300.00. Second test: a "Not on timesheets" line against a project shows counted in full.
- [ ] **Step 2:** Check port 3000 is free, run `npx playwright test tests/e2e/contractor-trueup.spec.ts` — pass.
- [ ] **Step 3:** Docs updated; commit `test(e2e): contractor true-up; docs`.

### Task 5: Review and gates

- [ ] One fresh whole-branch review (reviewer agent) against the design; fix Critical and Important findings with tests.
- [ ] On the final head: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e` (port 3000 checked first); read each output.
