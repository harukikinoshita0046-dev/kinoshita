import { Bot, ChevronRight, Dumbbell, HeartPulse, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Card, Page, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data/profile";

export const metadata: Metadata = { title: "プロフィール" };

const LINKS = [
  { href: "/profile/coach", icon: Bot, title: "AIコーチ API", sub: "トークンの発行と ChatGPT の接続" },
  { href: "/profile/exercises", icon: Dumbbell, title: "種目の設定", sub: "重量の刻み・レスト時間・オリジナル種目" },
  { href: "/profile/health", icon: HeartPulse, title: "Apple ヘルスケア", sub: "連携の状況と取り込み方法" },
];

export default async function ProfilePage() {
  const { supabase, userId, email } = await requireUser();
  const profile = await getProfile(supabase, userId);
  return (
    <Page>
      <PageHeader eyebrow={email ?? undefined} title="PROFILE" />
      <ul className="space-y-1.5">
        {LINKS.map(({ href, icon: Icon, title, sub }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 active:bg-surface-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2">
                <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block font-bold">{title}</span>
                <span className="block text-xs text-muted">{sub}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-faint" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <SectionTitle>アスリート情報</SectionTitle>
      <Card>
        <ProfileForm profile={profile} />
      </Card>

      <form action="/auth/signout" method="post" className="mt-6">
        <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3 text-sm font-bold text-muted active:bg-surface-2">
          <LogOut className="h-4 w-4" aria-hidden="true" /> ログアウト
        </button>
      </form>
    </Page>
  );
}
