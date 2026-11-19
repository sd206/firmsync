import { beforeAll, describe, expect, it } from 'vitest'
import { adminDb, newFirm } from './helpers'
import { categoryId } from './expense-fixtures'
import { seedApprovedHours } from './invoice-fixtures'
import { mkVendor, saveBill } from './vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

async function bill(id: string) {
  const { data } = await adminDb().from('vendor_bills').select('status, total, amount_paid, rejected_reason').eq('id', id).single()
  return data as { status: string; total: number; amount_paid: number; rejected_reason: string | null }
}

describe('vendor bill functions', () => {
  let f: Firm
  let vendor: string
  let software: string
  const pay = (db: Firm['manager']['db'], billId: string, amount: string, paidOn = '2026-11-05') =>
    db.rpc('record_vendor_payment', { p_bill: billId, p_amount: amount, p_paid_on: paidOn, p_method: 'bank_transfer', p_reference: 'REF', p_notes: null })

  beforeAll(async () => {
    f = await newFirm('Bills Fn Firm')
    vendor = await mkVendor(f, 'Acme Staffing')
    software = await categoryId(f.firmId, 'Software')
  })

  it('saves a bill with lines and a total; approved bills are locked', async () => {
    const id = await saveBill(f, vendor, 'B-1', [
      { kind: 'expense', description: 'Licences', amount: '300.00', category_id: software },
      { kind: 'contractor', description: 'Hours', amount: '900.00' },
    ])
    expect(await bill(id)).toMatchObject({ status: 'pending_approval', total: 1200 })
    expect((await f.admin.db.rpc('approve_vendor_bill', { p_bill: id })).error).toBeNull()
    const again = await f.manager.db.rpc('save_vendor_bill', {
      p_bill: id, p_firm: f.firmId, p_vendor: vendor, p_number: 'B-1', p_bill_date: '2026-11-01', p_due_date: '2026-11-30',
      p_period_start: null, p_period_end: null, p_notes: null, p_lines: [{ kind: 'expense', description: 'X', amount: '1.00', category_id: software }],
    })
    expect(again.error?.message).toContain('BILL_LOCKED')
    const empty = await f.manager.db.rpc('save_vendor_bill', {
      p_bill: null, p_firm: f.firmId, p_vendor: vendor, p_number: 'B-EMPTY', p_bill_date: '2026-11-01', p_due_date: '2026-11-30',
      p_period_start: null, p_period_end: null, p_notes: null, p_lines: [],
    })
    expect(empty.error?.message).toContain('BILL_EMPTY')
  })

  it('only admins approve; approval turns expense lines into expenses', async () => {
    const id = await saveBill(f, vendor, 'B-2', [
      { kind: 'expense', description: 'Licences', amount: '300.00', category_id: software },
      { kind: 'contractor', description: 'Hours', amount: '900.00' },
    ])
    expect((await f.manager.db.rpc('approve_vendor_bill', { p_bill: id })).error?.code).toBe('42501')
    expect((await f.admin.db.rpc('approve_vendor_bill', { p_bill: id })).error).toBeNull()
    expect((await bill(id)).status).toBe('approved')
    const { data: lines } = await adminDb().from('vendor_bill_lines').select('id, kind').eq('bill_id', id)
    const { data: exps } = await adminDb()
      .from('expenses')
      .select('payee, amount, spent_on, category_id, notes, vendor_bill_line_id')
      .in('vendor_bill_line_id', (lines ?? []).map((l) => l.id))
    expect(exps).toHaveLength(1)
    expect(exps![0]).toMatchObject({ payee: 'Acme Staffing', amount: 300, spent_on: '2026-11-01', category_id: software })
    expect(exps![0].notes).toContain('Bill #B-2')
  })

  it('rejects with a reason; saving again resubmits', async () => {
    const id = await saveBill(f, vendor, 'B-3', [{ kind: 'contractor', description: 'Hours', amount: '50.00' }])
    expect((await f.manager.db.rpc('reject_vendor_bill', { p_bill: id, p_reason: 'Wrong rate' })).error?.code).toBe('42501')
    expect((await f.admin.db.rpc('reject_vendor_bill', { p_bill: id, p_reason: 'Wrong rate' })).error).toBeNull()
    expect(await bill(id)).toMatchObject({ status: 'rejected', rejected_reason: 'Wrong rate' })
    const resave = await f.manager.db.rpc('save_vendor_bill', {
      p_bill: id, p_firm: f.firmId, p_vendor: vendor, p_number: 'B-3', p_bill_date: '2026-11-01', p_due_date: '2026-11-30',
      p_period_start: null, p_period_end: null, p_notes: 'fixed', p_lines: [{ kind: 'expense', description: 'Hours', amount: '45.00', category_id: software }],
    })
    expect(resave.error).toBeNull()
    expect(await bill(id)).toMatchObject({ status: 'pending_approval', rejected_reason: null, total: 45 })
  })

  it('pays only approved bills, never above the balance, and tracks status', async () => {
    const id = await saveBill(f, vendor, 'B-4', [{ kind: 'contractor', description: 'Hours', amount: '1000.00' }])
    expect((await pay(f.manager.db, id, '100.00')).error?.message).toContain('BILL_NOT_PAYABLE')
    await f.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    expect((await pay(f.manager.db, id, '1000.01')).error?.message).toContain('VENDOR_PAYMENT_TOO_LARGE')
    const p1 = await pay(f.manager.db, id, '400.00')
    expect(p1.error).toBeNull()
    expect(await bill(id)).toMatchObject({ status: 'partly_paid', amount_paid: 400 })
    expect((await pay(f.manager.db, id, '600.00')).error).toBeNull()
    expect(await bill(id)).toMatchObject({ status: 'paid', amount_paid: 1000 })
    expect((await f.manager.db.rpc('delete_vendor_payment', { p_payment: p1.data })).error).toBeNull()
    expect(await bill(id)).toMatchObject({ status: 'partly_paid', amount_paid: 600 })
    expect((await pay(f.manager.db, id, '10.00', '2099-01-01')).error).not.toBeNull()
  })

  it('voids only bills without payments, removing their expenses', async () => {
    const paid = await saveBill(f, vendor, 'B-5', [{ kind: 'contractor', description: 'Hours', amount: '10.00' }])
    await f.admin.db.rpc('approve_vendor_bill', { p_bill: paid })
    await pay(f.manager.db, paid, '5.00')
    expect((await f.admin.db.rpc('void_vendor_bill', { p_bill: paid })).error?.message).toContain('BILL_HAS_PAYMENTS')

    const id = await saveBill(f, vendor, 'B-6', [{ kind: 'expense', description: 'Licences', amount: '20.00', category_id: software }])
    await f.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    expect((await f.manager.db.rpc('void_vendor_bill', { p_bill: id })).error?.code).toBe('42501')
    expect((await f.admin.db.rpc('void_vendor_bill', { p_bill: id })).error).toBeNull()
    expect((await bill(id)).status).toBe('void')
    const { data: line } = await adminDb().from('vendor_bill_lines').select('id').eq('bill_id', id).single()
    const { count } = await adminDb().from('expenses').select('id', { count: 'exact', head: true }).eq('vendor_bill_line_id', line!.id)
    expect(count).toBe(0)
  })

  it('shows each contractor line against the approved hours it covers', async () => {
    const g = await newFirm('Bills Check Firm')
    const v = await mkVendor(g, 'Talent Co')
    const ids = await seedApprovedHours(g, {
      consultantName: 'Dana Vendor',
      costRate: '90',
      entries: [
        { workDate: '2026-10-05', hours: '8' },
        { workDate: '2026-10-06', hours: '2' },
      ],
      beforeApprove: async (ids) => {
        const { error } = await adminDb().from('consultants').update({ type: 'vendor', vendor_id: v }).eq('id', ids.consultantId)
        if (error) throw new Error(error.message)
      },
    })
    const id = await saveBill(g, v, 'TC-10', [{ kind: 'contractor', description: 'October', amount: '950.00', consultant_id: ids.consultantId }], {
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    })
    const r = await g.manager.db.rpc('contractor_line_costs', { p_firm: g.firmId, p_from: null, p_to: null, p_bill: id })
    expect(r.error).toBeNull()
    expect(r.data).toEqual([expect.objectContaining({ consultant_id: ids.consultantId, hours: 10, expected: 900, adjustment: 50 })])
  })

  it('refuses everything to a consultant', async () => {
    const id = await saveBill(f, vendor, 'B-7', [{ kind: 'contractor', description: 'Hours', amount: '10.00' }])
    const c = f.consultant.db
    for (const r of await Promise.all([
      c.rpc('approve_vendor_bill', { p_bill: id }),
      c.rpc('reject_vendor_bill', { p_bill: id, p_reason: 'x' }),
      c.rpc('record_vendor_payment', { p_bill: id, p_amount: '1.00', p_paid_on: '2026-11-05', p_method: 'check', p_reference: null, p_notes: null }),
      c.rpc('contractor_line_costs', { p_firm: f.firmId, p_from: null, p_to: null, p_bill: id }),
      c.rpc('save_vendor_bill', {
        p_bill: null, p_firm: f.firmId, p_vendor: vendor, p_number: 'C-1', p_bill_date: '2026-11-01', p_due_date: '2026-11-30',
        p_period_start: null, p_period_end: null, p_notes: null, p_lines: [{ kind: 'contractor', description: 'X', amount: '1.00' }],
      }),
    ])) {
      expect(r.error?.code).toBe('42501')
    }
  })
})
