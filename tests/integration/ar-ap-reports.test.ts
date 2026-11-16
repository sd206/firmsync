import { beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '@/lib/domain/weeks'
import { adminDb, newFirm } from './helpers'
import { issueManualInvoice } from './invoice-fixtures'
import { mkVendor, saveBill } from './vendor-bill-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>
type Row = Record<string, unknown>

const T = '2026-06-15'
const d = (n: number) => addDays(T, n)

async function call(f: Firm, fn: string, args: Row, as: 'manager' | 'consultant' = 'manager'): Promise<Row[]> {
  const { data, error } = await f[as].db.rpc(fn, { p_firm: f.firmId, p_today: T, p_overdue_only: false, ...args })
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as Row[]
}

async function invoice(f: Firm, amount: number, issue: string, due: string, clientId?: string) {
  const ids = await issueManualInvoice(f, amount)
  const patch: Row = { issue_date: issue, due_date: due }
  if (clientId) patch.client_id = clientId
  const { error } = await adminDb().from('invoices').update(patch).eq('id', ids.invoiceId)
  if (error) throw new Error(error.message)
  return { invoiceId: ids.invoiceId, clientId: clientId ?? ids.clientId }
}

async function pay(f: Firm, invoiceId: string, amount: number, on: string) {
  const { error } = await f.manager.db.rpc('record_payment', {
    p_invoice: invoiceId, p_amount: amount, p_paid_on: on, p_method: 'cash', p_reference: null, p_notes: null,
  })
  if (error) throw new Error(error.message)
}

async function bill(f: Firm, v: string, n: string, amount: string, due: string, opts: { approve?: boolean; billDate?: string } = {}) {
  const billDate = opts.billDate ?? (due < d(-30) ? addDays(due, -1) : d(-30))
  const id = await saveBill(f, v, n, [{ kind: 'contractor', description: 'Hours', amount }], { billDate, dueDate: due })
  if (opts.approve !== false) {
    const { error } = await f.admin.db.rpc('approve_vendor_bill', { p_bill: id })
    if (error) throw new Error(`approve: ${error.message}`)
  }
  return id
}

async function payBill(f: Firm, id: string, amount: number, on: string) {
  const { error } = await f.manager.db.rpc('record_vendor_payment', {
    p_bill: id, p_amount: amount, p_paid_on: on, p_method: 'cash', p_reference: null, p_notes: null,
  })
  if (error) throw new Error(`pay bill: ${error.message}`)
}

describe('receivables report', () => {
  let f: Firm
  let A: string
  let B: string
  let C: string // only a not-yet-due invoice
  let H: string // history only, nothing open
  let partly: string
  beforeAll(async () => {
    f = await newFirm('AR Report Firm')
    A = (await invoice(f, 500, d(-10), T)).clientId
    await invoice(f, 100, d(-30), d(-1), A)
    partly = (await invoice(f, 600, d(-120), d(-91), A)).invoiceId
    await pay(f, partly, 250, d(-5))
    B = (await invoice(f, 300, d(-60), d(-31))).clientId
    const paid = await invoice(f, 777, d(-20), d(-10), B)
    await pay(f, paid.invoiceId, 777, d(-2))
    const voided = await invoice(f, 888, d(-20), d(-10), B)
    const { error } = await f.manager.db.rpc('void_invoice', { p_invoice: voided.invoiceId })
    if (error) throw new Error(error.message)
    C = (await invoice(f, 50, d(-5), d(10))).clientId

    // A's history: one invoice paid in two instalments, one paid in full; one paid too long ago.
    const h1 = await invoice(f, 200, d(-40), d(-10), A)
    await pay(f, h1.invoiceId, 100, d(-20))
    await pay(f, h1.invoiceId, 100, d(-5))
    const h2 = await invoice(f, 80, d(-30), d(-20), A)
    await pay(f, h2.invoiceId, 80, d(-25))
    const old = await invoice(f, 90, d(-500), d(-470), A)
    await pay(f, old.invoiceId, 90, d(-400))
    // H: paid history only.
    const hh = await invoice(f, 40, d(-30), d(-20))
    H = hh.clientId
    await pay(f, hh.invoiceId, 40, d(-10))
  })

  it('buckets by balance with exact boundaries, totals and open count; largest overdue first', async () => {
    const rows = await call(f, 'receivables_report', { p_clients: null })
    const a = rows.find((r) => r.client_id === A)
    expect(a).toMatchObject({
      not_due: '500.00', d1_30: '100.00', d31_60: '0.00', d61_90: '0.00', d90_plus: '350.00',
      total: '950.00', oldest_overdue_days: 91, open_invoices: 3,
    })
    expect(rows.find((r) => r.client_id === B)).toMatchObject({ d31_60: '300.00', total: '300.00', open_invoices: 1, oldest_overdue_days: 31 })
    expect(rows.find((r) => r.client_id === C)).toMatchObject({ not_due: '50.00', total: '50.00', oldest_overdue_days: 0 })
    expect(rows.find((r) => r.client_id === H)).toBeUndefined()
    expect(rows[0].client_id).toBe(A)
    expect(rows[1].client_id).toBe(B)
  })

  it('overdue only drops not-yet-due invoices and clients left with nothing', async () => {
    const rows = await call(f, 'receivables_report', { p_clients: null, p_overdue_only: true })
    expect(rows.find((r) => r.client_id === A)).toMatchObject({ not_due: '0.00', total: '450.00', open_invoices: 2 })
    expect(rows.find((r) => r.client_id === C)).toBeUndefined()
  })

  it('days to pay uses the last instalment within 365 days', async () => {
    const rows = await call(f, 'receivables_report', { p_clients: [A] })
    expect(rows).toHaveLength(1)
    // h1: paid d(-5), issued d(-40) → 35, late 5; h2: paid d(-25), issued d(-30) → 5, late 0
    expect(rows[0]).toMatchObject({ avg_days_to_pay: '20.0', avg_days_late: '2.5' })
    const b = (await call(f, 'receivables_report', { p_clients: [B] }))[0]
    expect(b).toMatchObject({ avg_days_to_pay: '18.0', avg_days_late: '8.0' })
    const c = (await call(f, 'receivables_report', { p_clients: [C] }))[0]
    expect(c.avg_days_to_pay).toBeNull()
    expect(c.avg_days_late).toBeNull()
  })

  it('receivables_invoices lists open invoices with balance and days overdue', async () => {
    const rows = await call(f, 'receivables_invoices', { p_clients: [A] })
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.invoice_id === partly)).toMatchObject({
      total: '600.00', amount_paid: '250.00', balance: '350.00', days_overdue: 91,
    })
    expect(rows.map((r) => r.due_date)).toEqual([d(-91), d(-1), T])
    const overdue = await call(f, 'receivables_invoices', { p_clients: [A], p_overdue_only: true })
    expect(overdue).toHaveLength(2)
  })
})

describe('payables report', () => {
  let f: Firm
  let V: string
  let W: string
  let partlyBill: string
  let pending: string
  beforeAll(async () => {
    f = await newFirm('AP Report Firm')
    V = await mkVendor(f, 'Acme Staffing')
    W = await mkVendor(f, 'Zed Supplies')
    await bill(f, V, 'B-T', '10.00', T)
    await bill(f, V, 'B-7', '20.00', d(7))
    await bill(f, V, 'B-8', '40.00', d(8))
    await bill(f, V, 'B-31', '80.00', d(31))
    partlyBill = await bill(f, V, 'B-OLD', '400.00', d(-45))
    await payBill(f, partlyBill, 150, d(-10))
    pending = await bill(f, V, 'B-PEND', '70.00', d(-3), { approve: false })
    const rej = await bill(f, V, 'B-REJ', '5.00', d(-3), { approve: false })
    const r = await f.admin.db.rpc('reject_vendor_bill', { p_bill: rej, p_reason: 'Wrong' })
    if (r.error) throw new Error(r.error.message)
    const vd = await bill(f, V, 'B-VOID', '6.00', d(-3))
    const v = await f.admin.db.rpc('void_vendor_bill', { p_bill: vd })
    if (v.error) throw new Error(v.error.message)
    const pd = await bill(f, V, 'B-PAID', '7.00', d(-3))
    await payBill(f, pd, 7, d(-1))
    await bill(f, W, 'W-1', '15.00', d(3))
  })

  it('splits due-soon, ages overdue balances and keeps awaiting approval apart', async () => {
    const rows = await call(f, 'payables_report', { p_vendors: null })
    const v = rows.find((r) => r.vendor_id === V)
    expect(v).toMatchObject({
      due_7: '30.00', due_8_30: '40.00', due_later: '80.00',
      d1_30: '0.00', d31_60: '250.00', d61_90: '0.00', d90_plus: '0.00',
      total: '400.00', awaiting_approval: '70.00', awaiting_count: 1, oldest_overdue_days: 45,
    })
    expect(rows.find((r) => r.vendor_id === W)).toMatchObject({ due_7: '15.00', total: '15.00', awaiting_count: 0, oldest_overdue_days: 0 })
    expect(rows[0].vendor_id).toBe(V)
  })

  it('overdue only keeps overdue approved and awaiting bills', async () => {
    const rows = await call(f, 'payables_report', { p_vendors: null, p_overdue_only: true })
    expect(rows.find((r) => r.vendor_id === V)).toMatchObject({ due_7: '0.00', total: '250.00', awaiting_approval: '70.00' })
    expect(rows.find((r) => r.vendor_id === W)).toBeUndefined()
  })

  it('payables_bills lists open and awaiting bills with status and balance', async () => {
    const rows = await call(f, 'payables_bills', { p_vendors: [V] })
    expect(rows.map((r) => r.bill_number)).toEqual(['B-OLD', 'B-PEND', 'B-T', 'B-7', 'B-8', 'B-31'])
    expect(rows.find((r) => r.bill_id === partlyBill)).toMatchObject({
      status: 'partly_paid', total: '400.00', amount_paid: '150.00', balance: '250.00', days_overdue: 45,
    })
    expect(rows.find((r) => r.bill_id === pending)).toMatchObject({ status: 'pending_approval', days_overdue: 3 })
  })
})

describe('report access', () => {
  it("rejects consultants and ignores other firms' ids", async () => {
    const f = await newFirm('AR Access A')
    const g = await newFirm('AR Access B')
    const { clientId } = await invoice(f, 100, d(-10), d(-5))
    const v = await mkVendor(f)
    await bill(f, v, 'X-1', '9.00', d(-2))
    for (const fn of ['receivables_report', 'receivables_invoices', 'payables_report', 'payables_bills']) {
      const ids = fn.startsWith('receivables') ? { p_clients: null } : { p_vendors: null }
      const { error } = await f.consultant.db.rpc(fn, { p_firm: f.firmId, p_today: T, p_overdue_only: false, ...ids })
      expect(error?.code).toBe('42501')
    }
    expect(await call(g, 'receivables_report', { p_clients: [clientId] })).toEqual([])
    expect(await call(g, 'receivables_invoices', { p_clients: [clientId] })).toEqual([])
    expect(await call(g, 'payables_report', { p_vendors: [v] })).toEqual([])
    expect(await call(g, 'payables_bills', { p_vendors: [v] })).toEqual([])
  })
})
