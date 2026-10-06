import { formatDuration, formatNumber } from "@/lib/domain/format";

/** Serializable value formats (Server Components cannot pass functions to client charts). */
export type ValueFormat = "int" | "dec1" | "duration";

export function formatValue(v: number, format: ValueFormat = "dec1"): string {
  switch (format) {
    case "int":
      return String(Math.round(v));
    case "duration":
      return formatDuration(v);
    default:
      return formatNumber(v, 1);
  }
}
