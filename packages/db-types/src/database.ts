
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
            "areas": {
                  Row: {
                    "archived_at": string | null,"color": string | null,"created_at": string,"id": string,"name": string,"sort_order": number,"user_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"color"?: string | null,"created_at"?: string,"id"?: string,"name": string,"sort_order"?: number,"user_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"color"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"calendars": {
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
                },"daily_notes": {
                  Row: {
                    "body": string,"logical_date": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "body"?: string,"logical_date": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"logical_date"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"day_summaries": {
                  Row: {
                    "band": string,"counts": boolean | null,"done_points": number,"finalized_at": string,"logical_date": string,"missed_points": number,"planned_points": number,"rest_pass_used": boolean | null,"streak_after": number | null,"success_rate": number,"user_id": string
                  }
                  Insert: {
                    "band": string,"counts"?: boolean | null,"done_points": number,"finalized_at"?: string,"logical_date": string,"missed_points": number,"planned_points": number,"rest_pass_used"?: boolean | null,"streak_after"?: number | null,"success_rate": number,"user_id": string
                  }
                  Update: {
                    "band"?: string,"counts"?: boolean | null,"done_points"?: number,"finalized_at"?: string,"logical_date"?: string,"missed_points"?: number,"planned_points"?: number,"rest_pass_used"?: boolean | null,"streak_after"?: number | null,"success_rate"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deadline_tags": {
                  Row: {
                    "deadline_id": string,"tag_id": string
                  }
                  Insert: {
                    "deadline_id": string,"tag_id": string
                  }
                  Update: {
                    "deadline_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deadline_tags_deadline_id_fkey"
      columns: ["deadline_id"]
isOneToOne: false
      referencedRelation: "deadlines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deadline_tags_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
                  ]
                },"deadlines": {
                  Row: {
                    "area_id": string | null,"completed_at": string | null,"created_at": string,"due_date": string,"id": string,"notes": string,"progress_pct": number,"start_date": string,"status": string,"target_minutes": number | null,"target_sessions": number | null,"title": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "area_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date": string,"id"?: string,"notes"?: string,"progress_pct"?: number,"start_date": string,"status"?: string,"target_minutes"?: number | null,"target_sessions"?: number | null,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "area_id"?: string | null,"completed_at"?: string | null,"created_at"?: string,"due_date"?: string,"id"?: string,"notes"?: string,"progress_pct"?: number,"start_date"?: string,"status"?: string,"target_minutes"?: number | null,"target_sessions"?: number | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deadlines_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id"]
    }
                  ]
                },"habits": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"area_id": string | null,"created_at": string,"id": string,"points": number,"title": string,"user_id": string,"weekdays": number
                  }
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"area_id"?: string | null,"created_at"?: string,"id"?: string,"points": number,"title": string,"user_id": string,"weekdays"?: number
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"area_id"?: string | null,"created_at"?: string,"id"?: string,"points"?: number,"title"?: string,"user_id"?: string,"weekdays"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "habits_area_id_fkey"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id"]
    }
                  ]
                },"item_deadlines": {
                  Row: {
                    "deadline_id": string,"item_id": string
                  }
                  Insert: {
                    "deadline_id": string,"item_id": string
                  }
                  Update: {
                    "deadline_id"?: string,"item_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_deadlines_deadline_id_fkey"
      columns: ["deadline_id"]
isOneToOne: false
      referencedRelation: "deadlines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_deadlines_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
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
                    "actual_minutes": number | null,"area_id": string | null,"calendar_id": string | null,"color_key": string | null,"completed_at": string | null,"created_at": string,"end_at": string | null,"finalized": boolean,"google_active": boolean,"google_etag": string | null,"google_event_id": string | null,"google_seen_at": string | null,"google_task_id": string | null,"google_updated_at": string | null,"habit_id": string | null,"id": string,"inbox_state": string,"is_all_day": boolean,"logical_date": string | null,"marked_late": boolean,"miss_reason": string | null,"planned_minutes": number | null,"points": number,"raw_title": string | null,"recurring_event_id": string | null,"rescheduled_from_id": string | null,"source": string,"start_at": string | null,"status": string,"task_list_id": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "actual_minutes"?: number | null,"area_id"?: string | null,"calendar_id"?: string | null,"color_key"?: string | null,"completed_at"?: string | null,"created_at"?: string,"end_at"?: string | null,"finalized"?: boolean,"google_active"?: boolean,"google_etag"?: string | null,"google_event_id"?: string | null,"google_seen_at"?: string | null,"google_task_id"?: string | null,"google_updated_at"?: string | null,"habit_id"?: string | null,"id"?: string,"inbox_state"?: string,"is_all_day"?: boolean,"logical_date"?: string | null,"marked_late"?: boolean,"miss_reason"?: string | null,"planned_minutes"?: number | null,"points": number,"raw_title"?: string | null,"recurring_event_id"?: string | null,"rescheduled_from_id"?: string | null,"source": string,"start_at"?: string | null,"status"?: string,"task_list_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "actual_minutes"?: number | null,"area_id"?: string | null,"calendar_id"?: string | null,"color_key"?: string | null,"completed_at"?: string | null,"created_at"?: string,"end_at"?: string | null,"finalized"?: boolean,"google_active"?: boolean,"google_etag"?: string | null,"google_event_id"?: string | null,"google_seen_at"?: string | null,"google_task_id"?: string | null,"google_updated_at"?: string | null,"habit_id"?: string | null,"id"?: string,"inbox_state"?: string,"is_all_day"?: boolean,"logical_date"?: string | null,"marked_late"?: boolean,"miss_reason"?: string | null,"planned_minutes"?: number | null,"points"?: number,"raw_title"?: string | null,"recurring_event_id"?: string | null,"rescheduled_from_id"?: string | null,"source"?: string,"start_at"?: string | null,"status"?: string,"task_list_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_area_fk"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_calendar_id_fkey"
      columns: ["calendar_id"]
isOneToOne: false
      referencedRelation: "calendars"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_habit_fk"
      columns: ["habit_id"]
isOneToOne: false
      referencedRelation: "habits"
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
                },"streak_state": {
                  Row: {
                    "best": number,"computed_through": string | null,"current": number,"user_id": string
                  }
                  Insert: {
                    "best"?: number,"computed_through"?: string | null,"current"?: number,"user_id": string
                  }
                  Update: {
                    "best"?: number,"computed_through"?: string | null,"current"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"suggestions": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string,"state": string,"tag_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"state"?: string,"tag_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"state"?: string,"tag_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suggestions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "suggestions_tag_id_fkey"
      columns: ["tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["id"]
    }
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
                    {
      foreignKeyName: "tags_area_fk"
      columns: ["area_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id"]
    }
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
                },"weekly_notes": {
                  Row: {
                    "body": string,"updated_at": string,"user_id": string,"week_start": string
                  }
                  Insert: {
                    "body"?: string,"updated_at"?: string,"user_id"?: string,"week_start": string
                  }
                  Update: {
                    "body"?: string,"updated_at"?: string,"user_id"?: string,"week_start"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_suggestion":
{ Args: { "p_id": string }; Returns: undefined
                           },
"analytics_areas":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"analytics_heatmap":
{ Args: { "p_year": number }; Returns: Json
                           },
"analytics_misses":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"analytics_trend":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"backlog":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"busy_blocks":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"calendar_range":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"complete_item":
{ Args: { "p_actual_minutes"?: number,"p_id": string }; Returns: Json
                           },
"create_manual_task":
{ Args: { "p_area_id"?: string,"p_date"?: string,"p_planned_minutes"?: number,"p_points": number,"p_tags"?: (string)[],"p_title": string }; Returns: Json
                           },
"day_view":
{ Args: { "p_date"?: string }; Returns: Json
                           },
"days_range":
{ Args: { "p_from": string,"p_to": string }; Returns: Json
                           },
"deadline_stats":
{ Args: { "p_id"?: string }; Returns: Json
                           },
"delete_manual_task":
{ Args: { "p_id": string }; Returns: undefined
                           },
"dismiss_all_missed":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"dismiss_missed":
{ Args: { "p_id": string }; Returns: undefined
                           },
"dismiss_suggestion":
{ Args: { "p_id": string }; Returns: undefined
                           },
"google_connection":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"is_valid_timezone":
{ Args: { "tz": string }; Returns: boolean
                           },
"mark_late_done":
{ Args: { "p_id": string }; Returns: Json
                           },
"missed_inbox":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"months_summary":
{ Args: { "p_year": number }; Returns: Json
                           },
"ping":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_sync":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reschedule_manual":
{ Args: { "p_date": string,"p_id": string }; Returns: Json
                           },
"score_band":
{ Args: { "p_rate": number }; Returns: string
                           },
"set_item_links":
{ Args: { "p_deadlines": (string)[],"p_id": string,"p_tags": (string)[] }; Returns: Json
                           },
"streak":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"svc_app_context":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"svc_apply_app_ops":
{ Args: { "p_calendar_id": string,"p_ops": Json }; Returns: Json
                           },
"svc_apply_sync_ops":
{ Args: { "p_calendar_id": string,"p_ops": Json,"p_seen"?: (string)[] }; Returns: Json
                           },
"svc_channel_get":
{ Args: { "p_id": string }; Returns: Json
                           },
"svc_channel_save":
{ Args: { "p_calendar_id": string,"p_expires_at": string,"p_id": string,"p_resource_id": string,"p_token_hash": string,"p_user_id": string }; Returns: undefined
                           },
"svc_channel_stopped":
{ Args: { "p_id": string }; Returns: undefined
                           },
"svc_consume_oauth_state":
{ Args: { "p_nonce": string }; Returns: {
              "code_verifier": string,"user_id": string
            }[]
                           },
"svc_create_oauth_state":
{ Args: { "p_code_verifier": string,"p_nonce": string,"p_ttl_seconds"?: number,"p_user_id": string }; Returns: undefined
                           },
"svc_edit_context":
{ Args: { "p_item_id": string,"p_user_id": string }; Returns: Json
                           },
"svc_get_google_account":
{ Args: { "p_user_id": string }; Returns: {
              "access_expires_at": string,"access_token_enc": string,"email": string,"google_sub": string,"refresh_token_enc": string,"scopes": (string)[],"status": string
            }[]
                           },
"svc_item_links":
{ Args: { "p_item_id": string }; Returns: Json
                           },
"svc_mark_push_unsupported":
{ Args: { "p_calendar_id": string,"p_reason": string }; Returns: undefined
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
"svc_queue_sync":
{ Args: { "p_calendar_id": string }; Returns: undefined
                           },
"svc_reschedule_abort":
{ Args: { "p_item_id": string }; Returns: undefined
                           },
"svc_reschedule_commit":
{ Args: { "p_etag": string,"p_item_id": string }; Returns: undefined
                           },
"svc_reschedule_prepare":
{ Args: { "p_end": string,"p_id": string,"p_start": string,"p_user_id": string }; Returns: Json
                           },
"svc_save_google_account":
{ Args: { "p_access_expires_at": string,"p_access_token_enc": string,"p_email"?: string,"p_google_sub": string,"p_refresh_token_enc"?: string,"p_scopes": (string)[],"p_user_id": string }; Returns: undefined
                           },
"svc_schedule_abort":
{ Args: { "p_date": string,"p_item_id": string,"p_minutes": number }; Returns: undefined
                           },
"svc_schedule_prepare":
{ Args: { "p_end": string,"p_item_id": string,"p_start": string,"p_user_id": string }; Returns: Json
                           },
"svc_sync_checkpoint":
{ Args: { "p_page_token"?: string,"p_source_id": string }; Returns: undefined
                           },
"svc_sync_fail":
{ Args: { "p_error": string,"p_reset"?: boolean,"p_retry_seconds"?: number,"p_source_id": string }; Returns: number
                           },
"svc_sync_finish":
{ Args: { "p_source_id": string,"p_sync_token"?: string }; Returns: undefined
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
                           },
"svc_watch_context":
{ Args: { "p_calendar_id": string }; Returns: Json
                           },
"svc_write_context":
{ Args: { "p_item_id": string }; Returns: Json
                           },
"svc_write_done":
{ Args: { "p_etag": string,"p_item_id": string,"p_raw_title"?: string }; Returns: undefined
                           },
"unassigned":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"uncomplete_item":
{ Args: { "p_id": string }; Returns: Json
                           },
"update_item_local":
{ Args: { "p_id": string,"p_patch": Json }; Returns: Json
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

