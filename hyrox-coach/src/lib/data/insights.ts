import type { Db, Row } from "@/lib/supabase/types";
import { must } from "./util";

export type CoachInsightRow = Row<"coach_insights">;
export type InsightCategory = "training" | "recovery" | "body" | "running" | "hyrox" | "general";

export async function listCoachInsights(db: Db, userId: string, opts: { limit?: number; since?: string } = {}) {
  let q = db
    .from("coach_insights")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 10);
  if (opts.since) q = q.gte("date", opts.since);
  return must(await q, "load coach insights");
}

export async function createCoachInsight(
  db: Db,
  userId: string,
  input: { date: string; body: string; title?: string | null; category?: InsightCategory; created_by?: "AI" | "USER" },
): Promise<CoachInsightRow> {
  return must(
    await db
      .from("coach_insights")
      .insert({
        user_id: userId,
        date: input.date,
        body: input.body,
        title: input.title ?? null,
        category: input.category ?? "general",
        created_by: input.created_by ?? "AI",
      })
      .select("*")
      .single(),
    "save coach insight",
  );
}

export async function deleteCoachInsight(db: Db, userId: string, id: string) {
  must(await db.from("coach_insights").delete().eq("user_id", userId).eq("id", id), "delete coach insight");
}
