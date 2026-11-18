import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PRODUCT_NAME } from '@/lib/brand'
import { formatBytes } from '@/lib/domain/storage'
import { createSender, type SendEmail } from '@/lib/email/send'
import { siteUrlOrNull } from '@/lib/site-url'
import { createAdminDb } from '@/lib/supabase/admin'

type Env = Record<string, string | undefined>

async function rpcNumber(db: SupabaseClient, fn: string, firmId: string): Promise<number> {
  const { data, error } = await db.rpc(fn, { p_firm: firmId })
  if (error) throw new Error(`${fn}: ${error.message}`)
  return Number(data)
}

/**
 * Call after anything is stored for a firm. Emails the firm's admins once when usage crosses 95%
 * (the database latch re-arms below 90%). Needs NOTIFY_FROM and a mail transport (RESEND_API_KEY,
 * or EMAIL_TRANSPORT=mailpit locally); without them it
 * does nothing and the in-app banners are the only warning. Never throws.
 */
export async function afterStore(
  firmId: string,
  deps: { db?: SupabaseClient; send?: SendEmail; env?: Env } = {},
): Promise<void> {
  const env = deps.env ?? process.env
  const from = env.NOTIFY_FROM
  const sender = deps.send ?? createSender(env)
  if (!from || !sender) return
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

    const site = siteUrlOrNull(env)
    await sender({
      from,
      to,
      subject: `${name} is using 95% of its ${PRODUCT_NAME} storage`,
      text: [
        `${name} is using ${formatBytes(used)} of ${formatBytes(allowance)} of storage.`,
        'When storage is full, new uploads stop until files are deleted or more storage is added.',
        '',
        site
          ? `See what is using space: ${site}/f/${firmId}/settings/storage`
          : `Open Settings › Storage in ${PRODUCT_NAME} to see what is using space.`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('storage alert failed', e)
  }
}
