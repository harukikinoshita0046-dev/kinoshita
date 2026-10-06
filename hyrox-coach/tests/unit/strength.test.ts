import { describe, expect, it } from "vitest";
import { compactSetSummary, epley1RM, sessionStats, suggestProgression, summarizeSets } from "@/lib/domain/strength";
import { prefillSetValues } from "@/lib/domain/prefill";
import { resolveExercise, snapToIncrement } from "@/lib/domain/exercise";

const bench = (reps: number[], weight = 80, rpe: number | null = 8.7) =>
  reps.map((r, i) => ({ set_number: i + 1, weight, reps: r, rpe }));

describe("strength stats", () => {
  it("estimates 1RM with Epley for 1-12 reps only", () => {
    expect(epley1RM(100, 3)).toBe(110);
    expect(epley1RM(80, 8)).toBe(101.3);
    expect(epley1RM(60, 20)).toBeNull();
    expect(epley1RM(0, 5)).toBeNull();
  });

  it("summarises sets the way the coach reads them", () => {
    const sets = bench([8, 8, 7, 6]);
    expect(summarizeSets(sets, "weight_reps")).toBe("80×8, 80×8, 80×7, 80×6");
    expect(compactSetSummary(sets, "weight_reps")).toBe("80 kg · 8 / 8 / 7 / 6");
    expect(compactSetSummary([{ weight: 0, reps: 10, rpe: null }], "bodyweight_reps")).toBe("BW · 10");
    const stats = sessionStats(sets);
    expect(stats.volumeKg).toBe(2320);
    expect(stats.topWeight).toBe(80);
    expect(stats.avgRpe).toBe(8.7);
  });

  it("ignores warm-up sets", () => {
    const stats = sessionStats([{ weight: 40, reps: 10, rpe: null, is_warmup: true }, ...bench([8])]);
    expect(stats.workingSets).toBe(1);
    expect(stats.volumeKg).toBe(640);
  });
});

describe("double progression", () => {
  const target = { sets: 4, repsMin: 6, repsMax: 8, rpe: 8 };

  it("repeats the load when not every set hit the top of the range (spec example)", () => {
    const s = suggestProgression(bench([8, 8, 7, 6]), target, 2.5, "weight_reps");
    expect(s.action).toBe("repeat");
    expect(s.weight).toBe(80);
  });

  it("adds one increment when all sets hit the top of the range at target RPE", () => {
    const s = suggestProgression(bench([8, 8, 8, 8], 80, 8), target, 2.5, "weight_reps");
    expect(s.action).toBe("increase");
    expect(s.weight).toBe(82.5);
  });

  it("drops the load when most sets missed the bottom of the range", () => {
    const s = suggestProgression(bench([6, 5, 5, 4], 85, 9.5), target, 2.5, "weight_reps");
    expect(s.action).toBe("decrease");
    expect(s.weight).toBe(82.5);
  });

  it("does not suggest loads for distance work", () => {
    expect(suggestProgression([{ weight: null, reps: null, rpe: 8, distance: 1000, time_seconds: 240 }], {}, 2.5, "distance_time").action).toBe(
      "none",
    );
  });
});

describe("prefill", () => {
  const previousSets = bench([8, 8, 7, 6]);

  it("uses the coach's target weight first", () => {
    const v = prefillSetValues({
      unit: "weight_reps",
      target: { weight: 82.5, repsMin: 6, repsMax: 8 },
      previousSets,
      setIndex: 0,
      lastCompleted: null,
    });
    expect(v.weight).toBe(82.5);
    expect(v.reps).toBe(8);
  });

  it("falls back to last session's matching set", () => {
    const v = prefillSetValues({ unit: "weight_reps", target: {}, previousSets, setIndex: 2, lastCompleted: null });
    expect(v).toEqual({ weight: 80, reps: 7, distance: null, time_seconds: null });
  });

  it("repeats the set just completed", () => {
    const v = prefillSetValues({
      unit: "weight_reps",
      target: { weight: 82.5 },
      previousSets,
      setIndex: 1,
      lastCompleted: { weight: 82.5, reps: 7, rpe: 8 },
    });
    expect(v.weight).toBe(82.5);
    expect(v.reps).toBe(7);
  });

  it("starts bodyweight exercises at +0 kg and distance work at the standard distance", () => {
    expect(prefillSetValues({ unit: "bodyweight_reps", target: {}, previousSets: [], setIndex: 0, lastCompleted: null }).weight).toBe(0);
    const ski = prefillSetValues({ unit: "distance_time", target: {}, previousSets: [], setIndex: 0, lastCompleted: null, defaultDistance: 1000 });
    expect(ski.distance).toBe(1000);
    expect(ski.weight).toBeNull();
  });
});

describe("exercise helpers", () => {
  it("snaps to the weight increment", () => {
    expect(snapToIncrement(82.4999, 2.5)).toBe(82.5);
    expect(snapToIncrement(23, 2)).toBe(24);
    expect(snapToIncrement(-1, 2.5)).toBe(0);
  });

  it("resolves exercises by id, name or alias", () => {
    const list = [
      { id: "bench_press", name: "Bench Press", aliases: ["bench"] },
      { id: "farmers_carry", name: "Farmer's Carry", aliases: ["farmers_walk"] },
    ];
    expect(resolveExercise(list, "bench_press")?.id).toBe("bench_press");
    expect(resolveExercise(list, "Bench Press")?.id).toBe("bench_press");
    expect(resolveExercise(list, "Farmer's Carry")?.id).toBe("farmers_carry");
    expect(resolveExercise(list, "farmers walk")?.id).toBe("farmers_carry");
    expect(resolveExercise(list, "squat")).toBeUndefined();
  });
});
