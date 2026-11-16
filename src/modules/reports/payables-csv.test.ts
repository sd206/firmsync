import { describe, expect, it } from 'vitest'
import { payableTotals, type OpenBillRow, type PayableRow } from './payables'
import { buildOpenBillsCsv, buildPayablesSummaryCsv } from './payables-csv'

const zero = { due7: '0.00', due8_30: '0.00', dueLater: '0.00', d1_30: '0.00', d31_60: '0.00', d61_90: '0.00', d90Plus: '0.00' }
const v: PayableRow = {
  ...zero, vendorId: 'v', vendorName: 'Acme Staffing', due7: '30.00', due8_30: '40.00', dueLater: '80.00', d31_60: '250.00',
  total: '400.00', awaitingApproval: '70.00', awaitingCount: 1, oldestOverdueDays: 45,
}
const w: PayableRow = {
  ...zero, vendorId: 'w', vendorName: 'Zed', due7: '15.00', d1_30: '5.00', total: '20.00', awaitingApproval: '0.00',
  awaitingCount: 0, oldestOverdueDays: 3,
}

describe('payableTotals', () => {
  it('keeps awaiting approval apart from total owed', () => {
    expect(payableTotals([v, w])).toEqual({
      total: '420.00', overdue: '255.00', due7: '45.00', awaitingApproval: '70.00', awaitingCount: 1,
      due8_30: '40.00', dueLater: '80.00', d1_30: '5.00', d31_60: '250.00', d61_90: '0.00', d90Plus: '0.00',
    })
  })
})

describe('payables CSVs', () => {
  it('summary header, rows and Total row', () => {
    const { filename, body } = buildPayablesSummaryCsv([v], payableTotals([v]), '2026-11-16')
    expect(filename).toBe('payables-summary-2026-11-16.csv')
    const lines = body.replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'Vendor,Due in 7 days,Due in 8–30 days,Due later,1–30 days overdue,31–60 days overdue,61–90 days overdue,Over 90 days overdue,Total owed,Awaiting approval,Oldest overdue (days)',
    )
    expect(lines[1]).toBe('Acme Staffing,30.00,40.00,80.00,0.00,250.00,0.00,0.00,400.00,70.00,45')
    expect(lines.at(-1)).toBe('Total,30.00,40.00,80.00,0.00,250.00,0.00,0.00,400.00,70.00,')
  })

  it('bills CSV shows the status label and signed days', () => {
    const b: OpenBillRow = {
      billId: 'b', billNumber: 'B-PEND', vendorId: 'v', vendorName: 'Acme Staffing', status: 'pending_approval',
      billDate: '2026-06-01', dueDate: '2026-06-12', total: '70.00', amountPaid: '0.00', balance: '70.00', daysOverdue: -4,
    }
    const { filename, body } = buildOpenBillsCsv([b], '2026-11-16')
    expect(filename).toBe('payables-bills-2026-11-16.csv')
    const lines = body.replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(lines[0]).toBe('Vendor,Bill,Status,Bill date,Due date,Total,Paid,Balance,Days overdue')
    expect(lines[1]).toBe('Acme Staffing,B-PEND,Awaiting approval,2026-06-01,2026-06-12,70.00,0.00,70.00,-4')
  })
})
