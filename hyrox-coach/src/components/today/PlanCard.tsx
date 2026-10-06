import { Bot, Check, Play, RotateCcw, User } from "lucide-react";
import Link from "next/link";
import { restorePlan, skipPlan, startWorkout } from "@/app/(app)/today/actions";
import type { Plan } from "@/lib/data/plans";
import type { Exercise } from "@/lib/domain/exercise";
import { formatPlanDistance, formatPaceRange, formatPlanTarget } from "@/lib/domain/plan-format";
import { workoutTypeLabel } from "@/lib/domain/workout-types";
import { buttonClass, Card, cn, Pill } from "../ui";

function SourceBadge({ plan }: { plan: Plan }) {
  return plan.created_by === "AI" ? (
    <Pill className="bg-accent/15 text-accent">
      <Bot className="mr-1 h-3 w-3" /> AI COACH
    </Pill>
  ) : (
    <Pill>
      <User className="mr-1 h-3 w-3" /> YOU
    </Pill>
  );
}

function CoachReason({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <details className="group mt-2">
      <summary className="line-clamp-2 cursor-pointer list-none text-sm text-muted group-open:line-clamp-none">{reason}</summary>
    </details>
  );
}

function StatusAction({ plan, sessionId }: { plan: Plan; sessionId?: string | null }) {
  const isRun = plan.workout_type === "run";
  const isSim = plan.workout_type === "simulation";
  if (plan.status === "completed") {
    return (
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-push/10 px-4 py-3 text-push">
        <span className="flex items-center gap-2 font-bold">
          <Check className="h-5 w-5" /> COMPLETED
        </span>
        {sessionId ? (
          <Link href={`/history/${sessionId}`} className="text-sm font-semibold underline">
            View
          </Link>
        ) : null}
      </div>
    );
  }
  if (plan.status === "skipped") {
    return (
      <form action={restorePlan.bind(null, plan.id)} className="mt-4">
        <button className={buttonClass("secondary", "md", "w-full")}>
          <RotateCcw className="h-4 w-4" /> SKIPPED · RESTORE
        </button>
      </form>
    );
  }
  if (isRun) {
    return (
      <Link href={`/run/live/${plan.id}`} className={buttonClass("primary", "lg", "mt-4 w-full")} data-testid="start-run">
        <Play className="h-5 w-5 fill-current" /> START RUN
      </Link>
    );
  }
  if (isSim) {
    return (
      <Link href={`/hyrox/simulation?plan=${plan.id}`} className={buttonClass("primary", "lg", "mt-4 w-full")}>
        <Play className="h-5 w-5 fill-current" /> START SIMULATION
      </Link>
    );
  }
  return (
    <form action={startWorkout.bind(null, plan.id)} className="mt-4">
      <button className={buttonClass("primary", "lg", "w-full")} data-testid="start-workout">
        <Play className="h-5 w-5 fill-current" /> {plan.status === "in_progress" ? "RESUME WORKOUT" : "START WORKOUT"}
      </button>
    </form>
  );
}

export function PlanCard({
  plan,
  exercises,
  sessionId,
}: {
  plan: Plan;
  exercises: Map<string, Exercise>;
  sessionId?: string | null;
}) {
  const runEx = plan.workout_type === "run" ? plan.exercises.find((e) => e.exercise_id === "running") : undefined;

  return (
    <Card className={cn(plan.status === "skipped" && "opacity-60")} data-testid="plan-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label">{workoutTypeLabel(plan.workout_type)}</p>
          <h3 className="mt-0.5 text-2xl font-extrabold leading-tight" data-testid="plan-title">
            {plan.title}
          </h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <SourceBadge plan={plan} />
          {plan.estimated_duration_min ? <span className="num text-xs text-muted">{plan.estimated_duration_min} min</span> : null}
        </div>
      </div>
      <CoachReason reason={plan.coach_reason} />

      {runEx ? (
        <div className="mt-4 space-y-3">
          <p className="num text-4xl font-extrabold">
            {runEx.target_sets && runEx.target_sets > 1 ? `${runEx.target_sets} × ` : ""}
            {runEx.target_distance ? formatPlanDistance(runEx.target_distance) : runEx.target_time ? `${Math.round(runEx.target_time / 60)} min` : "Run"}
          </p>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="label">Target Pace</dt>
              <dd className="num mt-1 font-bold">{formatPaceRange(runEx.target_pace_min, runEx.target_pace_max) ?? "–"}</dd>
            </div>
            <div>
              <dt className="label">Rest</dt>
              <dd className="num mt-1 font-bold">{runEx.rest_seconds != null ? `${runEx.rest_seconds} sec` : "–"}</dd>
            </div>
            <div>
              <dt className="label">Target HR</dt>
              <dd className="num mt-1 font-bold">{runEx.target_hr_zone ? `Zone ${runEx.target_hr_zone}` : "–"}</dd>
            </div>
          </dl>
          {runEx.coach_note ? <p className="text-sm text-muted">{runEx.coach_note}</p> : null}
        </div>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {plan.exercises.map((pe, i) => {
            const ex = exercises.get(pe.exercise_id);
            const { main, details } = formatPlanTarget(pe, ex?.unit_type ?? "weight_reps");
            return (
              <li key={pe.id} className="flex items-baseline gap-3 py-2.5">
                <span className="num w-5 shrink-0 text-sm font-bold text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{ex?.name ?? pe.exercise_id}</p>
                  {details.length ? <p className="num truncate text-xs text-muted">{details.join(" · ")}</p> : null}
                </div>
                <span className="num shrink-0 font-bold">{main}</span>
              </li>
            );
          })}
          {plan.exercises.length === 0 ? <li className="py-2 text-sm text-muted">No exercises yet — add them during the workout.</li> : null}
        </ol>
      )}

      <StatusAction plan={plan} sessionId={sessionId} />
      {plan.status === "planned" ? (
        <form action={skipPlan.bind(null, plan.id)} className="mt-2 text-center">
          <button className="text-xs font-semibold text-faint underline-offset-2 hover:underline">Skip today</button>
        </form>
      ) : null}
    </Card>
  );
}
