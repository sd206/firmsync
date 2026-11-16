import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import type { PaymentMethod } from '@/lib/db-types'
import { todayIso } from '@/lib/domain/dates'
import { fail, ok, type Result } from '@/lib/result'
import { removeOwnerFolder } from '@/modules/attachments/storage'
import type { BillInput, VendorPaymentInput } from './schemas'

export type BillStatus = 'pending_approval' | 'rejected' | 'approved' | 'partly_paid' | 'paid' | 'void'
export type BillFilter = 'awaiting' | 'unpaid' | 'overdue' | 'paid' | 'all'

export const BILL_FILTERS: { value: BillFilter; label: string }[] = [
  { value: 'awaiting', label: 'Awaiting approval' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
]

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  pending_approval: 'Awaiting approval',
  rejected: 'Rejected',
  approved: 'Approved',
  partly_paid: 'Partly paid',
  paid: 'Paid',
  void: 'Void',
}

const PAYABLE: BillStatus[] = ['approved', 'partly_paid']
const BILL_NOT_FOUND = 'Bill not found.'
const LIST_LIMIT = 500

export type BillFilters = { status: BillFilter; vendorId: string | null; from: string | null; to: string | null }

export type BillListRow = {
  id: string
  billNumber: string
  vendorId: string
  vendorName: string
  billDate: string
  dueDate: string
  total: string
  balanceDue: string
  status: BillStatus
  overdue: boolean
}

export type BillTotals = { toPay: string; overdue: string }

type BillDb = {
  id: string
  bill_number: string
  vendor_id: string
  bill_date: string
  due_date: string
  period_start: string | null
  period_end: string | null
  notes: string | null
  total: string
  amount_paid: string
  status: BillStatus
  rejected_reason: string | null
  approved_at: string | null
  vendors: { name: string } | null
}

/** Exact cents arithmetic on numeric(12,2) text. */
const cents = (v: string) => Math.round(Number(v) * 100)
const money = (c: number) => (c / 100).toFixed(2)

function balance(b: { total: string; amount_paid: string }): string {
  return money(cents(b.total) - cents(b.amount_paid))
}

function isOverdue(b: { status: BillStatus; due_date: string }, today: string): boolean {
  return PAYABLE.includes(b.status) && b.due_date < today
}

const BILL_COLS =
  'id, bill_number, vendor_id, bill_date, due_date, period_start, period_end, notes, total::text, amount_paid::text, status, rejected_reason, approved_at, vendors(name)'

export async function listBills(
  db: SupabaseClient,
  firmId: string,
  filters: BillFilters,
): Promise<Result<{ rows: BillListRow[]; totals: BillTotals }>> {
  const today = todayIso()
  let q = db.from('vendor_bills').select(BILL_COLS).eq('firm_id', firmId)
  if (filters.status === 'awaiting') q = q.in('status', ['pending_approval', 'rejected'])
  if (filters.status === 'unpaid') q = q.in('status', PAYABLE)
  if (filters.status === 'overdue') q = q.in('status', PAYABLE).lt('due_date', today)
  if (filters.status === 'paid') q = q.eq('status', 'paid')
  if (filters.vendorId) q = q.eq('vendor_id', filters.vendorId)
  if (filters.from) q = q.gte('bill_date', filters.from)
  if (filters.to) q = q.lte('bill_date', filters.to)
  const order = filters.status === 'unpaid' || filters.status === 'overdue'
  const [list, open] = await Promise.all([
    q.order(order ? 'due_date' : 'bill_date', { ascending: order }).order('bill_number').limit(LIST_LIMIT),
    db.from('vendor_bills').select('total::text, amount_paid::text, due_date, status').eq('firm_id', firmId).in('status', PAYABLE),
  ])
  if (list.error) return fail(mapDbError(list.error))
  if (open.error) return fail(mapDbError(open.error))

  let toPay = 0
  let overdue = 0
  for (const b of (open.data ?? []) as unknown as Pick<BillDb, 'total' | 'amount_paid' | 'due_date' | 'status'>[]) {
    const c = cents(b.total) - cents(b.amount_paid)
    toPay += c
    if (isOverdue(b, today)) overdue += c
  }
  const rows = ((list.data ?? []) as unknown as BillDb[]).map((b) => ({
    id: b.id,
    billNumber: b.bill_number,
    vendorId: b.vendor_id,
    vendorName: b.vendors?.name ?? '',
    billDate: b.bill_date,
    dueDate: b.due_date,
    total: b.total,
    balanceDue: balance(b),
    status: b.status,
    overdue: isOverdue(b, today),
  }))
  return ok({ rows, totals: { toPay: money(toPay), overdue: money(overdue) } })
}

export type FileRow = { id: string; fileName: string; mimeType: string; sizeBytes: number }

export type BillLineRow = {
  id: string
  kind: 'expense' | 'contractor'
  description: string
  amount: string
  categoryId: string | null
  categoryName: string | null
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectName: string | null
}

export type VendorPaymentRow = {
  id: string
  amount: string
  paidOn: string
  method: PaymentMethod
  reference: string | null
  notes: string | null
  bankAccount: string | null
  files: FileRow[]
}

export type ContractorCheckRow = { consultantId: string; consultantName: string; hours: string; expected: string }

export type BillDetail = {
  id: string
  billNumber: string
  vendorId: string
  vendorName: string
  billDate: string
  dueDate: string
  periodStart: string | null
  periodEnd: string | null
  notes: string | null
  total: string
  amountPaid: string
  balanceDue: string
  status: BillStatus
  overdue: boolean
  rejectedReason: string | null
  approvedAt: string | null
  lines: BillLineRow[]
  files: FileRow[]
  payments: VendorPaymentRow[]
  /** Only when the bill has contractor lines and a service period. */
  contractorCheck: { rows: ContractorCheckRow[]; contractorTotal: string; expectedTotal: string } | null
}

type FileDb = { id: string; file_name: string; mime_type: string; size_bytes: number; created_at: string }

function toFiles(list: FileDb[] | null | undefined): FileRow[] {
  return [...(list ?? [])]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((a) => ({ id: a.id, fileName: a.file_name, mimeType: a.mime_type, sizeBytes: a.size_bytes }))
}

export async function getBill(db: SupabaseClient, firmId: string, id: string): Promise<Result<BillDetail>> {
  const { data, error } = await db
    .from('vendor_bills')
    .select(`${BILL_COLS}, attachments(id, file_name, mime_type, size_bytes, created_at)`)
    .eq('firm_id', firmId)
    .eq('id', id)
    .maybeSingle()
  if (error) return fail(mapDbError(error))
  if (!data) return fail(BILL_NOT_FOUND)
  const b = data as unknown as BillDb & { attachments: FileDb[] | null }

  const [lines, pays] = await Promise.all([
    db
      .from('vendor_bill_lines')
      .select(
        'id, kind, description, amount::text, category_id, client_id, project_id, expense_categories(name), clients(name), projects(name)',
      )
      .eq('firm_id', firmId)
      .eq('bill_id', id)
      .order('position'),
    db
      .from('vendor_payments')
      .select('id, amount::text, paid_on, method, reference, notes, created_at, attachments(id, file_name, mime_type, size_bytes, created_at)')
      .eq('firm_id', firmId)
      .eq('bill_id', id)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  if (lines.error) return fail(mapDbError(lines.error))
  if (pays.error) return fail(mapDbError(pays.error))

  type LineDb = {
    id: string
    kind: 'expense' | 'contractor'
    description: string
    amount: string
    category_id: string | null
    client_id: string | null
    project_id: string | null
    expense_categories: { name: string } | null
    clients: { name: string } | null
    projects: { name: string } | null
  }
  type PayDb = {
    id: string
    amount: string
    paid_on: string
    method: PaymentMethod
    reference: string | null
    notes: string | null
    attachments: FileDb[] | null
  }
  const lineRows = ((lines.data ?? []) as unknown as LineDb[]).map((l) => ({
    id: l.id,
    kind: l.kind,
    description: l.description,
    amount: l.amount,
    categoryId: l.category_id,
    categoryName: l.expense_categories?.name ?? null,
    clientId: l.client_id,
    clientName: l.clients?.name ?? null,
    projectId: l.project_id,
    projectName: l.projects?.name ?? null,
  }))
  const payRows = (pays.data ?? []) as unknown as PayDb[]

  // Which bank account each payment was matched to.
  const accounts = new Map<string, string>()
  if (payRows.length > 0) {
    const bl = await db
      .from('bank_lines')
      .select('vendor_payment_id, bank_accounts(name)')
      .eq('firm_id', firmId)
      .in(
        'vendor_payment_id',
        payRows.map((p) => p.id),
      )
    if (bl.error) return fail(mapDbError(bl.error))
    for (const r of (bl.data ?? []) as unknown as { vendor_payment_id: string; bank_accounts: { name: string } | null }[]) {
      accounts.set(r.vendor_payment_id, r.bank_accounts?.name ?? '')
    }
  }

  let contractorCheck: BillDetail['contractorCheck'] = null
  const contractorLines = lineRows.filter((l) => l.kind === 'contractor')
  if (contractorLines.length > 0 && b.period_start && b.period_end) {
    const chk = await db.rpc('vendor_bill_contractor_check', { p_bill: id })
    if (chk.error) return fail(mapDbError(chk.error))
    const rows = ((chk.data ?? []) as { consultant_id: string; consultant_name: string; hours: string; expected: string }[]).map(
      (r) => ({ consultantId: r.consultant_id, consultantName: r.consultant_name, hours: r.hours, expected: r.expected }),
    )
    contractorCheck = {
      rows,
      contractorTotal: money(contractorLines.reduce((s, l) => s + cents(l.amount), 0)),
      expectedTotal: money(rows.reduce((s, r) => s + cents(r.expected), 0)),
    }
  }

  return ok({
    id: b.id,
    billNumber: b.bill_number,
    vendorId: b.vendor_id,
    vendorName: b.vendors?.name ?? '',
    billDate: b.bill_date,
    dueDate: b.due_date,
    periodStart: b.period_start,
    periodEnd: b.period_end,
    notes: b.notes,
    total: b.total,
    amountPaid: b.amount_paid,
    balanceDue: balance(b),
    status: b.status,
    overdue: isOverdue(b, todayIso()),
    rejectedReason: b.rejected_reason,
    approvedAt: b.approved_at,
    lines: lineRows,
    files: toFiles(b.attachments),
    payments: payRows.map((p) => ({
      id: p.id,
      amount: p.amount,
      paidOn: p.paid_on,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      bankAccount: accounts.get(p.id) ?? null,
      files: toFiles(p.attachments),
    })),
    contractorCheck,
  })
}

/** Bill-scoped RPCs take only the row id, so confirm it belongs to firmId first. */
export async function ensureBillInFirm(db: SupabaseClient, firmId: string, billId: string): Promise<Result<void>> {
  const { data, error } = await db.from('vendor_bills').select('id').eq('firm_id', firmId).eq('id', billId).maybeSingle()
  if (error) return fail(mapDbError(error))
  return data ? ok(undefined) : fail(BILL_NOT_FOUND)
}

/** Creates (billId null) or edits a pending/rejected bill; an edit resubmits it for approval. */
export async function saveBill(
  db: SupabaseClient,
  firmId: string,
  billId: string | null,
  input: BillInput,
): Promise<Result<{ id: string }>> {
  if (billId) {
    const scope = await ensureBillInFirm(db, firmId, billId)
    if (!scope.ok) return scope
  }
  const { data, error } = await db.rpc('save_vendor_bill', {
    p_bill: billId,
    p_firm: firmId,
    p_vendor: input.vendorId,
    p_number: input.billNumber,
    p_bill_date: input.billDate,
    p_due_date: input.dueDate,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_notes: input.notes,
    p_lines: input.lines,
  })
  if (error || typeof data !== 'string') return fail(mapDbError(error))
  return ok({ id: data })
}

async function billRpc(
  db: SupabaseClient,
  firmId: string,
  billId: string,
  fn: string,
  extra: Record<string, unknown> = {},
): Promise<Result<void>> {
  const scope = await ensureBillInFirm(db, firmId, billId)
  if (!scope.ok) return scope
  const { error } = await db.rpc(fn, { p_bill: billId, ...extra })
  return error ? fail(mapDbError(error)) : ok(undefined)
}

export const approveBill = (db: SupabaseClient, firmId: string, billId: string) =>
  billRpc(db, firmId, billId, 'approve_vendor_bill')

export const rejectBill = (db: SupabaseClient, firmId: string, billId: string, reason: string) =>
  billRpc(db, firmId, billId, 'reject_vendor_bill', { p_reason: reason })

export const voidBill = (db: SupabaseClient, firmId: string, billId: string) =>
  billRpc(db, firmId, billId, 'void_vendor_bill')

export async function recordVendorPayment(
  db: SupabaseClient,
  firmId: string,
  billId: string,
  input: VendorPaymentInput,
): Promise<Result<{ id: string }>> {
  const scope = await ensureBillInFirm(db, firmId, billId)
  if (!scope.ok) return scope
  const { data, error } = await db.rpc('record_vendor_payment', {
    p_bill: billId,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_method: input.method,
    p_reference: input.reference,
    p_notes: input.notes,
  })
  if (error || typeof data !== 'string') return fail(mapDbError(error))
  return ok({ id: data })
}

/** Deletes the payment (a matched bank line returns to review), then its files. */
export async function deleteVendorPayment(db: SupabaseClient, firmId: string, paymentId: string): Promise<Result<void>> {
  const { data, error: lookup } = await db
    .from('vendor_payments')
    .select('id')
    .eq('firm_id', firmId)
    .eq('id', paymentId)
    .maybeSingle()
  if (lookup) return fail(mapDbError(lookup))
  if (!data) return fail('Payment not found.')
  const { error } = await db.rpc('delete_vendor_payment', { p_payment: paymentId })
  if (error) return fail(mapDbError(error))
  try {
    await removeOwnerFolder(firmId, { kind: 'vendor_payment', id: paymentId })
  } catch (e) {
    console.error('vendor payment file cleanup failed', e)
  }
  return ok(undefined)
}

export type BillWithdrawal = {
  lineId: string
  postedOn: string
  amount: string
  description: string
  accountName: string
  accountKind: 'bank' | 'credit_card'
  exactMatch: boolean
}

/** New money-out bank lines that could pay this bill (see bill_bank_withdrawals). */
export async function listBillWithdrawals(db: SupabaseClient, firmId: string, billId: string): Promise<Result<BillWithdrawal[]>> {
  const scope = await ensureBillInFirm(db, firmId, billId)
  if (!scope.ok) return scope
  const { data, error } = await db.rpc('bill_bank_withdrawals', { p_bill: billId })
  if (error) return fail(mapDbError(error))
  type Row = {
    line_id: string
    posted_on: string
    amount: string
    description: string
    account_name: string
    account_kind: 'bank' | 'credit_card'
    exact_match: boolean
  }
  return ok(
    ((data ?? []) as Row[]).map((r) => ({
      lineId: r.line_id,
      postedOn: r.posted_on,
      amount: r.amount,
      description: r.description,
      accountName: r.account_name,
      accountKind: r.account_kind,
      exactMatch: r.exact_match,
    })),
  )
}

/** Records a payment on the bill from a bank money-out line and marks the line Done. */
export async function confirmFromWithdrawal(
  db: SupabaseClient,
  lineId: string,
  billId: string,
  notes: string | null,
): Promise<Result<string>> {
  const { data, error } = await db.rpc('confirm_bank_line_vendor_payment', { p_line: lineId, p_bill: billId, p_notes: notes })
  if (error) return fail(mapDbError(error))
  return ok(data as string)
}

export type VendorOption = { id: string; name: string }

/** Vendors for the bill form and filter. */
export async function listVendorOptions(db: SupabaseClient, firmId: string): Promise<Result<VendorOption[]>> {
  const { data, error } = await db.from('vendors').select('id, name').eq('firm_id', firmId).order('name').limit(1000)
  if (error) return fail(mapDbError(error))
  return ok((data ?? []) as VendorOption[])
}
