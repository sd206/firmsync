import { displayFileName } from '@/lib/domain/attachments'
import { STORAGE_FULL } from '@/lib/domain/storage'
import type { FormResult } from '@/lib/form'
import { createBrowserDb } from '@/lib/supabase/browser'
import type { DeclaredFile, Rejected, UploadedItem, UploadTarget } from '@/modules/attachments/storage'

/** The two server actions of the signed-upload flow, already bound to their owner. */
export type UploadActions = {
  createTargets: (files: DeclaredFile[]) => Promise<FormResult<{ targets: UploadTarget[]; rejected: Rejected[] }>>
  finalize: (items: UploadedItem[]) => Promise<FormResult<{ added: number; rejected: Rejected[] }>>
}

/** Chosen files only: browsers send one empty, nameless File when nothing was picked. */
export function takeFiles(formData: FormData): File[] {
  const files = formData
    .getAll('files')
    .filter((v): v is File => typeof v !== 'string')
    .filter((f) => !(f.size === 0 && f.name === ''))
  // File bytes never go through a server action; they go straight to storage.
  formData.delete('files')
  return files
}

/** The files that were not attached, and whether the firm's storage being full was why. */
export type UploadOutcome = { failed: string[]; storageFull: boolean }

/**
 * Sends the files straight to storage with signed upload targets, then has the server check
 * and attach them. Reports the names of the files that were not attached; never throws.
 */
export async function uploadFiles(files: File[], actions: UploadActions): Promise<UploadOutcome> {
  const done = (failed: string[], storageFull = false): UploadOutcome => ({ failed, storageFull })
  if (files.length === 0) return done([])
  const all = files.map((f) => displayFileName(f.name))
  try {
    const declared = files.map((f) => ({ name: f.name, size: f.size }))
    const t = await actions.createTargets(declared)
    if (!t.ok) return done(all, t.error === STORAGE_FULL)
    const failed = t.data.rejected.map((r) => r.name)
    const storage = createBrowserDb().storage.from('firm-files')
    const items: UploadedItem[] = []
    for (const target of t.data.targets) {
      const file = files[target.index]
      const up = await storage.uploadToSignedUrl(target.uploadPath, target.token, file, {
        contentType: file.type || 'application/octet-stream',
      })
      if (up.error) failed.push(displayFileName(file.name))
      else items.push({ uploadPath: target.uploadPath, name: file.name })
    }
    if (items.length === 0) return done(failed)
    const fin = await actions.finalize(items)
    if (!fin.ok) return done([...failed, ...items.map((i) => displayFileName(i.name))])
    return done([...failed, ...fin.data.rejected.map((r) => r.name)])
  } catch (e) {
    console.error('file upload failed', e)
    return done(all)
  }
}

/** The file types the server accepts (it still checks each file's signature). */
export const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.heic,application/pdf,image/png,image/jpeg,image/heic'
