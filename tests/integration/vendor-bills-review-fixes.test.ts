import { beforeAll, describe, expect, it } from 'vitest'
import { adminDb, newFirm } from './helpers'
import { categoryId } from './expense-fixtures'
import { makeAccount, oneLine } from './bank-fixtures'
import { mkVendor, saveBill } from './vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

describe('vendor bill review fixes', () => {
  let f: Firm
  let vendor: string
  let software: string

  beforeAll(async () => {
    f = await newFirm('Bills Fixes Firm')
    vendor = await mkVendor(f, 'Acme Staffing')
    software = await categoryId(f.firmId, 'Software')
  })

  const approvedExpenseBill = async (number: string, amount: string) => {
    const id = await saveBill(f, vendor, number, [{ kind: 'expense', description: 'Licences', amount, category_id: software }])
    const r = await f.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    if (r.error) throw new Error(r.error.message)
    const { data: line } = await adminDb().from('vendor_bill_lines').select('id').eq('bill_id', id).single()
    const { data: exp } = await adminDb().from('expenses').select('id').eq('vendor_bill_line_id', line!.id).single()
    return { id, lineId: line!.id as string, expenseId: exp!.id as string }
  }

  it('refuses moving a line to another bill, from approved or pending bills', async () => {
    const a = await approvedExpenseBill('FX-1', '300.00')
    const pending = await saveBill(f, vendor, 'FX-2', [{ kind: 'contractor', description: 'Hours', amount: '10.00' }])
    const move = await f.manager.db.from('vendor_bill_lines').update({ bill_id: pending, amount: 1 }).eq('id', a.lineId).select('id')
    expect(move.error?.message).toContain('BILL_LOCKED')
    const other = await saveBill(f, vendor, 'FX-3', [{ kind: 'contractor', description: 'Hours', amount: '5.00' }])
    const { data: pl } = await adminDb().from('vendor_bill_lines').select('id').eq('bill_id', other).single()
    const move2 = await f.manager.db.from('vendor_bill_lines').update({ bill_id: pending }).eq('id', pl!.id).select('id')
    expect(move2.error?.message).toContain('LINE_MOVE')
    const { data: b } = await adminDb().from('vendor_bills').select('total').eq('id', a.id).single()
    expect(b!.total).toBe(300)
  })

  it('protects expenses created by a bill; void still removes them', async () => {
    const a = await approvedExpenseBill('FX-4', '120.00')
    const upd = await f.manager.db.from('expenses').update({ amount: 1 }).eq('id', a.expenseId).select('id')
    expect(upd.error?.message).toContain('BILL_EXPENSE')
    const del = await f.manager.db.from('expenses').delete().eq('id', a.expenseId).select('id')
    expect(del.error?.message).toContain('BILL_EXPENSE')

    const { data: plain } = await adminDb()
      .from('expenses')
      .insert({ firm_id: f.firmId, spent_on: '2026-11-01', category_id: software, payee: 'Figma', amount: 45 })
      .select('id')
      .single()
    const tag = await f.manager.db.from('expenses').update({ vendor_bill_line_id: a.lineId }).eq('id', plain!.id).select('id')
    expect(tag.error?.message).toContain('BILL_EXPENSE')

    expect((await f.admin.db.rpc('void_vendor_bill', { p_bill: a.id })).error).toBeNull()
    const { count } = await adminDb().from('expenses').select('id', { count: 'exact', head: true }).eq('id', a.expenseId)
    expect(count).toBe(0)
  })

  it('never matches a bank line to an expense created by a bill', async () => {
    const g = await newFirm('Bills Fixes Bank Firm')
    const v = await mkVendor(g, 'Cloud Inc')
    const sw = await categoryId(g.firmId, 'Software')
    const id = await saveBill(g, v, 'CL-9', [{ kind: 'expense', description: 'Hosting', amount: '300.00', category_id: sw }], {
      billDate: '2026-11-03',
    })
    await g.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    const { data: line } = await adminDb().from('vendor_bill_lines').select('id').eq('bill_id', id).single()
    const { data: exp } = await adminDb().from('expenses').select('id').eq('vendor_bill_line_id', line!.id).single()
    const ac = await makeAccount(g)
    const l = await oneLine(g, ac, { posted_on: '2026-11-05', amount: '-300.00', description: 'CLOUD INC' })

    const c = await g.manager.db.rpc('bank_match_candidates', { p_line: l })
    expect((c.data as { expenses: unknown[] }).expenses).toEqual([])
    const link = await g.manager.db.rpc('link_bank_line', { p_line: l, p_payment: null, p_expense: exp!.id, p_vendor_payment: null })
    expect(link.error?.message).toContain('BILL_EXPENSE')
    const dup = await g.manager.db.rpc('mark_bank_lines_duplicate', { p_lines: [l] })
    expect(dup.data).toEqual([{ matched: 0, ignored: 1, skipped: 0 }])
  })
})
