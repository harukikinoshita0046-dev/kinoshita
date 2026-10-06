"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { generateCoachToken } from "@/lib/coach/token-crypto";
import { createCustomExercise, saveExerciseSettings } from "@/lib/data/exercises";
import { updateProfile } from "@/lib/data/profile";
import { assertUuid, DataError, must } from "@/lib/data/util";
import { isValidTimeZone } from "@/lib/domain/dates";
import { UNIT_TYPES } from "@/lib/domain/exercise";
import { parseClock } from "@/lib/domain/format";
import { firstIssue, isoDate } from "@/lib/validation";

export type FormState = { ok?: boolean; error?: string; message?: string };

const blankToNull = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const numOrNull = (v: FormDataEntryValue | null) => {
  const s = blankToNull(v);
  return s == null ? null : Number(s);
};

const profileSchema = z.object({
  display_name: z.string().max(60).nullable(),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  sex: z.enum(["male", "female", "other"]).nullable(),
  birth_year: z.number().int().min(1900).max(2100).nullable(),
  height_cm: z.number().min(100).max(250).nullable(),
  max_hr: z.number().int().min(120).max(230).nullable(),
  target_weight_kg: z.number().min(30).max(250).nullable(),
  target_weight_date: isoDate.nullable(),
  hyrox_division: z.enum(["open_men", "open_women", "pro_men", "pro_women", "doubles_men", "doubles_women", "doubles_mixed"]),
  hyrox_goal_seconds: z.number().int().min(1800).max(14400).nullable(),
  next_race_date: isoDate.nullable(),
  next_race_name: z.string().max(120).nullable(),
});

export async function saveProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const goal = blankToNull(form.get("hyrox_goal"));
  const parsed = profileSchema.safeParse({
    display_name: blankToNull(form.get("display_name")),
    timezone: String(form.get("timezone") ?? "Asia/Tokyo"),
    sex: blankToNull(form.get("sex")),
    birth_year: numOrNull(form.get("birth_year")),
    height_cm: numOrNull(form.get("height_cm")),
    max_hr: numOrNull(form.get("max_hr")),
    target_weight_kg: numOrNull(form.get("target_weight_kg")),
    target_weight_date: blankToNull(form.get("target_weight_date")),
    hyrox_division: String(form.get("hyrox_division") ?? "open_men"),
    hyrox_goal_seconds: goal == null ? null : parseClock(goal),
    next_race_date: blankToNull(form.get("next_race_date")),
    next_race_name: blankToNull(form.get("next_race_name")),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase, userId } = await requireUser();
  await updateProfile(supabase, userId, parsed.data);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

const settingsSchema = z.object({
  exercise_id: z.string().regex(/^[a-z0-9_]{2,64}$/),
  weight_increment: z.number().positive().max(50),
  default_rest_seconds: z.number().int().min(0).max(1800),
  hidden: z.boolean(),
});

export async function saveExerciseSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = settingsSchema.safeParse({
    exercise_id: form.get("exercise_id"),
    weight_increment: Number(form.get("weight_increment")),
    default_rest_seconds: Number(form.get("default_rest_seconds")),
    hidden: form.get("hidden") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase, userId } = await requireUser();
  const { exercise_id, ...patch } = parsed.data;
  await saveExerciseSettings(supabase, userId, exercise_id, patch);
  revalidatePath("/profile/exercises");
  return { ok: true, message: "Saved" };
}

const customSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(["push", "pull", "legs", "hinge", "core", "carry", "hyrox_station", "cardio", "run", "other"]),
  unit_type: z.enum(UNIT_TYPES),
  weight_increment: z.number().positive().max(50),
  default_rest_seconds: z.number().int().min(0).max(1800),
});

export async function createExerciseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = customSchema.safeParse({
    name: form.get("name"),
    category: form.get("category"),
    unit_type: form.get("unit_type"),
    weight_increment: Number(form.get("weight_increment") ?? 2.5),
    default_rest_seconds: Number(form.get("default_rest_seconds") ?? 90),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase, userId } = await requireUser();
  try {
    const id = await createCustomExercise(supabase, userId, parsed.data);
    revalidatePath("/profile/exercises");
    return { ok: true, message: `Added ${parsed.data.name} (id: ${id})` };
  } catch (e) {
    if (e instanceof DataError && e.status === 409) return { error: e.message };
    throw e;
  }
}

export type TokenState = FormState & { token?: string };

const tokenSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(["read", "write"])).min(1),
  expires_in_days: z.number().int().min(0).max(3650),
});

/** Creates a coach API token. The raw token is returned once and never stored. */
export async function createTokenAction(_prev: TokenState, form: FormData): Promise<TokenState> {
  const parsed = tokenSchema.safeParse({
    name: form.get("name"),
    scopes: form.getAll("scopes").map(String),
    expires_in_days: Number(form.get("expires_in_days") ?? 0),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { supabase, userId } = await requireUser();
  const { token, hash, displayPrefix } = generateCoachToken();
  const expires = parsed.data.expires_in_days > 0 ? new Date(Date.now() + parsed.data.expires_in_days * 86400000).toISOString() : null;
  must(
    await supabase.from("coach_api_tokens").insert({
      user_id: userId,
      name: parsed.data.name,
      token_hash: hash,
      token_prefix: displayPrefix,
      scopes: parsed.data.scopes,
      expires_at: expires,
    }),
    "create token",
  );
  revalidatePath("/profile/coach");
  return { ok: true, token };
}

export async function revokeTokenAction(tokenId: string) {
  assertUuid(tokenId, "token id");
  const { supabase, userId } = await requireUser();
  must(
    await supabase.from("coach_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("id", tokenId),
    "revoke token",
  );
  revalidatePath("/profile/coach");
}
