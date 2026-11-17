import { beforeAll, describe, expect, it } from 'vitest'
import { adminDb, newFirm, signIn } from './helpers'
import { expenseWithFile, putObject } from './storage-fixtures'
import { issueManualInvoice } from './invoice-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>
type FileRow = { path: string; kind: string; attachment_id: string | null; owner_id: string | null; file_name: string; size_bytes: number; label: string; total_count: number }

const BUCKET = 'firm-files'
const GiB = 1073741824
const BASE = 5 * GiB

async function status(f: Firm) {
  const { data, error } = await f.manager.db.rpc('firm_storage_status', { p_firm: f.firmId })
  if (error) throw new Error(error.message)
  const row = (data as { used_bytes: number; allowance_bytes: number }[])[0]
  return { used: Number(row.used_bytes), allowance: Number(row.allowance_bytes) }
}

async function files(f: Firm, args: Partial<{ p_kind: string | null; p_sort: string; p_limit: number; p_offset: number }> = {}) {
  const { data, error } = await f.manager.db.rpc('firm_storage_files', {
    p_firm: f.firmId, p_kind: null, p_sort: 'largest', p_limit: 50, p_offset: 0, ...args,
  })
  if (error) throw new Error(error.message)
  return data as FileRow[]
}

describe('storage usage and file list', () => {
  let f: Firm
  let big: { expenseId: string; attachmentId: string }
  let pdfPath: string
  let invoiceId: string
  beforeAll(async () => {
    f = await newFirm('Storage Usage Firm')
    big = await expenseWithFile(f, 100, 'Uber')
    await expenseWithFile(f, 20, 'Hotel')
    await putObject(`firms/${f.firmId}/attachments/expenses/${big.expenseId}/incoming-${crypto.randomUUID()}`, 50)
    invoiceId = (await issueManualInvoice(f, 100)).invoiceId
    pdfPath = `firms/${f.firmId}/invoices/${invoiceId}/${crypto.randomUUID()}.pdf`
    await putObject(pdfPath, 30)
    const { error } = await adminDb().from('invoices').update({ pdf_path: pdfPath }).eq('id', invoiceId)
    if (error) throw new Error(error.message)
  })

  it('status counts every object under the firm folder, including incoming and PDFs', async () => {
    expect(await status(f)).toEqual({ used: 200, allowance: BASE })
  })

  it('breakdown groups by kind', async () => {
    const { data, error } = await f.manager.db.rpc('firm_storage_breakdown', { p_firm: f.firmId })
    expect(error).toBeNull()
    const rows = (data as { kind: string; files: number; bytes: number }[]).map((r) => ({ ...r, bytes: Number(r.bytes) }))
    expect(rows).toContainEqual({ kind: 'expense', files: 3, bytes: 170 })
    expect(rows).toContainEqual({ kind: 'invoice_pdf', files: 1, bytes: 30 })
    expect(rows.find((r) => r.kind === 'other')).toBeUndefined()
  })

  it('files list sorts, filters, pages and hides incoming', async () => {
    const all = await files(f)
    expect(all.map((r) => Number(r.size_bytes))).toEqual([100, 30, 20])
    expect(all.every((r) => !r.path.includes('/incoming-'))).toBe(true)
    expect(Number(all[0].total_count)).toBe(3)
    expect(all[0]).toMatchObject({ kind: 'expense', attachment_id: big.attachmentId, owner_id: big.expenseId, file_name: 'Uber.pdf' })
    expect(all[0].label).toBe(`Expense · Uber · ${'2026-10-15'}`)
    const pdf = all.find((r) => r.kind === 'invoice_pdf')!
    expect(pdf.owner_id).toBe(invoiceId)
    expect(pdf.attachment_id).toBeNull()
    expect(pdf.label).toMatch(/^Invoice /)

    expect((await files(f, { p_kind: 'expense' })).map((r) => r.kind)).toEqual(['expense', 'expense'])
    expect((await files(f, { p_limit: 1, p_offset: 1 })).map((r) => Number(r.size_bytes))).toEqual([30])
    const oldest = await files(f, { p_sort: 'oldest' })
    expect(oldest[0].file_name).toBe('Uber.pdf')
  })

  it('non-members and consultants are refused', async () => {
    const g = await newFirm('Storage Other Firm')
    for (const fn of ['firm_storage_status', 'firm_storage_breakdown']) {
      expect((await g.manager.db.rpc(fn, { p_firm: f.firmId })).error?.code).toBe('42501')
      expect((await f.consultant.db.rpc(fn, { p_firm: f.firmId })).error?.code).toBe('42501')
    }
    const args = { p_firm: f.firmId, p_kind: null, p_sort: 'largest', p_limit: 50, p_offset: 0 }
    expect((await g.manager.db.rpc('firm_storage_files', args)).error?.code).toBe('42501')
    expect((await f.consultant.db.rpc('firm_storage_files', args)).error?.code).toBe('42501')
  })

  it('firm users cannot change storage columns', async () => {
    await f.admin.db.from('firms').update({ storage_grant_gb: 99 }).eq('id', f.firmId)
    const { data } = await adminDb().from('firms').select('storage_grant_gb').eq('id', f.firmId).single()
    expect((data as { storage_grant_gb: number }).storage_grant_gb).toBe(0)
  })
})

describe('allowance', () => {
  it('adds blocks and grants', async () => {
    const f = await newFirm('Storage Allowance Firm')
    await adminDb().from('firms').update({ storage_blocks: 2, storage_grant_gb: 3 }).eq('id', f.firmId)
    expect((await status(f)).allowance).toBe(BASE + 2 * 10 * GiB + 3 * GiB)
  })

  it('platform owner grants storage; others are refused', async () => {
    const name = `Storage Grant ${crypto.randomUUID().slice(0, 8)}`
    const f = await newFirm(name)
    expect((await f.admin.db.rpc('platform_set_storage_grant', { p_firm: f.firmId, p_gb: 4 })).error?.code).toBe('42501')
    const owner = await signIn('owner@local.test', 'owner-password-123')
    expect((await owner.db.rpc('platform_set_storage_grant', { p_firm: f.firmId, p_gb: 10001 })).error).not.toBeNull()
    expect((await owner.db.rpc('platform_set_storage_grant', { p_firm: f.firmId, p_gb: 4 })).error).toBeNull()
    expect((await status(f)).allowance).toBe(BASE + 4 * GiB)
    const { data } = await owner.db.rpc('platform_firms', { p_search: name, p_limit: 5, p_offset: 0 })
    const row = (data as { id: string; used_bytes: number; allowance_bytes: number }[]).find((r) => r.id === f.firmId)!
    expect(Number(row.used_bytes)).toBe(0)
    expect(Number(row.allowance_bytes)).toBe(BASE + 4 * GiB)
  })
})

describe('storage alert check', () => {
  it('fires once per crossing of 95% and re-arms below 90%', async () => {
    const f = await newFirm('Storage Alert Firm')
    const db = adminDb()
    await db.from('firms').update({ storage_included_bytes: 1000 }).eq('id', f.firmId)
    const check = async () => {
      const { data, error } = await db.rpc('storage_alert_check', { p_firm: f.firmId })
      if (error) throw new Error(error.message)
      return data as boolean
    }
    const first = await expenseWithFile(f, 800)
    expect(await check()).toBe(false)
    const second = await expenseWithFile(f, 160)
    expect(await check()).toBe(true)
    expect(await check()).toBe(false)
    await db.from('attachments').delete().eq('id', second.attachmentId)
    await db.storage.from(BUCKET).remove([second.path])
    expect(await check()).toBe(false)
    const { data } = await db.from('firms').select('storage_alert_sent').eq('id', f.firmId).single()
    expect((data as { storage_alert_sent: boolean }).storage_alert_sent).toBe(false)
    await expenseWithFile(f, 160)
    expect(await check()).toBe(true)
    expect(first.attachmentId).toBeTruthy()
  })

  it('is not callable by firm users', async () => {
    const f = await newFirm('Storage Alert Access')
    expect((await f.admin.db.rpc('storage_alert_check', { p_firm: f.firmId })).error).not.toBeNull()
  })
})
