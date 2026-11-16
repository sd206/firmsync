import Link from 'next/link'
import { requireFirmRole } from '@/lib/auth/context'
import { overdueLabel } from '@/lib/domain/ageing'
import { todayIso } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { getFirm } from '@/modules/firms/data'
import { ageingQuery, parseAgeingParams, type AgeingParams } from '@/modules/reports/ageing-params'
import { BILL_STATUS_LABEL, getOpenBills, getPayables } from '@/modules/reports/payables'
import { listVendors } from '@/modules/vendors/data'
import { MultiSelect } from '../pnl/multi-select'

export const dynamic = 'force-dynamic'

type Sp = Record<string, string | string[] | undefined>

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'
const num = 'py-2 pr-4 text-right whitespace-nowrap'
const button = 'inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium'

function dueText(daysOverdue: number): string {
  if (daysOverdue > 0) return overdueLabel(daysOverdue) ?? ''
  if (daysOverdue === 0) return 'Due today'
  return daysOverdue === -1 ? 'Due in 1 day' : `Due in ${-daysOverdue} days`
}

export default async function PayablesPage({
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
  const p = parseAgeingParams(sp, 'vendors', 'vendor')

  const [report, detail, vendors, firm] = await Promise.all([
    getPayables(db, firmId, today, p),
    p.focus ? getOpenBills(db, firmId, today, p) : null,
    listVendors(db, firmId),
    getFirm(db, firmId),
  ])
  const currency = firm.ok ? firm.data.currency : 'USD'
  const money = (v: string) => formatMoney(v, currency)
  const error = !report.ok ? report.error : detail && !detail.ok ? detail.error : null

  const base = `/f/${firmId}/reports/payables`
  const href = (next: AgeingParams) => {
    const q = ageingQuery(next, 'vendors', 'vendor').toString()
    return q ? `${base}?${q}` : base
  }
  const csvHref = (view: 'summary' | 'bills') => {
    const q = ageingQuery(view === 'summary' ? { ...p, focus: null } : p, 'vendors', 'vendor')
    q.set('view', view)
    return `${base}/csv?${q.toString()}`
  }
  const options = vendors.ok ? vendors.data.map((v) => ({ id: v.id, name: v.name })) : []
  const focusName =
    p.focus && report.ok
      ? (report.data.rows.find((r) => r.vendorId === p.focus)?.vendorName ?? options.find((o) => o.id === p.focus)?.name)
      : undefined

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-semibold">Payables</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What you owe each vendor today, what falls due soon, and what is still waiting for approval.
      </p>

      <form method="get" aria-label="Filter payables" className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <MultiSelect
          label="Vendors"
          name="vendors"
          groups={[{ heading: null, options }]}
          selected={p.ids}
          noun={{ all: 'All vendors', plural: 'vendors' }}
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
            <a href={csvHref('bills')} className={`${button} border`}>
              Download bills (CSV)
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
              ['Due in next 7 days', money(report.data.totals.due7)],
              [
                'Awaiting approval',
                `${money(report.data.totals.awaitingApproval)} · ${report.data.totals.awaitingCount} ${
                  report.data.totals.awaitingCount === 1 ? 'bill' : 'bills'
                }`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {report.data.rows.length === 0 ? (
            <p className="mt-6 text-sm">No vendor bills are waiting to be paid.</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Amounts owed by vendor</caption>
                <thead>
                  <tr className="border-b">
                    <th scope="col" className={th}>Vendor</th>
                    <th scope="col" className={`${th} text-right`}>Due in 7 days</th>
                    <th scope="col" className={`${th} text-right`}>Due in 8–30 days</th>
                    <th scope="col" className={`${th} text-right`}>Due later</th>
                    <th scope="col" className={`${th} text-right`}>1–30 days overdue</th>
                    <th scope="col" className={`${th} text-right`}>31–60 days overdue</th>
                    <th scope="col" className={`${th} text-right`}>61–90 days overdue</th>
                    <th scope="col" className={`${th} text-right`}>Over 90 days overdue</th>
                    <th scope="col" className={`${th} text-right`}>Total owed</th>
                    <th scope="col" className={`${th} text-right text-muted-foreground`}>Awaiting approval</th>
                    <th scope="col" className={`${th} text-right`}>Oldest overdue (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.rows.map((r) => (
                    <tr key={r.vendorId} className={`border-b ${r.vendorId === p.focus ? 'bg-muted' : ''}`}>
                      <th scope="row" className={`${td} font-normal`}>
                        <Link href={href({ ...p, focus: r.vendorId })} className="underline underline-offset-2">
                          {r.vendorName}
                        </Link>
                      </th>
                      <td className={num}>{money(r.due7)}</td>
                      <td className={num}>{money(r.due8_30)}</td>
                      <td className={num}>{money(r.dueLater)}</td>
                      <td className={num}>{money(r.d1_30)}</td>
                      <td className={num}>{money(r.d31_60)}</td>
                      <td className={num}>{money(r.d61_90)}</td>
                      <td className={num}>{money(r.d90Plus)}</td>
                      <td className={`${num} font-medium`}>{money(r.total)}</td>
                      <td className={`${num} text-muted-foreground`}>
                        {r.awaitingCount > 0 ? `${money(r.awaitingApproval)} (${r.awaitingCount})` : '—'}
                      </td>
                      <td className={num}>{r.oldestOverdueDays > 0 ? r.oldestOverdueDays : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <th scope="row" className={`${td} text-left`}>Total</th>
                    <td className={num}>{money(report.data.totals.due7)}</td>
                    <td className={num}>{money(report.data.totals.due8_30)}</td>
                    <td className={num}>{money(report.data.totals.dueLater)}</td>
                    <td className={num}>{money(report.data.totals.d1_30)}</td>
                    <td className={num}>{money(report.data.totals.d31_60)}</td>
                    <td className={num}>{money(report.data.totals.d61_90)}</td>
                    <td className={num}>{money(report.data.totals.d90Plus)}</td>
                    <td className={num}>{money(report.data.totals.total)}</td>
                    <td className={`${num} text-muted-foreground`}>{money(report.data.totals.awaitingApproval)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">Bills awaiting approval are not included in Total owed.</p>
            </div>
          )}

          {p.focus && detail && detail.ok && (
            <section className="mt-8" aria-labelledby="open-bills">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="open-bills" className="text-lg font-semibold">
                  Open bills — {focusName ?? 'vendor'}
                </h2>
                <Link href={href({ ...p, focus: null })} className="text-sm underline underline-offset-2">
                  Show all vendors
                </Link>
              </div>
              {detail.data.length === 0 ? (
                <p className="mt-3 text-sm">No open bills for this vendor.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th scope="col" className={th}>Bill</th>
                        <th scope="col" className={th}>Status</th>
                        <th scope="col" className={th}>Bill date</th>
                        <th scope="col" className={th}>Due date</th>
                        <th scope="col" className={`${th} text-right`}>Total</th>
                        <th scope="col" className={`${th} text-right`}>Paid</th>
                        <th scope="col" className={`${th} text-right`}>Balance</th>
                        <th scope="col" className={th}>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.map((b) => (
                        <tr key={b.billId} className="border-b">
                          <th scope="row" className={`${td} font-normal`}>
                            <Link href={`/f/${firmId}/vendor-bills/${b.billId}`} className="underline underline-offset-2">
                              {b.billNumber}
                            </Link>
                          </th>
                          <td className={td}>{BILL_STATUS_LABEL[b.status]}</td>
                          <td className={`${td} whitespace-nowrap`}>{b.billDate}</td>
                          <td className={`${td} whitespace-nowrap`}>{b.dueDate}</td>
                          <td className={num}>{money(b.total)}</td>
                          <td className={num}>{money(b.amountPaid)}</td>
                          <td className={`${num} font-medium`}>{money(b.balance)}</td>
                          <td className={`${td} whitespace-nowrap`}>{dueText(b.daysOverdue)}</td>
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
