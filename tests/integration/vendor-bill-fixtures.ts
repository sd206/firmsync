import { adminDb, type newFirm } from './helpers'

type Firm = Awaited<ReturnType<typeof newFirm>>

export async function mkVendor(f: Firm, name = `Vendor ${crypto.randomUUID().slice(0, 8)}`): Promise<string> {
  const { data, error } = await adminDb().from('vendors').insert({ firm_id: f.firmId, name }).select('id').single()
  if (error || !data) throw new Error(`vendor insert failed: ${error?.message}`)
  return data.id as string
}

export type LineInput = {
  kind: 'expense' | 'contractor'
  description: string
  amount: string
  category_id?: string | null
  client_id?: string | null
  project_id?: string | null
  consultant_id?: string | null
}

const fixtureClients = new Map<string, Promise<string>>()

/** One client per firm for contractor lines that don't care where their cost lands. */
function fixtureClient(firmId: string): Promise<string> {
  let p = fixtureClients.get(firmId)
  if (!p) {
    p = (async () => {
      const { data, error } = await adminDb()
        .from('clients')
        .insert({ firm_id: firmId, name: `Bill fixture client ${crypto.randomUUID().slice(0, 8)}` })
        .select('id')
        .single()
      if (error || !data) throw new Error(`client insert failed: ${error?.message}`)
      return data.id as string
    })()
    fixtureClients.set(firmId, p)
  }
  return p
}

/**
 * Saves a new bill through save_vendor_bill as the firm's manager; returns its id.
 * A contractor line with no consultant, client or project ("not on timesheets" needs one)
 * is given a fixture client for the firm.
 */
export async function saveBill(
  f: Firm,
  vendorId: string,
  number: string,
  lines: LineInput[],
  over: { billDate?: string; dueDate?: string; periodStart?: string | null; periodEnd?: string | null } = {},
): Promise<string> {
  const needsClient = lines.some((l) => l.kind === 'contractor' && !l.consultant_id && !l.client_id && !l.project_id)
  const clientId = needsClient ? await fixtureClient(f.firmId) : null
  const withTargets = lines.map((l) =>
    l.kind === 'contractor' && !l.consultant_id && !l.client_id && !l.project_id ? { ...l, client_id: clientId } : l,
  )
  const { data, error } = await f.manager.db.rpc('save_vendor_bill', {
    p_bill: null,
    p_firm: f.firmId,
    p_vendor: vendorId,
    p_number: number,
    p_bill_date: over.billDate ?? '2026-11-01',
    p_due_date: over.dueDate ?? '2026-11-30',
    p_period_start: over.periodStart ?? null,
    p_period_end: over.periodEnd ?? null,
    p_notes: null,
    p_lines: withTargets,
  })
  if (error || !data) throw new Error(`save_vendor_bill failed: ${error?.message}`)
  return data as string
}
