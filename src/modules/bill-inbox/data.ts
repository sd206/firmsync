import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import { fail, ok, type Result } from '@/lib/result'
import { createAdminDb } from '@/lib/supabase/admin'
import { possibleDuplicate } from './route-mail'

export type InboxTab = 'new' | 'bill_created' | 'ignored' | 'duplicate'
export type UnknownSender = 'hold' | 'drop'
export type InboxEnv = { configured: boolean; domains: string[] }

export const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'bill_created', label: 'Bills created' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'duplicate', label: 'Duplicates' },
]

const FILE_NOT_FOUND = 'File not found.'
const ITEM_NOT_FOUND = 'Email not found.'
const BUCKET = 'firm-files'
const LIST_LIMIT = 200
const DAY = 24 * 60 * 60 * 1000

export type InboxSettings = { configured: boolean; address: string | null; enabled: boolean; unknownSender: UnknownSender }

export async function getInboxSettings(db: SupabaseClient, firmId: string, env: InboxEnv): Promise<Result<InboxSettings>> {
  const { data, error } = await db
    .from('bill_inbox_addresses')
    .select('code, enabled, unknown_sender')
    .eq('firm_id', firmId)
    .is('replaced_at', null)
    .maybeSingle()
  if (error) return fail(mapDbError(error))
  const row = data as { code: string; enabled: boolean; unknown_sender: UnknownSender } | null
  const domain = env.domains[0]
  return ok({
    configured: env.configured && !!domain,
    address: row && domain ? `bills-${row.code}@${domain}` : null,
    enabled: row?.enabled ?? false,
    unknownSender: row?.unknown_sender ?? 'hold',
  })
}

async function addressRpc(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Result<void>> {
  const { error } = await db.rpc(fn, args)
  return error ? fail(mapDbError(error)) : ok(undefined)
}

export const enableInbox = (db: SupabaseClient, firmId: string) => addressRpc(db, 'bill_inbox_enable', { p_firm: firmId })
export const disableInbox = (db: SupabaseClient, firmId: string) => addressRpc(db, 'bill_inbox_disable', { p_firm: firmId })
export const replaceInbox = (db: SupabaseClient, firmId: string) => addressRpc(db, 'bill_inbox_replace', { p_firm: firmId })
export const setUnknownSender = (db: SupabaseClient, firmId: string, mode: UnknownSender) =>
  addressRpc(db, 'bill_inbox_set_unknown', { p_firm: firmId, p_mode: mode })

export type InboxFile = { id: string; fileName: string; billId: string | null; billNumber: string | null }

export type InboxRow = {
  id: string
  receivedAt: string
  fromAddress: string
  senderKind: 'vendor' | 'member' | 'known' | 'unknown'
  vendorId: string | null
  vendorName: string | null
  forwardedBy: string | null
  subject: string
  files: InboxFile[]
  rejectedFiles: { name: string; reason: string }[]
  downloadFailed: boolean
  possibleDuplicate: boolean
  note: string | null
  status: InboxTab
}

type ItemDb = {
  id: string
  received_at: string
  from_address: string
  sender_kind: InboxRow['senderKind']
  vendor_id: string | null
  forwarded_by: string | null
  subject: string
  rejected_files: { name: string; reason: string }[] | null
  download_failed: boolean
  note: string | null
  status: InboxTab
  vendors: { name: string } | null
  attachments: { id: string; file_name: string; created_at: string }[] | null
  bill_inbox_bills: { attachment_id: string; bill_id: string; vendor_bills: { bill_number: string } | null }[] | null
}

const ITEM_COLS =
  'id, received_at, from_address, sender_kind, vendor_id, forwarded_by, subject, rejected_files, download_failed, note, status, ' +
  'vendors(name), attachments!attachments_bill_inbox_item_fk(id, file_name, created_at), ' +
  'bill_inbox_bills(attachment_id, bill_id, vendor_bills(bill_number))'

export async function listInbox(db: SupabaseClient, firmId: string, tab: InboxTab): Promise<Result<InboxRow[]>> {
  const { data, error } = await db
    .from('bill_inbox_items')
    .select(ITEM_COLS)
    .eq('firm_id', firmId)
    .eq('status', tab)
    .order('received_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) return fail(mapDbError(error))
  const items = (data ?? []) as unknown as ItemDb[]
  if (items.length === 0) return ok([])

  // History for the duplicate hint: this firm's emails from 60 days before the oldest one listed.
  const oldest = items.reduce((m, i) => (i.received_at < m ? i.received_at : m), items[0].received_at)
  const since = new Date(Date.parse(oldest) - 60 * DAY).toISOString()
  const vendorIds = [...new Set(items.flatMap((i) => (i.vendor_id ? [i.vendor_id] : [])))]
  const [hist, bills] = await Promise.all([
    db
      .from('bill_inbox_items')
      .select('from_address, received_at, attachments!attachments_bill_inbox_item_fk(file_name)')
      .eq('firm_id', firmId)
      .gte('received_at', since)
      .limit(2000),
    vendorIds.length
      ? db.from('vendor_bills').select('vendor_id, bill_number').eq('firm_id', firmId).in('vendor_id', vendorIds).neq('status', 'void')
      : Promise.resolve({ data: [], error: null }),
  ])
  if (hist.error) return fail(mapDbError(hist.error))
  if (bills.error) return fail(mapDbError(bills.error))
  const history = ((hist.data ?? []) as unknown as { from_address: string; received_at: string; attachments: { file_name: string }[] | null }[]).map(
    (h) => ({ fromAddress: h.from_address, receivedAt: h.received_at, fileNames: (h.attachments ?? []).map((a) => a.file_name) }),
  )
  const numbersByVendor = new Map<string, string[]>()
  for (const b of (bills.data ?? []) as { vendor_id: string; bill_number: string }[]) {
    numbersByVendor.set(b.vendor_id, [...(numbersByVendor.get(b.vendor_id) ?? []), b.bill_number])
  }

  return ok(
    items.map((i) => {
      const links = new Map((i.bill_inbox_bills ?? []).map((l) => [l.attachment_id, l]))
      const files = [...(i.attachments ?? [])]
        .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
        .map((a) => {
          const l = links.get(a.id)
          return { id: a.id, fileName: a.file_name, billId: l?.bill_id ?? null, billNumber: l?.vendor_bills?.bill_number ?? null }
        })
      return {
        id: i.id,
        receivedAt: i.received_at,
        fromAddress: i.from_address,
        senderKind: i.sender_kind,
        vendorId: i.vendor_id,
        vendorName: i.vendors?.name ?? null,
        forwardedBy: i.forwarded_by,
        subject: i.subject,
        files,
        rejectedFiles: i.rejected_files ?? [],
        downloadFailed: i.download_failed,
        possibleDuplicate: possibleDuplicate(
          { fromAddress: i.from_address, receivedAt: i.received_at, fileNames: files.map((f) => f.fileName) },
          history,
          i.vendor_id ? (numbersByVendor.get(i.vendor_id) ?? []) : [],
        ),
        note: i.note,
        status: i.status,
      }
    }),
  )
}

/** New emails waiting in the inbox (0 when it can't be read). */
export async function newInboxCount(db: SupabaseClient, firmId: string): Promise<number> {
  const { count, error } = await db
    .from('bill_inbox_items')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmId)
    .eq('status', 'new')
  if (error) {
    console.error('inbox count failed', error)
    return 0
  }
  return count ?? 0
}

export async function ensureItemInFirm(db: SupabaseClient, firmId: string, itemId: string): Promise<Result<{ resendEmailId: string }>> {
  const { data, error } = await db
    .from('bill_inbox_items')
    .select('resend_email_id')
    .eq('firm_id', firmId)
    .eq('id', itemId)
    .maybeSingle()
  if (error) return fail(mapDbError(error))
  return data ? ok({ resendEmailId: (data as { resend_email_id: string }).resend_email_id }) : fail(ITEM_NOT_FOUND)
}

export async function setInboxStatus(
  db: SupabaseClient,
  firmId: string,
  itemId: string,
  status: InboxTab,
  note: string | null,
): Promise<Result<void>> {
  const scope = await ensureItemInFirm(db, firmId, itemId)
  if (!scope.ok) return scope
  const { error } = await db.rpc('bill_inbox_set_status', { p_item: itemId, p_status: status, p_note: note })
  return error ? fail(mapDbError(error)) : ok(undefined)
}

export type InboxFileForBill = { attachmentId: string; fileName: string; itemId: string; vendorId: string | null }

/** An inbox file of this firm, for prefilling a new bill. */
export async function inboxFileForBill(db: SupabaseClient, firmId: string, attachmentId: string): Promise<Result<InboxFileForBill>> {
  const { data, error } = await db
    .from('attachments')
    .select('id, file_name, bill_inbox_item_id')
    .eq('firm_id', firmId)
    .eq('id', attachmentId)
    .not('bill_inbox_item_id', 'is', null)
    .maybeSingle()
  if (error) return fail(mapDbError(error))
  if (!data) return fail(FILE_NOT_FOUND)
  const a = data as { id: string; file_name: string; bill_inbox_item_id: string }
  const item = await db.from('bill_inbox_items').select('vendor_id').eq('firm_id', firmId).eq('id', a.bill_inbox_item_id).maybeSingle()
  if (item.error) return fail(mapDbError(item.error))
  if (!item.data) return fail(FILE_NOT_FOUND)
  return ok({
    attachmentId: a.id,
    fileName: a.file_name,
    itemId: a.bill_inbox_item_id,
    vendorId: (item.data as { vendor_id: string | null }).vendor_id,
  })
}

/**
 * Copies an inbox file into the bill's folder, registers it on the bill and links the two.
 * Checks are made with the user's client; only the storage copy uses the service role.
 */
export async function attachInboxFileToBill(
  db: SupabaseClient,
  firmId: string,
  billId: string,
  attachmentId: string,
): Promise<Result<void>> {
  const file = await inboxFileForBill(db, firmId, attachmentId)
  if (!file.ok) return file
  const { data: src, error: srcErr } = await db
    .from('attachments')
    .select('storage_path, file_name, mime_type, size_bytes')
    .eq('firm_id', firmId)
    .eq('id', attachmentId)
    .single()
  if (srcErr) return fail(mapDbError(srcErr))
  const s = src as { storage_path: string; file_name: string; mime_type: string; size_bytes: number }
  if (!s.storage_path.startsWith(`firms/${firmId}/attachments/bill-inbox/`)) return fail(FILE_NOT_FOUND)
  const ext = s.storage_path.slice(s.storage_path.lastIndexOf('.') + 1)
  const dest = `firms/${firmId}/attachments/vendor-bills/${billId}/${randomUUID()}.${ext}`
  const storage = createAdminDb().storage.from(BUCKET)
  const cp = await storage.copy(s.storage_path, dest)
  if (cp.error) {
    console.error('inbox file copy failed', cp.error)
    return fail("The inbox file couldn't be attached.")
  }
  const reg = await db.rpc('add_vendor_attachment', {
    p_owner_kind: 'bill',
    p_owner: billId,
    p_storage_path: dest,
    p_file_name: s.file_name,
    p_mime: s.mime_type,
    p_size: s.size_bytes,
  })
  if (reg.error) {
    await storage.remove([dest])
    return fail(mapDbError(reg.error))
  }
  const link = await db.rpc('bill_inbox_link_bill', { p_item: file.data.itemId, p_attachment: attachmentId, p_bill: billId })
  return link.error ? fail(mapDbError(link.error)) : ok(undefined)
}
