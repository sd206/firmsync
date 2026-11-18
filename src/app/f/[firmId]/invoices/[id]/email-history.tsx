import type { InvoiceEmailRow } from '@/modules/invoice-emails/data'
import { historyStatus } from '@/modules/invoice-emails/history'

const th = 'py-2 pr-4 font-medium'
const td = 'py-2 pr-4 align-top'

const WHEN = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

export const formatWhen = (iso: string): string => `${WHEN.format(new Date(iso)).replace('Sept', 'Sep')} UTC`

const STATUS_NOTE: Record<string, string> = {
  Failed: 'Not delivered.',
  Unknown: 'Check with the client before resending.',
}

export function EmailHistory({ rows, error, now }: { rows: InvoiceEmailRow[]; error: string | null; now: Date }) {
  return (
    <section aria-labelledby="emails-h" className="mt-8">
      <h2 id="emails-h" className="text-lg font-medium">
        Emails
      </h2>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">This invoice hasn&apos;t been emailed yet.</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              {['When', 'Sent by', 'To', 'Subject', 'Status'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = historyStatus(r, now)
              return (
                <tr key={r.id} className="border-b" data-testid="email-row">
                  <td className={td}>{formatWhen(r.sentAt ?? r.createdAt)}</td>
                  <td className={td}>{r.senderEmail ?? 'Former member'}</td>
                  <td className={td}>
                    {r.to.join(', ')}
                    {r.cc.length > 0 && <span className="block text-muted-foreground">CC {r.cc.join(', ')}</span>}
                  </td>
                  <td className={td}>{r.subject}</td>
                  <td className={td}>
                    <span data-testid="email-status">{status}</span>
                    {STATUS_NOTE[status] && <span className="block text-muted-foreground">{STATUS_NOTE[status]}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
