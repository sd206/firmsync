import { test, expect, type Page } from '@playwright/test'
import { adminDb, newFirm, TEST_PASSWORD } from '../integration/helpers'
import { createManualDraft, issueManualInvoice } from '../integration/invoice-fixtures'

// The e2e build sends through the local Mailpit (playwright.config.ts sets EMAIL_TRANSPORT=mailpit).
const MAILPIT = (process.env.MAILPIT_URL || 'http://127.0.0.1:54424').replace(/\/$/, '')

type Firm = Awaited<ReturnType<typeof newFirm>>
type MailpitSummary = { ID: string; Subject: string; From: { Name: string; Address: string } }
type MailpitMessage = {
  From: { Name: string; Address: string }
  ReplyTo: { Address: string }[]
  Subject: string
  Text: string
  Attachments: { FileName: string; ContentType: string; Size: number }[]
}

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** Demo Consulting with an issued invoice for a client with a billing email; returns the address. */
async function seed(): Promise<{ f: Firm; invoiceId: string; billing: string }> {
  const f = await newFirm('Demo Consulting')
  const billing = `ap-${crypto.randomUUID()}@demo-client.test`
  await adminDb().from('firms').update({ contact_email: 'billing@demo-consulting.test' }).eq('id', f.firmId)
  const { invoiceId, clientId } = await issueManualInvoice(f, 1200)
  await adminDb()
    .from('clients')
    .update({ billing_email: billing, billing_contact_name: 'Pat Payable' })
    .eq('id', clientId)
  return { f, invoiceId, billing }
}

/** Issued by the fixture without a PDF; make one the way a user would. */
async function makePdf(page: Page) {
  await page.getByRole('button', { name: 'Regenerate PDF' }).click()
  await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible()
}

async function mailTo(address: string, field: 'to' | 'cc' = 'to'): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`${field}:"${address}"`)}`)
  const json = (await res.json()) as { messages: MailpitSummary[] }
  return json.messages ?? []
}

test('manager emails an issued invoice with its PDF and sees the history', async ({ page }) => {
  const { f, invoiceId, billing } = await seed()
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/invoices/${invoiceId}`)
  await expect(page.getByRole('button', { name: 'Email invoice' })).toBeDisabled()
  await makePdf(page)

  await page.getByRole('button', { name: 'Email invoice' }).click()
  await expect(page.getByLabel('To', { exact: true })).toHaveValue(billing)
  await expect(page.getByLabel('Subject')).toHaveValue(/^Invoice INV-\d{4}-\d{4} from Demo Consulting$/)
  await expect(page.getByLabel('Message')).toHaveValue(/Hi Pat Payable,/)
  await expect(page.getByTestId('email-from')).toHaveText('"Demo Consulting via VeriTreo" <invoices@veritreo.test>')
  await expect(page.getByTestId('email-reply-to')).toHaveText('billing@demo-consulting.test')
  await page.getByLabel('Send me a copy').check()
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByRole('status')).toHaveText(new RegExp(`^Invoice INV-\\d{4}-\\d{4} sent to ${billing}\\.$`))
  await expect(page.getByTestId('email-status')).toHaveText('Sent')
  await expect(page.getByTestId('last-emailed')).toContainText(`to ${billing}`)

  // Arrived in Mailpit, from the firm, replying to the firm, with the PDF attached.
  await expect.poll(async () => (await mailTo(billing)).length).toBe(1)
  const [summary] = await mailTo(billing)
  const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${summary.ID}`)).json()) as MailpitMessage
  expect(msg.From).toEqual({ Name: 'Demo Consulting via VeriTreo', Address: 'invoices@veritreo.test' })
  expect(msg.ReplyTo.map((r) => r.Address)).toEqual(['billing@demo-consulting.test'])
  expect(msg.Text).toContain('Hi Pat Payable,')
  expect(msg.Attachments).toHaveLength(1)
  expect(msg.Attachments[0].FileName).toMatch(/^INV-\d{4}-\d{4}\.pdf$/)
  expect(msg.Attachments[0].ContentType).toBe('application/pdf')
  expect(msg.Attachments[0].Size).toBeGreaterThan(1000)
  // "Send me a copy" put the manager on CC.
  expect((await mailTo(f.manager.email, 'cc')).length).toBe(1)

  // A second send straight away is refused.
  await page.getByRole('button', { name: 'Email invoice' }).click()
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Too many invoice emails' })).toHaveText(
    'Too many invoice emails. Try again in a few minutes.',
  )
  await page.getByRole('button', { name: 'Cancel' }).click()

  // The invoices list marks it as emailed.
  await page.goto(`/f/${f.firmId}/invoices`)
  await expect(page.getByRole('row').filter({ hasText: 'Issued' })).toContainText('Emailed')
})

test('the send panel checks recipients before sending', async ({ page }) => {
  const { f, invoiceId } = await seed()
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/invoices/${invoiceId}`)
  await makePdf(page)
  await page.getByRole('button', { name: 'Email invoice' }).click()
  await page.getByLabel('To', { exact: true }).fill('not-an-address')
  await page.getByLabel('Message').fill('Hello Pat,\n\nOur bank details changed: see the invoice.')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.locator('#email-to-error')).toHaveText("not-an-address isn't a valid email address.")
  // What the user typed survives the error.
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('not-an-address')
  await expect(page.getByLabel('Message')).toHaveValue('Hello Pat,\n\nOur bank details changed: see the invoice.')
  await expect(page.getByText("This invoice hasn't been emailed yet.")).toBeVisible()
})

test('firm wording in Settings is used, and can be reset', async ({ page }) => {
  const { f, invoiceId } = await seed()
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/settings`)
  await page.getByLabel('Email subject').fill('Your bill {invoice_number} {bank}')
  await expect(page.getByTestId('unknown-placeholders')).toContainText('Unknown placeholder {bank}')
  await page.getByLabel('Email subject').fill('Your bill {invoice_number}')
  await page.getByRole('button', { name: 'Save email' }).click()
  await expect(page.getByText('Email wording saved.')).toBeVisible()

  await page.goto(`/f/${f.firmId}/invoices/${invoiceId}`)
  await makePdf(page)
  await page.getByRole('button', { name: 'Email invoice' }).click()
  await expect(page.getByLabel('Subject')).toHaveValue(/^Your bill INV-\d{4}-\d{4}$/)

  await page.goto(`/f/${f.firmId}/settings`)
  await page.getByRole('button', { name: 'Reset to default' }).click()
  await expect(page.getByText('Email wording reset to the default.')).toBeVisible()
  await expect(page.getByLabel('Email subject')).toHaveValue('Invoice {invoice_number} from {firm_name}')
  const { data } = await adminDb().from('firms').select('invoice_email_subject').eq('id', f.firmId).single()
  expect(data?.invoice_email_subject).toBeNull()
})

test('drafts have no Email invoice, and consultants get 404', async ({ page }) => {
  const f = await newFirm('Demo Consulting')
  const { invoiceId: draftId } = await createManualDraft(f)
  const { invoiceId } = await issueManualInvoice(f)
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/invoices/${draftId}`)
  await expect(page.getByRole('heading', { name: 'Draft invoice' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Email invoice' })).toHaveCount(0)

  await page.context().clearCookies()
  await login(page, f.consultant.email)
  expect((await page.goto(`/f/${f.firmId}/invoices/${invoiceId}`))?.status()).toBe(404)
})
