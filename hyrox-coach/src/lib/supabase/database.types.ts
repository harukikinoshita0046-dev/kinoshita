export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      api_request_logs: {
        Row: {
          created_at: string;
          duration_ms: number | null;
          error: string | null;
          id: number;
          ip: string | null;
          method: string;
          path: string;
          status: number;
          token_id: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: never;
          ip?: string | null;
          method: string;
          path: string;
          status: number;
          token_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: never;
          ip?: string | null;
          method?: string;
          path?: string;
          status?: number;
          token_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "api_request_logs_token_id_fkey";
            columns: ["token_id"];
            isOneToOne: false;
            referencedRelation: "coach_api_tokens";
            referencedColumns: ["id"];
          },
        ];
      };
      body_metrics: {
        Row: {
          body_fat_percentage: number | null;
          created_at: string;
          date: string;
          id: string;
          muscle_mass: number | null;
          source: string;
          updated_at: string;
          user_id: string;
          weight: number | null;
        };
        Insert: {
          body_fat_percentage?: number | null;
          created_at?: string;
          date: string;
          id?: string;
          muscle_mass?: number | null;
          source?: string;
          updated_at?: string;
          user_id: string;
          weight?: number | null;
        };
        Update: {
          body_fat_percentage?: number | null;
          created_at?: string;
          date?: string;
          id?: string;
          muscle_mass?: number | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
          weight?: number | null;
        };
        Relationships: [];
      };
      coach_api_tokens: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          last_used_at: string | null;
          name: string;
          revoked_at: string | null;
          scopes: string[];
          token_hash: string;
          token_prefix: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          name: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash: string;
          token_prefix: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          name?: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          token_prefix?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      coach_insights: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          created_by: string;
          date: string;
          id: string;
          title: string | null;
          user_id: string;
        };
        Insert: {
          body: string;
          category?: string;
          created_at?: string;
          created_by?: string;
          date: string;
          id?: string;
          title?: string | null;
          user_id: string;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          created_by?: string;
          date?: string;
          id?: string;
          title?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      exercise_master: {
        Row: {
          active: boolean;
          aliases: string[];
          category: string;
          created_at: string;
          default_distance_m: number | null;
          default_rest_seconds: number;
          hyrox_relevance: number;
          hyrox_station_order: number | null;
          id: string;
          is_hyrox_station: boolean;
          name: string;
          owner_id: string | null;
          primary_muscle: string | null;
          secondary_muscles: string[];
          unit_type: string;
          weight_increment: number;
        };
        Insert: {
          active?: boolean;
          aliases?: string[];
          category: string;
          created_at?: string;
          default_distance_m?: number | null;
          default_rest_seconds?: number;
          hyrox_relevance?: number;
          hyrox_station_order?: number | null;
          id: string;
          is_hyrox_station?: boolean;
          name: string;
          owner_id?: string | null;
          primary_muscle?: string | null;
          secondary_muscles?: string[];
          unit_type: string;
          weight_increment?: number;
        };
        Update: {
          active?: boolean;
          aliases?: string[];
          category?: string;
          created_at?: string;
          default_distance_m?: number | null;
          default_rest_seconds?: number;
          hyrox_relevance?: number;
          hyrox_station_order?: number | null;
          id?: string;
          is_hyrox_station?: boolean;
          name?: string;
          owner_id?: string | null;
          primary_muscle?: string | null;
          secondary_muscles?: string[];
          unit_type?: string;
          weight_increment?: number;
        };
        Relationships: [];
      };
      health_metrics: {
        Row: {
          active_calories: number | null;
          created_at: string;
          date: string;
          hrv: number | null;
          id: string;
          resting_hr: number | null;
          sleep_minutes: number | null;
          source: string;
          steps: number | null;
          updated_at: string;
          user_id: string;
          vo2max: number | null;
        };
        Insert: {
          active_calories?: number | null;
          created_at?: string;
          date: string;
          hrv?: number | null;
          id?: string;
          resting_hr?: number | null;
          sleep_minutes?: number | null;
          source?: string;
          steps?: number | null;
          updated_at?: string;
          user_id: string;
          vo2max?: number | null;
        };
        Update: {
          active_calories?: number | null;
          created_at?: string;
          date?: string;
          hrv?: number | null;
          id?: string;
          resting_hr?: number | null;
          sleep_minutes?: number | null;
          source?: string;
          steps?: number | null;
          updated_at?: string;
          user_id?: string;
          vo2max?: number | null;
        };
        Relationships: [];
      };
      hyrox_results: {
        Row: {
          created_at: string;
          date: string;
          division: string | null;
          event_type: string;
          finished_at: string | null;
          id: string;
          name: string | null;
          notes: string | null;
          roxzone_seconds: number | null;
          run_total_seconds: number | null;
          started_at: string | null;
          station_total_seconds: number | null;
          status: string;
          total_seconds: number | null;
          updated_at: string;
          user_id: string;
          workout_plan_id: string | null;
        };
        Insert: {
          created_at?: string;
          date: string;
          division?: string | null;
          event_type: string;
          finished_at?: string | null;
          id?: string;
          name?: string | null;
          notes?: string | null;
          roxzone_seconds?: number | null;
          run_total_seconds?: number | null;
          started_at?: string | null;
          station_total_seconds?: number | null;
          status?: string;
          total_seconds?: number | null;
          updated_at?: string;
          user_id: string;
          workout_plan_id?: string | null;
        };
        Update: {
          created_at?: string;
          date?: string;
          division?: string | null;
          event_type?: string;
          finished_at?: string | null;
          id?: string;
          name?: string | null;
          notes?: string | null;
          roxzone_seconds?: number | null;
          run_total_seconds?: number | null;
          started_at?: string | null;
          station_total_seconds?: number | null;
          status?: string;
          total_seconds?: number | null;
          updated_at?: string;
          user_id?: string;
          workout_plan_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "hyrox_results_workout_plan_id_user_id_fkey";
            columns: ["workout_plan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      hyrox_splits: {
        Row: {
          created_at: string;
          duration_seconds: number;
          exercise_id: string;
          id: string;
          result_id: string;
          roxzone_seconds: number | null;
          segment_index: number;
          segment_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_seconds: number;
          exercise_id: string;
          id?: string;
          result_id: string;
          roxzone_seconds?: number | null;
          segment_index: number;
          segment_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number;
          exercise_id?: string;
          id?: string;
          result_id?: string;
          roxzone_seconds?: number | null;
          segment_index?: number;
          segment_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hyrox_splits_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercise_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hyrox_splits_result_id_user_id_fkey";
            columns: ["result_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "hyrox_results";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          birth_year: number | null;
          created_at: string;
          display_name: string | null;
          height_cm: number | null;
          hyrox_division: string;
          hyrox_goal_seconds: number | null;
          id: string;
          max_hr: number | null;
          next_race_date: string | null;
          next_race_name: string | null;
          sex: string | null;
          target_weight_date: string | null;
          target_weight_kg: number | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          birth_year?: number | null;
          created_at?: string;
          display_name?: string | null;
          height_cm?: number | null;
          hyrox_division?: string;
          hyrox_goal_seconds?: number | null;
          id: string;
          max_hr?: number | null;
          next_race_date?: string | null;
          next_race_name?: string | null;
          sex?: string | null;
          target_weight_date?: string | null;
          target_weight_kg?: number | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          birth_year?: number | null;
          created_at?: string;
          display_name?: string | null;
          height_cm?: number | null;
          hyrox_division?: string;
          hyrox_goal_seconds?: number | null;
          id?: string;
          max_hr?: number | null;
          next_race_date?: string | null;
          next_race_name?: string | null;
          sex?: string | null;
          target_weight_date?: string | null;
          target_weight_kg?: number | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      readiness_checkins: {
        Row: {
          created_at: string;
          date: string;
          fatigue: number | null;
          id: string;
          motivation: number | null;
          note: string | null;
          soreness: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          fatigue?: number | null;
          id?: string;
          motivation?: number | null;
          note?: string | null;
          soreness?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          fatigue?: number | null;
          id?: string;
          motivation?: number | null;
          note?: string | null;
          soreness?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      running_sessions: {
        Row: {
          average_hr: number | null;
          average_pace: number | null;
          cadence: number | null;
          calories: number | null;
          created_at: string;
          date: string;
          distance_km: number;
          duration_seconds: number;
          elevation_gain_m: number | null;
          external_id: string | null;
          id: string;
          max_hr: number | null;
          notes: string | null;
          rpe: number | null;
          run_type: string;
          source: string;
          splits: Json | null;
          started_at: string | null;
          updated_at: string;
          user_id: string;
          workout_plan_id: string | null;
          zone1_seconds: number | null;
          zone2_seconds: number | null;
          zone3_seconds: number | null;
          zone4_seconds: number | null;
          zone5_seconds: number | null;
        };
        Insert: {
          average_hr?: number | null;
          average_pace?: never;
          cadence?: number | null;
          calories?: number | null;
          created_at?: string;
          date: string;
          distance_km: number;
          duration_seconds: number;
          elevation_gain_m?: number | null;
          external_id?: string | null;
          id?: string;
          max_hr?: number | null;
          notes?: string | null;
          rpe?: number | null;
          run_type: string;
          source?: string;
          splits?: Json | null;
          started_at?: string | null;
          updated_at?: string;
          user_id: string;
          workout_plan_id?: string | null;
          zone1_seconds?: number | null;
          zone2_seconds?: number | null;
          zone3_seconds?: number | null;
          zone4_seconds?: number | null;
          zone5_seconds?: number | null;
        };
        Update: {
          average_hr?: number | null;
          average_pace?: never;
          cadence?: number | null;
          calories?: number | null;
          created_at?: string;
          date?: string;
          distance_km?: number;
          duration_seconds?: number;
          elevation_gain_m?: number | null;
          external_id?: string | null;
          id?: string;
          max_hr?: number | null;
          notes?: string | null;
          rpe?: number | null;
          run_type?: string;
          source?: string;
          splits?: Json | null;
          started_at?: string | null;
          updated_at?: string;
          user_id?: string;
          workout_plan_id?: string | null;
          zone1_seconds?: number | null;
          zone2_seconds?: number | null;
          zone3_seconds?: number | null;
          zone4_seconds?: number | null;
          zone5_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "running_sessions_workout_plan_id_user_id_fkey";
            columns: ["workout_plan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      user_exercise_settings: {
        Row: {
          default_rest_seconds: number | null;
          exercise_id: string;
          hidden: boolean;
          updated_at: string;
          user_id: string;
          weight_increment: number | null;
        };
        Insert: {
          default_rest_seconds?: number | null;
          exercise_id: string;
          hidden?: boolean;
          updated_at?: string;
          user_id: string;
          weight_increment?: number | null;
        };
        Update: {
          default_rest_seconds?: number | null;
          exercise_id?: string;
          hidden?: boolean;
          updated_at?: string;
          user_id?: string;
          weight_increment?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_exercise_settings_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercise_master";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_plan_exercises: {
        Row: {
          added_in_session: boolean;
          coach_note: string | null;
          created_at: string;
          exercise_id: string;
          id: string;
          order_index: number;
          original_exercise_id: string | null;
          rest_seconds: number | null;
          target_distance: number | null;
          target_hr_zone: number | null;
          target_pace_max: number | null;
          target_pace_min: number | null;
          target_reps_max: number | null;
          target_reps_min: number | null;
          target_rpe: number | null;
          target_sets: number | null;
          target_time: number | null;
          target_weight: number | null;
          user_id: string;
          workout_plan_id: string;
        };
        Insert: {
          added_in_session?: boolean;
          coach_note?: string | null;
          created_at?: string;
          exercise_id: string;
          id?: string;
          order_index: number;
          original_exercise_id?: string | null;
          rest_seconds?: number | null;
          target_distance?: number | null;
          target_hr_zone?: number | null;
          target_pace_max?: number | null;
          target_pace_min?: number | null;
          target_reps_max?: number | null;
          target_reps_min?: number | null;
          target_rpe?: number | null;
          target_sets?: number | null;
          target_time?: number | null;
          target_weight?: number | null;
          user_id: string;
          workout_plan_id: string;
        };
        Update: {
          added_in_session?: boolean;
          coach_note?: string | null;
          created_at?: string;
          exercise_id?: string;
          id?: string;
          order_index?: number;
          original_exercise_id?: string | null;
          rest_seconds?: number | null;
          target_distance?: number | null;
          target_hr_zone?: number | null;
          target_pace_max?: number | null;
          target_pace_min?: number | null;
          target_reps_max?: number | null;
          target_reps_min?: number | null;
          target_rpe?: number | null;
          target_sets?: number | null;
          target_time?: number | null;
          target_weight?: number | null;
          user_id?: string;
          workout_plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_plan_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercise_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_plan_exercises_original_exercise_id_fkey";
            columns: ["original_exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercise_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_plan_exercises_workout_plan_id_user_id_fkey";
            columns: ["workout_plan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      workout_plans: {
        Row: {
          coach_reason: string | null;
          created_at: string;
          created_by: string;
          date: string;
          estimated_duration_min: number | null;
          id: string;
          idempotency_key: string | null;
          source: string | null;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
          workout_type: string;
        };
        Insert: {
          coach_reason?: string | null;
          created_at?: string;
          created_by?: string;
          date: string;
          estimated_duration_min?: number | null;
          id?: string;
          idempotency_key?: string | null;
          source?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
          workout_type: string;
        };
        Update: {
          coach_reason?: string | null;
          created_at?: string;
          created_by?: string;
          date?: string;
          estimated_duration_min?: number | null;
          id?: string;
          idempotency_key?: string | null;
          source?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          workout_type?: string;
        };
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          average_hr: number | null;
          calories: number | null;
          created_at: string;
          date: string;
          duration_seconds: number | null;
          finished_at: string | null;
          id: string;
          max_hr: number | null;
          notes: string | null;
          session_rpe: number | null;
          started_at: string;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
          workout_plan_id: string | null;
          workout_type: string;
        };
        Insert: {
          average_hr?: number | null;
          calories?: number | null;
          created_at?: string;
          date: string;
          duration_seconds?: never;
          finished_at?: string | null;
          id?: string;
          max_hr?: number | null;
          notes?: string | null;
          session_rpe?: number | null;
          started_at?: string;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
          workout_plan_id?: string | null;
          workout_type: string;
        };
        Update: {
          average_hr?: number | null;
          calories?: number | null;
          created_at?: string;
          date?: string;
          duration_seconds?: never;
          finished_at?: string | null;
          id?: string;
          max_hr?: number | null;
          notes?: string | null;
          session_rpe?: number | null;
          started_at?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
          workout_plan_id?: string | null;
          workout_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_workout_plan_id_user_id_fkey";
            columns: ["workout_plan_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_plans";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      workout_sets: {
        Row: {
          average_hr: number | null;
          completed_at: string;
          created_at: string;
          distance: number | null;
          exercise_id: string;
          id: string;
          is_warmup: boolean;
          max_hr: number | null;
          notes: string | null;
          plan_exercise_id: string | null;
          reps: number | null;
          rpe: number | null;
          session_id: string;
          set_number: number;
          time_seconds: number | null;
          user_id: string;
          weight: number | null;
        };
        Insert: {
          average_hr?: number | null;
          completed_at?: string;
          created_at?: string;
          distance?: number | null;
          exercise_id: string;
          id?: string;
          is_warmup?: boolean;
          max_hr?: number | null;
          notes?: string | null;
          plan_exercise_id?: string | null;
          reps?: number | null;
          rpe?: number | null;
          session_id: string;
          set_number: number;
          time_seconds?: number | null;
          user_id: string;
          weight?: number | null;
        };
        Update: {
          average_hr?: number | null;
          completed_at?: string;
          created_at?: string;
          distance?: number | null;
          exercise_id?: string;
          id?: string;
          is_warmup?: boolean;
          max_hr?: number | null;
          notes?: string | null;
          plan_exercise_id?: string | null;
          reps?: number | null;
          rpe?: number | null;
          session_id?: string;
          set_number?: number;
          time_seconds?: number | null;
          user_id?: string;
          weight?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercise_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sets_plan_exercise_id_user_id_fkey";
            columns: ["plan_exercise_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_plan_exercises";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "workout_sets_session_id_user_id_fkey";
            columns: ["session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      exercise_personal_bests: {
        Row: {
          date: string | null;
          distance: number | null;
          e1rm: number | null;
          exercise_id: string | null;
          pb_type: string | null;
          reps: number | null;
          time_seconds: number | null;
          user_id: string | null;
          weight: number | null;
        };
        Relationships: [];
      };
      exercise_session_stats: {
        Row: {
          avg_rpe: number | null;
          best_e1rm: number | null;
          best_time_seconds: number | null;
          date: string | null;
          exercise_id: string | null;
          max_reps: number | null;
          session_id: string | null;
          started_at: string | null;
          top_weight: number | null;
          total_distance_m: number | null;
          total_reps: number | null;
          total_time_seconds: number | null;
          user_id: string | null;
          volume_kg: number | null;
          working_sets: number | null;
          workout_type: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercise_master";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_sets_session_id_user_id_fkey";
            columns: ["session_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
