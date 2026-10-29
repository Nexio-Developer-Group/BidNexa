export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contractor_bid_items: {
        Row: {
          committed: boolean
          created_at: string
          deviation_note: string | null
          id: string
          is_deviation: boolean
          is_excluded: boolean
          quoted_amount: number | null
          quoted_quantity: number | null
          quoted_rate: number | null
          requirement_id: string | null
          source_cell_refs: Json
          submission_id: string
          upload_id: string | null
        }
        Insert: {
          committed?: boolean
          created_at?: string
          deviation_note?: string | null
          id?: string
          is_deviation?: boolean
          is_excluded?: boolean
          quoted_amount?: number | null
          quoted_quantity?: number | null
          quoted_rate?: number | null
          requirement_id?: string | null
          source_cell_refs?: Json
          submission_id: string
          upload_id?: string | null
        }
        Update: {
          committed?: boolean
          created_at?: string
          deviation_note?: string | null
          id?: string
          is_deviation?: boolean
          is_excluded?: boolean
          quoted_amount?: number | null
          quoted_quantity?: number | null
          quoted_rate?: number | null
          requirement_id?: string | null
          source_cell_refs?: Json
          submission_id?: string
          upload_id?: string | null
        }
        Relationships: []
      }
      contractor_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          submission_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          submission_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          submission_id?: string
        }
        Relationships: []
      }
      contractor_submissions: {
        Row: {
          contractor_id: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string | null
          tender_id: string
          total_quoted_amount: number | null
          upload_id: string | null
        }
        Insert: {
          contractor_id: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          tender_id: string
          total_quoted_amount?: number | null
          upload_id?: string | null
        }
        Update: {
          contractor_id?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          tender_id?: string
          total_quoted_amount?: number | null
          upload_id?: string | null
        }
        Relationships: []
      }
      contractors: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          status: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
          status?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
        }
        Relationships: []
      }
      extraction_issues: {
        Row: {
          created_at: string
          id: string
          issue_type: string
          original_value: string | null
          proposed_interpretation: string | null
          reason: string | null
          requirement_id: string | null
          review_status: Database["public"]["Enums"]["issue_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          severity: Database["public"]["Enums"]["issue_severity"]
          sheet_id: string | null
          source_reference: string | null
          upload_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_type: string
          original_value?: string | null
          proposed_interpretation?: string | null
          reason?: string | null
          requirement_id?: string | null
          review_status?: Database["public"]["Enums"]["issue_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          sheet_id?: string | null
          source_reference?: string | null
          upload_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_type?: string
          original_value?: string | null
          proposed_interpretation?: string | null
          reason?: string | null
          requirement_id?: string | null
          review_status?: Database["public"]["Enums"]["issue_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["issue_severity"]
          sheet_id?: string | null
          source_reference?: string | null
          upload_id?: string
        }
        Relationships: []
      }
      extraction_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          failed_chunks: number
          finished_at: string | null
          id: string
          processed_chunks: number
          retry_count: number
          stage: Database["public"]["Enums"]["extraction_stage"]
          started_at: string | null
          status: Database["public"]["Enums"]["extraction_job_status"]
          total_chunks: number
          updated_at: string
          upload_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_chunks?: number
          finished_at?: string | null
          id?: string
          processed_chunks?: number
          retry_count?: number
          stage?: Database["public"]["Enums"]["extraction_stage"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["extraction_job_status"]
          total_chunks?: number
          updated_at?: string
          upload_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_chunks?: number
          finished_at?: string | null
          id?: string
          processed_chunks?: number
          retry_count?: number
          stage?: Database["public"]["Enums"]["extraction_stage"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["extraction_job_status"]
          total_chunks?: number
          updated_at?: string
          upload_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_cells: {
        Row: {
          cached_formula_result: string | null
          calculation_status: string
          cell_address: string
          column_index: number
          created_at: string
          id: string
          is_merged_anchor: boolean
          merge_range: string | null
          number_format: string | null
          original_formula: string | null
          recalculated_result: string | null
          row_index: number
          sheet_id: string
          value_text: string | null
          value_type: string
        }
        Insert: {
          cached_formula_result?: string | null
          calculation_status?: string
          cell_address: string
          column_index: number
          created_at?: string
          id?: string
          is_merged_anchor?: boolean
          merge_range?: string | null
          number_format?: string | null
          original_formula?: string | null
          recalculated_result?: string | null
          row_index: number
          sheet_id: string
          value_text?: string | null
          value_type: string
        }
        Update: {
          cached_formula_result?: string | null
          calculation_status?: string
          cell_address?: string
          column_index?: number
          created_at?: string
          id?: string
          is_merged_anchor?: boolean
          merge_range?: string | null
          number_format?: string | null
          original_formula?: string | null
          recalculated_result?: string | null
          row_index?: number
          sheet_id?: string
          value_text?: string | null
          value_type?: string
        }
        Relationships: []
      }
      tender_requirements: {
        Row: {
          amount: number | null
          amount_formula: string | null
          amount_formula_cached_result: number | null
          amount_recalculated: number | null
          amount_status: Database["public"]["Enums"]["field_status"]
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          calculation_discrepancy: boolean
          committed: boolean
          created_at: string
          custom_attributes: Json
          id: string
          item_number: string | null
          mapping_confidence: number | null
          normalized_description: string | null
          original_description: string
          quantity: number | null
          quantity_status: Database["public"]["Enums"]["field_status"]
          rate: number | null
          rate_status: Database["public"]["Enums"]["field_status"]
          row_type: Database["public"]["Enums"]["requirement_row_type"]
          section_id: string | null
          sheet_id: string | null
          source_cell_refs: Json
          source_row: number | null
          tender_id: string
          unit: string | null
          updated_at: string
          upload_id: string | null
        }
        Insert: {
          amount?: number | null
          amount_formula?: string | null
          amount_formula_cached_result?: number | null
          amount_recalculated?: number | null
          amount_status?: Database["public"]["Enums"]["field_status"]
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          calculation_discrepancy?: boolean
          committed?: boolean
          created_at?: string
          custom_attributes?: Json
          id?: string
          item_number?: string | null
          mapping_confidence?: number | null
          normalized_description?: string | null
          original_description: string
          quantity?: number | null
          quantity_status?: Database["public"]["Enums"]["field_status"]
          rate?: number | null
          rate_status?: Database["public"]["Enums"]["field_status"]
          row_type?: Database["public"]["Enums"]["requirement_row_type"]
          section_id?: string | null
          sheet_id?: string | null
          source_cell_refs?: Json
          source_row?: number | null
          tender_id: string
          unit?: string | null
          updated_at?: string
          upload_id?: string | null
        }
        Update: {
          amount?: number | null
          amount_formula?: string | null
          amount_formula_cached_result?: number | null
          amount_recalculated?: number | null
          amount_status?: Database["public"]["Enums"]["field_status"]
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          calculation_discrepancy?: boolean
          committed?: boolean
          created_at?: string
          custom_attributes?: Json
          id?: string
          item_number?: string | null
          mapping_confidence?: number | null
          normalized_description?: string | null
          original_description?: string
          quantity?: number | null
          quantity_status?: Database["public"]["Enums"]["field_status"]
          rate?: number | null
          rate_status?: Database["public"]["Enums"]["field_status"]
          row_type?: Database["public"]["Enums"]["requirement_row_type"]
          section_id?: string | null
          sheet_id?: string | null
          source_cell_refs?: Json
          source_row?: number | null
          tender_id?: string
          unit?: string | null
          updated_at?: string
          upload_id?: string | null
        }
        Relationships: []
      }
      tender_sections: {
        Row: {
          created_at: string
          id: string
          original_section_name: string
          parent_section_id: string | null
          sheet_id: string | null
          source_order: number
          tender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_section_name: string
          parent_section_id?: string | null
          sheet_id?: string | null
          source_order?: number
          tender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          original_section_name?: string
          parent_section_id?: string | null
          sheet_id?: string | null
          source_order?: number
          tender_id?: string
        }
        Relationships: []
      }
      tender_uploads: {
        Row: {
          created_at: string
          file_hash: string
          file_size_bytes: number
          id: string
          original_filename: string
          parser_version: string
          status: Database["public"]["Enums"]["upload_status"]
          storage_path: string
          tender_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_hash: string
          file_size_bytes: number
          id?: string
          original_filename: string
          parser_version?: string
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path: string
          tender_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_hash?: string
          file_size_bytes?: number
          id?: string
          original_filename?: string
          parser_version?: string
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path?: string
          tender_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      tenders: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string
          currency: string
          deadline: string | null
          id: string
          location: string | null
          notes: string | null
          organization_id: string
          reference_number: string | null
          status: Database["public"]["Enums"]["tender_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by: string
          currency?: string
          deadline?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          organization_id: string
          reference_number?: string | null
          status?: Database["public"]["Enums"]["tender_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deadline?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          organization_id?: string
          reference_number?: string | null
          status?: Database["public"]["Enums"]["tender_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      workbook_sheets: {
        Row: {
          created_at: string
          errors: Json
          extracted_column_count: number
          extracted_row_count: number
          formula_cell_count: number
          id: string
          is_hidden: boolean
          merged_cell_ranges: Json
          populated_cell_count: number
          position: number
          processed_cell_count: number
          processed_row_count: number
          processing_status: Database["public"]["Enums"]["sheet_processing_status"]
          sheet_name: string
          upload_id: string
          used_range: string | null
          validation_status: Database["public"]["Enums"]["sheet_validation_status"]
          warnings: Json
        }
        Insert: {
          created_at?: string
          errors?: Json
          extracted_column_count?: number
          extracted_row_count?: number
          formula_cell_count?: number
          id?: string
          is_hidden?: boolean
          merged_cell_ranges?: Json
          populated_cell_count?: number
          position: number
          processed_cell_count?: number
          processed_row_count?: number
          processing_status?: Database["public"]["Enums"]["sheet_processing_status"]
          sheet_name: string
          upload_id: string
          used_range?: string | null
          validation_status?: Database["public"]["Enums"]["sheet_validation_status"]
          warnings?: Json
        }
        Update: {
          created_at?: string
          errors?: Json
          extracted_column_count?: number
          extracted_row_count?: number
          formula_cell_count?: number
          id?: string
          is_hidden?: boolean
          merged_cell_ranges?: Json
          populated_cell_count?: number
          position?: number
          processed_cell_count?: number
          processed_row_count?: number
          processing_status?: Database["public"]["Enums"]["sheet_processing_status"]
          sheet_name?: string
          upload_id?: string
          used_range?: string | null
          validation_status?: Database["public"]["Enums"]["sheet_validation_status"]
          warnings?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_organization_for_self: {
        Args: { org_name: string }
        Returns: string
      }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
      org_role_of: {
        Args: { target_org: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
    }
    Enums: {
      extraction_job_status:
        | "pending"
        | "running"
        | "succeeded"
        | "failed"
        | "partially_succeeded"
      extraction_stage:
        | "manifest"
        | "deterministic_parse"
        | "ai_interpretation"
        | "structural_validation"
        | "semantic_validation"
        | "financial_validation"
        | "human_review"
        | "persisted"
      field_status: "present" | "missing" | "ambiguous" | "formula_unresolved"
      issue_review_status:
        | "open"
        | "approved"
        | "corrected"
        | "rejected"
        | "deferred"
      issue_severity: "info" | "warning" | "error" | "blocking"
      org_role: "owner" | "admin" | "member" | "viewer"
      requirement_row_type:
        | "item"
        | "subtotal"
        | "grand_total"
        | "note"
        | "deduction"
        | "adjustment"
      sheet_processing_status:
        | "pending"
        | "processing"
        | "processed"
        | "failed"
        | "skipped_empty"
      sheet_validation_status: "pending" | "valid" | "warnings" | "invalid"
      submission_status:
        | "invited"
        | "uploaded"
        | "processing"
        | "review_required"
        | "approved"
        | "draft_review"
      tender_status:
        | "draft"
        | "processing"
        | "review_required"
        | "active"
        | "completed"
        | "archived"
      upload_status:
        | "uploaded"
        | "queued"
        | "parsing"
        | "ai_interpretation"
        | "validation_required"
        | "partially_processed"
        | "failed"
        | "ready_for_review"
        | "approved"
        | "completed_with_warnings"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T]
