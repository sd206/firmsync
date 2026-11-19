'use client'

import { formatDate } from '@/lib/domain/format-date'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { askConfirm } from '@/components/confirm-dialog'
import { FILE_ACCEPT, takeFiles } from '@/components/attachments/upload-files'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRun } from '@/components/use-run'
import { MAX_FILES_PER_UPLOAD, TOO_MANY_FILES } from '@/lib/domain/attachments'
import { todayIso } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { STORAGE_FULL } from '@/lib/domain/storage'
import { recordVendorPaymentAction, recordVendorPaymentFromWithdrawalAction } from '@/modules/vendor-bills/actions'
import type { BillWithdrawal } from '@/modules/vendor-bills/data'
import { METHOD_LABEL, uploadVendorFiles } from '../bill-actions'

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'
const select = 'h-8 rounded-lg border bg-card px-2 text-sm'

export function RecordBillPaymentPanel({
  firmId,
  billId,
  billLabel,
  currency,
  balanceDue,
  withdrawals,
}: {
  firmId: string
  billId: string
  billLabel: string
  currency: string
  balanceDue: string
  withdrawals: BillWithdrawal[] | null
}) {
  const router = useRouter()
  const back = `/f/${firmId}/vendor-bills/${billId}`
  const bank = useRun()
  const manual = useRun()
  const [notes, setNotes] = useState('')
  const warningRef = useRef<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const m = (v: string) => formatMoney(v.replace(/^-/, ''), currency)
  const done = () => {
    if (!warningRef.current) router.push(back)
  }

  return (
    <>
      {withdrawals && (
        <section aria-labelledby="withdrawals-h" className="mt-6 rounded-xl border bg-card p-4">
          <h2 id="withdrawals-h" className="text-base font-semibold">
            Payments out of your bank
          </h2>
          {withdrawals.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No imported money-out lines from the last 90 days fit this bill.{' '}
              <Link href={`/f/${firmId}/bank`} className="text-primary underline-offset-4 hover:underline">
                Bank accounts
              </Link>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Imported lines waiting for review, up to the balance due. Recording one uses its amount, date and bank
                reference, and marks the bank line as done.
              </p>
              <div className="mt-3 grid max-w-md gap-1.5 text-sm">
                <label htmlFor="withdrawal-notes">Notes for the payment (optional)</label>
                <Input id="withdrawal-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th scope="col" className={th}>Date</th>
                      <th scope="col" className={th}>Account</th>
                      <th scope="col" className={th}>Description</th>
                      <th scope="col" className={`${th} text-right`}>Amount</th>
                      <th scope="col" className={th}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w) => (
                      <tr key={w.lineId} className="border-b">
                        <td className={`${td} whitespace-nowrap`}>{formatDate(w.postedOn)}</td>
                        <td className={td}>{w.accountName}</td>
                        <th scope="row" className={`${td} font-normal`}>
                          {w.description}
                          {w.exactMatch && (
                            <span className="ml-2 rounded border border-primary px-1 text-xs text-primary">Exact balance</span>
                          )}
                        </th>
                        <td className={`${td} whitespace-nowrap text-right`}>{m(w.amount)}</td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          <Button
                            type="button"
                            size="sm"
                            disabled={bank.pending}
                            onClick={async () => {
                              const ok = await askConfirm(
                                `Record ${m(w.amount)} from ${w.accountName} on ${formatDate(w.postedOn)} as a payment on ${billLabel}?`,
                                { confirmLabel: 'Record payment' },
                              )
                              if (ok) bank.run(() => recordVendorPaymentFromWithdrawalAction(firmId, billId, w.lineId, notes), done)
                            }}
                          >
                            Record this payment<span className="sr-only"> of {m(w.amount)} on {formatDate(w.postedOn)}</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {bank.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {bank.error}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="manual-h" className="mt-6 rounded-xl border bg-card p-4">
        <h2 id="manual-h" className="text-base font-semibold">
          Record manually
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">For checks, cash or anything not in an imported statement.</p>
        <form
          aria-label="Record payment"
          className="mt-4 flex flex-wrap items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            warningRef.current = null
            setWarning(null)
            manual.run(async () => {
              const files = takeFiles(fd)
              if (files.length > MAX_FILES_PER_UPLOAD) return { ok: false, error: TOO_MANY_FILES, fieldErrors: { files: TOO_MANY_FILES } }
              const r = await recordVendorPaymentAction(firmId, billId, fd)
              if (!r.ok) return r
              const { failed, storageFull } = await uploadVendorFiles(firmId, billId, 'vendor_payment', r.data.id, files)
              if (storageFull || failed.length > 0) {
                const w = storageFull
                  ? `Payment recorded, but the files weren't attached. ${STORAGE_FULL}`
                  : `Payment recorded, but some files weren't attached: ${failed.join(', ')}.`
                warningRef.current = w
                setWarning(w)
              }
              return r
            }, done)
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="vp-amount">Amount</Label>
            <Input
              id="vp-amount"
              name="amount"
              inputMode="decimal"
              defaultValue={balanceDue}
              aria-invalid={!!manual.errors.amount}
              className="max-w-32"
            />
            {manual.errors.amount && <p className="text-xs text-destructive">{manual.errors.amount}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vp-paid-on">Payment date</Label>
            <Input id="vp-paid-on" name="paidOn" type="date" defaultValue={todayIso()} aria-invalid={!!manual.errors.paidOn} className="max-w-40" />
            {manual.errors.paidOn && <p className="text-xs text-destructive">{manual.errors.paidOn}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vp-method">Method</Label>
            <select id="vp-method" name="method" defaultValue="bank_transfer" className={select}>
              {Object.entries(METHOD_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vp-reference">Reference</Label>
            <Input id="vp-reference" name="reference" maxLength={120} aria-invalid={!!manual.errors.reference} className="max-w-48" />
            {manual.errors.reference && <p className="text-xs text-destructive">{manual.errors.reference}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vp-notes">Notes</Label>
            <Input id="vp-notes" name="notes" maxLength={1000} aria-invalid={!!manual.errors.notes} className="max-w-64" />
            {manual.errors.notes && <p className="text-xs text-destructive">{manual.errors.notes}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="vp-files">Remittance files</Label>
            <input id="vp-files" name="files" type="file" multiple accept={FILE_ACCEPT} className="text-sm" />
            {manual.errors.files && <p className="text-xs text-destructive">{manual.errors.files}</p>}
          </div>
          <Button type="submit" disabled={manual.pending} className="self-end">
            Record payment
          </Button>
          {manual.error && (
            <p role="alert" className="w-full text-sm text-destructive">
              {manual.error}
            </p>
          )}
        </form>
      </section>
      {warning && (
        <p role="status" className="mt-3 text-sm">
          {warning}{' '}
          <Link href={back} className="underline underline-offset-4">
            Continue
          </Link>
        </p>
      )}
    </>
  )
}
