// Test firms: creates 10 fictional consulting firms for testing on the Test site. Each firm has an
// admin login, 2-10 consultant logins with pay rates, 1-5 clients with one project each (every
// consultant assigned with a bill rate), and 1-3 vendors. Structure only: no timesheets, invoices,
// bills or expenses. A fixed-seed generator makes every run produce the same firms, people and rates.
// It refuses to run if any of the 10 firm names (or any of its login emails) already exists.
// When it finishes it writes docs/test-data/test-firms.md (no passwords).
//
// Local (after `npx supabase db reset` with the local stack up; reads .env.local):
//   node scripts/seed-test-firms.mjs
//
// Hosted (test site only, run by the owner): the URL must be repeated in SEED_TEST_FIRMS_ALLOW_HOSTED
// and every login gets the password in SEED_TEST_FIRMS_PASSWORD (at least 12 characters). Every
// setting comes from the environment; nothing hosted is read from files.
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//   SEED_TEST_FIRMS_ALLOW_HOSTED, SEED_TEST_FIRMS_PASSWORD
//
// Users are created with the admin API and email_confirm: true, so no email is sent. The service
// role creates the logins, the firm and its memberships (as scripts/seed-demo.mjs does); everything
// else is written by the firm's own admin, through the same row-level security as the app.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envFile = new URL('../.env.local', import.meta.url)
const fileEnv = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {}
const isLocal = (url) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url ?? '')
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL
if (!URL_) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
const LOCAL = isLocal(URL_)
// .env.local is used only for a local run; a hosted run takes everything from the environment.
const env = LOCAL ? { ...fileEnv, ...process.env } : process.env
if (!LOCAL && env.SEED_TEST_FIRMS_ALLOW_HOSTED !== URL_) {
  throw new Error(`Refusing to seed a non-local Supabase (${URL_}). To seed it on purpose, set SEED_TEST_FIRMS_ALLOW_HOSTED to that exact URL.`)
}
for (const k of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) if (!env[k]) throw new Error(`${k} is not set.`)
const PASSWORD = env.SEED_TEST_FIRMS_PASSWORD || (LOCAL ? 'test-firms-password-123' : undefined)
if (!PASSWORD) throw new Error('SEED_TEST_FIRMS_PASSWORD is required to seed a hosted Supabase.')
if (PASSWORD.length < 12) throw new Error('SEED_TEST_FIRMS_PASSWORD must be at least 12 characters.')

// ---------------------------------------------------------------- fixed-seed generator
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261119)
const int = (min, max) => min + Math.floor(rand() * (max - min + 1))
const pick = (list) => list[Math.floor(rand() * list.length)]
// Picks from `list` a value not yet in `used`, and marks it used.
function pickUnused(list, used, make = (x) => x) {
  for (let tries = 0; tries < 1000; tries++) {
    const v = make(pick(list))
    if (!used.has(v)) {
      used.add(v)
      return v
    }
  }
  throw new Error('Ran out of unused names.')
}

// ---------------------------------------------------------------- the plan (no database access)
const START = '2026-01-01' // pay rates, projects and bill rates start here
const FIRMS = [
  { name: 'Bramblewood Advisory', kind: 'employees' },
  { name: 'Quillfeather Partners', kind: 'subcontractors' },
  { name: 'Copperkettle Consulting', kind: 'mixed' },
  { name: 'Larkspur Lane Analytics', kind: 'employees' },
  { name: 'Tidewhistle Strategy', kind: 'subcontractors' },
  { name: 'Ironfern Systems Consulting', kind: 'employees' },
  { name: 'Saltmarsh & Finch Advisors', kind: 'subcontractors' },
  { name: 'Lanternhook Consulting Group', kind: 'mixed' },
  { name: 'Juniperwick Partners', kind: 'employees' },
  { name: 'Hollowmere Digital', kind: 'subcontractors' },
]
const KIND_LABEL = { employees: 'Employees only', subcontractors: 'Subcontractors only', mixed: 'Mixed' }
const FIRST = [
  'Avery', 'Blake', 'Camila', 'Dmitri', 'Elena', 'Farah', 'Gideon', 'Hana', 'Idris', 'Jonah',
  'Keira', 'Luca', 'Mira', 'Nadia', 'Omar', 'Priya', 'Quentin', 'Rosa', 'Soren', 'Talia',
  'Umar', 'Vera', 'Wes', 'Ximena', 'Yusuf', 'Zara', 'Anika', 'Bruno', 'Clara', 'Dev',
  'Esme', 'Felix', 'Greta', 'Hugo', 'Ines', 'Jasper', 'Kofi', 'Leona', 'Mateo', 'Nell',
]
const LAST = [
  'Ashdown', 'Bellweather', 'Calloway', 'Draycott', 'Everly', 'Fairbourne', 'Galloway', 'Hartwell',
  'Ingleby', 'Jessop', 'Kettering', 'Lindqvist', 'Marchetti', 'Northcott', 'Okonkwo', 'Pemberton',
  'Quarles', 'Rookwood', 'Stanmore', 'Thistlewood', 'Underhill', 'Varga', 'Whitlock', 'Yardley',
  'Zellweger', 'Abernathy', 'Brightwater', 'Coldridge', 'Dunmore', 'Elsworth', 'Fenwick', 'Greaves',
]
const VENDOR_A = [
  'Pinecrest', 'Bluegate', 'Harborlight', 'Silverbirch', 'Oakmoss', 'Redwing', 'Stonebridge', 'Westerly',
  'Foxglove', 'Cinderpath', 'Marigold', 'Granitefield', 'Willowbank', 'Kestrel', 'Moonrake',
]
const VENDOR_B = ['Staffing', 'Talent', 'Contractors', 'Resourcing', 'Workforce']
const CLIENT_A = ['Harborview', 'Summitline', 'Riverbend', 'Crestfall', 'Meadowgate', 'Brightmoor', 'Eastholm', 'Glenrock', 'Fernhollow', 'Starling']
const CLIENT_B = ['Health', 'Logistics', 'Foods', 'Bank', 'Energy', 'Retail', 'Insurance', 'Manufacturing', 'Media', 'Freight']
const PROJECTS = [
  'ERP Rollout', 'Data Platform', 'Cloud Migration', 'Customer Portal', 'Security Review', 'Process Redesign',
  'Analytics Dashboard', 'Mobile App', 'CRM Upgrade', 'Cost Reduction Study', 'Integration Hub', 'Compliance Audit',
]

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const initials = (s) => s.split(/[^A-Za-z]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('')
const round5 = (n) => Math.round(n / 5) * 5

const usedPeople = new Set() // full names, unique across all firms
const usedVendors = new Set()
const usedClients = new Set()
const person = (domain) => {
  const name = pickUnused(FIRST, usedPeople, (f) => `${f} ${pick(LAST)}`)
  const [first, last] = name.split(' ')
  return { name, email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}` }
}

const plan = FIRMS.map(({ name, kind }) => {
  const domain = `${slug(name)}.test`
  const admin = person(domain)
  const vendors = Array.from({ length: int(1, 3) }, () => {
    const vname = pickUnused(VENDOR_A, usedVendors, (a) => `${a} ${pick(VENDOR_B)}`)
    const contact = person(`${slug(vname)}.test`)
    return { name: vname, contactName: contact.name, email: contact.email }
  })
  const consultants = Array.from({ length: int(2, 10) }, (_, i) => {
    const p = person(domain)
    // Mixed firms always have at least one employee and one vendor contractor.
    const isVendor = kind === 'subcontractors' || (kind === 'mixed' && (i === 0 ? false : i === 1 ? true : rand() < 0.5))
    return isVendor
      ? { ...p, type: 'vendor', payRate: int(60, 120), vendor: pick(vendors).name }
      : { ...p, type: 'employee', payRate: int(45, 95), vendor: null }
  })
  const projectNames = new Set()
  const clients = Array.from({ length: int(1, 5) }, (_, i) => {
    const cname = pickUnused(CLIENT_A, usedClients, (a) => `${a} ${pick(CLIENT_B)}`)
    const project = pickUnused(PROJECTS, projectNames)
    return {
      name: cname,
      billingEmail: `accounts@${slug(cname)}.test`,
      project,
      code: `${initials(cname)}-${String(i + 1).padStart(2, '0')}`,
      // Bill rate 40-90% above the consultant's pay rate, rounded to $5.
      rates: consultants.map((c) => round5(c.payRate * (1.4 + rand() * 0.5))),
    }
  })
  return {
    name,
    kind,
    domain,
    admin,
    vendors,
    consultants,
    clients,
    invoicePattern: `${initials(name).slice(0, 4)}-{YYYY}-{SEQ:4}`,
    taxPercent: pick([0, 6.25, 7, 8.25]),
  }
})

// ---------------------------------------------------------------- database
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

async function signIn(email) {
  const db = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts)
  must(await db.auth.signInWithPassword({ email, password: PASSWORD }), `sign in ${email}`)
  return db
}

async function newUser({ email, name }) {
  const u = must(
    await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { password_set: true } }),
    `create user ${email}`,
  ).user
  must(await service.from('profiles').update({ display_name: name }).eq('user_id', u.id), `profile name ${email}`)
  return u.id
}

// Refuse before writing anything if any firm or login already exists.
const existingFirms = must(await service.from('firms').select('name').in('name', FIRMS.map((f) => f.name)), 'existing firms')
if (existingFirms.length > 0) {
  throw new Error(`These test firms already exist: ${existingFirms.map((f) => f.name).join(', ')}. Nothing was changed.${LOCAL ? ' Reset the local database to seed again.' : ''}`)
}
const allEmails = plan.flatMap((f) => [f.admin.email, ...f.consultants.map((c) => c.email)])
const existingLogins = must(await service.from('profiles').select('email').in('email', allEmails), 'existing logins')
if (existingLogins.length > 0) {
  throw new Error(`These test logins already exist: ${existingLogins.map((p) => p.email).join(', ')}. Nothing was changed.`)
}

for (const f of plan) {
  // Logins, firm and memberships (service role, as for a new firm).
  const adminId = await newUser(f.admin)
  for (const c of f.consultants) c.userId = await newUser(c)
  const firmId = must(
    await service
      .from('firms')
      .insert({
        name: f.name,
        contact_name: f.admin.name,
        contact_email: `accounts@${f.domain}`,
        currency: 'USD',
        default_tax_percent: f.taxPercent,
        invoice_number_pattern: f.invoicePattern,
        default_payment_terms_days: 30,
      })
      .select('id')
      .single(),
    `firm ${f.name}`,
  ).id
  must(
    await service.from('firm_members').insert([
      { firm_id: firmId, user_id: adminId, role: 'admin' },
      ...f.consultants.map((c) => ({ firm_id: firmId, user_id: c.userId, role: 'consultant' })),
    ]),
    `members ${f.name}`,
  )

  // Everything else as the firm's admin (vendors, consultants and pay rates are admin-only).
  const db = await signIn(f.admin.email)
  const vendorIds = Object.fromEntries(
    must(
      await db
        .from('vendors')
        .insert(f.vendors.map((v) => ({ firm_id: firmId, name: v.name, contact_name: v.contactName, email: v.email })))
        .select('id, name'),
      `vendors ${f.name}`,
    ).map((v) => [v.name, v.id]),
  )
  const consultantRows = must(
    await db
      .from('consultants')
      .insert(
        f.consultants.map((c) => ({
          firm_id: firmId,
          name: c.name,
          email: c.email,
          type: c.type,
          vendor_id: c.vendor ? vendorIds[c.vendor] : null,
          user_id: c.userId,
        })),
      )
      .select('id, email'),
    `consultants ${f.name}`,
  )
  const consultantIds = Object.fromEntries(consultantRows.map((c) => [c.email, c.id]))
  must(
    await db
      .from('consultant_cost_rates')
      .insert(f.consultants.map((c) => ({ firm_id: firmId, consultant_id: consultantIds[c.email], hourly_cost: c.payRate, effective_from: START }))),
    `pay rates ${f.name}`,
  )
  const clientIds = Object.fromEntries(
    must(
      await db
        .from('clients')
        .insert(f.clients.map((c) => ({ firm_id: firmId, name: c.name, billing_contact_name: 'Accounts Payable', billing_email: c.billingEmail })))
        .select('id, name'),
      `clients ${f.name}`,
    ).map((c) => [c.name, c.id]),
  )
  const projectIds = Object.fromEntries(
    must(
      await db
        .from('projects')
        .insert(f.clients.map((c) => ({ firm_id: firmId, client_id: clientIds[c.name], name: c.project, code: c.code, start_date: START })))
        .select('id, code'),
      `projects ${f.name}`,
    ).map((p) => [p.code, p.id]),
  )
  must(
    await db.from('project_assignments').insert(
      f.clients.flatMap((c) =>
        f.consultants.map((k, i) => ({
          firm_id: firmId,
          project_id: projectIds[c.code],
          consultant_id: consultantIds[k.email],
          client_rate: c.rates[i],
          effective_from: START,
        })),
      ),
    ),
    `bill rates ${f.name}`,
  )
  await db.auth.signOut()
  const n = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`
  console.log(`${f.name}: ${KIND_LABEL[f.kind]}, ${n(f.consultants.length, 'consultant')}, ${n(f.clients.length, 'client')}, ${n(f.vendors.length, 'vendor')}.`)
}

// ---------------------------------------------------------------- the people list
const money = (n) => `$${n}/h`
const typeLabel = (c) => (c.type === 'vendor' ? 'Vendor contractor' : 'Employee')
const lines = [
  '# Test firms',
  '',
  'Ten fictional consulting firms for testing on the Test site, created by `scripts/seed-test-firms.mjs`.',
  'The script uses a fixed-seed generator, so every run produces exactly this list. Structure only:',
  'no timesheets, invoices, bills or expenses. Pay rates and bill rates start on ' + START + '.',
  '',
  '**Password:** every login below shares one password. On a hosted database it is the value of',
  '`SEED_TEST_FIRMS_PASSWORD` used for the run (ask the owner); on a local database it is the default',
  'in the script. It is never written here. Emails end in `.test`, so nothing can be delivered to them.',
  '',
  '## Summary',
  '',
  '| Firm | Type | Admin | Consultants | Clients | Vendors |',
  '|---|---|---|---|---|---|',
  ...plan.map((f) => `| ${f.name} | ${KIND_LABEL[f.kind]} | ${f.admin.email} | ${f.consultants.length} | ${f.clients.length} | ${f.vendors.length} |`),
]
for (const f of plan) {
  lines.push(
    '',
    `## ${f.name}`,
    '',
    `- **Type:** ${KIND_LABEL[f.kind]}`,
    `- **Admin:** ${f.admin.name}, ${f.admin.email}`,
    '',
    '### Consultants',
    '',
    '| Name | Email | Type | Pay rate | Paid through |',
    '|---|---|---|---|---|',
    ...f.consultants.map((c) => `| ${c.name} | ${c.email} | ${typeLabel(c)} | ${money(c.payRate)} | ${c.vendor ?? 'Paid directly'} |`),
    '',
    '### Clients and projects',
    '',
    'Every consultant is assigned to every project at the bill rate shown.',
    '',
    '| Client | Project | Code | Bill rates |',
    '|---|---|---|---|',
    ...f.clients.map((c) => `| ${c.name} | ${c.project} | ${c.code} | ${f.consultants.map((k, i) => `${k.name} ${money(c.rates[i])}`).join('; ')} |`),
    '',
    '### Vendors',
    '',
    '| Vendor | Contact | Email |',
    '|---|---|---|',
    ...f.vendors.map((v) => `| ${v.name} | ${v.contactName} | ${v.email} |`),
  )
}
const out = new URL('../docs/test-data/test-firms.md', import.meta.url)
mkdirSync(new URL('.', out), { recursive: true })
writeFileSync(out, lines.join('\n') + '\n')
console.log(`Done: ${plan.length} firms. People list written to docs/test-data/test-firms.md. Logins use the shared password (${LOCAL ? 'local default in the script' : 'from SEED_TEST_FIRMS_PASSWORD'}).`)
