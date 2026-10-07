import { Bot, Check, Play, RotateCcw, User } from "lucide-react";
import Link from "next/link";
import { restorePlan, skipPlan, startWorkout } from "@/app/(app)/today/actions";
import type { Plan } from "@/lib/data/plans";
import type { Exercise } from "@/lib/domain/exercise";
import { formatPlanDistance, formatPaceRange, formatPlanTarget } from "@/lib/domain/plan-format";
import { workoutTypeLabel } from "@/lib/domain/workout-types";
import { SubmitButton } from "../SubmitButton";
import { buttonClass, Card, cn, Pill } from "../ui";

function SourceBadge({ plan }: { plan: Plan }) {
  return plan.created_by === "AI" ? (
    <Pill className="bg-accent/15 text-accent">
      <Bot className="mr-1 h-3 w-3" aria-hidden="true" /> AIコーチ
    </Pill>
  ) : (
    <Pill>
      <User className="mr-1 h-3 w-3" aria-hidden="true" /> 自分
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
          <Check className="h-5 w-5" aria-hidden="true" /> 完了
        </span>
        {sessionId ? (
          <Link href={`/history/${sessionId}`} className="text-sm font-semibold underline">
            詳細を見る
          </Link>
        ) : null}
      </div>
    );
  }
  if (plan.status === "skipped") {
    return (
      <form action={restorePlan.bind(null, plan.id)} className="mt-4">
        <SubmitButton className={buttonClass("secondary", "md", "w-full")} pendingText="元に戻しています…">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> スキップ済み · 元に戻す
        </SubmitButton>
      </form>
    );
  }
  if (isRun) {
    return (
      <Link href={`/run/live/${plan.id}`} className={buttonClass("primary", "lg", "mt-4 w-full")} data-testid="start-run">
        <Play className="h-5 w-5 fill-current" aria-hidden="true" /> ランを開始
      </Link>
    );
  }
  if (isSim) {
    return (
      <Link href={`/hyrox/simulation?plan=${plan.id}`} className={buttonClass("primary", "lg", "mt-4 w-full")}>
        <Play className="h-5 w-5 fill-current" aria-hidden="true" /> シミュレーションを開始
      </Link>
    );
  }
  return (
    <form action={startWorkout.bind(null, plan.id)} className="mt-4">
      <SubmitButton className={buttonClass("primary", "lg", "w-full")} data-testid="start-workout" pendingText="準備しています…">
        <Play className="h-5 w-5 fill-current" aria-hidden="true" /> {plan.status === "in_progress" ? "トレーニングを再開" : "トレーニング開始"}
      </SubmitButton>
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
          {plan.estimated_duration_min ? <span className="num text-xs text-muted">約{plan.estimated_duration_min}分</span> : null}
        </div>
      </div>
      <CoachReason reason={plan.coach_reason} />

      {runEx ? (
        <div className="mt-4 space-y-3">
          <p className="num text-4xl font-extrabold">
            {runEx.target_sets && runEx.target_sets > 1 ? `${runEx.target_sets} × ` : ""}
            {runEx.target_distance ? formatPlanDistance(runEx.target_distance) : runEx.target_time ? `${Math.round(runEx.target_time / 60)}分` : "ラン"}
          </p>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="label">目標ペース</dt>
              <dd className="num mt-1 font-bold">{formatPaceRange(runEx.target_pace_min, runEx.target_pace_max) ?? "–"}</dd>
            </div>
            <div>
              <dt className="label">レスト</dt>
              <dd className="num mt-1 font-bold">{runEx.rest_seconds != null ? `${runEx.rest_seconds}秒` : "–"}</dd>
            </div>
            <div>
              <dt className="label">目標心拍</dt>
              <dd className="num mt-1 font-bold">{runEx.target_hr_zone ? `ゾーン${runEx.target_hr_zone}` : "–"}</dd>
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
          {plan.exercises.length === 0 ? <li className="py-2 text-sm text-muted">種目はまだありません。トレーニング中に追加できます。</li> : null}
        </ol>
      )}

      <StatusAction plan={plan} sessionId={sessionId} />
      {plan.status === "planned" ? (
        <form action={skipPlan.bind(null, plan.id)} className="mt-2 text-center">
          <SubmitButton className="inline-flex min-h-11 items-center gap-1.5 px-3 text-xs font-semibold text-faint underline-offset-2 hover:underline" pendingText="スキップしています…">
            今日はスキップ
          </SubmitButton>
        </form>
      ) : null}
    </Card>
  );
}
