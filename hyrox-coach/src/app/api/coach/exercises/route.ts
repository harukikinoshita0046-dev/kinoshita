import { coachRoute } from "@/lib/coach/api";
import { listExercises } from "@/lib/data/exercises";

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
