import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResultForm } from "@/components/hyrox/ResultForm";
import { Page, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile, profileToday } from "@/lib/data/profile";

export const metadata: Metadata = { title: "HYROX の結果を記録" };

export default async function NewHyroxResultPage() {
  const { supabase, userId } = await requireUser();
  const profile = await getProfile(supabase, userId);
  return (
    <Page>
      <div className="pt-4">
        <Link href="/hyrox" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> HYROX
        </Link>
      </div>
      <PageHeader title="LOG RESULT" />
      <ResultForm today={profileToday(profile)} division={profile.hyrox_division} />
      <p className="mt-4 text-center text-xs text-faint">
        その場で計測するなら <Link className="underline" href="/hyrox/simulation">シミュレーションモード</Link> を使ってください。
      </p>
    </Page>
  );
}
