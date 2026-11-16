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

/** Saves a new bill through save_vendor_bill as the firm's manager; returns its id. */
export async function saveBill(
  f: Firm,
  vendorId: string,
  number: string,
  lines: LineInput[],
  over: { billDate?: string; dueDate?: string; periodStart?: string | null; periodEnd?: string | null } = {},
): Promise<string> {
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
    p_lines: lines,
  })
  if (error || !data) throw new Error(`save_vendor_bill failed: ${error?.message}`)
  return data as string
}
