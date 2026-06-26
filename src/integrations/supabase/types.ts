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
      appointments: {
        Row: {
          created_at: string
          created_via: string
          id: string
          insurance_snapshot: Json | null
          patient_id: string
          provider_id: string
          reason: string | null
          slot_id: string | null
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          created_via?: string
          id?: string
          insurance_snapshot?: Json | null
          patient_id: string
          provider_id: string
          reason?: string | null
          slot_id?: string | null
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          created_via?: string
          id?: string
          insurance_snapshot?: Json | null
          patient_id?: string
          provider_id?: string
          reason?: string | null
          slot_id?: string | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount_cents: number
          appointment_id: string | null
          id: string
          issued_at: string
          line_items: Json
          patient_id: string
          status: string
        }
        Insert: {
          amount_cents: number
          appointment_id?: string | null
          id?: string
          issued_at?: string
          line_items?: Json
          patient_id: string
          status?: string
        }
        Update: {
          amount_cents?: number
          appointment_id?: string | null
          id?: string
          issued_at?: string
          line_items?: Json
          patient_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          agent_session_id: string | null
          ended_at: string | null
          human_transfer_requested: boolean
          id: string
          outcome: string | null
          patient_id: string | null
          scenario: string
          started_at: string
          transcript: Json
          transfer_reason: string | null
        }
        Insert: {
          agent_session_id?: string | null
          ended_at?: string | null
          human_transfer_requested?: boolean
          id?: string
          outcome?: string | null
          patient_id?: string | null
          scenario: string
          started_at?: string
          transcript?: Json
          transfer_reason?: string | null
        }
        Update: {
          agent_session_id?: string | null
          ended_at?: string | null
          human_transfer_requested?: boolean
          id?: string
          outcome?: string | null
          patient_id?: string | null
          scenario?: string
          started_at?: string
          transcript?: Json
          transfer_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      eobs: {
        Row: {
          bill_id: string
          denial_reason: string | null
          id: string
          patient_responsibility_cents: number
          payer_paid_cents: number
          plain_language_summary: string | null
        }
        Insert: {
          bill_id: string
          denial_reason?: string | null
          id?: string
          patient_responsibility_cents?: number
          payer_paid_cents?: number
          plain_language_summary?: string | null
        }
        Update: {
          bill_id?: string
          denial_reason?: string | null
          id?: string
          patient_responsibility_cents?: number
          payer_paid_cents?: number
          plain_language_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eobs_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_profiles: {
        Row: {
          copay_cents: number | null
          group_id: string | null
          id: string
          member_id: string | null
          patient_id: string
          payer: string
          plan: string | null
          referral_required: boolean
        }
        Insert: {
          copay_cents?: number | null
          group_id?: string | null
          id?: string
          member_id?: string | null
          patient_id: string
          payer: string
          plan?: string | null
          referral_required?: boolean
        }
        Update: {
          copay_cents?: number | null
          group_id?: string | null
          id?: string
          member_id?: string | null
          patient_id?: string
          payer?: string
          plan?: string | null
          referral_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "insurance_profiles_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          accessibility_notes: string | null
          created_at: string
          dob: string
          full_name: string
          id: string
          mock_phone: string | null
          persona_note: string | null
          preferred_language: string
          primary_provider_id: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          created_at?: string
          dob: string
          full_name: string
          id?: string
          mock_phone?: string | null
          persona_note?: string | null
          preferred_language?: string
          primary_provider_id?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          created_at?: string
          dob?: string
          full_name?: string
          id?: string
          mock_phone?: string | null
          persona_note?: string | null
          preferred_language?: string
          primary_provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_primary_provider_id_fkey"
            columns: ["primary_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_referrals: {
        Row: {
          primary_id: string
          specialist_id: string
        }
        Insert: {
          primary_id: string
          specialist_id: string
        }
        Update: {
          primary_id?: string
          specialist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_referrals_primary_id_fkey"
            columns: ["primary_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_referrals_specialist_id_fkey"
            columns: ["specialist_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          accepts_insurance: string[]
          id: string
          is_primary: boolean
          location: string
          name: string
          npi_mock: string | null
          specialty: string
        }
        Insert: {
          accepts_insurance?: string[]
          id?: string
          is_primary?: boolean
          location: string
          name: string
          npi_mock?: string | null
          specialty: string
        }
        Update: {
          accepts_insurance?: string[]
          id?: string
          is_primary?: boolean
          location?: string
          name?: string
          npi_mock?: string | null
          specialty?: string
        }
        Relationships: []
      }
      pt_feedback: {
        Row: {
          adherence: string | null
          appointment_id: string | null
          comment: string | null
          id: string
          mobility_change: string | null
          pain_0_10: number | null
          patient_id: string
          recorded_at: string
        }
        Insert: {
          adherence?: string | null
          appointment_id?: string | null
          comment?: string | null
          id?: string
          mobility_change?: string | null
          pain_0_10?: number | null
          patient_id: string
          recorded_at?: string
        }
        Update: {
          adherence?: string | null
          appointment_id?: string | null
          comment?: string | null
          id?: string
          mobility_change?: string | null
          pain_0_10?: number | null
          patient_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pt_feedback_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_feedback_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_calls: {
        Row: {
          context: Json
          due_at: string
          id: string
          patient_id: string
          scenario: string
          status: string
        }
        Insert: {
          context?: Json
          due_at?: string
          id?: string
          patient_id: string
          scenario: string
          status?: string
        }
        Update: {
          context?: Json
          due_at?: string
          id?: string
          patient_id?: string
          scenario?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_calls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      slots: {
        Row: {
          ends_at: string
          id: string
          provider_id: string
          starts_at: string
          status: string
        }
        Insert: {
          ends_at: string
          id?: string
          provider_id: string
          starts_at: string
          status?: string
        }
        Update: {
          ends_at?: string
          id?: string
          provider_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "slots_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
