import type { PostgrestError } from "@supabase/supabase-js";

export class DataError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "DataError";
  }
}

type Result<T> = { data: T | null; error: PostgrestError | null };

/** Unwraps a Supabase response or throws a DataError with context. */
export function must<T>(res: Result<T>, context: string): T {
  if (res.error) {
    throw new DataError(`${context}: ${res.error.message}`, 500, res.error);
  }
  return res.data as T;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
export function assertUuid(value: unknown, what = "id"): asserts value is string {
  if (!isUuid(value)) throw new DataError(`Invalid ${what}`, 400);
}

/**
 * PostgREST caps responses (1000 rows on Supabase by default). Page through
 * a query when the result may be larger.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<Result<T[]>>,
  context: string,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = must(await page(from, from + pageSize - 1), context) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

export const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number(v);
