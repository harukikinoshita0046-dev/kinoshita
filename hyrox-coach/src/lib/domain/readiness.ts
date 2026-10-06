import { clamp, mean, round, standardDeviation } from "./format";

/**
 * Readiness is a training-decision aid built from personal baselines. It is not
 * a medical assessment and must not be presented as one.
 *
 * Components (weights are renormalised over the components that have data):
 *   sleep 25% · HRV vs 28-day baseline 25% · resting HR vs baseline 15%
 *   yesterday's training load 15% · subjective check-in 20%
 */
export type Baseline = { mean: number; sd: number; n: number };

export type ReadinessInput = {
  sleepMinutes: number | null;
  hrv: number | null;
  hrvBaseline: Baseline | null;
  restingHr: number | null;
  restingHrBaseline: Baseline | null;
  /** sRPE load of the previous day (0 = rest day). null = no training history at all. */
  loadYesterday: number | null;
  typicalSessionDayLoad: number | null;
  acwr: number | null;
  soreness: number | null;
  fatigue: number | null;
  motivation: number | null;
};

export type ReadinessComponentKey = "sleep" | "hrv" | "resting_hr" | "load" | "subjective";

export type ReadinessComponent = {
  key: ReadinessComponentKey;
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type ReadinessLevel = "push" | "good" | "moderate" | "low" | "recover";

export type ReadinessResult = {
  score: number | null;
  level: ReadinessLevel | null;
  label: string;
  components: ReadinessComponent[];
  missing: ReadinessComponentKey[];
};

const WEIGHTS: Record<ReadinessComponentKey, number> = {
  sleep: 0.25,
  hrv: 0.25,
  resting_hr: 0.15,
  load: 0.15,
  subjective: 0.2,
};

export const READINESS_COMPONENT_LABELS: Record<ReadinessComponentKey, string> = {
  sleep: "睡眠",
  hrv: "HRV",
  resting_hr: "安静時心拍",
  load: "トレーニング負荷",
  subjective: "体感",
};

export const READINESS_LABELS: Record<ReadinessLevel, string> = {
  push: "READY TO PUSH",
  good: "GOOD",
  moderate: "MODERATE",
  low: "LOW",
  recover: "RECOVER",
};

export const SLEEP_TARGET_MINUTES = 480;
export const MIN_BASELINE_DAYS = 5;

export function baselineOf(values: Array<number | null | undefined>): Baseline | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < MIN_BASELINE_DAYS) return null;
  return { mean: mean(v)!, sd: standardDeviation(v) ?? 0, n: v.length };
}

export function readinessLevel(score: number): ReadinessLevel {
  if (score >= 85) return "push";
  if (score >= 70) return "good";
  if (score >= 55) return "moderate";
  if (score >= 40) return "low";
  return "recover";
}

const SORENESS_FATIGUE_SCORE = [100, 85, 65, 40, 15]; // 1 (none/fresh) .. 5 (very sore/exhausted)
const MOTIVATION_SCORE = [20, 40, 65, 85, 100]; // 1 (low) .. 5 (high)

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const components: ReadinessComponent[] = [];
  const missing: ReadinessComponentKey[] = [];

  if (input.sleepMinutes != null) {
    const deficitHours = Math.max(0, SLEEP_TARGET_MINUTES - input.sleepMinutes) / 60;
    const score = clamp(100 - deficitHours * 15, 0, 100);
    components.push({
      key: "sleep",
      label: READINESS_COMPONENT_LABELS.sleep,
      score,
      weight: WEIGHTS.sleep,
      detail: `${Math.floor(input.sleepMinutes / 60)}時間${input.sleepMinutes % 60}分（目標 ${SLEEP_TARGET_MINUTES / 60}時間）`,
    });
  } else missing.push("sleep");

  if (input.hrv != null && input.hrvBaseline) {
    const sd = Math.max(input.hrvBaseline.sd, input.hrvBaseline.mean * 0.05, 1);
    const z = (input.hrv - input.hrvBaseline.mean) / sd;
    components.push({
      key: "hrv",
      label: READINESS_COMPONENT_LABELS.hrv,
      score: clamp(75 + 17.5 * z, 0, 100),
      weight: WEIGHTS.hrv,
      detail: `${round(input.hrv, 0)} ms（平常値 ${round(input.hrvBaseline.mean, 0)} ms、${z >= 0 ? "+" : ""}${round(z, 1)} SD）`,
    });
  } else missing.push("hrv");

  if (input.restingHr != null && input.restingHrBaseline) {
    const sd = Math.max(input.restingHrBaseline.sd, 1.5);
    const z = (input.restingHr - input.restingHrBaseline.mean) / sd;
    components.push({
      key: "resting_hr",
      label: READINESS_COMPONENT_LABELS.resting_hr,
      score: clamp(75 - 17.5 * z, 0, 100),
      weight: WEIGHTS.resting_hr,
      detail: `${input.restingHr} bpm（平常値 ${round(input.restingHrBaseline.mean, 0)} bpm）`,
    });
  } else missing.push("resting_hr");

  if (input.loadYesterday != null && input.typicalSessionDayLoad) {
    const ratio = input.loadYesterday / input.typicalSessionDayLoad;
    const spike = input.acwr != null ? Math.max(0, input.acwr - 1.3) : 0;
    const score = clamp(90 - 25 * Math.max(0, ratio - 1) - 50 * spike, 0, 100);
    components.push({
      key: "load",
      label: READINESS_COMPONENT_LABELS.load,
      score,
      weight: WEIGHTS.load,
      detail:
        input.loadYesterday === 0
          ? "昨日は休養日"
          : `昨日 ${round(input.loadYesterday, 0)} AU（普段の練習日の ${round(ratio, 1)} 倍）` +
            (input.acwr != null ? `、ACWR ${input.acwr}` : ""),
    });
  } else missing.push("load");

  const subjective: number[] = [];
  if (input.soreness != null) subjective.push(SORENESS_FATIGUE_SCORE[clamp(input.soreness, 1, 5) - 1]);
  if (input.fatigue != null) subjective.push(SORENESS_FATIGUE_SCORE[clamp(input.fatigue, 1, 5) - 1]);
  if (input.motivation != null) subjective.push(MOTIVATION_SCORE[clamp(input.motivation, 1, 5) - 1]);
  if (subjective.length) {
    components.push({
      key: "subjective",
      label: READINESS_COMPONENT_LABELS.subjective,
      score: mean(subjective)!,
      weight: WEIGHTS.subjective,
      detail: [
        input.soreness != null ? `筋肉痛 ${input.soreness}/5` : null,
        input.fatigue != null ? `疲労 ${input.fatigue}/5` : null,
        input.motivation != null ? `やる気 ${input.motivation}/5` : null,
      ]
        .filter(Boolean)
        .join("、"),
    });
  } else missing.push("subjective");

  if (components.length < 2) {
    return { score: null, level: null, label: "CHECK IN", components, missing };
  }
  const totalWeight = components.reduce((acc, c) => acc + c.weight, 0);
  const score = Math.round(components.reduce((acc, c) => acc + c.score * c.weight, 0) / totalWeight);
  const level = readinessLevel(score);
  return {
    score,
    level,
    label: READINESS_LABELS[level],
    components: components.map((c) => ({ ...c, score: Math.round(c.score), weight: round(c.weight / totalWeight, 2) })),
    missing,
  };
}
