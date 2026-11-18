import { describe, expect, it } from 'vitest'
import { formatPdfDate } from '@/modules/invoices/pdf/view-model'
import { DEFAULT_BODY, DEFAULT_SUBJECT, PLACEHOLDERS, renderTemplate, templateValues, unknownPlaceholders } from './template'

const INPUT = {
  firmName: 'Demo Consulting',
  clientName: 'Demo Client Ltd',
  contactName: 'Pat Payable',
  number: 'INV-2026-0012',
  total: '1200.00',
  balanceDue: '700.00',
  currency: 'USD',
  issueDate: '2026-11-01',
  dueDate: '2026-12-01',
  subject: 'October work',
}

describe('templateValues', () => {
  it('formats money and dates as on the PDF', () => {
    const v = templateValues(INPUT)
    expect(v.invoice_total).toBe('USD 1,200.00')
    expect(v.amount_due).toBe('USD 700.00')
    expect(v.due_date).toBe(formatPdfDate('2026-12-01'))
    expect(v.issue_date).toBe(formatPdfDate('2026-11-01'))
    expect(v.client_contact).toBe('Pat Payable')
    expect(v.subject).toBe('October work')
  })

  it('uses the client name when there is no billing contact', () => {
    expect(templateValues({ ...INPUT, contactName: null }).client_contact).toBe('Demo Client Ltd')
    expect(templateValues({ ...INPUT, contactName: '  ' }).client_contact).toBe('Demo Client Ltd')
  })

  it('gives an empty subject when the invoice has none', () => {
    expect(templateValues({ ...INPUT, subject: null }).subject).toBe('')
  })
})

describe('renderTemplate', () => {
  const values = templateValues(INPUT)

  it('renders the default subject', () => {
    expect(renderTemplate(DEFAULT_SUBJECT, values)).toBe('Invoice INV-2026-0012 from Demo Consulting')
  })

  it('renders the default body', () => {
    const body = renderTemplate(DEFAULT_BODY, values)
    expect(body).toContain('Hi Pat Payable,')
    expect(body).toContain(`invoice INV-2026-0012 for USD 1,200.00, due on ${formatPdfDate('2026-12-01')}.`)
    expect(body).toContain('Amount due: USD 700.00.')
    expect(body.endsWith('Thank you,\nDemo Consulting')).toBe(true)
  })

  it('never re-reads substituted text as a placeholder', () => {
    const v = templateValues({ ...INPUT, clientName: '{firm_name}', contactName: null })
    expect(renderTemplate('{client_contact}', v)).toBe('{firm_name}')
  })

  it('leaves unknown placeholders as typed', () => {
    expect(renderTemplate('Pay {bank_details} now', values)).toBe('Pay {bank_details} now')
  })
})

describe('unknownPlaceholders', () => {
  it('lists each unknown placeholder once', () => {
    expect(unknownPlaceholders('{firm_name} {bank} {bank} {iban}')).toEqual(['{bank}', '{iban}'])
  })

  it('knows every listed placeholder', () => {
    expect(unknownPlaceholders(PLACEHOLDERS.map((p) => `{${p.key}}`).join(' '))).toEqual([])
    expect(PLACEHOLDERS).toHaveLength(9)
  })
})
