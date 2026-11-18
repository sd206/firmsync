# Go-live checklist

Everything that has to be true on launch day: FirmSync on its own domain, with the website, the landing page, and self-serve sign-up with billing. The launch manager keeps this file current; decisions behind each item are in `launch/decisions.md`.

**Status:** Not started · Waiting on you (needs the owner before work can start) · In progress · Done
**Owner:** the role doing the work, or **You** (the owner).

## Product

1. Part 2 — sign-up and Stripe billing — Owner: Developer · Depends: — · Status: Waiting on you
   Founding prices, $100 referral credit, partner codes and Platform › Partners, sign-up safeguards. Needs: you create a Stripe account (test mode first).
2. Part 3 — read-only mode and data deletion — Owner: Developer · Depends: 1 · Status: Not started
   Also: `invoice_email_start` must refuse firms that aren't paying or are read-only (left for this item by item 22).
3. In-app Help menu and Contact support form — Owner: Developer · Depends: — · Status: Not started
   Help-centre link; the form emails `support@` with firm, user, page and browser.
4. Custom-domain readiness — Owner: Developer · Depends: — · Status: Not started
   App works on `app.<domain>`; sign-in redirect URLs, email links and `NEXT_PUBLIC_SITE_URL` switch by configuration.
22. Email invoices from the app — Owner: Developer · Depends: — (sending from the real domain needs 11) · Status: Done
   Built and merged into local main 2026-11-18 (all gates green, Reviewer's Important finding fixed). Live in production since 2026-11-18 (migration 049 applied, pushed). Sending works now from one of your existing domains, verified in Resend, as a stopgap; switch `INVOICE_EMAIL_FROM` (and `NOTIFY_FROM`) to the product's own domain under item 11.

23. Rebrand FirmSync to VeriTreo — Owner: Developer + Website & copy writer + You · Depends: — · Status: Waiting on you
   You: trademark attorney's clearance check, then buy the domain (item 10). Developer: `PRODUCT_NAME`, README, docs, email sender name. Writer: everything in `marketing/`. Launch manager: `CLAUDE.md`, `launch/`, role files. Later, with the domain: Vercel project and URL, Resend sender, Supabase project name.

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

10. Buy the domain; point it at Framer and `app.` at the app — Owner: You · Depends: — · Status: Waiting on you
    The launch manager gives step-by-step DNS instructions.
11. Email on the domain — Owner: You · Depends: 10 · Status: Waiting on you
    `support@` mailbox (e.g. Google Workspace); sending domain verified in Resend (SPF/DKIM); Supabase SMTP; `NOTIFY_FROM`; move `INVOICE_EMAIL_FROM` off the temporary domain (item 22).
12. Stripe account, Stripe Tax decision, live mode at launch — Owner: You · Depends: — · Status: Waiting on you
13. Production environment for the custom domain — Owner: Developer + You · Depends: 4, 10, 12 · Status: Not started
    Its own Supabase project and live keys; the launch manager prepares the runbook.
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

Not needed for launch day; started once FirmSync is live.

20. Two-factor sign-in for admins and managers — Owner: Developer · Depends: 19 · Status: Not started
    Prerequisite for live bank connections. Reviewer pass required (sign-in).
21. Live bank connections — Owner: Developer + You · Depends: 12, 20 · Status: Not started
    Read-only transaction feed into the existing bank lines and review screen, alongside file import. Evaluate Stripe Financial Connections first (Plaid as the alternative). You: provider account, production approval and security questionnaire. Developer: link flow, encrypted token storage, sync, duplicate handling, reconnect, disconnect and revoke on cancellation or deletion. Privacy policy must name the provider (item 14). Reviewer pass required.
