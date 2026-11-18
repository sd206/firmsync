# Custom domain readiness (`app.veritreo.com`) — design

Date: 2026-11-18 · Checklist item 4 (readiness). The switch itself is item 13 and needs item 10 (DNS) and item 11 (email on the domain).
Status: **approved by the owner on 2026-11-18 as proposed** (decisions recorded in section 6). Plan: `docs/superpowers/plans/2026-11-18-custom-domain.md`.

## Goal

The app runs on `https://app.veritreo.com` by configuration only: no code change on switch day. `firmsync.vercel.app` keeps working throughout, and every step can be undone.

## 1. What is hard-coded today (audit of `src/`, `supabase/`, `next.config.ts`, 2026-11-18)

| Place | Today | Verdict |
|---|---|---|
| `redirectTo` for invites and sign-in links sent from the server (`modules/firms`, `members`, `consultants` actions) | `${siteUrl()}/auth/callback`, from `NEXT_PUBLIC_SITE_URL` | Configuration already. The link in the email itself comes from Supabase's Site URL (next row but one). |
| Sign-in form (`app/login/login-form.tsx`) | `window.location.origin + /auth/callback` | Follows whichever host the user is on. Needs that host in Supabase's redirect allow-list. |
| `/auth/confirm`, `/auth/callback` routes | Redirect to `request.nextUrl.origin` | Host-neutral. |
| Auth email templates (`supabase/templates/*.html`) | Link to `{{ .SiteURL }}/auth/confirm?...` | Configuration (the hosted project's Site URL). Every auth email links to the Site URL, whichever host the user started on. |
| Storage-alert email link (`modules/storage/alerts.ts`) | `${NEXT_PUBLIC_SITE_URL}/f/<id>/settings/storage`; **if the variable is unset the link is a bare path** (`/f/...`) | Small fix proposed (B1). |
| Invoice-email sender | `INVOICE_EMAIL_FROM`, else address in `NOTIFY_FROM`; display name `"<firm> via VeriTreo"` from `PRODUCT_NAME` | Configuration already. |
| Storage-alert sender | `NOTIFY_FROM` | Configuration already. |
| Bill-inbox addresses | `INBOUND_DOMAINS` (first one shown to users, all accepted) | Configuration already. |
| Bill-inbox webhook | Resend posts to `https://firmsync.vercel.app/api/inbound/resend` (set in Resend's dashboard) | Configuration in Resend; the route itself is host-neutral. |
| `localhost` / `127.0.0.1` in `src/` | Only the Mailpit transport (`lib/email/send.ts`), which accepts only a loopback URL and runs only with `EMAIL_TRANSPORT=mailpit` | Development only; safe. |
| `firmsync.vercel.app`, `veritreo.com` in `src/` | None | — |
| `supabase/config.toml` | `site_url = "http://localhost:3000"` and localhost redirect URLs (local stack) | **Risk:** the README suggests `npx supabase config push` for the templates; that would also push the localhost Site URL to production. Fixed in B2. |
| `next.config.ts`, `middleware.ts` | No host settings; no `vercel.json` | — |

Not covered here: Stripe success/cancel URLs and the Stripe webhook (item 1, billing). That work should build its URLs with `siteUrlOrNull()` so it inherits this design.

## 2. What changes in code (small; built only after approval)

- **B1. Storage-alert link:** build it with a shared helper that returns the site URL or `null`; when `NEXT_PUBLIC_SITE_URL` is unset, the email says "Open Settings › Storage in VeriTreo" instead of a broken relative link.
- **B2. No accidental localhost push:** in `supabase/config.toml`, keep localhost for the local stack but stop recommending `config push` for production in the README; the runbook sets the hosted Auth values in the Supabase dashboard. (Alternative: `site_url = "env(SUPABASE_AUTH_SITE_URL)"`. Not chosen: it makes local start depend on an extra variable for little gain.)
- **B3. Guard test:** a unit test that scans `src/` (not tests) and fails on any literal `vercel.app`, `veritreo.com`, `veritreo.app`, `firmsync` or a non-loopback `http(s)://` host outside an allow-list (`lib/email/send.ts` Mailpit default, third-party API hosts such as Resend). This keeps future features from hard-coding the domain.
- **B4. Site URL check:** in production (`VERCEL_ENV=production`), `siteUrlOrNull()` accepts only an `https://` origin (no path, query, fragment or credentials) and returns the parsed origin; anything else is logged and treated as unset. The four invite and sign-in-link actions then answer "The app's address isn't set up correctly (NEXT_PUBLIC_SITE_URL), so no email was sent." before doing anything, instead of crashing; the storage alert uses B1's wording. (As built: `siteUrl()`, which threw, was replaced by `siteUrlOrNull()` and `authCallbackUrl()`, after the branch review.)
- **B5. Docs:** README "Hosted Supabase" and "Bill inbox" sections and `.env.example` describe the values per environment, using `app.veritreo.com`, `invoices@veritreo.com`, `alerts@veritreo.com`, `in.veritreo.com` as the examples.

No database migration, no change to cookies, buckets or the npm package name.

## 3. Values on switch day

| Setting | Where | Value |
|---|---|---|
| Domain | Vercel › Project › Domains | Add `app.veritreo.com` (Production). Keep `firmsync.vercel.app`. |
| DNS | Owner's DNS host | `app` CNAME → the target Vercel shows (item 10). |
| `NEXT_PUBLIC_SITE_URL` | Vercel env (Production) | `https://app.veritreo.com` (Vercel applies variable changes only to new deployments: redeploy) |
| `INVOICE_EMAIL_FROM` | Vercel env | `invoices@veritreo.com` (decision D3) |
| `NOTIFY_FROM` | Vercel env | `VeriTreo <alerts@veritreo.com>` (D3) |
| `INBOUND_DOMAINS` | Vercel env | `in.veritreo.com,<id>.resend.app` (new first; old kept so existing vendor addresses keep working) |
| Site URL | Supabase › Auth › URL configuration | `https://app.veritreo.com` |
| Redirect URLs | Supabase › Auth › URL configuration | Add `https://app.veritreo.com/auth/callback` and `/auth/confirm`; **keep** the `firmsync.vercel.app` pair |
| Email templates and subjects | Supabase › Auth › Email templates | Paste the VeriTreo versions from `supabase/templates/` and the subjects in `config.toml` |
| SMTP sender | Supabase › Auth › SMTP | `VeriTreo <no-reply@veritreo.com>` (D3), via the SMTP provider the owner already uses |
| Sending domain | Resend › Domains | Verify `veritreo.com` (Resend puts its SPF/MX on `send.veritreo.com` and DKIM on `resend._domainkey`, so the root MX stays free for `support@veritreo.com`) |
| Receiving domain | Resend › Receiving | `in.veritreo.com` (MX on that subdomain only) |
| Webhook | Resend › Webhooks | Endpoint `https://app.veritreo.com/api/inbound/resend` |

## 4. Owner's runbook (item 13)

Before: items 10 and 11 done far enough that you can add DNS records; a quiet time (users signed in on the old address must sign in again on the new one, because sign-in cookies belong to one host).

1. **Resend — sending domain.** Add `veritreo.com`, add the DNS records it lists, wait for "Verified". Nothing in the app changes yet.
2. **Resend — receiving.** Enable receiving on `in.veritreo.com`; add its MX record; wait for "Verified".
3. **Vercel — domain.** Add `app.veritreo.com` to the project, add the CNAME at the DNS host, wait for the certificate. Open `https://app.veritreo.com/login`: the sign-in page shows. Test only password sign-in here: magic links and resets still open on `firmsync.vercel.app` until step 6 (Site URL), because the email templates link from the Site URL. Do **not** set `firmsync.vercel.app` to redirect.
4. **Supabase — redirect URLs.** Add the two `app.veritreo.com` URLs. Leave the old ones.
5. **Supabase — templates and SMTP sender.** First make sure your SMTP provider can send from `veritreo.com` (if it is Resend, step 1 did this; otherwise verify the domain with that provider and add its DNS records). Note the current sender. Then update the three templates and subjects, and the sender to `VeriTreo <no-reply@veritreo.com>`, and send yourself a password reset to check it arrives.
6. **Supabase — Site URL.** Change to `https://app.veritreo.com`. From now on every invite, sign-in and reset email links to the new address.
7. **Vercel — environment variables** (Production): the four values in section 3. Note the current values first. Then **Redeploy** (Vercel applies variable changes only to new deployments).
8. **Resend — webhook.** Edit the existing endpoint's URL to `https://app.veritreo.com/api/inbound/resend` (editing keeps the signing secret; if you create a new endpoint instead, copy its new `whsec_…` into `RESEND_INBOUND_SECRET` and redeploy before deleting the old one).
9. **Smoke test** on `app.veritreo.com` with the Demo Consulting firm: sign in; request a magic link and a password reset (links open on `app.veritreo.com`); invite a test user; email an invoice to yourself (from shows `"Demo Consulting via VeriTreo" <invoices@veritreo.com>`); Settings › Bill inbox shows a `bills-…@in.veritreo.com` address; send a PDF to it and see it arrive; send one to the old `…resend.app` address too.
10. **Tell the launch manager** it's done; item 13 is marked Done and any old-address mentions in help articles are updated.

**Rollback** (undo the steps you have done, in reverse):
- Resend webhook back to `https://firmsync.vercel.app/api/inbound/resend`.
- Vercel variables: `NEXT_PUBLIC_SITE_URL`, `INVOICE_EMAIL_FROM` and `NOTIFY_FROM` back to their noted values, but set `INBOUND_DOMAINS=<id>.resend.app,in.veritreo.com` (old domain first, so users are shown the old addresses, while bills already sent to new addresses still arrive). Then redeploy. Don't rely on Vercel's Instant Rollback alone: it leaves the variables as they are and pauses automatic production deploys, so the next deploy would bring the new values back.
- Supabase Site URL back to `https://firmsync.vercel.app`.
- Supabase SMTP sender back to the noted value (needed if the reason for rolling back is that auth emails from `veritreo.com` don't send). The VeriTreo templates can stay.

The old redirect URLs, the old `resend.app` inbound domain and the `firmsync.vercel.app` host are never removed during the switch, so after these steps everything works as before. The Resend domains and the Vercel domain can stay in place while rolled back.

**Later, not on switch day:** when vendors have moved to the new bill-inbox addresses, remove `<id>.resend.app` from `INBOUND_DOMAINS` (this stops the old addresses working — owner's call). What happens to `firmsync.vercel.app` is decision D1.

## 5. Tests

- Unit: B1 (link present with a site URL, with a trailing slash, and the fallback wording without one); B3 guard test; B4 (`siteUrlOrNull()` accepts `https://app.veritreo.com` with a trailing slash or spaces, rejects `http://…`, paths, queries, fragments and credentials in production, allows `http://localhost:3000` otherwise); the guard test also checks that every link in `supabase/templates/*.html` starts with `{{ .SiteURL }}/`.
- Existing unit, integration and e2e suites run unchanged (they use `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and Mailpit).
- Switch day: the runbook's step 9 smoke test, done by the owner (it needs the real accounts and DNS). No automated test can cover DNS, certificates, Resend verification or Supabase dashboard settings.

## 6. Decisions for the owner

**Decided 2026-11-18 (owner, "Approve as proposed"):**
- **D1: option (a).** `firmsync.vercel.app` stays a second address to the live app for 1–2 weeks after the switch, then redirects to `app.veritreo.com`. No separate test site for now.
- **D2: later**, together with the D1 redirect.
- **D3: as proposed.** `invoices@veritreo.com`, `VeriTreo <alerts@veritreo.com>`, `VeriTreo <no-reply@veritreo.com>`, bill inbox on `in.veritreo.com`.

The options as they were put to the owner:

- **D1. What `firmsync.vercel.app` becomes.** The brief calls it "the test site", but today it is the production deployment on the production database (`consult-flow`); after the switch it would be a second address for the same live data, still showing the old name. Options:
  - **(a, recommended for now)** Keep it as a second address to the same production app until the webhook and links have moved and nothing breaks for a week or two, then make it redirect to `app.veritreo.com`. No real test site.
  - **(b)** A real test site: a separate Supabase project (its own database and Auth, possibly a paid project) plus a Vercel branch or second Vercel project, with its own environment variables and Resend test settings. Its address can be `firmsync.vercel.app`, or a renamed `veritreo-test.vercel.app` / `test.veritreo.com`. This is a bigger setup task and would be its own checklist item.
- **D2. Rename the Vercel project** (and so the `*.vercel.app` address)? Renaming changes that address and anything pointing at it (the webhook, Supabase redirects); best done together with D1, not on switch day.
- **D3. Sender addresses:** `invoices@veritreo.com` for invoices, `VeriTreo <alerts@veritreo.com>` for storage warnings, `VeriTreo <no-reply@veritreo.com>` for auth emails, `bills-…@in.veritreo.com` for the bill inbox. Change any you prefer before switch day.
- **Needs your accounts:** DNS host (CNAME, Resend records), Vercel (domain, variables, redeploy), Supabase (URL configuration, templates, SMTP sender), Resend (domains, receiving, webhook). The developer changes none of these.
