import { describe, expect, it } from 'vitest'
import {
  addressOf,
  cleanDisplayName,
  formatFrom,
  isValidEmail,
  parseAddressList,
  singleLine,
  validateRecipients,
} from './addresses'

describe('parseAddressList', () => {
  it('splits on commas, semicolons and new lines, lowercases and de-duplicates in order', () => {
    expect(parseAddressList('A@x.test; b@x.test,\na@x.test')).toEqual(['a@x.test', 'b@x.test'])
  })

  it('drops empty entries', () => {
    expect(parseAddressList(' , ;\n ')).toEqual([])
  })
})

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('ap@demo-client.test')).toBe(true)
  })

  it.each([
    ['no dot in domain', 'a@b'],
    ['space', 'a b@x.test'],
    ['header injection', 'a@x.test\r\nBcc: e@x.test'],
    ['angle brackets', '<a@x.test>'],
    ['two @', 'a@b@x.test'],
    ['longer than 254 characters', `${'a'.repeat(248)}@x.test`],
  ])('rejects %s', (_label, value) => {
    expect(isValidEmail(value)).toBe(false)
  })
})

describe('validateRecipients', () => {
  it('needs at least one To address', () => {
    expect(validateRecipients([], ['c@x.test'])).toEqual({ ok: false, error: 'Add at least one recipient.' })
  })

  it('allows up to 5 To and 5 CC addresses', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((n) => `${n}@x.test`)
    expect(validateRecipients(six, [])).toEqual({ ok: false, error: 'Up to 5 addresses in To.' })
    expect(validateRecipients(['a@x.test'], six)).toEqual({ ok: false, error: 'Up to 5 addresses in CC.' })
  })

  it('names the first invalid address', () => {
    expect(validateRecipients(['a@x.test', 'nope'], [])).toEqual({ ok: false, error: "nope isn't a valid email address." })
  })

  it('removes CC addresses that are already in To', () => {
    expect(validateRecipients(['a@x.test'], ['a@x.test', 'b@x.test'])).toEqual({
      ok: true,
      data: { to: ['a@x.test'], cc: ['b@x.test'] },
    })
  })
})

describe('cleanDisplayName', () => {
  it('removes characters that break an email header', () => {
    expect(cleanDisplayName('"Evil" <Co>, Ltd\r\n')).toBe('Evil Co Ltd')
  })

  it('keeps names to 60 characters', () => {
    expect(cleanDisplayName('A'.repeat(80))).toHaveLength(60)
  })
})

describe('addressOf', () => {
  it('reads the address from a display-name form or a bare address', () => {
    expect(addressOf('VeriTreo <alerts@x.test>')).toBe('alerts@x.test')
    expect(addressOf(' invoices@x.test ')).toBe('invoices@x.test')
  })

  it('returns null for something that is not an address', () => {
    expect(addressOf('VeriTreo')).toBeNull()
    expect(addressOf(undefined)).toBeNull()
  })
})

describe('formatFrom', () => {
  it('quotes the display name', () => {
    expect(formatFrom('Demo Consulting via VeriTreo', 'invoices@x.test')).toBe(
      '"Demo Consulting via VeriTreo" <invoices@x.test>',
    )
  })
})

describe('singleLine', () => {
  it('turns line breaks and tabs into single spaces', () => {
    expect(singleLine(' a\r\nBcc:\t b ')).toBe('a Bcc: b')
  })
})
