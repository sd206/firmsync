import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import { STORAGE_FULL, storageLevel, type StorageLevel } from '@/lib/domain/storage'
import { fail, ok, type Result } from '@/lib/result'

export { STORAGE_FULL }
export const PAGE_SIZE = 50

export type StorageKind =
  | 'payment'
  | 'expense'
  | 'vendor_bill'
  | 'vendor_payment'
  | 'bill_inbox'
  | 'invoice_pdf'
  | 'logo'
  | 'other'

export const STORAGE_KINDS: StorageKind[] = [
  'payment',
  'expense',
  'vendor_bill',
  'vendor_payment',
  'bill_inbox',
  'invoice_pdf',
  'logo',
  'other',
]

export type StorageStatus = { used: number; allowance: number; level: StorageLevel }

export type StorageFile = {
  path: string
  kind: StorageKind
  attachmentId: string | null
  ownerId: string | null
  /** The record whose page shows this file (the invoice for a payment, the bill for a vendor payment). */
  recordId: string | null
  fileName: string
  sizeBytes: number
  createdAt: string | null
  label: string
}

export async function getStorageStatus(db: SupabaseClient, firmId: string): Promise<Result<StorageStatus>> {
  const { data, error } = await db.rpc('firm_storage_status', { p_firm: firmId })
  if (error) return fail(mapDbError(error))
  const row = (data as { used_bytes: number | string; allowance_bytes: number | string }[] | null)?.[0]
  if (!row) return fail(mapDbError(null))
  const used = Number(row.used_bytes)
  const allowance = Number(row.allowance_bytes)
  return ok({ used, allowance, level: storageLevel(used, allowance) })
}

export async function getStorageBreakdown(
  db: SupabaseClient,
  firmId: string,
): Promise<Result<{ kind: StorageKind; files: number; bytes: number }[]>> {
  const { data, error } = await db.rpc('firm_storage_breakdown', { p_firm: firmId })
  if (error) return fail(mapDbError(error))
  const rows = (data ?? []) as { kind: StorageKind; files: number; bytes: number | string }[]
  return ok(rows.map((r) => ({ kind: r.kind, files: Number(r.files), bytes: Number(r.bytes) })))
}

export async function listStorageFiles(
  db: SupabaseClient,
  firmId: string,
  opts: { kind: StorageKind | null; sort: 'largest' | 'oldest'; page: number },
): Promise<Result<{ rows: StorageFile[]; total: number }>> {
  const page = Math.max(1, Math.floor(opts.page) || 1)
  const { data, error } = await db.rpc('firm_storage_files', {
    p_firm: firmId,
    p_kind: opts.kind,
    p_sort: opts.sort,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  })
  if (error) return fail(mapDbError(error))
  type Row = {
    path: string
    kind: StorageKind
    attachment_id: string | null
    owner_id: string | null
    record_id: string | null
    file_name: string
    size_bytes: number | string
    created_at: string | null
    label: string
    total_count: number | string
  }
  const rows = (data ?? []) as Row[]
  return ok({
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    rows: rows.map((r) => ({
      path: r.path,
      kind: r.kind,
      attachmentId: r.attachment_id,
      ownerId: r.owner_id,
      recordId: r.record_id,
      fileName: r.file_name,
      sizeBytes: Number(r.size_bytes),
      createdAt: r.created_at,
      label: r.label,
    })),
  })
}

/**
 * Refuses when storing `bytes` more would take the firm past its allowance, or it is already full.
 * A failed lookup is logged and allowed: a database hiccup never blocks work.
 */
export async function ensureRoomFor(db: SupabaseClient, firmId: string, bytes: number): Promise<Result<void>> {
  const status = await getStorageStatus(db, firmId)
  if (!status.ok) {
    console.error('storage status lookup failed; allowing the upload', status.error)
    return ok(undefined)
  }
  const { used, allowance } = status.data
  if (used >= allowance || used + Math.max(0, bytes) > allowance) return fail(STORAGE_FULL)
  return ok(undefined)
}
