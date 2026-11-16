import { adminDb, type newFirm } from './helpers'

type Firm = Awaited<ReturnType<typeof newFirm>>

export async function mkVendor(f: Firm, name = `Vendor ${crypto.randomUUID().slice(0, 8)}`): Promise<string> {
  const { data, error } = await adminDb().from('vendors').insert({ firm_id: f.firmId, name }).select('id').single()
  if (error || !data) throw new Error(`vendor insert failed: ${error?.message}`)
  return data.id as string
}
