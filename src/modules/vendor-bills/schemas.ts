import { z } from 'zod'
import { isIsoDate, todayIso } from '@/lib/domain/dates'
import { parseMoney } from '@/lib/domain/money'

const METHODS = ['bank_transfer', 'check', 'card', 'cash', 'other'] as const
const MAX_AMOUNT = 9999999999.99
export const MAX_BILL_LINES = 50

type Money = { ok: true; value: string } | { ok: false; error: string }

function money(v: unknown): Money {
  if (typeof v !== 'string') return { ok: false, error: 'Enter an amount.' }
  const r = parseMoney(v)
  if (!r.ok) return { ok: false, error: r.error }
  if (Number(r.data) <= 0) return { ok: false, error: 'Enter an amount above 0.' }
  if (Number(r.data) > MAX_AMOUNT) return { ok: false, error: 'Amount is too large.' }
  return { ok: true, value: r.data }
}

const amount = () =>
  z.string().transform((v, ctx) => {
    const r = money(v)
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.error })
      return z.NEVER
    }
    return r.value
  })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this to ${max} characters or fewer.`)
    .transform((v) => (v === '' ? null : v))

const optionalDate = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || isIsoDate(v), message)
    .transform((v) => (v === '' ? null : v))

const isUuid = (v: unknown): v is string => typeof v === 'string' && z.uuid().safeParse(v).success
const optUuid = (v: unknown): string | null => (isUuid(v) ? v : null)

export type ExpenseLine = {
  kind: 'expense'
  description: string
  amount: string
  category_id: string
  client_id: string | null
  project_id: string | null
}
/**
 * consultant_id: a consultant from the bill's vendor, whose approved hours in the period the line
 * covers (on project_id, or all projects); null for someone not on timesheets, who needs a client
 * or project.
 */
export type ContractorLine = {
  kind: 'contractor'
  description: string
  amount: string
  consultant_id: string | null
  client_id: string | null
  project_id: string | null
}
/** One line in the shape save_vendor_bill reads. */
export type BillLine = ExpenseLine | ContractorLine

/**
 * The form sends lines as a JSON array of { kind, description, amount, categoryId?, clientId?, projectId?, who? };
 * `who` (contractor lines) is a consultant id, 'none' (not on timesheets) or '' (not chosen).
 */
const lines = z.string().transform((raw, ctx): BillLine[] => {
  const issue = (message: string) => {
    ctx.addIssue({ code: 'custom', message })
    return z.NEVER
  }
  let arr: unknown
  try {
    arr = JSON.parse(raw)
  } catch {
    arr = null
  }
  if (!Array.isArray(arr) || arr.length === 0) return issue('Add at least one line.')
  if (arr.length > MAX_BILL_LINES) return issue(`A bill can have at most ${MAX_BILL_LINES} lines.`)
  const out: BillLine[] = []
  for (const [i, item] of arr.entries()) {
    const at = `Line ${i + 1}: `
    const o = (item ?? {}) as Record<string, unknown>
    const description = typeof o.description === 'string' ? o.description.trim() : ''
    if (description === '' || description.length > 200) return issue(`${at}Enter a description (200 characters or fewer).`)
    const m = money(o.amount)
    if (!m.ok) return issue(`${at}${m.error}`)
    if (o.kind === 'contractor') {
      if (o.who === 'none') {
        const client_id = optUuid(o.clientId)
        const project_id = optUuid(o.projectId)
        if (!client_id && !project_id) return issue(`${at}Choose a client or project for someone not on timesheets.`)
        out.push({ kind: 'contractor', description, amount: m.value, consultant_id: null, client_id, project_id })
      } else if (isUuid(o.who)) {
        // A named consultant's line takes its client from the project, if any.
        out.push({ kind: 'contractor', description, amount: m.value, consultant_id: o.who, client_id: null, project_id: optUuid(o.projectId) })
      } else {
        return issue(`${at}Choose who this line is for.`)
      }
    } else if (o.kind === 'expense') {
      if (!isUuid(o.categoryId)) return issue(`${at}Choose a category.`)
      out.push({
        kind: 'expense',
        description,
        amount: m.value,
        category_id: o.categoryId,
        client_id: optUuid(o.clientId),
        project_id: optUuid(o.projectId),
      })
    } else {
      return issue(`${at}Choose Expense or Contractor.`)
    }
  }
  return out
})

export const billInputSchema = z
  .object({
    vendorId: z.string().refine(isUuid, 'Choose a vendor.'),
    billNumber: z
      .string()
      .trim()
      .min(1, "Enter the vendor's invoice number.")
      .max(60, 'Keep this to 60 characters or fewer.'),
    // Approval books expense lines on the bill date, and expenses can't be in the future.
    billDate: z
      .string()
      .refine(isIsoDate, 'Enter a valid bill date.')
      .refine((v) => v <= todayIso(), "The bill date can't be in the future."),
    dueDate: z.string().refine(isIsoDate, 'Enter a valid due date.'),
    periodStart: optionalDate('Enter a valid start date.'),
    periodEnd: optionalDate('Enter a valid end date.'),
    notes: optionalText(1000),
    lines,
  })
  .superRefine((v, ctx) => {
    if (v.dueDate < v.billDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'The due date must be on or after the bill date.' })
    }
    if ((v.periodStart === null) !== (v.periodEnd === null)) {
      ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Enter both period dates, or neither.' })
    } else if (v.periodStart && v.periodEnd && v.periodEnd < v.periodStart) {
      ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'The period must end on or after it starts.' })
    }
    if (
      v.periodStart === null &&
      v.periodEnd === null &&
      Array.isArray(v.lines) &&
      v.lines.some((l) => l.kind === 'contractor' && l.consultant_id !== null)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['periodStart'],
        message: 'Enter the service period: contractor lines are matched to approved hours in it.',
      })
    }
  })

export type BillInput = z.infer<typeof billInputSchema>

export const vendorPaymentInputSchema = z.object({
  amount: amount(),
  paidOn: z
    .string()
    .refine(isIsoDate, 'Enter a valid payment date.')
    .refine((v) => v <= todayIso(), "The payment date can't be in the future."),
  method: z.enum(METHODS, { message: 'Choose a payment method.' }),
  reference: optionalText(120),
  notes: optionalText(1000),
})

export type VendorPaymentInput = z.infer<typeof vendorPaymentInputSchema>

export const rejectSchema = z.object({
  reason: z.string().trim().min(1, 'Enter a reason.').max(500, 'Keep this to 500 characters or fewer.'),
})
