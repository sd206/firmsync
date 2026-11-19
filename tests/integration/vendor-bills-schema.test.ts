import { beforeAll, describe, expect, it } from 'vitest'
import { adminDb, newFirm } from './helpers'
import { categoryId } from './expense-fixtures'
import { mkVendor } from './vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

describe('vendor bills schema', () => {
  let f: Firm
  let other: Firm
  let vendor: string
  let software: string

  let client: string

  beforeAll(async () => {
    f = await newFirm('Bills Schema Firm')
    other = await newFirm('Bills Schema Other')
    vendor = await mkVendor(f, 'Acme Staffing')
    software = await categoryId(f.firmId, 'Software')
    const c = await adminDb().from('clients').insert({ firm_id: f.firmId, name: 'Schema Client' }).select('id').single()
    client = c.data!.id as string
  })

  const bill = (number: string, over: Record<string, unknown> = {}) => ({
    firm_id: f.firmId,
    vendor_id: vendor,
    bill_number: number,
    bill_date: '2026-11-01',
    due_date: '2026-11-30',
    ...over,
  })

  it('managers enter bills and lines; consultants and other firms see nothing', async () => {
    const b = await f.manager.db.from('vendor_bills').insert(bill('INV-1')).select('id, status').single()
    expect(b.error).toBeNull()
    expect(b.data!.status).toBe('pending_approval')
    const lines = await f.manager.db.from('vendor_bill_lines').insert([
      { firm_id: f.firmId, bill_id: b.data!.id, position: 1, kind: 'expense', description: 'Licences', amount: '300.00', category_id: software },
      { firm_id: f.firmId, bill_id: b.data!.id, position: 2, kind: 'contractor', description: 'October hours', amount: '900.00', client_id: client },
    ])
    expect(lines.error).toBeNull()
    for (const db of [f.consultant.db, other.manager.db]) {
      for (const t of ['vendor_bills', 'vendor_bill_lines', 'vendor_payments']) {
        const { data } = await db.from(t).select('id').eq('firm_id', f.firmId)
        expect(data ?? [], t).toHaveLength(0)
      }
    }
  })

  it('refuses a duplicate bill number for the same vendor, ignoring case and spaces', async () => {
    await f.manager.db.from('vendor_bills').insert(bill('ACME-77'))
    const dup = await f.manager.db.from('vendor_bills').insert(bill('  acme-77 '))
    expect(dup.error?.code).toBe('23505')
    const otherVendor = await mkVendor(f)
    expect((await f.manager.db.from('vendor_bills').insert(bill('ACME-77', { vendor_id: otherVendor }))).error).toBeNull()
  })

  it('checks line kinds and dates', async () => {
    const b = await f.manager.db.from('vendor_bills').insert(bill('INV-2')).select('id').single()
    const noCat = await f.manager.db.from('vendor_bill_lines').insert({ firm_id: f.firmId, bill_id: b.data!.id, position: 1, kind: 'expense', description: 'X', amount: '1.00' })
    expect(noCat.error).not.toBeNull()
    const contractorCat = await f.manager.db.from('vendor_bill_lines').insert({ firm_id: f.firmId, bill_id: b.data!.id, position: 1, kind: 'contractor', description: 'X', amount: '1.00', category_id: software })
    expect(contractorCat.error).not.toBeNull()
    const badDue = await f.manager.db.from('vendor_bills').insert(bill('INV-3', { due_date: '2026-10-01' }))
    expect(badDue.error).not.toBeNull()
  })

  it('cannot approve directly, and locks approved bills', async () => {
    const b = await f.manager.db.from('vendor_bills').insert(bill('INV-4')).select('id').single()
    const id = b.data!.id
    await f.manager.db.from('vendor_bill_lines').insert({ firm_id: f.firmId, bill_id: id, position: 1, kind: 'expense', description: 'X', amount: '5.00', category_id: software })
    const sneaky = await f.manager.db.from('vendor_bills').update({ status: 'approved' }).eq('id', id).select('id')
    expect(sneaky.error).not.toBeNull()
    // Approval normally happens through approve_vendor_bill; simulate the locked state.
    const svc = adminDb()
    expect((await svc.from('vendor_bills').update({ status: 'approved' }).eq('id', id)).error).toBeNull()
    const edit = await f.manager.db.from('vendor_bill_lines').update({ amount: '6.00' }).eq('bill_id', id).select('id')
    expect(edit.data ?? []).toHaveLength(0)
    const del = await f.admin.db.from('vendor_bills').delete().eq('id', id).select('id')
    expect(del.data ?? []).toHaveLength(0)
    const { data } = await svc.from('vendor_bill_lines').select('amount').eq('bill_id', id).single()
    expect(Number(data!.amount)).toBe(5)
  })

})
