// Checks that the AI launch team is set up as designed (docs/superpowers/specs/2026-11-17-launch-team-design.md).
// Run: npm run check:team. Prints each failed check and exits 1, or prints "team setup OK".
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const failures = []
const fail = (msg) => failures.push(msg)
const read = (rel) => {
  const p = join(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

// CLAUDE.md: the team charter.
const charter = read('CLAUDE.md')
const HEADINGS = [
  '## What VeriTreo is',
  '## Where things are',
  '## Standing rules',
  '## Always ask the owner',
  '## How the team works',
  '## Launch manager',
]
if (charter === null) fail('CLAUDE.md is missing')
else {
  for (const h of HEADINGS) if (!charter.split(/\r?\n/).includes(h)) fail(`CLAUDE.md lacks heading "${h}"`)
  // Specialists must not act as the launch manager.
  for (const must of ['Only the launch manager edits `launch/checklist.md`', 'Commit freely on your own branch'])
    if (!charter.includes(must)) fail(`CLAUDE.md must say "${must}"`)
}

// Role files.
const ROLES = ['developer', 'reviewer', 'copy-writer', 'support-writer']
const NO_EDIT = ['Edit', 'Write', 'NotebookEdit']
for (const role of ROLES) {
  const rel = `.claude/agents/${role}.md`
  const text = read(rel)
  if (text === null) {
    fail(`${rel} is missing`)
    continue
  }
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  if (!m) {
    fail(`${rel} has no frontmatter`)
    continue
  }
  const fm = Object.fromEntries(
    m[1]
      .split(/\r?\n/)
      .map((l) => /^([a-zA-Z]+):\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((x) => [x[1], x[2].trim()]),
  )
  if (fm.name !== role) fail(`${rel}: name should be "${role}" (is "${fm.name ?? ''}")`)
  if (!fm.description) fail(`${rel}: description is empty`)
  if (!fm.tools) fail(`${rel}: tools must be listed explicitly`)
  const tools = (fm.tools ?? '').split(',').map((t) => t.trim())
  if (role === 'reviewer') for (const t of NO_EDIT) if (tools.includes(t)) fail(`${rel}: reviewer must not have ${t}`)
  for (const must of ['launch/decisions.md', 'CLAUDE.md']) if (!m[2].includes(must)) fail(`${rel}: body must mention ${must}`)
  if (role === 'copy-writer' && !m[2].includes('ref=')) fail(`${rel}: links must include the partner code (ref=)`)
}

// Approval prompts.
const ASK = [
  'Bash(git push:*)',
  'PowerShell(git push:*)',
  'Bash(git merge:*)',
  'PowerShell(git merge:*)',
  'Bash(npx supabase db push:*)',
  'Bash(supabase db push:*)',
  'PowerShell(npx supabase db push:*)',
  'Bash(npx vercel:*)',
  'Bash(vercel:*)',
  'PowerShell(npx vercel:*)',
  'PowerShell(vercel:*)',
  'PowerShell(supabase db push:*)',
  'Bash(gh pr merge:*)',
  'PowerShell(gh pr merge:*)',
  'Bash(git -C:*)',
  'PowerShell(git -C:*)',
]
const DENY = [
  'Bash(npx supabase db reset --linked:*)',
  'Bash(supabase db reset --linked:*)',
  'PowerShell(npx supabase db reset --linked:*)',
  'PowerShell(supabase db reset --linked:*)',
]
const settingsText = read('.claude/settings.json')
if (settingsText === null) fail('.claude/settings.json is missing')
else {
  try {
    const perms = JSON.parse(settingsText)?.permissions ?? {}
    for (const rule of ASK) if (!(perms.ask ?? []).includes(rule)) fail(`.claude/settings.json: permissions.ask lacks ${rule}`)
    for (const rule of DENY) if (!(perms.deny ?? []).includes(rule)) fail(`.claude/settings.json: permissions.deny lacks ${rule}`)
  } catch {
    fail('.claude/settings.json is not valid JSON')
  }
}

// Go-live checklist: at least the 19 go-live items, numbered 1..N with no gaps or repeats,
// each with owner, dependency and status. Items added later may sit in another section, so order isn't checked.
const checklist = read('launch/checklist.md')
if (checklist === null) fail('launch/checklist.md is missing')
else {
  const items = checklist.split(/\r?\n/).filter((l) => /^\d+\.\s/.test(l))
  if (items.length < 19) fail(`launch/checklist.md has ${items.length} numbered items, expected at least 19`)
  const nums = items.map((l) => Number(l.split('.')[0])).sort((a, b) => a - b)
  nums.forEach((n, i) => {
    if (n !== i + 1) fail(`launch/checklist.md item numbers should run 1 to ${items.length} with no gaps or repeats (found ${n})`)
  })
  items.forEach((l) => {
    const n = l.split('.')[0]
    for (const f of ['Owner:', 'Depends:', 'Status:']) if (!l.includes(f)) fail(`launch/checklist.md item ${n} lacks ${f}`)
  })
}

// Monday status prompt: write-only.
const prompt = read('launch/status/weekly-status-prompt.md')
if (prompt === null) fail('launch/status/weekly-status-prompt.md is missing')
else for (const s of ['Do not commit', 'Only create launch/status/']) if (!prompt.includes(s)) fail(`weekly status prompt must say "${s}"`)

if (failures.length > 0) {
  for (const f of failures) console.log(`✗ ${f}`)
  process.exit(1)
}
console.log('team setup OK')
