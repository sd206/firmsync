import { adminDb, newFirm } from './helpers'
import { categoryId, expenseAttachmentPath, SPENT_ON } from './expense-fixtures'

type Firm = Awaited<ReturnType<typeof newFirm>>

const BUCKET = 'firm-files'

export async function putObject(path: string, size: number) {
  const { error } = await adminDb().storage.from(BUCKET).upload(path, new Uint8Array(size), { contentType: 'application/pdf' })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
}

/** An expense with one stored, recorded attachment of `size` bytes. */
export async function expenseWithFile(f: Firm, size: number, payee = 'Uber'): Promise<{ expenseId: string; attachmentId: string; path: string }> {
  const db = adminDb()
  const cat = await categoryId(f.firmId, 'Travel')
  const { data: e, error } = await db
    .from('expenses')
    .insert({ firm_id: f.firmId, spent_on: SPENT_ON, category_id: cat, payee, amount: 10 })
    .select('id')
    .single()
  if (error || !e) throw new Error(`expense: ${error?.message}`)
  const expenseId = (e as { id: string }).id
  const path = expenseAttachmentPath(f.firmId, expenseId)
  await putObject(path, size)
  const { data: a, error: aErr } = await db
    .from('attachments')
    .insert({ firm_id: f.firmId, expense_id: expenseId, storage_path: path, file_name: `${payee}.pdf`, mime_type: 'application/pdf', size_bytes: size })
    .select('id')
    .single()
  if (aErr || !a) throw new Error(`attachment: ${aErr?.message}`)
  return { expenseId, attachmentId: (a as { id: string }).id, path }
}
