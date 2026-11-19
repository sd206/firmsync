/**
 * Which site this build is. `NEXT_PUBLIC_APP_ENV=test` marks the Test site:
 * a "TEST SITE" bar on every page and "[TEST] " on the tab title and outgoing app emails.
 * Anything else, or unset, is Prod or local and shows nothing.
 *
 * Being a NEXT_PUBLIC_ variable it is inlined at build time: a change needs a redeploy.
 * The default argument must stay the literal `process.env.NEXT_PUBLIC_APP_ENV` for Next to inline it.
 */
export function isTestSite(appEnv: string | undefined = process.env.NEXT_PUBLIC_APP_ENV): boolean {
  return appEnv?.trim().toLowerCase() === 'test'
}

export const TEST_PREFIX = '[TEST] '

/** `[TEST] text` on the Test site (never twice), else the text unchanged. */
export function testPrefixed(text: string, appEnv: string | undefined = process.env.NEXT_PUBLIC_APP_ENV): string {
  return isTestSite(appEnv) && !text.startsWith(TEST_PREFIX) ? `${TEST_PREFIX}${text}` : text
}
