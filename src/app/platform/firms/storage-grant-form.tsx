'use client'

import { useActionState } from 'react'
import type { Result } from '@/lib/result'
import { setStorageGrantAction } from '@/modules/firms/actions'

/** One firm's free extra storage, set by the platform owner. */
export function StorageGrantForm({ firmId, extraGb }: { firmId: string; extraGb: number }) {
  const [state, action, pending] = useActionState<Result<void> | null, FormData>(
    async (_prev, formData) => setStorageGrantAction(firmId, formData),
    null,
  )
  const id = `extra-gb-${firmId}`
  return (
    <form action={action} aria-label="Extra storage" className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-xs">
        Extra GB
      </label>
      <input
        id={id}
        name="extraGb"
        inputMode="numeric"
        defaultValue={String(extraGb)}
        className="h-7 w-20 rounded-md border bg-card px-2 text-sm"
      />
      <button type="submit" disabled={pending} className="inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium">
        Save
      </button>
      {state && !state.ok && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  )
}
