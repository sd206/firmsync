import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { adminDb, type newFirm } from './helpers'

type Firm = Awaited<ReturnType<typeof newFirm>>

const PDF = path.resolve(__dirname, '../e2e/fixtures/remittance.pdf')

/** The firm's current inbox address, created (enabled) with the service role when missing. */
export async function inboxAddress(f: Firm): Promise<{ id: string; code: string }> {
  const db = adminDb()
  const { data } = await db.from('bill_inbox_addresses').select('id, code').eq('firm_id', f.firmId).is('replaced_at', null).maybeSingle()
  if (data) return data as { id: string; code: string }
  const code = randomUUID().replace(/-/g, '').slice(0, 10)
  const { data: row, error } = await db
    .from('bill_inbox_addresses')
    .insert({ firm_id: f.firmId, code, enabled: true })
    .select('id, code')
    .single()
  if (error || !row) throw new Error(`address insert failed: ${error?.message}`)
  return row as { id: string; code: string }
}

/**
 * Seeds one inbox item with `files` PDF attachments (service role). With `upload`, the fixture PDF
 * is also put in storage at each attachment's path.
 */
export async function seedInboxItem(
  f: Firm,
  o: { from?: string; subject?: string; files?: number; vendorId?: string | null; upload?: boolean; fileNames?: string[]; receivedAt?: string } = {},
): Promise<{ itemId: string; attachmentIds: string[]; addressId: string }> {
  const db = adminDb()
  const addr = await inboxAddress(f)
  const { data: item, error } = await db
    .from('bill_inbox_items')
    .insert({
      firm_id: f.firmId,
      address_id: addr.id,
      resend_email_id: randomUUID(),
      from_address: o.from ?? 'ap@acme.test',
      to_address: `bills-${addr.code}@test.resend.app`,
      subject: o.subject ?? 'Invoice INV-4471',
      received_at: o.receivedAt ?? new Date().toISOString(),
      vendor_id: o.vendorId ?? null,
      sender_kind: o.vendorId ? 'vendor' : 'unknown',
    })
    .select('id')
    .single()
  if (error || !item) throw new Error(`item insert failed: ${error?.message}`)
  const itemId = (item as { id: string }).id
  const attachmentIds: string[] = []
  const count = o.files ?? 1
  for (let i = 0; i < count; i++) {
    const storagePath = `firms/${f.firmId}/attachments/bill-inbox/${itemId}/${randomUUID()}.pdf`
    if (o.upload) {
      const up = await db.storage.from('firm-files').upload(storagePath, readFileSync(PDF), { contentType: 'application/pdf' })
      if (up.error) throw new Error(`upload failed: ${up.error.message}`)
    }
    const { data: att, error: aErr } = await db
      .from('attachments')
      .insert({
        firm_id: f.firmId,
        bill_inbox_item_id: itemId,
        storage_path: storagePath,
        file_name: o.fileNames?.[i] ?? (count === 1 ? 'remittance.pdf' : `bill-${i + 1}.pdf`),
        mime_type: 'application/pdf',
        size_bytes: 1000,
      })
      .select('id')
      .single()
    if (aErr || !att) throw new Error(`attachment insert failed: ${aErr?.message}`)
    attachmentIds.push((att as { id: string }).id)
  }
  return { itemId, attachmentIds, addressId: addr.id }
}
