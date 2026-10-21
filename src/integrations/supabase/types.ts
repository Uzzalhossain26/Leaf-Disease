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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      crop_profiles: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name_bn: string
          name_en: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_bn: string
          name_en: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_bn?: string
          name_en?: string
        }
        Relationships: []
      }
      diagnoses: {
        Row: {
          confidence: number | null
          created_at: string
          crop_profile_id: string | null
          id: string
          image_url: string | null
          predicted_class_id: string | null
          top3: Json | null
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          crop_profile_id?: string | null
          id?: string
          image_url?: string | null
          predicted_class_id?: string | null
          top3?: Json | null
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          crop_profile_id?: string | null
          id?: string
          image_url?: string | null
          predicted_class_id?: string | null
          top3?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnoses_crop_profile_id_fkey"
            columns: ["crop_profile_id"]
            isOneToOne: false
            referencedRelation: "crop_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnoses_predicted_class_id_fkey"
            columns: ["predicted_class_id"]
            isOneToOne: false
            referencedRelation: "disease_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnosis_reports: {
        Row: {
          created_at: string
          crop_profile_id: string
          diagnosis_id: string | null
          id: string
          image_url: string
          predicted_class_id: string | null
          status: string
          suggested_class_id: string
        }
        Insert: {
          created_at?: string
          crop_profile_id: string
          diagnosis_id?: string | null
          id?: string
          image_url: string
          predicted_class_id?: string | null
          status?: string
          suggested_class_id: string
        }
        Update: {
          created_at?: string
          crop_profile_id?: string
          diagnosis_id?: string | null
          id?: string
          image_url?: string
          predicted_class_id?: string | null
          status?: string
          suggested_class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnosis_reports_crop_profile_id_fkey"
            columns: ["crop_profile_id"]
            isOneToOne: false
            referencedRelation: "crop_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosis_reports_predicted_class_id_fkey"
            columns: ["predicted_class_id"]
            isOneToOne: false
            referencedRelation: "disease_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosis_reports_suggested_class_id_fkey"
            columns: ["suggested_class_id"]
            isOneToOne: false
            referencedRelation: "disease_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      disease_classes: {
        Row: {
          color_hex: string | null
          crop_profile_id: string
          id: string
          is_healthy: boolean
          name_bn: string
          name_en: string
          prevention_bn: string | null
          sort_order: number
          symptoms_bn: string | null
          treatment_bn: string | null
        }
        Insert: {
          color_hex?: string | null
          crop_profile_id: string
          id?: string
          is_healthy?: boolean
          name_bn: string
          name_en: string
          prevention_bn?: string | null
          sort_order?: number
          symptoms_bn?: string | null
          treatment_bn?: string | null
        }
        Update: {
          color_hex?: string | null
          crop_profile_id?: string
          id?: string
          is_healthy?: boolean
          name_bn?: string
          name_en?: string
          prevention_bn?: string | null
          sort_order?: number
          symptoms_bn?: string | null
          treatment_bn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disease_classes_crop_profile_id_fkey"
            columns: ["crop_profile_id"]
            isOneToOne: false
            referencedRelation: "crop_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_images: {
        Row: {
          created_at: string
          disease_class_id: string
          embedding: Json | null
          id: string
          image_url: string
        }
        Insert: {
          created_at?: string
          disease_class_id: string
          embedding?: Json | null
          id?: string
          image_url: string
        }
        Update: {
          created_at?: string
          disease_class_id?: string
          embedding?: Json | null
          id?: string
          image_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_images_disease_class_id_fkey"
            columns: ["disease_class_id"]
            isOneToOne: false
            referencedRelation: "disease_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      app_role: "admin" | "user"
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

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
