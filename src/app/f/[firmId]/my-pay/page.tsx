import { requireFirmRole } from '@/lib/auth/context'
import { HoursAndPay } from '@/components/pay/hours-and-pay'
import { getFirm } from '@/modules/firms/data'
import { getMyConsultantId, getPayConsultant, getPayMonths, getPayWeeks } from '@/modules/pay/data'
import { parseYear } from '@/modules/pay/labels'

export default async function MyPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ firmId: string }>
  searchParams: Promise<{ year?: string | string[] }>
}) {
  const { firmId } = await params
  const sp = await searchParams
  const year = parseYear(typeof sp.year === 'string' ? sp.year : undefined, new Date().getUTCFullYear())
  const { db, firmName } = await requireFirmRole(firmId, ['admin', 'manager', 'consultant'])

  const mine = await getMyConsultantId(db, firmId)
  if (!mine.ok) throw new Error(mine.error)
  if (!mine.data) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-semibold">My hours and pay</h1>
        <p className="mt-4">Your login isn&apos;t linked to a consultant record yet. Ask an Admin to link it.</p>
      </div>
    )
  }
  const consultantId = mine.data

  const [consultant, weeks, months, firm] = await Promise.all([
    getPayConsultant(db, firmId, consultantId),
    getPayWeeks(db, firmId, consultantId, year),
    getPayMonths(db, firmId, consultantId, year),
    getFirm(db, firmId),
  ])
  if (!consultant.ok) throw new Error(consultant.error)
  if (!weeks.ok) throw new Error(weeks.error)
  if (!months.ok) throw new Error(months.error)

  const base = `/f/${firmId}`
  return (
    <HoursAndPay
      heading="My hours and pay"
      firmName={firmName}
      currency={firm.ok ? firm.data.currency : 'USD'}
      consultantType={consultant.data.type}
      year={year}
      yearHref={(y) => `${base}/my-pay?year=${y}`}
      weekHref={(w) => `${base}/timesheet?week=${w}`}
      weeks={weeks.data}
      months={months.data}
    />
  )
}
