/** Local calendar date, 'YYYY-MM-DD'. */
export type IsoDate = string;

export const DEFAULT_TIMEZONE = "Asia/Tokyo";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date of `instant` in `timeZone` (servers run in UTC; athletes do not). */
export function dateInTimeZone(instant: Date | string, timeZone: string): IsoDate {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  return dateInTimeZone(now, timeZone);
}

function toUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(to: IsoDate, from: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const day = toUtc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "10月6日（火）" */
export function formatDayLabel(date: IsoDate): string {
  const d = toUtc(date);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAYS[d.getUTCDay()]}）`;
}

/** "10/6" (prefixes the year, "2025/10/6", when it differs from `referenceYear`). */
export function formatShortDate(date: IsoDate, referenceYear?: number): string {
  const d = toUtc(date);
  const base = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return referenceYear && referenceYear !== d.getUTCFullYear() ? `${d.getUTCFullYear()}/${base}` : base;
}

export function relativeDayLabel(date: IsoDate, today: IsoDate): string {
  const diff = diffDays(today, date);
  if (diff === 0) return "今日";
  if (diff === 1) return "昨日";
  if (diff > 1 && diff < 7) return `${diff}日前`;
  return formatShortDate(date, Number(today.slice(0, 4)));
}

/** Local clock time "07:42" of an instant in a timezone. */
export function formatClockTime(instant: string | Date, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
