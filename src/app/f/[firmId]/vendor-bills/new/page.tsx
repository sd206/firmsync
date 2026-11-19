import Link from 'next/link'
import { requireFirmRole } from '@/lib/auth/context'
import { inboxFileForBill } from '@/modules/bill-inbox/data'
import { BillForm } from '../bill-form'
import { loadBillFormOptions } from '../form-options'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string }>
  searchParams: Promise<{ inboxFile?: string | string[] }>
}) {
  const { firmId } = await params
  const sp = await searchParams
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const fileId = typeof sp.inboxFile === 'string' && UUID.test(sp.inboxFile) ? sp.inboxFile : null
  const [opts, file] = await Promise.all([
    loadBillFormOptions(db, firmId),
    fileId ? inboxFileForBill(db, firmId, fileId) : Promise.resolve(null),
  ])

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
      {file && !file.ok && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {file.error}
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
      <BillForm firmId={firmId} vendors={opts.vendors} categories={opts.categories} clients={opts.clients} projects={opts.projects} consultants={opts.consultants}
        inboxFile={file && file.ok ? { id: file.data.attachmentId, fileName: file.data.fileName, vendorId: file.data.vendorId } : undefined}
      />
    </div>
  )
}
