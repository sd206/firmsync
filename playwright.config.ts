import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test.local' })

// Bill inbox: a configured (fake) Resend setup for the test build; no mail is ever received in tests.
process.env.INBOUND_DOMAINS ??= 'test.resend.app'
process.env.RESEND_API_KEY ??= 're_test_not_real'
process.env.RESEND_INBOUND_SECRET ??= 'whsec_dGVzdC1vbmx5LXNlY3JldA=='
// Invoice emails go to the local Mailpit (bundled with local Supabase), never to Resend.
process.env.EMAIL_TRANSPORT ??= 'mailpit'
process.env.INVOICE_EMAIL_FROM ??= 'invoices@veritreo.test'

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    port: 3000,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
})
