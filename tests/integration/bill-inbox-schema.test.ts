import { describe, expect, it } from 'vitest'
import { adminDb, newFirm } from './helpers'
import { seedInboxItem } from './bill-inbox-fixtures'
import { mkVendor, saveBill } from './vendor-bill-fixtures'

type Addr = { id: string; code: string; enabled: boolean; unknown_sender: string; replaced_at: string | null }

describe('bill inbox schema', () => {
  it('admins enable, disable and replace the address; codes are 10 random characters', async () => {
    const f = await newFirm('Inbox Address Firm')
    const on = await f.admin.db.rpc('bill_inbox_enable', { p_firm: f.firmId })
    expect(on.error).toBeNull()
    const a = on.data as Addr
    expect(a.code).toMatch(/^[a-z0-9]{10}$/)
    expect(a.enabled).toBe(true)
    expect(a.unknown_sender).toBe('hold')

    const off = await f.admin.db.rpc('bill_inbox_disable', { p_firm: f.firmId })
    expect((off.data as Addr).enabled).toBe(false)
    const again = await f.admin.db.rpc('bill_inbox_enable', { p_firm: f.firmId })
    expect((again.data as Addr).code).toBe(a.code)

    const rep = await f.admin.db.rpc('bill_inbox_replace', { p_firm: f.firmId })
    const b = rep.data as Addr
    expect(b.code).not.toBe(a.code)
    expect(b.enabled).toBe(true)
    const { data: old } = await adminDb().from('bill_inbox_addresses').select('replaced_at').eq('id', a.id).single()
    expect(old!.replaced_at).not.toBeNull()

    const mode = await f.admin.db.rpc('bill_inbox_set_unknown', { p_firm: f.firmId, p_mode: 'drop' })
    expect((mode.data as Addr).unknown_sender).toBe('drop')
  })

  it('managers cannot change the address or write items directly', async () => {
    const f = await newFirm('Inbox Roles Firm')
    expect((await f.manager.db.rpc('bill_inbox_enable', { p_firm: f.firmId })).error?.code).toBe('42501')
    const { addressId } = await seedInboxItem(f)
    const ins = await f.manager.db.from('bill_inbox_items').insert({
      firm_id: f.firmId, address_id: addressId, resend_email_id: 'x', from_address: 'a@b.c', to_address: 'x', subject: 's',
      received_at: new Date().toISOString(), sender_kind: 'unknown',
    })
    expect(ins.error).not.toBeNull()
    const { data: mine } = await f.manager.db.from('bill_inbox_items').select('id').eq('firm_id', f.firmId)
    expect(mine).toHaveLength(1)
  })

  it('keeps firms apart', async () => {
    const f = await newFirm('Inbox Iso A')
    const g = await newFirm('Inbox Iso B')
    const { itemId } = await seedInboxItem(f)
    const { data } = await g.manager.db.from('bill_inbox_items').select('id').eq('id', itemId)
    expect(data).toEqual([])
    expect((await g.manager.db.rpc('bill_inbox_set_status', { p_item: itemId, p_status: 'ignored', p_note: null })).error?.code).toBe('42501')
  })

  it('moves items between statuses and restores them', async () => {
    const f = await newFirm('Inbox Status Firm')
    const { itemId } = await seedInboxItem(f)
    const st = async () => (await adminDb().from('bill_inbox_items').select('status, note, handled_by').eq('id', itemId).single()).data!
    expect((await f.manager.db.rpc('bill_inbox_set_status', { p_item: itemId, p_status: 'ignored', p_note: 'spam' })).error).toBeNull()
    expect(await st()).toMatchObject({ status: 'ignored', note: 'spam', handled_by: f.manager.id })
    const bad = await f.manager.db.rpc('bill_inbox_set_status', { p_item: itemId, p_status: 'duplicate', p_note: null })
    expect(bad.error?.message).toContain('INBOX_STATE')
    expect((await f.manager.db.rpc('bill_inbox_set_status', { p_item: itemId, p_status: 'new', p_note: null })).error).toBeNull()
    expect(await st()).toMatchObject({ status: 'new', note: null, handled_by: null })
    const long = await f.manager.db.rpc('bill_inbox_set_status', { p_item: itemId, p_status: 'duplicate', p_note: 'x'.repeat(501) })
    expect(long.error?.message).toContain('INBOX_NOTE')
    expect((await f.consultant.db.rpc('bill_inbox_set_status', { p_item: itemId, p_status: 'ignored', p_note: null })).error?.code).toBe('42501')
  })

  it('links bills to files and marks the item done when every file has a bill', async () => {
    const f = await newFirm('Inbox Link Firm')
    const v = await mkVendor(f, 'Acme Staffing')
    const { itemId, attachmentIds } = await seedInboxItem(f, { files: 2 })
    const b1 = await saveBill(f, v, 'L-1', [{ kind: 'contractor', description: 'Hours', amount: '10.00' }])
    const b2 = await saveBill(f, v, 'L-2', [{ kind: 'contractor', description: 'Hours', amount: '20.00' }])
    const link = (att: string, bill: string) => f.manager.db.rpc('bill_inbox_link_bill', { p_item: itemId, p_attachment: att, p_bill: bill })
    expect((await link(attachmentIds[0], b1)).error).toBeNull()
    const st = async () => (await adminDb().from('bill_inbox_items').select('status').eq('id', itemId).single()).data!.status
    expect(await st()).toBe('new')
    expect((await link(attachmentIds[1], b2)).error).toBeNull()
    expect(await st()).toBe('bill_created')

    const g = await newFirm('Inbox Link Other')
    const gv = await mkVendor(g, 'Other')
    const foreign = await saveBill(g, gv, 'X-1', [{ kind: 'contractor', description: 'Hours', amount: '1.00' }])
    const { itemId: i2, attachmentIds: a2 } = await seedInboxItem(f)
    const r = await f.manager.db.rpc('bill_inbox_link_bill', { p_item: i2, p_attachment: a2[0], p_bill: foreign })
    expect(r.error?.message).toContain('BILL_NOT_FOUND')
  })
})
