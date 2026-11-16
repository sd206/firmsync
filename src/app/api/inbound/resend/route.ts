import { createAdminDb } from '@/lib/supabase/admin'
import { receiveInbound, type InboundEvent } from '@/modules/bill-inbox/receive'
import { fetchFile, resendReceiving } from '@/modules/bill-inbox/resend'
import { inboundDomains } from '@/modules/bill-inbox/route-mail'
import { verifySvix } from '@/modules/bill-inbox/svix'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Resend's `email.received` webhook: bills sent to a firm's bill address. */
export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY
  const secret = process.env.RESEND_INBOUND_SECRET
  const domains = inboundDomains(process.env.INBOUND_DOMAINS)
  if (!apiKey || !secret || domains.length === 0) return new Response('Bill inbox is not set up', { status: 503 })

  const body = await req.text()
  const ok = verifySvix(
    secret,
    { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
    body,
  )
  if (!ok) return new Response('Invalid signature', { status: 401 })

  let payload: { type?: string; data?: Partial<InboundEvent> }
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response('Bad payload', { status: 400 })
  }
  if (payload.type !== 'email.received') return new Response('Ignored', { status: 200 })
  const d = payload.data ?? {}
  if (typeof d.email_id !== 'string' || typeof d.from !== 'string' || !Array.isArray(d.to)) {
    return new Response('Bad payload', { status: 400 })
  }

  try {
    const result = await receiveInbound(
      { db: createAdminDb(), resend: resendReceiving(apiKey), domains, fetchFile, log: (line) => console.info(line) },
      {
        email_id: d.email_id,
        from: d.from,
        to: d.to,
        received_for: Array.isArray(d.received_for) ? d.received_for : undefined,
        subject: typeof d.subject === 'string' ? d.subject : '',
        created_at: typeof d.created_at === 'string' ? d.created_at : new Date().toISOString(),
      },
    )
    return Response.json(result)
  } catch (e) {
    // Resend retries on non-2xx; stored items are never duplicated (unique email id per firm).
    console.error('bill inbox receive failed', e)
    return new Response('Error', { status: 500 })
  }
}
