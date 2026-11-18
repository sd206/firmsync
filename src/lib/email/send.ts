import 'server-only'
import { addressOf } from './addresses'

export type MailAttachment = { filename: string; content: Uint8Array; contentType: string }
export type MailMessage = {
  from: string
  to: string[]
  cc?: string[]
  replyTo?: string
  subject: string
  text: string
  attachments?: MailAttachment[]
  idempotencyKey?: string
}
export type SendEmail = (msg: MailMessage) => Promise<{ id: string | null }>

type Env = Record<string, string | undefined>
type Fetch = typeof fetch

export type EmailConfig = { ok: true; transport: 'resend' | 'mailpit'; fromAddress: string | null } | { ok: false }

const RESEND_URL = 'https://api.resend.com/emails'
const DEFAULT_MAILPIT = 'http://127.0.0.1:54424'
const TIMEOUT_MS = 15_000

/** Mailpit is a local test inbox; never send to it anywhere but this machine. */
function localMailpitUrl(env: Env): string | null {
  const raw = env.MAILPIT_URL || DEFAULT_MAILPIT
  try {
    const u = new URL(raw)
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' ? raw.replace(/\/$/, '') : null
  } catch {
    return null
  }
}

export function emailConfig(env: Env): EmailConfig {
  const fromAddress = addressOf(env.INVOICE_EMAIL_FROM) ?? addressOf(env.NOTIFY_FROM)
  if (env.EMAIL_TRANSPORT === 'mailpit') {
    return localMailpitUrl(env) ? { ok: true, transport: 'mailpit', fromAddress } : { ok: false }
  }
  if (env.RESEND_API_KEY) return { ok: true, transport: 'resend', fromAddress }
  return { ok: false }
}

/** Invoices can be emailed: a transport and a from address on the verified domain. */
export function invoiceEmailReady(env: Env): boolean {
  const c = emailConfig(env)
  return c.ok && c.fromAddress !== null
}

const base64 = (b: Uint8Array): string => Buffer.from(b).toString('base64')

/** `"Name" <a@b.c>` → { Name, Email }; a bare address has no name. */
function splitFrom(from: string): { Email: string; Name?: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/.exec(from)
  return m ? { Email: m[2].trim(), Name: m[1].trim() || undefined } : { Email: from.trim() }
}

async function post(name: string, url: string, init: RequestInit, fetchImpl: Fetch): Promise<unknown> {
  const res = await fetchImpl(url, { ...init, method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new Error(`${name} send failed: ${res.status} ${detail}`.trim())
  }
  return res.json().catch(() => ({}))
}

function resendSender(apiKey: string, fetchImpl: Fetch): SendEmail {
  return async (msg) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    if (msg.idempotencyKey) headers['Idempotency-Key'] = msg.idempotencyKey
    const body = {
      from: msg.from,
      to: msg.to,
      cc: msg.cc,
      reply_to: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: base64(a.content) })),
    }
    const data = (await post('resend', RESEND_URL, { headers, body: JSON.stringify(body) }, fetchImpl)) as { id?: string }
    return { id: data.id ?? null }
  }
}

function mailpitSender(baseUrl: string, fetchImpl: Fetch): SendEmail {
  return async (msg) => {
    const list = (xs?: string[]) => xs?.map((Email) => ({ Email }))
    const body = {
      From: splitFrom(msg.from),
      To: list(msg.to),
      Cc: list(msg.cc),
      ReplyTo: msg.replyTo ? [{ Email: msg.replyTo }] : undefined,
      Subject: msg.subject,
      Text: msg.text,
      Attachments: msg.attachments?.map((a) => ({ Filename: a.filename, Content: base64(a.content), ContentType: a.contentType })),
    }
    const headers = { 'Content-Type': 'application/json' }
    const data = (await post('mailpit', `${baseUrl}/api/v1/send`, { headers, body: JSON.stringify(body) }, fetchImpl)) as {
      ID?: string
    }
    return { id: data.ID ?? null }
  }
}

/** The configured transport, or null when email is off. */
export function createSender(env: Env, fetchImpl: Fetch = fetch): SendEmail | null {
  const c = emailConfig(env)
  if (!c.ok) return null
  if (c.transport === 'mailpit') return mailpitSender(localMailpitUrl(env) as string, fetchImpl)
  return resendSender(env.RESEND_API_KEY as string, fetchImpl)
}
