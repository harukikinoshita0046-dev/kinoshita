import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CustomExerciseForm, ExerciseSettingsRow } from "@/components/profile/ExerciseSettings";
import { Card, Page, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listExercises } from "@/lib/data/exercises";

export const metadata: Metadata = { title: "種目の設定" };

const GROUPS: Array<{ title: string; categories: string[] }> = [
  { title: "HYROX ステーション", categories: ["hyrox_station"] },
  { title: "ランニング", categories: ["run"] },
  { title: "上半身", categories: ["push", "pull"] },
  { title: "下半身", categories: ["legs", "hinge"] },
  { title: "コンディショニング・体幹", categories: ["cardio", "carry", "core", "other"] },
];

export default async function ExercisesPage() {
  const { supabase, userId } = await requireUser();
  const exercises = await listExercises(supabase, userId);
  return (
    <Page>
      <div className="pt-4">
        <Link href="/profile" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> PROFILE
        </Link>
      </div>
      <PageHeader title="EXERCISES" />
      <p className="text-sm text-muted">
        「重量の刻み」は −/＋ ボタン1回で変わる重さです。「標準レスト」は各セットの後に自動で始まります（AIコーチのメニューで上書きされることがあります）。AIコーチは、種目名の下に表示される ID で種目を指定します。
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
      <SectionTitle>オリジナル種目を追加</SectionTitle>
      <Card>
        <CustomExerciseForm />
      </Card>
    </Page>
  );
}
