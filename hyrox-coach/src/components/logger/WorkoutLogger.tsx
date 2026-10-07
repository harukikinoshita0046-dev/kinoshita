"use client";

import { Check, ChevronRight, CloudOff, Ellipsis, Plus, Repeat2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { discardWorkout, finishWorkout } from "@/app/(focus)/workout/[sessionId]/actions";
import { NumberRow } from "@/components/Pickers";
import { Stepper } from "@/components/Stepper";
import { QueueSync } from "@/components/QueueSync";
import { Sheet } from "@/components/Sheet";
import { buttonClass, cn } from "@/components/ui";
import { addExerciseToPlan, swapPlanExercise } from "@/lib/data/plans";
import { getExerciseHistories } from "@/lib/data/stats";
import { formatDayLabel } from "@/lib/domain/dates";
import { formatDuration, formatNumber } from "@/lib/domain/format";
import { formatPlanTarget } from "@/lib/domain/plan-format";
import { prefillSetValues } from "@/lib/domain/prefill";
import { compactSetSummary, formatSet } from "@/lib/domain/strength";
import { buildPb, type LoggedSet, type LoggerExercise, type LoggerSlot } from "@/lib/logger";
import { flushQueue, saveOrQueue } from "@/lib/offline-queue";
import { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";
import { ExercisePicker } from "./ExercisePicker";
import { useAlert, useNow, useStoredState, useWakeLock } from "./hooks";
import { RestPanel } from "./RestPanel";
import { isDraftValid, SetFields, type Draft } from "./SetFields";

type Props = {
  userId: string;
  session: { id: string; title: string; date: string; started_at: string; workout_plan_id: string | null };
  /** The athlete's today; a session dated earlier is a past workout being entered after the fact. */
  today: string;
  initialSlots: LoggerSlot[];
  initialSets: LoggedSet[];
  catalog: LoggerExercise[];
};

type Rest = { endsAt: number; total: number } | null;

const EMPTY_DRAFT: Draft = { weight: null, reps: null, distance: null, time_seconds: null, rpe: null };

function Elapsed({ since }: { since: string }) {
  const now = useNow(1000);
  return <span className="num">{formatDuration(Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000)))}</span>;
}

function targetLine(slot: LoggerSlot): string {
  const t = slot.target;
  const { main, details } = formatPlanTarget(
    {
      target_sets: t.sets,
      target_reps_min: t.repsMin,
      target_reps_max: t.repsMax,
      target_weight: t.weight,
      target_distance: t.distance,
      target_time: t.time,
      target_rpe: t.rpe,
      target_pace_min: t.paceMin,
      target_pace_max: t.paceMax,
      target_hr_zone: t.hrZone,
      rest_seconds: null,
    },
    slot.exercise.unit,
  );
  return [main, ...details].filter(Boolean).join(" · ");
}

function pbLine(slot: LoggerSlot): string | null {
  const { pb, exercise } = slot;
  if (exercise.unit === "distance_time" && pb.fastest) {
    return `${pb.fastest.distance ? `${formatNumber(pb.fastest.distance)} m ` : ""}${formatDuration(pb.fastest.time)}`;
  }
  if (exercise.unit === "bodyweight_reps" && pb.mostReps) {
    return `${pb.mostReps.weight ? `+${formatNumber(pb.mostReps.weight)} kg × ` : "BW × "}${pb.mostReps.reps}`;
  }
  if (pb.heaviest) {
    const reps = pb.heaviest.reps && exercise.unit !== "weight_distance" ? ` × ${pb.heaviest.reps}` : "";
    return `${formatNumber(pb.heaviest.weight)} kg${reps}${pb.e1rm ? ` · e1RM ${formatNumber(pb.e1rm, 1)}` : ""}`;
  }
  return null;
}

function toSetLike(s: LoggedSet) {
  return { set_number: s.set_number, weight: s.weight, reps: s.reps, distance: s.distance, time_seconds: s.time_seconds, rpe: s.rpe };
}

export function WorkoutLogger({ userId, session, today, initialSlots, initialSets, catalog }: Props) {
  const backfill = session.date < today;
  const db = useMemo(() => createClient(), []);
  const router = useRouter();
  const [slots, setSlots] = useState(initialSlots);
  const [sets, setSets] = useState<LoggedSet[]>(initialSets);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<{ set: LoggedSet; draft: Draft } | null>(null);
  const [picker, setPicker] = useState<null | { mode: "add" } | { mode: "swap"; slotId: string }>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { prime, alert } = useAlert();
  useWakeLock(!backfill);

  const setsFor = useCallback(
    (slotId: string) => sets.filter((s) => s.plan_exercise_id === slotId).sort((a, b) => a.set_number - b.set_number),
    [sets],
  );
  const firstIncomplete =
    initialSlots.find((s) => initialSets.filter((x) => x.plan_exercise_id === s.planExerciseId).length < (s.target.sets ?? 1)) ??
    initialSlots[0];
  const [activeId, setActiveId] = useStoredState<string | null>(`hx:active:${session.id}`, firstIncomplete?.planExerciseId ?? null);
  const [rest, setRest] = useStoredState<Rest>(`hx:rest:${session.id}`, null);

  const activeIndex = Math.max(
    0,
    slots.findIndex((s) => s.planExerciseId === activeId),
  );
  const slot: LoggerSlot | undefined = slots[activeIndex];
  const slotSets = slot ? setsFor(slot.planExerciseId) : [];

  const defaultDraft = (s: LoggerSlot, done: LoggedSet[]): Draft => ({
    ...prefillSetValues({
      unit: s.exercise.unit,
      target: { weight: s.target.weight, repsMin: s.target.repsMin, repsMax: s.target.repsMax, distance: s.target.distance, time: s.target.time },
      previousSets: s.previous?.sets ?? [],
      setIndex: done.length,
      lastCompleted: done.length ? toSetLike(done[done.length - 1]) : null,
      defaultDistance: s.exercise.defaultDistance,
    }),
    rpe: null,
  });
  const draft = slot ? (drafts[slot.planExerciseId] ?? defaultDraft(slot, slotSets)) : EMPTY_DRAFT;

  const totalTarget = slots.reduce((a, s) => a + (s.target.sets ?? 0), 0);
  const totalDone = sets.length;

  const updateDraft = (patch: Partial<Draft>) => {
    if (!slot) return;
    setDrafts((prev) => ({ ...prev, [slot.planExerciseId]: { ...draft, ...patch } }));
  };

  const persist = async (set: LoggedSet) => {
    const result = await saveOrQueue(db, {
      kind: "upsert_set",
      set: {
        id: set.id,
        user_id: userId,
        session_id: session.id,
        plan_exercise_id: set.plan_exercise_id,
        exercise_id: set.exercise_id,
        set_number: set.set_number,
        weight: set.weight,
        reps: set.reps,
        distance: set.distance,
        time_seconds: set.time_seconds,
        rpe: set.rpe,
        completed_at: set.completed_at,
      },
    });
    setSets((prev) => prev.map((s) => (s.id === set.id ? { ...s, sync: result === "saved" ? "saved" : "queued" } : s)));
  };

  const nextIncompleteAfter = (index: number, allSets: LoggedSet[]): LoggerSlot | undefined => {
    const ordered = [...slots.slice(index + 1), ...slots.slice(0, index)];
    return ordered.find((s) => allSets.filter((x) => x.plan_exercise_id === s.planExerciseId).length < (s.target.sets ?? 1));
  };

  const completeSet = () => {
    if (!slot || !isDraftValid(slot.exercise.unit, draft)) return;
    prime();
    const newSet: LoggedSet = {
      id: uuid(),
      plan_exercise_id: slot.planExerciseId,
      exercise_id: slot.exercise.id,
      set_number: (slotSets[slotSets.length - 1]?.set_number ?? 0) + 1,
      weight: draft.weight,
      reps: draft.reps,
      distance: draft.distance,
      time_seconds: draft.time_seconds,
      rpe: draft.rpe,
      // Past workouts: place the set inside that session (1 min apart) so history and "previous" stay in order.
      completed_at: backfill ? new Date(Date.parse(session.started_at) + (sets.length + 1) * 60_000).toISOString() : new Date().toISOString(),
      sync: "saving",
    };
    const allSets = [...sets, newSet];
    setSets(allSets);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[slot.planExerciseId];
      return next;
    });
    const restSeconds = slot.target.rest ?? slot.exercise.rest;
    if (restSeconds > 0 && !backfill) setRest({ endsAt: Date.now() + restSeconds * 1000, total: restSeconds });
    if (slot.target.sets && slotSets.length + 1 >= slot.target.sets) {
      const next = nextIncompleteAfter(activeIndex, allSets);
      if (next) setActiveId(next.planExerciseId);
    }
    void persist(newSet);
  };

  const saveEdit = () => {
    if (!editing) return;
    const updated: LoggedSet = { ...editing.set, ...editing.draft, sync: "saving" };
    setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
    void persist(updated);
  };

  const deleteEditing = () => {
    if (!editing) return;
    const id = editing.set.id;
    setSets((prev) => prev.filter((s) => s.id !== id));
    setEditing(null);
    void saveOrQueue(db, { kind: "delete_set", id, userId });
  };

  const loadHistory = async (exercise: LoggerExercise) => {
    const histories = await getExerciseHistories(db, userId, [exercise.id], { sessions: 1, excludeSessionId: session.id });
    const h = histories.get(exercise.id);
    const last = h?.sessions[0];
    return {
      previous: last
        ? {
            date: last.date,
            sets: last.sets.map((s) => ({ ...s })),
            avgRpe: last.stats.avg_rpe == null ? null : Number(last.stats.avg_rpe),
          }
        : null,
      pb: buildPb(h),
    };
  };

  const onPick = async (exercise: LoggerExercise) => {
    const mode = picker;
    setPicker(null);
    setError(null);
    try {
      if (mode?.mode === "add" && session.workout_plan_id) {
        const row = await addExerciseToPlan(db, userId, session.workout_plan_id, {
          exercise_id: exercise.id,
          target_sets: 3,
          rest_seconds: exercise.rest,
        });
        const history = await loadHistory(exercise);
        const newSlot: LoggerSlot = {
          planExerciseId: row.id,
          exercise,
          originalExerciseId: null,
          target: { sets: 3, repsMin: null, repsMax: null, weight: null, distance: null, time: null, rpe: null, paceMin: null, paceMax: null, hrZone: null, rest: exercise.rest, note: null },
          ...history,
        };
        setSlots((prev) => [...prev, newSlot]);
        setActiveId(row.id);
      } else if (mode?.mode === "swap") {
        const target = slots.find((s) => s.planExerciseId === mode.slotId);
        if (!target) return;
        await swapPlanExercise(
          db,
          userId,
          { id: target.planExerciseId, exercise_id: target.exercise.id, original_exercise_id: target.originalExerciseId },
          exercise.id,
        );
        const history = await loadHistory(exercise);
        setSlots((prev) =>
          prev.map((s) =>
            s.planExerciseId === mode.slotId
              ? { ...s, exercise, originalExerciseId: s.originalExerciseId ?? s.exercise.id, target: { ...s.target, rest: s.target.rest ?? exercise.rest }, ...history }
              : s,
          ),
        );
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[mode.slotId];
          return next;
        });
      }
    } catch {
      setError("トレーニングを更新できませんでした。通信状況を確認して、もう一度お試しください。");
    }
  };

  const finish = () => {
    startTransition(async () => {
      await flushQueue(db);
      try {
        localStorage.removeItem(`hx:active:${session.id}`);
        localStorage.removeItem(`hx:rest:${session.id}`);
      } catch {}
      await finishWorkout(session.id, { sessionRpe, notes: notes || null, durationMin: backfill ? (durationMin ?? estimatedMin) : null });
    });
  };

  const restDone = useCallback(() => {
    alert();
    setRest(null);
  }, [alert, setRest]);

  const nextLabel = (() => {
    if (!slot) return null;
    const n = slotSets.length + 1;
    const v = draft;
    const load = v.weight != null && slot.exercise.unit !== "distance_time" ? `${formatNumber(v.weight)} kg` : null;
    const work = v.reps ? `× ${v.reps}` : v.distance ? `${formatNumber(v.distance)} m` : null;
    return [`${slot.exercise.name} · SET ${n}`, [load, work].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  })();

  const queuedCount = sets.filter((s) => s.sync === "queued").length;
  const estimatedMin = Math.min(120, Math.max(20, 10 + sets.length * 3));
  const extra = slot?.target.sets != null && slotSets.length >= slot.target.sets;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col pt-safe">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-black/95 px-3 py-2 backdrop-blur">
        <button type="button" onClick={() => router.push("/today")} aria-label="閉じる" className="rounded-full bg-surface-2 p-2.5 text-muted">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-bold">{session.title}</p>
          <p className="text-xs text-muted">
            {backfill ? <span className="font-semibold text-accent">{formatDayLabel(session.date)}の記録</span> : <Elapsed since={session.started_at} />} ·{" "}
            <span className="num">
              {totalDone}/{totalTarget || "–"}
            </span>{" "}
            セット {queuedCount > 0 ? <QueueSync compact /> : null}
          </p>
        </div>
        <button type="button" onClick={() => setFinishOpen(true)} className={buttonClass("primary", "sm")} data-testid="finish-open">
          終了
        </button>
      </header>

      {/* Exercise chips */}
      <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none]" aria-label="種目一覧">
        {slots.map((s, i) => {
          const done = setsFor(s.planExerciseId).length;
          const complete = s.target.sets != null && done >= s.target.sets;
          return (
            <button
              key={s.planExerciseId}
              type="button"
              onClick={() => setActiveId(s.planExerciseId)}
              aria-current={i === activeIndex ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold",
                i === activeIndex ? "bg-text text-black" : complete ? "bg-push/15 text-push" : "bg-surface-2 text-muted",
              )}
            >
              {complete ? <Check className="h-3.5 w-3.5" /> : null}
              {s.exercise.name}
              <span className="num opacity-70">
                {done}/{s.target.sets ?? "–"}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPicker({ mode: "add" })}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-xs font-bold text-muted"
          data-testid="add-exercise"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> 種目を追加
        </button>
      </nav>

      {error ? <p className="mx-3 rounded-xl bg-recover/10 px-3 py-2 text-sm text-recover">{error}</p> : null}

      {slot ? (
        <main className="flex-1 space-y-3 px-4 pb-36 pt-1">
          {/* Exercise header */}
          <section>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-extrabold uppercase leading-tight tracking-tight" data-testid="exercise-name">
                {slot.exercise.name}
              </h1>
              <button type="button" onClick={() => setMenuOpen(true)} aria-label="種目のオプション" className="rounded-full bg-surface-2 p-2 text-muted">
                <Ellipsis className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-1.5 space-y-0.5 text-sm">
              <div className="flex gap-3">
                <dt className="label w-12 shrink-0 pt-px">目標</dt>
                <dd className="num font-semibold" data-testid="target-line">
                  {targetLine(slot) || "–"}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="label w-12 shrink-0 pt-px">前回</dt>
                <dd className="num text-muted" data-testid="previous-line">
                  {slot.previous
                    ? `${compactSetSummary(slot.previous.sets, slot.exercise.unit)}${slot.previous.avgRpe ? ` · RPE ${slot.previous.avgRpe}` : ""}`
                    : "初めての種目"}
                </dd>
              </div>
              {pbLine(slot) ? (
                <div className="flex gap-3">
                  <dt className="label w-12 shrink-0 pt-px">PB</dt>
                  <dd className="num text-muted">{pbLine(slot)}</dd>
                </div>
              ) : null}
            </dl>
            {slot.target.note ? <p className="mt-2 rounded-xl bg-accent/10 px-3 py-1.5 text-xs text-accent">{slot.target.note}</p> : null}
            {slot.originalExerciseId ? <p className="mt-2 text-xs text-faint">入れ替え前: {slot.originalExerciseId.replaceAll("_", " ")}</p> : null}
          </section>

          {/* Completed sets (tap to edit) */}
          {slotSets.length > 0 ? (
            <ol className="flex flex-wrap gap-1.5" data-testid="completed-sets">
              {slotSets.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        set: s,
                        draft: { weight: s.weight, reps: s.reps, distance: s.distance, time_seconds: s.time_seconds, rpe: s.rpe },
                      })
                    }
                    className="num flex items-center gap-1.5 rounded-xl bg-surface px-2.5 py-2 text-sm active:bg-surface-2"
                    aria-label={`セット${i + 1}を編集`}
                  >
                    <Check className="h-3.5 w-3.5 text-push" strokeWidth={3} />
                    <span className="font-bold">{formatSet(toSetLike(s), slot.exercise.unit)}</span>
                    {s.rpe ? <span className="text-xs text-muted">@{s.rpe}</span> : null}
                    {s.sync === "queued" ? <CloudOff className="h-3.5 w-3.5 text-low" aria-label="未同期" /> : null}
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          {/* Current set */}
          <section className="rounded-3xl bg-surface p-3" data-testid="set-editor">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold" data-testid="current-set-label">
                SET {slotSets.length + 1}
                {slot.target.sets ? <span className="text-faint"> / {slot.target.sets}</span> : null}
              </h2>
              {extra ? <span className="text-xs font-bold text-push">目標達成 · 追加セット</span> : null}
            </div>
            <SetFields exercise={slot.exercise} draft={draft} onChange={updateDraft} />
          </section>

          {extra ? (
            (() => {
              const next = nextIncompleteAfter(activeIndex, sets);
              return next ? (
                <button type="button" onClick={() => setActiveId(next.planExerciseId)} className={buttonClass("secondary", "lg", "w-full")}>
                  次へ: {next.exercise.name} <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : (
                <button type="button" onClick={() => setFinishOpen(true)} className={buttonClass("secondary", "lg", "w-full")}>
                  全種目完了 · トレーニングを終了
                </button>
              );
            })()
          ) : null}
        </main>
      ) : (
        <main className="flex-1 px-4 pt-10 text-center">
          <p className="text-lg font-bold">まだ種目がありません</p>
          <p className="mt-1 text-sm text-muted">最初の種目を追加して記録を始めましょう。</p>
          <button type="button" onClick={() => setPicker({ mode: "add" })} className={buttonClass("primary", "lg", "mt-6 w-full")}>
            <Plus className="h-5 w-5" aria-hidden="true" /> 種目を追加
          </button>
        </main>
      )}

      {/* Bottom action: complete set or rest timer */}
      {slot ? (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black to-black/0 pt-4">
          <div className="mx-auto max-w-md px-4">
            {rest ? (
              <RestPanel
                endsAt={rest.endsAt}
                total={rest.total}
                nextLabel={nextLabel}
                onAdjust={(d) => setRest({ endsAt: Math.max(Date.now(), rest.endsAt + d * 1000), total: Math.max(1, rest.total + d) })}
                onSkip={() => setRest(null)}
                onDone={restDone}
              />
            ) : (
              <button
                type="button"
                onClick={completeSet}
                disabled={!isDraftValid(slot.exercise.unit, draft)}
                className={buttonClass("primary", "lg", "w-full text-xl")}
                data-testid="complete-set"
              >
                <Check className="h-7 w-7" strokeWidth={3} aria-hidden="true" /> セット完了
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Edit a completed set */}
      <Sheet open={editing != null} onClose={() => setEditing(null)} title="セットを編集">
        {editing && slot ? (
          <div className="space-y-4 pb-4">
            <SetFields
              exercise={slots.find((s) => s.planExerciseId === editing.set.plan_exercise_id)?.exercise ?? slot.exercise}
              draft={editing.draft}
              onChange={(patch) => setEditing({ ...editing, draft: { ...editing.draft, ...patch } })}
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={deleteEditing} className={buttonClass("danger", "lg")}>
                削除
              </button>
              <button type="button" onClick={saveEdit} className={buttonClass("primary", "lg")}>
                保存
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* Exercise options */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={slot?.exercise.name ?? "種目"}>
        <div className="space-y-2 pb-4">
          <button
            type="button"
            disabled={!slot || slotSets.length > 0}
            onClick={() => {
              setMenuOpen(false);
              if (slot) setPicker({ mode: "swap", slotId: slot.planExerciseId });
            }}
            className={buttonClass("secondary", "lg", "w-full justify-start")}
          >
            <Repeat2 className="h-5 w-5" aria-hidden="true" /> 種目を入れ替え{slotSets.length > 0 ? "（1セット目の記録前のみ）" : ""}
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPicker({ mode: "add" });
            }}
            className={buttonClass("secondary", "lg", "w-full justify-start")}
          >
            <Plus className="h-5 w-5" aria-hidden="true" /> 種目を追加
          </button>
        </div>
      </Sheet>

      <ExercisePicker
        open={picker != null}
        title={picker?.mode === "swap" ? "種目を入れ替え" : "種目を追加"}
        catalog={catalog}
        onClose={() => setPicker(null)}
        onPick={(e) => void onPick(e)}
      />

      {/* Finish */}
      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title="トレーニングを終了">
        <div className="space-y-4 pb-4">
          {backfill ? (
            <div data-testid="backfill-duration">
              <p className="label mb-2">トレーニング時間（分）</p>
              <Stepper label="トレーニング時間" value={durationMin ?? estimatedMin} onChange={(v) => setDurationMin(Math.round(v))} step={5} min={5} max={600} unit="分" size="md" inputMode="numeric" />
              <p className="mt-1 text-xs text-faint">{formatDayLabel(session.date)}の記録として保存します。負荷の計算に使います。</p>
            </div>
          ) : null}
          <div>
            <p className="label mb-2">セッションRPE（全体のきつさ）</p>
            <NumberRow values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} value={sessionRpe} onChange={setSessionRpe} testId="session-rpe" />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="コーチへのメモ（任意）"
            aria-label="コーチへのメモ（任意）"
            rows={3}
            maxLength={2000}
            className="w-full rounded-xl border border-line bg-surface-2 p-3 text-base focus:border-accent focus:outline-none"
          />
          <button type="button" onClick={finish} disabled={pending} className={buttonClass("primary", "lg", "w-full")} data-testid="finish-save">
            {pending ? "保存中…" : "トレーニングを保存"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("このトレーニングを破棄しますか？記録済みのセットは残りますが、セッションは中断扱いになります。")) {
                startTransition(async () => {
                  await discardWorkout(session.id);
                });
              }
            }}
            className={buttonClass("ghost", "md", "w-full text-recover")}
          >
            トレーニングを破棄
          </button>
        </div>
      </Sheet>
    </div>
  );
}
