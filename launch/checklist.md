# Go-live checklist

Everything that has to be true on launch day: VeriTreo on its own domain, with the website, the landing page, and self-serve sign-up with billing. The launch manager keeps this file current; decisions behind each item are in `launch/decisions.md`.

**Status:** Not started · Waiting on you (needs the owner before work can start) · In progress · Done
**Owner:** the role doing the work, or **You** (the owner).

## Product

1. Part 2 — sign-up and Stripe billing — Owner: Developer · Depends: — · Status: Waiting on you
   Founding prices, $100 referral credit, partner codes and Platform › Partners, sign-up safeguards. Needs: you create a Stripe account (test mode first).
2. Part 3 — read-only mode and data deletion — Owner: Developer · Depends: 1 · Status: Not started
   Also: `invoice_email_start` must refuse firms that aren't paying or are read-only (left for this item by item 22).
3. In-app Help menu and Contact support form — Owner: Developer · Depends: — · Status: Not started
   Help-centre link; the form emails `support@` with firm, user, page and browser.
4. Custom-domain readiness — Owner: Developer · Depends: — · Status: Done
   App works on `app.<domain>`; sign-in redirect URLs, email links and `NEXT_PUBLIC_SITE_URL` switch by configuration.
22. Email invoices from the app — Owner: Developer · Depends: — (sending from the real domain needs 11) · Status: Done
   Built and merged into local main 2026-11-18 (all gates green, Reviewer's Important finding fixed). Live in production since 2026-11-18 (migration 049 applied, pushed). Sending works now from one of your existing domains, verified in Resend, as a stopgap; switch `INVOICE_EMAIL_FROM` (and `NOTIFY_FROM`) to the product's own domain under item 11.

23. Rebrand FirmSync to VeriTreo — Owner: Developer + Website & copy writer + You · Depends: — · Status: Waiting on you
   App, docs, marketing, charter and launch files renamed and merged locally (2026-11-18). Left for you: trademark attorney's clearance check (domains `veritreo.com` and `veritreo.app` already owned); the Supabase auth email subjects and templates, the Vercel project, Resend sender and Supabase project name change with the domain switch (item 13 runbook in `docs/superpowers/specs/2026-11-18-custom-domain-design.md`).

24. Pre-launch fixes from the UI and accounting audit — Owner: Developer · Depends: 23 · Status: Done
   Bill-created expenses count the bill's PDF and show a "From bill" badge (no more false "No receipt"); Record payment opens the form in one click from Unpaid invoices; dashboard "Finish setup" hides once done; one date format everywhere, US style (Nov 16, 2026), invoice PDF included; tooltip defining "Avg days to pay"; confirm contractor bill lines are left out of the P&L on purpose. The sign-up path is item 1, the Help menu item 3.
25. UI polish pass from the audit — Owner: Developer · Depends: 24 · Status: Not started
   Dashboard quick actions, wider layout and clickable cards; status pills and tabs with counts; ageing cards as filters; invoice toolbar (PDF, Email, Void); timesheet placeholders, week navigation, today highlight, one-click Approve; drag-and-drop uploads and a copy button for the bill-inbox address; Billing menu grouped; filters on one row; consistent "Export CSV" labels; "Categorize"; P&L "hide empty months"; Transactions labelled cash only. Styling and convenience only.

26. Test site on `test.veritreo.com` — Owner: You + Launch manager · Depends: 4, 10 · Status: Waiting on you
   Today's Vercel project and `consult-flow` (renamed `veritreo-test`) become Test: add `test.veritreo.com`, Supabase auth URLs and VeriTreo templates, `NEXT_PUBLIC_SITE_URL`, its own Resend sender. Fictional data only.
27. "TEST SITE" bar on the Test app — Owner: Developer · Depends: — · Status: Done
   Built and merged locally 2026-11-19. Turn it on by setting `NEXT_PUBLIC_APP_ENV=test` on the Test Vercel project (then redeploy); leave it unset on Prod.

28. Contractor bill true-up in the P&L — Owner: Developer · Depends: 24 · Status: In progress
   Contractor cost stays counted when time is approved (hours × cost rate). When a contractor's bill is approved, any difference from the approved hours' cost is counted as a "contractor cost adjustment" on the bill date, against its project or client; bill lines for contractors without timesheets count in full on approval. Design for your approval first; Reviewer pass required (P&L).

29. Consultant pay rate and "My hours and pay" — Owner: Developer · Depends: 28 · Status: Not started
   Pay rate (today's cost rate, renamed) and Paid through (Payroll or Their employer) on each consultant; a consultant page with approved hours by period and status, plus own pay rate and gross amount for payroll consultants. No pay-run export or payroll processing. Design for your approval first; Reviewer pass required (money, permissions).

## Website

5. Site map and page-by-page copy — Owner: Website & copy writer · Depends: — · Status: Done
   In `marketing/website/`: home/landing, features, pricing, about, contact, help-centre index; sign-up and log-in links with plan, `utm_*` and `ref`.
6. Build the site in Framer from the copy — Owner: You · Depends: 5 · Status: Waiting on you
   Framer plan with a custom domain; brand colours and logo shared with the app.
7. Terms and privacy pages — Owner: Website & copy writer + You · Depends: 14 · Status: Not started
   Placeholders until the lawyer-reviewed wording exists.
8. Comparison pages (vs. BigTime; vs. Harvest + QuickBooks) — Owner: Website & copy writer · Depends: — · Status: Not started
   Starts with a check of competitors' current prices.
9. About 15 help-centre articles as a Framer import file — Owner: Support writer · Depends: 3 · Status: Not started
   You import them into Framer's CMS.

## Accounts and setup

10. Domain: point `veritreo.com` at Framer and `app.veritreo.com` at the app — Owner: You · Depends: — · Status: Waiting on you
    Bought: `veritreo.com` (main) and `veritreo.app` (redirects to `.com`). The launch manager gives step-by-step DNS instructions; the website part waits on item 6.
11. Email on the domain — Owner: You · Depends: 10 · Status: Waiting on you
    `support@` mailbox (e.g. Google Workspace); sending domain verified in Resend (SPF/DKIM); Supabase SMTP; `NOTIFY_FROM`; move `INVOICE_EMAIL_FROM` off the temporary domain (item 22).
12. Stripe account, Stripe Tax decision, live mode at launch — Owner: You · Depends: — · Status: Waiting on you
13. Prod site on `app.veritreo.com` — Owner: You + Launch manager · Depends: 4, 10, 12, 26 · Status: Not started
    New Vercel project (Pro; deploys from `release`) and new Supabase project `veritreo-prod` (Pro): all migrations applied (dry run, then your yes), auth URLs, templates and SMTP, platform-owner login, live keys, Resend sender and bill inbox, `app.veritreo.com`. Runbook: `docs/superpowers/specs/2026-11-18-custom-domain-design.md` plus the launch manager's step-by-step guide.
14. Terms of service, privacy policy, CPA partner agreement — Owner: You (lawyer) · Depends: — · Status: Waiting on you
    The writer can prepare first drafts for the lawyer.

## Marketing

15. Positioning one-pager (who, problem, promise, proof) — Owner: Website & copy writer · Depends: — · Status: Done
16. LinkedIn plan, first 8 posts, outreach templates — Owner: Website & copy writer · Depends: 15 · Status: Not started
17. CPA partner kit (one-pager, referral link instructions, client email) — Owner: Website & copy writer · Depends: 15 · Status: Not started
18. Launch announcement (email and LinkedIn) — Owner: Website & copy writer · Depends: 15 · Status: Not started

## Go-live

19. Go-live runbook and launch-day test — Owner: Launch manager + You · Depends: 1–18 · Status: Not started
    Order of switches, checks and rollback; a real-card test sign-up, then a refund.

## After launch

Not needed for launch day; started once VeriTreo is live.

20. Two-factor sign-in for admins and managers — Owner: Developer · Depends: 19 · Status: Not started
    Prerequisite for live bank connections. Reviewer pass required (sign-in).
21. Live bank connections — Owner: Developer + You · Depends: 12, 20 · Status: Not started
    Read-only transaction feed into the existing bank lines and review screen, alongside file import. Evaluate Stripe Financial Connections first (Plaid as the alternative). You: provider account, production approval and security questionnaire. Developer: link flow, encrypted token storage, sync, duplicate handling, reconnect, disconnect and revoke on cancellation or deletion. Privacy policy must name the provider (item 14). Reviewer pass required.
