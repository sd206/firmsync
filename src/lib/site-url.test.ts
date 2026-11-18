import { afterEach, describe, expect, it, vi } from 'vitest'
import { siteUrl, siteUrlOrNull } from './site-url'

const PROD = { VERCEL_ENV: 'production' }

describe('siteUrlOrNull', () => {
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
    for (const v of ['https://app.veritreo.com', 'https://app.veritreo.com/', ' https://app.veritreo.com '])
      expect(siteUrlOrNull({ ...PROD, NEXT_PUBLIC_SITE_URL: v })).toBe('https://app.veritreo.com')
  })

  it('in production, rejects http, paths, queries and values without a scheme', () => {
    for (const v of ['http://app.veritreo.com', 'https://app.veritreo.com/app', 'app.veritreo.com', 'https://app.veritreo.com?x=1'])
      expect(siteUrlOrNull({ ...PROD, NEXT_PUBLIC_SITE_URL: v })).toBeNull()
  })
})

describe('siteUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('throws when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(() => siteUrl()).toThrow(/is not set/)
  })

  it('throws in production for a value that is not an https origin', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://app.veritreo.com')
    expect(() => siteUrl()).toThrow(/https:\/\/ origin/)
  })

  it('returns the checked value in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.veritreo.com/')
    expect(siteUrl()).toBe('https://app.veritreo.com')
  })
})
