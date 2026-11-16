/** Pure helpers for routing received mail to a firm and describing its sender. */

const CODE_RE = /^bills-([a-z0-9]{10})$/
const ADDRESS_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/
const DUPLICATE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000

/** `INBOUND_DOMAINS` → lowercased domains; the first one is shown in Settings. */
export function inboundDomains(env: string | undefined): string[] {
  return (env ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
}

/** `"Acme AP" <AP@Acme.com>` → `ap@acme.com`; null when there is no address. */
export function bareAddress(raw: string): string | null {
  const angle = /<([^<>]+)>/.exec(raw)
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase()
  return ADDRESS_RE.test(candidate) ? candidate : null
}

/** Firm codes from recipients of the form bills-<code>@<one of our domains>. */
export function codesFor(recipients: string[], domains: string[]): string[] {
  const out = new Set<string>()
  for (const r of recipients) {
    const addr = bareAddress(r)
    if (!addr) continue
    const at = addr.lastIndexOf('@')
    if (!domains.includes(addr.slice(at + 1))) continue
    const m = CODE_RE.exec(addr.slice(0, at))
    if (m) out.add(m[1])
  }
  return [...out]
}

export type SenderMatch =
  | { kind: 'vendor'; vendorId: string }
  | { kind: 'known' }
  | { kind: 'member'; forwardedBy: string }
  | { kind: 'unknown' }

export function classifySender(
  from: string,
  vendors: { id: string; email: string | null }[],
  members: { email: string; name: string | null }[],
): SenderMatch {
  const addr = bareAddress(from)
  if (!addr) return { kind: 'unknown' }
  const matches = vendors.filter((v) => v.email && v.email.trim().toLowerCase() === addr)
  if (matches.length === 1) return { kind: 'vendor', vendorId: matches[0].id }
  if (matches.length > 1) return { kind: 'known' }
  const member = members.find((m) => m.email.trim().toLowerCase() === addr)
  if (member) return { kind: 'member', forwardedBy: member.name?.trim() || member.email }
  return { kind: 'unknown' }
}

const squash = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '')

/**
 * "Possible duplicate": the same sender sent a same-named file within the 60 days before, or a
 * file name contains (ignoring case, spaces, - and _) a bill number of 3+ characters.
 */
export function possibleDuplicate(
  item: { fromAddress: string; receivedAt: string; fileNames: string[] },
  history: { fromAddress: string; receivedAt: string; fileNames: string[] }[],
  billNumbers: string[],
): boolean {
  const names = item.fileNames.map((n) => n.toLowerCase())
  const t = Date.parse(item.receivedAt)
  const sameFile = history.some((h) => {
    const ht = Date.parse(h.receivedAt)
    return (
      h.fromAddress.toLowerCase() === item.fromAddress.toLowerCase() &&
      ht < t &&
      t - ht <= DUPLICATE_WINDOW_MS &&
      h.fileNames.some((n) => names.includes(n.toLowerCase()))
    )
  })
  if (sameFile) return true
  const squashed = item.fileNames.map(squash)
  return billNumbers.some((b) => {
    const n = squash(b)
    return n.length >= 3 && squashed.some((f) => f.includes(n))
  })
}
