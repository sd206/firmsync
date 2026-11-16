import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResendReceiving } from '@/modules/bill-inbox/resend'
import { receiveInbound, storeFiles } from '@/modules/bill-inbox/receive'
import { adminDb, newFirm } from './helpers'
import { inboxAddress } from './bill-inbox-fixtures'

const DOMAIN = 'test.resend.app'
const PDF = new Uint8Array(readFileSync(path.resolve(__dirname, '../e2e/fixtures/remittance.pdf')))

type Firm = Awaited<ReturnType<typeof newFirm>>
type Att = { id: string; filename: string; content_type: string; download_url: string }

function setup(files: { name: string; bytes?: Uint8Array }[] = [{ name: 'INV-4471.pdf' }], opts: { failFetch?: boolean } = {}) {
  const lines: string[] = []
  const atts: Att[] = files.map((f, i) => ({ id: `a${i}`, filename: f.name, content_type: 'application/pdf', download_url: `https://files.test/${i}` }))
  const resend: ResendReceiving = {
    listAttachments: async () => atts,
  }
  const fetchFile = async (url: string) => {
    if (opts.failFetch) throw new Error('network')
    const i = Number(url.split('/').pop())
    return files[i].bytes ?? PDF
  }
  const deps = { db: adminDb(), resend, domains: [DOMAIN], fetchFile, log: (l: string) => lines.push(l) }
  return { deps, lines }
}

const event = (to: string[], from = 'ap@acme.test', id = randomUUID()) => ({
  email_id: id,
  from,
  to,
  subject: 'Invoice INV-4471',
  created_at: '2026-11-16T09:00:00.000Z',
})

async function items(f: Firm) {
  const { data } = await adminDb()
    .from('bill_inbox_items')
    .select('id, from_address, subject, received_at, vendor_id, sender_kind, forwarded_by, rejected_files, download_failed, status')
    .eq('firm_id', f.firmId)
  return data ?? []
}

async function filesOf(itemId: string) {
  const { data } = await adminDb().from('attachments').select('storage_path, file_name').eq('bill_inbox_item_id', itemId)
  return data ?? []
}

describe('receiveInbound', () => {
  it('stores the email for the firm by code, with its file in storage', async () => {
    const f = await newFirm('Receive Basic')
    const a = await inboxAddress(f)
    const { deps } = setup()
    const r = await receiveInbound(deps, event([`"Bills" <bills-${a.code}@${DOMAIN.toUpperCase()}>`]))
    expect(r.stored).toBe(1)
    const [it1] = await items(f)
    expect(it1).toMatchObject({ from_address: 'ap@acme.test', subject: 'Invoice INV-4471', sender_kind: 'unknown', status: 'new', download_failed: false })
    expect(it1.received_at).toContain('2026-11-16')
    const fl = await filesOf(it1.id)
    expect(fl).toHaveLength(1)
    expect(fl[0].file_name).toBe('INV-4471.pdf')
    const dl = await adminDb().storage.from('firm-files').download(fl[0].storage_path)
    expect(dl.error).toBeNull()
  })

  it('ignores Resend retries of the same email but keeps a second email that looks the same', async () => {
    const f = await newFirm('Receive Retry')
    const a = await inboxAddress(f)
    const { deps } = setup()
    const e = event([`bills-${a.code}@${DOMAIN}`])
    await receiveInbound(deps, e)
    expect((await receiveInbound(deps, e)).stored).toBe(0)
    await receiveInbound(deps, { ...e, email_id: randomUUID() })
    expect(await items(f)).toHaveLength(2)
  })

  it('drops mail to disabled or replaced addresses, logging the code and email id', async () => {
    const f = await newFirm('Receive Disabled')
    const on = await f.admin.db.rpc('bill_inbox_enable', { p_firm: f.firmId })
    const code = (on.data as { code: string }).code
    await f.admin.db.rpc('bill_inbox_disable', { p_firm: f.firmId })
    const { deps, lines } = setup()
    const e = event([`bills-${code}@${DOMAIN}`])
    expect((await receiveInbound(deps, e)).stored).toBe(0)
    expect(lines.join('\n')).toContain(code)
    expect(lines.join('\n')).toContain(e.email_id)

    await f.admin.db.rpc('bill_inbox_enable', { p_firm: f.firmId })
    await f.admin.db.rpc('bill_inbox_replace', { p_firm: f.firmId })
    expect((await receiveInbound(deps, event([`bills-${code}@${DOMAIN}`]))).stored).toBe(0)
    expect(await items(f)).toHaveLength(0)
  })

  it('holds or drops unknown senders per the firm setting; matches vendors and members', async () => {
    const f = await newFirm('Receive Senders')
    const on = await f.admin.db.rpc('bill_inbox_enable', { p_firm: f.firmId })
    const to = [`bills-${(on.data as { code: string }).code}@${DOMAIN}`]
    const { data: v } = await adminDb().from('vendors').insert({ firm_id: f.firmId, name: 'Acme Staffing', email: 'AP@acme.test' }).select('id').single()
    const { deps } = setup()
    await receiveInbound(deps, event(to, '"Acme" <ap@acme.test>'))
    await receiveInbound(deps, event(to, f.manager.email))
    await receiveInbound(deps, event(to, 'stranger@x.test'))
    const rows = await items(f)
    expect(rows.find((r) => r.vendor_id === v!.id)?.sender_kind).toBe('vendor')
    expect(rows.find((r) => r.sender_kind === 'member')?.forwarded_by).toBe(f.manager.email)
    expect(rows.filter((r) => r.sender_kind === 'unknown')).toHaveLength(1)

    await f.admin.db.rpc('bill_inbox_set_unknown', { p_firm: f.firmId, p_mode: 'drop' })
    expect((await receiveInbound(deps, event(to, 'stranger2@x.test'))).stored).toBe(0)
  })

  it('lists files it refuses, and keeps at most 10', async () => {
    const f = await newFirm('Receive Files')
    const a = await inboxAddress(f)
    const bad = setup([{ name: 'notes.pdf', bytes: new TextEncoder().encode('not a pdf') }])
    await receiveInbound(bad.deps, event([`bills-${a.code}@${DOMAIN}`]))
    const many = setup(Array.from({ length: 12 }, (_, i) => ({ name: `b${i}.pdf` })))
    await receiveInbound(many.deps, event([`bills-${a.code}@${DOMAIN}`]))
    const rows = await items(f)
    const refused = rows.find((r) => (r.rejected_files as unknown[]).length === 1 && (r.rejected_files as { name: string }[])[0].name === 'notes.pdf')
    expect(refused).toBeTruthy()
    expect(await filesOf(refused!.id)).toHaveLength(0)
    const big = rows.find((r) => r.id !== refused!.id)!
    expect(await filesOf(big.id)).toHaveLength(10)
    expect(big.rejected_files).toEqual([
      { name: 'b10.pdf', reason: 'Too many files in one email' },
      { name: 'b11.pdf', reason: 'Too many files in one email' },
    ])
  })

  it('keeps the item when downloads fail', async () => {
    const f = await newFirm('Receive Failing')
    const a = await inboxAddress(f)
    const { deps } = setup([{ name: 'x.pdf' }], { failFetch: true })
    expect((await receiveInbound(deps, event([`bills-${a.code}@${DOMAIN}`]))).stored).toBe(1)
    expect((await items(f))[0].download_failed).toBe(true)
  })

  it('keeps two attachments with the same name', async () => {
    const f = await newFirm('Receive Same Name')
    const a = await inboxAddress(f)
    const { deps } = setup([{ name: 'invoice.pdf' }, { name: 'invoice.pdf' }])
    await receiveInbound(deps, event([`bills-${a.code}@${DOMAIN}`]))
    const [row] = await items(f)
    expect(await filesOf(row.id)).toHaveLength(2)
    expect(row.rejected_files).toEqual([])
  })

  it('marks an email as not downloaded until its files are stored, and a Resend retry finishes the job', async () => {
    const f = await newFirm('Receive Recover')
    const a = await inboxAddress(f)
    const e = event([`bills-${a.code}@${DOMAIN}`])
    let seenDuringDownload: boolean | null = null
    const first = setup()
    const slowFetch = first.deps.fetchFile
    first.deps.fetchFile = async (url: string) => {
      const { data } = await adminDb().from('bill_inbox_items').select('download_failed').eq('firm_id', f.firmId).single()
      seenDuringDownload = (data as { download_failed: boolean }).download_failed
      return slowFetch(url)
    }
    await receiveInbound(first.deps, e)
    expect(seenDuringDownload).toBe(true)
    expect((await items(f))[0].download_failed).toBe(false)

    // A run cut off after the item was saved: no files yet, still marked as not downloaded.
    const g = await newFirm('Receive Recover Cut')
    const b = await inboxAddress(g)
    const cut = event([`bills-${b.code}@${DOMAIN}`])
    await adminDb().from('bill_inbox_items').insert({
      firm_id: g.firmId, address_id: b.id, resend_email_id: cut.email_id, from_address: 'ap@acme.test', to_address: `bills-${b.code}`,
      subject: 'Cut off', received_at: cut.created_at, sender_kind: 'unknown', download_failed: true,
    })
    const { deps } = setup()
    expect((await receiveInbound(deps, cut)).stored).toBe(0)
    const [row] = await items(g)
    expect(row.download_failed).toBe(false)
    expect(await filesOf(row.id)).toHaveLength(1)
  })

  it('stores each file once even when two retries run at the same time', async () => {
    const f = await newFirm('Receive Concurrent')
    const a = await inboxAddress(f)
    const { deps } = setup([{ name: 'a.pdf' }, { name: 'b.pdf' }], { failFetch: true })
    const e = event([`bills-${a.code}@${DOMAIN}`])
    await receiveInbound(deps, e)
    const [row] = await items(f)
    const ok = setup([{ name: 'a.pdf' }, { name: 'b.pdf' }])
    await Promise.all([
      storeFiles(ok.deps, { id: row.id, firmId: f.firmId, emailId: e.email_id }),
      storeFiles(ok.deps, { id: row.id, firmId: f.firmId, emailId: e.email_id }),
    ])
    expect(await filesOf(row.id)).toHaveLength(2)
  })

  it('gives each addressed firm its own item and keeps them apart', async () => {
    const f = await newFirm('Receive Two A')
    const g = await newFirm('Receive Two B')
    const a = await inboxAddress(f)
    const b = await inboxAddress(g)
    const { deps } = setup()
    const r = await receiveInbound(deps, event([`bills-${a.code}@${DOMAIN}`, `bills-${b.code}@${DOMAIN}`, `bills-${a.code}@other.com`]))
    expect(r.stored).toBe(2)
    const { data: fv } = await f.manager.db.from('bill_inbox_items').select('firm_id')
    const { data: gv } = await g.manager.db.from('bill_inbox_items').select('firm_id')
    expect(fv?.map((x) => x.firm_id)).toEqual([f.firmId])
    expect(gv?.map((x) => x.firm_id)).toEqual([g.firmId])
  })
})
