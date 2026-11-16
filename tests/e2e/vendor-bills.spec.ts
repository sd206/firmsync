import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { goTo } from './nav'
import { adminDb, newFirm, TEST_PASSWORD } from '../integration/helpers'

const PDF = path.join(__dirname, 'fixtures', 'remittance.pdf')

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function logout(page: Page) {
  await page.context().clearCookies()
}

const today = () => new Date().toISOString().slice(0, 10)

/** A one-line OFX statement dated today, paying the bill. */
function statement(): { name: string; mimeType: string; buffer: Buffer } {
  const d = today().replaceAll('-', '')
  const body = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>USD<BANKACCTFROM><BANKID>1<ACCTID>2<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>${d}<DTEND>${d}
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>${d}
<TRNAMT>-1200.00
<FITID>ACH-4471-01
<NAME>ACME STAFFING INV-4471
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`
  return { name: 'acme.qfx', mimeType: 'application/octet-stream', buffer: Buffer.from(body) }
}

async function enterBill(page: Page, firmId: string, number: string) {
  await page.goto(`/f/${firmId}/vendor-bills/new`)
  const form = page.getByRole('form', { name: 'Bill' })
  await form.getByLabel('Vendor').selectOption({ label: 'Acme Staffing' })
  await form.getByLabel('Bill number').fill(number)
  await form.getByLabel('Bill date').fill(today())
  await form.getByLabel('Due date').fill(today())
  await form.getByLabel('Line 1 type').selectOption({ label: 'Expense' })
  await form.getByLabel('Line 1 description').fill('Software licences')
  await form.getByLabel('Line 1 amount').fill('300')
  await form.getByLabel('Line 1 category').selectOption({ label: 'Software' })
  await form.getByRole('button', { name: 'Add line' }).click()
  await form.getByLabel('Line 2 type').selectOption({ label: 'Contractor' })
  await form.getByLabel('Line 2 description').fill('October hours')
  await form.getByLabel('Line 2 amount').fill('900')
  await form.getByLabel('Bill PDF').setInputFiles(PDF)
  await form.getByRole('button', { name: 'Save bill' }).click()
}

test('enter, approve and pay a vendor bill from the bank', async ({ page }) => {
  const f = await newFirm('Vendor Bills E2E Firm')
  const { error } = await adminDb().from('vendors').insert({ firm_id: f.firmId, name: 'Acme Staffing' })
  expect(error).toBeNull()

  // A manager enters the bill; it waits for an admin.
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}`)
  await goTo(page, 'Billing', 'Vendor bills')
  await expect(page).toHaveURL(/\/vendor-bills$/)
  await enterBill(page, f.firmId, 'INV-4471')
  await expect(page.getByRole('heading', { level: 1, name: 'Bill INV-4471' })).toBeVisible()
  await expect(page.getByTestId('status')).toHaveText('Awaiting approval')
  await expect(page.getByRole('link', { name: 'remittance.pdf' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)

  // The same number for the same vendor is refused.
  await enterBill(page, f.firmId, 'inv-4471')
  await expect(page.getByRole('form', { name: 'Bill' }).getByRole('alert')).toContainText(
    'This bill number is already entered for this vendor.',
  )

  // An admin approves; the expense line becomes an expense.
  await logout(page)
  await login(page, f.admin.email)
  await page.goto(`/f/${f.firmId}/vendor-bills?status=awaiting`)
  await page.getByRole('link', { name: 'INV-4471' }).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByTestId('status')).toHaveText('Approved')
  await goTo(page, 'Billing', 'Expenses')
  await expect(page.getByRole('row').filter({ hasText: 'Acme Staffing' })).toContainText('$300.00')

  // The bank payment is suggested for the bill and pays it.
  await page.goto(`/f/${f.firmId}/bank`)
  await page.getByRole('link', { name: 'Add account' }).click()
  await page.getByLabel('Account name').fill('Main checking')
  await page.getByLabel('Type').selectOption({ label: 'Bank' })
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.getByLabel('Statement file').setInputFiles(statement())
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('1 new line')
  await page.getByRole('button', { name: /^Review ACME STAFFING INV-4471/ }).click()
  await page.getByRole('radio', { name: 'Vendor bill payment' }).check()
  const billForm = page.getByRole('form', { name: 'Vendor bill payment' })
  await expect(billForm.getByLabel('Bill').locator('option').first()).toContainText('INV-4471')
  await billForm.getByRole('button', { name: 'Confirm bill payment' }).click()
  await expect(page.getByText('Nothing to review.')).toBeVisible()

  await page.goto(`/f/${f.firmId}/vendor-bills?status=paid`)
  await page.getByRole('link', { name: 'INV-4471' }).click()
  await expect(page.getByTestId('status')).toHaveText('Paid')
  const payment = page.getByRole('row').filter({ hasText: 'ACH-4471-01' })
  await expect(payment).toContainText('$1,200.00')
  await expect(payment).toContainText('Main checking')
})

test('consultants cannot open vendor bills', async ({ page }) => {
  const f = await newFirm('Vendor Bills 404 Firm')
  await login(page, f.consultant.email)
  const res = await page.goto(`/f/${f.firmId}/vendor-bills`)
  expect(res?.status()).toBe(404)
})
