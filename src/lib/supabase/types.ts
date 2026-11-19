
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attachments": {
                  Row: {
                    "bill_inbox_item_id": string | null,"bill_inbox_source": string | null,"created_at": string,"created_by": string | null,"expense_id": string | null,"file_name": string,"firm_id": string,"id": string,"mime_type": string,"payment_id": string | null,"size_bytes": number,"storage_path": string,"updated_at": string,"vendor_bill_id": string | null,"vendor_payment_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bill_inbox_item_id"?: string | null,"bill_inbox_source"?: string | null,"created_at"?: string,"created_by"?: string | null,"expense_id"?: string | null,"file_name": string,"firm_id": string,"id"?: string,"mime_type": string,"payment_id"?: string | null,"size_bytes": number,"storage_path": string,"updated_at"?: string,"vendor_bill_id"?: string | null,"vendor_payment_id"?: string | null
                  }
                  Update: {
                    "bill_inbox_item_id"?: string | null,"bill_inbox_source"?: string | null,"created_at"?: string,"created_by"?: string | null,"expense_id"?: string | null,"file_name"?: string,"firm_id"?: string,"id"?: string,"mime_type"?: string,"payment_id"?: string | null,"size_bytes"?: number,"storage_path"?: string,"updated_at"?: string,"vendor_bill_id"?: string | null,"vendor_payment_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_bill_inbox_item_fk"
      columns: ["firm_id","bill_inbox_item_id"]
isOneToOne: false
      referencedRelation: "bill_inbox_items"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "attachments_expense_fk"
      columns: ["firm_id","expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "attachments_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_payment_fk"
      columns: ["firm_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "attachments_vendor_bill_fk"
      columns: ["firm_id","vendor_bill_id"]
isOneToOne: false
      referencedRelation: "vendor_bills"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "attachments_vendor_payment_fk"
      columns: ["firm_id","vendor_payment_id"]
isOneToOne: false
      referencedRelation: "vendor_payments"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"at": string,"before": Json | null,"entity_id": string,"entity_type": string,"firm_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity_id": string,"entity_type": string,"firm_id": string,"id"?: string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity_id"?: string,"entity_type"?: string,"firm_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"bank_accounts": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"csv_mapping": Json | null,"firm_id": string,"id": string,"kind": Database["public"]['Enums']["bank_account_kind"],"last4": string | null,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"csv_mapping"?: Json | null,"firm_id": string,"id"?: string,"kind": Database["public"]['Enums']["bank_account_kind"],"last4"?: string | null,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"csv_mapping"?: Json | null,"firm_id"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["bank_account_kind"],"last4"?: string | null,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bank_accounts_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"bank_imports": {
                  Row: {
                    "account_id": string,"duplicate_count": number,"file_name": string,"firm_id": string,"format": string,"id": string,"imported_at": string,"imported_by": string | null,"line_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"duplicate_count"?: number,"file_name": string,"firm_id": string,"format": string,"id"?: string,"imported_at"?: string,"imported_by"?: string | null,"line_count"?: number
                  }
                  Update: {
                    "account_id"?: string,"duplicate_count"?: number,"file_name"?: string,"firm_id"?: string,"format"?: string,"id"?: string,"imported_at"?: string,"imported_by"?: string | null,"line_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bank_imports_account_fk"
      columns: ["firm_id","account_id"]
isOneToOne: false
      referencedRelation: "bank_accounts"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bank_imports_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"bank_lines": {
                  Row: {
                    "account_id": string,"amount": number,"bank_ref": string | null,"clean_description": string,"created_at": string,"dedupe_key": string,"description": string,"expense_id": string | null,"firm_id": string,"id": string,"ignore_reason": string | null,"import_id": string | null,"other_income_id": string | null,"payment_id": string | null,"posted_on": string,"status": Database["public"]['Enums']["bank_line_status"],"updated_at": string,"vendor_payment_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount": number,"bank_ref"?: string | null,"clean_description": string,"created_at"?: string,"dedupe_key": string,"description": string,"expense_id"?: string | null,"firm_id": string,"id"?: string,"ignore_reason"?: string | null,"import_id"?: string | null,"other_income_id"?: string | null,"payment_id"?: string | null,"posted_on": string,"status"?: Database["public"]['Enums']["bank_line_status"],"updated_at"?: string,"vendor_payment_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"amount"?: number,"bank_ref"?: string | null,"clean_description"?: string,"created_at"?: string,"dedupe_key"?: string,"description"?: string,"expense_id"?: string | null,"firm_id"?: string,"id"?: string,"ignore_reason"?: string | null,"import_id"?: string | null,"other_income_id"?: string | null,"payment_id"?: string | null,"posted_on"?: string,"status"?: Database["public"]['Enums']["bank_line_status"],"updated_at"?: string,"vendor_payment_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bank_lines_account_fk"
      columns: ["firm_id","account_id"]
isOneToOne: false
      referencedRelation: "bank_accounts"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bank_lines_expense_fk"
      columns: ["firm_id","expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bank_lines_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bank_lines_import_fk"
      columns: ["firm_id","import_id"]
isOneToOne: false
      referencedRelation: "bank_imports"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bank_lines_other_income_fk"
      columns: ["firm_id","other_income_id"]
isOneToOne: false
      referencedRelation: "other_income"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bank_lines_payment_fk"
      columns: ["firm_id","payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bank_lines_vendor_payment_fk"
      columns: ["firm_id","vendor_payment_id"]
isOneToOne: false
      referencedRelation: "vendor_payments"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"bill_inbox_addresses": {
                  Row: {
                    "code": string,"created_at": string,"enabled": boolean,"firm_id": string,"id": string,"replaced_at": string | null,"unknown_sender": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"enabled"?: boolean,"firm_id": string,"id"?: string,"replaced_at"?: string | null,"unknown_sender"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"enabled"?: boolean,"firm_id"?: string,"id"?: string,"replaced_at"?: string | null,"unknown_sender"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_inbox_addresses_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"bill_inbox_bills": {
                  Row: {
                    "attachment_id": string,"bill_id": string,"created_at": string,"firm_id": string,"item_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attachment_id": string,"bill_id": string,"created_at"?: string,"firm_id": string,"item_id": string
                  }
                  Update: {
                    "attachment_id"?: string,"bill_id"?: string,"created_at"?: string,"firm_id"?: string,"item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_inbox_bills_attachment_fk"
      columns: ["firm_id","attachment_id"]
isOneToOne: false
      referencedRelation: "attachments"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bill_inbox_bills_bill_fk"
      columns: ["firm_id","bill_id"]
isOneToOne: false
      referencedRelation: "vendor_bills"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bill_inbox_bills_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_inbox_bills_item_fk"
      columns: ["firm_id","item_id"]
isOneToOne: false
      referencedRelation: "bill_inbox_items"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"bill_inbox_items": {
                  Row: {
                    "address_id": string,"created_at": string,"download_failed": boolean,"firm_id": string,"forwarded_by": string | null,"from_address": string,"handled_at": string | null,"handled_by": string | null,"id": string,"note": string | null,"received_at": string,"rejected_files": NonNullable<Json>,"resend_email_id": string,"sender_kind": string,"status": string,"subject": string,"to_address": string,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address_id": string,"created_at"?: string,"download_failed"?: boolean,"firm_id": string,"forwarded_by"?: string | null,"from_address": string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"note"?: string | null,"received_at": string,"rejected_files"?: NonNullable<Json>,"resend_email_id": string,"sender_kind": string,"status"?: string,"subject"?: string,"to_address": string,"vendor_id"?: string | null
                  }
                  Update: {
                    "address_id"?: string,"created_at"?: string,"download_failed"?: boolean,"firm_id"?: string,"forwarded_by"?: string | null,"from_address"?: string,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"note"?: string | null,"received_at"?: string,"rejected_files"?: NonNullable<Json>,"resend_email_id"?: string,"sender_kind"?: string,"status"?: string,"subject"?: string,"to_address"?: string,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_inbox_items_address_fk"
      columns: ["firm_id","address_id"]
isOneToOne: false
      referencedRelation: "bill_inbox_addresses"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "bill_inbox_items_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_inbox_items_vendor_fk"
      columns: ["firm_id","vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "active": boolean,"billing_address": string | null,"billing_contact_name": string | null,"billing_email": string | null,"billing_phone": string | null,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"billing_address"?: string | null,"billing_contact_name"?: string | null,"billing_email"?: string | null,"billing_phone"?: string | null,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"billing_address"?: string | null,"billing_contact_name"?: string | null,"billing_email"?: string | null,"billing_phone"?: string | null,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"consultant_cost_rates": {
                  Row: {
                    "consultant_id": string,"created_at": string,"created_by": string | null,"effective_from": string,"firm_id": string,"hourly_cost": number,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultant_id": string,"created_at"?: string,"created_by"?: string | null,"effective_from": string,"firm_id": string,"hourly_cost": number,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "consultant_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"firm_id"?: string,"hourly_cost"?: number,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consultant_cost_rates_consultant_fk"
      columns: ["firm_id","consultant_id"]
isOneToOne: false
      referencedRelation: "consultants"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "consultant_cost_rates_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"consultants": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"email": string,"firm_id": string,"id": string,"name": string,"type": Database["public"]['Enums']["consultant_type"],"updated_at": string,"user_id": string | null,"vendor_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"email": string,"firm_id": string,"id"?: string,"name": string,"type": Database["public"]['Enums']["consultant_type"],"updated_at"?: string,"user_id"?: string | null,"vendor_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"email"?: string,"firm_id"?: string,"id"?: string,"name"?: string,"type"?: Database["public"]['Enums']["consultant_type"],"updated_at"?: string,"user_id"?: string | null,"vendor_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consultants_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consultants_member_fk"
      columns: ["firm_id","user_id"]
isOneToOne: false
      referencedRelation: "firm_members"
      referencedColumns: ["firm_id","user_id"]
    },{
      foreignKeyName: "consultants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "consultants_vendor_fk"
      columns: ["firm_id","vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"expense_categories": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_categories_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"category_id": string,"client_id": string | null,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"notes": string | null,"payee": string,"project_id": string | null,"spent_on": string,"updated_at": string,"vendor_bill_line_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category_id": string,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"notes"?: string | null,"payee": string,"project_id"?: string | null,"spent_on": string,"updated_at"?: string,"vendor_bill_line_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"notes"?: string | null,"payee"?: string,"project_id"?: string | null,"spent_on"?: string,"updated_at"?: string,"vendor_bill_line_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_category_fk"
      columns: ["firm_id","category_id"]
isOneToOne: false
      referencedRelation: "expense_categories"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "expenses_client_fk"
      columns: ["firm_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "expenses_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_project_fk"
      columns: ["firm_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "expenses_vendor_bill_line_fk"
      columns: ["firm_id","vendor_bill_line_id"]
isOneToOne: false
      referencedRelation: "vendor_bill_lines"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"firm_members": {
                  Row: {
                    "created_at": string,"created_by": string | null,"firm_id": string,"id": string,"role": Database["public"]['Enums']["firm_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"role": Database["public"]['Enums']["firm_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"role"?: Database["public"]['Enums']["firm_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "firm_members_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "firm_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"firms": {
                  Row: {
                    "address": string | null,"contact_email": string | null,"contact_name": string | null,"contact_phone": string | null,"created_at": string,"created_by": string | null,"currency": string,"default_payment_terms_days": number,"default_tax_percent": number,"id": string,"invoice_email_body": string | null,"invoice_email_subject": string | null,"invoice_next_seq": number,"invoice_number_pattern": string,"logo_path": string | null,"name": string,"storage_alert_sent": boolean,"storage_blocks": number,"storage_grant_gb": number,"storage_included_bytes": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_payment_terms_days"?: number,"default_tax_percent"?: number,"id"?: string,"invoice_email_body"?: string | null,"invoice_email_subject"?: string | null,"invoice_next_seq"?: number,"invoice_number_pattern"?: string,"logo_path"?: string | null,"name": string,"storage_alert_sent"?: boolean,"storage_blocks"?: number,"storage_grant_gb"?: number,"storage_included_bytes"?: number,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"contact_email"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"default_payment_terms_days"?: number,"default_tax_percent"?: number,"id"?: string,"invoice_email_body"?: string | null,"invoice_email_subject"?: string | null,"invoice_next_seq"?: number,"invoice_number_pattern"?: string,"logo_path"?: string | null,"name"?: string,"storage_alert_sent"?: boolean,"storage_blocks"?: number,"storage_grant_gb"?: number,"storage_included_bytes"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invoice_emails": {
                  Row: {
                    "body": string,"cc_addresses": (string)[],"created_at": string,"created_by": string | null,"error": string | null,"firm_id": string,"id": string,"invoice_id": string,"pdf_path": string,"provider_message_id": string | null,"reply_to": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["invoice_email_status"],"subject": string,"to_addresses": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"cc_addresses"?: (string)[],"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"firm_id": string,"id"?: string,"invoice_id": string,"pdf_path": string,"provider_message_id"?: string | null,"reply_to"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_email_status"],"subject": string,"to_addresses": (string)[]
                  }
                  Update: {
                    "body"?: string,"cc_addresses"?: (string)[],"created_at"?: string,"created_by"?: string | null,"error"?: string | null,"firm_id"?: string,"id"?: string,"invoice_id"?: string,"pdf_path"?: string,"provider_message_id"?: string | null,"reply_to"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["invoice_email_status"],"subject"?: string,"to_addresses"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_emails_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "invoice_emails_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_emails_invoice_fk"
      columns: ["firm_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"invoice_lines": {
                  Row: {
                    "amount": number,"consultant_id": string | null,"created_at": string,"created_by": string | null,"description": string,"firm_id": string,"id": string,"invoice_id": string,"kind": Database["public"]['Enums']["invoice_line_kind"],"project_id": string | null,"quantity": number,"sort_order": number,"unit_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"consultant_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description": string,"firm_id": string,"id"?: string,"invoice_id": string,"kind": Database["public"]['Enums']["invoice_line_kind"],"project_id"?: string | null,"quantity": number,"sort_order"?: number,"unit_price": number,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"consultant_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"firm_id"?: string,"id"?: string,"invoice_id"?: string,"kind"?: Database["public"]['Enums']["invoice_line_kind"],"project_id"?: string | null,"quantity"?: number,"sort_order"?: number,"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_lines_consultant_fk"
      columns: ["firm_id","consultant_id"]
isOneToOne: false
      referencedRelation: "consultants"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "invoice_lines_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_lines_invoice_fk"
      columns: ["firm_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "invoice_lines_project_fk"
      columns: ["firm_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"invoice_templates": {
                  Row: {
                    "base_layout": Database["public"]['Enums']["invoice_layout"],"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"is_default": boolean,"name": string,"options": NonNullable<Json>,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_layout"?: Database["public"]['Enums']["invoice_layout"],"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"is_default"?: boolean,"name": string,"options"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "base_layout"?: Database["public"]['Enums']["invoice_layout"],"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"is_default"?: boolean,"name"?: string,"options"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_templates_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount_paid": number,"bill_to_address": string | null,"bill_to_contact_name": string | null,"bill_to_email": string | null,"bill_to_name": string | null,"bill_to_phone": string | null,"client_id": string,"consultant_filter": (string)[] | null,"created_at": string,"created_by": string | null,"currency": string,"discount_amount": number,"discount_label": string | null,"discount_type": Database["public"]['Enums']["invoice_discount_type"],"discount_value": number,"due_date": string,"firm_id": string,"from_address": string | null,"from_contact_email": string | null,"from_contact_name": string | null,"from_contact_phone": string | null,"from_logo_path": string | null,"from_name": string | null,"id": string,"issue_date": string,"issued_at": string | null,"issued_by": string | null,"number": string | null,"pdf_path": string | null,"period_end": string,"period_start": string,"status": Database["public"]['Enums']["invoice_status"],"subject": string | null,"subtotal": number,"tax_amount": number,"tax_percent": number,"template_id": string,"total": number,"updated_at": string,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paid"?: number,"bill_to_address"?: string | null,"bill_to_contact_name"?: string | null,"bill_to_email"?: string | null,"bill_to_name"?: string | null,"bill_to_phone"?: string | null,"client_id": string,"consultant_filter"?: (string)[] | null,"created_at"?: string,"created_by"?: string | null,"currency": string,"discount_amount"?: number,"discount_label"?: string | null,"discount_type"?: Database["public"]['Enums']["invoice_discount_type"],"discount_value"?: number,"due_date": string,"firm_id": string,"from_address"?: string | null,"from_contact_email"?: string | null,"from_contact_name"?: string | null,"from_contact_phone"?: string | null,"from_logo_path"?: string | null,"from_name"?: string | null,"id"?: string,"issue_date": string,"issued_at"?: string | null,"issued_by"?: string | null,"number"?: string | null,"pdf_path"?: string | null,"period_end": string,"period_start": string,"status"?: Database["public"]['Enums']["invoice_status"],"subject"?: string | null,"subtotal"?: number,"tax_amount"?: number,"tax_percent"?: number,"template_id": string,"total"?: number,"updated_at"?: string,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_paid"?: number,"bill_to_address"?: string | null,"bill_to_contact_name"?: string | null,"bill_to_email"?: string | null,"bill_to_name"?: string | null,"bill_to_phone"?: string | null,"client_id"?: string,"consultant_filter"?: (string)[] | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"discount_amount"?: number,"discount_label"?: string | null,"discount_type"?: Database["public"]['Enums']["invoice_discount_type"],"discount_value"?: number,"due_date"?: string,"firm_id"?: string,"from_address"?: string | null,"from_contact_email"?: string | null,"from_contact_name"?: string | null,"from_contact_phone"?: string | null,"from_logo_path"?: string | null,"from_name"?: string | null,"id"?: string,"issue_date"?: string,"issued_at"?: string | null,"issued_by"?: string | null,"number"?: string | null,"pdf_path"?: string | null,"period_end"?: string,"period_start"?: string,"status"?: Database["public"]['Enums']["invoice_status"],"subject"?: string | null,"subtotal"?: number,"tax_amount"?: number,"tax_percent"?: number,"template_id"?: string,"total"?: number,"updated_at"?: string,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_client_fk"
      columns: ["firm_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "invoices_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_issued_by_fkey"
      columns: ["issued_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "invoices_template_fk"
      columns: ["firm_id","template_id"]
isOneToOne: false
      referencedRelation: "invoice_templates"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "invoices_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"other_income": {
                  Row: {
                    "amount": number,"category_id": string,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"notes": string | null,"received_on": string,"source": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category_id": string,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"notes"?: string | null,"received_on": string,"source": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"notes"?: string | null,"received_on"?: string,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "other_income_category_fk"
      columns: ["firm_id","category_id"]
isOneToOne: false
      referencedRelation: "other_income_categories"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "other_income_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"other_income_categories": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "other_income_categories_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"paid_on": string,"reference": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"invoice_id": string,"method": Database["public"]['Enums']["payment_method"],"notes"?: string | null,"paid_on": string,"reference"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"invoice_id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"paid_on"?: string,"reference"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_invoice_fk"
      columns: ["firm_id","invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"email": string,"is_platform_owner": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"email": string,"is_platform_owner"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"email"?: string,"is_platform_owner"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_assignments": {
                  Row: {
                    "client_rate": number,"consultant_id": string,"created_at": string,"created_by": string | null,"effective_from": string,"effective_to": string | null,"firm_id": string,"id": string,"project_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_rate": number,"consultant_id": string,"created_at"?: string,"created_by"?: string | null,"effective_from": string,"effective_to"?: string | null,"firm_id": string,"id"?: string,"project_id": string,"updated_at"?: string
                  }
                  Update: {
                    "client_rate"?: number,"consultant_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"firm_id"?: string,"id"?: string,"project_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_assignments_consultant_fk"
      columns: ["firm_id","consultant_id"]
isOneToOne: false
      referencedRelation: "consultants"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "project_assignments_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_assignments_project_fk"
      columns: ["firm_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "client_id": string,"code": string | null,"created_at": string,"created_by": string | null,"end_date": string | null,"firm_id": string,"id": string,"name": string,"start_date": string | null,"status": Database["public"]['Enums']["project_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"code"?: string | null,"created_at"?: string,"created_by"?: string | null,"end_date"?: string | null,"firm_id": string,"id"?: string,"name": string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"code"?: string | null,"created_at"?: string,"created_by"?: string | null,"end_date"?: string | null,"firm_id"?: string,"id"?: string,"name"?: string,"start_date"?: string | null,"status"?: Database["public"]['Enums']["project_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_client_fk"
      columns: ["firm_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "projects_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"time_entries": {
                  Row: {
                    "client_rate_snapshot": number | null,"cost_rate_snapshot": number | null,"created_at": string,"created_by": string | null,"firm_id": string,"hours": number,"id": string,"invoice_line_id": string | null,"note": string | null,"project_id": string,"timesheet_id": string,"updated_at": string,"work_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_rate_snapshot"?: number | null,"cost_rate_snapshot"?: number | null,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"hours": number,"id"?: string,"invoice_line_id"?: string | null,"note"?: string | null,"project_id": string,"timesheet_id": string,"updated_at"?: string,"work_date": string
                  }
                  Update: {
                    "client_rate_snapshot"?: number | null,"cost_rate_snapshot"?: number | null,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"hours"?: number,"id"?: string,"invoice_line_id"?: string | null,"note"?: string | null,"project_id"?: string,"timesheet_id"?: string,"updated_at"?: string,"work_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entries_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_invoice_line_fk"
      columns: ["firm_id","invoice_line_id"]
isOneToOne: false
      referencedRelation: "invoice_lines"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "time_entries_project_fk"
      columns: ["firm_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "time_entries_timesheet_fk"
      columns: ["firm_id","timesheet_id"]
isOneToOne: false
      referencedRelation: "timesheets"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"timesheets": {
                  Row: {
                    "consultant_id": string,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_comment": string | null,"firm_id": string,"id": string,"status": Database["public"]['Enums']["timesheet_status"],"submitted_at": string | null,"updated_at": string,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultant_id": string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_comment"?: string | null,"firm_id": string,"id"?: string,"status"?: Database["public"]['Enums']["timesheet_status"],"submitted_at"?: string | null,"updated_at"?: string,"week_start": string
                  }
                  Update: {
                    "consultant_id"?: string,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_comment"?: string | null,"firm_id"?: string,"id"?: string,"status"?: Database["public"]['Enums']["timesheet_status"],"submitted_at"?: string | null,"updated_at"?: string,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "timesheets_consultant_fk"
      columns: ["firm_id","consultant_id"]
isOneToOne: false
      referencedRelation: "consultants"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "timesheets_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "timesheets_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"vendor_bill_lines": {
                  Row: {
                    "amount": number,"bill_id": string,"category_id": string | null,"client_id": string | null,"consultant_id": string | null,"count_mode": string | null,"created_at": string,"description": string,"firm_id": string,"id": string,"kind": string,"position": number,"project_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"bill_id": string,"category_id"?: string | null,"client_id"?: string | null,"consultant_id"?: string | null,"count_mode"?: string | null,"created_at"?: string,"description": string,"firm_id": string,"id"?: string,"kind": string,"position"?: number,"project_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"bill_id"?: string,"category_id"?: string | null,"client_id"?: string | null,"consultant_id"?: string | null,"count_mode"?: string | null,"created_at"?: string,"description"?: string,"firm_id"?: string,"id"?: string,"kind"?: string,"position"?: number,"project_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_bill_lines_bill_fk"
      columns: ["firm_id","bill_id"]
isOneToOne: false
      referencedRelation: "vendor_bills"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "vendor_bill_lines_category_fk"
      columns: ["firm_id","category_id"]
isOneToOne: false
      referencedRelation: "expense_categories"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "vendor_bill_lines_client_fk"
      columns: ["firm_id","client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "vendor_bill_lines_consultant_fk"
      columns: ["firm_id","consultant_id"]
isOneToOne: false
      referencedRelation: "consultants"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "vendor_bill_lines_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_bill_lines_project_fk"
      columns: ["firm_id","project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"vendor_bills": {
                  Row: {
                    "amount_paid": number,"approved_at": string | null,"approved_by": string | null,"bill_date": string,"bill_number": string,"created_at": string,"created_by": string | null,"due_date": string,"firm_id": string,"id": string,"notes": string | null,"period_end": string | null,"period_start": string | null,"rejected_reason": string | null,"status": Database["public"]['Enums']["vendor_bill_status"],"total": number,"updated_at": string,"vendor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paid"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"bill_date": string,"bill_number": string,"created_at"?: string,"created_by"?: string | null,"due_date": string,"firm_id": string,"id"?: string,"notes"?: string | null,"period_end"?: string | null,"period_start"?: string | null,"rejected_reason"?: string | null,"status"?: Database["public"]['Enums']["vendor_bill_status"],"total"?: number,"updated_at"?: string,"vendor_id": string
                  }
                  Update: {
                    "amount_paid"?: number,"approved_at"?: string | null,"approved_by"?: string | null,"bill_date"?: string,"bill_number"?: string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string,"firm_id"?: string,"id"?: string,"notes"?: string | null,"period_end"?: string | null,"period_start"?: string | null,"rejected_reason"?: string | null,"status"?: Database["public"]['Enums']["vendor_bill_status"],"total"?: number,"updated_at"?: string,"vendor_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_bills_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendor_bills_vendor_fk"
      columns: ["firm_id","vendor_id"]
isOneToOne: false
      referencedRelation: "vendors"
      referencedColumns: ["firm_id","id"]
    }
                  ]
                },"vendor_payments": {
                  Row: {
                    "amount": number,"bill_id": string,"created_at": string,"created_by": string | null,"firm_id": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"paid_on": string,"reference": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"bill_id": string,"created_at"?: string,"created_by"?: string | null,"firm_id": string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"notes"?: string | null,"paid_on": string,"reference"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"bill_id"?: string,"created_at"?: string,"created_by"?: string | null,"firm_id"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"paid_on"?: string,"reference"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendor_payments_bill_fk"
      columns: ["firm_id","bill_id"]
isOneToOne: false
      referencedRelation: "vendor_bills"
      referencedColumns: ["firm_id","id"]
    },{
      foreignKeyName: "vendor_payments_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                },"vendors": {
                  Row: {
                    "address": string | null,"contact_name": string | null,"created_at": string,"created_by": string | null,"email": string | null,"firm_id": string,"id": string,"name": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"contact_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"firm_id": string,"id"?: string,"name": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"contact_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"firm_id"?: string,"id"?: string,"name"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendors_firm_id_fkey"
      columns: ["firm_id"]
isOneToOne: false
      referencedRelation: "firms"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_expense_attachment":
{ Args: { "p_expense": string,"p_file_name": string,"p_mime": string,"p_size": number,"p_storage_path": string }; Returns: string
                           },
"add_firm_member":
{ Args: { "p_firm": string,"p_role": Database["public"]['Enums']["firm_role"],"p_user": string }; Returns: string
                           },
"add_payment_attachment":
{ Args: { "p_file_name": string,"p_mime": string,"p_payment": string,"p_size": number,"p_storage_path": string }; Returns: string
                           },
"add_vendor_attachment":
{ Args: { "p_file_name": string,"p_mime": string,"p_owner": string,"p_owner_kind": string,"p_size": number,"p_storage_path": string }; Returns: string
                           },
"approve_timesheet":
{ Args: { "p_timesheet": string }; Returns: undefined
                           },
"approve_vendor_bill":
{ Args: { "p_bill": string }; Returns: undefined
                           },
"bank_account_checked":
{ Args: { "p_account": string }; Returns: {
              "active": boolean,
"created_at": string,
"created_by": string | null,
"csv_mapping": Json | null,
"firm_id": string,
"id": string,
"kind": Database["public"]['Enums']["bank_account_kind"],
"last4": string | null,
"name": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "bank_accounts"
        isOneToOne: true
        isSetofReturn: false
      } },
"bank_lock_line":
{ Args: { "p_line": string,"p_statuses": (Database["public"]['Enums']["bank_line_status"])[] }; Returns: {
              "account_id": string,
"amount": number,
"bank_ref": string | null,
"clean_description": string,
"created_at": string,
"dedupe_key": string,
"description": string,
"expense_id": string | null,
"firm_id": string,
"id": string,
"ignore_reason": string | null,
"import_id": string | null,
"other_income_id": string | null,
"payment_id": string | null,
"posted_on": string,
"status": Database["public"]['Enums']["bank_line_status"],
"updated_at": string,
"vendor_payment_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "bank_lines"
        isOneToOne: true
        isSetofReturn: false
      } },
"bank_match_candidates":
{ Args: { "p_line": string }; Returns: Json
                           },
"bill_bank_withdrawals":
{ Args: { "p_bill": string }; Returns: {
              "account_kind": string,"account_name": string,"amount": string,"description": string,"exact_match": boolean,"line_id": string,"posted_on": string
            }[]
                           },
"bill_inbox_admin":
{ Args: { "p_firm": string }; Returns: undefined
                           },
"bill_inbox_disable":
{ Args: { "p_firm": string }; Returns: {
              "code": string,
"created_at": string,
"enabled": boolean,
"firm_id": string,
"id": string,
"replaced_at": string | null,
"unknown_sender": string
            }
                          SetofOptions: {
        from: "*"
        to: "bill_inbox_addresses"
        isOneToOne: true
        isSetofReturn: false
      } },
"bill_inbox_enable":
{ Args: { "p_firm": string }; Returns: {
              "code": string,
"created_at": string,
"enabled": boolean,
"firm_id": string,
"id": string,
"replaced_at": string | null,
"unknown_sender": string
            }
                          SetofOptions: {
        from: "*"
        to: "bill_inbox_addresses"
        isOneToOne: true
        isSetofReturn: false
      } },
"bill_inbox_link_bill":
{ Args: { "p_attachment": string,"p_bill": string,"p_item": string }; Returns: undefined
                           },
"bill_inbox_lock_item":
{ Args: { "p_item": string }; Returns: {
              "address_id": string,
"created_at": string,
"download_failed": boolean,
"firm_id": string,
"forwarded_by": string | null,
"from_address": string,
"handled_at": string | null,
"handled_by": string | null,
"id": string,
"note": string | null,
"received_at": string,
"rejected_files": NonNullable<Json>,
"resend_email_id": string,
"sender_kind": string,
"status": string,
"subject": string,
"to_address": string,
"vendor_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "bill_inbox_items"
        isOneToOne: true
        isSetofReturn: false
      } },
"bill_inbox_new_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"bill_inbox_replace":
{ Args: { "p_firm": string }; Returns: {
              "code": string,
"created_at": string,
"enabled": boolean,
"firm_id": string,
"id": string,
"replaced_at": string | null,
"unknown_sender": string
            }
                          SetofOptions: {
        from: "*"
        to: "bill_inbox_addresses"
        isOneToOne: true
        isSetofReturn: false
      } },
"bill_inbox_set_status":
{ Args: { "p_item": string,"p_note": string,"p_status": string }; Returns: undefined
                           },
"bill_inbox_set_unknown":
{ Args: { "p_firm": string,"p_mode": string }; Returns: {
              "code": string,
"created_at": string,
"enabled": boolean,
"firm_id": string,
"id": string,
"replaced_at": string | null,
"unknown_sender": string
            }
                          SetofOptions: {
        from: "*"
        to: "bill_inbox_addresses"
        isOneToOne: true
        isSetofReturn: false
      } },
"can_edit_consultant_time":
{ Args: { "p_consultant": string,"p_firm": string }; Returns: boolean
                           },
"change_client_rate":
{ Args: { "p_assignment": string,"p_from": string,"p_rate": number }; Returns: string
                           },
"confirm_bank_line_expense":
{ Args: { "p_category": string,"p_client": string,"p_line": string,"p_notes": string,"p_payee": string,"p_project": string }; Returns: string
                           },
"confirm_bank_line_other_income":
{ Args: { "p_category": string,"p_line": string,"p_notes": string,"p_source": string }; Returns: string
                           },
"confirm_bank_line_payment":
{ Args: { "p_invoice": string,"p_line": string,"p_notes": string }; Returns: string
                           },
"confirm_bank_line_vendor_payment":
{ Args: { "p_bill": string,"p_line": string,"p_notes": string }; Returns: string
                           },
"contractor_line_costs":
{ Args: { "p_bill": string,"p_firm": string,"p_from": string,"p_to": string }; Returns: {
              "adjustment": number,"amount": number,"bill_date": string,"bill_id": string,"client_id": string,"consultant_id": string,"count_mode": string,"expected": number,"hours": number,"line_id": string,"project_id": string
            }[]
                           },
"create_firm_with_admin":
{ Args: { "p_admin": string,"p_name": string }; Returns: string
                           },
"create_invoice_draft":
{ Args: { "p_client": string,"p_consultants": (string)[],"p_end": string,"p_firm": string,"p_start": string,"p_template": string }; Returns: string
                           },
"delete_attachment":
{ Args: { "p_attachment": string }; Returns: string
                           },
"delete_invoice_draft":
{ Args: { "p_invoice": string }; Returns: undefined
                           },
"delete_manual_line":
{ Args: { "p_line": string }; Returns: undefined
                           },
"delete_payment":
{ Args: { "p_payment": string }; Returns: string[]
                           },
"delete_vendor_payment":
{ Args: { "p_payment": string }; Returns: string[]
                           },
"expense_receipt_count":
{ Args: { "p_bill_line": string,"p_expense": string,"p_firm": string }; Returns: number
                           },
"expense_totals":
{ Args: { "p_category": string,"p_client": string,"p_firm": string,"p_from": string,"p_missing_receipt": boolean,"p_project": string,"p_to": string }; Returns: {
              "expense_count": number,"total": string
            }[]
                           },
"firm_member_logins":
{ Args: { "p_firm": string }; Returns: {
              "invite_pending": boolean,"signed_in": boolean,"user_id": string
            }[]
                           },
"firm_storage_allowance":
{ Args: { "p_firm": string }; Returns: number
                           },
"firm_storage_breakdown":
{ Args: { "p_firm": string }; Returns: {
              "bytes": number,"files": number,"kind": string
            }[]
                           },
"firm_storage_files":
{ Args: { "p_firm": string,"p_kind": string,"p_limit": number,"p_offset": number,"p_sort": string }; Returns: {
              "attachment_id": string,"created_at": string,"file_name": string,"kind": string,"label": string,"owner_id": string,"path": string,"record_id": string,"size_bytes": number,"total_count": number
            }[]
                           },
"firm_storage_status":
{ Args: { "p_firm": string }; Returns: {
              "allowance_bytes": number,"used_bytes": number
            }[]
                           },
"firm_storage_used":
{ Args: { "p_firm": string }; Returns: number
                           },
"format_invoice_number":
{ Args: { "p_issue": string,"p_pattern": string,"p_seq": number }; Returns: string
                           },
"has_role":
{ Args: { "p_firm": string,"p_roles": (Database["public"]['Enums']["firm_role"])[] }; Returns: boolean
                           },
"ignore_bank_lines":
{ Args: { "p_lines": (string)[],"p_reason": string }; Returns: number
                           },
"import_bank_lines":
{ Args: { "p_account": string,"p_file_name": string,"p_format": string,"p_lines": Json }; Returns: {
              "duplicates": number,"import_id": string,"inserted": number
            }[]
                           },
"invoice_apply_payments":
{ Args: { "p_invoice": string }; Returns: undefined
                           },
"invoice_bank_deposits":
{ Args: { "p_invoice": string }; Returns: {
              "account_kind": string,"account_name": string,"amount": string,"description": string,"exact_match": boolean,"line_id": string,"posted_on": string
            }[]
                           },
"invoice_candidates":
{ Args: { "p_client": string,"p_end": string,"p_firm": string,"p_start": string }; Returns: {
              "consultant_id": string,"consultant_name": string,"entry_count": number,"hours": string,"project_id": string,"project_name": string,"rate": string
            }[]
                           },
"invoice_email_finish":
{ Args: { "p_error": string,"p_id": string,"p_ok": boolean,"p_provider_id": string }; Returns: undefined
                           },
"invoice_email_start":
{ Args: { "p_body": string,"p_cc": (string)[],"p_invoice": string,"p_reply_to": string,"p_subject": string,"p_to": (string)[] }; Returns: string
                           },
"invoice_generate_time_lines":
{ Args: { "p_consultants": (string)[],"p_invoice": string }; Returns: undefined
                           },
"invoice_last_emails":
{ Args: { "p_firm": string }; Returns: {
              "invoice_id": string,"sent_at": string,"to_addresses": (string)[]
            }[]
                           },
"invoice_lock_draft":
{ Args: { "p_invoice": string }; Returns: {
              "amount_paid": number,
"bill_to_address": string | null,
"bill_to_contact_name": string | null,
"bill_to_email": string | null,
"bill_to_name": string | null,
"bill_to_phone": string | null,
"client_id": string,
"consultant_filter": (string)[] | null,
"created_at": string,
"created_by": string | null,
"currency": string,
"discount_amount": number,
"discount_label": string | null,
"discount_type": Database["public"]['Enums']["invoice_discount_type"],
"discount_value": number,
"due_date": string,
"firm_id": string,
"from_address": string | null,
"from_contact_email": string | null,
"from_contact_name": string | null,
"from_contact_phone": string | null,
"from_logo_path": string | null,
"from_name": string | null,
"id": string,
"issue_date": string,
"issued_at": string | null,
"issued_by": string | null,
"number": string | null,
"pdf_path": string | null,
"period_end": string,
"period_start": string,
"status": Database["public"]['Enums']["invoice_status"],
"subject": string | null,
"subtotal": number,
"tax_amount": number,
"tax_percent": number,
"template_id": string,
"total": number,
"updated_at": string,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "invoices"
        isOneToOne: true
        isSetofReturn: false
      } },
"invoice_recalc":
{ Args: { "p_invoice": string }; Returns: undefined
                           },
"invoice_time_groups":
{ Args: { "p_client": string,"p_consultants": (string)[],"p_end": string,"p_firm": string,"p_start": string }; Returns: {
              "consultant_id": string,"consultant_name": string,"entry_count": number,"hours": number,"notes": string,"project_id": string,"project_name": string,"rate": number
            }[]
                           },
"is_member":
{ Args: { "p_firm": string }; Returns: boolean
                           },
"is_platform_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_email":
{ Args: { "p_address": string }; Returns: boolean
                           },
"issue_invoice":
{ Args: { "p_invoice": string }; Returns: string
                           },
"link_bank_line":
{ Args: { "p_expense": string,"p_line": string,"p_payment": string,"p_vendor_payment"?: string }; Returns: undefined
                           },
"list_bank_lines":
{ Args: { "p_account": string,"p_status": string }; Returns: {
              "amount": string,"bank_ref": string,"description": string,"expense_id": string,"id": string,"ignore_reason": string,"linked_label": string,"other_income_id": string,"payment_id": string,"posted_on": string,"status": string,"suggested_category_id": string,"vendor_payment_id": string
            }[]
                           },
"list_expenses":
{ Args: { "p_category": string,"p_client": string,"p_firm": string,"p_from": string,"p_limit": number,"p_missing_receipt": boolean,"p_offset": number,"p_project": string,"p_to": string }; Returns: {
              "amount": string,"category_id": string,"category_name": string,"client_id": string,"client_name": string,"id": string,"payee": string,"project_id": string,"project_name": string,"receipt_count": number,"spent_on": string,"vendor_bill_id": string
            }[]
                           },
"list_payments":
{ Args: { "p_bank"?: string,"p_client": string,"p_firm": string,"p_from": string,"p_limit": number,"p_offset": number,"p_to": string }; Returns: {
              "amount": string,"bank_account": string,"client_id": string,"client_name": string,"file_count": number,"invoice_id": string,"invoice_number": string,"invoice_status": string,"method": string,"paid_on": string,"payment_id": string,"reference": string
            }[]
                           },
"mark_bank_lines_duplicate":
{ Args: { "p_lines": (string)[] }; Returns: {
              "ignored": number,"matched": number,"skipped": number
            }[]
                           },
"my_assignments":
{ Args: { "p_firm": string }; Returns: {
              "assignment_id": string,"client_name": string,"effective_from": string,"effective_to": string,"project_code": string,"project_id": string,"project_name": string
            }[]
                           },
"outstanding_summary":
{ Args: { "p_firm": string }; Returns: {
              "outstanding": string,"overdue": string,"overdue_count": number
            }[]
                           },
"payables_bills":
{ Args: { "p_firm": string,"p_overdue_only": boolean,"p_today": string,"p_vendors": (string)[] }; Returns: {
              "amount_paid": string,"balance": string,"bill_date": string,"bill_id": string,"bill_number": string,"days_overdue": number,"due_date": string,"status": string,"total": string,"vendor_id": string,"vendor_name": string
            }[]
                           },
"payables_report":
{ Args: { "p_firm": string,"p_overdue_only": boolean,"p_today": string,"p_vendors": (string)[] }; Returns: {
              "awaiting_approval": string,"awaiting_count": number,"d1_30": string,"d31_60": string,"d61_90": string,"d90_plus": string,"due_7": string,"due_8_30": string,"due_later": string,"oldest_overdue_days": number,"total": string,"vendor_id": string,"vendor_name": string
            }[]
                           },
"payment_lock":
{ Args: { "p_missing": string,"p_payment": string }; Returns: {
              "amount": number,
"created_at": string,
"created_by": string | null,
"firm_id": string,
"id": string,
"invoice_id": string,
"method": Database["public"]['Enums']["payment_method"],
"notes": string | null,
"paid_on": string,
"reference": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"payment_totals":
{ Args: { "p_bank"?: string,"p_client": string,"p_firm": string,"p_from": string,"p_to": string }; Returns: {
              "payment_count": number,"total": string
            }[]
                           },
"platform_firms":
{ Args: { "p_limit": number,"p_offset": number,"p_search": string }; Returns: {
              "admin_emails": (string)[],"allowance_bytes": number,"created_at": string,"id": string,"name": string,"storage_grant_gb": number,"total_count": number,"used_bytes": number
            }[]
                           },
"platform_list_firms":
{ Args: Record<PropertyKey, never>; Returns: {
              "admin_emails": (string)[],"created_at": string,"id": string,"name": string
            }[]
                           },
"platform_set_storage_grant":
{ Args: { "p_firm": string,"p_gb": number }; Returns: undefined
                           },
"pnl_breakdown":
{ Args: { "p_clients": (string)[],"p_firm": string,"p_from": string,"p_group": string,"p_projects": (string)[],"p_split_project": boolean,"p_to": string }; Returns: {
              "client_id": string,"client_label": string,"collected": string,"contractor_adj": string,"direct_expenses": string,"discounts": string,"fees": string,"gross": string,"group_key": string,"invoiced": string,"labour": string,"margin": string,"net": string,"overhead": string,"project_id": string,"project_label": string,"revenue": string,"revenue_hours": string,"sort_key": string
            }[]
                           },
"pnl_facts":
{ Args: { "p_firm": string,"p_from": string,"p_to": string }; Returns: {
              "amount": number,"client_id": string,"fact_date": string,"measure": string,"project_id": string
            }[]
                           },
"pnl_report":
{ Args: { "p_clients": (string)[],"p_firm": string,"p_from": string,"p_group": string,"p_projects": (string)[],"p_to": string }; Returns: {
              "client_label": string,"collected": string,"contractor_adj": string,"direct_expenses": string,"discounts": string,"fees": string,"gross": string,"group_key": string,"invoiced": string,"label": string,"labour": string,"margin": string,"net": string,"overhead": string,"project_label": string,"revenue": string,"revenue_hours": string,"row_kind": string,"sort_key": string
            }[]
                           },
"receivables_invoices":
{ Args: { "p_clients": (string)[],"p_firm": string,"p_overdue_only": boolean,"p_today": string }; Returns: {
              "amount_paid": string,"balance": string,"client_id": string,"client_name": string,"days_overdue": number,"due_date": string,"invoice_id": string,"issue_date": string,"number": string,"total": string
            }[]
                           },
"receivables_report":
{ Args: { "p_clients": (string)[],"p_firm": string,"p_overdue_only": boolean,"p_today": string }; Returns: {
              "avg_days_late": string,"avg_days_to_pay": string,"client_id": string,"client_name": string,"d1_30": string,"d31_60": string,"d61_90": string,"d90_plus": string,"not_due": string,"oldest_overdue_days": number,"open_invoices": number,"total": string
            }[]
                           },
"record_payment":
{ Args: { "p_amount": number,"p_invoice": string,"p_method": Database["public"]['Enums']["payment_method"],"p_notes": string,"p_paid_on": string,"p_reference": string }; Returns: string
                           },
"record_vendor_payment":
{ Args: { "p_amount": number,"p_bill": string,"p_method": Database["public"]['Enums']["payment_method"],"p_notes": string,"p_paid_on": string,"p_reference": string }; Returns: string
                           },
"regenerate_invoice_lines":
{ Args: { "p_consultants": (string)[],"p_invoice": string }; Returns: undefined
                           },
"reject_timesheet":
{ Args: { "p_comment": string,"p_timesheet": string }; Returns: undefined
                           },
"reject_vendor_bill":
{ Args: { "p_bill": string,"p_reason": string }; Returns: undefined
                           },
"reopen_timesheet":
{ Args: { "p_timesheet": string }; Returns: undefined
                           },
"reset_bank_line":
{ Args: { "p_line": string }; Returns: undefined
                           },
"save_csv_mapping":
{ Args: { "p_account": string,"p_mapping": Json }; Returns: undefined
                           },
"save_manual_line":
{ Args: { "p_description": string,"p_invoice": string,"p_line": string,"p_quantity": number,"p_unit_price": number }; Returns: string
                           },
"save_timesheet_week":
{ Args: { "p_consultant": string,"p_entries": Json,"p_firm": string,"p_week_start": string }; Returns: string
                           },
"save_vendor_bill":
{ Args: { "p_bill": string,"p_bill_date": string,"p_due_date": string,"p_firm": string,"p_lines": Json,"p_notes": string,"p_number": string,"p_period_end": string,"p_period_start": string,"p_vendor": string }; Returns: string
                           },
"set_default_template":
{ Args: { "p_template": string }; Returns: undefined
                           },
"set_invoice_discount":
{ Args: { "p_invoice": string,"p_label": string,"p_type": Database["public"]['Enums']["invoice_discount_type"],"p_value": number }; Returns: undefined
                           },
"set_invoice_line_description":
{ Args: { "p_description": string,"p_line": string }; Returns: undefined
                           },
"set_invoice_pdf":
{ Args: { "p_invoice": string,"p_path": string }; Returns: undefined
                           },
"storage_alert_check":
{ Args: { "p_firm": string }; Returns: boolean
                           },
"storage_firm_id":
{ Args: { "p_name": string }; Returns: string
                           },
"storage_kind":
{ Args: { "p_name": string }; Returns: string
                           },
"submit_timesheet":
{ Args: { "p_timesheet": string }; Returns: undefined
                           },
"timesheet_entries":
{ Args: { "p_timesheet": string }; Returns: {
              "hours": string,"id": string,"note": string,"project_id": string,"work_date": string
            }[]
                           },
"timesheet_projects":
{ Args: { "p_timesheet": string }; Returns: {
              "client_name": string,"project_code": string,"project_id": string,"project_name": string
            }[]
                           },
"timesheet_totals":
{ Args: { "p_firm": string,"p_ids": (string)[] }; Returns: {
              "timesheet_id": string,"total_hours": string
            }[]
                           },
"transactions_report":
{ Args: { "p_firm": string,"p_from": string,"p_kind": string,"p_to": string }; Returns: {
              "amount": string,"category": string,"client_name": string,"id": string,"invoice_number": string,"kind": string,"method": string,"notes": string,"payee": string,"project_name": string,"reference": string,"txn_date": string
            }[]
                           },
"unpaid_ageing":
{ Args: { "p_client": string,"p_firm": string }; Returns: {
              "balance_due": string,"bucket": string,"invoice_count": number
            }[]
                           },
"unpaid_invoices":
{ Args: { "p_client": string,"p_firm": string }; Returns: {
              "amount_paid": string,"balance_due": string,"client_id": string,"client_name": string,"days_overdue": number,"due_date": string,"invoice_id": string,"issue_date": string,"number": string,"total": string
            }[]
                           },
"update_invoice_draft":
{ Args: { "p_due_date": string,"p_invoice": string,"p_issue_date": string,"p_subject": string,"p_tax_percent": number,"p_template": string }; Returns: undefined
                           },
"update_invoice_period":
{ Args: { "p_consultants": (string)[],"p_end": string,"p_invoice": string,"p_start": string }; Returns: undefined
                           },
"update_payment_details":
{ Args: { "p_method": Database["public"]['Enums']["payment_method"],"p_notes": string,"p_paid_on": string,"p_payment": string,"p_reference": string }; Returns: undefined
                           },
"vendor_bill_apply_payments":
{ Args: { "p_bill": string }; Returns: undefined
                           },
"vendor_bill_contractor_overlap":
{ Args: { "p_bill": string,"p_other_bills": boolean }; Returns: string
                           },
"vendor_bill_internal":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"vendor_bill_lock":
{ Args: { "p_bill": string,"p_roles": (Database["public"]['Enums']["firm_role"])[] }; Returns: {
              "amount_paid": number,
"approved_at": string | null,
"approved_by": string | null,
"bill_date": string,
"bill_number": string,
"created_at": string,
"created_by": string | null,
"due_date": string,
"firm_id": string,
"id": string,
"notes": string | null,
"period_end": string | null,
"period_start": string | null,
"rejected_reason": string | null,
"status": Database["public"]['Enums']["vendor_bill_status"],
"total": number,
"updated_at": string,
"vendor_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "vendor_bills"
        isOneToOne: true
        isSetofReturn: false
      } },
"vendor_bill_set_internal":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"void_invoice":
{ Args: { "p_invoice": string }; Returns: undefined
                           },
"void_vendor_bill":
{ Args: { "p_bill": string }; Returns: undefined
                           },
"week_projects":
{ Args: { "p_consultant": string,"p_firm": string,"p_week_start": string }; Returns: {
              "assignment_id": string,"client_name": string,"effective_from": string,"effective_to": string,"project_code": string,"project_id": string,"project_name": string
            }[]
                           }
          }
          Enums: {
            "bank_account_kind": "bank"|"credit_card","bank_line_status": "new"|"done"|"ignored","consultant_type": "employee"|"independent"|"vendor","firm_role": "admin"|"manager"|"consultant","invoice_discount_type": "none"|"percent"|"amount","invoice_email_status": "sending"|"sent"|"failed","invoice_layout": "classic"|"modern"|"compact","invoice_line_kind": "time"|"manual","invoice_status": "draft"|"issued"|"partly_paid"|"paid"|"void","payment_method": "bank_transfer"|"check"|"card"|"cash"|"other","project_status": "active"|"on_hold"|"closed","timesheet_status": "draft"|"submitted"|"approved"|"rejected","vendor_bill_status": "pending_approval"|"rejected"|"approved"|"partly_paid"|"paid"|"void"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "bank_account_kind": ["bank", "credit_card"],"bank_line_status": ["new", "done", "ignored"],"consultant_type": ["employee", "independent", "vendor"],"firm_role": ["admin", "manager", "consultant"],"invoice_discount_type": ["none", "percent", "amount"],"invoice_email_status": ["sending", "sent", "failed"],"invoice_layout": ["classic", "modern", "compact"],"invoice_line_kind": ["time", "manual"],"invoice_status": ["draft", "issued", "partly_paid", "paid", "void"],"payment_method": ["bank_transfer", "check", "card", "cash", "other"],"project_status": ["active", "on_hold", "closed"],"timesheet_status": ["draft", "submitted", "approved", "rejected"],"vendor_bill_status": ["pending_approval", "rejected", "approved", "partly_paid", "paid", "void"]
          }
        }
} as const
