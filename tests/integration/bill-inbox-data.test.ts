import { describe, expect, it } from 'vitest'
import {
  attachInboxFileToBill,
  enableInbox,
  getInboxSettings,
  inboxFileForBill,
  listInbox,
  newInboxCount,
  replaceInbox,
  setInboxStatus,
  setUnknownSender,
} from '@/modules/bill-inbox/data'
import { adminDb, newFirm } from './helpers'
import { seedInboxItem } from './bill-inbox-fixtures'
import { mkVendor, saveBill } from './vendor-bill-fixtures'

const ENV = { configured: true, domains: ['test.resend.app', 'old.resend.app'] }

describe('bill inbox data', () => {
  it('reads and changes settings; only admins change them', async () => {
    const f = await newFirm('Inbox Data Settings')
    const none = await getInboxSettings(f.manager.db, f.firmId, ENV)
    expect(none).toEqual({ ok: true, data: { configured: true, address: null, enabled: false, unknownSender: 'hold' } })
    expect((await enableInbox(f.manager.db, f.firmId)).ok).toBe(false)
    expect((await enableInbox(f.admin.db, f.firmId)).ok).toBe(true)
    const s = await getInboxSettings(f.manager.db, f.firmId, ENV)
    expect(s.ok && s.data.address).toMatch(/^bills-[a-z0-9]{10}@test\.resend\.app$/)
    expect((await setUnknownSender(f.admin.db, f.firmId, 'drop')).ok).toBe(true)
    const before = s.ok ? s.data.address : null
    expect((await replaceInbox(f.admin.db, f.firmId)).ok).toBe(true)
    const after = await getInboxSettings(f.admin.db, f.firmId, ENV)
    expect(after.ok && after.data).toMatchObject({ enabled: true, unknownSender: 'drop' })
    expect(after.ok && after.data.address).not.toBe(before)
    expect(await getInboxSettings(f.admin.db, f.firmId, { configured: false, domains: [] })).toMatchObject({ ok: true, data: { configured: false } })
  })

  it('lists items by tab with vendor, files, bills and the duplicate hint', async () => {
    const f = await newFirm('Inbox Data List')
    const v = await mkVendor(f, 'Acme Staffing')
    const a = await seedInboxItem(f, { vendorId: v, fileNames: ['inv-0001.pdf'], receivedAt: '2026-11-01T10:00:00Z' })
    const b = await seedInboxItem(f, { vendorId: v, fileNames: ['INV-0001.pdf'], receivedAt: '2026-11-10T10:00:00Z' })
    const c = await seedInboxItem(f, { from: 'other@x.test', fileNames: ['scan.pdf'] })
    expect(await newInboxCount(f.manager.db, f.firmId)).toBe(3)
    const rows = await listInbox(f.manager.db, f.firmId, 'new')
    expect(rows.ok).toBe(true)
    if (!rows.ok) return
    expect(rows.data.map((r) => r.id)).toEqual([c.itemId, b.itemId, a.itemId])
    const rb = rows.data.find((r) => r.id === b.itemId)!
    expect(rb).toMatchObject({ vendorName: 'Acme Staffing', possibleDuplicate: true, files: [{ fileName: 'INV-0001.pdf', billId: null }] })
    expect(rows.data.find((r) => r.id === a.itemId)!.possibleDuplicate).toBe(false)
    expect(rows.data.find((r) => r.id === c.itemId)!.possibleDuplicate).toBe(false)

    expect((await setInboxStatus(f.manager.db, f.firmId, c.itemId, 'ignored', 'spam')).ok).toBe(true)
    const ign = await listInbox(f.manager.db, f.firmId, 'ignored')
    expect(ign.ok && ign.data.map((r) => [r.id, r.note])).toEqual([[c.itemId, 'spam']])
    expect(await newInboxCount(f.manager.db, f.firmId)).toBe(2)

    const g = await newFirm('Inbox Data Other')
    expect((await setInboxStatus(g.manager.db, g.firmId, c.itemId, 'new', null)).ok).toBe(false)
  })

  it('only hands out inbox files of this firm for a new bill', async () => {
    const f = await newFirm('Inbox Data File')
    const g = await newFirm('Inbox Data File Other')
    const v = await mkVendor(f, 'Acme Staffing')
    const mine = await seedInboxItem(f, { vendorId: v })
    const theirs = await seedInboxItem(g)
    const ok = await inboxFileForBill(f.manager.db, f.firmId, mine.attachmentIds[0])
    expect(ok).toEqual({ ok: true, data: { attachmentId: mine.attachmentIds[0], fileName: 'remittance.pdf', itemId: mine.itemId, vendorId: v } })
    expect(await inboxFileForBill(f.manager.db, f.firmId, theirs.attachmentIds[0])).toEqual({ ok: false, error: 'File not found.' })
  })

  it('copies the inbox file to the new bill and links them', async () => {
    const f = await newFirm('Inbox Data Attach')
    const v = await mkVendor(f, 'Acme Staffing')
    const item = await seedInboxItem(f, { vendorId: v, upload: true })
    const bill = await saveBill(f, v, 'IN-1', [{ kind: 'contractor', description: 'Hours', amount: '10.00' }])
    const r = await attachInboxFileToBill(f.manager.db, f.firmId, bill, item.attachmentIds[0])
    expect(r).toEqual({ ok: true, data: undefined })
    const { data: files } = await adminDb().from('attachments').select('storage_path, file_name').eq('vendor_bill_id', bill)
    expect(files).toHaveLength(1)
    expect(files![0].file_name).toBe('remittance.pdf')
    expect((await adminDb().storage.from('firm-files').download(files![0].storage_path)).error).toBeNull()
    const { data: link } = await adminDb().from('bill_inbox_bills').select('bill_id').eq('attachment_id', item.attachmentIds[0]).single()
    expect(link!.bill_id).toBe(bill)
    const { data: st } = await adminDb().from('bill_inbox_items').select('status').eq('id', item.itemId).single()
    expect(st!.status).toBe('bill_created')
    // The inbox keeps its own copy.
    const { count } = await adminDb().from('attachments').select('id', { count: 'exact', head: true }).eq('bill_inbox_item_id', item.itemId)
    expect(count).toBe(1)
  })
})
