import type { ConsultantType, TimesheetStatus } from '@/lib/db-types'
import { formatMoney } from '@/lib/domain/money'

/** Timesheet status on "My hours and pay". No wording that suggests money was sent. */
export const PAY_STATUS_LABEL: Record<TimesheetStatus, string> = {
  draft: 'Not submitted',
  submitted: 'Waiting for approval',
  rejected: 'Returned for changes',
  approved: 'Approved',
}

/** Type options on the consultant form, saying how each is paid. */
export const CONSULTANT_TYPE_LABEL: Record<ConsultantType, string> = {
  employee: 'Employee — paid directly (payroll)',
  independent: 'Independent contractor — paid directly',
  vendor: 'Contractor through a vendor — paid by their employer',
}

export const PAID_DIRECTLY = 'Paid directly'

/** Paid through is derived from Type: a vendor contractor is paid by their employer. */
export function paidThroughLabel(type: ConsultantType, vendorName: string | null): string {
  if (type !== 'vendor') return PAID_DIRECTLY
  return vendorName ?? 'Their employer'
}

/** The distinct frozen pay rates of a week, e.g. "$80.00 / $85.00"; "—" when none are shown. */
export function formatPayRates(rates: string[] | null, currency: string): string {
  if (!rates || rates.length === 0) return '—'
  return rates.map((r) => formatMoney(r, currency)).join(' / ')
}

/** The ?year= query, within 2000–2100; otherwise the current year. */
export function parseYear(value: string | undefined, currentYear: number): number {
  if (!value || !/^\d{4}$/.test(value)) return currentYear
  const y = Number(value)
  return y >= 2000 && y <= 2100 ? y : currentYear
}
