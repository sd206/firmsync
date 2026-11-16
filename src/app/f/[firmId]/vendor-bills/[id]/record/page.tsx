import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireFirmRole } from '@/lib/auth/context'
import { formatMoney } from '@/lib/domain/money'
import { getFirm } from '@/modules/firms/data'
import { BILL_STATUS_LABEL, getBill, listBillWithdrawals } from '@/modules/vendor-bills/data'
import { RecordBillPaymentPanel } from './record-panel'

export default async function RecordBillPaymentPage({ params }: { params: Promise<{ firmId: string; id: string }> }) {
  const { firmId, id } = await params
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const [res, firm] = await Promise.all([getBill(db, firmId, id), getFirm(db, firmId)])
  if (!res.ok) notFound()
  const b = res.data
  const currency = firm.ok ? firm.data.currency : 'USD'
  const back = `/f/${firmId}/vendor-bills/${id}`
  const payable = b.status === 'approved' || b.status === 'partly_paid'
  const withdrawals = payable ? await listBillWithdrawals(db, firmId, id) : null

  return (
    <div className="max-w-4xl">
      <Link href={back} className="text-sm underline underline-offset-4">
        Back to bill
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Record payment</h1>
      <p className="mt-1 text-sm">
        Bill {b.billNumber} · {b.vendorName} · Balance due{' '}
        <span className="font-semibold">{formatMoney(b.balanceDue, currency)}</span>
      </p>
      {!payable ? (
        <p className="mt-4 text-sm">
          This bill can&apos;t take payments: it is {BILL_STATUS_LABEL[b.status].toLowerCase()}.
          {b.status === 'pending_approval' || b.status === 'rejected' ? ' Approve the bill first.' : ''}
        </p>
      ) : (
        <>
          {withdrawals && !withdrawals.ok && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {withdrawals.error}
            </p>
          )}
          <RecordBillPaymentPanel
            firmId={firmId}
            billId={b.id}
            billLabel={`bill ${b.billNumber}`}
            currency={currency}
            balanceDue={b.balanceDue}
            withdrawals={withdrawals && withdrawals.ok ? withdrawals.data : null}
          />
        </>
      )}
    </div>
  )
}
