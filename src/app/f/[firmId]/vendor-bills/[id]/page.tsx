import { formatDate, formatDateRange } from '@/lib/domain/format-date'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireFirmRole } from '@/lib/auth/context'
import { formatMoney } from '@/lib/domain/money'
import { rejectedFilesNotice, storageFullNotice } from '@/lib/domain/rejected-files'
import { getFirm } from '@/modules/firms/data'
import { BILL_STATUS_LABEL, getBill, type BillLineRow, type ContractorCost } from '@/modules/vendor-bills/data'
import { ApprovalBox, BillFiles, VendorPayments } from './bill-actions'

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'
const button = 'inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium'

export default async function BillPage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string; id: string }>
  searchParams: Promise<{ filesRejected?: string | string[]; storageFull?: string | string[] }>
}) {
  const { firmId, id } = await params
  const sp = await searchParams
  const { db, role } = await requireFirmRole(firmId, ['admin', 'manager'])
  const [res, firm] = await Promise.all([getBill(db, firmId, id), getFirm(db, firmId)])
  if (!res.ok) notFound()
  const b = res.data
  const currency = firm.ok ? firm.data.currency : 'USD'
  const m = (v: string) => formatMoney(v, currency)
  const base = `/f/${firmId}/vendor-bills`
  const editable = b.status === 'pending_approval' || b.status === 'rejected'
  const payable = b.status === 'approved' || b.status === 'partly_paid'
  const fileWarning = [storageFullNotice(sp.storageFull, 'Bill'), rejectedFilesNotice(sp.filesRejected)].filter(Boolean).join(' ')
  const counted = b.status === 'approved' || b.status === 'partly_paid' || b.status === 'paid'
  const signed = (v: string) => (Number(v) > 0 ? `+${m(v)}` : m(v))
  const where = (p: { clientName: string | null; projectName: string | null }) =>
    [p.clientName, p.projectName].filter(Boolean).join(' — ') || 'unallocated cost (no client)'

  return (
    <div className="max-w-5xl">
      <Link href={base} className="text-sm underline underline-offset-4">
        Vendor bills
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bill {b.billNumber}</h1>
        {editable && (
          <Link href={`${base}/${b.id}/edit`} className={`${button} border`}>
            Edit bill
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm">
        {b.vendorName} · Status: <span data-testid="status">{BILL_STATUS_LABEL[b.status]}</span>
        {b.overdue && <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">Overdue</span>}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Bill date {formatDate(b.billDate)}, due {formatDate(b.dueDate)}
        {b.periodStart && b.periodEnd ? `. Service period ${formatDateRange(b.periodStart, b.periodEnd)}` : ''}.
      </p>
      {b.notes && <p className="mt-1 whitespace-pre-line text-sm">{b.notes}</p>}
      {b.status === 'rejected' && b.rejectedReason && (
        <p role="status" className="mt-3 max-w-xl rounded-lg border border-destructive p-3 text-sm">
          Rejected: {b.rejectedReason}. Edit the bill to send it back for approval.
        </p>
      )}
      {fileWarning && (
        <p role="status" className="mt-3 text-sm">
          {fileWarning}
        </p>
      )}

      {role === 'admin' ? (
        <ApprovalBox firmId={firmId} billId={b.id} status={b.status} hasPayments={b.payments.length > 0} />
      ) : (
        b.status === 'pending_approval' && <p className="mt-4 text-sm text-muted-foreground">Waiting for an admin to approve.</p>
      )}

      <table className="mt-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            {['Type', 'Description', 'Category', 'Client / project', 'Amount'].map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.lines.map((l) => (
            <tr key={l.id} className="border-b">
              <td className={td}>{lineType(l)}</td>
              <td className={td}>{l.description}</td>
              <td className={td}>{l.categoryName}</td>
              <td className={td}>{[l.clientName, l.projectName].filter(Boolean).join(' / ')}</td>
              <td className={td}>{m(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between gap-8 font-semibold">
          <dt>Total</dt>
          <dd data-testid="total">{m(b.total)}</dd>
        </div>
        <div className="flex justify-between gap-8">
          <dt>Paid</dt>
          <dd data-testid="amount-paid">{m(b.amountPaid)}</dd>
        </div>
        <div className="flex justify-between gap-8 border-t pt-1 font-semibold">
          <dt>Balance due</dt>
          <dd data-testid="balance-due">{m(b.balanceDue)}</dd>
        </div>
      </dl>

      {b.contractorCosts.length > 0 && (
        <section aria-labelledby="trueup-h" className="mt-8 max-w-2xl">
          <h2 id="trueup-h" className="text-lg font-semibold">
            Contractor cost true-up
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Approved hours already count as labour at cost. The difference between each contractor line and those hours
            {counted ? ' is' : ' will be'} counted as a contractor cost adjustment on the bill date.
          </p>
          <ul className="mt-2 flex flex-col gap-3 text-sm">
            {b.contractorCosts.map((c) => (
              <li key={c.lineId} className="rounded-lg border p-3" data-testid="trueup-line">
                <p className="font-medium">
                  {costTitle(c)}
                  {c.mode === 'trueup' && b.periodStart && b.periodEnd ? ` · ${formatDateRange(b.periodStart, b.periodEnd)}` : ''}
                </p>
                {b.status === 'void' ? (
                  <p className="mt-1">Void bill: not counted.</p>
                ) : c.mode === 'legacy' ? (
                  <p className="mt-1">
                    {b.status === 'pending_approval' || b.status === 'rejected'
                      ? 'Edit the bill and choose who this line is for before it can be approved.'
                      : 'Approved before contractor true-up: not in the P&L.'}
                  </p>
                ) : c.mode === 'full' ? (
                  <p className="mt-1">
                    Not on timesheets: {counted ? 'counted' : 'will be counted'} in full, {m(c.amount)}, against{' '}
                    {where(c.parts[0] ?? { clientName: null, projectName: null })}.
                  </p>
                ) : (
                  <>
                    <p className="mt-1">
                      {Number(c.hours) === 0
                        ? 'No approved hours in this period'
                        : `Approved hours: ${c.hours} h at cost = ${m(c.expected)}`}{' '}
                      · This line: {m(c.amount)}
                    </p>
                    <p className="mt-1">
                      Contractor cost adjustment: <span data-testid="trueup-adjustment">{signed(c.adjustment)}</span>
                      {c.parts.length === 1 ? ` against ${where(c.parts[0])}` : ''}
                      {b.status === 'void' ? '' : `, ${counted ? 'counted' : 'to be counted'} on ${formatDate(b.billDate)}`}.
                    </p>
                    {c.parts.length > 1 && (
                      <ul className="mt-1 list-disc pl-5">
                        {c.parts.map((p, i) => (
                          <li key={i}>
                            {where(p)}: {p.hours} h, {m(p.expected)}; adjustment {signed(p.adjustment)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <BillFiles firmId={firmId} billId={b.id} files={b.files} editable={b.status !== 'void'} />

      <section aria-labelledby="payments-h" className="mt-10">
        <h2 id="payments-h" className="text-lg font-semibold">
          Payments
        </h2>
        <VendorPayments firmId={firmId} billId={b.id} currency={currency} payments={b.payments} />
        {payable && (
          <Link
            href={`${base}/${b.id}/record`}
            className={`${button} mt-6 bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            Record payment
          </Link>
        )}
        {(b.status === 'pending_approval' || b.status === 'rejected') && (
          <p className="mt-3 text-sm text-muted-foreground">Approve the bill first to record payments.</p>
        )}
      </section>
    </div>
  )
}

function lineType(l: BillLineRow): string {
  if (l.kind === 'expense') return 'Expense'
  if (l.countMode === 'trueup') return `Contractor: ${l.consultantName ?? ''}`
  if (l.countMode === 'full') return 'Contractor: not on timesheets'
  return 'Contractor (who not chosen)'
}

function costTitle(c: ContractorCost): string {
  const who = c.mode === 'trueup' ? (c.consultantName ?? 'Consultant') : c.mode === 'full' ? 'Not on timesheets' : 'Who not chosen'
  return `${c.description} — ${who}`
}
