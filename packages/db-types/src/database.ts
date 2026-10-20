
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
                },"item_events": {
                  Row: {
                    "at": string,"id": number,"item_id": string | null,"kind": string,"payload": NonNullable<Json>,"user_id": string
                  }
                  Insert: {
                    "at"?: string,"id"?: number,"item_id"?: string | null,"kind": string,"payload"?: NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "at"?: string,"id"?: number,"item_id"?: string | null,"kind"?: string,"payload"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_events_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"item_tags": {
                  Row: {
                    "item_id": string,"source": string,"tag_id": string
                  }
                  Insert: {
                    "item_id": string,"source": string,"tag_id": string
                  }
                  Update: {
                    "item_id"?: string,"source"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_tags_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "actual_minutes": number | null,"area_id": string | null,"calendar_id": string | null,"completed_at": string | null,"created_at": string,"end_at": string | null,"finalized": boolean,"google_active": boolean,"google_etag": string | null,"google_event_id": string | null,"google_seen_at": string | null,"google_task_id": string | null,"google_updated_at": string | null,"habit_id": string | null,"id": string,"inbox_state": string,"is_all_day": boolean,"logical_date": string | null,"marked_late": boolean,"miss_reason": string | null,"planned_minutes": number | null,"points": number,"raw_title": string | null,"recurring_event_id": string | null,"rescheduled_from_id": string | null,"source": string,"start_at": string | null,"status": string,"task_list_id": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "actual_minutes"?: number | null,"area_id"?: string | null,"calendar_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"end_at"?: string | null,"finalized"?: boolean,"google_active"?: boolean,"google_etag"?: string | null,"google_event_id"?: string | null,"google_seen_at"?: string | null,"google_task_id"?: string | null,"google_updated_at"?: string | null,"habit_id"?: string | null,"id"?: string,"inbox_state"?: string,"is_all_day"?: boolean,"logical_date"?: string | null,"marked_late"?: boolean,"miss_reason"?: string | null,"planned_minutes"?: number | null,"points": number,"raw_title"?: string | null,"recurring_event_id"?: string | null,"rescheduled_from_id"?: string | null,"source": string,"start_at"?: string | null,"status"?: string,"task_list_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "actual_minutes"?: number | null,"area_id"?: string | null,"calendar_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"end_at"?: string | null,"finalized"?: boolean,"google_active"?: boolean,"google_etag"?: string | null,"google_event_id"?: string | null,"google_seen_at"?: string | null,"google_task_id"?: string | null,"google_updated_at"?: string | null,"habit_id"?: string | null,"id"?: string,"inbox_state"?: string,"is_all_day"?: boolean,"logical_date"?: string | null,"marked_late"?: boolean,"miss_reason"?: string | null,"planned_minutes"?: number | null,"points"?: number,"raw_title"?: string | null,"recurring_event_id"?: string | null,"rescheduled_from_id"?: string | null,"source"?: string,"start_at"?: string | null,"status"?: string,"task_list_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_calendar_id_fkey"
      columns: ["calendar_id"]
isOneToOne: false
      referencedRelation: "calendars"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_rescheduled_from_id_fkey"
      columns: ["rescheduled_from_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_task_list_id_fkey"
      columns: ["task_list_id"]
isOneToOne: false
      referencedRelation: "task_lists"
      referencedColumns: ["id"]
    }
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
                },"tags": {
                  Row: {
                    "area_id": string | null,"created_at": string,"id": string,"name": string,"user_id": string
                  }
                  Insert: {
                    "area_id"?: string | null,"created_at"?: string,"id"?: string,"name": string,"user_id": string
                  }
                  Update: {
                    "area_id"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
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
"request_sync":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"svc_apply_sync_ops":
{ Args: { "p_calendar_id": string,"p_ops": Json,"p_seen"?: (string)[] }; Returns: Json
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
"svc_mark_reconnect_needed":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"svc_queue_dead":
{ Args: { "p_error": string,"p_message": Json,"p_msg_id": number,"p_queue": string }; Returns: undefined
                           },
"svc_queue_delete":
{ Args: { "p_msg_id": number,"p_queue": string }; Returns: boolean
                           },
"svc_queue_read":
{ Args: { "p_qty": number,"p_queue": string,"p_vt": number }; Returns: unknown[]
                          SetofOptions: {
        from: "*"
        to: "message_record"
        isOneToOne: false
        isSetofReturn: true
      } },
"svc_save_google_account":
{ Args: { "p_access_expires_at": string,"p_access_token_enc": string,"p_email"?: string,"p_google_sub": string,"p_refresh_token_enc"?: string,"p_scopes": (string)[],"p_user_id": string }; Returns: undefined
                           },
"svc_sync_checkpoint":
{ Args: { "p_page_token": string,"p_source_id": string }; Returns: undefined
                           },
"svc_sync_fail":
{ Args: { "p_error": string,"p_reset"?: boolean,"p_retry_seconds"?: number,"p_source_id": string }; Returns: number
                           },
"svc_sync_finish":
{ Args: { "p_source_id": string,"p_sync_token": string }; Returns: undefined
                           },
"svc_sync_items":
{ Args: { "p_calendar_id": string,"p_event_ids": (string)[] }; Returns: Json[]
                           },
"svc_sync_lease":
{ Args: { "p_lease_seconds"?: number,"p_source_id": string }; Returns: Json
                           },
"svc_sync_unseen":
{ Args: { "p_calendar_id": string }; Returns: Json[]
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

