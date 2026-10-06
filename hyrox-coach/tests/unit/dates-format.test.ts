import { describe, expect, it } from "vitest";
import { addDays, diffDays, formatDayLabel, isIsoDate, startOfWeek, todayInTimeZone } from "@/lib/domain/dates";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSigned,
  formatSignedDuration,
  formatSleep,
  parseClock,
} from "@/lib/domain/format";
import { normalizeWorkoutType } from "@/lib/domain/workout-types";
import { normalizeRunType } from "@/lib/domain/running";

describe("dates", () => {
  it("uses the athlete's timezone, not the server's", () => {
    const instant = new Date("2026-10-05T16:30:00Z");
    expect(todayInTimeZone("Asia/Tokyo", instant)).toBe("2026-10-06");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-10-05");
    expect(todayInTimeZone("Not/AZone", instant)).toBe("2026-10-06");
  });

  it("does calendar arithmetic", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-06", "2026-09-29")).toBe(7);
    expect(startOfWeek("2026-10-06")).toBe("2026-10-05"); // Tuesday -> Monday
    expect(startOfWeek("2026-10-11")).toBe("2026-10-05"); // Sunday -> Monday
    expect(formatDayLabel("2026-10-06")).toBe("TUE 6 OCT");
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-06")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("06/10/2026")).toBe(false);
  });
});

describe("format", () => {
  it("formats durations and paces", () => {
    expect(formatDuration(3804)).toBe("1:03:24");
    expect(formatDuration(2712)).toBe("45:12");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatPace(265)).toBe("4:25");
    expect(formatSignedDuration(-108)).toBe("-1:48");
    expect(formatSleep(462)).toBe("7h 42m");
  });

  it("parses clock strings", () => {
    expect(parseClock("4:25")).toBe(265);
    expect(parseClock("1:03:24")).toBe(3804);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("4:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });

  it("formats signed numbers and distances", () => {
    expect(formatSigned(-0.5)).toBe("-0.5");
    expect(formatSigned(0.04)).toBe("±0");
    expect(formatSigned(1.234, 2)).toBe("+1.23");
    expect(formatDistance(800)).toBe("800 m");
    expect(formatDistance(5200)).toBe("5.2 km");
  });
});

describe("normalisation", () => {
  it("maps free-text workout types", () => {
    expect(normalizeWorkoutType("Upper")).toBe("upper");
    expect(normalizeWorkoutType("Legs")).toBe("lower");
    expect(normalizeWorkoutType("HYROX Simulation")).toBe("simulation");
    expect(normalizeWorkoutType("HYROX stations")).toBe("hyrox");
    expect(normalizeWorkoutType("Intervals")).toBe("run");
    expect(normalizeWorkoutType("something else")).toBe("other");
  });

  it("maps run types", () => {
    expect(normalizeRunType("Zone 2")).toBe("zone2");
    expect(normalizeRunType("HYROX Run")).toBe("hyrox_run");
    expect(normalizeRunType("Long Run")).toBe("long_run");
    expect(normalizeRunType("sprint")).toBeNull();
  });
});
