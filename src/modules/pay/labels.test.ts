import { describe, expect, it } from 'vitest'
import { CONSULTANT_TYPE_LABEL, PAY_STATUS_LABEL, formatPayRates, paidThroughLabel, parseYear } from './labels'

describe('pay labels', () => {
  it('words each timesheet status without implying payment', () => {
    expect(PAY_STATUS_LABEL).toEqual({
      draft: 'Not submitted',
      submitted: 'Waiting for approval',
      rejected: 'Returned for changes',
      approved: 'Approved',
    })
  })

  it('formats one or several frozen rates', () => {
    expect(formatPayRates(['80.00'], 'USD')).toBe('$80.00')
    expect(formatPayRates(['80.00', '85.00'], 'USD')).toBe('$80.00 / $85.00')
    expect(formatPayRates(null, 'USD')).toBe('—')
    expect(formatPayRates([], 'USD')).toBe('—')
  })

  it('derives Paid through from type and vendor', () => {
    expect(paidThroughLabel('employee', null)).toBe('Paid directly')
    expect(paidThroughLabel('independent', null)).toBe('Paid directly')
    expect(paidThroughLabel('vendor', 'Northwind Staffing')).toBe('Northwind Staffing')
    expect(paidThroughLabel('vendor', null)).toBe('Their employer')
  })

  it('labels consultant types with how they are paid', () => {
    expect(CONSULTANT_TYPE_LABEL).toEqual({
      employee: 'Employee — paid directly (payroll)',
      independent: 'Independent contractor — paid directly',
      vendor: 'Contractor through a vendor — paid by their employer',
    })
  })

  it('parses the year query, falling back to the current year', () => {
    expect(parseYear('2025', 2026)).toBe(2025)
    expect(parseYear(undefined, 2026)).toBe(2026)
    expect(parseYear('abc', 2026)).toBe(2026)
    expect(parseYear('1999', 2026)).toBe(2026)
    expect(parseYear('2101', 2026)).toBe(2026)
  })
})
