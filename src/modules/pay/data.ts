import type { SupabaseClient } from '@supabase/supabase-js'
import { mapDbError } from '@/lib/db-errors'
import type { TimesheetStatus } from '@/lib/db-types'
import { fail, ok, type Result } from '@/lib/result'

export type PayWeek = {
  weekStart: string
  status: TimesheetStatus
  comment: string | null
  hours: string
  /** Distinct frozen pay rates; null unless approved and paid directly. */
  payRates: string[] | null
  /** Approved hours × frozen pay rate; null unless approved and paid directly. */
  gross: string | null
  /** The employer (vendor) recorded when the week was approved; null if paid directly or not approved. */
  employerName: string | null
}

export type PayMonth = {
  month: string
  hours: string
  gross: string | null
  employerName: string | null
}

type Num = number | string
// numeric arrives as a JSON number; render a canonical 2-dp string (no arithmetic).
const two = (v: Num): string => Number(v).toFixed(2)
const twoOrNull = (v: Num | null): string | null => (v === null ? null : two(v))

const yearRange = (year: number) => ({ p_from: `${year}-01-01`, p_to: `${year}-12-31` })

/** The caller's own consultant record in this firm, or null when their login isn't linked. */
export async function getMyConsultantId(db: SupabaseClient, firmId: string): Promise<Result<string | null>> {
  const { data, error } = await db.rpc('my_consultant_id', { p_firm: firmId })
  if (error) return fail(mapDbError(error))
  return ok((data as string | null) ?? null)
}

export async function getPayWeeks(
  db: SupabaseClient,
  firmId: string,
  consultantId: string,
  year: number,
): Promise<Result<PayWeek[]>> {
  const { data, error } = await db.rpc('consultant_pay_weeks', {
    p_firm: firmId,
    p_consultant: consultantId,
    ...yearRange(year),
  })
  if (error) return fail(mapDbError(error))
  type Row = {
    week_start: string
    status: TimesheetStatus
    decision_comment: string | null
    hours: Num
    pay_rates: Num[] | null
    gross: Num | null
    employer_name: string | null
  }
  return ok(
    ((data ?? []) as Row[]).map((r) => ({
      weekStart: r.week_start,
      status: r.status,
      comment: r.decision_comment,
      hours: two(r.hours),
      payRates: r.pay_rates ? r.pay_rates.map(two) : null,
      gross: twoOrNull(r.gross),
      employerName: r.employer_name,
    })),
  )
}

export async function getPayMonths(
  db: SupabaseClient,
  firmId: string,
  consultantId: string,
  year: number,
): Promise<Result<PayMonth[]>> {
  const { data, error } = await db.rpc('consultant_pay_months', {
    p_firm: firmId,
    p_consultant: consultantId,
    ...yearRange(year),
  })
  if (error) return fail(mapDbError(error))
  type Row = { month: string; hours: Num; gross: Num | null; employer_name: string | null }
  return ok(
    ((data ?? []) as Row[]).map((r) => ({
      month: r.month,
      hours: two(r.hours),
      gross: twoOrNull(r.gross),
      employerName: r.employer_name,
    })),
  )
}

/** Consultant header for the page: name, Type and current vendor name (admins/managers and the consultant). */
export async function getPayConsultant(
  db: SupabaseClient,
  firmId: string,
  consultantId: string,
): Promise<Result<{ id: string; name: string; type: 'employee' | 'independent' | 'vendor' }>> {
  const { data, error } = await db
    .from('consultants')
    .select('id, name, type')
    .eq('firm_id', firmId)
    .eq('id', consultantId)
    .maybeSingle()
  if (error) return fail(mapDbError(error))
  if (!data) return fail('Consultant not found.')
  return ok(data as { id: string; name: string; type: 'employee' | 'independent' | 'vendor' })
}
