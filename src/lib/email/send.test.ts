import { describe, expect, it, vi } from 'vitest'
import { createSender, emailConfig, invoiceEmailReady, type MailMessage } from './send'

const MSG: MailMessage = {
  from: '"Demo Consulting via FirmSync" <invoices@x.test>',
  to: ['ap@demo-client.test'],
  cc: ['cc@demo-client.test'],
  replyTo: 'billing@demo-consulting.test',
  subject: 'Invoice INV-1 from Demo Consulting',
  text: 'Hello',
  attachments: [{ filename: 'INV-1.pdf', content: new Uint8Array([37, 80, 68, 70]), contentType: 'application/pdf' }],
  idempotencyKey: 'abc-123',
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  )
}

describe('emailConfig', () => {
  it('is off with no transport', () => {
    expect(emailConfig({})).toEqual({ ok: false })
  })

  it('uses Resend when a key is set, with no from address yet', () => {
    expect(emailConfig({ RESEND_API_KEY: 're_x' })).toEqual({ ok: true, transport: 'resend', fromAddress: null })
  })

  it('takes the from address from NOTIFY_FROM', () => {
    expect(emailConfig({ RESEND_API_KEY: 're_x', NOTIFY_FROM: 'FirmSync <alerts@x.test>' })).toEqual({
      ok: true,
      transport: 'resend',
      fromAddress: 'alerts@x.test',
    })
  })

  it('prefers INVOICE_EMAIL_FROM', () => {
    const c = emailConfig({ RESEND_API_KEY: 're_x', NOTIFY_FROM: 'a@x.test', INVOICE_EMAIL_FROM: 'invoices@x.test' })
    expect(c).toEqual({ ok: true, transport: 'resend', fromAddress: 'invoices@x.test' })
  })

  it('uses Mailpit only for a local URL', () => {
    expect(emailConfig({ EMAIL_TRANSPORT: 'mailpit', INVOICE_EMAIL_FROM: 'i@x.test' })).toEqual({
      ok: true,
      transport: 'mailpit',
      fromAddress: 'i@x.test',
    })
    expect(emailConfig({ EMAIL_TRANSPORT: 'mailpit', MAILPIT_URL: 'http://10.0.0.5:54424' })).toEqual({ ok: false })
  })

  it('invoiceEmailReady needs both a transport and a from address', () => {
    expect(invoiceEmailReady({ RESEND_API_KEY: 're_x' })).toBe(false)
    expect(invoiceEmailReady({ RESEND_API_KEY: 're_x', INVOICE_EMAIL_FROM: 'i@x.test' })).toBe(true)
    expect(invoiceEmailReady({ INVOICE_EMAIL_FROM: 'i@x.test' })).toBe(false)
  })
})

describe('createSender', () => {
  it('returns null when email is off', () => {
    expect(createSender({})).toBeNull()
  })

  it('posts to Resend with the key, idempotency key and a base64 attachment', async () => {
    const f = fakeFetch(200, { id: 'resend-1' })
    const send = createSender({ RESEND_API_KEY: 're_secret' }, f as never)!
    await expect(send(MSG)).resolves.toEqual({ id: 'resend-1' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer re_secret')
    expect(headers['Idempotency-Key']).toBe('abc-123')
    expect(JSON.parse(init!.body as string)).toEqual({
      from: MSG.from,
      to: MSG.to,
      cc: MSG.cc,
      reply_to: MSG.replyTo,
      subject: MSG.subject,
      text: 'Hello',
      attachments: [{ filename: 'INV-1.pdf', content: 'JVBERg==' }],
    })
  })

  it('posts to Mailpit in its own format', async () => {
    const f = fakeFetch(200, { ID: 'mp-1' })
    const send = createSender({ EMAIL_TRANSPORT: 'mailpit' }, f as never)!
    await expect(send(MSG)).resolves.toEqual({ id: 'mp-1' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:54424/api/v1/send')
    expect(JSON.parse(init!.body as string)).toEqual({
      From: { Email: 'invoices@x.test', Name: 'Demo Consulting via FirmSync' },
      To: [{ Email: 'ap@demo-client.test' }],
      Cc: [{ Email: 'cc@demo-client.test' }],
      ReplyTo: [{ Email: 'billing@demo-consulting.test' }],
      Subject: MSG.subject,
      Text: 'Hello',
      Attachments: [{ Filename: 'INV-1.pdf', Content: 'JVBERg==', ContentType: 'application/pdf' }],
    })
  })

  it('rejects on an error response without leaking the key', async () => {
    const f = fakeFetch(500, 'upstream exploded '.repeat(50))
    const send = createSender({ RESEND_API_KEY: 're_secret' }, f as never)!
    const err = await send(MSG).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/^resend send failed: 500/)
    expect((err as Error).message).not.toContain('re_secret')
    expect((err as Error).message.length).toBeLessThan(260)
  })
})
