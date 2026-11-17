import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { answerConfirm } from './confirm'
import { goTo } from './nav'
import { adminDb, newFirm, TEST_PASSWORD } from '../integration/helpers'
import { expenseWithFile } from '../integration/storage-fixtures'

const REMITTANCE = path.join(__dirname, 'fixtures', 'remittance.pdf')
const FULL = 'Your firm has used all of its storage. Delete old files or add storage in Settings › Billing.'

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function setAllowance(firmId: string, bytes: number) {
  const { error } = await adminDb().from('firms').update({ storage_included_bytes: bytes }).eq('id', firmId)
  if (error) throw new Error(error.message)
}

test('admin sees usage, sorts largest first and deletes a file', async ({ page }) => {
  const f = await newFirm('Storage E2E Admin')
  await expenseWithFile(f, 3000, 'Skyline Air')
  await expenseWithFile(f, 1000, 'Portal Cafe')
  await login(page, f.admin.email)
  await page.goto(`/f/${f.firmId}`)
  await goTo(page, 'Setup', 'Storage')
  await expect(page.getByRole('heading', { name: 'Storage', level: 1 })).toBeVisible()
  await expect(page.getByText('4 KB of 5 GB used (0%)')).toBeVisible()

  const files = page.getByRole('table', { name: 'Stored files' })
  await expect(files.getByRole('row').nth(1)).toContainText('Skyline Air.pdf')
  await expect(files.getByRole('row').nth(2)).toContainText('Portal Cafe.pdf')

  await page.getByLabel('Select Skyline Air.pdf').check()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  expect(await answerConfirm(page)).toBe("Delete 1 file (3 KB)? This can't be undone.")
  await expect(page.getByText('Deleted 1 file.')).toBeVisible()
  await expect(files.getByText('Skyline Air.pdf')).toHaveCount(0)
  await expect(page.getByText('1000 B of 5 GB used (0%)')).toBeVisible()
})

test('manager sees the page without delete controls', async ({ page }) => {
  const f = await newFirm('Storage E2E Manager')
  await expenseWithFile(f, 500, 'Hotel')
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/settings/storage`)
  await expect(page.getByText('Hotel.pdf')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete selected' })).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
})

test('consultant gets 404 on the storage page', async ({ page }) => {
  const f = await newFirm('Storage E2E Consultant')
  await login(page, f.consultant.email)
  expect((await page.goto(`/f/${f.firmId}/settings/storage`))?.status()).toBe(404)
})

test('uploading a receipt in a full firm shows the full-storage message', async ({ page }) => {
  const f = await newFirm('Storage E2E Full')
  await expenseWithFile(f, 1000, 'Old')
  await setAllowance(f.firmId, 1000)
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/expenses/new`)
  await page.getByLabel('Category').selectOption({ label: 'Travel' })
  await page.getByLabel('Payee').fill('New Air')
  await page.getByLabel('Amount').fill('10.00')
  await page.getByLabel('Receipts').setInputFiles(REMITTANCE)
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByText(FULL)).toBeVisible()
})

test('dashboard shows the 80% notice and no banner', async ({ page }) => {
  const f = await newFirm('Storage E2E Notice')
  await expenseWithFile(f, 850, 'Notice')
  await setAllowance(f.firmId, 1000)
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}`)
  await expect(page.getByText("You've used 850 B of 1000 B of storage (85%).")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Manage storage' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Storage warning' })).toHaveCount(0)
})

test('a nearly full firm shows the warning banner on every page', async ({ page }) => {
  const f = await newFirm('Storage E2E Warning')
  await expenseWithFile(f, 960, 'Warn')
  await setAllowance(f.firmId, 1000)
  await login(page, f.admin.email)
  await page.goto(`/f/${f.firmId}/clients`)
  const banner = page.getByRole('region', { name: 'Storage warning' })
  await expect(banner).toContainText('Your firm has used 960 B of 1000 B of storage. Uploads stop at 100%.')
  await expect(banner.getByRole('link', { name: 'Free up space' })).toHaveAttribute('href', `/f/${f.firmId}/settings/storage`)
})

test('pages show the full banner with a Free up space link', async ({ page }) => {
  const f = await newFirm('Storage E2E Full Banner')
  await expenseWithFile(f, 1000, 'Full')
  await setAllowance(f.firmId, 1000)
  await login(page, f.manager.email)
  await page.goto(`/f/${f.firmId}/expenses`)
  const banner = page.getByRole('region', { name: 'Storage warning' })
  await expect(banner).toContainText('Storage is full (1000 B of 1000 B). Uploads are paused.')
  await expect(banner.getByRole('link', { name: 'Free up space' })).toBeVisible()
})

test('consultant sees no banner on a full firm', async ({ page }) => {
  const f = await newFirm('Storage E2E Consultant Banner')
  await expenseWithFile(f, 1000, 'Full')
  await setAllowance(f.firmId, 1000)
  await login(page, f.consultant.email)
  await page.goto(`/f/${f.firmId}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Storage warning' })).toHaveCount(0)
  await expect(page.getByText(/of storage/)).toHaveCount(0)
})
