import { formatMoneyCode } from '@/lib/domain/money'
import { formatPdfDate } from '@/modules/invoices/pdf/view-model'

export const DEFAULT_SUBJECT = 'Invoice {invoice_number} from {firm_name}'

export const DEFAULT_BODY = [
  'Hi {client_contact},',
  '',
  'Please find attached invoice {invoice_number} for {invoice_total}, due on {due_date}.',
  'Amount due: {amount_due}.',
  '',
  'If you have any questions, just reply to this email.',
  '',
  'Thank you,',
  '{firm_name}',
].join('\n')

export const PLACEHOLDERS = [
  { key: 'firm_name', label: 'Your firm name' },
  { key: 'client_name', label: 'Client name' },
  { key: 'client_contact', label: 'Billing contact, or the client name' },
  { key: 'invoice_number', label: 'Invoice number' },
  { key: 'invoice_total', label: 'Invoice total' },
  { key: 'amount_due', label: 'Balance due' },
  { key: 'issue_date', label: 'Issue date' },
  { key: 'due_date', label: 'Due date' },
  { key: 'subject', label: "The invoice's subject line" },
] as const

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]['key']
export type TemplateValues = Record<PlaceholderKey, string>

const KNOWN = new Set<string>(PLACEHOLDERS.map((p) => p.key))
const TOKEN = /\{([a-z_]+)\}/g

/** One left-to-right pass, so substituted text is never read again as a placeholder. */
export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(TOKEN, (whole, key: string) => (KNOWN.has(key) ? values[key as PlaceholderKey] : whole))
}

export function unknownPlaceholders(template: string): string[] {
  const out: string[] = []
  for (const m of template.matchAll(TOKEN)) {
    if (!KNOWN.has(m[1]) && !out.includes(m[0])) out.push(m[0])
  }
  return out
}

export function templateValues(input: {
  firmName: string
  clientName: string
  contactName: string | null
  number: string
  total: string
  balanceDue: string
  currency: string
  issueDate: string
  dueDate: string
  subject: string | null
}): TemplateValues {
  return {
    firm_name: input.firmName,
    client_name: input.clientName,
    client_contact: input.contactName?.trim() || input.clientName,
    invoice_number: input.number,
    invoice_total: formatMoneyCode(input.total, input.currency),
    amount_due: formatMoneyCode(input.balanceDue, input.currency),
    issue_date: formatPdfDate(input.issueDate),
    due_date: formatPdfDate(input.dueDate),
    subject: input.subject ?? '',
  }
}
