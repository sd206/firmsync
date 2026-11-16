'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { FILE_ACCEPT, takeFiles, uploadFiles } from '@/components/attachments/upload-files'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_FILES_PER_UPLOAD, TOO_MANY_FILES } from '@/lib/domain/attachments'
import { todayIso } from '@/lib/domain/dates'
import type { FieldErrors } from '@/lib/form'
import { rejectedFilesParam } from '@/lib/domain/rejected-files'
import { createVendorUploadTargetsAction, finalizeVendorUploadsAction, saveBillAction } from '@/modules/vendor-bills/actions'

export type Option = { id: string; name: string }
export type ProjectOption = { id: string; name: string; clientId: string; clientName: string }

export type LineValue = {
  key: string
  kind: 'expense' | 'contractor'
  description: string
  amount: string
  categoryId: string
  clientId: string
  projectId: string
}

export type BillValues = {
  id: string
  vendorId: string
  billNumber: string
  billDate: string
  dueDate: string
  periodStart: string | null
  periodEnd: string | null
  notes: string | null
  lines: LineValue[]
}

const SOMETHING_WENT_WRONG = 'Something went wrong. Please try again.'
const selectClass = 'h-8 rounded-lg border bg-card px-2 text-sm'
const MAX_LINES = 50

const newLine = (kind: LineValue['kind'] = 'expense'): LineValue => ({
  key: crypto.randomUUID(),
  kind,
  description: '',
  amount: '',
  categoryId: '',
  clientId: '',
  projectId: '',
})

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null
}

export function BillForm({
  firmId,
  vendors,
  categories,
  clients,
  projects,
  bill,
}: {
  firmId: string
  vendors: Option[]
  categories: Option[]
  clients: Option[]
  projects: ProjectOption[]
  /** Present when editing a pending or rejected bill. */
  bill?: BillValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<LineValue[]>(bill?.lines ?? [newLine()])
  // A retried create (lost response) must not enter the bill twice: the second save edits the first.
  const savedId = useRef<string | null>(bill?.id ?? null)

  const update = (key: string, patch: Partial<LineValue>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  function submit(fd: FormData) {
    startTransition(async () => {
      setErrors({})
      setError(null)
      try {
        const files = takeFiles(fd)
        if (files.length > MAX_FILES_PER_UPLOAD) {
          setErrors({ files: TOO_MANY_FILES })
          setError(TOO_MANY_FILES)
          return
        }
        fd.set(
          'lines',
          JSON.stringify(
            lines.map((l) =>
              l.kind === 'contractor'
                ? { kind: l.kind, description: l.description, amount: l.amount }
                : {
                    kind: l.kind,
                    description: l.description,
                    amount: l.amount,
                    categoryId: l.categoryId,
                    clientId: l.clientId,
                    projectId: l.projectId,
                  },
            ),
          ),
        )
        const r = await saveBillAction(firmId, savedId.current, fd)
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {})
          setError(r.error)
          return
        }
        savedId.current = r.data.id
        const failed = await uploadFiles(files, {
          createTargets: (declared) => createVendorUploadTargetsAction(firmId, 'vendor_bill', r.data.id, declared),
          finalize: (items) => finalizeVendorUploadsAction(firmId, r.data.id, 'vendor_bill', r.data.id, items),
        })
        const q = failed.length > 0 ? `?filesRejected=${encodeURIComponent(rejectedFilesParam(failed))}` : ''
        router.push(`/f/${firmId}/vendor-bills/${r.data.id}${q}`)
        router.refresh()
      } catch (e) {
        console.error('save bill failed', e)
        setError(SOMETHING_WENT_WRONG)
      }
    })
  }

  return (
    <form
      aria-label="Bill"
      className="mt-4 flex max-w-4xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit(new FormData(e.currentTarget))
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-vendor">Vendor</Label>
          <select
            id="bill-vendor"
            name="vendorId"
            defaultValue={bill?.vendorId ?? ''}
            aria-invalid={!!errors.vendorId}
            className={`${selectClass} max-w-72`}
          >
            <option value="">Choose a vendor</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.vendorId} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-number">Bill number</Label>
          <Input
            id="bill-number"
            name="billNumber"
            defaultValue={bill?.billNumber ?? ''}
            aria-invalid={!!errors.billNumber}
            aria-describedby="bill-number-note"
            className="max-w-56"
          />
          <p id="bill-number-note" className="text-xs text-muted-foreground">
            The invoice number printed on the vendor&apos;s bill.
          </p>
          <FieldError message={errors.billNumber} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-date">Bill date</Label>
          <Input
            id="bill-date"
            name="billDate"
            type="date"
            defaultValue={bill?.billDate ?? todayIso()}
            aria-invalid={!!errors.billDate}
            className="max-w-40"
          />
          <FieldError message={errors.billDate} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-due">Due date</Label>
          <Input
            id="bill-due"
            name="dueDate"
            type="date"
            defaultValue={bill?.dueDate ?? ''}
            aria-invalid={!!errors.dueDate}
            className="max-w-40"
          />
          <FieldError message={errors.dueDate} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-period-start">Service period from (optional)</Label>
          <Input
            id="bill-period-start"
            name="periodStart"
            type="date"
            defaultValue={bill?.periodStart ?? ''}
            aria-invalid={!!errors.periodStart}
            className="max-w-40"
          />
          <FieldError message={errors.periodStart} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="bill-period-end">Service period to (optional)</Label>
          <Input
            id="bill-period-end"
            name="periodEnd"
            type="date"
            defaultValue={bill?.periodEnd ?? ''}
            aria-invalid={!!errors.periodEnd}
            aria-describedby="bill-period-note"
            className="max-w-40"
          />
          <p id="bill-period-note" className="text-xs text-muted-foreground">
            With a period, contractor lines are checked against approved hours.
          </p>
          <FieldError message={errors.periodEnd} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-semibold">Lines</legend>
        <p className="text-sm text-muted-foreground">
          Expense lines become expenses when the bill is approved. Contractor lines pay for hours already in your
          timesheets, so they are not added as expenses again.
        </p>
        {lines.map((l, i) => {
          const n = i + 1
          const id = (f: string) => `line-${l.key}-${f}`
          const clientProjects = projects.filter((p) => !l.clientId || p.clientId === l.clientId)
          return (
            <div key={l.key} role="group" aria-label={`Line ${n}`} className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-6">
              <div className="flex flex-col gap-1">
                <Label htmlFor={id('kind')}>
                  <span className="sr-only">Line {n} </span>Type
                </Label>
                <select
                  id={id('kind')}
                  aria-label={`Line ${n} type`}
                  value={l.kind}
                  onChange={(e) => update(l.key, { kind: e.currentTarget.value as LineValue['kind'] })}
                  className={selectClass}
                >
                  <option value="expense">Expense</option>
                  <option value="contractor">Contractor</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-3">
                <Label htmlFor={id('desc')}>Description</Label>
                <Input
                  id={id('desc')}
                  aria-label={`Line ${n} description`}
                  value={l.description}
                  maxLength={200}
                  onChange={(e) => update(l.key, { description: e.currentTarget.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={id('amount')}>Amount</Label>
                <Input
                  id={id('amount')}
                  aria-label={`Line ${n} amount`}
                  inputMode="decimal"
                  value={l.amount}
                  onChange={(e) => update(l.key, { amount: e.currentTarget.value })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  Remove<span className="sr-only"> line {n}</span>
                </Button>
              </div>
              {l.kind === 'expense' && (
                <>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor={id('cat')}>Category</Label>
                    <select
                      id={id('cat')}
                      aria-label={`Line ${n} category`}
                      value={l.categoryId}
                      onChange={(e) => update(l.key, { categoryId: e.currentTarget.value })}
                      className={selectClass}
                    >
                      <option value="">Choose a category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor={id('client')}>Client (optional)</Label>
                    <select
                      id={id('client')}
                      aria-label={`Line ${n} client`}
                      value={l.clientId}
                      onChange={(e) => update(l.key, { clientId: e.currentTarget.value, projectId: '' })}
                      className={selectClass}
                    >
                      <option value="">No client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label htmlFor={id('project')}>Project (optional)</Label>
                    <select
                      id={id('project')}
                      aria-label={`Line ${n} project`}
                      value={l.projectId}
                      onChange={(e) => {
                        const p = projects.find((x) => x.id === e.currentTarget.value)
                        update(l.key, { projectId: e.currentTarget.value, clientId: p ? p.clientId : l.clientId })
                      }}
                      className={selectClass}
                    >
                      <option value="">No project</option>
                      {clientProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {l.clientId ? p.name : `${p.clientName}: ${p.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )
        })}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={lines.length >= MAX_LINES}
            onClick={() => setLines((ls) => [...ls, newLine()])}
          >
            Add line
          </Button>
        </div>
        <FieldError message={errors.lines} />
      </fieldset>

      <div className="flex flex-col gap-1">
        <Label htmlFor="bill-notes">Notes</Label>
        <textarea
          id="bill-notes"
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={bill?.notes ?? ''}
          aria-invalid={!!errors.notes}
          className="max-w-xl rounded-lg border bg-card px-2.5 py-1 text-sm"
        />
        <FieldError message={errors.notes} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="bill-files">{bill ? 'Add files' : 'Bill PDF'}</Label>
        <input id="bill-files" name="files" type="file" multiple accept={FILE_ACCEPT} className="text-sm" aria-invalid={!!errors.files} />
        <FieldError message={errors.files} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {bill ? 'Save and resubmit' : 'Save bill'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error === 'Check the highlighted fields.' && errors.lines ? `${error} ${errors.lines}` : error}
        </p>
      )}
    </form>
  )
}
