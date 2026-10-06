import { BottomNav } from "@/components/BottomNav";
import { QueueSync } from "@/components/QueueSync";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-dvh pb-28">
      <QueueSync />
      {children}
      <BottomNav />
    </div>
  );
}
