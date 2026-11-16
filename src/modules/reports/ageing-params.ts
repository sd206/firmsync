const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Search = Record<string, string | string[] | undefined>

/** URL state of the Receivables / Payables reports: chosen clients or vendors, overdue only, drill-down. */
export type AgeingParams = { ids: string[]; overdueOnly: boolean; focus: string | null }

function values(v: string | string[] | undefined): string[] {
  if (v === undefined) return []
  return (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(','))
}

/** Never fails: anything that is not a UUID is ignored. */
export function parseAgeingParams(
  search: Search,
  listKey: 'clients' | 'vendors',
  focusKey: 'client' | 'vendor',
): AgeingParams {
  const ids = [...new Set(values(search[listKey]).map((s) => s.trim()).filter((s) => UUID.test(s)))]
  const overdue = values(search.overdue)[0]
  const focus = values(search[focusKey])[0]?.trim()
  return { ids, overdueOnly: overdue === '1', focus: focus && UUID.test(focus) ? focus : null }
}

export function ageingQuery(p: AgeingParams, listKey: 'clients' | 'vendors', focusKey: 'client' | 'vendor'): URLSearchParams {
  const q = new URLSearchParams()
  for (const id of p.ids) q.append(listKey, id)
  if (p.overdueOnly) q.set('overdue', '1')
  if (p.focus) q.set(focusKey, p.focus)
  return q
}
