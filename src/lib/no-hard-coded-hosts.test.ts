import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The app must move between hosts (firmsync.vercel.app, app.veritreo.com) by configuration only:
// build links from siteUrlOrNull()/authCallbackUrl() and senders from environment variables, never from
// literals; auth email templates link from Supabase's {{ .SiteURL }}.
// See docs/superpowers/specs/2026-11-18-custom-domain-design.md.

const SRC = join(__dirname, '..')
const SKIP = new Set(['lib/supabase/types.ts'])
const FORBIDDEN = /vercel\.app|veritreo\.com|veritreo\.app|firmsync/i
// Third-party hosts allowed anywhere. www.w3.org is only an XML namespace (SVG). Links to the marketing
// site, when needed, must come from one named constant or an environment variable, not from literals.
const ALLOWED_HOSTS = new Set(['api.resend.com', 'www.w3.org'])
// Loopback hosts only where they are a development default: the Mailpit transport.
const ALLOWED_IN_FILE: Record<string, Set<string>> = {
  'lib/email/send.ts': new Set(['127.0.0.1', 'localhost']),
}
const URL_LITERAL = /https?:\/\/([a-z0-9.-]+)/gi

/** Offending matches in one line of source; `file` is relative to src/, with forward slashes. */
function offences(line: string, file = ''): string[] {
  const found: string[] = []
  const f = FORBIDDEN.exec(line)
  if (f) found.push(f[0])
  for (const m of line.matchAll(URL_LITERAL)) {
    const host = m[1].toLowerCase()
    if (!ALLOWED_HOSTS.has(host) && !ALLOWED_IN_FILE[file]?.has(host)) found.push(m[0])
  }
  return found
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.(tsx?|jsx?|mjs|cjs|json)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('no hard-coded hosts in src/', () => {
  it('flags product hosts and unknown URLs, and allows the known API and loopback hosts', () => {
    expect(offences(`const u = 'https://firmsync.vercel.app/x'`)).not.toEqual([])
    expect(offences(`const u = 'https://evil.example/y'`)).toEqual(['https://evil.example'])
    expect(offences(`from: 'invoices@veritreo.com'`)).toEqual(['veritreo.com'])
    expect(offences(`const RESEND_URL = 'https://api.resend.com/emails'`)).toEqual([])
    expect(offences(`const DEFAULT_MAILPIT = 'http://127.0.0.1:54424'`, 'lib/email/send.ts')).toEqual([])
    expect(offences(`<svg xmlns="http://www.w3.org/2000/svg">`)).toEqual([])
  })

  it('allows loopback hosts only in the Mailpit transport', () => {
    expect(offences(`env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'`, 'lib/site-url.ts')).toEqual(['http://localhost'])
    expect(offences(`const u = 'http://127.0.0.1:54424'`, 'modules/storage/alerts.ts')).toEqual(['http://127.0.0.1'])
    expect(offences(`const u = 'http://localhost:54424'`, 'lib/email/send.ts')).toEqual([])
  })

  it('finds none in application code', () => {
    const problems = sourceFiles(SRC).flatMap((file) => {
      const rel = relative(SRC, file).replaceAll('\\', '/')
      if (SKIP.has(rel)) return []
      return readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .flatMap((line, i) => offences(line, rel).map((o) => `src/${rel}:${i + 1}: ${o}`))
    })
    expect(problems).toEqual([])
  })

  it('auth email templates link only through {{ .SiteURL }}', () => {
    const dir = join(SRC, '..', 'supabase', 'templates')
    const files = readdirSync(dir).filter((f) => f.endsWith('.html'))
    expect(files.length).toBeGreaterThan(0)
    const problems = files.flatMap((f) => {
      const html = readFileSync(join(dir, f), 'utf8')
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
      if (hrefs.length === 0) return [`${f}: no link`]
      return hrefs.filter((h) => !h.startsWith('{{ .SiteURL }}/')).map((h) => `${f}: ${h}`)
    })
    expect(problems).toEqual([])
  })
})
