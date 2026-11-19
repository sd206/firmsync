import { test, expect, type Page } from '@playwright/test'
import { todayIso } from '@/lib/domain/dates'
import { addDays } from '@/lib/domain/weeks'
import { newFirm, TEST_PASSWORD } from '../integration/helpers'
import { approvedWeek, vendorContractor } from '../integration/trueup-fixtures'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('a contractor bill is trued up against approved hours and shows in the P&L', async ({ page }) => {
  // Demo Consulting's contractor: 10 h at $80 cost approved in October.
  const f = await newFirm('Demo Consulting Trueup')
  const c = await vendorContractor(f, { vendorName: 'Northwind Talent', consultantName: 'Dana Brooks', clientName: 'Acme Corp' })
  await approvedWeek(f, c, '2026-10-05', [
    { project: 'Website', workDate: '2026-10-05', hours: '8' },
    { project: 'Website', workDate: '2026-10-06', hours: '2' },
  ])
  const today = todayIso()

  // A manager enters the vendor's $1,100 bill for October, naming Dana.
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/vendor-bills/new`)
  const form = page.getByRole('form', { name: 'Bill' })
  await form.getByLabel('Vendor').selectOption({ label: 'Northwind Talent' })
  await form.getByLabel('Bill number').fill('NW-1001')
  await form.getByLabel('Bill date').fill(today)
  await form.getByLabel('Due date').fill(addDays(today, 30))
  await form.getByLabel('Service period from').fill('2026-10-01')
  await form.getByLabel('Service period to').fill('2026-10-31')
  await form.getByLabel('Line 1 type').selectOption({ label: 'Contractor' })
  await form.getByLabel('Line 1 description').fill('October hours')
  await form.getByLabel('Line 1 amount').fill('1100')
  await form.getByLabel('Line 1 who').selectOption({ label: 'Dana Brooks' })
  await form.getByRole('button', { name: 'Save bill' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Bill NW-1001' })).toBeVisible()
  const line = page.getByTestId('trueup-line')
  await expect(line).toContainText('Approved hours: 10.00 h at cost = $800.00')
  await expect(page.getByTestId('trueup-adjustment')).toHaveText('+$300.00')

  // An admin approves it.
  await page.context().clearCookies()
  await login(page, f.admin.email)
  await page.goto(`/f/${f.firmId}/vendor-bills?status=awaiting`)
  await page.getByRole('link', { name: 'NW-1001' }).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByTestId('status')).toHaveText('Approved')
  await expect(line).toContainText('counted on')

  // The P&L shows labour $800 plus a $300 contractor adjustment in the bill's month.
  await page.goto(`/f/${f.firmId}/reports/pnl?from=2026-10-01&to=${today}&group=month`)
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader', { name: 'Contractor adj.' })).toBeVisible()
  const total = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Total' }) })
  // Cells after the row header: Revenue, Labour cost, Contractor adj., Gross profit.
  const cells = total.getByRole('cell')
  await expect(cells.nth(0)).toHaveText('$1,500.00')
  await expect(cells.nth(1)).toHaveText('$800.00')
  await expect(cells.nth(2)).toHaveText('$300.00')
  await expect(cells.nth(3)).toHaveText('$400.00')
})

test('a line for someone not on timesheets counts in full against its project', async ({ page }) => {
  const f = await newFirm('Demo Consulting Full')
  const c = await vendorContractor(f, { vendorName: 'Fabrikam Design', clientName: 'Acme Corp' })
  const today = todayIso()

  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/vendor-bills/new`)
  const form = page.getByRole('form', { name: 'Bill' })
  await form.getByLabel('Vendor').selectOption({ label: 'Fabrikam Design' })
  await form.getByLabel('Bill number').fill('FD-7')
  await form.getByLabel('Bill date').fill(today)
  await form.getByLabel('Due date').fill(today)
  await form.getByLabel('Line 1 type').selectOption({ label: 'Contractor' })
  await form.getByLabel('Line 1 description').fill('Logo design')
  await form.getByLabel('Line 1 amount').fill('2000')
  // Without a choice of who, the bill is refused.
  await form.getByRole('button', { name: 'Save bill' }).click()
  await expect(form.getByRole('alert')).toContainText('Line 1: Choose who this line is for.')
  await form.getByLabel('Line 1 who').selectOption({ label: 'Not on timesheets' })
  await form.getByLabel('Line 1 project').selectOption({ label: 'Acme Corp: Website' })
  await form.getByRole('button', { name: 'Save bill' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Bill FD-7' })).toBeVisible()
  await expect(page.getByTestId('trueup-line')).toContainText('Not on timesheets: will be counted in full, $2,000.00, against Acme Corp — Website.')
  expect(c.projects.Website).toBeTruthy()
})
