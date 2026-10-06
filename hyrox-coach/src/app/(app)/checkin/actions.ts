"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { upsertBodyMetric, upsertCheckin, upsertHealthMetric } from "@/lib/data/metrics";
import { firstIssue, isoDate } from "@/lib/validation";

const input = z.object({
  date: isoDate,
  weight: z.number().min(20).max(300).nullable(),
  sleep_minutes: z.number().int().min(0).max(1440).nullable(),
  hrv: z.number().min(1).max(300).nullable(),
  resting_hr: z.number().int().min(25).max(150).nullable(),
  soreness: z.number().int().min(1).max(5).nullable(),
  fatigue: z.number().int().min(1).max(5).nullable(),
  motivation: z.number().int().min(1).max(5).nullable(),
  note: z.string().max(500).nullable(),
});

export async function saveCheckin(raw: unknown): Promise<{ error?: string }> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;
  const { supabase, userId } = await requireUser();

  const writes: Promise<unknown>[] = [];
  if (v.weight != null) writes.push(upsertBodyMetric(supabase, userId, { date: v.date, weight: v.weight, source: "manual" }));
  if (v.sleep_minutes != null || v.hrv != null || v.resting_hr != null) {
    writes.push(
      upsertHealthMetric(supabase, userId, {
        date: v.date,
        ...(v.sleep_minutes != null ? { sleep_minutes: v.sleep_minutes } : {}),
        ...(v.hrv != null ? { hrv: v.hrv } : {}),
        ...(v.resting_hr != null ? { resting_hr: v.resting_hr } : {}),
        source: "manual",
      }),
    );
  }
  if (v.soreness != null || v.fatigue != null || v.motivation != null || v.note) {
    writes.push(
      upsertCheckin(supabase, userId, {
        date: v.date,
        soreness: v.soreness,
        fatigue: v.fatigue,
        motivation: v.motivation,
        note: v.note,
      }),
    );
  }
  await Promise.all(writes);
  revalidatePath("/today");
  revalidatePath("/body");
  redirect("/today");
}
