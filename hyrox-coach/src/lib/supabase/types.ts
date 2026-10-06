import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Db = SupabaseClient<Database>;
type PublicSchema = Database["public"];
export type Row<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Insert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type ViewRow<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
