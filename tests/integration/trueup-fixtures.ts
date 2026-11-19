import { adminDb, type newFirm } from './helpers'
import { mkVendor } from './vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

async function insertOne<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminDb().from(table).insert(row).select().single()
  if (error || !data) throw new Error(`${table} insert failed: ${error?.message}`)
  return data as T
}

export type Contractor = {
  vendorId: string
  consultantId: string
  clientId: string
  /** Project ids by name. */
  projects: Record<string, string>
  costRateId: string
}

/**
 * A vendor, one vendor contractor (no login) with a cost rate, a client and projects the
 * contractor is assigned to. Hours are added with `approvedWeek`.
 */
export async function vendorContractor(
  f: Firm,
  opts: { vendorName?: string; consultantName?: string; costRate?: string; projects?: string[]; clientName?: string } = {},
): Promise<Contractor> {
  const vendorId = await mkVendor(f, opts.vendorName ?? `Talent ${crypto.randomUUID().slice(0, 6)}`)
  const client = await insertOne<{ id: string }>('clients', {
    firm_id: f.firmId,
    name: opts.clientName ?? `Client ${crypto.randomUUID().slice(0, 8)}`,
  })
  const consultant = await insertOne<{ id: string }>('consultants', {
    firm_id: f.firmId,
    name: opts.consultantName ?? 'Dana Brooks',
    email: `c-${crypto.randomUUID()}@test.local`,
    type: 'vendor',
    vendor_id: vendorId,
  })
  const rate = await insertOne<{ id: string }>('consultant_cost_rates', {
    firm_id: f.firmId,
    consultant_id: consultant.id,
    hourly_cost: opts.costRate ?? '80',
    effective_from: '2026-01-01',
  })
  const projects: Record<string, string> = {}
  for (const name of opts.projects ?? ['Website']) {
    const p = await insertOne<{ id: string }>('projects', { firm_id: f.firmId, client_id: client.id, name })
    projects[name] = p.id
    await insertOne('project_assignments', {
      firm_id: f.firmId,
      project_id: p.id,
      consultant_id: consultant.id,
      client_rate: '150',
      effective_from: '2026-01-01',
    })
  }
  return { vendorId, consultantId: consultant.id, clientId: client.id, projects, costRateId: rate.id }
}

/** Saves and submits one week for the contractor (as the manager); approves it unless approve is false. */
export async function approvedWeek(
  f: Firm,
  c: Contractor,
  weekStart: string,
  entries: { project: string; workDate: string; hours: string }[],
  approve = true,
): Promise<string> {
  const { data: ts, error } = await f.manager.db.rpc('save_timesheet_week', {
    p_firm: f.firmId,
    p_consultant: c.consultantId,
    p_week_start: weekStart,
    p_entries: entries.map((e) => ({ projectId: c.projects[e.project], workDate: e.workDate, hours: e.hours, note: null })),
  })
  if (error || !ts) throw new Error(`save_timesheet_week failed: ${error?.message}`)
  const sub = await f.manager.db.rpc('submit_timesheet', { p_timesheet: ts })
  if (sub.error) throw new Error(`submit_timesheet failed: ${sub.error.message}`)
  if (approve) {
    const ap = await f.manager.db.rpc('approve_timesheet', { p_timesheet: ts })
    if (ap.error) throw new Error(`approve_timesheet failed: ${ap.error.message}`)
  }
  return ts as string
}

/** Submits and approves a reopened (draft) timesheet again. */
export async function reapprove(f: Firm, timesheetId: string): Promise<void> {
  const sub = await f.manager.db.rpc('submit_timesheet', { p_timesheet: timesheetId })
  if (sub.error) throw new Error(`submit_timesheet failed: ${sub.error.message}`)
  const ap = await f.manager.db.rpc('approve_timesheet', { p_timesheet: timesheetId })
  if (ap.error) throw new Error(`approve_timesheet failed: ${ap.error.message}`)
}

export type CostRow = {
  line_id: string
  bill_id: string
  bill_date: string
  count_mode: string
  consultant_id: string | null
  client_id: string | null
  project_id: string | null
  hours: number
  expected: number
  amount: number
  adjustment: number
}

/** contractor_line_costs for the P&L view (approved bills dated in the range). */
export async function costs(f: Firm, from = '2026-01-01', to = '2026-12-31'): Promise<CostRow[]> {
  const { data, error } = await f.manager.db.rpc('contractor_line_costs', { p_firm: f.firmId, p_from: from, p_to: to, p_bill: null })
  if (error) throw new Error(`contractor_line_costs failed: ${error.message}`)
  return (data ?? []) as CostRow[]
}

export const sumAdj = (rows: CostRow[]) => Math.round(rows.reduce((s, r) => s + Number(r.adjustment) * 10000, 0)) / 10000
