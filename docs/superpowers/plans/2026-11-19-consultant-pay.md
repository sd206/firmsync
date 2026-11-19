# Consultant pay rate and "My hours and pay" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner chose native execution via the launch manager). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rename cost rate → pay rate in the UI, record Paid through on each approved week, and add the "My hours and pay" page (self + read-only admin/manager view).

**Architecture:** One additive migration (`20261119000052_consultant_pay.sql`) adds `timesheets.approved_vendor_id`, re-creates `approve_timesheet` / `reopen_timesheet` with one extra assignment each, and adds three `security definer` read functions. A new module `src/modules/pay/` wraps them; two pages render one shared component.

**Tech Stack:** Next.js 15, Supabase (Postgres), Vitest (unit + integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-consultant-pay-design.md` (approved 2026-11-19 with all six recommendations).

## Global Constraints

- Do not touch item 28 files: vendor-bill screens, `contractor_line_costs`, migration 051, `tests/integration/contractor-trueup.test.ts`, `trueup-fixtures.ts`.
- Migration number 052. If the item 28 follow-up branch also adds a 052, report the clash to the launch manager.
- Label for directly-paid: "Paid directly". Amount column: "Gross amount". Never the words "Paid" / "Pay" as a status.
- Footnote copy (always shown and printed): "Gross amount = approved hours × your pay rate on each day, before tax and deductions. This is not a payslip and doesn't show whether you've been paid. For payment questions, contact <firm name>."
- Vendor footnote: "Your hours are billed to <firm name> by <vendor>. Your pay comes from <vendor>."
- Functions: `language sql|plpgsql stable security definer set search_path = ''`, revoke from `public, anon`, grant to `authenticated`, `42501` on denial.
- Shared local Supabase (port 54422) is used by other worktrees: apply with `npx supabase migration up --local`, not `db reset`. Before e2e, check nothing listens on port 3000.

## Review Focus

1. A consultant passes another consultant's id → must get 42501 (Task 1 test).
2. A vendor week read by an Admin → rate and gross still null (Task 1 test).
3. Consultant switches vendor → payroll after approval → old weeks still "Billed by" (Task 1 test).
4. Week spanning two months → monthly hours split by work date (Task 1 test).
5. Login with no consultant record opens /my-pay → "not linked" message, no error (Task 3 e2e).

---

### Task 1: Migration 052 + integration tests

**Files:** Create `supabase/migrations/20261119000052_consultant_pay.sql`, `tests/integration/consultant-pay.test.ts`; regenerate `src/lib/supabase/types.ts` (`npm run db:types`).

**Produces (SQL):**
- `timesheets.approved_vendor_id uuid`, FK `(firm_id, approved_vendor_id)` → `vendors(firm_id, id)` on delete restrict (added `not valid`, then validated); check `approved_vendor_id is null or status = 'approved'`; backfill approved rows from `consultants.vendor_id`.
- `approve_timesheet`: migration 012 body + `approved_vendor_id = (consultant's vendor_id)` in the final update. `reopen_timesheet`: migration 011 body + `approved_vendor_id = null`.
- `my_consultant_id(p_firm uuid) returns uuid`.
- `consultant_pay_weeks(p_firm, p_consultant, p_from date, p_to date)` → `week_start date, status text, decision_comment text, hours numeric, pay_rates numeric[], gross numeric(12,2), employer_name text`; rows = timesheets with week_start in range.
- `consultant_pay_months(p_firm, p_consultant, p_from, p_to)` → `month date, hours numeric, gross numeric(12,2), employer_name text`; approved entries by work_date, grouped by month and approved_vendor_id.
- Access: `public.can_edit_consultant_time(p_firm, p_consultant)` else 42501. Rates/gross null unless approved and `approved_vendor_id is null`. `gross = round(sum(hours * cost_rate_snapshot), 2)`.
- `comment on column` for `hourly_cost` and `cost_rate_snapshot`: "The consultant's pay rate".

- [ ] Write tests: self read OK; other consultant id → 42501; other firm → 42501; anon denied; manager and admin OK; unapproved week → hours set, pay_rates/gross null; approve sets approved_vendor_id, reopen clears; vendor week → null amounts for admin too, employer_name = vendor name; switch Type after approval → old week unchanged; month split (week 2026-09-28 with entries on Sep 30 and Oct 1); monthly gross = `pnl_facts` labour for same month; consultant still cannot select `consultant_cost_rates` / `time_entries` / `vendors`.
- [ ] Run `npm run test:int -- consultant-pay` → FAIL.
- [ ] Write migration; `npx supabase migration up --local`; `npm run db:types`.
- [ ] Run test file → PASS; run full `npm run test:int` (true-up figures unchanged).
- [ ] Commit `feat(db): pay weeks/months functions and paid-through snapshot (item 29)`.

### Task 2: Pay module + unit tests

**Files:** Create `src/modules/pay/data.ts`, `src/modules/pay/labels.ts`, `src/modules/pay/labels.test.ts`.

**Produces:**
- `getPayWeeks(db, firmId, consultantId, year: number): Promise<Result<PayWeek[]>>`, `getPayMonths(...)`: `Result<PayMonth[]>`, `getMyConsultantId(db, firmId): Promise<Result<string|null>>`.
- `PayWeek = { weekStart; status: TimesheetStatus; comment: string|null; hours: string; payRates: string[]|null; gross: string|null; employerName: string|null }`; `PayMonth = { month; hours; gross: string|null; employerName: string|null }` (numerics cast `::text` via RPC → strings, 2 dp).
- `PAY_STATUS_LABEL`: draft "Not submitted", submitted "Waiting for approval", rejected "Returned for changes", approved "Approved". `formatPayRates(rates, currency)` → "$80.00 / $85.00". `paidThroughLabel(type, vendorName)` → "Paid directly" | vendor name. `CONSULTANT_TYPE_LABEL` with the three option texts from the spec section 2.

- [ ] Unit tests for the four helpers → FAIL → implement → PASS → commit.

### Task 3: Pages, nav, renamed labels, docs, e2e

**Files:** Create `src/app/f/[firmId]/my-pay/page.tsx`, `src/app/f/[firmId]/hours-and-pay/[consultantId]/page.tsx`, `src/components/pay/hours-and-pay.tsx` (shared server component + print button client island), `tests/e2e/consultant-pay.spec.ts`. Modify `src/app/f/[firmId]/layout.tsx` (Work → "My hours and pay", ALL roles), consultant pages/forms (spec section 1 table + Type option labels + "Paid through" line + "View hours and pay" link), `timesheets/[id]/page.tsx` ("Pay rate" column, consultant name link), `src/lib/db-errors.ts` (+ its test) COST_RATE_MISSING message, existing e2e expecting old labels (`vendors-consultants.spec.ts`, `timesheets.spec.ts`), `README.md`, `docs/ARCHITECTURE.md`.

- [ ] E2E: direct consultant approved week shows rate, gross and footnote; vendor consultant shows "Billed by <vendor>" and no currency symbol in `main`; admin opens `/hours-and-pay/<id>`; unlinked login sees not-linked message; renamed labels.
- [ ] Implement; year picker via `?year=`; print stylesheet hides nav.
- [ ] Gates: `npm run lint`, `typecheck`, `test:unit`, `test:int`, `test:e2e` (port 3000 free first), `check:team`. Commit.
