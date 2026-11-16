'use server'

import { revalidatePath } from 'next/cache'
import { requireFirmRole } from '@/lib/auth/context'
import { fail, type Result } from '@/lib/result'
import { createAdminDb } from '@/lib/supabase/admin'
import {
  disableInbox,
  enableInbox,
  ensureItemInFirm,
  replaceInbox,
  setInboxStatus,
  setUnknownSender,
  type InboxTab,
  type UnknownSender,
} from './data'
import { storeFiles } from './receive'
import { fetchFile, resendReceiving } from './resend'

const MANAGERS = ['admin', 'manager'] as const
const ADMIN = ['admin'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES: InboxTab[] = ['new', 'bill_created', 'ignored', 'duplicate']

function revalidate(firmId: string) {
  revalidatePath(`/f/${firmId}`, 'layout')
}

async function settingsAction(firmId: string, run: (db: Awaited<ReturnType<typeof requireFirmRole>>['db']) => Promise<Result<void>>) {
  const { db } = await requireFirmRole(firmId, [...ADMIN])
  const r = await run(db)
  if (r.ok) revalidatePath(`/f/${firmId}/settings`)
  return r
}

export async function enableInboxAction(firmId: string): Promise<Result<void>> {
  return settingsAction(firmId, (db) => enableInbox(db, firmId))
}

export async function disableInboxAction(firmId: string): Promise<Result<void>> {
  return settingsAction(firmId, (db) => disableInbox(db, firmId))
}

export async function replaceInboxAction(firmId: string): Promise<Result<void>> {
  return settingsAction(firmId, (db) => replaceInbox(db, firmId))
}

export async function setUnknownSenderAction(firmId: string, mode: UnknownSender): Promise<Result<void>> {
  if (mode !== 'hold' && mode !== 'drop') return fail('Choose what happens to unknown senders.')
  return settingsAction(firmId, (db) => setUnknownSender(db, firmId, mode))
}

export async function setInboxStatusAction(
  firmId: string,
  itemId: string,
  status: InboxTab,
  note: string | null,
): Promise<Result<void>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  if (!UUID.test(itemId) || !STATUSES.includes(status)) return fail('Email not found.')
  const r = await setInboxStatus(db, firmId, itemId, status, note?.trim().slice(0, 1000) || null)
  revalidate(firmId)
  return r
}

/** Downloads the email's files again (fresh links from Resend) after a failed download. */
export async function retryDownloadAction(firmId: string, itemId: string): Promise<Result<void>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  if (!UUID.test(itemId)) return fail('Email not found.')
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return fail("Bill inbox isn't set up on this server yet.")
  const scope = await ensureItemInFirm(db, firmId, itemId)
  if (!scope.ok) return scope
  const admin = createAdminDb()
  await storeFiles({ db: admin, resend: resendReceiving(apiKey), fetchFile }, { id: itemId, firmId, emailId: scope.data.resendEmailId })
  const { data } = await admin.from('bill_inbox_items').select('download_failed').eq('id', itemId).single()
  revalidate(firmId)
  return (data as { download_failed: boolean } | null)?.download_failed
    ? fail("The files still couldn't be downloaded. Try again later.")
    : { ok: true, data: undefined }
}
