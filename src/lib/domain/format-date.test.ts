import { describe, expect, it } from 'vitest'
import { formatDate, formatDateRange, formatDateTime } from './format-date'

describe('formatDate', () => {
  it('writes a date US style, with the year', () => {
    expect(formatDate('2026-11-16')).toBe('Nov 16, 2026')
    expect(formatDate('2026-09-05')).toBe('Sep 5, 2026')
    expect(formatDate('2027-01-01')).toBe('Jan 1, 2027')
  })

  it('never shifts the day, whatever the time zone', () => {
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
    expect(formatDate('2026-11-16T23:30:00Z')).toBe('Nov 16, 2026')
  })

  it('is blank for a missing date and leaves anything else as it is', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatDate('not a date')).toBe('not a date')
  })
})

describe('formatDateTime', () => {
  it('writes the date and time in UTC, labelled', () => {
    expect(formatDateTime('2026-11-16T15:04:00Z')).toBe('Nov 16, 2026, 3:04 PM UTC')
    expect(formatDateTime('2026-09-05T00:07:59.123+00:00')).toBe('Sep 5, 2026, 12:07 AM UTC')
  })

  it('leaves an unreadable value as it is', () => {
    expect(formatDateTime('soon')).toBe('soon')
  })
})

describe('formatDateRange', () => {
  it('joins two dates with "to"', () => {
    expect(formatDateRange('2026-11-01', '2026-11-30')).toBe('Nov 1, 2026 to Nov 30, 2026')
  })
})
