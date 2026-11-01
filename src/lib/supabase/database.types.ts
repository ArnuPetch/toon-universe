
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
            "bookshelf_entries": {
                  Row: {
                    "created_at": string,"series_id": number,"status": Database["public"]['Enums']["bookshelf_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"series_id": number,"status": Database["public"]['Enums']["bookshelf_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"series_id"?: number,"status"?: Database["public"]['Enums']["bookshelf_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookshelf_entries_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookshelf_entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"coin_ledger": {
                  Row: {
                    "created_at": string,"delta": number,"donation_id": number | null,"id": number,"kind": Database["public"]['Enums']["coin_kind"],"note": string | null,"purchase_id": number | null,"reason": Database["public"]['Enums']["coin_ledger_reason"],"unlock_id": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"delta": number,"donation_id"?: number | null,"id"?: never,"kind": Database["public"]['Enums']["coin_kind"],"note"?: string | null,"purchase_id"?: number | null,"reason": Database["public"]['Enums']["coin_ledger_reason"],"unlock_id"?: number | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"delta"?: number,"donation_id"?: number | null,"id"?: never,"kind"?: Database["public"]['Enums']["coin_kind"],"note"?: string | null,"purchase_id"?: number | null,"reason"?: Database["public"]['Enums']["coin_ledger_reason"],"unlock_id"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coin_ledger_donation_id_fkey"
      columns: ["donation_id"]
isOneToOne: false
      referencedRelation: "donations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_ledger_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "coin_purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_ledger_unlock_id_fkey"
      columns: ["unlock_id"]
isOneToOne: false
      referencedRelation: "episode_unlocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_ledger_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"coin_packs": {
                  Row: {
                    "coins": number,"id": number,"is_active": boolean,"price_satang": number,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "coins": number,"id"?: never,"is_active"?: boolean,"price_satang": number,"sort_order"?: number
                  }
                  Update: {
                    "coins"?: number,"id"?: never,"is_active"?: boolean,"price_satang"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"coin_purchases": {
                  Row: {
                    "amount_satang": number,"coins": number,"created_at": string,"id": number,"pack_id": number,"paid_at": string | null,"status": Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_satang": number,"coins": number,"created_at"?: string,"id"?: never,"pack_id": number,"paid_at"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "amount_satang"?: number,"coins"?: number,"created_at"?: string,"id"?: never,"pack_id"?: number,"paid_at"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coin_purchases_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "coin_packs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_purchases_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"coin_wallets": {
                  Row: {
                    "purchased_balance": number,"updated_at": string,"user_id": string,"welcome_balance": number,"welcome_expires_at": string | null,"welcome_granted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "purchased_balance"?: number,"updated_at"?: string,"user_id": string,"welcome_balance"?: number,"welcome_expires_at"?: string | null,"welcome_granted_at"?: string | null
                  }
                  Update: {
                    "purchased_balance"?: number,"updated_at"?: string,"user_id"?: string,"welcome_balance"?: number,"welcome_expires_at"?: string | null,"welcome_granted_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "coin_wallets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "body": string,"created_at": string,"deleted_at": string | null,"episode_id": number | null,"hidden_at": string | null,"id": number,"is_spoiler": boolean,"parent_id": number | null,"series_id": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"deleted_at"?: string | null,"episode_id"?: number | null,"hidden_at"?: string | null,"id"?: never,"is_spoiler"?: boolean,"parent_id"?: number | null,"series_id": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"deleted_at"?: string | null,"episode_id"?: number | null,"hidden_at"?: string | null,"id"?: never,"is_spoiler"?: boolean,"parent_id"?: number | null,"series_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_episode_id_series_id_fkey"
      columns: ["episode_id","series_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id","series_id"]
    },{
      foreignKeyName: "comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"content_holds": {
                  Row: {
                    "compensated_at": string | null,"created_by": string | null,"ended_at": string | null,"id": number,"reason": string,"series_id": number,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "compensated_at"?: string | null,"created_by"?: string | null,"ended_at"?: string | null,"id"?: never,"reason": string,"series_id": number,"started_at"?: string
                  }
                  Update: {
                    "compensated_at"?: string | null,"created_by"?: string | null,"ended_at"?: string | null,"id"?: never,"reason"?: string,"series_id"?: number,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_holds_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_holds_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    }
                  ]
                },"donations": {
                  Row: {
                    "amount": number,"created_at": string,"from_user_id": string,"id": number,"message": string | null,"refunded_at": string | null,"series_id": number | null,"to_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"from_user_id": string,"id"?: never,"message"?: string | null,"refunded_at"?: string | null,"series_id"?: number | null,"to_user_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"from_user_id"?: string,"id"?: never,"message"?: string | null,"refunded_at"?: string | null,"series_id"?: number | null,"to_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "donations_from_user_id_fkey"
      columns: ["from_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donations_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "donations_to_user_id_fkey"
      columns: ["to_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"episode_pages": {
                  Row: {
                    "created_at": string,"episode_id": number,"height": number | null,"id": number,"page_number": number,"storage_key": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"episode_id": number,"height"?: number | null,"id"?: never,"page_number": number,"storage_key": string,"width"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"episode_id"?: number,"height"?: number | null,"id"?: never,"page_number"?: number,"storage_key"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "episode_pages_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    }
                  ]
                },"episode_unlocks": {
                  Row: {
                    "episode_id": number,"expires_at": string,"id": number,"price": number,"purchased_coins_used": number,"refunded_at": string | null,"series_id": number,"unlocked_at": string,"user_id": string,"welcome_coins_used": number
                  }
                  ComputedFields: never
                  Insert: {
                    "episode_id": number,"expires_at": string,"id"?: never,"price": number,"purchased_coins_used": number,"refunded_at"?: string | null,"series_id": number,"unlocked_at"?: string,"user_id": string,"welcome_coins_used": number
                  }
                  Update: {
                    "episode_id"?: number,"expires_at"?: string,"id"?: never,"price"?: number,"purchased_coins_used"?: number,"refunded_at"?: string | null,"series_id"?: number,"unlocked_at"?: string,"user_id"?: string,"welcome_coins_used"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "episode_unlocks_episode_id_series_id_fkey"
      columns: ["episode_id","series_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id","series_id"]
    },{
      foreignKeyName: "episode_unlocks_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"episode_view_daily": {
                  Row: {
                    "episode_id": number,"series_id": number,"view_date": string,"views": number
                  }
                  ComputedFields: never
                  Insert: {
                    "episode_id": number,"series_id": number,"view_date": string,"views"?: number
                  }
                  Update: {
                    "episode_id"?: number,"series_id"?: number,"view_date"?: string,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "episode_view_daily_episode_id_series_id_fkey"
      columns: ["episode_id","series_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id","series_id"]
    }
                  ]
                },"episodes": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": number,"number": number,"page_count": number,"price": number,"price_changed_at": string | null,"publish_at": string | null,"season_id": number | null,"series_id": number,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: never,"number": number,"page_count"?: number,"price"?: number,"price_changed_at"?: string | null,"publish_at"?: string | null,"season_id"?: number | null,"series_id": number,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: never,"number"?: number,"page_count"?: number,"price"?: number,"price_changed_at"?: string | null,"publish_at"?: string | null,"season_id"?: number | null,"series_id"?: number,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "episodes_season_id_series_id_fkey"
      columns: ["season_id","series_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id","series_id"]
    },{
      foreignKeyName: "episodes_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    }
                  ]
                },"genres": {
                  Row: {
                    "id": number,"name_en": string,"name_th": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"name_en": string,"name_th": string,"slug": string
                  }
                  Update: {
                    "id"?: never,"name_en"?: string,"name_th"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "created_at": string,"episode_id": number | null,"id": number,"payload": NonNullable<Json>,"read_at": string | null,"series_id": number | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"episode_id"?: number | null,"id"?: never,"payload"?: NonNullable<Json>,"read_at"?: string | null,"series_id"?: number | null,"type": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"episode_id"?: number | null,"id"?: never,"payload"?: NonNullable<Json>,"read_at"?: string | null,"series_id"?: number | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_episode_id_fkey"
      columns: ["episode_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "account_name": string,"promptpay_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_name": string,"promptpay_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "account_name"?: string,"promptpay_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_key": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"id": string,"is_verified": boolean,"status": Database["public"]['Enums']["account_status"],"updated_at": string,"username": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_key"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"is_verified"?: boolean,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string,"username"?: string | null
                  }
                  Update: {
                    "avatar_key"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_verified"?: boolean,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string,"username"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"reading_preferences": {
                  Row: {
                    "direction": Database["public"]['Enums']["reading_direction"],"mode": Database["public"]['Enums']["reading_mode"],"series_id": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "direction": Database["public"]['Enums']["reading_direction"],"mode": Database["public"]['Enums']["reading_mode"],"series_id": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "direction"?: Database["public"]['Enums']["reading_direction"],"mode"?: Database["public"]['Enums']["reading_mode"],"series_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reading_preferences_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_preferences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reading_progress": {
                  Row: {
                    "episode_id": number,"page_number": number,"series_id": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "episode_id": number,"page_number"?: number,"series_id": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "episode_id"?: number,"page_number"?: number,"series_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reading_progress_episode_id_series_id_fkey"
      columns: ["episode_id","series_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id","series_id"]
    },{
      foreignKeyName: "reading_progress_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reading_progress_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "comment_id": number | null,"created_at": string,"details": string | null,"id": number,"reason": Database["public"]['Enums']["report_reason"],"reporter_id": string,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"review_id": number | null,"series_id": number | null,"status": Database["public"]['Enums']["report_status"],"target_type": Database["public"]['Enums']["report_target"],"target_user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id"?: number | null,"created_at"?: string,"details"?: string | null,"id"?: never,"reason": Database["public"]['Enums']["report_reason"],"reporter_id": string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"review_id"?: number | null,"series_id"?: number | null,"status"?: Database["public"]['Enums']["report_status"],"target_type": Database["public"]['Enums']["report_target"],"target_user_id"?: string | null
                  }
                  Update: {
                    "comment_id"?: number | null,"created_at"?: string,"details"?: string | null,"id"?: never,"reason"?: Database["public"]['Enums']["report_reason"],"reporter_id"?: string,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"review_id"?: number | null,"series_id"?: number | null,"status"?: Database["public"]['Enums']["report_status"],"target_type"?: Database["public"]['Enums']["report_target"],"target_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "body": string | null,"created_at": string,"episode_id": number | null,"hidden_at": string | null,"id": number,"is_spoiler": boolean,"rating": number,"series_id": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"episode_id"?: number | null,"hidden_at"?: string | null,"id"?: never,"is_spoiler"?: boolean,"rating": number,"series_id": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"episode_id"?: number | null,"hidden_at"?: string | null,"id"?: never,"is_spoiler"?: boolean,"rating"?: number,"series_id"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_episode_id_series_id_fkey"
      columns: ["episode_id","series_id"]
isOneToOne: false
      referencedRelation: "episodes"
      referencedColumns: ["id","series_id"]
    },{
      foreignKeyName: "reviews_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seasons": {
                  Row: {
                    "created_at": string,"id": number,"number": number,"series_id": number,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"number": number,"series_id": number,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"number"?: number,"series_id"?: number,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seasons_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    }
                  ]
                },"series": {
                  Row: {
                    "age_rating": Database["public"]['Enums']["age_rating"],"cover_key": string | null,"created_at": string,"default_reading_direction": Database["public"]['Enums']["reading_direction"],"default_reading_mode": Database["public"]['Enums']["reading_mode"],"deleted_at": string | null,"id": number,"last_episode_at": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"published_at": string | null,"slug": string,"status": Database["public"]['Enums']["series_status"],"synopsis": string | null,"title": string,"updated_at": string,"uploader_id": string,"visibility": Database["public"]['Enums']["series_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "age_rating"?: Database["public"]['Enums']["age_rating"],"cover_key"?: string | null,"created_at"?: string,"default_reading_direction"?: Database["public"]['Enums']["reading_direction"],"default_reading_mode"?: Database["public"]['Enums']["reading_mode"],"deleted_at"?: string | null,"id"?: never,"last_episode_at"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"published_at"?: string | null,"slug": string,"status"?: Database["public"]['Enums']["series_status"],"synopsis"?: string | null,"title": string,"updated_at"?: string,"uploader_id": string,"visibility"?: Database["public"]['Enums']["series_visibility"]
                  }
                  Update: {
                    "age_rating"?: Database["public"]['Enums']["age_rating"],"cover_key"?: string | null,"created_at"?: string,"default_reading_direction"?: Database["public"]['Enums']["reading_direction"],"default_reading_mode"?: Database["public"]['Enums']["reading_mode"],"deleted_at"?: string | null,"id"?: never,"last_episode_at"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"published_at"?: string | null,"slug"?: string,"status"?: Database["public"]['Enums']["series_status"],"synopsis"?: string | null,"title"?: string,"updated_at"?: string,"uploader_id"?: string,"visibility"?: Database["public"]['Enums']["series_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "series_uploader_id_fkey"
      columns: ["uploader_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"series_follows": {
                  Row: {
                    "created_at": string,"series_id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"series_id": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"series_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "series_follows_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "series_follows_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"series_genres": {
                  Row: {
                    "genre_id": number,"series_id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "genre_id": number,"series_id": number
                  }
                  Update: {
                    "genre_id"?: number,"series_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "series_genres_genre_id_fkey"
      columns: ["genre_id"]
isOneToOne: false
      referencedRelation: "genres"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "series_genres_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    }
                  ]
                },"uploader_earnings": {
                  Row: {
                    "amount": number,"available_at": string,"created_at": string,"donation_id": number | null,"id": number,"reversed_at": string | null,"series_id": number | null,"source": Database["public"]['Enums']["earning_source"],"status": Database["public"]['Enums']["earning_status"],"unlock_id": number | null,"uploader_id": string,"withdrawal_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"available_at": string,"created_at"?: string,"donation_id"?: number | null,"id"?: never,"reversed_at"?: string | null,"series_id"?: number | null,"source": Database["public"]['Enums']["earning_source"],"status"?: Database["public"]['Enums']["earning_status"],"unlock_id"?: number | null,"uploader_id": string,"withdrawal_id"?: number | null
                  }
                  Update: {
                    "amount"?: number,"available_at"?: string,"created_at"?: string,"donation_id"?: number | null,"id"?: never,"reversed_at"?: string | null,"series_id"?: number | null,"source"?: Database["public"]['Enums']["earning_source"],"status"?: Database["public"]['Enums']["earning_status"],"unlock_id"?: number | null,"uploader_id"?: string,"withdrawal_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "uploader_earnings_donation_id_fkey"
      columns: ["donation_id"]
isOneToOne: true
      referencedRelation: "donations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "uploader_earnings_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "series"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "uploader_earnings_unlock_id_fkey"
      columns: ["unlock_id"]
isOneToOne: true
      referencedRelation: "episode_unlocks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "uploader_earnings_uploader_id_fkey"
      columns: ["uploader_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "uploader_earnings_withdrawal_id_fkey"
      columns: ["withdrawal_id"]
isOneToOne: false
      referencedRelation: "withdrawals"
      referencedColumns: ["id"]
    }
                  ]
                },"user_private_info": {
                  Row: {
                    "birth_date": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_date"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "birth_date"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_private_info_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_sanctions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"ends_at": string | null,"id": number,"kind": Database["public"]['Enums']["sanction_kind"],"lifted_at": string | null,"reason": string,"starts_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"id"?: never,"kind": Database["public"]['Enums']["sanction_kind"],"lifted_at"?: string | null,"reason": string,"starts_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"ends_at"?: string | null,"id"?: never,"kind"?: Database["public"]['Enums']["sanction_kind"],"lifted_at"?: string | null,"reason"?: string,"starts_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_sanctions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_sanctions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"withdrawals": {
                  Row: {
                    "account_name": string,"amount": number,"id": number,"paid_at": string | null,"promptpay_id": string,"reject_reason": string | null,"requested_at": string,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["withdrawal_status"],"transfer_ref": string | null,"uploader_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_name": string,"amount": number,"id"?: never,"paid_at"?: string | null,"promptpay_id": string,"reject_reason"?: string | null,"requested_at"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["withdrawal_status"],"transfer_ref"?: string | null,"uploader_id": string
                  }
                  Update: {
                    "account_name"?: string,"amount"?: number,"id"?: never,"paid_at"?: string | null,"promptpay_id"?: string,"reject_reason"?: string | null,"requested_at"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["withdrawal_status"],"transfer_ref"?: string | null,"uploader_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "withdrawals_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "withdrawals_uploader_id_fkey"
      columns: ["uploader_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "attach_checkout_session":
{ Args: { "p_purchase_id": number,"p_session_id": string,"p_user_id": string }; Returns: undefined
                           },
"ban_user":
{ Args: { "p_admin_id": string,"p_reason": string,"p_user_id": string }; Returns: Json
                           },
"complete_coin_purchase":
{ Args: { "p_amount_satang": number,"p_currency": string,"p_payment_intent_id": string,"p_purchase_id": number,"p_session_id": string }; Returns: Json
                           },
"create_coin_purchase":
{ Args: { "p_pack_id": number,"p_user_id": string }; Returns: Json
                           },
"donate":
{ Args: { "p_amount": number,"p_from_user_id": string,"p_message"?: string,"p_series_id"?: number,"p_to_user_id": string }; Returns: Json
                           },
"end_content_hold":
{ Args: { "p_admin_id": string,"p_series_id": number }; Returns: Json
                           },
"fail_coin_purchase":
{ Args: { "p_purchase_id": number,"p_session_id": string,"p_status": Database["public"]['Enums']["payment_status"] }; Returns: Json
                           },
"lift_sanction":
{ Args: { "p_admin_id": string,"p_sanction_id": number }; Returns: Json
                           },
"mark_withdrawal_paid":
{ Args: { "p_admin_id": string,"p_transfer_ref": string,"p_withdrawal_id": number }; Returns: Json
                           },
"remove_episode":
{ Args: { "p_actor_id": string,"p_episode_id": number }; Returns: Json
                           },
"remove_series":
{ Args: { "p_actor_id": string,"p_series_id": number }; Returns: Json
                           },
"request_withdrawal":
{ Args: { "p_uploader_id": string }; Returns: Json
                           },
"review_withdrawal":
{ Args: { "p_admin_id": string,"p_approve": boolean,"p_reject_reason"?: string,"p_withdrawal_id": number }; Returns: Json
                           },
"start_content_hold":
{ Args: { "p_admin_id": string,"p_reason": string,"p_series_id": number }; Returns: Json
                           },
"suspend_user":
{ Args: { "p_admin_id": string,"p_ends_at"?: string,"p_reason": string,"p_user_id": string }; Returns: Json
                           },
"unlock_episode":
{ Args: { "p_episode_id": number,"p_user_id": string }; Returns: Json
                           }
          }
          Enums: {
            "account_status": "active"|"suspended"|"banned","age_rating": "all"|"teen"|"mature","bookshelf_status": "reading"|"completed"|"plan_to_read","coin_kind": "purchased"|"welcome","coin_ledger_reason": "purchase"|"welcome_grant"|"welcome_expire"|"unlock"|"donation"|"refund"|"ban_forfeit"|"admin_adjust","earning_source": "unlock"|"donation","earning_status": "pending"|"withdrawn"|"reversed","moderation_status": "active"|"under_review"|"removed","payment_status": "pending"|"succeeded"|"failed"|"canceled","reading_direction": "ltr"|"rtl","reading_mode": "vertical"|"paged","report_reason": "copyright"|"inappropriate"|"wrong_age_rating"|"spam"|"abusive"|"unhidden_spoiler"|"fake_account"|"impersonation","report_status": "open"|"resolved"|"dismissed","report_target": "series"|"comment"|"review"|"user","sanction_kind": "suspend"|"ban","series_status": "ongoing"|"completed"|"hiatus","series_visibility": "draft"|"published","withdrawal_status": "pending"|"approved"|"paid"|"rejected"
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
            "account_status": ["active", "suspended", "banned"],"age_rating": ["all", "teen", "mature"],"bookshelf_status": ["reading", "completed", "plan_to_read"],"coin_kind": ["purchased", "welcome"],"coin_ledger_reason": ["purchase", "welcome_grant", "welcome_expire", "unlock", "donation", "refund", "ban_forfeit", "admin_adjust"],"earning_source": ["unlock", "donation"],"earning_status": ["pending", "withdrawn", "reversed"],"moderation_status": ["active", "under_review", "removed"],"payment_status": ["pending", "succeeded", "failed", "canceled"],"reading_direction": ["ltr", "rtl"],"reading_mode": ["vertical", "paged"],"report_reason": ["copyright", "inappropriate", "wrong_age_rating", "spam", "abusive", "unhidden_spoiler", "fake_account", "impersonation"],"report_status": ["open", "resolved", "dismissed"],"report_target": ["series", "comment", "review", "user"],"sanction_kind": ["suspend", "ban"],"series_status": ["ongoing", "completed", "hiatus"],"series_visibility": ["draft", "published"],"withdrawal_status": ["pending", "approved", "paid", "rejected"]
          }
        }
} as const
