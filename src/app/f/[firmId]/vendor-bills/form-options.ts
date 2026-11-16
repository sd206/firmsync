import type { SupabaseClient } from '@supabase/supabase-js'
import { listVendorOptions } from '@/modules/vendor-bills/data'
import { loadFormOptions } from '../expenses/form-data'
import type { Option, ProjectOption } from './bill-form'

export type BillFormOptions = {
  vendors: Option[]
  categories: Option[]
  clients: Option[]
  projects: ProjectOption[]
  error: string | null
}

/** Vendors, active categories, clients and projects for the bill form. */
export async function loadBillFormOptions(db: SupabaseClient, firmId: string, keepCategoryIds: string[] = []): Promise<BillFormOptions> {
  const [opts, vendors] = await Promise.all([loadFormOptions(db, firmId), listVendorOptions(db, firmId)])
  return {
    vendors: vendors.ok ? vendors.data : [],
    categories: opts.categories
      .filter((c) => c.active || keepCategoryIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.active ? c.name : `${c.name} (retired)` })),
    clients: opts.clients,
    projects: opts.projects,
    error: opts.error ?? (vendors.ok ? null : vendors.error),
  }
}
