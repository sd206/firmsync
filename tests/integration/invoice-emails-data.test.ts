import { describe, expect, it } from 'vitest'
import {
  finishInvoiceEmail,
  lastEmails,
  listInvoiceEmails,
  loadSendContext,
  saveEmailTemplate,
  startInvoiceEmail,
} from '@/modules/invoice-emails/data'
import { adminDb, newFirm } from './helpers'
import { issueManualInvoice } from './invoice-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

async function sendable(f: Firm): Promise<string> {
  const { invoiceId } = await issueManualInvoice(f, 1200)
  await adminDb()
    .from('invoices')
    .update({ pdf_path: `firms/${f.firmId}/invoices/${invoiceId}/a.pdf` })
    .eq('id', invoiceId)
  return invoiceId
}

const START = {
  to: ['ap@demo-client.test'],
  cc: ['cc@demo-client.test'],
  replyTo: 'billing@demo-consulting.test',
  subject: 'Invoice from Demo Consulting',
  body: 'Attached.',
}

describe('invoice email data', () => {
  it('loads the send context for an invoice in the firm', async () => {
    const f = await newFirm('Demo Consulting')
    await adminDb().from('firms').update({ contact_email: 'billing@demo-consulting.test' }).eq('id', f.firmId)
    const invoiceId = await sendable(f)
    const r = await loadSendContext(f.manager.db, f.firmId, invoiceId)
    expect(r.ok && r.data.firmName).toBe('Demo Consulting')
    expect(r.ok && r.data.firmContactEmail).toBe('billing@demo-consulting.test')
    expect(r.ok && r.data.pdfPath).toBe(`firms/${f.firmId}/invoices/${invoiceId}/a.pdf`)
    expect(r.ok && r.data.invoiceNumber).toMatch(/^INV-/)

    const other = await newFirm('Other Consulting')
    expect((await loadSendContext(other.manager.db, other.firmId, invoiceId)).ok).toBe(false)
  })

  it('records a send, lists it with the sender, and reports the last send', async () => {
    const f = await newFirm('Email Data Firm')
    const invoiceId = await sendable(f)
    const started = await startInvoiceEmail(f.manager.db, invoiceId, START)
    expect(started.ok).toBe(true)
    const id = started.ok ? started.data : ''
    expect(await finishInvoiceEmail(f.manager.db, id, { ok: true, providerId: 'p-1', error: null })).toEqual({
      ok: true,
      data: undefined,
    })

    const list = await listInvoiceEmails(f.manager.db, f.firmId, invoiceId)
    expect(list.ok).toBe(true)
    const rows = list.ok ? list.data : []
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id,
      status: 'sent',
      to: START.to,
      cc: START.cc,
      subject: START.subject,
      body: START.body,
      senderEmail: f.manager.email,
      error: null,
    })
    expect(rows[0].sentAt).not.toBeNull()

    const last = await lastEmails(f.manager.db, f.firmId)
    expect(last.ok && last.data.get(invoiceId)?.to).toEqual(START.to)
  })

  it('maps a refused send to a friendly message', async () => {
    const f = await newFirm('Email Data Refused Firm')
    const invoiceId = await sendable(f)
    await startInvoiceEmail(f.manager.db, invoiceId, START)
    expect(await startInvoiceEmail(f.manager.db, invoiceId, START)).toEqual({
      ok: false,
      error: 'Too many invoice emails. Try again in a few minutes.',
    })
  })

  it('saves and resets the firm wording', async () => {
    const f = await newFirm('Email Data Template Firm')
    expect((await saveEmailTemplate(f.manager.db, f.firmId, { subject: 'Bill {invoice_number}', body: 'Hi' })).ok).toBe(true)
    let { data } = await adminDb().from('firms').select('invoice_email_subject, invoice_email_body').eq('id', f.firmId).single()
    expect(data).toEqual({ invoice_email_subject: 'Bill {invoice_number}', invoice_email_body: 'Hi' })

    expect((await saveEmailTemplate(f.manager.db, f.firmId, { subject: null, body: null })).ok).toBe(true)
    ;({ data } = await adminDb().from('firms').select('invoice_email_subject, invoice_email_body').eq('id', f.firmId).single())
    expect(data).toEqual({ invoice_email_subject: null, invoice_email_body: null })

    expect(await saveEmailTemplate(f.consultant.db, f.firmId, { subject: 'x', body: 'y' })).toEqual({
      ok: false,
      error: "You don't have permission to do that.",
    })
  })
})
