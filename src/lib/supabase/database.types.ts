export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamped = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      trader_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          timezone: string;
          base_currency: string;
          preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          timezone?: string;
          base_currency?: string;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string | null;
          timezone?: string;
          base_currency?: string;
          preferences?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      trader_evidence_bundles: {
        Row: {
          id: string;
          owner_id: string;
          bundle_id: string;
          bundle_version: string;
          workflow: "current_market" | "upcoming_session";
          instrument: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          bundle_id: string;
          bundle_version: string;
          workflow: "current_market" | "upcoming_session";
          instrument: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          bundle_id?: string;
          bundle_version?: string;
          workflow?: "current_market" | "upcoming_session";
          instrument?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      trader_reasoning_reports: {
        Row: {
          id: string;
          owner_id: string;
          report_id: string;
          report_version: string;
          evidence_bundle_row_id: string | null;
          workflow: "current_market" | "upcoming_session";
          instrument: string;
          evaluated_at: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          report_id: string;
          report_version: string;
          evidence_bundle_row_id?: string | null;
          workflow: "current_market" | "upcoming_session";
          instrument: string;
          evaluated_at: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          report_version?: string;
          evidence_bundle_row_id?: string | null;
          payload?: Json;
        };
        Relationships: [];
      };
      trader_scenarios: {
        Row: {
          id: string;
          owner_id: string;
          scenario_id: string;
          scenario_version: string;
          workflow: "current_market" | "upcoming_session";
          instrument: string;
          timeframe: string;
          state:
            | "candidate"
            | "waiting_for_trigger"
            | "trigger_observed_provisional"
            | "confirmed"
            | "invalidated"
            | "expired"
            | "cancelled"
            | "suspended"
            | "superseded";
          evidence_bundle_row_id: string | null;
          reasoning_report_row_id: string | null;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          scenario_id: string;
          scenario_version: string;
          workflow: "current_market" | "upcoming_session";
          instrument: string;
          timeframe: string;
          state: Database["public"]["Tables"]["trader_scenarios"]["Row"]["state"];
          evidence_bundle_row_id?: string | null;
          reasoning_report_row_id?: string | null;
          payload: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          scenario_version?: string;
          state?: Database["public"]["Tables"]["trader_scenarios"]["Row"]["state"];
          evidence_bundle_row_id?: string | null;
          reasoning_report_row_id?: string | null;
          payload?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      trader_experiments: {
        Row: Timestamped & {
          id: string;
          owner_id: string;
          experiment_id: string;
          version: string;
          state: string;
          requires_owner_approval_for_release: boolean;
          payload: Json;
        };
        Insert: {
          id?: string;
          owner_id: string;
          experiment_id: string;
          version: string;
          state: string;
          requires_owner_approval_for_release?: boolean;
          payload: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          version?: string;
          state?: string;
          requires_owner_approval_for_release?: boolean;
          payload?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      trader_journal_entries: {
        Row: Timestamped & {
          id: string;
          owner_id: string;
          instrument: string;
          timeframe: string | null;
          entry_type: string;
          occurred_at: string;
          payload: Json;
        };
        Insert: {
          id?: string;
          owner_id: string;
          instrument: string;
          timeframe?: string | null;
          entry_type?: string;
          occurred_at?: string;
          payload: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          instrument?: string;
          timeframe?: string | null;
          entry_type?: string;
          occurred_at?: string;
          payload?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
