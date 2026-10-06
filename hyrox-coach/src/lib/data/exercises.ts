import { mergeExerciseSettings, slugifyExerciseName, type Exercise, type UnitType } from "@/lib/domain/exercise";
import type { Db } from "@/lib/supabase/types";
import { DataError, must } from "./util";

/** Built-in exercises plus the athlete's custom ones, with their per-user overrides applied. */
export async function listExercises(db: Db, userId: string, opts: { includeInactive?: boolean } = {}): Promise<Exercise[]> {
  let query = db
    .from("exercise_master")
    .select("*")
    .or(`owner_id.is.null,owner_id.eq.${userId}`)
    .order("hyrox_station_order", { ascending: true, nullsFirst: false })
    .order("name");
  if (!opts.includeInactive) query = query.eq("active", true);
  const [master, settings] = await Promise.all([
    query,
    db.from("user_exercise_settings").select("exercise_id, weight_increment, default_rest_seconds, hidden").eq("user_id", userId),
  ]);
  return mergeExerciseSettings(
    must(master, "load exercises").map((m) => ({ ...m, weight_increment: Number(m.weight_increment) })),
    must(settings, "load exercise settings").map((s) => ({
      ...s,
      weight_increment: s.weight_increment == null ? null : Number(s.weight_increment),
    })),
  );
}

export function indexExercises(exercises: Exercise[]): Map<string, Exercise> {
  return new Map(exercises.map((e) => [e.id, e]));
}

export async function saveExerciseSettings(
  db: Db,
  userId: string,
  exerciseId: string,
  patch: { weight_increment?: number | null; default_rest_seconds?: number | null; hidden?: boolean },
) {
  must(
    await db
      .from("user_exercise_settings")
      .upsert({ user_id: userId, exercise_id: exerciseId, ...patch }, { onConflict: "user_id,exercise_id" }),
    "save exercise settings",
  );
}

export type CustomExerciseInput = {
  name: string;
  category: string;
  unit_type: UnitType;
  primary_muscle?: string | null;
  weight_increment?: number;
  default_rest_seconds?: number;
  default_distance_m?: number | null;
  hyrox_relevance?: number;
};

export async function createCustomExercise(db: Db, userId: string, input: CustomExerciseInput): Promise<string> {
  const slug = slugifyExerciseName(input.name) || "exercise";
  const id = `custom_${slug}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 64);
  const res = await db.from("exercise_master").insert({
    id,
    owner_id: userId,
    name: input.name.trim(),
    category: input.category,
    unit_type: input.unit_type,
    primary_muscle: input.primary_muscle ?? null,
    weight_increment: input.weight_increment ?? 2.5,
    default_rest_seconds: input.default_rest_seconds ?? 90,
    default_distance_m: input.default_distance_m ?? null,
    hyrox_relevance: input.hyrox_relevance ?? 0,
  });
  if (res.error?.code === "23505") throw new DataError(`「${input.name}」という名前の種目はすでにあります。`, 409);
  must(res, "create exercise");
  return id;
}
