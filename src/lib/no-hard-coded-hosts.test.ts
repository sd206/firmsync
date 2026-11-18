import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The app must move between hosts (firmsync.vercel.app, app.veritreo.com) by configuration only:
// build links from siteUrl() and senders from environment variables, never from literals.
// See docs/superpowers/specs/2026-11-18-custom-domain-design.md.

const SRC = join(__dirname, '..')
const SKIP = new Set(['lib/supabase/types.ts'])
const FORBIDDEN = /vercel\.app|veritreo\.com|veritreo\.app|firmsync/i
const ALLOWED_HOSTS = new Set(['api.resend.com', '127.0.0.1', 'localhost'])
const URL_LITERAL = /https?:\/\/([a-z0-9.-]+)/gi

/** Offending matches in one line of source. */
function offences(line: string): string[] {
  const found: string[] = []
  const f = FORBIDDEN.exec(line)
  if (f) found.push(f[0])
  for (const m of line.matchAll(URL_LITERAL)) if (!ALLOWED_HOSTS.has(m[1].toLowerCase())) found.push(m[0])
  return found
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('no hard-coded hosts in src/', () => {
  it('flags product hosts and unknown URLs, and allows the known API and loopback hosts', () => {
    expect(offences(`const u = 'https://firmsync.vercel.app/x'`)).not.toEqual([])
    expect(offences(`const u = 'https://evil.example/y'`)).toEqual(['https://evil.example'])
    expect(offences(`from: 'invoices@veritreo.com'`)).toEqual(['veritreo.com'])
    expect(offences(`const RESEND_URL = 'https://api.resend.com/emails'`)).toEqual([])
    expect(offences(`const DEFAULT_MAILPIT = 'http://127.0.0.1:54424'`)).toEqual([])
  })

  it('finds none in application code', () => {
    const problems = sourceFiles(SRC).flatMap((file) => {
      const rel = relative(SRC, file).replaceAll('\\', '/')
      if (SKIP.has(rel)) return []
      return readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .flatMap((line, i) => offences(line).map((o) => `src/${rel}:${i + 1}: ${o}`))
    })
    expect(problems).toEqual([])
  })
})
