'use server'

import { revalidatePath } from 'next/cache'
import { requireFirmRole } from '@/lib/auth/context'
import type { Result } from '@/lib/result'
import { deleteStorageFiles } from './delete'

/** Storage page: admins delete selected attachment files. */
export async function deleteStorageFilesAction(
  firmId: string,
  attachmentIds: string[],
): Promise<Result<{ deleted: number; failed: { name: string; error: string }[] }>> {
  const { db } = await requireFirmRole(firmId, ['admin'])
  const r = await deleteStorageFiles(db, firmId, attachmentIds)
  if (r.ok && r.data.deleted > 0) {
    revalidatePath(`/f/${firmId}/settings/storage`)
    revalidatePath(`/f/${firmId}`, 'layout')
  }
  return r
}
