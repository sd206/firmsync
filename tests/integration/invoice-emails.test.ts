import { describe, expect, it } from 'vitest'
import { adminDb, newFirm, type TestUser } from './helpers'
import { createManualDraft, issueManualInvoice } from './invoice-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>
type DbErr = { code?: string; message?: string; details?: string } | null

const text = (e: DbErr) => `${e?.message} ${e?.details}`
const TO = ['ap@demo-client.test']

/** An issued invoice with a stored PDF path, ready to email. */
async function sendable(f: Firm): Promise<string> {
  const { invoiceId } = await issueManualInvoice(f, 1200)
  const { error } = await adminDb()
    .from('invoices')
    .update({ pdf_path: `firms/${f.firmId}/invoices/${invoiceId}/${crypto.randomUUID()}.pdf` })
    .eq('id', invoiceId)
  if (error) throw new Error(`pdf_path update failed: ${error.message}`)
  return invoiceId
}

function start(user: TestUser, invoiceId: string, over: Record<string, unknown> = {}) {
  return user.db.rpc('invoice_email_start', {
    p_invoice: invoiceId,
    p_to: TO,
    p_cc: [],
    p_reply_to: 'billing@demo-consulting.test',
    p_subject: 'Invoice from Demo Consulting',
    p_body: 'Please find the invoice attached.',
    ...over,
  })
}

async function startOk(user: TestUser, invoiceId: string): Promise<string> {
  const { data, error } = await start(user, invoiceId)
  if (error || !data) throw new Error(`invoice_email_start failed: ${error?.message}`)
  return data as string
}

function finish(user: TestUser, id: string, ok = true) {
  return user.db.rpc('invoice_email_finish', {
    p_id: id,
    p_ok: ok,
    p_provider_id: ok ? 'msg-1' : null,
    p_error: ok ? null : 'resend send failed: 500',
  })
}

/** Moves every email row of the invoice back in time so the 60-second rule doesn't apply. */
async function backdate(invoiceId: string, seconds = 120) {
  const at = new Date(Date.now() - seconds * 1000).toISOString()
  const { error } = await adminDb().from('invoice_emails').update({ created_at: at }).eq('invoice_id', invoiceId)
  if (error) throw new Error(`backdate failed: ${error.message}`)
}

async function emailRow(id: string) {
  const { data, error } = await adminDb().from('invoice_emails').select('*').eq('id', id).single()
  if (error || !data) throw new Error(`email read failed: ${error?.message}`)
  return data as { status: string; sent_at: string | null; provider_message_id: string | null; error: string | null; pdf_path: string; created_by: string }
}

describe('invoice_email_start and finish', () => {
  it('lets a manager record a send and mark it sent', async () => {
    const f = await newFirm('Email Manager Firm')
    const invoiceId = await sendable(f)
    const id = await startOk(f.manager, invoiceId)
    let row = await emailRow(id)
    expect(row.status).toBe('sending')
    expect(row.created_by).toBe(f.manager.id)
    expect(row.pdf_path).toMatch(new RegExp(`^firms/${f.firmId}/invoices/${invoiceId}/`))

    const { error } = await finish(f.manager, id)
    expect(error).toBeNull()
    row = await emailRow(id)
    expect(row.status).toBe('sent')
    expect(row.sent_at).not.toBeNull()
    expect(row.provider_message_id).toBe('msg-1')
  })

  it('lets an admin send and records a failure', async () => {
    const f = await newFirm('Email Admin Firm')
    const invoiceId = await sendable(f)
    const id = await startOk(f.admin, invoiceId)
    expect((await finish(f.admin, id, false)).error).toBeNull()
    const row = await emailRow(id)
    expect(row.status).toBe('failed')
    expect(row.sent_at).toBeNull()
    expect(row.error).toBe('resend send failed: 500')
  })

  it('refuses consultants, who also cannot read the history', async () => {
    const f = await newFirm('Email Consultant Firm')
    const invoiceId = await sendable(f)
    const { error } = await start(f.consultant, invoiceId)
    expect(error?.code).toBe('42501')
    await startOk(f.manager, invoiceId)
    const { data } = await f.consultant.db.from('invoice_emails').select('id').eq('invoice_id', invoiceId)
    expect(data ?? []).toHaveLength(0)
  })

  it("refuses another firm's admin", async () => {
    const f = await newFirm('Email Owner Firm')
    const other = await newFirm('Email Other Firm')
    const invoiceId = await sendable(f)
    expect((await start(other.admin, invoiceId)).error?.code).toBe('42501')
    const id = await startOk(f.manager, invoiceId)
    expect((await finish(other.admin, id)).error?.code).toBe('42501')
  })

  it('refuses drafts and voided invoices', async () => {
    const f = await newFirm('Email Status Firm')
    const { invoiceId: draft } = await createManualDraft(f)
    expect(text((await start(f.manager, draft)).error)).toContain('INVOICE_NOT_SENDABLE')

    const voided = await sendable(f)
    const { error: vErr } = await f.manager.db.rpc('void_invoice', { p_invoice: voided })
    expect(vErr).toBeNull()
    expect(text((await start(f.manager, voided)).error)).toContain('INVOICE_NOT_SENDABLE')
  })

  it('allows a paid invoice', async () => {
    const f = await newFirm('Email Paid Firm')
    const invoiceId = await sendable(f)
    const { error: pErr } = await f.manager.db.rpc('record_payment', {
      p_invoice: invoiceId,
      p_amount: 1200,
      p_paid_on: '2026-11-02',
      p_method: 'bank_transfer',
      p_reference: null,
      p_notes: null,
    })
    expect(pErr).toBeNull()
    expect((await start(f.manager, invoiceId)).error).toBeNull()
  })

  it('refuses an invoice with no PDF', async () => {
    const f = await newFirm('Email No PDF Firm')
    const { invoiceId } = await issueManualInvoice(f)
    expect(text((await start(f.manager, invoiceId)).error)).toContain('INVOICE_NO_PDF')
  })

  it('checks addresses, counts, subject and message in the database', async () => {
    const f = await newFirm('Email Validation Firm')
    const invoiceId = await sendable(f)
    const six = [1, 2, 3, 4, 5, 6].map((n) => `p${n}@x.test`)
    expect(text((await start(f.manager, invoiceId, { p_to: ['a@x.test\r\nBcc: e@x.test'] })).error)).toContain(
      'EMAIL_ADDRESS_INVALID',
    )
    expect(text((await start(f.manager, invoiceId, { p_cc: ['nope'] })).error)).toContain('EMAIL_ADDRESS_INVALID')
    expect(text((await start(f.manager, invoiceId, { p_reply_to: 'nope' })).error)).toContain('EMAIL_ADDRESS_INVALID')
    expect((await start(f.manager, invoiceId, { p_to: six })).error).not.toBeNull()
    expect((await start(f.manager, invoiceId, { p_to: [] })).error).not.toBeNull()
    expect((await start(f.manager, invoiceId, { p_cc: six })).error).not.toBeNull()
    expect((await start(f.manager, invoiceId, { p_subject: 'Hi\r\nBcc: e@x.test' })).error).not.toBeNull()
    expect((await start(f.manager, invoiceId, { p_subject: '' })).error).not.toBeNull()
    expect((await start(f.manager, invoiceId, { p_body: 'x'.repeat(5001) })).error).not.toBeNull()
    const { count } = await adminDb().from('invoice_emails').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId)
    expect(count).toBe(0)
  })

  it('refuses a second send of the same invoice within 60 seconds', async () => {
    const f = await newFirm('Email Double Click Firm')
    const invoiceId = await sendable(f)
    const [a, b] = await Promise.all([start(f.manager, invoiceId), start(f.admin, invoiceId)])
    const errors = [a.error, b.error].filter(Boolean)
    expect(errors).toHaveLength(1)
    expect(text(errors[0])).toContain('EMAIL_RATE_LIMITED')
  })

  it('allows a resend after 60 seconds, up to 10 per invoice per day, counting failures', async () => {
    const f = await newFirm('Email Daily Invoice Firm')
    const invoiceId = await sendable(f)
    for (let i = 0; i < 10; i++) {
      const id = await startOk(f.manager, invoiceId)
      await finish(f.manager, id, i % 2 === 0)
      await backdate(invoiceId)
    }
    expect(text((await start(f.manager, invoiceId)).error)).toContain('EMAIL_RATE_LIMITED')
    await backdate(invoiceId, 25 * 3600)
    expect((await start(f.manager, invoiceId)).error).toBeNull()
  })

  it('limits a firm to 50 sends an hour', async () => {
    const f = await newFirm('Email Hourly Firm')
    const target = await sendable(f)
    const other = await sendable(f)
    const at = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const rows = Array.from({ length: 50 }, () => ({
      firm_id: f.firmId,
      invoice_id: other,
      to_addresses: TO,
      subject: 'Old send',
      body: 'Old send',
      pdf_path: `firms/${f.firmId}/invoices/${other}/x.pdf`,
      status: 'failed',
      created_at: at,
    }))
    const { error } = await adminDb().from('invoice_emails').insert(rows)
    expect(error).toBeNull()
    expect(text((await start(f.manager, target)).error)).toContain('EMAIL_RATE_LIMITED')
  })

  it('only moves a sending row once', async () => {
    const f = await newFirm('Email Finish Firm')
    const id = await startOk(f.manager, await sendable(f))
    expect((await finish(f.manager, id)).error).toBeNull()
    expect(text((await finish(f.manager, id, false)).error)).toContain('EMAIL_STATE')
    expect((await emailRow(id)).status).toBe('sent')
  })

  it('has no direct writes', async () => {
    const f = await newFirm('Email Direct Firm')
    const invoiceId = await sendable(f)
    const { error } = await f.manager.db.from('invoice_emails').insert({
      firm_id: f.firmId,
      invoice_id: invoiceId,
      to_addresses: TO,
      subject: 's',
      body: 'b',
      pdf_path: 'x',
    })
    expect(error).not.toBeNull()
    const id = await startOk(f.manager, invoiceId)
    const { data } = await f.manager.db.from('invoice_emails').update({ status: 'sent' }).eq('id', id).select()
    expect(data ?? []).toHaveLength(0)
    expect((await emailRow(id)).status).toBe('sending')
  })

  it('writes the send and its result to the audit log', async () => {
    const f = await newFirm('Email Audit Firm')
    const id = await startOk(f.manager, await sendable(f))
    await finish(f.manager, id)
    const { data } = await f.admin.db
      .from('audit_log')
      .select('action, actor_id, after')
      .eq('entity_type', 'invoice_emails')
      .eq('entity_id', id)
      .order('at')
    expect((data ?? []).map((r) => r.action)).toEqual(['insert', 'update'])
    expect(data![0].actor_id).toBe(f.manager.id)
    expect((data![0].after as { to_addresses: string[] }).to_addresses).toEqual(TO)
  })
})

describe('invoice_last_emails', () => {
  it('returns the latest sent email per invoice', async () => {
    const f = await newFirm('Email Last Firm')
    const invoiceId = await sendable(f)
    const first = await startOk(f.manager, invoiceId)
    await finish(f.manager, first)
    await backdate(invoiceId)
    const failed = await start(f.manager, invoiceId, { p_to: ['second@demo-client.test'] })
    await finish(f.manager, failed.data as string, false)

    const { data, error } = await f.manager.db.rpc('invoice_last_emails', { p_firm: f.firmId })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].invoice_id).toBe(invoiceId)
    expect(data![0].to_addresses).toEqual(TO)

    const { data: forConsultant } = await f.consultant.db.rpc('invoice_last_emails', { p_firm: f.firmId })
    expect(forConsultant ?? []).toHaveLength(0)
  })
})

describe('firm email template', () => {
  it('managers can change it, consultants cannot', async () => {
    const f = await newFirm('Email Template Firm')
    const { data, error } = await f.manager.db
      .from('firms')
      .update({ invoice_email_subject: 'Your invoice {invoice_number}', invoice_email_body: 'Hello' })
      .eq('id', f.firmId)
      .select('invoice_email_subject')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const { data: c } = await f.consultant.db
      .from('firms')
      .update({ invoice_email_body: 'Hacked' })
      .eq('id', f.firmId)
      .select('id')
    expect(c ?? []).toHaveLength(0)
  })

  it('keeps the subject to one line', async () => {
    const f = await newFirm('Email Template Line Firm')
    const { error } = await f.manager.db.from('firms').update({ invoice_email_subject: 'a\nb' }).eq('id', f.firmId)
    expect(error).not.toBeNull()
  })
})
