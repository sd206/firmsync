import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { adminDb, newFirm } from './helpers'
import { mkVendor, saveBill } from './vendor-bill-fixtures'

describe('vendor attachments', () => {
  it('registers and deletes bill and payment files; consultants are refused', async () => {
    const f = await newFirm('Vendor Files Firm')
    const v = await mkVendor(f, 'Paper Co')
    const bill = await saveBill(f, v, 'PF-1', [{ kind: 'contractor', description: 'Hours', amount: '20.00' }])
    const path = `firms/${f.firmId}/attachments/vendor-bills/${bill}/${randomUUID()}.pdf`
    const add = await f.manager.db.rpc('add_vendor_attachment', {
      p_owner_kind: 'bill', p_owner: bill, p_storage_path: path, p_file_name: 'bill.pdf', p_mime: 'application/pdf', p_size: 10,
    })
    expect(add.error).toBeNull()
    expect((await f.consultant.db.rpc('delete_attachment', { p_attachment: add.data })).error?.code).toBe('42501')
    const del = await f.manager.db.rpc('delete_attachment', { p_attachment: add.data })
    expect(del.error).toBeNull()
    expect(del.data).toBe(path)

    await f.admin.db.rpc('approve_vendor_bill', { p_bill: bill })
    const pay = await f.manager.db.rpc('record_vendor_payment', {
      p_bill: bill, p_amount: '20.00', p_paid_on: '2026-11-05', p_method: 'check', p_reference: null, p_notes: null,
    })
    const ppath = `firms/${f.firmId}/attachments/vendor-payments/${pay.data}/${randomUUID()}.png`
    const padd = await f.manager.db.rpc('add_vendor_attachment', {
      p_owner_kind: 'payment', p_owner: pay.data, p_storage_path: ppath, p_file_name: 'r.png', p_mime: 'image/png', p_size: 10,
    })
    expect(padd.error).toBeNull()
    expect((await f.manager.db.rpc('delete_attachment', { p_attachment: padd.data })).data).toBe(ppath)
    const { count } = await adminDb().from('attachments').select('id', { count: 'exact', head: true }).in('id', [add.data, padd.data])
    expect(count).toBe(0)
  })
})
