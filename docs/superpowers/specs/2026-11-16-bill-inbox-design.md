# Bill inbox: vendor bills by email (simple version)

## Why

Vendors already email their invoices. Today someone downloads each PDF and enters it by hand under
Billing › Vendor bills. This feature lets each firm forward or send bills to one address. They
land in FirmSync with their files, ready for a manager to turn into a bill.

This is the simple version. Nothing is read automatically. A person still types the bill number,
dates and lines, and the existing bill rules and Admin approval stay exactly as they are.

## Goals

- Each firm has one bill address, e.g. `bills-7f3k2q@in.<domain>`. Mail sent to it appears in
  **Billing › Bill inbox** with its sender, subject, time and files.
- From the inbox, a manager can **Create bill**, **Ignore** or **Mark duplicate**.
  - **Create bill** opens the normal new-bill form with the vendor chosen and the file attached.
- Admins manage the address in **Settings › Bill inbox**:
  - turn it on or off
  - replace it
  - choose what happens to mail from unknown senders

## Non-goals (this version)

- Reading the PDF to fill in the bill. That's a later version, built on this one.
- Replying to senders, bounce messages, or auto-acknowledgements.
- More than one address per firm.
- Automatic cleanup of old inbox items.

## Anti-goals (a failure even if it works)

- A bill is created, approved or paid without a person doing it.
- One firm's mail reaches another firm's inbox, or a guessed address puts mail into a firm.
- Mail to an enabled address disappears without a trace (no inbox item and no log line).
- The app decides an email is a duplicate and hides it. **Duplicates are the manager's call:**
  every email a vendor sends shows up, and the manager marks duplicates.

## Approaches considered

- **A. A separate inbox (chosen).** Emails become inbox items. Bills exist only once a person
  creates them from an item. The bill list stays clean, and the bill rules don't change (number
  required, at least one line, the duplicate-number check).
- **B. Draft bills.** Each email becomes a bill with a new Draft status. There's one fewer screen,
  but the bill rules would have to be loosened, and junk mail would show up as bills.

The user picked A.

## How mail arrives (decided)

- **Provider: Resend.** The firm already has a Resend account and a verified sending domain (Resend is
  Supabase's SMTP for sign-in emails). The app code has no Resend SDK yet, so this adds the `resend`
  package (or plain fetch) and Svix verification. Receiving is on every plan. Each received email
  counts toward the Resend email quota.
- **Environments:** only production (`firmsync.vercel.app`) gets a receiving webhook. Preview and
  local deployments never receive real mail; tests mock Resend.
- **Domain (user's choice):**
  - Start on Resend's managed receiving domain (`<id>.resend.app`). It needs no DNS setup and accepts
    any address on it (catch-all). `firmsync.vercel.app` can't be used, because MX records can't be
    added to a `vercel.app` name.
  - Later the user may buy a FirmSync domain and receive on a subdomain of it (e.g.
    `in.firmsync.app`, one MX record).
  - **Switching domains must not break addresses already given to vendors.**
    `INBOUND_DOMAINS` is a comma-separated list. The first entry is the one shown in Settings; every
    listed domain is accepted.
  - The firm's code is the same on every domain. `bills-7f3k2q@` works on both the old and the new
    domain until the old one is removed from the list.
- **Webhook:**
  - Resend posts `email.received` to `POST /api/inbound/resend` on the app.
  - The handler must verify the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`)
    against the raw body, using the webhook secret. Unsigned or invalid requests get a 401 and
    nothing else happens.
- **Files:**
  - The webhook carries metadata only. Its attachments array has id, filename and content type, not
    the file bytes.
  - The handler lists the email's attachments through Resend's Receiving API. Each comes with a
    download URL that is valid for one hour. The handler downloads each file, checks it with the
    app's existing attachment rules (PDF/PNG/JPEG/HEIC, existing size limit, file signature
    checked), and stores it in the firm's storage folder.
  - Files that fail the checks are not stored. The item lists them as "Not accepted: name (reason)".
- **Routing:**
  - The handler looks at the `to` addresses (and `received_for` as a fallback) for one on any
    domain in `INBOUND_DOMAINS` whose code matches an enabled firm address.
  - No match, or the address is turned off or replaced: answer 200, store nothing, and log one line
    (the address code and the Resend email id, not the content).
- **Resend's own retries:** if Resend delivers the same webhook again (same Resend email id), the
  handler stores nothing new. This is not duplicate detection. A vendor sending the same bill twice
  is two separate emails and shows up twice.
- **Configuration:** `RESEND_API_KEY` (server only), `RESEND_INBOUND_SECRET`, and `INBOUND_DOMAINS`
  are set in Vercel. If they're missing, Settings › Bill inbox says the feature isn't set up, and
  the webhook answers 503.

## The address (decided)

- Each firm has at most one active address: `bills-<code>@<first INBOUND_DOMAINS entry>`.
  - The code is random: 10 lowercase letters and digits, hard to guess.
  - Codes are never reused.
- **Turn on:** creates the address, or re-enables the existing one with the same code.
- **Turn off:** mail to it is dropped and logged as above.
- **Replace:** creates a new code. The old address stops working immediately. No grace period
  (my call; easy to add later).
- **Known senders (my calls):** matching is on the sender address, case-insensitive. Reply-To and
  forwarded-message headers are ignored.
  - Equals the email on exactly one of the firm's vendors: that vendor is matched.
  - Equals the email on several vendors: known, but no vendor is matched.
  - Equals the email of a member of the firm: known, shown as "Forwarded by <name>", no vendor
    matched. Staff forwarding bills is expected to be the usual way mail arrives.
- **Unknown senders:** for any other sender, the admin picks one of two options:
  - **Hold in the inbox, marked "Unknown sender"** (default)
  - **Drop** (logged, not stored)
- Only admins can change these settings. The settings page shows the address with a Copy button to
  admins and managers.

## The inbox (decided)

- **Billing › Bill inbox**, next to Vendor bills. The menu shows a count of new items.
- **Tabs:** New (default), Bills created, Ignored, Duplicates.
- **Each row shows:**
  - received time
  - sender address
  - the matched vendor name with ✓, or "Unknown sender"
  - subject
  - each accepted file as a link that opens it
  - any files that were not accepted, with the reason
- **Actions on a New item:**
  - **Create bill**, one button per accepted file. It opens the new-bill form with the matched vendor
    preselected (the user can change it) and that file attached to the new bill when it is saved.
    One file makes one bill (my call). More files can be added on the bill page, as today.
    - After a successful save, the item shows "Bill INV-4471 created" with a link. When every file
      on the item has a bill, the item moves to Bills created.
    - An item can also be moved to Bills created by hand, for emails where only one of several files
      was a bill.
  - **Ignore**, with an optional note: moves to Ignored.
  - **Mark duplicate**, with an optional note such as "same as INV-4471": moves to Duplicates.
- **Restore:** Ignored and Duplicate items can be put back to New at any time.
- **Duplicate hint (my call, never blocking):** a "Possible duplicate" label appears in either case:
  - the same sender sent a file with the same name in the last 60 days
  - a file name contains the bill number of an existing bill from the matched vendor

  It's only a hint. Nothing is hidden or marked for the manager.
- **No-file emails** still appear, with "No files". Their only actions are Ignore, Mark duplicate,
  or moving the item to Bills created by hand.
- **Access:** admins and managers can see and act. Consultants get 404, as for vendor bills.

## Data (decided in outline; details to the builder)

- **Inbox address table:** firm, code (unique), enabled, unknown-sender mode, created at, replaced
  at.
- **Inbox item table:**
  - firm and address
  - the Resend email id (unique; this is how Resend's retries are ignored)
  - sender address, recipient address, subject, received at
  - matched vendor (nullable)
  - status: `new`, `bill_created`, `ignored` or `duplicate`, with an optional note
  - who handled it and when
- **Files:** stored as attachments owned by the inbox item, a new owner kind in the existing
  attachments module, in a `bill-inbox/<item>` folder.
  - Create bill links or copies the chosen file to the new bill: the bill's own file is a normal
    vendor-bill attachment. The inbox keeps its copy, so a later Restore still shows the file.
  - Copy or move is the builder's call. The bill must keep its file if the inbox item is cleaned up
    later.
- **Writes:**
  - The webhook writes items with the service role, after signature verification. It is the only
    writer of new items.
  - All status changes go through security-definer functions that check admin/manager on the item's
    own firm. Settings changes are admin-only.
  - RLS: select for admin/manager on the firm; no direct insert or update from clients.

## Setup steps for the user (manual, once)

1. In Resend: open Receiving and copy the account's `<id>.resend.app` domain.
2. In Resend: create a webhook for `email.received` pointing at
   `https://firmsync.vercel.app/api/inbound/resend`, and copy its signing secret.
3. In Resend: create an API key that can read received emails.
4. In Vercel: add `RESEND_API_KEY`, `RESEND_INBOUND_SECRET`, and `INBOUND_DOMAINS=<id>.resend.app`,
   then redeploy.
5. In FirmSync: Settings › Bill inbox › Turn on, then send a test email.

Later, to move to a FirmSync domain:

1. Verify the domain in Resend and enable receiving on its `in.` subdomain.
2. Add the MX record at the DNS host.
3. Set `INBOUND_DOMAINS=in.firmsync.app,<id>.resend.app` and redeploy.
4. Tell vendors the new address.
5. Once mail to the old address has stopped, remove it from the list.

## Testing

- **Webhook:**
  - signature failure leads to 401
  - unknown, disabled or replaced address: 200 and nothing stored
  - a retry with the same email id stores one item
  - a vendor sending twice stores two items
  - unknown sender: held or dropped according to the setting
  - a bad file is listed as not accepted; good files are stored
- **Resend API calls** are mocked in tests, and so are the file downloads.
- **Integration:** firm isolation (an item never visible to or changeable by another firm), role
  checks, and the status changes including Restore.
- **e2e:**
  1. Seed an item.
  2. A manager uses Create bill: the bill form is prefilled, and after saving the item shows the
     bill link.
  3. Ignore, Mark duplicate and Restore work.
  4. A consultant gets 404.

## Left to the builder

- Table and column names, the exact folder layout, and whether Create bill copies or moves the file.
- How the new-bill form receives the preselected vendor and the inbox file (e.g. a query parameter
  carrying the inbox file id, re-checked on the server).
- Indexes for the duplicate hint, and how the menu count is computed.

## Decided after review (my calls)

- **Downloads happen inside the webhook request.** The handler answers 2xx once the item row
  exists; Resend retries only on non-2xx.
- **A failed download still leaves the item visible**, marked "Files couldn't be downloaded", with a
  **Try again** button. It re-lists the attachments through the Receiving API, which gives fresh
  one-hour URLs, and downloads them again.
- **Inbox files use the existing attachments table**, as a new owner kind, the same way vendor bills
  were added. Create bill copies the file.
- UI layout details within the existing app style.
