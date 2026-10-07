import { z } from "zod";
import { coachRoute } from "@/lib/coach/api";
import { createCustomExercise, listExercises } from "@/lib/data/exercises";
import { resolveExercise, UNIT_TYPES } from "@/lib/domain/exercise";

/** Valid exercise ids for workout plans (built-in + the athlete's custom exercises). */
export const GET = coachRoute("read", async ({ db, userId }) => {
  const exercises = await listExercises(db, userId);
  return {
    exercises: exercises.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      unit_type: e.unit_type,
      primary_muscle: e.primary_muscle,
      hyrox_relevance: e.hyrox_relevance,
      hyrox_station_order: e.hyrox_station_order,
      weight_increment_kg: Number(e.weight_increment),
      default_rest_seconds: e.default_rest_seconds,
      standard_distance_m: e.default_distance_m,
      custom: e.is_custom,
      hidden: e.hidden,
    })),
    unit_types: {
      weight_reps: "target_weight (kg) × reps",
      bodyweight_reps: "reps; target_weight = added load (kg)",
      reps: "reps only",
      distance_time: "target_distance (m) and/or target_time (s)",
      weight_distance: "target_weight (kg) + target_distance (m); Farmer's Carry weight is per hand",
      time: "target_time (s)",
    },
  };
});

const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(["push", "pull", "legs", "hinge", "core", "carry", "hyrox_station", "cardio", "run", "other"]),
  unit_type: z.enum(UNIT_TYPES),
  aliases: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  weight_increment: z.number().positive().max(50).optional(),
  default_rest_seconds: z.number().int().min(0).max(1800).optional(),
  default_distance_m: z.number().positive().max(100000).nullish(),
});

/**
 * Adds a custom exercise when the athlete trains something not in the list
 * (e.g. a bent-over row). If the name or an alias already matches an
 * exercise, that one is returned instead of creating a duplicate.
 */
export const POST = coachRoute("write", async ({ db, userId, body }) => {
  const input = createBody.parse(body ?? {});
  const existing = await listExercises(db, userId, { includeInactive: true });
  const match = [input.name, ...(input.aliases ?? [])].map((q) => resolveExercise(existing, q)).find(Boolean);
  if (match) {
    return { created: false, exercise: { id: match.id, name: match.name, unit_type: match.unit_type, custom: match.is_custom }, message: "An exercise with this name already exists; use its id." };
  }
  const id = await createCustomExercise(db, userId, input);
  return Response.json(
    { created: true, exercise: { id, name: input.name, category: input.category, unit_type: input.unit_type, aliases: input.aliases ?? [], custom: true } },
    { status: 201 },
  );
});
