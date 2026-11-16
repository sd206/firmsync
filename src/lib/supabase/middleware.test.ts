import { describe, expect, it } from 'vitest'
import { isPublicPath } from './middleware'

describe('isPublicPath', () => {
  it('lets webhooks and sign-in pages through without a session', () => {
    expect(isPublicPath('/api/inbound/resend')).toBe(true)
    expect(isPublicPath('/login')).toBe(true)
    expect(isPublicPath('/auth/confirm')).toBe(true)
    expect(isPublicPath('/f/123/vendor-bills')).toBe(false)
    expect(isPublicPath('/api/other')).toBe(false)
  })
})
