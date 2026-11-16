import { csvField } from './pnl-csv'
import type { OpenInvoiceRow, ReceivableRow, ReceivableTotals } from './receivables'

const SUMMARY_HEADER = [
  'Client',
  'Not yet due',
  '1–30 days',
  '31–60 days',
  '61–90 days',
  'Over 90 days',
  'Total owed',
  'Oldest overdue (days)',
  'Avg days to pay',
  'Avg days late',
  'Open invoices',
]

const INVOICES_HEADER = ['Client', 'Invoice', 'Issue date', 'Due date', 'Total', 'Paid', 'Balance', 'Days overdue']

/** First cell is text; the rest are numbers/dates. */
export function csvLine(cells: string[]): string {
  return cells.map((c, i) => csvField(c, { text: i === 0 })).join(',')
}

export function csvBody(lines: string[]): string {
  return `﻿${lines.join('\r\n')}\r\n`
}

export function buildReceivablesSummaryCsv(
  rows: ReceivableRow[],
  totals: ReceivableTotals,
  today: string,
): { filename: string; body: string } {
  const lines = [SUMMARY_HEADER.join(',')]
  for (const r of rows) {
    lines.push(
      csvLine([
        r.clientName, r.notDue, r.d1_30, r.d31_60, r.d61_90, r.d90Plus, r.total,
        String(r.oldestOverdueDays), r.avgDaysToPay ?? '', r.avgDaysLate ?? '', String(r.openInvoices),
      ]),
    )
  }
  lines.push(
    csvLine([
      'Total', totals.notDue, totals.d1_30, totals.d31_60, totals.d61_90, totals.d90Plus, totals.total,
      '', '', '', String(totals.openInvoices),
    ]),
  )
  return { filename: `receivables-summary-${today}.csv`, body: csvBody(lines) }
}

export function buildOpenInvoicesCsv(rows: OpenInvoiceRow[], today: string): { filename: string; body: string } {
  const lines = [INVOICES_HEADER.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvField(r.clientName, { text: true }),
        csvField(r.number, { text: true }),
        r.issueDate, r.dueDate, r.total, r.amountPaid, r.balance, String(r.daysOverdue),
      ].join(','),
    )
  }
  return { filename: `receivables-invoices-${today}.csv`, body: csvBody(lines) }
}
