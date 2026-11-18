import { describe, expect, it, vi } from 'vitest'
import { createSender, emailConfig, invoiceEmailReady, MailNoResponseError, type MailMessage } from './send'

const MSG: MailMessage = {
  from: '"Demo Consulting via VeriTreo" <invoices@x.test>',
  to: ['ap@demo-client.test'],
  cc: ['cc@demo-client.test'],
  replyTo: 'billing@demo-consulting.test',
  subject: 'Invoice INV-1 from Demo Consulting',
  text: 'Hello',
  attachments: [{ filename: 'INV-1.pdf', content: new Uint8Array([37, 80, 68, 70]), contentType: 'application/pdf' }],
  idempotencyKey: 'abc-123',
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
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
    expect(emailConfig({ RESEND_API_KEY: 're_x', NOTIFY_FROM: 'VeriTreo <alerts@x.test>' })).toEqual({
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
      From: { Email: 'invoices@x.test', Name: 'Demo Consulting via VeriTreo' },
      To: [{ Email: 'ap@demo-client.test' }],
      Cc: [{ Email: 'cc@demo-client.test' }],
      ReplyTo: [{ Email: 'billing@demo-consulting.test' }],
      Subject: MSG.subject,
      Text: 'Hello',
      Attachments: [{ Filename: 'INV-1.pdf', Content: 'JVBERg==', ContentType: 'application/pdf' }],
    })
  })

  it('retries once with the same idempotency key when the service gives no answer', async () => {
    const f = vi
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'resend-2' }), { status: 200 }))
    const send = createSender({ RESEND_API_KEY: 're_secret' }, f as never)!
    await expect(send(MSG)).resolves.toEqual({ id: 'resend-2' })
    expect(f).toHaveBeenCalledTimes(2)
    const keys = f.mock.calls.map(([, init]) => (init!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys).toEqual(['abc-123', 'abc-123'])
  })

  it('reports no answer as MailNoResponseError after the retry', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const send = createSender({ RESEND_API_KEY: 're_secret' }, f as never)!
    await expect(send(MSG)).rejects.toBeInstanceOf(MailNoResponseError)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the service rejected the email (4xx)', async () => {
    const f = fakeFetch(422, { name: 'validation_error', message: 'Invalid `to` field.' })
    const send = createSender({ RESEND_API_KEY: 're_secret' }, f as never)!
    const err = await send(MSG).catch((e: Error) => e)
    expect(err).not.toBeInstanceOf(MailNoResponseError)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['409 (Resend still processing the first request)', 409, { name: 'concurrent_idempotent_requests' }],
    ['500', 500, { name: 'internal_server_error' }],
  ])('treats a timeout followed by %s as unconfirmed', async (_label, status, body) => {
    const f = vi
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))
    const send = createSender({ RESEND_API_KEY: 're_secret' }, f as never)!
    await expect(send(MSG)).rejects.toBeInstanceOf(MailNoResponseError)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('retries a first-attempt 5xx with the same key, and reports a second 5xx as unconfirmed', async () => {
    const ok = vi
      .fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'resend-3' }), { status: 200 }))
    await expect(createSender({ RESEND_API_KEY: 're_secret' }, ok as never)!(MSG)).resolves.toEqual({ id: 'resend-3' })
    const keys = ok.mock.calls.map(([, init]) => (init!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys).toEqual(['abc-123', 'abc-123'])

    const down = fakeFetch(502, 'bad gateway')
    await expect(createSender({ RESEND_API_KEY: 're_secret' }, down as never)!(MSG)).rejects.toBeInstanceOf(MailNoResponseError)
    expect(down).toHaveBeenCalledTimes(2)
  })

  it('treats a 5xx as unconfirmed without retrying when there is no idempotency key', async () => {
    const f = fakeFetch(500, 'oops')
    const send = createSender({ RESEND_API_KEY: 're_secret' }, f as never)!
    await expect(send({ ...MSG, idempotencyKey: undefined })).rejects.toBeInstanceOf(MailNoResponseError)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('gives the retry a shorter timeout, so an unanswered send ends within 25 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await createSender({ RESEND_API_KEY: 're_secret' }, f as never)!(MSG).catch(() => {})
    expect(timeout.mock.calls.map((c) => c[0])).toEqual([15_000, 10_000])
    timeout.mockRestore()
  })

  it('keeps only the status and the error name in the error, never the body or the key', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeFetch(422, { name: 'validation_error', message: 'The ap@demo-client.test address is on a suppression list.' })
    const e = await createSender({ RESEND_API_KEY: 're_secret' }, f as never)!(MSG).catch((x: Error) => x)
    expect((e as Error).message).toBe('resend send failed: 422 validation_error')

    const plain = fakeFetch(400, 'not json at all '.repeat(40))
    const e2 = await createSender({ RESEND_API_KEY: 're_secret' }, plain as never)!(MSG).catch((x: Error) => x)
    expect((e2 as Error).message).toBe('resend send failed: 400')
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})
