# Vendor bills and payments: design

Status: draft for review, 2026-11-15

## Purpose

Firms receive invoices ("bills") from vendors: staffing vendors who supply contractors, and
suppliers such as software, rent or professional services. FirmSync should keep each bill
with the vendor's own invoice number and PDF, get it approved, and record every payment
against that invoice number, usually by matching the money-out line from the bank statement
the firm already imports. Nobody should have to wonder "did we pay Acme's invoice #4471?"

Decisions made with the product owner:

- **Payments are recorded, not sent.** The firm pays outside FirmSync (bank transfer, check,
  card). FirmSync records the payment and links it to the bank line, with no bank credentials
  and no money movement in the app.
- **Bills are entered by hand with the vendor's PDF attached.** Reading PDFs automatically can
  come later.
- **Contractor bills are checked against approved hours, not counted twice.** Contractor time
  already reaches the P&L as labour cost (approved hours × cost rate). Contractor lines are
  compared with that figure, and only other lines (software, rent, services…) become expenses.
- **An Admin approves each bill before it can be paid.**

Out of scope: paying from inside the app, reading PDFs automatically, recurring bills,
vendor credit notes, multiple currencies, partial approval.

## Who can do what

| Action | Admin | Manager | Consultant |
|---|---|---|---|
| See bills and payments | ✓ | ✓ | — |
| Enter or edit a bill (until it is approved) | ✓ | ✓ | — |
| Approve or reject a bill | ✓ | — | — |
| Record or match a payment (approved bills only) | ✓ | ✓ | — |
| Void a bill (no payments on it) | ✓ | — | — |

As everywhere else: enforced in the database (RLS and checked functions), not only in screens.

## Data

**vendor_bills**
- `vendor_id`, `bill_number` (the vendor's invoice number, unique per vendor ignoring case)
- `bill_date`, `due_date`, optional service period (`period_start`, `period_end`)
- `notes`, `subtotal`, `tax`, `total`, `amount_paid`
- `status`: `pending_approval` → `approved` → `partly_paid` → `paid`; also `rejected` (with a
  reason; editable and resubmittable) and `void`
- `approved_by`/`approved_at`, `rejected_reason`

Totals come from the lines; the status follows the payments automatically, as for client
invoices.

**vendor_bill_lines**
- `kind`:
  - `expense`: description, amount, expense category, optional client and project
  - `contractor`: description, amount, optional consultant from that vendor
- On approval, each expense line becomes an **expense** dated on the bill date, with the vendor
  as payee and the note "Bill #<number>". So the P&L, expense lists and categories work
  unchanged.
- Contractor lines don't become expenses.

**vendor_payments**
- `bill_id`, `amount`, `paid_on`, `method`, `reference`, `notes`, remittance files
- The amount can't exceed the bill's balance due.
- **Attachments:** the existing attachments table gains two owners: `vendor_bill_id` (the
  vendor's PDF) and `vendor_payment_id` (remittance). They use the same file rules: PDF or
  image, 10 MB, with uploads going straight to storage.

**bank_lines** gain a fifth link, `vendor_payment_id`, under the same one-link rule.

## Contractor check

For a bill with contractor lines and a service period, the bill page shows:

> Expected from approved hours: **$12,600.00** (Dana Brooks 70 h × $180)
> This bill: **$12,900.00** · Difference: **+$300.00**

The expected figure is approved hours × cost rate for that vendor's consultants in the
period. A difference doesn't block anything; it is shown to the approver.

## Screens

- **Billing › Vendor bills.** List with filters: Awaiting approval, Unpaid, Overdue, Paid, All;
  and vendor and date. It shows totals for "to pay" and "overdue".
- **New bill / edit bill.** Fields: vendor, bill number, dates, optional period, and lines. Each
  line is Expense (category, client/project) or Contractor (consultant). Attach the PDF.
  Duplicate bill numbers for the same vendor are refused with a clear message.
- **Bill page.**
  - Shows: header, lines, PDF, contractor check, status, approval box (Admin: Approve, or
    Reject with a reason), and payments with their remittance files.
  - **Record payment** opens the same kind of screen as for client invoices: matching bank
    money-out lines, then a manual form.
- **Bank review (existing).** Money-out lines get a **Vendor bill payment** option. Suggestions
  are approved bills where:
  - the balance due equals the amount (exact match first),
  - the vendor's name is in the description, or
  - the bill number is in the description.
  Confirming records the payment (date and amount from the bank, method by account type,
  reference = the bank's ID) and marks the line Done. "Already entered" and "Mark as
  duplicate" also consider vendor payments.

## Reports

- **P&L (accrual):** unchanged logic. Expense lines arrive as expenses on approval, and
  contractor costs stay as labour.
- **Transactions report (cash).**
  - Vendor payments appear as money out: "Vendor payment – <vendor>, bill #<number>",
    category "Vendor bill" with the payment's notes.
  - Expenses created from bills are left out of this report, so the cash view doesn't count
    the bill twice (once as an expense and once as the payment).

## Errors and edge cases

- **Bill number already used for this vendor:** refused with the number shown.
- **Paying an unapproved, rejected or void bill:** refused ("Approve the bill first").
- **Overpayment:** refused, as for client payments.
- **Editing an approved bill:** not allowed. Reject or void it, then enter a corrected bill.
  This avoids changing expenses that are already in reports.
- **Deleting a payment:** the bill's balance and status recalculate, and a linked bank line
  returns to review.
- **Two people confirming the same bank line:** one succeeds, as today.

## Testing

- **Unit:** bill totals, status from payments, and contractor-check arithmetic.
- **Integration:**
  - access for each role (Admin approves; Manager can't approve)
  - duplicate bill numbers
  - approval creates the expenses
  - payments and overpayment
  - bank-line confirm, link and duplicate for vendor payments
  - the Transactions report has no double counting
- **End-to-end:**
  - a Manager enters a bill with a PDF
  - an Admin approves it
  - a bank statement line is matched to it, and the bill shows Paid
  - a duplicate bill number is refused
