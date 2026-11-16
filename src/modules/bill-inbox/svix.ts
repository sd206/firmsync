import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_MS = 5 * 60 * 1000

/**
 * Verifies a Svix-signed webhook (Resend): HMAC-SHA256 of `${id}.${timestamp}.${body}` with the
 * base64 key after `whsec_`, compared with any `v1,<sig>` entry in the signature header.
 */
export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature || !secret.startsWith('whsec_')) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > TOLERANCE_MS) return false
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest()
  return signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',', 2)
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}
