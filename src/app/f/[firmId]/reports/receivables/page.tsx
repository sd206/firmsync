import { formatDate } from '@/lib/domain/format-date'
import Link from 'next/link'
import { requireFirmRole } from '@/lib/auth/context'
import { todayIso } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { listClients } from '@/modules/clients/data'
import { getFirm } from '@/modules/firms/data'
import { ageingQuery, parseAgeingParams, type AgeingParams } from '@/modules/reports/ageing-params'
import { getOpenInvoices, getReceivables } from '@/modules/reports/receivables'
import { MultiSelect } from '../pnl/multi-select'

export const dynamic = 'force-dynamic'

type Sp = Record<string, string | string[] | undefined>

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'
const num = 'py-2 pr-4 text-right whitespace-nowrap'
const button = 'inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium'

// Must match receivables_report's `paid` step (20261116000047_ar_ap_reports.sql): status paid,
// last payment within the last 365 days; days to pay = last payment date − issue date,
// days late = last payment date − due date (0 if on time).
const AVG_DAYS_TO_PAY_HELP =
  'Average days from issue to final payment, for invoices fully paid in the last 12 months.'
const AVG_DAYS_LATE_HELP =
  'Average days from due date to final payment (0 when paid on time), for the same invoices.'

export default async function ReceivablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string }>
  searchParams: Promise<Sp>
}) {
  const { firmId } = await params
  const sp = await searchParams
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const today = todayIso()
  const p = parseAgeingParams(sp, 'clients', 'client')

  const [report, detail, clients, firm] = await Promise.all([
    getReceivables(db, firmId, today, p),
    p.focus ? getOpenInvoices(db, firmId, today, p) : null,
    listClients(db, firmId, { includeInactive: true }),
    getFirm(db, firmId),
  ])
  const currency = firm.ok ? firm.data.currency : 'USD'
  const money = (v: string) => formatMoney(v, currency)
  const error = !report.ok ? report.error : detail && !detail.ok ? detail.error : null

  const base = `/f/${firmId}/reports/receivables`
  const href = (next: AgeingParams) => {
    const q = ageingQuery(next, 'clients', 'client').toString()
    return q ? `${base}?${q}` : base
  }
  const csvHref = (view: 'summary' | 'invoices') => {
    const q = ageingQuery(view === 'summary' ? { ...p, focus: null } : p, 'clients', 'client')
    q.set('view', view)
    return `${base}/csv?${q.toString()}`
  }
  const options = clients.ok ? clients.data.map((c) => ({ id: c.id, name: c.name })) : []
  const focusName =
    p.focus && report.ok
      ? (report.data.rows.find((r) => r.clientId === p.focus)?.clientName ?? options.find((o) => o.id === p.focus)?.name)
      : undefined

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-semibold">Receivables</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What each client owes you today, how overdue it is, and how quickly they usually pay.
      </p>

      <form method="get" aria-label="Filter receivables" className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <MultiSelect
          label="Clients"
          name="clients"
          groups={[{ heading: null, options }]}
          selected={p.ids}
          noun={{ all: 'All clients', plural: 'clients' }}
        />
        <label className="flex h-8 items-center gap-2">
          <input type="checkbox" name="overdue" value="1" defaultChecked={p.overdueOnly} />
          Overdue only
        </label>
        <button type="submit" className={`${button} border`}>
          Apply
        </button>
        {!error && (
          <>
            <a href={csvHref('summary')} className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}>
              Download summary (CSV)
            </a>
            <a href={csvHref('invoices')} className={`${button} border`}>
              Download invoices (CSV)
            </a>
          </>
        )}
      </form>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : report.ok ? (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Total owed', money(report.data.totals.total)],
              ['Overdue', money(report.data.totals.overdue)],
              ['Over 60 days', money(report.data.totals.over60)],
              ['Clients with overdue invoices', String(report.data.totals.overdueClients)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {report.data.rows.length === 0 ? (
            <p className="mt-6 text-sm">Nobody owes you anything right now.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Amounts owed by client</caption>
                <thead>
                  <tr className="border-b">
                    <th scope="col" className={th}>Client</th>
                    <th scope="col" className={`${th} text-right`}>Not yet due</th>
                    <th scope="col" className={`${th} text-right`}>1–30 days</th>
                    <th scope="col" className={`${th} text-right`}>31–60 days</th>
                    <th scope="col" className={`${th} text-right`}>61–90 days</th>
                    <th scope="col" className={`${th} text-right`}>Over 90 days</th>
                    <th scope="col" className={`${th} text-right`}>Total owed</th>
                    <th scope="col" className={`${th} text-right`}>Oldest overdue (days)</th>
                    <th scope="col" className={`${th} text-right`} title={AVG_DAYS_TO_PAY_HELP}>
                      Avg days to pay
                    </th>
                    <th scope="col" className={`${th} text-right`} title={AVG_DAYS_LATE_HELP}>
                      Avg days late
                    </th>
                    <th scope="col" className={`${th} text-right`}>Open invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.rows.map((r) => (
                    <tr key={r.clientId} className={`border-b ${r.clientId === p.focus ? 'bg-muted' : ''}`}>
                      <th scope="row" className={`${td} font-normal`}>
                        <Link href={href({ ...p, focus: r.clientId })} className="underline underline-offset-2">
                          {r.clientName}
                        </Link>
                      </th>
                      <td className={num}>{money(r.notDue)}</td>
                      <td className={num}>{money(r.d1_30)}</td>
                      <td className={num}>{money(r.d31_60)}</td>
                      <td className={num}>{money(r.d61_90)}</td>
                      <td className={num}>{money(r.d90Plus)}</td>
                      <td className={`${num} font-medium`}>{money(r.total)}</td>
                      <td className={num}>{r.oldestOverdueDays > 0 ? r.oldestOverdueDays : ''}</td>
                      <td className={num}>{r.avgDaysToPay ?? '—'}</td>
                      <td className={num}>{r.avgDaysLate ?? '—'}</td>
                      <td className={num}>{r.openInvoices}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <th scope="row" className={`${td} text-left`}>Total</th>
                    <td className={num}>{money(report.data.totals.notDue)}</td>
                    <td className={num}>{money(report.data.totals.d1_30)}</td>
                    <td className={num}>{money(report.data.totals.d31_60)}</td>
                    <td className={num}>{money(report.data.totals.d61_90)}</td>
                    <td className={num}>{money(report.data.totals.d90Plus)}</td>
                    <td className={num}>{money(report.data.totals.total)}</td>
                    <td />
                    <td />
                    <td />
                    <td className={num}>{report.data.totals.openInvoices}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2 text-xs text-muted-foreground" data-testid="avg-days-help">
                <strong className="font-medium">Avg days to pay:</strong> {AVG_DAYS_TO_PAY_HELP}{' '}
                <strong className="font-medium">Avg days late:</strong> {AVG_DAYS_LATE_HELP}
              </p>
            </div>
          )}

          {p.focus && detail && detail.ok && (
            <section className="mt-8" aria-labelledby="open-invoices">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="open-invoices" className="text-lg font-semibold">
                  Open invoices — {focusName ?? 'client'}
                </h2>
                <Link href={href({ ...p, focus: null })} className="text-sm underline underline-offset-2">
                  Show all clients
                </Link>
              </div>
              {detail.data.length === 0 ? (
                <p className="mt-3 text-sm">No open invoices for this client.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th scope="col" className={th}>Invoice</th>
                        <th scope="col" className={th}>Issue date</th>
                        <th scope="col" className={th}>Due date</th>
                        <th scope="col" className={`${th} text-right`}>Total</th>
                        <th scope="col" className={`${th} text-right`}>Paid</th>
                        <th scope="col" className={`${th} text-right`}>Balance</th>
                        <th scope="col" className={`${th} text-right`}>Days overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.map((i) => (
                        <tr key={i.invoiceId} className="border-b">
                          <th scope="row" className={`${td} font-normal`}>
                            <Link href={`/f/${firmId}/invoices/${i.invoiceId}`} className="underline underline-offset-2">
                              {i.number}
                            </Link>
                          </th>
                          <td className={`${td} whitespace-nowrap`}>{formatDate(i.issueDate)}</td>
                          <td className={`${td} whitespace-nowrap`}>{formatDate(i.dueDate)}</td>
                          <td className={num}>{money(i.total)}</td>
                          <td className={num}>{money(i.amountPaid)}</td>
                          <td className={`${num} font-medium`}>{money(i.balance)}</td>
                          <td className={num}>{i.daysOverdue > 0 ? i.daysOverdue : 'Not yet due'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}
