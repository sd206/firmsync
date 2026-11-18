# Launch decisions

Decisions the owner has made on the way to go-live, newest last. Each says what was decided and why.

## 2026-11-16 — Sell FirmSync as a paid SaaS product
Self-serve sign-up with a card up front, monthly or annual billing, 30-day money-back guarantee, seat-based pricing, 5 GB storage per firm with extra storage for sale, read-only mode then data deletion 120 days after a firm stops paying. Stripe Checkout and Customer Portal. Details: `docs/superpowers/specs/2026-11-16-saas-billing-storage-design.md`.

## 2026-11-17 — What launch day means
No date yet. On launch day FirmSync has: its own custom domain, a marketing website, a landing page, and self-serve sign-up with billing. Also needed: terms and privacy pages, Stripe live mode, read-only/deletion, email sent from the domain, and a support route.

## 2026-11-17 — Separate website, app on `app.` subdomain
The website (built with a website builder) lives on the main domain; the app on `app.<domain>`. Website sign-up buttons link into the app's sign-up page, carrying the plan, campaign (`utm_*`) and partner (`ref`) values. **Why:** the owner wants to edit the site without developer releases; sign-up stays secure in the app.

## 2026-11-17 — Who we sell to
Consulting firms with fewer than 50 people that need time-to-cash essentials, not a full PSA suite.

## 2026-11-17 — How firms will find FirmSync
Start with the owner's own outreach and LinkedIn (AI-drafted, owner-approved) plus search content (comparison pages, practical articles). Add a CPA referral programme. Paid ads later, once the landing page converts.

## 2026-11-17 — Pricing
Whole-dollar list prices: platform $29/month (2 core seats, 5 GB), extra core seat $15, consultant seat $5, extra 10 GB $5; annual = 10 × monthly. A 10-person firm (2 core + 8 consultants) pays $69/month. **Why:** the old prices ($59.91 for that firm) were low against Harvest, Productive or BigTime for far less coverage; round prices suit business buyers and make per-seat maths easy.

## 2026-11-17 — Launch offer: founding prices
First 25 firms (or until a set date): $19 platform, $10 core seat, $4 consultant seat for their first 12 months ($51/month for the 10-person firm). **Why:** the money-back guarantee already removes the risk of trying, so a free trial would be redundant; founding prices reward committed firms, create honest urgency, and scale with firm size. About $216 of year-one revenue forgone per 10-person firm, against roughly $1,400 margin over three years. Manage the month-13 price step by being clear from day one and emailing 60 and 30 days ahead.

## 2026-11-17 — CPA referral programme
Partner link with a code; referred firms get a $100 credit; partners earn 20% of what the firm pays for 12 months, paid monthly by hand at first. Partner agreement with ethics disclosure needed before starting.

## 2026-11-17 — Support at launch
`support@<domain>` (shared mailbox first, helpdesk tool later); a Help menu in the app with help articles and a Contact support form that includes the firm, user, page and browser; about 15 help-centre articles on the website; a "reply within one business day" promise. AI drafts replies, the owner sends them. Live chat, status page and consent-based support access later.

## 2026-11-17 — Website in Framer
After briefly choosing a code-built site, the owner settled on Framer: the website lives in Framer on the main domain; the app on `app.`. The AI team writes page copy and article import files in `marketing/website/`; the owner builds and edits the pages in Framer. **Why:** the owner can change the site directly, without a developer.

## 2026-11-17 — AI launch team
A launch manager (the owner's main FirmSync session) owns `launch/checklist.md` and starts specialist sessions (Developer, Reviewer, Website & copy writer, Support writer) from written briefs. Weekly status every Monday in `launch/status/`. The owner approves merges, pushes, production changes, anything published or sent, purchases, accounts, legal text, prices and offers. Design: `docs/superpowers/specs/2026-11-17-launch-team-design.md`.

## 2026-11-17 — Developers commit on their own branch
Team members may commit freely on their own branch as part of work the owner has approved; pushing and merging still need the owner's yes. **Why:** the build process commits after every step, and asking each time would stall the work.

## 2026-11-17 — Live bank connections after launch
Live bank feeds (read-only, through a provider such as Stripe Financial Connections or Plaid) come after launch, not before; two-factor sign-in for admins and managers comes first. Checklist items 20 and 21. **Why:** statement file import already covers the need; a provider approval process and a security review would lengthen the path to launch; holding live bank access raises the stakes of a stolen admin password. Estimated at about 2–3 weeks of developer work plus provider onboarding.

## 2026-11-17 — Email invoices from the app before launch
Admins and managers will be able to email an issued invoice to the client from FirmSync (checklist item 22). **Why:** every competitor (FreshBooks, Zoho, Harvest, Clockify) does it, and without it firms download and attach PDFs by hand, which looks unfinished in a first demo. The other gaps from the comparison (payment details on invoices, an accounting export, reminders, retainers, online payments) are not yet decided.

## 2026-11-18 — Fewer approvals for the owner
Three changes: (1) routine local commands (tests, lint, typecheck, build, local Supabase, git status/diff/log/add/commit, new branches) are allowlisted in `.claude/settings.json`; push, merge, production database and Vercel still ask, and resetting the linked database stays blocked; (2) the launch manager may merge docs-only branches (`launch/`, `marketing/`) into local main without asking; (3) approving a feature design also approves merging the finished branch into local main when all test gates pass and the Reviewer finds nothing serious. Pushing, production changes, anything published or sent, purchases, prices, offers, legal text and designs still need the owner every time. Questions that can wait are batched. **Why:** permission prompts and one-by-one merge approvals were slowing the team without protecting anything that matters; everything allowed is local and reversible.

## 2026-11-18 — Rebrand to VeriTreo
The product will be renamed from FirmSync to VeriTreo (checklist item 23). **Why:** FINSYNC, Inc. holds a live US trademark for online business-management software, sells invoicing, payments and bills to small businesses, and reaches them through CPAs; "FirmSync" differs by one letter and overlaps on product and channel. A web and trademark-aggregator search on 2026-11-18 found no product, company or mark named VeriTreo; the nearest are VERITREE (tree-planting verification, a different field), VERITREAD (freight) and Veriato (employee monitoring). A trademark attorney's clearance check comes before the domain is bought.
