export type InvoiceEmailStatus = 'sending' | 'sent' | 'failed'
export type HistoryStatus = 'Sent' | 'Failed' | 'Sending' | 'Unknown'

const STUCK_MS = 10 * 60 * 1000

/** A row still 'sending' after 10 minutes means the server stopped mid-send: we can't tell if it went. */
export function historyStatus(row: { status: InvoiceEmailStatus; createdAt: string }, now: Date): HistoryStatus {
  if (row.status === 'sent') return 'Sent'
  if (row.status === 'failed') return 'Failed'
  return now.getTime() - new Date(row.createdAt).getTime() > STUCK_MS ? 'Unknown' : 'Sending'
}
