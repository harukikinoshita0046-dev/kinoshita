import { coachRoute } from "@/lib/coach/api";

/** Token check for setup (ChatGPT Actions "Test", iOS Shortcuts). */
export const GET = coachRoute("read", async ({ profile, scopes, today }) => ({
  ok: true,
  athlete: profile.display_name,
  timezone: profile.timezone,
  today,
  scopes,
}));
