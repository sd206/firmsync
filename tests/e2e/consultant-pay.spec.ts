import { test, expect, type Page } from '@playwright/test'
import { goTo } from './nav'
import { adminDb, newFirm, TEST_PASSWORD } from '../integration/helpers'
import { seedTimesheetFixture } from '../integration/timesheet-fixtures'
import { mkVendor } from '../integration/vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function approvedWeek(f: Firm, consultantId: string, projectId: string, weekStart: string, hours: string) {
  const { data: id, error } = await f.manager.db.rpc('save_timesheet_week', {
    p_firm: f.firmId,
    p_consultant: consultantId,
    p_week_start: weekStart,
    p_entries: [{ projectId, workDate: weekStart, hours, note: null }],
  })
  expect(error).toBeNull()
  expect((await f.manager.db.rpc('submit_timesheet', { p_timesheet: id })).error).toBeNull()
  expect((await f.manager.db.rpc('approve_timesheet', { p_timesheet: id })).error).toBeNull()
}

test('a directly-paid consultant sees approved hours, pay rate and gross amount', async ({ page }) => {
  const f = await newFirm('Demo Consulting')
  const fx = await seedTimesheetFixture(f, { costRate: '80' })
  await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', '8')
  // A submitted week shows hours but no amount.
  const { data: sub } = await f.manager.db.rpc('save_timesheet_week', {
    p_firm: f.firmId,
    p_consultant: fx.consultantId,
    p_week_start: '2026-10-12',
    p_entries: [{ projectId: fx.projectId, workDate: '2026-10-12', hours: '6', note: null }],
  })
  await f.manager.db.rpc('submit_timesheet', { p_timesheet: sub })

  await login(page, f.consultant.email)
  await page.goto(`/f/${f.firmId}`)
  await goTo(page, 'Work', 'My hours and pay')
  await expect(page.getByRole('heading', { name: 'My hours and pay' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Year' }).getByRole('link', { name: '2026' }).click()

  await expect(page.getByText('Paid through: Paid directly')).toBeVisible()
  const weeks = page.getByRole('table', { name: 'Timesheets by week, newest first' })
  const approved = weeks.getByRole('row').filter({ hasText: 'Approved' })
  await expect(approved).toContainText('8.00')
  await expect(approved).toContainText('$80.00')
  await expect(approved).toContainText('$640.00')
  const waiting = weeks.getByRole('row').filter({ hasText: 'Waiting for approval' })
  await expect(waiting).toContainText('6.00')
  await expect(waiting).not.toContainText('$')

  const months = page.getByRole('table', { name: 'Approved hours by month' })
  await expect(months.getByRole('row').filter({ hasText: 'Oct 2026' })).toContainText('$640.00')
  await expect(page.getByText("This is not a payslip and doesn't show whether you've been paid")).toBeVisible()
})

test('a vendor-employed consultant sees hours and "Billed by", never an amount', async ({ page }) => {
  const f = await newFirm('Demo Consulting')
  const fx = await seedTimesheetFixture(f, { costRate: '70' })
  const vendorId = await mkVendor(f, 'Northwind Staffing')
  await adminDb().from('consultants').update({ type: 'vendor', vendor_id: vendorId }).eq('id', fx.consultantId)
  await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', '8')

  await login(page, f.consultant.email)
  await page.goto(`/f/${f.firmId}/my-pay?year=2026`)
  await expect(page.getByText('Paid through: Northwind Staffing')).toBeVisible()
  const weeks = page.getByRole('table', { name: 'Timesheets by week, newest first' })
  await expect(weeks.getByRole('row').filter({ hasText: 'Approved' })).toContainText('Billed by Northwind Staffing')
  await expect(page.getByText('Your pay comes from Northwind Staffing.')).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText('$')
  await expect(page.getByRole('main')).not.toContainText('Gross amount')
})

test('a login without a consultant record sees the not-linked message', async ({ page }) => {
  const f = await newFirm('Demo Consulting')
  await login(page, f.consultant.email)
  await page.goto(`/f/${f.firmId}/my-pay`)
  await expect(page.getByText("Your login isn't linked to a consultant record yet.")).toBeVisible()
})

test('an admin opens a consultant’s hours and pay from the consultant page', async ({ page }) => {
  const f = await newFirm('Demo Consulting')
  const fx = await seedTimesheetFixture(f, { costRate: '80' })
  await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', '8')

  await login(page, f.admin.email)
  await page.goto(`/f/${f.firmId}/consultants/${fx.consultantId}`)
  await expect(page.getByRole('heading', { name: 'Pay rates' })).toBeVisible()
  await expect(page.getByText('Paid through: Paid directly').first()).toBeVisible()
  await page.getByRole('link', { name: 'View hours and pay' }).click()
  await expect(page.getByRole('heading', { name: 'Hours and pay: Con Sultant' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Year' }).getByRole('link', { name: '2026' }).click()
  await expect(
    page.getByRole('table', { name: 'Timesheets by week, newest first' }).getByRole('row').filter({ hasText: 'Approved' }),
  ).toContainText('$640.00')
})

test('a consultant cannot open the admin view of hours and pay', async ({ page }) => {
  const f = await newFirm('Demo Consulting')
  const fx = await seedTimesheetFixture(f)
  await login(page, f.consultant.email)
  const res = await page.goto(`/f/${f.firmId}/hours-and-pay/${fx.consultantId}`)
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: /Hours and pay:/ })).toHaveCount(0)
})
