import { describe, expect, it, vi } from 'vitest'
import { MailNoResponseError, type SendEmail } from '@/lib/email/send'
import { fail, ok } from '@/lib/result'
import { NO_RESPONSE_PREFIX } from './history'
import {
  composeDefaults,
  NOT_SET_UP,
  SEND_FAILED,
  sendInvoiceEmail,
  UNCONFIRMED,
  type SendContext,
  type SendDeps,
} from './send'

const ENV = { EMAIL_TRANSPORT: 'mailpit', INVOICE_EMAIL_FROM: 'invoices@veritreo.test' }
const PDF = new Uint8Array([37, 80, 68, 70])

const CTX: SendContext = {
  invoiceNumber: 'INV-2026/0012',
  pdfPath: 'firms/f/invoices/i/a.pdf',
  firmName: 'Demo "Consulting"',
  firmContactEmail: 'billing@demo-consulting.test',
}

const INPUT = {
  senderEmail: 'manager@demo-consulting.test',
  to: 'AP@demo-client.test',
  cc: '',
  copyMe: false,
  subject: 'Invoice INV-2026/0012\r\nBcc: x@evil.test',
  body: 'Please find it attached.',
}

function deps(over: Partial<SendDeps> = {}) {
  const calls: string[] = []
  const d = {
    env: ENV,
    loadContext: vi.fn(async () => {
      calls.push('load')
      return ok(CTX)
    }),
    start: vi.fn(async () => {
      calls.push('start')
      return ok('email-1')
    }),
    readPdf: vi.fn(async () => {
      calls.push('readPdf')
      return ok(PDF)
    }),
    send: vi.fn<SendEmail>(async () => {
      calls.push('send')
      return { id: 'provider-1' }
    }),
    finish: vi.fn(async () => {
      calls.push('finish')
      return ok(undefined)
    }),
    ...over,
  }
  return { d, calls }
}

describe('sendInvoiceEmail', () => {
  it('records, sends with the PDF attached, then marks it sent', async () => {
    const { d, calls } = deps()
    const r = await sendInvoiceEmail(d, INPUT)
    expect(r).toEqual({ ok: true, data: { to: ['ap@demo-client.test'], number: 'INV-2026/0012' } })
    expect(calls).toEqual(['load', 'start', 'readPdf', 'send', 'finish'])

    expect(d.start).toHaveBeenCalledWith({
      to: ['ap@demo-client.test'],
      cc: [],
      replyTo: 'billing@demo-consulting.test',
      subject: 'Invoice INV-2026/0012 Bcc: x@evil.test',
      body: 'Please find it attached.',
    })
    const msg = vi.mocked(d.send).mock.calls[0][0]
    expect(msg.from).toBe('"Demo Consulting via VeriTreo" <invoices@veritreo.test>')
    expect(msg.replyTo).toBe('billing@demo-consulting.test')
    expect(msg.subject).toBe('Invoice INV-2026/0012 Bcc: x@evil.test')
    expect(msg.text).toBe('Please find it attached.')
    expect(msg.idempotencyKey).toBe('email-1')
    expect(msg.attachments).toEqual([{ filename: 'INV-2026-0012.pdf', content: PDF, contentType: 'application/pdf' }])
    expect(d.readPdf).toHaveBeenCalledWith(CTX.pdfPath)
    expect(d.finish).toHaveBeenCalledWith('email-1', { ok: true, providerId: 'provider-1', error: null })
  })

  it("replies to the sender when the firm has no contact email, and copies them when asked", async () => {
    const { d } = deps({ loadContext: vi.fn(async () => ok({ ...CTX, firmContactEmail: null })) })
    await sendInvoiceEmail(d, { ...INPUT, cc: 'boss@demo-client.test', copyMe: true })
    const msg = vi.mocked(d.send).mock.calls[0][0]
    expect(msg.replyTo).toBe('manager@demo-consulting.test')
    expect(msg.cc).toEqual(['boss@demo-client.test', 'manager@demo-consulting.test'])
  })

  it('does nothing when email is not set up', async () => {
    const { d, calls } = deps({ env: { EMAIL_TRANSPORT: 'mailpit' } })
    expect(await sendInvoiceEmail(d, INPUT)).toEqual({ ok: false, error: NOT_SET_UP })
    expect(calls).toEqual([])
  })

  it('refuses bad recipients before recording anything', async () => {
    const { d, calls } = deps()
    const r = await sendInvoiceEmail(d, { ...INPUT, to: 'not-an-address' })
    expect(r).toMatchObject({ ok: false, fieldErrors: { to: "not-an-address isn't a valid email address." } })
    expect(calls).toEqual([])
  })

  it('refuses an empty message', async () => {
    const { d, calls } = deps()
    const r = await sendInvoiceEmail(d, { ...INPUT, body: '   ' })
    expect(r).toMatchObject({ ok: false, fieldErrors: { body: 'Enter a message.' } })
    expect(calls).toEqual([])
  })

  it('stops when the database refuses the send', async () => {
    const { d, calls } = deps({ start: vi.fn(async () => fail('Too many invoice emails. Try again in a few minutes.')) })
    expect(await sendInvoiceEmail(d, INPUT)).toEqual({
      ok: false,
      error: 'Too many invoice emails. Try again in a few minutes.',
    })
    expect(calls).toEqual(['load'])
    expect(d.send).not.toHaveBeenCalled()
  })

  it('marks the send failed and says nothing was delivered when the provider fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d } = deps({
      send: vi.fn<SendEmail>(async () => {
        throw new Error('resend send failed: 500')
      }),
    })
    expect(await sendInvoiceEmail(d, INPUT)).toEqual({ ok: false, error: SEND_FAILED })
    expect(d.finish).toHaveBeenCalledWith('email-1', { ok: false, providerId: null, error: 'resend send failed: 500' })
    err.mockRestore()
  })

  it("says it couldn't confirm delivery, and records that, when the provider gives no answer", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { d } = deps({
      send: vi.fn<SendEmail>(async () => {
        throw new MailNoResponseError('resend: no response (TimeoutError)')
      }),
    })
    expect(await sendInvoiceEmail(d, INPUT)).toEqual({ ok: false, error: UNCONFIRMED })
    expect(d.finish).toHaveBeenCalledWith('email-1', {
      ok: false,
      providerId: null,
      error: `${NO_RESPONSE_PREFIX}resend: no response (TimeoutError)`,
    })
    err.mockRestore()
  })

  it('marks the send failed when the stored PDF cannot be read', async () => {
    const { d } = deps({ readPdf: vi.fn(async () => fail('PDF not found.')) })
    expect(await sendInvoiceEmail(d, INPUT)).toEqual({ ok: false, error: SEND_FAILED })
    expect(d.send).not.toHaveBeenCalled()
    expect(d.finish).toHaveBeenCalledWith('email-1', { ok: false, providerId: null, error: 'PDF not found.' })
  })
})

describe('composeDefaults', () => {
  const invoice = {
    number: 'INV-2026-0012',
    clientName: 'Demo Client Ltd',
    billToName: 'Demo Client Ltd',
    billToContactName: 'Old Contact',
    billToEmail: 'old@demo-client.test',
    total: '1200.00',
    balanceDue: '1200.00',
    currency: 'USD',
    issueDate: '2026-11-01',
    dueDate: '2026-12-01',
    subject: null,
  }
  const firm = { name: 'Demo Consulting', contactEmail: '', emailSubject: null, emailBody: null }

  it("uses the client's current billing email and the built-in wording", () => {
    const d = composeDefaults({
      invoice,
      firm,
      client: { billingEmail: 'ap@demo-client.test', contactName: 'Pat Payable' },
      senderEmail: 'manager@demo-consulting.test',
      env: ENV,
    })
    expect(d.to).toBe('ap@demo-client.test')
    expect(d.subject).toBe('Invoice INV-2026-0012 from Demo Consulting')
    expect(d.body).toContain('Hi Pat Payable,')
    expect(d.from).toBe('"Demo Consulting via VeriTreo" <invoices@veritreo.test>')
    expect(d.replyTo).toBe('manager@demo-consulting.test')
  })

  it('falls back to the email on the invoice, and uses the firm wording', () => {
    const d = composeDefaults({
      invoice,
      firm: { ...firm, contactEmail: 'billing@demo-consulting.test', emailSubject: 'Bill {invoice_number}', emailBody: 'Dear {client_contact}' },
      client: { billingEmail: null, contactName: null },
      senderEmail: 'manager@demo-consulting.test',
      env: {},
    })
    expect(d.to).toBe('old@demo-client.test')
    expect(d.subject).toBe('Bill INV-2026-0012')
    expect(d.body).toBe('Dear Old Contact')
    expect(d.from).toBeNull()
    expect(d.replyTo).toBe('billing@demo-consulting.test')
  })
})
