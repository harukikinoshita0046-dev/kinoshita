/** "1:03:24" for >= 1h, otherwise "45:12". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "–";
  const sign = totalSeconds < 0 ? "-" : "";
  const s = Math.round(Math.abs(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${sign}${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** "1h 05m" / "48m" */
export function formatMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return "–";
  const m = Math.round(totalMinutes);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** Pace in seconds per km -> "4:25". */
export function formatPace(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "–";
  return formatDuration(secondsPerKm);
}

/** Parses "4:25", "1:03:24" or plain seconds into seconds. Returns null if invalid. */
export function parseClock(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  const trimmed = input.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed));
  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

/** 82.5 -> "82.5", 80 -> "80", 82.25 -> "82.25" */
export function formatNumber(value: number | null | undefined, maxDecimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "–";
  return String(Number(value.toFixed(maxDecimals)));
}

export function formatKg(value: number | null | undefined): string {
  return value == null ? "–" : `${formatNumber(value)} kg`;
}

/** "+0.4", "-0.5", "±0" */
export function formatSigned(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(decimals)}`;
}

/** Signed duration "-1:48" / "+0:35" */
export function formatSignedDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  if (Math.round(seconds) === 0) return "±0:00";
  return `${seconds > 0 ? "+" : "-"}${formatDuration(Math.abs(seconds))}`;
}

/** 462 -> "7h 42m" */
export function formatSleep(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "–";
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Meters -> "800 m" / "5.2 km" */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "–";
  if (meters >= 2000 && meters % 1000 !== 0) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 2000) return `${meters / 1000} km`;
  return `${formatNumber(meters, 1)} m`;
}

export function formatPercent(value: number | null | undefined, decimals = 0, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const text = value.toFixed(decimals);
  return `${signed && value > 0 ? "+" : ""}${text}%`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function standardDeviation(values: number[]): number | null {
  const m = mean(values);
  if (m == null || values.length < 2) return null;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}
