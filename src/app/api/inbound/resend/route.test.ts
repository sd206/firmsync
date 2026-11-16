import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const receive = vi.fn(async () => ({ stored: 1 }))
vi.mock('@/modules/bill-inbox/receive', () => ({ receiveInbound: receive }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminDb: () => ({}) }))

const KEY = Buffer.from('route-test-key-0123456789abcdef!')
const ENV = { RESEND_API_KEY: 're_test', RESEND_INBOUND_SECRET: `whsec_${KEY.toString('base64')}`, INBOUND_DOMAINS: 'test.resend.app' }

function request(body: string, sign = true) {
  const id = 'msg_1'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', sign ? KEY : Buffer.from('wrong')).update(`${id}.${ts}.${body}`).digest('base64')
  return new Request('http://localhost/api/inbound/resend', {
    method: 'POST',
    body,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` },
  })
}

const received = JSON.stringify({
  type: 'email.received',
  created_at: '2026-11-16T09:00:00Z',
  data: { email_id: 'e1', from: 'ap@acme.test', to: ['bills-aaaaaaaaaa@test.resend.app'], subject: 'Hi', created_at: '2026-11-16T09:00:00Z' },
})

describe('POST /api/inbound/resend', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    receive.mockClear()
    Object.assign(process.env, ENV)
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('answers 503 when the server is not set up', async () => {
    delete process.env.RESEND_INBOUND_SECRET
    const { POST } = await import('./route')
    expect((await POST(request(received))).status).toBe(503)
  })

  it('answers 401 for a bad signature and does nothing', async () => {
    const { POST } = await import('./route')
    expect((await POST(request(received, false))).status).toBe(401)
    expect(receive).not.toHaveBeenCalled()
  })

  it('ignores other events and passes email.received on', async () => {
    const { POST } = await import('./route')
    expect((await POST(request(JSON.stringify({ type: 'email.sent', data: {} })))).status).toBe(200)
    expect(receive).not.toHaveBeenCalled()
    expect((await POST(request(received))).status).toBe(200)
    expect(receive).toHaveBeenCalledTimes(1)
    const call = receive.mock.calls[0] as unknown as [{ domains: string[] }, { email_id: string; to: string[] }]
    expect(call[0].domains).toEqual(['test.resend.app'])
    expect(call[1]).toMatchObject({ email_id: 'e1', to: ['bills-aaaaaaaaaa@test.resend.app'] })
  })
})
