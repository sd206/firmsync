import { describe, expect, it } from 'vitest'
import { adminDb, anonDb, newFirm, newUser, type TestUser } from './helpers'
import { seedTimesheetFixture } from './timesheet-fixtures'
import { mkVendor } from './vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>
type WeekRow = {
  week_start: string
  status: string
  decision_comment: string | null
  hours: string
  pay_rates: string[] | null
  gross: string | null
  employer_name: string | null
}
type MonthRow = { month: string; hours: string; gross: string | null; employer_name: string | null }

const YEAR_FROM = '2026-01-01'
const YEAR_TO = '2026-12-31'

const weeks = (u: TestUser, firmId: string, consultantId: string) =>
  u.db.rpc('consultant_pay_weeks', { p_firm: firmId, p_consultant: consultantId, p_from: YEAR_FROM, p_to: YEAR_TO })
const months = (u: TestUser, firmId: string, consultantId: string) =>
  u.db.rpc('consultant_pay_months', { p_firm: firmId, p_consultant: consultantId, p_from: YEAR_FROM, p_to: YEAR_TO })

async function saveWeek(
  f: Firm,
  consultantId: string,
  projectId: string,
  weekStart: string,
  days: { d: string; h: string }[],
): Promise<string> {
  const { data, error } = await f.manager.db.rpc('save_timesheet_week', {
    p_firm: f.firmId,
    p_consultant: consultantId,
    p_week_start: weekStart,
    p_entries: days.map((x) => ({ projectId, workDate: x.d, hours: x.h, note: null })),
  })
  expect(error).toBeNull()
  return data as string
}

async function approvedWeek(
  f: Firm,
  consultantId: string,
  projectId: string,
  weekStart: string,
  days: { d: string; h: string }[],
): Promise<string> {
  const id = await saveWeek(f, consultantId, projectId, weekStart, days)
  expect((await f.manager.db.rpc('submit_timesheet', { p_timesheet: id })).error).toBeNull()
  expect((await f.manager.db.rpc('approve_timesheet', { p_timesheet: id })).error).toBeNull()
  return id
}

async function approvedVendorOf(id: string): Promise<string | null> {
  const { data, error } = await adminDb().from('timesheets').select('approved_vendor_id').eq('id', id).single()
  expect(error).toBeNull()
  return (data as { approved_vendor_id: string | null }).approved_vendor_id
}

async function makeVendorConsultant(f: Firm, consultantId: string, vendorId: string) {
  const { error } = await adminDb()
    .from('consultants')
    .update({ type: 'vendor', vendor_id: vendorId })
    .eq('id', consultantId)
  expect(error).toBeNull()
}

describe('consultant pay: access', () => {
  it('a consultant reads their own weeks; not another consultant, another firm or anon', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f, { costRate: '80' })
    await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [{ d: '2026-10-05', h: '8' }])

    const own = await weeks(f.consultant, f.firmId, fx.consultantId)
    expect(own.error).toBeNull()
    expect((own.data as WeekRow[]).length).toBe(1)

    const { data: other } = await adminDb()
      .from('consultants')
      .insert({ firm_id: f.firmId, name: 'Other', email: `o-${crypto.randomUUID()}@test.local`, type: 'employee' })
      .select('id')
      .single()
    const otherId = (other as { id: string }).id
    expect((await weeks(f.consultant, f.firmId, otherId)).error?.code).toBe('42501')
    expect((await months(f.consultant, f.firmId, otherId)).error?.code).toBe('42501')

    const g = await newFirm()
    expect((await weeks(g.admin, g.firmId, fx.consultantId)).error?.code).toBe('42501')
    expect((await weeks(g.admin, f.firmId, fx.consultantId)).error?.code).toBe('42501')

    const anon = await anonDb().rpc('consultant_pay_weeks', {
      p_firm: f.firmId,
      p_consultant: fx.consultantId,
      p_from: YEAR_FROM,
      p_to: YEAR_TO,
    })
    expect(anon.error).not.toBeNull()

    const stranger = await newUser('stranger')
    expect((await weeks(stranger, f.firmId, fx.consultantId)).error?.code).toBe('42501')
  })

  it('admins and managers read any consultant in their firm', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f)
    await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [{ d: '2026-10-05', h: '8' }])
    for (const u of [f.admin, f.manager]) {
      const r = await weeks(u, f.firmId, fx.consultantId)
      expect(r.error).toBeNull()
      expect((r.data as WeekRow[]).length).toBe(1)
    }
  })

  it('my_consultant_id returns the caller’s linked consultant or null', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f)
    const mine = await f.consultant.db.rpc('my_consultant_id', { p_firm: f.firmId })
    expect(mine.error).toBeNull()
    expect(mine.data).toBe(fx.consultantId)
    const none = await f.admin.db.rpc('my_consultant_id', { p_firm: f.firmId })
    expect(none.error).toBeNull()
    expect(none.data).toBeNull()
  })

  it('consultants still cannot read rates, entries or vendors directly', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f)
    await mkVendor(f, `V ${crypto.randomUUID().slice(0, 6)}`)
    await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [{ d: '2026-10-05', h: '8' }])
    for (const t of ['consultant_cost_rates', 'time_entries', 'vendors']) {
      const { data, error } = await f.consultant.db.from(t).select('id').eq('firm_id', f.firmId)
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
  })
})

describe('consultant pay: amounts', () => {
  it('approved directly-paid weeks show frozen rates and gross; other statuses show hours only', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f, { costRate: '80', costFrom: '2026-01-01' })
    await adminDb().from('consultant_cost_rates').insert({
      firm_id: f.firmId,
      consultant_id: fx.consultantId,
      hourly_cost: '85',
      effective_from: '2026-10-07',
    })
    await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [
      { d: '2026-10-05', h: '8' },
      { d: '2026-10-07', h: '7.5' },
    ])
    const sub = await saveWeek(f, fx.consultantId, fx.projectId, '2026-10-12', [{ d: '2026-10-12', h: '6' }])
    await f.manager.db.rpc('submit_timesheet', { p_timesheet: sub })
    const rej = await saveWeek(f, fx.consultantId, fx.projectId, '2026-10-19', [{ d: '2026-10-19', h: '5' }])
    await f.manager.db.rpc('submit_timesheet', { p_timesheet: rej })
    await f.manager.db.rpc('reject_timesheet', { p_timesheet: rej, p_comment: 'Split Friday' })

    const r = await weeks(f.consultant, f.firmId, fx.consultantId)
    expect(r.error).toBeNull()
    const rows = r.data as WeekRow[]
    const byWeek = Object.fromEntries(rows.map((w) => [w.week_start, w]))

    const a = byWeek['2026-10-05']!
    expect(a.status).toBe('approved')
    expect(Number(a.hours)).toBe(15.5)
    expect(a.pay_rates!.map(Number)).toEqual([80, 85])
    expect(Number(a.gross)).toBe(1277.5) // 8*80 + 7.5*85
    expect(a.employer_name).toBeNull()

    const s = byWeek['2026-10-12']!
    expect(s.status).toBe('submitted')
    expect(Number(s.hours)).toBe(6)
    expect(s.pay_rates).toBeNull()
    expect(s.gross).toBeNull()

    const j = byWeek['2026-10-19']!
    expect(j.status).toBe('rejected')
    expect(j.decision_comment).toBe('Split Friday')
    expect(j.gross).toBeNull()

    // weeks come newest first
    expect(rows.map((w) => w.week_start)).toEqual(['2026-10-19', '2026-10-12', '2026-10-05'])
  })

  it('months count approved hours by work date, splitting a week across two months', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f, { costRate: '100' })
    await approvedWeek(f, fx.consultantId, fx.projectId, '2026-09-28', [
      { d: '2026-09-30', h: '8' },
      { d: '2026-10-01', h: '4' },
    ])
    const r = await months(f.consultant, f.firmId, fx.consultantId)
    expect(r.error).toBeNull()
    const rows = (r.data as MonthRow[]).map((m) => ({ month: m.month, hours: Number(m.hours), gross: Number(m.gross) }))
    expect(rows).toEqual([
      { month: '2026-09-01', hours: 8, gross: 800 },
      { month: '2026-10-01', hours: 4, gross: 400 },
    ])

    // same arithmetic as P&L labour
    const { data: facts } = await f.admin.db.rpc('pnl_facts', { p_firm: f.firmId, p_from: '2026-09-01', p_to: '2026-09-30' })
    const labour = (facts as { measure: string; amount: string }[])
      .filter((x) => x.measure === 'labour')
      .reduce((s, x) => s + Number(x.amount), 0)
    expect(labour).toBe(800)
  })

  it('vendor weeks never return rates or amounts, even to an admin', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f, { costRate: '70' })
    const vendorId = await mkVendor(f, 'Northwind Staffing')
    await makeVendorConsultant(f, fx.consultantId, vendorId)
    const id = await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [{ d: '2026-10-05', h: '8' }])
    expect(await approvedVendorOf(id)).toBe(vendorId)

    for (const u of [f.consultant, f.admin]) {
      const w = (await weeks(u, f.firmId, fx.consultantId)).data as WeekRow[]
      expect(w[0]!.pay_rates).toBeNull()
      expect(w[0]!.gross).toBeNull()
      expect(w[0]!.employer_name).toBe('Northwind Staffing')
      const m = (await months(u, f.firmId, fx.consultantId)).data as MonthRow[]
      expect(m).toHaveLength(1)
      expect(Number(m[0]!.hours)).toBe(8)
      expect(m[0]!.gross).toBeNull()
      expect(m[0]!.employer_name).toBe('Northwind Staffing')
    }
  })

  it('a contractor moving from a vendor to paid directly keeps old weeks as Billed by', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f, { costRate: '70' })
    const vendorId = await mkVendor(f, 'Agency One')
    await makeVendorConsultant(f, fx.consultantId, vendorId)
    await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [{ d: '2026-10-05', h: '8' }])

    await adminDb().from('consultants').update({ type: 'employee', vendor_id: null }).eq('id', fx.consultantId)
    await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-12', [{ d: '2026-10-12', h: '8' }])

    const w = Object.fromEntries(
      ((await weeks(f.consultant, f.firmId, fx.consultantId)).data as WeekRow[]).map((x) => [x.week_start, x]),
    )
    expect(w['2026-10-05']!.gross).toBeNull()
    expect(w['2026-10-05']!.employer_name).toBe('Agency One')
    expect(Number(w['2026-10-12']!.gross)).toBe(560)
    expect(w['2026-10-12']!.employer_name).toBeNull()

    const m = (await months(f.consultant, f.firmId, fx.consultantId)).data as MonthRow[]
    expect(m).toHaveLength(2)
    const direct = m.find((x) => x.employer_name === null)!
    const billed = m.find((x) => x.employer_name === 'Agency One')!
    expect(Number(direct.gross)).toBe(560)
    expect(billed.gross).toBeNull()
  })

  it('reopen clears the recorded vendor; the vendor cannot be deleted while a week records it', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f)
    const vendorId = await mkVendor(f, `V ${crypto.randomUUID().slice(0, 6)}`)
    await makeVendorConsultant(f, fx.consultantId, vendorId)
    const id = await approvedWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [{ d: '2026-10-05', h: '8' }])

    await adminDb().from('consultants').update({ type: 'employee', vendor_id: null }).eq('id', fx.consultantId)
    const del = await adminDb().from('vendors').delete().eq('id', vendorId)
    expect(del.error?.code).toBe('23503')

    expect((await f.manager.db.rpc('reopen_timesheet', { p_timesheet: id })).error).toBeNull()
    expect(await approvedVendorOf(id)).toBeNull()
  })

  it('only approved timesheets may record a vendor', async () => {
    const f = await newFirm()
    const fx = await seedTimesheetFixture(f)
    const vendorId = await mkVendor(f, `V ${crypto.randomUUID().slice(0, 6)}`)
    const id = await saveWeek(f, fx.consultantId, fx.projectId, '2026-10-05', [{ d: '2026-10-05', h: '8' }])
    const { error } = await adminDb().from('timesheets').update({ approved_vendor_id: vendorId }).eq('id', id)
    expect(error?.code).toBe('23514')
  })
})
