# VeriTreo positioning (draft for the owner)

Checklist item 15. The source for the website copy (item 5), comparison pages, LinkedIn and outreach. Prices and offers come from `launch/decisions.md`; features from `README.md` unless marked *(ARCHITECTURE)*.

## Brand note

- **Spelling:** VeriTreo: capital V, capital T, one word. Never "Veritreo", "VERITREO" or "Veri Treo".
- **Pronunciation:** **[PLACEHOLDER: owner to confirm, e.g. "VAIR-ee-TRAY-oh"]**
- **Domain:** `veritreo.com` (website); the app at `app.veritreo.com`; support at `support@veritreo.com`. `veritreo.app` redirects to `veritreo.com`.

## Who

**Buyer:** the owner or managing partner of a consulting firm with fewer than 50 people, often the same person who builds the invoices.

**Firm profile:** bills clients by the hour; pays consultants or contractors at a cost rate; one to three people run the money side, with spreadsheets and two or three disconnected apps.

**Trigger moments:**
- Month-end invoicing takes days of chasing timesheets and copying hours into invoices.
- The firm grows past a handful of consultants and the spreadsheet stops coping.
- Someone asks "which clients actually make us money?" and nobody can answer.
- A full PSA suite looked like too much setup for what the firm needs.

## Problem, in the buyer's words

- "The first days of every month go on building invoices."
- "I'm chasing people for timesheets on Friday afternoon."
- "I don't know if a project made money until the accountant tells me."
- "Who owes us, and how late are they?"
- "Time is in one app, invoices in another, expenses in a spreadsheet."
- "The big tools have modules we'd never use."

## Promise

**Positioning statement:** For consulting firms with fewer than 50 people, VeriTreo takes approved hours to issued invoices, recorded payments and a profit report in one place, without the setup and cost of a full PSA suite.

**Headline options:**
1. "From timesheet to paid invoice, in one place."
2. "Know what every client and project really earns."
3. "Run the money side of your firm. Skip the PSA suite."

**Elevator pitch:** VeriTreo gives small consulting firms one place for timesheets, invoices, payments and expenses, so approved hours become invoices without retyping and you can see profit by client and project. It's $29 a month plus seats ($69 for a 10-person firm), with a 30-day money-back guarantee.

## Key messages and proof

| Message | Proof |
|---|---|
| **1. Approved hours become invoices, without retyping.** | Consultants submit weekly timesheets; admins and managers approve. Approved, not-yet-invoiced hours fill the invoice as one line per consultant × project × rate. Issued hours are locked, so nothing is billed twice. Numbered invoices, PDF, three layouts. |
| **2. See the real margin on every client and project.** | Client and cost rates are frozen on approval. Profit & loss by month, quarter, client or project: revenue, labour cost, gross and net profit, margin %. CSV export. |
| **3. Know who owes you, and how late.** | Payments update invoice status automatically (partly paid, paid). Unpaid invoices aged: not yet due, 1–30, 31–60, 61–90, over 90 days. Dashboard shows outstanding and overdue totals. |
| **4. Consultants see their time, not your numbers.** | Consultants see only their own timesheet and projects: never rates, invoices, money or reports. Each firm's data is kept apart in the database, with an audit log *(ARCHITECTURE)*. |
| **5. Priced for a small firm, with no risk to try.** | Platform $29/month with 2 core seats and 5 GB; extra core seat $15; consultant seat $5; extra 10 GB $5. Annual = 10 × monthly. 30-day money-back guarantee. Replies to support within one business day. Founding prices for the first 25 firms: $19 platform, $10 core seat, $4 consultant seat for 12 months ($51/month for the 10-person firm). |

Supporting features (built, but not yet in `README.md`, so not headline claims until confirmed): vendor bills with approval, a bill inbox email address *(README)*, bank statement import (OFX, QFX, CSV) with matching *(ARCHITECTURE)*, receivables and payables reports *(code)*.

## What we are not

- **Not a full PSA suite.** No resource scheduling, capacity planning, CRM or proposals.
- **Not accounting software.** No general ledger, tax filing or payroll. Your accountant keeps the books.
- **Not a payment processor.** Clients pay you as they do now; you record the payment.
- **No accounting-software sync today.** Bank statements are imported as files, not live feeds.

## Objections and answers

- **"We use Harvest and QuickBooks."** VeriTreo puts time, invoices, payments, expenses and profit in one place, with no copying between apps. It doesn't replace your books.
- **"BigTime or Productive do more."** They do. If you need scheduling and resource planning, they fit. If you need time-to-cash, VeriTreo is less to set up and pay for.
- **"Why no free trial?"** Use it for real: if it isn't right within 30 days, you get your money back.
- **"Will the price jump?"** Founding prices last 12 months, then list prices. We'll say so at sign-up and email you 60 and 30 days ahead.
- **"What if we stop paying?"** The firm goes read-only; data is deleted 120 days later.
- **"Who helps when we're stuck?"** Help articles in the app, and a reply within one business day.

## Words to use and avoid

**Use:** time-to-cash, approved hours, invoice, paid, who owes you, margin by client and project, firm, consultants, plain prices.

**Avoid:** all-in-one, seamless, revolutionary, AI-powered, ERP, resource management, "get paid faster" (unproven), free trial, accounting software, "integrates with", bank feeds, unlimited.

## Proof gaps (for the owner)

- Customer quotes, firm logos or a named case study (none yet).
- Numbers: time saved at month-end, firms using VeriTreo.
- Founding-offer end date (decisions say "or until a set date").
- A full data export when a firm leaves (today: report CSVs only).
- `README.md` sections for vendor bills, bank import and receivables/payables reports, so they can become headline claims.
- Where data is hosted (region), for a security answer.
- Screenshots from the Demo Consulting firm for each message.
