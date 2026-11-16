import Link from 'next/link'
import { requireFirmRole } from '@/lib/auth/context'
import { isIsoDate } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { getFirm } from '@/modules/firms/data'
import {
  BILL_FILTERS,
  BILL_STATUS_LABEL,
  listBills,
  listVendorOptions,
  type BillFilter,
  type BillFilters,
} from '@/modules/vendor-bills/data'

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'
const select = 'h-8 rounded-lg border bg-card px-2 text-sm'
const button = 'inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Sp = Record<string, string | string[] | undefined>

function one(sp: Sp, key: string): string | undefined {
  const v = sp[key]
  return typeof v === 'string' ? v : undefined
}

export default async function VendorBillsPage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string }>
  searchParams: Promise<Sp>
}) {
  const { firmId } = await params
  const sp = await searchParams
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const status = (BILL_FILTERS.some((f) => f.value === one(sp, 'status')) ? one(sp, 'status') : 'unpaid') as BillFilter
  const vendor = one(sp, 'vendor')
  const from = one(sp, 'from')
  const to = one(sp, 'to')
  const filters: BillFilters = {
    status,
    vendorId: vendor && UUID_RE.test(vendor) ? vendor : null,
    from: from && isIsoDate(from) ? from : null,
    to: to && isIsoDate(to) ? to : null,
  }
  const [list, vendors, firm] = await Promise.all([
    listBills(db, firmId, filters),
    listVendorOptions(db, firmId),
    getFirm(db, firmId),
  ])
  const currency = firm.ok ? firm.data.currency : 'USD'
  const m = (v: string) => formatMoney(v, currency)
  const base = `/f/${firmId}/vendor-bills`

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vendor bills</h1>
        <Link href={`${base}/new`} className={`${button} bg-primary text-primary-foreground hover:bg-primary-hover`}>
          New bill
        </Link>
      </div>

      {list.ok && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt>To pay</dt>
            <dd className="font-semibold" data-testid="to-pay">
              {m(list.data.totals.toPay)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt>Overdue</dt>
            <dd className="font-semibold text-amber-700 dark:text-amber-400" data-testid="overdue">
              {m(list.data.totals.overdue)}
            </dd>
          </div>
        </dl>
      )}

      <nav aria-label="Bill status" className="mt-4 flex flex-wrap gap-2 text-sm">
        {BILL_FILTERS.map((f) => {
          const q = new URLSearchParams({ status: f.value })
          if (filters.vendorId) q.set('vendor', filters.vendorId)
          if (filters.from) q.set('from', filters.from)
          if (filters.to) q.set('to', filters.to)
          const active = f.value === status
          return (
            <Link
              key={f.value}
              href={`${base}?${q.toString()}`}
              aria-current={active ? 'page' : undefined}
              className={`${button} border ${active ? 'bg-muted font-semibold' : ''}`}
            >
              {f.label}
            </Link>
          )
        })}
      </nav>

      <form method="get" aria-label="Filter bills" className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="status" value={status} />
        <div className="flex flex-col gap-1">
          <label htmlFor="f-vendor">Vendor</label>
          <select id="f-vendor" name="vendor" defaultValue={filters.vendorId ?? ''} className={select}>
            <option value="">All vendors</option>
            {(vendors.ok ? vendors.data : []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-from">Bill date from</label>
          <input id="f-from" name="from" type="date" defaultValue={filters.from ?? ''} className={select} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-to">To</label>
          <input id="f-to" name="to" type="date" defaultValue={filters.to ?? ''} className={select} />
        </div>
        <button type="submit" className={`${button} border`}>
          Filter
        </button>
      </form>

      {!list.ok ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {list.error}
        </p>
      ) : list.data.rows.length === 0 ? (
        <p className="mt-6 text-sm">No bills match these filters.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              {['Bill', 'Vendor', 'Bill date', 'Due', 'Total', 'Balance due', 'Status'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data.rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className={td}>
                  <Link href={`${base}/${r.id}`} className="underline underline-offset-4">
                    {r.billNumber}
                  </Link>
                </td>
                <td className={td}>{r.vendorName}</td>
                <td className={td}>{r.billDate}</td>
                <td className={td}>
                  {r.dueDate}
                  {r.overdue && <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">Overdue</span>}
                </td>
                <td className={td}>{m(r.total)}</td>
                <td className={td}>{m(r.balanceDue)}</td>
                <td className={td}>{BILL_STATUS_LABEL[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
