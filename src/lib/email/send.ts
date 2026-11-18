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
const RETRY_TIMEOUT_MS = 10_000

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

/**
 * Delivery is unconfirmed: the mail service never answered (timeout, dropped connection), had a
 * server error (5xx), or answered a retry with an error (e.g. 409 while it is still processing the
 * first attempt). The email may or may not have gone. A 4xx on the first attempt is a definite
 * rejection and a plain Error instead.
 */
export class MailNoResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailNoResponseError'
  }
}

/**
 * The status and the provider's error name only (e.g. "422 validation_error"): the body can hold
 * recipient details, so it goes to the server log, never into stored history.
 */
async function describeFailure(name: string, res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  console.error(`${name} send failed`, res.status, text.slice(0, 1000))
  let code = ''
  try {
    const parsed = JSON.parse(text) as { name?: unknown }
    if (typeof parsed.name === 'string' && /^[a-z_]{1,60}$/.test(parsed.name)) code = parsed.name
  } catch {
    // Not JSON: the status alone.
  }
  return `${res.status}${code ? ` ${code}` : ''}`
}

/**
 * One POST. With an idempotency key, an attempt without a confirmed outcome (no answer or 5xx) is
 * tried once more with the same key, so the service can't send it twice; a non-2xx answer to that
 * retry is still unconfirmed. The retry gets a shorter timeout so an unanswered send ends within
 * 25 seconds (first try 15 s + retry 10 s).
 */
async function post(name: string, url: string, init: RequestInit, fetchImpl: Fetch, canRetry: boolean): Promise<unknown> {
  const attempt = async (timeoutMs: number, isRetry: boolean): Promise<unknown> => {
    let res: Response
    try {
      res = await fetchImpl(url, { ...init, method: 'POST', signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      if (canRetry && !isRetry) return attempt(RETRY_TIMEOUT_MS, true)
      const reason = e instanceof Error ? e.name : 'unknown'
      throw new MailNoResponseError(`${name}: no response (${reason})`)
    }
    if (res.ok) return res.json().catch(() => ({}))
    if (res.status >= 500 && canRetry && !isRetry) {
      await describeFailure(name, res)
      return attempt(RETRY_TIMEOUT_MS, true)
    }
    const failure = await describeFailure(name, res)
    if (isRetry || res.status >= 500) throw new MailNoResponseError(`${name}: unconfirmed (${failure})`)
    throw new Error(`${name} send failed: ${failure}`)
  }
  return attempt(TIMEOUT_MS, false)
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
    const data = (await post('resend', RESEND_URL, { headers, body: JSON.stringify(body) }, fetchImpl, !!msg.idempotencyKey)) as {
      id?: string
    }
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
    // Mailpit has no idempotency keys, so no retry: a local test inbox can live with that.
    const data = (await post('mailpit', `${baseUrl}/api/v1/send`, { headers, body: JSON.stringify(body) }, fetchImpl, false)) as {
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
