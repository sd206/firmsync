import 'server-only'

type Env = Record<string, string | undefined>

/** Shown when an action needs the app's address to send an email and it isn't usable. */
export const SITE_URL_PROBLEM = "The app's address isn't set up correctly (NEXT_PUBLIC_SITE_URL), so no email was sent."

/**
 * Public site origin from NEXT_PUBLIC_SITE_URL, trimmed and without trailing slashes, or null
 * when unset. In production (VERCEL_ENV=production) it must be an https origin with no path,
 * query or credentials (the app's own address); anything else is logged and gives null, so a
 * typo in Vercel shows up as an error message instead of broken links in emails.
 */
export function siteUrlOrNull(env: Env = process.env): string | null {
  const raw = (env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '')
  if (!raw) return null
  if (env.VERCEL_ENV !== 'production') return raw
  try {
    const u = new URL(raw)
    if (u.protocol === 'https:' && u.pathname === '/' && !raw.includes('?') && !raw.includes('#') && !u.username && !u.password)
      return u.origin
  } catch {
    // not a URL
  }
  console.error('NEXT_PUBLIC_SITE_URL must be an https:// origin with no path in production')
  return null
}

/** `<site>/auth/callback`, the redirect for invites and sign-in links; null when the site URL isn't usable. */
export function authCallbackUrl(env: Env = process.env): string | null {
  const site = siteUrlOrNull(env)
  return site ? `${site}/auth/callback` : null
}
