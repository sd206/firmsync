import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { displayFileName, validateAttachment } from '@/lib/domain/attachments'
import type { ResendReceiving } from './resend'
import { bareAddress, classifySender, codesFor } from './route-mail'

export const MAX_FILES_PER_EMAIL = 10
const BUCKET = 'firm-files'
const TOO_MANY = 'Too many files in one email'

export type InboundEvent = {
  email_id: string
  from: string
  to: string[]
  received_for?: string[]
  subject?: string | null
  created_at: string
}

export type ReceiveDeps = {
  /** Service-role client: the webhook has no user. */
  db: SupabaseClient
  resend: ResendReceiving
  domains: string[]
  fetchFile: (url: string) => Promise<Uint8Array>
  log: (line: string) => void
}

type Address = { id: string; firm_id: string; code: string; enabled: boolean; unknown_sender: 'hold' | 'drop'; replaced_at: string | null }

async function senderFor(db: SupabaseClient, firmId: string, from: string) {
  const [vendors, members] = await Promise.all([
    db.from('vendors').select('id, email').eq('firm_id', firmId),
    db.from('firm_members').select('user_id').eq('firm_id', firmId),
  ])
  if (vendors.error) throw new Error(`vendors: ${vendors.error.message}`)
  if (members.error) throw new Error(`members: ${members.error.message}`)
  const ids = ((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id)
  const profiles = ids.length
    ? await db.from('profiles').select('email, display_name').in('user_id', ids)
    : { data: [], error: null }
  if (profiles.error) throw new Error(`profiles: ${profiles.error.message}`)
  return classifySender(
    from,
    (vendors.data ?? []) as { id: string; email: string | null }[],
    ((profiles.data ?? []) as { email: string; display_name: string | null }[]).map((p) => ({ email: p.email, name: p.display_name })),
  )
}

/**
 * Downloads the email's attachments into the item's folder (up to 10 accepted files) and records
 * refused ones. Any download error marks the item `download_failed` and stops. Used on receipt and
 * by "Try again".
 */
export async function storeFiles(
  deps: Pick<ReceiveDeps, 'db' | 'resend' | 'fetchFile'>,
  item: { id: string; firmId: string; emailId: string },
): Promise<void> {
  const { db } = deps
  const rejected: { name: string; reason: string }[] = []
  let failed = false
  try {
    // Files are tracked by Resend's attachment id, so a retry fetches only what's missing.
    const { data: done } = await db.from('attachments').select('bill_inbox_source').eq('bill_inbox_item_id', item.id)
    const stored = (done ?? []) as { bill_inbox_source: string | null }[]
    let accepted = stored.length
    const have = new Set(stored.map((d) => d.bill_inbox_source))
    for (const att of await deps.resend.listAttachments(item.emailId)) {
      const name = displayFileName(att.filename)
      if (have.has(att.id)) continue
      if (accepted >= MAX_FILES_PER_EMAIL) {
        rejected.push({ name, reason: TOO_MANY })
        continue
      }
      const bytes = await deps.fetchFile(att.download_url)
      const info = validateAttachment({ name, type: att.content_type, size: bytes.length, bytes })
      if (!info.ok) {
        rejected.push({ name, reason: info.error })
        continue
      }
      const path = `firms/${item.firmId}/attachments/bill-inbox/${item.id}/${randomUUID()}.${info.data.ext}`
      const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: info.data.mime })
      if (up.error) throw new Error(`upload: ${up.error.message}`)
      const ins = await db.from('attachments').insert({
        firm_id: item.firmId,
        bill_inbox_item_id: item.id,
        storage_path: path,
        file_name: name,
        mime_type: info.data.mime,
        size_bytes: bytes.length,
        bill_inbox_source: att.id,
      })
      if (ins.error) {
        await db.storage.from(BUCKET).remove([path])
        // Another run stored this attachment at the same time: nothing to do.
        if (ins.error.code === '23505') continue
        throw new Error(`attachment: ${ins.error.message}`)
      }
      accepted += 1
      have.add(att.id)
    }
  } catch (e) {
    console.error('bill inbox file download failed', e)
    failed = true
  }
  const { error } = await db
    .from('bill_inbox_items')
    .update({ rejected_files: rejected, download_failed: failed })
    .eq('id', item.id)
  if (error) throw new Error(`item update: ${error.message}`)
}

/** Stores a received email for every firm whose bill address it was sent to. */
export async function receiveInbound(deps: ReceiveDeps, event: InboundEvent): Promise<{ stored: number }> {
  const { db } = deps
  const codes = codesFor([...(event.to ?? []), ...(event.received_for ?? [])], deps.domains)
  if (codes.length === 0) {
    deps.log(`bill-inbox: no bill address in recipients (email ${event.email_id})`)
    return { stored: 0 }
  }
  const { data, error } = await db
    .from('bill_inbox_addresses')
    .select('id, firm_id, code, enabled, unknown_sender, replaced_at')
    .in('code', codes)
  if (error) throw new Error(`addresses: ${error.message}`)
  const byCode = new Map(((data ?? []) as Address[]).map((a) => [a.code, a]))
  const from = bareAddress(event.from) ?? event.from.trim().toLowerCase()
  let stored = 0

  for (const code of codes) {
    const addr = byCode.get(code)
    if (!addr || !addr.enabled || addr.replaced_at) {
      deps.log(`bill-inbox: dropped mail to inactive address ${code} (email ${event.email_id})`)
      continue
    }
    const sender = await senderFor(db, addr.firm_id, event.from)
    if (sender.kind === 'unknown' && addr.unknown_sender === 'drop') {
      deps.log(`bill-inbox: dropped unknown sender for ${code} (email ${event.email_id})`)
      continue
    }
    const ins = await db
      .from('bill_inbox_items')
      .upsert(
        {
          firm_id: addr.firm_id,
          address_id: addr.id,
          resend_email_id: event.email_id,
          from_address: from,
          to_address: `bills-${code}`,
          subject: (event.subject ?? '').slice(0, 500),
          received_at: event.created_at,
          vendor_id: sender.kind === 'vendor' ? sender.vendorId : null,
          sender_kind: sender.kind,
          forwarded_by: sender.kind === 'member' ? sender.forwardedBy : null,
          // Stays true until the files are stored, so a run cut off midway shows "Try again".
          download_failed: true,
        },
        { onConflict: 'firm_id,resend_email_id', ignoreDuplicates: true },
      )
      .select('id')
    if (ins.error) throw new Error(`item: ${ins.error.message}`)
    const row = (ins.data ?? [])[0] as { id: string } | undefined
    if (row) {
      stored += 1
      await storeFiles(deps, { id: row.id, firmId: addr.firm_id, emailId: event.email_id })
      continue
    }
    // Resend retried an email we already have: finish its files if the first run didn't.
    const prev = await db
      .from('bill_inbox_items')
      .select('id, download_failed')
      .eq('firm_id', addr.firm_id)
      .eq('resend_email_id', event.email_id)
      .maybeSingle()
    if (prev.error) throw new Error(`item: ${prev.error.message}`)
    const p = prev.data as { id: string; download_failed: boolean } | null
    if (p?.download_failed) await storeFiles(deps, { id: p.id, firmId: addr.firm_id, emailId: event.email_id })
  }
  return { stored }
}
