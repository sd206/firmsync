# Custom domain readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app can move to `https://app.veritreo.com` by configuration only, with guards that keep hosts out of the code.

**Architecture:** One small module, `src/lib/site-url.ts`, owns reading and checking `NEXT_PUBLIC_SITE_URL`; the storage alert uses it and falls back to plain wording. A unit test scans `src/` for hard-coded hosts. Docs describe the per-environment values; the runbook lives in the design.

**Tech Stack:** Next.js 15, TypeScript, Vitest (unit project: `src/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-custom-domain-design.md` (approved 2026-11-18, D1 (a), D2 later, D3 as proposed).

**As built:** after the branch review, `siteUrl()` (which threw) was replaced by `siteUrlOrNull()` and `authCallbackUrl()`, and the invite and sign-in-link actions return a message instead of crashing; reviewed range `1327fb0..9d28dd1`. Task 1's `siteUrl()` steps below describe the first version.

## Global Constraints

- Product name only via `PRODUCT_NAME` (`src/lib/brand.ts`), spelled `VeriTreo`.
- No migration; no change to cookies, buckets, the npm package name, or any Vercel, Supabase, Resend or DNS setting.
- Example values: `https://app.veritreo.com`, `invoices@veritreo.com`, `VeriTreo <alerts@veritreo.com>`, `VeriTreo <no-reply@veritreo.com>`, `in.veritreo.com`.
- The production check applies only when `VERCEL_ENV === 'production'`; local, test and Vercel preview stay lenient (existing tests use `http://localhost:3000` and `http://x`).

## Review Focus

1. `NEXT_PUBLIC_SITE_URL` with a trailing slash (`https://app.veritreo.com/`): accepted, slash removed (Task 1 test).
2. Value with surrounding whitespace pasted into Vercel (` https://app.veritreo.com `): trimmed, accepted (Task 1 test).
3. Production value that is not a URL at all (`app.veritreo.com`, no scheme): rejected in production (Task 1 test).
4. Storage alert when the site URL is invalid in production: the email still goes out with the fallback wording, never a broken link and never a lost email (Task 2 test).
5. Guard test must not flag the existing Resend API host or the Mailpit loopback default (Task 3 test passes on today's tree).

---

### Task 1: Site URL reading and production check (B4)

**Files:**
- Modify: `src/lib/site-url.ts`
- Test: `src/lib/site-url.test.ts` (create)

**Interfaces:**
- Produces: `siteUrlOrNull(env?: Record<string, string | undefined>): string | null` (null when unset, blank or invalid for the environment); `siteUrl(): string` (unchanged signature; throws `NEXT_PUBLIC_SITE_URL is not set` when unset, `NEXT_PUBLIC_SITE_URL must be an https:// origin with no path in production` when invalid in production).

- [ ] **Step 1: Write the failing tests** in `site-url.test.ts`:
  - `siteUrlOrNull({})` → `null`; `{ NEXT_PUBLIC_SITE_URL: '  ' }` → `null`.
  - non-production: `'http://localhost:3000/'` → `'http://localhost:3000'`; `'http://x'` → `'http://x'`.
  - production (`VERCEL_ENV: 'production'`): `'https://app.veritreo.com'`, `'https://app.veritreo.com/'`, `' https://app.veritreo.com '` → `'https://app.veritreo.com'`; `'http://app.veritreo.com'`, `'https://app.veritreo.com/app'`, `'app.veritreo.com'`, `'https://app.veritreo.com?x=1'` → `null`.
  - `siteUrl()` with `vi.stubEnv`: unset → throws `/is not set/`; production + `http://…` → throws `/https:\/\/ origin/`; production + valid → returns it.
- [ ] **Step 2:** `npx vitest run --project unit src/lib/site-url.test.ts` → FAIL (`siteUrlOrNull` not exported).
- [ ] **Step 3: Implement.** Trim, strip trailing slashes; in production parse with `new URL` and require `protocol === 'https:'`, `pathname === '/'`, empty `search` and `hash`.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5: Commit** `feat(site-url): check NEXT_PUBLIC_SITE_URL in production`.

### Task 2: Storage-alert link fallback (B1)

**Files:**
- Modify: `src/modules/storage/alerts.ts:50-60`
- Test: `src/modules/storage/alerts.test.ts`

**Interfaces:**
- Consumes: `siteUrlOrNull(env)` from Task 1.

- [ ] **Step 1: Write the failing tests:**
  - `NEXT_PUBLIC_SITE_URL: 'https://app.example.test/'` → text contains `https://app.example.test/f/${FIRM}/settings/storage` (no double slash).
  - `NEXT_PUBLIC_SITE_URL: undefined` → one email sent; text contains `Open Settings › Storage in VeriTreo to see what is using space.` and does not contain `/f/`.
  - `VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://app.example.test'` → email sent with the fallback wording.
- [ ] **Step 2:** run `src/modules/storage/alerts.test.ts` → FAIL on the fallback cases.
- [ ] **Step 3: Implement:** `const site = siteUrlOrNull(env)`; last line is `See what is using space: ${site}/f/${firmId}/settings/storage` when `site`, else `Open Settings › Storage in ${PRODUCT_NAME} to see what is using space.`
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `fix(storage): no broken link in the storage alert without a site URL`.

### Task 3: Guard against hard-coded hosts (B3)

**Files:**
- Test: `src/lib/no-hard-coded-hosts.test.ts` (create)

- [ ] **Step 1: Write the test.** Walk `src/` for `.ts`/`.tsx` files, skipping `*.test.ts` and `src/lib/supabase/types.ts`. Per file, fail on (case-insensitive) `vercel.app`, `veritreo.com`, `veritreo.app`, `firmsync`, and on any `https?://<host>` literal whose host is not in `ALLOWED_HOSTS = ['api.resend.com', '127.0.0.1', 'localhost']`. The failure message lists `file:line: match`. Also a self-check: the matcher flags `'https://firmsync.vercel.app/x'` and `'https://evil.example'` and passes `'https://api.resend.com/emails'`.
- [ ] **Step 2:** run → PASS on today's tree (it is a regression guard; the self-check proves it can fail).
- [ ] **Step 3: Commit** `test: guard against hard-coded hosts in src`.

### Task 4: Docs and env example (B2, B5)

**Files:**
- Modify: `README.md` (Bill inbox setup, Moving to your own domain, Hosted Supabase › Email and Auth settings), `.env.example`, `docs/ARCHITECTURE.md` §7 env-var paragraph, the design's section 6.

- [ ] **Step 1:** README: drop the `npx supabase config push` suggestion; say to paste the templates and subjects in the dashboard because `config.toml` holds local values (`site_url = localhost`) that must not reach production. Site URL text: `https://app.veritreo.com` after the switch, `https://firmsync.vercel.app` until then; keep both redirect pairs; point to the design's runbook. Bill inbox: webhook `<site URL>/api/inbound/resend`; own-domain example `in.veritreo.com`.
- [ ] **Step 2:** `.env.example`: comment on `NEXT_PUBLIC_SITE_URL` (production: `https://app.veritreo.com`, https origin with no path, checked when `VERCEL_ENV=production`); examples `invoices@veritreo.com`, `VeriTreo <alerts@veritreo.com>`; add commented `INBOUND_DOMAINS` example `in.veritreo.com,<id>.resend.app`.
- [ ] **Step 3:** ARCHITECTURE §7: one sentence on the production check and a link to the design runbook.
- [ ] **Step 4:** `npm run lint` passes. Commit `docs: per-environment domain settings and runbook pointer`.

### Task 5: Gates and review

- [ ] `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int`, `npm run test:e2e`, `npm run check:team`: all pass, output read.
- [ ] One fresh whole-branch review (Reviewer role) of `f61b5cf..HEAD`; fix anything blocking or important, re-run the affected gates.
