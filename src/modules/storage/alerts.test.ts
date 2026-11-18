import { describe, expect, it, vi } from 'vitest'
import type { SendEmail } from '@/lib/email/send'
import { afterStore } from './alerts'

const FIRM = '11111111-1111-4111-8111-111111111111'
const ENV = { NOTIFY_FROM: 'VeriTreo <alerts@example.test>', RESEND_API_KEY: 're_test', NEXT_PUBLIC_SITE_URL: 'https://app.example.test' }

/** A stand-in for the service-role client: just the calls afterStore makes. */
function fakeDb(opts: { send: boolean; rpcError?: boolean }) {
  return {
    rpc: vi.fn(async (fn: string) => {
      if (opts.rpcError) return { data: null, error: { message: 'boom' } }
      if (fn === 'storage_alert_check') return { data: opts.send, error: null }
      if (fn === 'firm_storage_used') return { data: 5_100_000_000, error: null }
      if (fn === 'firm_storage_allowance') return { data: 5_368_709_120, error: null }
      return { data: null, error: { message: `unexpected ${fn}` } }
    }),
    from: vi.fn((table: string) => {
      const rows =
        table === 'firms'
          ? [{ name: 'Demo Consulting' }]
          : [
              { role: 'admin', profiles: { email: 'a1@example.test' } },
              { role: 'admin', profiles: { email: 'a2@example.test' } },
            ]
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: rows[0], error: null }),
        then: (res: (v: unknown) => void) => res({ data: rows, error: null }),
      }
      return q
    }),
  }
}

describe('afterStore', () => {
  it('emails every admin when the check says to', async () => {
    const send = vi.fn<SendEmail>(async () => ({ id: null }))
    await afterStore(FIRM, { db: fakeDb({ send: true }) as never, send, env: ENV })
    expect(send).toHaveBeenCalledTimes(1)
    const msg = send.mock.calls[0][0]
    expect(msg.from).toBe(ENV.NOTIFY_FROM)
    expect(msg.to).toEqual(['a1@example.test', 'a2@example.test'])
    expect(msg.subject).toBe('Demo Consulting is using 95% of its VeriTreo storage')
    expect(msg.text).toContain('4.7 GB of 5 GB')
    expect(msg.text).toContain(`https://app.example.test/f/${FIRM}/settings/storage`)
  })

  it('builds the link without a double slash when the site URL ends in /', async () => {
    const send = vi.fn<SendEmail>(async () => ({ id: null }))
    await afterStore(FIRM, { db: fakeDb({ send: true }) as never, send, env: { ...ENV, NEXT_PUBLIC_SITE_URL: 'https://app.example.test/' } })
    expect(send.mock.calls[0][0].text).toContain(`https://app.example.test/f/${FIRM}/settings/storage`)
  })

  it('uses plain wording instead of a broken link when the site URL is unset', async () => {
    const send = vi.fn<SendEmail>(async () => ({ id: null }))
    await afterStore(FIRM, { db: fakeDb({ send: true }) as never, send, env: { ...ENV, NEXT_PUBLIC_SITE_URL: undefined } })
    expect(send).toHaveBeenCalledTimes(1)
    const text = send.mock.calls[0][0].text
    expect(text).toContain('Open Settings › Storage in VeriTreo to see what is using space.')
    expect(text).not.toContain('/f/')
  })

  it('still sends, with the plain wording, when the site URL is invalid in production', async () => {
    const send = vi.fn<SendEmail>(async () => ({ id: null }))
    const env = { ...ENV, VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://app.example.test' }
    await afterStore(FIRM, { db: fakeDb({ send: true }) as never, send, env })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].text).toContain('Open Settings › Storage in VeriTreo')
  })

  it('sends nothing when the check says no', async () => {
    const send = vi.fn<SendEmail>(async () => ({ id: null }))
    await afterStore(FIRM, { db: fakeDb({ send: false }) as never, send, env: ENV })
    expect(send).not.toHaveBeenCalled()
  })

  it('skips the check and sending when NOTIFY_FROM is not set', async () => {
    const send = vi.fn<SendEmail>(async () => ({ id: null }))
    const db = fakeDb({ send: true })
    await afterStore(FIRM, { db: db as never, send, env: { ...ENV, NOTIFY_FROM: undefined } })
    expect(send).not.toHaveBeenCalled()
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('never throws on database or send errors', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(afterStore(FIRM, { db: fakeDb({ send: false, rpcError: true }) as never, env: ENV })).resolves.toBeUndefined()
    const send = vi.fn<SendEmail>(async () => {
      throw new Error('resend down')
    })
    await expect(afterStore(FIRM, { db: fakeDb({ send: true }) as never, send, env: ENV })).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
