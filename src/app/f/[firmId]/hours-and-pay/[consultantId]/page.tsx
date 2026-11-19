import { notFound } from 'next/navigation'
import { requireFirmRole } from '@/lib/auth/context'
import { HoursAndPay } from '@/components/pay/hours-and-pay'
import { getFirm } from '@/modules/firms/data'
import { getPayConsultant, getPayMonths, getPayWeeks } from '@/modules/pay/data'
import { parseYear } from '@/modules/pay/labels'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Read-only: what a consultant sees on "My hours and pay", for Admins and Managers. */
export default async function ConsultantHoursAndPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string; consultantId: string }>
  searchParams: Promise<{ year?: string | string[] }>
}) {
  const { firmId, consultantId } = await params
  const sp = await searchParams
  const year = parseYear(typeof sp.year === 'string' ? sp.year : undefined, new Date().getUTCFullYear())
  const { db, firmName } = await requireFirmRole(firmId, ['admin', 'manager'])
  if (!UUID_RE.test(consultantId)) notFound()

  const consultant = await getPayConsultant(db, firmId, consultantId)
  if (!consultant.ok) notFound()
  const [weeks, months, firm] = await Promise.all([
    getPayWeeks(db, firmId, consultantId, year),
    getPayMonths(db, firmId, consultantId, year),
    getFirm(db, firmId),
  ])
  if (!weeks.ok) throw new Error(weeks.error)
  if (!months.ok) throw new Error(months.error)

  const base = `/f/${firmId}`
  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground print:hidden">
        Read-only. This is what {consultant.data.name} sees on their &ldquo;My hours and pay&rdquo; page.
      </p>
      <HoursAndPay
        heading={`Hours and pay: ${consultant.data.name}`}
        firmName={firmName}
        currency={firm.ok ? firm.data.currency : 'USD'}
        consultantType={consultant.data.type}
        year={year}
        yearHref={(y) => `${base}/hours-and-pay/${consultantId}?year=${y}`}
        weekHref={(w) => `${base}/timesheet?week=${w}&consultant=${consultantId}`}
        weeks={weeks.data}
        months={months.data}
      />
    </>
  )
}
