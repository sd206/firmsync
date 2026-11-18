# Pricing page

**Path:** `/pricing`
**Purpose:** show exactly what a firm pays, make the per-seat maths easy, present the founding offer honestly (who gets it, for how long, what happens after), and remove the risk with the 30-day money-back guarantee. Every figure here comes from `launch/decisions.md` (Pricing; Launch offer: founding prices) and the billing design (`docs/superpowers/specs/2026-11-16-saas-billing-storage-design.md` §3, §7).

**SEO title (52 chars):** VeriTreo pricing: $29/month plus seats, plain prices
**Meta description (148 chars):** $29/month with 2 core seats and 5 GB, $15 per extra core seat, $5 per consultant. Annual: 2 months free. 30-day money-back guarantee. Prices in USD.

**Owner decision:** this draft leads with **list prices** and shows the founding price on each line as an offer for the first 25 firms. The alternative is to lead with founding prices while the offer is open. See the report.

---

## 1. Page header

**Headline:** Plain prices for small firms.

**Body:** One platform fee for your firm, then a price per person. No tiers, no modules to add, no setup fee. Every feature is included.

**Monthly / Annual toggle** (default: Monthly). Label on Annual: "2 months free".
- When Monthly is selected, every sign-up button on this page links to `https://app.veritreo.com/signup?plan=monthly`
- When Annual is selected, every sign-up button links to `https://app.veritreo.com/signup?plan=annual`

*(If Framer can't switch the button link with the toggle, show two buttons instead: "Start monthly" and "Start annual".)*

---

## 2. Price card `#prices`

**Card title:** VeriTreo

**Big price:** $29 /month · *(Annual: $290 /year)*

**Card intro:** Platform fee for your firm. Includes 2 core seats and 5 GB of storage.

**Price lines:**

| | Monthly | Annual | Founding price, first 12 months |
|---|---|---|---|
| Platform fee (includes 2 core seats and 5 GB) | $29 /month | $290 /year | $19 /month · $190 /year |
| Each extra core seat (admin or manager) | $15 /month | $150 /year | $10 /month · $100 /year |
| Each consultant seat | $5 /month | $50 /year | $4 /month · $40 /year |
| Each extra 10 GB of storage | $5 /month | $50 /year | $5 /month · $50 /year |

*(In Framer: show the Monthly or Annual column according to the toggle. Show the Founding column only while the offer is open.)*

**Included, every plan (checklist on the card):**
- Weekly timesheets and approvals
- Invoices from approved hours, with PDF and your numbering
- Payments, unpaid invoices and ageing
- Expenses with receipts
- Profit & loss by month, quarter, client or project, with CSV export
- Bill inbox for vendor bills
- Help centre and email support, reply within one business day

**Button:** **Start now** (primary) → `https://app.veritreo.com/signup?plan=monthly` *(or `?plan=annual` when the toggle is on Annual)*

**Small print under the button:** Card required. 30-day money-back guarantee. Prices in US dollars.

**Image:** none.

---

## 3. What's a seat? `#seats`

**Headline:** Who counts as a seat.

**Body:**
- **Core seats** are admins and managers: the people who approve time, build invoices and record payments. Two are included in the platform fee.
- **Consultant seats** are your active consultants, whether or not they log in. If an admin or manager also logs their own time, their core seat covers it.
- Mark a consultant inactive and their seat stops.
- When you add or remove people, your bill follows automatically and the change is prorated.

---

## 4. Worked example `#example`

**Headline:** A 10-person firm pays $69 a month.

**Body:** 2 core seats and 8 consultants:

| | Monthly | Annual |
|---|---|---|
| Platform fee (includes 2 core seats) | $29 | $290 |
| 8 consultant seats × $5 | $40 | $400 |
| **Total** | **$69 /month** | **$690 /year** |

**Founding price for the same firm** *(show while the offer is open)*: $19 + 8 × $4 = **$51 /month** ($510 /year) for the first 12 months.

**Optional calculator** *(owner's choice in Framer)*: inputs "Admins and managers" (default 2) and "Consultants" (default 8). Monthly total = $29 + $15 × (admins and managers − 2, minimum 0) + $5 × consultants. Annual = monthly × 10. Founding monthly = $19 + $10 × (extra core seats) + $4 × consultants.

---

## 5. Founding prices `#founding`

*(Show this section only while the offer is open. Remove it, and the Founding column, when the 25 places are taken or the end date passes.)*

**Headline:** Founding prices for our first 25 firms.

**Body:** The first 25 firms to sign up pay founding prices for their first 12 months: $19 a month for the platform, $10 for each extra core seat and $4 for each consultant. Storage stays at $5 per 10 GB. Founding prices are applied automatically when you sign up while the offer is open.

After 12 months your firm moves to list prices. We'll show the date in your billing settings and email you 60 days and 30 days before it changes.

**Offer end:** Open to the first 25 firms or until **[OWNER: END DATE, or delete this phrase if there's no date]**, whichever comes first.

**Button:** **Claim a founding price** (primary) → `https://app.veritreo.com/signup?plan=monthly`

**Campaign version:** for the founding-offer push, share `https://veritreo.com/pricing?utm_source=linkedin&utm_medium=social&utm_campaign=founding#founding`, or link straight to sign-up: `https://app.veritreo.com/signup?plan=monthly&utm_source=linkedin&utm_medium=social&utm_campaign=founding`.

---

## 6. Annual billing

**Headline:** Pay annually, get 2 months free.

**Body:** Annual billing costs 10 times the monthly price. Every price on your plan, including seats and storage, follows the same interval. You can switch between monthly and annual from your billing settings.

**Button:** **Start annual** → `https://app.veritreo.com/signup?plan=annual`

---

## 7. Storage

**Headline:** 5 GB included. More when you need it.

**Body:** Your platform fee includes 5 GB for receipts, payment files, vendor bills and invoice PDFs. You'll see a notice at 80% and a banner at 95%. Add storage in 10 GB blocks for $5 a month ($50 a year) each, or free up space from the Storage page.

---

## 8. Money-back guarantee

**Headline:** 30-day money-back guarantee.

**Body:** Use VeriTreo for real, with your own team and clients. If it isn't right for you, cancel within 30 days of your first payment and you get everything you've paid back, in full. Cancelling in your billing settings refunds you automatically.

**Small print:** One guarantee per firm. Cancelling under the guarantee ends access straight away and your firm becomes read-only.

---

## 9. Pricing FAQ

**Is there a free trial?**
No. Instead there's a 30-day money-back guarantee: sign up, use VeriTreo on real work, and if it isn't right, cancel within 30 days for a full refund.

**Do I need a card to sign up?**
Yes. You pay when you sign up, and your firm is created once the payment goes through. Card payments are handled by Stripe; VeriTreo never sees your card details.

**What happens when we add or remove people?**
Your bill follows your seats automatically. Adding or removing a seat partway through a billing period is prorated.

**What happens after the founding 12 months?**
Your firm moves to list prices. We'll tell you the date at sign-up, show it in your billing settings, and email you 60 and 30 days before.

**Can we switch between monthly and annual?**
Yes, from your billing settings.

**What happens if we cancel after 30 days?**
Your plan stops renewing. You keep full access until the end of the period you've paid for, then your firm becomes read-only: everyone can still sign in, view and download everything. Changed your mind before the period ends? You can undo the cancellation.

**What happens to our data if we stop paying?**
Your firm becomes read-only. We keep your data for 120 days after that, and email your admins 30 days and 7 days before it's deleted. Resubscribe any time before then and you're back to full access.

**What currency are prices in?**
US dollars.
*(Owner: add a sentence on sales tax here once you've decided whether to turn on Stripe Tax.)*

**Are there discounts or coupon codes?**
No. The prices on this page are the prices. *(Owner: if the CPA referral programme is live, replace with: "If your accountant referred you, sign up through their link and your firm gets a $100 credit.")*

**Still have a question?**
Email [support@veritreo.com](mailto:support@veritreo.com). We reply within one business day.

---

## 10. Final call to action

**Headline:** Start with your next month-end.

**Buttons:**
- **Start monthly** (primary) → `https://app.veritreo.com/signup?plan=monthly`
- Start annual, 2 months free (secondary) → `https://app.veritreo.com/signup?plan=annual`

**Small print:** 30-day money-back guarantee. Already have an account? [Log in](https://app.veritreo.com/login)

---

## Placeholders and notes for the owner

- **[END DATE]** for the founding offer (section 5), or delete the phrase.
- Sales tax sentence (FAQ), once Stripe Tax is decided.
- CPA referral line (FAQ): only once the partner agreement exists and the programme is live. Partner links take the form `https://app.veritreo.com/signup?plan=monthly&ref=<code>`; they belong in partner material, not on this page.
- The app's sign-up page shows the actual price from Stripe before payment; this page is copy. If prices ever change, update both.
