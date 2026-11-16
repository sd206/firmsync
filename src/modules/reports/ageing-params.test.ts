import { describe, expect, it } from 'vitest'
import { ageingQuery, parseAgeingParams } from './ageing-params'

const U = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'

describe('parseAgeingParams', () => {
  it('keeps valid, unique ids and ignores garbage', () => {
    expect(parseAgeingParams({ clients: [U, 'nope', U], overdue: '1', client: 'xyz' }, 'clients', 'client')).toEqual({
      ids: [U],
      overdueOnly: true,
      focus: null,
    })
  })

  it('accepts comma-separated ids and a focus id', () => {
    expect(parseAgeingParams({ vendors: `${U},bad,${V}`, vendor: V }, 'vendors', 'vendor')).toEqual({
      ids: [U, V],
      overdueOnly: false,
      focus: V,
    })
  })

  it('defaults to everything', () => {
    expect(parseAgeingParams({}, 'clients', 'client')).toEqual({ ids: [], overdueOnly: false, focus: null })
  })

  it('round-trips through ageingQuery', () => {
    const p = { ids: [U, V], overdueOnly: true, focus: U }
    const q = Object.fromEntries([...new Set(ageingQuery(p, 'clients', 'client').keys())].map((k) => [k, ageingQuery(p, 'clients', 'client').getAll(k)]))
    expect(parseAgeingParams(q, 'clients', 'client')).toEqual(p)
    expect(ageingQuery({ ids: [], overdueOnly: false, focus: null }, 'clients', 'client').toString()).toBe('')
  })
})
