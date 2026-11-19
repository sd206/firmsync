'use client'

import { formatDate } from '@/lib/domain/format-date'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { askConfirm } from '@/components/confirm-dialog'
import { formatBytes } from '@/lib/domain/storage'
import { deleteStorageFilesAction } from '@/modules/storage/actions'

export type FileRow = {
  key: string
  attachmentId: string | null
  deletable: boolean
  name: string
  type: string
  size: number
  date: string
  label: string
  recordHref: string | null
  downloadHref: string | null
}

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'

export function FileTable({ firmId, rows, canDelete }: { firmId: string; rows: FileRow[]; canDelete: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [failures, setFailures] = useState<{ name: string; error: string }[]>([])
  const [pending, start] = useTransition()

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const chosen = rows.filter((r) => r.attachmentId && selected.has(r.attachmentId))
  const total = chosen.reduce((sum, r) => sum + r.size, 0)

  async function onDelete() {
    if (chosen.length === 0) return
    const ok = await askConfirm(
      `Delete ${chosen.length} ${chosen.length === 1 ? 'file' : 'files'} (${formatBytes(total)})? This can't be undone.`,
      { confirmLabel: 'Delete', destructive: true },
    )
    if (!ok) return
    start(async () => {
      const r = await deleteStorageFilesAction(firmId, chosen.map((c) => c.attachmentId!))
      if (!r.ok) {
        setMessage(r.error)
        setFailures([])
        return
      }
      setMessage(`Deleted ${r.data.deleted} ${r.data.deleted === 1 ? 'file' : 'files'}.`)
      setFailures(r.data.failed)
      setSelected(new Set())
      router.refresh()
    })
  }

  return (
    <div className="mt-4">
      {canDelete && (
        <div className="mb-2 flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={onDelete}
            disabled={chosen.length === 0 || pending}
            className="inline-flex h-8 items-center rounded-lg bg-destructive px-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Delete selected
          </button>
          {chosen.length > 0 && (
            <span>
              {chosen.length} selected ({formatBytes(total)})
            </span>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mb-2 text-sm">
          {message}
        </p>
      )}
      {failures.length > 0 && (
        <ul role="alert" className="mb-2 list-disc pl-5 text-sm text-destructive">
          {failures.map((f, i) => (
            <li key={i}>
              {f.name}: {f.error}
            </li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Stored files</caption>
          <thead>
            <tr className="border-b">
              {canDelete && (
                <th scope="col" className={th}>
                  <span className="sr-only">Select</span>
                </th>
              )}
              <th scope="col" className={th}>Name</th>
              <th scope="col" className={th}>Type</th>
              <th scope="col" className={`${th} text-right`}>Size</th>
              <th scope="col" className={th}>Date</th>
              <th scope="col" className={th}>Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b">
                {canDelete && (
                  <td className={td}>
                    {r.deletable && r.attachmentId ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        checked={selected.has(r.attachmentId)}
                        onChange={() => toggle(r.attachmentId!)}
                      />
                    ) : null}
                  </td>
                )}
                <td className={td}>
                  {r.downloadHref ? (
                    <a href={r.downloadHref} className="underline underline-offset-2">
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                </td>
                <td className={td}>{r.type}</td>
                <td className={`${td} text-right whitespace-nowrap`}>{formatBytes(r.size)}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDate(r.date)}</td>
                <td className={td}>
                  {r.recordHref ? (
                    <Link href={r.recordHref} className="underline underline-offset-2">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
