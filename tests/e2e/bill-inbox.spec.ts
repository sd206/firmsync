import { test, expect, type Page } from '@playwright/test'
import { answerConfirm } from './confirm'
import { firmNav, openMenu } from './nav'
import { adminDb, newFirm, TEST_PASSWORD } from '../integration/helpers'
import { seedInboxItem } from '../integration/bill-inbox-fixtures'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

const today = () => new Date().toISOString().slice(0, 10)

test('admin turns on the bill inbox; managers see the address only', async ({ page }) => {
  const f = await newFirm('Inbox E2E Settings')
  await login(page, f.admin.email)
  await page.goto(`/f/${f.firmId}/settings`)
  const box = page.getByRole('region', { name: 'Bill inbox' })
  await box.getByRole('button', { name: 'Turn on' }).click()
  await expect(box.getByTestId('inbox-address')).toHaveText(/^bills-[a-z0-9]{10}@test\.resend\.app$/)
  const first = await box.getByTestId('inbox-address').textContent()
  await box.getByRole('button', { name: 'Replace address' }).click()
  await answerConfirm(page)
  await expect(box.getByTestId('inbox-address')).not.toHaveText(first!)

  await page.context().clearCookies()
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/settings`)
  const mbox = page.getByRole('region', { name: 'Bill inbox' })
  await expect(mbox.getByTestId('inbox-address')).toBeVisible()
  await expect(mbox.getByRole('button', { name: 'Turn off' })).toHaveCount(0)
  await expect(mbox.getByRole('button', { name: 'Replace address' })).toHaveCount(0)
})

test('a manager turns an emailed bill into a bill, and ignores, restores and marks duplicates', async ({ page }) => {
  const f = await newFirm('Inbox E2E Flow')
  const { data: v } = await adminDb().from('vendors').insert({ firm_id: f.firmId, name: 'Acme Staffing', email: 'ap@acme.test' }).select('id').single()
  await seedInboxItem(f, { vendorId: v!.id, subject: 'Invoice INV-9001', upload: true, receivedAt: new Date(Date.now() - 60_000).toISOString() })
  await seedInboxItem(f, { from: 'promo@spam.test', subject: 'Special offer', files: 0 })
  await seedInboxItem(f, { from: f.manager.email, subject: 'Paper bill, entered by hand', files: 0 })

  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}`)
  await openMenu(page, 'Billing')
  await firmNav(page).getByRole('link', { name: 'Bill inbox (3)' }).click()
  await expect(page).toHaveURL(/\/bill-inbox$/)

  const acme = page.getByRole('row').filter({ hasText: 'Invoice INV-9001' })
  await expect(acme).toContainText('Acme Staffing')
  await expect(acme.getByRole('link', { name: 'remittance.pdf', exact: true })).toBeVisible()
  await acme.getByRole('link', { name: /^Create bill/ }).click()

  const form = page.getByRole('form', { name: 'Bill' })
  await expect(form.getByLabel('Vendor')).toHaveValue(v!.id)
  await expect(page.getByText('Attached from Bill inbox: remittance.pdf')).toBeVisible()
  await form.getByLabel('Bill number').fill('INV-9001')
  await form.getByLabel('Bill date').fill(today())
  await form.getByLabel('Due date').fill(today())
  await form.getByLabel('Line 1 type').selectOption({ label: 'Contractor' })
  await form.getByLabel('Line 1 description').fill('October hours')
  await form.getByLabel('Line 1 amount').fill('900')
  await form.getByRole('button', { name: 'Save bill' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Bill INV-9001' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'remittance.pdf' })).toBeVisible()

  await page.goto(`/f/${f.firmId}/bill-inbox?tab=bill_created`)
  await expect(page.getByRole('row').filter({ hasText: 'Invoice INV-9001' }).getByRole('link', { name: 'Bill INV-9001' })).toBeVisible()

  // An email with no files can be moved to Bills created by hand.
  await page.goto(`/f/${f.firmId}/bill-inbox`)
  await page.getByRole('row').filter({ hasText: 'Paper bill' }).getByRole('button', { name: 'Mark bills created' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Paper bill' })).toHaveCount(0)
  await page.goto(`/f/${f.firmId}/bill-inbox?tab=bill_created`)
  await expect(page.getByRole('row').filter({ hasText: 'Paper bill' })).toBeVisible()

  await page.goto(`/f/${f.firmId}/bill-inbox`)
  const spam = page.getByRole('row').filter({ hasText: 'Special offer' })
  await expect(spam).toContainText('Unknown sender')
  await spam.getByRole('button', { name: 'Ignore' }).click()
  await page.getByRole('dialog').getByLabel('Note (optional)').fill('spam')
  await page.getByRole('dialog').getByRole('button', { name: 'Ignore' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Special offer' })).toHaveCount(0)

  await page.goto(`/f/${f.firmId}/bill-inbox?tab=ignored`)
  const ignored = page.getByRole('row').filter({ hasText: 'Special offer' })
  await expect(ignored).toContainText('spam')
  await ignored.getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Special offer' })).toHaveCount(0)

  await page.goto(`/f/${f.firmId}/bill-inbox`)
  await page.getByRole('row').filter({ hasText: 'Special offer' }).getByRole('button', { name: 'Mark duplicate' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mark duplicate' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Special offer' })).toHaveCount(0)
  await page.goto(`/f/${f.firmId}/bill-inbox?tab=duplicate`)
  await expect(page.getByRole('row').filter({ hasText: 'Special offer' })).toBeVisible()
})

test('consultants cannot open the bill inbox', async ({ page }) => {
  const f = await newFirm('Inbox E2E 404')
  await login(page, f.consultant.email)
  const res = await page.goto(`/f/${f.firmId}/bill-inbox`)
  expect(res?.status()).toBe(404)
})
