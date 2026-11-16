import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireFirmRole } from '@/lib/auth/context'
import { formatMoney } from '@/lib/domain/money'
import { rejectedFilesNotice } from '@/lib/domain/rejected-files'
import { getExpense } from '@/modules/expenses/data'
import { DeleteExpenseButton, ExpenseForm, ReceiptsSection } from '../expense-form'
import { loadFormOptions } from '../form-data'

export default async function ExpensePage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string; id: string }>
  searchParams: Promise<{ added?: string | string[]; filesRejected?: string | string[] }>
}) {
  const { firmId, id } = await params
  const sp = await searchParams
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const [res, opts] = await Promise.all([getExpense(db, firmId, id), loadFormOptions(db, firmId)])
  if (!res.ok) notFound()
  const e = res.data
  // Expenses created by approving a vendor bill change only through the bill.
  const { data: billLink } = await db.from('expenses').select('vendor_bill_line_id').eq('firm_id', firmId).eq('id', id).single()
  const lineId = (billLink as { vendor_bill_line_id: string | null } | null)?.vendor_bill_line_id ?? null
  if (lineId) {
    const { data: l } = await db.from('vendor_bill_lines').select('bill_id').eq('firm_id', firmId).eq('id', lineId).maybeSingle()
    const billId = (l as { bill_id: string } | null)?.bill_id
    const { data: b } = billId
      ? await db.from('vendor_bills').select('bill_number').eq('firm_id', firmId).eq('id', billId).maybeSingle()
      : { data: null }
    const number = (b as { bill_number: string } | null)?.bill_number
    return (
      <div className="max-w-5xl">
        <Link href={`/f/${firmId}/expenses`} className="text-sm underline underline-offset-4">
          Expenses
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Expense</h1>
        <dl className="mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt>Date</dt>
          <dd>{e.spentOn}</dd>
          <dt>Payee</dt>
          <dd>{e.payee}</dd>
          <dt>Category</dt>
          <dd>{e.categoryName}</dd>
          <dt>Amount</dt>
          <dd>{formatMoney(e.amount, opts.currency)}</dd>
          {(e.clientName || e.projectName) && (
            <>
              <dt>Client / project</dt>
              <dd>{[e.clientName, e.projectName].filter(Boolean).join(' / ')}</dd>
            </>
          )}
        </dl>
        <p className="mt-4 max-w-xl text-sm">
          This expense came from{' '}
          {billId ? (
            <Link href={`/f/${firmId}/vendor-bills/${billId}`} className="underline underline-offset-4">
              vendor bill {number ?? ''}
            </Link>
          ) : (
            'a vendor bill'
          )}
          . To change it, void the bill and enter a corrected one.
        </p>
      </div>
    )
  }
  const added = sp.added === '1'
  const fileWarning = rejectedFilesNotice(sp.filesRejected)

  return (
    <div className="max-w-5xl">
      <Link href={`/f/${firmId}/expenses`} className="text-sm underline underline-offset-4">
        Expenses
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Expense</h1>
      {added && (
        <p role="status" className="mt-3 text-sm">
          Expense added.
        </p>
      )}
      {fileWarning && (
        <p role="status" className="mt-3 text-sm">
          {fileWarning}
        </p>
      )}
      {opts.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {opts.error}
        </p>
      )}
      <ExpenseForm
        firmId={firmId}
        categories={opts.categories}
        clients={opts.clients}
        projects={opts.projects}
        expense={{
          id: e.id,
          spentOn: e.spentOn,
          categoryId: e.categoryId,
          payee: e.payee,
          amount: e.amount,
          clientId: e.clientId,
          projectId: e.projectId,
          notes: e.notes,
        }}
      />
      <ReceiptsSection
        firmId={firmId}
        expenseId={e.id}
        receipts={e.attachments.map((a) => ({ id: a.id, fileName: a.fileName }))}
      />
      <DeleteExpenseButton firmId={firmId} expenseId={e.id} amount={e.amount} currency={opts.currency} />
    </div>
  )
}
