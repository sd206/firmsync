import Link from 'next/link'
import { requireFirmRole } from '@/lib/auth/context'
import { formatDateTime } from '@/lib/domain/format-date'
import { INBOX_TABS, getInboxSettings, listInbox, type InboxRow, type InboxTab } from '@/modules/bill-inbox/data'
import { inboundDomains } from '@/modules/bill-inbox/route-mail'
import { InboxActions } from './inbox-actions'

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'
const button = 'inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium'

const when = formatDateTime

function Sender({ row }: { row: InboxRow }) {
  return (
    <div className="flex flex-col">
      <span>{row.fromAddress}</span>
      {row.senderKind === 'vendor' && row.vendorName ? (
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{row.vendorName} ✓</span>
      ) : row.senderKind === 'member' ? (
        <span className="text-xs text-muted-foreground">Forwarded by {row.forwardedBy}</span>
      ) : row.senderKind === 'unknown' ? (
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Unknown sender</span>
      ) : (
        <span className="text-xs text-muted-foreground">Known sender</span>
      )}
    </div>
  )
}

export default async function BillInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const { firmId } = await params
  const sp = await searchParams
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])
  const tab = (INBOX_TABS.some((t) => t.value === sp.tab) ? sp.tab : 'new') as InboxTab
  const domains = inboundDomains(process.env.INBOUND_DOMAINS)
  const configured = !!process.env.RESEND_API_KEY && !!process.env.RESEND_INBOUND_SECRET && domains.length > 0
  const [list, settings] = await Promise.all([listInbox(db, firmId, tab), getInboxSettings(db, firmId, { configured, domains })])
  const base = `/f/${firmId}/bill-inbox`
  const addr = settings.ok && settings.data.enabled ? settings.data.address : null

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bill inbox</h1>
        <p className="text-sm">
          {addr ? (
            <>
              Your address: <code className="rounded border bg-card px-1.5 py-0.5">{addr}</code>
            </>
          ) : (
            <Link href={`/f/${firmId}/settings`} className="underline underline-offset-4">
              Set up the bill address in Settings
            </Link>
          )}
        </p>
      </div>

      <nav aria-label="Inbox status" className="mt-4 flex flex-wrap gap-2 text-sm">
        {INBOX_TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === 'new' ? base : `${base}?tab=${t.value}`}
            aria-current={t.value === tab ? 'page' : undefined}
            className={`${button} border ${t.value === tab ? 'bg-muted font-semibold' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {!list.ok ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {list.error}
        </p>
      ) : list.data.length === 0 ? (
        <p className="mt-6 text-sm">{tab === 'new' ? 'No new emails.' : 'Nothing here.'}</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              {['Received', 'From', 'Subject', 'Files', 'Actions'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h === 'Actions' ? <span className="sr-only">{h}</span> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.data.map((r) => (
              <tr key={r.id} className="border-b">
                <td className={`${td} whitespace-nowrap`}>{when(r.receivedAt)}</td>
                <td className={td}>
                  <Sender row={r} />
                </td>
                <td className={td}>
                  {r.subject || <span className="text-muted-foreground">(no subject)</span>}
                  {r.possibleDuplicate && (
                    <span className="ml-2 rounded border border-amber-600 px-1 text-xs text-amber-700 dark:text-amber-400">
                      Possible duplicate
                    </span>
                  )}
                  {r.note && <p className="text-xs text-muted-foreground">Note: {r.note}</p>}
                </td>
                <td className={td}>
                  {r.files.length === 0 && !r.downloadFailed && <span className="text-muted-foreground">No files</span>}
                  <ul className="flex flex-col gap-1">
                    {r.files.map((f) => (
                      <li key={f.id}>
                        <a href={`/f/${firmId}/attachments/${f.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                          {f.fileName}
                        </a>
                        {f.billId && (
                          <>
                            {' · '}
                            <Link href={`/f/${firmId}/vendor-bills/${f.billId}`} className="text-primary underline-offset-4 hover:underline">
                              Bill {f.billNumber}
                            </Link>
                            <span className="text-muted-foreground"> created</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {r.rejectedFiles.map((x) => (
                    <p key={x.name} className="text-xs text-muted-foreground">
                      Not accepted: {x.name} ({x.reason})
                    </p>
                  ))}
                  {r.downloadFailed && <p className="text-xs text-destructive">Files couldn&apos;t be downloaded.</p>}
                </td>
                <td className={td}>
                  <InboxActions firmId={firmId} row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
