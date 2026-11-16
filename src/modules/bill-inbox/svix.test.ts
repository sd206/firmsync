import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifySvix } from './svix'

const KEY = Buffer.from('a-test-signing-key-32-bytes-long!')
const SECRET = `whsec_${KEY.toString('base64')}`
const NOW = 1_800_000_000_000
const sign = (id: string, ts: string, body: string, key = KEY) =>
  createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')

describe('verifySvix', () => {
  const id = 'msg_1'
  const ts = String(NOW / 1000)
  const body = '{"type":"email.received"}'
  it('accepts a valid signature, including among several', () => {
    expect(verifySvix(SECRET, { id, timestamp: ts, signature: `v1,${sign(id, ts, body)}` }, body, NOW)).toBe(true)
    expect(verifySvix(SECRET, { id, timestamp: ts, signature: `v1,bad v1,${sign(id, ts, body)}` }, body, NOW)).toBe(true)
  })
  it('refuses tampering, wrong secrets, old timestamps and missing headers', () => {
    const good = `v1,${sign(id, ts, body)}`
    expect(verifySvix(SECRET, { id, timestamp: ts, signature: good }, body + ' ', NOW)).toBe(false)
    expect(verifySvix(`whsec_${Buffer.from('other').toString('base64')}`, { id, timestamp: ts, signature: good }, body, NOW)).toBe(false)
    expect(verifySvix(SECRET, { id, timestamp: ts, signature: good }, body, NOW + 6 * 60 * 1000)).toBe(false)
    expect(verifySvix(SECRET, { id: null, timestamp: ts, signature: good }, body, NOW)).toBe(false)
  })
})
