# FirmSync as a paid product — plans, billing and storage limits

Status: draft for approval · 2026-11-16

## 1. Intent

FirmSync is going to be sold as a SaaS product. Firms must be able to sign up on their own, pay by card for a plan sized by their seats and storage, and manage that themselves. Storage has to be limited per firm (5 GB included) with warnings as a firm approaches the limit, and admins need a way to find and delete old files when they hit it. Today only the platform owner can create firms, sign-up is disabled, nothing is charged and storage is unlimited and invisible.

**Success:** a firm can find FirmSync, pay, invite its team and work without the platform owner doing anything; its bill always matches its seats and storage; it knows before it runs out of space and can fix it itself.

## 2. Goals, non-goals, anti-goals

**Goals**
- Self-serve sign-up with a card up front, monthly or annual billing, 30-day money-back guarantee.
- Seat-based pricing kept in step with the firm's users and consultants automatically.
- 5 GB storage per firm, extra storage in 10 GB blocks, warnings at 80% and 95%, uploads refused at 100%.
- A Storage page where admins see what uses space and delete files.
- Read-only mode for firms that cancel or stop paying; data deleted 120 days later.
- Platform-owner tools to see each firm's billing state and grant free accounts and storage.

**Non-goals (for now)**
- Currencies other than USD; coupons and discount codes; different plan tiers or feature gating; usage-based charges other than seats and storage; FirmSync-built invoice/receipt screens (Stripe sends and hosts these); reseller or agency billing; data export as a single archive (existing CSV/PDF/file downloads are the export).

**Anti-goals (would be a failure even if it "works")**
- FirmSync ever seeing or storing card details.
- A firm's issued invoice failing to get its PDF, or a vendor's emailed bill being dropped, because the firm is at its storage limit.
- A firm being charged for seats or storage it no longer has, or silently getting seats it hasn't paid for beyond a short sync delay.
- Deleting a firm's data without the warnings promised, or before 120 days of read-only.
- Billing outages (Stripe down, a missed webhook) locking paying firms out.

## 3. Pricing (decided)

| Item | Monthly | Annual |
|---|---|---|
| Platform fee, includes 2 core seats and 5 GB | $19.99 | $199.90 (2 months free) |
| Each additional core seat | $9.99 | $99.90 |
| Each consultant seat | $4.99 | $49.90 |
| Each extra 10 GB storage | $4.99 | $49.90 |

- **Core seat:** a firm member with role admin or manager.
- **Consultant seat (decided: option B):** every **active** consultant record, whether or not it has a login — except a consultant linked to an admin/manager login, who is covered by that core seat. Consultant-role members without a consultant record (should be rare) also count as consultant seats. Marking a consultant inactive removes the seat.
- Billing interval is per firm (monthly or annual); all items follow the firm's interval.
- Mid-period changes are prorated by Stripe (charge or credit for the remaining days). *(Our call — Stripe's default.)*
- Prices are USD. Stripe Tax may be turned on by the platform owner in Stripe; FirmSync just passes the customer's address so it can work.

## 4. Approaches considered

- **A. Stripe Checkout + Customer Portal, webhooks mirrored into FirmSync (chosen).** Stripe-hosted payment and self-service pages; FirmSync keeps a subscription record per firm from webhooks and pushes seat/storage quantities to Stripe. Lowest fees (~2.9% + 30¢), clean proration and refunds. Cost: the platform owner is the seller and owns sales-tax obligations (Stripe Tax helps).
- **B. Merchant of record (Paddle / Lemon Squeezy).** They handle worldwide tax; higher fees (~5% + 50¢), less flexible seat changes and refunds, their branding. Rejected: tax simplicity didn't outweigh cost and flexibility at this stage.
- **C. Embedded payment forms (Stripe Elements).** Fully branded, but roughly triple the billing UI work and more security surface for no customer benefit. Rejected.

## 5. Environments (decided)

- Until a custom domain launches, `firmsync.vercel.app` is production but runs **Stripe test mode** (test cards only).
- When the custom domain launches it becomes production with **Stripe live keys** and its own Supabase project; `firmsync.vercel.app` becomes the test environment. Switching is configuration only (env vars and the Stripe webhook endpoint), no code changes.
- Firms that already exist when billing is switched on become **free accounts** (see §9), so nothing breaks for them.
- Billing can be turned off by config: without the Stripe env vars, sign-up is closed (as today), no limits based on subscriptions apply, and Settings › Billing says billing isn't set up — the same pattern as the Bill inbox.

## 6. Part 1 — Storage limit and file clean-up (build first)

Works without Stripe: the allowance is a number per firm the platform owner can raise by hand; Part 2 later raises it when storage blocks are bought.

**Allowance.** `5 GB + 10 GB × purchased blocks + platform-granted GB`. Stored on the firm (or its subscription record) and readable by the firm's admins and managers.

**Usage.** Everything stored under `firms/<firmId>/` in the `firm-files` bucket counts: attachments (payments, expenses, vendor bills, vendor payments, bill-inbox), invoice PDFs, logo. Computed in the database from `storage.objects` sizes. The builder may cache it (e.g. a running total updated on upload/delete) if computing on demand is too slow; the number shown may lag by a few minutes.

**Warnings.**
- ≥ 80%: notice on the dashboard for admins and managers ("You've used 4.1 GB of 5 GB").
- ≥ 95%: banner on every firm page for admins and managers; one email to each admin when crossing 95% (not repeated until usage drops below 90% and crosses again). *(Email via the existing auth SMTP is not suitable; use Resend's sending API, already in the stack.)*
- ≥ 100%: banner says uploads are paused, with "Buy more storage" (admins, once billing exists) and "Free up space" links.
- Consultants see none of this.

**At 100%.**
- Refused: user uploads of attachments (payments, expenses, vendor bills, vendor payments) and logo changes. Bank statement uploads don't store files and are unaffected. Message: "Your firm has used all of its storage. Delete old files or add storage in Settings › Billing."
- Always allowed, even if it takes the firm over: invoice PDFs (issue and regenerate), emailed bills arriving in the Bill inbox, and moving an inbox file onto a bill. Over-limit is shown as e.g. "5.2 GB of 5 GB".
- The check is done before issuing upload URLs (current usage + declared sizes ≤ allowance); a firm can't get far past the limit through the normal upload path.

**Settings › Storage page** (admins and managers can view; only admins delete).
- Usage bar and totals by type: payment files, expense receipts, vendor bill files, vendor payment files, bill inbox, invoice PDFs, logo.
- File list, largest first or oldest first, filterable by type, paged. Each row: file name, type, size, date, linked record (e.g. "Expense · Uber · 3 Mar 2026"), download.
- Admins can select files and delete them (confirmation states count and total size and that it can't be undone). Deleting uses the existing per-record rules: removes the attachment row and the stored file, audited.
- Invoice PDFs and the logo are listed but **not deletable** here (an issued invoice's PDF is part of the record; the logo is changed in Settings). Bill-inbox files are deletable only by ignoring/deleting the inbox item, which the page links to. *(Our call.)*
- Managers keep their existing ability to delete files on each record.

## 7. Part 2 — Sign-up and billing

**Sign-up (public `/signup`).**
1. Visitor enters firm name, their name and email, chooses monthly or annual, ticks acceptance of terms.
2. FirmSync creates a Stripe Checkout session (subscription mode) for the platform fee only, with the form data in session metadata. No FirmSync account exists yet — this keeps spam out because nothing is created until a card is paid.
3. On `checkout.session.completed` (webhook), FirmSync creates the firm (`create_firm_with_admin`), creates the admin's login by invitation (existing invite email → set password), stores the Stripe customer and subscription ids, and shows a "check your email" page.
4. If the email already has a FirmSync login, the new firm is added to that login instead of inviting.
5. The webhook is idempotent: Stripe's retries never create a second firm.

**Seat and storage sync.** Whenever core seats, consultant seats or storage blocks change (member added/removed/role changed, consultant added/activated/deactivated, storage block bought/removed), FirmSync recomputes the counts and updates the subscription item quantities in Stripe (prorated). A failed update is retried; a periodic reconciliation (daily) corrects any drift. Adding a user or consultant is never blocked by a Stripe outage.

**Settings › Billing (admins only).**
- Plan, interval, next charge date and amount, seat counts with prices, storage blocks.
- Add / remove 10 GB storage blocks.
- "Manage payment and invoices" → Stripe Customer Portal (card, invoices, receipts, switch monthly ↔ annual).
- Cancel (see below).
- Managers see a read-only summary or nothing — *(our call: nothing; billing is admin-only)*.

**Money-back guarantee and cancelling.**
- Within 30 days of the firm's first payment, Cancel refunds everything paid so far in full, automatically, and ends access immediately (firm becomes read-only). Once per firm.
- After 30 days, Cancel stops renewal; full access continues to the end of the paid period, no partial refund; then read-only.
- Cancelling can be undone before the period ends (resume subscription).

**Failed payments.** Stripe Smart Retries (~2 weeks) and Stripe's dunning emails. While a payment is failing, admins see a banner with a link to update the card. If Stripe gives up (subscription unpaid/cancelled), the firm becomes read-only.

**Webhooks** at `/api/billing/stripe`, signature-verified, public path like `/api/inbound/*`. Events handled at minimum: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed. FirmSync's subscription record mirrors status, interval, current period end, cancel-at-period-end, first-payment date.

## 8. Part 3 — Read-only mode and data deletion

**Read-only** when a firm's access ends (cancelled after period end, refunded, or unpaid after retries):
- Everyone can sign in and view and download everything (pages, CSVs, invoice PDFs, files).
- Nothing can be created, changed or deleted, except: admins can resubscribe (Checkout for the existing firm) and update payment details. Enforced in the database (write paths refuse with a clear error for a read-only firm), not only by hiding buttons.
- The Bill inbox stops accepting new mail for a read-only firm (emails are dropped with a log line; the vendor isn't notified).
- Banner: "This firm is read-only. Resubscribe to keep working. Data will be deleted on <date>."

**Deletion.** Data is kept **120 days** after the firm becomes read-only. Admins are emailed 30 days and 7 days before. On the date, a scheduled job deletes the firm's database rows and stored files permanently. Resubscribing before then restores full access and cancels deletion. Free accounts are never deleted this way.

A scheduler is needed (daily): Vercel Cron calling a protected route is the expected choice. *(Builder may choose Supabase pg_cron instead.)*

## 9. Platform owner tools (Platform › Firms)

- Per firm: billing status (paying · in money-back period · payment failing · cancelling at period end · read-only · deletion date · free), interval, seat counts, storage used/allowance, monthly revenue (annual shown as /12).
- Make a firm **free** (no Stripe subscription, no limits other than storage) or remove free status (firm then needs to subscribe; give it 30 days before read-only).
- Grant extra storage in GB, free of charge.
- "Open in Stripe" link for refunds outside the guarantee, disputes and invoices.
- Existing firms at launch become free automatically.

## 10. Constraints

- Card data never touches FirmSync; only Stripe-hosted pages.
- Database enforces tenancy and roles as everywhere else; webhook and cron routes authenticate by signature/secret and use the service-role client only for what they must.
- Money values as elsewhere (exact, cents).
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ids (or lookup keys) for the four prices × two intervals, `CRON_SECRET`, `RESEND_API_KEY` (already present) for warning emails.
- Terms of service and privacy policy pages are needed before live sales; their content is the platform owner's to provide (placeholder links until then).

## 11. Decisions from the design review *(our calls; check while reading)*

1. **Read-only enforcement scope.** Every *user-initiated* write is refused for a read-only firm: RLS write policies and every security-definer function that changes firm data check one helper (e.g. `firm_is_writable(firm)`), and app actions check it too for a friendly message. *System* writes are exempt: the Stripe webhook, the daily jobs, audit triggers, and invoice PDF storage. Exempt user actions: resubscribe, update payment details, and **Regenerate PDF** (it completes an existing record). The Storage page is view-only while read-only.
2. **When access ends and the 120-day clock starts.** Money-back refund → read-only immediately. Cancel after 30 days → read-only at Stripe's `current_period_end`. Failed payments → read-only when Stripe marks the subscription `unpaid` or `canceled` after retries. Free status removed → read-only 30 days later unless subscribed. In every case the deletion date is read-only start + 120 days, stored on the firm's billing record; resubscribing clears it.
3. **Stripe shape.** One subscription per firm with four items (platform fee, extra core seats, consultant seats, storage blocks; quantities may be 0), monthly and annual prices for each, addressed by lookup keys. A setup script creates the products, prices and Customer Portal configuration (allowing monthly ↔ annual switching and card/invoice management) in test mode; the same script is run against live mode at launch. The platform owner needs a Stripe account; the keys are entered only in Vercel.
4. **Sign-up identity.** The firm's first admin is the email typed on the sign-up form (Checkout is prefilled with it and the webhook uses the form's value from metadata, not the card's). If that email already has a login, the new firm is added to it as admin and they get a "new firm added" email instead of an invite. An unclicked invite can be re-sent from the "check your email" page and by the platform owner, as today. The webhook is idempotent on the Checkout session id.
5. **Consultant-seat linking** uses the existing `consultants.user_id` → `firm_members` link: a consultant whose `user_id` belongs to an admin/manager member counts as that core seat only. If that member is removed or becomes a consultant, the consultant record counts as a consultant seat from then on (the FK already clears `user_id` on removal).
6. **Sync failures.** Quantity changes are queued (an outbox row per firm) and pushed immediately; failures retry with the daily reconciliation, which compares counts with Stripe and fixes drift. A firm whose sync has failed for more than 24 hours is flagged on the platform owner's Firms page. No email alert.
7. **Deleting a firm's data** removes all its rows (including the firm and its memberships) and every stored file under `firms/<firmId>/`. Logins (auth users and profiles) are deleted only when they belong to no other firm and aren't the platform owner. The Stripe customer is kept (Stripe holds the payment history). A record of the deletion (firm id, name, date) is kept for the platform owner.
8. **Quota race.** The check when issuing upload links is a soft check; concurrent uploads may overshoot slightly (at most one batch of 5 × 10 MB per user). That's accepted.

## 12. Left to the builder

- Exact table shapes (subscription record, storage cache, grants), function names, and whether allowance lives on `firms` or a new table.
- How usage is computed or cached, within "may lag a few minutes".
- Retry mechanism for Stripe quantity sync and the reconciliation job.
- Banner/notice visuals within the existing design.
- Splitting each Part into its own implementation plan (expected: three plans, in order).
