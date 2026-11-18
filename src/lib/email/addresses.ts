import { fail, ok, type Result } from '@/lib/result'

/** Practical address check; mirrored in the database (invoice_email_start). */
export const EMAIL_RE = /^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/
const MAX_EMAIL = 254
const MAX_TO = 5
const MAX_CC = 5
const MAX_DISPLAY_NAME = 60

export function isValidEmail(s: string): boolean {
  return s.length <= MAX_EMAIL && EMAIL_RE.test(s)
}

/** Split on commas, semicolons and new lines; trim, lowercase, drop empties, de-duplicate in order. */
export function parseAddressList(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split(/[,;\n]/)) {
    const a = part.trim().toLowerCase()
    if (a && !out.includes(a)) out.push(a)
  }
  return out
}

export function validateRecipients(to: string[], cc: string[]): Result<{ to: string[]; cc: string[] }> {
  if (to.length === 0) return fail('Add at least one recipient.')
  if (to.length > MAX_TO) return fail(`Up to ${MAX_TO} addresses in To.`)
  const ccOnly = cc.filter((a) => !to.includes(a))
  if (ccOnly.length > MAX_CC) return fail(`Up to ${MAX_CC} addresses in CC.`)
  const bad = [...to, ...ccOnly].find((a) => !isValidEmail(a))
  if (bad !== undefined) return fail(`${bad} isn't a valid email address.`)
  return ok({ to, cc: ccOnly })
}

/** A firm name made safe for an email From display name. */
export function cleanDisplayName(name: string): string {
  return name
    .replace(/["<>,;\\\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DISPLAY_NAME)
    .trim()
}

/** The address in `Name <a@b.c>` or a bare `a@b.c`; null when there isn't a valid one. */
export function addressOf(from: string | undefined | null): string | null {
  if (!from) return null
  const m = /<([^<>]+)>\s*$/.exec(from)
  const a = (m ? m[1] : from).trim()
  return isValidEmail(a) ? a : null
}

export function formatFrom(displayName: string, address: string): string {
  return `"${displayName}" <${address}>`
}

export function singleLine(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
}
