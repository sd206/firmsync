import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { todayIso } from '@/lib/domain/dates'
import { addDays } from '@/lib/domain/weeks'
import { goTo } from './nav'
import { adminDb, newFirm, TEST_PASSWORD } from '../integration/helpers'
import { issueManualInvoice } from '../integration/invoice-fixtures'
import { mkVendor, saveBill } from '../integration/vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function invoiceFor(f: Firm, name: string, amount: number, dueInDays: number): Promise<string> {
  const { invoiceId, clientId } = await issueManualInvoice(f, amount)
  const today = todayIso()
  const due = addDays(today, dueInDays)
  const issue = dueInDays < 0 ? addDays(due, -30) : today
  const db = adminDb()
  await db.from('clients').update({ name }).eq('id', clientId)
  const { data, error } = await db.from('invoices').update({ issue_date: issue, due_date: due }).eq('id', invoiceId).select('number').single()
  if (error || !data) throw new Error(error?.message)
  return (data as { number: string }).number
}

async function seed(name: string) {
  const f = await newFirm(name)
  const number = await invoiceFor(f, 'Slowpay Ltd', 500, -10)
  await invoiceFor(f, 'Ontime Co', 200, 10)
  const v = await mkVendor(f, 'Acme Staffing')
  const today = todayIso()
  const approved = await saveBill(f, v, 'B-100', [{ kind: 'contractor', description: 'Hours', amount: '300.00' }], {
    billDate: addDays(today, -5),
    dueDate: addDays(today, 3),
  })
  const { error } = await f.admin.db.rpc('approve_vendor_bill', { p_bill: approved })
  if (error) throw new Error(error.message)
  await saveBill(f, v, 'B-200', [{ kind: 'contractor', description: 'Hours', amount: '70.00' }], {
    billDate: addDays(today, -10),
    dueDate: addDays(today, -2),
  })
  return { f, number }
}

async function downloadText(page: Page, link: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: link }).click()])
  return { name: download.suggestedFilename(), text: readFileSync((await download.path())!, 'utf8') }
}

test('receivables: client row, drill-down and invoice download', async ({ page }) => {
  const { f, number } = await seed('AR E2E Firm')
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}`)
  await goTo(page, 'Reports', 'Receivables')
  await expect(page.getByRole('heading', { name: 'Receivables', level: 1 })).toBeVisible()

  const row = page.getByRole('row').filter({ hasText: 'Slowpay Ltd' })
  await expect(row.getByRole('cell').nth(1)).toHaveText('$500.00') // 1–30 days
  await row.getByRole('link', { name: 'Slowpay Ltd' }).click()
  await expect(page.getByRole('heading', { name: 'Open invoices — Slowpay Ltd' })).toBeVisible()
  await expect(page.getByRole('link', { name: number })).toBeVisible()

  const csv = await downloadText(page, 'Download invoices (CSV)')
  expect(csv.name).toMatch(/^receivables-invoices-\d{4}-\d{2}-\d{2}\.csv$/)
  expect(csv.text).toContain(number)
  expect(csv.text).not.toContain('Ontime Co')
})

test('receivables: overdue only hides a client whose invoice is not yet due', async ({ page }) => {
  const { f } = await seed('AR E2E Overdue')
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/reports/receivables`)
  await expect(page.getByRole('row').filter({ hasText: 'Ontime Co' })).toHaveCount(1)
  await page.getByLabel('Overdue only').check()
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page).toHaveURL(/overdue=1/)
  await expect(page.getByRole('row').filter({ hasText: 'Ontime Co' })).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'Slowpay Ltd' })).toHaveCount(1)
})

test('payables: due soon, awaiting approval and summary download', async ({ page }) => {
  const { f } = await seed('AP E2E Firm')
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}`)
  await goTo(page, 'Reports', 'Payables')
  const row = page.getByRole('row').filter({ hasText: 'Acme Staffing' })
  await expect(row.getByRole('cell').nth(0)).toHaveText('$300.00') // Due in 7 days
  await expect(row.getByRole('cell').nth(7)).toHaveText('$300.00') // Total owed
  await expect(row.getByRole('cell').nth(8)).toHaveText('$70.00 (1)') // Awaiting approval
  const csv = await downloadText(page, 'Download summary (CSV)')
  expect(csv.name).toMatch(/^payables-summary-\d{4}-\d{2}-\d{2}\.csv$/)
  expect(csv.text).toContain('Acme Staffing,300.00,')
})

test('a consultant gets 404 on the reports and their downloads', async ({ page }) => {
  const f = await newFirm('AR E2E Access')
  await login(page, f.consultant.email)
  for (const path of ['receivables', 'payables']) {
    expect((await page.goto(`/f/${f.firmId}/reports/${path}`))?.status()).toBe(404)
    expect((await page.request.get(`/f/${f.firmId}/reports/${path}/csv?view=summary`)).status()).toBe(404)
  }
})
