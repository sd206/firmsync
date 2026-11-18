# Features page

**Path:** `/features`
**Purpose:** for a visitor who likes the home page and wants to check the detail: does VeriTreo handle the way we work? Walk the time-to-cash flow in order, one section per area, plainly. Every claim here is in `README.md`; items not yet in `README.md` are held back at the end.

**SEO title (57 chars):** Features: timesheets, invoicing, payments, P&L | VeriTreo
**Meta description (157 chars):** Weekly timesheets with approval, invoices built from approved hours, payment tracking with ageing, expenses and a profit & loss report by client and project.

---

## 1. Page header

**Headline:** Everything from the timesheet to the bank.

**Body:** VeriTreo covers the money side of a consulting firm: time, approvals, invoices, payments, expenses and profit. Here's what each part does.

**Buttons:**
- **Start now** (primary) → `https://app.veritreo.com/signup?plan=monthly`
- See pricing (secondary) → `/pricing`

**Jump links (anchor menu):** Timesheets (`#timesheets`) · Invoices (`#invoices`) · Payments (`#payments`) · Expenses (`#expenses`) · Reports (`#reports`) · Bill inbox (`#bill-inbox`) · Team and access (`#team`) · Files and storage (`#storage`)

**Image:** none, or a wide screenshot of the Demo Consulting dashboard.

---

## 2. Timesheets and approvals `#timesheets`

**Headline:** Weekly timesheets, approved before they're billed.

**Body:** Consultants fill in their week and submit it. Admins and managers approve it, or reject it with a comment so the consultant knows what to fix. Managers can enter time on someone's behalf.

**Points:**
- Weeks run Monday to Sunday; time goes in for this week and past weeks, never the future
- Client and cost rates are frozen when a timesheet is approved
- An approved timesheet can be reopened while none of its hours are invoiced
- Admins and managers can log their own time too

**Image:** screenshot of the Demo Consulting timesheet approvals list with one timesheet open.

---

## 3. Invoices from approved hours `#invoices`

**Headline:** Invoices built from the hours you've already approved.

**Body:** Choose a client, a period and a template. VeriTreo gathers the approved hours not yet invoiced and groups them into one line per consultant, project and rate, using the task notes as the description. Untick anyone you want to leave out, and add manual lines for fees or rebilled costs.

**Points:**
- Classic, Modern or Compact layout, your accent colour, the columns you want, payment terms and footer text
- Optional hours detail page
- One discount per invoice (percentage or fixed amount), taken off before tax; the tax rate defaults from your settings
- Your own numbering pattern, such as `INV-{YYYY}-{SEQ:4}`; numbers never repeat or go backwards
- Issuing stores a PDF and locks the hours, so they can't be billed twice
- Void an unpaid invoice and its hours go back to be invoiced again; its number isn't reused

**Image:** two screenshots from Demo Consulting: the new-invoice screen filled from approved hours, and the finished PDF in the Modern layout.

---

## 4. Payments and unpaid invoices `#payments`

**Headline:** Know who owes you, and how late.

**Body:** Record each payment on its invoice: amount, date, method (bank transfer, check, card, cash or other) and a reference. The invoice moves to partly paid or paid by itself. Attach the remittance or a photo of the check.

**Points:**
- Unpaid invoices list: balance due per invoice, filter by client
- Ageing by days past the due date: not yet due, 1–30, 31–60, 61–90, over 90
- Outstanding and overdue totals on the dashboard
- A payment that would take an invoice past its total is refused
- Attach PDF, PNG, JPEG or HEIC files, up to 10 MB each

**Note under the section (small text):** VeriTreo records payments; it doesn't take them. Your clients pay you the way they do today.

**Image:** screenshot of the Demo Consulting unpaid invoices list with ageing.

---

## 5. Expenses `#expenses`

**Headline:** Expenses tied to the client and project they belong to.

**Body:** Record an expense, choose its category and project, and attach the receipt. The client follows the project, so expenses land in the right place in your reports.

**Points:**
- Starter categories (Travel, Software, Office, Contractors, Professional fees, Other) that you can add to, or retire when you stop using them
- Expenses without a receipt are flagged, and you can filter to just those
- Totals for whatever you've filtered: date range, category, client or project
- Receipts as PDF, PNG, JPEG or HEIC, up to 10 MB each

**Image:** screenshot of the Demo Consulting expenses list with the "No receipt" filter on.

---

## 6. Profit & loss reports `#reports`

**Headline:** See the margin on every client and project.

**Body:** Pick a date range and group by month, quarter, client or project. Each row shows revenue, labour cost, gross profit, direct expenses, overhead, net profit and margin %, plus what you invoiced and what you collected.

**Points:**
- Revenue counts approved hours on the day the work was done, at the rate frozen on approval
- Overhead shown on its own when you group by client or project, never spread by guesswork
- Filter to some clients or projects
- Export to CSV; it opens correctly in Excel

**Image:** screenshot of the Demo Consulting profit & loss report grouped by project.

---

## 7. Bill inbox for vendor bills `#bill-inbox`

**Headline:** A mailbox for your vendors' bills.

**Body:** Turn on your firm's bill inbox address and ask vendors to send bills there. Each email shows up in VeriTreo with its PDF and image files. A manager decides what happens next: create a bill, ignore it or mark it as a duplicate. Nothing turns into a bill without a person choosing to.

**Image:** screenshot of the Demo Consulting bill inbox with two fictional vendor emails.

---

## 8. Team and access `#team`

**Headline:** Your team sees what it needs. Nothing more.

**Body:** There are three roles. Admins run the firm's settings and billing. Managers approve time and handle invoices, payments and expenses. Consultants enter and submit their own time, and never see rates, invoices, payments, expenses or reports.

**Points:**
- People join by invitation from your firm
- Each firm's data is kept apart in the database
- A deleted payment stays recorded in the audit log

**Image:** screenshot of the Demo Consulting team/members page (fictional names and emails, e.g. `@demo-consulting.example`).

---

## 9. Files and storage `#storage`

**Headline:** 5 GB included, and a clear view of what's using it.

**Body:** Every firm gets 5 GB for receipts, payment files, vendor bills and invoice PDFs. You'll see a notice at 80% and a banner at 95%. The Storage page lists every file, largest or oldest first, so admins can clear out what they don't need. Need more? Add 10 GB for $5 a month.

**Points:**
- Uploaded files are checked by their content, not just their name
- Invoice PDFs are always created, even if you're over your allowance
- Downloads use short-lived links

**Image:** screenshot of the Demo Consulting Storage page with the usage bar.

---

## 10. What VeriTreo doesn't do

**Headline:** What VeriTreo isn't.

**Body (short list):**
- **Not a full PSA suite.** No resource scheduling, capacity planning, CRM or proposals.
- **Not accounting software.** No general ledger, tax filing or payroll. Your accountant keeps the books.
- **Not a payment processor.** You record payments; clients pay you as they do now.
- **No accounting-software sync today.**

**Image:** none.

---

## 11. Final call to action

**Headline:** Try it on a real month of work.

**Body:** Sign up, invite your team and bill from approved hours. If it isn't right within 30 days, you get your money back.

**Buttons:**
- **Start monthly** (primary) → `https://app.veritreo.com/signup?plan=monthly`
- Start annual (secondary) → `https://app.veritreo.com/signup?plan=annual`
- See pricing (text link) → `/pricing`

---

## Held back until confirmed in README.md

Do **not** place these until `README.md` (or the owner) confirms them; they're built but not documented (positioning proof gaps):

> **PLACEHOLDER — Bank statements.** "Import bank statements (OFX, QFX, CSV) and match them." Add as its own section once `README.md` describes it.
>
> **PLACEHOLDER — Vendor bills and approvals.** "Record vendor bills, approve them and record what you've paid." Section 7 currently covers only the bill inbox.
>
> **PLACEHOLDER — Receivables and payables reports.** Add under Reports once documented.
>
> **PLACEHOLDER — Security and hosting.** Where data is hosted (region) for a "Security" section. Owner to confirm.

## Placeholders for the owner

- Screenshots: one per section as listed, all Demo Consulting.
- Bill inbox address: the live address format depends on the email domain (item 11); the copy above avoids showing it.
