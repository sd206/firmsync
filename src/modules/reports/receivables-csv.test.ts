import { describe, expect, it } from 'vitest'
import { receivableTotals, type OpenInvoiceRow, type ReceivableRow } from './receivables'
import { buildOpenInvoicesCsv, buildReceivablesSummaryCsv } from './receivables-csv'

const rowA: ReceivableRow = {
  clientId: 'a', clientName: 'Acme, Inc.', notDue: '500.00', d1_30: '100.00', d31_60: '0.00', d61_90: '0.00',
  d90Plus: '350.00', total: '950.00', oldestOverdueDays: 91, openInvoices: 3, avgDaysToPay: '20.0', avgDaysLate: '2.5',
}
const rowB: ReceivableRow = {
  clientId: 'b', clientName: 'Beta', notDue: '0.00', d1_30: '0.00', d31_60: '300.00', d61_90: '0.00',
  d90Plus: '0.00', total: '300.00', oldestOverdueDays: 31, openInvoices: 1, avgDaysToPay: null, avgDaysLate: null,
}
const rowC: ReceivableRow = { ...rowB, clientId: 'c', clientName: 'Gamma', d31_60: '0.00', notDue: '50.00', total: '50.00', oldestOverdueDays: 0 }

describe('receivableTotals', () => {
  it('sums buckets and counts overdue clients', () => {
    expect(receivableTotals([rowA, rowB, rowC])).toEqual({
      total: '1300.00', overdue: '750.00', over60: '350.00', overdueClients: 2,
      notDue: '550.00', d1_30: '100.00', d31_60: '300.00', d61_90: '0.00', d90Plus: '350.00', openInvoices: 5,
    })
  })
})

describe('receivables CSVs', () => {
  it('summary has the header, quoted names, blanks for no history and a Total row', () => {
    const { filename, body } = buildReceivablesSummaryCsv([rowA, rowB], receivableTotals([rowA, rowB]), '2026-11-16')
    expect(filename).toBe('receivables-summary-2026-11-16.csv')
    const lines = body.replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'Client,Not yet due,1–30 days,31–60 days,61–90 days,Over 90 days,Total owed,Oldest overdue (days),Avg days to pay,Avg days late,Open invoices',
    )
    expect(lines[1]).toBe('"Acme, Inc.",500.00,100.00,0.00,0.00,350.00,950.00,91,20.0,2.5,3')
    expect(lines[2]).toBe('Beta,0.00,0.00,300.00,0.00,0.00,300.00,31,,,1')
    expect(lines.at(-1)).toBe('Total,500.00,100.00,300.00,0.00,350.00,1250.00,,,,4')
  })

  it('invoices CSV lists each open invoice', () => {
    const inv: OpenInvoiceRow = {
      invoiceId: 'i', number: 'INV-7', clientId: 'a', clientName: '=Acme', issueDate: '2026-01-01', dueDate: '2026-01-31',
      total: '600.00', amountPaid: '250.00', balance: '350.00', daysOverdue: 91,
    }
    const { filename, body } = buildOpenInvoicesCsv([inv], '2026-11-16')
    expect(filename).toBe('receivables-invoices-2026-11-16.csv')
    const lines = body.replace(/^﻿/, '').trimEnd().split('\r\n')
    expect(lines[0]).toBe('Client,Invoice,Issue date,Due date,Total,Paid,Balance,Days overdue')
    expect(lines[1]).toBe("'=Acme,INV-7,2026-01-01,2026-01-31,600.00,250.00,350.00,91")
  })
})
