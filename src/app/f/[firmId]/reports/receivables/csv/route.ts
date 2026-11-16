import { requireFirmRole } from '@/lib/auth/context'
import { todayIso } from '@/lib/domain/dates'
import { parseAgeingParams } from '@/modules/reports/ageing-params'
import { getOpenInvoices, getReceivables } from '@/modules/reports/receivables'
import { buildOpenInvoicesCsv, buildReceivablesSummaryCsv } from '@/modules/reports/receivables-csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}

function csv({ filename, body }: { filename: string; body: string }): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ firmId: string }> }) {
  const { firmId } = await params
  const { db } = await requireFirmRole(firmId, ['admin', 'manager'])

  const url = new URL(req.url)
  const search: Record<string, string[]> = {}
  for (const [k, v] of url.searchParams) (search[k] ??= []).push(v)
  const view = url.searchParams.get('view') ?? 'summary'
  if (view !== 'summary' && view !== 'invoices') return text('Unknown download.', 400)

  const p = parseAgeingParams(search, 'clients', 'client')
  const today = todayIso()
  if (view === 'summary') {
    const r = await getReceivables(db, firmId, today, p)
    if (!r.ok) return text(r.error, 500)
    return csv(buildReceivablesSummaryCsv(r.data.rows, r.data.totals, today))
  }
  const r = await getOpenInvoices(db, firmId, today, p)
  if (!r.ok) return text(r.error, 500)
  return csv(buildOpenInvoicesCsv(r.data, today))
}
