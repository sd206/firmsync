import { afterEach, describe, expect, it, vi } from 'vitest'
import { authCallbackUrl, siteUrlOrNull } from './site-url'

const PROD = { VERCEL_ENV: 'production' }

describe('siteUrlOrNull', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is null when unset or blank', () => {
    expect(siteUrlOrNull({})).toBeNull()
    expect(siteUrlOrNull({ NEXT_PUBLIC_SITE_URL: '  ' })).toBeNull()
  })

  it('outside production, accepts any value and drops trailing slashes', () => {
    expect(siteUrlOrNull({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000/' })).toBe('http://localhost:3000')
    expect(siteUrlOrNull({ NEXT_PUBLIC_SITE_URL: 'http://x' })).toBe('http://x')
    expect(siteUrlOrNull({ VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: 'http://x' })).toBe('http://x')
  })

  it('in production, accepts an https origin, trimmed and without trailing slash', () => {
    for (const v of ['https://app.veritreo.com', 'https://app.veritreo.com/', ' https://app.veritreo.com \n', 'https://APP.veritreo.com'])
      expect(siteUrlOrNull({ ...PROD, NEXT_PUBLIC_SITE_URL: v })).toBe('https://app.veritreo.com')
  })

  it('in production, rejects and logs http, paths, queries, fragments, credentials and values without a scheme', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = [
      'http://app.veritreo.com',
      'https://app.veritreo.com/app',
      'app.veritreo.com',
      'https://app.veritreo.com?x=1',
      'https://app.veritreo.com/?',
      'https://app.veritreo.com/#',
      'https://user:pw@app.veritreo.com',
    ]
    for (const v of bad) expect(siteUrlOrNull({ ...PROD, NEXT_PUBLIC_SITE_URL: v }), v).toBeNull()
    expect(err).toHaveBeenCalledTimes(bad.length)
  })
})

describe('authCallbackUrl', () => {
  it('appends /auth/callback, or is null when the site URL is unusable', () => {
    expect(authCallbackUrl({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000/' })).toBe('http://localhost:3000/auth/callback')
    expect(authCallbackUrl({})).toBeNull()
  })
})
