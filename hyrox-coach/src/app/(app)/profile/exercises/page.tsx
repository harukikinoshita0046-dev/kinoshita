import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CustomExerciseForm, ExerciseSettingsRow } from "@/components/profile/ExerciseSettings";
import { Card, Page, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listExercises } from "@/lib/data/exercises";

export const metadata: Metadata = { title: "Exercise Master" };

const GROUPS: Array<{ title: string; categories: string[] }> = [
  { title: "HYROX stations", categories: ["hyrox_station"] },
  { title: "Running", categories: ["run"] },
  { title: "Upper body", categories: ["push", "pull"] },
  { title: "Lower body", categories: ["legs", "hinge"] },
  { title: "Conditioning & core", categories: ["cardio", "carry", "core", "other"] },
];

export default async function ExercisesPage() {
  const { supabase, userId } = await requireUser();
  const exercises = await listExercises(supabase, userId);
  return (
    <Page>
      <div className="pt-4">
        <Link href="/profile" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" /> Profile
        </Link>
      </div>
      <PageHeader title="EXERCISES" />
      <p className="text-sm text-muted">
        Weight step = how much the +/− buttons change the load. Default rest starts automatically after each set (a coach plan can override it). The AI coach refers to exercises by the id shown under each name.
      </p>
      {GROUPS.map((g) => {
        const list = exercises.filter((e) => g.categories.includes(e.category));
        if (list.length === 0) return null;
        return (
          <section key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            <div className="space-y-1.5">
              {list.map((e) => (
                <ExerciseSettingsRow
                  key={e.id}
                  exercise={{
                    id: e.id,
                    name: e.name,
                    unit_type: e.unit_type,
                    weight_increment: Number(e.weight_increment),
                    default_rest_seconds: e.default_rest_seconds,
                    hidden: e.hidden,
                    is_custom: e.is_custom,
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}
      <SectionTitle>Add custom exercise</SectionTitle>
      <Card>
        <CustomExerciseForm />
      </Card>
    </Page>
  );
}
