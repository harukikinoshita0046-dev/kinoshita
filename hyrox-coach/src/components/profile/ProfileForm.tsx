"use client";

import { useActionState } from "react";
import { saveProfile, type FormState } from "@/app/(app)/profile/actions";
import { buttonClass, ErrorText, Field, inputClass } from "@/components/ui";
import { formatDuration } from "@/lib/domain/format";
import { HYROX_DIVISION_LABELS } from "@/lib/domain/hyrox";
import type { Profile } from "@/lib/data/profile";

const TIMEZONES = ["Asia/Tokyo", "Asia/Seoul", "Asia/Singapore", "Australia/Sydney", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC"];

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfile, {});
  const tzOptions = TIMEZONES.includes(profile.timezone) ? TIMEZONES : [profile.timezone, ...TIMEZONES];
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input name="display_name" className={inputClass} defaultValue={profile.display_name ?? ""} maxLength={60} />
        </Field>
        <Field label="Timezone">
          <select name="timezone" className={inputClass} defaultValue={profile.timezone}>
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sex">
          <select name="sex" className={inputClass} defaultValue={profile.sex ?? ""}>
            <option value="">–</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Birth year">
          <input name="birth_year" className={inputClass} inputMode="numeric" defaultValue={profile.birth_year ?? ""} />
        </Field>
        <Field label="Height (cm)">
          <input name="height_cm" className={inputClass} inputMode="decimal" defaultValue={profile.height_cm ?? ""} />
        </Field>
        <Field label="Max HR (bpm)">
          <input name="max_hr" className={inputClass} inputMode="numeric" defaultValue={profile.max_hr ?? ""} />
        </Field>
      </div>

      <p className="label pt-2">Goals</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target weight (kg)">
          <input name="target_weight_kg" className={inputClass} inputMode="decimal" defaultValue={profile.target_weight_kg ?? ""} />
        </Field>
        <Field label="By (date)">
          <input name="target_weight_date" type="date" className={inputClass} defaultValue={profile.target_weight_date ?? ""} />
        </Field>
        <Field label="HYROX division">
          <select name="hyrox_division" className={inputClass} defaultValue={profile.hyrox_division}>
            {Object.entries(HYROX_DIVISION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="HYROX goal time" hint="h:mm:ss, e.g. 59:59">
          <input name="hyrox_goal" className={inputClass} inputMode="numeric" placeholder="59:59" defaultValue={profile.hyrox_goal_seconds ? formatDuration(profile.hyrox_goal_seconds) : ""} />
        </Field>
        <Field label="Next race">
          <input name="next_race_name" className={inputClass} placeholder="HYROX Tokyo" defaultValue={profile.next_race_name ?? ""} />
        </Field>
        <Field label="Race date">
          <input name="next_race_date" type="date" className={inputClass} defaultValue={profile.next_race_date ?? ""} />
        </Field>
      </div>
      <ErrorText>{state.error}</ErrorText>
      {state.message ? <p className="text-sm font-semibold text-push">{state.message}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")}>
        {pending ? "SAVING…" : "SAVE PROFILE"}
      </button>
    </form>
  );
}
