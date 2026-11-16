import { describe, expect, it } from 'vitest'
import { bareAddress, classifySender, codesFor, inboundDomains, possibleDuplicate } from './route-mail'

describe('inbound routing', () => {
  it('reads the domain list', () => {
    expect(inboundDomains(' In.FirmSync.app, x.resend.app ,,')).toEqual(['in.firmsync.app', 'x.resend.app'])
    expect(inboundDomains(undefined)).toEqual([])
  })

  it('finds firm codes only on our domains', () => {
    expect(codesFor(['Bills-AbC123xyz9@X.resend.app', 'other@x.resend.app', 'bills-abc123xyz9@evil.com'], ['x.resend.app'])).toEqual([
      'abc123xyz9',
    ])
    expect(codesFor(['"Acme Bills" <bills-aaaaaaaaaa@x.resend.app>', 'bills-aaaaaaaaaa@x.resend.app', 'bills-short@x.resend.app'], ['x.resend.app'])).toEqual([
      'aaaaaaaaaa',
    ])
  })

  it('parses bare addresses', () => {
    expect(bareAddress('"Acme AP" <AP@Acme.com>')).toBe('ap@acme.com')
    expect(bareAddress(' ap@acme.com ')).toBe('ap@acme.com')
    expect(bareAddress('nope')).toBeNull()
  })
})

describe('classifySender', () => {
  const vendors = [
    { id: 'v1', email: 'AP@Acme.com' },
    { id: 'v2', email: 'billing@shared.com' },
    { id: 'v3', email: 'billing@shared.com' },
    { id: 'v4', email: null },
  ]
  const members = [
    { email: 'maya@firm.test', name: 'Maya Patel' },
    { email: 'lee@firm.test', name: null },
  ]
  it('matches vendors, members and unknown senders', () => {
    expect(classifySender('"Acme" <ap@acme.com>', vendors, members)).toEqual({ kind: 'vendor', vendorId: 'v1' })
    expect(classifySender('billing@shared.com', vendors, members)).toEqual({ kind: 'known' })
    expect(classifySender('MAYA@firm.test', vendors, members)).toEqual({ kind: 'member', forwardedBy: 'Maya Patel' })
    expect(classifySender('lee@firm.test', vendors, members)).toEqual({ kind: 'member', forwardedBy: 'lee@firm.test' })
    expect(classifySender('spam@x.biz', vendors, members)).toEqual({ kind: 'unknown' })
  })
})

describe('possibleDuplicate', () => {
  const day = 24 * 60 * 60 * 1000
  const at = (daysBefore: number) => new Date(Date.parse('2026-11-16T10:00:00Z') - daysBefore * day).toISOString()
  const item = { fromAddress: 'ap@acme.com', receivedAt: at(0), fileNames: ['Bill.pdf'] }
  it('flags the same sender and file name within 60 days', () => {
    expect(possibleDuplicate(item, [{ fromAddress: 'ap@acme.com', receivedAt: at(59), fileNames: ['bill.PDF'] }], [])).toBe(true)
    expect(possibleDuplicate(item, [{ fromAddress: 'ap@acme.com', receivedAt: at(61), fileNames: ['bill.pdf'] }], [])).toBe(false)
    expect(possibleDuplicate(item, [{ fromAddress: 'x@acme.com', receivedAt: at(1), fileNames: ['bill.pdf'] }], [])).toBe(false)
  })
  it('flags a file name that contains an existing bill number', () => {
    expect(possibleDuplicate({ ...item, fileNames: ['inv_4471.pdf'] }, [], ['INV-4471'])).toBe(true)
    expect(possibleDuplicate({ ...item, fileNames: ['scan-12.pdf'] }, [], ['12'])).toBe(false)
  })
})
