import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatBytes } from '@/lib/domain/storage'
import { createAdminDb } from '@/lib/supabase/admin'

export type SendEmail = (msg: { from: string; to: string[]; subject: string; text: string }) => Promise<void>

type Env = Record<string, string | undefined>

/** Sends one email through Resend's sending API. */
function resendSender(apiKey: string): SendEmail {
  return async (msg) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    })
    if (!res.ok) throw new Error(`resend send failed: ${res.status} ${await res.text()}`)
  }
}

async function rpcNumber(db: SupabaseClient, fn: string, firmId: string): Promise<number> {
  const { data, error } = await db.rpc(fn, { p_firm: firmId })
  if (error) throw new Error(`${fn}: ${error.message}`)
  return Number(data)
}

/**
 * Call after anything is stored for a firm. Emails the firm's admins once when usage crosses 95%
 * (the database latch re-arms below 90%). Needs NOTIFY_FROM and RESEND_API_KEY; without them it
 * does nothing and the in-app banners are the only warning. Never throws.
 */
export async function afterStore(
  firmId: string,
  deps: { db?: SupabaseClient; send?: SendEmail; env?: Env } = {},
): Promise<void> {
  const env = deps.env ?? process.env
  const from = env.NOTIFY_FROM
  const apiKey = env.RESEND_API_KEY
  if (!from || !apiKey) return
  try {
    const db = deps.db ?? createAdminDb()
    const { data: send, error } = await db.rpc('storage_alert_check', { p_firm: firmId })
    if (error) throw new Error(`storage_alert_check: ${error.message}`)
    if (send !== true) return

    const [used, allowance] = await Promise.all([
      rpcNumber(db, 'firm_storage_used', firmId),
      rpcNumber(db, 'firm_storage_allowance', firmId),
    ])
    const firm = await db.from('firms').select('name').eq('id', firmId).maybeSingle()
    const admins = await db.from('firm_members').select('role, profiles(email)').eq('firm_id', firmId).eq('role', 'admin')
    if (firm.error || admins.error) throw new Error('storage alert lookup failed')
    const name = (firm.data as { name: string } | null)?.name ?? 'Your firm'
    const to = ((admins.data ?? []) as { profiles: { email: string } | { email: string }[] | null }[])
      .flatMap((r) => (Array.isArray(r.profiles) ? r.profiles : r.profiles ? [r.profiles] : []))
      .map((p) => p.email)
      .filter(Boolean)
    if (to.length === 0) return

    const site = (env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
    await (deps.send ?? resendSender(apiKey))({
      from,
      to,
      subject: `${name} is using 95% of its FirmSync storage`,
      text: [
        `${name} is using ${formatBytes(used)} of ${formatBytes(allowance)} of storage.`,
        'When storage is full, new uploads stop until files are deleted or more storage is added.',
        '',
        `See what is using space: ${site}/f/${firmId}/settings/storage`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('storage alert failed', e)
  }
}
