import { coachRoute } from "@/lib/coach/api";
import { appUrl, dateRange, planDto } from "@/lib/coach/dto";
import { createPlanBody, toPlanInput } from "@/lib/coach/schemas";
import { indexExercises, listExercises } from "@/lib/data/exercises";
import { createPlan, getPlan, listPlans } from "@/lib/data/plans";

/** Planned / completed workout plans in a date range (default: last 7 to next 14 days). */
export const GET = coachRoute("read", async ({ db, userId, today, req }) => {
  const { from, to } = dateRange(req.nextUrl.searchParams, today, { back: 7, forward: 14 }, 120);
  const [plans, exercises] = await Promise.all([listPlans(db, userId, { from, to }), listExercises(db, userId, { includeInactive: true })]);
  const byId = indexExercises(exercises);
  return { from, to, plans: plans.map((p) => planDto(p, byId)) };
});

/**
 * Creates a workout plan (created_by = AI). It shows up on the app's TODAY
 * screen immediately when `date` is today. Exercises accept ids or names;
 * unknown ones return 422 with the list of valid ids.
 */
export const POST = coachRoute("write", async ({ db, userId, today, body, req }) => {
  const parsed = createPlanBody.parse(body);
  const exercises = await listExercises(db, userId, { includeInactive: true });
  const input = toPlanInput(parsed, exercises, today);
  const { planId, created } = await createPlan(db, userId, input, { replaceExisting: parsed.replace_existing ?? false });
  const plan = await getPlan(db, userId, planId);
  return Response.json(
    {
      created,
      plan: plan ? planDto(plan, indexExercises(exercises)) : { id: planId },
      shows_on_today: input.date === today,
      app_url: `${appUrl(req)}/today`,
    },
    { status: created ? 201 : 200 },
  );
});
