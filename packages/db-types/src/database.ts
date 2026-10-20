
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
            "calendars": {
                  Row: {
                    "access_role": string | null,"color": string | null,"created_at": string,"google_calendar_id": string,"id": string,"is_primary": boolean,"last_full_sync_at": string | null,"last_sync_at": string | null,"summary": string | null,"sync_enabled": boolean,"user_id": string
                  }
                  Insert: {
                    "access_role"?: string | null,"color"?: string | null,"created_at"?: string,"google_calendar_id": string,"id"?: string,"is_primary"?: boolean,"last_full_sync_at"?: string | null,"last_sync_at"?: string | null,"summary"?: string | null,"sync_enabled"?: boolean,"user_id": string
                  }
                  Update: {
                    "access_role"?: string | null,"color"?: string | null,"created_at"?: string,"google_calendar_id"?: string,"id"?: string,"is_primary"?: boolean,"last_full_sync_at"?: string | null,"last_sync_at"?: string | null,"summary"?: string | null,"sync_enabled"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"color_rules": {
                  Row: {
                    "color_key": string,"points": number,"primary_for_points": boolean,"user_id": string
                  }
                  Insert: {
                    "color_key": string,"points": number,"primary_for_points"?: boolean,"user_id": string
                  }
                  Update: {
                    "color_key"?: string,"points"?: number,"primary_for_points"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"day_boundary_hour": number,"deadline_warning_days": number,"evening_reminder_time": string,"google_item_type": string,"id": string,"include_all_day": boolean,"morning_prompt_time": string,"name": string | null,"onboarded_at": string | null,"timezone": string,"week_start": number,"writeback_checkmark": boolean
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"day_boundary_hour"?: number,"deadline_warning_days"?: number,"evening_reminder_time"?: string,"google_item_type"?: string,"id": string,"include_all_day"?: boolean,"morning_prompt_time"?: string,"name"?: string | null,"onboarded_at"?: string | null,"timezone"?: string,"week_start"?: number,"writeback_checkmark"?: boolean
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"day_boundary_hour"?: number,"deadline_warning_days"?: number,"evening_reminder_time"?: string,"google_item_type"?: string,"id"?: string,"include_all_day"?: boolean,"morning_prompt_time"?: string,"name"?: string | null,"onboarded_at"?: string | null,"timezone"?: string,"week_start"?: number,"writeback_checkmark"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"task_lists": {
                  Row: {
                    "created_at": string,"google_tasklist_id": string,"id": string,"last_sync_at": string | null,"points": number,"sync_enabled": boolean,"title": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"google_tasklist_id": string,"id"?: string,"last_sync_at"?: string | null,"points"?: number,"sync_enabled"?: boolean,"title"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"google_tasklist_id"?: string,"id"?: string,"last_sync_at"?: string | null,"points"?: number,"sync_enabled"?: boolean,"title"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "google_connection":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"is_valid_timezone":
{ Args: { "tz": string }; Returns: boolean
                           },
"svc_consume_oauth_state":
{ Args: { "p_nonce": string }; Returns: {
              "code_verifier": string,"user_id": string
            }[]
                           },
"svc_create_oauth_state":
{ Args: { "p_code_verifier": string,"p_nonce": string,"p_ttl_seconds"?: number,"p_user_id": string }; Returns: undefined
                           },
"svc_get_google_account":
{ Args: { "p_user_id": string }; Returns: {
              "access_expires_at": string,"access_token_enc": string,"email": string,"google_sub": string,"refresh_token_enc": string,"scopes": (string)[],"status": string
            }[]
                           },
"svc_save_google_account":
{ Args: { "p_access_expires_at": string,"p_access_token_enc": string,"p_email": string,"p_google_sub": string,"p_refresh_token_enc": string,"p_scopes": (string)[],"p_user_id": string }; Returns: undefined
                           },
"svc_update_google_tokens":
{ Args: { "p_access_expires_at": string,"p_access_token_enc": string,"p_status": string,"p_user_id": string }; Returns: undefined
                           },
"svc_upsert_calendars":
{ Args: { "p_calendars": Json,"p_user_id": string }; Returns: undefined
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
            
          }
        }
} as const

