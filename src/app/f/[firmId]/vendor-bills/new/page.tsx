import Link from 'next/link'
import { requireFirmRole } from '@/lib/auth/context'
import { BillForm } from '../bill-form'
import { loadBillFormOptions } from '../form-options'

export default async function NewBillPage({ params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const opts = await loadBillFormOptions(db, firmId)

  return (
    <div className="max-w-5xl">
      <Link href={`/f/${firmId}/vendor-bills`} className="text-sm underline underline-offset-4">
        Vendor bills
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New bill</h1>
      {opts.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {opts.error}
        </p>
      )}
      {opts.vendors.length === 0 && (
        <p className="mt-4 text-sm">
          Add the vendor first in{' '}
          <Link href={`/f/${firmId}/vendors`} className="underline underline-offset-4">
            Vendors
          </Link>
          .
        </p>
      )}
      <BillForm firmId={firmId} vendors={opts.vendors} categories={opts.categories} clients={opts.clients} projects={opts.projects} />
    </div>
  )
}
