export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      departments: {
        Row: {
          created_at: string
          default_location_code: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          default_location_code?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          default_location_code?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      ecount_sync_log: {
        Row: {
          attempted: number | null
          detail: Json | null
          error: string | null
          failed: number | null
          id: string
          job: string
          run_at: string
          status: string
          synced: number | null
        }
        Insert: {
          attempted?: number | null
          detail?: Json | null
          error?: string | null
          failed?: number | null
          id?: string
          job: string
          run_at?: string
          status: string
          synced?: number | null
        }
        Update: {
          attempted?: number | null
          detail?: Json | null
          error?: string | null
          failed?: number | null
          id?: string
          job?: string
          run_at?: string
          status?: string
          synced?: number | null
        }
        Relationships: []
      }
      items: {
        Row: {
          created_at: string
          ecount_item_code: string | null
          is_key_item: boolean
          item_category: string | null
          item_code: string
          item_name: string
          lead_time_days: number | null
          material_cost: number | null
          moq: number | null
          primary_supplier_code: string | null
          purchase_type: string
          reorder_point: number | null
          safety_stock: number | null
          spec: string | null
          supplier: string | null
          unit: string
        }
        Insert: {
          created_at?: string
          ecount_item_code?: string | null
          is_key_item?: boolean
          item_category?: string | null
          item_code: string
          item_name: string
          lead_time_days?: number | null
          material_cost?: number | null
          moq?: number | null
          primary_supplier_code?: string | null
          purchase_type?: string
          reorder_point?: number | null
          safety_stock?: number | null
          spec?: string | null
          supplier?: string | null
          unit?: string
        }
        Update: {
          created_at?: string
          ecount_item_code?: string | null
          is_key_item?: boolean
          item_category?: string | null
          item_code?: string
          item_name?: string
          lead_time_days?: number | null
          material_cost?: number | null
          moq?: number | null
          primary_supplier_code?: string | null
          purchase_type?: string
          reorder_point?: number | null
          safety_stock?: number | null
          spec?: string | null
          supplier?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_primary_supplier_code_fkey"
            columns: ["primary_supplier_code"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["code"]
          },
        ]
      }
      locations: {
        Row: {
          code: string
          is_active: boolean
          location_type: string
          name: string
          synced_at: string | null
        }
        Insert: {
          code: string
          is_active?: boolean
          location_type?: string
          name: string
          synced_at?: string | null
        }
        Update: {
          code?: string
          is_active?: boolean
          location_type?: string
          name?: string
          synced_at?: string | null
        }
        Relationships: []
      }
      login_events: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          item_code: string
          source: string
          supplier_code: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          effective_date: string
          id?: string
          item_code: string
          source?: string
          supplier_code?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          item_code?: string
          source?: string
          supplier_code?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["item_code"]
          },
          {
            foreignKeyName: "price_history_supplier_code_fkey"
            columns: ["supplier_code"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          email: string
          id: string
          is_active: boolean
          name: string
          pis_access: boolean
          role: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email: string
          id: string
          is_active?: boolean
          name: string
          pis_access?: boolean
          role?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          pis_access?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_import_log: {
        Row: {
          detail: Json | null
          error: string | null
          filename: string
          id: string
          rows_duplicate: number | null
          rows_inserted: number | null
          rows_parse_failed: number | null
          rows_read: number | null
          rows_skipped_no_item_code: number | null
          run_at: string
          status: string
          uploaded_by: string | null
        }
        Insert: {
          detail?: Json | null
          error?: string | null
          filename: string
          id?: string
          rows_duplicate?: number | null
          rows_inserted?: number | null
          rows_parse_failed?: number | null
          rows_read?: number | null
          rows_skipped_no_item_code?: number | null
          run_at?: string
          status: string
          uploaded_by?: string | null
        }
        Update: {
          detail?: Json | null
          error?: string | null
          filename?: string
          id?: string
          rows_duplicate?: number | null
          rows_inserted?: number | null
          rows_parse_failed?: number | null
          rows_read?: number | null
          rows_skipped_no_item_code?: number | null
          run_at?: string
          status?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_import_log_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_receipt_date: string | null
          amount: number
          buyer: string | null
          confirmed_delivery_date: string | null
          created_at: string
          currency: string
          ecount_synced_at: string | null
          exchange_rate: number | null
          id: string
          item_code: string | null
          item_summary: string | null
          po_date: string
          po_no: string
          purpose: string | null
          qty: number
          receipt_qty: number | null
          requested_delivery_date: string | null
          status: string | null
          supplier_code: string | null
          unit_price: number | null
          vat_amount: number | null
          warehouse_code: string | null
          warehouse_name: string | null
        }
        Insert: {
          actual_receipt_date?: string | null
          amount: number
          buyer?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          currency?: string
          ecount_synced_at?: string | null
          exchange_rate?: number | null
          id?: string
          item_code?: string | null
          item_summary?: string | null
          po_date: string
          po_no: string
          purpose?: string | null
          qty: number
          receipt_qty?: number | null
          requested_delivery_date?: string | null
          status?: string | null
          supplier_code?: string | null
          unit_price?: number | null
          vat_amount?: number | null
          warehouse_code?: string | null
          warehouse_name?: string | null
        }
        Update: {
          actual_receipt_date?: string | null
          amount?: number
          buyer?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          currency?: string
          ecount_synced_at?: string | null
          exchange_rate?: number | null
          id?: string
          item_code?: string | null
          item_summary?: string | null
          po_date?: string
          po_no?: string
          purpose?: string | null
          qty?: number
          receipt_qty?: number | null
          requested_delivery_date?: string | null
          status?: string | null
          supplier_code?: string | null
          unit_price?: number | null
          vat_amount?: number | null
          warehouse_code?: string | null
          warehouse_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["item_code"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_code_fkey"
            columns: ["supplier_code"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["code"]
          },
        ]
      }
      purchase_records: {
        Row: {
          department: string | null
          id: string
          imported_at: string
          item_code: string
          item_name: string
          note: string | null
          purchase_date: string
          qty: number
          row_hash: string
          source_year: number
          supplier_code: string | null
          supplier_name: string
          supply_amount: number
          total_amount: number
          unit_price: number
          vat_amount: number
          voucher_seq: number
        }
        Insert: {
          department?: string | null
          id?: string
          imported_at?: string
          item_code: string
          item_name: string
          note?: string | null
          purchase_date: string
          qty: number
          row_hash: string
          source_year: number
          supplier_code?: string | null
          supplier_name: string
          supply_amount: number
          total_amount: number
          unit_price: number
          vat_amount?: number
          voucher_seq: number
        }
        Update: {
          department?: string | null
          id?: string
          imported_at?: string
          item_code?: string
          item_name?: string
          note?: string | null
          purchase_date?: string
          qty?: number
          row_hash?: string
          source_year?: number
          supplier_code?: string | null
          supplier_name?: string
          supply_amount?: number
          total_amount?: number
          unit_price?: number
          vat_amount?: number
          voucher_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_records_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["item_code"]
          },
          {
            foreignKeyName: "purchase_records_supplier_code_fkey"
            columns: ["supplier_code"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["code"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          dest_location_code: string | null
          id: string
          recipient: string | null
          shipped_at: string | null
          tracking_no: string | null
        }
        Insert: {
          carrier?: string | null
          dest_location_code?: string | null
          id?: string
          recipient?: string | null
          shipped_at?: string | null
          tracking_no?: string | null
        }
        Update: {
          carrier?: string | null
          dest_location_code?: string | null
          id?: string
          recipient?: string | null
          shipped_at?: string | null
          tracking_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_dest_location_code_fkey"
            columns: ["dest_location_code"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["code"]
          },
        ]
      }
      suppliers: {
        Row: {
          code: string
          contact: string | null
          contract_end: string | null
          contract_start: string | null
          country: string | null
          created_at: string
          ecount_supplier_code: string | null
          is_contracted: boolean
          is_domestic: boolean
          min_order_amount: number | null
          name: string
          payment_terms: string | null
        }
        Insert: {
          code: string
          contact?: string | null
          contract_end?: string | null
          contract_start?: string | null
          country?: string | null
          created_at?: string
          ecount_supplier_code?: string | null
          is_contracted?: boolean
          is_domestic?: boolean
          min_order_amount?: number | null
          name: string
          payment_terms?: string | null
        }
        Update: {
          code?: string
          contact?: string | null
          contract_end?: string | null
          contract_start?: string | null
          country?: string | null
          created_at?: string
          ecount_supplier_code?: string | null
          is_contracted?: boolean
          is_domestic?: boolean
          min_order_amount?: number | null
          name?: string
          payment_terms?: string | null
        }
        Relationships: []
      }
      transaction_details: {
        Row: {
          id: string
          item_code: string
          process: string | null
          qty: number
          txn_id: string
        }
        Insert: {
          id?: string
          item_code: string
          process?: string | null
          qty: number
          txn_id: string
        }
        Update: {
          id?: string
          item_code?: string
          process?: string | null
          qty?: number
          txn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_details_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["item_code"]
          },
          {
            foreignKeyName: "transaction_details_txn_id_fkey"
            columns: ["txn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string
          department_id: string | null
          ecount_ref_no: string | null
          ecount_sync_status: string
          from_location_code: string | null
          id: string
          note: string | null
          processed_by: string | null
          reason: string | null
          requested_by: string | null
          shipment_id: string | null
          supplier_code: string | null
          to_location_code: string | null
          txn_date: string
          txn_type: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          ecount_ref_no?: string | null
          ecount_sync_status?: string
          from_location_code?: string | null
          id?: string
          note?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by?: string | null
          shipment_id?: string | null
          supplier_code?: string | null
          to_location_code?: string | null
          txn_date?: string
          txn_type: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          ecount_ref_no?: string | null
          ecount_sync_status?: string
          from_location_code?: string | null
          id?: string
          note?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by?: string | null
          shipment_id?: string | null
          supplier_code?: string | null
          to_location_code?: string | null
          txn_date?: string
          txn_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_from_location_code_fkey"
            columns: ["from_location_code"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_supplier_code_fkey"
            columns: ["supplier_code"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_to_location_code_fkey"
            columns: ["to_location_code"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      stock_by_location: {
        Row: {
          item_code: string | null
          location_code: string | null
          qty_on_hand: number | null
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          delta: number | null
          item_code: string | null
          location_code: string | null
          txn_date: string | null
        }
        Relationships: []
      }
      stock_total: {
        Row: {
          item_code: string | null
          qty_on_hand: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      pis_category_breakdown: {
        Args: never
        Returns: {
          avg_unit_price: number
          category: string
          item_count: number
        }[]
      }
      pis_price_movement_summary: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          earliest_date: string
          earliest_price: number
          item_code: string
          item_name: string
          latest_date: string
          latest_price: number
        }[]
      }
      pis_price_supplier_gaps: {
        Args: { p_prior_start: string; p_recent_start: string }
        Returns: {
          gap_pct: number
          item_code: string
          item_name: string
          max_price: number
          max_supplier: string
          min_price: number
          min_supplier: string
          potential_savings: number
        }[]
      }
      pis_price_yoy_movers: {
        Args: { p_prior_start: string; p_recent_start: string }
        Returns: {
          change_pct: number
          item_code: string
          item_name: string
          prior_avg_price: number
          recent_avg_price: number
        }[]
      }
      pis_purchase_by_category: {
        Args: { p_since: string }
        Returns: {
          amount: number
          category: string
          qty: number
        }[]
      }
      pis_purchase_by_item: {
        Args: { p_since: string; p_top_n?: number }
        Returns: {
          amount: number
          item_code: string
          item_name: string
          qty: number
        }[]
      }
      pis_purchase_by_supplier: {
        Args: { p_since: string; p_top_n?: number }
        Returns: {
          amount: number
          supplier_code: string
          supplier_name: string
        }[]
      }
      pis_purchase_totals: {
        Args: { p_since: string }
        Returns: {
          record_count: number
          records_with_supplier_code: number
          total_amount: number
        }[]
      }
      pis_reorder_candidates: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_usage_window_start: string
        }
        Returns: {
          item_code: string
          item_name: string
          lead_time_days: number
          moq: number
          qty_on_hand: number
          usage_qty: number
        }[]
      }
      pis_standard_cost_variance: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          item_code: string
          item_name: string
          latest_price: number
          material_cost: number
        }[]
      }
      pis_supplier_risk_summary: {
        Args: { p_limit?: number }
        Returns: {
          item_code: string
          item_name: string
          items_with_any_supplier: number
          single_source_item_count: number
          supplier_name: string
        }[]
      }
      pis_year_to_date_comparison: {
        Args: { p_month_day: string; p_start_year: number }
        Returns: {
          amount: number
          year: string
        }[]
      }
      pis_yearly_by_category: {
        Args: { p_top_n?: number }
        Returns: {
          amount: number
          category: string
          total: number
          year: string
        }[]
      }
      pis_yearly_by_item: {
        Args: { p_top_n?: number }
        Returns: {
          amount: number
          item_code: string
          item_name: string
          total: number
          year: string
        }[]
      }
      pis_yearly_by_supplier: {
        Args: { p_top_n?: number }
        Returns: {
          amount: number
          supplier_name: string
          total: number
          year: string
        }[]
      }
      pis_yearly_totals: {
        Args: never
        Returns: {
          amount: number
          record_count: number
          year: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
