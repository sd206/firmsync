import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import { sumMoney } from '@/lib/domain/money'
import { fail, ok, type Result } from '@/lib/result'
import type { AgeingParams } from './ageing-params'

export type PayableRow = {
  vendorId: string
  vendorName: string
  due7: string
  due8_30: string
  dueLater: string
  d1_30: string
  d31_60: string
  d61_90: string
  d90Plus: string
  total: string
  awaitingApproval: string
  awaitingCount: number
  oldestOverdueDays: number
}

export type PayableTotals = {
  total: string
  overdue: string
  due7: string
  awaitingApproval: string
  awaitingCount: number
  due8_30: string
  dueLater: string
  d1_30: string
  d31_60: string
  d61_90: string
  d90Plus: string
}

export type OpenBillStatus = 'approved' | 'partly_paid' | 'pending_approval'

export type OpenBillRow = {
  billId: string
  billNumber: string
  vendorId: string
  vendorName: string
  status: OpenBillStatus
  billDate: string
  dueDate: string
  total: string
  amountPaid: string
  balance: string
  daysOverdue: number
}

export const BILL_STATUS_LABEL: Record<OpenBillStatus, string> = {
  approved: 'Approved',
  partly_paid: 'Partly paid',
  pending_approval: 'Awaiting approval',
}

type SummaryDb = {
  vendor_id: string
  vendor_name: string
  due_7: string
  due_8_30: string
  due_later: string
  d1_30: string
  d31_60: string
  d61_90: string
  d90_plus: string
  total: string
  awaiting_approval: string
  awaiting_count: number
  oldest_overdue_days: number
}

type BillDb = {
  bill_id: string
  bill_number: string
  vendor_id: string
  vendor_name: string
  status: OpenBillStatus
  bill_date: string
  due_date: string
  total: string
  amount_paid: string
  balance: string
  days_overdue: number
}

type MoneyKey = 'due7' | 'due8_30' | 'dueLater' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90Plus' | 'total' | 'awaitingApproval'

export function payableTotals(rows: PayableRow[]): PayableTotals {
  const col = (k: MoneyKey) => sumMoney(rows.map((r) => r[k]))
  const d1_30 = col('d1_30')
  const d31_60 = col('d31_60')
  const d61_90 = col('d61_90')
  const d90Plus = col('d90Plus')
  return {
    total: col('total'),
    overdue: sumMoney([d1_30, d31_60, d61_90, d90Plus]),
    due7: col('due7'),
    awaitingApproval: col('awaitingApproval'),
    awaitingCount: rows.reduce((n, r) => n + r.awaitingCount, 0),
    due8_30: col('due8_30'),
    dueLater: col('dueLater'),
    d1_30,
    d31_60,
    d61_90,
    d90Plus,
  }
}

export async function getPayables(
  db: SupabaseClient,
  firmId: string,
  today: string,
  p: AgeingParams,
): Promise<Result<{ rows: PayableRow[]; totals: PayableTotals }>> {
  const { data, error } = await db.rpc('payables_report', {
    p_firm: firmId,
    p_today: today,
    p_vendors: p.ids.length ? p.ids : null,
    p_overdue_only: p.overdueOnly,
  })
  if (error) return fail(mapDbError(error))
  const rows = ((data ?? []) as SummaryDb[]).map((r) => ({
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    due7: r.due_7,
    due8_30: r.due_8_30,
    dueLater: r.due_later,
    d1_30: r.d1_30,
    d31_60: r.d31_60,
    d61_90: r.d61_90,
    d90Plus: r.d90_plus,
    total: r.total,
    awaitingApproval: r.awaiting_approval,
    awaitingCount: r.awaiting_count,
    oldestOverdueDays: r.oldest_overdue_days,
  }))
  return ok({ rows, totals: payableTotals(rows) })
}

/** Open and awaiting-approval bills for the drill-down (the focused vendor) or the whole filter. */
export async function getOpenBills(
  db: SupabaseClient,
  firmId: string,
  today: string,
  p: AgeingParams,
): Promise<Result<OpenBillRow[]>> {
  const ids = p.focus ? [p.focus] : p.ids
  const { data, error } = await db.rpc('payables_bills', {
    p_firm: firmId,
    p_today: today,
    p_vendors: ids.length ? ids : null,
    p_overdue_only: p.overdueOnly,
  })
  if (error) return fail(mapDbError(error))
  return ok(
    ((data ?? []) as BillDb[]).map((r) => ({
      billId: r.bill_id,
      billNumber: r.bill_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      status: r.status,
      billDate: r.bill_date,
      dueDate: r.due_date,
      total: r.total,
      amountPaid: r.amount_paid,
      balance: r.balance,
      daysOverdue: r.days_overdue,
    })),
  )
}
