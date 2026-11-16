import { beforeAll, describe, expect, it } from 'vitest'
import { adminDb, newFirm } from './helpers'
import { categoryId } from './expense-fixtures'
import { makeAccount, oneLine } from './bank-fixtures'
import { mkVendor, saveBill } from './vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>
const D = '2026-11-10'

async function line(id: string) {
  const { data } = await adminDb().from('bank_lines').select('status, vendor_payment_id').eq('id', id).single()
  return data as { status: string; vendor_payment_id: string | null }
}

describe('vendor bills and the bank', () => {
  let f: Firm
  let vendor: string
  let acct: string

  beforeAll(async () => {
    f = await newFirm('Bills Bank Firm')
    vendor = await mkVendor(f, 'Acme Staffing')
    acct = await makeAccount(f, 'bank', 'Main checking')
  })

  const approved = async (number: string, amount: string, lines?: Parameters<typeof saveBill>[3]) => {
    const id = await saveBill(f, vendor, number, lines ?? [{ kind: 'contractor', description: 'Hours', amount }])
    const r = await f.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    if (r.error) throw new Error(r.error.message)
    return id
  }

  it('confirms a money-out line as a vendor payment, once', async () => {
    const bill = await approved('BK-1', '1200.00')
    const l = await oneLine(f, acct, { posted_on: D, amount: '-1200.00', description: 'ACME STAFFING BK-1' })
    const call = () => f.manager.db.rpc('confirm_bank_line_vendor_payment', { p_line: l, p_bill: bill, p_notes: 'ACH' })
    const results = await Promise.all([call(), call()])
    expect(results.filter((r) => r.error === null)).toHaveLength(1)
    expect(results.find((r) => r.error)?.error?.message).toContain('LINE_HANDLED')
    const ok = results.find((r) => r.error === null)!
    expect(await line(l)).toMatchObject({ status: 'done', vendor_payment_id: ok.data })
    const { data: b } = await adminDb().from('vendor_bills').select('status, amount_paid').eq('id', bill).single()
    expect(b).toMatchObject({ status: 'paid', amount_paid: 1200 })
    const { data: p } = await adminDb().from('vendor_payments').select('method, paid_on, notes').eq('id', ok.data).single()
    expect(p).toMatchObject({ method: 'bank_transfer', paid_on: D, notes: 'ACH' })
  })

  it('refuses unapproved bills and money-in lines, leaving the line new', async () => {
    const pending = await saveBill(f, vendor, 'BK-2', [{ kind: 'contractor', description: 'Hours', amount: '50.00' }])
    const l = await oneLine(f, acct, { posted_on: D, amount: '-50.00', description: 'ACME' })
    const r = await f.manager.db.rpc('confirm_bank_line_vendor_payment', { p_line: l, p_bill: pending, p_notes: null })
    expect(r.error?.message).toContain('BILL_NOT_PAYABLE')
    expect((await line(l)).status).toBe('new')
    const inLine = await oneLine(f, acct, { posted_on: D, amount: '50.00', description: 'REFUND' })
    const bill = await approved('BK-3', '50.00')
    const w = await f.manager.db.rpc('confirm_bank_line_vendor_payment', { p_line: inLine, p_bill: bill, p_notes: null })
    expect(w.error?.message).toContain('LINE_DIRECTION')
  })

  it('links, marks duplicates, and frees the line when the payment is deleted', async () => {
    const bill = await approved('BK-4', '75.00')
    const pay = await f.manager.db.rpc('record_vendor_payment', {
      p_bill: bill, p_amount: '75.00', p_paid_on: D, p_method: 'check', p_reference: 'CHK-9', p_notes: null,
    })
    const a = await oneLine(f, acct, { posted_on: D, amount: '-75.00', description: 'CHECK 9' })
    const b = await oneLine(f, acct, { posted_on: D, amount: '-75.00', description: 'CHECK 9 AGAIN' })
    expect((await f.manager.db.rpc('link_bank_line', { p_line: a, p_payment: null, p_expense: null, p_vendor_payment: pay.data })).error).toBeNull()
    const twice = await f.manager.db.rpc('link_bank_line', { p_line: b, p_payment: null, p_expense: null, p_vendor_payment: pay.data })
    expect(twice.error?.message).toContain('ALREADY_LINKED')
    expect((await f.manager.db.rpc('delete_vendor_payment', { p_payment: pay.data })).error).toBeNull()
    expect(await line(a)).toMatchObject({ status: 'new', vendor_payment_id: null })

    // Mark as duplicate finds the single unmatched vendor payment.
    const pay2 = await f.manager.db.rpc('record_vendor_payment', {
      p_bill: bill, p_amount: '75.00', p_paid_on: D, p_method: 'check', p_reference: 'CHK-10', p_notes: null,
    })
    const dup = await f.manager.db.rpc('mark_bank_lines_duplicate', { p_lines: [a] })
    expect(dup.data).toEqual([{ matched: 1, ignored: 0, skipped: 0 }])
    expect((await line(a)).vendor_payment_id).toBe(pay2.data)
  })

  it('suggests payable bills for money-out lines and labels done lines', async () => {
    const g = await newFirm('Bills Suggest Firm')
    const v = await mkVendor(g, 'Talent Co')
    const ac = await makeAccount(g)
    const id = await saveBill(g, v, 'TC-7', [{ kind: 'contractor', description: 'Hours', amount: '640.00' }])
    await g.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    const big = await saveBill(g, v, 'TC-8', [{ kind: 'contractor', description: 'Hours', amount: '100.00' }])
    await g.admin.db.rpc('approve_vendor_bill', { p_bill: big })
    const l = await oneLine(g, ac, { posted_on: D, amount: '-640.00', description: 'TALENT CO TC-7' })
    const c = await g.manager.db.rpc('bank_match_candidates', { p_line: l })
    expect(c.error).toBeNull()
    const bills = (c.data as { bills: { id: string; bill_number: string; vendor_name: string; balance_due: string }[] }).bills
    expect(bills.map((b) => b.id)).toContain(id)
    expect(bills.find((b) => b.id === id)).toMatchObject({ bill_number: 'TC-7', vendor_name: 'Talent Co', balance_due: '640.00' })
    await g.manager.db.rpc('confirm_bank_line_vendor_payment', { p_line: l, p_bill: id, p_notes: null })
    const done = await g.manager.db.rpc('list_bank_lines', { p_account: ac, p_status: 'done' })
    expect((done.data as { linked_label: string }[])[0].linked_label).toBe('Bill #TC-7 – Talent Co')
  })

  it('lists money-out lines that could pay a bill, exact and named first', async () => {
    const g = await newFirm('Bills Withdrawals Firm')
    const v = await mkVendor(g, 'Northwind Staffing')
    const ac = await makeAccount(g)
    const id = await saveBill(g, v, 'NW-3', [{ kind: 'contractor', description: 'Hours', amount: '400.00' }])
    await g.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    const today = new Date().toISOString().slice(0, 10)
    const part = await oneLine(g, ac, { posted_on: today, amount: '-100.00', description: 'MISC' })
    const exact = await oneLine(g, ac, { posted_on: today, amount: '-400.00', description: 'NORTHWIND STAFFING' })
    await oneLine(g, ac, { posted_on: today, amount: '-401.00', description: 'TOO BIG' })
    await oneLine(g, ac, { posted_on: today, amount: '400.00', description: 'MONEY IN' })
    const r = await g.manager.db.rpc('bill_bank_withdrawals', { p_bill: id })
    expect(r.error).toBeNull()
    const rows = r.data as { line_id: string; amount: string; exact_match: boolean }[]
    expect(rows.map((x) => x.line_id)).toEqual([exact, part])
    expect(rows[0]).toMatchObject({ amount: '-400.00', exact_match: true })
    expect((await g.consultant.db.rpc('bill_bank_withdrawals', { p_bill: id })).error?.code).toBe('42501')
  })

  it('reports the vendor payment once in the Transactions report, and the expense once in the P&L', async () => {
    const g = await newFirm('Bills Report Firm')
    const v = await mkVendor(g, 'Cloud Inc')
    const sw = await categoryId(g.firmId, 'Software')
    const id = await saveBill(g, v, 'CL-1', [{ kind: 'expense', description: 'Hosting', amount: '300.00', category_id: sw }], {
      billDate: '2026-11-02',
    })
    await g.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    await g.manager.db.rpc('record_vendor_payment', {
      p_bill: id, p_amount: '300.00', p_paid_on: '2026-11-03', p_method: 'card', p_reference: null, p_notes: 'Paid by card',
    })
    const t = await g.manager.db.rpc('transactions_report', { p_firm: g.firmId, p_from: '2026-11-01', p_to: '2026-11-30', p_kind: 'all' })
    expect(t.error).toBeNull()
    const rows = t.data as { kind: string; payee: string; invoice_number: string; category: string; amount: string; notes: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'vendor_payment', payee: 'Cloud Inc', invoice_number: 'CL-1', category: 'Vendor bill', amount: '300.00', notes: 'Paid by card' })
    const out = await g.manager.db.rpc('transactions_report', { p_firm: g.firmId, p_from: '2026-11-01', p_to: '2026-11-30', p_kind: 'in' })
    expect(out.data).toEqual([])
    const pnl = await g.manager.db.rpc('pnl_report', {
      p_firm: g.firmId, p_from: '2026-11-01', p_to: '2026-11-30', p_group: 'month', p_clients: null, p_projects: null,
    })
    const total = (pnl.data as { row_kind: string; overhead: string }[]).find((r) => r.row_kind === 'total')
    expect(total?.overhead).toBe('300.00')
    expect(sw).toBeTruthy()
  })
})
