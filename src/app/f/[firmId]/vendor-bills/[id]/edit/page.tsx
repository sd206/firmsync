import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireFirmRole } from '@/lib/auth/context'
import { getBill } from '@/modules/vendor-bills/data'
import { BillForm } from '../../bill-form'
import { loadBillFormOptions } from '../../form-options'

export default async function EditBillPage({ params }: { params: Promise<{ firmId: string; id: string }> }) {
  const { firmId, id } = await params
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const res = await getBill(db, firmId, id)
  if (!res.ok) notFound()
  const b = res.data
  const page = `/f/${firmId}/vendor-bills/${id}`
  // Approved, paid and void bills are locked: their expenses are already in reports.
  if (b.status !== 'pending_approval' && b.status !== 'rejected') redirect(page)
  const opts = await loadBillFormOptions(
    db,
    firmId,
    b.lines.flatMap((l) => (l.categoryId ? [l.categoryId] : [])),
  )

  return (
    <div className="max-w-5xl">
      <Link href={page} className="text-sm underline underline-offset-4">
        Bill {b.billNumber}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Edit bill {b.billNumber}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Saving sends the bill back for approval.</p>
      {opts.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {opts.error}
        </p>
      )}
      <BillForm
        firmId={firmId}
        vendors={opts.vendors}
        categories={opts.categories}
        clients={opts.clients}
        projects={opts.projects}
        bill={{
          id: b.id,
          vendorId: b.vendorId,
          billNumber: b.billNumber,
          billDate: b.billDate,
          dueDate: b.dueDate,
          periodStart: b.periodStart,
          periodEnd: b.periodEnd,
          notes: b.notes,
          lines: b.lines.map((l) => ({
            key: l.id,
            kind: l.kind,
            description: l.description,
            amount: l.amount,
            categoryId: l.categoryId ?? '',
            clientId: l.clientId ?? '',
            projectId: l.projectId ?? '',
          })),
        }}
      />
    </div>
  )
}
