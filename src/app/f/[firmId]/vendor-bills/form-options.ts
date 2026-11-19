import type { SupabaseClient } from '@supabase/supabase-js'
import { listVendorConsultants, listVendorOptions } from '@/modules/vendor-bills/data'
import { loadFormOptions } from '../expenses/form-data'
import type { ConsultantOption, Option, ProjectOption } from './bill-form'

export type BillFormOptions = {
  vendors: Option[]
  categories: Option[]
  clients: Option[]
  projects: ProjectOption[]
  /** Vendor contractors, for the "Who" choice on contractor lines. */
  consultants: ConsultantOption[]
  error: string | null
}

/** Vendors, active categories, clients, projects and vendor contractors for the bill form. */
export async function loadBillFormOptions(db: SupabaseClient, firmId: string, keepCategoryIds: string[] = []): Promise<BillFormOptions> {
  const [opts, vendors, consultants] = await Promise.all([
    loadFormOptions(db, firmId),
    listVendorOptions(db, firmId),
    listVendorConsultants(db, firmId),
  ])
  return {
    vendors: vendors.ok ? vendors.data : [],
    categories: opts.categories
      .filter((c) => c.active || keepCategoryIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.active ? c.name : `${c.name} (retired)` })),
    clients: opts.clients,
    projects: opts.projects,
    consultants: consultants.ok ? consultants.data : [],
    error: opts.error ?? (vendors.ok ? null : vendors.error) ?? (consultants.ok ? null : consultants.error),
  }
}
