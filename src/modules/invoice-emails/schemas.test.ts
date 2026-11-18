import { describe, expect, it } from 'vitest'
import { emailTemplateSchema } from './schemas'
import { DEFAULT_BODY, DEFAULT_SUBJECT } from './template'

describe('emailTemplateSchema', () => {
  it('stores custom wording', () => {
    expect(emailTemplateSchema.parse({ subject: ' Bill {invoice_number} ', body: 'Hi\r\nthere' })).toEqual({
      subject: 'Bill {invoice_number}',
      body: 'Hi\nthere',
    })
  })

  it('stores blank or default wording as null, so the built-in default applies', () => {
    expect(emailTemplateSchema.parse({ subject: '  ', body: '' })).toEqual({ subject: null, body: null })
    expect(emailTemplateSchema.parse({ subject: DEFAULT_SUBJECT, body: DEFAULT_BODY.replace(/\n/g, '\r\n') })).toEqual({
      subject: null,
      body: null,
    })
  })

  it('keeps the subject to one line of 200 characters and the body to 5,000', () => {
    expect(emailTemplateSchema.safeParse({ subject: 'a\nb', body: '' }).success).toBe(false)
    expect(emailTemplateSchema.safeParse({ subject: 'a'.repeat(201), body: '' }).success).toBe(false)
    expect(emailTemplateSchema.safeParse({ subject: '', body: 'b'.repeat(5001) }).success).toBe(false)
  })
})
