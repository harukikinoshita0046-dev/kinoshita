import "server-only";

import { listCoachInsights } from "@/lib/data/insights";
import { listPlans, type Plan } from "@/lib/data/plans";
import type { SessionSummary } from "@/lib/data/sessions";
import { KEY_EXERCISES, loadAthleteSnapshot, type AthleteSnapshot } from "@/lib/data/snapshot";
import { getExerciseHistories, type ExerciseHistory } from "@/lib/data/stats";
import { must } from "@/lib/data/util";
import { lossRateAssessment } from "@/lib/domain/body";
import { addDays, diffDays } from "@/lib/domain/dates";
import type { Exercise } from "@/lib/domain/exercise";
import { formatDuration, formatNumber, formatPace, round } from "@/lib/domain/format";
import { averageRunSplit, requiredRunPace } from "@/lib/domain/hyrox";
import { formatPlanTarget } from "@/lib/domain/plan-format";
import { runTypeLabel } from "@/lib/domain/running";
import { compactSetSummary, suggestProgression, summarizeSets } from "@/lib/domain/strength";
import { interpretAcwr } from "@/lib/domain/training-load";
import { WORKOUT_GROUPS, workoutTypeLabel, type WorkoutType } from "@/lib/domain/workout-types";
import type { Db } from "@/lib/supabase/types";

const n = (v: number | string | null | undefined) => (v == null ? null : Number(v));

function sessionBrief(s: SessionSummary | undefined, exercises: Map<string, Exercise>, today: string) {
  if (!s) return null;
  return {
    date: s.date,
    days_ago: diffDays(today, s.date),
    title: s.title,
    type: workoutTypeLabel(s.workout_type),
    duration_min: s.duration_seconds ? Math.round(s.duration_seconds / 60) : null,
    session_rpe: n(s.session_rpe),
    sets: s.totalSets,
    volume_kg: s.totalVolumeKg,
    exercises: s.exercises.map((e) => exercises.get(e.exercise_id!)?.name ?? e.exercise_id),
  };
}

function planBrief(p: Plan, exercises: Map<string, Exercise>) {
  return {
    id: p.id,
    date: p.date,
    title: p.title,
    workout_type: p.workout_type,
    status: p.status,
    created_by: p.created_by,
    coach_reason: p.coach_reason,
    exercises: p.exercises.map((e) => {
      const ex = exercises.get(e.exercise_id);
      const { main, details } = formatPlanTarget(e, ex?.unit_type ?? "weight_reps");
      return { exercise_id: e.exercise_id, name: ex?.name ?? e.exercise_id, target: [main, ...details].filter(Boolean).join(" · ") };
    }),
  };
}

async function keyLifts(db: Db, userId: string, snap: AthleteSnapshot) {
  const histories = await getExerciseHistories(db, userId, [...KEY_EXERCISES], { sessions: 3, sinceDate: addDays(snap.today, -180) });
  // Targets of the slots used last time, so the progression hint knows the prescribed rep range.
  const slotIds = [...histories.values()].flatMap((h) => h.sessions[0]?.sets.map((s) => s.plan_exercise_id) ?? []).filter((x): x is string => !!x);
  const targets = slotIds.length
    ? must(
        await db
          .from("workout_plan_exercises")
          .select("id, target_sets, target_reps_min, target_reps_max, target_rpe")
          .eq("user_id", userId)
          .in("id", [...new Set(slotIds)]),
        "load targets",
      )
    : [];
  const targetById = new Map(targets.map((t) => [t.id, t]));

  const out: Record<string, unknown> = {};
  for (const id of KEY_EXERCISES) {
    const h = histories.get(id) as ExerciseHistory;
    const ex = snap.exercises.get(id);
    const unit = ex?.unit_type ?? "weight_reps";
    const last = h.sessions[0];
    const t = last?.sets.find((s) => s.plan_exercise_id)?.plan_exercise_id;
    const target = t ? targetById.get(t) : undefined;
    const pb = h.pbs;
    out[id] = {
      name: ex?.name ?? id,
      unit: unit,
      last_3: h.sessions.map((s) => ({
        date: s.date,
        sets: summarizeSets(s.sets, unit),
        summary: compactSetSummary(s.sets, unit),
        top_weight_kg: n(s.stats.top_weight),
        best_e1rm_kg: n(s.stats.best_e1rm),
        volume_kg: n(s.stats.volume_kg),
        total_reps: s.stats.total_reps,
        best_time: s.stats.best_time_seconds ? formatDuration(s.stats.best_time_seconds) : null,
        avg_rpe: n(s.stats.avg_rpe),
      })),
      pb: {
        heaviest: pb.heaviest ? `${formatNumber(n(pb.heaviest.weight))} kg × ${pb.heaviest.reps ?? "–"} (${pb.heaviest.date})` : null,
        e1rm_kg: n(pb.e1rm?.e1rm),
        most_reps: pb.most_reps ? `${pb.most_reps.reps} reps${n(pb.most_reps.weight) ? ` @ ${formatNumber(n(pb.most_reps.weight))} kg` : ""}` : null,
        fastest: pb.fastest?.time_seconds ? `${formatNumber(n(pb.fastest.distance))} m in ${formatDuration(pb.fastest.time_seconds)} (${pb.fastest.date})` : null,
      },
      last_target: target
        ? { sets: target.target_sets, reps_min: target.target_reps_min, reps_max: target.target_reps_max, rpe: n(target.target_rpe) }
        : null,
      suggestion: last
        ? suggestProgression(
            last.sets,
            { sets: target?.target_sets, repsMin: target?.target_reps_min, repsMax: target?.target_reps_max, rpe: n(target?.target_rpe) },
            Number(ex?.weight_increment ?? 2.5),
            unit,
          )
        : null,
    };
  }
  return out;
}

/** The compact, AI-oriented summary returned by GET /api/coach/context. */
export async function buildCoachContext(db: Db, userId: string, now = new Date()) {
  const snap = await loadAthleteSnapshot(db, userId, now);
  const today = snap.today;
  const [lifts, upcoming, coachNotes] = await Promise.all([
    keyLifts(db, userId, snap),
    listPlans(db, userId, { from: addDays(today, 1), to: addDays(today, 7) }),
    listCoachInsights(db, userId, { limit: 3, since: addDays(today, -14) }),
  ]);

  const p = snap.profile;
  const completed = snap.sessions.filter((s) => s.status === "completed");
  const lastOf = (types: readonly WorkoutType[]) => completed.find((s) => types.includes(s.workout_type as WorkoutType));
  const lastRun = snap.runs[0];
  const pb = snap.hyrox.pb;
  const pbAnalysis = pb ? { ...pb, splits: pb.splits } : null;
  const goal = p.hyrox_goal_seconds;
  const h = snap.health;
  const trend = snap.body.trend;
  const acute = snap.load.entries.filter((e) => e.date >= addDays(today, -6));

  return {
    meta: {
      generated_at: now.toISOString(),
      date: today,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`)),
      timezone: snap.timezone,
      units: { weight: "kg", distance: "m (running summaries in km)", time: "seconds or m:ss", pace: "per km", hrv: "ms (Apple Health SDNN)", load: "AU = session RPE × minutes" },
      notes: [
        "Readiness and ACWR are training heuristics, not medical assessments.",
        "Use exercise ids from GET /api/coach/exercises when creating plans.",
      ],
    },
    athlete: {
      name: p.display_name,
      sex: p.sex,
      age: p.birth_year ? Number(today.slice(0, 4)) - p.birth_year : null,
      height_cm: n(p.height_cm),
      max_hr: p.max_hr,
      hyrox_division: p.hyrox_division,
      goals: {
        priorities: ["HYROX performance", "strength", "fat loss", "muscle retention", "running", "recovery"],
        hyrox_goal_time: goal ? formatDuration(goal) : null,
        hyrox_goal_seconds: goal,
        next_race: p.next_race_date ? { name: p.next_race_name, date: p.next_race_date, days_until: diffDays(p.next_race_date, today) } : null,
        target_weight_kg: n(p.target_weight_kg),
        target_weight_date: p.target_weight_date,
      },
    },
    body: {
      weight_kg: trend.latest?.weight ?? null,
      weight_date: trend.latest?.date ?? null,
      weight_7d_avg_kg: trend.avg7,
      weekly_change_kg: trend.weeklyChange,
      monthly_change_kg: trend.monthlyChange,
      weekly_rate_pct: trend.weeklyRatePct,
      trend: trend.trend,
      loss_rate: lossRateAssessment(trend.weeklyRatePct),
      to_target_kg: trend.toTarget,
      projected_target_date: trend.projectedTargetDate,
      body_fat_pct: n(snap.body.latest?.body_fat_percentage),
    },
    recovery: {
      readiness: {
        score: snap.readiness.score,
        label: snap.readiness.label,
        components: snap.readiness.components.map((c) => ({ key: c.key, score: c.score, detail: c.detail })),
        missing: snap.readiness.missing,
      },
      sleep_last_night_min: h.today?.sleep_minutes ?? null,
      sleep_7d_avg_min: h.sleep7dAvg,
      hrv_ms: n(h.today?.hrv),
      hrv_7d_avg_ms: h.hrv7dAvg,
      hrv_baseline_28d_ms: h.hrvBaseline ? round(h.hrvBaseline.mean, 1) : null,
      hrv_low_streak_days: h.hrvLowStreak,
      resting_hr: h.today?.resting_hr ?? null,
      resting_hr_7d_avg: h.restingHr7dAvg,
      resting_hr_baseline_28d: h.restingHrBaseline ? round(h.restingHrBaseline.mean, 1) : null,
      health_data_date: h.latest?.date ?? null,
      health_source: h.latest?.source ?? null,
      subjective_today: snap.checkin
        ? { soreness: snap.checkin.soreness, fatigue: snap.checkin.fatigue, motivation: snap.checkin.motivation, note: snap.checkin.note, scale: "1-5; soreness/fatigue 5 = worst, motivation 5 = best" }
        : null,
    },
    training_load: {
      sessions_7d: acute.length,
      strength_sessions_7d: acute.filter((e) => e.kind === "strength").length,
      runs_7d: acute.filter((e) => e.kind === "run").length,
      hyrox_7d: acute.filter((e) => e.kind === "hyrox").length,
      training_minutes_7d: snap.load.minutes7,
      load_7d_au: snap.load.acute7,
      load_28d_weekly_avg_au: snap.load.chronicWeekly28,
      acwr: snap.load.acwr,
      acwr_interpretation: interpretAcwr(snap.load.acwr),
      yesterday_load_au: snap.load.yesterday,
      days_since_rest: snap.load.daysSinceRest,
      this_week: { since: snap.week.start, sessions: snap.week.sessions, minutes: snap.week.trainingMinutes, volume_kg: snap.week.volumeKg },
    },
    last_sessions: {
      last_training: sessionBrief(completed[0], snap.exercises, today),
      last_upper: sessionBrief(lastOf(WORKOUT_GROUPS.upper), snap.exercises, today),
      last_lower: sessionBrief(lastOf(WORKOUT_GROUPS.lower), snap.exercises, today),
      last_hyrox: (() => {
        const s = lastOf(WORKOUT_GROUPS.hyrox);
        const r = snap.hyrox.latest;
        if (r && (!s || r.date >= s.date)) return { date: r.date, days_ago: diffDays(today, r.date), title: r.name ?? r.event_type, type: `HYROX ${r.event_type}`, total: formatDuration(r.total_seconds) };
        return sessionBrief(s, snap.exercises, today);
      })(),
      last_run: lastRun
        ? {
            date: lastRun.date,
            days_ago: diffDays(today, lastRun.date),
            type: runTypeLabel(lastRun.run_type),
            distance_km: n(lastRun.distance_km),
            duration: formatDuration(lastRun.duration_seconds),
            pace: `${formatPace(n(lastRun.average_pace))}/km`,
            avg_hr: lastRun.average_hr,
            rpe: n(lastRun.rpe),
          }
        : null,
    },
    running: {
      distance_7d_km: snap.running.km7,
      distance_prev_7d_km: snap.running.kmPrev7,
      distance_30d_km: snap.running.km30,
      runs_7d: snap.running.runs7,
      avg_pace_7d: snap.running.avgPace7 ? `${formatPace(snap.running.avgPace7)}/km` : null,
      recent: snap.runs.slice(0, 3).map((r) => ({
        date: r.date,
        type: runTypeLabel(r.run_type),
        distance_km: n(r.distance_km),
        duration: formatDuration(r.duration_seconds),
        pace: `${formatPace(n(r.average_pace))}/km`,
        avg_hr: r.average_hr,
        rpe: n(r.rpe),
      })),
    },
    hyrox: {
      pb: pb
        ? {
            date: pb.date,
            event_type: pb.event_type,
            total: formatDuration(pb.total_seconds),
            total_seconds: pb.total_seconds,
            running: formatDuration(pb.run_total_seconds),
            stations: formatDuration(pb.station_total_seconds),
            roxzone: formatDuration(pb.roxzone_seconds),
            avg_run_split: pbAnalysis ? formatDuration(averageRunSplit(pbAnalysis)) : null,
          }
        : null,
      race_pb: snap.hyrox.racePb ? { date: snap.hyrox.racePb.date, total: formatDuration(snap.hyrox.racePb.total_seconds) } : null,
      latest: snap.hyrox.latest ? { date: snap.hyrox.latest.date, event_type: snap.hyrox.latest.event_type, total: formatDuration(snap.hyrox.latest.total_seconds) } : null,
      goal_gap_seconds: goal && pb?.total_seconds ? pb.total_seconds - goal : null,
      required_avg_run_pace_for_goal: goal && pb ? (requiredRunPace(goal, pb) ? `${formatPace(requiredRunPace(goal, pb))}/km` : null) : null,
      stations: snap.hyrox.stations.map((s) => ({
        id: s.exerciseId,
        name: s.label,
        spec: s.spec,
        pb: s.pb ? formatDuration(s.pb.seconds) : null,
        latest: s.latest ? formatDuration(s.latest.seconds) : null,
        trend: s.trend.map((t) => formatDuration(t)),
        relative_index: s.relativeIndex,
      })),
      weakest_stations: snap.hyrox.weakest.filter((w) => (w.relativeIndex ?? 0) > 1.05).map((w) => w.exerciseId),
      station_index_note: "relative_index > 1 = larger share of station time than a typical ~60 min finisher (approximate reference).",
    },
    key_lifts: lifts,
    plans: {
      today: snap.todayPlans.map((pl) => planBrief(pl, snap.exercises)),
      upcoming: upcoming.map((pl) => planBrief(pl, snap.exercises)),
    },
    insights: {
      rule_based: snap.insights.map((i) => i.text),
      recent_coach_notes: coachNotes.map((c) => ({ date: c.date, title: c.title, body: c.body })),
    },
  };
}
