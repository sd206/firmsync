import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import { sumMoney } from '@/lib/domain/money'
import { fail, ok, type Result } from '@/lib/result'
import type { AgeingParams } from './ageing-params'

export type ReceivableRow = {
  clientId: string
  clientName: string
  notDue: string
  d1_30: string
  d31_60: string
  d61_90: string
  d90Plus: string
  total: string
  oldestOverdueDays: number
  openInvoices: number
  avgDaysToPay: string | null
  avgDaysLate: string | null
}

export type ReceivableTotals = {
  total: string
  overdue: string
  over60: string
  overdueClients: number
  notDue: string
  d1_30: string
  d31_60: string
  d61_90: string
  d90Plus: string
  openInvoices: number
}

export type OpenInvoiceRow = {
  invoiceId: string
  number: string
  clientId: string
  clientName: string
  issueDate: string
  dueDate: string
  total: string
  amountPaid: string
  balance: string
  daysOverdue: number
}

type SummaryDb = {
  client_id: string
  client_name: string
  not_due: string
  d1_30: string
  d31_60: string
  d61_90: string
  d90_plus: string
  total: string
  oldest_overdue_days: number
  open_invoices: number
  avg_days_to_pay: string | null
  avg_days_late: string | null
}

type InvoiceDb = {
  invoice_id: string
  number: string
  client_id: string
  client_name: string
  issue_date: string
  due_date: string
  total: string
  amount_paid: string
  balance: string
  days_overdue: number
}

export function receivableTotals(rows: ReceivableRow[]): ReceivableTotals {
  const col = (k: 'notDue' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90Plus' | 'total') => sumMoney(rows.map((r) => r[k]))
  const d61_90 = col('d61_90')
  const d90Plus = col('d90Plus')
  const overdueOf = (r: ReceivableRow) => sumMoney([r.d1_30, r.d31_60, r.d61_90, r.d90Plus])
  return {
    total: col('total'),
    overdue: sumMoney(rows.map(overdueOf)),
    over60: sumMoney([d61_90, d90Plus]),
    overdueClients: rows.filter((r) => overdueOf(r) !== '0.00').length,
    notDue: col('notDue'),
    d1_30: col('d1_30'),
    d31_60: col('d31_60'),
    d61_90,
    d90Plus,
    openInvoices: rows.reduce((n, r) => n + r.openInvoices, 0),
  }
}

export async function getReceivables(
  db: SupabaseClient,
  firmId: string,
  today: string,
  p: AgeingParams,
): Promise<Result<{ rows: ReceivableRow[]; totals: ReceivableTotals }>> {
  const { data, error } = await db.rpc('receivables_report', {
    p_firm: firmId,
    p_today: today,
    p_clients: p.ids.length ? p.ids : null,
    p_overdue_only: p.overdueOnly,
  })
  if (error) return fail(mapDbError(error))
  const rows = ((data ?? []) as SummaryDb[]).map((r) => ({
    clientId: r.client_id,
    clientName: r.client_name,
    notDue: r.not_due,
    d1_30: r.d1_30,
    d31_60: r.d31_60,
    d61_90: r.d61_90,
    d90Plus: r.d90_plus,
    total: r.total,
    oldestOverdueDays: r.oldest_overdue_days,
    openInvoices: r.open_invoices,
    avgDaysToPay: r.avg_days_to_pay,
    avgDaysLate: r.avg_days_late,
  }))
  return ok({ rows, totals: receivableTotals(rows) })
}

/** Open invoices for the drill-down (the focused client) or the whole filter. */
export async function getOpenInvoices(
  db: SupabaseClient,
  firmId: string,
  today: string,
  p: AgeingParams,
): Promise<Result<OpenInvoiceRow[]>> {
  const ids = p.focus ? [p.focus] : p.ids
  const { data, error } = await db.rpc('receivables_invoices', {
    p_firm: firmId,
    p_today: today,
    p_clients: ids.length ? ids : null,
    p_overdue_only: p.overdueOnly,
  })
  if (error) return fail(mapDbError(error))
  return ok(
    ((data ?? []) as InvoiceDb[]).map((r) => ({
      invoiceId: r.invoice_id,
      number: r.number,
      clientId: r.client_id,
      clientName: r.client_name,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      total: r.total,
      amountPaid: r.amount_paid,
      balance: r.balance,
      daysOverdue: r.days_overdue,
    })),
  )
}
