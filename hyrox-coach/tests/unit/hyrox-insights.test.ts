import { describe, expect, it } from "vitest";
import {
  HYROX_SEGMENTS,
  compareToBest,
  computeTotals,
  requiredRunPace,
  stationSummaries,
  weakestStations,
  type ResultWithSplits,
} from "@/lib/domain/hyrox";
import { generateInsights } from "@/lib/domain/insights";

const stationTimes: Record<string, number> = {
  ski_erg: 240,
  sled_push: 165,
  sled_pull: 260,
  burpee_broad_jump: 205,
  row_erg: 250,
  farmers_carry: 90,
  sandbag_lunges: 200,
  wall_ball: 270,
};

function result(id: string, date: string, runSeconds: number, factor = 1): ResultWithSplits {
  const splits = HYROX_SEGMENTS.map((seg) => ({
    segment_index: seg.index,
    segment_type: seg.type,
    exercise_id: seg.exerciseId,
    duration_seconds: seg.type === "run" ? runSeconds : Math.round(stationTimes[seg.exerciseId] * factor),
    roxzone_seconds: 30,
  }));
  const t = computeTotals(splits);
  return {
    id,
    date,
    event_type: "simulation",
    total_seconds: t.total,
    run_total_seconds: t.runTotal,
    station_total_seconds: t.stationTotal,
    roxzone_seconds: t.roxzone,
    splits,
  };
}

describe("hyrox", () => {
  it("has 16 segments in race order", () => {
    expect(HYROX_SEGMENTS).toHaveLength(16);
    expect(HYROX_SEGMENTS[0].label).toBe("Run 1");
    expect(HYROX_SEGMENTS[1].exerciseId).toBe("ski_erg");
    expect(HYROX_SEGMENTS[15].exerciseId).toBe("wall_ball");
  });

  it("computes totals", () => {
    const r = result("a", "2026-09-01", 270);
    expect(r.run_total_seconds).toBe(2160);
    expect(r.station_total_seconds).toBe(1680);
    expect(r.roxzone_seconds).toBe(480);
    expect(r.total_seconds).toBe(4320);
    expect(computeTotals(r.splits).complete).toBe(true);
    expect(computeTotals(r.splits.slice(0, 5)).complete).toBe(false);
  });

  it("compares against the PB", () => {
    expect(compareToBest(3804, 3912)).toEqual({ diff: -108, isPb: true });
    expect(compareToBest(3950, 3912).isPb).toBe(false);
    expect(compareToBest(3950, null).isPb).toBe(true);
  });

  it("finds PB, latest and the relatively weakest station", () => {
    const results = [result("a", "2026-08-01", 280, 1.05), result("b", "2026-09-01", 270, 1)];
    const summaries = stationSummaries(results);
    const pull = summaries.find((s) => s.exerciseId === "sled_pull")!;
    expect(pull.pb?.seconds).toBe(260);
    expect(pull.latest?.date).toBe("2026-09-01");
    expect(pull.trend).toEqual([273, 260]);
    expect(weakestStations(summaries, 1)[0].exerciseId).toBe("sled_pull");
  });

  it("computes the run pace needed for a goal", () => {
    expect(requiredRunPace(3600, { station_total_seconds: 1560, roxzone_seconds: 240 })).toBe(225);
    expect(requiredRunPace(1000, { station_total_seconds: 1560, roxzone_seconds: 240 })).toBeNull();
  });
});

describe("insights", () => {
  it("produces the spec's example insights", () => {
    const insights = generateInsights({
      weight: {
        latest: { date: "2026-10-06", weight: 78.4 },
        avg7: 78.8,
        weeklyChange: -0.4,
        monthlyChange: -1.6,
        weeklyRatePct: -0.5,
        trend: "losing",
        toTarget: 3.8,
        projectedTargetDate: null,
      },
      liftVolumes: [{ name: "Bench Press", thisWeek: 5150, lastWeek: 5000 }],
      runningKm: { thisWeek: 24.4, lastWeek: 20 },
      weakestStation: { label: "Sled Pull", relativeIndex: 1.2 },
      hrvLowStreak: 3,
      acwr: 1.1,
      sleepAvg7: 450,
      daysToRace: 40,
    });
    const texts = insights.map((i) => i.text);
    expect(texts).toContain("体重（7日平均）は0.4kg減少していますが、Bench Pressのボリュームは3%増加しています。");
    expect(texts.some((t) => t.startsWith("走行距離が先週比22%増加"))).toBe(true);
    expect(texts).toContain("Sled PullがHYROX ステーションの中で相対的に弱いです。");
    expect(texts).toContain("HRVが3日連続で通常値を下回っています。");
  });
});
