'use server'

import { revalidatePath } from 'next/cache'
import { requireFirmRole } from '@/lib/auth/context'
import { fieldErrorsOf, type FormResult, str } from '@/lib/form'
import { readStoredPdf } from '@/modules/invoices/pdf/storage'
import { finishInvoiceEmail, loadSendContext, saveEmailTemplate, startInvoiceEmail } from './data'
import { emailTemplateSchema } from './schemas'
import { sendInvoiceEmail } from './send'

const MANAGERS = ['admin', 'manager'] as const

export async function sendInvoiceEmailAction(
  firmId: string,
  invoiceId: string,
  formData: FormData,
): Promise<FormResult<{ to: string[]; number: string }>> {
  const { db, email } = await requireFirmRole(firmId, [...MANAGERS])
  const result = await sendInvoiceEmail(
    {
      env: process.env,
      loadContext: () => loadSendContext(db, firmId, invoiceId),
      start: (input) => startInvoiceEmail(db, invoiceId, input),
      readPdf: (path) => readStoredPdf(db, path),
      finish: (id, r) => finishInvoiceEmail(db, id, r),
    },
    {
      senderEmail: email,
      to: str(formData, 'to'),
      cc: str(formData, 'cc'),
      copyMe: str(formData, 'copyMe') === 'on',
      subject: str(formData, 'subject'),
      body: str(formData, 'body'),
    },
  )
  // History changes on success and on a recorded failure alike.
  revalidatePath(`/f/${firmId}/invoices/${invoiceId}`)
  revalidatePath(`/f/${firmId}/invoices`)
  return result
}

export async function saveEmailTemplateAction(firmId: string, formData: FormData): Promise<FormResult> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  const parsed = emailTemplateSchema.safeParse({ subject: str(formData, 'subject'), body: str(formData, 'body') })
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const result = await saveEmailTemplate(db, firmId, parsed.data)
  if (result.ok) revalidatePath(`/f/${firmId}`, 'layout')
  return result
}

export async function resetEmailTemplateAction(firmId: string): Promise<FormResult> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  const result = await saveEmailTemplate(db, firmId, { subject: null, body: null })
  if (result.ok) revalidatePath(`/f/${firmId}`, 'layout')
  return result
}
