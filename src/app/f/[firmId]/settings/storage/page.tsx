import Link from 'next/link'
import { requireFirmRole } from '@/lib/auth/context'
import { formatBytes, usagePercent } from '@/lib/domain/storage'
import {
  getStorageBreakdown,
  getStorageStatus,
  listStorageFiles,
  PAGE_SIZE,
  STORAGE_KINDS,
  type StorageFile,
  type StorageKind,
} from '@/modules/storage/data'
import { FileTable, type FileRow } from './file-table'

export const dynamic = 'force-dynamic'

type Sp = Record<string, string | string[] | undefined>

const KIND_LABEL: Record<StorageKind, string> = {
  payment: 'Payment files',
  expense: 'Expense receipts',
  vendor_bill: 'Vendor bill files',
  vendor_payment: 'Vendor payment files',
  bill_inbox: 'Bill inbox',
  invoice_pdf: 'Invoice PDFs',
  logo: 'Logo',
  other: 'Other',
}

const th = 'py-2 pr-4 font-medium'
const num = 'py-2 pr-4 text-right whitespace-nowrap'
const button = 'inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium'

/** The page that shows the file's record, if any. */
function recordHref(firmId: string, f: StorageFile): string | null {
  const base = `/f/${firmId}`
  if (f.kind === 'logo') return `${base}/settings`
  if (f.kind === 'bill_inbox') return `${base}/bill-inbox`
  if (!f.recordId) return null
  if (f.kind === 'payment' || f.kind === 'invoice_pdf') return `${base}/invoices/${f.recordId}`
  if (f.kind === 'expense') return `${base}/expenses/${f.recordId}`
  if (f.kind === 'vendor_bill' || f.kind === 'vendor_payment') return `${base}/vendor-bills/${f.recordId}`
  return null
}

function downloadHref(firmId: string, f: StorageFile): string | null {
  if (f.attachmentId) return `/f/${firmId}/attachments/${f.attachmentId}`
  if (f.kind === 'invoice_pdf' && f.recordId) return `/f/${firmId}/invoices/${f.recordId}/pdf`
  return null
}

const DELETABLE: StorageKind[] = ['payment', 'expense', 'vendor_bill', 'vendor_payment']

export default async function StoragePage({ params, searchParams }: { params: Promise<{ firmId: string }>; searchParams: Promise<Sp> }) {
  const { firmId } = await params
  const sp = await searchParams
  const { db, role } = await requireFirmRole(firmId, ['admin', 'manager'])
  const kind = typeof sp.kind === 'string' && (STORAGE_KINDS as string[]).includes(sp.kind) ? (sp.kind as StorageKind) : null
  const sort = sp.sort === 'oldest' ? 'oldest' : 'largest'
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1)

  const [status, breakdown, list] = await Promise.all([
    getStorageStatus(db, firmId),
    getStorageBreakdown(db, firmId),
    listStorageFiles(db, firmId, { kind, sort, page }),
  ])
  const error = !status.ok ? status.error : !breakdown.ok ? breakdown.error : !list.ok ? list.error : null

  const base = `/f/${firmId}/settings/storage`
  const href = (next: { kind?: StorageKind | null; sort?: string; page?: number }) => {
    const q = new URLSearchParams()
    const k = next.kind === undefined ? kind : next.kind
    const s = next.sort ?? sort
    if (k) q.set('kind', k)
    if (s !== 'largest') q.set('sort', s)
    if ((next.page ?? 1) > 1) q.set('page', String(next.page))
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
  }

  if (error || !status.ok || !breakdown.ok || !list.ok) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-2xl font-semibold">Storage</h1>
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      </div>
    )
  }

  const { used, allowance, level } = status.data
  const pct = usagePercent(used, allowance)
  const pages = Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))
  const isAdmin = role === 'admin'
  const rows: FileRow[] = list.data.rows.map((f) => ({
    key: f.path,
    attachmentId: f.attachmentId,
    deletable: isAdmin && f.attachmentId !== null && DELETABLE.includes(f.kind),
    name: f.fileName,
    type: KIND_LABEL[f.kind],
    size: f.sizeBytes,
    date: f.createdAt ? f.createdAt.slice(0, 10) : '',
    label: f.label,
    recordHref: recordHref(firmId, f),
    downloadHref: downloadHref(firmId, f),
  }))

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">Storage</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything your firm has stored: receipts, payment and bill files, emailed bills, invoice PDFs and your logo.
      </p>

      <section aria-label="Storage used" className="mt-6 max-w-xl">
        <p className="text-sm font-medium">
          {formatBytes(used)} of {formatBytes(allowance)} used ({pct}%)
        </p>
        <div
          className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(pct, 100)}
        >
          <div
            className={`h-full ${level === 'full' || level === 'warning' ? 'bg-destructive' : level === 'notice' ? 'bg-amber-500' : 'bg-primary'}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        {level === 'full' ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Storage is full. New uploads are paused until files are deleted or more storage is added.
          </p>
        ) : level === 'warning' ? (
          <p className="mt-2 text-sm text-destructive">Storage is almost full. Uploads stop at 100%.</p>
        ) : level === 'notice' ? (
          <p className="mt-2 text-sm">You&apos;ve used over 80% of your storage.</p>
        ) : null}
      </section>

      <h2 className="mt-8 text-lg font-medium">What&apos;s using space</h2>
      {breakdown.data.length === 0 ? (
        <p className="mt-2 text-sm">Nothing is stored yet.</p>
      ) : (
        <table className="mt-2 w-full max-w-xl text-left text-sm">
          <caption className="sr-only">Storage by type</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={th}>Type</th>
              <th scope="col" className={`${th} text-right`}>Files</th>
              <th scope="col" className={`${th} text-right`}>Size</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.data.map((b) => (
              <tr key={b.kind} className="border-b">
                <th scope="row" className="py-2 pr-4 font-normal">
                  <Link href={href({ kind: b.kind, page: 1 })} className="underline underline-offset-2">
                    {KIND_LABEL[b.kind]}
                  </Link>
                </th>
                <td className={num}>{b.files}</td>
                <td className={num}>{formatBytes(b.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mt-8 text-lg font-medium">Files</h2>
      <form method="get" aria-label="Filter files" className="mt-2 flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="storage-kind">Type</label>
          <select id="storage-kind" name="kind" defaultValue={kind ?? ''} className="h-8 rounded-lg border bg-card px-2 text-sm">
            <option value="">All types</option>
            {STORAGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="storage-sort">Sort</label>
          <select id="storage-sort" name="sort" defaultValue={sort} className="h-8 rounded-lg border bg-card px-2 text-sm">
            <option value="largest">Largest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <button type="submit" className={button}>
          Apply
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm">No files.</p>
      ) : (
        <FileTable firmId={firmId} rows={rows} canDelete={isAdmin} />
      )}

      {pages > 1 && (
        <nav aria-label="File pages" className="mt-4 flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={href({ page: page - 1 })} className="underline underline-offset-4">
              Previous
            </Link>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={href({ page: page + 1 })} className="underline underline-offset-4">
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
