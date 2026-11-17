import Link from 'next/link'
import { formatBytes } from '@/lib/domain/storage'
import type { StorageStatus } from '@/modules/storage/data'

/** Shown on every firm page to admins and managers once storage reaches 95%. */
export function StorageBanner({ firmId, status }: { firmId: string; status: StorageStatus | null }) {
  if (!status || (status.level !== 'warning' && status.level !== 'full')) return null
  const used = formatBytes(status.used)
  const allowance = formatBytes(status.allowance)
  return (
    <section
      aria-label="Storage warning"
      className="border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-sm text-destructive"
    >
      {status.level === 'full'
        ? `Storage is full (${used} of ${allowance}). Uploads are paused.`
        : `Your firm has used ${used} of ${allowance} of storage. Uploads stop at 100%.`}{' '}
      <Link href={`/f/${firmId}/settings/storage`} className="font-medium underline underline-offset-4">
        Free up space
      </Link>
    </section>
  )
}
