// Demo vendor bills for "Demo Consulting". Called at the end of seed-demo.mjs, after the bank seed.
// Uses the clients seed-demo.mjs passes in; it has no connection settings of its own.

function must(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

const clean = (s) => s.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 80)

/**
 * `maya` is a signed-in manager client and `owner` a signed-in admin client for the firm.
 * Adds an approved, unpaid contractor bill (with a matching money-out line in Main checking)
 * and a bill waiting for approval.
 */
export async function seedDemoBills({ maya, owner, firmId, vendorId, leeId, checkingId, categories }) {
  const save = async (number, fields, lines) =>
    must(
      await maya.rpc('save_vendor_bill', {
        p_bill: null,
        p_firm: firmId,
        p_vendor: vendorId,
        p_number: number,
        p_bill_date: fields.billDate,
        p_due_date: fields.dueDate,
        p_period_start: fields.periodStart ?? null,
        p_period_end: fields.periodEnd ?? null,
        p_notes: fields.notes ?? null,
        p_lines: lines,
      }),
      `bill ${number}`,
    )

  // October contractor hours for Lee Chen: 4 weeks x 24 h at $110 = $10,560 — matches the approved
  // hours, so the contractor cost adjustment is $0.00.
  const october = await save(
    'NW-1042',
    { billDate: '2026-11-02', dueDate: '2026-11-30', periodStart: '2026-10-01', periodEnd: '2026-10-31' },
    [{ kind: 'contractor', description: 'Lee Chen — October hours (96 h)', amount: '10560.00', consultant_id: leeId }],
  )
  must(await owner.rpc('approve_vendor_bill', { p_bill: october }), 'approve NW-1042')

  // A recruiting fee waiting for the admin.
  await save('NW-1051', { billDate: '2026-11-10', dueDate: '2026-12-10', notes: 'Placement fee for the audit team' }, [
    { kind: 'expense', description: 'Recruiting fee', amount: '750.00', category_id: categories['Professional fees'] },
  ])

  // The bank payment for NW-1042, waiting in review.
  must(
    await maya.rpc('import_bank_lines', {
      p_account: checkingId,
      p_file_name: 'checking-2026-11-b.qfx',
      p_format: 'ofx',
      p_lines: [
        {
          posted_on: '2026-11-12',
          amount: '-10560.00',
          description: 'NORTHWIND TALENT NW-1042',
          clean_description: clean('NORTHWIND TALENT NW-1042'),
          bank_ref: 'CHK-1106',
          dedupe_key: 'fitid:CHK-1106',
        },
      ],
    }),
    'import bill payment line',
  )
}
