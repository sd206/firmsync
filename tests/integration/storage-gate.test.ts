import { describe, expect, it } from 'vitest'
import { createUploadTargets } from '@/modules/attachments/storage'
import { uploadFirmLogo } from '@/modules/firms/data'
import { generateAndStorePdf } from '@/modules/invoices/pdf/storage'
import { ensureRoomFor, getStorageStatus, STORAGE_FULL } from '@/modules/storage/data'
import { adminDb, newFirm } from './helpers'
import { issueManualInvoice } from './invoice-fixtures'
import { expenseWithFile } from './storage-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

/** A firm whose allowance is `allowance` bytes, with `used` bytes in one expense file. */
async function firmWith(allowance: number, used: number): Promise<{ f: Firm; expenseId: string }> {
  const f = await newFirm('Storage Gate Firm')
  const { error } = await adminDb().from('firms').update({ storage_included_bytes: allowance }).eq('id', f.firmId)
  if (error) throw new Error(error.message)
  const { expenseId } = await expenseWithFile(f, used)
  return { f, expenseId }
}

const expense = (id: string) => ({ kind: 'expense', id }) as const

describe('storage status', () => {
  it('reports used, allowance and level', async () => {
    const { f } = await firmWith(1000, 960)
    expect(await getStorageStatus(f.manager.db, f.firmId)).toEqual({ ok: true, data: { used: 960, allowance: 1000, level: 'warning' } })
  })
})

describe('upload gate', () => {
  it('refuses a batch that would exceed the allowance, and accepts one that just fits', async () => {
    const { f, expenseId } = await firmWith(1000, 900)
    expect(
      await createUploadTargets(f.manager.db, f.firmId, expense(expenseId), [
        { name: 'a.pdf', size: 50 },
        { name: 'b.pdf', size: 60 },
      ]),
    ).toEqual({ ok: false, error: STORAGE_FULL })
    const fits = await createUploadTargets(f.manager.db, f.firmId, expense(expenseId), [{ name: 'a.pdf', size: 100 }])
    expect(fits.ok).toBe(true)
  })

  it('a full firm refuses even a 1-byte upload', async () => {
    const { f, expenseId } = await firmWith(1000, 1000)
    expect(await createUploadTargets(f.manager.db, f.firmId, expense(expenseId), [{ name: 'a.pdf', size: 1 }])).toEqual({
      ok: false,
      error: STORAGE_FULL,
    })
    expect(await ensureRoomFor(f.manager.db, f.firmId, 0)).toEqual({ ok: false, error: STORAGE_FULL })
  })

  it('files that fail the per-file checks are not counted against the room', async () => {
    const { f, expenseId } = await firmWith(1000, 900)
    const r = await createUploadTargets(f.manager.db, f.firmId, expense(expenseId), [
      { name: 'big.pdf', size: 20 * 1024 * 1024 },
      { name: 'small.pdf', size: 50 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.targets).toHaveLength(1)
  })

  it('logo upload is refused when full', async () => {
    const { f } = await firmWith(1000, 1000)
    expect(
      await uploadFirmLogo(f.admin.db, f.firmId, { name: 'l.png', type: 'image/png', size: PNG.byteLength, bytes: PNG.buffer }),
    ).toEqual({ ok: false, error: STORAGE_FULL })
  })

  it('invoice PDF still stores when full', async () => {
    const { f } = await firmWith(1000, 1000)
    const { invoiceId } = await issueManualInvoice(f, 100)
    const r = await generateAndStorePdf(f.manager.db, f.firmId, invoiceId, async () => new Uint8Array(500))
    expect(r.ok).toBe(true)
  })
})
