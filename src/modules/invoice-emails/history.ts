export type InvoiceEmailStatus = 'sending' | 'sent' | 'failed'
export type HistoryStatus = 'Sent' | 'Failed' | 'Sending' | 'Unknown'

const STUCK_MS = 10 * 60 * 1000

/** Starts the error of a failed row where the mail service never answered: it may have gone. */
export const NO_RESPONSE_PREFIX = 'No response: '

/**
 * Unknown = we can't tell whether it went: the mail service never answered, or the row is still
 * 'sending' after 10 minutes (the server stopped mid-send).
 */
export function historyStatus(
  row: { status: InvoiceEmailStatus; createdAt: string; error?: string | null },
  now: Date,
): HistoryStatus {
  if (row.status === 'sent') return 'Sent'
  if (row.status === 'failed') return row.error?.startsWith(NO_RESPONSE_PREFIX) ? 'Unknown' : 'Failed'
  return now.getTime() - new Date(row.createdAt).getTime() > STUCK_MS ? 'Unknown' : 'Sending'
}
