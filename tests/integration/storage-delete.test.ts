import { describe, expect, it } from 'vitest'
import { CANT_DELETE_HERE, deleteStorageFiles } from '@/modules/storage/delete'
import { getStorageStatus } from '@/modules/storage/data'
import { newFirm } from './helpers'
import { seedInboxItem } from './bill-inbox-fixtures'
import { expenseWithFile } from './storage-fixtures'

describe('deleteStorageFiles', () => {
  it('deletes expense files and usage drops by their size', async () => {
    const f = await newFirm('Storage Delete Firm')
    const a = await expenseWithFile(f, 100)
    const b = await expenseWithFile(f, 40)
    await expenseWithFile(f, 7)
    const before = await getStorageStatus(f.admin.db, f.firmId)
    expect(before.ok && before.data.used).toBe(147)

    expect(await deleteStorageFiles(f.admin.db, f.firmId, [a.attachmentId, b.attachmentId])).toEqual({
      ok: true,
      data: { deleted: 2, failed: [] },
    })
    const after = await getStorageStatus(f.admin.db, f.firmId)
    expect(after.ok && after.data.used).toBe(7)
  })

  it('refuses Bill inbox files', async () => {
    const f = await newFirm('Storage Delete Inbox')
    const { attachmentIds } = await seedInboxItem(f, { fileNames: ['inv.pdf'] })
    const id = attachmentIds[0]
    expect(await deleteStorageFiles(f.admin.db, f.firmId, [id])).toEqual({
      ok: true,
      data: { deleted: 0, failed: [{ name: 'inv.pdf', error: CANT_DELETE_HERE }] },
    })
  })

  it("refuses another firm's file and ids that aren't attachments", async () => {
    const f = await newFirm('Storage Delete A')
    const g = await newFirm('Storage Delete B')
    const theirs = await expenseWithFile(g, 10)
    const r = await deleteStorageFiles(f.admin.db, f.firmId, [theirs.attachmentId, crypto.randomUUID(), 'not-a-uuid'])
    expect(r).toEqual({
      ok: true,
      data: {
        deleted: 0,
        failed: [
          { name: 'File', error: CANT_DELETE_HERE },
          { name: 'File', error: CANT_DELETE_HERE },
          { name: 'File', error: CANT_DELETE_HERE },
        ],
      },
    })
    const still = await getStorageStatus(g.admin.db, g.firmId)
    expect(still.ok && still.data.used).toBe(10)
  })

  it('refuses more than 100 files at once', async () => {
    const f = await newFirm('Storage Delete Many')
    const ids = Array.from({ length: 101 }, () => crypto.randomUUID())
    expect(await deleteStorageFiles(f.admin.db, f.firmId, ids)).toEqual({ ok: false, error: 'Delete at most 100 files at a time.' })
  })
})
