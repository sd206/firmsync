type Env = Record<string, string | undefined>

const NOT_SET = 'NEXT_PUBLIC_SITE_URL is not set'
const INVALID = 'NEXT_PUBLIC_SITE_URL must be an https:// origin with no path in production'

/**
 * Reads NEXT_PUBLIC_SITE_URL, trimmed and without trailing slashes. In production
 * (VERCEL_ENV=production) it must be an https origin with no path (the app's own address),
 * so a typo in Vercel shows up as an error instead of broken links in emails.
 */
function check(env: Env): { url: string } | { error: string } {
  const raw = (env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '')
  if (!raw) return { error: NOT_SET }
  if (env.VERCEL_ENV !== 'production') return { url: raw }
  try {
    const u = new URL(raw)
    if (u.protocol === 'https:' && u.pathname === '/' && !u.search && !u.hash) return { url: raw }
  } catch {
    // not a URL
  }
  return { error: INVALID }
}

/** Public site origin, or null when it is unset or (in production) invalid. */
export function siteUrlOrNull(env: Env = process.env): string | null {
  const r = check(env)
  return 'url' in r ? r.url : null
}

/** Public site origin, used to build auth redirect links. Throws if not configured or invalid. */
export function siteUrl(): string {
  const r = check(process.env)
  if ('error' in r) throw new Error(r.error)
  return r.url
}
