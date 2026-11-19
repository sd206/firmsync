import { describe, expect, it } from 'vitest'
import { adminDb, newFirm } from './helpers'
import { saveBill } from './vendor-bill-fixtures'
import { approvedWeek, costs, reapprove, sumAdj, vendorContractor } from './trueup-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

const NOV = { periodStart: '2026-11-01', periodEnd: '2026-11-30', billDate: '2026-11-18', dueDate: '2026-12-18' }

const approve = (f: Firm, bill: string) => f.admin.db.rpc('approve_vendor_bill', { p_bill: bill })

async function approveOk(f: Firm, bill: string) {
  const r = await approve(f, bill)
  if (r.error) throw new Error(`approve failed: ${r.error.message}`)
}

describe('contractor true-up: costs per line', () => {
  it('the worked example: 10 h x $80 approved, bill $1,100 -> +$300, only once approved', async () => {
    const f = await newFirm('Trueup Example')
    const c = await vendorContractor(f)
    await approvedWeek(f, c, '2026-11-02', [
      { project: 'Website', workDate: '2026-11-02', hours: '8' },
      { project: 'Website', workDate: '2026-11-03', hours: '2' },
    ])
    const bill = await saveBill(f, c.vendorId, 'T-1', [
      { kind: 'contractor', description: 'November', amount: '1100.00', consultant_id: c.consultantId },
    ], NOV)
    expect(await costs(f)).toEqual([])

    // The bill page sees the pending bill.
    const preview = await f.manager.db.rpc('contractor_line_costs', { p_firm: f.firmId, p_from: null, p_to: null, p_bill: bill })
    expect(preview.error).toBeNull()
    expect(preview.data).toEqual([
      expect.objectContaining({ count_mode: 'trueup', hours: 10, expected: 800, amount: 1100, adjustment: 300, project_id: c.projects.Website, client_id: c.clientId }),
    ])

    await approveOk(f, bill)
    const rows = await costs(f)
    expect(rows).toEqual([
      expect.objectContaining({ bill_date: '2026-11-18', expected: 800, adjustment: 300, project_id: c.projects.Website, client_id: c.clientId }),
    ])
  })

  it('a lower bill gives a negative adjustment; voiding removes it', async () => {
    const f = await newFirm('Trueup Lower')
    const c = await vendorContractor(f)
    await approvedWeek(f, c, '2026-11-02', [{ project: 'Website', workDate: '2026-11-02', hours: '10' }])
    const bill = await saveBill(f, c.vendorId, 'T-2', [
      { kind: 'contractor', description: 'November', amount: '700.00', consultant_id: c.consultantId },
    ], NOV)
    await approveOk(f, bill)
    expect(sumAdj(await costs(f))).toBe(-100)
    expect((await f.admin.db.rpc('void_vendor_bill', { p_bill: bill })).error).toBeNull()
    expect(await costs(f)).toEqual([])
  })

  it('hours approved, reopened and re-approved after the bill keep the total at the bill', async () => {
    const f = await newFirm('Trueup Moves')
    const c = await vendorContractor(f)
    const wk1 = await approvedWeek(f, c, '2026-11-02', [{ project: 'Website', workDate: '2026-11-02', hours: '6' }])
    const bill = await saveBill(f, c.vendorId, 'T-3', [
      { kind: 'contractor', description: 'November', amount: '1100.00', consultant_id: c.consultantId },
    ], NOV)
    await approveOk(f, bill)
    expect(sumAdj(await costs(f))).toBe(620)

    await approvedWeek(f, c, '2026-11-09', [{ project: 'Website', workDate: '2026-11-10', hours: '4' }])
    expect(sumAdj(await costs(f))).toBe(300)

    expect((await f.manager.db.rpc('reopen_timesheet', { p_timesheet: wk1 })).error).toBeNull()
    expect(sumAdj(await costs(f))).toBe(1100 - 320)

    await adminDb().from('consultant_cost_rates').update({ hourly_cost: '85' }).eq('id', c.costRateId)
    await reapprove(f, wk1)
    // 6 h x 85 + 4 h x 80 (frozen at its own approval) = 830
    expect(sumAdj(await costs(f))).toBe(270)
  })

  it('splits an all-projects line over projects by expected cost, adding up exactly', async () => {
    const f = await newFirm('Trueup Split')
    const c = await vendorContractor(f, { costRate: '180', projects: ['Website', 'Audit'] })
    await approvedWeek(f, c, '2026-11-02', [
      { project: 'Website', workDate: '2026-11-02', hours: '10' },
      { project: 'Website', workDate: '2026-11-03', hours: '10' },
      { project: 'Website', workDate: '2026-11-04', hours: '10' },
      { project: 'Website', workDate: '2026-11-05', hours: '10' },
      { project: 'Website', workDate: '2026-11-06', hours: '10' },
      { project: 'Audit', workDate: '2026-11-07', hours: '10' },
      { project: 'Audit', workDate: '2026-11-08', hours: '10' },
    ])
    const bill = await saveBill(f, c.vendorId, 'T-4', [
      { kind: 'contractor', description: 'November', amount: '12900.00', consultant_id: c.consultantId },
    ], NOV)
    await approveOk(f, bill)
    const rows = await costs(f)
    const by = Object.fromEntries(rows.map((r) => [r.project_id, r]))
    expect(by[c.projects.Audit]).toMatchObject({ expected: 3600, adjustment: 85.7143, hours: 20 })
    expect(by[c.projects.Website]).toMatchObject({ expected: 9000, adjustment: 214.2857, hours: 50 })
    expect(sumAdj(rows)).toBe(300)
  })

  it('uneven thirds still add up exactly', async () => {
    const f = await newFirm('Trueup Thirds')
    const c = await vendorContractor(f, { costRate: '33.33', projects: ['A', 'B', 'C'] })
    await approvedWeek(f, c, '2026-11-02', [
      { project: 'A', workDate: '2026-11-02', hours: '1' },
      { project: 'B', workDate: '2026-11-03', hours: '1' },
      { project: 'C', workDate: '2026-11-04', hours: '1' },
    ])
    const bill = await saveBill(f, c.vendorId, 'T-5', [
      { kind: 'contractor', description: 'November', amount: '100.00', consultant_id: c.consultantId },
    ], NOV)
    await approveOk(f, bill)
    // 3 x 33.33 = 99.99; shares 0.0033, 0.0033 and the remainder 0.0034.
    const rows = await costs(f)
    expect(rows.map((r) => r.adjustment).sort()).toEqual([0.0033, 0.0033, 0.0034])
    expect(sumAdj(rows)).toBe(0.01)
  })

  it('a per-project line only takes that project\'s hours', async () => {
    const f = await newFirm('Trueup Per Project')
    const c = await vendorContractor(f, { projects: ['Website', 'Audit'] })
    await approvedWeek(f, c, '2026-11-02', [
      { project: 'Website', workDate: '2026-11-02', hours: '5' },
      { project: 'Audit', workDate: '2026-11-03', hours: '5' },
    ])
    const bill = await saveBill(f, c.vendorId, 'T-6', [
      { kind: 'contractor', description: 'Website', amount: '450.00', consultant_id: c.consultantId, project_id: c.projects.Website },
      { kind: 'contractor', description: 'Audit', amount: '400.00', consultant_id: c.consultantId, project_id: c.projects.Audit },
    ], NOV)
    await approveOk(f, bill)
    const rows = await costs(f)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.project_id === c.projects.Website)).toMatchObject({ expected: 400, adjustment: 50 })
    expect(rows.find((r) => r.project_id === c.projects.Audit)).toMatchObject({ expected: 400, adjustment: 0 })
  })

  it('a named consultant with no hours on the line\'s project counts in full there', async () => {
    const f = await newFirm('Trueup No Hours')
    const c = await vendorContractor(f)
    const bill = await saveBill(f, c.vendorId, 'T-7', [
      { kind: 'contractor', description: 'Kick-off', amount: '500.00', consultant_id: c.consultantId, project_id: c.projects.Website },
    ], NOV)
    await approveOk(f, bill)
    expect(await costs(f)).toEqual([expect.objectContaining({ expected: 0, adjustment: 500, project_id: c.projects.Website, client_id: c.clientId })])
  })
})

describe('contractor true-up: not on timesheets', () => {
  it('counts in full against its client or project, and needs one', async () => {
    const f = await newFirm('Trueup Full')
    const c = await vendorContractor(f)
    const bill = await saveBill(f, c.vendorId, 'F-1', [
      { kind: 'contractor', description: 'Design', amount: '2000.00', project_id: c.projects.Website },
      { kind: 'contractor', description: 'Advice', amount: '300.00', client_id: c.clientId },
    ])
    await approveOk(f, bill)
    const rows = await costs(f)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.project_id === c.projects.Website)).toMatchObject({ count_mode: 'full', adjustment: 2000, client_id: c.clientId })
    expect(rows.find((r) => r.project_id === null)).toMatchObject({ count_mode: 'full', adjustment: 300, client_id: c.clientId })

    const none = await f.manager.db.rpc('save_vendor_bill', {
      p_bill: null, p_firm: f.firmId, p_vendor: c.vendorId, p_number: 'F-2', p_bill_date: '2026-11-01', p_due_date: '2026-11-30',
      p_period_start: null, p_period_end: null, p_notes: null, p_lines: [{ kind: 'contractor', description: 'X', amount: '1.00' }],
    })
    expect(none.error?.message).toContain('BILL_CONTRACTOR_TARGET')
  })
})

describe('contractor true-up: rules', () => {
  it('a named consultant needs a period and must come from the vendor', async () => {
    const f = await newFirm('Trueup Rules')
    const c = await vendorContractor(f)
    const other = await vendorContractor(f)
    const base = {
      p_bill: null, p_firm: f.firmId, p_vendor: c.vendorId, p_bill_date: '2026-11-01', p_due_date: '2026-11-30', p_notes: null,
    }
    const noPeriod = await f.manager.db.rpc('save_vendor_bill', {
      ...base, p_number: 'R-1', p_period_start: null, p_period_end: null,
      p_lines: [{ kind: 'contractor', description: 'X', amount: '1.00', consultant_id: c.consultantId }],
    })
    expect(noPeriod.error?.message).toContain('BILL_PERIOD_REQUIRED')
    const wrongVendor = await f.manager.db.rpc('save_vendor_bill', {
      ...base, p_number: 'R-2', p_period_start: '2026-11-01', p_period_end: '2026-11-30',
      p_lines: [{ kind: 'contractor', description: 'X', amount: '1.00', consultant_id: other.consultantId }],
    })
    expect(wrongVendor.error?.message).toContain('BILL_CONSULTANT')
  })

  it('refuses overlapping lines across bills and within a bill; halves and separate projects are fine', async () => {
    const f = await newFirm('Trueup Overlap')
    const c = await vendorContractor(f, { projects: ['Website', 'Audit'] })
    const line = (extra: Record<string, unknown> = {}) => ({ kind: 'contractor' as const, description: 'Hours', amount: '100.00', consultant_id: c.consultantId, ...extra })

    const first = await saveBill(f, c.vendorId, 'O-1', [line()], NOV)
    await approveOk(f, first)
    const second = await saveBill(f, c.vendorId, 'O-2', [line()], { ...NOV, periodStart: '2026-11-15', periodEnd: '2026-12-15' })
    const r = await approve(f, second)
    expect(r.error?.message).toContain('BILL_CONTRACTOR_OVERLAP')
    expect(r.error?.details).toBe('O-1')

    const dec = await saveBill(f, c.vendorId, 'O-3', [line()], { ...NOV, periodStart: '2026-12-01', periodEnd: '2026-12-15' })
    await approveOk(f, dec)

    const projects = await saveBill(f, c.vendorId, 'O-4', [
      line({ project_id: c.projects.Website }),
      line({ project_id: c.projects.Audit }),
    ], { ...NOV, periodStart: '2026-10-01', periodEnd: '2026-10-31' })
    await approveOk(f, projects)

    const mixed = await f.manager.db.rpc('save_vendor_bill', {
      p_bill: null, p_firm: f.firmId, p_vendor: c.vendorId, p_number: 'O-5', p_bill_date: '2026-11-01', p_due_date: '2026-11-30',
      p_period_start: '2026-09-01', p_period_end: '2026-09-30', p_notes: null,
      p_lines: [line(), line({ project_id: c.projects.Website })],
    })
    expect(mixed.error?.message).toContain('BILL_CONTRACTOR_OVERLAP')
  })

  it('two admins approving overlapping bills at once: exactly one succeeds', async () => {
    const f = await newFirm('Trueup Race')
    const c = await vendorContractor(f)
    const l = [{ kind: 'contractor' as const, description: 'Hours', amount: '100.00', consultant_id: c.consultantId }]
    const a = await saveBill(f, c.vendorId, 'X-1', l, NOV)
    const b = await saveBill(f, c.vendorId, 'X-2', l, NOV)
    const results = await Promise.all([approve(f, a), approve(f, b)])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(results.find((r) => r.error)?.error?.message).toContain('BILL_CONTRACTOR_OVERLAP')
  })

  it('legacy lines never count and block approval until edited', async () => {
    const f = await newFirm('Trueup Legacy')
    const c = await vendorContractor(f)
    const approved = await saveBill(f, c.vendorId, 'L-1', [{ kind: 'contractor', description: 'Old', amount: '900.00', client_id: c.clientId }])
    await approveOk(f, approved)
    const pending = await saveBill(f, c.vendorId, 'L-2', [{ kind: 'contractor', description: 'Old', amount: '50.00', client_id: c.clientId }])
    // As the migration left them: no consultant, no client, mode legacy (service role = internal).
    const upd = await adminDb()
      .from('vendor_bill_lines')
      .update({ count_mode: 'legacy', client_id: null })
      .in('bill_id', [approved, pending])
    expect(upd.error).toBeNull()

    expect(await costs(f)).toEqual([])
    expect((await approve(f, pending)).error?.message).toContain('BILL_CONTRACTOR_LEGACY')
  })

  it('a manager writing lines directly cannot choose the mode', async () => {
    const f = await newFirm('Trueup Direct')
    const c = await vendorContractor(f)
    const bill = await saveBill(f, c.vendorId, 'D-1', [{ kind: 'contractor', description: 'X', amount: '1.00', client_id: c.clientId }], NOV)
    const ins = await f.manager.db
      .from('vendor_bill_lines')
      .insert({ firm_id: f.firmId, bill_id: bill, position: 2, kind: 'contractor', description: 'Y', amount: '5.00', consultant_id: c.consultantId, count_mode: 'legacy' })
      .select('count_mode')
      .single()
    expect(ins.error).toBeNull()
    expect(ins.data!.count_mode).toBe('trueup')
    const bad = await f.manager.db
      .from('vendor_bill_lines')
      .insert({ firm_id: f.firmId, bill_id: bill, position: 3, kind: 'contractor', description: 'Z', amount: '5.00' })
    expect(bad.error?.message).toContain('vendor_bill_lines_contractor_chk')
  })

  it('refuses the costs to a consultant', async () => {
    const f = await newFirm('Trueup Access')
    const r = await f.consultant.db.rpc('contractor_line_costs', { p_firm: f.firmId, p_from: '2026-01-01', p_to: '2026-12-31', p_bill: null })
    expect(r.error?.code).toBe('42501')
  })
})
