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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          accent: string
          completed_retention_days: number | null
          created_at: string
          icon: string | null
          id: string
          is_pinned: boolean
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent?: string
          completed_retention_days?: number | null
          created_at?: string
          icon?: string | null
          id?: string
          is_pinned?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent?: string
          completed_retention_days?: number | null
          created_at?: string
          icon?: string | null
          id?: string
          is_pinned?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deletion_log: {
        Row: {
          completed_at: string | null
          content_snapshot: string
          deleted_at: string
          id: string
          message_created_at: string | null
          message_id: string
          reason: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          content_snapshot: string
          deleted_at?: string
          id?: string
          message_created_at?: string | null
          message_id: string
          reason?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          content_snapshot?: string
          deleted_at?: string
          id?: string
          message_created_at?: string | null
          message_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      message_revisions: {
        Row: {
          change_reason: string
          changed_by: string
          content: string
          content_html: string | null
          created_at: string
          id: string
          message_id: string
          revision_number: number
          user_id: string
        }
        Insert: {
          change_reason?: string
          changed_by?: string
          content: string
          content_html?: string | null
          created_at?: string
          id?: string
          message_id: string
          revision_number: number
          user_id: string
        }
        Update: {
          change_reason?: string
          changed_by?: string
          content?: string
          content_html?: string | null
          created_at?: string
          id?: string
          message_id?: string
          revision_number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_revisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_revisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_tags: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          message_id: string
          source: string
          status: string
          tag_id: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          message_id: string
          source?: string
          status?: string
          tag_id: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          message_id?: string
          source?: string
          status?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_tags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_tags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_cleaned: boolean
          ai_context: Json
          ai_error: string | null
          ai_fingerprint: string | null
          ai_processed_at: string | null
          ai_status: string
          attachments: Json
          cleaned_content: string | null
          cleaned_content_html: string | null
          completed_at: string | null
          content: string
          content_html: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          due_at: string | null
          due_is_fuzzy: boolean
          edited_at: string | null
          id: string
          is_completed: boolean
          is_pinned: boolean
          metadata: Json
          original_content: string | null
          original_content_html: string | null
          parent_message_id: string | null
          pinned_at: string | null
          remind_at: string | null
          reminder_dismissed_at: string | null
          task_priority: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_cleaned?: boolean
          ai_context?: Json
          ai_error?: string | null
          ai_fingerprint?: string | null
          ai_processed_at?: string | null
          ai_status?: string
          attachments?: Json
          cleaned_content?: string | null
          cleaned_content_html?: string | null
          completed_at?: string | null
          content: string
          content_html?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          due_is_fuzzy?: boolean
          edited_at?: string | null
          id?: string
          is_completed?: boolean
          is_pinned?: boolean
          metadata?: Json
          original_content?: string | null
          original_content_html?: string | null
          parent_message_id?: string | null
          pinned_at?: string | null
          remind_at?: string | null
          reminder_dismissed_at?: string | null
          task_priority?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_cleaned?: boolean
          ai_context?: Json
          ai_error?: string | null
          ai_fingerprint?: string | null
          ai_processed_at?: string | null
          ai_status?: string
          attachments?: Json
          cleaned_content?: string | null
          cleaned_content_html?: string | null
          completed_at?: string | null
          content?: string
          content_html?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          due_at?: string | null
          due_is_fuzzy?: boolean
          edited_at?: string | null
          id?: string
          is_completed?: boolean
          is_pinned?: boolean
          metadata?: Json
          original_content?: string | null
          original_content_html?: string | null
          parent_message_id?: string | null
          pinned_at?: string | null
          remind_at?: string | null
          reminder_dismissed_at?: string | null
          task_priority?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tag_feedback: {
        Row: {
          action: string
          body_snippet: string
          created_at: string
          id: string
          message_id: string | null
          tag_id: string
          user_id: string
        }
        Insert: {
          action: string
          body_snippet?: string
          created_at?: string
          id?: string
          message_id?: string | null
          tag_id: string
          user_id: string
        }
        Update: {
          action?: string
          body_snippet?: string
          created_at?: string
          id?: string
          message_id?: string | null
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_feedback_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_groups: {
        Row: {
          color: string | null
          context: string
          conversation_id: string
          created_at: string
          id: string
          is_collapsed: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          context?: string
          conversation_id: string
          created_at?: string
          id?: string
          is_collapsed?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          context?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_collapsed?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_groups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_suggestions: {
        Row: {
          conversation_id: string
          created_at: string
          evidence_count: number
          id: string
          kind: string
          message_ids: string[]
          name: string
          normalized_name: string
          reason: string
          status: string
          suggested_group_id: string | null
          suggested_group_name: string | null
          tag_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          evidence_count?: number
          id?: string
          kind?: string
          message_ids?: string[]
          name: string
          normalized_name: string
          reason?: string
          status?: string
          suggested_group_id?: string | null
          suggested_group_name?: string | null
          tag_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          evidence_count?: number
          id?: string
          kind?: string
          message_ids?: string[]
          name?: string
          normalized_name?: string
          reason?: string
          status?: string
          suggested_group_id?: string | null
          suggested_group_name?: string | null
          tag_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_suggestions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_suggestions_suggested_group_id_fkey"
            columns: ["suggested_group_id"]
            isOneToOne: false
            referencedRelation: "tag_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_suggestions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          accept_count: number
          auto_apply: boolean
          auto_apply_override: boolean | null
          color: string | null
          context: string
          conversation_id: string
          created_at: string
          graduated_at: string | null
          graduation_ack_at: string | null
          group_id: string | null
          id: string
          is_enabled: boolean
          is_pinned: boolean
          last_decision_at: string | null
          match_keywords: string[]
          maturity: string
          name: string
          normalized_name: string
          reject_count: number
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accept_count?: number
          auto_apply?: boolean
          auto_apply_override?: boolean | null
          color?: string | null
          context?: string
          conversation_id: string
          created_at?: string
          graduated_at?: string | null
          graduation_ack_at?: string | null
          group_id?: string | null
          id?: string
          is_enabled?: boolean
          is_pinned?: boolean
          last_decision_at?: string | null
          match_keywords?: string[]
          maturity?: string
          name: string
          normalized_name: string
          reject_count?: number
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accept_count?: number
          auto_apply?: boolean
          auto_apply_override?: boolean | null
          color?: string | null
          context?: string
          conversation_id?: string
          created_at?: string
          graduated_at?: string | null
          graduation_ack_at?: string | null
          group_id?: string | null
          id?: string
          is_enabled?: boolean
          is_pinned?: boolean
          last_decision_at?: string | null
          match_keywords?: string[]
          maturity?: string
          name?: string
          normalized_name?: string
          reject_count?: number
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tag_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          completed_retention_days: number | null
          created_at: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_retention_days?: number | null
          created_at?: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_retention_days?: number | null
          created_at?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      task_messages: {
        Row: {
          completed_at: string | null
          content: string | null
          content_html: string | null
          conversation_id: string | null
          created_at: string | null
          due_at: string | null
          due_is_fuzzy: boolean | null
          id: string | null
          is_completed: boolean | null
          is_overdue: boolean | null
          is_pinned: boolean | null
          metadata: Json | null
          parent_message_id: string | null
          task_priority: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          content?: string | null
          content_html?: string | null
          conversation_id?: string | null
          created_at?: string | null
          due_at?: string | null
          due_is_fuzzy?: boolean | null
          id?: string | null
          is_completed?: boolean | null
          is_overdue?: never
          is_pinned?: boolean | null
          metadata?: Json | null
          parent_message_id?: string | null
          task_priority?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          content?: string | null
          content_html?: string | null
          conversation_id?: string | null
          created_at?: string | null
          due_at?: string | null
          due_is_fuzzy?: boolean | null
          id?: string | null
          is_completed?: boolean | null
          is_overdue?: never
          is_pinned?: boolean | null
          metadata?: Json | null
          parent_message_id?: string | null
          task_priority?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "task_messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      group_message_counts: {
        Args: { p_conversation_id: string }
        Returns: {
          group_id: string
          message_count: number
        }[]
      }
      revert_message: {
        Args: { p_message_id: string; p_revision: number }
        Returns: undefined
      }
      tag_message_counts: {
        Args: { p_conversation_id: string }
        Returns: {
          message_count: number
          tag_id: string
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
