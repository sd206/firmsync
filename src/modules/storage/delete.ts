import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import { fail, ok, type Result } from '@/lib/result'
import { deleteAttachment, type Owner } from '@/modules/attachments/storage'

export const CANT_DELETE_HERE = "This file can't be deleted here."
export const MAX_DELETE = 100
const TOO_MANY = 'Delete at most 100 files at a time.'
const NOT_ADMIN = "You don't have permission to do that."
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = {
  id: string
  file_name: string
  payment_id: string | null
  expense_id: string | null
  vendor_bill_id: string | null
  vendor_payment_id: string | null
  bill_inbox_item_id: string | null
}

function ownerOf(r: Row): Owner | null {
  if (r.payment_id) return { kind: 'payment', id: r.payment_id }
  if (r.expense_id) return { kind: 'expense', id: r.expense_id }
  if (r.vendor_bill_id) return { kind: 'vendor_bill', id: r.vendor_bill_id }
  if (r.vendor_payment_id) return { kind: 'vendor_payment', id: r.vendor_payment_id }
  return null // Bill-inbox files are handled from the inbox.
}

/**
 * Deletes the firm's attachments by id, each under its own record's rules (as the user).
 * Bill-inbox files, invoice PDFs, the logo, other firms' files and unknown ids are reported, not deleted.
 * Only admins may delete here (managers delete files on each record instead).
 */
export async function deleteStorageFiles(
  db: SupabaseClient,
  firmId: string,
  ids: string[],
): Promise<Result<{ deleted: number; failed: { name: string; error: string }[] }>> {
  if (!Array.isArray(ids)) return fail(CANT_DELETE_HERE)
  if (ids.length > MAX_DELETE) return fail(TOO_MANY)
  const admin = await db.rpc('has_role', { p_firm: firmId, p_roles: ['admin'] })
  if (admin.error) return fail(mapDbError(admin.error))
  if (admin.data !== true) return fail(NOT_ADMIN)
  const valid = ids.filter((id) => typeof id === 'string' && UUID_RE.test(id))
  const rows = new Map<string, Row>()
  if (valid.length > 0) {
    const { data, error } = await db
      .from('attachments')
      .select('id, file_name, payment_id, expense_id, vendor_bill_id, vendor_payment_id, bill_inbox_item_id')
      .eq('firm_id', firmId)
      .in('id', valid)
    if (error) return fail(mapDbError(error))
    for (const r of (data ?? []) as Row[]) rows.set(r.id, r)
  }

  let deleted = 0
  const failed: { name: string; error: string }[] = []
  for (const id of ids) {
    const row = typeof id === 'string' ? rows.get(id) : undefined
    const owner = row ? ownerOf(row) : null
    if (!row || !owner) {
      failed.push({ name: row?.file_name ?? 'File', error: CANT_DELETE_HERE })
      continue
    }
    const r = await deleteAttachment(db, firmId, owner, id)
    if (r.ok) deleted += 1
    else failed.push({ name: row.file_name, error: r.error })
  }
  return ok({ deleted, failed })
}
