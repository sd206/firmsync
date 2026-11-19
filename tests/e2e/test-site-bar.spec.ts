import { expect, test } from '@playwright/test'

// NEXT_PUBLIC_APP_ENV is inlined at build, and the whole e2e run shares one build, so this checks
// whichever way the run was built: normally unset (Prod and local behaviour: no bar). Building the
// run with NEXT_PUBLIC_APP_ENV=test (in .env.test.local) checks the Test site instead. The bar's
// content and the [TEST] prefixes are covered by unit tests.
const isTest = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() === 'test'

test(`sign-in page ${isTest ? 'shows' : 'has no'} TEST SITE bar`, async ({ page }) => {
  await page.goto('/login')
  const bar = page.getByRole('region', { name: 'Test site' })
  if (isTest) {
    await expect(bar).toHaveText("TEST SITE — fictional data only. Changes here don't affect real firms.")
    await expect(page).toHaveTitle(/^\[TEST\] VeriTreo$/)
  } else {
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(bar).toHaveCount(0)
    await expect(page).toHaveTitle(/^VeriTreo$/)
  }
})
