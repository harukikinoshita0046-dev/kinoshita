import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/coach/api";
import { estimateDurationMin, logSessionBody, toLoggedSession } from "@/lib/coach/schemas";
import { zonedTimeToIso } from "@/lib/domain/dates";
import type { Exercise } from "@/lib/domain/exercise";

const ex = (id: string, name: string, aliases: string[] = []) => ({ id, name, aliases, active: true }) as unknown as Exercise;
const CATALOG = [ex("bench_press", "Bench Press", ["ベンチ"]), ex("squat", "Squat", ["スクワット"]), ex("ski_erg", "SkiErg")];
const TODAY = "2026-10-07";
const parse = (body: unknown) => toLoggedSession(logSessionBody.parse(body), CATALOG, TODAY, "Asia/Tokyo");

describe("zonedTimeToIso", () => {
  it("converts a local wall-clock time to an instant", () => {
    expect(zonedTimeToIso("2026-10-03", "18:30", "Asia/Tokyo")).toBe("2026-10-03T09:30:00.000Z");
    expect(zonedTimeToIso("2026-07-01", "12:00", "America/New_York")).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedTimeToIso("2026-01-15", "07:00", "Europe/London")).toBe("2026-01-15T07:00:00.000Z");
  });
});

describe("toLoggedSession", () => {
  it("expands listed sets and 'N sets of reps @ weight', numbering per exercise", () => {
    const s = parse({
      date: "2026-10-03",
      exercises: [
        { exercise_id: "ベンチ", sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 7, rpe: 9 }] },
        { exercise_id: "squat", sets: 3, reps: 5, weight: 100 },
        { exercise_id: "bench_press", sets: [{ weight: 60, reps: 12 }] },
      ],
    });
    expect(s.sets.map((x) => `${x.exercise_id}#${x.set_number} ${x.weight}x${x.reps}`)).toEqual([
      "bench_press#1 80x8",
      "bench_press#2 80x7",
      "squat#1 100x5",
      "squat#2 100x5",
      "squat#3 100x5",
      "bench_press#3 60x12",
    ]);
    expect(s.sets[1].rpe).toBe(9);
  });

  it("defaults the start to 18:00 local and estimates the length from the sets", () => {
    const s = parse({ date: "2026-10-03", exercises: [{ exercise_id: "squat", sets: 4, reps: 5, weight: 100 }] });
    expect(s.started_at).toBe("2026-10-03T09:00:00.000Z");
    expect((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60_000).toBe(estimateDurationMin(4));
    expect(estimateDurationMin(4)).toBe(22);
    expect(estimateDurationMin(0)).toBe(20);
    expect(estimateDurationMin(60)).toBe(120);
    expect(s.title).toBe("トレーニング");
  });

  it("uses the given start time, duration, title and type", () => {
    const s = parse({ date: "2026-10-03", title: "HYROX Upper", workout_type: "Upper", start_time: "7:15", duration_min: 75, exercises: [{ exercise_id: "SkiErg", sets: [{ distance: 1000, time: "3:55" }] }] });
    expect(s.workout_type).toBe("upper");
    expect(s.title).toBe("HYROX Upper");
    expect(s.started_at).toBe("2026-10-02T22:15:00.000Z");
    expect((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60_000).toBe(75);
    expect(s.sets[0]).toMatchObject({ exercise_id: "ski_erg", distance: 1000, time_seconds: 235 });
  });

  it("rejects future dates, unknown exercises and sets without reps, distance or time", () => {
    const err = (body: unknown) => {
      try {
        parse(body);
      } catch (e) {
        return e as ApiError;
      }
      throw new Error("expected an error");
    };
    expect(err({ date: "2026-10-08", exercises: [{ exercise_id: "squat", sets: 1, reps: 5 }] }).status).toBe(400);
    expect(err({ date: "2026-10-03", exercises: [{ exercise_id: "moon lift", sets: 1, reps: 5 }] }).status).toBe(422);
    expect(err({ date: "2026-10-03", exercises: [{ exercise_id: "squat", sets: [{ weight: 100 }] }] }).status).toBe(400);
    expect(err({ date: "3 Oct", exercises: [{ exercise_id: "squat", sets: 1, reps: 5 }] }).status).toBe(400);
  });
});
