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

type AnyResult = { data: unknown; error: PostgrestError | null };
type Success<R> = Extract<R, { error: null }>;
/** The data type of a successful Supabase response (keeps `| null` for maybeSingle()). */
export type DataOf<R extends AnyResult> = [Success<R>] extends [never] ? NonNullable<R["data"]> : Success<R>["data"];

/** Unwraps a Supabase response or throws a DataError with context. */
export function must<R extends AnyResult>(res: R, context: string): DataOf<R> {
  if (res.error) {
    throw new DataError(`${context}: ${res.error.message}`, 500, res.error);
  }
  return res.data as DataOf<R>;
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
export async function fetchAll<R extends AnyResult>(
  page: (from: number, to: number) => PromiseLike<R>,
  context: string,
  pageSize = 1000,
): Promise<DataOf<R>> {
  const out: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = (must(await page(from, from + pageSize - 1), context) ?? []) as unknown[];
    out.push(...rows);
    if (rows.length < pageSize) return out as DataOf<R>;
  }
}

export const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number(v);
