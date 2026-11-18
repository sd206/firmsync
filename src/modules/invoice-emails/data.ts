import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import { fail, ok, type Result } from '@/lib/result'
import type { InvoiceEmailStatus } from './history'
import type { FinishInput, SendContext, StartInput } from './send'

const DENIED = "You don't have permission to do that."
const NOT_FOUND = 'Invoice not found.'

export type InvoiceEmailRow = {
  id: string
  createdAt: string
  sentAt: string | null
  status: InvoiceEmailStatus
  to: string[]
  cc: string[]
  subject: string
  body: string
  senderEmail: string | null
  error: string | null
}

export async function loadSendContext(db: SupabaseClient, firmId: string, invoiceId: string): Promise<Result<SendContext>> {
  const inv = await db
    .from('invoices')
    .select('number, pdf_path')
    .eq('firm_id', firmId)
    .eq('id', invoiceId)
    .maybeSingle()
  if (inv.error) return fail(mapDbError(inv.error))
  if (!inv.data || !inv.data.number) return fail(NOT_FOUND)
  const firm = await db.from('firms').select('name, contact_email').eq('id', firmId).maybeSingle()
  if (firm.error) return fail(mapDbError(firm.error))
  if (!firm.data) return fail(NOT_FOUND)
  return ok({
    invoiceNumber: inv.data.number as string,
    pdfPath: (inv.data.pdf_path as string | null) ?? null,
    firmName: firm.data.name as string,
    firmContactEmail: (firm.data.contact_email as string | null) ?? null,
  })
}

export async function startInvoiceEmail(db: SupabaseClient, invoiceId: string, input: StartInput): Promise<Result<string>> {
  const { data, error } = await db.rpc('invoice_email_start', {
    p_invoice: invoiceId,
    p_to: input.to,
    p_cc: input.cc,
    p_reply_to: input.replyTo,
    p_subject: input.subject,
    p_body: input.body,
  })
  if (error || typeof data !== 'string') return fail(mapDbError(error))
  return ok(data)
}

export async function finishInvoiceEmail(db: SupabaseClient, id: string, r: FinishInput): Promise<Result<void>> {
  const { error } = await db.rpc('invoice_email_finish', {
    p_id: id,
    p_ok: r.ok,
    p_provider_id: r.providerId,
    p_error: r.error,
  })
  if (error) return fail(mapDbError(error))
  return ok(undefined)
}

type EmailDb = {
  id: string
  created_at: string
  sent_at: string | null
  status: InvoiceEmailStatus
  to_addresses: string[]
  cc_addresses: string[]
  subject: string
  body: string
  error: string | null
  profiles: { email: string } | { email: string }[] | null
}

/** Newest first. */
export async function listInvoiceEmails(db: SupabaseClient, firmId: string, invoiceId: string): Promise<Result<InvoiceEmailRow[]>> {
  const { data, error } = await db
    .from('invoice_emails')
    .select('id, created_at, sent_at, status, to_addresses, cc_addresses, subject, body, error, profiles(email)')
    .eq('firm_id', firmId)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
  if (error) return fail(mapDbError(error))
  return ok(
    ((data ?? []) as unknown as EmailDb[]).map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
      return {
        id: r.id,
        createdAt: r.created_at,
        sentAt: r.sent_at,
        status: r.status,
        to: r.to_addresses,
        cc: r.cc_addresses,
        subject: r.subject,
        body: r.body,
        senderEmail: p?.email ?? null,
        error: r.error,
      }
    }),
  )
}

/** Latest successful send per invoice. */
export async function lastEmails(
  db: SupabaseClient,
  firmId: string,
): Promise<Result<Map<string, { sentAt: string; to: string[] }>>> {
  const { data, error } = await db.rpc('invoice_last_emails', { p_firm: firmId })
  if (error) return fail(mapDbError(error))
  const rows = (data ?? []) as { invoice_id: string; sent_at: string; to_addresses: string[] }[]
  return ok(new Map(rows.map((r) => [r.invoice_id, { sentAt: r.sent_at, to: r.to_addresses }])))
}

/** null means "use the built-in default". */
export async function saveEmailTemplate(
  db: SupabaseClient,
  firmId: string,
  input: { subject: string | null; body: string | null },
): Promise<Result<void>> {
  const { data, error } = await db
    .from('firms')
    .update({ invoice_email_subject: input.subject, invoice_email_body: input.body })
    .eq('id', firmId)
    .select('id')
  if (error) return fail(mapDbError(error))
  // RLS filters rows the caller may not update; zero rows means no permission.
  if (!data || data.length === 0) return fail(DENIED)
  return ok(undefined)
}
