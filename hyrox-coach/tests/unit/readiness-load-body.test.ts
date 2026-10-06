import { describe, expect, it } from "vitest";
import { baselineOf, computeReadiness, readinessLevel } from "@/lib/domain/readiness";
import { runLoadEntry, strengthLoadEntry, summarizeLoad, type LoadEntry } from "@/lib/domain/training-load";
import { lossRateAssessment, weightTrend } from "@/lib/domain/body";
import { addDays } from "@/lib/domain/dates";

const base = {
  sleepMinutes: 462,
  hrv: 61,
  hrvBaseline: { mean: 58, sd: 5, n: 28 },
  restingHr: 52,
  restingHrBaseline: { mean: 53, sd: 2, n: 28 },
  loadYesterday: 0,
  typicalSessionDayLoad: 450,
  acwr: 1.05,
  soreness: 2,
  fatigue: 2,
  motivation: 4,
};

describe("readiness", () => {
  it("scores a well-recovered morning as GOOD or better", () => {
    const r = computeReadiness(base);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(["push", "good"]).toContain(r.level);
    expect(r.components.map((c) => c.key)).toEqual(["sleep", "hrv", "resting_hr", "load", "subjective"]);
    expect(r.components.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 1);
  });

  it("drops with short sleep, suppressed HRV, high RHR and a big day yesterday", () => {
    const r = computeReadiness({
      ...base,
      sleepMinutes: 330,
      hrv: 45,
      restingHr: 58,
      loadYesterday: 900,
      acwr: 1.7,
      soreness: 4,
      fatigue: 4,
      motivation: 2,
    });
    expect(r.score).toBeLessThan(45);
    expect(["low", "recover"]).toContain(r.level);
  });

  it("re-weights when data is missing and refuses to score with < 2 components", () => {
    const partial = computeReadiness({ ...base, hrv: null, restingHr: null, loadYesterday: null });
    expect(partial.score).not.toBeNull();
    expect(partial.missing).toEqual(["hrv", "resting_hr", "load"]);
    const none = computeReadiness({ ...base, sleepMinutes: null, hrv: null, restingHr: null, loadYesterday: null, soreness: null, fatigue: null, motivation: 3 });
    expect(none.score).toBeNull();
    expect(none.label).toBe("CHECK IN");
  });

  it("maps scores to labels", () => {
    expect(readinessLevel(87)).toBe("push");
    expect(readinessLevel(82)).toBe("good");
    expect(readinessLevel(60)).toBe("moderate");
    expect(readinessLevel(30)).toBe("recover");
  });

  it("needs at least 5 days for a baseline", () => {
    expect(baselineOf([50, 52, null, 55])).toBeNull();
    expect(baselineOf([50, 52, 54, 56, 58])?.mean).toBe(54);
  });
});

describe("training load", () => {
  it("computes sRPE loads and ACWR", () => {
    const today = "2026-10-06";
    const entries: LoadEntry[] = [];
    for (let i = 1; i <= 28; i++) {
      if (i % 2 === 0) entries.push(strengthLoadEntry({ date: addDays(today, -i), duration_seconds: 3600, session_rpe: 7 }));
    }
    entries.push(runLoadEntry({ date: today, duration_seconds: 1800, rpe: null, run_type: "zone2" }));
    const s = summarizeLoad(entries, today);
    expect(entries[0].load).toBe(420);
    expect(s.acute7).toBe(120 + 3 * 420);
    // sessions on days -2..-26 fall inside the 28-day window (day -28 does not)
    expect(s.chronicWeekly28).toBe(Math.round((120 + 13 * 420) / 4));
    expect(s.acwr).toBeGreaterThan(0.8);
    expect(s.acwr).toBeLessThan(1.1);
    expect(s.daysSinceRest).toBe(1);
  });
});

describe("body trend", () => {
  it("computes 7-day averages, weekly change and loss rate", () => {
    const today = "2026-10-06";
    const points = Array.from({ length: 35 }, (_, i) => ({ date: addDays(today, -34 + i), weight: 80 - i * 0.07 }));
    const t = weightTrend(points, today, 75);
    expect(t.latest?.weight).toBeCloseTo(77.62, 2);
    expect(t.weeklyChange).toBeCloseTo(-0.49, 2);
    expect(t.trend).toBe("losing");
    expect(lossRateAssessment(t.weeklyRatePct)).toBe("on_track");
    expect(t.projectedTargetDate).not.toBeNull();
  });

  it("handles sparse data", () => {
    const t = weightTrend([{ date: "2026-10-06", weight: 78.4 }], "2026-10-06");
    expect(t.latest?.weight).toBe(78.4);
    expect(t.avg7).toBeNull();
    expect(t.weeklyChange).toBeNull();
  });
});
