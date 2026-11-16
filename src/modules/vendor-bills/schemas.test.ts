import { describe, expect, it } from 'vitest'
import { billInputSchema, vendorPaymentInputSchema } from './schemas'

const VENDOR = '11111111-1111-4111-8111-111111111111'
const CAT = '22222222-2222-4222-8222-222222222222'

const base = (lines: unknown[], over: Record<string, string> = {}) => ({
  vendorId: VENDOR,
  billNumber: ' INV-77 ',
  billDate: '2026-11-01',
  dueDate: '2026-11-30',
  periodStart: '',
  periodEnd: '',
  notes: '',
  lines: JSON.stringify(lines),
  ...over,
})

describe('billInputSchema', () => {
  it('parses a bill with an expense and a contractor line', () => {
    const r = billInputSchema.safeParse(
      base([
        { kind: 'expense', description: 'Licences', amount: '300', categoryId: CAT, clientId: '', projectId: '' },
        { kind: 'contractor', description: 'October hours', amount: '1,200.50' },
      ]),
    )
    expect(r.success).toBe(true)
    expect(r.data).toMatchObject({ billNumber: 'INV-77', periodStart: null, notes: null })
    expect(r.data?.lines).toEqual([
      { kind: 'expense', description: 'Licences', amount: '300.00', category_id: CAT, client_id: null, project_id: null },
      { kind: 'contractor', description: 'October hours', amount: '1200.50' },
    ])
  })

  it('needs a category on expense lines and at least one line', () => {
    const noCat = billInputSchema.safeParse(base([{ kind: 'expense', description: 'X', amount: '1', categoryId: '' }]))
    expect(noCat.error?.issues[0]).toMatchObject({ path: ['lines'], message: 'Line 1: Choose a category.' })
    const none = billInputSchema.safeParse(base([]))
    expect(none.error?.issues[0].message).toBe('Add at least one line.')
  })

  it('refuses amounts with more than 2 decimals and due dates before the bill date', () => {
    const cents = billInputSchema.safeParse(base([{ kind: 'contractor', description: 'X', amount: '1.005' }]))
    expect(cents.error?.issues[0].path).toEqual(['lines'])
    const due = billInputSchema.safeParse(base([{ kind: 'contractor', description: 'X', amount: '1' }], { dueDate: '2026-10-31' }))
    expect(due.error?.issues[0]).toMatchObject({ path: ['dueDate'], message: 'The due date must be on or after the bill date.' })
  })

  it('refuses a bill dated in the future', () => {
    const r = billInputSchema.safeParse(base([{ kind: 'contractor', description: 'X', amount: '1' }], { billDate: '2999-01-01', dueDate: '2999-02-01' }))
    expect(r.error?.issues[0]).toMatchObject({ path: ['billDate'], message: "The bill date can't be in the future." })
  })

  it('needs both period dates or neither, in order', () => {
    const one = billInputSchema.safeParse(base([{ kind: 'contractor', description: 'X', amount: '1' }], { periodStart: '2026-10-01' }))
    expect(one.error?.issues[0].path).toEqual(['periodEnd'])
    const ok = billInputSchema.safeParse(
      base([{ kind: 'contractor', description: 'X', amount: '1' }], { periodStart: '2026-10-01', periodEnd: '2026-10-31' }),
    )
    expect(ok.success).toBe(true)
  })
})

describe('vendorPaymentInputSchema', () => {
  it('parses money and refuses 0', () => {
    const good = vendorPaymentInputSchema.safeParse({ amount: '50', paidOn: '2026-11-01', method: 'check', reference: '', notes: '' })
    expect(good.data).toMatchObject({ amount: '50.00', reference: null })
    expect(vendorPaymentInputSchema.safeParse({ amount: '0', paidOn: '2026-11-01', method: 'check', reference: '', notes: '' }).success).toBe(false)
  })
})
