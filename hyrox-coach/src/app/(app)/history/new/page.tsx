import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PastWorkoutForm } from "@/components/PastWorkoutForm";
import { Page, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile, profileToday } from "@/lib/data/profile";
import { addDays } from "@/lib/domain/dates";

export const metadata: Metadata = { title: "過去のトレーニングを記録" };

export default async function PastWorkoutPage() {
  const { supabase, userId } = await requireUser();
  const today = profileToday(await getProfile(supabase, userId));
  return (
    <Page>
      <div className="pt-4">
        <Link href="/history" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> HISTORY
        </Link>
      </div>
      <PageHeader eyebrow="過去のトレーニング" title="LOG PAST" />
      <p className="mb-4 text-sm leading-relaxed text-muted">
        日付を選ぶと、いつもの記録画面が開きます。入力したセットはその日のトレーニングとして保存され、履歴・PB・負荷の計算に反映されます。
      </p>
      <PastWorkoutForm today={today} defaultDate={addDays(today, -1)} />
      <p className="mt-6 text-center text-xs leading-relaxed text-faint">
        ランは <Link className="underline" href="/run/new">ランの記録</Link>、HYROX は <Link className="underline" href="/hyrox/new">結果を記録</Link> から日付を指定できます。
        <br />
        まとめて移すなら、AIコーチに「10/3 ベンチ 80kg×8,8,7」のように送るだけでも保存できます。
      </p>
    </Page>
  );
}
