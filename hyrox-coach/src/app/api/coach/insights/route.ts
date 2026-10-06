import { z } from "zod";
import { coachRoute } from "@/lib/coach/api";
import { intParam } from "@/lib/coach/dto";
import { createCoachInsight, listCoachInsights } from "@/lib/data/insights";
import { isoDate } from "@/lib/validation";

export const GET = coachRoute("read", async ({ db, userId, req }) => {
  const limit = intParam(req.nextUrl.searchParams, "limit", 10, 1, 50);
  const insights = await listCoachInsights(db, userId, { limit });
  return { insights: insights.map((i) => ({ id: i.id, date: i.date, category: i.category, title: i.title, body: i.body, created_by: i.created_by })) };
});

const body = z.object({
  body: z.string().trim().min(1).max(2000),
  title: z.string().trim().max(120).nullish(),
  category: z.enum(["training", "recovery", "body", "running", "hyrox", "general"]).optional(),
  date: isoDate.optional(),
});

/** Posts a coach note; the app shows it in the AI INSIGHTS area. */
export const POST = coachRoute("write", async ({ db, userId, today, body: raw }) => {
  const input = body.parse(raw);
  const insight = await createCoachInsight(db, userId, { ...input, date: input.date ?? today, created_by: "AI" });
  return Response.json({ created: true, id: insight.id }, { status: 201 });
});
