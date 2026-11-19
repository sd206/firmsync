import Link from 'next/link'
import type { ConsultantType } from '@/lib/db-types'
import { formatDate } from '@/lib/domain/format-date'
import { sumHours } from '@/lib/domain/hours'
import { formatMoney, sumMoney } from '@/lib/domain/money'
import type { PayMonth, PayWeek } from '@/modules/pay/data'
import { PAY_STATUS_LABEL, formatPayRates, paidThroughLabel } from '@/modules/pay/labels'
import { PrintButton } from './print-button'

const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthLabel = (iso: string) => MONTH_FMT.format(new Date(`${iso}T00:00:00Z`))

export type HoursAndPayProps = {
  heading: string
  firmName: string
  currency: string
  consultantType: ConsultantType
  /** The current employer (vendor) name; null when paid directly. */
  currentEmployer: string | null
  year: number
  /** Link for a given year (keeps the route; changes ?year=). */
  yearHref: (year: number) => string
  /** Link to the timesheet for a week. */
  weekHref: (weekStart: string) => string
  weeks: PayWeek[]
  months: PayMonth[]
}

/** "My hours and pay": the same view for the consultant and, read-only, for admins and managers. */
export function HoursAndPay(p: HoursAndPayProps) {
  // Paid through today follows Type; past weeks follow what was recorded when each was approved.
  const byEmployer = p.consultantType === 'vendor'
  const paidThrough = paidThroughLabel(p.consultantType, p.currentEmployer)
  const directMonths = p.months.filter((m) => m.employerName === null)
  const billedMonths = p.months.filter((m) => m.employerName !== null)
  const anyDirect = directMonths.length > 0 || p.weeks.some((w) => w.gross !== null) || !byEmployer
  const employers = [...new Set(p.weeks.map((w) => w.employerName).concat(billedMonths.map((m) => m.employerName)))]
    .filter((e): e is string => e !== null)
  const years = [p.year - 1, p.year, p.year + 1]

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{p.heading}</h1>
        <div className="flex items-center gap-3 text-sm print:hidden">
          <nav aria-label="Year" className="flex gap-2">
            {years.map((y) => (
              <Link
                key={y}
                href={p.yearHref(y)}
                aria-current={y === p.year ? 'page' : undefined}
                className={`underline-offset-4 ${y === p.year ? 'font-semibold' : 'underline'}`}
              >
                {y}
              </Link>
            ))}
          </nav>
          <PrintButton />
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {p.year} · Paid through: {paidThrough}
      </p>

      <h2 className="mt-6 text-lg font-medium">By month</h2>
      <p className="text-sm text-muted-foreground">Approved hours, by the date worked.</p>
      {p.months.length === 0 ? (
        <p className="mt-2 text-sm">No approved hours in {p.year} yet.</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Approved hours by month</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-4 font-medium">Month</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Approved hours</th>
              <th scope="col" className="py-2 text-right font-medium">{anyDirect ? 'Gross amount' : 'Billed by'}</th>
            </tr>
          </thead>
          <tbody>
            {p.months.map((m) => (
              <tr key={`${m.month}-${m.employerName ?? ''}`} className="border-b">
                <th scope="row" className="py-2 pr-4 font-normal">{monthLabel(m.month)}</th>
                <td className="py-2 pr-4 text-right tabular-nums">{m.hours}</td>
                <td className="py-2 text-right tabular-nums">
                  {m.gross !== null ? formatMoney(m.gross, p.currency) : `Billed by ${m.employerName}`}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <th scope="row" className="py-2 pr-4">Total</th>
              <td className="py-2 pr-4 text-right tabular-nums">{sumHours(p.months.map((m) => m.hours))}</td>
              <td className="py-2 text-right tabular-nums">
                {directMonths.length > 0 ? formatMoney(sumMoney(directMonths.map((m) => m.gross ?? '0')), p.currency) : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <h2 className="mt-8 text-lg font-medium">By week</h2>
      {p.weeks.length === 0 ? (
        <p className="mt-2 text-sm">No timesheets in {p.year} yet.</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">Timesheets by week, newest first</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-4 font-medium">Week of</th>
              <th scope="col" className="py-2 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Hours</th>
              {anyDirect && <th scope="col" className="py-2 pr-4 text-right font-medium">Pay rate</th>}
              <th scope="col" className="py-2 text-right font-medium">{anyDirect ? 'Gross amount' : 'Billed by'}</th>
            </tr>
          </thead>
          <tbody>
            {p.weeks.map((w) => (
              <tr key={w.weekStart} className="border-b align-top">
                <th scope="row" className="py-2 pr-4 font-normal">
                  <Link href={p.weekHref(w.weekStart)} className="underline underline-offset-4 print:no-underline">
                    {formatDate(w.weekStart)}
                  </Link>
                </th>
                <td className="py-2 pr-4">
                  {PAY_STATUS_LABEL[w.status]}
                  {w.status === 'rejected' && w.comment ? (
                    <span className="block text-muted-foreground">&ldquo;{w.comment}&rdquo;</span>
                  ) : null}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{w.hours}</td>
                {anyDirect && (
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {w.employerName ? '' : formatPayRates(w.payRates, p.currency)}
                  </td>
                )}
                <td className="py-2 text-right tabular-nums">
                  {w.employerName
                    ? `Billed by ${w.employerName}`
                    : w.gross !== null
                      ? formatMoney(w.gross, p.currency)
                      : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 space-y-2 text-sm text-muted-foreground">
        {anyDirect && (
          <p>
            Gross amount = approved hours × your pay rate on each day, before tax and deductions. This is not a
            payslip and doesn&apos;t show whether you&apos;ve been paid. For payment questions, contact {p.firmName}.
          </p>
        )}
        {employers.map((e) => (
          <p key={e}>
            Your hours are billed to {p.firmName} by {e}. Your pay comes from {e}.
          </p>
        ))}
        {byEmployer && p.currentEmployer && !employers.includes(p.currentEmployer) && (
          <p>
            Your hours are billed to {p.firmName} by {p.currentEmployer}. Your pay comes from {p.currentEmployer}.
          </p>
        )}
      </div>
    </div>
  )
}
