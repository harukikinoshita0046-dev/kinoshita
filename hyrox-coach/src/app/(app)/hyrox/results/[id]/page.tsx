import { ArrowLeft, Check, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Card, Page, SectionTitle, Stat, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getHyroxResult, listHyroxResults } from "@/lib/data/hyrox";
import { isUuid } from "@/lib/data/util";
import { formatDayLabel } from "@/lib/domain/dates";
import { formatDuration, formatSignedDuration } from "@/lib/domain/format";
import { HYROX_DIVISION_LABELS, HYROX_SEGMENTS } from "@/lib/domain/hyrox";
import { deleteHyroxResultAction } from "../../actions";

export const metadata: Metadata = { title: "HYROX result" };

export default async function HyroxResultPage({ params, searchParams }: PageProps<"/hyrox/results/[id]">) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!isUuid(id)) notFound();
  const { supabase, userId } = await requireUser();
  const result = await getHyroxResult(supabase, userId, id).catch(() => null);
  if (!result) notFound();

  // Best before this result (same or earlier date, excluding itself).
  const others = (await listHyroxResults(supabase, userId, { limit: 100 })).filter(
    (r) => r.id !== result.id && r.event_type !== "partial" && r.date <= result.date && r.total_seconds,
  );
  const prevBest = others.sort((a, b) => a.total_seconds! - b.total_seconds!)[0] ?? null;
  const diff = prevBest && result.total_seconds ? result.total_seconds - prevBest.total_seconds! : null;
  const isPb = result.event_type !== "partial" && (prevBest == null || (diff != null && diff < 0));

  // Best split per segment across other results, for comparison.
  const bestSplit = new Map<number, number>();
  for (const r of others) {
    for (const s of r.splits) {
      const cur = bestSplit.get(s.segment_index);
      if (cur == null || s.duration_seconds < cur) bestSplit.set(s.segment_index, s.duration_seconds);
    }
  }

  return (
    <Page>
      <div className="pt-4">
        <Link href="/hyrox" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" /> HYROX
        </Link>
      </div>
      {isNew ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-push/10 px-4 py-3 font-bold text-push" data-testid="saved-banner">
          <Check className="h-5 w-5" /> RESULT SAVED
        </div>
      ) : null}
      <header className="pb-3 pt-4">
        <p className="label">
          {formatDayLabel(result.date)} · {result.event_type === "race" ? "Race" : result.event_type === "simulation" ? "Simulation" : "Partial"}
          {result.division ? ` · ${HYROX_DIVISION_LABELS[result.division] ?? result.division}` : ""}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">{result.name || "HYROX"}</h1>
      </header>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Total" value={formatDuration(result.total_seconds)} size="lg" />
          <div>
            <p className="label">vs previous PB</p>
            {prevBest ? (
              <>
                <p className="num mt-1 text-2xl font-bold text-muted">{formatDuration(prevBest.total_seconds)}</p>
                <p className={cn("num mt-1 flex items-center gap-1 font-extrabold", isPb ? "text-push" : "text-low")} data-testid="result-diff">
                  {isPb ? <Trophy className="h-4 w-4" /> : null}
                  {formatSignedDuration(diff)} {isPb ? "PB" : ""}
                </p>
              </>
            ) : (
              <p className="mt-1 font-bold text-push">First result</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
          <Stat label="Running" value={formatDuration(result.run_total_seconds)} size="sm" />
          <Stat label="Stations" value={formatDuration(result.station_total_seconds)} size="sm" />
          <Stat label="Roxzone" value={formatDuration(result.roxzone_seconds)} size="sm" />
        </div>
      </Card>

      {result.splits.length ? (
        <>
          <SectionTitle>Splits</SectionTitle>
          <Card>
            <table className="num w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-semibold">Segment</th>
                  <th className="pb-2 text-right font-semibold">Time</th>
                  <th className="pb-2 text-right font-semibold">vs best</th>
                  <th className="pb-2 text-right font-semibold">Rox</th>
                </tr>
              </thead>
              <tbody>
                {result.splits.map((s) => {
                  const seg = HYROX_SEGMENTS[s.segment_index - 1];
                  const best = bestSplit.get(s.segment_index);
                  const d = best != null ? s.duration_seconds - best : null;
                  return (
                    <tr key={s.id} className="border-t border-line">
                      <td className={cn("py-1.5", seg.type === "station" ? "font-semibold" : "text-muted")}>{seg.label}</td>
                      <td className="text-right font-bold">{formatDuration(s.duration_seconds)}</td>
                      <td className={cn("text-right text-xs", d == null ? "text-faint" : d <= 0 ? "text-push" : "text-low")}>{d == null ? "–" : formatSignedDuration(d)}</td>
                      <td className="text-right text-xs text-faint">{s.roxzone_seconds != null ? `${s.roxzone_seconds}s` : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}

      {result.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            <p className="whitespace-pre-line text-sm">{result.notes}</p>
          </Card>
        </>
      ) : null}

      <form action={deleteHyroxResultAction.bind(null, result.id)} className="mt-8">
        <ConfirmButton message="Delete this HYROX result?">Delete result</ConfirmButton>
      </form>
    </Page>
  );
}
