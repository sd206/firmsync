export type InvoiceCandidate = { id: string; number: string; client_name: string; balance_due: string }

function words(s: string): string[] {
  return s
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
}

/** True when the client name's first word appears as a whole word in the description. */
function mentions(description: string, clientName: string): boolean {
  const d = words(description)
  const c = words(clientName)
  if (c.length === 0) return false
  // Bank descriptions often shorten names ("GLOBEX CORP"), so the first word is enough.
  return d.includes(c[0])
}

/**
 * Orders open invoices for a deposit: exact balance and client named in the
 * description first, then exact balance, then the rest; ties by invoice number.
 */
export function rankInvoices<T extends InvoiceCandidate>(description: string, invoices: T[], amount: string): T[] {
  const tier = (i: T) => {
    const exact = Number(i.balance_due) === Number(amount)
    if (exact && mentions(description, i.client_name)) return 0
    if (exact) return 1
    return 2
  }
  return [...invoices].sort((a, b) => tier(a) - tier(b) || a.number.localeCompare(b.number))
}

export type BillCandidate = { id: string; bill_number: string; vendor_name: string; balance_due: string; due_date: string }

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** The bill number (3+ letters/digits once punctuation is dropped) appears in the description. */
function mentionsNumber(description: string, billNumber: string): boolean {
  const n = compact(billNumber)
  return n.length >= 3 && compact(description).includes(n)
}

/**
 * Orders payable bills for a money-out line: exact balance with the vendor or bill number in the
 * description first, then exact balance, then vendor or number named, then the rest; ties by due date.
 */
export function rankBills<T extends BillCandidate>(description: string, bills: T[], amount: string): T[] {
  const tier = (b: T) => {
    const exact = Number(b.balance_due) === Number(amount)
    const named = mentions(description, b.vendor_name) || mentionsNumber(description, b.bill_number)
    if (exact && named) return 0
    if (exact) return 1
    if (named) return 2
    return 3
  }
  return [...bills].sort(
    (a, b) => tier(a) - tier(b) || a.due_date.localeCompare(b.due_date) || a.bill_number.localeCompare(b.bill_number),
  )
}
