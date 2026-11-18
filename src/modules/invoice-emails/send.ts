import 'server-only'
import { PRODUCT_NAME } from '@/lib/brand'
import { cleanDisplayName, formatFrom, isValidEmail, parseAddressList, singleLine, validateRecipients } from '@/lib/email/addresses'
import { createSender, emailConfig, invoiceEmailReady, type SendEmail } from '@/lib/email/send'
import type { FieldErrors, FormResult } from '@/lib/form'
import { fail, ok, type Result } from '@/lib/result'
import { DEFAULT_BODY, DEFAULT_SUBJECT, renderTemplate, templateValues } from './template'

type Env = Record<string, string | undefined>

export const NOT_SET_UP = "Emailing invoices isn't set up yet. Download the PDF and attach it to your own email."
export const SEND_FAILED = "The email couldn't be sent. Nothing was delivered; you can try again in a minute."

const MAX_SUBJECT = 200
const MAX_BODY = 5000

/** What a send needs to know about the invoice and firm. */
export type SendContext = {
  invoiceNumber: string
  pdfPath: string | null
  firmName: string
  firmContactEmail: string | null
}

export type StartInput = { to: string[]; cc: string[]; replyTo: string | null; subject: string; body: string }
export type FinishInput = { ok: boolean; providerId: string | null; error: string | null }

export type SendDeps = {
  env: Env
  send?: SendEmail
  loadContext: () => Promise<Result<SendContext>>
  start: (input: StartInput) => Promise<Result<string>>
  readPdf: (path: string) => Promise<Result<Uint8Array>>
  finish: (id: string, result: FinishInput) => Promise<Result<void>>
}

export type SendInput = {
  senderEmail: string
  to: string
  cc: string
  copyMe: boolean
  subject: string
  body: string
}

/** `"Demo Consulting via FirmSync" <invoices@…>`; null when no from address is configured. */
export function invoiceFrom(firmName: string, env: Env): string | null {
  const c = emailConfig(env)
  if (!c.ok || !c.fromAddress) return null
  const firm = cleanDisplayName(firmName)
  return formatFrom(firm ? `${firm} via ${PRODUCT_NAME}` : PRODUCT_NAME, c.fromAddress)
}

/** The firm's contact email, else the sender's own login email. */
export function replyToFor(firmContactEmail: string | null, senderEmail: string): string | null {
  const firm = firmContactEmail?.trim().toLowerCase() ?? ''
  if (isValidEmail(firm)) return firm
  const own = senderEmail.trim().toLowerCase()
  return isValidEmail(own) ? own : null
}

export const pdfFileName = (number: string): string => `${number.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`

function checkWording(subject: string, body: string): FieldErrors | null {
  const errors: FieldErrors = {}
  if (subject.length === 0) errors.subject = 'Enter a subject.'
  else if (subject.length > MAX_SUBJECT) errors.subject = `Keep the subject to ${MAX_SUBJECT} characters or fewer.`
  if (body.trim().length === 0) errors.body = 'Enter a message.'
  else if (body.length > MAX_BODY) errors.body = 'Keep the message to 5,000 characters or fewer.'
  return Object.keys(errors).length > 0 ? errors : null
}

export async function sendInvoiceEmail(deps: SendDeps, input: SendInput): Promise<FormResult<{ to: string[]; number: string }>> {
  if (!invoiceEmailReady(deps.env)) return fail(NOT_SET_UP)
  const sender = deps.send ?? createSender(deps.env)
  if (!sender) return fail(NOT_SET_UP)

  const subject = singleLine(input.subject)
  const body = input.body.replace(/\r\n/g, '\n')
  const wordingErrors = checkWording(subject, body)
  if (wordingErrors) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: wordingErrors }

  const to = parseAddressList(input.to)
  const cc = parseAddressList(input.cc)
  const own = input.senderEmail.trim().toLowerCase()
  if (input.copyMe && own && !cc.includes(own)) cc.push(own)
  // To first, so its problem is shown against To; whatever remains is about CC.
  const toOnly = validateRecipients(to, [])
  const recipients = toOnly.ok ? validateRecipients(to, cc) : toOnly
  if (!recipients.ok) {
    const field = toOnly.ok ? 'cc' : 'to'
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors: { [field]: recipients.error } }
  }

  const ctx = await deps.loadContext()
  if (!ctx.ok) return ctx
  const from = invoiceFrom(ctx.data.firmName, deps.env)
  if (!from) return fail(NOT_SET_UP)
  const replyTo = replyToFor(ctx.data.firmContactEmail, input.senderEmail)

  const started = await deps.start({ ...recipients.data, replyTo, subject, body })
  if (!started.ok) return started
  const id = started.data

  const pdf = ctx.data.pdfPath ? await deps.readPdf(ctx.data.pdfPath) : fail('PDF not found.')
  if (!pdf.ok) {
    await deps.finish(id, { ok: false, providerId: null, error: pdf.error })
    return fail(SEND_FAILED)
  }

  let providerId: string | null
  try {
    const sent = await sender({
      from,
      to: recipients.data.to,
      cc: recipients.data.cc,
      replyTo: replyTo ?? undefined,
      subject,
      text: body,
      attachments: [{ filename: pdfFileName(ctx.data.invoiceNumber), content: pdf.data, contentType: 'application/pdf' }],
      idempotencyKey: id,
    })
    providerId = sent.id
  } catch (e) {
    console.error('invoice email send failed', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    await deps.finish(id, { ok: false, providerId: null, error: message.slice(0, 500) })
    return fail(SEND_FAILED)
  }

  // The email went; a failure to record that is logged, not shown as a failed send.
  const finished = await deps.finish(id, { ok: true, providerId, error: null })
  if (!finished.ok) console.error('invoice email finish failed', finished.error)
  return ok({ to: recipients.data.to, number: ctx.data.invoiceNumber })
}

export type ComposeInput = {
  invoice: {
    number: string
    clientName: string
    billToName: string | null
    billToContactName: string | null
    billToEmail: string | null
    total: string
    balanceDue: string
    currency: string
    issueDate: string
    dueDate: string
    subject: string | null
  }
  firm: { name: string; contactEmail: string; emailSubject: string | null; emailBody: string | null }
  client: { billingEmail: string | null; contactName: string | null }
  senderEmail: string
  env: Env
}

export type ComposeDefaults = { to: string; subject: string; body: string; from: string | null; replyTo: string | null }

/** What the Email invoice panel opens with. */
export function composeDefaults({ invoice, firm, client, senderEmail, env }: ComposeInput): ComposeDefaults {
  const values = templateValues({
    firmName: firm.name,
    clientName: invoice.billToName ?? invoice.clientName,
    contactName: client.contactName ?? invoice.billToContactName,
    number: invoice.number,
    total: invoice.total,
    balanceDue: invoice.balanceDue,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    subject: invoice.subject,
  })
  return {
    to: client.billingEmail?.trim() || invoice.billToEmail?.trim() || '',
    subject: singleLine(renderTemplate(firm.emailSubject ?? DEFAULT_SUBJECT, values)),
    body: renderTemplate(firm.emailBody ?? DEFAULT_BODY, values),
    from: invoiceFrom(firm.name, env),
    replyTo: replyToFor(firm.contactEmail, senderEmail),
  }
}
