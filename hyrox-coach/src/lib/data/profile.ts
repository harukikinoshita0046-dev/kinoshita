import { DEFAULT_TIMEZONE, isValidTimeZone, todayInTimeZone } from "@/lib/domain/dates";
import type { Db, Row } from "@/lib/supabase/types";
import { must } from "./util";

export type Profile = Row<"profiles">;

/** Returns the athlete profile, creating the default row on first use. */
export async function getProfile(db: Db, userId: string): Promise<Profile> {
  const existing = must(await db.from("profiles").select("*").eq("id", userId).maybeSingle(), "load profile");
  if (existing) return existing;
  must(
    await db.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true }),
    "create profile",
  );
  return must(await db.from("profiles").select("*").eq("id", userId).single(), "load profile");
}

export function profileTimezone(profile: Pick<Profile, "timezone"> | null | undefined): string {
  return profile?.timezone && isValidTimeZone(profile.timezone) ? profile.timezone : DEFAULT_TIMEZONE;
}

export function profileToday(profile: Pick<Profile, "timezone"> | null | undefined, now = new Date()): string {
  return todayInTimeZone(profileTimezone(profile), now);
}

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | "display_name"
    | "timezone"
    | "sex"
    | "birth_year"
    | "height_cm"
    | "max_hr"
    | "target_weight_kg"
    | "target_weight_date"
    | "hyrox_division"
    | "hyrox_goal_seconds"
    | "next_race_date"
    | "next_race_name"
  >
>;

export async function updateProfile(db: Db, userId: string, patch: ProfileUpdate): Promise<Profile> {
  await getProfile(db, userId);
  return must(await db.from("profiles").update(patch).eq("id", userId).select("*").single(), "update profile");
}
