import 'server-only'

/** The slice of Resend's Receiving API the bill inbox uses. */
export type ResendReceiving = {
  /** The received email's attachments, each with a download URL valid for about an hour. */
  listAttachments(emailId: string): Promise<{ id: string; filename: string; content_type: string; download_url: string }[]>
}

const API = 'https://api.resend.com'
/** Each Resend call or file download gives up after this, so the webhook ends well inside its time limit. */
const TIMEOUT_MS = 15_000

export function resendReceiving(apiKey: string): ResendReceiving {
  return {
    async listAttachments(emailId) {
      const res = await fetch(`${API}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`resend attachments ${res.status}`)
      const body = (await res.json()) as { data?: unknown } | unknown[]
      const list = Array.isArray(body) ? body : Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : []
      return (list as { id: string; filename?: string; content_type?: string; download_url?: string }[])
        .filter((a) => typeof a.download_url === 'string')
        .map((a) => ({
          id: a.id,
          filename: a.filename ?? 'attachment',
          content_type: a.content_type ?? 'application/octet-stream',
          download_url: a.download_url as string,
        }))
    },
  }
}

/** Downloads one attachment from its signed URL. */
export async function fetchFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`attachment download ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
