import { ArrowLeft, Bot, Check, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Card, Page, Pill, SectionTitle, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { indexExercises, listExercises } from "@/lib/data/exercises";
import { getSessionDetail, type SetRow } from "@/lib/data/sessions";
import { getExerciseHistories } from "@/lib/data/stats";
import { isUuid } from "@/lib/data/util";
import { formatDayLabel } from "@/lib/domain/dates";
import { formatNumber, minutesStat } from "@/lib/domain/format";
import { formatPlanTarget } from "@/lib/domain/plan-format";
import { epley1RM, formatSet, sessionStats } from "@/lib/domain/strength";
import { workoutTypeLabel } from "@/lib/domain/workout-types";
import { deleteWorkout } from "../actions";

export const metadata: Metadata = { title: "トレーニング" };

export default async function WorkoutDetailPage({ params, searchParams }: PageProps<"/history/[sessionId]">) {
  const { sessionId } = await params;
  const { done } = await searchParams;
  if (!isUuid(sessionId)) notFound();
  const { supabase, userId } = await requireUser();
  const detail = await getSessionDetail(supabase, userId, sessionId);
  if (!detail) notFound();
  const { session, plan, sets } = detail;

  const exercises = indexExercises(await listExercises(supabase, userId, { includeInactive: true }));
  const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
  const histories = await getExerciseHistories(supabase, userId, exerciseIds, { sessions: 0 });

  // Group sets by plan slot, keeping plan order; sets without a slot go last.
  const slots = (plan?.exercises ?? []).map((pe) => ({ key: pe.id, exerciseId: pe.exercise_id, target: pe, sets: [] as SetRow[] }));
  const orphan = new Map<string, SetRow[]>();
  for (const s of sets) {
    const slot = slots.find((x) => x.key === s.plan_exercise_id);
    if (slot) slot.sets.push(s);
    else orphan.set(s.exercise_id, [...(orphan.get(s.exercise_id) ?? []), s]);
  }
  const groups = [
    ...slots,
    ...[...orphan.entries()].map(([exerciseId, list]) => ({ key: exerciseId, exerciseId, target: null, sets: list })),
  ].filter((g) => g.sets.length > 0 || g.target);

  const stats = sessionStats(sets);
  const minutes = session.duration_seconds ? session.duration_seconds / 60 : null;
  const load = minutes && session.session_rpe ? Math.round(minutes * session.session_rpe) : null;

  return (
    <Page>
      <div className="flex items-center justify-between pt-4">
        <Link href="/history" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> HISTORY
        </Link>
        {plan?.created_by === "AI" ? (
          <Pill className="bg-accent/15 text-accent">
            <Bot className="mr-1 h-3 w-3" aria-hidden="true" /> AIメニュー
          </Pill>
        ) : null}
      </div>

      {done ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-push/10 px-4 py-3 font-bold text-push" data-testid="saved-banner">
          <Check className="h-5 w-5" aria-hidden="true" /> トレーニングを保存しました
        </div>
      ) : null}

      <header className="pb-2 pt-4">
        <p className="label">
          {formatDayLabel(session.date)} · {workoutTypeLabel(session.workout_type)}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight" data-testid="workout-title">
          {session.title}
        </h1>
      </header>

      <Card className="grid grid-cols-4 gap-2">
        <Stat label="時間" {...minutesStat(minutes)} size="sm" />
        <Stat label="セット" value={stats.workingSets} size="sm" />
        <Stat label="ボリューム" value={stats.volumeKg ? formatNumber(stats.volumeKg / 1000, 1) : "–"} unit={stats.volumeKg ? "t" : undefined} size="sm" />
        <Stat label="sRPE" value={session.session_rpe ?? "–"} sub={load ? `${load} AU` : undefined} size="sm" />
      </Card>

      {plan?.coach_reason ? <p className="mt-3 text-sm leading-relaxed text-muted">{plan.coach_reason}</p> : null}

      <SectionTitle>種目</SectionTitle>
      <div className="space-y-2">
        {groups.map((g) => {
          const ex = exercises.get(g.exerciseId);
          const unit = ex?.unit_type ?? "weight_reps";
          const pbs = histories.get(g.exerciseId)?.pbs;
          const target = g.target ? formatPlanTarget(g.target, unit) : null;
          return (
            <Card key={g.key} data-testid="exercise-group">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-bold">{ex?.name ?? g.exerciseId}</h3>
                {target ? <span className="num text-xs text-muted">{[target.main, ...target.details].join(" · ")}</span> : null}
              </div>
              {g.sets.length === 0 ? (
                <p className="mt-2 text-sm text-faint">未実施</p>
              ) : (
                <ol className="mt-2 space-y-1">
                  {g.sets.map((s, i) => {
                    const isHeaviestPb = pbs?.heaviest?.date === session.date && Number(pbs.heaviest.weight) === Number(s.weight) && pbs.heaviest.reps === s.reps;
                    const e1 = epley1RM(s.weight, s.reps);
                    const isE1rmPb = e1 != null && pbs?.e1rm?.date === session.date && Number(pbs.e1rm.e1rm) === e1;
                    const belowTarget = g.target?.target_reps_min != null && s.reps != null && s.reps < g.target.target_reps_min;
                    return (
                      <li key={s.id} className="num flex items-center gap-3 text-sm">
                        <span className="w-6 text-faint">{i + 1}</span>
                        <span className="flex-1 font-semibold">{formatSet(s, unit)}</span>
                        {isHeaviestPb || isE1rmPb ? (
                          <span className="flex items-center gap-1 rounded bg-moderate/15 px-1.5 text-[10px] font-bold text-moderate">
                            <Trophy className="h-3 w-3" aria-hidden="true" /> PB
                          </span>
                        ) : null}
                        {belowTarget ? <span className="text-[11px] font-bold text-low">目標未達</span> : null}
                        <span className="w-14 text-right text-muted">{s.rpe ? `RPE ${s.rpe}` : ""}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          );
        })}
      </div>

      {session.notes ? (
        <>
          <SectionTitle>メモ</SectionTitle>
          <Card>
            <p className="whitespace-pre-line text-sm">{session.notes}</p>
          </Card>
        </>
      ) : null}

      <form action={deleteWorkout.bind(null, session.id)} className="mt-8">
        <ConfirmButton message="このトレーニングと記録したセットをすべて削除しますか？">トレーニングを削除</ConfirmButton>
      </form>
    </Page>
  );
}
