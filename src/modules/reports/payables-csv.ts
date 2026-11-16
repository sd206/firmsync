import { csvField } from './pnl-csv'
import { BILL_STATUS_LABEL, type OpenBillRow, type PayableRow, type PayableTotals } from './payables'
import { csvBody, csvLine } from './receivables-csv'

const SUMMARY_HEADER = [
  'Vendor',
  'Due in 7 days',
  'Due in 8–30 days',
  'Due later',
  '1–30 days overdue',
  '31–60 days overdue',
  '61–90 days overdue',
  'Over 90 days overdue',
  'Total owed',
  'Awaiting approval',
  'Oldest overdue (days)',
]

const BILLS_HEADER = ['Vendor', 'Bill', 'Status', 'Bill date', 'Due date', 'Total', 'Paid', 'Balance', 'Days overdue']

export function buildPayablesSummaryCsv(
  rows: PayableRow[],
  totals: PayableTotals,
  today: string,
): { filename: string; body: string } {
  const lines = [SUMMARY_HEADER.join(',')]
  for (const r of rows) {
    lines.push(
      csvLine([
        r.vendorName, r.due7, r.due8_30, r.dueLater, r.d1_30, r.d31_60, r.d61_90, r.d90Plus, r.total,
        r.awaitingApproval, String(r.oldestOverdueDays),
      ]),
    )
  }
  lines.push(
    csvLine([
      'Total', totals.due7, totals.due8_30, totals.dueLater, totals.d1_30, totals.d31_60, totals.d61_90, totals.d90Plus,
      totals.total, totals.awaitingApproval, '',
    ]),
  )
  return { filename: `payables-summary-${today}.csv`, body: csvBody(lines) }
}

/** Days overdue is signed: a negative number means the bill is due in that many days. */
export function buildOpenBillsCsv(rows: OpenBillRow[], today: string): { filename: string; body: string } {
  const lines = [BILLS_HEADER.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvField(r.vendorName, { text: true }),
        csvField(r.billNumber, { text: true }),
        BILL_STATUS_LABEL[r.status],
        r.billDate, r.dueDate, r.total, r.amountPaid, r.balance, String(r.daysOverdue),
      ].join(','),
    )
  }
  return { filename: `payables-bills-${today}.csv`, body: csvBody(lines) }
}
