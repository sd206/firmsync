import { beforeAll, describe, expect, it } from 'vitest'
import { getPnl } from '@/modules/reports/pnl'
import { newFirm } from './helpers'
import { saveBill } from './vendor-bill-fixtures'
import { approvedWeek, vendorContractor, type Contractor } from './trueup-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>
type Row = Record<string, string | null>

const NOV = { periodStart: '2026-11-01', periodEnd: '2026-11-30', billDate: '2026-11-18', dueDate: '2026-12-18' }

async function report(f: Firm, group: string, from = '2026-10-01', to = '2026-11-30'): Promise<Row[]> {
  const { data, error } = await f.manager.db.rpc('pnl_report', {
    p_firm: f.firmId, p_from: from, p_to: to, p_group: group, p_clients: null, p_projects: null,
  })
  if (error) throw new Error(error.message)
  return data as Row[]
}

describe('P&L: contractor cost adjustment', () => {
  let f: Firm
  let c: Contractor

  // The worked example: 10 h x $80 cost ($150 client rate) approved; bill $1,100 approved.
  beforeAll(async () => {
    f = await newFirm('PnL Trueup')
    c = await vendorContractor(f, { clientName: 'Acme Corp' })
    await approvedWeek(f, c, '2026-11-02', [{ project: 'Website', workDate: '2026-11-02', hours: '10' }])
    const bill = await saveBill(f, c.vendorId, 'P-1', [
      { kind: 'contractor', description: 'November', amount: '1100.00', consultant_id: c.consultantId },
    ], NOV)
    const r = await f.admin.db.rpc('approve_vendor_bill', { p_bill: bill })
    if (r.error) throw new Error(r.error.message)
  })

  it('by month: labour 800 + adjustment 300 = the bill; gross and net include it', async () => {
    const rows = await report(f, 'month')
    const nov = rows.find((r) => r.group_key === '2026-11-01')!
    expect(nov).toMatchObject({ revenue: '1500.00', labour: '800.00', contractor_adj: '300.00', gross: '400.00', net: '400.00', margin: '26.7' })
    expect(rows.find((r) => r.group_key === '2026-10-01')).toMatchObject({ contractor_adj: '0.00' })
    expect(rows.find((r) => r.row_kind === 'total')).toMatchObject({ labour: '800.00', contractor_adj: '300.00', gross: '400.00' })
  })

  it('by client and by project: on the bill\'s project and its client', async () => {
    const byClient = await report(f, 'client')
    expect(byClient.find((r) => r.group_key === c.clientId)).toMatchObject({ contractor_adj: '300.00', gross: '400.00' })
    expect(byClient.find((r) => r.row_kind === 'overhead')).toMatchObject({ contractor_adj: '0.00' })
    const byProject = await report(f, 'project')
    expect(byProject.find((r) => r.group_key === c.projects.Website)).toMatchObject({ contractor_adj: '300.00' })
  })

  it('the breakdown carries the column', async () => {
    const { data, error } = await f.manager.db.rpc('pnl_breakdown', {
      p_firm: f.firmId, p_from: '2026-10-01', p_to: '2026-11-30', p_group: 'month', p_clients: null, p_projects: null, p_split_project: true,
    })
    expect(error).toBeNull()
    expect((data as Row[]).find((r) => r.project_id === c.projects.Website)).toMatchObject({ contractor_adj: '300.00', gross: '400.00' })
  })

  it('by quarter: in the bill date\'s quarter', async () => {
    const rows = await report(f, 'quarter', '2026-07-01', '2026-12-31')
    expect(rows.find((r) => r.sort_key === '2026-Q3')).toMatchObject({ contractor_adj: '0.00' })
    expect(rows.find((r) => r.sort_key === '2026-Q4')).toMatchObject({ labour: '800.00', contractor_adj: '300.00', gross: '400.00' })
  })

  it('client and project filters keep the adjustment on its client and project, and drop it elsewhere', async () => {
    const call = (clients: string[] | null, projects: string[] | null) =>
      f.manager.db.rpc('pnl_report', {
        p_firm: f.firmId, p_from: '2026-11-01', p_to: '2026-11-30', p_group: 'month', p_clients: clients, p_projects: projects,
      })
    const total = (rows: Row[]) => rows.find((r) => r.row_kind === 'total')
    const byClient = await call([c.clientId], null)
    expect(total(byClient.data as Row[])).toMatchObject({ contractor_adj: '300.00', gross: '400.00' })
    const byProject = await call(null, [c.projects.Website])
    expect(total(byProject.data as Row[])).toMatchObject({ contractor_adj: '300.00' })
    const other = await call(['00000000-0000-4000-8000-000000000000'], null)
    expect(total(other.data as Row[])).toMatchObject({ labour: '0.00', contractor_adj: '0.00' })
  })

  it('a bill dated outside the range is not counted', async () => {
    const rows = await report(f, 'month', '2026-10-01', '2026-10-31')
    expect(rows.find((r) => r.row_kind === 'total')).toMatchObject({ contractor_adj: '0.00' })
  })

  it('getPnl maps the column', async () => {
    const r = await getPnl(f.manager.db, f.firmId, {
      from: '2026-11-01', to: '2026-11-30', group: 'month', clientIds: null, projectIds: null, split: { client: false, project: false },
    })
    expect(r.ok && r.data.find((x) => x.kind === 'total')?.contractorAdj).toBe('300.00')
  })
})

describe('P&L: unallocated contractor adjustment', () => {
  it('a line with no project and no hours left goes to the Unallocated overhead row', async () => {
    const f = await newFirm('PnL Trueup Unallocated')
    const c = await vendorContractor(f)
    const ts = await approvedWeek(f, c, '2026-11-02', [{ project: 'Website', workDate: '2026-11-02', hours: '10' }])
    const bill = await saveBill(f, c.vendorId, 'U-1', [
      { kind: 'contractor', description: 'November', amount: '1100.00', consultant_id: c.consultantId },
    ], NOV)
    expect((await f.admin.db.rpc('approve_vendor_bill', { p_bill: bill })).error).toBeNull()
    expect((await f.manager.db.rpc('reopen_timesheet', { p_timesheet: ts })).error).toBeNull()

    const byClient = await report(f, 'client')
    expect(byClient.find((r) => r.row_kind === 'overhead')).toMatchObject({ contractor_adj: '1100.00', net: '-1100.00' })
    expect(byClient.filter((r) => r.row_kind === 'group')).toEqual([])
    expect(byClient.find((r) => r.row_kind === 'total')).toMatchObject({ contractor_adj: '1100.00' })
    const byMonth = await report(f, 'month')
    expect(byMonth.find((r) => r.group_key === '2026-11-01')).toMatchObject({ contractor_adj: '1100.00' })
  })
})
