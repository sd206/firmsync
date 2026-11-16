'use server'

import { revalidatePath } from 'next/cache'
import { requireFirmRole } from '@/lib/auth/context'
import { fieldErrorsOf, type FormResult, str } from '@/lib/form'
import { fail, type Result } from '@/lib/result'
import * as attachments from '@/modules/attachments/storage'
import { attachInboxFileToBill, inboxFileForBill } from '@/modules/bill-inbox/data'
import type { DeclaredFile, Rejected, UploadedItem, UploadTarget } from '@/modules/attachments/storage'
import {
  approveBill,
  confirmFromWithdrawal,
  deleteVendorPayment,
  ensureBillInFirm,
  recordVendorPayment,
  rejectBill,
  saveBill,
  voidBill,
} from './data'
import { billInputSchema, rejectSchema, vendorPaymentInputSchema } from './schemas'

const MANAGERS = ['admin', 'manager'] as const
const ADMIN = ['admin'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function revalidate(firmId: string, billId?: string) {
  revalidatePath(`/f/${firmId}/vendor-bills`)
  if (billId) revalidatePath(`/f/${firmId}/vendor-bills/${billId}`)
}

function billFields(fd: FormData) {
  return {
    vendorId: str(fd, 'vendorId'),
    billNumber: str(fd, 'billNumber'),
    billDate: str(fd, 'billDate'),
    dueDate: str(fd, 'dueDate'),
    periodStart: str(fd, 'periodStart'),
    periodEnd: str(fd, 'periodEnd'),
    notes: str(fd, 'notes'),
    lines: str(fd, 'lines'),
  }
}

/** Creates a bill (billId null) or edits a pending/rejected one, which resubmits it for approval. */
export async function saveBillAction(
  firmId: string,
  billId: string | null,
  formData: FormData,
): Promise<FormResult<{ id: string; inboxFileFailed?: string }>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  const parsed = billInputSchema.safeParse(billFields(formData))
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const r = await saveBill(db, firmId, billId, parsed.data)
  if (!r.ok) return r
  revalidate(firmId, r.data.id)
  // A bill created from the Bill inbox: copy that file onto the bill only once the bill is saved.
  const inboxFileId = str(formData, 'inboxFileId')
  if (inboxFileId && UUID.test(inboxFileId)) {
    const att = await attachInboxFileToBill(db, firmId, r.data.id, inboxFileId)
    revalidatePath(`/f/${firmId}/bill-inbox`)
    if (!att.ok) {
      const file = await inboxFileForBill(db, firmId, inboxFileId)
      return { ok: true, data: { id: r.data.id, inboxFileFailed: file.ok ? file.data.fileName : 'the inbox file' } }
    }
  }
  return r
}

export async function approveBillAction(firmId: string, billId: string): Promise<Result<void>> {
  const { db } = await requireFirmRole(firmId, [...ADMIN])
  const r = await approveBill(db, firmId, billId)
  if (r.ok) {
    revalidate(firmId, billId)
    revalidatePath(`/f/${firmId}/expenses`)
  }
  return r
}

export async function rejectBillAction(firmId: string, billId: string, formData: FormData): Promise<FormResult> {
  const { db } = await requireFirmRole(firmId, [...ADMIN])
  const parsed = rejectSchema.safeParse({ reason: str(formData, 'reason') })
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const r = await rejectBill(db, firmId, billId, parsed.data.reason)
  if (r.ok) revalidate(firmId, billId)
  return r
}

export async function voidBillAction(firmId: string, billId: string): Promise<Result<void>> {
  const { db } = await requireFirmRole(firmId, [...ADMIN])
  const r = await voidBill(db, firmId, billId)
  if (r.ok) {
    revalidate(firmId, billId)
    revalidatePath(`/f/${firmId}/expenses`)
  }
  return r
}

/** Records the payment only. Remittance files go straight to storage afterwards. */
export async function recordVendorPaymentAction(
  firmId: string,
  billId: string,
  formData: FormData,
): Promise<FormResult<{ id: string }>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  const parsed = vendorPaymentInputSchema.safeParse({
    amount: str(formData, 'amount'),
    paidOn: str(formData, 'paidOn'),
    method: str(formData, 'method'),
    reference: str(formData, 'reference'),
    notes: str(formData, 'notes'),
  })
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const r = await recordVendorPayment(db, firmId, billId, parsed.data)
  if (r.ok) revalidate(firmId, billId)
  return r
}

/** Records a payment on the bill from a bank money-out line (the bill page's bank suggestions). */
export async function recordVendorPaymentFromWithdrawalAction(
  firmId: string,
  billId: string,
  lineId: string,
  notes: string,
): Promise<Result<void>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  if (!UUID.test(lineId) || !UUID.test(billId)) return fail('Bank line not found.')
  const scope = await ensureBillInFirm(db, firmId, billId)
  if (!scope.ok) return scope
  const r = await confirmFromWithdrawal(db, lineId, billId, notes.trim().slice(0, 1000) || null)
  revalidate(firmId, billId)
  revalidatePath(`/f/${firmId}/bank`, 'layout')
  return r.ok ? { ok: true, data: undefined } : r
}

export async function deleteVendorPaymentAction(firmId: string, billId: string, paymentId: string): Promise<Result<void>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  const r = await deleteVendorPayment(db, firmId, paymentId)
  if (r.ok) {
    revalidate(firmId, billId)
    revalidatePath(`/f/${firmId}/bank`, 'layout')
  }
  return r
}

type OwnerKind = 'vendor_bill' | 'vendor_payment'
const owner = (kind: OwnerKind, id: string) => {
  if (kind !== 'vendor_bill' && kind !== 'vendor_payment') throw new Error('invalid owner kind')
  return { kind, id }
}

/** Signed upload targets for a bill's PDF or a payment's remittance files. */
export async function createVendorUploadTargetsAction(
  firmId: string,
  kind: OwnerKind,
  ownerId: string,
  files: DeclaredFile[],
): Promise<FormResult<{ targets: UploadTarget[]; rejected: Rejected[] }>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  return attachments.createUploadTargets(db, firmId, owner(kind, ownerId), files)
}

export async function finalizeVendorUploadsAction(
  firmId: string,
  billId: string,
  kind: OwnerKind,
  ownerId: string,
  items: UploadedItem[],
): Promise<FormResult<{ added: number; rejected: Rejected[] }>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  const r = await attachments.finalizeUploads(db, firmId, owner(kind, ownerId), items)
  if (r.ok && r.data.added > 0) revalidate(firmId, billId)
  return r
}

export async function deleteVendorAttachmentAction(
  firmId: string,
  billId: string,
  kind: OwnerKind,
  ownerId: string,
  attachmentId: string,
): Promise<Result<void>> {
  const { db } = await requireFirmRole(firmId, [...MANAGERS])
  const r = await attachments.deleteAttachment(db, firmId, owner(kind, ownerId), attachmentId)
  if (r.ok) revalidate(firmId, billId)
  return r
}
