'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRun } from '@/components/use-run'
import { retryDownloadAction, setInboxStatusAction } from '@/modules/bill-inbox/actions'
import type { InboxRow } from '@/modules/bill-inbox/data'

type Pending = { status: 'ignored' | 'duplicate'; label: string } | null

/** The buttons for one inbox row. */
export function InboxActions({ firmId, row }: { firmId: string; row: InboxRow }) {
  const { pending, run, error } = useRun()
  const [ask, setAsk] = useState<Pending>(null)
  const [note, setNote] = useState('')
  const open = row.status === 'new'
  const unbilled = row.files.filter((f) => !f.billId)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {open &&
          unbilled.map((f) => (
            <Link
              key={f.id}
              href={`/f/${firmId}/vendor-bills/new?inboxFile=${f.id}`}
              className="inline-flex h-7 items-center rounded-lg bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Create bill{unbilled.length > 1 ? <span>: {f.fileName}</span> : <span className="sr-only"> from {f.fileName}</span>}
            </Link>
          ))}
        {open && (
          <>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setAsk({ status: 'ignored', label: 'Ignore' })}>
              Ignore
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setAsk({ status: 'duplicate', label: 'Mark duplicate' })}
            >
              Mark duplicate
            </Button>
            {/* By hand: emails with no files, or several files of which only some were bills. */}
            {(row.files.length === 0 || row.files.length > 1) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => setInboxStatusAction(firmId, row.id, 'bill_created', null))}
              >
                Mark bills created
              </Button>
            )}
            {row.downloadFailed && (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryDownloadAction(firmId, row.id))}>
                Try again
              </Button>
            )}
          </>
        )}
        {(row.status === 'ignored' || row.status === 'duplicate') && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setInboxStatusAction(firmId, row.id, 'new', null))}>
            Restore
          </Button>
        )}
      </div>
      {ask && (
        <form
          role="dialog"
          aria-label={ask.label}
          className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(
              () => setInboxStatusAction(firmId, row.id, ask.status, note),
              () => {
                setAsk(null)
                setNote('')
              },
            )
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor={`note-${row.id}`}>Note (optional)</Label>
            <Input
              id={`note-${row.id}`}
              value={note}
              maxLength={500}
              placeholder={ask.status === 'duplicate' ? 'Same as INV-4471' : 'Spam'}
              onChange={(e) => setNote(e.target.value)}
              className="w-56"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {ask.label}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAsk(null)}>
            Cancel
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
