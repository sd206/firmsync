'use client'

import { formatDate } from '@/lib/domain/format-date'
import { useState } from 'react'
import { askConfirm } from '@/components/confirm-dialog'
import { FileList } from '@/components/attachments/file-list'
import { FILE_ACCEPT, takeFiles, uploadFiles } from '@/components/attachments/upload-files'
import { STORAGE_FULL } from '@/lib/domain/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRun } from '@/components/use-run'
import { MAX_FILES_PER_UPLOAD, TOO_MANY_FILES } from '@/lib/domain/attachments'
import { formatMoney } from '@/lib/domain/money'
import type { FormResult } from '@/lib/form'
import {
  approveBillAction,
  createVendorUploadTargetsAction,
  deleteVendorAttachmentAction,
  deleteVendorPaymentAction,
  finalizeVendorUploadsAction,
  rejectBillAction,
  voidBillAction,
} from '@/modules/vendor-bills/actions'
import type { FileRow, VendorPaymentRow } from '@/modules/vendor-bills/data'

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'

export const METHOD_LABEL: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  check: 'Check',
  card: 'Card',
  cash: 'Cash',
  other: 'Other',
}

type OwnerKind = 'vendor_bill' | 'vendor_payment'

export function uploadVendorFiles(firmId: string, billId: string, kind: OwnerKind, ownerId: string, files: File[]) {
  return uploadFiles(files, {
    createTargets: (declared) => createVendorUploadTargetsAction(firmId, kind, ownerId, declared),
    finalize: (items) => finalizeVendorUploadsAction(firmId, billId, kind, ownerId, items),
  })
}

/** Admin: approve, or reject with a reason (pending bills); void (approved bills without payments). */
export function ApprovalBox({
  firmId,
  billId,
  status,
  hasPayments,
}: {
  firmId: string
  billId: string
  status: string
  hasPayments: boolean
}) {
  const { pending, run, errors, error } = useRun()
  const [rejecting, setRejecting] = useState(false)

  if (status === 'pending_approval') {
    return (
      <section aria-labelledby="approval-h" className="mt-6 max-w-xl rounded-xl border bg-card p-4">
        <h2 id="approval-h" className="text-base font-semibold">
          Approval
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approving adds the expense lines to Expenses and lets the bill be paid.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" disabled={pending} onClick={() => run(() => approveBillAction(firmId, billId))}>
            Approve
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setRejecting((v) => !v)}>
            Reject
          </Button>
        </div>
        {rejecting && (
          <form
            aria-label="Reject bill"
            className="mt-3 flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              run(() => rejectBillAction(firmId, billId, fd), () => setRejecting(false))
            }}
          >
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="reject-reason">Reason</Label>
              <Input id="reject-reason" name="reason" maxLength={500} aria-invalid={!!errors.reason} />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
            </div>
            <Button type="submit" variant="destructive" disabled={pending}>
              Reject bill
            </Button>
          </form>
        )}
        {error && !errors.reason && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    )
  }

  if (status === 'approved' && !hasPayments) {
    return (
      <div className="mt-6">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={async () => {
            const ok = await askConfirm('Void this bill? Its expenses are removed and it can no longer be paid.', {
              confirmLabel: 'Void bill',
              destructive: true,
            })
            if (ok) run(() => voidBillAction(firmId, billId))
          }}
        >
          Void bill
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  }
  return null
}

/** The bill's PDF and other files; removable and addable until the bill is void. */
export function BillFiles({
  firmId,
  billId,
  files,
  editable,
}: {
  firmId: string
  billId: string
  files: FileRow[]
  editable: boolean
}) {
  const { pending, run, errors, error } = useRun()
  const [warning, setWarning] = useState<string | null>(null)
  const [resets, setResets] = useState(0)
  const downloadBase = `/f/${firmId}/attachments`
  return (
    <section aria-labelledby="files-h" className="mt-8 max-w-xl">
      <h2 id="files-h" className="text-lg font-semibold">
        Files
      </h2>
      {files.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No file attached.</p>
      ) : editable ? (
        <div className="mt-2">
          <FileList
            files={files}
            downloadBase={downloadBase}
            onRemove={(attachmentId) => deleteVendorAttachmentAction(firmId, billId, 'vendor_bill', billId, attachmentId)}
          />
        </div>
      ) : (
        <ul className="mt-2 text-sm">
          {files.map((f) => (
            <li key={f.id}>
              <a href={`${downloadBase}/${f.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                {f.fileName}
              </a>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form
          key={resets}
          aria-label="Add files"
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            setWarning(null)
            run(
              async (): Promise<FormResult> => {
                const picked = takeFiles(fd)
                if (picked.length === 0) return { ok: false, error: 'Choose a file to add.', fieldErrors: { files: 'Choose a file to add.' } }
                if (picked.length > MAX_FILES_PER_UPLOAD) return { ok: false, error: TOO_MANY_FILES, fieldErrors: { files: TOO_MANY_FILES } }
                const { failed, storageFull } = await uploadVendorFiles(firmId, billId, 'vendor_bill', billId, picked)
                if (storageFull) setWarning(STORAGE_FULL)
                else if (failed.length > 0) setWarning(`Some files weren't attached: ${failed.join(', ')}.`)
                return { ok: true, data: undefined }
              },
              () => setResets((n) => n + 1),
            )
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="bill-add-files">Add files</Label>
            <input id="bill-add-files" name="files" type="file" multiple accept={FILE_ACCEPT} className="text-sm" />
            {errors.files && <p className="text-xs text-destructive">{errors.files}</p>}
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            Upload
          </Button>
        </form>
      )}
      {error && !errors.files && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {warning && (
        <p role="status" className="mt-2 text-sm">
          {warning}
        </p>
      )}
    </section>
  )
}

function PaymentRowView({
  firmId,
  billId,
  currency,
  payment: p,
}: {
  firmId: string
  billId: string
  currency: string
  payment: VendorPaymentRow
}) {
  const { pending, run, error } = useRun()
  const m = formatMoney(p.amount, currency)
  return (
    <tr className="border-b">
      <td className={td}>{formatDate(p.paidOn)}</td>
      <td className={td}>{METHOD_LABEL[p.method] ?? p.method}</td>
      <td className={td}>{p.reference}</td>
      <td className={td}>{p.bankAccount ?? '—'}</td>
      <td className={td}>{m}</td>
      <td className={td}>
        <ul className="flex flex-col gap-1">
          {p.files.map((a) => (
            <li key={a.id}>
              <a href={`/f/${firmId}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                {a.fileName}
              </a>
            </li>
          ))}
        </ul>
      </td>
      <td className={td}>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={async () => {
            const msg = p.bankAccount
              ? `Delete this payment of ${m}? Its files are deleted too, and the bank line goes back to review.`
              : `Delete this payment of ${m}? Its files are deleted too.`
            if (await askConfirm(msg, { confirmLabel: 'Delete', destructive: true })) {
              run(() => deleteVendorPaymentAction(firmId, billId, p.id))
            }
          }}
        >
          Delete<span className="sr-only"> payment of {m}</span>
        </Button>
        {error && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {error}
          </p>
        )}
      </td>
    </tr>
  )
}

export function VendorPayments({
  firmId,
  billId,
  currency,
  payments,
}: {
  firmId: string
  billId: string
  currency: string
  payments: VendorPaymentRow[]
}) {
  if (payments.length === 0) return <p className="mt-3 text-sm text-muted-foreground">No payments recorded.</p>
  return (
    <table className="mt-3 w-full text-left text-sm">
      <thead>
        <tr className="border-b">
          {['Date', 'Method', 'Reference', 'Bank account', 'Amount', 'Files'].map((h) => (
            <th key={h} scope="col" className={th}>
              {h}
            </th>
          ))}
          <th scope="col" className={th}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <PaymentRowView key={p.id} firmId={firmId} billId={billId} currency={currency} payment={p} />
        ))}
      </tbody>
    </table>
  )
}
