import { coachRoute } from "@/lib/coach/api";
import { buildCoachContext } from "@/lib/coach/context";

/** Everything the coach needs before deciding today's session, summarised. */
export const GET = coachRoute("read", async ({ db, userId }) => buildCoachContext(db, userId));
