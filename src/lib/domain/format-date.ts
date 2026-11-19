/**
 * The one date format shown to people: US style, "Nov 16, 2026".
 * For display only: stored values and CSV exports keep ISO dates.
 * Always formatted in UTC, so a server in another time zone never shifts the day.
 */

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** `2026-11-16` (or a timestamp) -> `Nov 16, 2026`. Blank for null; anything unreadable is returned unchanged. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d)
}

/** A timestamp -> `Nov 16, 2026, 3:04 PM UTC`. Anything unreadable is returned unchanged. */
export function formatDateTime(ts: string): string {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : `${DATE_TIME.format(d).replace(/ /g, ' ')} UTC`
}

/** `Nov 1, 2026 to Nov 30, 2026`. */
export function formatDateRange(from: string, to: string): string {
  return `${formatDate(from)} to ${formatDate(to)}`
}
