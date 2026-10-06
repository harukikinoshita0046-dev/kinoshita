import { Bot, Sparkles } from "lucide-react";
import type { CoachInsightRow } from "@/lib/data/insights";
import { formatShortDate } from "@/lib/domain/dates";
import type { Insight } from "@/lib/domain/insights";
import { cn } from "./ui";

const TONE: Record<Insight["tone"], string> = {
  positive: "bg-push",
  neutral: "bg-run",
  warning: "bg-low",
};

/** Coach notes posted by the AI (via the API) first, then rule-based insights. */
export function InsightsList({ coach, rules }: { coach: CoachInsightRow[]; rules: Insight[] }) {
  if (coach.length === 0 && rules.length === 0) {
    return <p className="text-sm text-muted">数日分のデータがたまるとインサイトが表示されます。</p>;
  }
  return (
    <ul className="space-y-2" data-testid="insights">
      {coach.map((c) => (
        <li key={c.id} className="rounded-2xl bg-surface p-4">
          <p className="label flex items-center gap-1.5 text-accent">
            <Bot className="h-3.5 w-3.5" aria-hidden="true" /> AIコーチ · {formatShortDate(c.date)}
          </p>
          {c.title ? <p className="mt-1 font-bold">{c.title}</p> : null}
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{c.body}</p>
        </li>
      ))}
      {rules.map((r) => (
        <li key={r.id} className="flex gap-3 rounded-2xl bg-surface p-4">
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE[r.tone])} />
          <p className="text-sm leading-relaxed">{r.text}</p>
        </li>
      ))}
      {coach.length === 0 ? (
        <li className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> ルールベースのインサイトです。AIコーチがAPI経由でここにメモを投稿できます。
        </li>
      ) : null}
    </ul>
  );
}
