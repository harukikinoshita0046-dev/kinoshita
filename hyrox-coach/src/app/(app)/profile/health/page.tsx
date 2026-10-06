import { ArrowLeft, CircleCheck, CircleDashed, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Card, Page, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { must } from "@/lib/data/util";

export const metadata: Metadata = { title: "Apple Health" };

export default async function HealthPage() {
  const { supabase, userId } = await requireUser();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const sources = must(
    await supabase.from("health_metrics").select("source, date").eq("user_id", userId).order("date", { ascending: false }).limit(30),
    "load sources",
  );
  const latestImport = sources.find((s) => s.source !== "manual");

  return (
    <Page>
      <div className="pt-4">
        <Link href="/profile" className="flex items-center gap-1 text-sm font-semibold text-muted">
          <ArrowLeft className="h-4 w-4" /> Profile
        </Link>
      </div>
      <PageHeader title="APPLE HEALTH" />

      <Card className="space-y-3">
        <div className="flex gap-3">
          <CircleCheck className="h-5 w-5 shrink-0 text-push" />
          <div>
            <p className="font-bold">Phase 1 · Manual &amp; import (available)</p>
            <p className="text-sm text-muted">
              Morning check-in in the app, values told to your AI coach, or an iOS Shortcut that posts Health data to the import API.
            </p>
            <p className="mt-1 text-xs text-faint">Last imported (non-manual) data: {latestImport ? `${latestImport.date} (${latestImport.source})` : "none yet"}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <CircleDashed className="h-5 w-5 shrink-0 text-muted" />
          <div>
            <p className="font-bold">Phase 2 · Native HealthKit sync (not built yet)</p>
            <p className="text-sm text-muted">
              A web app cannot read HealthKit directly — Apple only exposes it to native iOS/watchOS apps. Automatic background sync of sleep, HRV, resting HR, workouts
              and heart rate needs an iOS companion app that writes to this same API.
            </p>
          </div>
        </div>
      </Card>

      <SectionTitle>iOS Shortcut import (optional)</SectionTitle>
      <Card className="text-sm leading-relaxed">
        <div className="mb-2 flex items-center gap-2 font-bold">
          <Smartphone className="h-4 w-4 text-accent" /> Morning automation
        </div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Shortcuts app → Automation → Time of Day (e.g. 07:00) → Run Immediately.</li>
          <li>Add “Find Health Samples” for Heart Rate Variability, Resting Heart Rate, Sleep and Weight (latest / last night).</li>
          <li>Add “Get Contents of URL”: POST to the URL below with JSON body fields date, sleep_minutes, hrv, resting_hr, weight and header Authorization: Bearer &lt;token&gt;.</li>
        </ol>
        <code className="mt-3 block break-all rounded-lg bg-surface-2 p-2 text-xs">POST {base}/api/coach/health</code>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs">{`{
  "date": "2026-10-06",
  "sleep_minutes": 462,
  "hrv": 61,
  "resting_hr": 52,
  "weight": 78.4,
  "source": "apple_health"
}`}</pre>
        <p className="mt-2 text-xs text-faint">
          Not verified on a device from here — build it once on your iPhone and check the values on TODAY. Needs the app deployed on a public HTTPS URL.
        </p>
      </Card>
    </Page>
  );
}
