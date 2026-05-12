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
      app_settings: {
        Row: {
          backfill_status: string
          bridge_secret: string
          daily_send_limit: number
          id: number
          last_backfill_at: string | null
          last_backfill_count: number
          max_delay_sec: number
          min_delay_sec: number
          opt_out_keyword: string
          send_window_end: string
          send_window_start: string
          shopify_webhook_ids: Json
          shopify_webhook_secret: string
          timezone: string
          updated_at: string
        }
        Insert: {
          backfill_status?: string
          bridge_secret?: string
          daily_send_limit?: number
          id?: number
          last_backfill_at?: string | null
          last_backfill_count?: number
          max_delay_sec?: number
          min_delay_sec?: number
          opt_out_keyword?: string
          send_window_end?: string
          send_window_start?: string
          shopify_webhook_ids?: Json
          shopify_webhook_secret?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          backfill_status?: string
          bridge_secret?: string
          daily_send_limit?: number
          id?: number
          last_backfill_at?: string | null
          last_backfill_count?: number
          max_delay_sec?: number
          min_delay_sec?: number
          opt_out_keyword?: string
          send_window_end?: string
          send_window_start?: string
          shopify_webhook_ids?: Json
          shopify_webhook_secret?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      bridge_sessions: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          qr_code: string | null
          sent_today: number
          sent_today_date: string
          session_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          qr_code?: string | null
          sent_today?: number
          sent_today_date?: string
          session_name?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          qr_code?: string | null
          sent_today?: number
          sent_today_date?: string
          session_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fulfillments: {
        Row: {
          created_at: string
          current_status: string | null
          id: string
          last_notified_status: string | null
          order_id: string
          shipment_status: string | null
          shopify_fulfillment_id: string | null
          tracking_company: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_status?: string | null
          id?: string
          last_notified_status?: string | null
          order_id: string
          shipment_status?: string | null
          shopify_fulfillment_id?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_status?: string | null
          id?: string
          last_notified_status?: string | null
          order_id?: string
          shipment_status?: string | null
          shopify_fulfillment_id?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      message_jobs: {
        Row: {
          attempts: number
          body: string
          created_at: string
          event: string | null
          id: string
          last_error: string | null
          order_id: string | null
          phone: string
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          event?: string | null
          id?: string
          last_error?: string | null
          order_id?: string | null
          phone: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          event?: string | null
          id?: string
          last_error?: string | null
          order_id?: string | null
          phone?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          auto_send: boolean
          body: string
          created_at: string
          enabled: boolean
          event: string
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          auto_send?: boolean
          body: string
          created_at?: string
          enabled?: boolean
          event: string
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          auto_send?: boolean
          body?: string
          created_at?: string
          enabled?: boolean
          event?: string
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      opt_outs: {
        Row: {
          opted_out_at: string
          phone: string
        }
        Insert: {
          opted_out_at?: string
          phone: string
        }
        Update: {
          opted_out_at?: string
          phone?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          currency: string | null
          customer_name: string | null
          email: string | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          line_items: Json | null
          notifications_paused: boolean
          payment_type: string | null
          phone: string | null
          shipping_address: Json | null
          shopify_created_at: string | null
          shopify_order_id: string
          shopify_order_number: string | null
          total_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_name?: string | null
          email?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          line_items?: Json | null
          notifications_paused?: boolean
          payment_type?: string | null
          phone?: string | null
          shipping_address?: Json | null
          shopify_created_at?: string | null
          shopify_order_id: string
          shopify_order_number?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_name?: string | null
          email?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          line_items?: Json | null
          notifications_paused?: boolean
          payment_type?: string | null
          phone?: string | null
          shipping_address?: Json | null
          shopify_created_at?: string | null
          shopify_order_id?: string
          shopify_order_number?: string | null
          total_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const
