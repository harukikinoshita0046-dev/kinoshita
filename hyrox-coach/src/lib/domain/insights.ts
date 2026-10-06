import type { WeightTrend } from "./body";
import { formatSleep, round } from "./format";

export type Insight = {
  id: string;
  category: "body" | "training" | "running" | "hyrox" | "recovery" | "general";
  tone: "positive" | "neutral" | "warning";
  text: string;
};

export type InsightInput = {
  weight: WeightTrend | null;
  /** Weekly volume (kg) of key lifts: this 7 days vs the 7 days before. */
  liftVolumes: Array<{ name: string; thisWeek: number; lastWeek: number }>;
  runningKm: { thisWeek: number; lastWeek: number };
  weakestStation: { label: string; relativeIndex: number } | null;
  /** Consecutive days (ending today) with HRV more than 0.5 SD under baseline. */
  hrvLowStreak: number;
  acwr: number | null;
  sleepAvg7: number | null;
  daysToRace: number | null;
};

const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

/** Rule-based weekly insights (Japanese), shown in the app's AI INSIGHTS area. */
export function generateInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const w = input.weight;

  const volumeUp = input.liftVolumes
    .map((l) => ({ ...l, change: pct(l.thisWeek, l.lastWeek) }))
    .filter((l): l is typeof l & { change: number } => l.change != null)
    .sort((a, b) => b.change - a.change)[0];

  if (w?.weeklyChange != null && w.weeklyChange < -0.1 && volumeUp && volumeUp.change >= 0) {
    out.push({
      id: "weight-down-volume-up",
      category: "body",
      tone: "positive",
      text: `体重（7日平均）は${Math.abs(w.weeklyChange).toFixed(1)}kg減少していますが、${volumeUp.name}のボリュームは${round(volumeUp.change, 0)}%増加しています。`,
    });
  } else if (w?.weeklyChange != null) {
    const rate = w.weeklyRatePct;
    if (rate != null && rate < -1) {
      out.push({
        id: "weight-fast",
        category: "body",
        tone: "warning",
        text: `体重が週${Math.abs(rate).toFixed(1)}%のペースで減っています。筋量とパフォーマンス維持には週0.5〜1.0%程度が目安です。`,
      });
    } else {
      out.push({
        id: "weight-trend",
        category: "body",
        tone: w.weeklyChange <= 0 ? "positive" : "neutral",
        text: `体重（7日平均）は先週比 ${w.weeklyChange > 0 ? "+" : ""}${w.weeklyChange.toFixed(1)}kg です。`,
      });
    }
  }

  const runChange = pct(input.runningKm.thisWeek, input.runningKm.lastWeek);
  if (runChange != null && Math.abs(runChange) >= 10) {
    out.push({
      id: "running-volume",
      category: "running",
      tone: runChange > 30 ? "warning" : "neutral",
      text: `走行距離が先週比${Math.abs(round(runChange, 0))}%${runChange > 0 ? "増加" : "減少"}しています（${input.runningKm.thisWeek.toFixed(1)}km）。`,
    });
  }

  if (input.weakestStation && input.weakestStation.relativeIndex > 1.05) {
    out.push({
      id: "hyrox-weakest",
      category: "hyrox",
      tone: "neutral",
      text: `${input.weakestStation.label}がHYROX ステーションの中で相対的に弱いです。`,
    });
  }

  if (input.hrvLowStreak >= 3) {
    out.push({
      id: "hrv-low",
      category: "recovery",
      tone: "warning",
      text: `HRVが${input.hrvLowStreak}日連続で通常値を下回っています。`,
    });
  }

  if (input.acwr != null && input.acwr > 1.5) {
    out.push({
      id: "acwr-high",
      category: "training",
      tone: "warning",
      text: `直近7日のトレーニング負荷が通常の${input.acwr.toFixed(1)}倍です。強度かボリュームの調整を検討してください。`,
    });
  }

  if (input.sleepAvg7 != null && input.sleepAvg7 < 420) {
    out.push({
      id: "sleep-short",
      category: "recovery",
      tone: "warning",
      text: `直近7日の平均睡眠は${formatSleep(input.sleepAvg7)}です。`,
    });
  }

  if (input.daysToRace != null && input.daysToRace >= 0 && input.daysToRace <= 56) {
    out.push({
      id: "race-countdown",
      category: "hyrox",
      tone: "neutral",
      text: `次のHYROXまで残り${input.daysToRace}日です。`,
    });
  }

  return out.slice(0, 6);
}
